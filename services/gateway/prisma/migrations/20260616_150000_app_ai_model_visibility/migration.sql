CREATE TABLE IF NOT EXISTS ai_app_model_visibility (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  global_model_id uuid NOT NULL REFERENCES ai_global_models(id) ON DELETE CASCADE,
  is_visible boolean NOT NULL DEFAULT true,
  created_by_user_id uuid NULL,
  updated_by_user_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (app_id, global_model_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_app_model_visibility_app_visible
ON ai_app_model_visibility(app_id, is_visible, global_model_id);
