# App Workflows 模块文档

> 模块名称：`app-workflows`
> 最后更新：2026-06-20

## 1. 模块定位
- 负责 `app-workflows` 业务域的路由、服务与数据处理。
- 本文档用于模块级维护、交接与变更审查。

## 2. 源码目录
- `src/modules/app-workflows/app-workflows-app.controller.ts`
- `src/modules/app-workflows/app-workflows-platform.controller.ts`
- `src/modules/app-workflows/app-workflows.module.ts`
- `src/modules/app-workflows/app-workflows.service.ts`
- `src/modules/app-workflows/app-workflows.types.ts`

## 3. Controller 与路由
### AppWorkflowsAppController
- 控制器文件：`src/modules/app-workflows/app-workflows-app.controller.ts`
- 基础路由：`tenantControllerPaths('workflows', true)`

| HTTP 方法 | 路径 | 处理函数 |
| --- | --- | --- |
| POST | `:slug/run` | `runWorkflow()` |

### AppWorkflowsPlatformController
- 控制器文件：`src/modules/app-workflows/app-workflows-platform.controller.ts`
- 基础路由：`tenantControllerPaths('platform-admin', true)`

| HTTP 方法 | 路径 | 处理函数 |
| --- | --- | --- |
| GET | `apps/:app_id/workflows` | `listWorkflows()` |
| POST | `apps/:app_id/workflows` | `createWorkflow()` |
| POST | `apps/:app_id/workflows/:workflow_id/run` | `runWorkflow()` |
| GET | `apps/:app_id/workflows/:workflow_id/runs` | `listRuns()` |
| DELETE | `apps/:app_id/workflows/:workflow_id` | `deleteWorkflow()` |
| GET | `workflows/runtime/status` | `runtimeStatus()` |

## 4. Service 能力
### AppWorkflowsService
- 服务文件：`src/modules/app-workflows/app-workflows.service.ts`
- 核心方法：
- `onModuleInit()`
- `onApplicationShutdown()`
- `runtimeStatus()`
- `listWorkflows()`
- `createWorkflow()`
- `runWorkflow()`
- `listRuns()`
- `deleteWorkflow()`
- `runQueued()`
- `executeStep()`
- `createStepRun()`
- `completeStepRun()`
- `resolveWorkflow()`
- `resolveRun()`
- `markRun()`
- `publishRun()`
- `serializeQueuedActor()`
- `deserializeQueuedActor()`
- `serializeWorkflow()`
- `serializeRun()`
- `normalizeSteps()`
- `normalizeIdentifier()`
- `optionalString()`
- `actorUserId()`
- `jsonObject()`

## 5. 数据库/存储依赖（自动扫描）
- `app_workflow_run_steps`
- `app_workflow_runs`
- `app_workflows`

## 6. 模块依赖（自动扫描）
- `..`
- `api-keys`
- `app-blocks`
- `app-connectors`
- `app-functions`
- `app-schema`
- `auth`
- `developer-sdk`
- `realtime`

## 7. 维护清单
- [ ] 路由变更后已同步更新本文档（含请求/响应变化）
- [ ] Service 新增公开方法已补充用途说明
- [ ] 数据表变更已补充影响说明与迁移步骤
- [ ] 已确认与上游模块依赖关系未破坏
- [ ] 已补充联调示例（如涉及外部调用）

## 8. 变更记录
- 2026-06-20：自动生成/刷新模块文档结构与清单。
