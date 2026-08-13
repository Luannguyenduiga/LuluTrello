import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Redirect,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { GithubCallbackDto, SendCodeDto, VerifyCodeDto } from './dto/auth.dto';
import { GithubAuthGuard } from './guards/guardGit';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../common/decorators';
import { DocumentData } from '../common/firestore/firestore.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('send-code')
  @HttpCode(HttpStatus.OK)
  sendCode(@Body() dto: SendCodeDto) {
    return this.authService.sendCode(dto.email);
  }

  @Post('signup')
  signup(@Body() dto: VerifyCodeDto) {
    return this.authService.signup(dto.email, dto.verificationCode);
  }

  @Post('signin')
  @HttpCode(HttpStatus.OK)
  signin(@Body() dto: VerifyCodeDto) {
    return this.authService.signin(dto.email, dto.verificationCode);
  }

  /** Lets the client rehydrate its session from a stored token */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: JwtUser) {
    return this.authService.getMe(user.id);
  }

  /**
   * Step 1 of the OAuth handshake. The guard performs the redirect to GitHub,
   * so this handler body is never reached.
   */
  @Get('github')
  @UseGuards(GithubAuthGuard)
  initiateGithubAuth(): void {
    // intentionally empty - GithubAuthGuard redirects to github.com
  }

  /**
   * Step 2. GitHub redirects here (GITHUB_CALLBACK_URL). The guard runs the
   * strategy, which exchanges the code and resolves the account into req.user;
   * we then hand a signed JWT back to the SPA.
   */
  @Get('callback')
  @UseGuards(GithubAuthGuard)
  @Redirect()
  handleGithubRedirectCallback(@CurrentUser() user: DocumentData) {
    return { url: this.authService.buildOauthRedirectUrl(user) };
  }

  /** Developer-only shortcut used by the "Mock GitHub" button */
  @Post('github/callback')
  @HttpCode(HttpStatus.OK)
  githubCallback(@Body() dto: GithubCallbackDto) {
    return this.authService.githubCallback(dto.isMock);
  }
}
