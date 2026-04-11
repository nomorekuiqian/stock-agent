# Docs Index

文档总索引。CLAUDE.md 是入口地图，本文件是完整导航。

## 约束系统 (docs/constraints/)

工程不变量和规范，所有代码变更必须遵守。

- [engineering-rules.md](constraints/engineering-rules.md) — Context 自动维护、产品策略同步、测试质量要求、开发 Workflow
- [auth.md](constraints/auth.md) — 认证流程（Server Proxy 登录、token 刷新、cookie 管理）
- [reliability.md](constraints/reliability.md) — 工程可靠性（错误处理、速率限制、健康检查、日志）
- [design-system.md](constraints/design-system.md) — 设计规范（Financial Terminal + Editorial Luxury）

## 工程计划 (docs/plans/)

功能开发前的设计文档。模板: [_template.md](plans/_template.md)

- [active/](plans/active/) — 进行中或规划中的计划
- [completed/](plans/completed/) — 已完成的计划

## 架构 (docs/)

- [architecture.md](architecture.md) — 系统架构总览

## 产品 (docs/product/)

- [roadmap.md](product/roadmap.md) — 产品路线图
- [brand.md](product/brand.md) — 品牌叙事

## 参考资料 (docs/references/)

查阅用，非指导性。

- [pages.md](references/pages.md) — 前端页面路由表
- [components.md](references/components.md) — 前端组件与库文件清单
- [plugin-insights.md](references/plugin-insights.md) — Financial Analysis Plugin 产品启发
- [agent-transformation.md](references/agent-transformation.md) — Agent 架构演进

## 技术深潜 (docs/technical/)

- [openbb-integration.md](technical/openbb-integration.md) — OpenBB 集成方案

## 模块文档 (.context.md)

分布在代码目录中，修改代码前先阅读。

**后端** (`backend/app/`):
- `core/.context.md` — 核心基础设施
- `features/daily_report/.context.md` — 市场日报
- `features/morning_report/.context.md` — 盘前早报
- `features/brew/.context.md` — 个性化摘要
- `features/stock/.context.md` — 个股投研
- `features/macro/{risk,liquidity,weekly,cache}/.context.md` — 宏观体系
- `features/screener/.context.md` — Stock Screener
- `features/{subscription,notification,feedback,payment}/.context.md` — 运营模块
- `shared/.context.md` + `shared/data_tools/.context.md` — 共享服务

**前端** (`frontend/src/`):
- `app/{today,morning,for-you,stock,macro,screener}/.context.md` — 页面
- `app/api/auth/.context.md` — Server Proxy 认证路由
- `{lib,components,contexts,hooks}/.context.md` — 共享层
- `test/.context.md` — 测试体系

## 外部知识库

- Obsidian `~/...TheMarketBrew增长/产品/` — 产品方向 source of truth
- `memory/MEMORY.md` — Claude Code 跨会话记忆
