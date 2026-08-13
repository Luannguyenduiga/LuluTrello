import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private brevoApiKey: string | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    // Brevo goes over HTTPS, so it survives hosts that block the SMTP ports -
    // Render blocks 25/465/587 on free web services. SMTP stays as the local
    // development path, where those ports are reachable.
    this.brevoApiKey = this.config.get<string>('BREVO_API_KEY') || null;

    if (this.brevoApiKey) {
      this.logger.log('Brevo HTTP API configured; SMTP will not be used.');
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
        this.logger.log(`Nodemailer SMTP transporter configured (port: ${port}, secure: ${port === 465}).`);
      } catch (error: any) {
        this.logger.error(`Failed to configure SMTP transporter: ${error.message}`);
      }
    } else {
      this.logger.warn('Neither BREVO_API_KEY nor SMTP credentials are set - mail will be logged instead.');
    }
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
   * Sends through whichever channel is configured. Returns false when none is,
   * so callers can log the payload rather than pretending delivery happened.
   */
  private async deliver(
    to: string,
    subject: string,
    text: string,
    html: string,
  ): Promise<boolean> {
    const from = this.config.get<string>('SMTP_FROM') || this.config.get<string>('SMTP_USER') || '';

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

      if (!response.ok) {
        // Brevo explains the actual problem (unverified sender, bad key) in the body
        throw new Error(`Brevo API responded ${response.status}: ${await response.text()}`);
      }
      return true;
    }

    if (this.transporter) {
      await this.transporter.sendMail({ from, to, subject, text, html });
      return true;
    }

    return false;
  }

  async sendVerificationEmail(email: string, code: string): Promise<void> {
    const sent = await this.deliver(
      email,
      'Your Lulu Trello verification code',
      `Your verification code is ${code}. It expires in 10 minutes.`,
      `<p>Your verification code is <strong style="font-size:20px">${code}</strong>.</p><p>It expires in 10 minutes.</p>`,
    );

    // Without a delivery channel the code is printed so local development still works
    if (!sent) {
      this.logger.log(`Verification code for ${email}: ${code}`);
    }
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
      this.logger.log(`Mail not configured - invitation for ${email} to board "${boardName}" would be sent.`);
    }
  }
}
