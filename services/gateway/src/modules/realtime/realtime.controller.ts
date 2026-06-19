import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { tenantControllerPaths } from '../../common/utils/controller-paths';
import { RealtimeEventsService } from './realtime-events.service';

@ApiTags('Realtime')
@Controller(tenantControllerPaths('realtime', true))
export class RealtimeController {
  constructor(private readonly realtimeEventsService: RealtimeEventsService) {}

  @Get('status')
  @ApiOperation({ summary: 'Realtime gateway status and fanout backend' })
  status() {
    return this.realtimeEventsService.status();
  }
}
