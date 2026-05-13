# P1 · 智能层：事件整合 + 持仓体检 + 记忆反馈

> Status: Planning
> Priority: P1（依赖 P0 数据层）
> Related: features/brew/.context.md, features/macro/risk/.context.md
> Vision: roadmap.md > 专属系统 > 每日报告升级（连线层）/ 持仓体检 / 记忆系统

## 目的

P0 让系统知道"你是谁、你持什么"。P1 让系统**替你判断、替你记住**：

- **事件整合**：顶部 Action Bar 出现"最紧迫一件事"，不和 digest 底部 events 重复
- **持仓体检**：周度 4 维健康分 + AI 诊断 + `next_action`；insights 回流每日 brew
- **记忆反馈**：thesis 轻量录入 + 一键 👍/👎 + T+7 建议追踪 + 月度复盘

三者共享同一条"连线层"：事件 → 体检 → 记忆 → 下一次报告。

## 用户心智

> "我一个月调一次仓。你每周过一遍我的组合，有事告诉我；每天的 Digest 能感觉到你记得上周那件事；我对哪条建议有意见点一下就行。"

## User Stories

### US-1 · 进入主页看到"最紧迫一件事"（事件整合）

```
Action Bar chip 显示: ⏰ T-2  NVDA 财报 · 仓位 32% · EPS $0.89
点击 → /stock/NVDA?tab=earnings
其他事件不上 Action Bar；想看完整列表就往下滚看 digest 底部的"重要事件"。
```

### US-2 · 首次体检（持仓体检）

```
"持仓体检" tab（首次进入）
  → [生成我的第一份体检] CTA
  → ~10 秒 loading
  → 4 张数据卡（健康分 / 板块 / 表现 / 宏观敏感度）
  → AI 诊断段 + 一条 next_action（"考虑加入防御性配置"）
  → 底部 [👍 有用] [👎 不准]
结果: 下次进入读缓存即开即看
```

### US-3 · 回流感知（体检 → digest）

```
用户不主动体检，但看 digest：
  - Action Bar 出现: 🟡 科技集中度 78% 持续一周
  - quick_take 里 AI 主动引用: "考虑到你的集中度风险，NVDA 今天的下跌..."
结果: 用户感知到"系统在背后持续看着我的组合"。
```

### US-4 · 写 thesis 的对的时机（记忆反馈）

```
加完 NVDA 的那一刻，持仓卡下方轻提示:
  "一句话说说为什么买 NVDA？(可跳过)"
  [看好 AI 资本开支] [长期持有] [🎤 语音] [✍️ 自己写] [跳过]
30 秒完成，存到 user_portfolios.thesis。
下次 AI 讨论 NVDA 时会引用这句。
```

### US-5 · 一键反馈（记忆反馈）

```
任何 AI 段落下方永远两个 icon: [👍] [👎]
点 👎 → 3 秒浮窗: [不准] [已经知道了] [不相关]
点完或 3 秒自动关。
→ 下周生成同类内容时 prompt 注入"用户上周对这类建议 👎"。
```

### US-6 · T+7 建议追踪

```
体检建议 "考虑加防御" → 7 天后自动回填 outcome
下次生成体检时 agent 先说:
  "上周我建议你加防御。过去 7 天防御 +1.2%，你的科技 -3.1%。方向正确。"
结果: 信任闭环。
```

### US-7 · 月度复盘（懒触发）

```
4 月 1 号第一次进 /for-you → Modal:
  - 健康分: 58 → 65
  - 反馈: 12 👍 / 4 👎 (75% 准)
  - 画像更新建议: 你的 thesis 60% 提到"长期"，要不要把风险容忍从 moderate → higher？
  [确认更新] [保持现状]
```

## 需求维度覆盖

| 维度 | 覆盖 |
|---|---|
| 不和现有 events 重复 | ✔ 顶部只输出"最紧迫一件" |
| 可复现评分（非 AI 幻觉） | ✔ service.py 纯 Python |
| 仓位加权 | ✔ 依赖 P0 `effective_weight` |
| 回流 brew（连线层） | ✔ `portfolio_insights` 表 + instruction 注入 |
| 零写字摩擦 thesis | ✔ 预设 + 语音 |
| 反馈沉淀到 prompt | ✔ recent feedback 注入所有 agent |
| 被动投资者定位 | ✔ 默认不打扰，Action Bar 唯一"催用户"的入口 |

## 设计

### 1) 事件整合

**不新建** `/api/brew/events` 端点。事件来源完全复用 digest 已有数据：

```python
class TopEvent(BaseModel):
    type: Literal["earnings", "macro", "grade_change", "none"]
    symbol: str | None
    title: str              # "NVDA 财报"
    days_until: int
    why_for_you: str        # "仓位 32% | EPS $0.89"
    severity: Literal["info", "watch", "urgent"]
    link: str

class DigestResponse(BaseModel):
    ...
    top_event: TopEvent | None
```

选择规则（纯 Python）：

```
候选 = digest.stocks 的 T≤7 财报 + digest.events 的 T≤5 高影响宏观
score = (1 / (days_until + 1)) * (effective_weight + severity_bonus)
top_event = max(候选, key=score) if score > threshold else None
```

宏观→板块映射抽到 `backend/app/features/brew/macro_map.py`，供 digest 本身 + top_event 选择 + 体检宏观敏感度共用。

### 2) 持仓体检

**架构**：

```
POST /api/portfolio/health ──── verify_user_token
  │
  ├── [并行] quotes / profiles / 1w returns / macro_risk
  ├── [Python] 4 维评分（必须用 effective_weight）
  ├── [Gemini Flash-Lite] 诊断 agent
  │     输入: 评分 + 画像 + 最近反馈
  │     输出: diagnosis_markdown + one_line + next_action + sector_dna + top_risk
  ├── save → portfolio_health_reports
  └── save → portfolio_insights ──► brew agent 下次读取
```

**4 维评分**（各 0-25 分）：

| 维度 | 输入 | 降级（数据缺失） |
|---|---|---|
| 分散度 | 板块数 + 最大占比（加权） | sector 缺 → "Unknown" 归一类 |
| 表现 | 1w 加权收益 vs SPY | 缺历史 → 12.5 默认 |
| 宏观适配 | macro_risk × 组合敏感因子 | 缺 macro → 12.5 |
| 稳定性 | 加权日收益率 5d 波动率 / SPY 波动率 | 缺历史 → 12.5 |

**`next_action` 输出约束**：只允许 `rebalance` / `research` / `none`；不出具体交易指令（合规）。

**缓存**：同日 + 同 symbols + weight 变化 <5% 返回缓存；否则重新生成。

**回流 brew**：`portfolio_insights` 最新行注入 digest agent instruction：

```
## 最近体检 insights（距今 N 天）
- 健康分: {health_score}/100
- 主要风险: {top_risk}
- 宏观敏感度: {macro_sensitivity_tag}
- 组合风格: {sector_dna}
要求: 分析相关新闻时围绕 top_risk 展开；quick_take 在适当位置自然引用；距今 >14 天不注入。
```

**周度邮件**：周一 07:00 UTC cron + Resend batch。仅 `notify_mode in (events_only, daily)` 的用户收到。**当前无浏览器/微信推送渠道**。

### 3) 记忆反馈

**Schema 增量**：

```sql
CREATE TABLE ai_feedback (
  id UUID PRIMARY KEY,
  user_id TEXT NOT NULL,
  target_type TEXT,       -- digest_quick_take | health_diagnosis | action_bar_chip | ...
  target_id TEXT,
  sentiment SMALLINT,     -- +1 / -1
  reason TEXT,            -- 不准 | 已知 | 不相关 | 自由
  snapshot JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  INDEX(user_id, target_type, created_at DESC)
);

CREATE TABLE suggestion_tracking (
  id UUID PRIMARY KEY,
  user_id TEXT NOT NULL,
  source TEXT,            -- health_check | action_bar | ...
  suggestion_text TEXT,
  suggestion_date DATE,
  symbols TEXT[], sectors TEXT[],
  follow_up_at DATE,      -- 通常 T+7
  outcome JSONB,
  INDEX(follow_up_at)
);
```

**Thesis 录入时机**（不做必填，只做对的时机的轻提示）：

1. 刚加仓 → portfolio PUT 响应带 `prompt_thesis: true`
2. 股票卡展开详情 → 底部一行"记一下？"
3. 红色 Action Bar 出现 → "你当初为什么买 NVDA？"

UI：`QuickThesisInput` = 3-5 个 context 相关预设 + 🎤 Gemini STT + ✍️ 自由 + [跳过]。

**反馈组件 `<FeedbackBar>`**：低对比度一对 icon 默认不扰人；点 👎 弹 3 秒原因 chip。嵌入位置：
- Digest 每个 stock quick_take 下方
- Digest headline news 下方
- 体检 diagnosis_markdown 下方
- Action Bar 右侧（整体一次反馈）

**Memory 注入 prompt**（所有 agent 生成前调一次 `get_user_memory(user_id)`）：

```
## 用户记忆
【持仓 thesis】
- NVDA: 看好 AI 资本开支
- AAPL: 长期持有，分红现金流

【反馈倾向（近 7 天）】
👎 类型: 日内涨跌解读、过度泛化宏观建议
→ 避开这类表达

【未到期建议】
5 天前建议 "考虑加防御"，尚未到 T+7 评估
→ 如合适可在总结里提"上周的建议还在观察中"
```

**建议追踪 cron**（每天 01:00）：`follow_up_at = today` 的建议跑 `compute_outcome()`（纯数据：对应板块/股票过去 7 天 vs SPY）。T+7 outcome 回填后下次 agent 生成时主动引用。

**月度复盘**：前端懒触发 modal。内容聚合 = DB SQL（健康分曲线、反馈计数、命中率）+ 简短 LLM 叙事（~1000 token）。画像更新只是**建议**，用户点确认才写入。

## LLD Unit U1-A · 事件整合 → `digest.top_event`

> Scope: `macro_map.py` 抽出 + `select_top_event()` 纯函数 + `DigestResponse.top_event` 字段。**不新建端点**。
> Depends: U0-A（`effective_weight_pct`、`user_investment_profiles`）
> Consumed by: **U0-B ActionBar**、U1-B（macro_map 复用）、U1-C（`source_id` 作为 feedback target_id）
> Status: LLD Ready.

### 1) 实现目标（Work backward）

用户心智："每天 10 秒，就想知道下一个坑在哪。" → 顶部 chip 一行：`⏰ T-2 NVDA 财报 · 仓位 32%`。**只选一件**，不够紧迫就空——宁可没有，也不要三个中等事件拥挤上去。挑选依据 = 用户自己的持仓权重 × 紧迫度，不是全市场视角。

### 2) 正向分析

- **合力**：完全附着在现有 `GET /api/brew/digest` 响应上，前端多一个字段即可；`macro_map` 抽出后被 digest 叙事 / 体检宏观敏感度（U1-B）/ top_event 选择**三处共用**，单点维护。
- **涌现基础**：`TopEvent.source_id` 作为稳定键（如 `earnings:NVDA:2026-05-03`），U1-C 反馈直接引用、U2-B 跨持仓连线可按 source 聚类。
- **专属性自检**（原则 1）：事件列表本身不专属（digest 底部已展示），但"从 20 条挑这 1 条"这一步依赖 `effective_weight_pct` → 是真专属；免费用户无持仓 → `top_event = None`，Action Bar 走稳定态模板。
- **AI 分工**（原则 2）：该单元**全部走规则，无 LLM 调用**——是 P1 里最纯粹的"数据决策"边界；语言 polish 由下游 U0-B 承担。

### 3) 架构 & 前后端细节

```
backend/app/features/brew/
├── service.py                    # 注入 top_event 到 response
├── event_selector.py   ← 新增    # select_top_event() 纯函数
└── macro_map.py        ← 新增    # 宏观 → 板块 / 严重度静态映射
```

**选择流程（纯 Python，<10ms，`pytest` 可覆盖）**：

```python
# backend/app/features/brew/event_selector.py
SEVERITY_BONUS = {"urgent": 0.4, "watch": 0.2, "info": 0.0}

class TopEvent(BaseModel):
    type: Literal["earnings", "macro", "grade_change"]
    symbol: str | None
    title: str                 # "NVDA 财报"
    days_until: int            # 0-7
    why_for_you: str           # "仓位 32% | EPS 预期 $0.89"
    severity: Literal["info", "watch", "urgent"]
    link: str                  # "/stock/NVDA?tab=earnings"
    source_id: str             # "earnings:NVDA:2026-05-03"（feedback/cache key）

def select_top_event(
    earnings: list[EarningsEvent],       # digest.stocks 已有
    macros:   list[MacroEvent],          # digest.events 已有
    grades:   list[GradeChange],         # FMP grades, 缺省空
    holdings: dict[str, float],          # symbol -> effective_weight_pct
) -> TopEvent | None:
    cands = []
    for e in earnings:
        if e.days_until > 7: continue
        w = holdings.get(e.symbol, 0)
        if w < 1: continue               # < 1% 仓位不算"你的"事件
        sev = "urgent" if e.days_until <= 2 else "watch" if e.days_until <= 5 else "info"
        score = (1 / (e.days_until + 1)) * (w / 100 + SEVERITY_BONUS[sev])
        cands.append((score, TopEvent(type="earnings", ...)))
    # macros: impact 查 macro_map; 影响板块 ∩ 用户板块 > 0 才入选
    # grades: 下调 + 仓位 > 5% 才入选
    if not cands: return None
    score, ev = max(cands, key=lambda x: x[0])
    return ev if score >= 0.15 else None     # threshold 消除低相关
```

**`macro_map.py`**（静态 ~30 条，手工维护）：

```python
MACRO_MAP: dict[str, MacroRule] = {
    "CPI":  MacroRule(title_zh="美国 CPI", sectors=["Tech", "Consumer Discretionary", "REITs"], impact="high"),
    "FOMC": MacroRule(title_zh="美联储决议", sectors=["All"], impact="critical"),
    # NFP / GDP / PPI / retail_sales / ISM_PMI / ECB / BoJ / ...
}
def sectors_for(key: str) -> list[str]: ...
def impact_for(key: str) -> Literal["low", "mid", "high", "critical"]: ...
```

**Digest response 增量**（向后兼容）：

```python
class DigestResponse(BaseModel):
    ...existing fields...
    top_event: TopEvent | None = None
```

**前端**：TS 类型同步扩；`ActionBar`（U0-B）订阅 `digest.top_event`，空则稳定态模板。无新 hook。

**避免 regression**：
- 新文件 + 新字段，旧消费者（web / 邮件 digest 模板）完全不感知
- `event_selector` 纯函数 → golden cases 覆盖：T=0/2/6 财报、宏观板块交叉、空候选、等权 fallback、阈值边界

### 4) 数据库

**无新表**。`TopEvent.source_id` 格式 `"earnings:NVDA:2026-05-03"` 是足够稳定的引用键，U1-C `ai_feedback.target_id` 直接写入，不建独立 events 表。

### 5) Agent 模块

**无 LLM**。纯规则、可复现、零幻觉——这是 /for-you 里"关键决策必须走规则"原则的最佳实践样本。

**评估**：
- **Golden set（离线）**：10 份真实用户仓位 × 5 天事件快照 → 人工标注"应该挑哪条" → 算法命中率目标 ≥ 70%
- **上线指标**：`top_event_exists_rate`（目标 20-50%，过高阈值松、过低不有用）；`top_event_chip_ctr`（黄态 chip CTR）
- **迭代路径**：
  - V1：上述规则 + 阈值 0.15
  - V2：按画像微调权重（short 用户 earnings ×1.5；low risk 用户 macro ×1.5）
  - V3：U1-C feedback 驱动——同 `source_id` 上周 👎 则本周降分（`ai_feedback.target_type = action_bar_chip`）

### 6) Rollout & 回归防护

- Feature flag：不需要。新字段可空，前端方判空。
- **回归**：
  - [ ] 无持仓用户 → `top_event = None`，digest 其他字段不缺
  - [ ] 全部 earnings T > 7 → `top_event = None`
  - [ ] `effective_weight` 全 0（等权 fallback）→ 按 `1/n` 仍能选出
  - [ ] macro_map 未覆盖的事件 key → log warning + 忽略，不崩
- **指标**：`top_event_exists_rate` / `top_event_chip_ctr` / 与 U1-B `top_risk` 重合率（观察是否"事件驱动"和"结构风险"是同一个锚点）

### 导出给 U0-B 的接口契约

```python
# backend/app/features/brew/models.py 追加
class DigestResponse(BaseModel):
    ...
    top_event: TopEvent | None   # U0-B 唯一事件信号来源
```

**约束**：
- U0-B **不得**自行二次拉 earnings/macros 重选；只读此字段
- `top_event.severity` 直映 ActionBar chip 颜色：`urgent → red` / `watch → yellow` / `info → 不上 ActionBar`
- chip 跳转 = `top_event.link`
- `top_event.why_for_you` 可直接做 chip label 或 headline LLM polish 的素材

### U1-A 交付 Checklist

| # | 任务 | Owner | 状态 |
|---|---|---|---|
| A1 | `macro_map.py` 30 条映射 + 单元测试 | 后端 | ⏳ |
| A2 | `event_selector.py::select_top_event()` + golden tests | 后端 | ⏳ |
| A3 | `DigestResponse.top_event` 字段 + service 注入 | 后端 | ⏳ |
| A4 | 前端 TS 类型 + ActionBar 对接（与 U0-B 联调） | 前端 | ⏳ |
| A5 | 回归 + 指标埋点 | 全栈 | ⏳ |

**DoD**：golden set 命中率 ≥ 70% + staging 一天 `top_event_exists_rate` 落在 20-50% 区间 + 无 digest regression（快照测试通过）。

---

## LLD Unit U1-B · 持仓体检（health_score + NextAction + 回流 digest）

> Scope: `/api/portfolio/health`（POST/GET latest）+ 4 维评分（规则）+ 诊断 agent（LLM）+ `portfolio_health_reports` + `portfolio_insights` 回流 + weekly cron 邮件
> Depends: U0-A（`effective_weight_pct` + `user_investment_profiles`）、U1-A（`macro_map` 复用）
> Consumed by: **U0-B ActionBar**（黄态 `top_risk` / `next_action`）、U1-C（`suggestion_tracking` 的 next_action 源）、U2-A What-If、U2-D 月度回顾
> Status: LLD Ready.

### 1) 实现目标（Work backward）

用户心智："一个月调一次仓，你每周替我看一眼。" → 一个 Tab，首次 [生成我的第一份体检] → ~10s → 4 张数据卡 + 一段人话 + **1 条** next_action（不是 10 条建议）。之后进 Tab 读缓存即开即看。**不主动体检的人**也能通过 digest 感知"背后有人看着"（`portfolio_insights` 回流到每日 quick_take）。关键是连线层——不让 Tab 变成一个死孤岛。

### 2) 正向分析

- **合力（核心价值）**：`portfolio_insights` → digest agent instruction 注入 → brew 自然引用"考虑你的科技集中度 78%..."。这是整个 /for-you 产品的**连线层**：把孤立的体检拉进每天的阅读路径。
- **解锁 P2**：What-If（U2-A）修改持仓立即跑体检对比；Crisis Mode（U2-C）用 `health_score` 下降速度判定"真危险 vs 正常波动"；月度复盘（U2-D）画 health_score 趋势线。
- **专属性自检**（原则 1）：4 维评分 = effective_weight × sector × profile 风险容忍，每一维都引用用户自己的仓位/画像；免费用户无持仓无画像 → 无法生成。
- **AI 分工**（原则 2）：评分走规则（可复现、可测、可画 90 天趋势），诊断 markdown 走 LLM（人话 + 画像语气），next_action.type 走 LLM 但约束到三值枚举（规则护栏）。与 U0-B ActionBar 同构。
- **涌现基础**：`suggestion_tracking` 在每次体检生成时自动埋 T+7 follow-up（U1-C），形成"建议 → 追踪 → outcome → 下次引用"信任闭环。

### 3) 架构 & 前后端细节

```
backend/app/features/portfolio_health/    ← 新 feature module
├── .context.md
├── router.py             # /api/portfolio/health[...]
├── service.py            # 并行取数 + 缓存编排
├── scoring.py            # 4 维纯函数（可单测、零外部依赖）
├── agent.py              # DiagnosisAgent (gemini-3.1-flash-lite-preview)
├── db.py                 # health_reports + insights 读写
└── models.py             # Pydantic schema + NextAction

backend/app/features/brew/service.py
  └── _load_portfolio_insights(user_id) + 注入 agent.instruction
       （flag: ENABLE_HEALTH_INJECTION, 距今 > 14 天不注入）
```

**端点**（均 `Depends(verify_user_token)`）：

| Method | Path | 用途 | Rate Limit |
|---|---|---|---|
| POST | `/api/portfolio/health` | 生成或读缓存（幂等） | 无（缓存保护） |
| POST | `/api/portfolio/health?force=1` | 强制重算 | 5/h/用户 |
| GET  | `/api/portfolio/health/latest` | **仅读缓存**（U0-B ActionBar 用） | 无 |

**POST /health 流程**：

```
verify_user_token
 → load_portfolio() + load_profile()
 → 空持仓 → 400 "请先添加持仓"
 → cache_key = hash(user_id, date_utc, symbols_sorted, round(weights*20), profile.version)
 → 命中 → 直接返回
 → 并行取数:
    ├─ data_tools.get_quotes_batch(symbols)
    ├─ data_tools.get_company_profiles_batch(symbols)
    ├─ data_tools.get_historical_returns(symbols, 5d+1w+1m)
    └─ macro_risk_service.get_current()
 → scoring.compute_all(...) → HealthScore(dispersion, performance, macro_fit, stability, total)
 → DiagnosisAgent.run(score + profile + recent_feedback + thesis_map)
    → DiagnosisOutput(markdown, one_line, next_action, top_risk, sector_dna, macro_sensitivity_tag)
 → save → portfolio_health_reports
 → upsert → portfolio_insights（覆写 latest）
 → 若 next_action.type ∈ {rebalance, research} → INSERT suggestion_tracking (follow_up_at = today + 7)
 → return HealthResponse
```

**缓存语义**：
- Key：`user_id + date(UTC) + hash(sorted(symbols)) + hash(round(weights*20)) + profile.version`
- 权重变化 < 5% → 视同命中（`round(weight*20)/20` 即 5% 对齐）
- 画像变 → `profile.version++`（U0-A 已预留字段）→ key 必变
- 自然日边界自动失效（价格每天都变，即使持仓没变也应重算一次）

**前端**：

```
frontend/src/app/for-you/health/page.tsx     ← 新路由
frontend/src/components/for-you/health/
├── HealthTab.tsx              # 状态机容器
├── FourScoreCards.tsx         # 4 张卡（分散度 / 表现 / 宏观 / 稳定性）
├── DiagnosisPanel.tsx         # markdown + one_line + <NextActionChip>
└── FirstTimeEmpty.tsx         # [生成我的第一份体检] CTA
```

状态机：
```
empty_portfolio   → EmptyState（跳 /for-you/portfolio）
no_cache          → FirstTimeEmpty + [生成]
has_cache         → 直接渲染；右上 [重新生成]（force=1, 5/h）
generating        → 骨架屏 + "正在分析你的 N 只持仓..."（10s 预期）
error             → 重试 CTA + toast
```

**避免 regression**：
- 新 feature module；不触 brew / screener / research 已有代码
- `data_tools` 新增函数（`get_historical_returns`、`get_company_profiles_batch`）**不改**旧签名
- digest agent 注入点走 `ENABLE_HEALTH_INJECTION` flag（config），staging on → prod 灰度 on
- `portfolio_insights` 读失败 → log warning + digest 走无 insights 路径（degradation），**不 raise**
- `portfolio_insights.updated_at > 14d` → instruction 不注入，避免过期建议污染

### 4) 数据库

**表 1 · `portfolio_health_reports`**（完整历史，支持趋势/复盘）

```sql
CREATE TABLE portfolio_health_reports (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          TEXT NOT NULL,
  generated_at     TIMESTAMPTZ DEFAULT now(),

  -- 输入快照（可复现）
  holdings_snapshot JSONB NOT NULL,      -- [{symbol, effective_weight_pct, shares?}]
  profile_snapshot  JSONB NOT NULL,

  -- 评分分列（便于 SQL 聚合、趋势查询）
  score_total       INTEGER NOT NULL,    -- 0-100
  score_dispersion  INTEGER NOT NULL,    -- 0-25
  score_performance INTEGER NOT NULL,
  score_macro_fit   INTEGER NOT NULL,
  score_stability   INTEGER NOT NULL,

  -- LLM 结果
  diagnosis_markdown     TEXT,
  one_line              TEXT,            -- ≤ 60 字, Action Bar 可用
  next_action           JSONB,           -- {type, text, symbols[]}
  top_risk              TEXT,            -- ≤ 30 字
  sector_dna            TEXT,            -- "Tech-heavy Growth Tilt"
  macro_sensitivity_tag TEXT,

  cache_key             TEXT NOT NULL,
  UNIQUE(user_id, cache_key)
);
CREATE INDEX idx_health_user_time ON portfolio_health_reports(user_id, generated_at DESC);
```

**分列 vs JSONB 取舍**：4 个子评分**分列**，因为 U2-D 要画 90 天趋势、U2-C 要 SQL 判"下降速度"；markdown/next_action 体积大且不被检索 → TEXT/JSONB。

**表 2 · `portfolio_insights`**（回流专用，每人一行 latest）

```sql
CREATE TABLE portfolio_insights (
  user_id               TEXT PRIMARY KEY,    -- 每人一行, upsert 覆写
  updated_at            TIMESTAMPTZ DEFAULT now(),
  source_report_id      UUID REFERENCES portfolio_health_reports(id),

  health_score          INTEGER,
  one_line              TEXT,
  top_risk              TEXT,
  sector_dna            TEXT,
  macro_sensitivity_tag TEXT,
  next_action           JSONB
);
```

**为什么独立一张表**：digest 热路径每请求读一次，复用 `portfolio_health_reports` 需要 `ORDER BY generated_at DESC LIMIT 1`（虽有索引但仍是 sort）；单行覆写表 = PK hash 直查；同时**物理隔离** "历史（不变）" 与 "实时注入（覆写）" 两种用途，避免误更新历史行。

**`suggestion_tracking` 联动**（U1-C 建表，本 Unit 只写入）：
- `next_action.type ∈ {rebalance, research}` → `INSERT suggestion_tracking (source='health_check', suggestion_text=next_action.text, follow_up_at = today + 7, symbols, sectors)`
- `none` → 不埋点

### 5) Agent 模块

**Model**：`gemini-3.1-flash-lite-preview`（与 brew / research 共栈）

**Schema**：

```python
class NextAction(BaseModel):
    type: Literal["rebalance", "research", "none"]
    text: str                # ≤ 40 字, 禁指令性动词
    symbols: list[str]

class DiagnosisOutput(BaseModel):
    one_line:              str     # ≤ 60 字
    diagnosis_markdown:    str     # 3-5 段, 每段引用具体数字
    top_risk:              str     # ≤ 30 字
    sector_dna:            str     # 如 "Tech-heavy Growth Tilt"
    macro_sensitivity_tag: Literal["low", "mid", "high"]
    next_action:           NextAction
```

**Instruction 护栏**（structured lint 在 CI 跑）：
1. markdown 必须引用至少 1 个具体数字（`health_score` / 前 2 仓位 / 板块占比）
2. `next_action.text` 禁用词：`买入 / 卖出 / 加仓 / 减仓 / N 股 / N%` → 命中即 lint fail；允许 `考虑 / 研究 / 了解 / 评估`
3. 有 thesis 的股票 → `top_risk` 或 `diagnosis_markdown` 至少引用 1 次 "你当初说..."
4. 近 7 天 `ai_feedback.sentiment=-1 AND target_type='health_diagnosis'` 的措辞片段 → prompt 里作为"最近被 👎 的表达"提示避开

**Agent 构造**：

```python
agent = LlmAgent(
    model="gemini-3.1-flash-lite-preview",
    name="portfolio_health_diagnoser",
    instruction=inject_profile(DIAGNOSIS_INSTRUCTION, profile),  # U0-A 已有 inject_profile
    output_schema=DiagnosisOutput,
)
```

**评估策略**：

1. **离线 golden set**（10 组合 × 3 画像 = 30 case）：人工标注预期 `top_risk` 类型 / `next_action.type`；命中率 ≥ 70%；同输入跑 3 次稳定性（`one_line` 语义一致，允许措辞不同）
2. **CI lint**：每次 agent 改动自动跑 lint；pass rate 目标 ≥ 95%
3. **上线后信号**：
   - `<FeedbackBar>`（U1-C）嵌在 DiagnosisPanel 底部，按 `next_action.type` 分桶看 👍 率（目标 > 50%）
   - T+7 outcome（U1-C follow-up cron）反查：建议"加防御"的用户 7 天后防御板块是否跑赢 → 若持续为负 → 调**评分权重**，不是改 agent
4. **迭代**：反复 👎 的措辞 → few-shot 反例入 instruction；scoring 权重按 outcome 校准

**V1 不做**：RAG / cross-user pattern / 历史相似度检索。纯单用户画像 + 仓位 + 近期 feedback/thesis 注入。

### 6) Rollout & 回归防护

- **Feature flags**：
  - `ENABLE_HEALTH_TAB=false` → 前端 Tab 隐藏
  - `ENABLE_HEALTH_INJECTION=false` → digest agent 不注入 insights
  - 两者独立：Tab 可先上、回流延后，降低耦合
- **灰度**：内部 5 人 → 50 人随机 → 全量
- **回归测试**：
  - [ ] 空持仓 POST → 400，前端显示"请先添加持仓"
  - [ ] 任一数据源超时 → 4 维降级分支命中（scoring 单测已覆盖）
  - [ ] DiagnosisAgent 失败 → 返回评分 + "AI 诊断稍后可用"，不 500
  - [ ] `ENABLE_HEALTH_INJECTION=off` → digest agent 行为与改造前**位级一致**（快照测试）
  - [ ] `portfolio_insights.updated_at > 14d` → instruction 不注入（防止过期污染）
  - [ ] `next_action.text` 命中禁用词 → lint fail + fallback 模板（不上线错误建议）
- **指标**：
  - `health_generate_success_rate`、`health_p95_latency`（目标 < 12s）
  - `health_cache_hit_rate`（目标 > 60%）
  - `diagnosis_lint_pass_rate`（目标 > 95%）
  - `next_action_thumbup_rate` 按 type 分桶（目标 > 50%）
  - `digest_quick_take_mentions_top_risk_rate`（回流效果验证，目标 > 40%）
  - `suggestion_outcome_positive_rate`（T+7 回填后，目标 > 50%）

### 导出给 U0-B 的接口契约

```python
# GET /api/portfolio/health/latest  ← U0-B 专用，轻量读缓存
class HealthLatestResponse(BaseModel):
    health_score:  int | None            # None = 从未体检
    top_risk:      str | None            # 黄态 headline LLM polish 素材
    next_action:   NextAction | None     # chip label + 跳转目标
    generated_at:  datetime | None
    stale:         bool                  # updated_at > 14d → true
```

**U0-B 消费约束**：
- `build_action_bar()` 中：
  - `health_score is not None and health_score < 40` → `Signal("yellow", "health", payload=HealthLatestResponse)`
  - `next_action.type != "none"` → chip label 取 `next_action.text`（已经是人话，不需 LLM 再 polish）
  - chip link 固定 `/for-you/health`
- **不得**在 Action Bar 路径里 rerun DiagnosisAgent；只读 `/health/latest` 缓存
- `stale=true` 时 U0-B 可选展示"上次体检 N 天前"标注，但不升级 severity

### Audit Integration（R-1 / R-5.2）

#### R-1 · True Exposure + `$CASH` 零波动

`scoring.py` 的 4 维计算**全部基于** `get_true_exposure()` 的结果（U0-A 新增的共享函数），而非 raw `holdings[i].sector`。

```python
# features/portfolio_health/scoring.py
from app.features.portfolio.exposure_parser import get_true_exposure, CASH_SYMBOL

def compute_dispersion(holdings: list[HoldingView]) -> int:
    exposure = get_true_exposure(holdings)             # ETF 穿透 + $CASH 单独桶
    n_sectors = sum(1 for s, w in exposure.items() if w >= 0.05)   # 有效板块数
    max_share = max(exposure.values()) if exposure else 0
    # Cash 加成: 有现金 → 分散度 +5 分封顶 (避险本身是分散的一种)
    cash_bonus = min(5, int(exposure.get("Cash", 0) * 20))   # 25% cash → +5
    return min(25, base_score(n_sectors, max_share) + cash_bonus)

def compute_stability(holdings, returns) -> int:
    # 关键: $CASH 的 volatility / beta 固定为 0
    vol_series = []
    for h in holdings:
        w = h.effective_weight_pct / 100
        if h.symbol == CASH_SYMBOL:
            vol_series.append((w, 0.0))                # zero vol
        else:
            vol_series.append((w, compute_vol(returns[h.symbol])))
    weighted_vol = sum(w * v for w, v in vol_series)
    return score_from_vol_ratio(weighted_vol / SPY_VOL)

def compute_macro_fit(holdings, macro_risk) -> int:
    exposure = get_true_exposure(holdings)
    # Cash 对宏观波动零敞口 (避险得分)
    non_cash_weight = 1.0 - exposure.get("Cash", 0)
    # 原逻辑中"与 macro_risk 加权敏感因子"只对非 cash 板块计算, 且总分除以 non_cash_weight 归一
    ...
```

**为什么 `$CASH` 给分散度 +5 封顶而不是简单算作一个板块**：单独算板块会让"100% cash"得满分（荒谬），封顶 +5 承认现金是"有效避险但不是收益来源"。

**DiagnosisAgent instruction 扩展**（B3 内嵌）：

```
## $CASH 处理规则
- 若 exposure 包含 "Cash"，诊断中必须**认可其避险作用**，不得判定为"闲置资金"或"错失机会"
- 对 $CASH 禁止基本面分析（无 EPS / PE / 行业分析）
- 若 Cash ratio > 30%，在 sector_dna 中标注"High Cash Cushion"
```

**lint 扩展**：输出含 `$CASH` 的基本面术语（EPS / P/E / 营收 / 利润率）→ lint fail。

#### R-5.2 · 首次低分温和语气

DiagnosisAgent instruction 加条件段（B3）：

```
## 首次体检特例
若 is_first_report=True 且 score_total < 60:
  - 语气务必温和鼓励, 强调"发现优化空间正是系统价值"
  - 禁用词: "集中度过高" / "风险偏高" / "偏弱" / "不足" / "较差"
  - 改用: "可以考虑..." / "值得关注..." / "有优化空间" / "可以更均衡一些"
  - one_line 开头宜正向: "你的组合已经有 X, 接下来..."
```

**后端接入**：
- `is_first_report` 查询合并进 B5 缓存判定同一次 DB round（`SELECT 1 FROM portfolio_health_reports WHERE user_id=? LIMIT 1`）
- 作为 agent input 字段传入

**CI lint 扩展**：
```python
if result.is_first_report and result.score_total < 60:
    for kw in ["集中度过高", "风险偏高", "偏弱", "不足", "较差"]:
        if kw in result.diagnosis_markdown or kw in result.one_line:
            raise LintError(f"first_report_harsh_word: {kw}")
```

#### Audit 工期汇总

| Delta | 工期 | 归属 |
|---|---|---|
| R-1 scoring 四维改造 + $CASH 固定常量 + agent instruction + lint | +0.25d | B2 / B3 |
| R-5.2 is_first_report 查询 + instruction + lint | +0.25d | B3 / B5 |
| **U1-B 合并后** | **~4.5d**（原 4d + 0.5d） |

### U1-B 交付 Checklist

| # | 任务 | Owner | 状态 |
|---|---|---|---|
| B1 | `data_tools.get_historical_returns()` + `get_company_profiles_batch()` | 后端 | ⏳ |
| B2 | `scoring.py` 4 维纯函数 + 降级分支 + 单测（golden set） | 后端 | ⏳ |
| B3 | `DiagnosisAgent` + Pydantic schema + CI lint（禁用词 / 数字引用 / thesis 引用） | 后端 | ⏳ |
| B4 | Edge Function：`portfolio_health_reports` + `portfolio_insights` 建表 | 后端 | ⏳ |
| B5 | Router 3 端点 + 缓存 + `force=1` rate limit | 后端 | ⏳ |
| B6 | `suggestion_tracking` 写入联动（U1-C 合作点） | 后端 | ⏳ |
| B7 | brew agent 注入 `portfolio_insights`（flag + 14d 过期） | 后端 | ⏳ |
| B8 | `/for-you/health` Tab + 4 数据卡 + DiagnosisPanel + 状态机 | 前端 | ⏳ |
| B9 | `GET /health/latest` 对接 U0-B ActionBar | 前端 | ⏳ |
| B10 | Weekly cron (周一 07:00 UTC) + Resend batch（仅 `notify_mode ∈ {events_only, daily}`） | 后端 | ⏳ |
| B11 | Golden set 评估 + 灰度 rollout | 全栈 | ⏳ |
| B12 | `scoring.py` 接入 `get_true_exposure()` + $CASH 零波动常量 + lint（R-1） | 后端 | ⏳ |
| B13 | `is_first_report` 查询 + 温和语气 instruction + lint 词表（R-5.2） | 后端 | ⏳ |

**DoD**：
- Golden set lint pass ≥ 95% & 30 case 命中率 ≥ 70%
- Staging 5 位内测 3 天，50% 用户对诊断 👍
- p95 生成延迟 < 12s、缓存命中率 > 60%
- `ENABLE_HEALTH_INJECTION=off` 下 digest 快照零差异

---

## LLD Unit U1-C · 记忆 / 反馈闭环

> Scope: `ai_feedback` + `suggestion_tracking` 两张表 + `<FeedbackBar>` / `<QuickThesisInput>` 两个横向组件 + `get_user_memory()` agent 注入 + T+7 outcome cron。
> Composition: F1C.1 反馈 / F1C.2 Thesis / F1C.3 建议追踪 / F1C.4 Memory 注入（四子功能共用同一套表与组件，拆开只为工期可观测，不独立交付）
> Depends: U0-A（`user_portfolios.thesis` 字段）、U1-B（写入 `suggestion_tracking`）
> Consumed by: digest agent / health agent（U1-B） / research agent（memory 注入）；U2-D 月度回顾（聚合源）
> Status: LLD Ready.
> Out of scope: 月度复盘 modal（→ U2-D）、cross-user pattern（→ 未来）

### 通用部分

#### 1) 实现目标（Work backward）

用户心智："它越来越懂我。" → 三条证据链必须在用户眼前形成闭环：

1. **写**：加仓那一刻问"为什么买"，30 秒能过 —— thesis 被记住
2. **投**：AI 段落下 👍/👎，1 秒点完 —— 偏好被记住
3. **还**：下周 AI 自然引用"你当初说..."/"上周建议方向正确" —— 记忆被"还"回来

**沉默即专属**：FeedbackBar 默认低对比度 icon，不扰；thesis 提示只在**对的时机**出现（加仓后 / 红态 ActionBar）；记忆注入**不显式告诉用户"我记住了"**——而是让 agent 自然引用。

#### 2) 正向分析

- **连线层枢纽**：U0-A 存持仓结构、U1-A 选事件、U1-B 打分。U1-C 把这三者**带入时间维度**——上周、T+7、下次 agent 生成。没有它，整个 /for-you 是"每天重来"；有它，系统能"记得上周的事"。
- **AI 分工（原则 2）**：
  - 规则：outcome 计算（纯数据对比板块 vs SPY）、feedback 计数聚合、memory 注入模板拼装
  - LLM：无新 agent——只是**给已有 agent 多一段 instruction**（`get_user_memory(user_id)` 的输出）
  - 这是典型的"不给 LLM 新决策权，只给它更多上下文"
- **专属证据**（原则 1）：thesis / feedback 本身就是用户输入；只要注入，所有下游 AI 输出都自然变"专属"。免费无登录用户 → `get_user_memory` 返回空字符串 → 不注入 → agent 走通用路径。
- **涌现基础**：`ai_feedback.target_id` 统一引用（U1-A 的 `source_id`、U1-B 的 `report.id`、digest 的 `symbol:date`），未来 U2-B 跨持仓连线可直接做"哪类建议用户最常 👎"的聚类。

#### 3) 总体架构

```
backend/app/features/memory/         ← 新 feature module
├── .context.md
├── router.py                         # /api/feedback POST, /api/memory GET
├── service.py                        # get_user_memory() 聚合
├── db.py                             # feedback_db + tracking_db
├── outcome.py                        # compute_outcome() 纯函数
└── models.py                         # Pydantic schema

backend/app/features/brew/agent.py   # 注入 get_user_memory() (F1C.4)
backend/app/features/portfolio_health/agent.py   # 同上
backend/app/features/stock/agent.py  # (research agent) 同上

backend/app/crons/
└── suggestion_followup.py  ← 新增    # T+7 outcome cron

frontend/src/components/memory/      ← 新组件目录
├── FeedbackBar.tsx
├── QuickThesisInput.tsx
└── hooks/
    ├── useFeedback.ts
    └── useSaveThesis.ts
```

**新 `features/memory/` 的理由**：横向模块——三张 agent 都消费它、四个前端位置都嵌入它。挂在任一现有 feature 都会产生反向依赖。

#### 4) 数据库（两张新表，一次性建齐）

**表 1 · `ai_feedback`**

```sql
CREATE TABLE ai_feedback (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT NOT NULL,
  target_type   TEXT NOT NULL,       -- digest_quick_take | digest_headline
                                     -- | health_diagnosis | action_bar_headline
                                     -- | action_bar_chip | top_event
  target_id     TEXT NOT NULL,       -- 稳定引用键, 按 target_type 规范:
                                     --   digest_quick_take: "quick_take:{symbol}:{YYYY-MM-DD}"
                                     --   health_diagnosis:  "health:{report.id}"
                                     --   action_bar_*:      "{date}:{hash(signals)}"
                                     --   top_event:         TopEvent.source_id
  sentiment     SMALLINT NOT NULL,   -- +1 / -1
  reason        TEXT,                -- 不准 | 已知 | 不相关 | 自由输入
  snapshot      JSONB,               -- 被反馈内容的 trimmed 快照 (≤ 1KB)
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_feedback_user_recent ON ai_feedback(user_id, created_at DESC);
CREATE INDEX idx_feedback_user_type ON ai_feedback(user_id, target_type, created_at DESC);
```

**设计取舍**：
- `target_type + target_id` 双列 vs 单列 `target`：双列分索引更快，且 `target_type` 天然约束 prompt 注入时的桶划分
- `snapshot JSONB` 存被反馈时的**原文片段**——关键，用于后续 agent 规避："上次你 👎 这段：'你应该关注 TSLA 的短期波动'" 具体片段比"👎 过"更有信号
- **不**建 `feedback_aggregates` 物化视图：最近 7 天窗口查询用 partial index 足够；每次 agent 生成前跑一次 SQL count（< 5ms）可接受

**表 2 · `suggestion_tracking`**

```sql
CREATE TABLE suggestion_tracking (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          TEXT NOT NULL,
  source           TEXT NOT NULL,          -- health_check | action_bar | digest
  source_ref_id    TEXT,                   -- e.g. health_reports.id / action_bar cache_key
  suggestion_text  TEXT NOT NULL,
  suggestion_date  DATE NOT NULL DEFAULT current_date,
  symbols          TEXT[],
  sectors          TEXT[],
  follow_up_at     DATE NOT NULL,          -- 通常 suggestion_date + 7
  outcome          JSONB,                  -- NULL 直到 cron 回填: {direction_correct: bool, portfolio_change, sector_vs_spy, narrative}
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_tracking_followup ON suggestion_tracking(follow_up_at)
  WHERE outcome IS NULL;
CREATE INDEX idx_tracking_user ON suggestion_tracking(user_id, suggestion_date DESC);
```

**设计取舍**：
- partial index `WHERE outcome IS NULL` → cron 每天扫只拿待填行（线性扩展）
- `outcome JSONB` 宽松结构：初版 `{direction_correct, portfolio_change_7d, sector_vs_spy, narrative}`，未来加字段不迁移
- `symbols` / `sectors` 分离：cron 算 outcome 时按板块查 SPY-relative 收益、按 symbol 查自家涨跌——两种路径都要

#### 5) Agent 模块（无新 agent）

U1-C 本身**不新建 agent**，只扩展现有三个 agent 的 instruction。详见 F1C.4。

#### 6) 总 Rollout 约束

- **Feature flag 矩阵**：
  - `ENABLE_FEEDBACK_BAR=true/false`（前端）
  - `ENABLE_MEMORY_INJECTION=true/false`（后端）→ 独立灰度 memory 对 agent 的影响
  - `ENABLE_THESIS_INPUT=true/false`
- **灰度**：F1C.1 / F1C.2 前端组件可独立上；F1C.4 memory 注入必须在 F1C.1 至少运行 7 天后打开（需要累积反馈数据才有信号）

---

### F1C.1 · `ai_feedback` + `<FeedbackBar>`

#### 实现目标
AI 段落下永远两个低对比度 icon，不扰人；点 👎 浮一排 3 秒 reason chip（不准 / 已知 / 不相关），点完或 3 秒自动关。

#### 架构 & 前后端

**后端端点**：
```
POST /api/feedback
  body: { target_type, target_id, sentiment: +1|-1, reason?, snapshot? }
  → INSERT ai_feedback + return { id }
  rate limit: 60/min/user (防误触连点)
```

**前端 `<FeedbackBar>` API**：
```tsx
<FeedbackBar
  targetType="digest_quick_take"
  targetId="quick_take:NVDA:2026-04-21"
  snapshot={{ symbol: "NVDA", text: quickTake.text }}   // ≤ 1KB
/>
```

**UX 规则**：
- 默认 `opacity: 0.4` → hover `opacity: 1`（低对比度，不扰）
- 点 👍 即时 toast 消失 + icon 变 brand 色保持
- 点 👎 → 浮层出现 4 个 chip（3 预设 + ✍️ 自由）→ 点任一或 3s 后自动关 + sent
- **连点保护**：已提交后锁定 60s 不可再改（UI 禁用）；60s 后可改写（DELETE old + INSERT new，后端最新行覆盖）

**嵌入位（4 处）**：
| 位置 | target_type | target_id 规则 |
|---|---|---|
| Digest 每只股票 quick_take 下方 | `digest_quick_take` | `quick_take:{symbol}:{date}` |
| Digest headline news 下方 | `digest_headline` | `digest_headline:{date}:{user_id}` |
| Health DiagnosisPanel 底部 | `health_diagnosis` | `health:{report.id}` |
| ActionBar 右侧（整体 1 次） | `action_bar_headline` | `action_bar:{date}:{cache_key}` |

#### 避免 regression
- 纯新组件、新端点、新表；不动任何现有 agent
- 端点失败 → 前端 toast 失败，UI 状态回滚到未选择，**不阻塞页面**
- snapshot 超 1KB → 前端 trim，超长不报错

#### 评估
- 点击分布：`feedback_click_rate_by_target` —— 观察各嵌入位是否过度打扰
- 👍/👎 比例：整体 > 3:1 为健康；某 target_type 反转说明该位置 AI 质量有问题
- **不**把 👎 率作为 agent 评分——样本稀疏且 biased

---

### F1C.2 · Thesis 录入（`<QuickThesisInput>`）

#### 实现目标
加仓后 / 展开股票详情 / 红色 ActionBar 时，出现一个**可跳过**的轻提示框，30 秒内能过。预设 + 语音 + 自由文本三档。

#### 架构 & 前后端

**后端**：
- 无新端点。复用 U0-A `PATCH /api/portfolio/{symbol}` 的 `thesis` 字段
- `PUT /api/portfolio/bulk` 响应**增量**：若本次新增持仓 ≥ 1 → 返回 `prompt_thesis_symbols: [string]`，前端据此决定是否展示提示

**前端组件**：

```tsx
<QuickThesisInput
  symbol="NVDA"
  onSave={(thesis) => patchPortfolio({ symbol, thesis })}
  onSkip={() => setDismissed(symbol)}
  context="just_added"  // just_added | detail_expand | red_alert
/>
```

UI：
```
┌──────────────────────────────────────────┐
│ 一句话说说为什么买 NVDA？(可跳过)         │
│ [看好 AI 基建] [长期持有] [分红]          │ ← 预设 chip, context 相关
│ [🎤 语音]  [✍️ 自己写]  [跳过]            │
└──────────────────────────────────────────┘
```

- 预设 chip 按 `context` 取不同集合（`just_added` 强调"为什么买"，`red_alert` 强调"thesis 还成立吗"）
- 🎤 使用 Web Speech API（浏览器内置）先 V1；Gemini STT 走 Google Cloud 付费 API，V2 才加
- ✍️ 展开 `<Textarea maxLength={140}>`，字符计数器
- 保存后 toast："已记住"；下次 AI 讨论 NVDA 时会引用

**触发时机**：

| Context | 触发条件 | 关闭策略 |
|---|---|---|
| `just_added` | `PUT /portfolio/bulk` 新增 symbol | 点保存 / 跳过 / 关闭 = 本次不再弹 |
| `detail_expand` | 用户展开股票卡详情 且 `thesis IS NULL` | 展开态持久显示，不强制关闭 |
| `red_alert` | ActionBar `severity=red` 且相关 symbol `thesis IS NULL` | 点保存 / 跳过 / dismiss 30 天 |

**Dismiss 状态**：localStorage `thesis_dismissed_at:{symbol}:{context}`，跨 context 独立（"在 just_added 跳过了"不代表红态时不再提示）。

#### 避免 regression
- 完全附加 UI，不改任何既有 UX
- `thesis` 字段 U0-A 已建 → 无迁移
- 语音失败 → 自动 fallback 到 ✍️ 自由输入

#### 评估
- `thesis_fill_rate_by_context` —— 各触发点转化率
- `thesis_avg_length` —— 过短（< 5 字）说明预设选了就跑，过长说明 140 字限制需要放宽
- 目标：5 位内测用户中至少 3 位至少填 1 条 thesis

---

### F1C.3 · `suggestion_tracking` + T+7 Outcome Cron

#### 实现目标
U1-B 每次出 `next_action` 自动埋追踪点；7 天后 cron 纯数据算 outcome；下次 agent 生成时主动引用"上周建议方向正确/错误"。信任闭环靠**事实回放**而不是 LLM 声明。

#### 架构 & 后端

**写入侧**（U1-B 已在 LLD 声明）：
```python
# features/portfolio_health/service.py 末尾
if next_action.type in ("rebalance", "research"):
    tracking_db.insert_suggestion(
        user_id=user_id,
        source="health_check",
        source_ref_id=str(report_id),
        suggestion_text=next_action.text,
        symbols=next_action.symbols,
        sectors=_infer_sectors(next_action.symbols),
        follow_up_at=date.today() + timedelta(days=7),
    )
```

**Cron 端**（Vercel cron 或现有 cron 框架）：

```python
# backend/app/crons/suggestion_followup.py, 每天 01:00 UTC
def run_suggestion_followup():
    rows = tracking_db.fetch_due_today()              # partial index 命中
    for r in rows:
        try:
            outcome = compute_outcome(r)              # 纯数据
            tracking_db.update_outcome(r.id, outcome)
        except Exception as e:
            log.warning("outcome failed row=%s err=%s", r.id, e)
```

**`compute_outcome()` 纯函数**（可单测）：

```python
def compute_outcome(row: SuggestionRow) -> dict:
    spy_return = get_return("SPY", row.suggestion_date, row.follow_up_at)
    sector_returns = {s: get_sector_return(s, ...) for s in row.sectors}
    portfolio_change = get_user_portfolio_return(
        row.user_id, row.suggestion_date, row.follow_up_at, snapshot=True
    )
    # direction 判定: 建议类型 ∈ {"加防御", "减科技", ...} → 规则映射到"方向正确与否"
    direction_correct = _judge_direction(row.suggestion_text, sector_returns, spy_return)
    return {
        "portfolio_change_7d": portfolio_change,
        "sector_vs_spy": {s: r - spy_return for s, r in sector_returns.items()},
        "direction_correct": direction_correct,
        "narrative": _narrate(row, sector_returns, portfolio_change),   # 模板, 非 LLM
    }
```

**`_judge_direction`** V1 规则表（简单映射）：
- 文本含"防御" / "降低风险" → 防御板块 (Utilities, Consumer Staples) > SPY → 正确
- 文本含"科技集中" → 非科技 > 科技 → 正确
- **文本含"现金" / "持币" / "cash" / "保留现金" / "观望"**（Deep Audit 追加，配合 R-1 $CASH 合法头寸）：
  - 若 7 天内 SPY 收益 < 0（大盘下跌） → 持币方向正确（现金相对跑赢）
  - 若 SPY 收益 ≥ 0 → 方向错误（踏空大盘上涨）
- 命中不了规则 → `direction_correct=None`（未知，不作判断优于瞎判）

**V2**：用 LLM 来判定 direction_correct（把建议文本 + 7 天市场数据扔给模型），但**仅作次要信号**，主判仍是规则。

#### 读接口
```
GET /api/suggestion-tracking/recent
  → 最近 30 天该用户所有 tracking rows (outcome 已填 + 未填)
  → 供 F1C.4 `get_user_memory()` 使用
```

#### 避免 regression
- 新 cron 独立调度；失败不影响其他 cron
- `compute_outcome()` 失败 → row 保持 `outcome=NULL`，下次 cron 重试（partial index 仍收录）
- 数据源 API 超时 → 该 row 跳过，警告 log；**不** retry 风暴

#### 评估
- `outcome_fill_rate_by_day`（目标 > 95% 在 T+7 当天完成）
- `direction_correct_true_rate`（健康值 40-60% —— 太高意味着建议太保守，太低意味着建议方向系统性错）
- `suggestion_cited_in_next_gen_rate`（F1C.4 注入后，下一次体检是否引用了 outcome）

---

### F1C.4 · `get_user_memory()` + Agent 注入

#### 实现目标
所有生成式 agent（digest / health / research）在 run 前调一次 `get_user_memory(user_id)`，拿到一段 ≤ 400 token 的 memory markdown 拼到 instruction。用户感知："它记得我说过的话"。

#### 架构

```python
# backend/app/features/memory/service.py
def get_user_memory(user_id: str) -> str:
    """Return memory markdown block (≤ 400 tokens) or '' if nothing to say."""
    theses   = portfolio_db.get_theses(user_id)              # thesis 非空的持仓
    feedback = feedback_db.get_recent_feedback(user_id, days=7, limit=20)
    pending  = tracking_db.get_pending_and_recent(user_id, days=14)

    if not (theses or feedback or pending):
        return ""

    sections = []
    if theses:
        sections.append(_render_theses(theses))              # "【持仓 thesis】\n- NVDA: ..."
    if feedback:
        sections.append(_render_feedback_tendency(feedback)) # 聚合 👎 类型 + 原始片段
    if pending:
        sections.append(_render_tracking(pending))           # "5 天前建议 X, 尚未到 T+7"
                                                             # "上周建议 Y, 方向正确"

    return "## 用户记忆\n" + "\n\n".join(sections)
```

**Agent 接入**（三处各一行）：

```python
# brew/agent.py, portfolio_health/agent.py, stock/agent.py (research)
instruction = inject_profile(BASE_INSTRUCTION, profile)     # U0-A
if ENABLE_MEMORY_INJECTION:
    memory = get_user_memory(user_id)
    if memory:
        instruction = memory + "\n\n" + instruction          # memory 置顶, profile 次之
```

**Token 预算**：
- Theses：最多 top-5 仓位股票的 thesis（按 effective_weight 排序）→ ~100 token
- Feedback：聚合 → "近 7 天对 X 类型 3 次 👎" + 2 个原始片段 → ~150 token
- Tracking：最多 3 条（最近 pending + 最近完成）→ ~100 token
- **硬 truncate**：整段 > 400 token → 尾部截断，保 theses 优先

**Feedback 聚合规则**（避免直接灌所有 👎 到 prompt）：
```python
def _render_feedback_tendency(rows):
    # 按 target_type 分组 count 👎
    down_by_type = {t: rs for t, rs in groupby_sentiment_neg(rows) if len(rs) >= 2}
    # 挑 top-2 type, 每个给 1 个原始 snapshot 片段
    snippets = [_trim(r.snapshot.get("text", ""), 60) for rs in down_by_type.values() for r in rs[:1]]
    return f"【反馈倾向（近 7 天）】\n👎 类型: {', '.join(down_by_type.keys())}\n避开类似表达:\n" + "\n".join(f"- “{s}”" for s in snippets)
```

#### 评估
- **离线**：固定 3 组 (thesis + feedback + tracking) 场景 → 注入前后 agent 输出对比 → 人工判断"记忆是否被引用"（≥ 70% case 可检出明显引用）
- **CI lint**（软）：生成后 grep 是否至少包含 thesis 里提到的 symbol 之一（非强制，软指标）
- **上线**：`digest_references_thesis_rate` / `health_references_last_week_outcome_rate`
- **回归**：`ENABLE_MEMORY_INJECTION=off` → 三个 agent 快照与注入前位级一致

#### 避免 regression
- `ENABLE_MEMORY_INJECTION=false` 默认 → 灰度打开
- `get_user_memory` 失败 → 返回 `""`，不阻塞 agent
- memory 内容空 → 不拼接，避免 prompt 中出现孤零零的"## 用户记忆\n"标题

---

### 导出给其它 Unit 的契约

| 契约 | 消费者 | 稳定字段 |
|---|---|---|
| `POST /api/feedback` | 前端所有 `<FeedbackBar>` | `{target_type, target_id, sentiment, reason?, snapshot?}` |
| `get_user_memory(user_id) -> str` | brew / health / research agent | ≤ 400 token markdown 块，空则返回 `""` |
| `suggestion_tracking` 写入 API（`insert_suggestion(...)`） | U1-B、未来 U0-B 红态建议 | 参数签名稳定，返回 `id` |
| `ai_feedback.target_id` 命名规则 | U0-B、U1-A、U1-B | 每个 Unit 按 table comment 规定格式写入 |
| `GET /api/suggestion-tracking/recent` | U2-D 月度回顾（未来） | `list[SuggestionRow]` with outcome |

### Audit Integration（R-3 部分接受）

**驳回**：隐式点击 = 正反馈（污染强信号；独立桶需求尚无数据支持）→ `ai_feedback` 表**只存显式反馈**；点击数据通过现有 analytics 管道（`action_bar_chip_ctr` 埋点）走**产品侧**分析，**不入 agent prompt**。

**驳回**：memory 整段上限放宽到 1500 token（注意力稀释 + instruction-following 衰减）。

**部分接受**：`theses` 段专项放宽——因为 thesis 是**用户亲手写入的强信号**，不应被 token 预算截断：

```python
# features/memory/service.py 修订后 _render_theses
def _render_theses(user_id: str) -> str:
    rows = portfolio_db.get_theses(user_id)                     # thesis 非空的持仓
    rows = sorted(rows, key=lambda r: r.effective_weight_pct or 0, reverse=True)[:15]
    #                                                          ↑ top-15 持仓 (基本覆盖全量)
    lines = [f"- {r.symbol}: {_trim(r.thesis, 60)}" for r in rows]
    block = "【持仓 thesis】\n" + "\n".join(lines)

    # 本段硬上限 800 token (≈ 1600 字符), 而非全局 400
    return _hard_trim(block, max_tokens=800, unit="char_div_2")
```

**段预算重定**（`get_user_memory` 总预算）：

| 段 | 原预算 | 修订 | 理由 |
|---|---|---|---|
| theses | ~100 token | **≤ 800 token** | 用户亲写，强信号，不截断 |
| feedback | ~150 token | ~150 token | 弱反驳 + 语气提示，无需长 |
| tracking | ~100 token | ~100 token | 3 条足够 |
| **总** | **≤ 400** | **≤ 1050** | 仍远低于 Flash-Lite 3k 衰减阈值 |

**Out of Scope 明确记录**（防止未来重开）：

| 未采纳项 | 原因 | 未来若接入条件 |
|---|---|---|
| 隐式点击写入 `ai_feedback` | 语义多义，污染强信号 | CTR 与显式 👍 率相关系数 > 0.4 才考虑 |
| Memory 整体放宽到 1500 token | 注意力稀释；无证据支持 | 可观测的 instruction-following 基准测试证明无衰减 |
| 单独 `implicit_signals` 表 | V1 样本量下 ROI 低 | theses + 显式 feedback 的 agent 输出"定制感" CSAT 触顶后再考虑 |

**工期**：+0d（仅调 `_render_theses` 参数与段预算，代码量微乎其微）。

### U1-C 交付 Checklist

| # | 任务 | Owner | 状态 |
|---|---|---|---|
| C1 | Edge Function 建 `ai_feedback` + `suggestion_tracking` 两表 | 后端 | ⏳ |
| C2 | `features/memory/` 模块 + `.context.md` + models | 后端 | ⏳ |
| C3 | `POST /api/feedback` + rate limit + 单测 | 后端 | ⏳ |
| C4 | `<FeedbackBar>` 组件 + 4 处嵌入 + TanStack mutation | 前端 | ⏳ |
| C5 | `<QuickThesisInput>` 组件（预设 + Web Speech + ✍️）+ 3 触发位 | 前端 | ⏳ |
| C6 | `PUT /portfolio/bulk` 增量返回 `prompt_thesis_symbols` | 后端 | ⏳ |
| C7 | `compute_outcome()` + 规则 direction 判定 + 单测 | 后端 | ⏳ |
| C8 | T+7 cron 注册 + 失败 retry 机制 | 后端 | ⏳ |
| C9 | `get_user_memory()` 聚合 + token 预算 + 渲染函数 | 后端 | ⏳ |
| C10 | brew / health / research agent 三处注入 + flag | 后端 | ⏳ |
| C11 | 回归 + 指标埋点 + 灰度 | 全栈 | ⏳ |

**DoD**：
- 两表建齐 + 索引 + partial index 生效
- 5 位内测 3 天：≥ 3 位填 thesis、≥ 5 条 feedback、≥ 3 条 tracking outcome 回填成功
- `ENABLE_MEMORY_INJECTION=off` 下三个 agent 快照零差异
- 离线测评注入后 ≥ 70% case 可检出 memory 引用
- 无端点 p95 regress（feedback POST < 100ms、memory GET < 50ms）

---

## 实施步骤

### Phase 1A · 事件整合（~0.5d）

1. [ ] `macro_map.py` 抽出静态映射表
2. [ ] `select_top_event()` 纯函数 + `DigestResponse.top_event` 字段
3. [ ] Action Bar 消费 `top_event`（P0 已搭的组件扩展）

### Phase 1B · 体检 Core（~3.5d）

4. [ ] `data_tools` 扩展：`get_historical_returns()`、`get_company_profiles_batch()`
5. [ ] `service.py` 4 维评分 + 加权 + 降级
6. [ ] 诊断 agent + `NextAction` 结构化输出
7. [ ] `portfolio_health_reports` + `portfolio_insights` Edge Function
8. [ ] Router 4 端点 + 缓存 + 速率限制
9. [ ] 前端 Tab + 4 张数据卡 + AI 诊断段 + 状态机

### Phase 1C · 体检回流 & 周报（~1.5d）

10. [ ] brew agent instruction 注入 insights（距今天数判断）
11. [ ] Action Bar 消费 `top_risk` / `next_action`
12. [ ] Weekly cron + Resend batch 邮件（受 `notify_mode` 限制）

### Phase 1D · 记忆反馈（~3.5d）

13. [ ] `ai_feedback` + `suggestion_tracking` Edge Function
14. [ ] `/api/feedback` POST + `/api/memory` GET
15. [ ] `<FeedbackBar>` 组件 + 3 处嵌入
16. [ ] `<QuickThesisInput>` 组件（含 STT）+ 3 处触发
17. [ ] `get_user_memory()` 注入 digest/health/research agent
18. [ ] T+7 outcome cron
19. [ ] 月度复盘 modal + 聚合 SQL + 叙事 agent

**总工期**：~9 天（可并行 1A / 1B；1C 依赖 1B；1D 可并行 1B）。

## 前置依赖（P0 必须先就位）

- `effective_weight_pct`（不就位 → 体检退化等权，宏观敏感度不准）
- `user_investment_profiles`（不就位 → 所有 AI 输出千人一面）
- Action Bar 组件（1A/1C 需要扩展它）

## 待定问题

1. **事件语言**：FMP 返回英文。V1 在 `macro_map` 预翻译，不过 LLM（token 不值）。
2. **体检周报发送日**：暂定周一美东 07:00，上线后看打开率调整。
3. **反馈阈值**：几次 👎 才算"用户不喜欢"？V1 硬编码 3/7d，V2 按活跃度动态。
4. **月度 recap 的画像推断**：V1 只提示用户手动确认，不自动覆盖 `user_investment_profiles`。
