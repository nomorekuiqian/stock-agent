# TheMarketBrew

> 云端 AI 炒股助手 —— 9 个 AI Agent 全天候运转，替你做投研。
>
> https://themarketbrew.com
>
> **聪明的散户用这个。** 你也可以有投研团队。

> **想参与代码贡献？** 请先读 [docs/contributing.md](docs/contributing.md)。

---

## 我们在做什么

一个云端的 AI 投研团队。9 个 AI Agent 分工协作，替你读新闻、看财报、盯宏观、做分析，把分析师团队一天的工作量压缩成你早晨一杯咖啡的时间。

| 功能 | 一句话 | 交付方式 |
|------|--------|----------|
| **每日日报** | 今天市场发生了什么，哪些值得关注 | 邮件 + 网页 |
| **专属持仓日报** | 今天的新闻和数据，对你的持仓意味着什么 | 邮件 + 网页 |
| **个股深度分析** | 输入一个代码，一页看透基本面+技术面+新闻+宏观 | 网页 |
| **AI 投研助手** | 像和分析师对话一样研究股票，追问到底 | 网页 |
| **宏观仪表盘** | 流动性、经济、通胀、情绪，四维信号灯 | 网页 |

**核心认知**：帮用户做更好的判断，而非堆积信息。邮件是每天的触点（5 分钟被动接收），平台是深度入口（按需主动探索）。

---

## 为什么做

### 使命

让每一个忙碌的散户投资者，不再需要花几个小时刷新闻、翻财报、猜方向。打开平台，5 分钟掌握全局；问一个问题，拿到带依据的答案。

### 愿景

成为散户投资者的标配工具。就像交易软件解决了"怎么买卖"，我们解决"买卖之前该看什么"。

### 我们的敌人

- **噪音** — 每天几万条碎片化信息，不仅无用，反而让人焦虑和冲动
- **盲目猜测** — 靠"感觉"、"消息"、"大 V 说的"做交易决策
- **信息不对等** — 机构有几十人的研究团队，散户只有自己

### 我们的武器

- **AI 算力** — 9 个 Agent 同时运转，吞吐量远超人类极限
- **个性化** — 不给你看"大盘怎么样"，只告诉你"你的持仓今天怎么样"
- **可追溯** — 每个结论都有数据来源，不是黑盒

完整品牌叙事见 [docs/brand/narrative.md](docs/brand/narrative.md)。

---

## 产品现状

> 最后更新：2026-03-31

### 关键数字

| 指标 | 数据 | 备注 |
|------|------|------|
| 邮件订阅用户 | ~350 | 自然增长中，出现"人传人"信号 |
| 付费用户 | 0 | Paywall 尚未激活 |
| MRR | $0 | — |
| 小红书粉丝 | ~7000 | 主要获客渠道（3 周从 3000 涨至 6800） |
| Twitter 订阅 | ~350 | Reply Guy 策略已验证 |

### 功能状态

| 功能 | 页面 | 状态 | 备注 |
|------|------|------|------|
| 每日市场日报 | /today | 已上线 | 邮件推送 + 网页，核心用户触点 |
| 盘前早报 | /morning | 已上线 | 每天开盘前推送 |
| 个性化摘要 (Brew) | /for-you | 已上线 | 按用户自选股定制 |
| 个股四维分析 | /stock | 已上线 | 基本面+技术面+新闻面+宏观面，DAU ~0 |
| 宏观风险仪表盘 | /macro | 已上线 | 四维信号灯 + 流动性监控 |
| 板块分析 | /sectors | 已上线 | 12 板块每日 AI 分析 |
| Research Desk | /screener | 已上线 (3/20) | 对话式选股 + 个股/日报/宏观面板 |
| 邀请码系统 | — | 已上线 (3/23) | 通用码 + 专属推荐码裂变 |
| Stripe 支付 | — | 已上线 | Stripe Live + Paywall 已激活 |

### 卡住的地方

- **付费转化待验证** — Paywall 已激活，但尚无付费用户数据
- **个股研究 DAU ~0** — 不确定是需求问题还是入口/交互门槛问题
- **邮件质量下滑** — 日报准确度、前瞻性不足等问题待修复

---

## 短期计划 / 长期方向

### 短期重点

1. **付费转化优化** — Paywall 已激活（Pro $10/月，Max $20/月），关注首批付费数据
2. **Research Desk Phase 4** — 从 /screener 独立为 /research 路由，成为产品主入口
3. **邮件质量系统性提升** — 日报准确度、专属日报数据问题
4. **国内访问优化** — 国内用户访问速度很慢

### 产品三个方向

| 方向 | 核心命题 | 状态 |
|------|---------|------|
| **一：AI 财务顾问** | 持仓 + 宏观 → 诊断。告诉用户"你的持仓处于什么状态" | 当前重心 |
| **二：Agent 服务** | 把分析能力包装为 MCP/API，服务人类和 AI Agent | 远期，等方向一引擎跑通 |
| **三：统一研究台** | 左右分栏 Agent 对话 + 动态内容面板，完整研究闭环 | 进行中 (Phase 3) |

三者关系：方向一是核心引擎（分析能力），方向三是交付界面（用户怎么用），方向二是扩展（把能力卖给 AI）。

### 里程碑

```
MS1: 新用户上手 + 日报升级（"替你读" → "替你判断"）
MS2: 持仓体检上线（板块分布、集中度、AI 一键诊断）  ← 用户价值最大
MS3: 个股深研升级（新闻解读、宏观关联、组合语境）
MS4: 风险预警 + 机会发现（24h 监控 + 主动推送）
MS5: 反馈闭环（建议追踪、准确率看板）
```

完整模块规划和商业模式见 [docs/product/roadmap.md](docs/product/roadmap.md)。

---

## 技术栈概览

| 层级 | 技术 |
|------|------|
| 前端 | Next.js 16 + React 19 + TypeScript + Tailwind CSS 4 + shadcn/ui |
| 后端 | FastAPI + Google ADK (Gemini) + Pydantic |
| AI | 9 个 Agent，Structured Output + Tool-Use 两种范式 |
| 数据 | yfinance + FMP API + FRED + OpenBB + TradingView Screener |
| 数据库 | Insforge (托管 PostgreSQL + Edge Functions) |
| 认证 | Insforge Auth (JWT + Google OAuth) |
| 支付 | Stripe (订阅制) |
| 邮件 | Resend API |
| 部署 | Vercel (前端) + Railway (后端) |

详细架构见 [docs/architecture.md](docs/architecture.md)。

---

## 如何开始开发

### 环境准备

```bash
git clone <repo-url>
```

后端需要 `backend/.env`，前端需要 `frontend/.env.local`。找 Golden 要环境变量。

关键变量：`GOOGLE_API_KEY`（AI）、`FMP_API_KEY`（金融数据）、`FRED_API_KEY`（宏观）、`STRIPE_SECRET_KEY`（支付）、`RESEND_API_KEY`（邮件）、`INSFORGE_*`（数据库）。可选观测变量：`LANGFUSE_PUBLIC_KEY`、`LANGFUSE_SECRET_KEY`、`LANGFUSE_BASE_URL`。完整定义见 `backend/app/core/config.py` / `backend/.env.example`。

### 启动

```bash
# 前端
cd frontend && npm install && npm run dev     # http://localhost:3000

# 后端
cd backend && source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload                 # http://localhost:8000
```

API 文档：http://localhost:8000/docs（OpenAPI 自动生成）

### 常用命令

```bash
# 前端
npm run build && npm run lint     # 构建 + lint
npm test                          # Vitest 单元测试
npm run test:e2e                  # Playwright E2E（需后端运行）

# 后端
pytest                            # 默认测试 (e2e + integration)
pytest -v --run-generate          # 包含 AI 生成测试（慢）
```

### 开发规范

- **AI Agent**: 使用 Google ADK，交互式 Research/KOL 默认模型 `gemini-3.1-flash-lite`，可通过 `RESEARCH_AGENT_MODEL` / `KOL_RESEARCH_MODEL` 覆盖
- **日志**: `get_logger(__name__)`，禁止 `print()`
- **认证**: 用户端点 `Depends(verify_user_token)`，定时任务 `Depends(verify_cron_secret)`
- **Git Hooks**: pre-commit 自动运行 ESLint + tsc（前端）和 AST 检查（后端）
- **UI 语言**: 面向用户的文本统一使用中文

详细规范见 [CLAUDE.md](CLAUDE.md)。

---

## 文档导航

| 想了解 | 读什么 |
|--------|--------|
| 系统架构（技术栈 + API + 缓存 + Agent 详解） | [docs/architecture.md](docs/architecture.md) |
| 产品路线图（模块规划 + 商业模式 + 里程碑） | [docs/product/roadmap.md](docs/product/roadmap.md) |
| 品牌叙事（定位 + 口号 + 转化策略） | [docs/product/brand.md](docs/product/brand.md) |
| 活跃工程计划 | [docs/plans/active/](docs/plans/active/) |
| 设计系统 | [docs/constraints/design-system.md](docs/constraints/design-system.md) |
| 认证流程 | [docs/constraints/auth.md](docs/constraints/auth.md) |
| 各模块详情 | 对应目录下的 `.context.md` |
| Claude Code 开发指引 | [CLAUDE.md](CLAUDE.md) |
| 其他 AI Agent 规则 | [AGENTS.md](AGENTS.md) |

### 项目结构

```
backend/app/
  core/           # 核心基础设施 (config/database/auth/rate_limit)
  features/       # 14 个功能模块，每个独立封装
  shared/         # 跨模块共享服务 (FMP/yfinance/OpenBB/data_tools)
  edge_functions/ # Insforge Edge Functions (JavaScript)

frontend/src/
  app/            # Next.js App Router (31 个页面)
  components/     # 共享组件库
  contexts/       # Auth + Subscription Context
  hooks/          # React Query hooks
  lib/            # API 客户端 / 认证 / 工具

docs/
  architecture.md   # 系统架构 + Agent 架构
  brand/            # 品牌叙事
  product/          # 产品路线图
  plans/            # 活跃工程计划
  technical/        # 技术参考
  reference/        # 历史参考
```
