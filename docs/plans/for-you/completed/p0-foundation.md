# P0 · 基础层：持仓输入 + 决策带 + 画像

> Status: Planning
> Priority: P0（阻塞 P1/P2）
> Related: features/brew/.context.md, frontend/src/app/for-you/.context.md
> Vision: roadmap.md > 专属系统 > 持仓管理 / 投资者画像 / 每日报告升级

## 目的

为所有后续个性化能力搭好**数据地基**：让系统知道用户的**仓位权重**、**投资者画像**和**当下应关注什么**。P0 自身就是一次可感知的产品升级（Action Bar + 3 步 onboarding），同时解锁 P1/P2。

## 用户心智

> "我不想翻券商 App 数股数，大概拖一拖就行；不想填问卷，问我两个二选一就够了；打开页面只想 10 秒知道今天有没有事。"

## User Stories

### US-1 · 新用户 3 步 Onboarding（< 45 秒）

```
Step 1 [10s] 你现在主要怎么投资？     [长期持有] [中期] [短期交易]
Step 2 [10s] 组合回撤 20% 你会？     [想卖] [能忍] [当机会加仓]
Step 3 [30s] 加 3-5 只股票，可跳过（默认 SPY）
→ 落地主页，立即看到个性化 Action Bar
```

### US-2 · 零摩擦录入持仓

```
"管理持仓" 页：
  默认滑块模式：每只股票一条 0-100% 滑竿
  切换 "股数" 模式：输入 shares + 可选 cost_basis
  底部 [跳过，均分给我] 一键等权
→ 无论哪档，后端统一返回 effective_weight_pct
```

### US-3 · 每日 10 秒心智

```
早上打开 /for-you：
  🟢 今天组合稳定（-0.3%，跟随大盘），没有需要立即关注的事。
→ 关掉去上班。沉默即价值。
```

### US-4 · 有事件的一天

```
  🟡 今天稳定，但 3 天后 NVDA 财报（占仓 32%） · 科技集中度 78%
     [查看财报前瞻]  [一键体检]  [关闭提示]
→ 一步直达关键行动，不用翻 digest。
```

### US-5 · 危机日

```
  🔴 组合今日 -6.2%，VIX 升至 28。你当初的 thesis 还成立吗？
     [查看持仓明细]  [与 AI 讨论]
→ 不催交易；稳住情绪。
```

## 需求维度覆盖

| 维度 | 本层落地 |
|---|---|
| 10 秒结论 | ✔ Action Bar 三态 + headline + 最多 3 chips |
| 加权个性化 | ✔ `effective_weight_pct` 统一抽象 |
| 画像感知 | ✔ `user_investment_profiles` 表 + agent instruction 注入工具 |
| 低摩擦录入 | ✔ 三档精度（均分 / 滑块 / 股数） |
| 为 P1/P2 预留 | ✔ `thesis/target/conviction` 字段一次加齐，后续不再迁移 |

## 设计

### 数据模型

```sql
-- 持仓（一次加齐所有相关字段，避免二次迁移）
CREATE TABLE user_portfolios (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL,
  symbol      TEXT NOT NULL,

  weight_pct  NUMERIC(5,2),   -- 滑块模式输入的百分比（0-100），可空
  shares      NUMERIC(18,6),  -- 股数模式，可空
  cost_basis  NUMERIC(18,6),  -- 可选

  -- Memory 字段（P1 才填，这里只建字段不加逻辑）
  thesis      TEXT,
  target      NUMERIC(18,6),
  stop_loss   NUMERIC(18,6),
  conviction  SMALLINT,        -- 1-5

  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, symbol)
);

-- 投资者画像
CREATE TABLE user_investment_profiles (
  user_id         TEXT PRIMARY KEY,
  style           TEXT,      -- passive | balanced | active
  horizon         TEXT,      -- short | mid | long
  risk_tolerance  TEXT,      -- low | moderate | high
  notify_mode     TEXT,      -- silent | events_only | daily  (默认 events_only)
  onboarded_at    TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ DEFAULT now()
);
```

**约束**：所有字段都可 NULL；空画像 / 空持仓仍能用（默认 `moderate passive long` + 等权）。

### `effective_weight_pct` 推断

四级优先级:
```
1. if shares 非空 and price 可得:
     weight = shares * price / Σ(shares_i * price_i)
2. if cost_basis (模拟金额) 非空:
     weight = cost_basis / Σ(cost_basis_i)       # 金额比例，不需要实时价
3. elif weight_pct 非空:
     weight = weight_pct / Σ(weight_pct_i)       # 自动归一化
4. else:
     weight = 1 / n_holdings                      # 等权兜底
```

`weight_source` 标记: `"shares_x_price"` / `"cost_basis"` / `"weight_pct"` / `"equal"`。
前端只读 `effective_weight_pct` + `weight_source`，不关心后端怎么推的。
模拟持仓页主要走 Mode 2 (cost_basis)；旧 weight_pct 数据走 Mode 3 (向后兼容)。

### Action Bar 生成（规则引擎 + LLM 混合）

**分工**：signal 选择 + 严重度 + chip 跳转走规则（确定、可测、<50ms、关键决策不交给模型）；headline/chip 文案走 LLM（画像驱动的"人话"语气）。这是"**数据决策规则定、语言表达 AI 定**"的经典组合。

```python
def build_action_bar(user_id) -> ActionBar:
    digest   = get_latest_digest(user_id)
    insights = get_latest_insights(user_id)    # P1 接入, 缺省忽略
    top_ev   = digest.top_event                # P1 接入, 缺省忽略
    profile  = get_user_profile(user_id)

    # 1) 规则层: 决定 signals (颜色 / 跳转目标 / chip 结构)
    signals = []
    if digest.portfolio_daily_change < -5 * profile.risk_factor:
        signals.append(Signal("red", "drawdown", digest))
    if insights and insights.health_score < 40:
        signals.append(Signal("yellow", "health", insights))
    if top_ev and top_ev.severity in ("watch", "urgent"):
        signals.append(Signal("yellow", "event", top_ev))
    if not signals:
        signals.append(Signal("green", "stable", digest))

    severity = max_severity(signals)

    # 2) 文案层
    cache_key = hash((tuple(s.kind for s in signals), profile.version))
    if severity == "green":
        headline = template_headline(signals, profile)          # 稳定日直接模板, 0 成本
    else:
        headline = cache.get_or_set(cache_key, lambda:
            llm_polish_headline(signals, profile))              # 黄/红才调 LLM

    return ActionBar(
        severity=severity,
        headline=headline,
        chips=[build_chip(s) for s in signals[:3]],
    )
```

**LLM 调用约束**：

- 模型：`gemini-3.1-flash-lite-preview`（现有栈）
- Input：signals 结构化摘要 + 画像（style/horizon/risk）
- Output：Pydantic `{headline: str, chip_labels: list[str]}`，headline ≤ 40 字
- 超时 800ms；失败 fallback 到 `template_headline()`
- Cache：按 `(signals 结构, profile 版本)` hash，一天内同输入同输出
- **禁止**：LLM 决定 severity / 跳转目标 / 是否显示 — 只给文案自由度
- **禁止**：引入 signals 中不存在的数据（"跌 6.2%" 必须来自 `digest.portfolio_daily_change`）

**成本预估**：绿态 0 调用；黄/红态一天内 cache 命中 → 实际 < $0.0001 / 用户 / 天。

### 画像在 prompt 的注入

所有生成式 agent（brew / health / research）的 instruction 顶部加：

```
## 用户画像
- 投资风格: {style}
- 投资期限: {horizon}
- 风险容忍: {risk_tolerance}
根据画像调整语气、建议力度、风险措辞。
```

实现是一行工具函数 `inject_profile(instruction, profile)`，各 agent 调用时拼到 prompt 最前面。

### 通知偏好 `notify_mode`

| 值 | 行为 |
|---|---|
| `silent` | 永远不发邮件；Action Bar 仅 red 时显示 |
| `events_only`（默认） | 仅事件日 / 体检异常日发邮件 |
| `daily` | 每日 digest 邮件（现状） |

## LLD Unit U0-A · 数据地基 + Onboarding + 持仓录入

> Scope: F0.1 Schema + CRUD / F0.2 Onboarding / F0.3 持仓录入页
> Reason for bundling: 三者共享 `user_portfolios` + `user_investment_profiles` 表与 `effective_weight_pct` 推断函数，强耦合；任何一个单独交付都会产生半成品数据或临时 UI。
> Status: LLD Ready.

### F0.1 · Schema + CRUD

#### 1) 实现目标（Work backward）

用户说法："大概拖一拖就行，别让我数股数。" → 三档精度：均分 / 滑块百分比 / 股数，每档都能出 `effective_weight_pct`，下游一视同仁。用户**永远可空**：空画像 = moderate passive long，空持仓 = 不展示专属卡片，静默失败而非报错。

#### 2) 正向分析

- **合力**：brew、digest、screener、research 都能读 `user_portfolios` → 真正 per-user 生成，不再靠前端传 `symbols`。
- **解锁**：P1 `effective_weight` 体检 / P1 top_event 按持仓加权 / P2 What-If / P2 Crisis 都依赖这张表。
- **涌现基础**：`thesis` + `conviction` + `target` / `stop_loss` 字段一次加齐，为 P1 记忆闭环和 P2 月度复盘"画像演化"预留。

#### 3) 架构 & 前后端细节

```
backend/app/features/portfolio/        # 新 feature module, 不动已有 brew/screener
├── __init__.py
├── .context.md                        # 必建, 声明 schema 来源和 CRUD 契约
├── router.py                          # /api/portfolio/* 端点
├── service.py                         # effective_weight 推断 + portfolio summary
├── db.py                              # portfolio_db + profile_db (双表都在此)
└── models.py                          # Pydantic request/response
```

端点清单（全部 `Depends(verify_user_token)`）：

| Method | Path | 用途 |
|---|---|---|
| GET | `/api/portfolio` | 返回当前用户所有持仓 + effective_weight |
| PUT | `/api/portfolio/bulk` | 整组替换（onboarding / 录入页保存） |
| PATCH | `/api/portfolio/{symbol}` | 单行更新（后续 thesis / conviction 追加用） |
| DELETE | `/api/portfolio/{symbol}` | 删除一行 |
| GET | `/api/profile` | 返回画像（缺省填默认值） |
| PUT | `/api/profile` | 整体更新画像 |

**Insforge Edge Function 边界**：schema migration + 直接读写都走 Edge Function（平台惯例），后端通过 `shared/insforge/` 调用。不绕过 Edge 直连 PG。

**避免 regression**：
- **完全不触碰**`backend/app/services/` 和 `backend/app/models/`（死代码禁区）。
- 现有 brew / screener 的 watchlist/prefs 逻辑**并行保留**；V1 不迁移，P1 `digest` 改造时再统一读 `user_portfolios`。
- 现 `/for-you` 页面的 `symbols` 参数保留兼容；新增 `use_portfolio=true` 可选开关，默认 false，逐个页面切换。

**前端**：
- `frontend/src/hooks/queries/usePortfolio.ts`（TanStack Query）：`usePortfolio()` / `useSavePortfolio()` / `useProfile()` / `useSaveProfile()`。
- 缓存 key：`['portfolio', userId]` / `['profile', userId]`；bulk 保存后 `invalidateQueries(['portfolio'])` 即刷新所有页面。
- Optimistic update：保存按钮点击瞬间先改 cache，失败回滚 + toast。
- Loading / empty 状态：未登录 → 不请求；已登录无持仓 → 返回 `[]`，前端渲染 onboarding 引导。

#### 4) 数据库设计

**表 1 · `user_portfolios`**

```sql
CREATE TABLE user_portfolios (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL,
  symbol      TEXT NOT NULL,

  -- 精度三档: 任何一档非空即可
  weight_pct  NUMERIC(5,2),        -- 0-100, 滑块输入
  shares      NUMERIC(18,6),       -- 股数输入
  cost_basis  NUMERIC(18,6),       -- 可选, P1 月度复盘用

  -- P1 记忆闭环字段 (本期只建列, 不写入逻辑)
  thesis      TEXT,                 -- ≤ 140 字用户本意
  target      NUMERIC(18,6),        -- 目标价
  stop_loss   NUMERIC(18,6),
  conviction  SMALLINT,             -- 1-5, 信心度

  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),

  UNIQUE(user_id, symbol)
);

CREATE INDEX idx_user_portfolios_user ON user_portfolios(user_id);
```

**性能与取舍**：
- `(user_id, symbol)` UNIQUE 自带复合索引，`user_id` 单列再加一个查询索引即可。
- 所有字段**一次加齐**（`thesis` / `target` / `stop_loss` / `conviction`），避免 P1 再 ALTER TABLE。空值成本 = 1 byte / 列 / 行，可忽略。
- 不引入 `is_active` 软删除：被动投资者组合稀疏，DELETE 一行成本低于维护 WHERE 过滤。
- ETF 穿透（如 SPY → 板块明细）**V1 不做**，ETF 统一归 "Index" 板块，避免建 `etf_constituents` 巨表。P2 再评估。

**表 2 · `user_investment_profiles`**

```sql
CREATE TABLE user_investment_profiles (
  user_id         TEXT PRIMARY KEY,
  style           TEXT,             -- passive | balanced | active
  horizon         TEXT,             -- short | mid | long
  risk_tolerance  TEXT,             -- low | moderate | high
  notify_mode     TEXT DEFAULT 'events_only',  -- silent | events_only | daily

  -- 预留拓展
  version         INTEGER DEFAULT 1,            -- 画像改动版本, Action Bar cache key 用
  onboarded_at    TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ DEFAULT now()
);
```

**为什么不用 JSONB `preferences` 一把梭**：
- 3 个核心字段是热读路径（每次 agent 调用都要），独立列 + 索引更快。
- JSONB 查询写法冗长，且字段治理不如显式列清楚。
- 扩展字段（未来加 `sector_bias` 等）V2 再加 `metadata JSONB`。

**`effective_weight_pct` 推断**（见"设计"节已定义）放在 `service.py`，**纯函数**接受 `(rows, prices_map)` 返回 `list[HoldingView]`，不触表；方便 P2 What-If 直接复用。

#### 5) Agent 模块 · `inject_profile()`

虽然 F0.1 本体无 agent，`inject_profile()` 是**所有后续 agent 的前置依赖**，这里一起定义：

```python
# backend/app/shared/profile_context.py
def inject_profile(instruction: str, profile: Profile | None) -> str:
    if not profile:
        profile = Profile(style="passive", horizon="long", risk_tolerance="moderate")
    header = f"""## 用户画像
- 投资风格: {profile.style}
- 投资期限: {profile.horizon}
- 风险容忍: {profile.risk_tolerance}

根据画像调整语气、建议力度、风险措辞。对 long 用户避免短期噪音,
对 low 风险容忍用户避免激进措辞 (例: "重仓" / "抄底")。
"""
    return header + "\n" + instruction
```

**初步接入**：brew agent + research agent 启动时各加一行 `instruction = inject_profile(instruction, profile)`。

**评估**：
1. **A/B 离线**：固定 10 个输入，对 `{passive+low, active+high, balanced+moderate}` 3 种画像生成；人工检查语气是否真的变化（不变化 = 画像没起作用）。
2. **规则 lint**：输出里出现 `["重仓", "梭哈", "抄底"]` 却画像是 `risk_tolerance=low` → 标记异常。
3. **用户反馈**：P1 FeedbackBar 上线后按画像分组看 👍 率差异。
4. **迭代**：若某类语气错配反复出现，把具体反例加进 `inject_profile` 的 few-shot 段。

#### 6) Rollout & 回归防护

- **迁移脚本**：Edge Function 幂等 `CREATE TABLE IF NOT EXISTS`；先 staging 跑 3 天观察。
- **双写 / 兼容**：旧 watchlist 字段保留，新 `user_portfolios` 独立表。当用户**首次**保存持仓时才写入新表。
- **回归测试清单**：
  - [ ] 未 onboarding 用户打开 /for-you → 不报 500，显示引导卡
  - [ ] 旧用户（无 `user_portfolios` 行）→ brew digest 按现状生成
  - [ ] 空 `user_investment_profiles` → `inject_profile` 填默认值，不抛异常
- **指标**：`portfolio_rows_per_user` 分布、`profile_onboarded_rate`、保存接口 p95 延迟。

---

### F0.2 · Onboarding 3 步流

#### 1) 实现目标

用户："别给我问卷。" → 3 步 × 2 个二选一 + 1 个可跳过的添股，**<45s**。每步可跳，跳完即走默认值。关键是**立即看到个性化**：完成最后一步的 3 秒内，Action Bar 已经反映新画像。

#### 2) 正向分析

- **降低冷启动负熵**：空画像 + 空持仓页面价值低，第一次互动就把信息摄入做完。
- **合力**：Step 3 录入的股票直接复用 F0.3 的 `<PortfolioSliderList>` 子组件，不重复造。
- **涌现基础**：`onboarded_at` 字段用于 P2 月度复盘"自你 X 月进来，健康分 +Y"。

#### 3) 架构 & 前后端细节

**路由**：`/for-you/onboarding`（新 route）。**不**放在注册流里 — 被动用户注册后通常立刻想看内容，Onboarding 出现在**首次**点 `/for-you` 时，可随时 ✕ 关掉稍后来做。

**触发判定**（前端 `ForYouContent` 顶层）：

```tsx
const { data: profile } = useProfile();
const [dismissed] = useLocalStorage('onboarding_dismissed_at', null);

const shouldShowOnboarding =
  !profile?.onboarded_at
  && (!dismissed || daysSince(dismissed) > 7);   // 关掉 7 天后再提醒一次
```

**3 步 Stepper 状态机**：

```
URL: /for-you/onboarding?step=1
  Step 1 → style (passive | balanced | active)
  Step 2 → risk_tolerance (low | moderate | high)  // 从回撤反应推导
  Step 3 → symbols + 均分 (optional)
  [完成] → PUT /profile + PUT /portfolio/bulk (并行) → navigate('/for-you')
  [跳过] → PUT /profile (只填已选的) → navigate('/for-you')
```

- URL query 存 step → 刷新不丢进度，支持浏览器后退
- 每步有 `[跳过]` 和 `[上一步]`，step 1 的跳过 = 关闭整个 onboarding
- `horizon` 从 style 推断（passive → long, active → short, balanced → mid）**V1 不单独问**，减一问

**UI 细节**：
- 使用现有 shadcn `<Card>` + `<RadioGroup>`，不造新组件
- Step 3 的股票输入复用 `useStockSearch` hook（现有）
- 进度条：顶部 3 段 `<Progress />`，当前段高亮 `--color-brand-primary`
- Step 3 的"均分" = 点了确定之后，不填 weight_pct/shares，后端 effective_weight 走 `1/n` fallback

**后端**：
- 无新端点，复用 F0.1 的 `PUT /api/profile` + `PUT /api/portfolio/bulk`
- 并行两个请求用 `Promise.all()`，任一失败 → toast 提示 + 已保存部分不回滚（画像和持仓独立）

**回归防护**：
- 已有用户（无 `onboarded_at`）→ 首次进 /for-you 弹 onboarding；用户可选不做
- 旧 `/for-you` 上已有持仓 symbols（prop 形式）时，不弹 onboarding；视为已"隐式 onboard"，Banner 提示"完善画像可启用更多功能"

#### 4) 数据库

无新表。写入 F0.1 已建的两张表。额外约束：`PUT /api/profile` 第一次成功时**原子**设置 `onboarded_at = now()`（SQL level `COALESCE(onboarded_at, now())`，避免后续更新覆盖）。

#### 5) Agent 模块

无。纯规则 UI 流。Onboarding 后第一次生成的 brew / digest 会自动带上新画像（因 `inject_profile`）。

#### 6) Rollout & 回归防护

- Feature flag：`NEXT_PUBLIC_ENABLE_ONBOARDING=true`，prod 灰度前置 false 以防预览环境弹。
- **回归**：
  - [ ] 老用户永远可 ✕ 关掉，关掉不影响使用
  - [ ] Step 3 跳过后 `/portfolio` 为空 → Action Bar 走默认文案不崩
  - [ ] 刷新页面保持在当前 step
- **指标**：`onboarding_start / step_complete / step_skip / total_complete` 漏斗，目标 60% 用户完成至少到 Step 2。

---

### F0.3 · 模拟持仓录入页

#### 1) 实现目标

用户："输入我大概买了多少钱就行。" → **模拟金额输入模式**。每只股票一个金额输入框，后端按 `cost_basis / Σ(cost_basis)` 计算权重。不填 = 等权分配。支持多币种标注（按 exchange 自动推断，不换算汇率）。

#### 2) 正向分析

- **低门槛**：金额比百分比更贴近用户认知（"我买了 5000 刀 AAPL"）
- **隐私友好**："模拟金额"降低输入真实数据的心理压力
- **DB 零成本**：复用现有 `cost_basis` 列，无需 migration
- **涌现基础**：cost_basis 直接服务 P2 月度复盘"年化收益对比"

#### 3) 架构 & 前后端细节

**路由**：`/for-you/portfolio`（Max 专属，PaywallGuard 门控）。入口：`/for-you` toolbar `[模拟持仓]` + 顶部导航 dropdown。

**UI**：

```
┌───────────────────────────────────────────────┐
│ [搜索股票代码或名称...]            3/30       │
├───────────────────────────────────────────────┤
│ AAPL    苹果              USD  [$  5,000 ] [×]│
│ 7203    丰田汽车          JPY  [¥500,000 ] [×]│
│ NVDA    英伟达            USD  [$  3,000 ] [×]│
│ $CASH   现金              USD  [$  2,000 ] [×]│
├───────────────────────────────────────────────┤
│ USD 总计: $10,000  |  JPY 总计: ¥500,000     │
│ (不填金额 = 等权分配 · 跨币种权重为近似值)    │
│                                   [保存持仓]  │
└───────────────────────────────────────────────┘
```

**币种推断**：
- 美股 (纯字母 symbol): USD / $
- 日股 (纯数字 symbol): JPY / ¥
- 港股 (.HK 后缀): HKD / HK$
- $CASH: USD / $
- 默认: USD / $

**组件**：单文件 `portfolio/page.tsx`，不拆子组件。

**保存**：
- `PUT /api/portfolio/bulk`，传 `{ symbol, cost_basis: amount }`
- 保存后 invalidate `['portfolio']` + `['digest']`
- 最多 30 行

**权重计算 (后端 `service.py`)**：

新增 Mode 1.5 (cost_basis)，优先级: shares×price > **cost_basis** > weight_pct > equal。
```python
effective_weight = cost_basis_i / Σ(cost_basis) × 100
```
不需要实时价格。$CASH 的 cost_basis 正常参与（表示现金头寸大小）。
跨币种时直接用原始数字（近似但够用）。

#### 4) 数据库

无新表、无新列。复用 `cost_basis NUMERIC(18,6)`。

#### 5) Agent 模块

无。

#### 6) Rollout & 回归防护

- 旧 watchlist 与新 portfolio **共存**，关注列表 = 纯 symbol 观察，模拟持仓 = 带金额
- **回归**：
  - [ ] 保存空数组 → 后端清空 + 前端显示"已清空"
  - [ ] 网络失败 → 本地编辑状态不丢失
  - [ ] 已有 weight_pct 数据的用户 → Mode 2 仍生效（向后兼容）
- **指标**：`portfolio_save_success_rate`、`median_symbols_per_user`（目标 5-8）、有金额 vs 无金额用户比。

---

### Audit Integration（R-1 / R-2 / R-5.1）

审计报告（`audit-report.md`）三条修正合并入 U0-A，均为就地增量、不作独立 Unit。

#### R-1 · `$CASH` 头寸 + ETF 穿透（影响 F0.1 / F0.3）

- **DB 不改**：`$CASH` 作为合法 `symbol` 直接存入 `user_portfolios`；`weight_pct` 或 `shares` 任一档均可录入
- **F0.3 UI**：搜索栏上方**固定顶置**"添加现金头寸 ($CASH · USD)"快捷按钮，已添加后自动隐藏；`$CASH` symbol 在所有渲染点**不可点击**（无链接到 `/stock/$CASH`），仅 USD
- **新共享文件**：`backend/app/features/portfolio/exposure_parser.py`
  ```python
  ETF_SECTOR_MAP: dict[str, dict[str, float]] = {
      "SPY":  {"Technology": 0.30, "Financials": 0.13, "Healthcare": 0.12,
               "Consumer Cyclical": 0.10, "Others": 0.35},
      "QQQ":  {"Technology": 0.50, "Communication Services": 0.15,
               "Consumer Cyclical": 0.15, "Others": 0.20},
      "XLK":  {"Technology": 1.0},
      "XLF":  {"Financials": 1.0},
      "VTI":  {"Technology": 0.27, "Financials": 0.13, "Healthcare": 0.13,
               "Consumer Cyclical": 0.11, "Others": 0.36},
      # ... Top 50 主流宽基 / 行业 ETF, 静态维护
  }
  CASH_SYMBOL = "$CASH"

  def get_true_exposure(holdings: list[HoldingView]) -> dict[str, float]:
      exposure: dict[str, float] = defaultdict(float)
      for h in holdings:
          w = h.effective_weight_pct / 100.0
          if h.symbol == CASH_SYMBOL:
              exposure["Cash"] += w
          elif h.symbol in ETF_SECTOR_MAP:
              for sector, ratio in ETF_SECTOR_MAP[h.symbol].items():
                  exposure[sector] += w * ratio
          else:
              sector = get_company_profile(h.symbol).sector or "Unknown"
              exposure[sector] += w
      return dict(exposure)
  ```
- `exposure_parser` 是**纯函数**（不调外部 API，profile 查缓存），U1-B `scoring.py` 直接消费
- **数据网关 `$CASH` 拦截**（Deep Audit 追加）：`shared/data_tools/` 所有对外价格/ profile / returns 批量接口**统一**在入口拦截 `$CASH`，**不**向 FMP / yfinance 发起请求，且回填稳定常量：
  ```python
  # shared/data_tools/_cash_guard.py (新增, 所有 batch fetcher import)
  from app.features.portfolio.exposure_parser import CASH_SYMBOL

  def split_cash(symbols: list[str]) -> tuple[list[str], bool]:
      has_cash = CASH_SYMBOL in symbols
      return [s for s in symbols if s != CASH_SYMBOL], has_cash

  def inject_cash_price(prices: dict, has_cash: bool) -> dict:
      if has_cash: prices[CASH_SYMBOL] = 1.0            # 虚拟净值
      return prices

  def inject_cash_returns(returns: dict, has_cash: bool, n: int) -> dict:
      if has_cash: returns[CASH_SYMBOL] = [0.0] * n     # 无风险收益率近似 0
      return returns

  def inject_cash_profile(profiles: dict, has_cash: bool) -> dict:
      if has_cash: profiles[CASH_SYMBOL] = {            # dummy profile, 禁止基本面消费
          "symbol": CASH_SYMBOL, "sector": "Cash",
          "beta": 0.0, "market_cap": None, "is_virtual": True,
      }
      return profiles
  ```
  应用点（全部在**对外 API 调用前**做过滤，**调用后**回填）：
  - `get_price_series_batch(symbols, n)` → 跳过 $CASH 的 yfinance 拉取，回填 `[1.0]*n`
  - `get_historical_returns(symbols, period)` → 跳过，回填全 0 序列
  - `get_company_profiles_batch(symbols)` → 跳过，回填虚拟 profile
  - `fmp.get_grades_batch / get_headlines_batch`（U2-B 连线用）→ 跳过，返回 `{}`
  - 所有"按 symbol 查单条"的函数（`get_company_profile(single)`）显式 early-return 虚拟值
- **数据一致性保证**：回填后的 dict **必须**包含 $CASH key（非 None），消费侧（scoring / backtest / connections agent）可假设"输入 dict 对每个 symbol 都有 key"，不引入新的 None-check 分支
- **工期**：+0.25d（ETF_SECTOR_MAP 静态维护 + AddSymbolCombobox 顶置 + 单测） + **0.25d（_cash_guard + 6 处 data_tools 接入 + 单测，Deep Audit 追加）**

#### R-2 · 持仓保鲜期（影响 F0.1）

- `user_investment_profiles` schema 增列（A1 一次性加齐，零迁移）：
  ```sql
  portfolio_confirmed_at TIMESTAMPTZ DEFAULT now()
  ```
- 端点列表追加第 7 条：

  | Method | Path | 用途 |
  |---|---|---|
  | PATCH | `/api/portfolio/touch` | 仅刷新 `user_investment_profiles.portfolio_confirmed_at = now()` |

  行为：`Depends(verify_user_token)`；响应 `{confirmed_at: datetime}`；幂等；无 body
- `PUT /api/portfolio/bulk` 保存成功时**自动** touch（`portfolio_confirmed_at = now()`）——保证真编辑时自动刷新，无需前端多调
- **旧用户迁移**（A1 Edge Function 一次性）：
  ```sql
  INSERT INTO user_investment_profiles (user_id, portfolio_confirmed_at)
  SELECT DISTINCT user_id, registered_at FROM <legacy_user_table>
  ON CONFLICT (user_id) DO NOTHING;
  ```
- **工期**：+0.25d（一列 + 一端点 + 迁移 SQL）
- **下游**：U0-B 消费该字段触发 `staleness` Signal；U0-C 消费其 90d 阈值强制 silent

#### R-5.1 · 老用户 Onboarding Banner（影响 F0.2）

F0.2 "触发判定" 分支扩充：

```tsx
const { data: profile } = useProfile();
const [dismissed] = useLocalStorage('onboarding_dismissed_at', null);
const [bannerDismissed] = useLocalStorage('onboarding_banner_dismissed_at', null);
const isLegacyUser = hasLocalSymbolsOrSymbolsProp();     // URL / localStorage 有老数据

if (!profile?.onboarded_at) {
  if (isLegacyUser && (!bannerDismissed || daysSince(bannerDismissed) > 30)) {
    // 老用户：Banner（不打断阅读）
    return <OnboardingBanner />;
  }
  if (!dismissed || daysSince(dismissed) > 7) {
    // 新用户：全屏 modal（原设计）
    return <OnboardingModal />;
  }
}
```

`<OnboardingBanner>`：
- 渲染位置：`<ActionBar>` 下方单行，复用 U0-B 黄态 token（`--color-amber-soft-bg`），**不**新造视觉
- 文案："我们升级了专属页功能，花 30 秒完善画像可解锁持仓体检"
- 按钮：`[完善画像]` → `/for-you/onboarding?step=1` / `[稍后再说]` → 写 `bannerDismissed = now`
- **工期**：+0.25d（组件 + 触发分支）

#### Audit 工期汇总

| Delta | 工期 |
|---|---|
| R-1 exposure_parser + UI | +0.25d |
| R-2 schema 列 + /touch + 迁移 | +0.25d |
| R-5.1 Banner 分支 | +0.25d |
| **U0-A 合并后** | **~4.75d** |

---

### U0-A 交付 Checklist

| # | 任务 | Owner | 里程碑 | 状态 |
|---|---|---|---|---|
| A1 | Insforge 建表：`user_portfolios` + `user_investment_profiles`（含 R-2 `portfolio_confirmed_at`） | 后端 | M1 | ⏳ |
| A2 | `features/portfolio/` 模块 + 7 个端点（6 CRUD + `PATCH /touch`） | 后端 | M1 | ⏳ |
| A3 | `service.py::compute_effective_weights()` 纯函数 + 单测 | 后端 | M1 | ⏳ |
| A10s | `_cash_guard.py` 骨架 + `data_tools` 批量接口接入（R-1 数据网关部分） | 后端 | M1 | ⏳ |
| A11s | 老用户 `portfolio_confirmed_at` 一次性回填 SQL（R-2） | 后端 | M1 | ⏳ |
| A4 | `shared/profile_context.py::inject_profile()` + brew / research agent 接入 | 后端 | M2 | ⏳ |
| A5 | `usePortfolio` / `useProfile` TanStack hooks | 前端 | M3 | ⏳ |
| A6 | `<PortfolioSliderList>` + `<PortfolioSharesList>` + `<PortfolioEditor>` | 前端 | M3 | ⏳ |
| A7 | `/for-you/onboarding` 3-step 页 | 前端 | M3 | ⏳ |
| A8 | `ForYouContent` 顶层 onboarding 触发逻辑 | 前端 | M3 | ⏳ |
| A10u | `exposure_parser.py` + `ETF_SECTOR_MAP`（Top 50）+ `get_true_exposure()` + 单测（R-1 业务部分） | 后端 | M4 | ⏳ |
| A12 | `<OnboardingBanner>` + F0.2 触发分支 + `$CASH` UI 特例（R-1 / R-5.1） | 前端 | M4 | ⏳ |
| A9 | 端到端回归测试 + 灰度 | 全栈 | M4 | ⏳ |

> **A10 拆分说明**：A10 原为单条任务，按"数据网关防护"和"业务暴露分析"两个职责拆为 A10s（M1 必须，避免 `$CASH` 漏出到 yfinance/FMP）和 A10u（U1-B 体检消费时才需要，留到 M4）。

**里程碑分解**：

| Milestone | 范围 | 验收方式 | 工期 |
|---|---|---|---|
| **M1 · 数据地基** | A1 + A2 + A3 + A10s + A11s | 后端 pytest + curl 端到端 + code-review subagent | ~2d |
| **M2 · Agent 画像注入** | A4 | brew/research agent 离线对比测试 + code-review subagent | ~0.5d |
| **M3 · Onboarding & 持仓 UI** | A5 + A6 + A7 + A8 | 前端 vitest + Playwright E2E + 真实浏览器走一遍 onboarding | ~2d |
| **M4 · `$CASH`/ETF 业务 + Banner + 灰度** | A10u + A12 + A9 | 全栈联调 + staging 3 天观察 + 5 位内测 | ~1d |

**DoD**：A1-A12 完成 + staging 3 天无异常 + 首批 5 位内测用户完成 onboarding 并保存持仓。

> **进度跟踪**：每个里程碑完成后写入 `docs/plans/for-you/checkpoint.md`（含 commit hash、未决事项、operator 操作记录），方便后续 session 平滑接手。

---

## LLD Unit U0-B · Action Bar（规则引擎 + LLM headline polish）

> Scope: `/api/for-you/action-bar` 聚合端点 + `build_action_bar()` 规则层 + `headline_polisher` LLM + 前端三态组件
> Depends: U0-A（`user_investment_profiles` + `user_portfolios` + `effective_weight_pct` + `inject_profile`）
> Consumes（可选、缺省退化）: U1-A（`digest.top_event`）、U1-B（`GET /portfolio/health/latest`）
> Status: LLD Ready.

### 1) 实现目标（Work backward）

用户心智："10 秒知道今天有没有事。" → `/for-you` 顶部一条，三态：
- 🟢 稳定（≤ 20 字 headline，**零** AI 调用，模板直出）
- 🟡 有事（headline + 最多 3 chips，LLM polish 语气随画像）
- 🔴 危险（headline + 2 chips，偏稳定情绪措辞，不催交易）

**专属证据**必须命中至少一条：引用仓位数字 / 引用画像差异化语气 / 引用用户 thesis 关键词。绿态模板是"你的组合"而非"大盘"。依赖缺失（U1-A/U1-B 未接入）时**优雅退化**到纯 digest signal，不报错。

### 2) 正向分析

- **合力**：是 /for-you 页"专属感"的**第一眼证据**——原则 1 / 2 是否立住，主要看它一屏内是否做到。把 U0-A 的画像 + 仓位和 U1-A/U1-B 的事件/体检**唯一汇聚点**。
- **涌现基础**：`Signal` 结构开放——U2-C Crisis / U2-B 连线 未来新增 `kind` 无需改 ActionBar 本体；只在 `build_action_bar()` 规则层追加 if 分支 + 映射 chip。
- **可灰度下线**：`ENABLE_ACTION_BAR=false` 直接隐藏整个区域，/for-you 其余部分不受影响（与 digest 解耦）。
- **AI 分工（原则 2 样板）**：颜色 / 跳转 / 是否显示 / 阈值判定 → 规则；headline 和 chip label 的措辞 → LLM。LLM 被严格限定**不得引入 signals 之外的数字**（lint）。

### 3) 架构 & 前后端细节

```
backend/app/features/for_you/           ← 新 feature module（专属页聚合层）
├── .context.md
├── router.py          # GET /api/for-you/action-bar
├── service.py         # build_action_bar() + 依赖聚合
├── agent.py           # headline_polisher LlmAgent
├── templates.py       # 绿态 / fallback 模板（纯字符串，无 LLM）
└── models.py          # Signal / ActionBar Pydantic
```

**为什么新建 `features/for_you/`**：/for-you 页会有多个跨模块聚合需求（ActionBar / Tab 列表 / 快速摘要），不适合挂在 brew。此模块是**纯聚合层**——只读其他 feature 的 service/models，不建表、不跑独立数据管道。

**端点**：

| Method | Path | 用途 | 缓存 |
|---|---|---|---|
| GET | `/api/for-you/action-bar` | 返回当前用户的 ActionBar 结构 | 应用层 |

响应：
```python
class ActionChip(BaseModel):
    label: str                   # "查看财报前瞻"
    link: str                    # "/stock/NVDA?tab=earnings"
    kind: Literal["event", "health", "drawdown", "stable", "research"]

class ActionBar(BaseModel):
    severity: Literal["green", "yellow", "red"]
    headline: str                # ≤ 40 字
    chips: list[ActionChip]      # ≤ 3 个；绿态 0-1 个
    source: Literal["template", "llm", "llm_fallback"]    # 可观测, 调试用
    generated_at: datetime
```

**规则层 `build_action_bar()`**（U0-A §设计已给骨架，此处固化为可执行）：

```python
def build_action_bar(user_id: str) -> ActionBar:
    digest    = get_latest_digest(user_id)                  # 同步缓存读
    profile   = get_user_profile(user_id) or Profile.default()
    insights  = get_portfolio_insights(user_id)             # U1-B 缺省 → None
    top_event = digest.top_event                            # U1-A 缺省 → None

    signals: list[Signal] = []

    # --- 规则 1: 大跌 (画像感知阈值) ---
    threshold = -5.0 if profile.risk_tolerance == "high" else -3.0 if profile.risk_tolerance == "low" else -4.0
    if digest.portfolio_daily_change is not None and digest.portfolio_daily_change <= threshold:
        signals.append(Signal(kind="drawdown", severity="red", data=digest))

    # --- 规则 2: 体检异常 (U1-B) ---
    if insights and insights.health_score is not None and insights.health_score < 40:
        signals.append(Signal(kind="health", severity="yellow", data=insights))

    # --- 规则 3: 紧迫事件 (U1-A) ---
    if top_event and top_event.severity in ("watch", "urgent"):
        sev = "red" if top_event.severity == "urgent" and profile.risk_tolerance == "low" else "yellow"
        signals.append(Signal(kind="event", severity=sev, data=top_event))

    # --- 规则 4: 稳定态兜底 ---
    if not signals:
        signals.append(Signal(kind="stable", severity="green", data=digest))

    severity = max_severity(signals)                        # red > yellow > green

    # --- 文案层 ---
    if severity == "green":
        headline = templates.green_headline(signals[0].data, profile)    # 零 LLM
        chips    = [templates.stable_chip(digest)] if profile.style != "active" else []
        source   = "template"
    else:
        cache_key = hash((
            tuple(s.kind for s in signals),
            tuple(s.severity for s in signals),
            profile.version,
            digest.date,
        ))
        polish = cache.get(cache_key)
        if polish is None:
            try:
                polish = headline_polisher.run(signals, profile, timeout=0.8)
                _lint_headline(polish.headline, signals)     # 抛出则视为失败
                cache.set(cache_key, polish, ttl=86400)
                source = "llm"
            except (TimeoutError, LintError, Exception):
                polish = templates.fallback_polish(signals, profile)
                source = "llm_fallback"
        else:
            source = "llm"
        headline = polish.headline
        chips    = [build_chip(s, label=lbl) for s, lbl in zip(signals[:3], polish.chip_labels)]

    return ActionBar(severity=severity, headline=headline, chips=chips, source=source, generated_at=utcnow())
```

**缓存**：
- **后端**：内存 LRU（V1）或 Vercel Runtime Cache（V2）
  - key = `hash((signals.kind_tuple, signals.severity_tuple, profile.version, digest.date))`
  - TTL = 自然日边界（价格每天变；但同日同 signals 同 profile → 同 headline）
  - **命中率预估**：绿态直接模板 0 成本；黄/红态同一用户一天内只调一次 LLM
- **前端**：TanStack Query，`staleTime = 60s`，`refetchOnWindowFocus=true`（项目 global 已开）——窗口聚焦重取，但后端缓存仍会命中

**前端组件**：

```
frontend/src/components/for-you/action-bar/
├── ActionBar.tsx          # 主组件, 订阅 useActionBar()
├── ActionChip.tsx         # 单 chip (可点击按钮)
├── useActionBar.ts        # TanStack Query hook
└── action-bar.module.css  # 三态 token 映射
```

状态机（前端）：
```
loading           → 骨架（一行 gray pulse）
error / 404       → 隐藏整个 ActionBar（不显示错误文案，避免污染 10s 心智）
severity=green    → 单行 neutral bg, headline + 可选 1 chip
severity=yellow   → amber token bg, headline + ≤ 3 chips, 左侧 icon ⚠️
severity=red      → destructive token bg (低饱和), headline + 2 chips, icon 🔻
chip click        → router.push(chip.link); 埋点 action_bar_chip_click(kind, link)
```

**设计 token**（严格走 `docs/constraints/design-system.md` 定义的 brand 色系，不新增）：
- 绿 = `--color-muted-foreground` + `--color-background`（低调）
- 黄 = `--color-amber-soft-bg` + `--color-amber-foreground`
- 红 = `--color-destructive-soft-bg` + `--color-destructive-foreground`（低饱和，避免误导为"卖出"信号）

**避免 regression**：
- 新 feature module；不改 brew / digest service，**只读**它们的 cached response
- `ENABLE_ACTION_BAR=false` → 前端按 feature flag 直接不渲染；后端端点仍存在但返回 `{ severity: "green", headline: "", chips: [] }` 以便前端统一结构
- U1-A 未上线（`top_event=None`）/ U1-B 未上线（`insights=None`）→ 规则 2/3 自动跳过，仅剩规则 1 + 规则 4，ActionBar 仍能出绿态 / 大跌红态
- 端点 timeout > 1.5s → 前端按 error 处理（隐藏）；不拖累页面其余渲染

### 4) 数据库

**无新表**。ActionBar 是**纯衍生视图**——所有 signal 源头（portfolio / profile / digest / insights / top_event）都已有表。应用层缓存不落盘（Runtime Cache TTL 24h 足够）。

### 5) Agent 模块 · `headline_polisher`

**Model**：`gemini-3.1-flash-lite-preview`

**Schema**：
```python
class HeadlineOutput(BaseModel):
    headline:     str          # ≤ 40 字, 不含 signals 之外的数字
    chip_labels:  list[str]    # len = len(signals[:3]); 每个 ≤ 12 字
```

**Instruction 护栏**（lint 在 service 层强制）：
1. 只能用 `signals` 提供的数字（如 `digest.portfolio_daily_change = -6.2%` → 可写"-6.2%"；不得凭空写"-5%"）
2. 画像感知：
   - `style=long, risk=low` → 强调"长期视角""稳住情绪"
   - `style=active, risk=high` → 强调"机会""关注点"
   - `style=balanced` → 中性
3. 禁用词（指令性交易动词）：`买入 / 卖出 / 加仓 / 减仓 / 抄底 / 梭哈` → lint fail
4. 红态不得催交易，只描述"观察/讨论"
5. chip_labels 必须与 signals[:3] 一一对应，顺序不得颠倒

**`_lint_headline()` 规则函数**：
```python
def _lint_headline(headline: str, signals: list[Signal]) -> None:
    # a) 提取 headline 中所有 %/数字, 必须 ⊆ signals.all_numbers()
    nums = NUM_RE.findall(headline)
    allowed = collect_numbers_from(signals)
    for n in nums:
        if n not in allowed: raise LintError(f"hallucinated number: {n}")
    # b) 禁用词
    for kw in FORBIDDEN: 
        if kw in headline: raise LintError(f"forbidden: {kw}")
    # c) 长度
    if len(headline) > 40: raise LintError("too long")
```

**超时 / 失败 fallback**：`templates.fallback_polish()` 是结构化字符串拼接（"[signal.kind 中文] · [symbol] · 仓位 [weight]%"），零 LLM，永远能出。

**评估策略**：

1. **离线 golden set**（30 case = 10 signals 组合 × 3 画像）：
   - LLM judge：headline 措辞是否符合画像倾向（盲测 3 次同意率 ≥ 70%）
   - Lint pass 率目标 ≥ 98%
   - 绿态 0 LLM 调用（测试该路径不触达 agent）
2. **CI 快照测试**：固定 signals + profile → headline 在连续 5 天 cache 命中 → bit-identical
3. **上线后**：
   - `action_bar_chip_ctr` 按 severity 分桶（期望 yellow > red > green）
   - `source=llm_fallback` 率（应 < 5%，否则检查 timeout/lint）
   - U1-C 上线后，ActionBar 右侧 `<FeedbackBar target_type="action_bar_headline">` → 👍 率 > 50%
4. **迭代**：
   - fallback 率高 → 调 timeout / 缩短 prompt
   - 👎 率高的画像 → few-shot 反例入 instruction
   - **不改规则层**——规则层只应被产品决策驱动（加 signal kind / 调阈值），不被 LLM 信号驱动

### 6) Rollout & 回归防护

- **Feature flag**：
  - `ENABLE_ACTION_BAR`（前后端一致）
  - `ACTION_BAR_LLM_POLISH=true` → 可临时关 LLM 强制走 fallback（成本 / 故障时）
- **灰度**：先 staging 全开 → prod 10% 用户 → 50% → 全量
- **回归测试**：
  - [ ] `top_event=None` 且 `insights=None` → 规则 1+4 仍能出有效 ActionBar
  - [ ] `digest` 拉取失败 → 端点 graceful 返回 `severity=green, headline=""`，前端隐藏
  - [ ] LLM 超时 800ms → fallback 模板，`source=llm_fallback`，不 500
  - [ ] Lint 拦截含"买入 NVDA 100 股" → fallback，产线永不出指令性文案
  - [ ] `profile.version++` → cache 必 miss 一次、重算
  - [ ] 关闭 `ENABLE_ACTION_BAR` → 前端不渲染，页面其他部分位级一致（快照）
- **指标**：
  - `action_bar_p95_latency`（目标 < 500ms，含 LLM；绿态 < 50ms）
  - `action_bar_chip_ctr` 按 kind 分桶
  - `source_distribution`（template / llm / llm_fallback）
  - `headline_lint_fail_rate`（应 < 2%；突增 → Agent 回归）

### 消费者契约（反向声明）

U0-B 对上游的依赖**只读不写**；本 Unit 不会建任何持久化字段。

| 上游 | 消费字段 | 缺失时行为 |
|---|---|---|
| U0-A `/api/profile` | `style / risk_tolerance / horizon / version` | 走 `Profile.default()`（passive long moderate） |
| U0-A `/api/portfolio` + digest | `portfolio_daily_change` | 规则 1 跳过 |
| U1-A `digest.top_event` | 整个 `TopEvent` 对象 | 规则 3 跳过 |
| U1-B `GET /health/latest` | `health_score / next_action / top_risk` | 规则 2 跳过 |

### Audit Integration（R-2 / R-4）

两项修正就地合并进 U0-B 规则层，**不改响应 schema、不增端点**，仅扩展 `build_action_bar()` 的 signals 生成与阈值语义。

#### R-2 · `Signal(kind="staleness")` 求证信号

在"规则 4 稳定兜底"之前插入：

```python
# features/for_you/service.py 内, build_action_bar() 里
profile = get_user_profile(user_id)
days_since_confirmed = (utcnow() - profile.portfolio_confirmed_at).days \
                        if profile.portfolio_confirmed_at else 0

# 插在规则 3 (event) 之后, 规则 4 (stable) 之前
if days_since_confirmed > 60 and not any(s.severity == "red" for s in signals):
    # 不与红态并存 (真危险优先)；也不与任何黄态并存 (求证优先级低)
    if not signals:
        signals.append(Signal(kind="staleness", severity="yellow",
                              data={"days": days_since_confirmed}))
```

**优先级规则**：`staleness` 仅在其他规则都未命中时生效，**不与 event / health / drawdown 共存**——避免"又是老数据又是风险警报"的双重打扰。

**Chip 生成**（templates.py 扩展）：
```python
def staleness_chips(days: int) -> list[ActionChip]:
    return [
        ActionChip(label="✅ 仍然准确", link="action://touch-portfolio", kind="research"),
        ActionChip(label="✏️ 去更新",   link="/for-you/portfolio",      kind="research"),
    ]
```

- 前端识别 `link="action://touch-portfolio"` → 拦截默认跳转、调 `PATCH /portfolio/touch`、toast "已确认 ✓" + ActionBar 立即重新 fetch → 黄态消失
- 不需要新 chip kind，复用 `research`
- **LLM headline polish 不介入** staleness（走 template，文案固定："你的持仓已 {days} 天未更新，这些还是你的当前组合吗？"）——避免 LLM 发挥成催促语气

#### R-4 · 大跌判定改为 `portfolio_drag`

**问题**：原规则 1 基于 `digest.portfolio_daily_change < threshold`，会漏掉"1 只重仓股暴跌拖累整体"的真实坏日，也可能被"等权组合里 1% Meme -20% 但整体 -0.3%"误触（原规则不触发，但审计担心未来若改为单票判定会误报）。

**修正**：引入 `compute_max_drag()`，取"组合整体跌幅"与"最大单票拖累度"二者之**更负**：

```python
# features/for_you/service.py
class DragResult(BaseModel):
    overall:       float            # 组合整体今日变化 %
    worst_single:  float            # 最差单票拖累度 = daily * weight (%)
    culprit:       str | None       # 产生 worst_single 的 symbol
    # 兼容字段: value = min(overall, worst_single)，保留给旧消费者
    value:         float

def compute_max_drag(holdings: list[HoldingView], digest: DigestResponse) -> DragResult:
    """独立返回两个维度:
       - overall:      组合整体跌幅 (全组合加权日变化)
       - worst_single: 单票拖累度 (仅统计重仓 >=10% 且当日跌 >=10% 的票)
    """
    overall = digest.portfolio_daily_change or 0.0
    worst_single = 0.0
    culprit: str | None = None
    for h in holdings:
        w = (h.effective_weight_pct or 0) / 100.0
        if w < 0.10: continue                # 非重仓跳过
        daily = digest.get_daily_change(h.symbol) or 0.0
        if daily > -10.0: continue           # 仅"真跌"才算拖累 (过滤噪音)
        drag = daily * w
        if drag < worst_single:
            worst_single, culprit = drag, h.symbol
    return DragResult(
        overall=overall,
        worst_single=worst_single,
        culprit=culprit,
        value=min(overall, worst_single),    # 兼容 U2-C crisis_tools 旧调用
    )

# build_action_bar() 规则 1 改写 —— Deep Audit: 两维度独立阈值, 二者任一命中即触发
drag = compute_max_drag(holdings, digest)

# 整体阈值 (画像感知)
overall_threshold = -5.0 if profile.risk_tolerance == "high" \
               else -3.0 if profile.risk_tolerance == "low" \
               else -4.0   # % 单位

# 单票拖累阈值 (恒定 -1.5%; 单票凭一己之力拖累 1.5% 已是大事件, 与画像无关)
SINGLE_DRAG_THRESHOLD = -1.5

cause: str | None = None
if drag.overall <= overall_threshold:
    cause = "portfolio_wide"
if drag.worst_single <= SINGLE_DRAG_THRESHOLD:
    # 单票命中优先 (更具体、更可操作); 与 portfolio_wide 不互斥, 但 cause 标成 single_drag
    cause = "single_drag"

if cause:
    signals.append(Signal(
        kind="drawdown",
        severity="red",
        data={
            "cause": cause,
            "culprit_symbol": drag.culprit if cause == "single_drag" else None,
            "drag_pct": drag.worst_single if cause == "single_drag" else drag.overall,
            "overall_pct": drag.overall,
        },
    ))
```

**Deep Audit 修正要点**：
- 原实现把"整体跌幅"和"单票拖累"压缩成 `drag.value = min(...)`，再用同一阈值判，导致"高风险画像 -5%"实际要求单票凭一己之力拖累 5%（需 50% 仓位暴跌 10%），几乎永不触发
- 修正后 `DragResult` 同时暴露 `overall` 与 `worst_single`；规则层对二者各判一次，任一命中即红态
- `SINGLE_DRAG_THRESHOLD = -1.5`（恒定）不跟画像联动：单票"一日拖累全组合 1.5%"是客观的大事件，无关用户风险偏好
- `value` 字段保留为 `min(overall, worst_single)`，供 U2-C `should_enter_crisis_mode()` / `find_similar_drawdowns(current_drawdown_pct=...)` 等旧调用继续消费（零 API 破坏）

**LLM polish 输入结构化**：当 `cause=single_drag`，headline_polisher 的 input 附带 `culprit_symbol` + `drag_pct`（单票拖累度）+ `overall_pct`（整体），生成"你 32% 的 NVDA 今日 -15%，拖累组合 -4.8%（整体 -2.1%）"这种具体措辞；当 `cause=portfolio_wide` 时只传 `overall_pct` + 前三大下跌标的摘要——解决审计原点"泛泛而谈的大跌"问题。

**lint 增强**：headline 中出现的 `%` 必须能对应到 `drag_pct` 或 `overall_pct`（不再只看 `portfolio_daily_change`）；`single_drag` 分支必须引用 `culprit_symbol`，否则 lint fail。

**与 U2-C Crisis Mode 的共享**：`compute_max_drag()` 是 U2-C `evaluate_crisis_trigger()` 的**复用件**。U2-C 在此函数基础上加 VIX 判定 + 画像权重，**不重造轮子**。

#### Audit 工期汇总

| Delta | 工期 | 归属 |
|---|---|---|
| R-2 staleness signal + template + chip action | +0.25d | B3 / B7 |
| R-4 compute_max_drag + 规则 1 改写 + lint 扩展 | +0.25d | B3 / B5 |
| **U0-B 合并后** | **~2d**（原 1.5d + 0.5d） |

### U0-B 交付 Checklist

| # | 任务 | Owner | 状态 |
|---|---|---|---|
| B1 | `features/for_you/` 模块 + `.context.md` + Signal/ActionBar Pydantic | 后端 | ⏳ |
| B2 | `templates.py` 绿态 + fallback 模板（单测）；确保零 LLM 路径 | 后端 | ⏳ |
| B3 | `build_action_bar()` 规则层 + 画像感知阈值 + 单测 | 后端 | ⏳ |
| B4 | `headline_polisher` agent + Pydantic schema + `_lint_headline()` | 后端 | ⏳ |
| B5 | 应用层缓存（LRU，V2 上 Runtime Cache）+ 命中率埋点 | 后端 | ⏳ |
| B6 | Router `GET /api/for-you/action-bar` + rate limit | 后端 | ⏳ |
| B7 | `useActionBar` hook + `<ActionBar>` + `<ActionChip>` 三态 | 前端 | ⏳ |
| B8 | `/for-you` 顶部接入 + feature flag 包裹 | 前端 | ⏳ |
| B9 | Golden set + lint CI + 指标埋点 | 全栈 | ⏳ |
| B10 | 灰度 rollout（10% → 50% → 100%） | 全栈 | ⏳ |
| B11 | `Signal(kind="staleness")` 规则 + `action://touch-portfolio` chip 协议（R-2） | 全栈 | ⏳ |
| B12 | `compute_max_drag()` + 规则 1 改写 + headline lint 扩展（R-4） | 后端 | ⏳ |

**DoD**：
- Golden set lint pass ≥ 98%、画像盲测一致率 ≥ 70%
- `source=llm_fallback` 率 < 5%
- p95 < 500ms；绿态 < 50ms
- staging 3 天 `headline` 未出现指令性词、未出现 signals 之外数字（log grep 零命中）
- U1-A/U1-B 任一缺失场景下（通过 flag 关闭模拟）ActionBar 仍正常出绿/红态

---

## LLD Unit U0-C · 通知偏好 `notify_mode`

> Scope: 三档通知偏好（silent / events_only / daily）的**真实接入点**——设置 UI + 应用层 filter + Resend segment 同步。U0-A 已建表字段并默认 `events_only`，本 Unit 补齐端到端行为。
> Depends: U0-A（`user_investment_profiles.notify_mode` 字段 + `/api/profile` 端点）
> Consumed by: 所有邮件触发路径（morning / evening / weekly / U1-B weekly health / U1-A 事件邮件）
> Status: LLD Ready.

### 1) 实现目标（Work backward）

用户心智："别天天发。有事叫我，没事别烦。" → 三档一次选定，符合被动投资者心智：

| 值 | 行为 | 默认 |
|---|---|---|
| `silent` | 永远不发邮件；ActionBar 仅 red 态显示 | — |
| `events_only` | 仅"事件日"发邮件（top_event watch/urgent、体检异常、大跌）；周报仍发 | ✅ |
| `daily` | 每日 digest + 周报 + 事件日（即现有全量行为） | — |

**关键约束**：
- 默认 `events_only` → 新用户不会被每日推送淹没
- 设置变更必须**同时**反映到 Resend（避免用户已在列表但应用层过滤后造成的"幻影订阅"）
- 应用层 filter 是**真实源**（source of truth），Resend segment 是**缓存**；数据不一致时以 DB 为准

### 2) 正向分析

- **合力**：沉默即专属（README 原则 1）——不加内容、减发送，就能提升"懂我"感知。`events_only` 默认值让新用户一进来就是"有事才扰"。
- **解锁**：U1-B weekly health 邮件、U1-A 事件日推送都强依赖本 Unit 的 filter，否则会给 silent 用户发邮件 → 退订风险。
- **涌现基础**：`notify_mode` 是未来"智能推送节奏"（V2：根据用户打开率自动从 daily 降级到 events_only）的落地字段。

### 3) 架构 & 前后端细节

**后端新增**：

```
backend/app/features/notification/
├── router.py                    # 现有, 扩展一处接入点
├── preferences.py  ← 新增        # should_send_to(user, channel) 单函数
└── event_day.py    ← 新增        # is_event_day_for(user, date) 判定
```

**核心函数**（纯判定、可单测、所有邮件路径必经）：

```python
# backend/app/features/notification/preferences.py
from enum import Enum

class Channel(str, Enum):
    MORNING = "morning"      # 晨报
    EVENING = "evening"      # 晚报
    WEEKLY  = "weekly"       # 周报 (含 U1-B health weekly)
    EVENT   = "event"        # 事件触发 (top_event urgent / health abnormal / big drawdown)

def should_send_to(user_id: str, channel: Channel, today: date | None = None) -> bool:
    mode = get_user_profile(user_id).notify_mode  # 默认 events_only
    if mode == "silent":
        return False
    if mode == "daily":
        return True
    # events_only
    if channel == Channel.WEEKLY:
        return True                                   # 周报总收（低频，不扰人）
    if channel == Channel.EVENT:
        return True                                   # 事件邮件定义上就是事件日
    # morning / evening: 仅事件日发
    return is_event_day_for(user_id, today or date.today())
```

**`is_event_day_for()`** —— 复用 U0-B ActionBar 规则层判定，避免两套阈值：

```python
# backend/app/features/notification/event_day.py
def is_event_day_for(user_id: str, day: date) -> bool:
    bar = build_action_bar(user_id)                   # 复用 U0-B, 缓存命中零成本
    return bar.severity in ("yellow", "red")
```

**接入点清单**（每处都 insert `should_send_to()` 判断）：

| 路径 | Channel | 现状 | 本 Unit 改动 |
|---|---|---|---|
| `daily_report` cron → Resend batch | MORNING/EVENING | 全量发送 | 发送前逐用户 filter |
| `weekly` 周报 cron | WEEKLY | 全量发送 | silent 用户过滤 |
| U1-B `portfolio_health` weekly cron | WEEKLY | 新建 | 原生走 `should_send_to` |
| U1-A 事件日推送（如上线） | EVENT | 新建 | 原生走 `should_send_to` |

**Resend segment 同步**（次要、最佳努力）：

- `PUT /api/profile` 内若 `notify_mode` 变更 → 调用 `notification.sync_resend_segments(user_email, notify_mode)`
- 映射：
  ```
  silent       → 移出所有三个 segment
  events_only  → 仅在 RESEND_SEGMENT_WEEKLY（周报仍收）
  daily        → 三个 segment 全加入（现状）
  ```
- 实现幂等（失败记 warning log，不回滚 DB 写入）；应用层 filter 保证即使 Resend 同步失败也不会误发

**前端 UI**：

```
frontend/src/app/settings/page.tsx             ← 若无则新建 settings 段
frontend/src/components/settings/
└── NotifyModeRadio.tsx                         ← Radix RadioGroup

UI:
  ○ 静默          我自己打开 app 看, 别发邮件
  ● 事件触发      (默认)  有事才叫我 + 每周体检
  ○ 每日        喜欢每天早上收到一封 digest
```

- 使用 shadcn `<RadioGroup>` + `<Label>`，不新造组件
- 保存即时：`useUpdateProfile()` mutation → invalidate `['profile']` query
- 成功后 toast："已更新，下次邮件将按新设置发送"

**避免 regression**：
- 现有 daily_report cron 的 Resend broadcast 路径**不立即改**为逐用户发送（广播 → 逐发有性能成本）。V1 折中：
  - Resend broadcast 仍按 segment 发 → 已承担 `daily` / `events_only` 周报部分
  - **新增** `morning` / `evening` segment 的 `events_only` 用户被误发的问题 → 依赖 Resend segment 同步把他们移出，**不**在应用层逐用户检查（broadcast API 接受的是 segment，不是 user list）
  - 对 U1-B weekly health 等**新建**路径 → 原生走 `should_send_to`（逐用户）
- 所以应用层 filter 的真正强制点在**新路径**上；旧 broadcast 靠 segment 同步 + 偶发漂移可忍受（一天一封 digest 的误发影响有限）
- V2 统一迁移到逐用户发送（Resend batch send）时再去除双轨

### 4) 数据库

**无新表**。仅读写 U0-A `user_investment_profiles.notify_mode`。

**索引**：不需要——`user_investment_profiles.user_id` 主键已支持点查。

### 5) Agent 模块

无 LLM。纯规则判定。

**评估**：
- 发送前后 `notify_mode` 值分布埋点：`mode_distribution_by_day`（目标：`events_only` 占 60%+）
- 新用户注册后 30 天邮件打开率对比（对照组旧默认 daily vs 新默认 events_only）

### 6) Rollout & 回归防护

- **默认值迁移**：U0-A Edge Function 已 `DEFAULT 'events_only'`，但**已注册的旧用户**无 `user_investment_profiles` 行 → `get_user_profile()` 返回默认值即 `events_only`。这会把**已有日活用户**静默降级到事件触发，可能引起"怎么不发了"的反馈。
  - 缓解：**老用户保留 `daily`** —— 迁移脚本：所有在 `RESEND_SEGMENT_MORNING` audience 中已存在的 email 对应的 user_id，批量 `INSERT INTO user_investment_profiles (user_id, notify_mode) VALUES (?, 'daily') ON CONFLICT DO NOTHING`。
  - 新用户走默认 `events_only`。
- **Feature flag**：`ENABLE_NOTIFY_MODE_FILTER=false` → 所有 `should_send_to()` 直接返回 `True`（应急下线）
- **回归测试**：
  - [ ] `silent` 用户在所有 4 个 channel 下都 `False`
  - [ ] `events_only` 用户在非事件日 MORNING/EVENING = `False`，事件日 = `True`
  - [ ] `daily` 用户 4 个 channel 全 `True`
  - [ ] `PUT /profile` 改 `notify_mode` → Resend 同步失败时 DB 已写入且返回 200（warning log）
  - [ ] 迁移脚本幂等（跑两次不改写已存在行）
- **指标**：
  - `notify_mode_distribution`（三档占比）
  - `mail_send_skipped_by_preference`（按 channel / mode 细分）
  - `event_day_detection_rate`（`events_only` 用户中被判定为事件日的比例，目标 15-35%）
  - 老用户 30 天 unsub rate（上线迁移后观察，无明显增加）

### 对其他单元的契约

U0-C 的 `should_send_to()` 是所有邮件路径的强制过滤器。**任何新增邮件触达路径（U1-A 事件日邮件、U1-B 周度体检邮件、U2-D 月度回顾）都必须调用此函数**，不得直接调 Resend 或 email_service。CI 可加 grep 约束：新增 `resend.Emails.send` / `broadcast_*` 调用必须同 PR 出现 `should_send_to` 引用。

### Audit Integration（R-2）

`should_send_to()` 头部增加**强制 silent 短路**——不看 `notify_mode`，数据腐朽即停推送：

```python
def should_send_to(user_id: str, channel: Channel, today: date | None = None) -> bool:
    profile = get_user_profile(user_id)

    # R-2: 数据腐朽强制 silent (优先于 notify_mode)
    if profile.portfolio_confirmed_at:
        days = (date.today() - profile.portfolio_confirmed_at.date()).days
        if days > 90:
            log.info("skip_send reason=stale_portfolio user=%s days=%d", user_id, days)
            return False

    mode = profile.notify_mode
    # ... 原有逻辑不变
```

**为什么放头部、优先于 silent/events_only/daily 判断**：90 天不回来的用户**任何邮件都是骚扰**——即使他们自己设置了 `daily` 也一样。这是产品侧的保护动作，覆盖用户设置。

**配套**：
- 用户重新 `PATCH /portfolio/touch` 或 `PUT /portfolio/bulk` → `portfolio_confirmed_at` 重置 → 下次触达恢复正常
- 埋点：`mail_send_skipped_by_preference` 拆分 reason = `stale_portfolio | silent | non_event_day`
- 回归测试新增一条：
  - [ ] `portfolio_confirmed_at > 90d ago` 且 `notify_mode=daily` → 返回 `False`，log 含 `reason=stale_portfolio`

**工期**：+0d（一个 if 嵌入 C1 函数内）。

### U0-C 交付 Checklist

| # | 任务 | Owner | 状态 |
|---|---|---|---|
| C1 | `notification/preferences.py::should_send_to()` + 单测 | 后端 | ⏳ |
| C2 | `notification/event_day.py::is_event_day_for()`（复用 U0-B） | 后端 | ⏳ |
| C3 | `sync_resend_segments(user_email, notify_mode)` 映射实现 | 后端 | ⏳ |
| C4 | `PUT /api/profile` 保存时触发 Resend 同步（最佳努力） | 后端 | ⏳ |
| C5 | 老用户 `daily` 迁移脚本（Edge Function 一次性） | 后端 | ⏳ |
| C6 | `<NotifyModeRadio>` + settings 页接入 | 前端 | ⏳ |
| C7 | U1-B weekly health cron 接入 `should_send_to()` | 后端 | ⏳ |
| C8 | CI 约束 / 灰度 | 全栈 | ⏳ |

**DoD**：
- 单测覆盖 3×4 = 12 个 (mode × channel) 组合
- 老用户迁移后 7 天 unsub rate 无明显上升（< 0.5%）
- 任一已接入 channel 的邮件发送路径 log 中均可追溯到 `should_send_to` 的 True/False 决策

---

## 实施步骤

| # | 任务 | 难度 | 工期 |
|---|---|---|---|
| 1 | `user_portfolios` + `user_investment_profiles` Edge Function（schema 一次加齐） | 低 | 0.5d |
| 2 | `portfolio_db.py` + `profile_db.py` + CRUD 端点 | 低 | 1d |
| 3 | `effective_weight` 推断 + `/portfolio/summary` 聚合端点 | 低 | 0.5d |
| 4 | `inject_profile()` 工具函数 + brew/research agent 接入 | 低 | 0.5d |
| 5 | 前端 `/for-you/portfolio` 录入页（滑块 + 股数切换 + 均分） | 中 | 1.5d |
| 6 | 前端 `/for-you/onboarding` 3 步卡 | 中 | 1d |
| 7 | `build_action_bar()` 规则引擎 + `DigestResponse.action_bar` 字段 | 低 | 0.5d |
| 8 | 前端 `ActionBar` 组件 + `ForYouContent` 顶部接入 | 中 | 1d |
| 9 | `notify_mode` 接入 `/settings`（或 onboarding Step 4） | 低 | 0.5d |

**总工期**：~7 天 + 0.5d buffer。

**里程碑**：
- M1（~3d）：持仓输入 + 画像 schema 就位，体检/排序等依赖可启动
- M2（~4d）：Onboarding + Action Bar 上线，可灰度发布

## 待定问题

1. **滑块最小粒度**：1% 输入、5% 显示对齐。
2. **ETF 穿透板块归类**：V1 不做，ETF 归为 "Index" 板块。
3. **Onboarding 触发时机**：建议首次进 /for-you，不在注册链路强制。
4. **Action Bar 阈值按画像 override**：`-5%` 对低容忍用户改为 `-3%` 即触发。V1 硬编码，V2 动态。
