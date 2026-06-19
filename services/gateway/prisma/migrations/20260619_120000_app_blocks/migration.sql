CREATE TABLE IF NOT EXISTS app_ai_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  slug varchar(80) NOT NULL,
  type varchar(40) NOT NULL DEFAULT 'text_generation',
  model_slot varchar(80) NULL,
  prompt_template text NULL,
  input_schema_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_schema_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  tool_bindings_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  settings_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status varchar(24) NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_ai_blocks_status_check CHECK (status IN ('ACTIVE', 'INACTIVE', 'DELETED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_app_ai_blocks_app_slug_unique
  ON app_ai_blocks(app_id, slug)
  WHERE status <> 'DELETED';

CREATE TABLE IF NOT EXISTS app_ai_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  block_id uuid NOT NULL REFERENCES app_ai_blocks(id) ON DELETE CASCADE,
  actor_user_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  input_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_json jsonb NULL,
  status varchar(24) NOT NULL DEFAULT 'QUEUED',
  usage_snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_json jsonb NULL,
  started_at timestamptz NULL,
  finished_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_ai_runs_app_created
  ON app_ai_runs(app_id, created_at DESC);

CREATE TABLE IF NOT EXISTS app_video_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  slug varchar(80) NOT NULL,
  provider_slot varchar(80) NULL,
  input_schema_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_schema_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  settings_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status varchar(24) NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_video_blocks_status_check CHECK (status IN ('ACTIVE', 'INACTIVE', 'DELETED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_app_video_blocks_app_slug_unique
  ON app_video_blocks(app_id, slug)
  WHERE status <> 'DELETED';

CREATE TABLE IF NOT EXISTS app_video_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  block_id uuid NOT NULL REFERENCES app_video_blocks(id) ON DELETE CASCADE,
  provider varchar(80) NULL,
  provider_task_id varchar(160) NULL,
  input_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_json jsonb NULL,
  status varchar(24) NOT NULL DEFAULT 'QUEUED',
  progress integer NOT NULL DEFAULT 0,
  usage_snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_json jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_video_jobs_app_status_created
  ON app_video_jobs(app_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS app_storage_buckets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  slug varchar(80) NOT NULL,
  policy_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  quota_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status varchar(24) NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_storage_buckets_status_check CHECK (status IN ('ACTIVE', 'INACTIVE', 'DELETED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_app_storage_buckets_app_slug_unique
  ON app_storage_buckets(app_id, slug)
  WHERE status <> 'DELETED';

CREATE TABLE IF NOT EXISTS app_storage_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  bucket_id uuid NULL REFERENCES app_storage_buckets(id) ON DELETE SET NULL,
  file_key text NOT NULL,
  file_url text NOT NULL,
  content_type varchar(160) NULL,
  size_bytes bigint NULL,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_storage_files_app_created
  ON app_storage_files(app_id, created_at DESC);
