import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { IsEmail, IsOptional, IsString } from 'class-validator';
import { FirestoreService, DocumentData } from '../common/firestore/firestore.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../common/decorators';

class UpdateUserDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() avatarUrl?: string;
}

const stripSecrets = ({ githubToken, ...safeUser }: DocumentData) => safeUser;

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly firestore: FirestoreService) {}

  @Get()
  async getUsers() {
    const list = await this.firestore.find('users');
    return list.map(stripSecrets);
  }

  @Get(':id')
  async getUserDetails(@Param('id') id: string) {
    const user = await this.firestore.findById('users', id);
    if (!user) throw new NotFoundException('User not found');
    return stripSecrets(user);
  }

  @Put(':id')
  async updateUserProfile(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() currentUser: JwtUser,
  ) {
    // Users can only edit their own profile
    if (currentUser.id !== id) {
      throw new ForbiddenException('Unauthorized to edit this profile');
    }

    const existing = await this.firestore.findById('users', id);
    if (!existing) throw new NotFoundException('User not found');

    const updated = await this.firestore.update('users', id, {
      name: dto.name || existing.name,
      email: dto.email ? dto.email.toLowerCase() : existing.email,
      avatarUrl: dto.avatarUrl || existing.avatarUrl,
    });

    return stripSecrets(updated);
  }
}
