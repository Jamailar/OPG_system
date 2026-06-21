# Runtime Settings 模块文档

> 模块名称：`runtime-settings`
> 最后更新：2026-06-20

## 1. 模块定位
- 负责 `runtime-settings` 业务域的路由、服务与数据处理。
- 本文档用于模块级维护、交接与变更审查。

## 2. 源码目录
- `src/modules/runtime-settings/runtime-settings.controller.ts`
- `src/modules/runtime-settings/runtime-settings.module.ts`
- `src/modules/runtime-settings/runtime-settings.service.ts`

## 3. Controller 与路由
### RuntimeSettingsController
- 控制器文件：`src/modules/runtime-settings/runtime-settings.controller.ts`
- 基础路由：`'runtime-config'`

| HTTP 方法 | 路径 | 处理函数 |
| --- | --- | --- |
| GET | `(root)` | `getRuntimeConfig()` |

## 4. Service 能力
### RuntimeSettingsService
- 服务文件：`src/modules/runtime-settings/runtime-settings.service.ts`
- 核心方法：
- `onModuleInit()`
- `getAdminRuntimeSettings()`
- `updateAdminRuntimeSettings()`
- `getPublicRuntimeConfig()`
- `getConfiguredCorsOrigins()`
- `getSessionPolicy()`
- `getAiGatewayTuning()`
- `getOauthSettings()`
- `getIntegrationSettings()`
- `getConfigSourceSummary()`
- `listStorageProviders()`
- `createStorageProvider()`
- `updateStorageProvider()`
- `deleteStorageProvider()`
- `testStorageProvider()`
- `resolveDefaultStorageProviderConfig()`
- `listSmtpProviders()`
- `createSmtpProvider()`
- `updateSmtpProvider()`
- `deleteSmtpProvider()`
- `testSmtpProvider()`
- `resolveDefaultSmtpProviderConfig()`
- `listPlatformApiKeys()`
- `createPlatformApiKey()`
- `revokePlatformApiKey()`
- `validatePlatformApiKey()`
- `ensureSchema()`
- `initializeSchema()`
- `findSingletonRow()`
- `getOrCreateSingletonRow()`
- `getStorageProviderRow()`
- `getSmtpProviderRow()`
- `resolveStorageProviderConfig()`
- `resolveStorageProviderRow()`
- `resolveSmtpProviderConfig()`
- `resolveSmtpProviderRow()`
- `serializeStorageProvider()`
- `serializePlatformApiKey()`
- `serializeSmtpProvider()`
- `normalizePayload()`
- `serializeAdminSettings()`
- `normalizeOptionalUrl()`
- `normalizeCorsOrigins()`
- `normalizeStringArray()`
- `normalizeSessionPolicy()`
- `normalizePaymentsScheduler()`
- `normalizeAiGatewayTuning()`
- `normalizeOauthSettings()`
- `normalizeIntegrationSettings()`
- `normalizeStorageProviderType()`
- `normalizeStorageProviderConfig()`
- `normalizeStorageProviderSecrets()`
- `assertStorageProviderComplete()`
- `getStorageProviderMissingFields()`
- `normalizeSmtpProviderConfig()`
- `normalizeSmtpProviderSecrets()`
- `assertSmtpProviderComplete()`
- `encryptSecretJson()`
- `decryptSecretJson()`
- `resolveSecretsKey()`
- `hashApiKey()`
- `secureEquals()`
- `normalizeApiKeyScopes()`
- `apiKeyHasScope()`
- `normalizeOptionalDate()`
- `stringValue()`
- `numberValue()`
- `copyBoundedInteger()`
- `copyOptionalUrl()`
- `assertUuid()`
- `normalizeHostList()`

## 5. 数据库/存储依赖（自动扫描）
- `platform_api_keys`
- `platform_runtime_settings`
- `platform_smtp_providers`
- `platform_storage_providers`
- `ranked`

## 6. 模块依赖（自动扫描）
- （未检测到模块级依赖导入）

## 7. 维护清单
- [ ] 路由变更后已同步更新本文档（含请求/响应变化）
- [ ] Service 新增公开方法已补充用途说明
- [ ] 数据表变更已补充影响说明与迁移步骤
- [ ] 已确认与上游模块依赖关系未破坏
- [ ] 已补充联调示例（如涉及外部调用）

## 8. 变更记录
- 2026-06-20：自动生成/刷新模块文档结构与清单。
