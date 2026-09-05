import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** The caller as the rest of the API exposes them - never the GitHub token. */
export class UserProfileResponse {
  @ApiProperty({ example: 'u_7Fq2K1xZ' })
  id!: string;

  @ApiProperty({ format: 'email', example: 'lan@example.com' })
  email!: string;

  @ApiProperty({ example: 'lan' })
  name!: string;

  @ApiPropertyOptional({
    description: 'Generated from the email on sign-up, or taken from GitHub.',
    example: 'https://api.dicebear.com/7.x/bottts/svg?seed=lan%40example.com',
  })
  avatarUrl?: string;
}

export class SendCodeResponse {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ example: 'Verification code sent' })
  message!: string;
}

export class AuthSessionResponse {
  @ApiProperty({
    description: 'Send it back as `Authorization: Bearer <token>`.',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  accessToken!: string;

  @ApiProperty({ type: UserProfileResponse })
  user!: UserProfileResponse;
}

/** Sign-up creates the account only; the client then calls /auth/signin. */
export class SignupResponse {
  @ApiProperty({ example: 'u_7Fq2K1xZ' })
  id!: string;

  @ApiProperty({ format: 'email', example: 'lan@example.com' })
  email!: string;
}
