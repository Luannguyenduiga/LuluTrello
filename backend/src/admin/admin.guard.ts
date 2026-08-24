import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppRequest } from '../common/decorators';

/**
 * Reads the admin allow-list. Emails are compared lower-cased, because the sign
 * in flow stores them lower-cased too.
 */
export const adminEmails = (config: ConfigService): string[] =>
  (config.get<string>('ADMIN_EMAILS') || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

export const isAdminEmail = (config: ConfigService, email?: string): boolean =>
  Boolean(email) && adminEmails(config).includes(email!.toLowerCase());

/**
 * Runs after JwtAuthGuard, so the caller is already identified: this only
 * decides whether that person is on the admin list. With ADMIN_EMAILS empty
 * nobody is an admin - the console stays closed rather than open to everyone.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AppRequest>();

    if (!adminEmails(this.config).length) {
      throw new ForbiddenException('ADMIN_EMAILS is not configured on the server');
    }
    if (!isAdminEmail(this.config, request.user?.email)) {
      throw new ForbiddenException('This account is not an administrator');
    }
    return true;
  }
}
