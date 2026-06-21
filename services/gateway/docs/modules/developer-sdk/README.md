# Developer Sdk 模块文档

> 模块名称：`developer-sdk`
> 最后更新：2026-06-20

## 1. 模块定位
- 负责 `developer-sdk` 业务域的路由、服务与数据处理。
- 本文档用于模块级维护、交接与变更审查。

## 2. 源码目录
- `src/modules/developer-sdk/developer-authorization.module.ts`
- `src/modules/developer-sdk/developer-authorization.service.ts`
- `src/modules/developer-sdk/developer-database.service.ts`
- `src/modules/developer-sdk/developer-sdk-auth.guard.ts`
- `src/modules/developer-sdk/developer-sdk-login.service.ts`
- `src/modules/developer-sdk/developer-sdk.controller.ts`
- `src/modules/developer-sdk/developer-sdk.module.ts`
- `src/modules/developer-sdk/developer-sdk.service.ts`

## 3. Controller 与路由
### DeveloperSdkController
- 控制器文件：`src/modules/developer-sdk/developer-sdk.controller.ts`
- 基础路由：`tenantControllerPaths('sdk', true)`

| HTTP 方法 | 路径 | 处理函数 |
| --- | --- | --- |
| GET | `manifest` | `getManifest()` |
| GET | `openapi.json` | `getOpenApi()` |
| GET | `examples` | `getExamples()` |
| POST | `smoke-test` | `smokeTest()` |
| POST | `install-profile` | `installProfile()` |
| POST | `auth/sessions` | `createLoginSession()` |
| GET | `auth/sessions/:state` | `getLoginSession()` |
| POST | `auth/sessions/:state/authorize` | `authorizeLoginSession()` |
| POST | `auth/token` | `exchangeLoginToken()` |
| GET | `database/manifest` | `databaseManifest()` |
| GET | `database/tables` | `databaseTables()` |
| GET | `database/tables/:table` | `databaseTable()` |
| POST | `database/query` | `databaseQuery()` |
| POST | `database/execute` | `databaseExecute()` |

## 4. Service 能力
### DeveloperAuthorizationService
- 服务文件：`src/modules/developer-sdk/developer-authorization.service.ts`
- 核心方法：
- `onModuleInit()`
- `scopeCatalog()`
- `ensureReady()`
- `normalizeScopes()`
- `createGrant()`
- `listGrants()`
- `updateGrant()`
- `revokeGrant()`
- `authenticateGrant()`
- `assertActorScope()`
- `getGrant()`
- `getGrantRow()`
- `serializeGrant()`
- `grantSelectSql()`
- `resolveApp()`
- `resolveAppsByIds()`
- `normalizeUuidArray()`
- `deserializeStringArray()`
- `normalizeOptionalDate()`
- `hashToken()`
- `secureEquals()`
- `ensureSchema()`
- `initSchema()`

### DeveloperDatabaseService
- 服务文件：`src/modules/developer-sdk/developer-database.service.ts`
- 核心方法：
- `onModuleInit()`
- `getManifest()`
- `listTables()`
- `describeTable()`
- `query()`
- `execute()`
- `assertDatabaseAccess()`
- `assertExecuteScopes()`
- `resolveApp()`
- `serializeApp()`
- `namespaceForApp()`
- `normalizeSql()`
- `singleStatement()`
- `normalizeParams()`
- `normalizeLimit()`
- `normalizeTableName()`
- `assertReadStatement()`
- `assertWriteStatement()`
- `assertSqlSafe()`
- `assertAllowedIdentifier()`
- `statementOperation()`
- `isAllowedWriteShape()`
- `extractTableReferences()`
- `extractCteAliases()`
- `wrapReadQuery()`
- `nullableUuid()`
- `ensureSchema()`
- `initSchema()`

### DeveloperSdkLoginService
- 服务文件：`src/modules/developer-sdk/developer-sdk-login.service.ts`
- 核心方法：
- `onModuleInit()`
- `getSession()`
- `authorizeSession()`
- `exchangeToken()`
- `exchangePlatformToken()`
- `resolveApp()`
- `resolveSessionApp()`
- `findSession()`
- `assertSessionPending()`
- `assertPlatformOrAppAdmin()`
- `assertPlatformAdmin()`
- `normalizeCallbackUrl()`
- `normalizeWebBaseUrl()`
- `normalizeLabel()`
- `buildLoginUrl()`
- `appendCallbackParams()`
- `publicStatus()`
- `apiKeyName()`
- `deserializeStringArray()`
- `serializeApp()`
- `randomToken()`
- `hashToken()`
- `ensureSchema()`
- `initSchema()`

### DeveloperSdkService
- 服务文件：`src/modules/developer-sdk/developer-sdk.service.ts`
- 核心方法：
- `getManifest()`
- `getOpenApi()`
- `getExamples()`
- `runSmokeTest()`
- `resolveApp()`
- `namespaceForApp()`

## 5. 数据库/存储依赖（自动扫描）
- `app_database_change_events`
- `apps`
- `developer_authorization_grants`
- `developer_sdk_login_sessions`
- `information_schema`
- `pg_indexes`
- `users`

## 6. 模块依赖（自动扫描）
- `api-keys`
- `auth`

## 7. 维护清单
- [ ] 路由变更后已同步更新本文档（含请求/响应变化）
- [ ] Service 新增公开方法已补充用途说明
- [ ] 数据表变更已补充影响说明与迁移步骤
- [ ] 已确认与上游模块依赖关系未破坏
- [ ] 已补充联调示例（如涉及外部调用）

## 8. 变更记录
- 2026-06-20：自动生成/刷新模块文档结构与清单。
