import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { timingSafeEqual } from 'crypto';
import { AppRequest, JwtUser } from '../common/decorators';
import { isAdminEmail } from '../admin/admin.guard';

/**
 * The Zalo routes are operator tools: they expose bot state and can post to the
 * group, so they are not open to ordinary users. Two ways in, because they serve
 * two different callers:
 *
 *  - `x-zalo-secret`, for machines - an external scheduler calling
 *    /zalo/report/run has no user session.
 *  - an admin's own JWT, for the admin console - so the browser never has to
 *    hold the shared secret.
 *
 * With neither ADMIN_EMAILS nor ZALO_ADMIN_SECRET configured, the routes stay
 * closed instead of open.
 */
@Injectable()
export class ZaloAdminGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AppRequest>();

    if (await this.isAdminSession(request)) return true;
    if (this.hasValidSecret(request)) return true;

    throw new UnauthorizedException(
      'Sign in as an administrator, or send the ZALO_ADMIN_SECRET in the x-zalo-secret header',
    );
  }

  /** An admin's session token, which is how the console calls these routes. */
  private async isAdminSession(request: AppRequest): Promise<boolean> {
    const header = request.headers['authorization'];
    const token = typeof header === 'string' ? header.split(' ')[1] : undefined;
    if (!token) return false;

    try {
      const user = await this.jwt.verifyAsync<JwtUser>(token);
      if (!isAdminEmail(this.config, user.email)) return false;
      request.user = user;
      return true;
    } catch {
      // An expired or forged token is simply not an admin session; the shared
      // secret is still allowed to answer for this request.
      return false;
    }
  }

  private hasValidSecret(request: AppRequest): boolean {
    const expected = (this.config.get<string>('ZALO_ADMIN_SECRET') || '').trim();
    if (!expected) return false;

    const header = request.headers['x-zalo-secret'];
    const provided = Array.isArray(header) ? header[0] : header || '';

    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
