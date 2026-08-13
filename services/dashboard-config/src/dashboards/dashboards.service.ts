import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateDashboardDto,
  CreatePanelDto,
  UpdateDashboardDto,
  UpdatePanelDto,
} from './dto';

@Injectable()
export class DashboardsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(projectId: string) {
    return this.prisma.dashboard.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { panels: true } } },
    });
  }

  async get(id: string) {
    const dashboard = await this.prisma.dashboard.findUnique({
      where: { id },
      include: { panels: { orderBy: { position: 'asc' } } },
    });
    if (!dashboard) throw new NotFoundException('Dashboard not found');
    return {
      ...dashboard,
      panels: dashboard.panels.map((p) => ({
        ...p,
        config: safeJson(p.config),
      })),
    };
  }

  async create(dto: CreateDashboardDto) {
    return this.prisma.dashboard.create({
      data: { projectId: dto.project_id, name: dto.name, description: dto.description },
    });
  }

  async update(id: string, dto: UpdateDashboardDto) {
    await this.assertExists(id);
    return this.prisma.dashboard.update({ where: { id }, data: dto });
  }

  async remove(id: string): Promise<void> {
    await this.assertExists(id);
    await this.prisma.dashboard.delete({ where: { id } });
  }

  async createPanel(dashboardId: string, dto: CreatePanelDto) {
    await this.assertExists(dashboardId);
    return this.prisma.panel.create({
      data: {
        dashboardId,
        type: dto.type,
        title: dto.title,
        config: JSON.stringify(dto.config ?? {}),
        position: dto.position ?? 0,
        width: dto.width ?? 12,
        height: dto.height ?? 6,
      },
    });
  }

  async updatePanel(panelId: string, dto: UpdatePanelDto) {
    const panel = await this.prisma.panel.findUnique({ where: { id: panelId } });
    if (!panel) throw new NotFoundException('Panel not found');
    const data: Record<string, unknown> = { ...dto };
    if (dto.config !== undefined) data.config = JSON.stringify(dto.config);
    return this.prisma.panel.update({ where: { id: panelId }, data });
  }

  async removePanel(panelId: string): Promise<void> {
    const panel = await this.prisma.panel.findUnique({ where: { id: panelId } });
    if (!panel) throw new NotFoundException('Panel not found');
    await this.prisma.panel.delete({ where: { id: panelId } });
  }

  private async assertExists(id: string) {
    const d = await this.prisma.dashboard.findUnique({ where: { id } });
    if (!d) throw new NotFoundException('Dashboard not found');
  }
}

const safeJson = (s: string | null): Record<string, unknown> => {
  if (!s) return {};
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
};
