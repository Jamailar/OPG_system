import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { DatabaseModule } from '../../config/database.module';
import { PlatformObservabilityService } from './platform-observability.service';
import { PlatformObservabilityRetentionService } from './platform-observability-retention.service';
import { PlatformRequestContextMiddleware } from './platform-request-context.middleware';
import { PlatformRequestContextService } from './platform-request-context.service';
import { AdminNotificationsModule } from '../admin-notifications/admin-notifications.module';

@Global()
@Module({
  imports: [DatabaseModule, AdminNotificationsModule],
  providers: [
    PlatformRequestContextService,
    PlatformRequestContextMiddleware,
    PlatformObservabilityService,
    PlatformObservabilityRetentionService,
  ],
  exports: [PlatformRequestContextService, PlatformRequestContextMiddleware, PlatformObservabilityService],
})
export class ObservabilityModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(PlatformRequestContextMiddleware).forRoutes('*');
  }
}
