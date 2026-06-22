CREATE TABLE IF NOT EXISTS admin_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid NULL REFERENCES apps(id) ON DELETE CASCADE,
  key varchar(120) NOT NULL,
  name varchar(120) NOT NULL,
  description text NULL,
  is_system boolean NOT NULL DEFAULT false,
  status varchar(16) NOT NULL DEFAULT 'ACTIVE',
  created_by_user_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_roles_key
ON admin_roles(key);

CREATE INDEX IF NOT EXISTS idx_admin_roles_app_status
ON admin_roles(app_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS admin_role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES admin_roles(id) ON DELETE CASCADE,
  permission_key varchar(160) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_role_permissions_role_permission
ON admin_role_permissions(role_id, permission_key);

CREATE INDEX IF NOT EXISTS idx_admin_role_permissions_permission
ON admin_role_permissions(permission_key);

CREATE TABLE IF NOT EXISTS admin_user_role_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  admin_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES admin_roles(id) ON DELETE CASCADE,
  created_by_user_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_user_role_assignments
ON admin_user_role_assignments(app_id, admin_user_id, role_id);

CREATE INDEX IF NOT EXISTS idx_admin_user_role_assignments_admin
ON admin_user_role_assignments(app_id, admin_user_id);

CREATE INDEX IF NOT EXISTS idx_admin_user_role_assignments_role
ON admin_user_role_assignments(role_id);

CREATE TABLE IF NOT EXISTS admin_user_permission_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  admin_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission_key varchar(160) NOT NULL,
  effect varchar(16) NOT NULL DEFAULT 'ALLOW',
  reason text NULL,
  expires_at timestamptz NULL,
  created_by_user_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_user_permission_overrides
ON admin_user_permission_overrides(app_id, admin_user_id, permission_key, effect);

CREATE INDEX IF NOT EXISTS idx_admin_user_permission_overrides_admin
ON admin_user_permission_overrides(app_id, admin_user_id);

CREATE INDEX IF NOT EXISTS idx_admin_user_permission_overrides_expires
ON admin_user_permission_overrides(expires_at);

DO $$
DECLARE
  role_item jsonb;
  permission_item text;
  inserted_role_id uuid;
  system_roles jsonb := '[
    {
      "key": "readonly",
      "name": "只读观察员",
      "description": "查看概览、分析、日志、API 文档和主要运营数据。",
      "permissions": [
        "app.overview.read", "app.analytics.read", "app.ai.usage.read", "app.logs.read",
        "app.api_docs.read", "app.site.read", "app.email.read", "app.feedback.read",
        "app.notifications.read",
        "app.acquisition.read", "app.products.read", "app.orders.read", "app.redeem.codes.read",
        "app.build.read", "app.schema.read"
      ]
    },
    {
      "key": "operations",
      "name": "运营",
      "description": "处理反馈、来源、产品、订单和兑换码日常运营。",
      "permissions": [
        "app.overview.read", "app.analytics.read", "app.feedback.read", "app.feedback.review",
        "app.notifications.read", "app.notifications.manage",
        "app.acquisition.read", "app.acquisition.write", "app.products.read", "app.products.write",
        "app.orders.read", "app.redeem.codes.read", "app.redeem.codes.create"
      ]
    },
    {
      "key": "support",
      "name": "客服",
      "description": "查看用户、订单与反馈，并处理反馈状态。",
      "permissions": [
        "app.overview.read", "app.users.read", "app.orders.read",
        "app.feedback.read", "app.feedback.review", "app.notifications.read", "app.redeem.codes.read"
      ]
    },
    {
      "key": "commerce",
      "name": "产品与支付",
      "description": "管理产品、订单、兑换码和支付联调。",
      "permissions": [
        "app.overview.read", "app.analytics.read", "app.products.read", "app.products.write",
        "app.orders.read", "app.orders.refund", "app.orders.charge", "app.redeem.codes.read",
        "app.redeem.codes.create", "app.redeem.codes.void", "app.redeem.redemptions.revoke",
        "app.redeem.packages.distribute"
      ]
    },
    {
      "key": "marketing",
      "name": "营销",
      "description": "管理用户来源、邮件和官网触达。",
      "permissions": [
        "app.overview.read", "app.analytics.read", "app.acquisition.read", "app.acquisition.write",
        "app.email.read", "app.email.write", "app.email.send", "app.site.read", "app.site.write"
      ]
    },
    {
      "key": "ai_operator",
      "name": "AI 运营",
      "description": "查看 AI 用量并维护模型路由、默认模型和视频下载加速。",
      "permissions": [
        "app.overview.read", "app.ai.usage.read", "app.ai.routing.write",
        "app.ai.video_proxy.write", "app.notifications.read", "app.logs.read"
      ]
    },
    {
      "key": "developer",
      "name": "开发者",
      "description": "查看开发文档、日志、构建状态和数据结构。",
      "permissions": [
        "app.overview.read", "app.api_docs.read", "app.logs.read",
        "app.build.read", "app.schema.read", "app.developers.manage"
      ]
    }
  ]'::jsonb;
BEGIN
  FOR role_item IN SELECT * FROM jsonb_array_elements(system_roles)
  LOOP
    INSERT INTO admin_roles (id, app_id, key, name, description, is_system, status, created_at, updated_at)
    VALUES (
      gen_random_uuid(),
      NULL,
      role_item->>'key',
      role_item->>'name',
      role_item->>'description',
      true,
      'ACTIVE',
      now(),
      now()
    )
    ON CONFLICT (key)
    DO UPDATE SET
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      is_system = true,
      status = 'ACTIVE',
      updated_at = now()
    RETURNING id INTO inserted_role_id;

    DELETE FROM admin_role_permissions WHERE role_id = inserted_role_id;
    FOR permission_item IN SELECT * FROM jsonb_array_elements_text(role_item->'permissions')
    LOOP
      INSERT INTO admin_role_permissions (role_id, permission_key)
      VALUES (inserted_role_id, permission_item)
      ON CONFLICT (role_id, permission_key) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

INSERT INTO admin_roles (
  id, app_id, key, name, description, is_system, status,
  created_by_user_id, updated_by_user_id, created_at, updated_at
)
SELECT
  gen_random_uuid(),
  app_id,
  'legacy-group:' || id::text,
  name,
  description,
  false,
  'ACTIVE',
  created_by_user_id,
  updated_by_user_id,
  created_at,
  updated_at
FROM admin_permission_groups
ON CONFLICT (key) DO NOTHING;

INSERT INTO admin_role_permissions (role_id, permission_key)
SELECT
  r.id,
  permission_key
FROM admin_permission_groups g
JOIN admin_roles r ON r.key = 'legacy-group:' || g.id::text
CROSS JOIN LATERAL jsonb_array_elements_text(g.page_permissions) AS permission_key
ON CONFLICT (role_id, permission_key) DO NOTHING;
