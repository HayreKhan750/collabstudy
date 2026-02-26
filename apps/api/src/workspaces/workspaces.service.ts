import { Injectable, ConflictException, ForbiddenException, forwardRef, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { WorkspaceRole } from '@prisma/client';
import { ChatGateway } from '../chat/chat.gateway';

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => ChatGateway))
    private readonly chatGateway: ChatGateway,
  ) {}

  /**
   * Create a new workspace and automatically add the creator as OWNER
   */
  async create(userId: string, createWorkspaceDto: CreateWorkspaceDto) {
    return this.prisma.workspace.create({
      data: {
        name: createWorkspaceDto.name,
        ownerId: userId,
        // Automatically create WorkspaceMember with OWNER role
        members: {
          create: {
            userId: userId,
            role: WorkspaceRole.OWNER,
          },
        },
      },
      include: {
        owner: {
          select: {
            id: true,
            email: true,
            username: true,
            fullName: true,
            avatar: true,
          },
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                username: true,
                fullName: true,
                avatar: true,
              },
            },
          },
        },
        channels: true,
      },
    });
  }

  /**
   * Get all workspaces the user is a member of
   */
  async findAllForUser(userId: string) {
    return this.prisma.workspace.findMany({
      where: {
        members: {
          some: {
            userId: userId,
          },
        },
      },
      include: {
        owner: {
          select: {
            id: true,
            email: true,
            username: true,
            fullName: true,
            avatar: true,
          },
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                avatar: true,
              },
            },
          },
        },
        channels: {
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });
  }

  /**
   * GET /workspaces/discover
   * Returns all public workspaces the user is NOT yet a member of
   */
  async discoverWorkspaces(userId: string) {
    return this.prisma.workspace.findMany({
      where: {
        isPublic: true,
        members: {
          none: {
            userId: userId,
          },
        },
      },
      include: {
        owner: {
          select: {
            id: true,
            username: true,
            fullName: true,
            avatar: true,
          },
        },
        _count: {
          select: { members: true },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * PATCH /workspaces/:id
   * Rename a workspace (OWNER only)
   */
  async renameWorkspace(userId: string, workspaceId: string, name: string) {
    const membership = await this.prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
    });
    if (!membership || membership.role !== 'OWNER') {
      throw new ForbiddenException('Only the workspace owner can rename it');
    }
    const updated = await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: { name },
    });
    this.chatGateway.emitWorkspaceUpdated(workspaceId, updated);
    return updated;
  }

  /**
   * DELETE /workspaces/:id
   * Delete a workspace (OWNER only)
   */
  async deleteWorkspace(userId: string, workspaceId: string) {
    const membership = await this.prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
    });
    if (!membership || membership.role !== 'OWNER') {
      throw new ForbiddenException('Only the workspace owner can delete it');
    }
    await this.prisma.workspace.delete({ where: { id: workspaceId } });
    this.chatGateway.emitWorkspaceDeleted(workspaceId);
    return { success: true, workspaceId };
  }

  /**
   * POST /workspaces/:id/leave
   * Removes the calling user from the workspace (non-OWNERs only).
   * OWNERs must transfer ownership or delete the workspace instead.
   */
  async leaveWorkspace(userId: string, workspaceId: string) {
    const membership = await this.prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
    });
    if (!membership) throw new ForbiddenException('You are not a member of this workspace');
    if (membership.role === 'OWNER') {
      throw new ForbiddenException('The owner cannot leave the workspace. Transfer ownership or delete it instead.');
    }
    await this.prisma.workspaceMember.delete({
      where: { userId_workspaceId: { userId, workspaceId } },
    });
    return { success: true, workspaceId };
  }

  /**
   * POST /workspaces/:id/join
   * Adds the calling user as a MEMBER of the workspace
   */
  async joinWorkspace(userId: string, workspaceId: string) {
    // Check workspace exists and is public
    const workspace = await this.prisma.workspace.findFirst({
      where: { id: workspaceId, isPublic: true },
    });

    if (!workspace) {
      throw new ConflictException('Workspace not found or is not public');
    }

    // Check if user is already a member
    const existing = await this.prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: { userId, workspaceId },
      },
    });

    if (existing) {
      throw new ConflictException('You are already a member of this workspace');
    }

    // Create the membership
    await this.prisma.workspaceMember.create({
      data: {
        userId,
        workspaceId,
        role: WorkspaceRole.MEMBER,
      },
    });

    // Fetch the joining user's username for the broadcast payload
    const joiningUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true },
    });

    // Broadcast to all currently connected workspace members
    if (joiningUser) {
      this.chatGateway.emitUserJoinedWorkspace(workspaceId, {
        userId: joiningUser.id,
        username: joiningUser.username,
      });
    }

    // Return the full workspace so the frontend can add it to the sidebar
    return this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        owner: {
          select: {
            id: true,
            email: true,
            username: true,
            fullName: true,
            avatar: true,
          },
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                avatar: true,
              },
            },
          },
        },
        channels: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }
}
