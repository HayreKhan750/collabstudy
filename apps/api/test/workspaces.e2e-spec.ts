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
      email: `ws-user-${suffix}@test.com`,
      username: `wsuser_${suffix}`,
      password: 'Password123!',
      fullName: `WS User ${suffix}`,
    })
    .expect(201);

  return { token: res.body.token as string, userId: res.body.user.id as string };
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite
// ─────────────────────────────────────────────────────────────────────────────

describe('Workspaces (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  // Tokens + ids populated in beforeAll
  let ownerToken: string;
  let ownerId: string;
  let outsiderToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Mirror the global pipe from main.ts so DTOs are validated identically
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );

    await app.init();

    prisma = app.get(PrismaService);

    // Register two independent users
    const owner = await registerUser(app, `owner-${Date.now()}`);
    const outsider = await registerUser(app, `outsider-${Date.now()}`);
    ownerToken = owner.token;
    ownerId = owner.userId;
    outsiderToken = outsider.token;
  });

  afterAll(async () => {
    // Clean up all workspaces created by the owner (cascades to members/channels)
    await prisma.workspaceMember.deleteMany({ where: { userId: ownerId } });
    await prisma.workspace.deleteMany({ where: { ownerId } });
    await app.close();
  });

  // ── Test 1: Unauthenticated requests are rejected ──────────────────────────
  it('POST /workspaces → 401 when no token is provided', async () => {
    await request(app.getHttpServer())
      .post('/workspaces')
      .send({ name: 'Should Fail' })
      .expect(401);
  });

  // ── Test 2: Workspace creation ─────────────────────────────────────────────
  describe('POST /workspaces', () => {
    it('creates a workspace and automatically makes the creator OWNER', async () => {
      const res = await request(app.getHttpServer())
        .post('/workspaces')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'My First Workspace' })
        .expect(201);

      const workspace = res.body as Record<string, unknown>;

      expect(workspace.id).toBeDefined();
      expect(workspace.name).toBe('My First Workspace');
      expect(workspace.ownerId).toBe(ownerId);

      // members array must contain the creator with OWNER role
      expect(Array.isArray(workspace.members)).toBe(true);
      const members = workspace.members as Array<{ userId: string; role: string }>;
      const ownerMember = members.find((m) => m.userId === ownerId);
      expect(ownerMember).toBeDefined();
      expect(ownerMember!.role).toBe('OWNER');
    });

    it('rejects creation with an empty name (DTO validation)', async () => {
      await request(app.getHttpServer())
        .post('/workspaces')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: '' })
        .expect(400);
    });

    it('rejects creation with a missing name field', async () => {
      await request(app.getHttpServer())
        .post('/workspaces')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({})
        .expect(400);
    });
  });

  // ── Test 3: Fetch user workspaces ──────────────────────────────────────────
  describe('GET /workspaces', () => {
    let workspaceId: string;

    beforeAll(async () => {
      // Create a workspace owned by the owner
      const res = await request(app.getHttpServer())
        .post('/workspaces')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: `Fetch Test Workspace ${Date.now()}` })
        .expect(201);
      workspaceId = res.body.id as string;
    });

    it('returns workspaces the authenticated user belongs to', async () => {
      const res = await request(app.getHttpServer())
        .get('/workspaces')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      const ids = (res.body as Array<{ id: string }>).map((w) => w.id);
      expect(ids).toContain(workspaceId);
    });

    it('does NOT return workspaces the user is not a member of', async () => {
      // Outsider should NOT see the owner's workspace
      const res = await request(app.getHttpServer())
        .get('/workspaces')
        .set('Authorization', `Bearer ${outsiderToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      const ids = (res.body as Array<{ id: string }>).map((w) => w.id);
      expect(ids).not.toContain(workspaceId);
    });

    it('returns 401 when no token is provided', async () => {
      await request(app.getHttpServer()).get('/workspaces').expect(401);
    });

    it('each returned workspace includes id, name, ownerId, members, and channels', async () => {
      const res = await request(app.getHttpServer())
        .get('/workspaces')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      const workspaces = res.body as Array<Record<string, unknown>>;
      const ws = workspaces.find((w) => w.id === workspaceId);
      expect(ws).toBeDefined();
      expect(ws!.name).toBeDefined();
      expect(ws!.ownerId).toBeDefined();
      expect(Array.isArray(ws!.members)).toBe(true);
      expect(Array.isArray(ws!.channels)).toBe(true);
    });
  });
});
