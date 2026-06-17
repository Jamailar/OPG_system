import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaClient } from '@prisma/client';
import { PRISMA_CLIENT } from '../../config/database.module';
import {
  PLATFORM_AUDIT_EVENT_RETENTION_DAYS,
  PLATFORM_OBSERVABILITY_RETENTION_BATCH_SIZE,
  PLATFORM_REQUEST_EVENT_RETENTION_DAYS,
} from './platform-observability.constants';
import { PlatformObservabilityService } from './platform-observability.service';

@Injectable()
export class PlatformObservabilityRetentionService {
  private readonly logger = new Logger(PlatformObservabilityRetentionService.name);

  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly observability: PlatformObservabilityService,
  ) {}

  @Cron('17 * * * *')
  async pruneExpiredPlatformObservabilityEvents() {
    try {
      if (!(await this.observability.isSchemaReady())) {
        return;
      }
      const [requestRows, auditRows] = await Promise.all([
        this.deleteExpiredRows('platform_request_events', PLATFORM_REQUEST_EVENT_RETENTION_DAYS),
        this.deleteExpiredRows('platform_audit_events', PLATFORM_AUDIT_EVENT_RETENTION_DAYS),
      ]);
      const deletedRequests = Number(requestRows[0]?.deleted_count || 0);
      const deletedAudits = Number(auditRows[0]?.deleted_count || 0);
      if (deletedRequests > 0 || deletedAudits > 0) {
        this.logger.log(`pruned platform observability events: requests=${deletedRequests}, audits=${deletedAudits}`);
      }
    } catch (error: any) {
      this.logger.warn(`failed to prune platform observability events: ${error?.message || error}`);
    }
  }

  private deleteExpiredRows(tableName: 'platform_request_events' | 'platform_audit_events', retentionDays: number) {
    return this.prisma.$queryRawUnsafe(
      `WITH deleted AS (
         DELETE FROM ${tableName}
          WHERE id IN (
            SELECT id
              FROM ${tableName}
             WHERE created_at < now() - ($1::int * interval '1 day')
             ORDER BY created_at ASC
             LIMIT $2
          )
          RETURNING 1
       )
       SELECT COUNT(*)::bigint AS deleted_count FROM deleted`,
      retentionDays,
      PLATFORM_OBSERVABILITY_RETENTION_BATCH_SIZE,
    ) as Promise<Array<{ deleted_count: string | number }>>;
  }
}
