# Realtime 模块文档

> 模块名称：`realtime`
> 最后更新：2026-06-20

## 1. 模块定位
- 负责 `realtime` 业务域的路由、服务与数据处理。
- 本文档用于模块级维护、交接与变更审查。

## 2. 源码目录
- `src/modules/realtime/realtime-events.service.ts`
- `src/modules/realtime/realtime.controller.ts`
- `src/modules/realtime/realtime.gateway.ts`
- `src/modules/realtime/realtime.module.ts`

## 3. Controller 与路由
### RealtimeController
- 控制器文件：`src/modules/realtime/realtime.controller.ts`
- 基础路由：`tenantControllerPaths('realtime', true)`

| HTTP 方法 | 路径 | 处理函数 |
| --- | --- | --- |
| GET | `status` | `status()` |

## 4. Service 能力
### RealtimeEventsService
- 服务文件：`src/modules/realtime/realtime-events.service.ts`
- 核心方法：
- `attachServer()`
- `setRedisAdapterStatus()`
- `status()`
- `publish()`

## 5. 数据库/存储依赖（自动扫描）
- `apps`

## 6. 模块依赖（自动扫描）
- `api-keys`
- `auth`
- `developer-sdk`

## 7. 维护清单
- [ ] 路由变更后已同步更新本文档（含请求/响应变化）
- [ ] Service 新增公开方法已补充用途说明
- [ ] 数据表变更已补充影响说明与迁移步骤
- [ ] 已确认与上游模块依赖关系未破坏
- [ ] 已补充联调示例（如涉及外部调用）

## 8. 变更记录
- 2026-06-20：自动生成/刷新模块文档结构与清单。
