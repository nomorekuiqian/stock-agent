# Stock Screener 前端页面 + Agent 体系 Engineering Plan

> Status: All Phases Complete
> Related: `backend/app/features/screener/.context.md`, `frontend/src/app/stock/.context.md`
> Vision: 产品策略.md > 模块 4 (机会发现) — "有什么值得关注的投资机会？"

## 目标

构建 /screener 页面，提供「预设策略 + 自然语言 Agent + 渐进式漏斗」三位一体的股票筛选体验。用户从 5,840 只美股出发，通过策略入口快速缩至 ~30 只，再通过智能推荐维度逐步收窄到 3-5 只候选，最终跳转 /stock 做深度研究。

## 核心产品理念：渐进式筛选漏斗

**传统 Screener 的问题**：给用户 30 只股票就结束了，用户还是不知道怎么选。

**我们的方案**：

```
5,840 只 ──策略入口──→ ~30 只 ──智能收窄──→ ~10 只 ──精选排序──→ 3-5 只 ──→ /stock 深研
  全市场     按钮/自然语言    推荐维度 chips    排序+截取      点击跳转
```

每一步的收窄方式不同：

| 阶段 | 结果数 | 收窄方式 | 推荐类型 |
|------|--------|---------|---------|
| 入口 | 5,840 → ~30 | 预设策略按钮 或 自然语言 | — |
| 收窄 | ~30 → ~10 | 智能推荐分类维度 chips | 按板块 / 按市值 / 按分析师评级 |
| 精选 | ~10 → 3-5 | 智能推荐排序维度 | 按 ROE 排序 / 按目标价上行空间 |
| 研究 | 3-5 → 决策 | 跳转 /stock/{symbol} | "想深入了解哪只？" |

用户在任何阶段都可以用自然语言输入自己的条件，不必依赖推荐。

## 现状

### 后端（已完成）

- 3,680 只美股 x 65 维度数据，日频刷新（tvscreener，已过滤 OTC 股票）
- 8 个筛选策略（hot_sectors, volume_surge, value_discovery, high_dividend, momentum, oversold_quality, by_sector, custom）
- `POST /api/screener/filter` 端点，< 10ms 响应（内存缓存）
- `GET /api/screener/status` 缓存状态监控
- `GET /api/screener/sectors` 板块列表（中英文 + 计数）
- `POST /api/screener/refresh` Cron 刷新（已部署 Edge Function + DB 表）
- `POST /api/screener/ask` 自然语言选股 Agent (Google ADK + 3 FunctionTools)
- 智能收窄推荐系统 (suggestions.py)

### 前端（Phase 1+2 已完成）

- `/screener` 页面已上线 (CSR, PaywallGuard)
- 10 个组件: StrategyCards, ScreenerInput, AiSummary, FunnelProgress, AppliedFilters, NarrowingSuggestions, CandidateList, SectorSelector, DataStatus
- 策略卡片为主入口 (7 张)，AI 输入框为次要入口
- 对话状态管理 (最多 5 轮)

### Agent（已完成）

- Google ADK LlmAgent + InMemoryRunner
- 3 FunctionTools: execute_screener, get_field_distribution, list_available_sectors
- 自然语言 → 结构化 filters 解析 + 摘要生成

## 产品决策记录

| 决策项 | 结论 | 理由 |
|--------|------|------|
| 认证 | 需要登录，暂不付费 | 未来考虑付费，但不能公开 |
| Navbar 位置 | 与 Stock 平级 | 独立一级入口 |
| 移动端展示 | 卡片模式 | 每只股票一张卡片，竖向排列 |
| 板块名称 | 中英文双语 | "科技服务 Technology Services" |
| Agent 对话轮数 | 最多 5 轮 | 5 轮后提示"重新开始" |
| 数据过期 | 不做特殊处理 | stale 状态不影响使用 |

## 设计

### 产品交互流

```
用户进入 /screener（需登录）
    │
    ├─ 看到 8 个策略卡片 + 自然语言输入框
    │
    ├─ 入口: 点击策略卡片 或 输入自然语言
    │   → 5,840 → ~30 只候选
    │   → 展示结果 + AI 摘要 + 智能收窄 chips
    │
    ├─ 收窄: 点击推荐 chips 或 输入自然语言
    │   → ~30 → ~10 只
    │   → 漏斗进度更新，推荐维度重新计算
    │
    ├─ 精选: 点击排序推荐 或 输入
    │   → ~10 → 3-5 只
    │   → 提示 "想深入了解哪只？"
    │
    └─ 研究: 点击候选股
        → 跳转 /stock/{symbol}
```

### 页面布局

```
/screener
┌──────────────────────────────────────────────┐
│  Stock Screener                              │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │  "找被低估的半导体股..."                 │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  ── 或选择预设策略 ─────────────────────      │
│                                              │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐       │
│  │热门板块│ │放量异动│ │价值发现│ │高股息 │       │
│  └──────┘ └──────┘ └──────┘ └──────┘       │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐       │
│  │ 动量  │ │超跌优质│ │板块筛选│ │自定义 │       │
│  └──────┘ └──────┘ └──────┘ └──────┘       │
│                                              │
│  5,840 只美股 | 更新于 2h 前                  │
│                                              │
│  ══════════ 筛选结果 ════════════════════     │
│                                              │
│  ┌─ 漏斗进度 ────────────────────────────┐   │
│  │  5,840 → 28 → 12 → 5                 │   │
│  │  [放量异动 ×] [科技服务 ×] [ROE>15% ×]│   │
│  └───────────────────────────────────────┘   │
│                                              │
│  AI: "从 5,840 只中筛出 28 只放量上涨股..."   │
│                                              │
│  ── 继续收窄 ──────────────────────────────   │
│  [按板块] 科技 12 | 金融 8 | 医疗 5          │
│  [按市值] 大盘 9 | 中盘 14 | 小盘 7          │
│  [分析师] 买入 12 | 持有 15                   │
│  或输入: [________________________]           │
│                                              │
│  ┌─ 候选股列表 ──────────────────────────┐   │
│  │ NVDA   NVIDIA     $180  +2.3%  RV:3.2│   │
│  │ AVGO   Broadcom   $215  +1.8%  RV:2.8│   │
│  │ ...                                   │   │
│  │ 点击 → 跳转 /stock/NVDA              │   │
│  └───────────────────────────────────────┘   │
└──────────────────────────────────────────────┘
```

### 智能收窄推荐系统

核心原则：**分析当前结果集的维度分布，推荐区分度最高的维度。**

#### 推荐维度池

| 维度 | 分类方式 | 推荐条件 |
|------|---------|---------|
| 板块 (sector) | 按板块名分组，显示每组数量 | 结果横跨 3+ 个板块 |
| 市值 (market_cap_tier) | small/mid/large/mega | 结果横跨 2+ 个 tier |
| 估值 (pe_ttm) | PE < 15 / 15-25 / > 25 | PE 非空率 > 50% 且标准差大 |
| 盈利 (roe) | ROE > 15% / < 15% | ROE 非空率 > 50% |
| 分析师 (analyst_rating) | 买入 (<2.5) / 持有 / 卖出 (>3.5) | 有评级比例 > 50% |
| 技术 (rsi) | 超卖 (<30) / 中性 / 超买 (>70) | RSI 分布跨度 > 20 |
| 股息 (dividend_yield) | 有分红 / 无分红 | 非 high_dividend 策略时 |
| 趋势 (above_sma200) | 上方 / 下方 | 分布大致对半 |

#### 推荐阶段变化

```
结果 > 20 只 → 推荐 分类型 chips（板块、市值、分析师）
             → 目的: 快速缩小范围

结果 10-20 只 → 推荐 分类 + 排序 混合
              → "按板块 [科技 8 | 金融 4]"
              → "按 ROE 排序看前 10？"

结果 < 10 只 → 推荐 排序型（"按目标价上行空间排前 5"）
             → 提示 "想深入了解哪只？点击查看详细分析"

结果 < 5 只  → 不再推荐收窄
             → 每只股票展示更多字段（展开模式）
             → 突出 "点击进入个股深研"
```

#### 推荐算法（后端计算）

```python
def compute_narrowing_suggestions(candidates: list[dict]) -> list[dict]:
    """
    分析候选股列表，返回 3-4 个最有区分度的收窄维度。

    返回格式:
    [
        {
            "dimension": "sector",
            "label": "按板块",
            "type": "categorical",  # categorical | threshold | sort
            "options": [
                {"value": "Technology Services", "label": "科技服务", "count": 12},
                {"value": "Finance", "label": "金融", "count": 8},
                ...
            ]
        },
        {
            "dimension": "market_cap_tier",
            "label": "按市值",
            "type": "categorical",
            "options": [
                {"value": "large", "label": "大盘 >$10B", "count": 9},
                {"value": "mid", "label": "中盘 $2-10B", "count": 14},
                {"value": "small", "label": "小盘 <$2B", "count": 7}
            ]
        },
        {
            "dimension": "roe",
            "label": "按 ROE 排序",
            "type": "sort",
            "description": "看盈利能力最强的"
        }
    ]
    """
```

### 条件累积机制

技术上，所有收窄操作统一转换为 `custom` 策略的 `filters` 列表：

```
用户点击 "放量异动" 策略
  → 第 1 轮 filters: (由 volume_surge 策略隐式生成)
    [relative_volume >= 2, daily_change > 0, avg_volume_30d >= 100000]

用户点击 chip [科技服务]
  → 第 2 轮 filters: 上面 + [sector = "Technology Services"]

用户输入 "ROE > 15%"
  → 第 3 轮 filters: 上面 + [roe > 15]

用户点击排序推荐 "按目标价上行空间排前 5"
  → 第 4 轮 filters: 上面全部, sort_by=analyst_upside, limit=5
```

前端维护一个 `appliedFilters[]` 状态，每个 chip 对应一个 filter entry，可单独删除（删除后重新执行）。

### 数据流

```
Phase 1 (按钮 + 收窄 chips):
  前端 → POST /api/screener/filter (strategy + params)
       → 返回 { candidates[], suggestions[] }
  前端显示结果 + 智能收窄 chips
  用户点 chip → 前端累积条件 → 再次 POST /api/screener/filter

Phase 2 (Agent 对话):
  前端 → POST /api/screener/ask (message + history + current_filters)
       → Agent 解析 → 执行 filter → 计算 suggestions
       → 返回 { candidates[], suggestions[], summary, filter_used }
```

### API 变更

#### Phase 1: 修改已有端点 + 新增端点

**修改 `POST /api/screener/filter` 响应**，增加 `suggestions` 字段：

```json
{
  "success": true,
  "strategy": "volume_surge",
  "candidates": [...],
  "candidate_count": 28,
  "universe_size": 5840,
  "data_freshness": "2026-02-28T21:00:31",
  "is_stale": false,
  "suggestions": [
    {
      "dimension": "sector",
      "label": "按板块",
      "type": "categorical",
      "options": [
        {"value": "Technology Services", "label": "科技服务", "count": 12},
        {"value": "Finance", "label": "金融", "count": 8}
      ]
    },
    {
      "dimension": "market_cap_tier",
      "label": "按市值",
      "type": "categorical",
      "options": [
        {"value": "large", "label": "大盘", "count": 9},
        {"value": "mid", "label": "中盘", "count": 14}
      ]
    },
    {
      "dimension": "roe",
      "label": "按 ROE 排序",
      "type": "sort"
    }
  ]
}
```

**新增 `GET /api/screener/sectors`** — 返回可用板块列表（中英文），by_sector 策略的板块选择器用。

#### Phase 2: 新增 Agent 端点

```
POST /api/screener/ask
  Request:
    {
      "message": "只看大盘科技股",
      "current_filters": [          // 当前已累积的条件
        {"field": "relative_volume", "op": "gte", "value": 2},
        {"field": "daily_change", "op": "gt", "value": 0}
      ],
      "history": [                  // 对话历史 (最多 5 轮)
        {"role": "user", "content": "找放量的股票"},
        {"role": "assistant", "summary": "筛出 28 只放量上涨股"}
      ]
    }

  Response:
    {
      "success": true,
      "filter_used": {
        "strategy": "custom",
        "params": {
          "filters": [
            {"field": "relative_volume", "op": "gte", "value": 2},
            {"field": "daily_change", "op": "gt", "value": 0},
            {"field": "market_cap_tier", "op": "in", "value": ["large", "mega"]},
            {"field": "sector", "op": "eq", "value": "Technology Services"}
          ],
          "sort_by": "market_cap",
          "limit": 30
        }
      },
      "candidates": [...],
      "candidate_count": 8,
      "universe_size": 5840,
      "suggestions": [...],
      "summary": "在放量股中筛选出 8 只大盘科技股...",
      "data_freshness": "...",
      "is_stale": false
    }
```

### Agent 设计

#### Screener Query Agent

**职责**：理解用户自然语言 → 在已有条件基础上追加/修改 → 输出新的完整 FilterRequest

```python
# backend/app/features/screener/agent.py

class ScreenerQueryOutput(BaseModel):
    strategy: str = Field(
        description="custom (大多数情况) 或预设策略名"
    )
    sector: str | None = Field(default=None)
    params: dict | None = Field(
        description="完整的 custom 筛选条件 (包含之前的 + 新增的)"
    )
    summary: str = Field(
        description="自然语言摘要 (80-150 字)，说明筛了什么、为什么"
    )
```

**Instruction 核心内容**：
1. 8 个策略的名称和适用场景
2. 71 个可用字段 + 中文说明
3. 20 个板块名称（英文 + 中文映射）
4. 运算符：gt, gte, lt, lte, eq, neq, in
5. 对话规则：始终在 `current_filters` 基础上追加/修改，不丢弃之前的条件
6. 模糊表述映射：
   - "便宜" → pe_ttm < 行业中位数
   - "赚钱" → roe > 15
   - "稳定" → beta_1y < 1
   - "大盘" → market_cap_tier in [large, mega]
   - "分析师看好" → analyst_rating < 2.5

### 前端文件结构

```
frontend/src/app/screener/
├── page.tsx                     # 主页面 (CSR, 需登录)
└── _components/
    ├── StrategyCards.tsx         # 8 个策略卡片
    ├── ScreenerInput.tsx         # 自然语言输入框
    ├── FunnelProgress.tsx        # 漏斗进度条 (5,840 → 28 → 12 → 5)
    ├── AppliedFilters.tsx        # 已应用条件 chips (可删除)
    ├── NarrowingSuggestions.tsx   # 智能收窄推荐 chips
    ├── CandidateList.tsx         # 候选股列表 (桌面表格/移动卡片)
    ├── CandidateCard.tsx         # 移动端单股卡片
    ├── AiSummary.tsx             # Agent 摘要
    └── DataStatus.tsx            # 数据状态 (股票数 + 更新时间)
```

### 候选股展示

#### 桌面端：表格

固定列: symbol, name, sector, price, daily_change, market_cap
策略动态列 (根据策略类型和已应用的 filter 维度动态添加)

| 策略 | 额外展示列 |
|------|-----------|
| hot_sectors | weekly_change, monthly_change |
| volume_surge | relative_volume, avg_volume_30d |
| value_discovery | pe_ttm, roe, position_52w |
| high_dividend | dividend_yield, payout_ratio, dividend_payout_years |
| momentum | change_3m, rsi, above_sma50 |
| oversold_quality | rsi, roe, analyst_rating, analyst_upside |
| by_sector | sort_by 指定的字段 |
| custom | filters 中涉及的字段 |

表格列头可点击排序。

#### 移动端：卡片

每只股票一张卡片，竖向排列：
- 第一行: symbol + name + sector
- 第二行: price + daily_change + market_cap
- 第三行: 2-3 个策略相关指标

结果 < 5 只时，卡片展开更多字段。

### 板块中英文映射

```typescript
const SECTOR_MAP: Record<string, string> = {
  "Commercial Services": "商业服务",
  "Communications": "通信",
  "Consumer Durables": "耐用消费品",
  "Consumer Non-Durables": "非耐用消费品",
  "Consumer Services": "消费服务",
  "Distribution Services": "分销服务",
  "Electronic Technology": "电子技术",
  "Energy Minerals": "能源矿产",
  "Finance": "金融",
  "Health Services": "医疗服务",
  "Health Technology": "医疗技术",
  "Industrial Services": "工业服务",
  "Miscellaneous": "其他",
  "Non-Energy Minerals": "非能源矿产",
  "Process Industries": "加工工业",
  "Producer Manufacturing": "生产制造",
  "Retail Trade": "零售",
  "Technology Services": "科技服务",
  "Transportation": "运输",
  "Utilities": "公用事业",
};
// 显示格式: "科技服务 Technology Services"
```

## 实施步骤

### Phase 1: 策略入口 + 智能收窄（可独立上线）

1. [x] **后端: 智能收窄推荐逻辑** — `backend/app/features/screener/suggestions.py`，分析候选股分布，返回 3-4 个推荐维度
2. [x] **后端: 修改 filter 响应** — FilterResult 模型增加 `suggestions` 字段，router.py 调用推荐逻辑
3. [x] **后端: 新增 /api/screener/sectors 端点** — 返回板块列表（中英文），by_sector 策略用
4. [x] **后端: 支持条件累积** — custom 策略的 filters 支持从前端传入已累积条件列表
5. [x] **前端: api.ts 添加 screener 方法** — `api.screener.filter(req)`, `api.screener.status()`, `api.screener.sectors()`
6. [x] **前端: /screener/page.tsx 主页面** — CSR，AuthGuard 登录保护，组件骨架
7. [x] **前端: StrategyCards 组件** — 8 张策略卡片（名称 + 一句话描述 + 点击执行）
8. [x] **前端: FunnelProgress 组件** — 漏斗进度条，显示每步收窄的数量变化
9. [x] **前端: AppliedFilters 组件** — 已应用条件 chips，可单个删除（删除后重新执行）
10. [x] **前端: NarrowingSuggestions 组件** — 智能推荐 chips，根据后端 suggestions 渲染，点击即应用
11. [x] **前端: CandidateList 组件** — 桌面端表格（列头可排序）+ 移动端卡片，根据策略动态展示不同指标列
12. [x] **前端: DataStatus 组件** — 数据状态条（股票数 + 更新时间）
13. [x] **前端: 板块选择器** — by_sector 策略的板块下拉（中英文双语）
14. [x] **前端: 注册路由 + Navbar** — 添加 /screener 路由，Navbar 添加 Screener 入口（与 Stock 平级）
15. [x] **前端: 候选股点击跳转** — 点击行/卡片 → `/stock/{symbol}`
16. [x] **前端: 响应式适配** — 移动端策略卡片 2 列，结果卡片模式
17. [x] **前端: .context.md** — `frontend/src/app/screener/.context.md`

### Phase 2: Agent 对话版（在 Phase 1 基础上）

18. [x] **后端: Screener Agent** — `backend/app/features/screener/agent.py`，Google ADK LlmAgent + 3 FunctionTools (execute_screener, get_field_distribution, list_available_sectors)
19. [x] **后端: Agent Instruction** — 策略说明 + 65 字段 + 20 板块 + 运算符 + 对话微调规则 + 模糊表述映射
20. [x] **后端: /api/screener/ask 端点** — 接收 message + current_filters + history → Agent 解析 → filter → suggestions → 返回
21. [x] **前端: api.ts 添加 ask 方法** — `api.screener.ask(message, currentFilters, history)`
22. [x] **前端: ScreenerInput 组件** — 搜索图标 + Enter 发送 + loading 状态 + placeholder 引导 + 轮次指示器
23. [x] **前端: AiSummary 组件** — Agent 摘要展示，含加载动画
24. [x] **前端: 对话状态管理** — chatHistory[] (最多 5 轮) + roundCount + 第 5 轮后提示 "重新开始"
25. [x] **前端: 输入框与策略卡片联动** — 策略卡片为主入口，AI 输入框为次要入口，结果区有追问输入框
26. [x] **更新 .context.md** — 后端 + 前端的 .context.md 补充 Agent 相关内容 + UI 重设计 (策略卡片优先布局)

### Phase 3: 自动化 + 后续

27. [x] **后端: GitHub Actions cron** — `screener-universe-refresh.yml`，`0 23 * * 1-5` 自动刷新 (UTC 23:00 = EST 18:00)
28. [x] **前端: 接入 Brew** — CandidateList 每行/卡片添加"加入持仓"按钮，使用 useWatchlist/useSaveWatchlist hooks

## 依赖

| 依赖项 | 状态 | 说明 |
|--------|------|------|
| 后端 screener 数据层 | 已完成 | 5,840 股 x 71 维度，< 10ms filter |
| Edge Function + DB 表 | 已部署 | `screener-universe-cache` |
| tvscreener 数据刷新 | 已配置 Cron | GitHub Actions `screener-universe-refresh.yml` 每日 UTC 23:00 |
| Google ADK | 已集成 | Agent 框架已在 brew/stock/daily_report 使用 |
| /stock 详情页 | 已上线 | 候选股点击跳转目标 |
| Navbar 组件 | 已有 | 需添加 Screener 入口 |
| AuthGuard 模式 | 已有 | /for-you 页面已实现登录保护模式 |

## 已解决问题

1. **预设策略 → custom 的条件转换** — 在前端做。`page.tsx` 中 `strategyToFilters()` 函数把预设策略的隐式条件转为显式 custom filters，存入 `customFilters[]` 状态。
2. **收窄 chips 的交互细节** — 点击直接应用（单选）。分类型 chip 点击后立即筛选，不展开二级选择。
3. **空结果处理** — 显示 "无匹配结果" 空状态 + "尝试调整筛选条件或删除部分条件" 提示。
