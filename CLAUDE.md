# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

这是一个全栈宏观市场分析应用,使用 Google ADK (Agent Development Kit) 构建 AI Agent,提供市场数据获取、新闻分析和投资报告服务。

**技术栈:**
- 前端: Next.js 16 + React 19 + TypeScript + Tailwind CSS 4
- 后端: FastAPI + Google ADK + Gemini + yfinance + FMP API
- AI: Google ADK 单 Agent 架构 (gemini-3-pro-preview)
- 邮件: Resend API (每日报告推送)
- 品牌: MarketPulse (翠绿色主题 #059669)

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
FMP_API_KEY=your_fmp_api_key        # Financial Modeling Prep API
RESEND_API_KEY=your_resend_api_key  # 可选,用于邮件报告
CRON_SECRET=your_secret             # 可选,用于定时任务认证
FRONTEND_URL=https://your-domain    # 可选,生产环境 CORS
```

## 架构设计

### 后端架构

**核心设计模式**: Python 数据获取 + 单 Analyst Agent 分析

```
backend/
├── app/
│   ├── main.py                    # FastAPI 入口, API 路由
│   └── services/
│       ├── fmp_service.py         # Financial Modeling Prep API (国债利率)
│       └── email_service.py       # Resend 邮件服务
├── agents/
│   ├── agent.py                   # ADK Agent 定义 + MacroAgent 封装类
│   └── tools/
│       ├── __init__.py            # 工具导出
│       ├── market_data.py         # 市场数据工具 (yfinance)
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

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/macro` | POST | 执行完整宏观分析,返回市场数据+新闻+AI分析 |
| `/api/report/send` | POST | 发送每日邮件报告 (需 X-Cron-Secret 头) |
| `/api/report/send-test` | POST | 发送测试邮件 (默认发送到 hardcode 邮箱) |

### 前端架构

```
frontend/src/
├── app/
│   ├── layout.tsx           # 根布局 (MarketPulse 品牌, 翠绿色导航)
│   ├── page.tsx             # 首页
│   ├── globals.css          # Tailwind 主题配置
│   └── macro/
│       └── page.tsx         # 市场分析页面
└── lib/
    └── api.ts               # API 客户端 (类型安全)
```

**UI 设计**: Apple 风格,白色主题,翠绿色 (#059669) 强调色,紧凑间距

**API 配置**: `NEXT_PUBLIC_API_URL` 环境变量,默认 `http://localhost:8000/api`

### 数据流

```
用户点击 "Refresh Analysis"
  → POST /api/macro
  → MacroAgent.analyze()
  → Python 并行获取:
      - get_all_market_data() (yfinance + FMP)
      - get_combined_market_news() (FMP)
      - get_economic_calendar() (FMP)
      - get_earnings_calendar() (FMP)
  → Analyst Agent 生成中文分析报告
  → 返回 {indices, timestamp, short_analysis, in_depth_analysis, ...}
  → 前端缓存到 localStorage
```

## 开发注意事项

### Agent 开发

1. **模型配置**: Agent 使用 `gemini-3-pro-preview`
2. **工具定义**: 在 `agents/tools/` 下添加新工具函数
3. **数据获取**: 在 Python 层完成,不使用 LLM 调用工具
4. **Prompt 维护**: Analyst Agent 的 `ANALYST_INSTRUCTION` 定义报告格式

### 后端开发

1. **运行路径**: 必须从 `backend/` 目录启动 (导入路径使用 `app.*` 和 `agents.*`)
2. **环境变量**: `GOOGLE_API_KEY` 必需,`FMP_API_KEY` 用于国债利率和新闻
3. **CORS**: 生产环境需设置 `FRONTEND_URL` 环境变量
4. **数据转换**: `main.py` 中将 market_data 转换为前端 indices 格式

### 前端开发

1. **Client Components**: 使用 hooks 的组件需要 `'use client'`
2. **API 调用**: 通过 `src/lib/api.ts` 统一管理
3. **样式**: Tailwind CSS 4,白色主题 + 翠绿色强调色
4. **缓存**: 使用 localStorage 缓存分析结果

### CI/CD

- `.github/workflows/daily-report.yml`: GitHub Actions 定时任务,每工作日 6:00 UTC 调用 `/api/report/send`
- 需配置 Secrets: `CRON_SECRET`, `BACKEND_URL`

## 报告格式

Analyst Agent 生成的报告包含 6 个固定章节:

1. **市场一句话** - 3 秒内理解今日市场
2. **今天市场在交易什么** - 定价主线分析
3. **关键指标与信号** - 宏观流动性分析
4. **资产/板块** - 最重要的几件事
5. **新闻** - 最值得读的几条 (带链接)
6. **未来 1-2 周** - 观察清单
