# opg-sdk

TypeScript SDK for OPG backend services.

```ts
import { createOpgClientFromLocalConfig } from "opg-sdk";

const opg = await createOpgClientFromLocalConfig();

const models = await opg.ai.models();

const customer = await opg.connectors.invoke("crm", "lookup", {
  input: { customer_id: "123" },
});
```

## Local Login

```bash
npx -y @jamba/opg-cli init --base-url https://api.example.com
npx -y @jamba/opg-cli login
npx -y @jamba/opg-cli app create --kind website --name "Your App" --slug your-app
npx -y @jamba/opg-cli login --app your-app
```

`createOpgClientFromLocalConfig()` reads `.opg/credentials.json`, `.opg/opg.config.json`, `.env.local`, and environment variables.

## Configuration

- `OPG_BASE_URL`: Gateway base URL, for example `https://api.example.com`
- `OPG_APP_SLUG`: App slug owned by the current tenant
- `OPG_API_KEY`: Optional explicit Developer Grant (`opg_dev_...`) for CI or non-interactive server runtimes
- `OPG_PLATFORM_TOKEN`: Platform admin JWT for global control-plane operations

## Codex

Use `@jamba/opg-cli` to generate local config and install the Codex MCP bridge.

## Global Platform Control Plane

Developer Grants are intentionally scoped by app and permission. To create apps
or manage global providers, pass a platform admin token and use the platform client:

```ts
import { createOpgPlatformClient } from "opg-sdk";

const platform = createOpgPlatformClient({
  baseUrl: process.env.OPG_BASE_URL!,
  platformToken: process.env.OPG_PLATFORM_TOKEN!,
});

const createdApp = await platform.apps.create({
  name: "Demo App",
  slug: "demo",
  kind: "WEBSITE",
});
const appId = String((createdApp as any).app?.id || (createdApp as any).id);

await platform.runtimeSettings.update({
  api_base_url: "https://opg.example.com",
  cors_origins: ["https://opg.example.com"],
});

await platform.storageProviders.create({
  name: "Default OSS",
  provider_type: "s3",
  is_default: true,
  config: {
    endpoint: "https://s3.example.com",
    bucket: "opg-assets",
  },
});

await platform.apps.connectors.create(appId, {
  slug: "crm",
  base_url: "https://api.example.com",
});

await platform.apps.connectors.createCredential(appId, "crm", {
  slug: "default",
  auth_mode: "bearer",
  secrets: { token: process.env.CRM_TOKEN },
});

await platform.apps.connectors.createAction(appId, "crm", {
  slug: "lookup",
  method: "GET",
  path_template: "/customers/{{input.customer_id}}",
});
```

`createOpgClient()` also exposes `opg.platform` for processes that need both
app-scoped API calls and platform administration.

## App Data Through Platform Admin

Reading or managing app data uses the platform token because these are admin
operations over a tenant app:

```ts
const feedbacks = await platform.apps.feedbacks.list(appId, {
  status: "open",
  page: 1,
  page_size: 20,
});

const feedback = await platform.apps.feedbacks.get(appId, feedbackId);

await platform.apps.feedbacks.update(appId, feedbackId, {
  status: "in_progress",
  priority: "high",
});

await platform.apps.feedbacks.addComment(appId, feedbackId, {
  body: "已收到，正在处理",
  is_internal: false,
});

const channels = await platform.notifications.channels.list(appId);

const createdChannel = await platform.notifications.channels.create({
  app_id: appId,
  channel_type: "EMAIL",
  name: "Ops Email",
  recipients: ["ops@example.com"],
});

await platform.notifications.channels.test(String((createdChannel as any).item.id), {
  app_id: appId,
});

await platform.notifications.rules.update(appId, {
  items: [
    {
      event_type: "feedback.bug_report.created",
      enabled: true,
      min_severity: "high",
      channel_ids: [],
      dedupe_window_seconds: 600,
      aggregation_window_seconds: 0,
    },
  ],
});

const notificationEvents = await platform.notifications.events.list({ app_id: appId, limit: 20 });
const notificationDeliveries = await platform.notifications.deliveries.list({ app_id: appId, limit: 20 });

const users = await platform.apps.analytics.users(appId, { days: 30 });
const aiLogs = await platform.apps.aiUsage.logs(appId, { days: 7 });
const orders = await platform.apps.payments.orders(appId, { page: 1 });

const adminAccess = await platform.apps.admins.myPermissions(appId);
const admins = await platform.apps.admins.list(appId);

await platform.apps.admins.create(appId, {
  email: "ops@example.com",
  password: "change-me-min-8",
  admin_type: "ADMIN",
  role_keys: ["operations"],
  permission_overrides: ["app.orders.refund"],
});

await platform.apps.admins.updatePermissions(appId, String((admins as any).items[0].id), {
  role_keys: ["support"],
  permission_overrides: ["app.feedback.reward"],
});
```

Available app data namespaces include `agents`, `feedbacks`, `analytics`,
`aiUsage`, `payments`, `email`, `site`, `redeem`, `admins`, `schema`,
`functions`, `workflows`, `blocks`, `connectors`, and `build`.

App admin RBAC uses role templates plus granular permission overrides. Prefer
`role_keys` and `permission_overrides`; `page_permissions` is kept only for
legacy callers.

Platform-wide namespaces include `observability`, `notifications`, `tasks`,
`developerAuthorizations`, `storageProviders`, `smtpProviders`,
`integrationApiKeys`, `payments`, `sms`, `oauth`, `email`, `proxies`, `ai`,
and `agents`.

## Database Workspace

Database operations are routed through the OPG backend. The SDK never exposes
`DATABASE_URL`, and SQL is limited to the app-owned namespace returned by:

```ts
const db = await opg.database.manifest();
console.log(db.namespace);

await opg.database.execute({
  sql: `CREATE TABLE ${db.namespace}customers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL)`,
  dryRun: true,
});
```
