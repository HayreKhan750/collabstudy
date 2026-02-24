import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Request, HttpCode, HttpStatus } from '@nestjs/common';
import { IsString, MinLength, MaxLength } from 'class-validator';
import { WorkspaceRole } from '@prisma/client';

class RenameWorkspaceDto {
  @IsString() @MinLength(1) @MaxLength(100)
  name: string;
}
import { WorkspacesService } from './workspaces.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('workspaces')
@UseGuards(JwtAuthGuard)
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  /**
   * POST /workspaces
   * Create a new workspace (with class-validator DTOs)
   * Automatically adds creator as OWNER in WorkspaceMember table
   */
  @Post()
  create(@Request() req: any, @Body() createWorkspaceDto: CreateWorkspaceDto) {
    return this.workspacesService.create(req.user.userId, createWorkspaceDto);
  }

  /**
   * GET /workspaces
   * Get all workspaces the authenticated user is a member of
   */
  @Get()
  findAll(@Request() req: any) {
    return this.workspacesService.findAllForUser(req.user.userId);
  }

  /**
   * GET /workspaces/discover
   * Returns all public workspaces the user is NOT yet a member of
   */
  @Get('discover')
  discover(@Request() req: any) {
    return this.workspacesService.discoverWorkspaces(req.user.userId);
  }

  /**
   * POST /workspaces/:id/join
   * Adds the calling user as a MEMBER of the given workspace
   */
  @Post(':id/join')
  join(@Request() req: any, @Param('id') workspaceId: string) {
    return this.workspacesService.joinWorkspace(req.user.userId, workspaceId);
  }

  /**
   * PATCH /workspaces/:id
   * Rename a workspace (OWNER only)
   */
  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(WorkspaceRole.OWNER)
  renameWorkspace(@Request() req: any, @Param('id') id: string, @Body() dto: RenameWorkspaceDto) {
    return this.workspacesService.renameWorkspace(req.user.userId, id, dto.name);
  }

  /**
   * DELETE /workspaces/:id
   * Delete a workspace (OWNER only)
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles(WorkspaceRole.OWNER)
  deleteWorkspace(@Request() req: any, @Param('id') id: string) {
    return this.workspacesService.deleteWorkspace(req.user.userId, id);
  }
}
