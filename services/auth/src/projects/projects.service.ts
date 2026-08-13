import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { generateApiKey } from '../auth/api-key.util';
import type { CreateApiKeyDto, CreateProjectDto } from './dto';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertMembership(userId: string, orgId: string) {
    const member = await this.prisma.organizationMember.findFirst({
      where: { userId, organizationId: orgId },
    });
    if (!member) {
      throw new ForbiddenException('Not a member of this organization');
    }
  }

  async listProjects(userId: string, orgId: string) {
    await this.assertMembership(userId, orgId);
    return this.prisma.project.findMany({
      where: { organizationId: orgId },
      include: { _count: { select: { apiKeys: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createProject(userId: string, orgId: string, dto: CreateProjectDto) {
    await this.assertMembership(userId, orgId);
    return this.prisma.project.create({
      data: { organizationId: orgId, name: dto.name },
    });
  }

  async listApiKeys(userId: string, projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) throw new NotFoundException('Project not found');
    await this.assertMembership(userId, project.organizationId);
    return this.prisma.apiKey.findMany({
      where: { projectId, revokedAt: null },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        type: true,
        createdAt: true,
        lastUsedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createApiKey(
    userId: string,
    projectId: string,
    dto: CreateApiKeyDto,
  ) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) throw new NotFoundException('Project not found');
    await this.assertMembership(userId, project.organizationId);

    const material = generateApiKey(projectId);
    await this.prisma.apiKey.create({
      data: {
        projectId,
        name: dto.name,
        type: dto.type ?? 'ingestion',
        keyHash: material.keyHash,
        keyPrefix: material.prefix,
      },
    });
    return { fullKey: material.fullKey, prefix: material.prefix };
  }

  async revokeApiKey(userId: string, apiKeyId: string) {
    const key = await this.prisma.apiKey.findUnique({
      where: { id: apiKeyId },
      include: { project: true },
    });
    if (!key) throw new NotFoundException('API key not found');
    await this.assertMembership(userId, key.project.organizationId);
    if (key.revokedAt) {
      throw new BadRequestException('API key already revoked');
    }
    return this.prisma.apiKey.update({
      where: { id: apiKeyId },
      data: { revokedAt: new Date() },
    });
  }
}
