import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { generateApiKey } from './api-key.util';
import type { JwtPayload } from './jwt-auth.guard';
import type { LoginDto, RegisterDto } from './dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const orgName = dto.organizationName ?? `${dto.name}'s Org`;

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        passwordHash,
        memberships: {
          create: {
            role: 'owner',
            organization: {
              create: { name: orgName },
            },
          },
        },
      },
    });

    const membership = await this.prisma.organizationMember.findFirstOrThrow({
      where: { userId: user.id },
      include: { organization: { include: { projects: true } } },
    });

    // Bootstrap a demo project + API keys so the pipeline can be exercised immediately.
    const project = await this.prisma.project.create({
      data: {
        organizationId: membership.organizationId,
        name: 'Demo Project',
      },
    });

    const ingestionKey = generateApiKey(project.id);
    const queryKey = generateApiKey(project.id);

    await this.prisma.apiKey.createMany({
      data: [
        {
          projectId: project.id,
          name: 'Ingestion key',
          type: 'ingestion',
          keyHash: ingestionKey.keyHash,
          keyPrefix: ingestionKey.prefix,
        },
        {
          projectId: project.id,
          name: 'Query key',
          type: 'query',
          keyHash: queryKey.keyHash,
          keyPrefix: queryKey.prefix,
        },
      ],
    });

    const token = await this.sign(user.id, user.email, membership.organizationId);

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        organizationId: membership.organizationId,
        projectId: project.id,
      },
      apiKeys: {
        ingestion: ingestionKey.fullKey,
        query: queryKey.fullKey,
      },
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const membership = await this.prisma.organizationMember.findFirstOrThrow({
      where: { userId: user.id },
    });
    const token = await this.sign(user.id, user.email, membership.organizationId);
    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        organizationId: membership.organizationId,
      },
    };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        memberships: {
          include: {
            organization: {
              include: { projects: true },
            },
          },
        },
      },
    });
    return user;
  }

  private sign(userId: string, email: string, orgId: string): Promise<string> {
    const payload: JwtPayload = { sub: userId, email, orgId };
    return this.jwt.signAsync(payload, { expiresIn: '7d' });
  }
}
