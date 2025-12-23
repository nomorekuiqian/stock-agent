# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 重要规则

- **禁止自动 Git 操作**: 不要自动执行 `git commit` 或 `git push`，所有 Git 提交和推送操作需要用户手动确认后再执行

## 项目概述

这是一个全栈宏观市场分析应用,使用 Google ADK (Agent Development Kit) 构建 AI Agent,提供市场数据获取、新闻分析和投资报告服务。

**技术栈:**
- 前端: Next.js 16 + React 19 + TypeScript + Tailwind CSS 4
- 后端: FastAPI + Google ADK + Gemini + yfinance + FMP API + FRED API
- AI:
  - 市场分析: Google ADK 单 Agent (gemini-3-pro-preview)
  - 流动性分析: OpenAI GPT-5.2 (带 web search)
- 邮件: Resend API (每日报告推送)
- 数据库: Insforge (PostgreSQL 托管服务)
- 品牌: MarketBrew (翠绿色主题 #059669)

## 开发命令

### 前端 (frontend/)

```bash
cd frontend
npm install
npm run dev          # http://localhost:3000
npm run build
npm run lint
```

### 后端 (backend/)

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload   # http://localhost:8000
pytest                          # 运行测试
pytest tests/test_main.py::test_name  # 运行单个测试
```

### 环境配置

后端 `backend/.env`:
```
GOOGLE_API_KEY=your_google_api_key
FMP_API_KEY=your_fmp_api_key        # Financial Modeling Prep API (国债利率、新闻)
OPENAI_API_KEY=your_openai_key      # 流动性分析 Agent (GPT-5.2 + web search)
FRED_API_KEY=your_fred_key          # 可选,FRED 流动性数据 (有免费限额)
RESEND_API_KEY=your_resend_api_key  # 可选,用于邮件报告
CRON_SECRET=your_secret             # 可选,用于定时任务认证
FRONTEND_URL=https://your-domain    # 可选,生产环境 CORS
INSFORGE_ANON_KEY=your_anon_key     # 可选,Insforge 匿名密钥 (有默认值)
```

前端 `frontend/.env.local`:
```
NEXT_PUBLIC_API_URL=http://localhost:8000/api
NEXT_PUBLIC_INSFORGE_URL=https://9wmhxyi4.us-east.insforge.app
NEXT_PUBLIC_INSFORGE_ANON_KEY=your_anon_key
```

## 架构设计

### 后端架构

**核心设计模式**: Python 数据获取 + AI Agent 分析

```
backend/
├── app/
│   ├── main.py                    # FastAPI 入口, API 路由
│   ├── models/
│   │   └── request_models.py      # Pydantic 请求/响应模型
│   └── services/
│       ├── fmp_service.py         # Financial Modeling Prep API (国债利率、新闻)
│       ├── fred_service.py        # FRED API (流动性指标: WALCL, TGA, RRP, NFCI)
│       ├── liquidity_agent.py     # OpenAI GPT-5.2 流动性分析 Agent
│       ├── rednote_agent.py       # Google ADK 小红书内容生成 Agent
│       ├── email_service.py       # Resend 邮件服务 (广播订阅)
│       └── insforge_service.py    # Insforge 数据库服务 (报告存储)
├── agents/
│   ├── agent.py                   # ADK Agent 定义 + MacroAgent 封装类
│   └── tools/
│       ├── __init__.py            # 工具导出
│       ├── market_data.py         # 市场数据工具 (yfinance + FMP)
│       ├── news.py                # 新闻获取工具 (FMP)
│       ├── calendar.py            # 经济日历工具 (FMP)
│       └── earnings.py            # 财报日历工具 (FMP)
└── tests/
```

### Agent 架构 (agents/agent.py)

**简化架构**: Python 直接获取数据 → Analyst Agent 分析

```
┌──────────────────────────────────────────────────────┐
│                  Python 数据获取层                     │
│  ┌────────────┐ ┌────────────┐ ┌────────────────────┐ │
│  │market_data │ │   news     │ │ calendar/earnings  │ │
│  │ (yfinance) │ │   (FMP)    │ │       (FMP)        │ │
│  └────────────┘ └────────────┘ └────────────────────┘ │
└───────────────────────┬──────────────────────────────┘
                        │ JSON 数据
                        ▼
              ┌─────────────────────┐
              │   Analyst Agent     │
              │  (gemini-3-pro)     │
              │  中文市场日报生成    │
              └─────────────────────┘
```

- **MacroAgent**: 封装类,协调数据获取和 Agent 调用
- **analyst_agent**: 唯一的 LLM Agent,生成中文市场分析报告
- **root_agent**: ADK Web UI 入口 (= analyst_agent)

### 市场数据覆盖 (market_data.py)

| 类别 | 标的 |
|------|------|
| 股票指数 | S&P 500, Nasdaq, Dow Jones, Russell 2000, S&P 400 |
| 波动率 | VIX |
| 国债收益率 | 3M, 5Y, 10Y, 30Y (FMP 优先, yfinance 备用) |
| 信用 | HYG, LQD |
| 金融 | XLF, KRE |
| 大宗商品 | Gold (GLD), Oil (USO) |
| 货币 | US Dollar (DX-Y.NYB) |

### API 端点

**市场分析:**
| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/market` | POST | 执行完整宏观分析,返回市场数据+新闻+AI分析,同时保存到 Insforge (当日有缓存则返回缓存) |
| `/api/digest` | POST | 个性化摘要,基于用户 watchlist 过滤新闻 |

**流动性监控:**
| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/liquidity/metrics` | GET | 获取所有流动性指标 (Fed Assets, TGA, RRP, Net Liquidity, NFCI 等) |
| `/api/liquidity/history` | GET | 获取历史净流动性数据 (支持 days 参数,最长 5 年) |
| `/api/liquidity/analysis` | POST | 生成 AI 流动性分析 (OpenAI GPT-5.2 + web search) |
| `/api/liquidity/analysis/latest` | GET | 获取最新流动性分析 |

**邮件报告:**
| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/report/send` | POST | 广播每日邮件报告 (需 X-Cron-Secret 头) |
| `/api/report/send-test` | POST | 发送测试邮件到指定邮箱 |
| `/api/report/preview` | GET | 获取邮件 HTML 预览 |
| `/api/report/broadcast-test` | POST | 使用现有报告测试广播 |

**订阅管理:**
| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/subscribe` | POST | 订阅每日报告 |
| `/api/unsubscribe` | POST | 取消订阅 |
| `/api/subscribers` | GET | 列出所有订阅者 (需 X-Cron-Secret 头) |

**小红书内容 (RedNote):**
| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/rednote/generate` | POST | 基于日报生成小红书图文内容 (结构化文案) |
| `/api/rednote/latest` | GET | 获取最新的小红书内容 |

### 前端架构

```
frontend/src/
├── app/
│   ├── layout.tsx           # 根布局 (MarketBrew 品牌, 翠绿色导航)
│   ├── page.tsx             # 首页 (重定向到 /market)
│   ├── globals.css          # Tailwind 主题配置
│   ├── market/page.tsx      # 市场分析主页面
│   ├── liquidity/page.tsx   # 流动性监控仪表盘
│   ├── reports/page.tsx     # 历史报告列表
│   ├── reports/[id]/page.tsx # 单个报告详情
│   ├── digest/page.tsx      # 个性化摘要
│   ├── login/page.tsx       # 登录页
│   ├── auth/callback/page.tsx # OAuth 回调
│   ├── unsubscribe/page.tsx # 退订页面
│   └── email-test/page.tsx  # 邮件预览测试
├── components/
│   ├── ui/                  # shadcn/ui 组件
│   ├── ReportContent.tsx    # 报告内容渲染 (Markdown)
│   ├── NetLiquidityChart.tsx # 净流动性图表
│   ├── LiquidityCard.tsx    # 流动性指标卡片
│   ├── NFCIGauge.tsx        # NFCI 仪表盘
│   ├── SubscribeForm.tsx    # 订阅表单
│   └── NavAuth.tsx          # 导航栏认证
├── contexts/
│   └── AuthContext.tsx      # 认证上下文 (Insforge Auth)
└── lib/
    ├── api.ts               # 后端 API 客户端 (类型安全)
    ├── insforge.ts          # Insforge 客户端配置
    ├── auth.ts              # 认证工具函数
    └── utils.ts             # 通用工具函数
```

**UI 设计**: Apple 风格,白色主题,翠绿色 (#059669) 强调色,紧凑间距

**API 配置**: `NEXT_PUBLIC_API_URL` 环境变量,默认 `http://localhost:8000/api`

### 数据流

**市场日报流程:**
```
POST /api/market
  → 检查当日缓存 (Insforge market_reports)
  → 有缓存 → 返回缓存数据 (from_cache: true)
  → 无缓存 → MarketAgent.analyze()
      → Python 并行获取:
          - get_all_market_data() (yfinance + FMP)
          - get_combined_market_news() (FMP)
          - get_economic_calendar() (FMP)
          - get_earnings_calendar() (FMP)
      → _prepare_data_for_analyst() 清理数据 (减少 ~45% token)
      → Analyst Agent 生成结构化报告
      → 保存到 Insforge
      → 返回 {title, summary, in_depth_analysis, calendar, indices, ...}
```

**流动性分析流程:**
```
POST /api/liquidity/analysis
  → 获取当前 FRED 指标 (get_all_liquidity_metrics)
  → 获取 30/90 天历史数据 (get_liquidity_history)
  → LiquidityAgent.analyze()
      → 构建数据上下文
      → GPT-5.2 + web search 生成 6 维度报告
      → 保存到 Insforge (liquidity_analyses)
      → 返回 {analysis, status, metrics_snapshot}
```

### 流动性分析 Agent (liquidity_agent.py)

**架构**: OpenAI GPT-5.2 + Web Search → 中文流动性分析

```
┌──────────────────────────────────────────────────────┐
│                  FRED 数据获取层                      │
│  ┌────────────┐ ┌────────────┐ ┌────────────────────┐ │
│  │   WALCL    │ │  TGA/RRP   │ │   NFCI/SOFR/EFFR   │ │
│  │ (Fed资产)  │ │  (流动性)   │ │    (金融条件)       │ │
│  └────────────┘ └────────────┘ └────────────────────┘ │
└───────────────────────┬──────────────────────────────┘
                        │ 指标数据
                        ▼
              ┌─────────────────────┐
              │   Liquidity Agent   │
              │    (GPT-5.2)        │
              │  + Web Search       │
              │  中文流动性分析      │
              └─────────────────────┘
```

**流动性指标**:
- `WALCL`: 美联储总资产
- `WDTGAL`: 财政部一般账户 (TGA)
- `RRPONTSYD`: 隔夜逆回购 (RRP)
- `WRESBAL`: 银行准备金
- `SOFR/EFFR`: 货币市场利率
- `NFCI`: 芝加哥联储金融条件指数
- `Net Liquidity = WALCL - TGA - RRP`

### Insforge 数据存储

**数据库表**: `market_reports` (市场日报)

| 字段 | 类型 | 描述 |
|------|------|------|
| id | UUID | 主键 |
| report_date | DATE | 报告日期 (唯一) |
| timestamp | TEXT | 生成时间戳 |
| title | TEXT | 报告标题 |
| summary | TEXT | 摘要 (列表预览用) |
| in_depth_analysis | TEXT | 深度分析 (Markdown) |
| calendar | JSONB | LLM 精选关键事件 |
| indices | JSONB | 市场指数数据 |
| economic_calendar | JSONB | 经济日历 |
| earnings_calendar | JSONB | 财报日历 |
| news_data | JSONB | 新闻数据 |
| market_data | JSONB | 原始市场数据 |

**数据库表**: `liquidity_analyses` (流动性分析)

| 字段 | 类型 | 描述 |
|------|------|------|
| id | UUID | 主键 |
| analysis | TEXT | 分析报告 (Markdown) |
| status | TEXT | 流动性状态 (充裕/适中/偏紧) |
| metrics_snapshot | JSONB | 生成时的指标快照 |
| generated_at | TIMESTAMPTZ | 生成时间 |
| model | TEXT | 使用的模型 |

**数据库表**: `rednote_posts` (小红书内容)

| 字段 | 类型 | 描述 |
|------|------|------|
| id | UUID | 主键 |
| report_id | UUID | 关联的日报 ID |
| report_date | DATE | 日报日期 |
| content | JSONB | 结构化内容 (RedNoteOutput) |
| generated_at | TIMESTAMPTZ | 生成时间 |

**RedNoteOutput 结构** (用于 Canva 复制粘贴):
```
封面 (第1张):  date, title, subtitle
热点 (第2张):  hot1_title/brief, hot2_title/brief, hot3_title/brief
事件 (第3张):  events, summary
正文:         body, tags
```

**Insforge 配置**:
- Base URL: `https://9wmhxyi4.us-east.insforge.app`
- 认证: 匿名 JWT Token

## 开发注意事项

### Agent 开发

**市场分析 Agent (Google ADK)**:
1. **模型配置**: Agent 使用 `gemini-3-pro-preview`
2. **工具定义**: 在 `agents/tools/` 下添加新工具函数
3. **数据获取**: 在 Python 层完成,不使用 LLM 调用工具
4. **Prompt 维护**: `ANALYST_INSTRUCTION` 定义报告格式
5. **输出 Schema**: `MarketReportOutput` (Pydantic) 定义结构化输出

**流动性分析 Agent (OpenAI)**:
1. **模型配置**: 使用 `gpt-5.2` + `web_search` tool
2. **数据获取**: FRED API 获取流动性指标
3. **Prompt 维护**: `SYSTEM_PROMPT` 定义 6 维度分析框架
4. **输出格式**: 中文 Markdown 分析报告

### 后端开发

1. **运行路径**: 必须从 `backend/` 目录启动 (导入路径使用 `app.*` 和 `agents.*`)
2. **环境变量**: `GOOGLE_API_KEY` 必需,`FMP_API_KEY` 用于国债利率和新闻,`OPENAI_API_KEY` 用于流动性分析
3. **CORS**: 生产环境需设置 `FRONTEND_URL` 环境变量
4. **数据转换**: `main.py` 中 `transform_market_data_to_indices()` 将 market_data 转换为前端格式
5. **报告缓存**: `/api/market` 会检查当日是否已有报告,有则返回缓存 (基于 timestamp 验证)

### 前端开发

1. **Client Components**: 使用 hooks 的组件需要 `'use client'`
2. **API 调用**: 通过 `src/lib/api.ts` 统一管理
3. **样式**: Tailwind CSS 4,白色主题 + 翠绿色强调色
4. **缓存**: 使用 localStorage 缓存分析结果

### CI/CD

- `.github/workflows/daily-report.yml`: GitHub Actions 定时任务
  - 每工作日 23:00 UTC (美东时间 6:00 PM) 执行
  - 调用 `POST /api/report/send` 生成报告并广播给所有订阅者
- 需配置 GitHub Secrets: `CRON_SECRET`, `BACKEND_URL`
- 支持手动触发 (`workflow_dispatch`)

## 报告格式

**市场日报** (Analyst Agent) 结构化输出:
- `title`: 一句有观点的标题 (15-30 中文字符)
- `summary`: 2-3 句摘要 (列表预览用)
- `analysis`: Markdown 完整报告,包含以下章节:
  1. **主要市场叙事** - 当前市场主导逻辑
  2. **宏观环境** - 指标数据 + 综合判断
  3. **重要新闻** - 筛选后的事件新闻 (带链接)
  4. **未来 1-2 周** - 关键事件时间线
  5. **总结与思考框架** - 帮助散户理解市场脉络
- `calendar`: LLM 精选的 5-10 个关键事件 (中文事件名 + 影响分析)

**流动性分析** (Liquidity Agent) 6 维度框架:
1. **当前状态** - 各指标历史水平定位
2. **趋势** - 短期/中期流动性走向
3. **驱动因素** - Fed 资产负债表、TGA、RRP 变化原因
4. **压力信号** - 货币市场利率异常、NFCI 变化
5. **展望** - 未来 1-3 个月预判
6. **投资启示** - 对风险资产的影响
