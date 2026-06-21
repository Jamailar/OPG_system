# App Connectors 模块文档

> 模块名称：`app-connectors`
> 最后更新：2026-06-20

## 1. 模块定位
- 负责 `app-connectors` 业务域的路由、服务与数据处理。
- 本文档用于模块级维护、交接与变更审查。

## 2. 源码目录
- `src/modules/app-connectors/app-connectors-app.controller.ts`
- `src/modules/app-connectors/app-connectors-platform.controller.ts`
- `src/modules/app-connectors/app-connectors.crypto.ts`
- `src/modules/app-connectors/app-connectors.module.ts`
- `src/modules/app-connectors/app-connectors.service.ts`
- `src/modules/app-connectors/app-connectors.types.ts`

## 3. Controller 与路由
### AppConnectorsAppController
- 控制器文件：`src/modules/app-connectors/app-connectors-app.controller.ts`
- 基础路由：`tenantControllerPaths('connectors', true)`

| HTTP 方法 | 路径 | 处理函数 |
| --- | --- | --- |
| POST | `:connector/actions/:action/invoke` | `invokeAction()` |

### AppConnectorsPlatformController
- 控制器文件：`src/modules/app-connectors/app-connectors-platform.controller.ts`
- 基础路由：`tenantControllerPaths('platform-admin', true)`

| HTTP 方法 | 路径 | 处理函数 |
| --- | --- | --- |
| GET | `apps/:app_id/connectors` | `listConnectors()` |
| POST | `apps/:app_id/connectors` | `createConnector()` |
| PATCH | `apps/:app_id/connectors/:connector` | `updateConnector()` |
| DELETE | `apps/:app_id/connectors/:connector` | `deleteConnector()` |
| GET | `apps/:app_id/connectors/:connector/credentials` | `listCredentials()` |
| POST | `apps/:app_id/connectors/:connector/credentials` | `createCredential()` |
| PATCH | `apps/:app_id/connectors/:connector/credentials/:credential` | `updateCredential()` |
| DELETE | `apps/:app_id/connectors/:connector/credentials/:credential` | `deleteCredential()` |
| GET | `apps/:app_id/connectors/:connector/actions` | `listActions()` |
| POST | `apps/:app_id/connectors/:connector/actions` | `createAction()` |
| PATCH | `apps/:app_id/connectors/:connector/actions/:action` | `updateAction()` |
| DELETE | `apps/:app_id/connectors/:connector/actions/:action` | `deleteAction()` |
| POST | `apps/:app_id/connectors/:connector/actions/:action/invoke` | `invokeAction()` |
| GET | `apps/:app_id/connectors/:connector/runs` | `listRuns()` |
| GET | `apps/:app_id/connectors/:connector/actions/:action/runs` | `listActionRuns()` |

## 4. Service 能力
### AppConnectorsService
- 服务文件：`src/modules/app-connectors/app-connectors.service.ts`
- 核心方法：
- `listConnectors()`
- `createConnector()`
- `updateConnector()`
- `deleteConnector()`
- `listCredentials()`
- `createCredential()`
- `updateCredential()`
- `deleteCredential()`
- `listActions()`
- `createAction()`
- `updateAction()`
- `deleteAction()`
- `invokeAction()`
- `listRuns()`
- `buildUrl()`
- `resolveRequestBody()`
- `readResponsePayload()`
- `mapResponse()`
- `mapError()`
- `validateInputSchema()`
- `createRun()`
- `updateRunRequest()`
- `publishRun()`
- `normalizeConnectorInput()`
- `normalizeCredentialInput()`
- `normalizeActionInput()`
- `resolveRuntimeCredential()`
- `resolveConnector()`
- `resolveCredentialRow()`
- `resolveAction()`
- `assertConnectorSlugAvailable()`
- `assertCredentialSlugAvailable()`
- `assertActionRouteAvailable()`
- `normalizeBaseUrlString()`
- `normalizeBaseUrl()`
- `isPrivateHost()`
- `normalizePathTemplate()`
- `applyTemplateHeaders()`
- `renderAny()`
- `renderString()`
- `lookupPath()`
- `safeResponseHeaders()`
- `isSecretHeader()`
- `redactUrl()`
- `serializeConnector()`
- `serializeCredential()`
- `serializeAction()`
- `serializeRun()`
- `resolveApp()`
- `normalizeIdentifier()`
- `normalizeStatus()`
- `actorUserId()`
- `nullableUuid()`
- `intValue()`
- `stringValue()`
- `optionalString()`
- `serialize()`

## 5. 数据库/存储依赖（自动扫描）
- `app_connector_actions`
- `app_connector_credentials`
- `app_connector_runs`
- `app_connectors`
- `lateral`

## 6. 模块依赖（自动扫描）
- `..`
- `api-keys`
- `app-schema`
- `auth`
- `developer-sdk`
- `realtime`

## 7. 业务约束
- Connector 绑定到单个 app；`slug` 在同 app 内查重，软删除后可复用。
- Credential 的 secret 只保存加密值，列表接口只返回 `secret_status`，不会回传明文。
- Action 路由在同 connector 内按 `slug` 和 `method + path_template` 双重查重；重复创建返回 `409 Conflict`。
- `base_url` 只允许 `http/https` 且不能携带 URL 用户名密码；默认拒绝 localhost、内网和 `.local` 主机，只有显式 `security.allow_private_network=true` 才允许。
- 调用会写入 `app_connector_runs`，并发布 `connector.running`、`connector.succeeded`、`connector.failed` 事件，便于 Runtime Registry 和控制台追踪。

## 8. 联调示例
```bash
opg connector create --app-id <app-id> --slug crm --base-url https://api.example.com
opg connector credential create crm --app-id <app-id> --json '{"slug":"default","auth_mode":"bearer","secrets":{"token":"..."}}'
opg connector action create crm --app-id <app-id> --json '{"slug":"lookup","method":"GET","path_template":"/customers/{{input.customer_id}}"}'
opg connector invoke crm lookup --json '{"input":{"customer_id":"123"}}'
```

## 9. 维护清单
- [ ] 路由变更后已同步更新本文档（含请求/响应变化）
- [ ] Service 新增公开方法已补充用途说明
- [ ] 数据表变更已补充影响说明与迁移步骤
- [ ] 已确认与上游模块依赖关系未破坏
- [ ] 已补充联调示例（如涉及外部调用）

## 10. 变更记录
- 2026-06-20：自动生成/刷新模块文档结构与清单。
