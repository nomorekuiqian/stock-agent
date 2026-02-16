# Shared - 跨模块共享服务

## 功能概述

提供 4 个外部数据源的封装服务，被所有 feature 模块共享调用。每个服务都是单例模式，内置缓存和错误处理。

## 服务一览

| 文件 | 数据源 | 主要用途 | 被谁调用 |
|------|--------|----------|----------|
| `fmp_service.py` | Financial Modeling Prep API | 新闻、国债利率、经济日历、财报日历、股票搜索、同行对比 | market, stock, sector, digest, macro_risk |
| `yfinance_service.py` | Yahoo Finance (yfinance库) | 批量股票报价、历史价格 | stock, weekly_report, macro_risk |
| `openbb_service.py` | OpenBB SDK | 公司资料、财务报表、估值指标 | stock |
| `insforge_service.py` | Insforge (PostgreSQL) | 数据库 CRUD (遗留，部分功能已迁移到 feature/db.py) | 多个模块 |

---

## fmp_service.py (1722 行, 最大)

### 核心能力
- **QuoteCache 类**: 线程安全内存缓存，支持 TTL 和请求合并
- **国债利率**: 12 期限点收益率曲线 + 日变化(bps)
- **新闻**: 个股新闻 + 通用宏观新闻 + 最新市场新闻 (3 个 API)
- **日历**: 经济日历 (High Impact US only) + 财报日历 (大盘股)
- **股票**: 搜索、批量报价、同行分析、行业指标、历史估值
- **商品**: 现货报价 (XAUUSD, BZUSD 等)

### 关键函数
| 函数 | 说明 |
|------|------|
| `get_treasury_rates()` | 12 期限国债 + 日变化 bps |
| `get_market_news(symbols, days)` | 个股新闻 |
| `get_general_news(days)` | 宏观/政策新闻 |
| `get_economic_calendar(from, to)` | 经济日历 |
| `get_major_earnings(from, to)` | 大盘股财报日历 |
| `search_stocks(query, limit)` | 股票搜索 |
| `get_peer_stocks(symbol)` | 同行公司列表 |
| `get_industry_pe(industry, sector)` | 行业平均 PE |
| `get_historical_key_metrics(symbol)` | 5 年历史估值 |

### 缓存
- 24 小时股票列表缓存
- QuoteCache: 可配置 TTL + LRU + 请求合并

---

## yfinance_service.py (347 行)

### 核心能力
- **YFQuoteCache 类**: 线程安全，TTL 缓存
- **批量报价**: 一次 `yfinance.download()` 获取 70+ 只股票
- 自动计算日涨跌幅

### 关键函数
| 函数 | 说明 |
|------|------|
| `get_batch_quotes(symbols)` | 批量报价 (高效单次调用) |
| `clear_cache()` | 清空缓存 |

### 使用模式
```python
yf_service = get_yfinance_service()  # 单例
quotes = await yf_service.get_batch_quotes(["AAPL", "MSFT", ...])
```

---

## openbb_service.py (493 行)

### 核心能力
- OpenBB SDK 的异步包装器
- 公司资料、三张财务报表 (季度)、估值指标、历史价格
- 安全除法工具函数 (计算利润率)

### 关键函数
| 函数 | 说明 |
|------|------|
| `get_company_profile(symbol)` | 公司资料 (名称、行业、描述等) |
| `get_income_statement(symbol, limit)` | 利润表 (季度) |
| `get_balance_sheet(symbol, limit)` | 资产负债表 (季度) |
| `get_cash_flow(symbol, limit)` | 现金流量表 (季度) |
| `get_key_metrics(symbol, limit)` | 关键估值指标 |
| `get_quote(symbol)` | 实时报价 |
| `get_historical_prices(symbol, days)` | 历史 OHLCV |

### 注意
- OpenBB 内部使用 FMP 作为数据提供方
- 所有同步调用通过 `asyncio.to_thread()` 包装为异步
- FMP 数据字段的序列化辅助函数处理 Pydantic 对象 -> dict

---

## insforge_service.py (1161 行)

### 核心能力
Insforge 数据库 Edge Function 的 HTTP 客户端。

**注意**: 这是早期的集中式 DB 服务，部分功能已迁移到各 feature 模块的 `db.py` 中。两者目前共存，调用的是同一套 Edge Function。

### 涵盖的表操作
- 市场报告 (market_reports)
- 流动性分析 (liquidity_analyses)
- 用户自选股 (user_watchlists)
- 个人摘要 (user_digests)
- 板块日报 (sector_digests)
- 邮件反馈 (email_feedback)
- 股票资料/财务/分析 (stock_profiles, stock_financials, stock_analyses)
- 板块订阅 (sector_subscriptions)

### 使用模式
```python
from app.core.database import get_insforge_service
service = get_insforge_service()
# service.base_url, service.headers 提供给各模块的 db.py 使用
```

## 注意事项

- fmp_service.py 是最大的文件，包含几乎所有外部金融数据获取逻辑
- 所有服务使用单例模式 (`get_xxx_service()` 函数)
- FMP API 需要 `FMP_API_KEY` 环境变量
- insforge_service.py 与 feature/db.py 有功能重叠，新代码应优先使用 feature/db.py
- yfinance 批量调用效率远高于逐个查询，尽量用 batch 接口
