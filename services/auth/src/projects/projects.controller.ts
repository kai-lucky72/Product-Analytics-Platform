import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-auth.guard';
import type { CreateApiKeyDto, CreateProjectDto } from './dto';

@Controller()
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get('projects')
  list(@CurrentUser() user: JwtPayload) {
    return this.projects.listProjects(user.sub, user.orgId);
  }

  @Post('projects')
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateProjectDto) {
    return this.projects.createProject(user.sub, user.orgId, dto);
  }

  @Get('projects/:projectId/api-keys')
  listKeys(@CurrentUser() user: JwtPayload, @Param('projectId') projectId: string) {
    return this.projects.listApiKeys(user.sub, projectId);
  }

  @Post('projects/:projectId/api-keys')
  createKey(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Body() dto: CreateApiKeyDto,
  ) {
    return this.projects.createApiKey(user.sub, projectId, dto);
  }

  @Delete('api-keys/:apiKeyId')
  revokeKey(@CurrentUser() user: JwtPayload, @Param('apiKeyId') apiKeyId: string) {
    return this.projects.revokeApiKey(user.sub, apiKeyId);
  }
}
