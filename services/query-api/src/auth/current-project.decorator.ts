import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { ResolvedProject } from './api-key-resolver.service';

export const CurrentProject = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ResolvedProject => {
    const req = ctx.switchToHttp().getRequest<{ project: ResolvedProject }>();
    return req.project;
  },
);
