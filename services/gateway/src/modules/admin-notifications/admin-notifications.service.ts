import { BadRequestException, Inject, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { PRISMA_CLIENT } from '../../config/database.module';
import { EmailDeliveryService } from '../email-delivery/email-delivery.service';
import {
  AdminNotificationChannelType,
  AdminNotificationEmitInput,
  AdminNotificationListQuery,
  AdminNotificationSeverity,
} from './admin-notifications.types';

type Row = Record<string, any>;

const CHANNEL_TYPES: AdminNotificationChannelType[] = ['FEISHU_ROBOT', 'EMAIL'];
const SEVERITY_ORDER: Record<AdminNotificationSeverity, number> = {
  info: 10,
  warning: 20,
  high: 30,
  critical: 40,
};
const EVENT_CATALOG = [
  { event_type: 'feedback.created', label: '新反馈', min_severity: 'info' },
  { event_type: 'feedback.bug_report.created', label: '故障反馈', min_severity: 'high' },
  { event_type: 'platform_task.failed', label: '后台任务失败', min_severity: 'high' },
  { event_type: 'ai.provider.failed', label: 'AI 供应商失败', min_severity: 'high' },
  { event_type: 'ai.quota_or_auth.failed', label: 'AI 额度或鉴权失败', min_severity: 'high' },
  { event_type: 'video.task.failed', label: '视频任务失败', min_severity: 'high' },
  { event_type: 'payment.callback.failed', label: '支付回调失败', min_severity: 'critical' },
  { event_type: 'system.error_rate.high', label: '系统错误率升高', min_severity: 'critical' },
  { event_type: 'worker.offline', label: '工作器离线', min_severity: 'high' },
] as const;
const DELIVERY_BATCH_SIZE = 25;
const MAX_DELIVERY_ATTEMPTS = 4;

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

@Injectable()
export class AdminNotificationsService implements OnModuleInit {
  private readonly logger = new Logger(AdminNotificationsService.name);
  private schemaReady = false;
  private schemaPromise: Promise<void> | null = null;
  private processing = false;

  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly emailDeliveryService: EmailDeliveryService,
  ) {}

  async onModuleInit() {
    try {
      await this.ensureSchema();
    } catch (error: any) {
      this.logger.warn(`admin notifications schema warmup failed: ${error?.message || error}`);
    }
  }

  eventCatalog() {
    return { items: EVENT_CATALOG };
  }

  async listChannels(query: AdminNotificationListQuery = {}) {
    await this.ensureSchema();
    const appId = this.optionalUuid(query.app_id);
    const channelType = query.channel_type ? this.normalizeChannelType(query.channel_type) : null;
    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT c.*, a.slug AS app_slug, a.name AS app_name
      FROM admin_notification_channels c
      LEFT JOIN apps a ON a.id = c.app_id
      WHERE (${appId}::uuid IS NULL OR c.app_id = ${appId}::uuid)
        AND (${channelType}::text IS NULL OR c.channel_type = ${channelType})
        AND c.status <> 'DELETED'
      ORDER BY c.app_id NULLS FIRST, c.updated_at DESC
    `;
    return { items: rows.map((row) => this.serializeChannel(row)) };
  }

  async createChannel(actorUserId: string | null | undefined, payload: unknown, appIdFromPath?: string | null) {
    await this.ensureSchema();
    const body = asObject(payload);
    const appId = this.optionalUuid(appIdFromPath || body.app_id);
    if (appId) await this.requireApp(appId);
    const channelType = this.normalizeChannelType(body.channel_type || body.channelType);
    const name = this.requiredString(body.name, 'name', 120);
    const status = this.normalizeStatus(body.status);
    const normalized = await this.normalizeChannelPayload(channelType, body);
    const rows = await this.prisma.$queryRaw<Row[]>`
      INSERT INTO admin_notification_channels (
        app_id, channel_type, name, status, config_json, secret_ciphertext, created_by_user_id, created_at, updated_at
      )
      VALUES (
        ${appId}::uuid, ${channelType}, ${name}, ${status}, ${JSON.stringify(normalized.config)}::jsonb,
        ${normalized.secret ? this.encryptSecretJson(normalized.secret) : null}, ${this.optionalUuid(actorUserId)}::uuid, now(), now()
      )
      RETURNING *
    `;
    return { item: this.serializeChannel(rows[0]) };
  }

  async updateChannel(channelId: string, payload: unknown) {
    await this.ensureSchema();
    const id = this.requiredUuid(channelId, 'channel_id');
    const current = await this.getChannelRow(id);
    const body = asObject(payload);
    const channelType = this.normalizeChannelType(body.channel_type || body.channelType || current.channel_type);
    const name = body.name === undefined ? current.name : this.requiredString(body.name, 'name', 120);
    const status = body.status === undefined ? current.status : this.normalizeStatus(body.status);
    const normalized = await this.normalizeChannelPayload(channelType, body, current);
    const rows = await this.prisma.$queryRaw<Row[]>`
      UPDATE admin_notification_channels
      SET channel_type = ${channelType},
          name = ${name},
          status = ${status},
          config_json = ${JSON.stringify(normalized.config)}::jsonb,
          secret_ciphertext = ${normalized.secret ? this.encryptSecretJson(normalized.secret) : current.secret_ciphertext},
          updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING *
    `;
    return { item: this.serializeChannel(rows[0]) };
  }

  async deleteChannel(channelId: string) {
    await this.ensureSchema();
    const id = this.requiredUuid(channelId, 'channel_id');
    await this.prisma.$executeRaw`
      UPDATE admin_notification_channels
      SET status = 'DELETED', updated_at = now()
      WHERE id = ${id}::uuid
    `;
    return { deleted: true };
  }

  async testChannel(channelId: string, payload: unknown = {}) {
    await this.ensureSchema();
    const channel = await this.getChannelRow(this.requiredUuid(channelId, 'channel_id'));
    if (String(channel.status) !== 'ACTIVE') throw new BadRequestException('notification channel is not active');
    const body = asObject(payload);
    const title = this.optionalString(body.title, 160) || 'OPG 通知测试';
    const message = this.optionalString(body.message, 1000) || '这是一条管理员通知测试。';
    const item = {
      id: 'test',
      app_id: channel.app_id || null,
      app_slug: null,
      app_name: null,
      event_type: 'notification.test',
      severity: 'info',
      title,
      message,
      source_module: 'admin_notifications',
      source_id: 'test',
      payload_json: { test: true },
      channel_type: channel.channel_type,
      config_json: channel.config_json,
      secret_ciphertext: channel.secret_ciphertext,
    };
    const result = await this.dispatchToChannel(item);
    return { ok: true, result };
  }

  async listRules(appId?: string | null) {
    await this.ensureSchema();
    const normalizedAppId = this.optionalUuid(appId);
    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT *
      FROM admin_notification_rules
      WHERE app_id IS NOT DISTINCT FROM ${normalizedAppId}::uuid
      ORDER BY event_type ASC
    `;
    return {
      event_catalog: EVENT_CATALOG,
      items: rows.map((row) => this.serializeRule(row)),
    };
  }

  async updateRules(appId: string | null | undefined, payload: unknown) {
    await this.ensureSchema();
    const normalizedAppId = this.optionalUuid(appId);
    if (normalizedAppId) await this.requireApp(normalizedAppId);
    const body = asObject(payload);
    const items = Array.isArray(body.items) ? body.items : Array.isArray(payload) ? payload : [];
    const saved: Row[] = [];
    for (const raw of items) {
      const item = asObject(raw);
      const eventType = this.requiredString(item.event_type || item.eventType, 'event_type', 120);
      const minSeverity = this.normalizeSeverity(item.min_severity || item.minSeverity || 'info');
      const enabled = item.enabled === undefined ? true : Boolean(item.enabled);
      const dedupeWindowSeconds = this.intValue(item.dedupe_window_seconds || item.dedupeWindowSeconds, 600, 0, 86400);
      const aggregationWindowSeconds = this.intValue(item.aggregation_window_seconds || item.aggregationWindowSeconds, 0, 0, 86400);
      const channelIds = this.normalizeUuidArray(item.channel_ids || item.channelIds || item.channel_ids_json || item.channelIdsJson);
      const quietHours = this.normalizeQuietHours(item.quiet_hours || item.quietHours || item.quiet_hours_json || item.quietHoursJson);
      const rows = await this.prisma.$queryRaw<Row[]>`
        INSERT INTO admin_notification_rules (
          app_id, event_type, min_severity, channel_ids_json, enabled,
          dedupe_window_seconds, aggregation_window_seconds, quiet_hours_json, created_at, updated_at
        )
        VALUES (
          ${normalizedAppId}::uuid, ${eventType}, ${minSeverity}, ${JSON.stringify(channelIds)}::jsonb, ${enabled},
          ${dedupeWindowSeconds}, ${aggregationWindowSeconds}, ${JSON.stringify(quietHours)}::jsonb, now(), now()
        )
        ON CONFLICT (app_id, event_type)
        DO UPDATE SET
          min_severity = EXCLUDED.min_severity,
          channel_ids_json = EXCLUDED.channel_ids_json,
          enabled = EXCLUDED.enabled,
          dedupe_window_seconds = EXCLUDED.dedupe_window_seconds,
          aggregation_window_seconds = EXCLUDED.aggregation_window_seconds,
          quiet_hours_json = EXCLUDED.quiet_hours_json,
          updated_at = now()
        RETURNING *
      `;
      saved.push(rows[0]);
    }
    return { items: saved.map((row) => this.serializeRule(row)) };
  }

  async listEvents(query: AdminNotificationListQuery = {}) {
    await this.ensureSchema();
    const page = this.page(query.page);
    const pageSize = this.pageSize(query.page_size);
    const appId = this.optionalUuid(query.app_id);
    const eventType = this.optionalString(query.event_type, 120);
    const severity = query.severity ? this.normalizeSeverity(query.severity) : null;
    const status = this.optionalString(query.status, 32);
    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT e.*, a.slug AS app_slug, a.name AS app_name, COUNT(*) OVER()::int AS total_count
      FROM admin_notification_events e
      LEFT JOIN apps a ON a.id = e.app_id
      WHERE (${appId}::uuid IS NULL OR e.app_id = ${appId}::uuid)
        AND (${eventType}::text IS NULL OR e.event_type = ${eventType})
        AND (${severity}::text IS NULL OR e.severity = ${severity})
        AND (${status}::text IS NULL OR e.status = ${status})
      ORDER BY e.created_at DESC
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
    `;
    return { items: rows.map((row) => this.serializeEvent(row)), total: rows[0]?.total_count || 0, page, page_size: pageSize };
  }

  async listDeliveries(query: AdminNotificationListQuery = {}) {
    await this.ensureSchema();
    const page = this.page(query.page);
    const pageSize = this.pageSize(query.page_size);
    const appId = this.optionalUuid(query.app_id);
    const status = this.optionalString(query.status, 32);
    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT d.*, e.app_id, e.event_type, e.severity, e.title, e.message, e.created_at AS event_created_at,
             c.channel_type, c.name AS channel_name, a.slug AS app_slug, a.name AS app_name,
             COUNT(*) OVER()::int AS total_count
      FROM admin_notification_deliveries d
      JOIN admin_notification_events e ON e.id = d.event_id
      JOIN admin_notification_channels c ON c.id = d.channel_id
      LEFT JOIN apps a ON a.id = e.app_id
      WHERE (${appId}::uuid IS NULL OR e.app_id = ${appId}::uuid)
        AND (${status}::text IS NULL OR d.status = ${status})
        AND c.status <> 'DELETED'
      ORDER BY d.created_at DESC
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
    `;
    return { items: rows.map((row) => this.serializeDelivery(row)), total: rows[0]?.total_count || 0, page, page_size: pageSize };
  }

  async emit(input: AdminNotificationEmitInput) {
    try {
      await this.ensureSchema();
      return await this.emitUnsafe(input);
    } catch (error: any) {
      this.logger.warn(`admin notification emit failed: ${error?.message || error}`);
      return null;
    }
  }

  private async emitUnsafe(input: AdminNotificationEmitInput) {
    const appId = this.optionalUuid(input.app_id);
    const eventType = this.requiredString(input.event_type, 'event_type', 120);
    const severity = this.normalizeSeverity(input.severity || 'info');
    const title = this.requiredString(input.title, 'title', 180);
    const message = this.optionalString(input.message, 2000) || '';
    const sourceModule = this.optionalString(input.source_module, 80);
    const sourceId = this.optionalString(input.source_id, 160);
    const dedupeKey = this.optionalString(input.dedupe_key, 180) || this.buildDedupeKey(input);
    const payload = this.sanitizePayload(input.payload || {});
    const rules = await this.resolveMatchingRules(appId, eventType, severity);
    const dedupeWindowSeconds = Math.max(0, ...rules.map((rule) => Number(rule.dedupe_window_seconds || 0)), 600);

    if (dedupeKey && dedupeWindowSeconds > 0) {
      const existing = await this.findRecentDedupeEvent(appId, eventType, dedupeKey, dedupeWindowSeconds);
      if (existing) {
        await this.prisma.$executeRaw`
          UPDATE admin_notification_events
          SET payload_json = payload_json
                || jsonb_build_object(
                  'aggregate_count',
                  COALESCE(NULLIF(payload_json->>'aggregate_count', '')::int, 1) + 1,
                  'last_seen_at',
                  now()
                ),
              updated_at = now()
          WHERE id = ${existing.id}::uuid
        `;
        return { event_id: existing.id, deduped: true };
      }
    }

    const eventRows = await this.prisma.$queryRaw<Row[]>`
      INSERT INTO admin_notification_events (
        app_id, event_type, severity, title, message, source_module, source_id, dedupe_key, payload_json, status, created_at, updated_at
      )
      VALUES (
        ${appId}::uuid, ${eventType}, ${severity}, ${title}, ${message}, ${sourceModule}, ${sourceId}, ${dedupeKey},
        ${JSON.stringify(payload)}::jsonb, 'recorded', now(), now()
      )
      RETURNING *
    `;
    const event = eventRows[0];
    const deliveries = await this.createDeliveriesForEvent(event, rules);
    if (deliveries.length) {
      await this.prisma.$executeRaw`
        UPDATE admin_notification_events
        SET status = 'queued', updated_at = now()
        WHERE id = ${event.id}::uuid
      `;
    }
    return { event_id: event.id, delivery_count: deliveries.length };
  }

  @Interval(15000)
  async processPendingDeliveries() {
    if (this.processing) return;
    this.processing = true;
    try {
      await this.ensureSchema();
      const due = await this.claimDueDeliveries();
      for (const item of due) {
        await this.deliver(item);
      }
    } catch (error: any) {
      this.logger.warn(`admin notification delivery loop failed: ${error?.message || error}`);
    } finally {
      this.processing = false;
    }
  }

  private async createDeliveriesForEvent(event: Row, rules: Row[]) {
    const created: Row[] = [];
    for (const rule of rules) {
      const channelRows = await this.resolveRuleChannels(event.app_id || null, rule);
      const quiet = this.isQuietNow(rule.quiet_hours_json);
      const aggregationSeconds = Number(rule.aggregation_window_seconds || 0);
      const nextRetryAtSql = aggregationSeconds > 0 && SEVERITY_ORDER[this.normalizeSeverity(event.severity)] < SEVERITY_ORDER.high
        ? `${aggregationSeconds} seconds`
        : null;
      for (const channel of channelRows) {
        const rows = await this.prisma.$queryRaw<Row[]>`
          INSERT INTO admin_notification_deliveries (
            event_id, channel_id, status, attempts, next_retry_at, provider_response_json, error_message, created_at, updated_at
          )
          VALUES (
            ${event.id}::uuid, ${channel.id}::uuid, ${quiet ? 'skipped' : 'pending'}, 0,
            CASE WHEN ${nextRetryAtSql}::text IS NULL THEN now() ELSE now() + (${nextRetryAtSql}::text)::interval END,
            '{}'::jsonb, ${quiet ? 'quiet hours' : null}, now(), now()
          )
          ON CONFLICT (event_id, channel_id) DO NOTHING
          RETURNING *
        `;
        if (rows[0]) created.push(rows[0]);
      }
    }
    return created;
  }

  private async claimDueDeliveries() {
    return this.prisma.$transaction(async (tx) => {
      const due = await tx.$queryRaw<Row[]>`
        SELECT d.id
        FROM admin_notification_deliveries d
        JOIN admin_notification_channels c ON c.id = d.channel_id
        WHERE d.status IN ('pending', 'retry')
          AND COALESCE(d.next_retry_at, now()) <= now()
          AND c.status = 'ACTIVE'
        ORDER BY d.created_at ASC
        LIMIT ${DELIVERY_BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      `;
      const ids = due.map((row) => row.id);
      if (!ids.length) return [];
      return tx.$queryRaw<Row[]>`
        UPDATE admin_notification_deliveries d
        SET status = 'sending',
            attempts = attempts + 1,
            updated_at = now()
        FROM admin_notification_events e, admin_notification_channels c
        LEFT JOIN apps a ON a.id = e.app_id
        WHERE d.event_id = e.id
          AND c.id = d.channel_id
          AND d.id = ANY(${ids}::uuid[])
        RETURNING d.*, e.app_id, e.event_type, e.severity, e.title, e.message, e.source_module, e.source_id, e.payload_json,
                  a.slug AS app_slug, a.name AS app_name,
                  c.channel_type, c.name AS channel_name, c.config_json, c.secret_ciphertext
      `;
    });
  }

  private async deliver(item: Row) {
    try {
      const recentCount = await this.countRecentChannelDeliveries(item.channel_id);
      if (recentCount >= 20) {
        await this.markDeliveryFailure(item, new Error('channel rate limit delayed'), true);
        return;
      }
      const result = await this.dispatchToChannel(item);
      await this.prisma.$executeRaw`
        UPDATE admin_notification_deliveries
        SET status = 'sent',
            provider_response_json = ${JSON.stringify(result || {})}::jsonb,
            error_message = NULL,
            sent_at = now(),
            updated_at = now()
        WHERE id = ${item.id}::uuid
      `;
      await this.prisma.$executeRaw`
        UPDATE admin_notification_events
        SET status = 'sent', updated_at = now()
        WHERE id = ${item.event_id}::uuid
          AND NOT EXISTS (
            SELECT 1 FROM admin_notification_deliveries
            WHERE event_id = ${item.event_id}::uuid AND status IN ('pending', 'retry', 'sending', 'failed')
          )
      `;
    } catch (error: any) {
      await this.markDeliveryFailure(item, error);
    }
  }

  private async dispatchToChannel(item: Row) {
    const channelType = this.normalizeChannelType(item.channel_type);
    if (channelType === 'FEISHU_ROBOT') return this.dispatchFeishu(item);
    if (channelType === 'EMAIL') return this.dispatchEmail(item);
    throw new BadRequestException('unsupported notification channel');
  }

  private async dispatchFeishu(item: Row) {
    const secret = item.secret_ciphertext ? this.decryptSecretJson(item.secret_ciphertext) : {};
    const webhookUrl = String(secret.webhook_url || '').trim();
    if (!webhookUrl) throw new BadRequestException('feishu webhook_url is not configured');
    const robotSecret = String(secret.secret || '').trim();
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const body: Row = {
      msg_type: 'text',
      content: {
        text: this.renderPlainMessage(item),
      },
    };
    if (robotSecret) {
      body.timestamp = timestamp;
      body.sign = createHmac('sha256', `${timestamp}\n${robotSecret}`).update('').digest('base64');
    }
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      // keep text response
    }
    if (!response.ok) throw new Error(`Feishu robot failed: HTTP ${response.status} ${text.slice(0, 500)}`);
    return { status: response.status, response: parsed };
  }

  private async dispatchEmail(item: Row) {
    const config = asObject(item.config_json);
    const recipients = this.normalizeEmailList(config.recipients);
    if (!recipients.length) throw new BadRequestException('email channel recipients are not configured');
    return this.emailDeliveryService.sendNotificationEmail({
      appId: item.app_id || null,
      senderId: this.optionalUuid(config.sender_id),
      to: recipients,
      subject: `[OPG] ${String(item.title || '管理员通知').slice(0, 180)}`,
      text: this.renderPlainMessage(item),
      html: this.renderHtmlMessage(item),
    });
  }

  private async markDeliveryFailure(item: Row, error: any, forceRetry = false) {
    const attempts = Number(item.attempts || 1);
    const retryable = forceRetry || attempts < MAX_DELIVERY_ATTEMPTS;
    const message = String(error?.message || error || 'delivery failed').slice(0, 2000);
    if (retryable && attempts < MAX_DELIVERY_ATTEMPTS) {
      const delaySeconds = Math.min(3600, 30 * 2 ** Math.max(0, attempts - 1));
      await this.prisma.$executeRaw`
        UPDATE admin_notification_deliveries
        SET status = 'retry',
            next_retry_at = now() + (${delaySeconds}::text || ' seconds')::interval,
            error_message = ${message},
            updated_at = now()
        WHERE id = ${item.id}::uuid
      `;
      return;
    }
    await this.prisma.$executeRaw`
      UPDATE admin_notification_deliveries
      SET status = 'failed',
          next_retry_at = NULL,
          error_message = ${message},
          updated_at = now()
      WHERE id = ${item.id}::uuid
    `;
    await this.prisma.$executeRaw`
      UPDATE admin_notification_events
      SET status = 'failed', updated_at = now()
      WHERE id = ${item.event_id}::uuid
        AND NOT EXISTS (
          SELECT 1 FROM admin_notification_deliveries
          WHERE event_id = ${item.event_id}::uuid AND status IN ('pending', 'retry', 'sending', 'sent')
        )
    `;
  }

  private async resolveMatchingRules(appId: string | null, eventType: string, severity: AdminNotificationSeverity) {
    const candidateRows = await this.prisma.$queryRaw<Row[]>`
      SELECT *
      FROM admin_notification_rules
      WHERE enabled = true
        AND (app_id IS NULL OR app_id IS NOT DISTINCT FROM ${appId}::uuid)
      ORDER BY app_id NULLS FIRST, event_type ASC
    `;
    const appRules = candidateRows.filter((row) => row.app_id && this.ruleMatches(row, eventType, severity));
    if (appRules.length) return appRules;
    return candidateRows.filter((row) => !row.app_id && this.ruleMatches(row, eventType, severity));
  }

  private ruleMatches(row: Row, eventType: string, severity: AdminNotificationSeverity) {
    const pattern = String(row.event_type || '').trim();
    const severityOk = SEVERITY_ORDER[severity] >= SEVERITY_ORDER[this.normalizeSeverity(row.min_severity || 'info')];
    if (!severityOk) return false;
    if (pattern === '*' || pattern === eventType) return true;
    if (pattern.endsWith('.*')) return eventType.startsWith(pattern.slice(0, -1));
    return false;
  }

  private async resolveRuleChannels(appId: string | null, rule: Row) {
    const explicit = this.normalizeUuidArray(rule.channel_ids_json);
    if (explicit.length) {
      return this.prisma.$queryRaw<Row[]>`
        SELECT *
        FROM admin_notification_channels
        WHERE id = ANY(${explicit}::uuid[])
          AND status = 'ACTIVE'
      `;
    }
    if (appId) {
      const appChannels = await this.prisma.$queryRaw<Row[]>`
        SELECT *
        FROM admin_notification_channels
        WHERE app_id = ${appId}::uuid AND status = 'ACTIVE'
        ORDER BY updated_at DESC
      `;
      if (appChannels.length) return appChannels;
    }
    return this.prisma.$queryRaw<Row[]>`
      SELECT *
      FROM admin_notification_channels
      WHERE app_id IS NULL AND status = 'ACTIVE'
      ORDER BY updated_at DESC
    `;
  }

  private async findRecentDedupeEvent(appId: string | null, eventType: string, dedupeKey: string, windowSeconds: number) {
    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT id
      FROM admin_notification_events
      WHERE app_id IS NOT DISTINCT FROM ${appId}::uuid
        AND event_type = ${eventType}
        AND dedupe_key = ${dedupeKey}
        AND created_at >= now() - (${windowSeconds}::text || ' seconds')::interval
      ORDER BY created_at DESC
      LIMIT 1
    `;
    return rows[0] || null;
  }

  private async countRecentChannelDeliveries(channelId: string) {
    const rows = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM admin_notification_deliveries
      WHERE channel_id = ${channelId}::uuid
        AND status = 'sent'
        AND sent_at >= now() - interval '1 minute'
    `;
    return Number(rows[0]?.count || 0);
  }

  private renderPlainMessage(item: Row) {
    const appName = item.app_name || item.app_slug || item.app_id || 'platform';
    const payload = asObject(item.payload_json);
    const aggregateCount = Number(payload.aggregate_count || 1);
    return [
      String(item.title || 'OPG 管理员通知'),
      `App: ${appName}`,
      `事件: ${item.event_type || '-'}`,
      `级别: ${item.severity || '-'}`,
      item.message ? `内容: ${item.message}` : '',
      item.source_module || item.source_id ? `来源: ${item.source_module || '-'}${item.source_id ? ` / ${item.source_id}` : ''}` : '',
      aggregateCount > 1 ? `聚合次数: ${aggregateCount}` : '',
    ].filter(Boolean).join('\n');
  }

  private renderHtmlMessage(item: Row) {
    return this.renderPlainMessage(item)
      .split('\n')
      .map((line) => `<p>${this.escapeHtml(line)}</p>`)
      .join('');
  }

  private async getChannelRow(channelId: string) {
    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT *
      FROM admin_notification_channels
      WHERE id = ${channelId}::uuid AND status <> 'DELETED'
      LIMIT 1
    `;
    if (!rows[0]) throw new NotFoundException('notification channel not found');
    return rows[0];
  }

  private async normalizeChannelPayload(channelType: AdminNotificationChannelType, body: Record<string, unknown>, current?: Row) {
    if (channelType === 'FEISHU_ROBOT') {
      const existingSecret = current?.secret_ciphertext ? this.decryptSecretJson(current.secret_ciphertext) : {};
      const webhookUrl = this.optionalString(body.webhook_url || body.webhookUrl, 2000) || String(existingSecret.webhook_url || '');
      if (!webhookUrl) throw new BadRequestException('webhook_url is required');
      const secret = body.secret === undefined ? String(existingSecret.secret || '') : this.optionalString(body.secret, 512);
      return {
        config: {
          webhook_configured: true,
          webhook_host: this.maskWebhookHost(webhookUrl),
        },
        secret: { webhook_url: webhookUrl, secret },
      };
    }
    const recipients = this.normalizeEmailList(body.recipients || body.to || current?.config_json?.recipients);
    if (!recipients.length) throw new BadRequestException('recipients is required');
    return {
      config: {
        recipients,
        sender_id: this.optionalUuid(body.sender_id || body.senderId || current?.config_json?.sender_id),
      },
      secret: null,
    };
  }

  private serializeChannel(row: Row) {
    return {
      id: row.id,
      app_id: row.app_id || null,
      app_slug: row.app_slug || null,
      app_name: row.app_name || null,
      channel_type: row.channel_type,
      name: row.name,
      status: row.status,
      config: asObject(row.config_json),
      secret_configured: Boolean(row.secret_ciphertext),
      created_by_user_id: row.created_by_user_id || null,
      created_at: row.created_at || null,
      updated_at: row.updated_at || null,
    };
  }

  private serializeRule(row: Row) {
    return {
      id: row.id,
      app_id: row.app_id || null,
      event_type: row.event_type,
      min_severity: row.min_severity,
      channel_ids: this.normalizeUuidArray(row.channel_ids_json),
      enabled: Boolean(row.enabled),
      dedupe_window_seconds: Number(row.dedupe_window_seconds || 0),
      aggregation_window_seconds: Number(row.aggregation_window_seconds || 0),
      quiet_hours: asObject(row.quiet_hours_json),
      created_at: row.created_at || null,
      updated_at: row.updated_at || null,
    };
  }

  private serializeEvent(row: Row) {
    return {
      id: row.id,
      app_id: row.app_id || null,
      app_slug: row.app_slug || null,
      app_name: row.app_name || null,
      event_type: row.event_type,
      severity: row.severity,
      title: row.title,
      message: row.message,
      source_module: row.source_module || null,
      source_id: row.source_id || null,
      dedupe_key: row.dedupe_key || null,
      payload: asObject(row.payload_json),
      status: row.status,
      created_at: row.created_at || null,
      updated_at: row.updated_at || null,
    };
  }

  private serializeDelivery(row: Row) {
    return {
      id: row.id,
      event_id: row.event_id,
      app_id: row.app_id || null,
      app_slug: row.app_slug || null,
      app_name: row.app_name || null,
      channel_id: row.channel_id,
      channel_type: row.channel_type,
      channel_name: row.channel_name,
      event_type: row.event_type,
      severity: row.severity,
      title: row.title,
      status: row.status,
      attempts: Number(row.attempts || 0),
      next_retry_at: row.next_retry_at || null,
      error_message: row.error_message || null,
      provider_response: asObject(row.provider_response_json),
      sent_at: row.sent_at || null,
      created_at: row.created_at || null,
      updated_at: row.updated_at || null,
      event_created_at: row.event_created_at || null,
    };
  }

  private async ensureSchema() {
    if (this.schemaReady) return;
    if (this.schemaPromise) return this.schemaPromise;
    this.schemaPromise = this.verifySchema();
    try {
      await this.schemaPromise;
      this.schemaReady = true;
    } finally {
      this.schemaPromise = null;
    }
  }

  private async verifySchema() {
    await this.prisma.$executeRawUnsafe(`SELECT 1 FROM admin_notification_channels LIMIT 1`);
  }

  private async requireApp(appId: string) {
    const rows = await this.prisma.$queryRaw<Row[]>`SELECT id FROM apps WHERE id = ${appId}::uuid LIMIT 1`;
    if (!rows[0]) throw new NotFoundException('app not found');
  }

  private normalizeChannelType(value: unknown): AdminNotificationChannelType {
    const normalized = String(value || '').trim().toUpperCase();
    if (CHANNEL_TYPES.includes(normalized as AdminNotificationChannelType)) return normalized as AdminNotificationChannelType;
    throw new BadRequestException('unsupported notification channel_type');
  }

  private normalizeSeverity(value: unknown): AdminNotificationSeverity {
    const normalized = String(value || 'info').trim().toLowerCase();
    if (normalized === 'critical' || normalized === 'high' || normalized === 'warning' || normalized === 'info') {
      return normalized;
    }
    return 'info';
  }

  private normalizeStatus(value: unknown) {
    const normalized = String(value || 'ACTIVE').trim().toUpperCase();
    if (normalized === 'DISABLED') return 'INACTIVE';
    if (normalized === 'ACTIVE' || normalized === 'INACTIVE') return normalized;
    throw new BadRequestException('invalid notification channel status');
  }

  private requiredString(value: unknown, field: string, max: number) {
    const text = this.optionalString(value, max);
    if (!text) throw new BadRequestException(`${field} is required`);
    return text;
  }

  private optionalString(value: unknown, max: number) {
    const text = String(value ?? '').trim();
    return text ? text.slice(0, max) : null;
  }

  private optionalUuid(value: unknown) {
    const text = String(value || '').trim();
    if (!text) return null;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) {
      return null;
    }
    return text;
  }

  private requiredUuid(value: unknown, field = 'id') {
    const id = this.optionalUuid(value);
    if (!id) throw new BadRequestException(`${field} must be a uuid`);
    return id;
  }

  private normalizeUuidArray(value: unknown) {
    const raw = Array.isArray(value) ? value : Array.isArray((value as any)?.items) ? (value as any).items : [];
    return Array.from(new Set(raw.map((item) => this.optionalUuid(item)).filter(Boolean))) as string[];
  }

  private normalizeEmailList(value: unknown) {
    const raw = Array.isArray(value) ? value : String(value || '').split(/[,;\n]/);
    return Array.from(new Set(raw.map((item) => String(item || '').trim().toLowerCase()).filter((item) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item)))).slice(0, 50);
  }

  private normalizeQuietHours(value: unknown) {
    const object = asObject(value);
    const start = this.optionalString(object.start, 8);
    const end = this.optionalString(object.end, 8);
    if (!start || !end) return {};
    return { start, end, timezone: this.optionalString(object.timezone, 64) || 'local' };
  }

  private isQuietNow(value: unknown) {
    const quiet = asObject(value);
    const start = String(quiet.start || '');
    const end = String(quiet.end || '');
    if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) return false;
    const now = new Date();
    const current = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    return start <= end ? current >= start && current <= end : current >= start || current <= end;
  }

  private intValue(value: unknown, fallback: number, min: number, max: number) {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, parsed));
  }

  private page(value: unknown) {
    return this.intValue(value, 1, 1, 100000);
  }

  private pageSize(value: unknown) {
    return this.intValue(value, 30, 1, 100);
  }

  private sanitizePayload(payload: Record<string, unknown>) {
    const json = JSON.stringify(payload, (_key, value) => {
      if (typeof value === 'string') return value.slice(0, 1200);
      return value;
    });
    if (json.length <= 8000) return JSON.parse(json);
    return { truncated: true, preview: json.slice(0, 8000) };
  }

  private buildDedupeKey(input: AdminNotificationEmitInput) {
    const base = [
      input.app_id || 'platform',
      input.event_type,
      input.source_module || '',
      input.source_id || '',
      input.title || '',
    ].join('|');
    return createHash('sha256').update(base).digest('hex').slice(0, 48);
  }

  private encryptSecretJson(value: Record<string, unknown>) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.secretKey(), iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join(':');
  }

  private decryptSecretJson(value: string) {
    const [version, ivRaw, tagRaw, encryptedRaw] = String(value || '').split(':');
    if (version !== 'v1' || !ivRaw || !tagRaw || !encryptedRaw) throw new BadRequestException('invalid notification secret');
    const decipher = createDecipheriv('aes-256-gcm', this.secretKey(), Buffer.from(ivRaw, 'base64'));
    decipher.setAuthTag(Buffer.from(tagRaw, 'base64'));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedRaw, 'base64')), decipher.final()]).toString('utf8');
    return asObject(JSON.parse(decrypted));
  }

  private secretKey() {
    const secret = process.env.PLATFORM_SECRETS_KEY || process.env.OUTBOUND_PROXY_ENCRYPTION_KEY || process.env.JWT_SECRET_KEY;
    if (!secret) throw new Error('PLATFORM_SECRETS_KEY or JWT_SECRET_KEY is required');
    return createHash('sha256').update(secret).digest();
  }

  private maskWebhookHost(value: string) {
    try {
      const url = new URL(value);
      return url.host;
    } catch {
      return 'configured';
    }
  }

  private escapeHtml(input: string) {
    return String(input || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
