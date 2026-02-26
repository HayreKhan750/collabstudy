import { Injectable, ForbiddenException, NotFoundException, forwardRef, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateReadReceiptDto } from './dto/update-read-receipt.dto';
import { WorkspaceRole } from '@prisma/client';
import { ChatGateway } from '../chat/chat.gateway';

@Injectable()
export class ChannelsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => ChatGateway))
    private readonly chatGateway: ChatGateway,
  ) {}

  /**
   * Create a channel in a workspace
   * Only OWNER or ADMIN can create channels
   */
  async create(userId: string, workspaceId: string, createChannelDto: CreateChannelDto) {
    // Check if user is a member of the workspace
    const membership = await this.prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId,
          workspaceId,
        },
      },
    });

    if (!membership) {
      throw new ForbiddenException('You are not a member of this workspace');
    }

    // Check if user has OWNER or ADMIN role
    if (membership.role !== WorkspaceRole.OWNER && membership.role !== WorkspaceRole.ADMIN) {
      throw new ForbiddenException('Only workspace owners and admins can create channels');
    }

    // Create the channel
    const channel = await this.prisma.channel.create({
      data: {
        name: createChannelDto.name,
        workspaceId,
      },
      include: {
        workspace: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Broadcast to all workspace members currently connected
    this.chatGateway.emitNewChannel(workspaceId, channel);

    return channel;
  }

  /**
   * Get all channels in a workspace, with per-user unread counts.
   * Only workspace members can access.
   */
  async findAllByWorkspace(userId: string, workspaceId: string) {
    const membership = await this.prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
    });
    if (!membership) {
      throw new ForbiddenException('You are not a member of this workspace');
    }

    const channels = await this.prisma.channel.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'asc' },
    });

    // Fetch all ChannelMember rows for this user in one query
    const memberRows = await this.prisma.channelMember.findMany({
      where: { userId, channelId: { in: channels.map((c) => c.id) } },
    });
    const lastReadMap = new Map(memberRows.map((r) => [r.channelId, r.lastReadAt]));

    // Count unread messages per channel
    const unreadCounts = await Promise.all(
      channels.map(async (channel) => {
        const lastReadAt = lastReadMap.get(channel.id) ?? new Date(0);
        const count = await this.prisma.message.count({
          where: {
            channelId: channel.id,
            createdAt: { gt: lastReadAt },
            userId: { not: userId }, // don't count your own messages
          },
        });
        return { channelId: channel.id, count };
      }),
    );

    const unreadMap = new Map(unreadCounts.map((u) => [u.channelId, u.count]));
    return channels.map((c) => ({ ...c, unreadCount: unreadMap.get(c.id) ?? 0 }));
  }

  /**
   * Mark a channel as read for the current user (upsert ChannelMember.lastReadAt).
   * Emits a WS event so the sidebar badge clears instantly.
   */
  async markChannelRead(userId: string, channelId: string) {
    await this.verifyChannelAccess(userId, channelId);

    await this.prisma.channelMember.upsert({
      where: { userId_channelId: { userId, channelId } },
      update: { lastReadAt: new Date() },
      create: { userId, channelId, lastReadAt: new Date() },
    });

    this.chatGateway.emitChannelReadCleared(userId, channelId);
    return { success: true };
  }

  /**
   * Mark a channel as read up to a given message for the current user.
   * Uses upsert so repeated calls update the existing record rather than
   * creating duplicates — the @@unique([userId, channelId]) constraint
   * ensures at most one read-state row per user per channel.
   */
  async markAsRead(userId: string, channelId: string, dto: UpdateReadReceiptDto) {
    // Verify membership first
    await this.verifyChannelAccess(userId, channelId);

    const receipt = await this.prisma.readReceipt.upsert({
      where: { userId_channelId: { userId, channelId } },
      update: { messageId: dto.messageId, readAt: new Date() },
      create: { userId, channelId, messageId: dto.messageId },
    });

    // Broadcast to channel room so all members can update their UI
    this.chatGateway.emitReadReceiptUpdated(channelId, {
      userId,
      channelId,
      messageId: receipt.messageId,
      readAt: receipt.readAt.toISOString(),
    });

    return receipt;
  }

  /**
   * Fetch all read receipts for a channel (members only).
   * Returns a map-friendly array of { userId, messageId, readAt }.
   */
  async getReadReceipts(userId: string, channelId: string) {
    await this.verifyChannelAccess(userId, channelId);
    return this.prisma.readReceipt.findMany({
      where: { channelId },
      select: { userId: true, messageId: true, readAt: true },
    });
  }

  /**
   * POST /channels/:channelId/leave
   * Remove the calling user from a channel's member tracking (hides it from their sidebar).
   * Any workspace member can leave a channel they don't own.
   */
  async leaveChannel(userId: string, channelId: string) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      include: { workspace: true },
    });
    if (!channel) throw new NotFoundException('Channel not found');

    const membership = await this.prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId: channel.workspaceId } },
    });
    if (!membership) throw new ForbiddenException('You are not a member of this workspace');
    if (membership.role === 'OWNER') {
      throw new ForbiddenException('Workspace owner cannot leave a channel. Delete it instead.');
    }

    // Remove ChannelMember row (tracks last-read). This effectively "hides" the channel.
    // We use deleteMany to avoid errors if the row doesn't exist yet.
    await this.prisma.channelMember.deleteMany({
      where: { userId, channelId },
    });

    return { success: true, channelId };
  }

  /**
   * Rename a channel (OWNER or ADMIN only)
   */
  async renameChannel(userId: string, channelId: string, name: string) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      include: { workspace: true },
    });
    if (!channel) throw new NotFoundException('Channel not found');

    const membership = await this.prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId: channel.workspaceId } },
    });
    if (!membership || (membership.role !== 'OWNER' && membership.role !== 'ADMIN')) {
      throw new ForbiddenException('Only workspace owner or admin can rename channels');
    }

    const updated = await this.prisma.channel.update({
      where: { id: channelId },
      data: { name },
    });
    this.chatGateway.emitChannelUpdated(channel.workspaceId, updated);
    return updated;
  }

  /**
   * Delete a channel (OWNER or ADMIN only)
   */
  async deleteChannel(userId: string, channelId: string) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      include: { workspace: true },
    });
    if (!channel) throw new NotFoundException('Channel not found');

    const membership = await this.prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId: channel.workspaceId } },
    });
    if (!membership || (membership.role !== 'OWNER' && membership.role !== 'ADMIN')) {
      throw new ForbiddenException('Only workspace owner or admin can delete channels');
    }

    await this.prisma.channel.delete({ where: { id: channelId } });
    this.chatGateway.emitChannelDeleted(channel.workspaceId, { channelId, workspaceId: channel.workspaceId });
    return { success: true, channelId };
  }

  /**
   * Verify user has access to a channel (helper method)
   */
  async verifyChannelAccess(userId: string, channelId: string) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      include: {
        workspace: {
          include: {
            members: {
              where: { userId },
            },
          },
        },
      },
    });

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    if (channel.workspace.members.length === 0) {
      throw new ForbiddenException('You do not have access to this channel');
    }

    return channel;
  }
}
