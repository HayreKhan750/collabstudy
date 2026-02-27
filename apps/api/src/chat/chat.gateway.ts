import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger, UnauthorizedException, forwardRef, Inject, Optional } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { ChannelsService } from '../channels/channels.service';
import { Channel } from '@prisma/client';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { MetricsService } from '../metrics/metrics.service';

// ─── Shared event payload types ──────────────────────────────────────────────

interface PresenceUpdatePayload {
  userId: string;
  status: 'ONLINE' | 'OFFLINE';
}

interface TypingPayload {
  userId: string;
  channelId: string;
  username?: string;
}

// ─── Gateway ──────────────────────────────────────────────────────────────────

@Injectable()
@WebSocketGateway({
  cors: {
    origin: [
      'http://localhost:3000',
      'http://localhost:3001',
      process.env.FRONTEND_URL,
    ].filter(Boolean) as string[],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  // Forgiving ping settings to survive proxy/load-balancer idle timeouts.
  // Engine.IO defaults are pingInterval=25000, pingTimeout=20000 — we
  // extend pingTimeout to 60 s so a brief network hiccup doesn't force a
  // full reconnect and room-rejoin cycle.
  pingInterval: 20_000,
  pingTimeout: 60_000,
})
export class ChatGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);

  /**
   * Presence map: userId → Set of active socket IDs.
   * A user is ONLINE as long as their Set is non-empty.
   */
  private readonly presenceMap = new Map<string, Set<string>>();

  // ─── Phase 8.4: Redis Socket.io Adapter ──────────────────────────────────
  /**
   * Called by NestJS after the WebSocket server is initialised.
   * Attaches the Redis pub/sub adapter so that Socket.io events are
   * broadcast across all horizontal API replicas (zero downtime scaling).
   * Falls back silently to the in-memory adapter if Redis is unreachable,
   * so local development works without Docker.
   */
  afterInit(server: Server) {
    const host = process.env.REDIS_HOST || 'localhost';
    const port = parseInt(process.env.REDIS_PORT || '6379', 10);
    const password = process.env.REDIS_PASSWORD || 'collabstudy123';
    const redisOpts = { host, port, password, lazyConnect: true };

    const pubClient = new Redis(redisOpts);
    const subClient = pubClient.duplicate();

    const attach = () => {
      server.adapter(createAdapter(pubClient, subClient));
      this.logger.log(`Socket.io Redis adapter attached → ${host}:${port}`);
    };

    pubClient.on('error', (err) => {
      this.logger.warn(
        `Redis adapter unavailable (${err.message}) — falling back to in-memory adapter`,
      );
    });

    // Connect both clients; if either fails we simply skip the adapter
    Promise.all([pubClient.connect(), subClient.connect()])
      .then(attach)
      .catch((err) => {
        this.logger.warn(
          `Redis adapter connection failed (${err.message}) — using in-memory adapter`,
        );
      });
  }

  /**
   * Pending offline timers: userId → NodeJS.Timeout
   * Allows cancellation when a new socket arrives before the delay fires.
   */
  private readonly offlineTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /**
   * Per-socket typing-stop timers: socketId:channelId → NodeJS.Timeout
   * Automatically emits "user_stopped_typing" after 3 s of inactivity.
   */
  private readonly typingTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /** How long to wait after all sockets drop before marking a user OFFLINE (ms). */
  private readonly OFFLINE_GRACE_MS = 2_500;

  /** How long after the last "user_typing" event before auto-stopping (ms). */
  private readonly TYPING_TIMEOUT_MS = 3_000;

  // ─── Phase 9.2: WebSocket rate limiting ────────────────────────────────────
  /**
   * Per-socket message rate limiter using a sliding window counter.
   * socketId → { count: number; windowStart: number }
   *
   * Limit: WS_MSG_LIMIT messages per WS_MSG_WINDOW_MS window per socket.
   * When exceeded the message is dropped and the sender receives a
   * "rate_limit_exceeded" event — the socket connection is NOT terminated.
   */
  private readonly wsRateLimitMap = new Map<string, { count: number; windowStart: number }>();

  /** Maximum messages per socket per window. */
  private readonly WS_MSG_LIMIT = 30;

  /** Sliding window duration in milliseconds. */
  private readonly WS_MSG_WINDOW_MS = 10_000;

  /**
   * Returns true if the socket is within rate limits, false if exceeded.
   * Cleans up its own map entry on disconnect via cleanWsRateLimit().
   */
  private checkWsRateLimit(socketId: string): boolean {
    const now = Date.now();
    const record = this.wsRateLimitMap.get(socketId);

    if (!record || now - record.windowStart >= this.WS_MSG_WINDOW_MS) {
      // New window
      this.wsRateLimitMap.set(socketId, { count: 1, windowStart: now });
      return true;
    }

    record.count += 1;
    if (record.count > this.WS_MSG_LIMIT) {
      this.logger.warn(
        `[WS RateLimit] Socket ${socketId} exceeded ${this.WS_MSG_LIMIT} msgs/${this.WS_MSG_WINDOW_MS}ms`,
      );
      return false;
    }
    return true;
  }

  /** Clean up rate limit state when socket disconnects. */
  private cleanWsRateLimit(socketId: string): void {
    this.wsRateLimitMap.delete(socketId);
  }

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => ChannelsService))
    private readonly channelsService: ChannelsService,
    @Optional() private readonly metricsService?: MetricsService,
  ) {}

  // ─── Connection lifecycle ──────────────────────────────────────────────────

  /**
   * Authenticate the socket via JWT, then update presence.
   */
  async handleConnection(client: Socket): Promise<void> {
    try {
      const token = client.handshake.auth?.token as string | undefined;

      if (!token) {
        throw new UnauthorizedException('No token provided');
      }

      const payload = this.jwtService.verify<{ sub: string }>(token, {
        secret: process.env.JWT_SECRET || 'your_jwt_secret_change_in_production',
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, email: true, username: true },
      });

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      client.data.user = {
        userId: user.id,
        email: user.email,
        username: user.username,
      };

      console.log(`[Socket] User ${user.username} (${user.id}) connected with socket ${client.id}`);

      // ── Presence: register socket ──────────────────────────────────────────
      this.registerSocket(user.id, client.id);

      // ── Send current online users to the newly connected client ───────────
      const onlineUserIds = [...this.presenceMap.entries()]
        .filter(([, sockets]) => sockets.size > 0)
        .map(([userId]) => userId);
      client.emit('presence_sync', onlineUserIds);

      // ── Prometheus: increment connected clients gauge ──────────────────────
      this.metricsService?.wsConnectedClients.inc();

      // ── Join personal notification room ───────────────────────────────────
      // Every socket joins a private room named `user_<userId>` so the server
      // can send direct events (e.g. mention notifications) to a specific user.
      await client.join(`user_${user.id}`);

      // ── Join workspace rooms ───────────────────────────────────────────────
      // Fetch all workspaces the user belongs to and subscribe the socket to
      // a room per workspace so workspace-scoped broadcasts (e.g. new channels)
      // are received immediately without an additional client handshake.
      const memberships = await this.prisma.workspaceMember.findMany({
        where: { userId: user.id },
        select: { workspaceId: true },
      });
      for (const { workspaceId } of memberships) {
        const room = `workspace:${workspaceId}`;
        await client.join(room);
        console.log(`[Socket] User ${user.username} joined workspace room ${room}`);
      }
    } catch (error) {
      console.error('Connection error:', (error as Error).message);
      client.disconnect();
    }
  }

  /**
   * Remove socket from presence map; schedule OFFLINE emission after grace period.
   */
  handleDisconnect(client: Socket): void {
    const { userId, username } = (client.data.user ?? {}) as {
      userId?: string;
      username?: string;
    };

    console.warn(`[WS] Client disconnected: ${client.id} (user: ${username ?? 'unauthenticated'})`);

    // Clean up any lingering typing timers for this socket
    this.clearAllTypingTimersForSocket(client.id);

    // Clean up WS rate limit state
    this.cleanWsRateLimit(client.id);

    // ── Prometheus: decrement connected clients gauge ────────────────────────
    this.metricsService?.wsConnectedClients.dec();

    if (userId) {
      this.unregisterSocket(userId, client.id);
    }
  }

  // ─── Channel room management ───────────────────────────────────────────────

  @SubscribeMessage('join_channel')
  async handleJoinChannel(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { channelId: string },
  ): Promise<{ success: boolean; room?: string; error?: string }> {
    // Rate limit join events
    if (!this.checkWsRateLimit(client.id)) {
      return {
        success: false,
        error: `Rate limit exceeded: max ${this.WS_MSG_LIMIT} events per ${this.WS_MSG_WINDOW_MS / 1000}s`,
      };
    }
    try {
      const userId = client.data.user?.userId as string | undefined;

      if (!userId) {
        throw new UnauthorizedException('User not authenticated');
      }

      const { channelId } = data;

      if (!channelId) {
        throw new Error('Channel ID is required');
      }

      // Verify workspace membership via existing service
      await this.channelsService.verifyChannelAccess(userId, channelId);

      const roomName = `channel:${channelId}`;
      await client.join(roomName);

      console.log(`[WS] Client ${client.id} (user: ${client.data.user?.username ?? '?'}) joined channel ${channelId}`);

      return { success: true, room: roomName };
    } catch (error) {
      console.error('Join channel error:', (error as Error).message);
      return { success: false, error: (error as Error).message };
    }
  }

  // ─── Typing indicators ─────────────────────────────────────────────────────

  /**
   * Client → server: user started typing in a channel.
   * Broadcasts to the room (excluding the sender) and resets the auto-stop timer.
   */
  @SubscribeMessage('user_typing')
  handleUserTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { channelId: string },
  ): void {
    const userId = client.data.user?.userId as string | undefined;
    const username = client.data.user?.username as string | undefined;

    if (!userId || !data?.channelId) return;

    // Rate limit: typing events count toward the per-socket message budget
    if (!this.checkWsRateLimit(client.id)) {
      client.emit('rate_limit_exceeded', {
        event: 'user_typing',
        retryAfterMs: this.WS_MSG_WINDOW_MS,
        message: `Rate limit exceeded: max ${this.WS_MSG_LIMIT} events per ${this.WS_MSG_WINDOW_MS / 1000}s`,
      });
      return;
    }

    const { channelId } = data;
    const roomName = `channel:${channelId}`;
    const timerKey = `${client.id}:${channelId}`;

    // Broadcast to everyone else in the room
    client.to(roomName).emit('user_typing', { userId, channelId, username } satisfies TypingPayload);

    // Reset the auto-stop timer
    this.resetTypingTimer(client, userId, channelId, timerKey);
  }

  /**
   * Client → server: user explicitly stopped typing.
   * Cancels the auto-stop timer and broadcasts immediately.
   */
  @SubscribeMessage('user_stopped_typing')
  handleUserStoppedTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { channelId: string },
  ): void {
    const userId = client.data.user?.userId as string | undefined;

    if (!userId || !data?.channelId) return;

    const { channelId } = data;
    const timerKey = `${client.id}:${channelId}`;

    this.clearTypingTimer(timerKey);

    const roomName = `channel:${channelId}`;
    client
      .to(roomName)
      .emit('user_stopped_typing', { userId, channelId } satisfies TypingPayload);
  }

  // ─── Message broadcast (called by MessagesService) ─────────────────────────

  emitNewMessage(channelId: string, message: unknown): void {
    const roomName = `channel:${channelId}`;
    this.server.to(roomName).emit('new_message', message);
    console.log(`Emitted new_message to ${roomName}`);
  }

  // ─── Reaction broadcasts (called by MessagesService) ──────────────────────

  emitReactionAdded(channelId: string, reaction: unknown): void {
    const roomName = `channel:${channelId}`;
    this.server.to(roomName).emit('reaction_added', reaction);
    console.log(`[Socket] Emitted reaction_added to ${roomName}`);
  }

  emitReactionRemoved(channelId: string, payload: { reactionId: string; messageId: string; userId: string; emoji: string }): void {
    const roomName = `channel:${channelId}`;
    this.server.to(roomName).emit('reaction_removed', payload);
    console.log(`[Socket] Emitted reaction_removed to ${roomName}`);
  }

  emitMessageUpdated(channelId: string, message: unknown): void {
    const roomName = `channel:${channelId}`;
    this.server.to(roomName).emit('message_updated', message);
    console.log(`[Socket] Emitted message_updated to ${roomName}`);
  }

  emitMessageDeleted(channelId: string, payload: { messageId: string; channelId: string }): void {
    const roomName = `channel:${channelId}`;
    this.server.to(roomName).emit('message_deleted', payload);
    console.log(`[Socket] Emitted message_deleted to ${roomName}`);
  }

  /**
   * Emit summary_generated to the appropriate room once the BullMQ worker completes.
   * roomKey: "channel:<channelId>" | "dm:<conversationId>"
   */
  emitSummaryGenerated(roomKey: string, payload: Record<string, unknown>): void {
    this.server.to(roomKey).emit('summary_generated', payload);
    this.logger.log(`[Socket] Emitted summary_generated to room ${roomKey}`);
  }

  // ─── Read receipt broadcast (called by ChannelsService) ───────────────────

  emitReadReceiptUpdated(channelId: string, payload: { userId: string; channelId: string; messageId: string; readAt: string }): void {
    const roomName = `channel:${channelId}`;
    this.server.to(roomName).emit('read_receipt_updated', payload);
    console.log(`[Socket] Emitted read_receipt_updated to ${roomName}`);
  }

  /**
   * Emit to the specific user's personal room that their unread count for a
   * channel has been cleared — so their sidebar badge updates instantly.
   */
  emitChannelReadCleared(userId: string, channelId: string): void {
    this.server.to(`user_${userId}`).emit('channel_read_cleared', { channelId });
    console.log(`[Socket] Emitted channel_read_cleared to user_${userId} for channel ${channelId}`);
  }

  /**
   * Emit to the specific user's personal room that their unread count for a
   * DM conversation has been cleared — so their sidebar badge updates instantly.
   */
  emitDmReadCleared(userId: string, conversationId: string): void {
    this.server.to(`user_${userId}`).emit('dm_read_cleared', { conversationId });
    console.log(`[Socket] Emitted dm_read_cleared to user_${userId} for conversation ${conversationId}`);
  }

  /**
   * Client → server: mark a channel as read.
   * Delegates to ChannelsService which updates the DB and fires emitChannelReadCleared.
   */
  @SubscribeMessage('mark_channel_read')
  async handleMarkChannelRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { channelId: string },
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const userId = client.data.user?.userId as string | undefined;
      if (!userId) throw new Error('User not authenticated');
      if (!data?.channelId) throw new Error('channelId is required');
      await this.channelsService.markChannelRead(userId, data.channelId);
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Client → server: mark a DM conversation as read.
   * Updates DirectParticipant.lastReadAt and fires emitDmReadCleared.
   */
  @SubscribeMessage('mark_dm_read')
  async handleMarkDmRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const userId = client.data.user?.userId as string | undefined;
      if (!userId) throw new Error('User not authenticated');
      if (!data?.conversationId) throw new Error('conversationId is required');

      const participant = await this.prisma.directParticipant.findUnique({
        where: { userId_conversationId: { userId, conversationId: data.conversationId } },
      });
      if (!participant) throw new Error('Not a participant of this conversation');

      await this.prisma.directParticipant.update({
        where: { userId_conversationId: { userId, conversationId: data.conversationId } },
        data: { lastReadAt: new Date() },
      });

      this.emitDmReadCleared(userId, data.conversationId);
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  // ─── Workspace broadcasts (called by ChannelsService / WorkspacesService) ──

  /**
   * Broadcast a newly created channel to every socket in the workspace room.
   * All connected members of that workspace will receive `new_channel_created`
   * and can update their sidebar without a page refresh.
   */
  emitNewChannel(workspaceId: string, channel: Channel & { workspace: { id: string; name: string } }): void {
    const roomName = `workspace:${workspaceId}`;
    this.server.to(roomName).emit('new_channel_created', channel);
    console.log(`[Socket] Emitted new_channel_created to ${roomName} (channel: ${channel.name})`);
  }

  /**
   * Send a mention notification directly to each mentioned user's personal room.
   * Only the recipient(s) receive this event — not the whole channel.
   */
  emitUserMentioned(
    mentionedUserIds: string[],
    payload: {
      messageId: string;
      content: string;
      channelId: string;
      channelName: string;
      workspaceName: string;
      author: { id: string; username: string; fullName?: string | null };
    },
  ): void {
    for (const userId of mentionedUserIds) {
      this.server.to(`user_${userId}`).emit('user_mentioned', payload);
      console.log(`[Socket] Emitted user_mentioned to user_${userId}`);
    }
  }

  emitWorkspaceUpdated(workspaceId: string, workspace: unknown): void {
    this.server.to(`workspace:${workspaceId}`).emit('workspace_updated', workspace);
    console.log(`[Socket] Emitted workspace_updated to workspace:${workspaceId}`);
  }

  emitWorkspaceDeleted(workspaceId: string): void {
    this.server.to(`workspace:${workspaceId}`).emit('workspace_deleted', { workspaceId });
    console.log(`[Socket] Emitted workspace_deleted to workspace:${workspaceId}`);
  }

  emitChannelUpdated(workspaceId: string, channel: unknown): void {
    this.server.to(`workspace:${workspaceId}`).emit('channel_updated', channel);
    console.log(`[Socket] Emitted channel_updated to workspace:${workspaceId}`);
  }

  emitChannelDeleted(workspaceId: string, payload: { channelId: string; workspaceId: string }): void {
    this.server.to(`workspace:${workspaceId}`).emit('channel_deleted', payload);
    console.log(`[Socket] Emitted channel_deleted to workspace:${workspaceId}`);
  }

  // ─── Direct Message broadcasts ─────────────────────────────────────────────

  /**
   * Join the direct conversation room (called after REST start/get).
   */
  @SubscribeMessage('join_direct')
  async handleJoinDirect(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const userId = client.data.user?.userId as string | undefined;
      if (!userId) throw new Error('User not authenticated');

      // Verify membership in conversation via DB
      const participant = await this.prisma.directParticipant.findUnique({
        where: { userId_conversationId: { userId, conversationId: data.conversationId } },
      });
      if (!participant) throw new Error('Not a participant of this conversation');

      const room = `direct:${data.conversationId}`;
      await client.join(room);
      console.log(`[Socket] User ${userId} joined DM room ${room}`);
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Broadcast a new direct message to all participants in the conversation room.
   * Also sends a lightweight notification to each participant's personal room so
   * the sidebar badge increments even when they don't have the DM open.
   */
  emitDirectMessage(
    conversationId: string,
    message: unknown,
    participantUserIds: string[],
    senderId: string,
  ): void {
    const room = `direct:${conversationId}`;
    this.server.to(room).emit('new_direct_message', message);
    console.log(`[Socket] Emitted new_direct_message to ${room}`);

    // Notify every OTHER participant's personal room so the sidebar badge fires
    // even when the DM panel is not open (and thus not joined to the DM room).
    for (const uid of participantUserIds) {
      if (uid === senderId) continue;
      this.server.to(`user_${uid}`).emit('dm_unread_notification', {
        conversationId,
        senderId,
        messageId: (message as any).id,
        message,
      });
      console.log(`[Socket] Emitted dm_unread_notification to user_${uid}`);
    }
  }

  /**
   * Notify all workspace members (except the sender) that a new channel message
   * was posted. Delivered to personal rooms so the sidebar badge updates regardless
   * of which channel the recipient currently has open.
   */
  emitChannelMessageNotification(
    channelId: string,
    workspaceId: string,
    senderId: string,
    memberUserIds: string[],
    messageId: string,
  ): void {
    for (const uid of memberUserIds) {
      if (uid === senderId) continue;
      this.server.to(`user_${uid}`).emit('channel_unread_notification', {
        channelId,
        workspaceId,
        senderId,
        messageId,
      });
    }
    console.log(`[Socket] Emitted channel_unread_notification to ${memberUserIds.length - 1} members for channel ${channelId}`);
  }

  /**
   * Broadcast an edited DM message to all participants in the conversation room.
   */
  emitDmMessageUpdated(conversationId: string, message: unknown): void {
    const room = `direct:${conversationId}`;
    this.server.to(room).emit('dm_message_updated', message);
    console.log(`[Socket] Emitted dm_message_updated to ${room}`);
  }

  /**
   * Broadcast a deleted DM message ID to all participants in the conversation room.
   */
  emitDmMessageDeleted(conversationId: string, messageId: string): void {
    const room = `direct:${conversationId}`;
    this.server.to(room).emit('dm_message_deleted', { messageId });
    console.log(`[Socket] Emitted dm_message_deleted to ${room} (messageId: ${messageId})`);
  }

  /**
   * Broadcast updated reactions for a DM message to all participants.
   */
  emitDmReactionUpdated(conversationId: string, messageId: string, reactions: unknown[]): void {
    const room = `direct:${conversationId}`;
    this.server.to(room).emit('dm_reaction_updated', { messageId, reactions });
    console.log(`[Socket] Emitted dm_reaction_updated to ${room} (messageId: ${messageId})`);
  }

  /**
   * Broadcast a DM typing indicator to the conversation room.
   */
  @SubscribeMessage('dm_typing')
  handleDmTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ): void {
    const userId = client.data.user?.userId as string | undefined;
    const username = client.data.user?.username as string | undefined;
    if (!userId || !data?.conversationId) return;
    client.to(`direct:${data.conversationId}`).emit('dm_typing', { userId, username, conversationId: data.conversationId });
  }

  @SubscribeMessage('dm_stopped_typing')
  handleDmStoppedTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ): void {
    const userId = client.data.user?.userId as string | undefined;
    if (!userId || !data?.conversationId) return;
    client.to(`direct:${data.conversationId}`).emit('dm_stopped_typing', { userId, conversationId: data.conversationId });
  }

  /**
   * Broadcast to the workspace room that a new user has joined.
   * Every connected member will receive `user_joined_workspace`.
   */
  emitUserJoinedWorkspace(workspaceId: string, payload: { userId: string; username: string }): void {
    const roomName = `workspace:${workspaceId}`;
    this.server.to(roomName).emit('user_joined_workspace', { workspaceId, ...payload });
    console.log(`[Socket] Emitted user_joined_workspace to ${roomName} (user: ${payload.username})`);
  }

  // ─── WebRTC Signaling ────────────────────────────────────────────────────

  /** Relay a WebRTC offer to a specific user's personal room. */
  @SubscribeMessage('call_offer')
  handleCallOffer(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: {
      targetUserId: string;
      sdp: object;
      callType: 'dm' | 'channel';
      roomId: string;
      callerId: string;
      callerName: string;
    },
  ) {
    this.server.to(`user_${payload.targetUserId}`).emit('call_offer', {
      sdp: payload.sdp,
      callType: payload.callType,
      roomId: payload.roomId,
      callerId: payload.callerId,
      callerName: payload.callerName,
    });
  }

  /** Relay a WebRTC answer back to the caller. */
  @SubscribeMessage('call_answer')
  handleCallAnswer(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { targetUserId: string; sdp: object },
  ) {
    this.server.to(`user_${payload.targetUserId}`).emit('call_answer', {
      sdp: payload.sdp,
      fromUserId: (client.data as { userId: string }).userId,
    });
  }

  /** Relay ICE candidates between peers. */
  @SubscribeMessage('ice_candidate')
  handleIceCandidate(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { targetUserId: string; candidate: object },
  ) {
    this.server.to(`user_${payload.targetUserId}`).emit('ice_candidate', {
      candidate: payload.candidate,
      fromUserId: (client.data as { userId: string }).userId,
    });
  }

  /** End or reject a call — notify the remote peer. */
  @SubscribeMessage('call_end')
  handleCallEnd(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { targetUserId: string; roomId: string },
  ) {
    this.server.to(`user_${payload.targetUserId}`).emit('call_end', {
      roomId: payload.roomId,
      fromUserId: (client.data as { userId: string }).userId,
    });
  }

  // ─── Voice Channel Rooms ──────────────────────────────────────────────────

  /** channelId → Map<userId, participant info> */
  private readonly voiceRooms = new Map<string, Map<string, { userId: string; username: string; socketId: string }>>();

  /** Join a voice channel room and notify existing participants. */
  @SubscribeMessage('join_voice_channel')
  handleJoinVoiceChannel(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { channelId: string },
  ) {
    const { userId, username } = client.data as { userId: string; username: string };
    const room = `voice:${payload.channelId}`;

    // Leave any previous voice room first
    const prevRoom = (client.data as any).voiceRoom as string | undefined;
    if (prevRoom && prevRoom !== room) {
      client.leave(prevRoom);
      const prevChannelId = prevRoom.replace('voice:', '');
      const prevParticipants = this.voiceRooms.get(prevChannelId);
      if (prevParticipants) {
        prevParticipants.delete(userId);
        this.server.to(prevRoom).emit('voice_participant_left', { userId, channelId: prevChannelId });
        if (prevParticipants.size === 0) this.voiceRooms.delete(prevChannelId);
      }
    }

    client.join(room);
    (client.data as any).voiceRoom = room;

    if (!this.voiceRooms.has(payload.channelId)) {
      this.voiceRooms.set(payload.channelId, new Map());
    }
    const participants = this.voiceRooms.get(payload.channelId)!;

    // Tell the new joiner to initiate offers to all existing participants
    for (const [existingUserId] of participants) {
      if (existingUserId !== userId) {
        client.emit('call_offer_needed', { targetUserId: existingUserId, channelId: payload.channelId });
      }
    }

    participants.set(userId, { userId, username, socketId: client.id });

    // Notify everyone (including the new joiner) of the updated participant list
    this.server.to(room).emit('voice_participant_joined', { userId, username, channelId: payload.channelId });

    // Send full room state only to the new joiner
    client.emit('voice_room_state', {
      channelId: payload.channelId,
      participants: Array.from(participants.values()),
    });

    console.log(`[VoiceRoom] ${username} joined voice:${payload.channelId} (${participants.size} total)`);
  }

  /** Leave a voice channel room. */
  @SubscribeMessage('leave_voice_channel')
  handleLeaveVoiceChannel(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { channelId: string },
  ) {
    const { userId } = client.data as { userId: string };
    const room = `voice:${payload.channelId}`;
    client.leave(room);
    (client.data as any).voiceRoom = undefined;

    const participants = this.voiceRooms.get(payload.channelId);
    if (participants) {
      participants.delete(userId);
      this.server.to(room).emit('voice_participant_left', { userId, channelId: payload.channelId });
      if (participants.size === 0) this.voiceRooms.delete(payload.channelId);
    }
    console.log(`[VoiceRoom] user ${userId} left voice:${payload.channelId}`);
  }

  /**
   * Client → server: after joining a workspace via REST, the client emits
   * `join_workspace` so its socket is added to the workspace room and starts
   * receiving workspace-scoped broadcasts immediately.
   */
  @SubscribeMessage('join_workspace')
  async handleJoinWorkspace(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { workspaceId: string },
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const userId = client.data.user?.userId as string | undefined;
      if (!userId) throw new Error('User not authenticated');

      const { workspaceId } = data;
      if (!workspaceId) throw new Error('workspaceId is required');

      // Verify the user is actually a member before joining the room
      const membership = await this.prisma.workspaceMember.findUnique({
        where: { userId_workspaceId: { userId, workspaceId } },
      });
      if (!membership) throw new Error('Not a member of this workspace');

      const room = `workspace:${workspaceId}`;
      await client.join(room);
      console.log(`[Socket] User ${client.data.user.username} joined workspace room ${room} (via event)`);
      return { success: true };
    } catch (error) {
      console.error('[Socket] join_workspace error:', (error as Error).message);
      return { success: false, error: (error as Error).message };
    }
  }

  // ─── Presence helpers ──────────────────────────────────────────────────────

  private registerSocket(userId: string, socketId: string): void {
    // Cancel any pending offline timer — the user is reconnecting
    const pendingTimer = this.offlineTimers.get(userId);
    if (pendingTimer !== undefined) {
      clearTimeout(pendingTimer);
      this.offlineTimers.delete(userId);
      console.log(`[Socket] Cancelled offline timer for user ${userId} (socket reconnected)`);
    }

    if (!this.presenceMap.has(userId)) {
      this.presenceMap.set(userId, new Set());
    }

    const sockets = this.presenceMap.get(userId)!;
    const wasOffline = sockets.size === 0;
    sockets.add(socketId);

    console.log(
      `[Socket] Registered socket ${socketId} for user ${userId}. Active sockets: ${sockets.size}`,
    );

    // Only emit ONLINE if this is their first active socket
    if (wasOffline) {
      console.log(`[Socket] Emitting ONLINE for user ${userId}`);
      this.server.emit('user_presence_update', {
        userId,
        status: 'ONLINE',
      } satisfies PresenceUpdatePayload);
    }
  }

  private unregisterSocket(userId: string, socketId: string): void {
    const sockets = this.presenceMap.get(userId);

    if (!sockets) return;

    sockets.delete(socketId);

    console.log(
      `[Socket] Unregistered socket ${socketId} for user ${userId}. Remaining sockets: ${sockets.size}`,
    );

    if (sockets.size === 0) {
      console.log(
        `[Socket] No active sockets for user ${userId}. Starting ${this.OFFLINE_GRACE_MS}ms offline grace period.`,
      );
      // Grace period before marking OFFLINE — handles fast tab refreshes
      const timer = setTimeout(() => {
        // Re-check: another socket may have connected during the grace period
        const currentSockets = this.presenceMap.get(userId);
        if (!currentSockets || currentSockets.size === 0) {
          this.presenceMap.delete(userId);
          console.log(`[Socket] Emitting OFFLINE for user ${userId} (grace period elapsed)`);
          this.server.emit('user_presence_update', {
            userId,
            status: 'OFFLINE',
          } satisfies PresenceUpdatePayload);
        } else {
          console.log(
            `[Socket] User ${userId} reconnected during grace period — staying ONLINE`,
          );
        }
        this.offlineTimers.delete(userId);
      }, this.OFFLINE_GRACE_MS);

      this.offlineTimers.set(userId, timer);
    }
  }

  // ─── Typing timer helpers ──────────────────────────────────────────────────

  private resetTypingTimer(
    client: Socket,
    userId: string,
    channelId: string,
    timerKey: string,
  ): void {
    // Clear the previous timer if it exists
    this.clearTypingTimer(timerKey);

    const timer = setTimeout(() => {
      const roomName = `channel:${channelId}`;
      client
        .to(roomName)
        .emit('user_stopped_typing', { userId, channelId } satisfies TypingPayload);
      this.typingTimers.delete(timerKey);
    }, this.TYPING_TIMEOUT_MS);

    this.typingTimers.set(timerKey, timer);
  }

  private clearTypingTimer(timerKey: string): void {
    const existing = this.typingTimers.get(timerKey);
    if (existing !== undefined) {
      clearTimeout(existing);
      this.typingTimers.delete(timerKey);
    }
  }

  private clearAllTypingTimersForSocket(socketId: string): void {
    // Timer keys are formatted as `${socketId}:${channelId}`
    for (const key of this.typingTimers.keys()) {
      if (key.startsWith(`${socketId}:`)) {
        clearTimeout(this.typingTimers.get(key)!);
        this.typingTimers.delete(key);
      }
    }
  }
}
