# AI Gateway 转发与计费架构

## 目标

OPG 的 AI Gateway 面向多 app 后端集群，不做通用 API 分销站。它吸收 new-api 的可靠账务思想：统一模型转发、预扣、实际结算、失败退款、用量审计和低成本聚合，但把管理面压缩到 OPG 需要的模型、供应商、app 默认模型和用户积分钱包。

## 推荐方案

推荐使用当前实现路线：

- `AiRoutingService` 自研模型、来源、app route、价格配置和 usage log。
- `AiChatService` 自研 OpenAI/Gemini/DashScope/RunningHub/Aliyun ICE 等协议适配与 usage 归一化。
- `AiPointsService` 自研积分钱包、ledger、reservation、预扣和实际结算。
- `AiGatewayUsageQueueService` 继续异步写 usage、扣积分和记录观测事件。
- UI 不新增复杂账单面板；后台只暴露模型价格、路由和用户账务真值。

对比方案：

| 方案 | 优点 | 缺点 | 结论 |
| --- | --- | --- | --- |
| 当前 OPG 自研账务核心 | 贴合 app、用户钱包、视频长任务和积分体系 | 需要严格维护账务不变量 | 推荐 |
| 直接复制 new-api 管理面 | 功能多、渠道体系成熟 | 分销站复杂度高，不贴合 OPG 控制平面 | 不推荐 |
| 只做调用后扣费 | 实现简单 | 并发下会超用，失败/视频任务难对账 | 不推荐 |
| 引入第三方 billing SaaS | 财务报表成熟 | 与 app 内积分、AI token、视频任务割裂 | 暂不推荐 |

## 模块架构

```text
Client / App Server
  OpenAI compatible API
  Gemini compatible API
  App internal AI API

AiChatService
  protocol adapter
  provider invocation
  usage normalization
  preflight points reservation
  async video task settlement

AiRoutingService
  global models
  provider sources
  app model routes
  pricing fields
  usage logs
  pricing snapshots
  daily facts

AiPointsService
  app points settings
  user wallet
  ledger
  reservation
  refund / extra capture

PostgreSQL
  ai_global_models
  ai_global_sources
  ai_usage_logs
  ai_usage_daily_facts
  user_ai_points_wallets
  user_ai_points_ledger
  user_ai_points_reservations
```

## 计费链路

### 同步 AI 请求

1. `assertSufficientPointsBeforeInvoke` 根据模型价格和 payload 做 preflight 估算。
2. chat、embedding、TTS、STT 创建 `user_ai_points_reservations` 并立即冻结积分。
3. provider 返回后，`logUsageSafe` 归一化 token、缓存 token、字符数、音频时长或调用次数。
4. usage queue 写入 `ai_usage_logs`，包含 `pricing_snapshot_json` 和 `pricing_snapshot_hash`。
5. `settleReservedPointsForUsage` 计算实际积分并结算 reservation。
6. `AiPointsService.settleReservation` 按实际费用执行：
   - 实际费用小于预扣：退回差额。
   - 实际费用等于预扣：只确认消费。
   - 实际费用大于预扣：补扣差额并记录 `ai_usage_reserve_extra_capture`。
   - 请求失败：释放全部预扣。

### 图片与视频

图片和视频继续用专用 reservation：

- 同步图片先预扣，成功后按实际 resolution / quality 结算。
- 异步视频在提交任务前预扣；任务成功查询到结果后按实际 resolution / provider 计价结算。
- 上游创建失败立即释放 reservation。
- 查询接口只负责推进任务状态和结算，不重复扣费。

## 价格规则

当前使用结构化价格字段，不引入表达式解释器：

- Token：`input_rmb_per_mtoken`、`cached_input_rmb_per_mtoken`、`cache_write_5m_rmb_per_mtoken`、`cache_write_1h_rmb_per_mtoken`、`output_rmb_per_mtoken`。
- 调用：`rmb_per_call`、`points_per_call`。
- 时长：`rmb_per_minute`、`points_per_minute`。
- 字符：TTS 使用 `per_mchar` 模式和每 100 字积分换算。
- 图片/视频：从 `request_overrides.pricing` 按 quality、resolution 和 provider 参数解析。

必须用现成库：

- Provider SDK：`ai`、`@ai-sdk/openai`、`@anthropic-ai/sdk`、`@google/genai`、`openai`。
- 队列和缓存：Redis/BullMQ 类成熟组件，不自研队列。
- 后续若开放公式定价，应使用成熟 decimal 和表达式库，不手写浮点表达式解释器。

必须自研：

- app/model/source/route 的控制面协议。
- usage 归一化和价格快照。
- 积分钱包、ledger、reservation 和结算不变量。
- 视频任务状态机和 provider 结果归档。

## 性能策略

- 主转发路径只做 preflight 和必要的 wallet reservation；usage 写入、积分结算、观测事件放入异步队列。
- route/source/settings 使用已有 TTL cache，避免每次请求重复查询模型和来源配置。
- usage log 保存明细，运营报表读 `ai_usage_daily_facts`，避免后台列表高频扫明细表。
- 视频结果下载、OSS 上传、任务轮询走异步任务状态机，不阻塞普通 AI 转发。
- 账务写入使用 wallet/reservation 行锁，保证并发请求下余额和 ledger 一致。

## UI 原则

不新增解释性面板。后台只需要：

- 模型价格字段可编辑。
- app 默认模型和 route 可配置。
- 用户钱包、ledger、usage log 可查询。
- 异常账务通过 metadata 和观测事件排查。

复杂 reseller、渠道倍率、用户侧仪表盘不是 OPG 当前目标。

## 账务不变量

- reservation 创建时只冻结余额，不增加 `total_spent`。
- settlement 时 `total_spent += actual_points`。
- `wallet.balance` 的变化等于 `-reserved_points + refund_points - extra_capture_points`。
- 成功请求的 usage log `points_cost` 必须等于实际结算积分。
- 失败请求必须释放 reservation，`settled_points = 0`。
- `pricing_snapshot_hash` 是 usage 记录当时价格规则的审计指纹。
