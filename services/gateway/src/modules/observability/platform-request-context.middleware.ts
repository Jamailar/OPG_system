import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { PlatformRequestContextService } from './platform-request-context.service';

@Injectable()
export class PlatformRequestContextMiddleware implements NestMiddleware {
  constructor(private readonly context: PlatformRequestContextService) {}

  use(req: Request & { requestId?: string; traceId?: string | null }, res: Response, next: NextFunction) {
    const requestId = this.normalizeHeader(req.headers['x-request-id']) || randomUUID();
    const traceId = this.extractTraceId(req.headers.traceparent) || null;
    const requestPath = String(req.originalUrl || req.url || '').split('?')[0] || '/';

    req.requestId = requestId;
    req.traceId = traceId;
    res.setHeader('x-request-id', requestId);
    if (traceId) {
      res.setHeader('x-trace-id', traceId);
    }

    this.context.run(
      {
        request_id: requestId,
        trace_id: traceId,
        method: String(req.method || '').toUpperCase(),
        path: requestPath,
        started_at: Date.now(),
      },
      next,
    );
  }

  private normalizeHeader(value: unknown): string {
    const raw = Array.isArray(value) ? value[0] : value;
    const normalized = String(raw || '').trim();
    if (!normalized || normalized.length > 128) {
      return '';
    }
    return normalized.replace(/[^a-zA-Z0-9_.:-]/g, '').slice(0, 128);
  }

  private extractTraceId(value: unknown): string {
    const raw = this.normalizeHeader(value);
    const match = raw.match(/^[\da-f]{2}-([\da-f]{32})-[\da-f]{16}-[\da-f]{2}$/i);
    return match?.[1] || '';
  }
}
