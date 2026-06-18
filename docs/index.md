# Docs Index

文档总索引。AGENTS.md 是入口地图，本文件是完整导航。

## 协作指南

- [contributing.md](contributing.md) — 主理人之外的贡献者必读：onboarding / Git 工作流 / 质量门禁 / Code Review / 密钥管理 / 数据安全 / 项目工具栈

## 约束系统 (docs/constraints/)

工程不变量和规范，所有代码变更必须遵守。

- [engineering-rules.md](constraints/engineering-rules.md) — Context 自动维护、产品策略同步、测试质量要求、开发 Workflow
- [auth.md](constraints/auth.md) — 认证流程（Server Proxy 登录、token 刷新、cookie 管理）
- [reliability.md](constraints/reliability.md) — 工程可靠性（错误处理、速率限制、健康检查、日志）
- [design-system.md](constraints/design-system.md) — 设计规范（Financial Terminal + Editorial Luxury）

## 功能记录 (docs/features/)

已交付功能的权威归档（spec / 设计 / 已完成 / 待完成 / runbook），与 active plan 分离。

- [holdings-sync-track-m/](features/holdings-sync-track-m/README.md) — Track M 手动/导入持仓同步（截图/粘贴/CSV/PDF）：代码完工 + Insforge 部署完成，待后端上新代码 + 灰度

## 工程计划 (docs/plans/)

功能开发前的设计文档。模板: [_template.md](plans/_template.md)

- [active/](plans/active/) — 进行中或规划中的计划
- [for-you/](plans/for-you/) — /for-you 专属页面改进总纲（P0 基础 → P1 智能 → P2 Copilot）
- [proposals/](plans/proposals/) — 用户痛点提案 backlog（已设计、未进入 active 开发）
  - [holdings-sync-design.md](plans/proposals/holdings-sync-design.md) — 持仓同步（券商只读 SnapTrade + 手动/CSV/粘贴导入）
  - [event-radar-source-enrichment.md](plans/proposals/event-radar-source-enrichment.md) — 事件雷达数据源增强 backlog
- [completed/](plans/completed/) — 已完成的计划

## 架构 (docs/)

- [architecture.md](architecture.md) — 系统架构总览

## 产品 (docs/)

- [product/roadmap.md](product/roadmap.md) — 产品路线图
- [brand/narrative.md](brand/narrative.md) — 品牌叙事

## 操作指南 (docs/guides/)

日常操作的长期指南（区别于一次性的 plan/runbook）。

- [feature-flags-playbook.md](guides/feature-flags-playbook.md) — Feature flag 新增 / 退役 / 灰度名单管理 / 故障速查（**flag 日常操作看这里，不是归档的 plan runbook**）
- [llm-usage-metering.md](guides/llm-usage-metering.md) — LLM token 用量埋点：查 cost / 给新 agent 加 metering / 故障速查（**新 LlmAgent 必须挂 `meter()` callback**）
- [panda-zsxq-automation.md](guides/panda-zsxq-automation.md) — Panda 知识星球抓取、deterministic enrichment、vector embedding 自动化设计手册

## Eval (docs/evals/)

- [kol-research.md](evals/kol-research.md) — Frank/KOL research agent 轻量评测：case、hard gates、fixture/live 运行方式

## 参考资料 (docs/reference/)

查阅用，非指导性。

- [pages.md](reference/pages.md) — 前端页面路由表
- [components.md](reference/components.md) — 前端组件清单
- [market-lens-mcp.md](reference/market-lens-mcp.md) — Market Lens MCP backend-first：薄 NPM adapter、backend context pack、安装与验证
- [twitter-kol-source-research.md](reference/twitter-kol-source-research.md) — 推特 KOL 信息源扩展 research
- [vector-rag-pipeline.md](reference/vector-rag-pipeline.md) — vector embedding / retrieval / RAG pipeline

## 模块文档 (.context.md)

分布在代码目录中，修改代码前先阅读。

**后端** (`backend/app/`):
- `core/.context.md` — 核心基础设施
- `edge_functions/.context.md` — Insforge Edge Functions
- `frank_mcp/.context.md` — Market Lens MCP server
- `utils/.context.md` — 后端通用工具
- `shared/.context.md` + `shared/data_tools/.context.md` + `shared/kol_persona/.context.md` — 共享服务
- `features/admin/.context.md` — 管理后台
- `features/agent_runtime/.context.md` — Agent runtime/session/context
- `features/daily_report/.context.md` — 市场日报
- `features/morning_report/.context.md` — 盘前早报
- `features/brew/.context.md` — 个性化摘要
- `features/for_you/.context.md` — For-You action bar 聚合
- `features/holdings_sync/.context.md` — 持仓同步
- `features/kol_research/.context.md` — KOL persona research
- `features/memory/.context.md` — 用户记忆/反馈
- `features/portfolio/.context.md` + `features/portfolio_health/.context.md` — 持仓与体检
- `features/research_kb/.context.md` — 投研知识库
- `features/stock/.context.md` — 个股投研
- `features/stock/agent/.context.md` — 个股 AI agent 子模块
- `features/macro/{risk,liquidity,weekly,cache}/.context.md` — 宏观体系
- `features/screener/.context.md` — Stock Screener
- `features/{subscription,notification,feedback,payment,invites,onboarding,quota,flags,webhooks,wechat}/.context.md` — 运营/平台模块
- `features/twitter/.context.md` + `features/twitter_digest/.context.md` + `features/twitter/methodologies/.context.md` + `features/twitter/methodology_v3/.context.md` — KOL 数据与方法论

**前端** (`frontend/src/`):
- `app/.context.md` — App Router shell、首页、全站 layout
- `app/{admin,auth,api/auth,contact,dev,email-test,feedback,forgot-password,for-you,kol,login,macro,morning,pricing,profile,qinbafrank,request-access,research,reset-password,settings,stock,today,twitter-digest,unsubscribe,verify-email,webview-check}/.context.md` — 页面/路由模块
- `{lib,components,contexts,hooks}/.context.md` — 共享层
- `test/.context.md` — 测试体系

**MCP**:
- `mcp/themarketbrew/.context.md` — Market Lens MCP 薄 adapter package，所有核心资产和 workflow 走 backend

## 外部知识库

- Obsidian `~/...TheMarketBrew增长/产品/` — 产品方向 source of truth
- `memory/MEMORY.md` — Claude Code 跨会话记忆
