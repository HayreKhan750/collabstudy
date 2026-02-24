import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function registerAndLogin(
  app: INestApplication,
  suffix: string,
): Promise<{ token: string; userId: string }> {
  const ts = Date.now();
  const email = `msg_user_${suffix}_${ts}@test.com`;
  const password = 'Password123!';
  const username = `msg_${suffix}_${ts}`;

  await request(app.getHttpServer() as App)
    .post('/auth/register')
    .send({ email, password, username })
    .expect(201);

  const res = await request(app.getHttpServer() as App)
    .post('/auth/login')
    .send({ email, password })
    .expect(200);

  return { token: res.body.token, userId: res.body.user.id };
}

async function createWorkspaceAndChannel(
  app: INestApplication,
  token: string,
): Promise<{ workspaceId: string; channelId: string }> {
  const ts = Date.now();

  const wsRes = await request(app.getHttpServer() as App)
    .post('/workspaces')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: `Thread WS ${ts}` })
    .expect(201);

  const chRes = await request(app.getHttpServer() as App)
    .post(`/workspaces/${wsRes.body.id}/channels`)
    .set('Authorization', `Bearer ${token}`)
    .send({ name: `thread-channel-${ts}` })
    .expect(201);

  return { workspaceId: wsRes.body.id, channelId: chRes.body.id };
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('Messages — Threaded Replies (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

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
  });

  afterAll(async () => {
    await app.close();
  });

  // ── 1. Basic message creation ───────────────────────────────────────────────

  describe('POST /channels/:channelId/messages', () => {
    it('creates a top-level message with no parentId', async () => {
      const { token } = await registerAndLogin(app, 'basic');
      const { channelId } = await createWorkspaceAndChannel(app, token);

      const res = await request(app.getHttpServer() as App)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'Hello world' })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.content).toBe('Hello world');
      expect(res.body.parentId).toBeNull();
      expect(res.body._count.replies).toBe(0);
    });

    it('returns 401 without a token', async () => {
      await request(app.getHttpServer() as App)
        .post('/channels/00000000-0000-0000-0000-000000000000/messages')
        .send({ content: 'Hello' })
        .expect(401);
    });
  });

  // ── 2. Threaded replies ─────────────────────────────────────────────────────

  describe('Threaded replies', () => {
    it('creates a reply to an existing message with a valid parentId', async () => {
      const { token } = await registerAndLogin(app, 'reply');
      const { channelId } = await createWorkspaceAndChannel(app, token);

      // Post the parent message
      const parentRes = await request(app.getHttpServer() as App)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'Parent message' })
        .expect(201);

      const parentId = parentRes.body.id;

      // Post the reply
      const replyRes = await request(app.getHttpServer() as App)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'This is a reply', parentId })
        .expect(201);

      expect(replyRes.body.content).toBe('This is a reply');
      expect(replyRes.body.parentId).toBe(parentId);
      expect(replyRes.body._count.replies).toBe(0);
    });

    it('increments reply count on parent when fetching messages', async () => {
      const { token } = await registerAndLogin(app, 'count');
      const { channelId } = await createWorkspaceAndChannel(app, token);

      const parentRes = await request(app.getHttpServer() as App)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'Parent' })
        .expect(201);

      const parentId = parentRes.body.id;

      // Post two replies
      await request(app.getHttpServer() as App)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'Reply 1', parentId })
        .expect(201);

      await request(app.getHttpServer() as App)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'Reply 2', parentId })
        .expect(201);

      // Fetch all messages and confirm parent has _count.replies === 2
      const listRes = await request(app.getHttpServer() as App)
        .get(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const parent = listRes.body.messages.find((m: any) => m.id === parentId);
      expect(parent).toBeDefined();
      expect(parent._count.replies).toBe(2);
    });

    it('returns 404 when parentId does not exist', async () => {
      const { token } = await registerAndLogin(app, 'fake');
      const { channelId } = await createWorkspaceAndChannel(app, token);

      const fakeParentId = '00000000-0000-4000-8000-000000000001';

      const res = await request(app.getHttpServer() as App)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'Reply to ghost', parentId: fakeParentId })
        .expect(404);

      expect(res.body.message).toBe('Parent message not found');
    });

    it('returns 404 when parentId belongs to a different channel', async () => {
      const { token } = await registerAndLogin(app, 'crossch');
      const { channelId: channelA } = await createWorkspaceAndChannel(app, token);
      const { channelId: channelB } = await createWorkspaceAndChannel(app, token);

      // Post parent in channel A
      const parentRes = await request(app.getHttpServer() as App)
        .post(`/channels/${channelA}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'In channel A' })
        .expect(201);

      // Try to reply in channel B referencing channel A's message
      const res = await request(app.getHttpServer() as App)
        .post(`/channels/${channelB}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'Cross-channel reply', parentId: parentRes.body.id })
        .expect(404);

      expect(res.body.message).toBe('Parent message does not belong to this channel');
    });

    it('returns 400 when parentId is not a valid UUID', async () => {
      const { token } = await registerAndLogin(app, 'baduuid');
      const { channelId } = await createWorkspaceAndChannel(app, token);

      await request(app.getHttpServer() as App)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'Bad UUID', parentId: 'not-a-uuid' })
        .expect(400);
    });

    it('allows nesting: a reply can itself have a reply', async () => {
      const { token } = await registerAndLogin(app, 'nested');
      const { channelId } = await createWorkspaceAndChannel(app, token);

      const grandparentRes = await request(app.getHttpServer() as App)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'Grandparent' })
        .expect(201);

      const parentRes = await request(app.getHttpServer() as App)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'Parent reply', parentId: grandparentRes.body.id })
        .expect(201);

      const childRes = await request(app.getHttpServer() as App)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'Child reply', parentId: parentRes.body.id })
        .expect(201);

      expect(childRes.body.parentId).toBe(parentRes.body.id);
    });
  });

  // ── 3. Message list includes parentId and _count.replies ───────────────────

  describe('GET /channels/:channelId/messages', () => {
    it('returns parentId and _count.replies on each message', async () => {
      const { token } = await registerAndLogin(app, 'listcheck');
      const { channelId } = await createWorkspaceAndChannel(app, token);

      const parentRes = await request(app.getHttpServer() as App)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'Root' })
        .expect(201);

      await request(app.getHttpServer() as App)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'Reply', parentId: parentRes.body.id })
        .expect(201);

      const res = await request(app.getHttpServer() as App)
        .get(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.messages).toBeDefined();
      for (const msg of res.body.messages) {
        expect(msg).toHaveProperty('_count');
        expect(msg._count).toHaveProperty('replies');
      }
    });
  });

  // ── 4. Mentions ─────────────────────────────────────────────────────────────

  describe('Mentions', () => {
    it('saves mentionIds and returns mentioned users in the response', async () => {
      const { token } = await registerAndLogin(app, 'mentioner');
      const { token: token2, userId: mentionedId } = await registerAndLogin(app, 'mentioned');
      const { channelId } = await createWorkspaceAndChannel(app, token);

      const res = await request(app.getHttpServer() as App)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'Hey @mentioned!', mentionIds: [mentionedId] })
        .expect(201);

      expect(res.body.mentions).toBeDefined();
      expect(Array.isArray(res.body.mentions)).toBe(true);
      expect(res.body.mentions).toHaveLength(1);
      expect(res.body.mentions[0].id).toBe(mentionedId);
      // suppress unused variable warning
      void token2;
    });

    it('returns mentions array on fetched messages', async () => {
      const { token } = await registerAndLogin(app, 'mfetch');
      const { userId: mentionedId } = await registerAndLogin(app, 'mfetched');
      const { channelId } = await createWorkspaceAndChannel(app, token);

      await request(app.getHttpServer() as App)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'Hello!', mentionIds: [mentionedId] })
        .expect(201);

      const res = await request(app.getHttpServer() as App)
        .get(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const msg = res.body.messages[0];
      expect(msg.mentions).toBeDefined();
      expect(msg.mentions[0].id).toBe(mentionedId);
    });

    it('succeeds with no mentionIds (field is optional)', async () => {
      const { token } = await registerAndLogin(app, 'nomention');
      const { channelId } = await createWorkspaceAndChannel(app, token);

      const res = await request(app.getHttpServer() as App)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'No mentions here' })
        .expect(201);

      expect(res.body.mentions).toEqual([]);
    });

    it('returns 400 when mentionIds contains a non-UUID', async () => {
      const { token } = await registerAndLogin(app, 'baduuidm');
      const { channelId } = await createWorkspaceAndChannel(app, token);

      await request(app.getHttpServer() as App)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'Bad mention', mentionIds: ['not-a-uuid'] })
        .expect(400);
    });

    it('supports multiple mentions in one message', async () => {
      const { token } = await registerAndLogin(app, 'multi');
      const { userId: id1 } = await registerAndLogin(app, 'multiA');
      const { userId: id2 } = await registerAndLogin(app, 'multiB');
      const { channelId } = await createWorkspaceAndChannel(app, token);

      const res = await request(app.getHttpServer() as App)
        .post(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'Hey both!', mentionIds: [id1, id2] })
        .expect(201);

      expect(res.body.mentions).toHaveLength(2);
      const mentionedIds = res.body.mentions.map((u: { id: string }) => u.id);
      expect(mentionedIds).toContain(id1);
      expect(mentionedIds).toContain(id2);
    });
  });
});
