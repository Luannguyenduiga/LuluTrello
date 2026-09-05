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
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { FirestoreService, DocumentData } from '../common/firestore/firestore.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../common/decorators';
import { UpdateUserDto } from './dto/users.dto';
import { UserProfileResponse } from '../auth/dto/auth-response.dto';

const stripSecrets = ({ githubToken, ...safeUser }: DocumentData) => safeUser;

@ApiTags('Users')
@ApiBearerAuth('jwt')
@ApiUnauthorizedResponse({ description: 'Missing, malformed or expired token' })
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly firestore: FirestoreService) {}

  /** The directory the invite picker reads. The GitHub token is never included. */
  @Get()
  @ApiOperation({ summary: 'List every account' })
  @ApiOkResponse({ type: [UserProfileResponse] })
  async getUsers() {
    const list = await this.firestore.find('users');
    return list.map(stripSecrets);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One account' })
  @ApiParam({ name: 'id', description: 'Account id' })
  @ApiOkResponse({ type: UserProfileResponse })
  @ApiNotFoundResponse({ description: 'No such account' })
  async getUserDetails(@Param('id') id: string) {
    const user = await this.firestore.findById('users', id);
    if (!user) throw new NotFoundException('User not found');
    return stripSecrets(user);
  }

  /** Callers may only edit their own profile, whoever they are. */
  @Put(':id')
  @ApiOperation({ summary: 'Update a profile' })
  @ApiParam({ name: 'id', description: 'Account id - must be the caller' })
  @ApiOkResponse({ type: UserProfileResponse })
  @ApiForbiddenResponse({ description: 'Editing somebody else' })
  @ApiNotFoundResponse({ description: 'No such account' })
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
