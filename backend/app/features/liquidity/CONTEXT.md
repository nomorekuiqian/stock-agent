# Liquidity - 流动性监控

## 功能概述

纯数据服务模块（无 AI Agent），提供美联储流动性指标和全球流动性指数。数据全部来自 FRED API，通过三级缓存（内存 -> DB -> FRED API）减少外部调用。支持实时指标查询和历史时间序列。

## API 端点

| 端点 | 方法 | 描述 | 认证 |
|------|------|------|------|
| `/api/liquidity/metrics` | GET | 美联储流动性指标 + 净流动性 | 无 |
| `/api/liquidity/history?days=365` | GET | 净流动性历史时间序列 | 无 |
| `/api/liquidity/global` | GET | 全球流动性指数 (美+欧+日) | 无 |
| `/api/liquidity/global/history?days=365` | GET | 全球流动性历史时间序列 | 无 |
| `/api/liquidity/series/{series_id}?days=365` | GET | 原始 FRED 数据序列 | 无 |

**days 参数范围**: 30-1825 天

**series_id 白名单**: WALCL, WDTGAL, RRPONTSYD, WRESBAL, SOFR, EFFR, NFCI

## 数据流

```
GET /api/liquidity/*
  |
  +-- fred_service 或 global_service
  |
  +-- 三级缓存:
  |   1. 内存缓存 (10min/30min TTL)
  |   2. DB 缓存 (macro_cache.db.try_db_cache)
  |   3. FRED API (asyncio.gather 并行, 最多 5 并发)
  |
  +-- 数据处理:
  |   +-- 单位转换 (统一为 Billions USD)
  |   +-- 公式计算 (净流动性 / 全球流动性)
  |   +-- 变化率计算
  |   +-- 时间序列对齐 (二分查找)
  |
  +-- 缓存结果并返回
```

## 核心文件

| 文件 | 职责 |
|------|------|
| `router.py` | 5 个 GET 端点、series_id 白名单校验 |
| `fred_service.py` | FRED API 调用、美联储流动性指标、净流动性计算、缓存管理 |
| `global_service.py` | 全球流动性指数计算、多币种转换、历史序列对齐 |

## 依赖关系

**数据源**: FRED API (`api.stlouisfed.org`) — 需要 `FRED_API_KEY`

**缓存层**: `features/macro_cache/db.py` 的 `try_db_cache()` 函数

**无 AI Agent, 无独立数据库表** (通过 macro_cache 共享缓存表)

## 关键业务逻辑

### 美联储净流动性公式
```
Net Liquidity = Fed Assets - TGA - RRP
```
- **Fed Assets** (WALCL): 美联储总资产，周频，单位 Millions USD -> / 1000 = Billions
- **TGA** (WDTGAL): 财政部一般账户，周频，单位 Millions USD -> / 1000 = Billions
- **RRP** (RRPONTSYD): 隔夜逆回购，日频，单位 Billions USD (直接使用)

### 全球流动性指数公式
```
Global Liquidity = Fed Assets + ECB * EURUSD + BOJ * JPYUSD - TGA - RRP
```
- **ECB Assets** (ECBASSETSW): 欧央行总资产，周频，EUR Millions -> * EURUSD / 1000 = Billions USD
- **BOJ Assets** (JPNASSETS): 日央行总资产，周频，JPY 100M -> * 1e8 / USDJPY / 1e9 = Billions USD
- 汇率: DEXUSEU (EUR/USD), DEXJPUS (USD/JPY)

### FRED 数据序列参考

| Series ID | 名称 | 频率 | 原始单位 | 用途 |
|-----------|------|------|----------|------|
| WALCL | 美联储总资产 | 周 | Millions USD | 净流动性 + 全球 |
| WDTGAL | 财政部 TGA | 周 | Millions USD | 净流动性 + 全球 |
| RRPONTSYD | 隔夜逆回购 | 日 | Billions USD | 净流动性 + 全球 |
| WRESBAL | 银行准备金 | 周 | Millions USD | 补充指标 |
| SOFR | 担保隔夜融资利率 | 日 | Percent | 利率指标 |
| EFFR | 有效联邦基金利率 | 日 | Percent | 利率指标 |
| NFCI | 金融状况指数 | 周 | Index | 金融条件 |
| M2SL | 美国 M2 | 月 | Billions USD | 全球流动性 |
| ECBASSETSW | 欧央行资产 | 周 | EUR Millions | 全球流动性 |
| JPNASSETS | 日央行资产 | 周 | JPY 100M | 全球流动性 |
| DEXUSEU | EUR/USD | 日 | 汇率 | 货币换算 |
| DEXJPUS | USD/JPY | 日 | 汇率 | 货币换算 |

### 三级缓存策略

| 层级 | TTL | 说明 |
|------|-----|------|
| 内存缓存 | fred: 10min, global: 30min | dict 缓存，带时间戳 |
| DB 缓存 | 由 macro_cache 管理 | 持久化，跨重启保留 |
| FRED API | 按需请求 | Semaphore 限制最多 5 并发 |

### 并发控制
- **asyncio.Semaphore(5)**: 限制同时发往 FRED 的请求数，防止触发限流
- **asyncio.Lock**: 请求合并，多个并发请求只触发一次 FRED 调用，其余等待结果
- **asyncio.gather()**: 多个 series 并行获取

### 时间序列对齐 (global_service)
- 使用 WALCL（周频）作为时间骨架
- 其他不同频率的序列用 `bisect.bisect_right()` 二分查找最近日期
- 复杂度 O(n log n)，避免 O(n^2) 嵌套循环

### 变化率计算
```python
change_pct = ((current - previous) / abs(previous)) * 100
```
处理了除零和 None 值的边界情况。

## 注意事项

- 这是纯数据服务，没有 AI Agent，不生成分析文本
- 所有单位最终统一为 Billions USD，注意 FRED 各序列原始单位不同
- FRED API 免费层有限流，Semaphore 是关键保护措施
- 历史数据端点的 days 参数最大 1825 天（约 5 年）
- global_service 的数据多为月频/周频，30 分钟缓存已足够
- series 端点有白名单校验，不允许任意查询 FRED 序列
