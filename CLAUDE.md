# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
- `backend/app/shared/.context.md` — 跨模块共享服务
- `backend/app/shared/data_tools/.context.md` — 数据获取工具层

**前端**:
- `frontend/src/app/today/.context.md` — 市场日报页面
- `frontend/src/app/for-you/.context.md` — 个性化 Brew 页面
- `frontend/src/app/stock/.context.md` — 个股研究页面
- `frontend/src/app/macro/.context.md` — 宏观仪表盘页面
- `frontend/src/lib/.context.md` — 共享工具库 (api/auth/insforge)

**其他文档**:
- `backend/docs/reliability.md` — 工程可靠性
- `frontend/docs/auth.md` — 认证流程
- `frontend/docs/pages.md` — 前端页面路由
- `frontend/docs/components.md` — 前端组件与库文件

## 重要规则

- **禁止自动 Git 操作**: 不要自动执行 `git commit` 或 `git push`，所有 Git 提交和推送操作需要用户手动确认后再执行
- **前端测试使用 Chrome DevTools MCP**: 进行浏览器交互测试和调试时，优先使用 Chrome DevTools MCP 工具
- **邮件广播安全**: 当 `FRONTEND_URL` 不是生产域名时，所有 broadcast 自动路由到 Resend 测试 segment (`1c300c45-49a7-479e-a4c2-1ed5cfccda1e`)，可以正常调用广播端点模拟生产流程。**Claude 在开发环境调用广播 API 后，必须检查返回的 `audience_id` 确认是测试 segment。**

### Context 自动维护

任务完成后，根据变更类型自动更新相关文档：

| 变更类型 | 更新目标 | 触发条件 |
|----------|----------|----------|
| 新增/修改 API 端点 | CLAUDE.md API 端点表 + 对应 `.context.md` | router.py 有增删改 |
| 认证变更 | `frontend/docs/auth.md` 已认证端点清单 | verify_user_token 使用变化 |
| 修复 bug / 踩坑 | memory/MEMORY.md 的"经验总结" | 修复了非显而易见的问题 |
| 新增 feature 模块 | CLAUDE.md 模块文档列表 | 新建了 `.context.md` |
| 数据库表/Edge Function 变更 | 对应 feature 的 `.context.md` | db.py 或 edge function 有改动 |
| 前端页面逻辑变更 | 对应页面的 `.context.md` | page.tsx 的数据流/状态管理有变化 |

**执行方式**: 不需要用户提醒。完成任务后，静默检查上表，有匹配则自动更新对应文档。更新时只改变化的部分，不重写整个文件。

## 测试账号

用于本地调试和浏览器测试：
- **邮箱**: voya.technologies@gmail.com
- **密码**: 123456

## 项目概述

全栈宏观市场分析应用，使用 Google ADK 构建 AI Agent，提供市场数据获取、新闻分析和投资报告服务。

**技术栈:**
- 前端: Next.js 16 + React 19 + TypeScript + Tailwind CSS 4
- 后端: FastAPI + Google ADK + Gemini + yfinance + FMP API + FRED API
- AI: Google ADK (gemini-3-pro-preview) 市场分析 / OpenAI GPT-4o-mini (带 web search) 流动性分析
- 邮件: Resend API
- 数据库: Insforge (PostgreSQL)
- 品牌: TheMarketBrew (#059669 翠绿色) / https://themarketbrew.com

## 开发命令

### 前端 (frontend/)
```bash
npm run dev          # http://localhost:3000
npm run build && npm run lint
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

### 环境变量

后端 `backend/.env`:
```
GOOGLE_API_KEY=xxx          # 必需 - 市场分析 Agent
FMP_API_KEY=xxx             # 必需 - 国债利率、新闻
OPENAI_API_KEY=xxx          # 流动性分析 Agent
FRED_API_KEY=xxx            # 流动性指标
RESEND_API_KEY=xxx          # 邮件服务
CRON_SECRET=xxx             # 定时任务认证
FRONTEND_URL=https://xxx    # 生产环境 CORS
```

前端 `frontend/.env.local`:
```
NEXT_PUBLIC_API_URL=http://localhost:8000/api
NEXT_PUBLIC_INSFORGE_URL=https://9wmhxyi4.us-east.insforge.app
NEXT_PUBLIC_INSFORGE_ANON_KEY=xxx
```

## 工程可靠性

> 完整文档: `backend/docs/reliability.md`

系统内置的可靠性机制，修改前请先阅读完整文档。

**后端 (`main.py`)**:
- **全局错误处理**: `Exception` → 500 (不泄露 stack trace), `RequestValidationError` → 422
- **速率限制**: slowapi, AI 端点 5/min, 搜索 20/min, 报价 30/min (按 IP)
- **健康检查**: `GET /health` (存活), `GET /ready` (依赖就绪, 检查 Insforge + API keys)
- **启动/关闭**: API key 缺失 warning, shutdown 关闭 Insforge HTTP client

**日志系统 (`core/logging.py`)**:
- 所有模块使用 `get_logger(__name__)`, 不使用 `print()`
- 环境变量 `LOG_LEVEL` 控制级别 (默认 INFO)
- 请求中间件记录 method/path/status/耗时, 慢请求 (>5s) 自动 WARNING
- logger 使用 `%s` lazy 格式化, 不使用 f-string

**前端**:
- `error.tsx` — 全局错误边界, 防止白屏
- `not-found.tsx` — 自定义 404 页面
- Chart 组件用 `next/dynamic` + `ssr: false` 懒加载, 减少首屏 JS 体积

**添加速率限制到新端点**:
```python
from slowapi import Limiter
from slowapi.util import get_remote_address
limiter = Limiter(key_func=get_remote_address)

@router.post("/endpoint")
@limiter.limit("10/minute")
async def handler(request: Request, body: YourModel): ...
```

**添加新模块日志**: 文件顶部加 `from app.core.logging import get_logger` + `logger = get_logger(__name__)`

## 后端架构 (Feature-based)

重构后采用 Feature 模块化架构，每个功能领域独立封装：

```
backend/app/
├── main.py                    # FastAPI 入口，注册所有 feature routers
├── core/                      # 核心基础设施
│   ├── config.py              # 环境变量配置
│   ├── database.py            # InsforgeService 基类 (HTTP client)
│   └── logging.py             # 结构化日志 (setup_logging + get_logger)
├── features/                  # 功能模块
│   ├── daily_report/          # 市场日报 (原 market/)
│   │   ├── router.py          # POST /api/market
│   │   ├── agent.py           # MarketAgent (Google ADK)
│   │   ├── models.py          # MarketReportOutput (Pydantic)
│   │   └── db.py              # market_reports 表操作
│   ├── brew/                  # 个性化摘要 (原 digest/)
│   │   ├── router.py          # POST /api/digest
│   │   ├── agent.py           # PersonalDigest (Google ADK)
│   │   ├── models.py          # DigestOutput (Pydantic)
│   │   └── db.py              # personal_digests 表操作
│   ├── stock/                 # 个股调研
│   │   ├── router.py          # /api/stocks/* (统一复数)
│   │   ├── agent.py           # StockAnalysisAgent (Google ADK)
│   │   ├── service.py         # StockService (数据聚合+计算)
│   │   └── db.py              # stock_analyses, stock_profiles 表操作
│   ├── macro/                 # 宏观体系 (整合 4 个模块)
│   │   ├── risk/              # 宏观风险 (原 macro_risk/)
│   │   ├── liquidity/         # 流动性 (原 liquidity/)
│   │   ├── weekly/            # 宏观周报 (原 weekly_report/)
│   │   └── cache/             # 数据缓存 (原 macro_cache/)
│   ├── sector/                # 板块分析
│   ├── subscription/          # 订阅管理
│   │   ├── service.py         # 订阅 CRUD
│   │   └── email_service.py   # Resend 邮件渲染
│   ├── notification/          # 邮件发送与广播 (从 subscription 拆出)
│   │   └── router.py          # /api/report/*, /api/newsletter/*
│   ├── feedback/              # 用户反馈
│   └── payment/               # 支付
├── shared/                    # 跨模块共享服务
│   ├── fmp_service.py         # FMP API (新闻、国债利率)
│   ├── yfinance_service.py    # yfinance (股票报价)
│   ├── openbb_service.py      # OpenBB SDK (财务数据)
│   ├── insforge_service.py    # Insforge 高级操作
│   └── data_tools/            # 数据获取工具
│       ├── market_data.py     # 市场数据 (yfinance + FMP)
│       ├── news.py            # 新闻获取
│       ├── calendar.py        # 经济日历
│       └── earnings.py        # 财报日历
├── utils/
│   └── timezone.py            # Pacific 时区工具
└── edge_functions/            # Insforge Edge Functions (JavaScript)
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

## API 端点

| 端点 | 方法 | 认证 | 描述 |
|------|------|------|------|
| `/api/market` | POST | - | 生成/获取市场日报 |
| `/api/market/reports` | GET | - | 列出历史日报 (分页) |
| `/api/market/reports/latest` | GET | - | 最新日报 |
| `/api/market/reports/{id}` | GET | - | 按 ID 获取日报 |
| `/api/digest` | POST | - | 生成个性化摘要 (body 中传 user_id) |
| `/api/watchlist` | GET | Bearer | 获取用户自选股 |
| `/api/watchlist` | PUT | Bearer | 保存用户自选股 |
| `/api/digests` | GET | Bearer | 列出用户摘要历史 |
| `/api/digests/{id}` | GET | Bearer | 获取特定摘要 |
| `/api/stocks/search` | GET | - | 搜索股票 |
| `/api/stocks/quotes` | GET | - | 批量报价 (yfinance) |
| `/api/stocks/{symbol}` | GET | - | 个股完整数据 |
| `/api/stocks/{symbol}/analysis` | POST | - | AI 个股分析 |
| `/api/stocks/{symbol}/technical` | POST | - | AI 技术分析 |
| `/api/liquidity/metrics` | GET | - | 流动性指标 |
| `/api/macro-risk/dashboard` | GET | - | 宏观风险仪表盘 |
| `/api/weekly-report` | GET | - | 宏观周报 |
| `/api/subscriptions/{channel}/subscribe` | POST | - | 订阅频道 |
| `/api/report/send` | POST | Cron | 广播日报 (需 X-Cron-Secret) |
| `/api/newsletter/broadcast` | POST | Cron | 广播简报 (需 X-Cron-Secret) |

> **认证类型**: Bearer = 用户 JWT (`verify_user_token`), Cron = 管理密钥 (`verify_cron_secret`), - = 公开
> **添加认证的标准做法**: 见 `frontend/docs/auth.md` 的"添加认证到新端点的标准流程"

## 测试架构

```
tests/
├── conftest.py              # 测试配置，定义 markers
├── test_stock_service_unit.py  # StockService 纯逻辑单元测试
├── test_stock_cache.py      # 缓存层测试
├── e2e/
│   └── test_stock_e2e.py    # API 端点 E2E 测试
└── integration/             # 数据库集成测试
```

**测试标记:**
- `@pytest.mark.e2e` - 端到端测试
- `@pytest.mark.integration` - 数据库测试
- `@pytest.mark.generate` - AI 生成测试 (默认跳过，需 `--run-generate`)

## Agent 开发

**Google ADK Agent (市场/个股分析):**
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

**OpenAI Agent (流动性分析):**
```python
from openai import AsyncOpenAI

response = await client.responses.create(
    model="gpt-4o-mini",
    tools=[{"type": "web_search"}],
    input=prompt,
)
```

## 设计系统

**设计方向**: Financial Terminal + Editorial Luxury

**核心原则**: 简洁 > 花哨 / 层级清晰 / 数据优先

**颜色**:
- 主强调色: `emerald-500` (一级标题、主按钮)
- 次强调色: `amber-400` (二级标题)
- 避免: Sky、Violet、Rose、Cyan

**字体**:
- `font-editorial` - 标题 (Instrument Serif)
- `font-sans` - 正文 (DM Sans)
- `font-data` - 数字 (JetBrains Mono)

**核心组件**: `.terminal-card` (globals.css 中定义)

> 详细规范: `frontend/docs/design-system.md`

## Linear 项目管理 (待创建)

Linear MCP 已配置，需要运行 `/mcp` 完成 OAuth 认证后创建以下结构：

**Project 1: Engineering**
- `daily-report` - 日报模块
- `digest` - 专属日报模块
- `stock` - 个股投研模块
- `misc` - 其他功能 (登录等)
- `tools` - 工具 (下载器等)
- `bug` - Bug 修复

**Project 2: Growth**
- `xiaohongshu` - 小红书渠道
- `wechat` - 微信渠道

**工作流**: Backlog → In Progress → Done
**优先级**: P0 (紧急) / P1 (高优) / P2 (中等) / P3 (低优)
