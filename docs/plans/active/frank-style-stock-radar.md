# Frank-style Stock Radar Engineering Plan

> Status: Planning
> Related:
> - `backend/app/features/kol_research/.context.md`
> - `frontend/src/app/kol/.context.md`
> - `backend/app/features/screener/.context.md`
> - `backend/app/features/stock/.context.md`
> - `docs/plans/active/qinbafrank-skill-distillation-v3.md`
> - `docs/plans/active/kol-persona-cockpit.md`
> Vision: 产品策略.md > 模块 4「机会发现」+ 方向三「统一研究台」

## 目标

基于 qinbafrank v3 skill 蒸馏内容，构建一个可追溯、指标驱动核心部分的 `Frank-style Stock Radar`，把 Frank 的公开方法论解释为一套可审计规则、可计算指标和选股姿态，用于在 `/kol/qinbafrank/radar` 输出候选股排序、证据链、核心指标和可证伪条件。

## 现状

### 已有能力

KOL 侧：

- `backend/app/features/kol_research/` 已有 qinbafrank persona agent、公开 cockpit API、v3 skill loader 和 tweet feed。
- v3 skill draft 已落在 `backend/app/features/twitter/methodologies/_drafts/qinbafrank-skill-v3/`，包含：
  - `core/operating-system.md`
  - `macro/macro-regime.md`
  - 7 个 sector skill
  - 32 个 ticker playbook + 1 个 MRVL marker
  - evidence / eval / compact slices
- `frontend/src/app/kol/[username]/` 已新增 KOL 驾驶舱页面结构：overview / latest / sectors / stocks / chat。

市场数据侧：

- `backend/app/features/screener/` 提供全美股票池缓存，约 3,680 只可交易股票，含 65+ 原始字段和 6 个派生字段。
- `backend/app/features/stock/` 提供个股 profile、quote、history、valuation、fundamentals、technical、news、macro、earnings 等数据。
- `features/macro/risk/service.py` 可作为宏观风险档位和流动性环境来源。

产品侧：

- 产品策略中「机会发现」明确是未来模块：基于关注列表、画像和持仓缺口主动发现机会。
- 当前需求不是通用机会发现，而是一个更窄的可验证切片：**按 Frank 方法论发现候选股**。

### 关键缺口

现有 v3 skill 能解释「Frank 怎么看」，但还不能稳定产出「按 Frank 逻辑筛出来的候选清单」。

缺的不是更多 chat，而是一个中间层：

```text
v3 skill 方法论
  -> 可审计 rule ledger
  -> 指标映射 metric map
  -> scoring / posture engine
  -> radar API / page
```

本功能的核心验收点是：每个候选股都能回答清楚三件事：

1. **它命中了 Frank 方法论里的哪条规则**。
2. **这条规则被哪些指标或事实支持**。
3. **什么指标变化会让它从关注、等待、试错降级为回避**。

## 设计

### 产品形态

新增页面：

```text
/kol/qinbafrank/radar
```

定位：

- 不是纯 agent。
- 不是黑箱一键荐股。
- 不是第一阶段就做推送简报。
- 是一个 `workflow-first, agent-assisted` 的选股雷达。

页面默认展示一次可复现 scan：

```text
Frank-style Opportunity Radar

Market Regime: 小级别杀估值 / 中级别观察 / 大级别防守
Primary Themes: AI 算力、HBM 存储、稳定币金融基建、国防太空
Candidates: NVDA / MU / GOOGL / CRCL / HOOD ...
```

每个候选股以「判断票据」呈现：

- ticker / company
- posture：`Core Watch` / `Wait for Pullback` / `Small Trial` / `Monitor Only` / `Avoid`
- Frank Fit Score
- 命中的 v3 rules
- 指标证据
- tweet evidence
- falsifiers
- direct vs inferred 标签
- CTA：用 Frank 视角继续追问

### 设计原则

1. **方法论先于指标**  
   不是把市场上所有指标塞进模型，而是先从 v3 skill 提取 Frank 明确看重的判断逻辑，再决定哪些指标能承载这些逻辑。

2. **核心部分必须指标驱动**  
   候选股排名的核心分数必须由可计算指标推动，包括 coverage、sector fit、growth、profitability、valuation risk、technical pullback、macro regime compatibility 等。

3. **不是所有规则都强行指标化**  
   部分 Frank 方法论是定性判断，例如「团队进取心」「政策节奏」「应用层最终赢家不下注」。这些进入 reasoning / caveat / catalyst，不作为核心分数的硬指标，除非有可靠数据源。

4. **直接观点和方法论推断分开**  
   输出必须区分：
   - `direct_frank_evidence`：Frank 直接讨论过该 ticker / sector。
   - `methodology_inference`：Frank 未直接说过，但按他的 sector / core framework 推断。
   - `current_market_data`：来自 screener / stock / macro 的当下数据。

5. **输出姿态，不输出交易指令**  
   不输出 `Buy / Sell / Strong Buy`，而输出观察和风控姿态。

### 数据流

```text
v3 skill markdown + evidence map
        |
        v
Methodology Rule Ledger
  rule_id / skill_path / source_tweets / thesis / metric_specs / veto
        |
        v
Candidate Universe
  v3 ticker playbooks + sector tickers + screener universe subset
        |
        v
Metric Snapshot
  screener fields + stock quote/profile/history + macro risk + tweet coverage
        |
        v
Frank Radar Engine
  score breakdown + posture + falsifiers + trace evidence
        |
        v
API
  /api/kol_research/personas/{username}/radar
        |
        v
Frontend
  /kol/[username]/radar
```

### Rule Ledger

新增一个显式的 rule ledger，避免直接从长 markdown 临时解析判断逻辑。

建议文件：

```text
backend/app/features/twitter/methodologies/_drafts/qinbafrank-skill-v3/evidence/radar-rules.json
```

每条 rule 结构：

```json
{
  "rule_id": "ai-infra-revenue-capex-ratio",
  "layer": "sector",
  "skill_path": "sector/ai-infrastructure.md",
  "theme": "ai-infrastructure",
  "statement": "AI capex 不是问题，ROI 不兑现才是问题；营收/Capex 比值是折旧 cliff 前的重要验证指标。",
  "source_tweet_ids": ["2048260457996358038"],
  "applies_to": {
    "sectors": ["ai-infrastructure"],
    "tickers": ["GOOGL", "MSFT", "AMZN", "META", "ORCL", "CRWV"]
  },
  "metric_specs": [
    {
      "metric_id": "revenue_to_capex_ratio",
      "source": "stock_financials",
      "direction": "higher_is_better",
      "bullish_threshold": 3.8,
      "bearish_threshold": 3.5,
      "availability": "phase_2"
    }
  ],
  "qualitative_inputs": ["capex commentary", "cloud RPO commentary"],
  "falsifier": "若营收/Capex 跌破 3.5，则产能爬坡跑不赢折旧，AI capex 叙事降级。",
  "confidence": "high"
}
```

MVP 不要求所有 rule 都能自动算，但要求每个用于打分的 metric 都能反向追到 rule。

### Methodology-to-Metric Map

第一版要把 Frank 方法论拆成 7 个核心评分柱：

| Pillar | Frank 方法论来源 | 核心指标 | 数据源 | MVP 是否计分 |
|---|---|---|---|---|
| `theme_fit` | 产业故事是否加速；先看产业主线 | 所属 v3 sector、sector tweet count、theme priority | v3 sector index / ticker playbook | 是 |
| `chain_position` | 越靠近物理瓶颈，确定性越强；龙头/收租位优先 | curated chain role：L0/L1/L2/合规入口/应用层 | rule ledger + ticker playbook | 是 |
| `frank_coverage` | 不能伪造 Frank 直接观点 | coverage tag、direct mention count、recent mention age | ticker playbook + cockpit index | 是 |
| `business_quality` | 基本面主导；数据验证叙事 | revenue growth、eps growth、margin、ROE/ROIC、FCF margin | screener / stock service | 是 |
| `expectation_risk` | 高预期市场会杀估值；不追高 | PE / forward PE / PEG、52w position、RSI、above SMA | screener / technical snapshot | 是 |
| `macro_compatibility` | 宏观先定风险级别，再决定姿态 | small / medium / large regime、liquidity risk | macro risk service | 是 |
| `falsifiability` | 强信念必须带可证伪锚 | 是否有 rule-level falsifier、是否有 tracked metric | rule ledger | 是，作为质量分 |

以下暂不进入核心分数，只进入解释层：

- 团队进取心
- 最新政策谈判细节
- HBM 三家产能分配的实时变化
- Blackwell / Rubin 出货量最新 consensus
- RPO segment detail
- ETF flow / USDC supply growth 若当前数据源未稳定接入

### Candidate Universe

MVP universe 不扫全市场，先做高可信窄集：

```text
Universe V1 =
  v3 ticker playbooks
  + v3 sector files中明确列出的 tickers
  + cockpit.TICKER_ALIASES 内可配价美股
```

不纳入：

- coverage none 且无法映射到 sector 的股票
- 非美股、未上市公司、crypto asset，除非页面以「不可配价观察对象」单独展示
- 纯 meme / 无基本面标的

后续 V2 再接入全市场 hidden gems：

```text
screener universe
  -> 先按 Frank sector taxonomy 过滤
  -> 再用 metric score 排序
  -> 输出时强制标注 methodology_inference
```

### Scoring Model

MVP 采用透明加权分，不用 LLM 打分。

```text
Frank Fit Score = 100

theme_fit             20
chain_position        15
frank_coverage        15
business_quality      20
expectation_risk      10
macro_compatibility   10
falsifiability        10
```

Veto / penalty 独立处理：

```text
- 纯 meme / 无基本面 / 无真实业务支撑        -> Avoid
- capital structure risk 明显过高            -> max posture = Monitor Only
- coverage none                              -> 不能输出 direct Frank evidence
- macro large-risk                           -> 进攻型股票 posture 自动降一级
- expectation_risk 过高且无近期 catalyst      -> Wait for Pullback
- 关键数据缺失                               -> confidence 降级，不能进 Top 5
```

Score 输出必须带 breakdown：

```json
{
  "symbol": "NVDA",
  "score": 82,
  "posture": "Wait for Pullback",
  "confidence": "high",
  "breakdown": [
    {
      "pillar": "theme_fit",
      "score": 19,
      "max_score": 20,
      "why": "AI infrastructure L0 compute base, direct sector match",
      "rule_ids": ["ai-infra-l0-rent-collector"],
      "metrics": []
    },
    {
      "pillar": "business_quality",
      "score": 17,
      "max_score": 20,
      "metrics": [
        {
          "metric_id": "revenue_growth_ttm",
          "value": 0.5,
          "threshold": 0.3,
          "source": "screener_universe",
          "updated_at": "..."
        }
      ]
    }
  ],
  "falsifiers": [
    {
      "rule_id": "nvda-datacenter-growth",
      "condition": "若数据中心增速跌破 30%，算力需求叙事降级",
      "tracked_metric": "datacenter_growth",
      "availability": "manual_or_news"
    }
  ]
}
```

### Posture Mapping

| Posture | 条件 | 用户看到的含义 |
|---|---|---|
| `Core Watch` | score 高、coverage 高/中、无 veto、估值风险不过热 | Frank 逻辑高度匹配，适合重点跟踪 |
| `Wait for Pullback` | 方法论匹配高，但 expectation / technical risk 高 | 逻辑强，但不是追高点 |
| `Small Trial` | 产业弹性高但 coverage 或指标不完整 | 可研究，但不能重仓叙事 |
| `Monitor Only` | coverage low / 数据不足 / 推断链较长 | 观察对象，不写成 Frank 观点 |
| `Avoid` | 触发 veto 或杀逻辑风险 | 不符合 Frank 方法论 |

### API 设计

新增后端文件建议：

```text
backend/app/features/kol_research/radar.py
backend/app/features/kol_research/radar_models.py
backend/app/features/kol_research/radar_rules.py
```

新增端点：

```text
GET /api/kol_research/personas/{username}/radar
```

Query params：

```text
mode=balanced | conviction | pullback | exploratory
universe=covered | sector-linked | all-market
limit=20
force=false
```

MVP 支持：

```text
mode=balanced
universe=covered
```

响应结构：

```json
{
  "persona": "qinbafrank",
  "generated_at": "...",
  "snapshot_id": "hash",
  "universe": "covered",
  "mode": "balanced",
  "macro_regime": {
    "level": "small",
    "label": "小级别杀估值",
    "dominant_factor": "earnings_expectation",
    "source": "macro_risk"
  },
  "theme_ranking": [
    {
      "theme": "ai-infrastructure",
      "label": "AI 算力基建",
      "score": 91,
      "rule_ids": ["ai-infra-token-demand", "ai-infra-bottleneck-migration"]
    }
  ],
  "candidates": [],
  "methodology_audit": {
    "rules_loaded": 42,
    "rules_with_metrics": 18,
    "metric_coverage_ratio": 0.43,
    "data_sources": ["v3_skills", "screener", "stock", "macro_risk", "kol_tweets"]
  },
  "disclaimer": "按公开方法论推断，非本人发言，非投资建议。"
}
```

### Frontend 设计

新增：

```text
frontend/src/app/kol/[username]/radar/page.tsx
frontend/src/app/kol/[username]/_components/RadarRegimeStrip.tsx
frontend/src/app/kol/[username]/_components/RadarThemeMap.tsx
frontend/src/app/kol/[username]/_components/RadarCandidateList.tsx
frontend/src/app/kol/[username]/_components/RadarCandidateDetail.tsx
frontend/src/app/kol/[username]/_components/RadarScoreBreakdown.tsx
frontend/src/app/kol/[username]/_components/RadarEvidenceTrail.tsx
```

页面层级：

```text
1. Regime Strip
   宏观档位 + 本次扫描口径 + 更新时间

2. Theme Map
   v3 sector 主题排序，展示为什么当前这些主题在 Frank 框架里靠前

3. Candidate List
   排名、posture、score、confidence、核心命中理由

4. Detail Drawer / Detail Panel
   score breakdown
   methodology trace
   metric evidence
   tweet evidence
   falsifiers
   ask in /research CTA
```

每只股票的文案必须显式标注：

```text
Frank 直接讨论过
按 Frank 方法论推断
当前市场数据
```

### 验证与审计

这是本功能的核心，不是可选项。

#### 1. Traceability Audit

每个 Top candidate 必须满足：

- 至少 2 条 `rule_id`
- 至少 1 条来自 v3 skill 的 source path
- 若声称 direct evidence，必须有 tweet id
- 至少 3 个 metric evidence 进入 score
- 至少 1 个 falsifier

#### 2. Methodology Consistency Eval

固定一组样例：

```text
NVDA, GOOGL, MSFT, META, AMZN, MU, ORCL, COIN, HOOD, CRCL, RKLB, PLTR, MRVL
```

检查：

- NVDA 应高 theme_fit + high coverage，但可能因 expectation risk 进入 Wait for Pullback。
- MU 应命中 HBM / memory bottleneck。
- CRCL / COIN / HOOD 应命中 stablecoin / compliant financial infrastructure。
- MRVL 若 coverage none，不得输出「Frank 看好 MRVL」，只能走 methodology_inference 或 marker fallback。

#### 3. Holdout Replay

从 v3 蒸馏时未进入 rule 的 tweets 中抽样：

- 输入 tweet 提到的 ticker / sector。
- Radar 应能把对应 ticker 或 sector 排到合理位置。
- 若不能，记录是 rule gap 还是 metric gap。

#### 4. Determinism Test

相同输入 snapshot、相同 weights、相同 universe，应返回相同排序和分数。

#### 5. No-hallucination Test

检查响应中所有 “Frank 直接认为 / 博主看好 / 原文支持” 类文案都必须有 tweet id，否则失败。

## 实施步骤

### Phase 0 · Rule Ledger 设计与人工校准

1. [ ] 从 v3 skill 中抽取首批 radar rules：core 5 条、macro 5 条、sector 每个 3-5 条、ticker 高覆盖每个 2-3 条。
2. [ ] 为每条 rule 标注 `source_tweet_ids`、`skill_path`、`applies_to`、`falsifier`。
3. [ ] 建立 `metric_specs`：明确哪些 rule 可自动计分，哪些只进入解释层。
4. [ ] 写 `radar-rules.json`，并做 JSON schema 校验。

### Phase 1 · Metric Snapshot

5. [ ] 新增 `radar_models.py`：定义 `RadarRule`、`MetricEvidence`、`RadarCandidate`、`RadarResponse`。
6. [ ] 新增 `radar_rules.py`：加载 `radar-rules.json`，校验 rule_id 唯一、source path 存在。
7. [ ] 新增 `radar.py` 的 candidate universe builder：读取 v3 ticker playbook + cockpit ticker index。
8. [ ] 接入 screener universe，为 candidate 补全 growth、valuation、profitability、technical 派生字段。
9. [ ] 接入 stock quote/profile fallback，处理 screener 缺失的 ticker。
10. [ ] 接入 macro risk service，产出 `macro_regime`。

### Phase 2 · Scoring / Posture Engine

11. [ ] 实现 7 个 pillar scorer，每个 scorer 返回 score + metrics + rule_ids + why。
12. [ ] 实现 veto / penalty rules，独立于加权分。
13. [ ] 实现 posture mapping。
14. [ ] 实现 falsifier collector：从 matched rules 中抽取可证伪条件。
15. [ ] 增加 deterministic snapshot hash：weights + universe version + data timestamps。

### Phase 3 · API

16. [ ] 在 `kol_research/router.py` 增加 `GET /personas/{username}/radar`。
17. [ ] 支持 MVP params：`mode=balanced`、`universe=covered`、`limit`。
18. [ ] 增加 TTL cache，避免重复打外部 quote/profile。
19. [ ] 对 `username != qinbafrank` 返回空 radar 或 404，避免伪装多 persona 支持。
20. [ ] 单测：空数据、缺 price、缺 screener、macro unavailable、MRVL marker。

### Phase 4 · Frontend Page

21. [ ] `api.ts` 增加 radar types 和 `cockpitRadar()` client。
22. [ ] 新增 `/kol/[username]/radar/page.tsx`。
23. [ ] 在 `SubNav` 加 Radar tab。
24. [ ] 实现 Regime Strip、Theme Map、Candidate List、Detail Panel。
25. [ ] 实现 evidence trail，按 direct / inferred / current data 三类展示。
26. [ ] 实现 `/research?agent=kol&persona=qinbafrank&q=...` 的上下文化追问入口。

### Phase 5 · Verification

27. [ ] 后端单测：rule loader、scoring determinism、veto、posture mapping。
28. [ ] fixture eval：NVDA / MU / CRCL / HOOD / MRVL 的预期 behavior。
29. [ ] traceability audit：Top 10 每只必须有 rule、metric、falsifier。
30. [ ] 前端浏览器 QA：desktop/mobile、长 ticker、空态、加载态、错误态。
31. [ ] 更新 `backend/app/features/kol_research/.context.md` 和 `frontend/src/app/kol/.context.md`。

## 依赖

- v3 skill 文件必须稳定存在，特别是 ticker playbook 的 frontmatter：`coverage`、`direct_mention_count`、`parent_sector`。
- screener universe cache 需要可用；否则 MVP 只能降级为 coverage + v3 rule 的弱 radar。
- stock quote/profile 依赖 FMP / yfinance，必须优雅降级。
- macro risk service 若不可用，`macro_compatibility` 分数应默认中性且标注 unavailable，不能编造宏观档位。
- `/research` KOL deep link 行为需与现有 KOL cockpit plan 对齐，避免 `symbol` 参数和 screener 语义冲突。

## 待定问题

1. **首版是否需要登录 / Pro gating？**  
   倾向：页面可见，但 radar 结果用 feature flag 或 Pro gating，避免公开展示“选股雷达”带来的合规和传播风险。

2. **首版 universe 是否只做 `covered`？**  
   倾向：只做 `covered`。全市场 hidden gems 必须等 rule ledger 和 sector taxonomy 稳定后再做。

3. **rule ledger 是手写 JSON 还是从 markdown 生成？**  
   倾向：首版手写 JSON。因为这是产品判断核心，必须人工校准，不能让 parser 从长文里误抽。

4. **是否存储 radar snapshot 到 DB？**  
   MVP 可先不存，只返回 hash + timestamps。若要后续做每周简报、T+7/T+30 追踪，则新增 `kol_radar_snapshots` 表。

5. **评分权重是否允许前端切换？**  
   首版不允许。后续可开放 `conviction / pullback / exploratory` 三种 mode。

## 非目标

- 不做自动交易建议。
- 不输出 `Buy / Sell / Strong Buy`。
- 不声称 Frank 本人推荐某股票。
- 不做全市场 hidden gems，除非明确标注为 methodology inference。
- 不做被动邮件推送，等页面和审计结果可信后再进入简报阶段。

## 验收标准

1. `/kol/qinbafrank/radar` 能输出 Top candidates，并且每个候选都有 score breakdown。
2. 每个 Top candidate 至少有 rule trace、metric evidence、falsifier 三类证据。
3. 所有 direct Frank evidence 都有 tweet id；没有 tweet id 的只能写成 methodology inference。
4. NVDA / MU / CRCL / HOOD / MRVL 的 fixture eval 通过。
5. 相同输入下 radar 排序确定性一致。
6. 当 screener / stock / macro 任一数据源失败时，页面降级但不编造指标。
7. 文案明确标注“公开方法论推断，非本人发言，非投资建议”。
