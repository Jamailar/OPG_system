import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AppApiKeysModule } from '../api-keys/app-api-keys.module';
import { DeveloperSdkAuthGuard } from './developer-sdk-auth.guard';
import { DeveloperSdkController } from './developer-sdk.controller';
import { DeveloperSdkService } from './developer-sdk.service';
import { DeveloperDatabaseService } from './developer-database.service';

@Module({
  imports: [AuthModule, AppApiKeysModule],
  controllers: [DeveloperSdkController],
  providers: [DeveloperSdkService, DeveloperDatabaseService, DeveloperSdkAuthGuard],
  exports: [DeveloperSdkService, DeveloperDatabaseService],
})
export class DeveloperSdkModule {}
