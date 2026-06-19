# TheMarketBrew 系统架构文档

> 最后更新：2026-03-31

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

### 框架选型：Google ADK

```python
agent = LlmAgent(
    model="gemini-3.1-flash-lite-preview",
    name="analyst",
    instruction=SYSTEM_PROMPT,
    output_schema=AnalysisOutput,      # Pydantic -> 强制结构化 JSON
    output_key="analysis",
)
runner = InMemoryRunner(agent=agent, app_name="stock_analysis")
```

**为什么不用 LangChain？** 我们的场景是确定性 pipeline（数据进 -> 报告出），ADK 的 Pydantic output_schema 原生强制输出格式，20 行代码搞定一个 Agent。

### 两种 Agent 范式

```
Structured Output (8 个)              Tool-Use 对话 (1 个)
数据 -> LLM -> 结构化 JSON             多轮对话 + Function Tools
单轮，无工具调用                       累积式筛选 + 面板导航
日报/早报/摘要/周报/个股x4             ResearchAgent (AI 选股助手)
```

### 统一数据流 (Structured Output Agent)

```
Step 1  asyncio.gather() 并行获取多源数据
Step 2  Python 清洗 (减少 30-45% tokens，去垃圾新闻/截断/过滤)
Step 3  Gemini LLM -> Pydantic output_schema 强制结构化输出
Step 4  Python 后处理 (URL 解析、时间戳补全)
Step 5  异步写入 DB (非阻塞)
```

### Agent 清单

| Agent | 模型 | 缓存 | 核心能力 |
|-------|------|------|---------|
| MarketAgent | Pro | 按日期 | 市场日报，加载前5天实现叙事连续性 |
| MorningAgent | Flash Lite | 按日期 | 盘前早报，仅隔夜数据+今日关注 |
| PersonalDigest | Pro | user+日期 | 围绕用户自选股定制，检测自选股变化 |
| WeeklyAgent | Pro | 按周标签 | 4维宏观分析+信号灯，最复杂的 prompt |
| StockAnalysis x4 | Flash Lite | 8h-7天 | 基本面/技术面/新闻面/宏观面，4个独立Agent并行 |
| **ResearchAgent** | **Flash** | **无** | **多轮对话选股，6+Tools，上下文感知，面板导航** |

**个股拆成 4 个 Agent 的原因**：并行请求、独立缓存 TTL、Token 效率、容错隔离

### 容错机制

```
正常执行 -> Gemini Pro/Flash
    |
    +-- 503 (模型过载) -> 自动切换 Flash Lite -> 执行 -> 恢复原模型
```

### Research Agent 深度解析

对话式选股助手，面向投资新手。通过自然对话找到符合偏好的股票。

```
+---------------------+  +-----------------------------+
|     左侧: 对话面板    |  |    右侧: 结果/内容面板        |
|                     |  |                             |
|  用户: "稳定分红的"   |  |  [股票卡片列表]              |
|  Agent: "找到23只"   |  |  或: 日报/个股/宏观等视图     |
|  [只看科技] [提高股息] |  |                             |
+---------------------+  +-----------------------------+
```

**核心机制**：

1. **对话循环** — 每轮判断意图：改变筛选条件(`update_results=true`)、回答问题(`false`)、或重置(`filters=[]`)
2. **两种筛选模式** — 结构化筛选(`execute_screener`，字段条件过滤 5800+ 只股票)+ 主题筛选(`filter_by_tickers`，LLM 知识映射概念到公司列表)
3. **累积式筛选** — 每轮输出完整 filters 数组，前端直接使用。条件可追加、替换、移除
4. **上下文感知** — Agent 感知用户当前浏览的页面，生成个性化首轮回复（日报/个股/宏观/选股等不同 context）
5. **面板导航** — Agent 通过 `navigate_to_content` 工具控制右侧面板显示内容（选股结果/个股研究/日报/宏观）
6. **智能推荐触发** — 结果 <=15 只时自动写推荐理由，>15 只时引导缩小范围

**线程安全**：股票数据通过 `ContextVar` 传递，每个请求独立副本，避免并发污染。

**可用筛选字段**：估值(PE/PB/PS/EV-EBITDA/PEG)、盈利(毛利率/ROE/ROA/ROIC)、增长(营收/EPS)、股息(股息率/派息年限)、价格表现(日/月/年涨跌)、其他(市值/板块/beta/RSI/分析师评级)。

### Prompt Engineering 设计哲学

| 原则 | 说明 |
|------|------|
| **数据准确性绝对** | 禁止编造数据，缺失时明确说"暂无" |
| **"So What?" 框架** | 每个数据都要解释意义 |
| **结论前置** | 先亮立场，再给证据 |
| **叙事连续性** | 加载前 5 份历史报告，串联上下文 |
| **情绪校准** | 大涨不盲目乐观，结合成交量/VIX |
| **禁止清单** | 无比喻、无投资建议、无套话 |

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
       └─ AuthProvider (server-cookie bridge → JWT)
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
| 认证 | Server-cookie bridge (first-party httpOnly cookies) | 刷新/OAuth/隐私模式下登录态更稳定 | 需要维护 Next.js server actions / route handlers |
| 三级缓存 | 内存→DB→API | 成本控制(FMP 有配额)、性能分层 | 一致性管理复杂 |
| 数据获取 | React Query (非 SWR/Redux) | 乐观更新、查询失效、缓存注入、DevTools | 比 SWR 更重 |
| 个股分析 | 4 个独立 Agent | 并行、独立缓存、Token 效率、容错 | 4 次 API 调用(可并行) |

---

> 产品路线图见 [docs/product/roadmap.md](product/roadmap.md)。
