import { AuthGuard } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';

// This guard uses the 'github' strategy registered by GithubStrategy.
// AuthGuard('github') only looks the strategy up by name, so GithubStrategy
// must stay in AuthModule's providers for that name to resolve.
@Injectable()
export class GithubAuthGuard extends AuthGuard('github') {}
