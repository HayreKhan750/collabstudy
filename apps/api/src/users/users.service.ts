import {
  Injectable,
  NotFoundException,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

/** How long (seconds) the digest is cached per user in Redis. */
const DIGEST_CACHE_TTL_S = 300; // 5 minutes

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  private readonly redis: Redis;

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
  ) {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || 'collabstudy123',
      lazyConnect: true,
    });
    this.redis.on('error', (err) =>
      this.logger.warn(`[DigestRedis] ${err.message}`),
    );
  }

  private digestCacheKey(userId: string) {
    return `digest:${userId}`;
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        fullName: true,
        avatar: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    // Check username uniqueness if changing
    if (dto.username) {
      const existing = await this.prisma.user.findFirst({
        where: { username: dto.username, NOT: { id: userId } },
      });
      if (existing) throw new ConflictException('Username already taken');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.fullName !== undefined && { fullName: dto.fullName }),
        ...(dto.username !== undefined && { username: dto.username }),
        ...(dto.avatarUrl !== undefined && { avatar: dto.avatarUrl }),
      },
      select: {
        id: true,
        email: true,
        username: true,
        fullName: true,
        avatar: true,
        status: true,
        updatedAt: true,
      },
    });

    return updated;
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Current password is incorrect');

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('New password must differ from current password');
    }

    const hashed = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: hashed },
    });

    return { message: 'Password updated successfully' };
  }

  /**
   * GET /users/me/digest
   *
   * Aggregates the current user's unread activity across:
   *   - Channel messages (where createdAt > ChannelMember.lastReadAt)
   *   - @mentions in those messages
   *   - Unread DMs (where DirectMessage.createdAt > DirectParticipant.lastReadAt)
   *
   * Passes a structured summary to AiService.generateDigest() and caches
   * the result in Redis for DIGEST_CACHE_TTL_S seconds.
   */
  async getDigest(userId: string) {
    // 1. Try cache first
    try {
      const cached = await this.redis.get(this.digestCacheKey(userId));
      if (cached) {
        this.logger.debug(`[Digest] Cache HIT for user ${userId}`);
        return JSON.parse(cached);
      }
    } catch (err) {
      this.logger.warn(`[Digest] Redis GET failed: ${(err as Error).message}`);
    }

    // 2. Fetch unread channel messages (where the user is a member)
    const channelMemberships = await this.prisma.channelMember.findMany({
      where: { userId },
      select: { channelId: true, lastReadAt: true, channel: { select: { name: true } } },
    });

    type UnreadChannelItem = {
      channelId: string;
      channelName: string;
      messages: { author: string; content: string; createdAt: Date }[];
      mentionCount: number;
    };

    const unreadChannels: UnreadChannelItem[] = [];
    let totalMentions = 0;

    for (const membership of channelMemberships) {
      const messages = await this.prisma.message.findMany({
        where: {
          channelId: membership.channelId,
          createdAt: { gt: membership.lastReadAt },
          parentId: null, // only top-level messages for the digest
        },
        orderBy: { createdAt: 'asc' },
        take: 20, // cap per channel so the Gemini prompt stays reasonable
        select: {
          id: true,
          content: true,
          createdAt: true,
          user: { select: { username: true } },
          mentions: { select: { id: true } },
        },
      });

      if (messages.length === 0) continue;

      const mentionCount = messages.filter((m) =>
        m.mentions.some((u) => u.id === userId),
      ).length;
      totalMentions += mentionCount;

      unreadChannels.push({
        channelId: membership.channelId,
        channelName: membership.channel.name,
        mentionCount,
        messages: messages.map((m) => ({
          author: m.user.username,
          content: m.content ?? '[file attachment]',
          createdAt: m.createdAt,
        })),
      });
    }

    // 3. Fetch unread DMs
    const dmParticipations = await this.prisma.directParticipant.findMany({
      where: { userId },
      select: {
        conversationId: true,
        lastReadAt: true,
        conversation: {
          select: {
            participants: {
              where: { NOT: { userId } },
              select: { user: { select: { username: true } } },
            },
          },
        },
      },
    });

    type UnreadDmItem = {
      conversationId: string;
      withUser: string;
      messageCount: number;
    };

    const unreadDms: UnreadDmItem[] = [];
    for (const p of dmParticipations) {
      const count = await this.prisma.directMessage.count({
        where: {
          conversationId: p.conversationId,
          createdAt: { gt: p.lastReadAt },
          NOT: { senderId: userId },
        },
      });
      if (count === 0) continue;
      const otherUser = p.conversation.participants[0]?.user?.username ?? 'someone';
      unreadDms.push({ conversationId: p.conversationId, withUser: otherUser, messageCount: count });
    }

    // 4. Build result
    const totalUnread = unreadChannels.reduce((s, c) => s + c.messages.length, 0)
      + unreadDms.reduce((s, d) => s + d.messageCount, 0);

    if (totalUnread === 0) {
      const result = {
        allCaughtUp: true,
        aiSummary: null,
        unreadChannels: [],
        unreadDms: [],
        totalMentions: 0,
        totalUnread: 0,
        cachedAt: new Date().toISOString(),
      };
      await this._cacheDigest(userId, result);
      return result;
    }

    // 5. Generate AI digest
    let aiSummary: string | null = null;
    try {
      aiSummary = await this.aiService.generateDigest({
        unreadChannels,
        unreadDms,
        totalMentions,
      });
    } catch (err) {
      this.logger.warn(`[Digest] AI generation failed: ${(err as Error).message}`);
    }

    const result = {
      allCaughtUp: false,
      aiSummary,
      unreadChannels: unreadChannels.map((c) => ({
        channelId: c.channelId,
        channelName: c.channelName,
        messageCount: c.messages.length,
        mentionCount: c.mentionCount,
      })),
      unreadDms: unreadDms.map((d) => ({
        conversationId: d.conversationId,
        withUser: d.withUser,
        messageCount: d.messageCount,
      })),
      totalMentions,
      totalUnread,
      cachedAt: new Date().toISOString(),
    };

    await this._cacheDigest(userId, result);
    return result;
  }

  private async _cacheDigest(userId: string, data: unknown) {
    try {
      await this.redis.set(
        this.digestCacheKey(userId),
        JSON.stringify(data),
        'EX',
        DIGEST_CACHE_TTL_S,
      );
    } catch (err) {
      this.logger.warn(`[Digest] Redis SET failed: ${(err as Error).message}`);
    }
  }

  /** Invalidate the digest cache for a user (called on new message/mention). */
  async invalidateDigestCache(userId: string) {
    try {
      await this.redis.del(this.digestCacheKey(userId));
    } catch (err) {
      this.logger.warn(`[Digest] Redis DEL failed: ${(err as Error).message}`);
    }
    return { invalidated: true };
  }
}
