import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// ─── Helper ───────────────────────────────────────────────────────────────────

async function registerUser(
  app: INestApplication<App>,
  suffix: string,
): Promise<{ token: string; userId: string }> {
  const res = await request(app.getHttpServer())
    .post('/auth/register')
    .send({
      email: `reactions-${suffix}@test.com`,
      username: `react_${suffix}`,
      password: 'Password123!',
      fullName: `Reactions ${suffix}`,
    })
    .expect(201);

  return { token: res.body.token as string, userId: res.body.user.id as string };
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('Reactions (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let ownerToken: string;
  let ownerUserId: string;
  let memberToken: string;
  let outsiderToken: string;

  let workspaceId: string;
  let channelId: string;
  let messageId: string;

  // ─── Bootstrap ─────────────────────────────────────────────────────────────

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
    const owner = await registerUser(app, `owner-${ts}`);
    const member = await registerUser(app, `member-${ts}`);
    const outsider = await registerUser(app, `outsider-${ts}`);

    ownerToken = owner.token;
    ownerUserId = owner.userId;
    memberToken = member.token;
    outsiderToken = outsider.token;

    // Owner creates workspace + channel
    const wsRes = await request(app.getHttpServer())
      .post('/workspaces')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `Reactions WS ${ts}` })
      .expect(201);
    workspaceId = wsRes.body.id as string;

    const chRes = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/channels`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'reactions-channel' })
      .expect(201);
    channelId = chRes.body.id as string;

    // Member joins workspace
    await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/join`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(201);

    // Owner posts a message
    const msgRes = await request(app.getHttpServer())
      .post(`/channels/${channelId}/messages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ content: 'Hello reactions!' })
      .expect(201);
    messageId = msgRes.body.id as string;
  });

  afterAll(async () => {
    await prisma.reaction.deleteMany({ where: { messageId } });
    await prisma.message.deleteMany({ where: { channelId } });
    await prisma.channel.deleteMany({ where: { workspaceId } });
    await prisma.workspaceMember.deleteMany({ where: { workspaceId } });
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    await app.close();
  });

  afterEach(async () => {
    await prisma.reaction.deleteMany({ where: { messageId } });
  });

  // ─── POST reactions ────────────────────────────────────────────────────────

  describe('POST /channels/:channelId/messages/:messageId/reactions', () => {
    it('returns 401 when unauthenticated', async () => {
      await request(app.getHttpServer())
        .post(`/channels/${channelId}/messages/${messageId}/reactions`)
        .send({ emoji: '👍' })
        .expect(401);
    });

    it('allows an owner to add a reaction', async () => {
      const res = await request(app.getHttpServer())
        .post(`/channels/${channelId}/messages/${messageId}/reactions`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ emoji: '👍' })
        .expect(201);

      expect(res.body).toMatchObject({
        emoji: '👍',
        messageId,
        userId: ownerUserId,
      });
      expect(res.body.id).toBeDefined();
    });

    it('allows a workspace member to add a reaction', async () => {
      const res = await request(app.getHttpServer())
        .post(`/channels/${channelId}/messages/${messageId}/reactions`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ emoji: '❤️' })
        .expect(201);

      expect(res.body.emoji).toBe('❤️');
    });

    it('returns 409 when the same user reacts twice with the same emoji', async () => {
      await request(app.getHttpServer())
        .post(`/channels/${channelId}/messages/${messageId}/reactions`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ emoji: '😂' })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/channels/${channelId}/messages/${messageId}/reactions`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ emoji: '😂' })
        .expect(409);
    });

    it('allows the same user to react with different emojis', async () => {
      await request(app.getHttpServer())
        .post(`/channels/${channelId}/messages/${messageId}/reactions`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ emoji: '👍' })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/channels/${channelId}/messages/${messageId}/reactions`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ emoji: '❤️' })
        .expect(201);
    });

    it('returns 403 for a user not in the workspace', async () => {
      await request(app.getHttpServer())
        .post(`/channels/${channelId}/messages/${messageId}/reactions`)
        .set('Authorization', `Bearer ${outsiderToken}`)
        .send({ emoji: '👍' })
        .expect(403);
    });

    it('returns 400 when emoji is missing', async () => {
      await request(app.getHttpServer())
        .post(`/channels/${channelId}/messages/${messageId}/reactions`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({})
        .expect(400);
    });

    it('returns 400 when emoji is empty string', async () => {
      await request(app.getHttpServer())
        .post(`/channels/${channelId}/messages/${messageId}/reactions`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ emoji: '' })
        .expect(400);
    });

    it('returns 400 when emoji exceeds 10 characters', async () => {
      await request(app.getHttpServer())
        .post(`/channels/${channelId}/messages/${messageId}/reactions`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ emoji: 'toolongemoji123' })
        .expect(400);
    });

    it('returns 404 for a non-existent messageId', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      await request(app.getHttpServer())
        .post(`/channels/${channelId}/messages/${fakeId}/reactions`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ emoji: '👍' })
        .expect(404);
    });
  });

  // ─── DELETE reactions ──────────────────────────────────────────────────────

  describe('DELETE /channels/:channelId/messages/:messageId/reactions/:reactionId', () => {
    let ownerReactionId: string;
    let memberReactionId: string;

    beforeEach(async () => {
      const ownerRes = await request(app.getHttpServer())
        .post(`/channels/${channelId}/messages/${messageId}/reactions`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ emoji: '👍' });
      ownerReactionId = ownerRes.body.id as string;

      const memberRes = await request(app.getHttpServer())
        .post(`/channels/${channelId}/messages/${messageId}/reactions`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ emoji: '❤️' });
      memberReactionId = memberRes.body.id as string;
    });

    it('returns 401 when unauthenticated', async () => {
      await request(app.getHttpServer())
        .delete(`/channels/${channelId}/messages/${messageId}/reactions/${ownerReactionId}`)
        .expect(401);
    });

    it('allows the owner to remove their own reaction', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/channels/${channelId}/messages/${messageId}/reactions/${ownerReactionId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      const gone = await prisma.reaction.findUnique({ where: { id: ownerReactionId } });
      expect(gone).toBeNull();
    });

    it("returns 403 when a user tries to remove someone else's reaction", async () => {
      await request(app.getHttpServer())
        .delete(`/channels/${channelId}/messages/${messageId}/reactions/${memberReactionId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(403);
    });

    it('returns 403 when outsider tries to remove a reaction', async () => {
      await request(app.getHttpServer())
        .delete(`/channels/${channelId}/messages/${messageId}/reactions/${ownerReactionId}`)
        .set('Authorization', `Bearer ${outsiderToken}`)
        .expect(403);
    });

    it('returns 404 for a non-existent reactionId', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      await request(app.getHttpServer())
        .delete(`/channels/${channelId}/messages/${messageId}/reactions/${fakeId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(404);
    });

    it('member can remove their own reaction', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/channels/${channelId}/messages/${messageId}/reactions/${memberReactionId}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  // ─── Message history includes reactions ────────────────────────────────────

  describe('GET /channels/:channelId/messages includes reactions', () => {
    it('returns reactions attached to messages', async () => {
      await request(app.getHttpServer())
        .post(`/channels/${channelId}/messages/${messageId}/reactions`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ emoji: '👍' });

      await request(app.getHttpServer())
        .post(`/channels/${channelId}/messages/${messageId}/reactions`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ emoji: '❤️' });

      const res = await request(app.getHttpServer())
        .get(`/channels/${channelId}/messages`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      const msg = res.body.messages.find((m: { id: string }) => m.id === messageId);
      expect(msg).toBeDefined();
      expect(Array.isArray(msg.reactions)).toBe(true);
      expect(msg.reactions).toHaveLength(2);
      const emojis = msg.reactions.map((r: { emoji: string }) => r.emoji);
      expect(emojis).toContain('👍');
      expect(emojis).toContain('❤️');
    });
  });
});
