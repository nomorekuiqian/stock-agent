# 全球流动性板块实施方案

## 概览

将流动性页面从 3 Tab (净流动性 / 资产负债表 / 金融条件) 重构为 2 Tab (美国流动性 / 全球流动性)，新增全球 M2 等指标。

---

## Step 1: 后端 — 新建 `global_service.py`

**文件**: `backend/app/features/liquidity/global_service.py`

### 1.1 FRED Series 定义

```python
GLOBAL_LIQUIDITY_SERIES = {
    # 各国 M2 (本币单位，需汇率转换)
    "us_m2": "M2SL",           # US M2 (Billions USD, Monthly)
    "china_m2": "MABMM301CNM189S",  # China M2 (CNY, Monthly)
    "euro_m2": "MYAGM2EZM196N",     # Euro Area M2 (EUR, Monthly)
    "japan_m2": "MABMM301JPM189S",  # Japan M2 (JPY, Monthly)
    # 央行资产负债表
    "ecb_assets": "ECBASSETSW",  # ECB Total Assets (EUR Millions, Weekly)
    "boj_assets": "JPNASSETS",   # BOJ Total Assets (JPY 100M, Weekly)
    # 汇率 (用于转换)
    "usdcny": "DEXCHUS",   # USD/CNY (Daily)
    "eurusd": "DEXUSEU",   # EUR/USD (Daily)
    "usdjpy": "DEXJPUS",   # USD/JPY (Daily)
}
```

### 1.2 核心函数

| 函数 | 说明 | 缓存策略 |
|------|------|----------|
| `_fetch_and_compute_global_m2()` | 并行获取 9 个 FRED series + 汇率转换 + 计算 Global M2 总和 | 内部函数，无缓存 |
| `get_global_liquidity_metrics()` | 返回各国 M2 + Global M2 最新值 | 优先读 DB (`fred:global_liquidity`)，fallback 调 FRED |
| `get_global_liquidity_history(days=365)` | 返回 Global M2 历史序列 | 优先读 DB (`fred:global_liquidity_history`)，日期对齐用 `find_closest_value()` |

### 1.3 汇率转换逻辑

```
Global M2 (USD) = US M2
                + China M2 / USDCNY
                + Euro M2 * EURUSD
                + Japan M2 / USDJPY * 100  (FRED 单位: 100M JPY)
```

### 1.4 复用模式

- 复用 `fred_service.py` 的 `fetch_fred_series()` 和 `get_latest_value()` 获取原始数据
- 复用 `find_closest_value()` 做日期对齐 (各国数据发布频率不同)
- 复用 `_get_semaphore()` 做 FRED 并发限制
- 复用 `try_db_cache()` / `set_cached()` 做 DB 缓存读写

### 1.5 降级策略

- 某国 M2 获取失败 → 使用上次缓存值，标记 `partial: true`
- 汇率获取失败 → 使用最近可用汇率 (FRED 汇率数据一般延迟 1-2 天)
- 全部失败 → 返回 DB 缓存旧数据 + `stale: true` 标记

---

## Step 2: 后端 — 修改 Router 和 Refresher

### 2.1 新增端点 (`router.py`)

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/liquidity/global` | GET | 全球流动性最新指标 (从 DB 缓存读) |
| `/api/liquidity/global/history?days=365` | GET | Global M2 历史数据 (从 DB 缓存读) |

端点实现模式与现有 `/api/liquidity/metrics` 一致：DB 缓存优先 → fallback 实时获取。

### 2.2 Refresher 注册 (`refresher.py`)

在 **Tier 2** (12h 刷新周期) 新增两个任务：

```python
# refresh_tier2() 中新增:
("fred:global_liquidity", _refresh_global_liquidity),
("fred:global_liquidity_history", _refresh_global_liquidity_history),
```

| 缓存 Key | TTL | 刷新函数 | 说明 |
|----------|-----|----------|------|
| `fred:global_liquidity` | T2 (14h) | `_refresh_global_liquidity()` | 调用 `_fetch_and_compute_global_m2()` → 存 DB |
| `fred:global_liquidity_history` | T3 (26h) | `_refresh_global_liquidity_history()` | 获取 365 天历史 → 存 DB |

全球数据多为月度/周度，T2 (12h) 刷新频率足够。任务间已有 `asyncio.sleep(2)` 间隔避免 FRED 限速。

---

## Step 3: 前端 — 类型定义和 API 层

**文件**: `frontend/src/lib/api.ts`

### 3.1 新增类型

```typescript
export interface GlobalLiquidityMetrics {
  global_m2: LiquidityMetric;     // 计算值: 各国 M2 美元加总
  us_m2: LiquidityMetric;         // FRED:M2SL
  china_m2: LiquidityMetric;      // FRED:MABMM301CNM189S (已转 USD)
  euro_m2: LiquidityMetric;       // FRED:MYAGM2EZM196N (已转 USD)
  japan_m2: LiquidityMetric;      // FRED:MABMM301JPM189S (已转 USD)
  ecb_assets: LiquidityMetric;    // FRED:ECBASSETSW
  boj_assets: LiquidityMetric;    // FRED:JPNASSETS
}

export interface GlobalLiquidityHistoryObservation {
  time: string;
  global_m2: number;
  us_m2: number;
  china_m2: number;
  euro_m2: number;
  japan_m2: number;
}

export interface GlobalLiquidityResponse {
  success: boolean;
  timestamp: string;
  data: GlobalLiquidityMetrics;
}

export interface GlobalLiquidityHistoryResponse {
  success: boolean;
  timestamp: string;
  data: {
    observations: GlobalLiquidityHistoryObservation[];
    metrics: GlobalLiquidityMetrics;
  };
}
```

### 3.2 新增 API 函数

```typescript
getGlobalLiquidity: async (): Promise<GlobalLiquidityResponse> => {
  return cachedFetch('global-liquidity', async () => {
    const response = await fetch(`${API_BASE_URL}/liquidity/global`);
    // ...
  });
}

getGlobalLiquidityHistory: async (days = 365): Promise<GlobalLiquidityHistoryResponse> => {
  return cachedFetch(`global-liquidity-history-${days}`, async () => {
    const response = await fetch(`${API_BASE_URL}/liquidity/global/history?days=${days}`);
    // ...
  });
}
```

---

## Step 4: 前端 — 页面重构 (3 Tab → 2 Tab)

**文件**: `frontend/src/app/macro/liquidity/page.tsx`

### 4.1 Tab 结构改动

```
之前:
  Tab 1: 净流动性     (net_liquidity)
  Tab 2: 资产负债表   (balance_sheet)
  Tab 3: 金融条件     (financial_conditions)

之后:
  Tab 1: 美国流动性   (us_liquidity)      ← 合并原 Tab 1+2+3
  Tab 2: 全球流动性   (global_liquidity)   ← 全新
```

### 4.2 TAB_META 重写

```typescript
type TabId = 'us_liquidity' | 'global_liquidity';

const TAB_ORDER: TabId[] = ['us_liquidity', 'global_liquidity'];

const TAB_META = {
  us_liquidity: {
    name: '美国流动性',
    number: '01',
    subtitle: '净流动性 / 资产负债表 / 金融条件',
    primaryKey: 'net_liquidity',
    secondaryKey: 'sofr',
    // ...
  },
  global_liquidity: {
    name: '全球流动性',
    number: '02',
    subtitle: '全球 M2 / 主要央行资产负债表',
    primaryKey: 'global_m2',    // 来自 GlobalLiquidityMetrics
    secondaryKey: 'us_m2',
    // ...
  },
};
```

### 4.3 Hero Cards: 3 个 → 2 个

Grid 从 `grid-cols-3` 改为 `grid-cols-2`，每个 card 显示对应 tab 的主要指标。

### 4.4 Tab 1 "美国流动性" Deep Dive (`USLiquidityDeepDive`)

合并现有三个 Deep Dive 为一个连续页面，按以下顺序排列：

```
1. InsightBanner (AI 周报解读 — 现有)
2. 教育 Banner: 净流动性公式说明 (现有 NetLiquidityDeepDive 的 banner)
3. 分解卡片: Net Liquidity / WALCL / TGA / RRP (现有 4 列)
4. NetLiquidityChart 历史图 (现有 lightweight-charts)
5. 资产负债表面板: WALCL / TGA / RRP / Reserves (现有 TradingView 4 面板)
6. 金融条件: NFCI Gauge + NFCI TradingView 图 (现有)
7. SOFR / EFFR 面板 (现有)
```

本质上是把原来 3 个 tab 的内容纵向拼接，无需新增组件。

### 4.5 Tab 2 "全球流动性" Deep Dive (`GlobalLiquidityDeepDive`)

全新内容：

```
1. 教育 Banner: 全球 M2 = 各国广义货币美元加总
2. Global M2 总量卡片 (emerald 高亮) + 同比变化
3. 各国 M2 分解卡片 (4 列: US / China / Euro / Japan)
4. Global M2 历史趋势图 (lightweight-charts，复用 NetLiquidityChart 模式)
5. 央行资产负债表面板:
   - ECB 总资产 (TradingView: FRED:ECBASSETSW)
   - BOJ 总资产 (TradingView: FRED:JPNASSETS)
6. M2 YoY 增长率面板 (TradingView: FRED:M2SL, units=pc1)
```

### 4.6 数据加载策略

- Tab 1 数据: 页面加载时立即获取 (现有 `fetchData()` 不变)
- Tab 2 数据: **切换到 Tab 2 时才加载** (独立 useEffect + 条件触发)
- TradingView 图表: Tab 2 选中时才渲染 (避免初始加载多余 iframe)

```typescript
// Tab 2 独立加载
useEffect(() => {
  if (selectedTab === 'global_liquidity' && !globalData) {
    fetchGlobalData();
  }
}, [selectedTab]);
```

---

## Step 5: 测试验证

### 5.1 后端测试

| 测试项 | 说明 |
|--------|------|
| Global M2 汇率转换 | 验证 CNY/EUR/JPY → USD 转换正确 |
| 缺失数据降级 | 模拟某国数据失败，验证 partial 标记 |
| 缓存读写 | 验证 try_db_cache → _safe_set 路径 |
| API 端点 | `/api/liquidity/global` 返回正确结构 |

```bash
cd backend && source venv/bin/activate
pytest tests/test_global_liquidity.py -v
```

### 5.2 前端验证

```bash
cd frontend && npm run build && npm run lint
```

### 5.3 浏览器验证 (Chrome DevTools MCP)

1. 访问 `/macro/liquidity` — 验证 2 Tab 布局
2. Tab 1 点击 — 确认美国流动性内容完整 (原 3 tab 内容合并)
3. Tab 2 点击 — 确认全球流动性加载 + 图表渲染
4. Tab 切换 — 确认数据不重复请求

### 5.4 后端 E2E

```bash
cd backend && pytest
```

---

## 关键文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/app/features/liquidity/global_service.py` | **新建** | 全球流动性数据获取 + M2 计算 |
| `backend/app/features/liquidity/router.py` | 修改 | 新增 2 个 API 端点 |
| `backend/app/features/macro_cache/refresher.py` | 修改 | T2 新增全球流动性缓存刷新 |
| `frontend/src/lib/api.ts` | 修改 | 新增类型 + API 调用函数 |
| `frontend/src/app/macro/liquidity/page.tsx` | 修改 | 3 Tab → 2 Tab 重构 |
| `backend/tests/test_global_liquidity.py` | **新建** | 后端单元测试 |

---

## 实施顺序

```
Step 1: global_service.py (后端数据层)
   ↓
Step 2: router.py + refresher.py (后端 API + 缓存)
   ↓
Step 3: api.ts (前端类型 + API)
   ↓
Step 4: page.tsx (前端页面重构)
   ↓
Step 5: 测试验证
```

每步完成后独立验证，确保不引入回归问题。
