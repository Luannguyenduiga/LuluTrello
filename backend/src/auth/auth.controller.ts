import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Redirect,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { GithubCallbackDto, SendCodeDto, VerifyCodeDto } from './dto/auth.dto';
import { GithubAuthGuard } from './guards/guardGit';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

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

  @Get('github')
  @UseGuards(GithubAuthGuard)
  @Redirect()
  initiateGithubAuth(@Query('redirect_uri') redirectUri?: string) {
    return { url: this.authService.getGithubAuthorizeUrl(redirectUri) };
  }

  @Post('github/callback')
  @HttpCode(HttpStatus.OK)
  githubCallback(@Body() dto: GithubCallbackDto) {
    return this.authService.githubCallback(dto.code, dto.isMock);
  }

  // GitHub can be configured to redirect straight back to the API; bounce the
  // authorization code on to the SPA, which then POSTs it to /auth/github/callback
  @Get('callback')
  @Redirect()
  handleRedirectCallback(@Query('code') code?: string) {
    return { url: `${this.clientUrl()}/auth?code=${code ?? ''}` };
  }

  @Get('github/callback')
  @Redirect()
  handleGithubRedirectCallback(@Query('code') code?: string) {
    return { url: `${this.clientUrl()}/auth?code=${code ?? ''}` };
  }

  private clientUrl(): string {
    return this.config.get<string>('CLIENT_URL') || 'http://localhost:5173';
  }
}
