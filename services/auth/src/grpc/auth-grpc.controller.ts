import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { PrismaService } from '../prisma/prisma.service';
import { hashApiKey } from '../auth/api-key.util';

interface ValidateApiKeyRequest {
  api_key: string;
}

interface ValidateApiKeyResponse {
  valid: boolean;
  project_id?: string;
  project_name?: string;
  organization_id?: string;
  key_type?: string;
  error?: string;
}

@Controller()
export class AuthGrpcController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Internal gRPC RPC used by the ingestion service (and query-api) to validate
   * an API key and resolve the owning project without ever sending the raw key
   * across the wire — the key hash is recomputed locally and matched.
   */
  @GrpcMethod('Auth', 'ValidateApiKey')
  async validateApiKey(
    req: ValidateApiKeyRequest,
  ): Promise<ValidateApiKeyResponse> {
    if (!req?.api_key) {
      return { valid: false, error: 'missing_api_key' };
    }
    const key = await this.prisma.apiKey.findUnique({
      where: { keyHash: hashApiKey(req.api_key) },
      include: { project: { include: { organization: true } } },
    });

    if (!key || key.revokedAt) {
      return { valid: false, error: 'invalid_key' };
    }

    // Best-effort usage tracking; never block ingestion on this write.
    this.prisma.apiKey
      .update({
        where: { id: key.id },
        data: { lastUsedAt: new Date() },
      })
      .catch(() => {});

    return {
      valid: true,
      project_id: key.projectId,
      project_name: key.project.name,
      organization_id: key.project.organizationId,
      key_type: key.type,
    };
  }
}
