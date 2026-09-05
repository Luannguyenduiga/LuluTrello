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
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiExcludeEndpoint,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { GithubCallbackDto, SendCodeDto, VerifyCodeDto } from './dto/auth.dto';
import { GithubAuthGuard } from './guards/guardGit';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../common/decorators';
import { DocumentData } from '../common/firestore/firestore.service';
import {
  AuthSessionResponse,
  SendCodeResponse,
  SignupResponse,
  UserProfileResponse,
} from './dto/auth-response.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** Mails a six-digit verification code to the address, valid for a few minutes. */
  @Post('send-code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send a verification code by email' })
  @ApiOkResponse({ type: SendCodeResponse })
  @ApiBadRequestResponse({ description: 'The email is missing or malformed' })
  sendCode(@Body() dto: SendCodeDto) {
    return this.authService.sendCode(dto.email);
  }

  /** Creates the account the code was sent for and returns a session. */
  @Post('signup')
  @ApiOperation({ summary: 'Create an account with an emailed code' })
  @ApiCreatedResponse({ type: SignupResponse })
  @ApiBadRequestResponse({ description: 'The code is wrong, expired, or the account exists' })
  signup(@Body() dto: VerifyCodeDto) {
    return this.authService.signup(dto.email, dto.verificationCode);
  }

  /** Exchanges an emailed code for a JWT. */
  @Post('signin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in with an emailed code' })
  @ApiOkResponse({ type: AuthSessionResponse })
  @ApiUnauthorizedResponse({ description: 'The code is wrong or expired' })
  signin(@Body() dto: VerifyCodeDto) {
    return this.authService.signin(dto.email, dto.verificationCode);
  }

  /** Lets the client rehydrate its session from a stored token */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'The signed-in user behind the token' })
  @ApiOkResponse({ type: UserProfileResponse })
  @ApiUnauthorizedResponse({ description: 'Missing, malformed or expired token' })
  me(@CurrentUser() user: JwtUser) {
    return this.authService.getMe(user.id);
  }

  /**
   * Step 1 of the OAuth handshake. The guard performs the redirect to GitHub,
   * so this handler body is never reached.
   */
  @Get('github')
  @UseGuards(GithubAuthGuard)
  @ApiOperation({
    summary: 'Start the GitHub OAuth handshake',
    description: 'Redirects the browser to github.com. Open it in a browser, not from here.',
  })
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
  // GitHub calls this one, never a human - it only ever answers with a 302.
  @ApiExcludeEndpoint()
  handleGithubRedirectCallback(@CurrentUser() user: DocumentData) {
    return { url: this.authService.buildOauthRedirectUrl(user) };
  }

  /** Developer-only shortcut used by the "Mock GitHub" button */
  @Post('github/callback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mock GitHub sign-in (development)',
    description: 'Issues a session for the mock account without contacting GitHub.',
  })
  @ApiOkResponse({ type: AuthSessionResponse })
  githubCallback(@Body() dto: GithubCallbackDto) {
    return this.authService.githubCallback(dto.isMock);
  }
}
