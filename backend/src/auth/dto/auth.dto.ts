import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SendCodeDto {
  @IsEmail({}, { message: 'A valid email is required' })
  email!: string;
}

export class VerifyCodeDto {
  @IsEmail({}, { message: 'A valid email is required' })
  email!: string;

  @IsString()
  @IsNotEmpty({ message: 'Verification code is required' })
  verificationCode!: string;
}

export class GithubCallbackDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  isMock?: boolean;
}
