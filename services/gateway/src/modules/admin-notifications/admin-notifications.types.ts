export type AdminNotificationChannelType = 'FEISHU_ROBOT' | 'EMAIL';
export type AdminNotificationSeverity = 'info' | 'warning' | 'high' | 'critical';
export type AdminNotificationDeliveryStatus = 'pending' | 'sending' | 'sent' | 'retry' | 'failed' | 'skipped';

export interface AdminNotificationEmitInput {
  app_id?: string | null;
  event_type: string;
  severity?: AdminNotificationSeverity | string | null;
  source_module?: string | null;
  source_id?: string | null;
  title: string;
  message?: string | null;
  payload?: Record<string, unknown> | null;
  dedupe_key?: string | null;
}

export interface AdminNotificationListQuery {
  app_id?: string | null;
  channel_type?: string | null;
  event_type?: string | null;
  severity?: string | null;
  status?: string | null;
  page?: number | string | null;
  page_size?: number | string | null;
}
