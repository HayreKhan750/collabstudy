import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { WorkspaceRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * RolesGuard — Phase 8.5 RBAC Hardening
 *
 * Enforces workspace-level role requirements declared via @Roles().
 * Must be applied AFTER JwtAuthGuard so req.user is populated.
 *
 * It reads the workspaceId from the route parameters (:workspaceId or :id),
 * queries the WorkspaceMember table, and rejects callers whose role is not
 * in the allowed set.
 *
 * For routes where workspaceId is NOT a direct route param (e.g. channel-
 * scoped routes like PATCH /channels/:channelId), do NOT apply this guard —
 * those are protected at the service layer instead.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Get the roles declared by @Roles() on the handler or controller
    const requiredRoles = this.reflector.getAllAndOverride<WorkspaceRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // If no @Roles() decorator is present, allow the request through.
    // Role enforcement is optional — unannotated routes rely on JWT only.
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const userId: string = request.user?.userId;

    if (!userId) {
      throw new ForbiddenException('Authentication required');
    }

    // Support both :workspaceId (channels controller) and :id (workspaces controller)
    const workspaceId: string = request.params?.workspaceId ?? request.params?.id;

    if (!workspaceId) {
      // Guard is misconfigured — no workspaceId param on this route
      throw new ForbiddenException('Cannot determine workspace context for role check');
    }

    const membership = await this.prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
      select: { role: true },
    });

    if (!membership) {
      throw new NotFoundException('Workspace not found or you are not a member');
    }

    if (!requiredRoles.includes(membership.role)) {
      throw new ForbiddenException(
        `This action requires one of the following roles: ${requiredRoles.join(', ')}`,
      );
    }

    return true;
  }
}
