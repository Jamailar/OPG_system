import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

export type PlatformRequestContext = {
  request_id: string;
  trace_id: string | null;
  method: string;
  path: string;
  started_at: number;
};

@Injectable()
export class PlatformRequestContextService {
  private readonly storage = new AsyncLocalStorage<PlatformRequestContext>();

  run<T>(context: PlatformRequestContext, callback: () => T): T {
    return this.storage.run(context, callback);
  }

  get(): PlatformRequestContext | null {
    return this.storage.getStore() || null;
  }

  getRequestId(): string | null {
    return this.get()?.request_id || null;
  }
}
