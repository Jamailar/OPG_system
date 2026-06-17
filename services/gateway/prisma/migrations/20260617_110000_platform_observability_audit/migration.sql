CREATE TABLE IF NOT EXISTS platform_request_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id varchar(128) NULL,
  trace_id varchar(64) NULL,
  app_id uuid NULL REFERENCES apps(id) ON DELETE SET NULL,
  app_slug varchar(64) NULL,
  actor_user_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  module varchar(64) NOT NULL DEFAULT 'http',
  operation varchar(96) NOT NULL DEFAULT 'request',
  resource_type varchar(64) NULL,
  resource_id varchar(128) NULL,
  stage varchar(64) NOT NULL DEFAULT 'completed',
  method varchar(12) NULL,
  request_path varchar(255) NULL,
  success boolean NULL,
  status_code integer NULL,
  error_category varchar(64) NULL,
  error_message text NULL,
  latency_ms integer NULL,
  ip_address varchar(64) NULL,
  user_agent varchar(512) NULL,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_request_events_request
ON platform_request_events(request_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_platform_request_events_app_created
ON platform_request_events(app_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_request_events_module_created
ON platform_request_events(module, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_request_events_status_created
ON platform_request_events(status_code, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_request_events_resource
ON platform_request_events(resource_type, resource_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_request_events_created
ON platform_request_events(created_at DESC);

CREATE TABLE IF NOT EXISTS platform_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id varchar(128) NULL,
  actor_user_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  app_id uuid NULL REFERENCES apps(id) ON DELETE SET NULL,
  app_slug varchar(64) NULL,
  module varchar(64) NOT NULL,
  action varchar(96) NOT NULL,
  resource_type varchar(64) NOT NULL,
  resource_id varchar(128) NULL,
  before_hash varchar(64) NULL,
  after_hash varchar(64) NULL,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_audit_events_actor
ON platform_audit_events(actor_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_audit_events_app_created
ON platform_audit_events(app_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_audit_events_resource
ON platform_audit_events(resource_type, resource_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_audit_events_module_action
ON platform_audit_events(module, action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_audit_events_created
ON platform_audit_events(created_at DESC);
