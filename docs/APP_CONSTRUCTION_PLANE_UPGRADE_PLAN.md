# OPG App Construction Plane 升级计划

## 背景

当前 OPG 已经具备 app-scoped API、Developer SDK、CLI/MCP、AI Gateway、视频异步任务、上传、支付、用量、审计等基础能力。现有数据库自定义能力主要集中在 `DeveloperDatabaseService`：

- 每个 app 使用 `app_<slug>__` 表名前缀作为命名空间。
- 支持 `manifest`、`tables`、`describe`、`query`、`execute`。
- DDL/DML 被限制在 app namespace 内。
- 默认 dry-run，apply 需要 `apply:<app-slug>` 确认。
- 通过 CLI/MCP 暴露给本地开发者和 agent。

这说明 OPG 不是缺少底层能力，而是缺少一层让用户自然创建 app 的产品化抽象。现在用户要自定义业务，仍然更像是在“远程执行 SQL”，而不是在一个基座里创建数据模型、权限、API、实时事件、函数、AI 工作流、视频工作流和 UI schema。

本升级计划的目标是把 OPG 从“app 后端能力集合”升级成“App Construction Plane”：用户可以在 OPG 基座上快速创建自己的 app 数据模型、业务 API、自动化函数、AI/视频流程和最小 UI 面，而不需要重复开发后端基础设施。

## 参考结论

Supabase 的核心价值不只是 Postgres，而是把数据库对象产品化：

- `Studio` 通过 `postgres-meta` / `@supabase/pg-meta` 管理 table、column、policy、function、publication。
- `PostgREST` 自动把表和函数暴露成 REST API。
- `Realtime` 基于 publication 把表变更暴露成订阅。
- `Storage`、`Auth`、`Functions` 通过统一 gateway 挂到同一个 project API 下。
- 内部 schema 被显式保护，用户主要操作公开 schema。
- SQL Editor 有 query size、timeout、preflight cost、cache invalidation、telemetry。

OPG 不应该照抄 Supabase 成为通用 BaaS。OPG 的边界更清楚：它是面向一人公司和多 app 后端集群的控制平面，必须保留 AI、视频、计费、积分、provider、platform-admin、app-admin、SDK/CLI/Agent 的治理边界。

因此推荐吸收 Supabase 的“元数据产品层”，但数据 API、权限、计费、AI/视频工作流要按 OPG 的控制面自研。

## 总目标

升级后的 OPG 应该让用户完成这条闭环：

```text
创建 app
  -> 定义数据模型
  -> 自动获得 Data API / SDK / OpenAPI
  -> 配置访问规则
  -> 配置 Realtime
  -> 配置 Functions / Cron / Webhook
  -> 绑定 AI / Video blocks
  -> 用最小 UI schema 生成列表、表单、详情入口
  -> 在 Logs / Usage / Audit 中观察运行状态
```

最终产品结构：

```text
apps/web
  Platform Console
    Apps
    Build
      Data
      API
      Functions
      Workflows
    Users
    Storage
    AI / Video
    Billing
    Logs

services/gateway
  App Context
  App Schema Registry
  Metadata SQL Engine
  Data API
  Policy Engine
  Realtime Gateway
  Function Runtime
  Workflow Runtime
  AI Blocks
  Video Blocks
  Observability

packages/sdk
  data client
  schema client
  realtime client
  functions client
  workflow client

packages/cli
  opg schema
  opg data
  opg function
  opg workflow
  opg mcp tools
```

## 方案对比

| 方案 | 优点 | 缺点 | 结论 |
| --- | --- | --- | --- |
| 继续增强 SQL 通道 | 改动最小，当前 CLI/MCP 可复用 | 用户仍要懂 SQL，无法形成产品化建 app 体验 | 不推荐作为主线 |
| 直接集成 PostgREST + Supabase Realtime | 很快获得 REST 和 realtime | 会绕开 OPG 的 app 权限、AI/视频计费、积分、审计、provider 控制 | 不推荐 |
| 自研 App Schema Registry + Data API | 与 OPG 权限、计费、AI、视频、SDK、Agent 边界一致 | 需要补 metadata、policy、API generator | 推荐 |
| 完整低代码平台/页面搭建器 | 表面能力强 | UI、状态、权限、数据绑定复杂度过高，偏离基座目标 | 暂不做 |

推荐方案：自研 App Schema Registry + Data API + Policy Engine，复用现有数据库执行、AI Gateway、视频任务、上传、CLI/MCP、SDK 基础。

## 产品边界

### 必须支持

- 每个 app 独立定义数据表、字段、索引、关系、枚举、视图。
- 每个 app 自动获得 CRUD API、query API、OpenAPI 和 SDK client。
- 每张表可以配置读写权限、owner 字段、admin-only 字段、API key 权限。
- 每张表可以开启变更事件，用于 Realtime、Webhook、Function trigger。
- Functions 可以被 HTTP、cron、data event、workflow step 触发。
- AI/Video 能作为 workflow block 绑定数据表、函数、文件、用量账本。
- 所有 schema 变更、数据 API 调用、函数执行、AI/视频调用都有审计和 usage。
- CLI 和 MCP 可以创建/修改 schema，agent 可以基于 manifest 直接生成 app。

### 暂不支持

- 不给用户直接数据库连接串。
- 不开放 PostgreSQL 超管能力。
- 不开放任意 `CREATE FUNCTION` / `CREATE TRIGGER` / `CREATE EXTENSION` 到普通用户。
- 不做完整可视化低代码页面搭建器。
- 不把 PostgREST 直接挂到公网作为主 Data API。
- 不让前端直接调用第三方 AI/视频 provider。

## 模块升级计划

### 1. App Schema Registry

职责：

- 保存每个 app 的数据模型真值。
- 把“用户想创建什么”与“数据库实际执行了什么”分开。
- 为 UI、SDK、CLI、MCP、OpenAPI、Data API 生成统一 manifest。

新增表：

```text
app_data_tables
  id
  app_id
  slug
  physical_table_name
  display_name
  description
  primary_key
  owner_column
  soft_delete_column
  status
  settings_json
  created_by_user_id
  updated_by_user_id
  created_at
  updated_at

app_data_columns
  id
  app_id
  table_id
  slug
  physical_column_name
  data_type
  is_nullable
  default_value_json
  is_unique
  is_indexed
  is_hidden
  is_readonly
  validation_json
  display_json
  created_at
  updated_at

app_data_indexes
  id
  app_id
  table_id
  slug
  index_type
  columns_json
  where_json
  is_unique
  physical_index_name
  created_at
  updated_at

app_data_relations
  id
  app_id
  source_table_id
  source_column_id
  target_table_id
  target_column_id
  relation_type
  on_delete
  created_at
  updated_at

app_data_policies
  id
  app_id
  table_id
  action
  effect
  roles_json
  condition_json
  field_mask_json
  status
  created_at
  updated_at

app_schema_migrations
  id
  app_id
  migration_key
  title
  status
  dry_run_sql
  applied_sql
  rollback_hint
  checksum
  created_by_user_id
  applied_by_user_id
  created_at
  applied_at

app_schema_change_events
  id
  app_id
  actor_user_id
  actor_api_key_id
  resource_type
  resource_id
  action
  before_json
  after_json
  sql_hash
  created_at
```

实现：

- 自研 NestJS `AppSchemaModule`。
- Prisma schema 管 metadata 表，物理 app tables 仍通过 raw SQL 创建。
- 每个 app 表必须写入 registry 后才能被 Data API 暴露。
- 物理表名继续使用 `app_<slug>__<table>`，但用户 UI 显示短表名。
- 每次 schema 变更生成 migration record。
- schema apply 使用 advisory lock：`pg_advisory_xact_lock(hash(app_id))`。

必须用现成库：

- PostgreSQL。
- Prisma 管平台 metadata。
- SQL parser 或 builder：优先评估 `pgsql-ast-parser` 或 `libpg-query`。

必须自研：

- app table catalog。
- schema diff。
- migration 状态机。
- OPG manifest 生成。
- app namespace 安全策略。

### 2. Metadata SQL Engine

职责：

- 把用户的表/字段/索引/关系/策略操作编译成 SQL。
- 提供 dry-run、apply、diff preview、schema lock、审计。
- 替代长期依赖正则判断 SQL 安全。

API：

```text
GET  /api/v1/platform-admin/apps/:appId/schema/manifest
POST /api/v1/platform-admin/apps/:appId/schema/tables
PATCH /api/v1/platform-admin/apps/:appId/schema/tables/:tableId
POST /api/v1/platform-admin/apps/:appId/schema/tables/:tableId/columns
PATCH /api/v1/platform-admin/apps/:appId/schema/columns/:columnId
POST /api/v1/platform-admin/apps/:appId/schema/indexes
POST /api/v1/platform-admin/apps/:appId/schema/migrations/dry-run
POST /api/v1/platform-admin/apps/:appId/schema/migrations/apply
```

CLI：

```text
opg schema manifest
opg schema table create customers --columns email:text,name:text
opg schema column add customers phone text --nullable true
opg schema diff
opg schema apply
```

MCP tools：

```text
opg_schema_manifest_get
opg_schema_table_create
opg_schema_column_add
opg_schema_policy_upsert
opg_schema_migration_dry_run
opg_schema_migration_apply
```

实现细节：

- Table create 不接收裸 SQL，接收结构化 payload。
- Column type 使用 allowlist：`text`、`varchar`、`integer`、`bigint`、`numeric`、`boolean`、`uuid`、`jsonb`、`timestamptz`、`date`。
- 默认字段模板：`id uuid primary key default gen_random_uuid()`、`created_at`、`updated_at`。
- `updated_at` 第一版由 Data API 写入，不创建 trigger。
- 禁止用户创建 extension、role、trigger、function、copy、vacuum、notify。
- 高级 SQL 入口保留给 admin，但不作为普通建 app 主路径。

性能策略：

- dry-run 在 transaction 内 rollback。
- apply 前设置 `statement_timeout`。
- schema apply 使用 app 级 lock，避免并发迁移。
- 大表危险操作必须异步 job 化，例如添加非空列、drop column、建大索引。
- 每次 migration 后精准失效 app schema cache。

### 3. Data API

职责：

- 自动把 registry 中的数据模型暴露为 app-scoped API。
- 所有请求走 OPG app context、auth、policy、rate limit、audit、usage。

API：

```text
GET    /:app/v1/data/:table
POST   /:app/v1/data/:table
GET    /:app/v1/data/:table/:id
PATCH  /:app/v1/data/:table/:id
DELETE /:app/v1/data/:table/:id
POST   /:app/v1/data/query
GET    /:app/v1/data/schema
GET    /:app/v1/data/openapi.json
```

Query 参数：

```text
select=id,email,name,created_at
filter[email][eq]=a@example.com
filter[created_at][gte]=2026-01-01
order=created_at.desc
limit=50
cursor=<opaque cursor>
include=orders
```

SDK：

```ts
const customers = await opg.data.table('customers').list({
  select: ['id', 'email', 'created_at'],
  filter: { email: { eq: 'a@example.com' } },
  order: [{ field: 'created_at', direction: 'desc' }],
  limit: 50,
})

const customer = await opg.data.table('customers').create({
  email: 'a@example.com',
  name: 'Alice',
})
```

实现：

- 自研 `DataApiModule`。
- 只允许访问 registry 中 `status=ACTIVE` 的表。
- Query builder 必须参数化，不能拼接用户输入值。
- 表名、列名只从 registry 读取，不从用户请求直接进入 SQL。
- 默认 `limit=50`，最大 `limit=500`。
- 删除默认支持 soft delete；真正 hard delete 需要 admin scope。
- `POST /data/query` 只支持结构化 query AST，不支持任意 SQL。

必须用现成库：

- 参数化 PostgreSQL client 或 Prisma raw parameter。
- Zod/class-validator 做 payload validation。

必须自研：

- Data API route。
- registry-driven query builder。
- cursor pagination。
- field mask。
- audit/usage integration。

性能策略：

- 默认只返回声明字段，不 `SELECT *`。
- cursor pagination 优先于 offset。
- 自动建议索引：高频 filter/order 字段进入 index advisor。
- 为 list API 加 `Cache-Control: no-store`，避免用户误以为强一致缓存；内部 metadata cache 单独处理。
- 表 schema manifest 缓存在 Redis，按 app/table invalidation。

### 4. Policy Engine

职责：

- 给 Data API、Storage、Functions、AI tools、Video workflows 提供统一权限判断。
- 第一版不直接依赖 PostgreSQL RLS，避免用户误配置导致绕开 OPG 计费和审计。

Policy DSL：

```json
{
  "action": "read",
  "effect": "allow",
  "roles": ["USER", "ADMIN"],
  "condition": {
    "all": [
      { "field": "owner_user_id", "op": "eq", "value": "$auth.user_id" },
      { "field": "deleted_at", "op": "is_null" }
    ]
  },
  "field_mask": {
    "hide": ["internal_notes"]
  }
}
```

内置模板：

- `public_read_admin_write`
- `owner_read_write`
- `admin_only`
- `service_key_only`
- `authenticated_insert_owner_read`

实现：

- 自研 `PolicyEngineService`。
- policy 编译为 SQL where fragment + field projection。
- 所有 condition field 必须存在于 registry。
- `$auth.user_id`、`$auth.role`、`$app.id`、`$request.api_key_scope` 由 request context 注入。
- deny 优先于 allow。
- 没有 policy 默认拒绝终端用户访问，app admin/service key 可按 scope 访问。

性能策略：

- policy 编译结果缓存到 Redis。
- policy where fragment 参数化。
- owner field 自动建议索引。
- 对复杂 policy 设置最大条件深度。

### 5. Realtime Gateway

职责：

- 推送数据变更、函数状态、AI/视频任务状态、账单状态。
- 减少轮询，让 app 前端和 agent 能订阅运行状态。

协议：

```text
channel: apps.{appSlug}.data.{table}
event: row.created | row.updated | row.deleted

channel: apps.{appSlug}.jobs.{jobId}
event: job.queued | job.running | job.succeeded | job.failed

channel: apps.{appSlug}.ai.{runId}
event: token | step | usage | completed | failed

channel: apps.{appSlug}.video.{taskId}
event: progress | asset.ready | completed | failed
```

实现：

- 必须用现成库：`socket.io` + Redis adapter，或 `ws` + Redis pub/sub。
- 推荐第一版使用 `socket.io`，开发成本低，鉴权和 namespace 管理成熟。
- Data API 写入成功后发布事件。
- Function/AI/Video runtime 更新状态时发布事件。
- 高级阶段再考虑 PostgreSQL logical replication，不作为第一版依赖。

自研部分：

- channel 命名。
- subscription authorization。
- event envelope。
- event redaction。
- app-scoped fanout。

性能策略：

- 每个 connection 绑定 app/user/api key scope。
- 限制单连接订阅数量。
- 大 payload 只发 resource id 和 changed fields，不发完整大对象。
- Redis pub/sub 做 fanout，数据库不承担实时广播。

### 6. Function Runtime

职责：

- 让用户在 OPG 中创建可复用函数。
- 支持 HTTP trigger、cron trigger、data event trigger、manual trigger、workflow step。

第一版函数形态：

```text
app_functions
  id
  app_id
  slug
  runtime
  entrypoint
  source_json
  secrets_scope
  trigger_json
  status
  current_version_id

app_function_versions
  id
  function_id
  version
  source_hash
  source_json
  build_status
  created_by_user_id
  created_at

app_function_runs
  id
  app_id
  function_id
  version_id
  trigger_type
  input_json
  status
  output_json
  error_json
  started_at
  finished_at
```

API：

```text
GET    /api/v1/platform-admin/apps/:appId/functions
POST   /api/v1/platform-admin/apps/:appId/functions
POST   /api/v1/platform-admin/apps/:appId/functions/:id/deploy
POST   /:app/v1/functions/:slug/invoke
GET    /api/v1/platform-admin/apps/:appId/functions/:id/runs
```

实现：

- 第一版用 BullMQ + Node worker。
- 函数 payload 采用结构化 handler contract，不直接执行任意 shell。
- 函数可以调用 `opg.data`、`opg.ai`、`opg.video`、`opg.storage` 内部 client。
- secrets 从 runtime settings 读取，按 app/function scope 注入。
- 函数执行必须记录 run、logs、usage。

必须用现成库：

- BullMQ。
- Node VM 隔离库或进程级 worker。
- Cron parser。

后续可选：

- Deno edge-runtime。
- Docker sandbox。
- Cloudflare Workers。
- Vercel Functions。

自研部分：

- function registry。
- deploy version。
- trigger mapping。
- OPG internal SDK injection。
- usage/audit integration。

性能策略：

- 函数默认异步执行，HTTP invoke 可配置同步等待上限。
- 默认超时 30s，同步请求最多 10s。
- 每个 app/function 配置 concurrency limit。
- 错误重试只对幂等 trigger 默认开启。
- logs 分片存储，列表页读摘要。

### 7. Workflow Runtime

职责：

- 把 Data、Function、AI、Video、Storage 串成 app 可复用工作流。
- 面向一人公司常见业务：内容生成、素材处理、订单后处理、用户 onboarding、运营自动化。

工作流定义：

```json
{
  "slug": "generate_product_video",
  "trigger": {
    "type": "http"
  },
  "steps": [
    {
      "id": "load_product",
      "type": "data.query",
      "table": "products"
    },
    {
      "id": "write_script",
      "type": "ai.generate_text",
      "model_slot": "copywriting"
    },
    {
      "id": "render_video",
      "type": "video.generate",
      "provider_slot": "default_video"
    },
    {
      "id": "save_asset",
      "type": "storage.save"
    }
  ]
}
```

实现：

- 自研 `WorkflowRuntimeService`。
- 底层仍用 BullMQ。
- 每个 step append-only 记录状态。
- 每个 step 可重试、跳过、取消。
- workflow input/output 都有 JSON schema。

必须用现成库：

- BullMQ。
- JSON schema validator。
- DAG/topological validation 库可评估使用。

自研部分：

- workflow DSL。
- step executor。
- AI/Video/Data/Storage adapters。
- usage aggregation。

性能策略：

- 每个 workflow run 有 global timeout。
- step output 大对象写 Storage，只在 DB 记录 URI。
- 可重试 step 必须带 idempotency key。
- 高频 workflow 做 compiled plan cache。

### 8. AI Blocks

职责：

- 让用户用 OPG 内置 AI Gateway 创建可复用 AI 能力。
- 与 Data API、Functions、Workflow、Storage、Video 联动。

对象：

```text
app_ai_blocks
  id
  app_id
  slug
  type
  model_slot
  prompt_template
  input_schema_json
  output_schema_json
  tool_bindings_json
  status

app_ai_runs
  id
  app_id
  block_id
  actor_user_id
  input_json
  output_json
  status
  usage_snapshot_json
  started_at
  finished_at
```

Block types：

- `text_generation`
- `structured_extraction`
- `chat_agent`
- `image_generation`
- `speech_to_text`
- `text_to_speech`
- `video_prompt`

实现：

- 复用现有 `ai-chat`、`ai-agents`、model routing、default model slot、usage ledger。
- 新增 block registry 和 workflow adapter。
- AI block 只能调用已授权 data/function/storage tools。
- 每次运行写入 usage snapshot 和 cost。

必须用现成库：

- Provider 官方 SDK 或稳定 HTTP client。
- JSON schema validator。

自研部分：

- block registry。
- tool authorization。
- prompt/template variable validation。
- OPG usage settlement。

性能策略：

- prompt template 编译缓存。
- model route 缓存。
- streaming token 走 Realtime。
- 大输入引用 Storage URI，不把完整文件塞进 DB。
- 继续使用 pre-consume、actual settle、refund/extra capture。

### 9. Video Blocks

职责：

- 把视频生成、转码、素材处理、结果归档变成可配置 app block。

对象：

```text
app_video_blocks
  id
  app_id
  slug
  provider_slot
  input_schema_json
  output_schema_json
  settings_json
  status

app_video_jobs
  id
  app_id
  block_id
  provider
  provider_task_id
  input_json
  output_json
  status
  progress
  usage_snapshot_json
  created_at
  updated_at
```

实现：

- 复用现有视频异步 API。
- 将 provider payload 收口到 block adapter。
- 结果统一写入 Storage/Upload 模块。
- 前端只显示任务状态、输入、输出、日志、重试。

必须用现成库：

- FFmpeg。
- Remotion。
- 云媒体处理 SDK。
- 视频 provider SDK/HTTP client。

自研部分：

- video block registry。
- provider adapter contract。
- task state machine。
- result normalization。
- usage settlement。

性能策略：

- 视频全部异步。
- 任务状态投影表 + events 表。
- 大文件走对象存储直传/直取。
- 后端不代理大文件下载，除非需要鉴权短链。
- provider query 走 scheduler，不在用户请求链长轮询。

### 10. Storage Blocks

职责：

- 为自定义 app 提供 bucket、文件、权限、signed URL、metadata。
- 服务 Data、AI、Video、Functions。

实现：

- 复用现有 upload module。
- 新增 app storage bucket registry。
- 每个 Data table 可绑定 file/image 字段，实际存储 URI + metadata。

必须用现成库：

- S3/R2/OSS SDK。
- MIME sniffing。
- 图片处理库。

自研部分：

- bucket policy。
- file metadata。
- app quota。
- signed URL audit。

性能策略：

- 大文件直传。
- 图片缩略图异步生成。
- metadata 查询走 DB，文件内容走对象存储。
- bucket usage 定期聚合。

### 11. UI Upgrade

原则：

- 少加入口，入口贴近 app 创建本体。
- 不做解释型大页面。
- 不做卡片堆叠式低代码平台。
- 用高密度表格、侧栏详情、抽屉/页面编辑，少用弹窗。

推荐新增 `Build` 一级入口：

```text
Build
  Data
    Tables
    Columns
    Relations
    Policies
    API Preview

  Functions
    Function list
    Version
    Trigger
    Runs
    Logs

  Workflows
    Workflow list
    Steps
    Runs
    Usage

  API
    Manifest
    OpenAPI
    SDK
    Keys
```

Data 页面布局：

```text
Left: table list
Center: columns / indexes / relations
Right: policy + API preview + recent events
```

交互：

- 创建表：名称、主键模板、owner 字段、默认时间字段。
- 添加字段：字段名、类型、nullable、default、index、UI label。
- 添加策略：选择模板，再可编辑条件。
- API preview：显示 endpoint、SDK snippet、curl snippet。
- 所有危险操作进入独立确认页或确认条，不用长解释文案。

必须用现成库：

- React Hook Form 或现有表单模式。
- Zod。
- Monaco 仅用于高级 SQL/Function code，不用于普通表字段编辑。

自研部分：

- schema editor。
- policy template picker。
- API preview。
- workflow step editor。

### 12. SDK / CLI / MCP

SDK 新增：

```ts
opg.schema.manifest()
opg.schema.tables.create()
opg.schema.columns.add()

opg.data.table('customers').list()
opg.data.table('customers').get(id)
opg.data.table('customers').create(input)
opg.data.table('customers').update(id, input)
opg.data.table('customers').delete(id)

opg.functions.invoke('sync_customer', input)
opg.workflows.run('generate_product_video', input)
opg.realtime.subscribe(channel, handler)
```

CLI 新增：

```text
opg schema manifest
opg schema table create
opg schema column add
opg schema policy set
opg data list
opg data get
opg data create
opg function deploy
opg function invoke
opg workflow run
```

MCP 新增：

```text
opg_schema_manifest_get
opg_schema_table_create
opg_schema_column_add
opg_schema_policy_upsert
opg_data_query
opg_data_create
opg_function_invoke
opg_workflow_run
```

实现策略：

- 复用现有 login、profile、app use、developer grant。
- 所有新能力进入 manifest capabilities。
- MCP tools 不直接执行裸 SQL，优先调用结构化 schema/data API。
- 保留 `opg_database_*` 作为高级 escape hatch。

### 13. Observability / Audit / Usage

职责：

- 所有用户自定义能力都必须可追踪。
- Build 面不是只创建资源，还要能看到资源运行质量。

新增事件：

```text
schema.table.created
schema.column.added
schema.policy.updated
data.row.created
data.row.updated
data.row.deleted
function.run.started
function.run.failed
workflow.run.completed
ai.block.run.settled
video.block.job.completed
```

数据：

- `request_id`
- `trace_id`
- `app_id`
- `actor_user_id`
- `actor_api_key_id`
- `resource_type`
- `resource_id`
- `action`
- `duration_ms`
- `row_count`
- `cost_snapshot_json`
- `error_code`
- `error_message`

实现：

- 复用现有 observability module。
- 新增 app build event stream。
- Data API access log 单独存摘要，避免把所有 row payload 写入日志。
- Usage 明细 append-only。

性能策略：

- 热路径只写必要摘要。
- 详细日志异步入队。
- Dashboard 读聚合表。
- 高频 API 按 app/table/hour 聚合。

## 安全模型

### 数据库边界

- 内部平台表永远不通过 Data API 暴露。
- 用户 app 表只能使用 app namespace。
- 表名、列名只从 registry 读取。
- 结构化 API 不接受任意 SQL。
- 高级 SQL 通道继续要求 admin/developer grant 和 apply token。

### API key 边界

- App API key 按 scopes 授权：
  - `schema:read`
  - `schema:write`
  - `data:read`
  - `data:write`
  - `function:invoke`
  - `workflow:run`
- Service key 可绕过用户 owner policy，但不能绕过 app namespace。
- 前端 publishable token 默认只能走用户 policy。

### Function 边界

- 函数不能读取平台密钥。
- 函数 secrets 按 app/function scope 注入。
- 函数默认不能访问本机文件系统。
- 函数调用 AI/Video/Data 必须通过 OPG internal client，以便计费和审计。

## 性能优化总策略

### 数据库

- 表列表、字段列表、policy 编译结果缓存到 Redis。
- Data API 永远使用参数化 SQL。
- list API 默认 limit 50，最大 500。
- 大表 schema 变更转 async job。
- schema migration 用 app lock。
- 高频 filter/order 字段做 index advisor。
- Dashboard 报表读聚合表或 materialized view。

### API

- request context 一次解析 app/user/key/scopes。
- Data API query builder 编译结果按 table + query shape 缓存。
- OpenAPI/manifest 按 app schema version 缓存。
- 错误返回稳定 error code，避免前端解析 message。

### Realtime

- 写路径发布事件，不从数据库全量监听起步。
- Redis fanout。
- 单连接订阅数量限制。
- 大 payload 只发引用。

### Functions / Workflows

- BullMQ 分队列：`functions`、`workflows`、`ai`、`video`、`webhooks`。
- 每个 app 设置 concurrency。
- 幂等 key 防止重复扣费或重复写入。
- step output 大对象写 Storage。
- 失败重试基于错误分类。

### AI / Video

- 模型路由、价格快照、provider health cache。
- 预扣积分，实际结算，失败退款。
- 视频任务异步查询，不在请求链轮询 provider。
- 生成结果归档到对象存储。

## 执行清单

这不是分阶段交付半成品，而是一个完整闭环的实现顺序。每个条目应作为一个或多个 atomic commit，确保一个提交只做一件事。

### Commit 1: Add schema registry tables

范围：

- Prisma schema 新增 metadata 表。
- 新 migration。
- 基础 indexes。
- 不改业务逻辑。

验收：

- `prisma validate` 通过。
- migration 可在空库执行。
- 不影响现有 app/auth/AI/video。

### Commit 2: Add AppSchemaModule read manifest

范围：

- `AppSchemaModule`。
- `GET schema manifest`。
- registry serializer。
- app namespace helper 复用或抽出公共函数。

验收：

- 空 app 返回空 schema manifest。
- manifest 包含 app、namespace、tables、capabilities、schema_version。

### Commit 3: Add structured table and column create dry-run

范围：

- Table/column payload DTO。
- SQL builder。
- dry-run API。
- 不 apply。

验收：

- 表名非法会被拒绝。
- 内部 namespace 被拒绝。
- 生成 SQL 可读。
- dry-run 不落物理表。

### Commit 4: Add schema apply with migration audit

范围：

- apply API。
- advisory lock。
- migration record。
- schema change event。

验收：

- 创建表成功。
- 重复 apply 被拒绝或幂等处理。
- migration 记录完整。
- `opg db tables` 可看到物理表。

### Commit 5: Add Data API read path

范围：

- `GET /:app/v1/data/schema`。
- `GET /:app/v1/data/:table`。
- `GET /:app/v1/data/:table/:id`。
- select/filter/order/limit 基础能力。

验收：

- 未注册表不可访问。
- 查询只返回允许字段。
- limit 生效。
- SQL 参数化。

### Commit 6: Add Data API write path

范围：

- create/update/delete。
- `created_at`/`updated_at` 自动写入。
- soft delete 支持。
- audit event。

验收：

- create 后可 list/get。
- update 修改 `updated_at`。
- delete 默认 soft delete。
- 非法字段被拒绝。

### Commit 7: Add Policy Engine

范围：

- policy DSL。
- policy template。
- read/write condition compile。
- field mask。

验收：

- 默认终端用户拒绝。
- admin/service key 可按 scope 访问。
- owner policy 生效。
- field mask 生效。

### Commit 8: Add SDK data/schema client

范围：

- `packages/sdk` schema/data methods。
- types。
- examples。

验收：

- SDK 能创建 schema。
- SDK 能 CRUD data。
- 现有 SDK API 不破坏。

### Commit 9: Add CLI schema/data commands

范围：

- `opg schema manifest/table/column/policy/apply`。
- `opg data list/get/create/update/delete`。
- help 文案。

验收：

- CLI 端到端创建表并写入数据。
- 错误信息稳定。
- 现有 `opg db` 保留。

### Commit 10: Add MCP schema/data tools

范围：

- MCP tools 注册。
- schema/data structured tools。
- tool descriptions。

验收：

- `tools/list` 可见新 tools。
- agent 可通过 tools 创建表并写入数据。
- 不暴露裸 SQL 作为默认建 app 路径。

### Commit 11: Add Build/Data UI

范围：

- app 详情内新增 `Build` 入口。
- Data tab。
- table list、columns、policy、API preview。
- 尽量复用现有布局和按钮风格。

验收：

- UI 可创建表和字段。
- UI 可看到 API preview。
- 无大段解释文案。
- 移动和桌面不重叠。

### Commit 12: Add Realtime Gateway foundation

范围：

- Socket.IO 或 ws gateway。
- app/user 鉴权。
- Data API 写路径发事件。
- SDK subscribe。

验收：

- 创建/更新/删除 row 后订阅端收到事件。
- 未授权 channel 被拒绝。
- Redis 不可用时服务降级明确。

### Commit 13: Add Function Runtime foundation

范围：

- function registry。
- deploy version。
- BullMQ run。
- HTTP invoke。
- run logs。

验收：

- 可部署一个简单函数。
- 可通过 API/CLI invoke。
- run 状态和日志可查。
- 超时和失败有稳定错误码。

### Commit 14: Add Workflow Runtime foundation

范围：

- workflow registry。
- step executor。
- data/function/ai/video/storage adapters skeleton。
- run events。

验收：

- 可运行 data -> function 的简单 workflow。
- step 状态可查。
- 失败可定位到 step。

### Commit 15: Bind AI and Video blocks

范围：

- AI block registry。
- Video block registry。
- workflow adapters 对接现有 AI/video service。
- usage settlement 复用现有账本。

验收：

- workflow 可调用 AI block。
- workflow 可提交 video job。
- usage log 和 points settlement 正常。

### Commit 16: Add observability dashboard surfaces

范围：

- Build event log。
- Data API access summary。
- Function/workflow run list。
- AI/video block usage summary。

验收：

- 每个 app 可看到 schema/data/function/workflow 的近期事件。
- 报表不扫明细大表。
- request_id/trace_id 可串联。

### Commit 17: Documentation and verifier

范围：

- 更新 `docs/ARCHITECTURE.md` 链接到本计划。
- 更新 `docs/CLI_USAGE.md`。
- 新增 verifier 脚本覆盖 schema/data/function/workflow。

验收：

- verifier 可创建临时 app、schema、data、function、workflow，并清理。
- web/gateway/sdk/cli build 通过。

## 验收标准

完整闭环验收：

```text
1. 创建一个新 app。
2. 在 Build/Data 创建 customers 表。
3. 添加 email、name、owner_user_id 字段。
4. 配置 owner_read_write policy。
5. 用 SDK 创建 customer。
6. 用 Data API list/get/update/delete。
7. 开启 realtime，更新 row 后收到事件。
8. 创建 function：读取 customers 并返回统计。
9. 创建 workflow：data.query -> ai.generate_text -> data.create。
10. 提交 video block job 并归档结果。
11. 在 Logs/Usage/Audit 看到完整链路。
12. CLI/MCP 能完成同等操作。
```

技术验收：

- 平台内部表不能通过 Data API 访问。
- app A 不能访问 app B 的数据表。
- 未授权用户不能绕过 policy。
- 所有 write path 都有 audit event。
- AI/video 调用继续走 usage settlement。
- schema apply 有 migration record。
- 高级 SQL 不是默认建 app 路径。

性能验收：

- Data API list 500 row 内响应稳定。
- schema manifest 从 cache 读取。
- 大量 rows 不使用 offset 深分页作为主路径。
- Realtime 事件不携带大 payload。
- Functions/workflows 不阻塞 HTTP 主线程。

## 风险与处理

| 风险 | 表现 | 处理 |
| --- | --- | --- |
| SQL 安全边界复杂 | 正则漏判危险 SQL | 普通路径只接结构化 payload，高级 SQL 使用 parser + allowlist |
| UI 变重 | Build 变成低代码平台 | 只做 Data/API/Functions/Workflows 四个工作入口 |
| 权限绕行 | 直接 SQL 或 service key 绕开 policy | Data API 默认走 policy，高级 SQL 仅 admin/developer grant，service key 行为审计 |
| 表结构迁移破坏数据 | drop/alter 导致数据丢失 | dry-run、migration record、大表危险操作 job 化、显式确认 |
| Realtime 放大负载 | 高频写入造成 fanout 压力 | Redis fanout、订阅限制、payload redaction |
| Function 安全 | 用户代码访问平台资源 | 进程隔离、scope secrets、internal client、超时限制 |
| AI/video 成本失控 | workflow 循环或重试导致重复扣费 | idempotency key、预算限制、pre-consume/settle/refund |

## 推荐的第一条实现闭环

第一条落地不要从 Functions 或 Workflow 开始。最高收益闭环是：

```text
AppSchema Registry
  -> structured table/column/policy create
  -> Data API CRUD
  -> SDK/CLI/MCP
  -> Build/Data UI
  -> audit/usage summary
```

原因：

- 这是用户“在基座上创建 app”的最小核心能力。
- 现有 `DeveloperDatabaseService`、CLI、SDK、MCP 已经有基础。
- 不需要先引入复杂 sandbox。
- 后续 AI、视频、函数、workflow 都会依赖这个 data foundation。

完成这条闭环后，AI/Video/Functions/Workflow 就不是孤立功能，而是能绑定用户自定义数据模型的 app building blocks。
