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

**执行方式**: 不需要用户提醒。完成任务后，静默检查上表，有匹配则自动更新对应文档。更新时只改变化的部分，不重写整个文件。

## 模块文档

每个模块目录下有 `.context.md`，修改代码前先阅读以了解模块的功能逻辑、数据流、依赖关系和注意事项。

**后端**:
- `backend/app/core/.context.md` — 核心基础设施
- `backend/app/features/daily_report/.context.md` — 市场日报
- `backend/app/features/brew/.context.md` — 个性化摘要 (Brew)
- `backend/app/features/stock/.context.md` — 个股投研
- `backend/app/features/macro/liquidity/.context.md` — 流动性监控
- `backend/app/features/macro/weekly/.context.md` — 宏观周报
- `backend/app/features/macro/cache/.context.md` — 宏观数据缓存系统
- `backend/app/features/macro/risk/.context.md` — 宏观风险评估
- `backend/app/features/sector/.context.md` — 板块分析
- `backend/app/features/subscription/.context.md` — 邮件订阅管理
- `backend/app/features/notification/.context.md` — 邮件发送与广播
- `backend/app/features/feedback/.context.md` — 用户反馈
- `backend/app/features/payment/.context.md` — Stripe 支付
- `backend/app/shared/.context.md` — 跨模块共享服务
- `backend/app/shared/data_tools/.context.md` — 数据获取工具层

**前端**:
- `frontend/src/app/today/.context.md` — 市场日报页面
- `frontend/src/app/for-you/.context.md` — 个性化 Brew 页面
- `frontend/src/app/stock/.context.md` — 个股研究页面
- `frontend/src/app/macro/.context.md` — 宏观仪表盘页面
- `frontend/src/app/sectors/.context.md` — 板块分析页面
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
- 后端: FastAPI + Google ADK (gemini-3-pro-preview) + yfinance + FMP API + FRED API
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

项目有两层质量防线：git hooks 自动拦截 + Claude skills 按需深度检查。

### 写代码时 (实时)

Claude 编辑 `.ts/.tsx` 文件后会自动跑 ESLint（`.claude/settings.json` PostToolUse hook），即时反馈语法问题。不阻塞，仅提示。

### 提交前 (自动)

`git commit` 触发 husky pre-commit hook → lint-staged，对 staged 文件执行：
- **前端 `.ts/.tsx`**: ESLint --fix（自动修复，errors 阻塞）+ tsc --noEmit（类型检查）
- **后端 `.py`**: Python AST 语法检查

提交被阻塞时先修复报错，再重新 `git add` + `git commit`。

### 按需检查 (手动触发 skills)

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

### 典型一天的流程

```
1. 写代码            → Claude Hook 实时 ESLint 反馈
2. 改完一个功能      → /test unit         确认没破坏东西
3. 想补测试          → /cover-changes     自动生成
4. 准备提交          → /review-changes    code review
5. 提交              → /commit-diffs      git hooks 自动拦截问题
6. 大版本发布前      → /test all          跑完整测试套件
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
    model="gemini-3-pro-preview",
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
