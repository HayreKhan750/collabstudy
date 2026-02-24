import { SetMetadata } from '@nestjs/common';
import { WorkspaceRole } from '@prisma/client';

/**
 * Metadata key used by RolesGuard to read the required roles.
 */
export const ROLES_KEY = 'roles';

/**
 * @Roles(...roles) — declare the minimum workspace role(s) required to
 * access a route.
 *
 * Usage:
 *   @Roles(WorkspaceRole.OWNER)
 *   @Roles(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
 *
 * The guard resolves the caller's role from the workspace identified by
 * the :workspaceId or :id route parameter and throws 403 if they don't
 * hold one of the listed roles.
 */
export const Roles = (...roles: WorkspaceRole[]) => SetMetadata(ROLES_KEY, roles);
