import { Global, Module } from '@nestjs/common';
import { ApiKeyResolverService } from './api-key-resolver.service';
import { QueryKeyGuard } from './query-key.guard';

@Global()
@Module({
  providers: [ApiKeyResolverService, QueryKeyGuard],
  exports: [ApiKeyResolverService, QueryKeyGuard],
})
export class AuthModule {}
