# Observability 模块文档

> 模块名称：`observability`
> 最后更新：2026-06-20

## 1. 模块定位
- 负责 `observability` 业务域的路由、服务与数据处理。
- 本文档用于模块级维护、交接与变更审查。

## 2. 源码目录
- `src/modules/observability/observability.module.ts`
- `src/modules/observability/platform-observability-retention.service.ts`
- `src/modules/observability/platform-observability.constants.ts`
- `src/modules/observability/platform-observability.service.ts`
- `src/modules/observability/platform-request-context.middleware.ts`
- `src/modules/observability/platform-request-context.service.ts`

## 3. Controller 与路由
当前模块没有 Controller 文件。

## 4. Service 能力
### PlatformObservabilityRetentionService
- 服务文件：`src/modules/observability/platform-observability-retention.service.ts`
- 核心方法：
- `pruneExpiredPlatformObservabilityEvents()`
- `deleteExpiredRows()`

### PlatformObservabilityService
- 服务文件：`src/modules/observability/platform-observability.service.ts`
- 核心方法：
- `onModuleInit()`
- `isSchemaReady()`
- `recordRequestEvent()`
- `recordRequestEventSafe()`
- `recordAuditEvent()`
- `recordAuditEventSafe()`
- `listRequestEvents()`
- `listAuditEvents()`
- `getRuntimeSummary()`
- `getRetentionSummary()`
- `getTableHealth()`
- `ensureSchema()`
- `initSchema()`
- `arePrerequisiteTablesReady()`
- `hashSnapshot()`
- `redact()`
- `stableStringify()`
- `normalizeMetadata()`
- `normalizeNullableUuid()`
- `normalizeNullableString()`
- `normalizeRequiredString()`
- `normalizeNullableInt()`
- `parsePaging()`
- `paginated()`
- `addUuidFilter()`
- `addTextFilter()`
- `addBooleanFilter()`
- `addStatusMinFilter()`
- `addDaysFilter()`

### PlatformRequestContextService
- 服务文件：`src/modules/observability/platform-request-context.service.ts`
- 核心方法：
- `get()`
- `getRequestId()`

## 5. 数据库/存储依赖（自动扫描）
- `deleted`
- `pg_class`
- `platform_audit_events`
- `platform_request_events`

## 6. 模块依赖（自动扫描）
- `..`

## 7. 维护清单
- [ ] 路由变更后已同步更新本文档（含请求/响应变化）
- [ ] Service 新增公开方法已补充用途说明
- [ ] 数据表变更已补充影响说明与迁移步骤
- [ ] 已确认与上游模块依赖关系未破坏
- [ ] 已补充联调示例（如涉及外部调用）

## 8. 变更记录
- 2026-06-20：自动生成/刷新模块文档结构与清单。
