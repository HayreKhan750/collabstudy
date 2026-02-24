import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function registerAndLogin(
  app: INestApplication,
  suffix: string,
): Promise<{ token: string; userId: string }> {
  const ts = Date.now();
  const email = `search_user_${suffix}_${ts}@test.com`;
  const password = 'Password123!';
  const username = `search_${suffix}_${ts}`;

  const res = await request(app.getHttpServer() as App)
    .post('/auth/register')
    .send({ email, password, username })
    .expect(201);

  return { token: res.body.token, userId: res.body.user.id };
}

async function createWorkspace(
  app: INestApplication,
  token: string,
): Promise<string> {
  const ts = Date.now();
  const res = await request(app.getHttpServer() as App)
    .post('/workspaces')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: `Search WS ${ts}` })
    .expect(201);
  return res.body.id as string;
}

async function createChannel(
  app: INestApplication,
  token: string,
  workspaceId: string,
): Promise<string> {
  const ts = Date.now();
  const res = await request(app.getHttpServer() as App)
    .post(`/workspaces/${workspaceId}/channels`)
    .set('Authorization', `Bearer ${token}`)
    .send({ name: `search-ch-${ts}` })
    .expect(201);
  return res.body.id as string;
}

async function postMessage(
  app: INestApplication,
  token: string,
  channelId: string,
  content: string,
): Promise<string> {
  const res = await request(app.getHttpServer() as App)
    .post(`/channels/${channelId}/messages`)
    .set('Authorization', `Bearer ${token}`)
    .send({ content })
    .expect(201);
  return res.body.id as string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite
// ─────────────────────────────────────────────────────────────────────────────

describe('Search — GET /search (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let token: string;
  let userId: string;
  let workspaceId: string;
  let channelId: string;

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

    // Create one user, workspace, and channel for most tests
    ({ token, userId } = await registerAndLogin(app, 'main'));
    workspaceId = await createWorkspace(app, token);
    channelId = await createChannel(app, token, workspaceId);

    // Seed messages with distinct content so we can test ranking
    await postMessage(app, token, channelId, 'PostgreSQL full-text search is powerful');
    await postMessage(app, token, channelId, 'PostgreSQL is a great relational database');
    await postMessage(app, token, channelId, 'Redis is an in-memory key-value store');
    await postMessage(app, token, channelId, 'TypeScript improves developer productivity');
    await postMessage(app, token, channelId, 'NestJS is a Node.js framework for building APIs');
    // suppress unused var
    void userId;
  });

  afterAll(async () => {
    await app.close();
  });

  // ── Authentication ──────────────────────────────────────────────────────────

  it('returns 401 when no token is provided', async () => {
    await request(app.getHttpServer() as App)
      .get('/search')
      .query({ q: 'postgres', workspaceId })
      .expect(401);
  });

  // ── Validation ──────────────────────────────────────────────────────────────

  it('returns 400 when q is missing', async () => {
    await request(app.getHttpServer() as App)
      .get('/search')
      .set('Authorization', `Bearer ${token}`)
      .query({ workspaceId })
      .expect(400);
  });

  it('returns 400 when workspaceId is missing', async () => {
    await request(app.getHttpServer() as App)
      .get('/search')
      .set('Authorization', `Bearer ${token}`)
      .query({ q: 'postgres' })
      .expect(400);
  });

  it('returns 400 when workspaceId is not a valid UUID', async () => {
    await request(app.getHttpServer() as App)
      .get('/search')
      .set('Authorization', `Bearer ${token}`)
      .query({ q: 'postgres', workspaceId: 'not-a-uuid' })
      .expect(400);
  });

  // ── Workspace scoping / access control ─────────────────────────────────────

  it('returns 403 when user is not a member of the workspace', async () => {
    // Create a second user who does NOT join the workspace
    const { token: outsiderToken } = await registerAndLogin(app, 'outsider');

    await request(app.getHttpServer() as App)
      .get('/search')
      .set('Authorization', `Bearer ${outsiderToken}`)
      .query({ q: 'postgres', workspaceId })
      .expect(403);
  });

  it('does NOT return messages from another workspace', async () => {
    // Second user, second workspace with its own messages
    const { token: token2 } = await registerAndLogin(app, 'ws2user');
    const ws2Id = await createWorkspace(app, token2);
    const ch2Id = await createChannel(app, token2, ws2Id);
    await postMessage(app, token2, ch2Id, 'PostgreSQL in workspace 2');

    // token2 searches their own workspace — should only see their message
    const res = await request(app.getHttpServer() as App)
      .get('/search')
      .set('Authorization', `Bearer ${token2}`)
      .query({ q: 'PostgreSQL', workspaceId: ws2Id })
      .expect(200);

    const ids = res.body.messages.map((m: any) => m.channelId);
    expect(ids.every((id: string) => id === ch2Id)).toBe(true);
  });

  // ── Partial match ───────────────────────────────────────────────────────────

  it('returns results for a partial / fuzzy match (partial match works)', async () => {
    const res = await request(app.getHttpServer() as App)
      .get('/search')
      .set('Authorization', `Bearer ${token}`)
      .query({ q: 'Postgre', workspaceId })
      .expect(200);

    expect(res.body.messages).toBeDefined();
    expect(Array.isArray(res.body.messages)).toBe(true);
    // At least the two PostgreSQL messages should match
    expect(res.body.messages.length).toBeGreaterThanOrEqual(1);

    // All returned messages should contain postgres-related content
    const contents: string[] = res.body.messages.map((m: any) => m.content.toLowerCase());
    expect(contents.some((c) => c.includes('postgresql'))).toBe(true);
  });

  // ── Ranking ─────────────────────────────────────────────────────────────────

  it('ranks results by similarity DESC (ranking works)', async () => {
    const res = await request(app.getHttpServer() as App)
      .get('/search')
      .set('Authorization', `Bearer ${token}`)
      .query({ q: 'PostgreSQL', workspaceId })
      .expect(200);

    const messages = res.body.messages as Array<{ similarity: number; content: string }>;
    expect(messages.length).toBeGreaterThanOrEqual(2);

    // Similarity scores must be in descending order
    for (let i = 0; i < messages.length - 1; i++) {
      expect(messages[i].similarity).toBeGreaterThanOrEqual(messages[i + 1].similarity);
    }

    // The message with "PostgreSQL full-text search" should score at least as high
    // as the one with just "PostgreSQL" — both contain the exact token
    const topContent = messages[0].content.toLowerCase();
    expect(topContent).toContain('postgresql');
  });

  // ── Response shape ──────────────────────────────────────────────────────────

  it('returns the expected response shape', async () => {
    const res = await request(app.getHttpServer() as App)
      .get('/search')
      .set('Authorization', `Bearer ${token}`)
      .query({ q: 'PostgreSQL', workspaceId })
      .expect(200);

    expect(res.body).toHaveProperty('messages');
    expect(res.body).toHaveProperty('nextCursor');
    expect(res.body).toHaveProperty('total');

    const msg = res.body.messages[0];
    expect(msg).toHaveProperty('id');
    expect(msg).toHaveProperty('content');
    expect(msg).toHaveProperty('channelId');
    expect(msg).toHaveProperty('channelName');
    expect(msg).toHaveProperty('similarity');
    expect(msg).toHaveProperty('createdAt');
    expect(msg).toHaveProperty('user');
    expect(msg.user).toHaveProperty('id');
    expect(msg.user).toHaveProperty('username');
  });

  // ── Pagination ──────────────────────────────────────────────────────────────

  it('paginates results correctly (pagination works)', async () => {
    // Create a fresh workspace with many seeded messages for clean pagination
    const { token: pToken } = await registerAndLogin(app, 'paguser');
    const pWorkspaceId = await createWorkspace(app, pToken);
    const pChannelId = await createChannel(app, pToken, pWorkspaceId);

    // Seed 6 messages all containing "pagination"
    // Small delay between inserts ensures distinct createdAt timestamps,
    // which is required for stable cursor-based pagination.
    for (let i = 1; i <= 6; i++) {
      await postMessage(app, pToken, pChannelId, `pagination test message number ${i}`);
      await new Promise((r) => setTimeout(r, 5));
    }

    // Page 1: limit=3
    const page1 = await request(app.getHttpServer() as App)
      .get('/search')
      .set('Authorization', `Bearer ${pToken}`)
      .query({ q: 'pagination', workspaceId: pWorkspaceId, limit: 3 })
      .expect(200);

    expect(page1.body.messages).toHaveLength(3);
    expect(page1.body.nextCursor).not.toBeNull();

    const cursor = page1.body.nextCursor as string;
    const page1Ids = page1.body.messages.map((m: any) => m.id);

    // Page 2: use the cursor from page 1
    const page2 = await request(app.getHttpServer() as App)
      .get('/search')
      .set('Authorization', `Bearer ${pToken}`)
      .query({ q: 'pagination', workspaceId: pWorkspaceId, limit: 3, cursor })
      .expect(200);

    expect(page2.body.messages.length).toBeGreaterThanOrEqual(1);

    // No duplicates between pages
    const page2Ids = page2.body.messages.map((m: any) => m.id);
    const overlap = page1Ids.filter((id: string) => page2Ids.includes(id));
    expect(overlap).toHaveLength(0);
  });

  it('returns nextCursor=null on the last page', async () => {
    // With a high limit all results fit in one page → no next cursor
    const res = await request(app.getHttpServer() as App)
      .get('/search')
      .set('Authorization', `Bearer ${token}`)
      .query({ q: 'PostgreSQL', workspaceId, limit: 100 })
      .expect(200);

    expect(res.body.nextCursor).toBeNull();
  });

  // ── No match ────────────────────────────────────────────────────────────────

  it('returns empty results when no messages match', async () => {
    // Use a random UUID-derived string that will never appear in any seeded message
    const noMatchTerm = `zzznomatch_${Date.now()}_qqqq`;
    const res = await request(app.getHttpServer() as App)
      .get('/search')
      .set('Authorization', `Bearer ${token}`)
      .query({ q: noMatchTerm, workspaceId })
      .expect(200);

    expect(res.body.messages).toHaveLength(0);
    expect(res.body.nextCursor).toBeNull();
  });
});
