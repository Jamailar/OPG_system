import { Module } from '@nestjs/common';
import { AppApiKeysModule } from '../api-keys/app-api-keys.module';
import { AuthModule } from '../auth/auth.module';
import { DeveloperAuthorizationModule } from '../developer-sdk/developer-authorization.module';
import { RealtimeController } from './realtime.controller';
import { RealtimeEventsService } from './realtime-events.service';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  imports: [AuthModule, AppApiKeysModule, DeveloperAuthorizationModule],
  controllers: [RealtimeController],
  providers: [RealtimeGateway, RealtimeEventsService],
  exports: [RealtimeEventsService],
})
export class RealtimeModule {}
