import { Module } from '@nestjs/common';
import { AdminRoleGuard } from '../../common/guards/admin-role.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PlatformAdminAccessGuard } from '../../common/guards/platform-admin-access.guard';
import { AiChatModule } from '../ai-chat/ai-chat.module';
import { AppSchemaModule } from '../app-schema/app-schema.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { UploadModule } from '../upload/upload.module';
import { AppBlocksPlatformController } from './app-blocks-platform.controller';
import { AppBlocksService } from './app-blocks.service';

@Module({
  imports: [AppSchemaModule, AiChatModule, UploadModule, RealtimeModule],
  controllers: [AppBlocksPlatformController],
  providers: [AppBlocksService, JwtAuthGuard, AdminRoleGuard, PlatformAdminAccessGuard],
  exports: [AppBlocksService],
})
export class AppBlocksModule {}
