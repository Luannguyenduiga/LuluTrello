import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const host = this.config.get<string>('SMTP_HOST');
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');

    if (host && user && pass) {
      try {
        this.transporter = nodemailer.createTransport({
          host,
          port: parseInt(this.config.get<string>('SMTP_PORT') || '587', 10),
          secure: false,
          auth: { user, pass },
        });
        this.logger.log('Nodemailer SMTP transporter configured.');
      } catch (error: any) {
        this.logger.error(`Failed to configure SMTP transporter: ${error.message}`);
      }
    } else {
      this.logger.warn('SMTP is not configured - verification codes will be logged instead.');
    }
  }

  async sendVerificationEmail(email: string, code: string): Promise<void> {
    // Without SMTP credentials the code is printed so local development still works
    if (!this.transporter) {
      this.logger.log(`Verification code for ${email}: ${code}`);
      return;
    }

    await this.transporter.sendMail({
      from: this.config.get<string>('SMTP_FROM') || this.config.get<string>('SMTP_USER'),
      to: email,
      subject: 'Your Lulu Trello verification code',
      text: `Your verification code is ${code}. It expires in 10 minutes.`,
      html: `<p>Your verification code is <strong style="font-size:20px">${code}</strong>.</p><p>It expires in 10 minutes.</p>`,
    });
  }

  async sendBoardInvitationEmail(
    email: string,
    boardName: string,
    invitedBy: string,
    role: string,
  ): Promise<void> {
    if (!this.transporter) {
      this.logger.log(`SMTP not configured - Invitation email for ${email} to board "${boardName}" would be sent.`);
      return;
    }

    await this.transporter.sendMail({
      from: this.config.get<string>('SMTP_FROM') || this.config.get<string>('SMTP_USER'),
      to: email,
      subject: `Invitation to join Trello board: ${boardName}`,
      text: `Hello, you have been invited to join the board "${boardName}" as a ${role} by ${invitedBy}. Please log in to accept the invitation.`,
      html: `<p>Hello,</p>
             <p>You have been invited to join the Trello board <strong>${boardName}</strong> as a <strong>${role}</strong> by <strong>${invitedBy}</strong>.</p>
             <p>Please log in to <a href="${this.config.get<string>('BASE_URL')}">Trello</a> to accept the invitation.</p>`,
    });
  }
}
