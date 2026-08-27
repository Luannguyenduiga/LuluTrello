import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';
const BREVO_ACCOUNT_ENDPOINT = 'https://api.brevo.com/v3/account';

export type MailChannel = 'brevo' | 'smtp' | 'none';

export interface MailStatus {
  channel: MailChannel;
  /** The raw SMTP_FROM / SMTP_USER value the sender is derived from */
  from: string;
  senderEmail: string;
  /** False when the sender is missing or is not an address - providers reject those */
  senderUsable: boolean;
  /**
   * Brevo's own view of whether it will actually relay mail. null until the
   * check has run (or when Brevo is not the channel). A false here is the one
   * failure the send path cannot see: /v3/smtp/email answers 2xx either way and
   * only records "Your sending platform is currently disabled" in the event log
   * afterwards - and it records that at most once per 24h, so the log looks
   * empty too.
   */
  brevoRelayEnabled: boolean | null;
  problems: string[];
}

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private brevoApiKey: string | null = null;
  private channel: MailChannel = 'none';
  private problems: string[] = [];
  private brevoRelayEnabled: boolean | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    // Brevo goes over HTTPS, so it survives hosts that block the SMTP ports -
    // Render blocks 25/465/587 on free web services. SMTP stays as the local
    // development path, where those ports are reachable.
    // Trimmed: a value pasted into a host's env UI often carries whitespace,
    // which would otherwise be sent as part of the api-key header.
    this.brevoApiKey = (this.config.get<string>('BREVO_API_KEY') || '').trim() || null;
    this.problems = [];

    const sender = this.parseSender(this.senderRaw());
    if (!sender.email.includes('@')) {
      this.problems.push(
        'SMTP_FROM (or SMTP_USER) is empty or is not an email address - providers reject a send with no sender.',
      );
    }

    if (this.brevoApiKey) {
      this.channel = 'brevo';
      this.logger.log(
        `Brevo HTTP API configured; SMTP will not be used. Sender: ${sender.email || '(none)'}`,
      );
      this.problems.forEach((problem) => this.logger.error(problem));
      // Deliberately not awaited: boot must not hang on Brevo being slow or
      // unreachable. The result lands in brevoRelayEnabled a moment later.
      void this.checkBrevoRelay();
      return;
    }

    const host = this.config.get<string>('SMTP_HOST');
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');

    if (host && user && pass) {
      try {
        const port = parseInt(this.config.get<string>('SMTP_PORT') || '587', 10);
        this.transporter = nodemailer.createTransport({
          host,
          port,
          secure: port === 465,
          auth: { user, pass },
          tls: {
            rejectUnauthorized: false,
          },
        });
        this.channel = 'smtp';
        this.logger.log(
          `Nodemailer SMTP transporter configured (port: ${port}, secure: ${port === 465}).`,
        );
      } catch (error: any) {
        this.channel = 'none';
        this.problems.push(`Failed to configure SMTP transporter: ${error.message}`);
        this.logger.error(`Failed to configure SMTP transporter: ${error.message}`);
      }
    } else {
      this.channel = 'none';
      this.problems.push(
        'Neither BREVO_API_KEY nor the SMTP_HOST/SMTP_USER/SMTP_PASS trio is set - no mail can leave this server.',
      );
      this.logger.warn(
        'Neither BREVO_API_KEY nor SMTP credentials are set - mail will be logged instead.',
      );
    }
  }

  private senderRaw(): string {
    return (
      this.config.get<string>('SMTP_FROM') ||
      this.config.get<string>('SMTP_USER') ||
      ''
    ).trim();
  }

  /** Splits `"Name" <a@b.c>` into Brevo's sender object; a bare address also works. */
  private parseSender(raw: string): { email: string; name?: string } {
    const match = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(raw);
    if (!match) {
      return { email: raw.trim() };
    }
    const name = match[1].trim();
    return name ? { email: match[2].trim(), name } : { email: match[2].trim() };
  }

  /**
   * Asks Brevo whether it will relay at all. This is the only way to see a
   * disabled sending platform from here: every /v3/smtp/email call still
   * answers 2xx while the account is disabled, so the send path reports
   * success and the mail is dropped without a trace the caller can observe.
   */
  async checkBrevoRelay(): Promise<boolean | null> {
    if (!this.brevoApiKey) {
      this.brevoRelayEnabled = null;
      return null;
    }

    try {
      const response = await fetch(BREVO_ACCOUNT_ENDPOINT, {
        headers: { 'api-key': this.brevoApiKey, accept: 'application/json' },
      });

      if (!response.ok) {
        const detail = `Brevo /v3/account responded ${response.status}: ${await response.text()}`;
        this.brevoRelayEnabled = null;
        this.recordProblem(detail);
        this.logger.error(detail);
        return null;
      }

      const account = (await response.json()) as { relay?: { enabled?: boolean } };
      this.brevoRelayEnabled = account.relay?.enabled === true;

      if (this.brevoRelayEnabled) {
        this.logger.log('Brevo relay is enabled - transactional mail will be delivered.');
      } else {
        const detail =
          "Brevo's sending platform is DISABLED for this account. Sends will be accepted " +
          'with a 2xx and then silently dropped. Check the Brevo dashboard for the reason ' +
          '(a new account held for review, or a sender on a free webmail domain such as ' +
          'gmail.com, which Brevo refuses under the Google/Yahoo DMARC rules).';
        this.recordProblem(detail);
        this.logger.error(detail);
      }
      return this.brevoRelayEnabled;
    } catch (error: any) {
      // A network failure here says nothing about the account, so the flag
      // stays null rather than being reported as a healthy or broken relay.
      this.brevoRelayEnabled = null;
      this.logger.warn(`Could not reach Brevo to check the relay: ${error.message}`);
      return null;
    }
  }

  /** Keeps `problems` free of duplicates across repeated checks. */
  private recordProblem(problem: string): void {
    if (!this.problems.includes(problem)) this.problems.push(problem);
  }

  /** What is actually configured, for the admin console and for startup checks. */
  getStatus(): MailStatus {
    const raw = this.senderRaw();
    const sender = this.parseSender(raw);
    return {
      channel: this.channel,
      from: raw,
      senderEmail: sender.email,
      senderUsable: sender.email.includes('@'),
      brevoRelayEnabled: this.brevoRelayEnabled,
      problems: [...this.problems],
    };
  }

  /**
   * Sends through whichever channel is configured. Returns false when none is,
   * so callers can log the payload rather than pretending delivery happened.
   */
  private async deliver(to: string, subject: string, text: string, html: string): Promise<boolean> {
    const from = this.senderRaw();

    if (this.brevoApiKey) {
      const response = await fetch(BREVO_ENDPOINT, {
        method: 'POST',
        headers: {
          'api-key': this.brevoApiKey,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          sender: this.parseSender(from),
          to: [{ email: to }],
          subject,
          textContent: text,
          htmlContent: html,
        }),
      });

      const body = await response.text();
      if (!response.ok) {
        // Brevo explains the actual problem (unverified sender, bad key,
        // unactivated account) in the body, so it is carried into the error.
        this.logger.error(`Brevo rejected mail to ${to}: ${response.status} ${body}`);
        throw new Error(`Brevo API responded ${response.status}: ${body}`);
      }
      // The messageId is what to search for in Brevo's transactional log when
      // the API accepted the mail but the inbox still shows nothing.
      this.logger.log(`Brevo accepted mail to ${to} (${response.status}): ${body}`);
      return true;
    }

    if (this.transporter) {
      const info = await this.transporter.sendMail({ from, to, subject, text, html });
      this.logger.log(
        `SMTP accepted mail to ${to} (id: ${info.messageId}, accepted: ${JSON.stringify(
          info.accepted,
        )}, rejected: ${JSON.stringify(info.rejected)})`,
      );
      // An address the server took the message for but then refused never arrives
      const rejected = (Array.isArray(info.rejected) ? (info.rejected as unknown[]) : []).map(
        (entry) => String(entry),
      );
      if (rejected.length) {
        throw new Error(`SMTP server rejected recipient(s): ${rejected.join(', ')}`);
      }
      return true;
    }

    return false;
  }

  /**
   * Returns whether the mail actually left the server. Callers must not report
   * success on a false - that is how a misconfigured deployment ends up telling
   * people to check an inbox that will never receive anything.
   */
  async sendVerificationEmail(email: string, code: string): Promise<boolean> {
    const sent = await this.deliver(
      email,
      'Your Lulu Trello verification code',
      `Your verification code is ${code}. It expires in 10 minutes.`,
      `<p>Your verification code is <strong style="font-size:20px">${code}</strong>.</p><p>It expires in 10 minutes.</p>`,
    );

    // Without a delivery channel the code is printed so local development still works
    if (!sent) {
      this.logger.warn(
        `No mail channel configured - verification code for ${email} is ${code} (not emailed)`,
      );
    }
    return sent;
  }

  /** Lets the admin console prove end-to-end delivery without signing out. */
  async sendTestEmail(email: string): Promise<boolean> {
    return this.deliver(
      email,
      'Lulu Trello mail test',
      'This is a test message from Lulu Trello. If you can read it, mail delivery works.',
      '<p>This is a test message from <strong>Lulu Trello</strong>. If you can read it, mail delivery works.</p>',
    );
  }

  async sendBoardInvitationEmail(
    email: string,
    boardName: string,
    invitedBy: string,
    role: string,
  ): Promise<void> {
    const sent = await this.deliver(
      email,
      `Invitation to join Trello board: ${boardName}`,
      `Hello, you have been invited to join the board "${boardName}" as a ${role} by ${invitedBy}. Please log in to accept the invitation.`,
      `<p>Hello,</p>
             <p>You have been invited to join the Trello board <strong>${boardName}</strong> as a <strong>${role}</strong> by <strong>${invitedBy}</strong>.</p>
             <p>Please log in to <a href="${this.config.get<string>('BASE_URL')}">Trello</a> to accept the invitation.</p>`,
    );

    if (!sent) {
      this.logger.warn(
        `Mail not configured - invitation for ${email} to board "${boardName}" was NOT sent.`,
      );
    }
  }
}
