# Stock - 个股投研

## 功能概述

个股研究模块，提供公司资料、实时报价、财务数据、估值对比、AI 基本面分析和 AI 技术分析。数据来自 OpenBB、yfinance、FMP、tvscreener、pandas-ta 多个源，通过三级缓存（内存 -> DB -> API）减少外部调用。AI 分析使用 Gemini Pro 生成中文投研报告。

## API 端点

| 端点 | 方法 | 描述 | 认证 |
|------|------|------|------|
| `/api/stocks/search?q=&limit=8` | GET | 搜索股票 (FMP) | 无 |
| `/api/stocks/quotes?symbols=AAPL,MSFT` | GET | 批量报价，最多 100 个 (yfinance) | 无 |
| `/api/stock/{symbol}/profile` | GET | 公司资料 (内存+DB 缓存) | 无 |
| `/api/stock/{symbol}` | GET | 完整数据 (资料+报价+基本面+财务) | 无 |
| `/api/stock/{symbol}/history?days=365` | GET | 历史 OHLCV 价格 | 无 |
| `/api/stock/{symbol}/valuation` | GET | 估值对比 (同行+行业+历史) | 无 |
| `/api/stock/{symbol}/analysis?force=false` | POST | AI 基本面分析 | 无 |
| `/api/stock/{symbol}/technical?force=false` | POST | AI 技术分析 | 无 |

**Symbol 校验**: 正则 `^[A-Z0-9.\-]{1,10}$`

## 数据流

### 获取完整股票数据 (GET /stock/{symbol})
```
请求
  |
  +-- StockService.get_stock_data()  并行获取:
  |   +-- Profile  (内存 30min -> DB 30天 -> OpenBB API)
  |   +-- Quote    (实时, yfinance, 不缓存)
  |   +-- Financials (内存 30min -> DB 按季度 -> OpenBB API)
  |
  +-- 计算衍生指标:
  |   +-- TTM 指标 (近4季度求和: 营收, EPS, FCF)
  |   +-- 估值指标 (P/E, P/S, P/B, EV/EBITDA, PEG, 股息率)
  |   +-- 增长指标 (YoY, QoQ 增长率)
  |   +-- 盈利能力 (毛利率, 净利率, ROE, ROA)
  |
  +-- 返回 StockDataResponse
```

### AI 分析 (POST /stock/{symbol}/analysis)
```
请求
  |
  +-- 检查缓存 (DB, 24小时过期)
  |   +-- 命中且未过期 -> 直接返回
  |   +-- 未命中/force=true -> 生成新分析
  |
  +-- 获取完整股票数据 + 估值对比数据
  +-- _prepare_stock_data_for_analyst() 精简数据
  +-- Gemini Pro Agent 生成 7 段式分析报告
  +-- 保存到 DB (24小时过期)
  +-- 返回分析结果
```

## 核心文件

| 文件 | 职责 |
|------|------|
| `router.py` | 7 个 API 端点、Symbol 校验、价格历史内存缓存、批量报价 |
| `service.py` | StockService 核心类 — 三级缓存、数据聚合、指标计算 (732行, 最复杂) |
| `agent.py` | StockAnalysisAgent + TechnicalAnalysisAgent — Gemini Pro 基本面/技术分析 |
| `models.py` | 全部 Pydantic 模型 (报价、资料、财报、指标、API 响应) |
| `db.py` | Insforge Edge Function (stock_profiles, stock_financials, stock_analyses 三张表) |

## 依赖关系

**数据源**:
- `shared/openbb_service.py` — 公司资料、财务报表、价格历史
- `shared/yfinance_service.py` — 实时报价 (批量)
- `shared/fmp_service.py` — 股票搜索、同行对比、行业 PE、历史估值
- `shared/data_tools/technical.py` — 技术指标 (tvscreener + pandas-ta)

**AI**: Google ADK `LlmAgent` + `InMemoryRunner`, 模型 `gemini-3-pro-preview`

**数据库表**:
- `stock_profiles` — 公司资料 (30天 TTL)
- `stock_financials` — 季度财报 (按季度缓存)
- `stock_analyses` — AI 分析结果 (24小时过期)

## 关键业务逻辑

### 三级缓存架构
| 资源 | 内存缓存 | DB 缓存 | API 源 | TTL |
|------|----------|---------|--------|-----|
| Profile | 30min, LRU 500 | 30天 | OpenBB | 30min / 30天 |
| Financials | 30min, LRU 500 | 按季度 | OpenBB | 30min / 45天窗口 |
| Quote | 不缓存 | 不缓存 | yfinance | 实时 |
| Analysis (基本面) | 不缓存 | 24小时 | Gemini Agent | 24小时 |
| Analysis (技术面) | 不缓存 | 24小时 | Gemini Agent | 24小时 |
| tvscreener 快照 | 15min | 不缓存 | tvscreener API | 15min |
| pandas-ta 趋势 | 30min | 不缓存 | yfinance + pandas-ta | 30min |
| Price History | 30min (router层) | 不缓存 | OpenBB | 30min |
| Industry PE | 6小时 | 不缓存 | FMP | 6小时 |

### 缓存实现细节
- 线程安全: 使用 `threading.Lock` 保护并发访问
- 返回浅拷贝: 防止外部修改缓存内容
- LRU 淘汰: 内存缓存上限 500 条，超出时删除最旧的
- DB 异步写入: 获取新数据后异步写入 DB 缓存，不阻塞响应

### AI 技术分析 (POST /stock/{symbol}/technical)
```
请求
  |
  +-- 检查缓存 (DB, analysis_type="technical", 24小时过期)
  |   +-- 命中且未过期 -> 直接返回
  |   +-- 未命中/force=true -> 生成新分析
  |
  +-- 获取技术指标数据:
  |   +-- tvscreener (primary): 当前指标快照 + TV 评级 (15min 内存缓存)
  |   +-- pandas-ta (secondary): 历史趋势 + 支撑阻力 (30min 内存缓存)
  |   +-- tvscreener 失败时降级为纯 pandas-ta
  |
  +-- _prepare_technical_data_for_agent() 精简数据
  +-- Gemini Pro Agent 生成 4 段式技术分析
  +-- 保存到 DB (24小时过期, analysis_type="technical")
  +-- 返回分析结果
```

### AI 基本面分析输出结构 (7 段式)
1. `title` — 有观点的中文标题 (15-40字)
2. `fundamentals_analysis` — 估值 + 成长性 + 盈利能力 (600-1000字)
3. `financials_analysis` — 营收/盈利质量 + 资产负债表 + 趋势 (600-1000字)
4. `company_overview` — 商业模式 + 竞争壁垒 + 市场定位 (400-600字)
5. `opportunities` — 短/中/长期催化剂 (400-600字)
6. `risks` — 业务/财务/估值风险 (400-600字)
7. `investment_summary` — 核心论点 + 多空观点 + 关键 KPI (300-500字)

### AI 技术分析输出结构 (4 段式)
1. `title` — 有观点的技术面中文标题 (15-40字)
2. `trend_analysis` — 趋势方向 + 动能状态 + 多周期共振 + TV 评级 (600-1000字)
3. `entry_exit_signals` — 支撑阻力位 + 交易信号条件 (400-600字)
4. `pattern_analysis` — 均线交叉 + BB 形态 + 量价分析 + 指标背离 (400-600字)
5. `technical_summary` — 技术评级 + 关键价位 + 情景推演 (300-500字)

### 数据精简 (_prepare_stock_data_for_analyst)
- 财报只保留最近 4 个季度
- 过滤 null/zero 值字段
- 历史估值保留 5 年数据
- 同行对比保留前 5 名
- 目的: 减少 token 消耗

### 指标计算
- **TTM**: 最近 4 季度求和 (营收、EPS、自由现金流)
- **估值**: P/E = 股价/TTM EPS, P/S = 市值/TTM 营收, 等
- **增长**: YoY = (本季-去年同季)/去年同季, QoQ = (本季-上季)/上季

## 注意事项

- StockService 是单例模式，整个应用生命周期复用
- 批量报价 (`/quotes`) 用一次 yfinance 调用获取 70+ 只股票，效率远高于逐个查询
- DB 的 JSONB 字段返回可能是字符串，db.py 中做了 JSON 解析兼容
- OpenBB 的财务数据需要合并三张表 (income, balance, cashflow) 为一条季度记录
- 估值对比端点 (`/valuation`) 会并行获取同行、行业、历史三个维度的数据
