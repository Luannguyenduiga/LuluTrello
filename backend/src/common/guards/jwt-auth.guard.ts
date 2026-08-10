import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AppRequest, JwtUser } from '../decorators';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AppRequest>();
    const authHeader = request.headers['authorization'];
    const token = typeof authHeader === 'string' ? authHeader.split(' ')[1] : undefined;

    if (!token) {
      throw new UnauthorizedException('Access token required');
    }

    try {
      request.user = await this.jwt.verifyAsync<JwtUser>(token);
    } catch {
      // 401 rather than 403: the client should treat this as "session over"
      throw new UnauthorizedException('Invalid or expired access token');
    }
    return true;
  }
}
