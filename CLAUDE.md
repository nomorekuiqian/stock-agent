# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 模块文档

每个 feature 模块目录下有 `CONTEXT.md`，修改代码前先阅读以了解模块的功能逻辑、数据流、依赖关系和注意事项。

已有文档:
- `backend/app/features/daily_report/CONTEXT.md` — 市场日报
- `backend/app/features/stock/CONTEXT.md` — 个股投研
- `backend/app/features/macro/liquidity/CONTEXT.md` — 流动性监控
- `backend/app/features/macro/weekly/CONTEXT.md` — 宏观周报
- `backend/app/features/sector/CONTEXT.md` — 板块分析
- `backend/app/features/brew/CONTEXT.md` — 个性化摘要 (Brew)
- `backend/app/features/macro/cache/CONTEXT.md` — 宏观数据缓存系统
- `backend/app/features/macro/risk/CONTEXT.md` — 宏观风险评估
- `backend/app/shared/CONTEXT.md` — 跨模块共享服务
- `backend/app/shared/data_tools/CONTEXT.md` — 数据获取工具层
- `backend/app/features/subscription/CONTEXT.md` — 邮件订阅管理
- `backend/app/features/notification/CONTEXT.md` — 邮件发送与广播
- `backend/app/features/feedback/CONTEXT.md` — 用户反馈
- `backend/app/core/CONTEXT.md` — 核心基础设施
- `frontend/docs/pages.md` — 前端页面路由
- `frontend/docs/components.md` — 前端组件与库文件
- `frontend/docs/auth.md` — 认证流程

## 重要规则

- **禁止自动 Git 操作**: 不要自动执行 `git commit` 或 `git push`，所有 Git 提交和推送操作需要用户手动确认后再执行
- **前端测试使用 Chrome DevTools MCP**: 进行浏览器交互测试和调试时，优先使用 Chrome DevTools MCP 工具

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

## 后端架构 (Feature-based)

重构后采用 Feature 模块化架构，每个功能领域独立封装：

```
backend/app/
├── main.py                    # FastAPI 入口，注册所有 feature routers
├── core/                      # 核心基础设施
│   ├── config.py              # 环境变量配置
│   └── database.py            # InsforgeService 基类 (HTTP client)
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

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/market` | POST | 生成/获取市场日报 |
| `/api/digest` | POST | 生成个性化摘要 |
| `/api/stocks/search` | GET | 搜索股票 |
| `/api/stocks/quotes` | GET | 批量报价 (yfinance) |
| `/api/stocks/{symbol}` | GET | 个股完整数据 |
| `/api/stocks/{symbol}/history` | GET | 价格历史 |
| `/api/stocks/{symbol}/analysis` | POST | AI 个股分析 |
| `/api/stocks/{symbol}/technical` | POST | AI 技术分析 |
| `/api/stocks/{symbol}/technical-snapshot` | GET | 技术指标快照 |
| `/api/stocks/{symbol}/valuation` | GET | 估值对比 |
| `/api/liquidity/metrics` | GET | 流动性指标 |
| `/api/macro-risk/dashboard` | GET | 宏观风险仪表盘 |
| `/api/weekly-report` | GET | 宏观周报 |
| `/api/subscriptions/{channel}/subscribe` | POST | 订阅频道 |
| `/api/report/send` | POST | 广播日报 (需 X-Cron-Secret) |
| `/api/newsletter/broadcast` | POST | 广播简报 (需 X-Cron-Secret) |

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
