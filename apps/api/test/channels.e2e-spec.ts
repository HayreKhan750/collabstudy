import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Register a new user and return { token, userId } */
async function registerUser(
  app: INestApplication<App>,
  suffix: string,
): Promise<{ token: string; userId: string }> {
  const res = await request(app.getHttpServer())
    .post('/auth/register')
    .send({
      email: `ch-user-${suffix}@test.com`,
      username: `chuser_${suffix}`,
      password: 'Password123!',
      fullName: `CH User ${suffix}`,
    })
    .expect(201);

  return { token: res.body.token as string, userId: res.body.user.id as string };
}

/** Create a workspace and return its id */
async function createWorkspace(
  app: INestApplication<App>,
  token: string,
  name: string,
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/workspaces')
    .set('Authorization', `Bearer ${token}`)
    .send({ name })
    .expect(201);
  return res.body.id as string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite
// ─────────────────────────────────────────────────────────────────────────────

describe('Channels (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  // Users
  let ownerToken: string;
  let ownerId: string;
  let memberToken: string;
  let memberId: string;
  let outsiderToken: string;

  // Workspace owned by ownerToken
  let workspaceId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );

    await app.init();
    prisma = app.get(PrismaService);

    const ts = Date.now();

    // Three distinct users
    const owner = await registerUser(app, `owner-${ts}`);
    const member = await registerUser(app, `member-${ts}`);
    const outsider = await registerUser(app, `outsider-${ts}`);

    ownerToken = owner.token;
    ownerId = owner.userId;
    memberToken = member.token;
    memberId = member.userId;
    outsiderToken = outsider.token;

    // Create workspace (owner is automatically OWNER member)
    workspaceId = await createWorkspace(app, ownerToken, `Channel Test WS ${ts}`);

    // Add `member` to the workspace as a plain MEMBER via the join endpoint
    // (workspace must be public, which is the default)
    await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/join`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(201);
  });

  afterAll(async () => {
    // Cascade: deleting workspace removes channels and memberships
    await prisma.workspace.deleteMany({ where: { ownerId } });
    // Clean up outsider / member users' own workspaces just in case
    await prisma.workspaceMember.deleteMany({ where: { userId: memberId } });
    await app.close();
  });

  // ── Test 1: Unauthenticated requests ──────────────────────────────────────
  it('POST /workspaces/:id/channels → 401 when no token', async () => {
    await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/channels`)
      .send({ name: 'general' })
      .expect(401);
  });

  it('GET /workspaces/:id/channels → 401 when no token', async () => {
    await request(app.getHttpServer())
      .get(`/workspaces/${workspaceId}/channels`)
      .expect(401);
  });

  // ── Test 2: OWNER can create a channel ────────────────────────────────────
  describe('POST /workspaces/:workspaceId/channels', () => {
    it('OWNER successfully creates a channel', async () => {
      const res = await request(app.getHttpServer())
        .post(`/workspaces/${workspaceId}/channels`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'general' })
        .expect(201);

      const channel = res.body as Record<string, unknown>;
      expect(channel.id).toBeDefined();
      expect(channel.name).toBe('general');
      expect(channel.workspaceId).toBe(workspaceId);
    });

    it('rejects channel creation with an empty name', async () => {
      await request(app.getHttpServer())
        .post(`/workspaces/${workspaceId}/channels`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: '' })
        .expect(400);
    });

    it('MEMBER (non-admin) cannot create a channel → 403', async () => {
      await request(app.getHttpServer())
        .post(`/workspaces/${workspaceId}/channels`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ name: 'should-fail' })
        .expect(403);
    });

    it('OUTSIDER (non-member) cannot create a channel → 403', async () => {
      await request(app.getHttpServer())
        .post(`/workspaces/${workspaceId}/channels`)
        .set('Authorization', `Bearer ${outsiderToken}`)
        .send({ name: 'should-also-fail' })
        .expect(403);
    });
  });

  // ── Test 3: Fetch channels ─────────────────────────────────────────────────
  describe('GET /workspaces/:workspaceId/channels', () => {
    let channelId: string;

    beforeAll(async () => {
      // Create a channel so we have something to assert on
      const res = await request(app.getHttpServer())
        .post(`/workspaces/${workspaceId}/channels`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: `fetch-test-${Date.now()}` })
        .expect(201);
      channelId = res.body.id as string;
    });

    it('OWNER can fetch channels', async () => {
      const res = await request(app.getHttpServer())
        .get(`/workspaces/${workspaceId}/channels`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      const ids = (res.body as Array<{ id: string }>).map((c) => c.id);
      expect(ids).toContain(channelId);
    });

    it('MEMBER can fetch channels', async () => {
      const res = await request(app.getHttpServer())
        .get(`/workspaces/${workspaceId}/channels`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      const ids = (res.body as Array<{ id: string }>).map((c) => c.id);
      expect(ids).toContain(channelId);
    });

    it('OUTSIDER (non-member) cannot fetch channels → 403', async () => {
      await request(app.getHttpServer())
        .get(`/workspaces/${workspaceId}/channels`)
        .set('Authorization', `Bearer ${outsiderToken}`)
        .expect(403);
    });

    it('channels are returned ordered by createdAt ascending', async () => {
      const res = await request(app.getHttpServer())
        .get(`/workspaces/${workspaceId}/channels`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      const channels = res.body as Array<{ createdAt: string }>;
      if (channels.length >= 2) {
        for (let i = 1; i < channels.length; i++) {
          expect(new Date(channels[i].createdAt).getTime()).toBeGreaterThanOrEqual(
            new Date(channels[i - 1].createdAt).getTime(),
          );
        }
      }
    });
  });

  // ── Test 5: Read Receipts ──────────────────────────────────────────────────
  describe('POST /channels/:channelId/read', () => {
    let channelId: string;
    let messageId: string;

    beforeAll(async () => {
      // Create a channel and post a message to have a real messageId
      const chRes = await request(app.getHttpServer())
        .post(`/workspaces/${workspaceId}/channels`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: `read-receipt-${Date.now()}` })
        .expect(201);
      channelId = chRes.body.id as string;

      const msgRes = await request(app.getHttpServer())
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ content: 'Hello thread!' })
        .expect(201);
      messageId = msgRes.body.id as string;
    });

    it('→ 401 when unauthenticated', async () => {
      await request(app.getHttpServer())
        .post(`/channels/${channelId}/read`)
        .send({ messageId })
        .expect(401);
    });

    it('OWNER can mark channel as read → 200 with receipt', async () => {
      const res = await request(app.getHttpServer())
        .post(`/channels/${channelId}/read`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ messageId })
        .expect(200);

      const receipt = res.body as Record<string, unknown>;
      expect(receipt.id).toBeDefined();
      expect(receipt.userId).toBe(ownerId);
      expect(receipt.channelId).toBe(channelId);
      expect(receipt.messageId).toBe(messageId);
      expect(receipt.readAt).toBeDefined();
    });

    it('calling again updates the existing record (no duplicate) → 200', async () => {
      // Post a second message so we can advance the read pointer
      const msg2Res = await request(app.getHttpServer())
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ content: 'Second message' })
        .expect(201);
      const messageId2 = msg2Res.body.id as string;

      // Mark read at second message
      const res = await request(app.getHttpServer())
        .post(`/channels/${channelId}/read`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ messageId: messageId2 })
        .expect(200);

      expect(res.body.messageId).toBe(messageId2);

      // Confirm only ONE read receipt exists for this user+channel
      const count = await prisma.readReceipt.count({
        where: { userId: ownerId, channelId },
      });
      expect(count).toBe(1);
    });

    it('MEMBER can also mark as read → 200', async () => {
      const res = await request(app.getHttpServer())
        .post(`/channels/${channelId}/read`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ messageId })
        .expect(200);

      expect(res.body.userId).toBe(memberId);
    });

    it('OUTSIDER cannot mark as read → 403', async () => {
      await request(app.getHttpServer())
        .post(`/channels/${channelId}/read`)
        .set('Authorization', `Bearer ${outsiderToken}`)
        .send({ messageId })
        .expect(403);
    });

    it('missing messageId → 400', async () => {
      await request(app.getHttpServer())
        .post(`/channels/${channelId}/read`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({})
        .expect(400);
    });

    it('non-UUID messageId → 400', async () => {
      await request(app.getHttpServer())
        .post(`/channels/${channelId}/read`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ messageId: 'not-a-uuid' })
        .expect(400);
    });
  });

  // ── Test 4: Workspace isolation ────────────────────────────────────────────
  describe('Workspace isolation', () => {
    let wsB_id: string;
    let wsB_channelId: string;

    beforeAll(async () => {
      // Owner creates a second workspace
      wsB_id = await createWorkspace(app, ownerToken, `Isolated WS B ${Date.now()}`);

      // Create a channel in Workspace B
      const res = await request(app.getHttpServer())
        .post(`/workspaces/${wsB_id}/channels`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'ws-b-channel' })
        .expect(201);
      wsB_channelId = res.body.id as string;
    });

    it('member of Workspace A cannot fetch channels of Workspace B → 403', async () => {
      // `memberToken` is only in workspaceId (A), not wsB_id (B)
      await request(app.getHttpServer())
        .get(`/workspaces/${wsB_id}/channels`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(403);
    });

    it('channels of Workspace B do NOT appear when fetching Workspace A channels', async () => {
      const res = await request(app.getHttpServer())
        .get(`/workspaces/${workspaceId}/channels`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      const ids = (res.body as Array<{ id: string }>).map((c) => c.id);
      expect(ids).not.toContain(wsB_channelId);
    });
  });
});
