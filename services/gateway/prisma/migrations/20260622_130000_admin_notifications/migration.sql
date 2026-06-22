CREATE TABLE IF NOT EXISTS admin_notification_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid NULL REFERENCES apps(id) ON DELETE CASCADE,
  channel_type varchar(32) NOT NULL,
  name varchar(120) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'ACTIVE',
  config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  secret_ciphertext text NULL,
  created_by_user_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_notification_channels_app_status
ON admin_notification_channels(app_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_notification_channels_type_status
ON admin_notification_channels(channel_type, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS admin_notification_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid NULL REFERENCES apps(id) ON DELETE CASCADE,
  event_type varchar(120) NOT NULL,
  min_severity varchar(16) NOT NULL DEFAULT 'info',
  channel_ids_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  dedupe_window_seconds integer NOT NULL DEFAULT 600,
  aggregation_window_seconds integer NOT NULL DEFAULT 0,
  quiet_hours_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_notification_rules_app_event
ON admin_notification_rules(app_id, event_type) NULLS NOT DISTINCT;

CREATE INDEX IF NOT EXISTS idx_admin_notification_rules_app_enabled
ON admin_notification_rules(app_id, enabled, event_type);

CREATE TABLE IF NOT EXISTS admin_notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid NULL REFERENCES apps(id) ON DELETE SET NULL,
  event_type varchar(120) NOT NULL,
  severity varchar(16) NOT NULL DEFAULT 'info',
  title varchar(180) NOT NULL,
  message text NULL,
  source_module varchar(80) NULL,
  source_id varchar(160) NULL,
  dedupe_key varchar(180) NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status varchar(32) NOT NULL DEFAULT 'recorded',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_notification_events_app_created
ON admin_notification_events(app_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_notification_events_type_created
ON admin_notification_events(event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_notification_events_status_created
ON admin_notification_events(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_notification_events_dedupe
ON admin_notification_events(app_id, event_type, dedupe_key, created_at DESC)
WHERE dedupe_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS admin_notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES admin_notification_events(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES admin_notification_channels(id) ON DELETE CASCADE,
  status varchar(32) NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  next_retry_at timestamptz NULL,
  provider_response_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text NULL,
  sent_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_notification_deliveries_event_channel
ON admin_notification_deliveries(event_id, channel_id);

CREATE INDEX IF NOT EXISTS idx_admin_notification_deliveries_status_retry
ON admin_notification_deliveries(status, next_retry_at, created_at);

CREATE INDEX IF NOT EXISTS idx_admin_notification_deliveries_channel_created
ON admin_notification_deliveries(channel_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_notification_deliveries_event
ON admin_notification_deliveries(event_id);
