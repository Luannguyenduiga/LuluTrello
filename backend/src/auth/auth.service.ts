import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Profile as GithubProfile } from 'passport-github2';
import { FirestoreService, DocumentData } from '../common/firestore/firestore.service';
import { MailService } from '../mail/mail.service';

interface StoredCode {
  code: string;
  expiresAt: number;
  attempts: number;
}

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  /** email -> pending verification code. Cleared on success, expiry, or lockout. */
  private readonly codeStore = new Map<string, StoredCode>();

  constructor(
    private readonly firestore: FirestoreService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {}

  private generateCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /** Drops entries that are past their TTL so the map cannot grow without bound */
  private pruneExpiredCodes(): void {
    const now = Date.now();
    for (const [email, entry] of this.codeStore) {
      if (now > entry.expiresAt) this.codeStore.delete(email);
    }
  }

  async sendCode(email: string): Promise<{ success: boolean; message: string }> {
    this.pruneExpiredCodes();

    const normalizedEmail = email.toLowerCase();
    const code = this.generateCode();
    this.codeStore.set(normalizedEmail, {
      code,
      expiresAt: Date.now() + CODE_TTL_MS,
      attempts: 0,
    });

    let delivered: boolean;
    try {
      delivered = await this.mail.sendVerificationEmail(normalizedEmail, code);
    } catch (error: any) {
      this.logger.error(`Failed to send verification code: ${error.message}`);
      throw new InternalServerErrorException('Failed to send verification code');
    }

    if (!delivered) {
      // No transport is configured. In production that must surface as a
      // failure: answering 200 here is what makes a broken deployment look
      // healthy while the code only ever reaches the server log. Locally the
      // logged code is the intended development path, so the call still
      // succeeds - but it says so rather than claiming an email was sent.
      if (this.config.get<string>('NODE_ENV') === 'production') {
        throw new ServiceUnavailableException(
          'Email delivery is not configured on the server, so no code could be sent',
        );
      }
      return {
        success: true,
        message: 'Mail is not configured - the verification code was written to the server log',
      };
    }

    return { success: true, message: 'Verification code sent' };
  }

  /**
   * Consumes a verification code. Counts failed attempts and burns the code
   * after MAX_ATTEMPTS so a 6-digit code cannot simply be brute-forced.
   */
  private consumeCode(email: string, verificationCode: string): boolean {
    const normalizedEmail = email.toLowerCase();
    const stored = this.codeStore.get(normalizedEmail);

    if (!stored || Date.now() > stored.expiresAt) {
      this.codeStore.delete(normalizedEmail);
      return false;
    }

    if (stored.code !== verificationCode) {
      stored.attempts += 1;
      if (stored.attempts >= MAX_ATTEMPTS) {
        this.codeStore.delete(normalizedEmail);
        this.logger.warn(`Verification code for ${normalizedEmail} burned after too many attempts`);
      }
      return false;
    }

    this.codeStore.delete(normalizedEmail);
    return true;
  }

  private signToken(user: DocumentData): string {
    return this.jwt.sign({ id: user.id, email: user.email });
  }

  private publicUser(user: DocumentData) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
    };
  }

  async signup(email: string, verificationCode: string) {
    const normalizedEmail = email.toLowerCase();

    if (!this.consumeCode(normalizedEmail, verificationCode)) {
      throw new BadRequestException('Invalid or expired verification code');
    }

    const existingUser = await this.firestore.findOne('users', (u) => u.email === normalizedEmail);
    if (existingUser) {
      throw new BadRequestException('User already exists');
    }

    const created = await this.firestore.insert('users', {
      email: normalizedEmail,
      name: normalizedEmail.split('@')[0],
      avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(normalizedEmail)}`,
      createdAt: new Date().toISOString(),
      role: 'user',
    });

    return { id: created.id, email: created.email };
  }

  async signin(email: string, verificationCode: string) {
    const normalizedEmail = email.toLowerCase();

    if (!this.consumeCode(normalizedEmail, verificationCode)) {
      throw new UnauthorizedException('Invalid email or verification code');
    }

    const user = await this.firestore.findOne('users', (u) => u.email === normalizedEmail);
    if (!user) {
      throw new NotFoundException('Account not found. Please sign up first.');
    }

    return { accessToken: this.signToken(user), user: this.publicUser(user) };
  }

  /**
   * The real OAuth handshake is owned by GithubStrategy (passport-github2).
   * This endpoint only remains for the "Mock GitHub" developer button, which
   * signs in a fixed local account without contacting GitHub at all.
   */
  githubCallback(isMock?: boolean) {
    const clientId = this.config.get<string>('GITHUB_CLIENT_ID');
    const clientSecret = this.config.get<string>('GITHUB_CLIENT_SECRET');

    if (isMock || !clientId || !clientSecret) {
      return this.mockGithubLogin();
    }

    throw new BadRequestException(
      'Real GitHub sign-in goes through the redirect flow at GET /auth/github, not this endpoint.',
    );
  }

  /**
   * Called by GithubStrategy.validate() once GitHub has authenticated the user.
   * Finds the matching account or creates one, and refreshes the stored token
   * that the GitHub integration later uses to read repositories.
   */
  async validateGithubProfile(profile: GithubProfile, accessToken: string): Promise<DocumentData> {
    // profile.username can be absent, so fall back to the numeric id rather
    // than producing an "undefined@github.local" account.
    const handle = profile.username || profile.id;
    const email = (profile.emails?.[0]?.value || `${handle}@github.local`).toLowerCase();
    const avatarUrl = profile.photos?.[0]?.value;

    const existing = await this.firestore.findOne('users', (u) => u.email === email);

    if (!existing) {
      return this.firestore.insert('users', {
        email,
        name: profile.displayName || handle,
        avatarUrl: avatarUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${handle}`,
        githubToken: accessToken,
        createdAt: new Date().toISOString(),
        role: 'user',
      });
    }

    return this.firestore.update('users', existing.id, {
      githubToken: accessToken,
      avatarUrl: avatarUrl || existing.avatarUrl,
    });
  }

  /** Builds the URL the OAuth callback redirects the browser back to */
  buildOauthRedirectUrl(user: DocumentData): string {
    const clientUrl = (this.config.get<string>('CLIENT_URL') || 'http://localhost:5173').replace(
      /\/+$/,
      '',
    );
    return `${clientUrl}/auth?token=${encodeURIComponent(this.signToken(user))}`;
  }

  /** Resolves the account behind a JWT, for the client to rehydrate its session */
  async getMe(userId: string) {
    const user = await this.firestore.findById('users', userId);
    if (!user) {
      throw new NotFoundException('Account not found');
    }
    return this.publicUser(user);
  }

  private async mockGithubLogin() {
    const mockEmail = 'github-mock-user@example.com';
    let user = await this.firestore.findOne('users', (u) => u.email === mockEmail);

    if (!user) {
      user = await this.firestore.insert('users', {
        email: mockEmail,
        name: 'GitHub Mock Developer',
        avatarUrl: 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png',
        githubToken: 'mock_github_access_token_12345',
        createdAt: new Date().toISOString(),
      });
    }

    return { accessToken: this.signToken(user), user: this.publicUser(user) };
  }
}
