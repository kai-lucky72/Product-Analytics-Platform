import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiKeyResolverService, type ResolvedProject } from './api-key-resolver.service';

export interface RequestWithProject {
  project: ResolvedProject;
  headers: Record<string, string | string[] | undefined>;
  [key: string]: unknown;
}

@Injectable()
export class QueryKeyGuard implements CanActivate {
  constructor(private readonly resolver: ApiKeyResolverService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithProject>();
    const header = req.headers['authorization'] as string | undefined;
    const apiKey = header?.startsWith('Bearer ')
      ? header.slice('Bearer '.length)
      : (req.headers['x-api-key'] as string | undefined);

    if (!apiKey) {
      throw new UnauthorizedException('Missing API key');
    }

    const project = await this.resolver.resolve(apiKey);
    if (!project) {
      throw new UnauthorizedException('Invalid API key');
    }
    req.project = project;
    return true;
  }
}
