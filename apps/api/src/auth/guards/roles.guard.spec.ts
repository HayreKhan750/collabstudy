import { RolesGuard } from './roles.guard';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';
import { WorkspaceRole } from '@prisma/client';

const mockPrisma = {
  workspaceMember: {
    findUnique: jest.fn(),
  },
};

const mockReflector = {
  getAllAndOverride: jest.fn(),
};

function buildContext(overrides: {
  roles?: WorkspaceRole[];
  userId?: string;
  params?: Record<string, string>;
}): ExecutionContext {
  mockReflector.getAllAndOverride.mockReturnValue(overrides.roles ?? null);
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({
        user: { userId: overrides.userId ?? 'user-1' },
        params: overrides.params ?? { id: 'workspace-1' },
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let guard: RolesGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new RolesGuard(mockReflector as unknown as Reflector, mockPrisma as any);
  });

  it('allows through when no @Roles() decorator is present', async () => {
    const ctx = buildContext({ roles: undefined });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('allows an OWNER to access an OWNER-only route', async () => {
    mockPrisma.workspaceMember.findUnique.mockResolvedValue({ role: WorkspaceRole.OWNER });
    const ctx = buildContext({ roles: [WorkspaceRole.OWNER] });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('allows an OWNER to access an OWNER/ADMIN route', async () => {
    mockPrisma.workspaceMember.findUnique.mockResolvedValue({ role: WorkspaceRole.OWNER });
    const ctx = buildContext({ roles: [WorkspaceRole.OWNER, WorkspaceRole.ADMIN] });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('allows an ADMIN to access an OWNER/ADMIN route', async () => {
    mockPrisma.workspaceMember.findUnique.mockResolvedValue({ role: WorkspaceRole.ADMIN });
    const ctx = buildContext({ roles: [WorkspaceRole.OWNER, WorkspaceRole.ADMIN] });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('throws 403 when a MEMBER tries to access an OWNER-only route', async () => {
    mockPrisma.workspaceMember.findUnique.mockResolvedValue({ role: WorkspaceRole.MEMBER });
    const ctx = buildContext({ roles: [WorkspaceRole.OWNER] });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('throws 403 when a MEMBER tries to access an OWNER/ADMIN route', async () => {
    mockPrisma.workspaceMember.findUnique.mockResolvedValue({ role: WorkspaceRole.MEMBER });
    const ctx = buildContext({ roles: [WorkspaceRole.OWNER, WorkspaceRole.ADMIN] });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('throws 404 when user is not a workspace member', async () => {
    mockPrisma.workspaceMember.findUnique.mockResolvedValue(null);
    const ctx = buildContext({ roles: [WorkspaceRole.OWNER] });
    await expect(guard.canActivate(ctx)).rejects.toThrow(NotFoundException);
  });

  it('throws 403 when workspaceId param is missing', async () => {
    mockPrisma.workspaceMember.findUnique.mockResolvedValue({ role: WorkspaceRole.OWNER });
    const ctx = buildContext({ roles: [WorkspaceRole.OWNER], params: {} });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('resolves workspaceId from :workspaceId param (channels controller pattern)', async () => {
    mockPrisma.workspaceMember.findUnique.mockResolvedValue({ role: WorkspaceRole.ADMIN });
    const ctx = buildContext({
      roles: [WorkspaceRole.OWNER, WorkspaceRole.ADMIN],
      params: { workspaceId: 'workspace-99' },
    });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(mockPrisma.workspaceMember.findUnique).toHaveBeenCalledWith({
      where: { userId_workspaceId: { userId: 'user-1', workspaceId: 'workspace-99' } },
      select: { role: true },
    });
  });
});
