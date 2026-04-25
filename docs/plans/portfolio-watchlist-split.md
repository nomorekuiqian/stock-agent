# 持仓/观察列表拆分 Engineering Plan

> Status: Planning
> Related: features/brew/.context.md, frontend/src/app/for-you/.context.md
> Vision: 产品策略.md > 持仓日报 / /for-you 模块tui

## 目标

将当前 /for-you 页面的单一 watchlist 拆分为**观察列表 (Watchlist)** 和**真实持仓 (Portfolio)**，新增持仓市值计算、板块分布可视化，并预留截图导入持仓功能。

## 现状

### 当前数据结构

**user_watchlists 表**（Insforge Edge Function `user-watchlists`）:

```
user_id  TEXT (PK)
symbols  JSON ARRAY    -- ["AAPL", "NVDA", "TSLA"]
email    TEXT
updated_at TIMESTAMPTZ
```

- 只存股票代码列表，无股数/成本等信息
- watchlist 同时承担"关注"和"持仓"两个语义
- Digest 生成基于 watchlist symbols

### 当前前端结构

```
/for-you              -- 主仪表盘（展示 digest + watchlist 概览）
/for-you/watchlist    -- 编辑自选股（搜索 + StockCard 网格）
/for-you/archive      -- 摘要历史
/for-you/[id]         -- 历史摘要详情
```

### 当前组件

| 组件                  | 用途                                            |
| --------------------- | ----------------------------------------------- |
| `StockCard`           | 股票卡片（logo + 代码 + 价格 + 涨跌幅）         |
| `StockSearchDropdown` | 搜索下拉（cmdk）                                |
| `WatchlistPanel`      | 可复用的 watchlist 面板                         |
| `DigestInlineReport`  | 摘要内联渲染                                    |
| `ForYouContent`       | /for-you 主内容（onboarding / digest / 工具栏） |

## 设计

### 1. 数据模型变更

#### 新增 `user_portfolios` 表

```sql
CREATE TABLE user_portfolios (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     TEXT NOT NULL,
  symbol      TEXT NOT NULL,
  shares      NUMERIC(18,6) NOT NULL,  -- 支持小数股（Robinhood 等）
  cost_basis  NUMERIC(18,6),           -- 可选：买入均价（未来用）
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, symbol)
);
```

**字段说明**:

- `shares`: 持有股数，支持小数（fractional shares），精度 6 位小数
- `cost_basis`: 预留字段，暂时可为 NULL。未来可用于计算盈亏
- 按 `(user_id, symbol)` 去重，同一股票只有一条记录

**与 watchlist 的关系**: 完全独立。watchlist 保持现有结构不变（只存 symbols 数组），portfolio 是新表。

#### 现有 `user_watchlists` 表 — 不变

保持 `symbols: string[]` 结构，继续服务"观察列表"和 digest 生成。

### 2. Digest 生成逻辑调整

Digest 的 symbols 来源改为 **watchlist ∪ portfolio symbols**（去重）：

```python
watchlist_symbols = watchlist.get("symbols", [])
portfolio_symbols = [p["symbol"] for p in portfolio_holdings]
all_symbols = list(dict.fromkeys(watchlist_symbols + portfolio_symbols))  # 去重保序
```

这样两个列表都会被 digest 覆盖到。

### 3. API 设计

#### 新增端点（portfolio）

| 端点                      | 方法   | 描述                          | 认证   |
| ------------------------- | ------ | ----------------------------- | ------ |
| `/api/portfolio`          | GET    | 获取用户持仓列表              | Bearer |
| `/api/portfolio`          | PUT    | 批量保存/更新持仓             | Bearer |
| `/api/portfolio/{symbol}` | PATCH  | 更新单只股票股数              | Bearer |
| `/api/portfolio/{symbol}` | DELETE | 删除单只持仓                  | Bearer |
| `/api/portfolio/import`   | POST   | 截图导入持仓（AI 解析）       | Bearer |
| `/api/portfolio/summary`  | GET    | 持仓汇总（总市值 + 板块分布） | Bearer |

#### GET /api/portfolio 响应

```json
{
  "success": true,
  "data": {
    "holdings": [
      {
        "symbol": "AAPL",
        "shares": 50,
        "cost_basis": null,
        "updated_at": "2026-04-01T10:00:00Z"
      },
      {
        "symbol": "NVDA",
        "shares": 100,
        "cost_basis": null,
        "updated_at": "2026-04-01T10:00:00Z"
      }
    ],
    "updated_at": "2026-04-01T10:00:00Z"
  }
}
```

#### PUT /api/portfolio 请求（批量保存）

```json
{
  "holdings": [
    { "symbol": "AAPL", "shares": 50 },
    { "symbol": "NVDA", "shares": 100 },
    { "symbol": "TSLA", "shares": 25.5 }
  ]
}
```

#### GET /api/portfolio/summary 响应

```json
{
  "success": true,
  "data": {
    "total_value": 125680.5,
    "holdings": [
      {
        "symbol": "NVDA",
        "shares": 100,
        "price": 850.25,
        "market_value": 85025.0,
        "weight": 67.65,
        "daily_change_pct": 2.35,
        "sector": "Technology",
        "industry": "Semiconductors"
      }
    ],
    "sector_breakdown": [
      { "sector": "Technology", "value": 110500.0, "weight": 87.93 },
      { "sector": "Consumer Cyclical", "value": 15180.5, "weight": 12.07 }
    ],
    "as_of": "2026-04-01T16:00:00Z"
  }
}
```

#### POST /api/portfolio/import 请求（截图导入）

```
Content-Type: multipart/form-data
image: <截图文件>
```

响应:

```json
{
  "success": true,
  "data": {
    "parsed_holdings": [
      { "symbol": "AAPL", "shares": 50, "confidence": 0.95 },
      { "symbol": "NVDA", "shares": 100, "confidence": 0.92 }
    ],
    "warnings": ["无法识别第3行: 'SPX Put 4500' (疑似期权，已跳过)"],
    "source_detected": "robinhood"
  }
}
```

### 4. 前端页面结构

```
/for-you                    -- 主仪表盘（改版：Tab 切换 Portfolio/Watchlist）
/for-you/watchlist          -- 编辑观察列表（保持现有逻辑）
/for-you/portfolio          -- 编辑真实持仓（新页面）
/for-you/portfolio/import   -- 截图导入持仓（新页面）
/for-you/archive            -- 不变
/for-you/[id]               -- 不变
```

### 5. 前端 UI 设计

#### /for-you 主仪表盘改版

```
┌──────────────────────────────────────────────────────┐
│  MY BREW                                             │
│  持仓总览                                             │
│                                                      │
│  ┌──────────┐ ┌──────────┐                           │
│  │ 真实持仓  │ │ 观察列表  │          [管理持仓] [管理观察] │
│  └──────────┘ └──────────┘                           │
│                                                      │
│  ════════ 真实持仓 Tab ════════                       │
│                                                      │
│  ┌─────────────────────────────────────────────┐     │
│  │  总持仓价值                                    │     │
│  │  $125,680.50          +$2,340.20 (+1.89%)   │     │
│  │                                              │     │
│  │  ┌─────────┬─────────┬──────────┐           │     │
│  │  │Tech 88% │Cons 12% │          │  ← 板块条  │     │
│  │  └─────────┴─────────┴──────────┘           │     │
│  └─────────────────────────────────────────────┘     │
│                                                      │
│  ┌───────────────────────────────────────┐           │
│  │ NVDA  英伟达     100股   $85,025     67.6%│ → 点击跳 /stock/NVDA │
│  │ $850.25         +2.35%                    │           │
│  ├───────────────────────────────────────┤           │
│  │ AAPL  苹果       50股   $12,500      9.9% │           │
│  │ $250.00         -0.50%                    │           │
│  └───────────────────────────────────────┘           │
│                                                      │
│  [+ 添加持仓]  [📷 截图导入]                          │
│                                                      │
│  ════════ 观察列表 Tab ════════                       │
│  （与现有 /for-you 的 watchlist 展示类似）               │
│                                                      │
│  ════════ 今日摘要 ════════                           │
│  DigestInlineReport (合并 portfolio + watchlist)      │
└──────────────────────────────────────────────────────┘
```

#### 持仓卡片组件 (`PortfolioCard`)

与 `StockCard` 类似，但增加：

- 持有股数
- 持仓市值 = shares × price
- 占总持仓的百分比（weight）
- 点击跳转 `/stock/{symbol}`

#### 板块分布条 (`SectorBar`)

水平条形图，按板块占比着色：

- Technology → emerald
- Consumer → amber
- Healthcare → blue
- Finance → purple
- 其他 → gray

### 6. 截图导入功能设计

#### 技术方案

使用 **Gemini Vision** 解析券商截图：

```python
# backend/app/features/brew/import_service.py

import google.generativeai as genai

IMPORT_PROMPT = """
Analyze this brokerage portfolio screenshot and extract stock holdings.
For each stock, provide:
- symbol: US stock ticker (e.g., AAPL)
- shares: number of shares held (decimal ok)

Return JSON array. Skip options, bonds, cash, crypto.
If unsure about a symbol, set confidence < 0.8.
Identify the brokerage platform if possible (robinhood, schwab, fidelity, etc).
"""

async def parse_portfolio_screenshot(image_bytes: bytes) -> dict:
    model = genai.GenerativeModel("gemini-2.0-flash")
    response = await model.generate_content_async([IMPORT_PROMPT, image_bytes])
    # parse structured output...
```

**支持的券商截图**（按优先级）：

1. Robinhood（最常见，布局简单）
2. Schwab / Fidelity / Interactive Brokers
3. 通用表格格式

**用户流程**：

```
用户点击"截图导入"
  → 上传图片（拖拽或选择文件）
  → AI 解析 → 展示解析结果（可编辑确认）
  → 用户确认 → 批量写入 portfolio
```

#### 限制与安全

- 图片大小上限: 10MB
- 支持格式: PNG, JPG, WEBP
- 速率限制: 3 次/分钟（AI 调用成本）
- 解析结果需用户确认后才写入
- 不存储原始截图（隐私）

### 7. 板块/行业数据来源

`GET /api/portfolio/summary` 需要每只股票的 sector 和 industry：

**方案**: 使用 FMP API `GET /api/v3/profile/{symbol}`，已有 `shared/fmp_service.py`。

```python
# 已有的 FMP 数据包含 sector/industry
profile = await fmp.get_company_profile(symbol)
# profile["sector"] → "Technology"
# profile["industry"] → "Semiconductors"
```

**缓存策略**: 板块信息基本不变，可缓存 24h 甚至更久。建议在 `screener-universe-cache` Edge Function 中缓存，或新建简单内存缓存。

## 实施步骤

### Phase 1: 后端数据层（难度：低，~2天）

1. [ ] 创建 `user-portfolios` Edge Function（CRUD + 批量 upsert）
2. [ ] 新增 `backend/app/features/brew/portfolio_db.py`（调用 Edge Function）
3. [ ] 在 `router.py` 中新增 portfolio CRUD 端点（GET/PUT/PATCH/DELETE）
4. [ ] 新增 `GET /api/portfolio/summary` 端点（聚合市值 + 板块）
5. [ ] 修改 digest 生成逻辑，symbols 来源改为 watchlist ∪ portfolio
6. [ ] 新增 Pydantic 模型（PortfolioHolding, PortfolioSummary, SectorBreakdown）

### Phase 2: 前端持仓管理页面（难度：中，~3天）

7. [ ] 新增 `/for-you/portfolio/page.tsx`（持仓编辑页面：添加股票 + 输入股数）
8. [ ] 新增 `PortfolioCard` 组件（股数 + 市值 + 占比 + 点击跳转 /stock）
9. [ ] 新增 `SectorBar` 组件（水平板块占比条）
10. [ ] 新增 `PortfolioSummaryHeader` 组件（总市值 + 日涨跌 + 板块条）
11. [ ] 新增 TanStack Query hooks: `usePortfolio()`, `usePortfolioSummary()`, `useSavePortfolio()`

### Phase 3: /for-you 主页改版（难度：中，~2天）

12. [ ] 改版 `ForYouContent`：新增 Tab 切换（真实持仓 / 观察列表）
13. [ ] 持仓 Tab：展示 PortfolioSummaryHeader + PortfolioCard 列表
14. [ ] 观察列表 Tab：保持现有 StockCard 网格展示
15. [ ] 更新工具栏：[管理持仓] + [管理观察列表] 两个入口
16. [ ] Digest 生成按钮逻辑更新（合并两个列表的 symbols）

### Phase 4: 截图导入功能（难度：高，~3天）

17. [ ] 新增 `backend/app/features/brew/import_service.py`（Gemini Vision 解析）
18. [ ] 新增 `POST /api/portfolio/import` 端点（multipart 上传 + AI 解析）
19. [ ] 新增 `/for-you/portfolio/import/page.tsx`（上传 + 预览 + 确认 UI）
20. [ ] 导入结果编辑界面（修改股数 / 删除误识别项 / 确认提交）

### Phase 5: 测试与完善（~1天）

21. [ ] 后端 portfolio CRUD 单元测试
22. [ ] 后端 import 端点 E2E 测试（mock Gemini 响应）
23. [ ] 前端 portfolio 组件 Vitest 测试
24. [ ] 更新 `.context.md` 文档（brew、for-you）

## 资源与依赖

### 已有可复用

| 资源                | 位置                                 | 复用方式                 |
| ------------------- | ------------------------------------ | ------------------------ |
| StockCard 组件      | `components/StockCard.tsx`           | PortfolioCard 基础模板   |
| StockSearchDropdown | `components/StockSearchDropdown.tsx` | 持仓页添加股票搜索       |
| cmdk Command        | 已安装                               | 搜索交互                 |
| FMP company profile | `shared/fmp_service.py`              | 板块/行业数据            |
| Edge Function 模式  | `edge_functions/*.js`                | portfolio 表的 CRUD 模板 |
| InsforgeService     | `core/database.py`                   | 数据库调用               |
| useStockQuotes hook | `hooks/queries/`                     | 实时报价                 |
| useStockSearch hook | `hooks/`                             | 股票搜索                 |

### 新增依赖

| 依赖               | 用途             | 备注                          |
| ------------------ | ---------------- | ----------------------------- |
| Gemini Vision API  | 截图解析         | 需要 `GOOGLE_API_KEY`（已有） |
| `python-multipart` | FastAPI 文件上传 | 可能已安装，需确认            |

### 成本评估

| 项目                      | 成本                             |
| ------------------------- | -------------------------------- |
| FMP profile API           | 免费额度内（按 symbol 缓存 24h） |
| Gemini Vision（截图导入） | ~$0.002/次（gemini-2.0-flash）   |
| 额外数据库存储            | 极低（每用户几十行）             |

## 难度评估

| Phase               | 难度   | 原因                                                         |
| ------------------- | ------ | ------------------------------------------------------------ |
| Phase 1: 后端数据层 | **低** | 与现有 watchlist Edge Function 模式完全一致，套模板          |
| Phase 2: 前端持仓页 | **中** | 需要新的 PortfolioCard + 股数输入交互，但复用 StockCard 模式 |
| Phase 3: 主页改版   | **中** | Tab 切换 + 两个数据源合并，需要处理加载态                    |
| Phase 4: 截图导入   | **高** | AI 图片解析准确率不确定、多券商格式适配、文件上传流程        |
| Phase 5: 测试       | **低** | 按现有测试模式写                                             |

**总体难度**: 中等偏上。核心 CRUD 简单，截图导入是风险最高的部分。

**建议实施顺序**: Phase 1 → 2 → 3 → 5 → 4（截图导入放最后，可独立迭代）

## 待定问题

1. **持仓数据是否需要历史快照？** 当前设计只存最新持仓状态。如果未来需要"持仓变化曲线"，需要增加 `portfolio_snapshots` 表记录每日快照。建议 V1 不做，后续按需加。

2. **cost_basis 何时启用？** 预留了买入均价字段，但截图导入不一定能拿到。手动输入成本价的 UI 复杂度较高，建议 V1 只存 shares，后续版本加入成本/盈亏。

3. **Portfolio 和 Watchlist 是否允许重叠？** 建议允许——用户可能持有 AAPL 同时也在观察 AAPL。Digest 生成时做去重即可。

4. **截图导入的 AI 模型选择？** Gemini 2.0 Flash 有 vision 能力且成本低。备选: OpenAI GPT-4o（`OPENAI_API_KEY` 已有）。可以两个都试，选准确率高的。

5. **板块分类标准？** FMP 返回的 sector 是 GICS 标准（11 个大类）。是否需要自定义合并（如把 Communication Services 归入 Technology）？建议 V1 用原始 GICS，后续根据用户反馈调整。

6. **持仓上限？** 建议与 watchlist 一致，最多 50 只（持仓通常更集中，50 足够）。

7. **截图导入是否支持多张图片？** V1 建议只支持单张，后续可扩展到多张合并。
