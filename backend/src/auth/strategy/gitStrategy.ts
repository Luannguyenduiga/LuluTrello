import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile as Pro } from 'passport-github2';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';

@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, 'github') {
  constructor(
    private authService: AuthService,
    config: ConfigService,
  ) {
    super({
      // getOrThrow so a missing variable fails loudly at boot rather than
      // surfacing as an opaque passport error on the first login attempt
      clientID: config.getOrThrow<string>('GITHUB_CLIENT_ID'),
      clientSecret: config.getOrThrow<string>('GITHUB_CLIENT_SECRET'),
      callbackURL: config.getOrThrow<string>('GITHUB_CALLBACK_URL'),
      // 'repo' is required by the GitHub integration, which reads branches,
      // pull requests and issues using the token stored on the user
      scope: ['user:email', 'repo'],
    });
  }

  async validate(accessToken: string, _refreshToken: string, profile: Pro) {
    // Whatever this returns becomes req.user on the callback route
    return this.authService.validateGithubProfile(profile, accessToken);
  }
}
