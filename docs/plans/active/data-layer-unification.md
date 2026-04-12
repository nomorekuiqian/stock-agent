# 数据层统一重构计划

> 创建日期：2026-04-11
> 状态：待执行
> 预估：3-4 天（5 个 Phase，每个 Phase 独立可验证）

---

## 目标

将分散在 `fmp_service` / `yfinance_service` / `openbb_service` 三个服务中的金融数据调用，统一收敛到 `data_tools/` 层。淘汰 OpenBB SDK，使 Agent、Router、Service 都通过同一入口获取数据。

**核心原则**：`data_tools/` 是唯一的数据消费入口，底层服务文件（`fmp_service.py`、`yfinance_service.py`）只被 `data_tools/` 内部调用。

---

## 关键决策：淘汰 OpenBB SDK

### 背景

项目安装了 40+ 个 OpenBB provider 包（yfinance, polygon, tiingo, intrinio, sec, fred, benzinga 等），但实际只使用了 `openbb_fmp` 一个 provider，7 个方法全部硬编码 `provider="fmp"`。之前的 `openbb-integration.md` 规划了 200+ 端点的扩展路线图（M1-M5），但从未执行。

### 淘汰理由

1. **两层抽象是冗余的**：`data_tools/` 已经是项目的统一数据抽象层，OpenBB 在中间只增加了复杂度而没增加能力。`data_tools/` 本身就能实现 provider 切换（改底层 service 调用即可）。

2. **依赖冲突是真实痛点**：2026-03-04 已遇到 `google-adk` (>=1.20.0 要求 aiosqlite>=0.21.0) 与 `openbb-econdb` (要求 aiosqlite<0.21.0) 的版本冲突。随着两个库各自升级，这类冲突会更频繁。`google-adk` 是 Agent 核心，不能为了 OpenBB 牺牲。

3. **包体积大**：40+ 个 provider 包显著增加 Docker 镜像体积和冷启动时间，但只用了 1 个。

4. **同步 SDK 需要 executor 包装**：OpenBB SDK 是同步的，每次调用都要 `asyncio.to_thread()` 包装，增加了 async 代码复杂度。FMP 直调用 httpx 同样简洁且更可控。

5. **半年实践证明了非必要性**：项目运行至今，yfinance 直调比走 OpenBB 更快，FMP 直调比走 OpenBB 更可控。OpenBB 的多 provider 切换能力从未被使用。

### 未来数据源扩展方案（不需要 OpenBB）

Roadmap Phase 3-4 需要 SEC 财报、FRED 宏观等新数据源。在 `data_tools/` 架构下按需添加：

```
data_tools/
|-- filings.py     [Phase 3] <-- SEC 10-K/10-Q (用 sec-api 或 FMP /stable/sec-filings)
|-- macro.py       [Phase 3] <-- FRED 经济指标 (用 fredapi，已在依赖中)
|-- options.py     [Phase 4] <-- 期权异动 (FMP /stable/options 或 CBOE 直调)
|-- holdings.py    [Phase 4] <-- 机构持仓 (FMP /stable/institutional-holder)
```

每个新模块 50-100 行代码，完全可控，好调试，无依赖冲突风险。比通过 OpenBB 绕一层更直接。

---

## 现状问题

### 同一数据多条路径

| 数据 | 路径 1 | 路径 2 | 路径 3 |
|------|--------|--------|--------|
| 实时报价 | `yfinance` via `data_tools/market_data.py` | `fmp.get_stock_quotes()` via `brew/agent.py` | `openbb.get_realtime_quote()` via `stock/service.py` |
| 估值指标 | `fmp.get_key_metrics_ttm()` via `stock/service.py` | `openbb.get_key_metrics()` via `stock/service.py` | `yfinance.get_ticker_metrics()` via `stock/service.py` |
| 公司档案 | `openbb.get_company_profile()` via `stock/service.py` | - | - |
| 财务报表 | `openbb.get_income/balance/cash()` via `stock/service.py` | - | - |
| 同业对比 | `fmp.get_stock_peers()` via `stock/service.py` | `fmp.get_industry_peers()` via `stock/service.py` | - |
| 国债收益率 | `fmp` via `data_tools/market_data.py` | `fmp` via `macro/risk/service.py` 直调 | `fmp` via `macro/cache/refresher.py` 直调 |

### OpenBB 冗余

所有 OpenBB 调用都指定 `provider="fmp"`，本质是 FMP 的封装层。增加了一层依赖（openbb SDK 很重）但没增加数据来源。

### 消费者绕过 data_tools 直调服务

| 消费者 | 直接调用的服务 | 应该走 data_tools |
|--------|--------------|------------------|
| `stock/service.py` | OpenBB (6 函数) + FMP (8 函数) + yfinance (1 函数) | fundamentals, peers, quotes |
| `stock/router.py` | FMP (`get_stock_peers`) + OpenBB (lazy import) | peers, fundamentals |
| `brew/agent.py` | FMP (`get_stock_quotes`) | quotes |
| `macro/risk/service.py` | FMP (`get_treasury_rates_with_change`, `get_commodity_quotes`) | market_overview |
| `macro/cache/refresher.py` | FMP (`get_treasury_rates_with_change`) | market_overview |
| `screener/research_tools.py` | yfinance (`get_ticker_metrics`) | fundamentals |

---

## 目标架构

```
data_tools/                          <-- Agent / Router / Service 唯一入口
|-- __init__.py                      <-- 统一导出
|-- quotes.py             [新建]     <-- 实时报价 (yfinance batch + FMP 单股)
|-- fundamentals.py        [新建]     <-- 公司档案 + 财报 + 估值 (FMP 直调，替代 OpenBB)
|-- peers.py               [新建]     <-- 同业对比 + 行业估值 (FMP)
|-- search.py              [新建]     <-- 股票搜索 (FMP)
|-- market_data.py         [保留]     <-- 宏观行情快照 (指数/债券/商品/汇率/盘前)
|-- technical.py           [保留]     <-- 技术分析 (TradingView + pandas-ta)
|-- news.py                [保留]     <-- 新闻 (FMP)
|-- earnings.py            [保留]     <-- 财报日历 (FMP)
|-- calendar.py            [保留]     <-- 经济日历 (FMP)

shared/
|-- fmp_service.py         [保留]     <-- 底层 FMP API wrapper，只被 data_tools 调用
|-- yfinance_service.py    [保留]     <-- 底层 yfinance wrapper，只被 data_tools 调用
|-- openbb_service.py      [Phase 4 删除]
```

### 数据源分工决策

| 数据类型 | 选择 | 理由 |
|---------|------|------|
| 实时报价 (单股/批量) | FMP | 统一数据源，一个缓存层，付费有保障，已有 batch-quote API |
| 公司档案 | FMP 直调 | 替代 OpenBB，减少依赖层 |
| 财务报表 (利润表/资产负债表/现金流) | FMP 直调 | 替代 OpenBB，相同 API 更少中间层 |
| 估值指标 (TTM) | FMP `ratios-ttm` + `key-metrics-ttm` | 已有，数据全面 |
| 基本面快照 (营收/EPS/分析师) | yfinance `Ticker.info` | 一次调用包含 50+ 字段 |
| 技术分析 | TradingView + pandas-ta | 已有，效果好，不变 |
| 新闻/日历/财报日历 | FMP | 已有，不变 |
| 国债/商品/指数 | FMP (国债/商品) + yfinance (指数) | 已有，不变 |
| 同业对比 | FMP | 已有，不变 |
| 股票搜索 | FMP | 已有，不变 |

---

## 执行计划

### Phase 1：新建 data_tools 模块（纯增量，零风险）

> 只新建文件，不修改任何现有代码。所有新模块都可以独立测试。

#### 1.1 新建 `data_tools/quotes.py`

封装统一的报价接口，底层统一走 FMP。

```python
def get_batch_quotes(symbols: list[str]) -> dict:
    """批量获取实时报价 (价格、涨跌幅、前收)
    底层: fmp_service.get_stock_quotes() (已有 batch-quote + 10 分钟缓存)
    """

def get_stock_detail_quotes(symbols: list[str], max_symbols: int = 20) -> dict:
    """获取带趋势的详细报价 (含周/月涨跌、技术位、PE/市值)
    底层: 现有 market_data.get_stock_quotes() 的逻辑迁移过来
    用途: 专属日报 (brew)、持仓展示
    """
```

**实现要点**：
- `get_batch_quotes` 统一委托 `fmp_service.get_stock_quotes()`，一个缓存层
- `get_stock_detail_quotes` 从 `market_data.py` 的 `get_stock_quotes()` 提取
- **返回格式待确认**：实施时先读 brew/agent.py 和 stock/service.py 的实际调用代码，确认它们怎么使用返回值，再设计兼容的格式

#### 1.2 新建 `data_tools/fundamentals.py`

替代 OpenBB 的所有调用，直接用 FMP API。

```python
# 公开函数签名

def get_company_profile(symbol: str) -> dict:
    """公司档案: 名称、行业、描述、CEO、员工数、上市日期
    底层: FMP /stable/profile (新增到 fmp_service)
    替代: openbb.get_company_profile()
    """

def get_income_statements(symbol: str, limit: int = 8, period: str = "quarter") -> list[dict]:
    """利润表: 营收、毛利、营业利润、净利润、EPS、EBITDA
    底层: FMP /stable/income-statement (新增到 fmp_service)
    替代: openbb.get_income_statements()
    """

def get_balance_sheets(symbol: str, limit: int = 8, period: str = "quarter") -> list[dict]:
    """资产负债表: 总资产、总负债、股东权益、现金、债务
    底层: FMP /stable/balance-sheet-statement (新增到 fmp_service)
    替代: openbb.get_balance_sheets()
    """

def get_cash_flows(symbol: str, limit: int = 8, period: str = "quarter") -> list[dict]:
    """现金流量表: 经营/投资/融资现金流、自由现金流、资本支出
    底层: FMP /stable/cash-flow-statement (新增到 fmp_service)
    替代: openbb.get_cash_flows()
    """

def get_key_metrics_ttm(symbol: str) -> dict:
    """TTM 估值指标: PE/PB/PS/PEG/EV-EBITDA/ROE/ROA/利润率
    底层: 复用 fmp_service.get_key_metrics_ttm() (已有)
    """

def get_historical_metrics(symbol: str, period: str = "annual", limit: int = 20) -> list[dict]:
    """历史估值指标 (年度/季度): 用于趋势分析
    底层: 复用 fmp_service.get_historical_key_metrics() (已有)
    """

def get_ticker_snapshot(symbol: str) -> dict:
    """基本面快照: 营收/EPS/市值/分析师评级 (一次调用)
    底层: 复用 yfinance_service.get_ticker_metrics() (已有)
    用途: Research Agent 的 get_stock_fundamentals 工具
    """
```

**实现要点**：
- `get_company_profile` / `get_income_statements` / `get_balance_sheets` / `get_cash_flows`：需要在 `fmp_service.py` 新增对应的 FMP 直调方法（`/stable/profile`、`/stable/income-statement`、`/stable/balance-sheet-statement`、`/stable/cash-flow-statement`），序列化格式与 OpenBB 输出保持兼容
- `get_key_metrics_ttm` / `get_historical_metrics`：直接委托给已有的 `fmp_service` 方法
- `get_ticker_snapshot`：直接委托给已有的 `yfinance_service.get_ticker_metrics()`

#### 1.3 新建 `data_tools/peers.py`

```python
def get_peer_companies(symbol: str, industry: str = None, limit: int = 10) -> dict:
    """获取同业公司列表
    底层: fmp_service.get_industry_peers() (优先) / get_stock_peers() (fallback)
    """

def get_peer_valuation(symbol: str, peer_symbols: list[str]) -> dict:
    """同业估值对比: 目标公司 vs 同行的 PE/PB/PS/EV-EBITDA
    底层: fmp_service.get_key_metrics_ttm() (批量调用)
    """

def get_industry_valuation(industry: str = None, sector: str = None) -> dict:
    """行业/板块平均估值
    底层: fmp_service.get_industry_pe() / get_sector_pe()
    """
```

#### 1.4 新建 `data_tools/search.py`

```python
def search_stocks(query: str, limit: int = 10) -> dict:
    """股票搜索 (symbol/名称模糊匹配)
    底层: fmp_service.search_stocks() (已有)
    """
```

#### 1.5 在 `fmp_service.py` 新增财报直调方法

替代 OpenBB 的核心。需要新增 4 个方法：

```python
def get_company_profile(self, symbol: str) -> dict:
    """FMP /stable/profile/{symbol}"""

def get_income_statement(self, symbol: str, period: str = "quarter", limit: int = 8) -> list:
    """FMP /stable/income-statement/{symbol}"""

def get_balance_sheet(self, symbol: str, period: str = "quarter", limit: int = 8) -> list:
    """FMP /stable/balance-sheet-statement/{symbol}"""

def get_cash_flow_statement(self, symbol: str, period: str = "quarter", limit: int = 8) -> list:
    """FMP /stable/cash-flow-statement/{symbol}"""
```

**关键 — 序列化策略**：从 `openbb_service.py` 直接复制 `_serialize_income()`、`_serialize_balance()`、`_serialize_cash_flow()`、`_serialize_ratios()` 方法到 `fmp_service.py`，只把输入从 OpenBB 对象的 `getattr(item, ...)` 改成 FMP JSON 的 `item.get(...)`。字段名和结构保持完全一���，下游代码零改动��

#### 1.6 在 `market_data.py` 新增独立方法（从 Phase 3 提前）

为 Phase 2d/2e 提前准备：
```python
def get_treasury_rates() -> dict:
    """单独获取国债收益率 (从 get_all_market_data 内部逻辑提取)
    底层: fmp_service.get_treasury_rates_with_change()
    """

def get_commodity_quotes() -> dict:
    """单独获取商品报价
    底层: fmp_service.get_commodity_quotes()
    """
```
纯新增函数，不影响现有的 `get_all_market_data()`。

#### Phase 1 验证

```bash
# 1. 单元测试 — 新模块能正常调用
python -c "
from app.shared.data_tools.quotes import get_batch_quotes
from app.shared.data_tools.fundamentals import get_company_profile, get_income_statements
from app.shared.data_tools.peers import get_peer_companies
from app.shared.data_tools.search import search_stocks
print('All imports OK')
"

# 2. 数据格式兼容测试 — 新 FMP 直调 vs 旧 OpenBB 输出
python -c "
from app.shared.data_tools.fundamentals import get_company_profile, get_income_statements
from app.shared.openbb_service import get_openbb_service
openbb = get_openbb_service()

# 对比 AAPL 的 profile
new = get_company_profile('AAPL')
old = openbb.get_company_profile('AAPL')
# 检查关键字段都存在: name, sector, industry, description, ceo
for key in ['name', 'sector', 'industry', 'description']:
    assert key in new, f'Missing {key} in new profile'
    
# 对比 income statement
new_inc = get_income_statements('AAPL', limit=4)
old_inc = openbb.get_income_statements('AAPL', limit=4)
assert len(new_inc) == len(old_inc), f'Count mismatch: {len(new_inc)} vs {len(old_inc)}'
for key in ['revenue', 'net_income', 'eps_diluted', 'ebitda']:
    assert key in new_inc[0], f'Missing {key} in new income'
print('Format compatibility OK')
"

# 3. 现有功能不受影响 — 跑现有测试
cd backend && pytest tests/ -v --timeout=60
```

---

### Phase 2：迁移消费者（逐文件替换，每文件独立可回滚）

> 每个子步骤只改一个文件，改完立即验证。

#### 2a: `brew/agent.py` — 报价迁移

**当前**（第 28, 303 行）：
```python
from app.shared.fmp_service import get_fmp_service
# ...
fmp = get_fmp_service()
quotes_result = fmp.get_stock_quotes(symbols)
```

**改为**：
```python
from app.shared.data_tools.quotes import get_batch_quotes
# ...
quotes_result = get_batch_quotes(symbols)
```

**验证**：
```bash
# 生成一份测试用的 brew digest，对比内容
curl -X POST http://localhost:8000/api/brew/digest \
  -H "Authorization: Bearer $TOKEN" | python -m json.tool
# 确认 quotes 数据结构正常、价格数值合理
```

#### 2b: `stock/service.py` — OpenBB 迁移（最大改动）

**当前**（第 25, 165, 246, 290-292 行）：
```python
from app.shared.openbb_service import get_openbb_service
self.openbb = get_openbb_service()
# ...
quote = await asyncio.to_thread(self.openbb.get_realtime_quote, symbol)
profile = await asyncio.to_thread(self.openbb.get_company_profile, symbol)
income, balance, cash = await asyncio.gather(
    asyncio.to_thread(self.openbb.get_income_statements, symbol),
    asyncio.to_thread(self.openbb.get_balance_sheets, symbol),
    asyncio.to_thread(self.openbb.get_cash_flows, symbol),
)
```

**改为**：
```python
from app.shared.data_tools.fundamentals import (
    get_company_profile, get_income_statements, 
    get_balance_sheets, get_cash_flows, get_key_metrics_ttm,
)
from app.shared.data_tools.quotes import get_batch_quotes
# ...
quote_result = await asyncio.to_thread(get_batch_quotes, [symbol])
quote = quote_result["quotes"].get(symbol, {})
profile = await asyncio.to_thread(get_company_profile, symbol)
income, balance, cash = await asyncio.gather(
    asyncio.to_thread(get_income_statements, symbol),
    asyncio.to_thread(get_balance_sheets, symbol),
    asyncio.to_thread(get_cash_flows, symbol),
)
```

**同时迁移 FMP 直调**（第 486-588 行，同业对比部分）：
```python
# 当前
self.fmp.get_industry_peers(industry)
self.fmp.get_stock_peers(symbol)
self.fmp.get_key_metrics_ttm(symbol)
self.fmp.get_industry_pe()
self.fmp.get_sector_pe()
self.fmp.get_historical_key_metrics(symbol)

# 改为
from app.shared.data_tools.peers import get_peer_companies, get_peer_valuation, get_industry_valuation
from app.shared.data_tools.fundamentals import get_key_metrics_ttm, get_historical_metrics
```

**验证**：
```bash
# 个股分析 — 核心功能
curl http://localhost:8000/api/stocks/AAPL/analysis | python -m json.tool
curl http://localhost:8000/api/stocks/NVDA/analysis | python -m json.tool
# 检查: profile 有数据、financials 4 季度、peer comparison 有公司、valuation 有指标

# 公司详情
curl http://localhost:8000/api/stocks/AAPL/company-details | python -m json.tool

# 财报数据
curl http://localhost:8000/api/stocks/AAPL/financials | python -m json.tool
```

#### 2c: `stock/router.py` — 消除直调

**当前**（第 14-15 行，第 229, 670 行）：
```python
from app.shared.fmp_service import get_fmp_service       # peers
from app.shared.yfinance_service import get_yfinance_service  # 未使用?
# line 229: openbb lazy import for /company-details
# line 670: fmp.get_stock_peers() for competitor news
```

**改为**：
```python
from app.shared.data_tools.peers import get_peer_companies
from app.shared.data_tools.fundamentals import get_company_profile
# line 670: get_peer_companies(symbol)
```

**验证**：
```bash
# stock router 的所有端点
curl http://localhost:8000/api/stocks/search?q=apple
curl http://localhost:8000/api/stocks/AAPL/company-details
curl http://localhost:8000/api/stocks/AAPL/financials
curl http://localhost:8000/api/stocks/AAPL/technical
curl http://localhost:8000/api/stocks/AAPL/news
```

#### 2d: `macro/risk/service.py` — 宏观直调迁移

**当前**（第 30-31 行，第 1385, 1409 行）：
```python
from app.shared.fmp_service import get_fmp_service
from app.shared.yfinance_service import get_yfinance_service
# ...
fmp.get_treasury_rates_with_change()
fmp.get_commodity_quotes()
```

**改为**：
```python
from app.shared.data_tools.market_data import get_all_market_data
# 或者从 market_data 中提取独立的 get_treasury_rates() / get_commodity_quotes() 
# 如果 risk service 只需要部分数据，在 market_data.py 中新增轻量方法
```

**注意**：`macro/risk/service.py` 有 timeout 包装逻辑。迁移时保留 timeout 行为，只换数据来源。

**验证**：
```bash
curl http://localhost:8000/api/macro/risk/dashboard | python -m json.tool
# 检查: treasury rates、commodity prices 存在且数值合理
```

#### 2e: `macro/cache/refresher.py` — 缓存刷新迁移

**当前**（第 126-128 行）：
```python
from app.shared.fmp_service import get_fmp_service
fmp.get_treasury_rates_with_change()
```

**改为**：
```python
from app.shared.data_tools.market_data import get_treasury_rates
# 需要在 market_data.py 中提取/暴露 treasury rates 单独方法
```

**验证**：
```bash
# 触发缓存刷新
curl -X POST http://localhost:8000/api/macro/cache/refresh \
  -H "X-Cron-Secret: $CRON_SECRET"
```

#### 2f: `screener/research_tools.py` — yfinance 迁移

**当前**（第 195 行）：
```python
from app.shared.yfinance_service import get_yfinance_service
service.get_ticker_metrics(symbol)
```

**改为**：
```python
from app.shared.data_tools.fundamentals import get_ticker_snapshot
```

**验证**：
```bash
# Research Agent 调用 fundamentals 工具
# 在 /research 页面问 "AAPL 的 PE 是多少"
```

#### Phase 2 完整验证

```bash
# 1. 后端测试套件
cd backend && pytest tests/ -v --timeout=60

# 2. 全量 API 端点冒烟测试
python -c "
import httpx, json
base = 'http://localhost:8000/api'
endpoints = [
    '/stocks/search?q=nvidia',
    '/stocks/AAPL/company-details',
    '/stocks/AAPL/financials', 
    '/stocks/AAPL/technical',
    '/stocks/AAPL/news',
    '/macro/risk/dashboard',
]
for ep in endpoints:
    r = httpx.get(f'{base}{ep}', timeout=30)
    status = 'OK' if r.status_code == 200 else f'FAIL({r.status_code})'
    print(f'{status} {ep}')
"

# 3. Agent 生成测试 (需要 AI API key)
cd backend && pytest tests/ -v --run-generate --timeout=120

# 4. 前端 E2E (需要后端运行)
cd frontend && npm run test:e2e
```

---

### Phase 3：清理 `market_data.py` 内部结构

> `market_data.py` 目前承载了宏观行情 + 个股报价 + 盘前数据，拆分后更清晰。

#### 3.1 从 `market_data.py` 提取到 `quotes.py`

将 `market_data.get_stock_quotes()` 的逻辑迁移到 `quotes.get_stock_detail_quotes()`。
`market_data.py` 中保留 thin wrapper 调用 `quotes.py`（向后兼容 `__init__.py` 导出）。

#### 3.2 从 `market_data.py` 暴露子方法

为 `macro/risk/service.py` 和 `macro/cache/refresher.py` 暴露：
```python
def get_treasury_rates() -> dict:
    """单独获取国债收益率（从 get_all_market_data 提取）"""

def get_commodity_quotes() -> dict:
    """单独获取商品报价（从 get_all_market_data 提取）"""
```

#### 3.3 更新 `__init__.py` 导出

```python
# 新增导出
from app.shared.data_tools.quotes import get_batch_quotes, get_stock_detail_quotes
from app.shared.data_tools.fundamentals import (
    get_company_profile, get_income_statements, get_balance_sheets,
    get_cash_flows, get_key_metrics_ttm, get_historical_metrics, get_ticker_snapshot,
)
from app.shared.data_tools.peers import get_peer_companies, get_peer_valuation, get_industry_valuation
from app.shared.data_tools.search import search_stocks
```

#### Phase 3 验证

同 Phase 2 完整验证。

---

### Phase 4：删除 OpenBB 依赖

> 此时所有消费者已经不再 import openbb_service。这是收益最大的一步——移除 40+ 个包。

#### 4.1 确认无引用

```bash
cd backend
grep -r "openbb_service" app/features/ app/shared/data_tools/
grep -r "openbb" app/features/ app/shared/data_tools/ --include="*.py"
# 预期: 0 结果 (services/stock_service.py 是死代码，忽略)
```

#### 4.2 删除文件

```bash
rm backend/app/shared/openbb_service.py
# 同时清理死代码（避免断裂的 import 链）
rm backend/app/services/stock_service.py
rm backend/app/services/openbb_service.py  # 如果存在
```

#### 4.3 移除依赖

```bash
# 从 requirements.txt 中移除以下行:
#   openbb>=4.0.0
#   openbb-fmp>=1.0.0
# 以及所有 openbb-* 相关的包

# 清理虚拟环境
pip uninstall openbb openbb-fmp openbb-core -y
# (pip 会自动提示卸载关联的 40+ openbb-* 包)

# 重新安装确认无遗漏依赖
pip install -r requirements.txt
```

#### 4.4 验证 aiosqlite 冲突解除

```bash
# 确认 google-adk 的 aiosqlite 依赖不再冲突
pip check | grep -i "aiosqlite\|openbb\|google-adk"
# 预期: 无冲突输出
```

#### Phase 4 验证

```bash
# 确认启动不报错
cd backend && python -c "from app.main import app; print('OK')"

# 全量测试
pytest tests/ -v --timeout=60

# 确认 Docker 构建 (如果适用)
# docker build -t stock-agent-test .
```

---

### Phase 5：验证与文档更新

#### 5.1 依赖图检查

```bash
# 确认 fmp_service / yfinance_service 只被 data_tools 导入
cd backend
grep -r "fmp_service" app/features/ --include="*.py"
grep -r "yfinance_service" app/features/ --include="*.py"
# 预期: 0 结果（所有 feature 模块只 import data_tools）
```

#### 5.3 全链路回归测试（Phase 5 最终验证）

全部 Phase 完成后，一次性验证所有功能。

**自动化测试**：
```bash
# 后端测试
cd backend && pytest tests/ -v
# 预期: 结果 >= 基线

# 前端单元测试
cd frontend && npm test
# 预期: 结果 >= 基线

# 前端 E2E
cd frontend && npm run test:e2e
# 预期: 结果 >= 基线
```

**API 冒烟测试脚本**（需要后端运行在 localhost:8000）：
```bash
cd backend && python -c "
import httpx
base = 'http://localhost:8000/api'
tests = [
    ('GET',  '/stocks/search?q=nvidia'),
    ('GET',  '/stocks/AAPL/company-details'),
    ('GET',  '/stocks/AAPL/financials'),
    ('GET',  '/stocks/AAPL/technical'),
    ('GET',  '/stocks/AAPL/news'),
    ('GET',  '/macro/risk/dashboard'),
]
passed, failed = 0, 0
for method, ep in tests:
    try:
        r = httpx.request(method, f'{base}{ep}', timeout=30)
        if r.status_code == 200:
            passed += 1
            print(f'  OK   {method} {ep}')
        else:
            failed += 1
            print(f'  FAIL {method} {ep} -> {r.status_code}')
    except Exception as e:
        failed += 1
        print(f'  ERR  {method} {ep} -> {e}')
print(f'\n{passed}/{passed+failed} passed')
assert failed == 0, f'{failed} endpoints failed'
"
```

**需要认证的端点**（手动用测试账号验证）：
| 功能 | 验证方法 | 预期 |
|------|---------|------|
| 专属日报 | 登录后访问 /for-you | 能看到持仓分析 |
| Research Agent | 在 /research 问 "NVDA 现在多少钱" | Agent 调用 quotes 工具返回价格 |
| Research Agent | 在 /research 问 "AAPL 的 PE 是多少" | Agent 调用 fundamentals 工具返回数据 |

**Cron 端点**（生产环境由 GitHub Actions 触发，本地手动测试）：
| 功能 | 验证方法 | 预期 |
|------|---------|------|
| 日报生成 | `POST /api/report/send` + cron header | 生成完整日报 |
| 早报生成 | `POST /api/morning/send` + cron header | 生成完整早报 |

#### 5.4 文档更新

- [ ] 更新 `backend/app/shared/.context.md` — 反映新的 data_tools 结构
- [ ] 更新 `backend/app/shared/data_tools/.context.md`（如果有）
- [ ] 更新 `CLAUDE.md` 架构概览 — 数据流描述
- [ ] 删除 `docs/technical/openbb-integration.md`（已淘汰，git 里有历史）

---

## 风险控制

### 回滚策略

每个 Phase 独立提交，出问题 `git revert` 单个 commit 即可。

| Phase | 风险等级 | 回滚方式 |
|-------|---------|---------|
| Phase 1 | 零 (纯增量) | 删除新文件 |
| Phase 2a-f | 低 (逐文件) | revert 单个 commit |
| Phase 3 | 低 (内部重组) | revert 单个 commit |
| Phase 4 | 中 (删除依赖) | 在 Phase 2 全部验证通过后才执行 |
| Phase 5 | 零 (文档) | 无需回滚 |

### 格式兼容保障

Phase 1 中最关键的一步是确保 `fundamentals.py` 的输出格式与 OpenBB 兼容。具体来说：

**OpenBB income statement 输出的关键字段**：
```python
{
    "date": "2024-09-28",
    "fiscal_year": "2024", "fiscal_period": "Q4",
    "revenue": 94930000000,
    "gross_profit": 43879000000, "gross_margin": 0.462,
    "operating_income": 29592000000, "operating_margin": 0.312,
    "net_income": 14736000000, "net_margin": 0.155,
    "eps": 0.97, "eps_diluted": 0.97,
    "ebitda": 32502000000,
    "research_and_development": 7766000000,
}
```

新的 FMP 直调必须输出**完全相同的字段名和结构**，通过 Phase 1 的格式兼容测试验证。

### 不触碰的区域

- `services/stock_service.py` — 死代码，按 CLAUDE.md 规则忽略
- `data_tools/technical.py` — TradingView + pandas-ta 逻辑成熟，不动
- `data_tools/news.py` / `earnings.py` / `calendar.py` — 已经是正确架构（通过 data_tools 调 fmp），不动
- 所有缓存 TTL — 保持现有的 10-30 分钟策略不变
- 前端代码 — 此次重构纯后端，前端 API contract 不变

---

## 重构后架构图

```
消费者层 (全部只 import data_tools)
┌─────────────┬──────────────────┬───────────────────┐
│ Research     │ 日报/早报/专属    │  API Router        │
│ Agent        │ Agent            │  (stock/macro/..)  │
└──────┬──────┴────────┬─────────┴─────────┬─────────┘
       │               │                   │
       ▼               ▼                   ▼
┌──────────────────────────────────────────────────────┐
│                   data_tools/                         │
│                                                      │
│  现有模块:                                            │
│  quotes | fundamentals | peers | search              │
│  market_data | technical | news | earnings | calendar│
│                                                      │
│  未来扩展 (按 Roadmap 需要时添加):                      │
│  filings (SEC) | macro (FRED) | options | holdings   │
└──────────────────────┬───────────────────────────────┘
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
    ┌──────────┐ ┌──────────┐ ┌──────────┐
    │   FMP    │ │ yfinance │ │tvscreener│
    │  Service │ │  Service │ │+ pandas  │
    └──────────┘ └──────────┘ └──────────┘
          │            │
          ▼            ▼
    FMP REST API   Yahoo Finance

    ✕ OpenBB SDK — 已淘汰 (40+ 包，仅用 1 个 provider，与 google-adk 冲突)
```

---

## 测试要求（Eng Review 补充）

### 第 1 层：序列化兼容测试（最重要）

文件：`tests/test_fmp_serialization_compat.py`

用真实的 FMP API 响应 JSON 作为 fixture，验证新的 `_serialize_income/_balance/_cash_flow` 输出的字段名和结构与 OpenBB 版本一致。这是回归护栏，防止个股分析数据缺失。

```python
# 测试逻辑示意
def test_serialize_income_matches_openbb_format():
    """用同一份 AAPL 数据，对比 FMP 直调序列化 vs OpenBB 序列化的输出"""
    fmp_raw = FIXTURE_FMP_INCOME_RESPONSE  # 真实 JSON
    result = fmp_service._serialize_income(fmp_raw)
    for key in ["revenue", "net_income", "eps_diluted", "ebitda", "gross_margin",
                "operating_margin", "net_margin", "fiscal_year", "fiscal_period"]:
        assert key in result, f"Missing field: {key}"
```

### 第 2 层：data_tools 委托测试

文件：`tests/test_data_tools_delegation.py`

mock fmp_service，验证 quotes/fundamentals/peers/search 正确委托：

```python
def test_get_batch_quotes_delegates_to_fmp():
    with patch("app.shared.data_tools.quotes.get_fmp_service") as mock:
        mock.return_value.get_stock_quotes.return_value = {"quotes": [...]}
        result = get_batch_quotes(["AAPL"])
        mock.return_value.get_stock_quotes.assert_called_once()
```

### 第 3 层：更新现有测试

- `test_stock_service_unit.py`：把 `mock openbb` 改成 `mock data_tools.fundamentals` / `mock data_tools.quotes`
- `test_architecture.py`：更新 `test_no_imports_from_dead_code` 以反映删除的文件

---

## NOT in scope（Eng Review 补充）

以下工作被明确排除出本次重构：

| 排除项 | 理由 |
|--------|------|
| yfinance 报价路径 | 已决定报价统一走 FMP，yfinance_service 保留仅供 get_ticker_snapshot 和 technical.py 使用 |
| data_tools/market_data.py 内部拆分 | 原 Phase 3.1 的 get_stock_quotes 提取已不需要（报价走 FMP），Phase 3 简化为只更新 __init__.py 导出 |
| 前端代码 | 纯后端重构，API contract 不变 |
| 缓存策略调整 | 保持现有 10-30 分钟 TTL |
| 新增数据源（SEC/FRED/期权） | Roadmap Phase 3-4 的工作，不在本次范围 |

---

## Eng Review 总结

- Step 0 Scope Challenge：保持全量 scope (15 文件)
- Architecture Review：5 个问题，5 个已解决
  1. Phase 顺序修复 → get_treasury_rates 提前到 Phase 1
  2. 返回格式 → 实施时先读消费者代码再定
  3. 序列化策略 → 复制 OpenBB 的 _serialize_* 方法
  4. 死代码清理 → Phase 4 一起删 services/stock_service.py
  5. 报价统一 FMP → quotes.py 只走 FMP，不做 yfinance 双路由
- Code Quality Review：1 个笔误已修正
- Test Review：3 层测试要求已添加
- Performance Review：确认保持 asyncio.gather 并行模式
