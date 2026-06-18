import { BadRequestException, Inject, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import * as nodemailer from 'nodemailer';
import { PrismaClient } from '@prisma/client';
import { PRISMA_CLIENT } from '../../config/database.module';
import { CloudflareEmailService } from './cloudflare-email.service';
import { EmailProviderType } from './email-delivery.types';

type Row = Record<string, any>;
const EMAIL_DELIVERY_BATCH_SIZE = 20;
const EMAIL_MAX_ATTEMPTS = 4;
const EMAIL_MAX_CAMPAIGN_RECIPIENTS = 5000;
const EMAIL_PROVIDER_TYPES: EmailProviderType[] = ['CLOUDFLARE_EMAIL', 'SMTP', 'RESEND', 'SENDGRID', 'POSTMARK', 'MAILGUN'];
const EMAIL_PROVIDER_CATALOG: Array<{
  provider_type: EmailProviderType;
  label: string;
  required_config: string[];
  required_secrets: string[];
  optional_config: string[];
}> = [
  {
    provider_type: 'CLOUDFLARE_EMAIL',
    label: 'Cloudflare Email Sending',
    required_config: ['account_id'],
    required_secrets: ['api_token'],
    optional_config: [],
  },
  {
    provider_type: 'SMTP',
    label: 'SMTP',
    required_config: ['host', 'port', 'secure'],
    required_secrets: ['username', 'password'],
    optional_config: [],
  },
  {
    provider_type: 'RESEND',
    label: 'Resend',
    required_config: [],
    required_secrets: ['api_key'],
    optional_config: [],
  },
  {
    provider_type: 'SENDGRID',
    label: 'SendGrid',
    required_config: [],
    required_secrets: ['api_key'],
    optional_config: [],
  },
  {
    provider_type: 'POSTMARK',
    label: 'Postmark',
    required_config: [],
    required_secrets: ['server_token'],
    optional_config: [],
  },
  {
    provider_type: 'MAILGUN',
    label: 'Mailgun',
    required_config: ['domain'],
    required_secrets: ['api_key'],
    optional_config: ['api_base_url'],
  },
];

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

@Injectable()
export class EmailDeliveryService implements OnModuleInit {
  private readonly logger = new Logger(EmailDeliveryService.name);
  private schemaReady = false;
  private schemaPromise: Promise<void> | null = null;
  private processing = false;

  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly cloudflareEmail: CloudflareEmailService,
  ) {}

  async onModuleInit() {
    try {
      await this.ensureSchema();
    } catch (error: any) {
      this.logger.warn(`email delivery startup warmup failed: ${error?.message || error}`);
    }
  }

  getProviderCatalog() {
    return { items: EMAIL_PROVIDER_CATALOG };
  }

  async listProviders() {
    await this.ensureSchema();
    await this.syncCloudflareProviders();
    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT p.id, p.provider_type, p.name, p.external_account_id, p.status, p.config_json,
             p.cloudflare_account_id, p.notes, p.last_verified_at, p.created_at, p.updated_at,
             a.account_id AS cf_account_id
      FROM email_providers p
      LEFT JOIN email_cf_accounts a ON a.id = p.cloudflare_account_id
      ORDER BY p.updated_at DESC
    `;
    return { items: rows.map((row) => this.serializeProvider(row)) };
  }

  async createProvider(actorUserId: string, payload: unknown) {
    await this.ensureSchema();
    const body = asObject(payload);
    const providerType = this.normalizeProviderType(body.provider_type || body.providerType);
    if (providerType === 'CLOUDFLARE_EMAIL') {
      const account = await this.createCloudflareAccount(actorUserId, body);
      return this.getProviderByCloudflareAccountId(account.id);
    }
    const name = this.requiredString(body.name, 'name', 160);
    const status = this.normalizeActiveStatus(body.status);
    const notes = this.optionalString(body.notes, 4000);
    const config = this.normalizeProviderConfig(providerType, asObject(body.config));
    const secrets = this.normalizeProviderSecrets(providerType, asObject(body.secrets));
    this.assertProviderReady(providerType, config, secrets);
    const rows = await this.prisma.$queryRaw<Row[]>`
      INSERT INTO email_providers (provider_type, name, external_account_id, status, config_json, secrets_ciphertext, notes, created_by_user_id)
      VALUES (${providerType}, ${name}, ${this.providerExternalId(providerType, config)}, ${status}, ${JSON.stringify(config)}::jsonb, ${this.encryptSecret(JSON.stringify(secrets))}, ${notes}, ${actorUserId}::uuid)
      RETURNING *
    `;
    return this.serializeProvider(rows[0]);
  }

  async updateProvider(providerId: string, payload: unknown) {
    await this.ensureSchema();
    const provider = await this.getProviderSecret(providerId);
    if (provider.provider_type === 'CLOUDFLARE_EMAIL') {
      return this.updateCloudflareAccount(provider.cloudflare_account_id || providerId, payload);
    }
    const body = asObject(payload);
    const providerType = this.normalizeProviderType(provider.provider_type);
    const currentConfig = asObject(provider.config_json);
    const currentSecrets = provider.secrets_ciphertext ? this.decryptJsonSecret(provider.secrets_ciphertext) : {};
    const config = body.config === undefined ? currentConfig : this.normalizeProviderConfig(providerType, { ...currentConfig, ...asObject(body.config) });
    const secrets = body.secrets === undefined
      ? currentSecrets
      : this.normalizeProviderSecrets(providerType, { ...currentSecrets, ...asObject(body.secrets) });
    this.assertProviderReady(providerType, config, secrets);
    const name = body.name === undefined ? provider.name : this.requiredString(body.name, 'name', 160);
    const status = body.status === undefined ? provider.status : this.normalizeActiveStatus(body.status);
    const notes = body.notes === undefined ? provider.notes : this.optionalString(body.notes, 4000);
    const rows = await this.prisma.$queryRaw<Row[]>`
      UPDATE email_providers
      SET name = ${name},
          external_account_id = ${this.providerExternalId(providerType, config)},
          status = ${status},
          config_json = ${JSON.stringify(config)}::jsonb,
          secrets_ciphertext = ${this.encryptSecret(JSON.stringify(secrets))},
          notes = ${notes},
          updated_at = now()
      WHERE id = ${providerId}::uuid
      RETURNING *
    `;
    if (!rows[0]) throw new NotFoundException('email provider not found');
    return this.serializeProvider(rows[0]);
  }

  async deleteProvider(providerId: string) {
    await this.ensureSchema();
    const provider = await this.getProviderSecret(providerId);
    if (provider.provider_type === 'CLOUDFLARE_EMAIL' && provider.cloudflare_account_id) {
      return this.deleteCloudflareAccount(provider.cloudflare_account_id);
    }
    await this.prisma.$executeRaw`DELETE FROM email_providers WHERE id = ${providerId}::uuid`;
    return { deleted: true };
  }

  async testProvider(providerId: string) {
    await this.ensureSchema();
    const provider = await this.getProviderSecret(providerId);
    await this.verifyProvider(provider);
    await this.prisma.$executeRaw`
      UPDATE email_providers SET last_verified_at = now(), updated_at = now() WHERE id = ${providerId}::uuid
    `;
    if (provider.cloudflare_account_id) {
      await this.prisma.$executeRaw`
        UPDATE email_cf_accounts SET last_verified_at = now(), updated_at = now() WHERE id = ${provider.cloudflare_account_id}::uuid
      `;
    }
    return { ok: true };
  }

  async listProviderSendingDomains(providerId: string) {
    await this.ensureSchema();
    const provider = await this.getProviderSecret(providerId);
    if (provider.provider_type !== 'CLOUDFLARE_EMAIL') return { items: [] };
    const accountId = String(provider.config_json?.account_id || provider.external_account_id || provider.cf_account_id || '');
    const secrets = await this.getProviderSecrets(provider);
    try {
      const items = await this.cloudflareEmail.listSendingDomains(accountId, String(secrets.api_token || ''));
      return { items };
    } catch (error: any) {
      this.logger.warn(`cloudflare sending domain discovery failed for ${accountId}: ${error?.message || error}`);
      return {
        items: [],
        warning: 'cloudflare sending domain discovery failed',
      };
    }
  }

  async listCloudflareAccounts() {
    await this.ensureSchema();
    await this.syncCloudflareProviders();
    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT id, name, account_id, status, notes, last_verified_at, created_at, updated_at
      FROM email_cf_accounts
      ORDER BY updated_at DESC
    `;
    return { items: rows };
  }

  async verifyCloudflareToken(payload: unknown) {
    const body = asObject(payload);
    const token = this.requiredString(body.api_token || body.apiToken, 'api_token', 2048);
    const tokenStatus = await this.cloudflareEmail.verifyToken(token);
    const accounts = await this.safeListCloudflareAccounts(token);
    return {
      ok: true,
      token: tokenStatus.result || {},
      accounts: accounts.map((account) => ({
        id: account.id,
        name: account.name,
        type: account.type || null,
      })),
    };
  }

  async createCloudflareAccount(actorUserId: string, payload: unknown) {
    await this.ensureSchema();
    const body = asObject(payload);
    const token = this.requiredString(body.api_token || body.apiToken, 'api_token', 2048);
    const selectedAccountId = this.optionalCloudflareAccountId(body.account_id || body.accountId);
    const verified = await this.resolveCloudflareAccountFromToken(token, selectedAccountId);
    const accountId = verified.id;
    const name = this.optionalString(body.name, 120) || verified.name;
    const notes = this.optionalString(body.notes, 4000);
    const status = this.normalizeActiveStatus(body.status);
    const ciphertext = this.encryptSecret(token);

    const rows = await this.prisma.$queryRaw<Row[]>`
      INSERT INTO email_cf_accounts (name, account_id, api_token_ciphertext, status, notes, created_by_user_id)
      VALUES (${name}, ${accountId}, ${ciphertext}, ${status}, ${notes}, ${actorUserId}::uuid)
      ON CONFLICT (account_id) DO UPDATE SET
        name = EXCLUDED.name,
        api_token_ciphertext = EXCLUDED.api_token_ciphertext,
        status = EXCLUDED.status,
        notes = EXCLUDED.notes,
        updated_at = now()
      RETURNING id, name, account_id, status, notes, last_verified_at, created_at, updated_at
    `;
    await this.syncCloudflareProviders();
    return rows[0];
  }

  async updateCloudflareAccount(accountUuid: string, payload: unknown) {
    await this.ensureSchema();
    const account = await this.getCloudflareAccountSecret(accountUuid);
    const body = asObject(payload);
    const rawToken = body.api_token || body.apiToken ? this.requiredString(body.api_token || body.apiToken, 'api_token', 2048) : null;
    const verified = rawToken
      ? await this.resolveCloudflareAccountFromToken(rawToken, this.optionalCloudflareAccountId(body.account_id || body.accountId))
      : null;
    const name = this.optionalString(body.name, 120) ?? verified?.name ?? account.name;
    const accountId = verified?.id ?? this.optionalCloudflareAccountId(body.account_id || body.accountId) ?? account.account_id;
    const notes = body.notes === undefined ? account.notes : this.optionalString(body.notes, 4000);
    const status = body.status === undefined ? account.status : this.normalizeActiveStatus(body.status);
    const ciphertext = rawToken ? this.encryptSecret(rawToken) : account.api_token_ciphertext;

    const rows = await this.prisma.$queryRaw<Row[]>`
      UPDATE email_cf_accounts
      SET name = ${name}, account_id = ${accountId}, api_token_ciphertext = ${ciphertext}, status = ${status}, notes = ${notes}, updated_at = now()
      WHERE id = ${accountUuid}::uuid
      RETURNING id, name, account_id, status, notes, last_verified_at, created_at, updated_at
    `;
    if (!rows[0]) throw new NotFoundException('cloudflare account not found');
    await this.syncCloudflareProviders();
    return rows[0];
  }

  async deleteCloudflareAccount(accountUuid: string) {
    await this.ensureSchema();
    await this.prisma.$executeRaw`DELETE FROM email_cf_accounts WHERE id = ${accountUuid}::uuid`;
    return { deleted: true };
  }

  async testCloudflareAccount(accountUuid: string) {
    await this.ensureSchema();
    const account = await this.getCloudflareAccountSecret(accountUuid);
    const tokenStatus = await this.cloudflareEmail.verifyToken(this.decryptSecret(account.api_token_ciphertext));
    await this.prisma.$executeRaw`UPDATE email_cf_accounts SET last_verified_at = now(), updated_at = now() WHERE id = ${accountUuid}::uuid`;
    await this.prisma.$executeRaw`
      UPDATE email_providers SET last_verified_at = now(), updated_at = now() WHERE cloudflare_account_id = ${accountUuid}::uuid
    `;
    return { ok: true, token: tokenStatus.result || {} };
  }

  async listCloudflareSendingDomains(accountUuid: string) {
    await this.ensureSchema();
    const account = await this.getCloudflareAccountSecret(accountUuid);
    try {
      const items = await this.cloudflareEmail.listSendingDomains(
        account.account_id,
        this.decryptSecret(account.api_token_ciphertext),
      );
      return { items };
    } catch (error: any) {
      this.logger.warn(`cloudflare sending domain discovery failed for ${account.account_id}: ${error?.message || error}`);
      return {
        items: [],
        warning: 'cloudflare sending domain discovery failed',
      };
    }
  }

  async listSenders(appId?: string) {
    await this.ensureSchema();
    await this.syncCloudflareProviders();
    const rows = appId
      ? await this.prisma.$queryRaw<Row[]>`
          SELECT s.*, COALESCE(s.provider_id, p.id) AS provider_id,
                 p.name AS provider_name, p.provider_type, p.cloudflare_account_id,
                 a.name AS cf_account_name, app.slug AS app_slug, app.name AS app_name
          FROM email_senders s
          LEFT JOIN email_providers p ON p.id = s.provider_id OR (s.provider_id IS NULL AND p.cloudflare_account_id = s.cf_account_id)
          LEFT JOIN email_cf_accounts a ON a.id = s.cf_account_id OR a.id = p.cloudflare_account_id
          LEFT JOIN apps app ON app.id = s.app_id
          WHERE s.app_id IS NULL OR s.app_id = ${appId}::uuid
          ORDER BY s.updated_at DESC
        `
      : await this.prisma.$queryRaw<Row[]>`
          SELECT s.*, COALESCE(s.provider_id, p.id) AS provider_id,
                 p.name AS provider_name, p.provider_type, p.cloudflare_account_id,
                 a.name AS cf_account_name, app.slug AS app_slug, app.name AS app_name
          FROM email_senders s
          LEFT JOIN email_providers p ON p.id = s.provider_id OR (s.provider_id IS NULL AND p.cloudflare_account_id = s.cf_account_id)
          LEFT JOIN email_cf_accounts a ON a.id = s.cf_account_id OR a.id = p.cloudflare_account_id
          LEFT JOIN apps app ON app.id = s.app_id
          ORDER BY s.updated_at DESC
        `;
    return { items: rows };
  }

  async createSender(actorUserId: string, payload: unknown) {
    await this.ensureSchema();
    const body = asObject(payload);
    const providerId = this.requiredString(body.provider_id || body.providerId || body.cf_account_id || body.cfAccountId, 'provider_id', 80);
    const provider = await this.getProviderSecret(providerId);
    const cfAccountId = provider.cloudflare_account_id || null;
    const email = this.requiredEmail(body.email);
    const displayName = this.optionalString(body.display_name || body.displayName, 160);
    const domain = email.split('@')[1];
    const purpose = this.normalizePurpose(body.purpose);
    const status = this.normalizeActiveStatus(body.status);
    const appId = this.optionalUuid(body.app_id || body.appId);
    const isDefault = Boolean(body.is_default || body.isDefault);

    const rows = await this.prisma.$queryRaw<Row[]>`
      INSERT INTO email_senders (provider_id, cf_account_id, app_id, email, display_name, domain, purpose, status, is_default, created_by_user_id)
      VALUES (${provider.id}::uuid, ${cfAccountId}::uuid, ${appId}::uuid, ${email}, ${displayName}, ${domain}, ${purpose}, ${status}, ${isDefault}, ${actorUserId}::uuid)
      ON CONFLICT (LOWER(email)) DO UPDATE SET
        provider_id = EXCLUDED.provider_id,
        cf_account_id = EXCLUDED.cf_account_id,
        app_id = EXCLUDED.app_id,
        display_name = EXCLUDED.display_name,
        domain = EXCLUDED.domain,
        purpose = EXCLUDED.purpose,
        status = EXCLUDED.status,
        is_default = EXCLUDED.is_default,
        updated_at = now()
      RETURNING *
    `;
    return rows[0];
  }

  async updateSender(senderId: string, payload: unknown) {
    await this.ensureSchema();
    const current = await this.getSender(senderId);
    const body = asObject(payload);
    const providerId = this.optionalUuid(body.provider_id || body.providerId || body.cf_account_id || body.cfAccountId) || current.provider_id;
    const provider = providerId ? await this.getProviderSecret(providerId) : null;
    const cfAccountId = provider?.cloudflare_account_id || current.cf_account_id || null;
    const email = body.email === undefined ? current.email : this.requiredEmail(body.email);
    const displayName = body.display_name === undefined && body.displayName === undefined ? current.display_name : this.optionalString(body.display_name || body.displayName, 160);
    const domain = email.split('@')[1];
    const purpose = body.purpose === undefined ? current.purpose : this.normalizePurpose(body.purpose);
    const status = body.status === undefined ? current.status : this.normalizeActiveStatus(body.status);
    const appId = body.app_id === undefined && body.appId === undefined ? current.app_id : this.optionalUuid(body.app_id || body.appId);
    const isDefault = body.is_default === undefined && body.isDefault === undefined ? current.is_default : Boolean(body.is_default || body.isDefault);

    const rows = await this.prisma.$queryRaw<Row[]>`
      UPDATE email_senders
      SET provider_id = ${providerId}::uuid,
          cf_account_id = ${cfAccountId}::uuid,
          app_id = ${appId}::uuid,
          email = ${email},
          display_name = ${displayName},
          domain = ${domain},
          purpose = ${purpose},
          status = ${status},
          is_default = ${isDefault},
          updated_at = now()
      WHERE id = ${senderId}::uuid
      RETURNING *
    `;
    if (!rows[0]) throw new NotFoundException('email sender not found');
    return rows[0];
  }

  async deleteSender(senderId: string) {
    await this.ensureSchema();
    await this.prisma.$executeRaw`DELETE FROM email_senders WHERE id = ${senderId}::uuid`;
    return { deleted: true };
  }

  async testSender(senderId: string, payload: unknown) {
    await this.ensureSchema();
    const body = asObject(payload);
    const to = this.requiredEmail(body.to || body.email);
    const sender = await this.getSenderWithAccount(senderId);
    await this.sendWithSender(sender, to, {
      subject: 'Email sender test',
      html: '<p>Email sender test.</p>',
      text: 'Email sender test.',
    });
    await this.prisma.$executeRaw`UPDATE email_senders SET last_tested_at = now(), updated_at = now() WHERE id = ${senderId}::uuid`;
    return { ok: true };
  }

  async sendAppNotificationEmail(appId: string, to: string, message: { subject: string; html?: string; text?: string }) {
    await this.ensureSchema();
    const email = this.requiredEmail(to);
    const senderId = await this.resolveDefaultSenderId(appId, 'notification');
    const sender = await this.requireSenderForApp(senderId, appId, 'notification');
    await this.sendWithSender(sender, email, message);
    return { ok: true, sender_id: senderId };
  }

  async getAppEmailSettings(appId: string) {
    await this.ensureSchema();
    await this.requireApp(appId);
    const settingsRows = await this.prisma.$queryRaw<Row[]>`
      SELECT * FROM app_email_settings WHERE app_id = ${appId}::uuid
    `;
    const senders = await this.listSenders(appId);
    return {
      settings: settingsRows[0] || { app_id: appId },
      senders: senders.items,
    };
  }

  async updateAppEmailSettings(appId: string, payload: unknown) {
    await this.ensureSchema();
    await this.requireApp(appId);
    const body = asObject(payload);
    const marketingSenderId = this.optionalUuid(body.marketing_sender_id || body.marketingSenderId);
    const notificationSenderId = this.optionalUuid(body.notification_sender_id || body.notificationSenderId);
    if (marketingSenderId) await this.requireSenderForApp(marketingSenderId, appId, 'marketing');
    if (notificationSenderId) await this.requireSenderForApp(notificationSenderId, appId, 'notification');
    const unsubscribeBaseUrl = this.optionalString(body.unsubscribe_base_url || body.unsubscribeBaseUrl, 2048);
    const brandName = this.optionalString(body.brand_name || body.brandName, 160);
    const footerText = this.optionalString(body.footer_text || body.footerText, 4000);
    const replyToEmail = body.reply_to_email || body.replyToEmail ? this.requiredEmail(body.reply_to_email || body.replyToEmail) : null;
    const rows = await this.prisma.$queryRaw<Row[]>`
      INSERT INTO app_email_settings (app_id, marketing_sender_id, notification_sender_id, unsubscribe_base_url, brand_name, footer_text, reply_to_email)
      VALUES (${appId}::uuid, ${marketingSenderId}::uuid, ${notificationSenderId}::uuid, ${unsubscribeBaseUrl}, ${brandName}, ${footerText}, ${replyToEmail})
      ON CONFLICT (app_id) DO UPDATE SET
        marketing_sender_id = EXCLUDED.marketing_sender_id,
        notification_sender_id = EXCLUDED.notification_sender_id,
        unsubscribe_base_url = EXCLUDED.unsubscribe_base_url,
        brand_name = EXCLUDED.brand_name,
        footer_text = EXCLUDED.footer_text,
        reply_to_email = EXCLUDED.reply_to_email,
        updated_at = now()
      RETURNING *
    `;
    return { settings: rows[0] };
  }

  async listContacts(appId: string, query: Record<string, unknown>) {
    await this.ensureSchema();
    const page = this.normalizePage(query.page);
    const pageSize = this.normalizePageSize(query.page_size || query.pageSize);
    const status = this.optionalString(query.status, 32);
    const q = this.optionalString(query.q, 160);
    const like = q ? `%${q.toLowerCase()}%` : null;
    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT *, COUNT(*) OVER()::int AS total_count
      FROM email_contacts
      WHERE app_id = ${appId}::uuid
        AND (${status}::text IS NULL OR status = ${status})
        AND (${like}::text IS NULL OR LOWER(email) LIKE ${like} OR LOWER(COALESCE(display_name, '')) LIKE ${like})
      ORDER BY updated_at DESC
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
    `;
    return { items: rows, total: rows[0]?.total_count || 0, page, page_size: pageSize };
  }

  async importContacts(appId: string, payload: unknown) {
    await this.ensureSchema();
    await this.requireApp(appId);
    const body = asObject(payload);
    const rows = Array.isArray(body.items) ? body.items : this.parseContactLines(String(body.text || ''));
    let imported = 0;
    for (const raw of rows) {
      const item = asObject(raw);
      const email = this.normalizeEmail(item.email || raw);
      if (!email) continue;
      const displayName = this.optionalString(item.display_name || item.displayName || item.name, 160);
      await this.prisma.$executeRaw`
        INSERT INTO email_contacts (app_id, email, display_name, source, status)
        VALUES (${appId}::uuid, ${email}, ${displayName}, 'import', 'subscribed')
        ON CONFLICT (app_id, LOWER(email)) DO UPDATE SET
          display_name = COALESCE(EXCLUDED.display_name, email_contacts.display_name),
          status = CASE WHEN email_contacts.status = 'unsubscribed' THEN email_contacts.status ELSE 'subscribed' END,
          updated_at = now()
      `;
      imported += 1;
    }
    return { imported };
  }

  async updateContact(appId: string, contactId: string, payload: unknown) {
    await this.ensureSchema();
    const body = asObject(payload);
    const status = body.status === undefined ? null : this.normalizeContactStatus(body.status);
    const displayName = body.display_name === undefined && body.displayName === undefined ? undefined : this.optionalString(body.display_name || body.displayName, 160);
    const rows = await this.prisma.$queryRaw<Row[]>`
      UPDATE email_contacts
      SET status = COALESCE(${status}, status),
          display_name = COALESCE(${displayName}, display_name),
          updated_at = now()
      WHERE id = ${contactId}::uuid AND app_id = ${appId}::uuid
      RETURNING *
    `;
    if (!rows[0]) throw new NotFoundException('email contact not found');
    if (status === 'unsubscribed' || status === 'suppressed') {
      await this.suppressEmail(appId, rows[0].email, status === 'unsubscribed' ? 'unsubscribe' : 'manual');
    }
    return rows[0];
  }

  async listTemplates(appId: string) {
    await this.ensureSchema();
    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT * FROM email_templates WHERE app_id = ${appId}::uuid ORDER BY updated_at DESC
    `;
    return { items: rows };
  }

  async saveTemplate(appId: string, payload: unknown, templateId?: string) {
    await this.ensureSchema();
    const body = asObject(payload);
    const name = this.requiredString(body.name, 'name', 160);
    const subject = this.requiredString(body.subject, 'subject', 240);
    const html = this.requiredString(body.html, 'html', 200000);
    const text = this.optionalString(body.text, 200000);
    if (templateId) {
      const rows = await this.prisma.$queryRaw<Row[]>`
        UPDATE email_templates
        SET name = ${name}, subject = ${subject}, html = ${html}, text = ${text}, updated_at = now()
        WHERE id = ${templateId}::uuid AND app_id = ${appId}::uuid
        RETURNING *
      `;
      if (!rows[0]) throw new NotFoundException('email template not found');
      return rows[0];
    }
    const rows = await this.prisma.$queryRaw<Row[]>`
      INSERT INTO email_templates (app_id, name, subject, html, text)
      VALUES (${appId}::uuid, ${name}, ${subject}, ${html}, ${text})
      RETURNING *
    `;
    return rows[0];
  }

  async listCampaigns(appId: string, query: Record<string, unknown>) {
    await this.ensureSchema();
    const page = this.normalizePage(query.page);
    const pageSize = this.normalizePageSize(query.page_size || query.pageSize);
    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT c.*, s.email AS sender_email, s.display_name AS sender_display_name,
             COALESCE(r.retry_count, 0)::int AS retry_count,
             COUNT(*) OVER()::int AS total_count
      FROM email_campaigns c
      LEFT JOIN email_senders s ON s.id = c.sender_id
      LEFT JOIN (
        SELECT campaign_id, COUNT(*) AS retry_count
        FROM email_campaign_recipients
        WHERE status = 'retry'
        GROUP BY campaign_id
      ) r ON r.campaign_id = c.id
      WHERE c.app_id = ${appId}::uuid
      ORDER BY c.updated_at DESC
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
    `;
    return { items: rows, total: rows[0]?.total_count || 0, page, page_size: pageSize };
  }

  async createCampaign(appId: string, actorUserId: string, payload: unknown) {
    await this.ensureSchema();
    const body = asObject(payload);
    const templateId = this.optionalUuid(body.template_id || body.templateId);
    let template: Row | null = null;
    if (templateId) {
      const rows = await this.prisma.$queryRaw<Row[]>`SELECT * FROM email_templates WHERE id = ${templateId}::uuid AND app_id = ${appId}::uuid`;
      template = rows[0] || null;
      if (!template) throw new NotFoundException('email template not found');
    }
    const name = this.requiredString(body.name || template?.name, 'name', 180);
    const subject = this.requiredString(body.subject || template?.subject, 'subject', 240);
    const html = this.requiredString(body.html || template?.html, 'html', 200000);
    const text = this.optionalString(body.text || template?.text, 200000);
    const senderId = this.optionalUuid(body.sender_id || body.senderId) || (await this.resolveDefaultSenderId(appId, 'marketing'));
    await this.requireSenderForApp(senderId, appId, 'marketing');
    const rows = await this.prisma.$queryRaw<Row[]>`
      INSERT INTO email_campaigns (app_id, sender_id, template_id, name, subject, html, text, audience_type, created_by_user_id)
      VALUES (${appId}::uuid, ${senderId}::uuid, ${templateId}::uuid, ${name}, ${subject}, ${html}, ${text}, 'all', ${actorUserId}::uuid)
      RETURNING *
    `;
    return rows[0];
  }

  async sendTestCampaign(appId: string, campaignId: string, payload: unknown) {
    await this.ensureSchema();
    const body = asObject(payload);
    const to = this.requiredEmail(body.to || body.email);
    const campaign = await this.getCampaign(appId, campaignId);
    const sender = await this.requireSenderForApp(campaign.sender_id, appId, 'marketing');
    await this.sendWithSender(sender, to, {
      subject: campaign.subject,
      html: this.renderTemplate(campaign.html, { email: to, display_name: 'Test' }),
      text: campaign.text ? this.renderTemplate(campaign.text, { email: to, display_name: 'Test' }) : undefined,
    });
    return { ok: true };
  }

  async scheduleCampaign(appId: string, campaignId: string, payload: unknown) {
    await this.ensureSchema();
    const campaign = await this.getCampaign(appId, campaignId);
    if (!campaign.sender_id) throw new BadRequestException('sender is required');
    await this.requireSenderForApp(campaign.sender_id, appId, 'marketing');
    const body = asObject(payload);
    const scheduledAt = this.optionalString(body.scheduled_at || body.scheduledAt, 80);
    const eligibleRows = await this.prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count
      FROM email_contacts c
      WHERE c.app_id = ${appId}::uuid AND c.status = 'subscribed'
    `;
    if (Number(eligibleRows[0]?.count || 0) > EMAIL_MAX_CAMPAIGN_RECIPIENTS) {
      throw new BadRequestException(`email campaign recipient limit is ${EMAIL_MAX_CAMPAIGN_RECIPIENTS}`);
    }
    const rows = await this.prisma.$queryRaw<Row[]>`
      INSERT INTO email_campaign_recipients (campaign_id, contact_id, email_snapshot, display_name_snapshot, status)
      SELECT ${campaignId}::uuid, c.id, c.email, c.display_name,
             CASE WHEN s.id IS NULL THEN 'pending' ELSE 'skipped' END
      FROM email_contacts c
      LEFT JOIN email_suppression_list s ON s.app_id = c.app_id AND LOWER(s.email) = LOWER(c.email)
      WHERE c.app_id = ${appId}::uuid AND c.status = 'subscribed'
      ON CONFLICT (campaign_id, LOWER(email_snapshot)) DO NOTHING
      RETURNING id
    `;
    await this.prisma.$executeRaw`
      UPDATE email_campaigns
      SET status = 'scheduled',
          scheduled_at = COALESCE(${scheduledAt}::timestamptz, now()),
          recipient_total = (SELECT COUNT(*)::int FROM email_campaign_recipients WHERE campaign_id = ${campaignId}::uuid),
          skipped_count = (SELECT COUNT(*)::int FROM email_campaign_recipients WHERE campaign_id = ${campaignId}::uuid AND status = 'skipped'),
          updated_at = now()
      WHERE id = ${campaignId}::uuid AND app_id = ${appId}::uuid
    `;
    return { scheduled: true, recipients_created: rows.length };
  }

  async cancelCampaign(appId: string, campaignId: string) {
    await this.ensureSchema();
    await this.prisma.$executeRaw`
      UPDATE email_campaigns SET status = 'cancelled', updated_at = now()
      WHERE id = ${campaignId}::uuid AND app_id = ${appId}::uuid AND status IN ('draft', 'scheduled', 'paused')
    `;
    await this.prisma.$executeRaw`
      UPDATE email_campaign_recipients
      SET status = 'skipped', updated_at = now()
      WHERE campaign_id = ${campaignId}::uuid AND status = 'pending'
    `;
    await this.refreshCampaignCounts(campaignId);
    return { cancelled: true };
  }

  async listCampaignRecipients(appId: string, campaignId: string, query: Record<string, unknown>) {
    await this.ensureSchema();
    await this.getCampaign(appId, campaignId);
    const page = this.normalizePage(query.page);
    const pageSize = this.normalizePageSize(query.page_size || query.pageSize);
    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT *, COUNT(*) OVER()::int AS total_count
      FROM email_campaign_recipients
      WHERE campaign_id = ${campaignId}::uuid
      ORDER BY created_at DESC
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
    `;
    return { items: rows, total: rows[0]?.total_count || 0, page, page_size: pageSize };
  }

  async unsubscribe(appSlug: string | undefined, token: string, emailRaw?: string) {
    await this.ensureSchema();
    const app = await this.resolveAppBySlug(appSlug);
    const email = this.normalizeEmail(emailRaw);
    if (!email || !this.verifyUnsubscribeToken(app.id, email, token)) {
      throw new BadRequestException('invalid unsubscribe token');
    }
    await this.suppressEmail(app.id, email, 'unsubscribe');
    await this.prisma.$executeRaw`
      UPDATE email_contacts SET status = 'unsubscribed', updated_at = now()
      WHERE app_id = ${app.id}::uuid AND LOWER(email) = LOWER(${email})
    `;
    return { ok: true };
  }

  @Interval(30000)
  async processPendingDeliveries() {
    if (this.processing) return;
    this.processing = true;
    try {
      await this.ensureSchema();
      const due = await this.claimDueRecipients();
      for (const item of due) {
        await this.deliverRecipient(item);
      }
    } catch (error: any) {
      this.logger.warn(`email delivery loop failed: ${error?.message || error}`);
    } finally {
      this.processing = false;
    }
  }

  private async deliverRecipient(item: Row) {
    const campaignStatus = await this.prisma.$queryRaw<Row[]>`
      SELECT status FROM email_campaigns WHERE id = ${item.campaign_id}::uuid
    `;
    if (!['scheduled', 'sending'].includes(String(campaignStatus[0]?.status || ''))) {
      await this.prisma.$executeRaw`
        UPDATE email_campaign_recipients
        SET status = 'skipped', updated_at = now()
        WHERE id = ${item.id}::uuid AND status = 'sending'
      `;
      return;
    }
    await this.prisma.$executeRaw`UPDATE email_campaigns SET status = 'sending', updated_at = now() WHERE id = ${item.campaign_id}::uuid`;
    const unsubscribeUrl = await this.buildUnsubscribeUrl(item.app_id, item.email_snapshot);
    const footer = this.optionalString(item.footer_text, 4000);
    const htmlFooter = `${footer ? `<p>${this.escapeHtml(footer)}</p>` : ''}<p><a href="${unsubscribeUrl}">退订</a></p>`;
    const textFooter = `${footer ? `\n\n${footer}` : ''}\n\n退订：${unsubscribeUrl}`;
    try {
      const result = await this.dispatchEmail(item, {
        from: item.sender_display_name ? { address: item.sender_email, name: item.sender_display_name } : item.sender_email,
        to: [item.email_snapshot],
        subject: item.subject,
        html: `${this.renderTemplate(item.html, { email: item.email_snapshot, display_name: item.display_name_snapshot || '' })}${htmlFooter}`,
        text: item.text ? `${this.renderTemplate(item.text, { email: item.email_snapshot, display_name: item.display_name_snapshot || '' })}${textFooter}` : textFooter.trim(),
        reply_to: this.normalizeEmail(item.reply_to_email) || undefined,
        headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>` },
      });
      const deliveryResult = result.result || {};
      const delivered = deliveryResult.delivered || [];
      const bounced = 'permanent_bounces' in deliveryResult ? deliveryResult.permanent_bounces || [] : [];
      const status = bounced.some((email) => email.toLowerCase() === String(item.email_snapshot).toLowerCase()) ? 'bounced' : 'delivered';
      await this.prisma.$executeRaw`
        UPDATE email_campaign_recipients
        SET status = ${status}, provider_message_id = ${delivered[0] || null}, sent_at = now(), updated_at = now()
        WHERE id = ${item.id}::uuid
      `;
      if (status === 'bounced') await this.suppressEmail(item.app_id, item.email_snapshot, 'bounce', item.campaign_id);
    } catch (error: any) {
      await this.markDeliveryFailure(item, error);
    }
    await this.refreshCampaignCounts(item.campaign_id);
  }

  private async claimDueRecipients() {
    return this.prisma.$transaction(async (tx) => {
      const due = await tx.$queryRaw<Row[]>`
        SELECT r.id
        FROM email_campaign_recipients r
        JOIN email_campaigns c ON c.id = r.campaign_id
        JOIN email_senders s ON s.id = c.sender_id
        JOIN email_providers p ON p.id = s.provider_id OR (s.provider_id IS NULL AND p.cloudflare_account_id = s.cf_account_id)
        WHERE r.status IN ('pending', 'retry')
          AND COALESCE(r.next_retry_at, now()) <= now()
          AND c.status IN ('scheduled', 'sending')
          AND COALESCE(c.scheduled_at, now()) <= now()
          AND s.status = 'ACTIVE'
          AND p.status = 'ACTIVE'
        ORDER BY r.created_at
        LIMIT ${EMAIL_DELIVERY_BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      `;
      const ids = due.map((row) => row.id);
      if (!ids.length) return [];
      return tx.$queryRaw<Row[]>`
        UPDATE email_campaign_recipients r
        SET status = 'sending',
            claimed_at = now(),
            last_attempt_at = now(),
            attempt_count = attempt_count + 1,
            updated_at = now()
        FROM email_campaigns c
        JOIN email_senders s ON s.id = c.sender_id
        JOIN email_providers p ON p.id = s.provider_id OR (s.provider_id IS NULL AND p.cloudflare_account_id = s.cf_account_id)
        LEFT JOIN email_cf_accounts a ON a.id = p.cloudflare_account_id
        LEFT JOIN app_email_settings es ON es.app_id = c.app_id
        WHERE r.campaign_id = c.id
          AND r.id = ANY(${ids}::uuid[])
        RETURNING r.id, r.email_snapshot, r.display_name_snapshot, r.attempt_count,
                  c.id AS campaign_id, c.app_id, c.subject, c.html, c.text,
                  s.id AS sender_id, s.email AS sender_email, s.display_name AS sender_display_name,
                  p.id AS provider_id, p.provider_type, p.external_account_id, p.config_json, p.secrets_ciphertext, p.cloudflare_account_id,
                  a.account_id AS cf_account_id, a.api_token_ciphertext,
                  es.reply_to_email, es.footer_text
      `;
    });
  }

  private async markDeliveryFailure(item: Row, error: any) {
    const message = String(error?.message || error).slice(0, 2000);
    const retryable = this.isRetryableDeliveryError(error);
    const attempts = Number(item.attempt_count || 1);
    if (retryable && attempts < EMAIL_MAX_ATTEMPTS) {
      const delayMinutes = Math.min(60, 2 ** Math.max(0, attempts - 1) * 5);
      await this.prisma.$executeRaw`
        UPDATE email_campaign_recipients
        SET status = 'retry',
            error_message = ${message},
            next_retry_at = now() + (${delayMinutes}::text || ' minutes')::interval,
            updated_at = now()
        WHERE id = ${item.id}::uuid
      `;
      return;
    }
    await this.prisma.$executeRaw`
      UPDATE email_campaign_recipients
      SET status = 'failed', error_message = ${message}, next_retry_at = NULL, updated_at = now()
      WHERE id = ${item.id}::uuid
    `;
  }

  private async refreshCampaignCounts(campaignId: string) {
    await this.prisma.$executeRaw`
      UPDATE email_campaigns c
      SET delivered_count = (SELECT COUNT(*)::int FROM email_campaign_recipients WHERE campaign_id = c.id AND status IN ('delivered', 'queued')),
          failed_count = (SELECT COUNT(*)::int FROM email_campaign_recipients WHERE campaign_id = c.id AND status IN ('failed', 'bounced')),
          skipped_count = (SELECT COUNT(*)::int FROM email_campaign_recipients WHERE campaign_id = c.id AND status = 'skipped'),
          recipient_total = (SELECT COUNT(*)::int FROM email_campaign_recipients WHERE campaign_id = c.id),
          status = CASE
            WHEN c.status = 'cancelled' THEN c.status
            WHEN NOT EXISTS (SELECT 1 FROM email_campaign_recipients WHERE campaign_id = c.id AND status IN ('pending', 'retry', 'sending')) THEN 'completed'
            ELSE c.status
          END,
          updated_at = now()
      WHERE c.id = ${campaignId}::uuid
    `;
  }

  private async sendWithSender(sender: Row, to: string, message: { subject: string; html?: string; text?: string }) {
    return this.dispatchEmail(sender, {
      from: sender.display_name ? { address: sender.email, name: sender.display_name } : sender.email,
      to: [to],
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
  }

  private async getCloudflareAccountSecret(accountUuid: string) {
    const rows = await this.prisma.$queryRaw<Row[]>`SELECT * FROM email_cf_accounts WHERE id = ${accountUuid}::uuid`;
    if (!rows[0]) throw new NotFoundException('cloudflare account not found');
    return rows[0];
  }

  private async resolveCloudflareAccountFromToken(apiToken: string, selectedAccountId?: string | null) {
    await this.cloudflareEmail.verifyToken(apiToken);
    const accounts = await this.safeListCloudflareAccounts(apiToken);

    if (selectedAccountId) {
      if (!accounts.length) return { id: selectedAccountId, name: selectedAccountId };
      const matched = accounts.find((account) => account.id === selectedAccountId);
      if (!matched) throw new BadRequestException('cloudflare token cannot access selected account');
      return { id: matched.id, name: matched.name };
    }

    if (!accounts.length) throw new BadRequestException('cloudflare account_id is required');

    if (accounts.length > 1) {
      throw new BadRequestException('cloudflare account_id is required when token can access multiple accounts');
    }

    return { id: accounts[0].id, name: accounts[0].name };
  }

  private async safeListCloudflareAccounts(apiToken: string) {
    try {
      return await this.cloudflareEmail.listAccounts(apiToken);
    } catch (error: any) {
      this.logger.warn(`cloudflare account discovery failed: ${error?.message || error}`);
      return [];
    }
  }

  private async getSender(senderId: string) {
    const rows = await this.prisma.$queryRaw<Row[]>`SELECT * FROM email_senders WHERE id = ${senderId}::uuid`;
    if (!rows[0]) throw new NotFoundException('email sender not found');
    return rows[0];
  }

  private async getSenderWithAccount(senderId: string) {
    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT s.*, p.id AS provider_id, p.provider_type, p.external_account_id, p.config_json, p.secrets_ciphertext, p.cloudflare_account_id,
             a.account_id AS cf_account_id, a.api_token_ciphertext
      FROM email_senders s
      JOIN email_providers p ON p.id = s.provider_id OR (s.provider_id IS NULL AND p.cloudflare_account_id = s.cf_account_id)
      LEFT JOIN email_cf_accounts a ON a.id = p.cloudflare_account_id
      WHERE s.id = ${senderId}::uuid
    `;
    if (!rows[0]) throw new NotFoundException('email sender not found');
    return rows[0];
  }

  private async requireSenderForApp(senderId: string, appId: string, purpose?: 'marketing' | 'notification') {
    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT s.*, p.id AS provider_id, p.provider_type, p.external_account_id, p.config_json, p.secrets_ciphertext, p.cloudflare_account_id,
             a.account_id AS cf_account_id, a.api_token_ciphertext
      FROM email_senders s
      JOIN email_providers p ON p.id = s.provider_id OR (s.provider_id IS NULL AND p.cloudflare_account_id = s.cf_account_id)
      LEFT JOIN email_cf_accounts a ON a.id = p.cloudflare_account_id
      WHERE s.id = ${senderId}::uuid
        AND (s.app_id IS NULL OR s.app_id = ${appId}::uuid)
        AND s.status = 'ACTIVE'
        AND p.status = 'ACTIVE'
        AND (${purpose || null}::text IS NULL OR s.purpose IN (${purpose || null}, 'both'))
    `;
    if (!rows[0]) throw new BadRequestException('email sender is not available for this app');
    return rows[0];
  }

  private async dispatchEmail(sender: Row, payload: {
    from: string | { address: string; name?: string };
    to: string[];
    subject: string;
    html?: string;
    text?: string;
    reply_to?: string;
    headers?: Record<string, string>;
  }) {
    const providerType = this.normalizeProviderType(sender.provider_type || 'CLOUDFLARE_EMAIL');
    const config = asObject(sender.config_json);
    const secrets = await this.getProviderSecrets(sender);
    if (providerType === 'CLOUDFLARE_EMAIL') {
      const accountId = String(config.account_id || sender.external_account_id || sender.cf_account_id || '');
      return this.cloudflareEmail.send(accountId, String(secrets.api_token || ''), payload);
    }
    if (providerType === 'SMTP') return this.sendViaSmtp(config, secrets, payload);
    if (providerType === 'RESEND') return this.sendViaResend(secrets, payload);
    if (providerType === 'SENDGRID') return this.sendViaSendGrid(secrets, payload);
    if (providerType === 'POSTMARK') return this.sendViaPostmark(secrets, payload);
    if (providerType === 'MAILGUN') return this.sendViaMailgun(config, secrets, payload);
    throw new BadRequestException('unsupported email provider');
  }

  private async sendViaSmtp(config: Row, secrets: Row, payload: {
    from: string | { address: string; name?: string };
    to: string[];
    subject: string;
    html?: string;
    text?: string;
    reply_to?: string;
    headers?: Record<string, string>;
  }) {
    const transporter = nodemailer.createTransport({
      host: String(config.host || ''),
      port: Number(config.port || 465),
      secure: config.secure === false || config.secure === 'false' ? false : true,
      auth: {
        user: String(secrets.username || ''),
        pass: String(secrets.password || ''),
      },
    });
    const info = await transporter.sendMail({
      from: this.formatEmailAddress(payload.from),
      to: payload.to.join(','),
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
      replyTo: payload.reply_to,
      headers: payload.headers,
    });
    return { success: true, result: { delivered: [String(info.messageId || '')].filter(Boolean) } };
  }

  private async sendViaResend(secrets: Row, payload: Row) {
    const response = await this.httpJson('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${secrets.api_key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: this.formatEmailAddress(payload.from),
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
        reply_to: payload.reply_to,
        headers: payload.headers,
      }),
    }, 'Resend');
    return { success: true, result: { delivered: [String(response.id || '')].filter(Boolean) } };
  }

  private async sendViaSendGrid(secrets: Row, payload: Row) {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${secrets.api_key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: payload.to.map((email: string) => ({ email })) }],
        from: this.toSendGridAddress(payload.from),
        reply_to: payload.reply_to ? { email: payload.reply_to } : undefined,
        subject: payload.subject,
        content: [
          payload.text ? { type: 'text/plain', value: payload.text } : null,
          payload.html ? { type: 'text/html', value: payload.html } : null,
        ].filter(Boolean),
        headers: payload.headers,
      }),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new BadRequestException(`SendGrid email send failed: ${text || response.status}`);
    }
    return { success: true, result: { delivered: [response.headers.get('x-message-id') || ''].filter(Boolean) } };
  }

  private async sendViaPostmark(secrets: Row, payload: Row) {
    const response = await this.httpJson('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: { 'X-Postmark-Server-Token': String(secrets.server_token || ''), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        From: this.formatEmailAddress(payload.from),
        To: payload.to.join(','),
        Subject: payload.subject,
        HtmlBody: payload.html,
        TextBody: payload.text,
        ReplyTo: payload.reply_to,
        Headers: Object.entries(payload.headers || {}).map(([Name, Value]) => ({ Name, Value })),
      }),
    }, 'Postmark');
    return { success: true, result: { delivered: [String(response.MessageID || '')].filter(Boolean) } };
  }

  private async sendViaMailgun(config: Row, secrets: Row, payload: Row) {
    const domain = this.requiredString(config.domain, 'mailgun domain', 255);
    const baseUrl = String(config.api_base_url || 'https://api.mailgun.net').replace(/\/+$/, '');
    const form = new URLSearchParams();
    form.set('from', this.formatEmailAddress(payload.from));
    for (const email of payload.to || []) form.append('to', email);
    form.set('subject', payload.subject);
    if (payload.html) form.set('html', payload.html);
    if (payload.text) form.set('text', payload.text);
    if (payload.reply_to) form.set('h:Reply-To', payload.reply_to);
    for (const [key, value] of Object.entries(payload.headers || {})) form.set(`h:${key}`, String(value));
    const response = await this.httpJson(`${baseUrl}/v3/${encodeURIComponent(domain)}/messages`, {
      method: 'POST',
      headers: { Authorization: `Basic ${Buffer.from(`api:${secrets.api_key}`).toString('base64')}` },
      body: form,
    }, 'Mailgun');
    return { success: true, result: { delivered: [String(response.id || '')].filter(Boolean) } };
  }

  private async getCampaign(appId: string, campaignId: string) {
    const rows = await this.prisma.$queryRaw<Row[]>`SELECT * FROM email_campaigns WHERE id = ${campaignId}::uuid AND app_id = ${appId}::uuid`;
    if (!rows[0]) throw new NotFoundException('email campaign not found');
    return rows[0];
  }

  private async resolveDefaultSenderId(appId: string, purpose: 'marketing' | 'notification') {
    const settingsRows = await this.prisma.$queryRaw<Row[]>`
      SELECT marketing_sender_id, notification_sender_id
      FROM app_email_settings
      WHERE app_id = ${appId}::uuid
    `;
    const configured = purpose === 'marketing' ? settingsRows[0]?.marketing_sender_id : settingsRows[0]?.notification_sender_id;
    if (configured) return configured;

    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT id AS sender_id
      FROM email_senders
      WHERE (app_id = ${appId}::uuid OR app_id IS NULL)
        AND status = 'ACTIVE'
        AND purpose IN (${purpose}, 'both')
      ORDER BY is_default DESC, app_id NULLS LAST, updated_at DESC
      LIMIT 1
    `;
    const senderId = rows[0]?.sender_id;
    if (!senderId) throw new BadRequestException('email sender is required');
    return senderId;
  }

  private async requireApp(appId: string) {
    const rows = await this.prisma.$queryRaw<Row[]>`SELECT id, slug, name FROM apps WHERE id = ${appId}::uuid`;
    if (!rows[0]) throw new NotFoundException('app not found');
    return rows[0];
  }

  private async resolveAppBySlug(appSlug?: string) {
    const slug = this.optionalString(appSlug, 80);
    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT id, slug, name FROM apps WHERE slug = COALESCE(${slug}, slug) ORDER BY created_at LIMIT 1
    `;
    if (!rows[0]) throw new NotFoundException('app not found');
    return rows[0];
  }

  private async buildUnsubscribeUrl(appId: string, email: string) {
    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT a.slug, s.unsubscribe_base_url
      FROM apps a LEFT JOIN app_email_settings s ON s.app_id = a.id
      WHERE a.id = ${appId}::uuid
    `;
    const app = rows[0];
    const base = this.optionalString(app?.unsubscribe_base_url, 2048) || `/${app?.slug || 'app'}/v1/email/unsubscribe`;
    const token = this.signUnsubscribeToken(appId, email);
    const separator = base.includes('?') ? '&' : '?';
    return `${base}${separator}email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`;
  }

  private async suppressEmail(appId: string, email: string, reason: string, campaignId?: string) {
    await this.prisma.$executeRaw`
      INSERT INTO email_suppression_list (app_id, email, reason, campaign_id)
      VALUES (${appId}::uuid, ${email}, ${reason}, ${campaignId || null}::uuid)
      ON CONFLICT (app_id, LOWER(email)) DO UPDATE SET reason = EXCLUDED.reason, campaign_id = EXCLUDED.campaign_id, created_at = now()
    `;
  }

  private renderTemplate(input: string, variables: Record<string, string>) {
    return String(input || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => variables[key] || '');
  }

  private escapeHtml(input: string) {
    return String(input || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private parseContactLines(text: string) {
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [email, ...nameParts] = line.split(/[,，\t]/).map((part) => part.trim());
        return { email, display_name: nameParts.join(' ') || undefined };
      });
  }

  private async syncCloudflareProviders() {
    await this.prisma.$executeRaw`
      INSERT INTO email_providers (
        provider_type, name, external_account_id, status, config_json, cloudflare_account_id,
        notes, last_verified_at, created_by_user_id, created_at, updated_at
      )
      SELECT 'CLOUDFLARE_EMAIL', a.name, a.account_id, a.status, jsonb_build_object('account_id', a.account_id),
             a.id, a.notes, a.last_verified_at, a.created_by_user_id, a.created_at, a.updated_at
      FROM email_cf_accounts a
      ON CONFLICT (cloudflare_account_id) WHERE cloudflare_account_id IS NOT NULL DO UPDATE SET
        name = EXCLUDED.name,
        external_account_id = EXCLUDED.external_account_id,
        status = EXCLUDED.status,
        config_json = EXCLUDED.config_json,
        notes = EXCLUDED.notes,
        last_verified_at = EXCLUDED.last_verified_at,
        updated_at = now()
    `;
    await this.prisma.$executeRaw`
      UPDATE email_senders s
      SET provider_id = p.id
      FROM email_providers p
      WHERE p.cloudflare_account_id = s.cf_account_id
        AND s.provider_id IS NULL
    `;
  }

  private serializeProvider(row: Row) {
    const config = asObject(row.config_json);
    return {
      id: row.id,
      provider_type: row.provider_type,
      name: row.name,
      external_account_id: row.external_account_id || row.cf_account_id || null,
      status: row.status,
      config,
      cloudflare_account_id: row.cloudflare_account_id || null,
      notes: row.notes || null,
      last_verified_at: row.last_verified_at || null,
      created_at: row.created_at || null,
      updated_at: row.updated_at || null,
    };
  }

  private async getProviderByCloudflareAccountId(accountId: string) {
    await this.syncCloudflareProviders();
    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT p.*, a.account_id AS cf_account_id
      FROM email_providers p
      LEFT JOIN email_cf_accounts a ON a.id = p.cloudflare_account_id
      WHERE p.cloudflare_account_id = ${accountId}::uuid
      LIMIT 1
    `;
    if (!rows[0]) throw new NotFoundException('email provider not found');
    return this.serializeProvider(rows[0]);
  }

  private async getProviderSecret(providerId: string) {
    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT p.*, a.account_id AS cf_account_id, a.api_token_ciphertext
      FROM email_providers p
      LEFT JOIN email_cf_accounts a ON a.id = p.cloudflare_account_id
      WHERE p.id = ${providerId}::uuid OR p.cloudflare_account_id = ${providerId}::uuid
      LIMIT 1
    `;
    if (!rows[0]) throw new NotFoundException('email provider not found');
    return rows[0];
  }

  private async getProviderSecrets(provider: Row) {
    if (provider.provider_type === 'CLOUDFLARE_EMAIL' && provider.api_token_ciphertext) {
      return { api_token: this.decryptSecret(provider.api_token_ciphertext) };
    }
    if (!provider.secrets_ciphertext) return {};
    return this.decryptJsonSecret(provider.secrets_ciphertext);
  }

  private decryptJsonSecret(value: string) {
    try {
      return asObject(JSON.parse(this.decryptSecret(value)));
    } catch {
      throw new BadRequestException('invalid encrypted provider secrets');
    }
  }

  private normalizeProviderType(value: unknown): EmailProviderType {
    const normalized = String(value || 'CLOUDFLARE_EMAIL').toUpperCase();
    if (EMAIL_PROVIDER_TYPES.includes(normalized as EmailProviderType)) return normalized as EmailProviderType;
    throw new BadRequestException('unsupported email provider type');
  }

  private normalizeProviderConfig(providerType: EmailProviderType, input: Row) {
    if (providerType === 'SMTP') {
      return {
        host: this.optionalString(input.host, 255),
        port: Number(input.port || 465),
        secure: input.secure === false || input.secure === 'false' ? false : true,
      };
    }
    if (providerType === 'MAILGUN') {
      return {
        domain: this.optionalString(input.domain, 255),
        api_base_url: this.optionalString(input.api_base_url || input.apiBaseUrl, 255) || 'https://api.mailgun.net',
      };
    }
    return {};
  }

  private normalizeProviderSecrets(providerType: EmailProviderType, input: Row) {
    if (providerType === 'SMTP') {
      return {
        username: this.optionalString(input.username, 512),
        password: this.optionalString(input.password, 2048),
      };
    }
    if (providerType === 'POSTMARK') {
      return { server_token: this.optionalString(input.server_token || input.serverToken, 2048) };
    }
    return { api_key: this.optionalString(input.api_key || input.apiKey, 2048) };
  }

  private assertProviderReady(providerType: EmailProviderType, config: Row, secrets: Row) {
    const spec = EMAIL_PROVIDER_CATALOG.find((item) => item.provider_type === providerType);
    const missing = [
      ...(spec?.required_config || []).filter((key) => config[key] === null || config[key] === undefined || config[key] === ''),
      ...(spec?.required_secrets || []).filter((key) => secrets[key] === null || secrets[key] === undefined || secrets[key] === ''),
    ];
    if (missing.length) throw new BadRequestException(`email provider missing required fields: ${missing.join(', ')}`);
  }

  private providerExternalId(providerType: EmailProviderType, config: Row) {
    if (providerType === 'MAILGUN') return this.optionalString(config.domain, 160);
    if (providerType === 'SMTP') return this.optionalString(config.host, 160);
    return null;
  }

  private async verifyProvider(provider: Row) {
    const providerType = this.normalizeProviderType(provider.provider_type);
    const config = asObject(provider.config_json);
    const secrets = await this.getProviderSecrets(provider);
    this.assertProviderReady(providerType, providerType === 'CLOUDFLARE_EMAIL' ? { account_id: provider.external_account_id || config.account_id } : config, secrets);
    if (providerType === 'CLOUDFLARE_EMAIL') {
      await this.cloudflareEmail.verifyToken(String(secrets.api_token || ''));
      return;
    }
    if (providerType === 'SMTP') {
      const transporter = nodemailer.createTransport({
        host: String(config.host || ''),
        port: Number(config.port || 465),
        secure: config.secure === false || config.secure === 'false' ? false : true,
        auth: { user: String(secrets.username || ''), pass: String(secrets.password || '') },
      });
      await transporter.verify();
      return;
    }
    if (providerType === 'RESEND') {
      await this.httpJson('https://api.resend.com/domains', { headers: { Authorization: `Bearer ${secrets.api_key}` } }, 'Resend');
      return;
    }
    if (providerType === 'SENDGRID') {
      await this.httpJson('https://api.sendgrid.com/v3/scopes', { headers: { Authorization: `Bearer ${secrets.api_key}` } }, 'SendGrid');
      return;
    }
    if (providerType === 'POSTMARK') {
      await this.httpJson('https://api.postmarkapp.com/server', { headers: { 'X-Postmark-Server-Token': String(secrets.server_token || '') } }, 'Postmark');
      return;
    }
    if (providerType === 'MAILGUN') {
      const baseUrl = String(config.api_base_url || 'https://api.mailgun.net').replace(/\/+$/, '');
      const domain = this.requiredString(config.domain, 'mailgun domain', 255);
      await this.httpJson(`${baseUrl}/v3/domains/${encodeURIComponent(domain)}`, {
        headers: { Authorization: `Basic ${Buffer.from(`api:${secrets.api_key}`).toString('base64')}` },
      }, 'Mailgun');
    }
  }

  private async httpJson(url: string, init: RequestInit, providerLabel: string) {
    const response = await fetch(url, init);
    const data = await response.json().catch(async () => ({ message: await response.text().catch(() => '') }));
    if (!response.ok) {
      const message = data?.message || data?.error || data?.errors?.[0]?.message || `${providerLabel} API failed with HTTP ${response.status}`;
      throw new BadRequestException(`${providerLabel} API failed: ${message}`);
    }
    return data as Row;
  }

  private formatEmailAddress(value: string | { address: string; name?: string }) {
    if (typeof value === 'string') return value;
    if (!value.name) return value.address;
    return `${value.name.replace(/"/g, '\\"')} <${value.address}>`;
  }

  private toSendGridAddress(value: string | { address: string; name?: string }) {
    if (typeof value === 'string') return { email: value };
    return { email: value.address, name: value.name };
  }

  private encryptSecret(value: string) {
    const iv = randomBytes(12);
    const key = this.secretKey();
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
  }

  private decryptSecret(value: string) {
    const [version, ivRaw, tagRaw, encryptedRaw] = String(value || '').split(':');
    if (version !== 'v1' || !ivRaw || !tagRaw || !encryptedRaw) {
      throw new BadRequestException('invalid encrypted secret');
    }
    const decipher = createDecipheriv('aes-256-gcm', this.secretKey(), Buffer.from(ivRaw, 'base64'));
    decipher.setAuthTag(Buffer.from(tagRaw, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(encryptedRaw, 'base64')), decipher.final()]).toString('utf8');
  }

  private secretKey() {
    return createHash('sha256')
      .update(
        process.env.PLATFORM_SECRETS_KEY
          || process.env.OUTBOUND_PROXY_ENCRYPTION_KEY
          || process.env.JWT_SECRET_KEY
          || 'email-delivery',
      )
      .digest();
  }

  private signUnsubscribeToken(appId: string, email: string) {
    return createHmac('sha256', this.secretKey()).update(`${appId}:${email.toLowerCase()}`).digest('base64url');
  }

  private verifyUnsubscribeToken(appId: string, email: string, token: string) {
    const expected = Buffer.from(this.signUnsubscribeToken(appId, email));
    const actual = Buffer.from(String(token || ''));
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  private normalizeEmail(value: unknown) {
    const email = String(value || '').trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 320 ? email : '';
  }

  private requiredEmail(value: unknown) {
    const email = this.normalizeEmail(value);
    if (!email) throw new BadRequestException('valid email is required');
    return email;
  }

  private optionalString(value: unknown, max = 255) {
    const normalized = String(value ?? '').trim();
    return normalized ? normalized.slice(0, max) : null;
  }

  private optionalCloudflareAccountId(value: unknown) {
    const normalized = this.optionalString(value, 120);
    if (!normalized) return null;
    if (/^[0-9a-f]{32}$/i.test(normalized)) return normalized;
    throw new BadRequestException('valid Cloudflare account id is required');
  }

  private requiredString(value: unknown, field: string, max = 255) {
    const normalized = this.optionalString(value, max);
    if (!normalized) throw new BadRequestException(`${field} is required`);
    return normalized;
  }

  private optionalUuid(value: unknown) {
    const normalized = String(value || '').trim();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)
      ? normalized
      : null;
  }

  private normalizeActiveStatus(value: unknown) {
    return String(value || 'ACTIVE').toUpperCase() === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';
  }

  private normalizePurpose(value: unknown) {
    const raw = String(value || 'both').toLowerCase();
    return raw === 'marketing' || raw === 'notification' ? raw : 'both';
  }

  private normalizeContactStatus(value: unknown) {
    const raw = String(value || '').toLowerCase();
    if (['subscribed', 'unsubscribed', 'bounced', 'suppressed'].includes(raw)) return raw;
    throw new BadRequestException('invalid contact status');
  }

  private isRetryableDeliveryError(error: any) {
    const status = Number(error?.status || error?.response?.status || error?.cause?.status || 0);
    if (status === 429 || status >= 500) return true;
    const message = String(error?.message || error || '').toLowerCase();
    return ['timeout', 'timed out', 'econnreset', 'socket hang up', 'network', 'temporarily'].some((token) =>
      message.includes(token),
    );
  }

  private normalizePage(value: unknown) {
    const page = Number.parseInt(String(value || '1'), 10);
    return Number.isFinite(page) && page > 0 ? page : 1;
  }

  private normalizePageSize(value: unknown) {
    const size = Number.parseInt(String(value || '20'), 10);
    return Math.min(100, Math.max(1, Number.isFinite(size) ? size : 20));
  }

  private async ensureSchema() {
    if (this.schemaReady) return;
    if (!this.schemaPromise) {
      this.schemaPromise = this.prisma
        .$queryRaw`SELECT 1 FROM email_providers LIMIT 1`
        .then(() => {
          this.schemaReady = true;
        })
        .catch((error) => {
          this.schemaPromise = null;
          throw error;
        });
    }
    await this.schemaPromise;
  }
}
