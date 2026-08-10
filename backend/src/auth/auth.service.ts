import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import axios from 'axios';
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

    try {
      await this.mail.sendVerificationEmail(normalizedEmail, code);
    } catch (error: any) {
      this.logger.error(`Failed to send verification code: ${error.message}`);
      throw new InternalServerErrorException('Failed to send verification code');
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

  getGithubAuthorizeUrl(redirectUri?: string): string {
    const clientId = this.config.get<string>('GITHUB_CLIENT_ID');
    if (!clientId) {
      // Without OAuth credentials, bounce back to the client in mock mode
      return `${redirectUri || 'http://localhost:5173/auth'}?mock_github=true`;
    }
    return `https://github.com/login/oauth/authorize?client_id=${clientId}&scope=user,repo`;
  }

  async githubCallback(code?: string, isMock?: boolean) {
    const clientId = this.config.get<string>('GITHUB_CLIENT_ID');
    const clientSecret = this.config.get<string>('GITHUB_CLIENT_SECRET');

    if (isMock || !clientId || !clientSecret) {
      return this.mockGithubLogin();
    }

    try {
      const tokenResponse = await axios.post(
        'https://github.com/login/oauth/access_token',
        { client_id: clientId, client_secret: clientSecret, code },
        { headers: { Accept: 'application/json' } },
      );

      const accessToken = tokenResponse.data?.access_token;
      if (!accessToken) {
        throw new BadRequestException('Failed to retrieve GitHub access token');
      }

      const userResponse = await axios.get('https://api.github.com/user', {
        headers: { Authorization: `token ${accessToken}` },
      });

      const githubUser = userResponse.data;
      const email = (githubUser.email || `${githubUser.login}@github.local`).toLowerCase();

      let user = await this.firestore.findOne('users', (u) => u.email === email);
      if (!user) {
        user = await this.firestore.insert('users', {
          email,
          name: githubUser.name || githubUser.login,
          avatarUrl: githubUser.avatar_url,
          githubToken: accessToken,
          createdAt: new Date().toISOString(),
        });
      } else {
        user = await this.firestore.update('users', user.id, {
          githubToken: accessToken,
          avatarUrl: githubUser.avatar_url || user.avatarUrl,
        });
      }

      return { accessToken: this.signToken(user), user: this.publicUser(user) };
    } catch (error: any) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(`GitHub authentication error: ${error.message}`);
      throw new InternalServerErrorException('GitHub Authentication failed');
    }
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
