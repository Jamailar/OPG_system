import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminRoleGuard } from '../../common/guards/admin-role.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PlatformAdminAccessGuard } from '../../common/guards/platform-admin-access.guard';
import { tenantControllerPaths } from '../../common/utils/controller-paths';
import { AppBlocksService } from './app-blocks.service';

@ApiTags('AppBlocks')
@Controller(tenantControllerPaths('platform-admin', true))
@UseGuards(JwtAuthGuard, AdminRoleGuard, PlatformAdminAccessGuard)
@ApiBearerAuth()
export class AppBlocksPlatformController {
  constructor(private readonly appBlocksService: AppBlocksService) {}

  @Post('apps/:app_id/blocks/ai')
  @ApiOperation({ summary: 'Create or update an app AI block' })
  upsertAiBlock(@Param('app_id') appId: string, @Body() body: Record<string, unknown>) {
    return this.appBlocksService.upsertAiBlock(appId, body || {});
  }

  @Post('apps/:app_id/blocks/video')
  @ApiOperation({ summary: 'Create or update an app video block' })
  upsertVideoBlock(@Param('app_id') appId: string, @Body() body: Record<string, unknown>) {
    return this.appBlocksService.upsertVideoBlock(appId, body || {});
  }

  @Post('apps/:app_id/blocks/ai/:block/run')
  @ApiOperation({ summary: 'Run an app AI block' })
  runAiBlock(@Req() req: any, @Param('app_id') appId: string, @Param('block') block: string, @Body() body: Record<string, unknown>) {
    return this.appBlocksService.runAiBlock(appId, block, req.user, body?.input && typeof body.input === 'object' ? body.input as Record<string, unknown> : body || {});
  }

  @Post('apps/:app_id/blocks/video/:block/run')
  @ApiOperation({ summary: 'Run an app video block' })
  runVideoBlock(@Req() req: any, @Param('app_id') appId: string, @Param('block') block: string, @Body() body: Record<string, unknown>) {
    return this.appBlocksService.runVideoBlock(appId, block, req.user, body?.input && typeof body.input === 'object' ? body.input as Record<string, unknown> : body || {});
  }

  @Post('apps/:app_id/storage/save')
  @ApiOperation({ summary: 'Save a small app storage object' })
  saveStorageObject(@Req() req: any, @Param('app_id') appId: string, @Body() body: Record<string, unknown>) {
    return this.appBlocksService.saveStorageObject(appId, req.user, body || {});
  }
}
