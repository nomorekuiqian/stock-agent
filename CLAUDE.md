# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 快速导航

- 完整文档索引 → `docs/index.md`
- 工程约束与规则 → `docs/constraints/engineering-rules.md`
- 认证流程 → `docs/constraints/auth.md`
- 设计规范 → `docs/constraints/design-system.md`
- 工程可靠性 → `docs/constraints/reliability.md`
- 工程计划 → `docs/plans/active/` (进行中) / `docs/plans/completed/` (已完成)
- 产品方向 → Obsidian `产品/产品策略.md`
- 模块详情 → 各目录下 `.context.md`

## 关键规则

1. **禁止自动 Git 操作**: 不要自动执行 `git commit` 或 `git push`，需用户手动确认
2. **遗留代码禁区**: `backend/app/services/` 和 `backend/app/models/` 是死代码，禁止 import。活跃代码在 `app/features/` 和 `app/shared/`
3. **日志规范**: 使用 `get_logger(__name__)`，禁止 `print()`，用 `%s` lazy 格式化
4. **认证模式**: 用户端点用 `Depends(verify_user_token)`，定时任务用 `Depends(verify_cron_secret)`
5. **改代码前读 .context.md，改完后更新**。详细维护规则见 `docs/constraints/engineering-rules.md`
6. **前端组件优先使用标准库**: shadcn/ui、Radix UI、cmdk，不重新造轮子
7. **UI 语言统一中文**: 按钮、标签、提示等面向用户的文本均用中文
8. **测试账号**: 邮箱 `voya.technologies@gmail.com`，密码 `123456`

## 项目概述

全栈宏观市场分析应用，使用 Google ADK 构建 AI Agent，提供市场数据获取、新闻分析和投资报告服务。

**技术栈**: Next.js 16 + React 19 + TypeScript + Tailwind CSS 4 | FastAPI + Google ADK (gemini-3.1-flash-lite-preview) | Stripe | Resend | Insforge (PostgreSQL)

**品牌**: TheMarketBrew (#059669 翠绿色) / https://themarketbrew.com

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
pytest                              # 运行默认测试
pytest tests/test_xxx.py -v         # 单个测试文件
pytest -v --run-generate            # 包含 AI 生成测试 (慢)
```

## 环境变量

后端 `backend/.env` (完整定义见 `backend/app/core/config.py`):
```
GOOGLE_API_KEY, OPENAI_API_KEY          # AI
FMP_API_KEY, FRED_API_KEY               # 数据
STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRO_PRICE_ID, STRIPE_MAX_PRICE_ID  # 支付
RESEND_API_KEY                          # 邮件
RESEND_SEGMENT_MORNING, RESEND_SEGMENT_EVENING, RESEND_SEGMENT_WEEKLY  # 邮件分组
WECHAT_APP_ID, WECHAT_APP_SECRET, WECHAT_JWT_SECRET  # 微信小程序
CRON_SECRET, INSFORGE_ANON_KEY, INSFORGE_SERVICE_KEY, EDGE_FUNCTION_SECRET  # 安全（SERVICE_KEY 用于微信 OTP 查询 Insforge 用户）
ENVIRONMENT=production                  # 必需 - 影响广播安全路由
FRONTEND_URL, INSFORGE_BASE_URL         # 基础
INVITE_CODES                            # 邀请码 (逗号分隔)
EMAIL_PRO_GATE=false                    # Pro 邮件门控开关
```

前端 `frontend/.env.local`:
```
NEXT_PUBLIC_API_URL=http://localhost:8000/api
NEXT_PUBLIC_INSFORGE_URL=https://9wmhxyi4.us-east.insforge.app
NEXT_PUBLIC_INSFORGE_ANON_KEY=xxx
```

## 架构概览

### 后端
```
backend/app/
├── main.py              # FastAPI 入口
├── core/                # 基础设施 (config/database/logging/rate_limit)
├── features/            # 功能模块 (daily_report/morning_report/brew/stock/macro/screener/subscription/notification/feedback/payment/invites)
├── shared/              # 共享服务 (fmp/yfinance/openbb/insforge/data_tools)
├── edge_functions/      # Insforge Edge Functions (JavaScript)
├── services/            # [DEAD] 禁止导入
└── models/              # [DEAD] 禁止导入
```

Feature 模块标准结构: `router.py` / `agent.py` / `service.py` / `models.py` / `db.py`

数据流: `shared/data_tools → Feature Agent (LLM) → Feature DB (Insforge)`

### 前端
```
frontend/src/
├── app/             # Next.js App Router
├── components/      # 共享组件库
├── contexts/        # AuthContext + SubscriptionContext
├── hooks/           # useStockSearch + hooks/queries/ (TanStack Query)
└── lib/             # api.ts / auth.ts / insforge.ts / utils
```

## Agent 开发

```python
from google.adk.agents import LlmAgent
from google.adk.runners import InMemoryRunner

agent = LlmAgent(
    model="gemini-3.1-flash-lite-preview",
    name="analyst",
    instruction=ANALYST_INSTRUCTION,
    output_schema=MarketReportOutput,
)
runner = InMemoryRunner(agent=agent, app_name="market")
```
