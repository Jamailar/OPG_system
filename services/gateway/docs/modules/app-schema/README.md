# App Schema 模块文档

> 模块名称：`app-schema`
> 最后更新：2026-06-20

## 1. 模块定位
- 负责 `app-schema` 业务域的路由、服务与数据处理。
- 本文档用于模块级维护、交接与变更审查。

## 2. 源码目录
- `src/modules/app-schema/app-data.controller.ts`
- `src/modules/app-schema/app-schema-platform.controller.ts`
- `src/modules/app-schema/app-schema.module.ts`
- `src/modules/app-schema/app-schema.service.ts`
- `src/modules/app-schema/app-schema.types.ts`
- `src/modules/app-schema/policy-engine.service.ts`

## 3. Controller 与路由
### AppDataController
- 控制器文件：`src/modules/app-schema/app-data.controller.ts`
- 基础路由：`tenantControllerPaths('data', true)`

| HTTP 方法 | 路径 | 处理函数 |
| --- | --- | --- |
| GET | `schema` | `getDataSchema()` |
| GET | `:table` | `listRows()` |
| POST | `:table` | `createRow()` |
| GET | `:table/:id` | `getRow()` |
| PATCH | `:table/:id` | `updateRow()` |
| DELETE | `:table/:id` | `deleteRow()` |

### AppSchemaPlatformController
- 控制器文件：`src/modules/app-schema/app-schema-platform.controller.ts`
- 基础路由：`tenantControllerPaths('platform-admin', true)`

| HTTP 方法 | 路径 | 处理函数 |
| --- | --- | --- |
| GET | `apps/:app_id/schema/manifest` | `getAppSchemaManifest()` |
| POST | `apps/:app_id/schema/tables` | `createAppDataTable()` |
| POST | `apps/:app_id/schema/tables/:table/columns` | `addAppDataColumn()` |
| DELETE | `apps/:app_id/schema/tables/:table` | `dropAppDataTable()` |
| POST | `apps/:app_id/schema/tables/:table/policies` | `upsertAppDataPolicy()` |

## 4. Service 能力
### AppSchemaService
- 服务文件：`src/modules/app-schema/app-schema.service.ts`
- 核心方法：
- `getManifest()`
- `createTable()`
- `addColumn()`
- `dropTable()`
- `upsertPolicy()`
- `getDataSchema()`
- `listRows()`
- `getRow()`
- `createRow()`
- `updateRow()`
- `deleteRow()`
- `resolveApp()`
- `resolveTable()`
- `namespaceForApp()`
- `listTables()`
- `listColumns()`
- `resolveDataRequest()`
- `assertDataAccess()`
- `listColumnsForTable()`
- `listIndexes()`
- `listPolicies()`
- `listPoliciesForTable()`
- `listMigrationSummary()`
- `serializeApp()`
- `serializeTableRef()`
- `visibleColumns()`
- `resolveSelectedColumns()`
- `normalizeLimit()`
- `resolveOrder()`
- `resolveFilters()`
- `primaryKeyPredicate()`
- `sqlParam()`
- `pickWritablePayload()`
- `normalizePolicyInput()`
- `rebaseSqlParams()`
- `recordDataEvent()`
- `normalizeCreateColumns()`
- `normalizeColumnInput()`
- `systemColumn()`
- `buildCreateTableSql()`
- `buildAddColumnSql()`
- `defaultExpression()`
- `assertTableSlugAvailable()`
- `assertColumnSlugAvailable()`
- `normalizeIdentifier()`
- `optionalIdentifier()`
- `optionalString()`
- `actorUserId()`
- `optionalUuid()`
- `q()`
- `sha256()`
- `jsonObject()`
- `jsonArray()`

### PolicyEngineService
- 服务文件：`src/modules/app-schema/policy-engine.service.ts`
- 核心方法：
- `validatePolicy()`
- `templatePolicy()`
- `buildActorContext()`
- `matchPolicies()`
- `compileCondition()`
- `evaluateCondition()`
- `validateCondition()`
- `resolveHiddenFields()`
- `resolveValue()`
- `resolveActorRole()`
- `stringArray()`
- `jsonObject()`
- `optionalUuid()`
- `q()`

## 5. 数据库/存储依赖（自动扫描）
- `app_data_columns`
- `app_data_indexes`
- `app_data_policies`
- `app_data_tables`
- `app_schema_change_events`
- `app_schema_migrations`
- `apps`

## 6. 模块依赖（自动扫描）
- `..`
- `api-keys`
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
