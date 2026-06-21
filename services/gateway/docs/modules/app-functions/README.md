# App Functions 模块文档

> 模块名称：`app-functions`
> 最后更新：2026-06-20

## 1. 模块定位
- 负责 `app-functions` 业务域的路由、服务与数据处理。
- 本文档用于模块级维护、交接与变更审查。

## 2. 源码目录
- `src/modules/app-functions/app-functions-app.controller.ts`
- `src/modules/app-functions/app-functions-platform.controller.ts`
- `src/modules/app-functions/app-functions.module.ts`
- `src/modules/app-functions/app-functions.service.ts`
- `src/modules/app-functions/app-functions.types.ts`

## 3. Controller 与路由
### AppFunctionsAppController
- 控制器文件：`src/modules/app-functions/app-functions-app.controller.ts`
- 基础路由：`tenantControllerPaths('functions', true)`

| HTTP 方法 | 路径 | 处理函数 |
| --- | --- | --- |
| POST | `:slug/invoke` | `invokeFunction()` |

### AppFunctionsPlatformController
- 控制器文件：`src/modules/app-functions/app-functions-platform.controller.ts`
- 基础路由：`tenantControllerPaths('platform-admin', true)`

| HTTP 方法 | 路径 | 处理函数 |
| --- | --- | --- |
| GET | `apps/:app_id/functions` | `listFunctions()` |
| POST | `apps/:app_id/functions` | `createFunction()` |
| POST | `apps/:app_id/functions/:function_id/deploy` | `deployFunction()` |
| GET | `apps/:app_id/functions/:function_id/runs` | `listRuns()` |
| DELETE | `apps/:app_id/functions/:function_id` | `deleteFunction()` |
| POST | `apps/:app_id/functions/:function_id/invoke` | `invokeFromPlatform()` |
| GET | `functions/runtime/status` | `runtimeStatus()` |

## 4. Service 能力
### AppFunctionsService
- 服务文件：`src/modules/app-functions/app-functions.service.ts`
- 核心方法：
- `onModuleInit()`
- `onApplicationShutdown()`
- `runtimeStatus()`
- `listFunctions()`
- `createFunction()`
- `deployFunction()`
- `invokeFunction()`
- `listRuns()`
- `deleteFunction()`
- `runQueued()`
- `executeStructuredSource()`
- `resolveFunction()`
- `resolveVersion()`
- `resolveRun()`
- `markRun()`
- `appendLog()`
- `publishRun()`
- `serializeFunction()`
- `serializeVersion()`
- `serializeRun()`
- `normalizeSource()`
- `normalizeIdentifier()`
- `optionalString()`
- `actorUserId()`
- `sha256()`
- `jsonObject()`

## 5. 数据库/存储依赖（自动扫描）
- `app_function_run_logs`
- `app_function_runs`
- `app_function_versions`
- `app_functions`

## 6. 模块依赖（自动扫描）
- `..`
- `api-keys`
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
