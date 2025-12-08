# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

这是一个全栈宏观市场分析应用,使用 Google ADK (Agent Development Kit) 构建 AI Agent 管道,提供市场数据获取、新闻分析和投资报告服务。

**技术栈:**
- 前端: Next.js 16 + React 19 + TypeScript + Tailwind CSS 4
- 后端: FastAPI + Google ADK + Gemini + yfinance
- AI: Google ADK ParallelAgent/SequentialAgent 架构 (gemini-3-pro-preview)
- 邮件: Resend API (每日报告推送)

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
RESEND_API_KEY=your_resend_api_key  # 可选,用于邮件报告
CRON_SECRET=your_secret             # 可选,用于定时任务认证
FRONTEND_URL=https://your-domain    # 可选,生产环境 CORS
```

## 架构设计

### 后端架构

**核心设计模式**: Google ADK Agent Pipeline + Service Layer

```
backend/
├── app/
│   ├── main.py                    # FastAPI 入口, API 路由
│   ├── services/
│   │   ├── agent_service.py       # Gemini 多维度股票分析 (独立于 ADK)
│   │   ├── stock_service.py       # yfinance 数据服务
│   │   ├── fmp_service.py         # Financial Modeling Prep API
│   │   └── email_service.py       # Resend 邮件服务
│   └── models/
│       └── request_models.py      # Pydantic 模型定义
├── agents/
│   ├── agent.py                   # ADK Agent 管道定义
│   └── tools/
│       ├── market_data.py         # 市场数据工具
│       └── news.py                # 新闻获取工具
└── tests/
```

### Agent 架构 (agents/agent.py)

使用 Google ADK 的 ParallelAgent + SequentialAgent 组合:

```
┌─────────────────────────────────────────┐
│           ParallelAgent                 │
│  ┌─────────────┐  ┌─────────────────┐   │
│  │DataFetcher  │  │  NewsFetcher    │   │
│  │(market_data)│  │ (curated_news)  │   │
│  └─────────────┘  └─────────────────┘   │
└───────────────────┬─────────────────────┘
                    │
                    ▼
          ┌─────────────────────┐
          │      Analyst        │
          │  (综合分析报告)      │
          └─────────────────────┘
```

- **data_fetcher_agent**: 调用 `get_all_market_data()` 获取市场数据
- **news_fetcher_agent**: 调用 `get_market_news()` 获取宏观新闻
- **parallel_fetch_agent**: ParallelAgent 并行执行数据和新闻获取
- **analyst_agent**: 接收并行数据,生成中文市场分析报告
- **macro_pipeline_agent**: SequentialAgent 编排整个流程

**关键变量**: `root_agent = macro_pipeline_agent` (ADK Web UI 入口)

### API 端点

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/macro` | POST | 执行完整宏观分析管道,返回市场数据+新闻+AI分析 |
| `/api/news/raw` | GET | 获取原始市场新闻 |
| `/api/news/curated` | POST | 获取 AI 筛选的重要新闻 |
| `/api/report/send` | POST | 发送每日邮件报告 (需 X-Cron-Secret 头) |

### 前端架构

```
frontend/src/
├── app/
│   ├── layout.tsx      # 根布局
│   └── page.tsx        # 首页
├── components/         # React 组件
└── lib/
    └── api.ts          # API 客户端 (类型安全)
```

**API 配置**: `NEXT_PUBLIC_API_URL` 环境变量,默认 `http://localhost:8000/api`

### 数据流

```
用户请求宏观分析
  → POST /api/macro
  → MacroAgent.analyze()
  → ADK Pipeline 执行:
      1. ParallelAgent 并行获取: 市场数据 + 新闻
      2. Analyst Agent 生成中文分析报告
  → 返回 {indices, trends, liquidity, short_analysis, in_depth_analysis}
```

## 开发注意事项

### Agent 开发

1. **模型配置**: 所有 Agent 使用 `gemini-3-pro-preview`
2. **工具定义**: 在 `agents/tools/` 下添加新工具函数
3. **Agent 组合**: 使用 `ParallelAgent` 并行执行,`SequentialAgent` 顺序执行
4. **输出传递**: 使用 `output_key` 在 Agent 间传递数据

### 后端开发

1. **运行路径**: 必须从 `backend/` 目录启动 (导入路径使用 `app.*` 和 `agents.*`)
2. **环境变量**: `GOOGLE_API_KEY` 或 `GOOGLE_GENAI_API_KEY` 必需
3. **CORS**: 生产环境需设置 `FRONTEND_URL` 环境变量

### 前端开发

1. **Client Components**: 使用 hooks 的组件需要 `'use client'`
2. **API 调用**: 通过 `src/lib/api.ts` 统一管理
3. **样式**: Tailwind CSS 4,使用 glass-morphism 设计语言

### CI/CD

- `.github/workflows/daily-report.yml`: GitHub Actions 定时任务,每工作日 6:00 UTC 调用 `/api/report/send`
- 需配置 Secrets: `CRON_SECRET`, `BACKEND_URL`
