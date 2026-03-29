# TheMarketBrew 系统架构文档

> 面试准备用。最后更新：2026-03-26

---

## 一、产品定位

AI 驱动的美股市场分析平台，为散户投资者提供机构级的市场洞察。

**核心产品线**：

```
┌─────────────────────────────────────────────────────────────┐
│                    TheMarketBrew 产品矩阵                     │
├──────────────┬──────────────┬───────────────┬───────────────┤
│   每日市场    │   个性化      │    深度研究     │   宏观视角    │
├──────────────┼──────────────┼───────────────┼───────────────┤
│  市场日报     │  Brew 摘要    │  个股四维分析   │  风险仪表盘   │
│  盘前早报     │  自选股管理    │  AI 选股助手   │  流动性监控   │
│              │              │  Stock Screener│  宏观周报     │
├──────────────┴──────────────┴───────────────┴───────────────┤
│  支撑能力: 邮件订阅 · Stripe 支付 · 邀请码 · 用户反馈        │
└─────────────────────────────────────────────────────────────┘
```

---

## 二、技术栈

```
┌─ 前端 ──────────────────────────────────────────────────────┐
│  Next.js 16 · React 19 · TypeScript · Tailwind CSS 4        │
│  TanStack React Query 5 · lightweight-charts · shadcn/ui     │
└──────────────────────────┬──────────────────────────────────┘
                           │ REST API (Bearer JWT)
┌──────────────────────────▼──────────────────────────────────┐
│  FastAPI (Python, async)                                      │
│  Google ADK (Gemini 3.1) · slowapi 限流 · Pydantic 校验      │
└───┬──────┬──────┬──────┬──────┬──────┬──────────────────────┘
    │      │      │      │      │      │
    ▼      ▼      ▼      ▼      ▼      ▼
  Gemini  FMP   FRED  yfinance Resend Stripe
  (AI)   (金融) (宏观) (报价)  (邮件) (支付)

数据库: Insforge (托管 PostgreSQL, 通过 Edge Functions 操作)
认证:   Insforge Auth (JWT + Google OAuth)
部署:   Vercel (前端) + Render (后端)
```

---

## 三、后端架构

### 分层架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Feature 模块层 (14 个模块)                  │
│  daily_report · morning_report · brew · stock · screener     │
│  macro/risk · macro/liquidity · macro/weekly · macro/cache   │
│  subscription · notification · payment · feedback · invites  │
│                                                              │
│  每个模块: router.py + agent.py + service.py + db.py + models│
├─────────────────────────────────────────────────────────────┤
│                    共享服务层 (Shared)                         │
│  FMP Service ─── 新闻/利率/日历/搜索/估值                      │
│  yfinance    ─── 批量报价/历史价格/TTM指标                     │
│  OpenBB      ─── 公司档案/季度财报                             │
│  Data Tools  ─── Agent 数据接口 (market/news/calendar/tech)   │
├─────────────────────────────────────────────────────────────┤
│                    核心基础设施 (Core)                         │
│  config · database(Insforge HTTP) · deps(认证) · rate_limit  │
└─────────────────────────────────────────────────────────────┘
```

### 核心数据流

```
外部数据 API (FMP/yfinance/FRED/TradingView)
        │
        │  asyncio.gather() 并行获取
        ▼
  Data Tools 层 (纯 JSON，无分析)
        │
        │  数据清洗 (减少 30-45% tokens)
        ▼
  AI Agent (Gemini LLM, Pydantic output_schema)
        │
        │  结构化 JSON 输出
        ▼
  异步写入 DB (Insforge Edge Functions, 非阻塞)
        │
        ▼
  API Response → 前端
```

### 三级缓存

```
请求 ──→ [L1 内存缓存] ──miss──→ [L2 数据库] ──miss──→ [L3 外部 API]
          < 1ms                   < 100ms               500ms-3s
          30min TTL               24h-30天               实时
          LRU 500项               Insforge               FMP/yfinance
```

| 数据类型 | L1 | L2 | 说明 |
|----------|----|----|------|
| 股票档案 | 30min | 30天 | 变化极慢 |
| AI 基本面分析 | — | 7天 | AI 生成 |
| AI 技术面/新闻分析 | — | 8-24h | 时效性更高 |
| 市场日报 | — | 按日期 | 自然幂等 |
| 技术指标快照 | 15min | — | 接近实时 |
| 宏观数据 | 4-24h (分层) | — | Tier 1/2/3 |

---

## 四、API 全景

### 认证模型

```
🔓 Bearer JWT (verify_user_token)     ── 用户功能
🔑 X-Cron-Secret (verify_cron_secret) ── 定时任务/管理
🌐 公开                                ── 市场数据/报告阅读
⚡ 限流 (slowapi)                      ── AI 生成类 5/min
```

### API 端点总览 (~95 个)

```
/api/market/*           🌐  市场日报 (6 端点)
  POST /api/market           生成/获取日报 🔓
  GET  /api/market/latest    今日缓存报告
  GET  /api/market/reports   历史列表 (分页)

/api/morning/*          🌐  盘前早报 (7 端点)
  POST /api/morning          生成早报 🔓⚡
  POST /api/morning/broadcast 广播 🔑

/api/digest|watchlist   🔓  个性化摘要 (5 端点)
  PUT  /api/watchlist        保存自选股 (最多25)
  POST /api/digest           生成个性化摘要 ⚡

/api/stocks/*           🌐  个股投研 (12 端点)
  GET  /api/stocks/search    搜索 ⚡20/min
  GET  /api/stocks/quotes    批量报价 ⚡30/min
  GET  /api/stocks/{sym}     完整数据
  POST /api/stocks/{sym}/analysis   AI 基本面 ⚡
  POST /api/stocks/{sym}/technical  AI 技术面 ⚡
  POST /api/stocks/{sym}/news       AI 新闻面 ⚡
  POST /api/stocks/{sym}/macro      AI 宏观面 ⚡

/api/liquidity/*        🌐  流动性监控 (5 端点)
  GET  /api/liquidity/metrics    净流动性 = Fed资产 - TGA - RRP
  GET  /api/liquidity/global     全球流动性 (美+欧+日)

/api/macro-risk/*       🌐  宏观风险 (9 端点)
  GET  /api/macro-risk/dashboard 4维评分 + 综合分
  GET  /api/macro-risk/economy|inflation-rates|sentiment|...

/api/weekly-report/*    🌐  宏观周报 (3 端点)
  POST /api/weekly-report/generate 生成周报 🔑

/api/macro-cache/*      🔑  缓存管理 (2 端点)

/api/subscriptions/*    混合 邮件订阅 (9 端点)
  POST /{channel}/subscribe|unsubscribe 🌐
  GET|POST /preferences 🔓

/api/report|newsletter|welcome|verification-email/*
                        混合 邮件通知 (15 端点)

/api/payment/*          🔓  Stripe 支付 (5 端点)
  POST /checkout-session|portal-session|webhook

/api/invites/*          混合 邀请码 (3 端点)

/api/feedback/*         混合 用户反馈 (5 端点)

/api/screener/*         混合 股票筛选 (11 端点)
  POST /api/screener/filter    预定义筛选策略
  POST /api/research/chat      AI 对话选股 🔓⚡

/, /health, /ready      🌐  系统 (3 端点)
```

---

## 五、AI Agent 体系

```
┌─────────────────────────────────────────────────────────────┐
│                    9 个 AI Agent                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  📊 报告类 (单轮, Structured Output)                          │
│  ┌──────────────────┬────────────────┬────────────────┐     │
│  │ MarketAgent      │ MorningAgent   │ PersonalDigest │     │
│  │ 日报 (Pro)       │ 早报 (Flash)   │ 摘要 (Pro)     │     │
│  └──────────────────┴────────────────┴────────────────┘     │
│  ┌──────────────────┐                                       │
│  │ WeeklyAgent      │                                       │
│  │ 周报 (Pro)       │                                       │
│  └──────────────────┘                                       │
│                                                              │
│  🔬 个股四维分析 (并行, 独立缓存)                               │
│  ┌───────────┬───────────┬───────────┬───────────┐          │
│  │ 基本面     │ 技术面     │ 新闻面    │ 宏观面     │          │
│  │ Flash Lite│ Flash Lite│ Flash Lite│ Flash Lite │          │
│  │ 7天缓存   │ 24h缓存   │ 8h缓存    │ 24h缓存    │          │
│  └───────────┴───────────┴───────────┴───────────┘          │
│                                                              │
│  🤖 对话类 (多轮, Tool-Use)                                   │
│  ┌──────────────────────────────────────────────┐           │
│  │ ResearchAgent — AI 选股助手                    │           │
│  │ 6 个 Tools + 上下文感知 + 累积式筛选            │           │
│  └──────────────────────────────────────────────┘           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**统一模式**：Python 获取数据 → 清洗减 token → Gemini 生成 → Pydantic 校验 → 缓存

**个股拆成 4 个 Agent 的原因**：并行请求、独立缓存 TTL、Token 效率、容错隔离

---

## 六、前端架构

### 渲染策略

```
┌────────────────────────────────────────────────────────────┐
│                    31 个页面                                 │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  RSC + ISR (5min)          Client (Protected)              │
│  ┌──────────────┐          ┌──────────────────────┐       │
│  │ /today       │          │ /for-you    (摘要)    │       │
│  │ /morning     │          │ /macro/*    (宏观)    │       │
│  │ SEO 友好      │          │ /research   (选股)    │       │
│  └──────────────┘          │ /profile    (设置)    │       │
│                            └──────────────────────┘       │
│  Client (公开)                                             │
│  ┌──────────────────────┐  Static                         │
│  │ /stock/*     (个股)   │  ┌──────────────┐              │
│  │ /screener    (筛选)   │  │ /  (落地页)   │              │
│  │ /login       (登录)   │  └──────────────┘              │
│  └──────────────────────┘                                 │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### 状态管理

```
QueryClientProvider
  └─ ThemeProvider (dark/light)
       └─ AuthProvider (Insforge SDK Direct → JWT)
            └─ SubscriptionProvider (Stripe 订阅状态)
                 └─ 页面内容
                      └─ React Query hooks (domain-specific staleTime)
```

**数据获取核心**：TanStack React Query 5
- 统一 API 客户端 (`lib/api.ts`)：45+ TS 接口、请求去重、Bearer 注入
- 差异化 staleTime：报价 1min / 报告 30min / 自选股 ∞
- Mutation 模式：乐观更新(自选股)、缓存注入(AI分析)、列表失效(摘要)

### 设计系统

```
Financial Terminal + Editorial Luxury
├─ 字体: Instrument Serif (标题) · DM Sans (UI) · JetBrains Mono (数据)
├─ 主色: emerald-500/600 (翠绿)
├─ 辅色: amber-400/600 (琥珀)
├─ 涨跌: emerald/red
└─ 风格: 金融终端的数据密度 + 奢侈品编辑的留白美学
```

---

## 七、关键架构决策

| 决策 | 选择 | 原因 | 取舍 |
|------|------|------|------|
| AI 框架 | Google ADK (非 LangChain) | 原生 Pydantic schema、代码极简、Gemini 深度集成 | 生态不如 LangChain 丰富 |
| 数据库操作 | Edge Functions (非 ORM) | 解耦、安全(Python不直连DB)、可独立部署 | 多一层 HTTP 调用 |
| 认证 | SDK Direct (非 Server Bridge) | 开发快、少一层 | Safari/隐身模式 refresh token 失效 |
| 三级缓存 | 内存→DB→API | 成本控制(FMP 有配额)、性能分层 | 一致性管理复杂 |
| 数据获取 | React Query (非 SWR/Redux) | 乐观更新、查询失效、缓存注入、DevTools | 比 SWR 更重 |
| 个股分析 | 4 个独立 Agent | 并行、独立缓存、Token 效率、容错 | 4 次 API 调用(可并行) |

---

> 详见 `docs/agent-architecture.md` 了解 AI Agent 的完整实现细节。
