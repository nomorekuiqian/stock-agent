# Frank Persona Paid Retention Engineering Plan

> Status: Planning
> Related:
> - `frontend/src/app/kol/.context.md`
> - `backend/app/features/kol_research/.context.md`
> - `docs/plans/active/kol-persona-cockpit.md`
> - `docs/plans/active/frank-style-stock-radar.md`
> - `docs/plans/for-you/README.md`
> Vision: 产品策略.md > 核心认知「帮用户赚钱，而非堆积信息」；现有模块演进 > `/stock` 个股深研 + 产品模块规划 > 模块 4「机会发现」/ 模块 5「风险预警」

## 目标

把 `/kol/qinbafrank` 从「可浏览的 Frank 方法论驾驶舱」升级为「用 Frank 框架检查、保存、持续追踪某只股票的付费研究台」，让用户不是看完一次就走，而是为了观察名单、证伪条件和每周框架更新持续回来。

## 现状

当前 `/kol/[username]` 已有完整公开驾驶舱：

- 首页：`ChatComposer` 前置 + 最新观点 / 领域 / 个股 / 追问 2x2 模块。
- Latest：真实推文 feed，可筛选。
- Sectors：v3 方法论板块、宏观框架、证据推文。
- Stocks：ticker 列表、价格 x 提及时间线、逐字原文摘录、`TickerNarrative`。
- Chat：跳 `/research?agent=kol&persona=qinbafrank&q=...`，真实对话在 `/research` 完成。

已有价值：

- 真实原文和价格时间线，比普通 AI Chat 更可信。
- Frank 方法论已经结构化为 sector / ticker / macro skill。
- `/research` 已支持 KOL persona agent，能调用 KOL RAG 和市场数据工具。

当前付费表达问题：

- 页面第一眼像「博主资料页 / 内容浏览页」，不是「输入一只股票，按 Frank 框架判断」。
- 个股页虽然有“问问他怎么看”，但 CTA 不够明确，用户不知道会得到什么付费结果。
- 页面公开信息多，但付费层级不清晰：哪些是免费浏览，哪些是 Max 才有的高价值能力没有产品化。
- 缺少持续复访机制：用户看完 NVDA 历史观点后，没有保存 thesis、证伪条件、下次事件、每周更新。

## 设计

### 核心定位

不要卖「Frank AI 分身」。付费点改成：

> 用 Frank 的公开框架，帮我判断一只股票现在是否仍值得跟踪，并持续监控证伪条件。

页面需要明确回答四个问题：

1. 这只股票在 Frank 框架里属于哪条产业链 / 哪类机会？
2. Frank 有没有直接讨论过？如果有，原文证据是什么？
3. 按当前市场数据，这个 thesis 是否仍然成立？
4. 什么变化会让它从「重点跟踪」变成「等待 / 回避」？

### 付费分层

| 层级 | 内容 | 目的 |
|---|---|---|
| 免费公开 | 方法论概览、板块分层、少量高频 ticker、部分原文摘录、示例诊断预览 | 获客、建立可信度 |
| 登录免费 / 试用 | 每日少量 Frank 视角追问、完整浏览 ticker 历史页 | 让用户体验工作流 |
| Max | Frank Framework Diagnosis、保存观察、证伪监控、每周更新、Frank-style Radar、无限追问 | 持续付费 |

### 新增产品能力

#### 1. 首页改成「股票检查入口」

当前首页的 ChatComposer 是泛问题输入，建议改成更明确的第一屏动作：

```text
用 Frank 的框架检查一只股票
[ NVDA / MU / COIN / 输入 ticker... ] [开始分析]

输出预期：
- 它属于 Frank 哪个产业链层级
- 历史原文证据
- 当前 thesis 是否仍成立
- 关键证伪条件
```

保留 2x2 模块，但排序调整：

1. **股票框架检查**（主模块，占更大权重）
2. **当前 Frank Radar**（付费预览）
3. **最新观点**
4. **方法论地图**

#### 2. 个股页新增「Frank Lens Snapshot」

在 `TickerDetail` 顶部价格和提及次数下方增加一个判断卡：

```text
Frank Lens Snapshot
Coverage: 深度覆盖 / 中度覆盖 / 轻度提及 / 方法论推断
Theme Fit: AI 算力基建 / HBM / 稳定币 / 国防太空 ...
Current Posture: Core Watch / Wait for Pullback / Monitor Only / Avoid
Evidence Strength: 直接原文 12 条 + 方法论规则 4 条
Next Falsifier: 如果 Mag7 capex 指引下修，则 AI infra thesis 降级
```

免费用户看到简版：

- Coverage
- Theme Fit
- 最近 2 条原文
- 模糊/截断的 `Current Posture`
- CTA：「解锁完整 Frank 框架诊断」

Max 用户看到完整诊断。

#### 3. 新增「Framework Diagnosis」付费报告

这是核心付费能力。输入 ticker，输出结构化诊断。

字段建议：

```json
{
  "ticker": "NVDA",
  "persona": "qinbafrank",
  "generated_at": "...",
  "coverage": "direct_high",
  "theme_fit": {
    "sector": "ai-infrastructure",
    "layer": "compute-base",
    "reason": "属于 AI 算力链底层收租环节"
  },
  "posture": "Core Watch",
  "score": 82,
  "score_breakdown": [
    {"pillar": "direct_evidence", "score": 18, "max": 20},
    {"pillar": "sector_fit", "score": 17, "max": 20},
    {"pillar": "current_data_support", "score": 15, "max": 20},
    {"pillar": "valuation_risk", "score": 10, "max": 20},
    {"pillar": "macro_compatibility", "score": 12, "max": 20}
  ],
  "direct_evidence": [{"tweet_id": "...", "quote": "...", "date": "..."}],
  "methodology_inference": ["..."],
  "current_market_data": ["..."],
  "falsifiers": ["..."],
  "next_events": ["earnings", "GTC", "capex guidance"],
  "suggested_questions": ["..."]
}
```

注意：所有直接观点必须有 tweet id；没有 tweet id 的只写「方法论推断」。

#### 4. 新增「保存观察 / Monitor with Frank Lens」

每个 ticker detail 和 diagnosis 结果页加一个主按钮：

```text
加入 Frank 观察
```

保存的数据：

- ticker
- persona_username = qinbafrank
- saved thesis summary
- selected falsifiers
- evidence tweet ids
- current posture
- next event date
- created_at / last_checked_at

这是持续付费的关键。用户一旦保存 5-10 个观察项，就会形成数据迁移成本。

#### 5. 新增「Frank Watchlist」页面区块

在 `/kol/qinbafrank` 首页或 `/kol/qinbafrank/stocks` 顶部展示：

```text
你的 Frank 观察列表
NVDA  Core Watch        证伪项未触发 · 下次财报 12 天后
MU    Wait for Pullback HBM thesis 成立 · 估值偏热
COIN  Monitor Only      监管事件临近
```

免费用户看空态 CTA：

```text
保存你正在跟踪的股票，让系统用 Frank 框架持续检查 thesis 是否变化。
```

#### 6. 每周「Frank Lens Update」

Max 用户每周看到一份更新：

- 观察列表里哪些股票 posture 变了
- 哪些证伪条件接近触发
- 哪些新推文改变了证据强度
- 哪些股票进入 / 退出 Frank-style Radar

这可以先做站内页面，不急着做邮件。后续可接邮件。

#### 7. Radar 只做付费预览，不替代个股诊断

`frank-style-stock-radar.md` 是「发现候选」，本计划是「对用户关心的一只股票做持续诊断」。

关系：

```text
Frank Radar     -> 帮用户发现值得看的股票
Ticker Diagnosis -> 帮用户判断某只股票是否仍成立
Saved Monitor    -> 帮用户持续追踪是否证伪
```

首页可以放 Radar 的 Top 3 免费预览，但完整列表和解释归 Max。

## 数据流

```text
/kol/qinbafrank
  用户输入 ticker
        |
        v
GET /api/kol_research/personas/qinbafrank/tickers/{ticker}
  现有：原文 + 价格 + summary
        |
        v
POST /api/kol_research/personas/qinbafrank/diagnose
  新增：Frank Framework Diagnosis
        |
        +-- v3 ticker playbook / sector skill
        +-- cockpit tweet evidence
        +-- FMP quote / fundamentals / history
        +-- macro risk dashboard
        +-- optional: latest KOL RAG
        |
        v
返回结构化 diagnosis
        |
        v
用户点击保存
        |
        v
POST /api/kol_research/personas/qinbafrank/monitors
        |
        v
GET /api/kol_research/personas/qinbafrank/monitors
  首页 / stocks 页展示持续观察列表
```

## API 变更

### Public / Free

保留现有公开端点：

- `GET /api/kol_research/personas/{username}/profile`
- `GET /api/kol_research/personas/{username}/sectors_v3`
- `GET /api/kol_research/personas/{username}/tickers`
- `GET /api/kol_research/personas/{username}/tickers/{ticker}`
- `GET /api/kol_research/personas/{username}/feed`

### Max Gated

新增：

| Method | Path | 用途 | 权限 |
|---|---|---|---|
| POST | `/api/kol_research/personas/{username}/diagnose` | 生成 Frank 框架诊断 | Max (`ai_research_engine`) |
| GET | `/api/kol_research/personas/{username}/diagnoses/{ticker}` | 获取当天缓存诊断 | Max |
| POST | `/api/kol_research/personas/{username}/monitors` | 保存观察项 | Max |
| GET | `/api/kol_research/personas/{username}/monitors` | 用户观察列表 | Max |
| PATCH | `/api/kol_research/personas/{username}/monitors/{id}` | 更新证伪条件 / 备注 | Max |
| DELETE | `/api/kol_research/personas/{username}/monitors/{id}` | 删除观察项 | Max |
| GET | `/api/kol_research/personas/{username}/weekly-update` | 每周 Frank Lens Update | Max |

权限策略：

- 公开浏览仍不需要登录。
- 诊断报告、保存观察、weekly update 需要登录 + Max entitlement。
- 如果 `kol_research_agent` flag 仍用于灰度，则需要同时满足 flag + entitlement；正式上线后应从 feature flag 转为 entitlement gate。

## 数据库变更

新增表或 Edge Function 数据结构：

### `kol_persona_monitors`

```sql
id uuid primary key
user_id text not null
persona_username text not null
ticker text not null
thesis_summary text
posture text
score numeric
falsifiers jsonb default '[]'
evidence_tweet_ids jsonb default '[]'
next_events jsonb default '[]'
last_diagnosis jsonb
last_checked_at timestamptz
created_at timestamptz default now()
updated_at timestamptz default now()
unique(user_id, persona_username, ticker)
```

### `kol_persona_diagnoses`

可选缓存表，避免同一用户 / 同一 ticker 当天重复生成：

```sql
id uuid primary key
user_id text not null
persona_username text not null
ticker text not null
diagnosis_date date not null
diagnosis jsonb not null
created_at timestamptz default now()
unique(user_id, persona_username, ticker, diagnosis_date)
```

## 前端变更

### `/kol/[username]`

- 首屏从泛 ChatComposer 改成「股票检查入口」。
- 增加 `SavedMonitorStrip`：登录 Max 用户显示已保存观察；免费用户显示空态 CTA。
- 2x2 模块中加入 `Frank Radar Preview`，替代重复的追问卡或降低追问卡权重。

### `/kol/[username]/stocks`

- `TickerDetail` 顶部增加 `FrankLensSnapshot`。
- `PriceTimelineChart` 下方增加「Thesis 是否仍成立」区块。
- 原文摘录旁加入「作为证据加入观察」按钮，仅 Max 可用。
- CTA 从「问问他怎么看」改成两个动作：
  - `生成 Frank 框架诊断`
  - `加入 Frank 观察`

### `/kol/[username]/sectors`

- 每个 sector detail 底部加入「按这个框架检查股票」输入。
- AI infra / HBM / stablecoin 等板块卡直接带常见 ticker 快捷入口。

### `/pricing`

Max 功能文案新增一条：

```text
Frank 框架股票诊断与持续观察
用 qinbafrank 的公开方法论检查股票，保存 thesis 和证伪条件，持续追踪变化。
```

## 实施步骤

### Phase 0 · 产品表达快速修正（1 天）

1. [ ] 修改 `/kol/qinbafrank` 首屏文案：从「追问视角」改为「用 Frank 框架检查一只股票」。
2. [ ] 修正 ticker CTA：`TickerDetail` 的「问问他怎么看」改为带 `q=` 的明确问题，例如 `q=用 Frank 的框架分析 NVDA，现在 thesis 是否仍成立？`。
3. [ ] 在个股页顶部增加静态/半动态 `FrankLensSnapshot` MVP，先复用 `detail.summary.coverage`、sector、count、latest。
4. [ ] 在 `/pricing` Max 文案里加入 Frank 框架诊断卖点。

验收：用户从首页输入 `NVDA` 或点击个股 CTA 后，能明确进入「Frank 框架分析 NVDA」而不是泛聊天。

### Phase 1 · 付费诊断 MVP（3-5 天）

5. [ ] 新增 `diagnose` 后端 service，先不建复杂 scoring engine，基于 ticker detail + v3 playbook + FMP quote + macro risk 输出结构化 diagnosis。
6. [ ] 新增 `POST /api/kol_research/personas/{username}/diagnose`，使用 Max entitlement gate。
7. [ ] 前端新增 `FrankDiagnosisPanel`，显示 posture、score breakdown、direct evidence、methodology inference、falsifiers。
8. [ ] 免费用户显示诊断 preview + Max CTA；Max 用户显示完整内容。
9. [ ] 单测：无 tweet id 时不得输出 direct evidence；非 qinbafrank 返回 404 或 unsupported。

验收：Max 用户能对任意 covered ticker 生成一份可追溯诊断；免费用户能看懂被锁住的价值。

### Phase 2 · 保存观察（3-5 天）

10. [ ] 新增 `kol_persona_monitors` Edge Function / DB helper。
11. [ ] 新增 monitors CRUD API。
12. [ ] `FrankDiagnosisPanel` 加「加入 Frank 观察」按钮。
13. [ ] 首页加 `SavedMonitorStrip`，展示用户已保存 ticker 的 posture、last_checked_at、next_event。
14. [ ] `TickerDetail` 对已保存 ticker 显示「观察中」状态。

验收：用户能保存股票，刷新页面后仍看到自己的 Frank 观察列表。

### Phase 3 · 每周更新和复访闭环（5-7 天）

15. [ ] 新增 `weekly-update` service：对用户 monitors 批量检查最新价格、最新推文、next events、macro risk 变化。
16. [ ] 新增 `/kol/qinbafrank` 首页「本周 Frank Lens Update」区块。
17. [ ] 如果有 posture 变化或证伪条件接近触发，给出醒目提示。
18. [ ] 保存上次 update，避免每次访问重复生成。
19. [ ] 后续可接 Pro/Max 邮件，但本期先只做站内。

验收：用户下周回来能看到「哪些观察项发生变化」，而不是重新看同一批静态内容。

### Phase 4 · Radar 接入（后续）

20. [ ] 将 `frank-style-stock-radar.md` 的候选结果接入页面，首页显示 Top 3 预览。
21. [ ] 完整 radar、score breakdown、加入观察按钮只给 Max。
22. [ ] Radar 候选和用户 monitors 打通：如果已在观察列表，显示状态变化。

验收：Frank 页面同时支持「发现新机会」和「追踪已有 thesis」。

## 成功指标

### 转化指标

- `/kol/qinbafrank` → `/research?agent=kol...` 点击率。
- ticker CTA 点击率。
- 免费用户点击 diagnosis paywall CTA 的比例。
- 试用用户中使用 Frank diagnosis 的比例。
- 使用 Frank diagnosis 后转 Max 的比例。

### 留存指标

- 每个 Max 用户保存的 Frank monitors 数量。
- 保存 monitor 后 7 日复访率。
- Weekly update 页面打开率。
- 同一 ticker 的二次诊断率。

### 质量指标

- 每份 diagnosis 的 direct evidence 是否都有 tweet id。
- 用户点击「原文支持」链接的比例。
- 用户对 diagnosis 的反馈（有用 / 不准 / 太泛）。

## 风险

| 风险 | 应对 |
|---|---|
| 看起来像冒充 Frank 本人 | 全页继续强调「公开推文蒸馏，非本人发言」；文案用「Frank 框架」而非「Frank 认为」 |
| 付费功能像荐股 | 输出 posture，不输出 Buy/Sell；所有建议都带证伪条件和非投资建议 |
| LLM 伪造原文支持 | direct evidence 必须来自 tweet id；后端校验 tweet_id 来源 |
| 诊断太像一次性报告 | 保存观察 + weekly update 是必做，否则持续付费弱 |
| 用户不理解 score | score 必须拆成 pillar，并用短句解释每一项，不做黑箱分数 |
| 和 `/stock` 功能重叠 | `/stock` 是中性个股深研；Frank 页面是 persona framework diagnosis + evidence trail |

## 待定问题

1. Frank diagnosis 应该属于 Max 的 `ai_research_engine`，还是新增独立 entitlement `kol_persona_diagnosis`？
2. 免费用户每天是否给 1 次完整 Frank diagnosis 试用，还是只给 preview？
3. `kol_research_agent` feature flag 正式上线后是否退役，改为 entitlement gate？
4. Weekly update 是否需要邮件推送？如果推送，属于 Pro 还是 Max？
5. 保存观察是否只支持 Frank，还是数据结构一开始支持未来多 KOL？
