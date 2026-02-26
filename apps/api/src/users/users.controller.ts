import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /** GET /users/me — return current user profile */
  @Get('me')
  async getMe(@Request() req: any) {
    return this.usersService.getMe(req.user.userId);
  }

  /** PATCH /users/me — update fullName, username, avatarUrl */
  @Patch('me')
  async updateProfile(@Request() req: any, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(req.user.userId, dto);
  }

  /** PATCH /users/me/password — change password */
  @Patch('me/password')
  @HttpCode(HttpStatus.OK)
  async changePassword(@Request() req: any, @Body() dto: ChangePasswordDto) {
    return this.usersService.changePassword(req.user.userId, dto);
  }

  /**
   * GET /users/me/digest
   * Returns an AI-generated summary of the current user's unread activity
   * (mentions, channel messages, DMs). Cached in Redis for 5 minutes.
   */
  @Get('me/digest')
  async getDigest(@Request() req: any) {
    return this.usersService.getDigest(req.user.userId);
  }

  /**
   * POST /users/me/digest/invalidate
   * Explicitly clears the cached digest for the current user so the next
   * GET /users/me/digest regenerates fresh from the DB + Gemini.
   */
  @Post('me/digest/invalidate')
  @HttpCode(HttpStatus.OK)
  async invalidateDigest(@Request() req: any) {
    return this.usersService.invalidateDigestCache(req.user.userId);
  }
}
