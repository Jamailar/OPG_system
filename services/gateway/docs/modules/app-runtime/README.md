# App Runtime 模块文档

> 模块名称：`app-runtime`
> 最后更新：2026-06-20

## 1. 模块定位
- 负责 `app-runtime` 业务域的路由、服务与数据处理。
- 本文档用于模块级维护、交接与变更审查。

## 2. 源码目录
- `src/modules/app-runtime/app-runtime.controller.ts`
- `src/modules/app-runtime/app-runtime.module.ts`
- `src/modules/app-runtime/app-runtime.service.ts`
- `src/modules/app-runtime/app-runtime.templates.ts`

## 3. Controller 与路由
### AppRuntimeController
- 控制器文件：`src/modules/app-runtime/app-runtime.controller.ts`
- 基础路由：`tenantControllerPaths('platform-admin', true)`

| HTTP 方法 | 路径 | 处理函数 |
| --- | --- | --- |
| GET | `runtime/overview` | `overview()` |
| POST | `runtime/refresh` | `refreshAll()` |
| GET | `runtime/templates` | `templates()` |
| GET | `apps/:app_id/runtime/overview` | `appOverview()` |
| POST | `apps/:app_id/runtime/refresh` | `refreshApp()` |
| POST | `apps/:app_id/runtime/templates/:template_key/apply` | `applyTemplate()` |

## 4. Service 能力
### AppRuntimeService
- 服务文件：`src/modules/app-runtime/app-runtime.service.ts`
- 核心方法：
- `onModuleInit()`
- `listTemplates()`
- `getGlobalOverview()`
- `getAppOverview()`
- `queueRefreshAll()`
- `queueRefreshApp()`
- `queueApplyTemplate()`
- `handleApplyTemplateTask()`
- `handleRefreshAppTask()`
- `handleRefreshAllTask()`
- `applyTemplate()`
- `refreshAppModules()`
- `upsertModules()`
- `upsertModule()`
- `upsertAiBlock()`
- `upsertVideoBlock()`
- `upsertFunction()`
- `upsertWorkflow()`
- `upsertStorageBucket()`
- `recentRuns()`
- `getExistingModule()`
- `safeCount()`
- `safeOne()`
- `ensureRuntimeSchema()`
- `tableExists()`
- `resolveApp()`
- `serializeTemplate()`
- `moduleStatus()`
- `qualityScore()`
- `identifier()`
- `titleize()`
- `objectValue()`
- `numberValue()`
- `intValue()`
- `optionalString()`
- `nullableUuid()`
- `sha256()`
- `serialize()`

## 5. 数据库/存储依赖（自动扫描）
- `ai_app_capability_defaults`
- `ai_app_model_routes`
- `ai_gateway_request_events`
- `alipay_orders`
- `app_ai_blocks`
- `app_ai_runs`
- `app_connector_runs`
- `app_connectors`
- `app_data_tables`
- `app_function_runs`
- `app_function_versions`
- `app_functions`
- `app_module_registry`
- `app_runtime_template_applications`
- `app_schema_change_events`
- `app_storage_buckets`
- `app_storage_files`
- `app_video_blocks`
- `app_video_jobs`
- `app_workflow_runs`
- `app_workflows`
- `apple_login_credentials`
- `apps`
- `email_campaigns`
- `email_templates`
- `entitlement_code_redemptions`
- `entitlement_codes`
- `entitlement_packages`
- `github_oauth_apps`
- `google_oauth_clients`
- `next_version`
- `payment_products`
- `platform_request_events`
- `platform_sms_message_events`
- `platform_sms_providers`
- `platform_sms_templates`
- `tenant_site_messages`
- `user_behavior_events`
- `users`
- `wechat_open_apps`

## 6. 模块依赖（自动扫描）
- `..`
- `app-schema`
- `platform-tasks`

## 7. 维护清单
- [ ] 路由变更后已同步更新本文档（含请求/响应变化）
- [ ] Service 新增公开方法已补充用途说明
- [ ] 数据表变更已补充影响说明与迁移步骤
- [ ] 已确认与上游模块依赖关系未破坏
- [ ] 已补充联调示例（如涉及外部调用）

## 8. 变更记录
- 2026-06-20：自动生成/刷新模块文档结构与清单。
