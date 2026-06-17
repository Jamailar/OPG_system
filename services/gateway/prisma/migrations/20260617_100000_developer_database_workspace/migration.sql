CREATE TABLE IF NOT EXISTS app_database_change_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  actor_user_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  api_key_id uuid NULL,
  operation varchar(32) NOT NULL,
  sql_text text NOT NULL,
  dry_run boolean NOT NULL DEFAULT true,
  success boolean NOT NULL DEFAULT false,
  error_message text NULL,
  row_count integer NULL,
  execution_ms integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_database_change_events_app_created
  ON app_database_change_events(app_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_app_database_change_events_actor_created
  ON app_database_change_events(actor_user_id, created_at DESC);
