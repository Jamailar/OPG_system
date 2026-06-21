# Sms 模块文档

> 模块名称：`sms`
> 最后更新：2026-06-20

## 1. 模块定位
- 负责 `sms` 业务域的路由、服务与数据处理。
- 本文档用于模块级维护、交接与变更审查。

## 2. 源码目录
- `src/modules/sms/sms.module.ts`
- `src/modules/sms/sms.service.ts`
- `src/modules/sms/sms.types.ts`

## 3. Controller 与路由
当前模块没有 Controller 文件。

## 4. Service 能力
### SmsService
- 服务文件：`src/modules/sms/sms.service.ts`
- 核心方法：
- `onModuleInit()`
- `getProviderCatalog()`
- `listProviders()`
- `deleteProvider()`
- `testProvider()`
- `listSignatures()`
- `deleteSignature()`
- `listTemplates()`
- `deleteTemplate()`
- `sendSmsCode()`
- `sendSmsCodeForAppId()`
- `verifySmsCodeForAppId()`
- `normalizeSmsPhone()`
- `normalizeSmsPhoneVariants()`
- `normalizeSmsVerificationCode()`
- `getSummary()`
- `sendSmsCodeForResolvedApp()`
- `dispatchGenericApi()`
- `dispatchAliyun()`
- `dispatchTencent()`
- `dispatchHuawei()`
- `dispatchVolcengine()`
- `dispatchTwilio()`
- `dispatchVonage()`
- `dispatchMessageBird()`
- `dispatchPlivo()`
- `dispatchAwsSns()`
- `resolveSmsRouteConfig()`
- `ensureSmsSchema()`
- `initializeSmsSchema()`
- `normalizeProviderConfig()`
- `mergeProviderConfigForUpdate()`
- `assertProviderConfig()`
- `serializeProvider()`
- `serializeSignature()`
- `serializeTemplate()`
- `serializeEvent()`
- `maskProviderConfig()`
- `getProviderRow()`
- `getSignatureRow()`
- `getTemplateRow()`
- `storeSmsCode()`
- `verifySmsCode()`
- `deleteSmsCode()`
- `assertSmsSendCooldown()`
- `recordConfigAudit()`
- `resolveDispatchMode()`
- `defaultDispatchMode()`
- `parseProviderType()`
- `providerLabel()`
- `resolveProviderHealthUrl()`
- `buildTemplatePayload()`
- `buildGenericHeaders()`
- `renderTemplateMessage()`
- `resolveOrderedTemplateParams()`
- `pickTemplateCode()`
- `pickTemplateVariables()`
- `buildAliyunSignedUrl()`
- `aliyunPercentEncode()`
- `getAwsSignatureKey()`
- `fetchOrThrow()`
- `rethrowFetchError()`
- `parseJsonResponse()`
- `pickProviderError()`
- `extractAppSmsRouteConfig()`
- `resolveAppWithSettings()`
- `resolveAppByIdWithSettings()`
- `normalizePhone()`
- `buildPhoneIdentityVariants()`
- `normalizeSmsCode()`
- `generateVerificationCode()`
- `hashSmsCode()`
- `hashPhone()`
- `maskPhone()`
- `maskSecret()`
- `parseBooleanLike()`
- `clampTimeout()`
- `clampInteger()`
- `describeNetworkFailure()`
- `truncateJson()`

## 5. 数据库/存储依赖（自动扫描）
- `auth_sms_verification_codes`
- `platform_sms_message_events`
- `platform_sms_providers`
- `platform_sms_signatures`
- `platform_sms_templates`

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
