# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

这是一个全栈股票研究分析应用,使用 AI Agent 提供股票分析服务。

**技术栈:**
- 前端: Next.js 16 + React 19 + TypeScript + Tailwind CSS 4
- 后端: FastAPI + LangChain + OpenAI + yfinance
- AI: LangChain Agent with OpenAI Tools

## 开发命令

### 前端 (frontend/)

```bash
# 安装依赖
npm install

# 开发服务器 (http://localhost:3000)
npm run dev

# 构建生产版本
npm run build

# 运行生产服务器
npm start

# 代码检查
npm run lint
```

### 后端 (backend/)

```bash
# 创建虚拟环境
python3 -m venv venv
source venv/bin/activate  # macOS/Linux
# venv\Scripts\activate  # Windows

# 安装依赖
pip install -r requirements.txt

# 运行开发服务器 (http://localhost:8000)
# 注意: 必须从 backend/ 目录运行
cd backend
uvicorn app.main:app --reload

# 运行测试
pytest

# 运行单个测试文件
pytest tests/test_main.py

# 运行特定测试
pytest tests/test_main.py::test_read_main
```

### 环境配置

后端需要在 `backend/.env` 文件中配置:
```
OPENAI_API_KEY=your_openai_api_key
```

## 架构设计

### 后端架构 (backend/)

**核心设计模式**: Service-based architecture with LangChain Agent orchestration

```
backend/
├── app/
│   ├── main.py              # FastAPI 应用入口, 定义路由和 CORS
│   ├── services/            # 业务逻辑层
│   │   ├── agent_service.py # LangChain Agent 编排, 使用 OpenAI Tools
│   │   └── stock_service.py # yfinance 数据获取服务
│   └── models/
│       └── request_models.py # Pydantic 请求/响应模型
└── tests/
    └── test_main.py          # FastAPI 端点测试
```

**关键架构决策:**

1. **Agent Service (agent_service.py:11-61)**
   - 使用 LangChain 的 `create_openai_tools_agent` 创建工具调用 Agent
   - Agent 可以访问两个工具: `get_stock_price` 和 `get_stock_info`
   - 工具通过 `@tool` 装饰器定义, 自动生成 OpenAI Function Calling schema
   - Agent 使用 GPT-4 Turbo 作为推理引擎

2. **Stock Service (stock_service.py:5-52)**
   - 静态方法设计, 无状态服务
   - 使用 yfinance 获取实时股票数据
   - 提供三个核心方法: `get_stock_info`, `get_stock_history`, `get_stock_price`

3. **API 设计 (app/main.py:21-38)**
   - `/api/stock/{ticker}` - GET 获取股票基本信息
   - `/api/analyze` - POST 执行 Agent 分析, 返回自然语言结果

### 前端架构 (frontend/)

**核心设计模式**: Next.js App Router with Client Components

```
frontend/src/
├── app/
│   ├── layout.tsx           # 根布局, 全局样式
│   └── page.tsx             # 首页, 包含 hero section 和主要 UI
├── components/
│   └── stock-analysis.tsx   # 股票分析核心组件 (Client Component)
└── lib/
    └── api.ts               # API 客户端, 封装后端调用
```

**关键架构决策:**

1. **Stock Analysis Component (stock-analysis.tsx:6-139)**
   - Client Component (`'use client'`), 管理所有交互状态
   - 分离的状态管理: `stockInfo` 用于基本数据, `analysis` 用于 AI 分析结果
   - 双 API 调用模式: 先获取基本信息, 再触发 AI 分析

2. **API Layer (api.ts:17-39)**
   - 类型安全的 API 客户端
   - 使用 TypeScript 接口定义数据结构
   - API_BASE_URL 硬编码为 `http://localhost:8000/api`

3. **UI 设计系统**
   - Tailwind CSS 4 with custom glass-morphism 效果
   - Gradient blob backgrounds for visual depth
   - 响应式设计 (mobile-first approach)

### 数据流

```
用户输入 Ticker
  → Frontend StockAnalysis Component
  → api.getStockInfo(ticker)
  → Backend /api/stock/{ticker}
  → StockDataService.get_stock_info()
  → yfinance API
  → 返回股票基本信息

用户点击 "Generate Report"
  → api.analyzeStock(query)
  → Backend /api/analyze
  → AgentService.analyze()
  → LangChain Agent 使用工具执行分析
  → 返回自然语言分析结果
```

### Agent 工具系统

Agent 可以调用的工具 (agent_service.py:17-37):

1. **get_stock_price(ticker: str)**: 获取当前股价
2. **get_stock_info(ticker: str)**: 获取基本面信息
   - 过滤关键字段: longName, sector, industry, marketCap, PE 等

Agent 会自主决定调用哪些工具来回答用户查询。

## 开发注意事项

### 后端开发

1. **运行路径**: FastAPI 服务必须从 `backend/` 目录启动, 因为导入路径使用 `app.*`
2. **环境变量**: 确保 `.env` 文件存在且包含有效的 `OPENAI_API_KEY`
3. **Agent 调试**: AgentService 初始化时 `verbose=True`, 会在控制台输出工具调用过程
4. **测试**: 使用 `@patch` 模拟外部依赖 (yfinance, AgentService) 进行单元测试

### 前端开发

1. **Client Components**: 所有使用 hooks 的组件必须添加 `'use client'` 指令
2. **API 调用**: 通过 `src/lib/api.ts` 统一管理, 不要直接在组件中 fetch
3. **类型安全**: 使用 TypeScript 接口定义所有 API 响应结构
4. **样式系统**: 使用 Tailwind utility classes, 遵循现有的 glass-morphism 设计语言

### 扩展点

如果需要添加新功能:

1. **新的股票数据工具**: 在 `agent_service.py` 的 `_get_tools()` 中添加新的 `@tool` 函数
2. **新的 API 端点**: 在 `app/main.py` 中添加路由, 并在 `models/request_models.py` 定义模型
3. **新的数据源**: 在 `stock_service.py` 中添加静态方法
4. **新的 UI 组件**: 在 `frontend/src/components/` 中创建, 遵循现有的设计系统
