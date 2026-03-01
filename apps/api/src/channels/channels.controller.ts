import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Request, HttpCode, HttpStatus } from '@nestjs/common';
import { WorkspaceRole } from '@prisma/client';
import { ChannelsService } from './channels.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { RenameChannelDto } from './dto/rename-channel.dto';
import { UpdateReadReceiptDto } from './dto/update-read-receipt.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('workspaces/:workspaceId/channels')
@UseGuards(JwtAuthGuard)
export class ChannelsController {
  constructor(private readonly channelsService: ChannelsService) {}

  /**
   * POST /workspaces/:workspaceId/channels
   * Create a new channel (OWNER/ADMIN only)
   */
  @Post()
  @UseGuards(RolesGuard)
  @Roles(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
  create(
    @Request() req: any,
    @Param('workspaceId') workspaceId: string,
    @Body() createChannelDto: CreateChannelDto,
  ) {
    return this.channelsService.create(req.user.userId, workspaceId, createChannelDto);
  }

  /**
   * GET /workspaces/:workspaceId/channels
   * Get all channels in a workspace (members only)
   */
  @Get()
  findAll(@Request() req: any, @Param('workspaceId') workspaceId: string) {
    return this.channelsService.findAllByWorkspace(req.user.userId, workspaceId);
  }
}

// ─── Read Receipts Controller ─────────────────────────────────────────────────
// Mounted under /channels/:channelId/read — separate from workspace-scoped routes

@Controller('channels/:channelId')
@UseGuards(JwtAuthGuard)
export class ReadReceiptController {
  constructor(private readonly channelsService: ChannelsService) {}

  /**
   * GET /channels/:channelId/read
   * Fetch all read receipts for the channel (members only).
   */
  @Get('read')
  getReadReceipts(
    @Request() req: any,
    @Param('channelId') channelId: string,
  ) {
    return this.channelsService.getReadReceipts(req.user.userId, channelId);
  }

  /**
   * POST /channels/:channelId/read
   * Mark the channel as read up to the given messageId (upserted per user).
   */
  @Post('read')
  @HttpCode(HttpStatus.OK)
  markAsRead(
    @Request() req: any,
    @Param('channelId') channelId: string,
    @Body() dto: UpdateReadReceiptDto,
  ) {
    return this.channelsService.markAsRead(req.user.userId, channelId, dto);
  }

  /**
   * POST /channels/:channelId/mark-read
   * Mark the channel as read for the current user (clears unread badge).
   */
  @Post('mark-read')
  @HttpCode(HttpStatus.OK)
  markChannelRead(
    @Request() req: any,
    @Param('channelId') channelId: string,
  ) {
    return this.channelsService.markChannelRead(req.user.userId, channelId);
  }
}

// ─── Channel Management Controller ────────────────────────────────────────────
// Mounted under /channels/:channelId — flat routes for rename/delete

@Controller('channels')
@UseGuards(JwtAuthGuard)
export class ChannelManagementController {
  constructor(private readonly channelsService: ChannelsService) {}

  /**
   * PATCH /channels/:channelId
   * Rename a channel (OWNER/ADMIN only)
   */
  @Patch(':channelId')
  renameChannel(
    @Request() req: any,
    @Param('channelId') channelId: string,
    @Body() dto: { name: string },
  ) {
    return this.channelsService.renameChannel(req.user.userId, channelId, dto.name);
  }

  /**
   * DELETE /channels/:channelId
   * Delete a channel (OWNER/ADMIN only)
   */
  @Delete(':channelId')
  @HttpCode(HttpStatus.OK)
  deleteChannel(
    @Request() req: any,
    @Param('channelId') channelId: string,
  ) {
    return this.channelsService.deleteChannel(req.user.userId, channelId);
  }

  /**
   * POST /channels/:channelId/leave
   * Leave a channel (any non-OWNER member)
   */
  @Post(':channelId/leave')
  @HttpCode(HttpStatus.OK)
  leaveChannel(
    @Request() req: any,
    @Param('channelId') channelId: string,
  ) {
    return this.channelsService.leaveChannel(req.user.userId, channelId);
  }
}
