# 模块文档目录

最后更新：2026-06-20

## 模块索引
| 模块 | Controller 数 | Service 数 | 路由数（自动扫描） |
| --- | ---: | ---: | ---: |
| [`acquisition`](./acquisition/README.md) | 3 | 1 | 9 |
| [`ai-agents`](./ai-agents/README.md) | 2 | 3 | 18 |
| [`ai-chat`](./ai-chat/README.md) | 5 | 13 | 57 |
| [`api-keys`](./api-keys/README.md) | 0 | 1 | 0 |
| [`app-blocks`](./app-blocks/README.md) | 1 | 1 | 5 |
| [`app-build-observability`](./app-build-observability/README.md) | 1 | 1 | 2 |
| [`app-connectors`](./app-connectors/README.md) | 2 | 1 | 16 |
| [`app-functions`](./app-functions/README.md) | 2 | 1 | 8 |
| [`app-runtime`](./app-runtime/README.md) | 1 | 1 | 6 |
| [`app-schema`](./app-schema/README.md) | 2 | 2 | 11 |
| [`app-workflows`](./app-workflows/README.md) | 2 | 1 | 7 |
| [`auth`](./auth/README.md) | 1 | 5 | 36 |
| [`behavior-analytics`](./behavior-analytics/README.md) | 0 | 1 | 0 |
| [`bootstrap`](./bootstrap/README.md) | 1 | 1 | 2 |
| [`developer-sdk`](./developer-sdk/README.md) | 1 | 4 | 14 |
| [`discovery`](./discovery/README.md) | 1 | 1 | 1 |
| [`email-delivery`](./email-delivery/README.md) | 1 | 2 | 2 |
| [`feedback`](./feedback/README.md) | 0 | 1 | 0 |
| [`observability`](./observability/README.md) | 0 | 3 | 0 |
| [`outbound-proxy`](./outbound-proxy/README.md) | 0 | 2 | 0 |
| [`payments`](./payments/README.md) | 1 | 2 | 34 |
| [`platform-admin`](./platform-admin/README.md) | 2 | 7 | 221 |
| [`platform-tasks`](./platform-tasks/README.md) | 0 | 3 | 0 |
| [`realtime`](./realtime/README.md) | 1 | 1 | 1 |
| [`redeem`](./redeem/README.md) | 1 | 1 | 1 |
| [`runtime-settings`](./runtime-settings/README.md) | 1 | 1 | 1 |
| [`sms`](./sms/README.md) | 0 | 1 | 0 |
| [`tenant-site`](./tenant-site/README.md) | 1 | 1 | 6 |
| [`upload`](./upload/README.md) | 1 | 1 | 6 |
| [`users`](./users/README.md) | 1 | 1 | 52 |

## 维护约定
- 每次模块新增/删除路由后，执行：`npm run docs:modules`
- 每次模块新增公开 Service 方法后，执行：`npm run docs:modules`
- 如自动扫描结果不足，请在对应模块文档手工补充“联调示例”和“业务约束”
