CREATE TABLE IF NOT EXISTS email_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_type varchar(32) NOT NULL,
  name varchar(160) NOT NULL,
  external_account_id varchar(160) NULL,
  status varchar(24) NOT NULL DEFAULT 'ACTIVE',
  config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  secrets_ciphertext text NULL,
  cloudflare_account_id uuid NULL REFERENCES email_cf_accounts(id) ON DELETE CASCADE,
  notes text NULL,
  last_verified_at timestamptz NULL,
  created_by_user_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_providers_name
  ON email_providers(LOWER(name));

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_providers_cf_account_unique
  ON email_providers(cloudflare_account_id)
  WHERE cloudflare_account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_providers_type_status
  ON email_providers(provider_type, status, updated_at DESC);

INSERT INTO email_providers (
  provider_type,
  name,
  external_account_id,
  status,
  config_json,
  cloudflare_account_id,
  notes,
  last_verified_at,
  created_by_user_id,
  created_at,
  updated_at
)
SELECT
  'CLOUDFLARE_EMAIL',
  a.name,
  a.account_id,
  a.status,
  jsonb_build_object('account_id', a.account_id),
  a.id,
  a.notes,
  a.last_verified_at,
  a.created_by_user_id,
  a.created_at,
  a.updated_at
FROM email_cf_accounts a
ON CONFLICT (cloudflare_account_id) WHERE cloudflare_account_id IS NOT NULL DO UPDATE SET
  name = EXCLUDED.name,
  external_account_id = EXCLUDED.external_account_id,
  status = EXCLUDED.status,
  config_json = EXCLUDED.config_json,
  notes = EXCLUDED.notes,
  last_verified_at = EXCLUDED.last_verified_at,
  updated_at = now();

ALTER TABLE email_senders
  ADD COLUMN IF NOT EXISTS provider_id uuid NULL REFERENCES email_providers(id) ON DELETE RESTRICT;

UPDATE email_senders s
SET provider_id = p.id
FROM email_providers p
WHERE p.cloudflare_account_id = s.cf_account_id
  AND s.provider_id IS NULL;

ALTER TABLE email_senders
  ALTER COLUMN cf_account_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_senders_provider
  ON email_senders(provider_id, status, updated_at DESC);
