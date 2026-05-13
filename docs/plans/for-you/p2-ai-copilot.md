# P2 · Copilot 层：What-If / 连线 / 情绪 / 月度

> Status: Planning
> Priority: P2（依赖 P0 + P1 数据与验证）
> Related: features/screener/research_agent.py, features/brew/
> Vision: roadmap.md > 专属系统 > 机会雷达 / 风险守护 / 建议追踪

## 目的

充分利用 Gemini 3.1 的**长上下文 + 工具调用 + 结构化输出**，让专属页除了"读"，还能**模拟、连线、稳住情绪、自我回顾**。四个能力全部用户主动触发或懒触发，不做后台高频 cron。

## 用户心智

> "偶尔我会有一个具体念头：'卖 TSLA 换 SPY 会怎样'，希望 10 秒看到答案。"
>
> "市场跌了 3%，我开始慌。给我看看历史，让我不要瞎操作。"
>
> "每个月让我感觉到它进步了。"

## User Stories

### US-1 · What-If 模拟

```
持仓卡 [⋯] → "🔮 What-If..."
预设: ○卖掉 ○换 SPY ○减半 ○双倍  →  [运行]
3 秒后:
  当前健康分 62  →  模拟后 74
  集中度 78%  →  65%
  宏观敏感度 高 → 中
  [查看完整对比]
```

### US-2 · 跨持仓连线（周度）

```
Digest 底部新 section "🕸 本周连线"（每周一次，cache 7 天）
AI 输出 2-3 条"跨 2+ 持仓"的非显性洞察，必须引用 2+ 证据：
  "NVDA 本周跌 4% 与上周 AMD 被降级相关。机构在把半导体仓位从
   美股 AI 转向欧洲芯片设备，你的 ASML 是反向受益方。"
每条下方 [👍][👎]（复用 P1 FeedbackBar）
```

### US-3 · 情绪管理（大跌日）

```
触发: 组合 1d < -5% OR VIX > 28 OR 最大持仓单日 < -10%
Action Bar 红 chip "与 AI 讨论" → 跳 /research?mode=crisis&context=brew
Agent 第一句话强制模板:
  (a) 共情当下感受
  (b) 引用过去 3 年类似回撤的 T+90 数据
  (c) 回到用户 thesis 的提问
禁止: 以"买入/卖出"开头；具体交易指令。
```

### US-4 · 月度 AI 回顾

```
每月 1 号第一次进 /for-you → Modal "3 月的你":
  健康分曲线 58 → 65 (↑)
  反馈 12 👍 / 4 👎  (75% 准)
  AI 建议 2 对 / 1 观察中
  画像更新建议: thesis 60% 提到"长期" → 风险容忍 moderate → higher?
  [确认更新] [保持]
```

## 需求维度覆盖

| 维度 | 覆盖 |
|---|---|
| 充分利用 AI | ✔ 4 个场景都需 LLM，不是表格包装 |
| 按需不打扰 | ✔ 全部用户主动 / 月初懒触发 |
| 可解释（引用证据） | ✔ prompt 强制引用价格/新闻/事件 |
| 结构化输出 | ✔ Pydantic schema |
| 不依赖新数据源 | ✔ 复用 quotes / fundamentals / health / memory |

## 设计

### 1) What-If 模拟

**架构**：Agent + Tool call。

```
POST /api/portfolio/whatif
  body: { modifications: [{action, symbol, amount}] }

agent.run() {
  tool: calc_current_health(user_id)         → HealthReport（P1 已有）
  tool: apply_modifications(portfolio, mods) → simulated_portfolio
  tool: calc_health_score(simulated)         → HealthReport
  LLM: 生成 diff_narrative
}
→ WhatIfResult { before, after, diff_narrative }
```

后端改动：把 P1 的 `calc_health_score()` 抽成纯函数接受任意 portfolio 入参。

前端：持仓卡 `[⋯]` 菜单；V1 只 4 种预设，自由文本 V2。

**成本**：$0.003 / 次。

### 2) 跨持仓连线

**触发**：每周随 digest 生成一次（独立端点 `/api/brew/connections`，cache 7 天）。

**Agent 输入**（发挥长上下文）：

- 14 天每只持仓价格序列
- 相关 symbol group 的 7 天 headlines
- 14 天分析师评级变化（依赖 `market-tab-revamp` 接入的 FMP grades）
- 板块相对表现
- 用户 thesis

**Prompt 硬约束**：

```
输出 2-3 条跨 2+ 持仓的非显性关联。
每条必须引用 2+ 数据点（价格/新闻/评级/事件）。
禁止: 单只股票分析（quick_take 做的事）
禁止: 泛化（"市场情绪谨慎"不算洞察）
禁止: 和上周连线重复（agent 要对比上周缓存）
```

**输出**：

```python
class Connection(BaseModel):
    title: str
    symbols_involved: list[str]
    evidence: list[EvidencePoint]   # 2+
    implication: str
    suggested_action: str | None
```

**成本**：~15K in + 1K out → $0.02 / 用户 / 周。

### 3) 情绪管理（Crisis Mode）

不是新页面，是 `/research` 的一种启动模式。

**触发**（前端判断）：

```
portfolio_1d_change < threshold(profile.risk_tolerance)
OR VIX > 28
OR max_holding_1d_change < -10%
```

阈值按画像动态：low → -3%，moderate → -5%，high → -8%。

Action Bar 出现特殊红色 chip "与 AI 讨论" → 跳 `/research?mode=crisis&context=brew`，agent 读取：

- 完整画像 + 持仓 + thesis + 最近反馈
- 过去 3 年组合等权收益中同幅度事件 + T+90 实际表现
- 当下市场状态（VIX / 关键宏观）

**Agent 第一轮强制模板** → 见 US-3 三条约束。

**禁止事项**：具体交易指令。明确定位为"情绪管理"不是"投资建议"。

### 4) 月度复盘

```
GET /api/monthly-recap?month=2026-03    (月末后不变 → cache 到月底)

响应结构:
  data_part (SQL 聚合, 0 LLM):
    health_score_series, feedback_counts, hit_rate,
    suggestion_outcomes, thesis_keyword_cloud
  narrative_part (LLM ~1000 token):
    summary_markdown, profile_update_hints (style/horizon/risk 建议方向)
```

懒触发：用户每月第一次进 /for-you 弹 Modal。画像更新是**建议**，用户点确认才写 `user_investment_profiles`。

## LLD Unit U2-A · What-If 模拟

> Scope: `POST /api/portfolio/whatif` 端点 + 把 U1-B `scoring.compute_all` 抽为纯函数 + WhatIf agent（单轮结构化输出）+ 前端 `<WhatIfSheet>` 组件
> Depends: U1-B（scoring + NextAction schema）、U0-A（`user_portfolios` + `$CASH` 处理）、U1-C（thesis 注入）
> Consumed by: U2-C Crisis Mode（可在情绪模式里内嵌 "卖 10% 换 cash 会稳住多少"）
> Status: LLD Ready.

### 1) 实现目标（Work backward）

用户心智："'卖 TSLA 换 SPY 会怎样' 这种念头出现时，10 秒看到答案。" → 持仓卡溢出菜单 → 4 预设单选 → [运行] → 3 秒内给出"健康分 62→74、集中度 78%→65%"对比 + 一段话。**不出交易指令**，只出"如果..."的结构化对比。

### 2) 正向分析

- **合力**：直接复用 U1-B 的 `scoring.compute_all()`——只要它被抽成接受任意 `list[HoldingView]` 的纯函数，What-If 就是"跑两次、取 diff"。U1-C thesis 自动注入 → "你当初说看好 AI 基建，卖掉 NVDA 后剩下的 AI 敞口只有 AMD 的 8%" 这种专属引用**零成本**获得。
- **涌现基础**：预设枚举 `sell_all / swap_to_spy / halve / double` → 未来 V2 自由文本 = 前端加 Combobox + 后端放宽 `modifications` 校验，Agent 无需改。
- **专属性**：What-If 输入 = 用户自己的持仓 + 画像 + thesis；免费用户无持仓无法触发，天然专属。
- **AI 分工**：`apply_modifications` + `compute_all` 规则纯函数（可测、零幻觉）；LLM 只负责 `diff_narrative` 的措辞（引用 before/after 具体数字），与 U1-B DiagnosisAgent 同模式。

### 3) 架构 & 前后端细节

```
backend/app/features/portfolio_health/         ← 复用 U1-B 模块
├── scoring.py              # 抽纯函数 compute_all(holdings, prices, profiles, returns, macro)
└── whatif.py   ← 新增        # apply_modifications + WhatIfAgent

backend/app/features/portfolio_health/router.py
└── + POST /api/portfolio/whatif
```

**端点**：

| Method | Path | 用途 | Rate Limit |
|---|---|---|---|
| POST | `/api/portfolio/whatif` | 运行一次 What-If | **10/h/用户**（防滥用） |

**Request/Response**：

```python
class Modification(BaseModel):
    action: Literal["sell_all", "swap_to_spy", "halve", "double", "adjust"]
    symbol: str
    amount: float | None = None          # adjust 模式用; 其他预设忽略

class WhatIfRequest(BaseModel):
    modifications: list[Modification]    # V1 限制 1 条; V2 开放多条

class WhatIfResult(BaseModel):
    before: HealthSummary                # {score_total, sub_scores, sector_dna}
    after:  HealthSummary
    diff_narrative: str                  # ≤ 200 字, 引用具体数字
    caveats: list[str]                   # 自动生成: "未考虑税务" / "未考虑流动性"
```

**Service 流程**：

```python
def run_whatif(user_id, req):
    holdings = load_user_portfolio(user_id)
    profile  = load_user_profile(user_id)
    prices, profiles_map, returns, macro = fetch_all_inputs(holdings_symbols + ["SPY"])

    before = scoring.compute_all(holdings, prices, profiles_map, returns, macro)
    simulated = apply_modifications(holdings, req.modifications, prices)
    after  = scoring.compute_all(simulated, prices, profiles_map, returns, macro)

    thesis = load_thesis_map(user_id)
    narrative = whatif_agent.run(before, after, req.modifications, profile, thesis)
    _lint_narrative(narrative, before, after)      # 禁用词 + 数字一致性

    return WhatIfResult(
        before=before.summary, after=after.summary,
        diff_narrative=narrative.text,
        caveats=_static_caveats(req.modifications),   # 规则硬编码
    )
```

**`apply_modifications()` 纯函数**（可单测）：

```python
from app.features.portfolio.exposure_parser import CASH_SYMBOL

def apply_modifications(holdings, mods, prices) -> list[HoldingView]:
    result = deepcopy(holdings)
    for m in mods:
        if m.action == "sell_all":
            # Deep Audit 修正: sell_all 金融语义 = swap_to_cash, 而非剔除后归一化
            # (否则"卖出 NVDA 落袋为安"会被模拟为"NVDA 卖出后全加仓剩余标的"的满仓梭哈)
            target = next((h for h in result if h.symbol == m.symbol), None)
            if target:
                target_value = (target.shares or 0) * prices.get(m.symbol, 0)
                cash = next((h for h in result if h.symbol == CASH_SYMBOL), None)
                if cash:
                    # $CASH 虚拟单价固定 1.0 (shared/data_tools _cash_guard 保证)
                    cash.shares = (cash.shares or 0) + target_value
                else:
                    result.append(HoldingView(symbol=CASH_SYMBOL, shares=target_value))
                result = [h for h in result if h.symbol != m.symbol]
        elif m.action == "swap_to_spy":
            target = next((h for h in result if h.symbol == m.symbol), None)
            if target:
                spy = next((h for h in result if h.symbol == "SPY"), None)
                if spy:  spy.shares = (spy.shares or 0) + target.shares
                else:    result.append(HoldingView(symbol="SPY", shares=target.shares))
                result = [h for h in result if h.symbol != m.symbol]
        elif m.action == "halve":
            for h in result:
                if h.symbol == m.symbol: h.shares = (h.shares or 0) * 0.5
        elif m.action == "double":
            for h in result:
                if h.symbol == m.symbol: h.shares = (h.shares or 0) * 2
    # 重新计算 effective_weight ($CASH 参与归一化, 权重直接用 shares 值因单价 1.0)
    return recompute_effective_weights(result, prices)
```

**Deep Audit 修正要点**：
- `sell_all` 现在等价于"换成现金"——把卖出头寸的市值（`shares × price`）加到用户的 $CASH 头寸上，没有 $CASH 则自动创建
- 这保证了"卖出 NVDA 落袋为安"在 What-If 中被正确模拟为"组合规模不变、NVDA 敞口置零、现金缓冲提升"，波动率下降而非被归一化放大
- 对 $CASH 本身执行 `sell_all` 是 no-op（前端 PresetPicker 在 symbol=$CASH 时隐藏该预设；后端防御性早退）
- `caveats` 自动追加"此模拟将卖出所得视作现金（无再投资）；真实场景下你可能转投其他标的"

**前端**：

```
frontend/src/components/for-you/whatif/
├── WhatIfSheet.tsx                      # Radix Sheet (drawer from right)
├── PresetPicker.tsx                     # 4 个 RadioGroup option
└── WhatIfResultCard.tsx                 # 对比渲染 + diff 箭头
```

触发入口：持仓卡（StockOverviewPanel 的每一行）右侧 `[⋯]` 菜单新增项 `🔮 What-If...`，打开 `<WhatIfSheet>` 时预填 `symbol`。

UI：
```
🔮 What-If NVDA
┌──────────────────────────────────────┐
│  ○ 全部卖出                           │
│  ● 换成 SPY                           │
│  ○ 减半                               │
│  ○ 加倍                               │
│                                       │
│  [运行]  [取消]                       │
└──────────────────────────────────────┘
↓ 运行后
┌──────────────────────────────────────┐
│  健康分   62 ━━▶ 74   (+12)          │
│  集中度   78% ━━▶ 65%                │
│  宏观     高  ━━▶ 中                 │
│  ─────────────────────────────────   │
│  卖掉 NVDA 换成 SPY, 你的半导体敞口  │
│  从 40% 降到 18%...                   │
│  ─────────────────────────────────   │
│  ⚠ 未考虑税务 · 未考虑流动性          │
│  [保存这个方案] [再试一个]            │
└──────────────────────────────────────┘
```

`[保存这个方案]` V1 仅 localStorage + toast（不直接写 `user_portfolios`，避免误操作）；V2 加确认 modal。

**避免 regression**：
- U1-B 的 `compute_all` 原本是私有；抽为 module-level `export` 不改现有行为（快照测试）
- `apply_modifications` 不触碰 DB；失败回滚自然（纯函数）
- `/whatif` 失败 → 前端 toast + sheet 保持打开态不关闭，用户可重试

### 4) 数据库

**无新表**。V1 不持久化 What-If 历史——样本量不够；V2 若做 "我的方案" 列表再加 `whatif_snapshots` 表。

### 5) Agent 模块

**Model**：`gemini-3.1-flash-lite-preview`

**Schema**：
```python
class WhatIfNarrative(BaseModel):
    text: str       # ≤ 200 字
```

**Instruction 护栏**：
1. 必须**同时**引用 before 和 after 各一个具体数字（`health_score / max sector %`）
2. 必须至少引用一次 user thesis 片段（若存在）
3. 禁用词：`建议买入 / 应该卖出 / N 股 / 抄底`——保持"如果..."句式
4. caveats 由规则生成、注入前缀不进 LLM（LLM 不得自己瞎加"请咨询投资顾问"之类无意义声明）
5. 若 after < before（变差）→ 语气必须中性客观（"若执行此操作，集中度反而升高"），不要强推"但机会也更大"类鸡汤

**Lint**（复用 U1-B 范式）：
- 数字一致性：`text` 中出现的 % 必须 ⊆ `{before, after}` 暴露字段
- 禁用词命中 → lint fail → fallback 模板（"将 X 替换为 Y 后, 健康分从 A 变为 B。具体 caveats: ..."）

**评估**：
- Golden set 20 case（5 持仓 × 4 预设）；人工标注 diff 方向 → agent 方向命中率 ≥ 90%
- CI lint pass ≥ 98%
- 上线后：`whatif_run_count_by_preset`（期望 swap_to_spy > sell_all > halve > double）、`whatif_save_rate`

### 6) Rollout & 回归防护

- **Feature flag**：`ENABLE_WHATIF=false` → `[⋯]` 菜单不显示该项
- **灰度**：staging → 50 人 → 全量
- **回归**：
  - [ ] `scoring.compute_all` 抽取后 U1-B `/health` 端点位级一致（快照）
  - [ ] `apply_modifications` 空 mods → 返回输入副本（不变）
  - [ ] `swap_to_spy` 作用于 SPY 本身 → no-op（不崩）
  - [ ] 含 `$CASH` 持仓的 What-If → Cash 权重正确参与 after scoring（R-1 已解决）
  - [ ] **`sell_all` 作用于非 $CASH 持仓 → 无 $CASH 时自动创建 $CASH；有 $CASH 时累加市值**（Deep Audit）
  - [ ] **`sell_all` 50/50 组合卖一半 → after 为 50% 剩余标的 + 50% 现金**（波动率应下降而非升高）
  - [ ] **`sell_all` 作用于 $CASH 本身 → no-op**（Deep Audit 防御测试）
  - [ ] rate limit 超限 → 429 + toast "稍后再试"
- **指标**：`whatif_p95_latency`（目标 < 5s）、`whatif_narrative_lint_pass_rate`（> 98%）、`whatif_save_rate`（> 20% 说明真有用）

### U2-A 交付 Checklist

| # | 任务 | Owner | 状态 |
|---|---|---|---|
| A1 | 重构 U1-B `scoring.compute_all` 为纯函数 + 快照测试确保无 regress | 后端 | ⏳ |
| A2 | `whatif.py::apply_modifications()` 纯函数 + 单测覆盖 4 预设 | 后端 | ⏳ |
| A3 | `WhatIfAgent` + Pydantic + lint（数字一致性 + 禁用词） | 后端 | ⏳ |
| A4 | `POST /api/portfolio/whatif` + rate limit 10/h | 后端 | ⏳ |
| A5 | `<WhatIfSheet>` + `<PresetPicker>` + `<WhatIfResultCard>` | 前端 | ⏳ |
| A6 | 持仓卡 `[⋯]` 菜单集成 + localStorage "保存方案" | 前端 | ⏳ |
| A7 | Golden set 评估 + 灰度 | 全栈 | ⏳ |

**DoD**：golden set 命中率 ≥ 90% + p95 < 5s + `scoring.compute_all` 抽取后 U1-B 快照零差异 + 5 位内测至少 2 位跑过 What-If。

---

## LLD Unit U2-B · 跨持仓连线（周度）

> Scope: `/api/brew/connections` 端点 + ConnectionAgent（长上下文）+ 7 天缓存 + 对比上周去重 + Digest inline section + FeedbackBar 嵌入
> Depends: U0-A（持仓 + thesis）、U1-C（thesis + FeedbackBar + memory）、market-tab-revamp 已接入的 FMP grades
> Status: LLD Ready.

### 1) 实现目标（Work backward）

用户心智："我自己看一只股没什么新发现，但你告诉我'你持有的 ASML 和被降级的 AMD 是同一件事的两面'——这就是我付费的理由。" → Digest 底部每周一次 2-3 条跨 2+ 持仓的**非显性关联**；**每条必须引用 ≥ 2 数据点**；不与上周重复。

### 2) 正向分析

- **合力（核心价值）**：U2-B 是"连线层"的最高形态——把 U0-A 持仓、U1-A 事件、U1-B 体检、U1-C memory 全拉到一个 agent 的 prompt 里，让长上下文真正产出"跨持仓洞察"。这是免费公共 digest **绝对做不到**的（他们没有用户具体持仓）——原则 1 专属性满分。
- **涌现基础**：`Connection.evidence` 结构化（含 symbol + event_ref + price_point）→ 未来 U2-C Crisis 可复用："上周 U2-B 就点出了这个板块轮动，今天的下跌有迹可循"——连线层本身形成时间深度。
- **AI 分工**：此处 LLM 承担**关联发现**——是 /for-you 唯一"LLM 做决策性推理"的地方。风险控制：强制结构化 evidence + 去重机制 + 反面样例驯化（prompt 里给"不算洞察"的反例）。
- **成本可控**：周度 1 次 × 人均 $0.02 = $0.08/月/用户。

### 3) 架构 & 前后端细节

```
backend/app/features/brew/
├── connections.py   ← 新增
│   └── ConnectionAgent + build_connections_context + dedupe_with_previous
└── router.py
    └── + GET /api/brew/connections
```

**端点**：

| Method | Path | 用途 | 缓存 |
|---|---|---|---|
| GET | `/api/brew/connections` | 本周连线（懒生成） | 7 天（周一失效） |

**生成流程**（懒触发 + cron 预热）：

```
GET /api/brew/connections
  → cache hit (本周一 UTC 为 key) → 返回
  → miss → fallback to 纯同步生成 (10-15s)
  → 返回 + 异步写 cache

cron: 周一 06:00 UTC, 对所有活跃用户 pre-warm 生成
  → 用户周一打开时已有缓存, 零等待
```

**Agent 上下文构造**（充分利用 Flash-Lite 长上下文但不超 3k token 衰减阈值）：

```python
def build_connections_context(user_id):
    holdings = load_user_portfolio(user_id)[:15]                # top-15
    prices_14d = get_price_series_batch(holdings.symbols, 14)   # 各 14 个数据点
    grades_14d = fmp.get_grades_batch(holdings.symbols, 14)     # 升/降级事件
    news_7d = fmp.get_headlines_batch(holdings.symbols, 7)      # 每只 top-3 headlines
    sector_perf = get_sector_performance_1w(sectors_covered)
    thesis = load_thesis_map(user_id)
    last_week = cache.get(f"connections:{user_id}:prev_week")   # 上周输出摘要

    return {
        "holdings": [{symbol, effective_weight_pct, sector} for h in holdings],
        "prices_14d": prices_14d,
        "grade_events": grades_14d,            # [{symbol, date, from, to, firm}]
        "news_7d": news_7d,                    # [{symbol, date, headline, url}]
        "sector_perf_1w": sector_perf,
        "thesis_by_symbol": thesis,
        "last_week_titles": [c.title for c in last_week.connections] if last_week else [],
    }
```

**Pydantic 输出**：

```python
class EvidencePoint(BaseModel):
    type: Literal["price", "grade", "news", "sector", "thesis"]
    symbol: str | None
    ref: str                    # "NVDA -4% 过去 5 日" / "AMD 被 Goldman 降至 Hold 2026-04-17"
    url: str | None             # 新闻 / 评级的跳转

class Connection(BaseModel):
    id: str                     # stable hash(title + symbols_involved)
    title: str                  # ≤ 30 字
    symbols_involved: list[str] # 必须 >= 2
    evidence: list[EvidencePoint]   # 必须 >= 2
    implication: str            # ≤ 80 字
    suggested_action: str | None    # ≤ 40 字, 禁指令词

class ConnectionsResponse(BaseModel):
    week_of: date
    connections: list[Connection]   # 2-3 条, 0 条亦合法 (agent 无洞察时允许返回空)
```

**Instruction 硬约束**：

```
## 输出要求
- 2-3 条跨 ≥ 2 持仓的"非显性"关联
- 每条 evidence ≥ 2, 且必须来自 context 提供的数据 (不得编造)
- symbols_involved 必须 ∈ holdings.symbols
- suggested_action 可空; 若有, 禁用词: 买入 / 卖出 / 加仓 / 减仓 / N%

## 反例 (不算洞察, 禁止输出)
❌ "NVDA 本周跌 4%" — 单股, 非连线
❌ "市场情绪谨慎" — 泛化, 无引用
❌ "建议减仓科技股 20%" — 具体交易指令
❌ "你的 NVDA 和 AAPL 都是大盘股" — 显性共性, 非洞察

## 正例
✔ "NVDA -4% 与上周 AMD 被降级 (Goldman: Buy→Hold) 相关; 半导体资金外流,
   你的 ASML (欧洲设备) 本周 +2.1% 是对冲方; 板块轮动进行中"
   evidence: [NVDA price, AMD grade_change, ASML price, Semi sector perf]

## 去重
- 本周输出与上周 titles 的语义重合度 > 60% → 换题材或返回更少条数
```

**前端集成**：

```
frontend/src/components/for-you/digest/
└── ConnectionsSection.tsx    ← Digest 底部新 section
    每条 Connection:
    ┌──────────────────────────────────────┐
    │ 🕸 {title}                           │
    │    {implication}                      │
    │    涉及: [NVDA] [AMD] [ASML]        ← pill 可点跳股票页
    │    证据:                             │
    │      • NVDA -4% 过去 5 日  →  图标  │
    │      • AMD 降至 Hold (2026-04-17)   │
    │      • 半导体板块 -2.1%              │
    │    {suggested_action}                 │
    │    <FeedbackBar target="connection:{id}" />
    └──────────────────────────────────────┘
```

`target_type='connection'` 进 `ai_feedback`，`target_id = f"connection:{id}:{week_of}"`。

**避免 regression**：
- 新端点、新 agent；不改 digest 现有 endpoint
- 若 agent 失败 → 返回 `{connections: []}`（空而不是报错）→ 前端不渲染 section
- FMP grades 拉取失败 → `grade_events=[]` 传入，agent 降级生成（evidence 少但不崩）

### 4) 数据库

**缓存层**（非持久化）：Vercel Runtime Cache 或 Redis
- Key: `connections:{user_id}:{week_of}` (ISO week)
- TTL: 8 天（超 1 天冗余，周一 cron 会重写）
- Value: `ConnectionsResponse` JSON + `last_generated_at`

**上周对比**：同 cache 另一个 key `connections:{user_id}:prev_week`，每周一生成时取上次 value 写入；用于 agent 去重输入。

### 5) Agent 模块

**Model**：`gemini-3.1-flash-lite-preview`（Flash-Lite 足够，不需 Pro）
**Input**：~2.5k token（14d 价格 + grades + news + thesis）
**Output**：~1k token
**Cost**：~$0.02/用户/周

**评估**：
1. **Golden set**：5 种经典"连线模式"（板块轮动 / 利率传导 / 供应链 / 汇率影响 / 分析师情绪）每种 3 个组合 = 15 case，人工判定 agent 是否识别
2. **CI lint**：
   - `len(connections) ≤ 3`
   - 每条 `len(symbols_involved) >= 2 and len(evidence) >= 2`
   - evidence 的 `symbol` / `ref` 必须能在 context 中查到（反幻觉）
   - `suggested_action` 不含禁用词
3. **上线**：
   - U1-C FeedbackBar 👍 率分桶（per connection template）
   - `connection_click_rate`（用户是否点开涉及的 symbol pill）
   - 重复率（本周与上周 title 语义相似度 < 60%，Sentence-BERT 离线算）

**迭代**：
- V1：通用 prompt
- V2：按最近 4 周 👍 模式**分桶 prompt**（用户偏好"板块轮动"型洞察 vs "分析师情绪"型）
- V3：若 grade / news 数据质量不足，考虑接入 Finnhub / Alpha Vantage 补充

### 6) Rollout & 回归防护

- **Feature flag**：`ENABLE_CONNECTIONS`
- **灰度**：staging → 20 人 → 全量
- **回归**：
  - [ ] 持仓 < 2 只 → 不生成 + 前端不渲染 section（"连线"至少需 2 只）
  - [ ] FMP grades 全失败 → agent 仍能出 price-based 连线
  - [ ] 上周缓存缺失（新用户）→ 正常生成
  - [ ] evidence 指向的 symbol 不在 holdings → lint fail + 重试 1 次 + 仍失败则跳过该条
- **指标**：
  - `connections_cache_hit_rate`（cron 预热后目标 > 90%）
  - `connections_gen_p95_latency`（< 20s；cron 路径不受 UI 等待影响）
  - `avg_connections_per_week`（1.5-2.5 为健康）
  - `connection_thumbup_rate` > 50%

### U2-B 交付 Checklist

| # | 任务 | Owner | 状态 |
|---|---|---|---|
| B1 | FMP grades batch client（若 market-tab-revamp 未接入） | 后端 | ⏳ |
| B2 | `build_connections_context()` + 去重输入构造 | 后端 | ⏳ |
| B3 | ConnectionAgent + Pydantic + lint（幻觉 / 禁用词 / 去重） | 后端 | ⏳ |
| B4 | `GET /api/brew/connections` + 缓存层 | 后端 | ⏳ |
| B5 | 周一 cron 预热（所有活跃用户） | 后端 | ⏳ |
| B6 | `<ConnectionsSection>` + symbol pills + FeedbackBar 嵌入 | 前端 | ⏳ |
| B7 | Golden set 15 case + CI lint + 灰度 | 全栈 | ⏳ |

**DoD**：
- Golden set 命中率 ≥ 70%、lint pass ≥ 95%
- 周一预热后 cache 命中率 ≥ 90%
- 5 位内测 2 周至少 50% 👍 率
- 上周/本周 title 语义相似度中位数 < 40%

---

## LLD Unit U2-C · Crisis Mode（情绪管理 + 历史回撤检索）

> Scope: `/research?mode=crisis` 启动分支 + 历史相似回撤检索工具 + Crisis 强制模板 agent
> Depends: U0-B R-4 `compute_max_drag`（复用触发判定）、U1-C memory（thesis + 反馈注入）、yfinance 3y
> Consumed by: U0-B ActionBar（红态 chip "与 AI 讨论"跳转）
> Status: LLD Ready.

### 1) 实现目标（Work backward）

用户心智："组合跌了 5%，我想操作。你先让我看看历史，让我冷静 10 分钟。" → Action Bar 红态 chip 跳 `/research?mode=crisis` → AI 第一句话**强制三段式**：共情 + 历史数据 + thesis 提问。**绝对不出交易指令**。

### 2) 正向分析

- **合力**：唯一一个把"情绪"当作一等公民的模块。其他所有模块都假设用户理性，Crisis 承认用户在危机日可能恐慌——承接 `/for-you` 的完整用户旅程（不只是"你没事时懂你"，还要"你慌时稳住你"）。
- **涌现基础**：历史回撤检索工具 `find_similar_drawdowns()` 被 U2-D 月度复盘和未来"压力测试"功能复用。
- **AI 分工**：
  - 规则：触发条件（复用 U0-B drag）、历史回撤检索（yfinance 纯数据）、强制模板三段式
  - LLM：共情措辞 + 对 thesis 的提问（灵活但结构受控）
- **合规**：显式标注"情绪管理 · 非投资建议"banner + 禁止交易指令 lint，在合规边界上清晰站位。
- **专属性**：共情引用用户自己的 thesis 和仓位，公共 research 页做不到。

### 3) 架构 & 前后端细节

**不新建 `features/` 模块**——作为 `research` 的子模式。

```
backend/app/features/stock/
├── research_agent.py             # 已有, 扩展 mode="crisis" 分支
└── crisis_tools.py   ← 新增      # find_similar_drawdowns() + build_crisis_context()

backend/app/shared/data_tools/
└── historical_analogs.py   ← 新增    # yfinance 3y 相似回撤检索
```

**触发入口**（前端）：

```tsx
// U0-B ActionBar 在 severity=red 且 kind in ("drawdown", "event") 且 event.severity=urgent 时,
// 显示第二个 chip "与 AI 讨论" → link = "/research?mode=crisis&context=brew"
```

Crisis 自动触发条件（冗余保险，ActionBar 未触发时用户直接进 /research 也可）：

```python
def should_enter_crisis_mode(user_id) -> bool:
    drag = compute_max_drag(load_user_portfolio(user_id), get_latest_digest(user_id))
    threshold = CRISIS_THRESHOLD[profile.risk_tolerance]    # low -3 / mod -5 / high -8
    vix = get_current_vix()
    return drag.value <= threshold or vix >= 28
```

**历史回撤检索工具**：

```python
# shared/data_tools/historical_analogs.py
def find_similar_drawdowns(
    portfolio_composite_series: pd.Series,   # 3y 组合净值序列 (用 current weights 回测)
    current_drawdown_pct: float,
    lookback_years: int = 3,
    top_k: int = 3,
) -> list[AnalogEvent]:
    """找过去 N 年内 drawdown 量级相近的区段"""
    # 1) 滚动窗口找 drawdown ≈ current (±30%)
    # 2) 排除最近 30d (避免当下事件)
    # 3) 返回 top-k: {start_date, end_date, drawdown_pct, recovery_90d_pct, recovery_180d_pct}
```

**Crisis Context 构造**：

```python
def build_crisis_context(user_id):
    holdings  = load_user_portfolio(user_id)
    profile   = load_user_profile(user_id)
    theses    = load_thesis_map(user_id)
    digest    = get_latest_digest(user_id)
    drag      = compute_max_drag(holdings, digest)

    # 用当前权重回测 3 年组合净值
    # Deep Audit: backtest_composite_value 内部对 $CASH 生成常数净值序列 (全 1.0 归一化)
    # 参与加权乘积; 绝不向 yfinance 请求 $CASH 历史, 否则 analogs 为空, Crisis Agent 失去核心素材
    composite = backtest_composite_value(holdings, lookback_years=3)
    analogs   = find_similar_drawdowns(composite, current_drawdown_pct=drag.value)

    recent_fb = feedback_db.get_recent_feedback(user_id, days=7, limit=10)

    return CrisisContext(
        profile=profile,
        holdings_summary=_summarize_holdings(holdings),
        theses=theses,
        drag=drag,
        current_vix=get_current_vix(),
        historical_analogs=analogs,
        recent_feedback=recent_fb,
    )
```

**Crisis Agent 强制三段式模板**：

```python
CRISIS_INSTRUCTION = """
## 角色
你是用户的 AI 投资伙伴, 用户当前正在经历组合下跌。你的目标不是给交易建议,
而是帮用户冷静, 让他们基于事实而非情绪做决策。

## 输出硬约束（第一轮必须三段）
(a) 共情段 (≤ 60 字):
    承认用户当下可能焦虑 / 不安; 禁止假装乐观 ("这没什么"); 禁止哀伤 ("确实很糟")
    引用用户具体持仓 (例: "你的 32% NVDA 今天 -15%")
(b) 历史数据段 (≤ 100 字):
    引用 historical_analogs 中 >= 1 个事件, 给出 T+90 / T+180 实际表现;
    语气客观, 不得暗示"这次一定一样"
(c) thesis 提问段 (≤ 50 字):
    回到用户 thesis (若存在); 反问"你当初买 X 的理由 {thesis} 今天改变了吗?"
    若无 thesis: 反问"想一下, 3 年后回看今天, 什么才是真正重要的?"

## 禁止事项
- 以"买入"/"卖出"开头
- 出现具体交易指令 (N 股 / N%)
- 预测短期方向 ("明天会反弹"/"还会继续跌")
- 第一轮输出 > 250 字

## 后续对话
第一轮后进入自由对话, 但保留:
- 禁止指令性交易词
- 每轮至少引用一次用户持仓或 thesis
"""
```

**前端**：

```
frontend/src/app/research/page.tsx
└── + 解析 ?mode=crisis&context=brew
    → 加载时显示 <CrisisModeBanner>: "⚠ 情绪管理模式 · 非投资建议"
    → 首条消息自动生成 (调用 /api/research/crisis-init)
```

**Crisis 专属端点**（第一轮结构化输出，后续复用 /research 对话流）：

```
POST /api/research/crisis-init
  → 返回 { greeting_three_part: {empathy, history, thesis_question}, session_id }
前端接着调用现有 /api/research/chat 延续对话 (agent instruction 已拿 crisis mode)
```

**避免 regression**：
- 不改 /research 默认模式
- `find_similar_drawdowns` 拉数据失败 → analogs=[] → agent 跳过(b)段或用预设保险文案，不崩
- VIX 拉取失败 → 按 `drag` 触发兜底
- 合规 banner 必显（前端硬编码，不依赖 agent 输出）

### 4) 数据库

**无新表**。Crisis session 走现有 research chat session 机制。

**可选**：未来若要评估"Crisis 模式是否真让用户冷静"，加 `crisis_sessions` 表记录：`session_id / triggered_at / turns / user_action_after_24h`（用户 24h 内是否改了持仓）——V1 不做，先看 CTR 和会话时长。

### 5) Agent 模块

**Model**：`gemini-3.1-flash-lite-preview`

**第一轮 Pydantic**：
```python
class CrisisGreeting(BaseModel):
    empathy: str           # ≤ 60 字
    history: str           # ≤ 100 字
    thesis_question: str   # ≤ 50 字
```

**后续自由对话**：复用现有 research agent，instruction 增加 Crisis 段持续生效。

**Lint 规则**：
- `empathy / history / thesis_question` 不得含禁用词
- `history` 必须引用 `historical_analogs` 中出现的 `start_date` 或 `drawdown_pct`
- `thesis_question` 必须是**问句**（以 `?` 或 `？` 结尾，或包含反问词 `吗 / 呢 / 还`）

**评估**：
1. Golden set 10 典型 crisis 场景 → 人工审阅三段是否都符合约束（≥ 80%）
2. 上线后指标：
   - `crisis_mode_triggered_per_week`（敏感度）
   - `crisis_session_msg_count_median`（> 3 说明用户真在对话，不是一点就关）
   - `post_crisis_24h_portfolio_change_rate`（< 20% = 成功让用户没乱动）
   - FeedbackBar `target_type='crisis_greeting'` 👍 率 > 50%

### 6) Rollout & 回归防护

- **Feature flag**：`ENABLE_CRISIS_MODE`（staging on → 灰度 10% → 100%）
- **回归**：
  - [ ] `/research?mode=crisis` 缺 context 时 → 降级为普通 research 模式 + 一个 banner
  - [ ] 3y 价格数据缺失 → analogs=[]，agent 仍出完整三段（历史段走保守文案）
  - [ ] VIX 拉取失败 → drag 单判定仍能触发
  - [ ] **持仓含 30% $CASH → `backtest_composite_value` 返回完整 3y 曲线（$CASH 段为水平线）；`analogs` 非空**（Deep Audit）
  - [ ] 合规 banner 在 agent 失败时也必显
  - [ ] 用户直接访问 `/research` 无 `mode=crisis` → 行为与改造前位级一致
- **指标**：同 5)

### U2-C 交付 Checklist

| # | 任务 | Owner | 状态 |
|---|---|---|---|
| C1 | `historical_analogs.py::find_similar_drawdowns()` + 单测 | 后端 | ⏳ |
| C2 | `backtest_composite_value()`（用当前权重回测 3y，**`$CASH` 生成常数 1.0 序列参与加权**，Deep Audit） | 后端 | ⏳ |
| C3 | `build_crisis_context()` + `should_enter_crisis_mode()` | 后端 | ⏳ |
| C4 | Research agent 扩展 `mode="crisis"` 分支 + 三段式 instruction + lint | 后端 | ⏳ |
| C5 | `POST /api/research/crisis-init` 端点 | 后端 | ⏳ |
| C6 | `/research` 前端解析 `mode` + `<CrisisModeBanner>` + 首条自动生成 | 前端 | ⏳ |
| C7 | U0-B ActionBar 红态"与 AI 讨论" chip link 对接 | 前端 | ⏳ |
| C8 | Golden set 10 case + 合规审查 + 灰度 | 全栈 | ⏳ |

**DoD**：
- Golden set 三段式满足率 ≥ 80%、lint pass ≥ 98%
- 合规 banner 必显（静态渲染测试）
- 5 位内测触发 Crisis 后会话中位 ≥ 3 轮
- 24h 内"用户未乱动持仓"比例 > 70%（小样本观察，非硬指标）

---

## LLD Unit U2-D · 月度 AI 回顾（懒触发 Modal）

> Scope: `GET /api/monthly-recap` 聚合端点（SQL 统计 + narrative agent）+ 画像更新建议（不自动覆盖）+ 懒触发 Modal
> Depends: U1-B `portfolio_health_reports`（90 天趋势）、U1-C `ai_feedback` + `suggestion_tracking`（hit rate + outcomes）、U0-A `user_investment_profiles`（写回）
> Status: LLD Ready.

### 1) 实现目标（Work backward）

用户心智："每个月让我感觉它进步了。" → 月初第一次进 /for-you 弹 Modal `"3 月的你"`：健康分曲线 ↑ / 反馈准确率 / 建议 outcome / 画像更新**建议**（不自动改）。**用户点确认才写**。

### 2) 正向分析

- **合力**：把 P1 三条线（体检 / 反馈 / 建议追踪）在**月度粒度**汇总——每条线的单点数据都是静态的，月度聚合后呈现"系统在学你"的叙事，是记忆闭环的最高形态。
- **涌现基础**：画像更新**建议**而非自动——建立"系统 → 用户"的协商关系；长期积累的画像演化记录可用于 V2 的"用户画像演化曲线"展示。
- **AI 分工**：
  - SQL 聚合 (0 LLM)：health_score 序列、feedback counts、outcome hit rate、thesis 关键词词频
  - LLM (~1000 token) 只做 `summary_markdown` 和 `profile_update_hints` 两段结构化叙事
- **成本可控**：月度 1 次 × ~$0.005/人 = $0.005/月/用户。

### 3) 架构 & 前后端细节

```
backend/app/features/monthly_recap/    ← 新 feature module（一次性、轻量）
├── .context.md
├── router.py          # GET /api/monthly-recap
├── service.py         # data_part 聚合 + 缓存
├── aggregator.py      # SQL 聚合纯函数（可单测）
├── agent.py           # narrative agent
└── models.py
```

**端点**：

| Method | Path | 用途 | 缓存 |
|---|---|---|---|
| GET | `/api/monthly-recap?month=2026-03` | 月度回顾聚合 | 月末后不变 → 永久缓存 |
| POST | `/api/profile/apply-hint` | 用户确认应用画像 hint | — |

**Request**：`?month` 可空，默认 last_month（即当前月减一）

**响应结构**：

```python
class MonthlyDataPart(BaseModel):
    health_score_series: list[tuple[date, int]]    # 按日最多 30 点
    feedback_counts:     dict[str, int]            # {👍: 12, 👎: 4}
    feedback_hit_rate:   float                     # 👍 / (👍+👎)
    suggestion_outcomes: list[OutcomeSummary]      # 2 对 / 1 错 / 1 观察中
    thesis_keyword_cloud: list[tuple[str, int]]   # 词频 top-10
    portfolio_snapshot:  HoldingsSnapshot          # 月末持仓

class ProfileUpdateHint(BaseModel):
    field: Literal["style", "horizon", "risk_tolerance"]
    current: str
    suggested: str
    reason: str                                    # ≤ 80 字
    evidence_keys: list[str]                       # 聚合数据中的依据 id

class MonthlyRecap(BaseModel):
    month: date
    data: MonthlyDataPart
    summary_markdown: str                          # LLM, ≤ 500 字
    profile_update_hints: list[ProfileUpdateHint]  # 0-3 条
    cache_key: str
```

**SQL 聚合**（纯 Python，可单测）：

```python
def aggregate_month(user_id: str, month: date) -> MonthlyDataPart:
    health = health_db.query_scores_between(user_id, month.start, month.end)
    fb_rows = feedback_db.query_between(user_id, month.start, month.end)
    fb_counts = Counter(r.sentiment for r in fb_rows)
    sugg = tracking_db.query_between(user_id, month.start, month.end)
    outcomes = [OutcomeSummary(...) for s in sugg if s.outcome]
    theses = portfolio_db.get_theses(user_id)
    keyword_cloud = _compute_keyword_cloud([t.thesis for t in theses if t.thesis])
    return MonthlyDataPart(...)
```

**Narrative Agent**（`gemini-3.1-flash-lite-preview`）：

Input：
```
## 你的月度数据
- health_score: 3/1 58 → 3/31 65 (+7)
- feedback: 12 👍 / 4 👎 (准确率 75%)
- 建议追踪: 3 条, 2 对 1 观察中
- thesis 关键词 top 3: "长期"×6, "AI 基建"×3, "分红"×2
- 当前画像: passive / long / moderate

## 任务
(a) 写 3-5 段 summary_markdown, 每段引用具体数字
(b) 若任何字段有明显倾向, 提最多 3 条 profile_update_hints
    - 关键词 60% 以上长期相关 → hint: horizon long→long (无变化则 skip)
    - 建议对错率高 → hint: risk_tolerance 可考虑升/降
    - style 保持 (被动用户不动)
```

输出 Pydantic 强约束，禁用词：`应当 / 必须 / 建议您`（hint 是协商，不是命令）。

**前端**：

```
frontend/src/components/for-you/recap/
├── MonthlyRecapModal.tsx       # Radix Dialog
├── HealthScoreSparkline.tsx    # 曲线
├── OutcomeChips.tsx            # 对 / 错 / 观察中
└── ProfileHintCard.tsx         # 每条 hint 带 [确认] [保持]
```

懒触发判定（前端 `ForYouContent` 顶层）：

```tsx
const [lastRecapMonth] = useLocalStorage('last_recap_seen_month', null);
const thisMonth = format(new Date(), 'yyyy-MM');
const showRecap = thisMonth !== lastRecapMonth
                  && getDate(new Date()) >= 1        // 月初才弹
                  && hasData();                      // 有体检/反馈数据
```

用户关闭 → 写 `lastRecapMonth = thisMonth`，本月不再弹。

**画像 hint 应用**：

```
POST /api/profile/apply-hint
  body: { field, suggested, evidence_keys }
  → 更新 user_investment_profiles.{field}, version++
  → toast "画像已更新"
  → invalidate ['profile'] → ActionBar 重新生成 (U0-B cache 因 version++ miss)
```

**不接受** = 什么都不做；下次月度 Modal 可能再次提示（基于新一月的数据）。

**避免 regression**：
- 新 feature module，与所有现有模块解耦
- narrative agent 失败 → 返回 `summary_markdown=""` + `profile_update_hints=[]`（Modal 仍显示 data 段）
- 无体检历史 / 无反馈 → 提前返回 `hasData=false`，前端不弹
- 老用户首月体验：数据不足时显示"下个月再见面"兜底文案，不弹 hint

### 4) 数据库

**无新表**。全部 SELECT 现有 U1-B / U1-C 表。

**缓存**：`monthly_recap:{user_id}:{month}` Redis/Runtime Cache 永久（月末后数据不变）。

**可选**：若要做"画像演化曲线"（V2），加 `user_profile_history` 审计表；V1 不做。

### 5) Agent 模块

见 3)。评估：
- Golden set 10 月度场景（含进步 / 退步 / 平稳 / 数据稀疏 4 种）→ 人工判 narrative 合理性（≥ 80%）
- hint 采纳率：目标 ≥ 30%（过高说明建议太随意，过低说明建议没信号）
- 上线后：`monthly_recap_open_rate`（月初 7 天内打开率目标 > 50%）、`hint_apply_rate`、`hint_dismiss_rate`

### 6) Rollout & 回归防护

- **Feature flag**：`ENABLE_MONTHLY_RECAP`
- **回归**：
  - [ ] 无 U1-B 数据 → `hasData=false`，Modal 不弹
  - [ ] 跨年月（2026-12 → 2027-01）→ 月份解析正确
  - [ ] 用户手动 `POST /profile/apply-hint` 两次同一 hint → version++ 两次但不报错（幂等）
  - [ ] Agent 超时 → Modal 仅显示 data 部分，用户体验降级不崩
- **指标**：同 5)

### U2-D 交付 Checklist

| # | 任务 | Owner | 状态 |
|---|---|---|---|
| D1 | `aggregator.py` SQL 聚合 4 项（health / feedback / outcome / keyword）+ 单测 | 后端 | ⏳ |
| D2 | Narrative agent + Pydantic + lint（禁命令词） | 后端 | ⏳ |
| D3 | `GET /api/monthly-recap` + Runtime Cache | 后端 | ⏳ |
| D4 | `POST /api/profile/apply-hint` + version++ | 后端 | ⏳ |
| D5 | `<MonthlyRecapModal>` + 懒触发 + localStorage 记忆 | 前端 | ⏳ |
| D6 | `<HealthScoreSparkline>` + `<OutcomeChips>` + `<ProfileHintCard>` | 前端 | ⏳ |
| D7 | Golden set 10 场景 + 灰度 | 全栈 | ⏳ |

**DoD**：
- 聚合 SQL 单测覆盖 4 分支
- narrative 10 场景人工评审 ≥ 80% 合理
- 内测首月 5 位用户至少 3 位打开 Modal、2 位采纳一条 hint
- Modal 关闭后同月不再弹（localStorage 验证）

---

## 实施步骤

### Phase 2A · What-If（~3d）

1. [ ] 重构 P1 `calc_health_score()` 接受任意 portfolio 入参
2. [ ] `apply_modifications()` 纯函数
3. [ ] `/api/portfolio/whatif` 端点 + agent
4. [ ] 前端 WhatIfSheet + 4 预设 + 接入 `[⋯]` 菜单

### Phase 2B · 跨持仓连线（~2.5d）

5. [ ] `/api/brew/connections` 端点 + Connection agent
6. [ ] `DigestInlineReport` 底部新 section
7. [ ] 每条 Connection 接入 FeedbackBar（P1 已建）
8. [ ] 周度 cache + 对比上周防重复

### Phase 2C · Crisis Mode（~2d）

9. [ ] 前端触发条件（按画像动态阈值）
10. [ ] `/research?mode=crisis` 入口 + 第一轮强制模板
11. [ ] 历史相似回撤计算工具（yfinance 3y）

### Phase 2D · 月度复盘（~2d）

12. [ ] `/api/monthly-recap` 聚合端点
13. [ ] 叙事 agent（聚合数据 → 段落 + 画像建议）
14. [ ] Modal 组件 + 懒触发判定

**总工期**：~9.5 天，4 个子阶段独立可分发。

## 前置依赖（P0 + P1 全部就位）

- `effective_weight` (P0)
- `user_investment_profiles` (P0)
- `calc_health_score()` 可复用函数（P1）
- `theses` + `recent_feedback` (P1)
- FeedbackBar 组件 (P1)

## 待定问题

1. **What-If 自由文本**：V1 只支持 4 预设，根据使用量决定是否开放自由输入。
2. **连线 agent 与上周对比去重**：存上周输出摘要进 prompt，让 agent 主动避重。阈值待调。
3. **Crisis Mode 阈值**：按画像动态；是否允许用户在 `/settings` 里手动调？V1 不暴露。
4. **成本**：按周 connections + 每月 recap + 任意 what-if ≈ $0.05 / 用户 / 月。可接受。
