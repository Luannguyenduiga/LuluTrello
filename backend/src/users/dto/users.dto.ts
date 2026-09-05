import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString } from 'class-validator';

/** Every field is optional; the ones left out keep their stored value. */
export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'Lan Nguyen' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ format: 'email', example: 'lan@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: 'https://avatars.githubusercontent.com/u/1?v=4' })
  @IsOptional()
  @IsString()
  avatarUrl?: string;
}
