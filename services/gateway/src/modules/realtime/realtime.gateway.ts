import { Inject, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { ConnectedSocket, MessageBody, OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { createAdapter } from '@socket.io/redis-adapter';
import { PrismaClient } from '@prisma/client';
import IORedis from 'ioredis';
import type { Server, Socket } from 'socket.io';
import configuration from '../../config/configuration';
import { PRISMA_CLIENT } from '../../config/database.module';
import { AppApiKeysService } from '../api-keys/app-api-keys.service';
import { AuthService } from '../auth/auth.service';
import { DeveloperAuthorizationService } from '../developer-sdk/developer-authorization.service';
import { RealtimeEventsService } from './realtime-events.service';

const MAX_SUBSCRIPTIONS_PER_CONNECTION = 64;

function normalizeToken(value: unknown): string | null {
  const token = String(value || '').trim();
  if (!token) return null;
  return token.toLowerCase().startsWith('bearer ') ? token.slice(7).trim() || null : token;
}

@WebSocketGateway({
  namespace: '/realtime',
  cors: { origin: true, credentials: true },
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);
  private pubClient: IORedis | null = null;
  private subClient: IORedis | null = null;

  @WebSocketServer()
  server!: Server;

  constructor(
    @Inject(configuration.KEY) private readonly config: ConfigType<typeof configuration>,
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly authService: AuthService,
    private readonly appApiKeysService: AppApiKeysService,
    private readonly developerAuthorizationService: DeveloperAuthorizationService,
    private readonly realtimeEventsService: RealtimeEventsService,
  ) {}

  async afterInit(server: Server) {
    this.realtimeEventsService.attachServer(server);
    const redisUrl = String(this.config.redis.url || process.env.REDIS_URL || '').trim();
    if (!redisUrl) {
      this.realtimeEventsService.setRedisAdapterStatus(false, 'REDIS_URL is not configured');
      return;
    }
    try {
      this.pubClient = new IORedis(redisUrl, { maxRetriesPerRequest: null, lazyConnect: true });
      this.subClient = this.pubClient.duplicate({ lazyConnect: true });
      await Promise.all([this.pubClient.connect(), this.subClient.connect()]);
      server.adapter(createAdapter(this.pubClient, this.subClient));
      this.realtimeEventsService.setRedisAdapterStatus(true);
    } catch (error: any) {
      this.realtimeEventsService.setRedisAdapterStatus(false, String(error?.message || error).slice(0, 500));
      this.logger.warn(`realtime redis adapter unavailable; using in-memory fanout: ${error?.message || error}`);
      this.pubClient?.disconnect();
      this.subClient?.disconnect();
      this.pubClient = null;
      this.subClient = null;
    }
  }

  async handleConnection(client: Socket) {
    try {
      const actor = await this.authenticate(client);
      client.data.actor = actor;
      client.data.subscriptions = new Set<string>();
      const actorInfo = actor as any;
      client.emit('ready', {
        ok: true,
        actor: {
          user_id: actorInfo?.userId || actorInfo?.id || null,
          role: actorInfo?.role || null,
          auth_mode: actorInfo?.authMode || 'jwt',
          app_slug: actorInfo?.appSlug || null,
        },
      });
    } catch (error: any) {
      client.emit('error', { code: 'AUTH_REQUIRED', message: error?.message || 'Authentication failed' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const subscriptions = client.data.subscriptions as Set<string> | undefined;
    subscriptions?.clear();
  }

  @SubscribeMessage('subscribe')
  async subscribe(@ConnectedSocket() client: Socket, @MessageBody() body: { channel?: string }) {
    const channel = String(body?.channel || '').trim();
    await this.assertChannelAccess(client, channel);
    const subscriptions = client.data.subscriptions as Set<string>;
    if (subscriptions.size >= MAX_SUBSCRIPTIONS_PER_CONNECTION && !subscriptions.has(channel)) {
      return { ok: false, code: 'SUBSCRIPTION_LIMIT', message: `max ${MAX_SUBSCRIPTIONS_PER_CONNECTION} subscriptions per connection` };
    }
    await client.join(channel);
    subscriptions.add(channel);
    return { ok: true, channel };
  }

  @SubscribeMessage('unsubscribe')
  async unsubscribe(@ConnectedSocket() client: Socket, @MessageBody() body: { channel?: string }) {
    const channel = String(body?.channel || '').trim();
    await client.leave(channel);
    (client.data.subscriptions as Set<string> | undefined)?.delete(channel);
    return { ok: true, channel };
  }

  private async authenticate(client: Socket) {
    const token =
      normalizeToken(client.handshake.auth?.token) ||
      normalizeToken(client.handshake.headers?.authorization) ||
      normalizeToken(client.handshake.headers?.['x-opg-api-key']) ||
      normalizeToken(client.handshake.query?.token) ||
      normalizeToken(client.handshake.query?.key);
    if (!token) {
      throw new Error('Authentication required');
    }
    const appHint = String(client.handshake.auth?.app || client.handshake.query?.app || '').trim() || undefined;
    if (token.startsWith('opg_dev_')) {
      return this.developerAuthorizationService.authenticateGrant(token, appHint);
    }
    if (token.startsWith('rbx_')) {
      return this.appApiKeysService.authenticateApiKey(token, appHint);
    }
    return this.authService.verifyAccessToken(token);
  }

  private async assertChannelAccess(client: Socket, channel: string) {
    if (!/^apps\.[a-z0-9_-]+(?:\.|$)/i.test(channel)) {
      throw new Error('Invalid realtime channel');
    }
    const appSlug = channel.split('.')[1];
    const actor = client.data.actor || {};
    if (actor.appSlug && actor.appSlug !== appSlug) {
      throw new Error('Channel belongs to a different app');
    }
    if (String(actor.role || '').toUpperCase() === 'ADMIN' || actor.authMode === 'api_key' || actor.authMode === 'developer_grant') {
      await this.assertAppExists(appSlug);
      return;
    }
    if (!actor.userId && !actor.id) {
      throw new Error('Authenticated app user required');
    }
    await this.assertAppExists(appSlug);
  }

  private async assertAppExists(appSlug: string) {
    const rows = await (this.prisma.$queryRawUnsafe(
      `SELECT id FROM apps WHERE slug = $1 LIMIT 1`,
      appSlug,
    ) as Promise<Array<{ id: string }>>);
    if (!rows[0]) {
      throw new Error('App not found');
    }
  }
}
