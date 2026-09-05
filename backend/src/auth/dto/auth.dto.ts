import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SendCodeDto {
  @ApiProperty({ format: 'email', example: 'lan@example.com' })
  @IsEmail({}, { message: 'A valid email is required' })
  email!: string;
}

export class VerifyCodeDto {
  @ApiProperty({ format: 'email', example: 'lan@example.com' })
  @IsEmail({}, { message: 'A valid email is required' })
  email!: string;

  /** The six-digit code from the email. It expires, and burns after a few wrong tries. */
  @ApiProperty({ example: '482913' })
  @IsString()
  @IsNotEmpty({ message: 'Verification code is required' })
  verificationCode!: string;
}

export class GithubCallbackDto {
  /** The OAuth code from GitHub. Unused by the mock path. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  code?: string;

  /** Set true to sign in the fixed development account without calling GitHub. */
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  isMock?: boolean;
}
