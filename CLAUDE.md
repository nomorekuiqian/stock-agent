# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 重要规则

- **禁止自动 Git 操作**: 不要自动执行 `git commit` 或 `git push`，所有 Git 提交和推送操作需要用户手动确认后再执行
- **遗留代码禁区**: `backend/app/services/` 和 `backend/app/models/` 是重构前的死代码，不被任何活跃代码导入。禁止从这些路径 import，活跃代码在 `app/features/` 和 `app/shared/`
- **前端测试使用 Chrome DevTools MCP**: 进行浏览器交互测试和调试时，优先使用 Chrome DevTools MCP 工具
- **邮件广播安全**: 当 `ENVIRONMENT` 不是 `"production"` 时，所有 broadcast 自动路由到 Resend 测试 segment (`1c300c45-49a7-479e-a4c2-1ed5cfccda1e`)，可以正常调用广播端点模拟生产流程。**Claude 在开发环境调用广播 API 后，必须检查返回的 `audience_id` 确认是测试 segment。**
- **日志规范**: 使用 `get_logger(__name__)`，禁止 `print()`，用 `%s` lazy 格式化，不用 f-string
- **认证模式**: 用户端点用 `Depends(verify_user_token)`，定时任务用 `Depends(verify_cron_secret)`。完整认证流程见 `frontend/docs/auth.md`
- **测试账号** (本地调试和浏览器测试): 邮箱 `voya.technologies@gmail.com`，密码 `123456`

### Context 自动维护

任务完成后，根据变更类型自动更新相关文档：

| 变更类型 | 更新目标 | 触发条件 |
|----------|----------|----------|
| 新增/修改 API 端点 | 对应 `.context.md` | router.py 有增删改 |
| 认证变更 | `frontend/docs/auth.md` 已认证端点清单 | verify_user_token 使用变化 |
| 修复 bug / 踩坑 | memory/MEMORY.md 的"经验总结" | 修复了非显而易见的问题 |
| 新增 feature 模块 | CLAUDE.md 模块文档列表 | 新建了 `.context.md` |
| 数据库表/Edge Function 变更 | 对应 feature 的 `.context.md` | db.py 或 edge function 有改动 |
| 前端页面逻辑变更 | 对应页面的 `.context.md` | page.tsx 的数据流/状态管理有变化 |
| 产品想法/用户反馈 | Obsidian `产品/产品思考.md` | 用户在对话中提到产品方向、功能想法、用户反馈 |
| 功能上线/产品决策 | Obsidian `产品/产品现状.md` | 新功能部署、产品重要决策、关键数字变化 |
| 产品方向变更 | `.context.md` 产品愿景 + Obsidian `产品/产品策略.md` | 用户调整模块方向、里程碑变化 |

**执行方式**: 不需要用户提醒。完成任务后，静默检查上表，有匹配则自动更新对应文档。更新时只改变化的部分，不重写整个文件。

### 产品策略 → .context.md 同步协议

产品方向有两层存储，需保持一致：

| 层级 | 位置 | 内容 | 更新频率 |
|------|------|------|----------|
| 策略层 (WHY/WHAT) | Obsidian `产品/产品策略.md` | 完整的模块演进方向 | 低频 (方向调整时) |
| 实施层 (HOW) | 各 feature `.context.md` 的"产品愿景"章节 | 该模块的方向摘要 | 跟随策略层 |

**同步方向**: 产品策略.md → .context.md（单向，策略层是 source of truth）

**触发同步的场景**:
1. 用户确认了某模块方向调整 → 先更新产品策略.md，再同步到对应 .context.md
2. 开发新功能前 → 读产品策略.md 对应章节，确认 .context.md 的产品愿景是否需要更新
3. 里程碑状态变化 → 同步更新产品策略.md 和受影响模块的 .context.md

**模块映射表**:

| subpage | 后端 feature | .context.md | 产品策略.md 章节 |
|---------|-------------|-------------|----------------|
| /today | daily_report | `features/daily_report/.context.md` | 现有模块演进 > /today |
| /for-you | brew | `features/brew/.context.md` | 现有模块演进 > /for-you + 模块 1 |
| /stock | stock | `features/stock/.context.md` | 现有模块演进 > /stock + 模块 3 |
| /macro | macro/risk, liquidity, weekly | `features/macro/*/.context.md` (3 个) | 现有模块演进 > /macro |
| /sectors | sector | `features/sector/.context.md` | 现有模块演进 > /sectors |
| /screener | screener | `features/screener/.context.md` + `app/screener/.context.md` | 模块 4 (机会发现) |

### Obsidian 产品知识库

产品方向和思考的 source of truth 在 Obsidian vault，Claude Code 可以读写：

**路径**: `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/TheMarketBrew增长/`

**可写入的文件**:
- `产品/产品思考.md` — 用户提到产品想法时，追加到"想法池"对应日期下
- `产品/产品现状.md` — 功能上线或产品状态变化时，更新对应字段
- `产品/用户反馈.md` — 用户提到用户反馈时，追加到"反馈记录"

**条件可写的文件**（仅在用户确认方向调整时修改）:
- `产品/产品策略.md` — 产品方向与愿景。修改后同步到对应 .context.md 的产品愿景

**只读的文件**（按需查阅，不要修改）:
- `产品/开发日志.md` — git hook 自动写入的累积开发记录
- `产品/商业规划.md` — 定价与商业模式

**写入原则**:
- 主动写入，不要等用户要求
- 追加内容，不覆盖已有内容
- 保持现有文件格式和结构

## 工程计划 (Engineering Plans)

功能开发前的设计文档，存放在 `docs/plans/`。模板见 `docs/plans/_template.md`。

**创建时机**：
- 用户说"帮我写个 plan"、"我要做 XX 功能"、"规划一下怎么实现" → 使用 `/plan` skill
- **Plan Mode 自动保存**：当通过 Plan Mode 生成计划后，在开始实现之前，必须将 plan 内容保存到 `docs/plans/{feature-name}.md`。Plan Mode 的产出不能只留在对话里，必须持久化

**文件命名**：`docs/plans/{feature-name}.md`，用英文短横线命名（如 `morning-report.md`、`stock-picker-agent.md`）。

**Plan 生命周期**：
1. **创建**：通过 `/plan` skill 或 Plan Mode 产生，保存到 `docs/plans/`
2. **开发中**：随开发进展更新 Status 和实施步骤的勾选状态
3. **完成后**：Plan 的知识沉淀到对应 `.context.md`，plan 文件删除或移到 `docs/technical/` 归档

**与产品愿景的关系**：Plan 的"目标"应引用 `.context.md` 的产品愿景或 Obsidian 产品策略.md，确保工程方向与产品方向一致。

## Worktree 并行开发

多个 worktree 同时开发时，每个 worktree 自动分配独立端口避免冲突：

| 环境 | 后端端口 | 前端端口 | 分配方式 |
|------|----------|----------|----------|
| 主仓库 | 8000 | 3000 | 固定 |
| Worktree 1 | 8001 | 3001 | 自动 |
| Worktree 2 | 8002 | 3002 | 自动 |
| ... | 800N | 300N | 自动 (N=1-9) |

**自动化脚本**: `bash scripts/start-worktree-dev.sh`
- 自动扫描 8001-8009 / 3001-3009 找下一个空闲端口对
- 创建/更新 `frontend/.env.local` 指向分配的后端端口
- 安装前端依赖（如 `node_modules` 缺失）
- 启动后端 + 前端 dev server（后台运行）
- 日志输出到 `/tmp/worktree-{backend,frontend}-{port}.log`

**Claude 操作规则**：
1. **进入 worktree 后**：立即运行 `bash scripts/start-worktree-dev.sh`，一条命令完成端口分配 + 服务启动
2. **判断方式**：路径包含 `.claude/worktrees` 即为 worktree 环境
3. **不要手动分配端口**：全部交给脚本自动检测，避免端口冲突
4. **`.env.local` 保护**：脚本自动处理，worktree 的 `frontend/.env.local` 绝不会指向 `:8000`

## 模块文档

每个模块目录下有 `.context.md`，修改代码前先阅读以了解模块的功能逻辑、数据流、依赖关系和注意事项。

**后端**:
- `backend/app/core/.context.md` — 核心基础设施
- `backend/app/features/daily_report/.context.md` — 市场日报
- `backend/app/features/morning_report/.context.md` — 盘前早报
- `backend/app/features/brew/.context.md` — 个性化摘要 (Brew)
- `backend/app/features/stock/.context.md` — 个股投研
- `backend/app/features/macro/liquidity/.context.md` — 流动性监控
- `backend/app/features/macro/weekly/.context.md` — 宏观周报
- `backend/app/features/macro/cache/.context.md` — 宏观数据缓存系统
- `backend/app/features/macro/risk/.context.md` — 宏观风险评估
- `backend/app/features/screener/.context.md` — Stock Screener 数据层
- `backend/app/features/sector/.context.md` — 板块分析
- `backend/app/features/subscription/.context.md` — 邮件订阅管理
- `backend/app/features/notification/.context.md` — 邮件发送与广播
- `backend/app/features/feedback/.context.md` — 用户反馈
- `backend/app/features/payment/.context.md` — Stripe 支付
- `backend/app/shared/.context.md` — 跨模块共享服务
- `backend/app/shared/data_tools/.context.md` — 数据获取工具层

**前端**:
- `frontend/src/app/today/.context.md` — 市场日报页面
- `frontend/src/app/morning/.context.md` — 盘前早报页面
- `frontend/src/app/for-you/.context.md` — 个性化 Brew 页面
- `frontend/src/app/stock/.context.md` — 个股研究页面
- `frontend/src/app/macro/.context.md` — 宏观仪表盘页面
- `frontend/src/app/sectors/.context.md` — 板块分析页面
- `frontend/src/app/screener/.context.md` — 个股筛选页面
- `frontend/src/app/api/auth/.context.md` — Server Proxy 认证路由
- `frontend/src/lib/.context.md` — 共享工具库 (api/auth/insforge)
- `frontend/src/components/.context.md` — 共享组件库
- `frontend/src/contexts/.context.md` — React Context (Auth/Subscription)
- `frontend/src/hooks/.context.md` — 自定义 Hooks (搜索/React Query)
- `frontend/src/test/.context.md` — 测试体系 (Vitest + Playwright)

**其他文档**:
- `backend/docs/reliability.md` — 工程可靠性
- `frontend/docs/auth.md` — 认证流程
- `frontend/docs/pages.md` — 前端页面路由
- `frontend/docs/components.md` — 前端组件与库文件
- `frontend/docs/design-system.md` — 设计规范

## 项目概述

全栈宏观市场分析应用，使用 Google ADK 构建 AI Agent，提供市场数据获取、新闻分析和投资报告服务。

**技术栈:**
- 前端: Next.js 16 + React 19 + TypeScript + Tailwind CSS 4
- 后端: FastAPI + Google ADK (gemini-3.1-pro-preview) + yfinance + FMP API + FRED API
- 支付: Stripe (订阅制)
- 邮件: Resend API
- 数据库: Insforge (PostgreSQL)
- 品牌: TheMarketBrew (#059669 翠绿色) / https://themarketbrew.com

## 开发命令

### 前端 (frontend/)
```bash
npm run dev          # http://localhost:3000
npm run build && npm run lint
npm test             # Vitest 单元/组件测试
npm run test:e2e     # Playwright E2E (需后端运行)
```

### 后端 (backend/)
```bash
source venv/bin/activate
uvicorn app.main:app --reload   # http://localhost:8000

# 测试
pytest                              # 运行默认测试 (e2e + integration)
pytest tests/test_xxx.py -v         # 运行单个测试文件
pytest tests/test_xxx.py::TestClass::test_method  # 运行单个测试
pytest -v --run-generate            # 包含 AI 生成测试 (慢)
```

## 环境变量

后端 `backend/.env` (完整定义见 `backend/app/core/config.py`):
```
# AI
GOOGLE_API_KEY=xxx              # 必需 - Google ADK Agent
OPENAI_API_KEY=xxx              # OpenAI (备用)

# 数据
FMP_API_KEY=xxx                 # 必需 - 国债利率、新闻
FRED_API_KEY=xxx                # 流动性指标

# 支付
STRIPE_SECRET_KEY=xxx           # Stripe 支付
STRIPE_WEBHOOK_SECRET=xxx       # Stripe Webhook 验签
STRIPE_PRO_PRICE_ID=xxx         # Pro 订阅价格 ID

# 邮件
RESEND_API_KEY=xxx              # Resend 邮件服务

# 安全
CRON_SECRET=xxx                 # 定时任务认证
INSFORGE_ANON_KEY=xxx           # Insforge 匿名密钥

# 基础
ENVIRONMENT=production          # 必需 - 生产环境标识，影响广播安全路由
FRONTEND_URL=https://xxx        # 生产环境 CORS
INSFORGE_BASE_URL=https://xxx   # Insforge 实例地址
```

前端 `frontend/.env.local`:
```
NEXT_PUBLIC_API_URL=http://localhost:8000/api
NEXT_PUBLIC_INSFORGE_URL=https://9wmhxyi4.us-east.insforge.app
NEXT_PUBLIC_INSFORGE_ANON_KEY=xxx
```

## 后端架构

Feature 模块化架构，每个功能领域独立封装：

```
backend/app/
├── main.py              # FastAPI 入口，注册所有 feature routers
├── core/                # 核心基础设施 (config / database / logging / rate_limit)
├── features/            # 功能模块 (活跃代码)
│   ├── daily_report/    # 市场日报
│   ├── brew/            # 个性化摘要
│   ├── stock/           # 个股投研
│   ├── macro/           # 宏观体系 (risk/ + liquidity/ + weekly/ + cache/)
│   ├── screener/        # Stock Screener (tvscreener 全市场筛选)
│   ├── sector/          # 板块分析
│   ├── subscription/    # 订阅管理
│   ├── notification/    # 邮件发送与广播
│   ├── feedback/        # 用户反馈
│   └── payment/         # Stripe 支付
├── shared/              # 跨模块共享服务 (fmp / yfinance / openbb / insforge / data_tools/)
├── utils/               # 工具 (timezone)
├── edge_functions/      # Insforge Edge Functions (JavaScript)
├── services/            # [DEAD] 重构前遗留，禁止导入
└── models/              # [DEAD] 重构前遗留，禁止导入
```

### Feature 模块标准结构

每个 feature 模块遵循相同模式：
- `router.py` - FastAPI 路由定义
- `agent.py` - AI Agent 封装 (如有)
- `service.py` - 业务逻辑 (如有)
- `models.py` - Pydantic 模型
- `db.py` - 数据库操作 (调用 edge_functions)

### 数据流架构

```
Python 数据获取层 (shared/data_tools)
         │
         │ JSON 数据
         ▼
  Feature Agent (LLM 分析)
         │
         │ 结构化输出 (Pydantic)
         ▼
  Feature DB (保存到 Insforge)
```

### API 端点

所有 API 端点定义在 `backend/app/features/*/router.py`，在 `main.py` 中注册。
运行后端后访问 http://localhost:8000/docs 查看完整 OpenAPI 文档。

认证类型: Bearer = 用户 JWT (`verify_user_token`), Cron = 管理密钥 (`verify_cron_secret`), 无标记 = 公开。
查找认证端点: `grep -r "verify_user_token" backend/app/features/*/router.py`

## 前端架构

```
frontend/src/
├── app/             # Next.js App Router (31 个 page.tsx)
├── components/      # 共享组件库
├── contexts/        # AuthContext + SubscriptionContext
├── hooks/           # useStockSearch + hooks/queries/ (TanStack Query)
└── lib/             # api.ts / auth.ts / insforge.ts / utils
```

- 路由表: `frontend/docs/pages.md`
- 认证流程: `frontend/docs/auth.md`
- 组件清单: `frontend/docs/components.md`
- 设计规范: `frontend/docs/design-system.md`

## 日常开发 Workflow

### 完整工作流总览

本项目有三套系统协同工作：**代码质量**（自动化测试和 lint）、**知识管理**（产品思考和文档同步）、**工程规划**（plan 创建和生命周期管理）。

```
┌─────────────────────────────────────────────────────────────┐
│                    用户的一天                                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  想到产品想法 ──→ 跟 Claude 说 ──→ 自动写入 Obsidian        │
│       │                                产品思考.md           │
│       ▼                                                     │
│  开始开发 ────→ /plan 或 Plan Mode ──→ 保存到 docs/plans/   │
│       │                                                     │
│       ▼                                                     │
│  写代码 ──────→ ESLint Hook 实时反馈                         │
│       │         改完代码 → 自动更新 .context.md              │
│       │                                                     │
│       ▼                                                     │
│  git commit ──→ pre-commit: lint + typecheck                │
│       │         post-commit: 自动写入 Obsidian 开发日志      │
│       │                                                     │
│       ▼                                                     │
│  提交代码 ────→ /review-changes → /commit-diffs             │
│       │                                                     │
│       ▼                                                     │
│  功能做完 ────→ plan 知识沉淀到 .context.md → 删除 plan     │
│                 产品现状.md 更新                              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 知识管理（自动 + 被动）

项目的知识分三层存储，各有 source of truth：

| 层级 | 存储位置 | 内容 | 更新方式 |
|------|----------|------|----------|
| **产品方向** (WHY) | Obsidian `产品/产品策略.md` | 模块愿景、演进方向 | 用户确认方向调整时 |
| **工程实现** (HOW) | 代码库 `.context.md` + `docs/plans/` | 模块现状 + 工程计划 | 代码变更后自动 / plan 手动 |
| **日常捕获** (WHAT) | Obsidian `产品思考.md` / `用户反馈.md` | 想法、反馈 | 对话中提到时自动写入 |

**全自动（不需要任何操作）：**
- `git commit` → Obsidian 开发日志（post-commit hook，纯脚本）
- 改了 router.py / db.py → 对应 `.context.md` 自动更新（CLAUDE.md 规则）
- 修了隐蔽 bug → `memory/MEMORY.md` 自动记录（CLAUDE.md 规则）

**对话中自动（只要说出来）：**
- 提到产品想法 → Obsidian `产品思考.md`
- 提到用户反馈 → Obsidian `用户反馈.md`
- 功能上线 → Obsidian `产品现状.md`
- 方向调整 → Obsidian `产品策略.md` + 对应 `.context.md` 产品愿景

**按需触发（手动 skill）：**
- `/audit-docs` — 扫描 ~30 个文档 vs 代码，自动修复 drift（兜底）
- `/plan` — 创建工程计划，自动读取 .context.md 和产品策略

### 工程规划

新功能或重要迭代开始前，先创建 engineering plan：

| 触发方式 | 流程 | 产出 |
|----------|------|------|
| 用户说 `/plan xxx` | Skill 读取 .context.md + 产品策略 → 生成 plan | `docs/plans/{name}.md` |
| Claude 进入 Plan Mode | 生成计划 → 用户审批 → 保存 plan | `docs/plans/{name}.md` |
| 用户说"帮我规划一下" | 同 /plan skill | `docs/plans/{name}.md` |

**Plan 生命周期**：创建 → 开发中更新进度 → 完成后知识沉淀到 `.context.md` → 删除 plan

### 代码质量

两层质量防线：git hooks 自动拦截 + Claude skills 按需深度检查。

**写代码时 (实时)**：Claude 编辑 `.ts/.tsx` 文件后自动跑 ESLint（PostToolUse hook）。

**提交前 (自动)**：`git commit` → husky pre-commit → lint-staged：
- 前端: ESLint --fix + tsc --noEmit
- 后端: Python AST 语法检查

**按需检查 (skills)**：

| 场景 | 命令 | 覆盖范围 |
|------|------|----------|
| 完整测试 | `/test` 或 `/test all` | 所有 8 个步骤（lint + unit + e2e + build，前后端全跑） |
| 只跑前端 | `/test frontend` | 前端 ESLint + TSC + Vitest + Playwright + next build |
| 只跑后端 | `/test backend` | 后端 import + unit + E2E + integration + startup |
| 快速 lint | `/test lint` | 前端 ESLint + TSC + 后端 import check |
| 单元测试 | `/test unit` | 前端 Vitest + 后端 unit tests |
| E2E 测试 | `/test e2e` | 后端 E2E + integration + 前端 Playwright |
| 构建验证 | `/test build` | 前端 next build + 后端 startup check |
| 代码审查 | `/review-changes` | 自动质检（lint/tsc/test）+ 多 agent 并行 review |
| 补测试 | `/cover-changes` | 分析 git diff，为前后端变更生成对应测试 |
| 文档审计 | `/audit-docs` | 扫描 ~30 个文档 vs 代码现状，自动修复 drift |
| 提交 | `/commit-diffs` | 自动分组提交（git hooks 保护，无需改 skill） |
| 工程规划 | `/plan [feature]` | 创建 engineering plan 到 docs/plans/ |

### 典型一天的流程

```
1. 有想法/收到反馈  → 跟 Claude 聊        自动写入 Obsidian
2. 开始做新功能     → /plan xxx           创建工程计划
3. 写代码           → Claude Hook         实时 ESLint 反馈 + 自动更新 .context.md
4. 改完一个功能     → /test unit          确认没破坏东西
5. 想补测试         → /cover-changes      自动生成
6. 准备提交         → /review-changes     code review
7. 提交             → /commit-diffs       git hooks 拦截 + post-commit 写开发日志
8. 功能做完         → plan 沉淀到 .context.md，更新产品现状
9. 大版本发布前     → /test all           完整测试套件
10. 偶尔兜底        → /audit-docs         检查文档 drift
```

## 测试架构

### 后端 (pytest)

```
backend/tests/
├── conftest.py                 # 测试配置，定义 markers + DB 写入拦截
├── test_*_unit.py              # 纯逻辑单元测试
├── e2e/test_*_e2e.py           # API 端点 E2E 测试
└── integration/                # 数据库集成测试
```

**测试标记**: `@pytest.mark.e2e`, `@pytest.mark.integration`, `@pytest.mark.generate` (默认跳过，需 `--run-generate`)

### 前端 (Vitest + Playwright)

> 详细文档: `frontend/src/test/.context.md`

- **Vitest**: 单元测试 (`src/*/__tests__/`) + 组件测试
- **Playwright**: E2E 页面测试 (`e2e/*.spec.ts`)，需后端运行
- 新增测试放 `__tests__/` 子目录，E2E 放 `e2e/`

## Agent 开发

**Google ADK Agent 标准模式:**
```python
from google.adk.agents import LlmAgent
from google.adk.runners import InMemoryRunner

agent = LlmAgent(
    model="gemini-3.1-pro-preview",
    name="analyst",
    instruction=ANALYST_INSTRUCTION,
    output_schema=MarketReportOutput,
)
runner = InMemoryRunner(agent=agent, app_name="market")
```

## 工程可靠性

全局错误处理、速率限制 (slowapi)、健康检查、结构化日志。详见 `backend/docs/reliability.md`。

## 设计系统

Financial Terminal + Editorial Luxury 风格。主色 `emerald-500`，次色 `amber-400`。详见 `frontend/docs/design-system.md`。
