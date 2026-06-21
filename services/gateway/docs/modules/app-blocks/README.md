# App Blocks 模块文档

> 模块名称：`app-blocks`
> 最后更新：2026-06-20

## 1. 模块定位
- 负责 `app-blocks` 业务域的路由、服务与数据处理。
- 本文档用于模块级维护、交接与变更审查。

## 2. 源码目录
- `src/modules/app-blocks/app-blocks-platform.controller.ts`
- `src/modules/app-blocks/app-blocks.module.ts`
- `src/modules/app-blocks/app-blocks.service.ts`

## 3. Controller 与路由
### AppBlocksPlatformController
- 控制器文件：`src/modules/app-blocks/app-blocks-platform.controller.ts`
- 基础路由：`tenantControllerPaths('platform-admin', true)`

| HTTP 方法 | 路径 | 处理函数 |
| --- | --- | --- |
| POST | `apps/:app_id/blocks/ai` | `upsertAiBlock()` |
| POST | `apps/:app_id/blocks/video` | `upsertVideoBlock()` |
| POST | `apps/:app_id/blocks/ai/:block/run` | `runAiBlock()` |
| POST | `apps/:app_id/blocks/video/:block/run` | `runVideoBlock()` |
| POST | `apps/:app_id/storage/save` | `saveStorageObject()` |

## 4. Service 能力
### AppBlocksService
- 服务文件：`src/modules/app-blocks/app-blocks.service.ts`
- 核心方法：
- `upsertAiBlock()`
- `upsertVideoBlock()`
- `runAiBlock()`
- `runVideoBlock()`
- `saveStorageObject()`
- `resolveAiBlock()`
- `resolveVideoBlock()`
- `ensureBucket()`
- `renderPrompt()`
- `normalizeIdentifier()`
- `optionalString()`
- `actorUserId()`
- `jsonObject()`
- `serializeStorageFile()`

## 5. 数据库/存储依赖（自动扫描）
- `app_ai_blocks`
- `app_ai_runs`
- `app_storage_buckets`
- `app_storage_files`
- `app_video_blocks`
- `app_video_jobs`

## 6. 模块依赖（自动扫描）
- `..`
- `ai-chat`
- `app-schema`
- `realtime`
- `upload`

## 7. 维护清单
- [ ] 路由变更后已同步更新本文档（含请求/响应变化）
- [ ] Service 新增公开方法已补充用途说明
- [ ] 数据表变更已补充影响说明与迁移步骤
- [ ] 已确认与上游模块依赖关系未破坏
- [ ] 已补充联调示例（如涉及外部调用）

## 8. 变更记录
- 2026-06-20：自动生成/刷新模块文档结构与清单。
