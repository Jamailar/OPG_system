import { Injectable, Logger } from '@nestjs/common';
import type { Server } from 'socket.io';

export type RealtimeEnvelope = {
  id: string;
  channel: string;
  event: string;
  app_id?: string | null;
  app_slug?: string | null;
  resource_id?: string | null;
  payload: Record<string, unknown>;
  created_at: string;
};

@Injectable()
export class RealtimeEventsService {
  private readonly logger = new Logger(RealtimeEventsService.name);
  private server: Server | null = null;
  private redisAdapter: { enabled: boolean; error: string | null } = { enabled: false, error: null };

  attachServer(server: Server) {
    this.server = server;
  }

  setRedisAdapterStatus(enabled: boolean, error: string | null = null) {
    this.redisAdapter = { enabled, error };
  }

  status() {
    return {
      socket_io: Boolean(this.server),
      fanout: this.redisAdapter.enabled ? 'redis' : 'memory',
      redis_adapter_enabled: this.redisAdapter.enabled,
      redis_adapter_error: this.redisAdapter.error,
    };
  }

  async publish(channel: string, event: string, payload: Record<string, unknown>, meta: Partial<RealtimeEnvelope> = {}) {
    const envelope: RealtimeEnvelope = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      channel,
      event,
      app_id: meta.app_id || null,
      app_slug: meta.app_slug || null,
      resource_id: meta.resource_id || null,
      payload,
      created_at: new Date().toISOString(),
    };
    if (!this.server) {
      this.logger.warn(`realtime publish dropped before socket server ready: ${channel}/${event}`);
      return { delivered: false, envelope };
    }
    this.server.to(channel).emit(event, envelope);
    this.server.to(channel).emit('opg.event', envelope);
    return { delivered: true, envelope };
  }

  async publishDataEvent(input: {
    appId: string;
    appSlug: string;
    table: string;
    event: 'row.created' | 'row.updated' | 'row.deleted';
    rowId: unknown;
    changedFields?: string[];
  }) {
    return this.publish(
      `apps.${input.appSlug}.data.${input.table}`,
      input.event,
      {
        table: input.table,
        row_id: input.rowId ?? null,
        changed_fields: input.changedFields || [],
      },
      {
        app_id: input.appId,
        app_slug: input.appSlug,
        resource_id: typeof input.rowId === 'string' ? input.rowId : null,
      },
    );
  }
}
