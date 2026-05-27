# qinbafrank Skill Distillation V3 Engineering Plan

> Status: Planning
> Related: `backend/app/features/twitter/.context.md`, `docs/plans/active/kol-methodology-distillation.md`, `docs/plans/active/kol-distillation-eng-v1-classification-extraction.md`
> Vision: 将 qinbafrank 的历史推文重新蒸馏成可调用、可验证、可追溯的四层 skill 系统，让 Agent 能按博主的方法分析宏观、板块和具体标的。

## 目标

基于 qinbafrank 全量历史推文，重新蒸馏一套 `core / macro / sector / ticker` 四层 skill 系统，重点提取“看什么信息、如何理解信息、如何做决策”，而不是只总结观点或包装回答格式。

## 现状

当前已有 v1 方法论产物位于 `backend/app/features/twitter/methodologies/qinbafrank/`：

- `overview.md` 和 `_orchestrator.md` 已经描述了博主底层风格、禁忌和 lens 路由。
- `macro_analysis.yaml` 和 `lens-macro.md` 已经抽出流动性、政策、地缘和风险等级框架。
- `sector_analysis.yaml` 和 `lens-ai-infrastructure.md` 已经抽出 AI 算力链、capex、RPO、卡脖子环节等框架。
- `stock_analysis.yaml` 和 `lens-stock-analysis.md` 已经抽出个股分析路径，包括产业故事、公司级证据、估值、反方观点。
- `lens-crypto.md` 已经抽出稳定币、RWA、AI x crypto、合规金融基建框架。

v1 的问题不是原料不足，而是结构不够可执行：

- 它按旧 category 生成：`stock_analysis / macro_analysis / sector_analysis / methodology / trading_strategy`，没有按 Agent 真实调用层级组织。
- 它更像“研究笔记 + persona lens”，缺少统一 skill template。
- 它没有 ticker playbook，用户问 NVDA、MU、MRVL 时只能回到通用 lens。
- 它没有把“全量推文 -> atomic rules -> skill 文件 -> holdout/eval 验证”做成明确流程。

因此 v3 不应只基于 v1 重排，也不应丢弃 v1。正确方式是：

```text
重新读取全量推文 = 主流程
现有 v1 = 先验、索引、对照组、补漏材料
```

## 设计

### 四层 Skill 结构

目标产物放在一个新的 draft 包中：

```text
backend/app/features/twitter/methodologies/_drafts/qinbafrank-skill-v3/
  README.md

  core/
    operating-system.md

  macro/
    macro-regime.md

  sector/
    ai-infrastructure.md
    crypto-stablecoin-rwa.md
    software-ai-disruption.md
    semiconductor-memory-hbm.md

  ticker/
    nvda.md
    googl.md
    msft.md
    meta.md
    amzn.md
    mu.md
    avgo.md
    orcl.md
    mstr.md
    coin.md
    rklb.md
    pltr.md
    mrvl.md

  evidence/
    atomic-rules.jsonl
    rule-clusters.json
    corpus-manifest.json

  eval/
    holdout-replay.md
    user-question-eval.md
    v1-diff-check.md
```

四层职责：

```text
core   = 博主底层操作系统，负责通用理念、禁忌、路由原则
macro  = 博主如何判断市场环境，负责流动性、政策、地缘、风险等级
sector = 博主如何判断具体产业和板块，负责产业链、瓶颈、价值捕获
ticker = 博主如何判断具体标的，负责标的定位、关键指标、升级/降级条件
```

### Skill 文件统一模板

每个 skill 文件必须使用同一套可执行结构：

```md
# Skill: {name}

## 适用问题
用户问什么时调用。

## 核心问题
这个 skill 真正要回答的判断问题。

## 他看什么信息
指标、数据源、事件、公司级信息、产业链变量。

## 他如何理解
变量之间的因果链、权重排序、历史类比、传导机制。

## 决策框架
什么情况下升级、降级、观察、回避、等待。

## 常见误读
Agent 或用户最容易犯的外推错误。

## 输出模板
普通用户问题下应该如何组织回答。

## Evidence Map
核心规则对应的 tweet_id 和短 quote。
```

### Core Skill

核心问题：

```text
qinbafrank 作为分析师，底层怎么理解市场？
```

必须覆盖：

- 基本面主导市场，不以技术面为主。
- 产业故事优先，估值最后看。
- 财政、货币、政治、地缘共同驱动市场。
- 强信念必须能被数据修正。
- 风险分小级别、中级别、大级别。
- 拿不住等于不够了解，不该重仓。
- 确定性大于弹性。
- 不 meme、不做空个股、不买便宜烂公司、不预测精确点位。

### Macro Skill

核心问题：

```text
当前市场主导因子是什么？它会造成什么级别的风险？
```

必须覆盖：

- Fed balance sheet、TGA、ON RRP、银行准备金、SOFR/EFFR、SRF。
- CPI、PCE、非农结构、财政部发债。
- 关税、油价、霍尔木兹、地缘咽喉。
- 大科技财报是否支撑基本面。
- 先找阶段主导因子，再把新闻转化成流动性、通胀、利润、政策约束。
- 宏观逆风多数时候是杀估值，不等于杀逻辑。
- 大级别风险必须来自系统性危机或产业基本面崩塌。

### Sector Skills

第一批 sector 只做证据足、辨识度高的主题：

1. `ai-infrastructure.md`
   - token 消耗量、Mag4 capex、RPO/backlog、营收/Capex 比值。
   - GPU -> HBM -> 光互连 -> 电力 -> CPU 的瓶颈迁移。
   - 越靠近物理瓶颈，确定性越强。
   - capex 不是问题，ROI 不兑现才是问题。

2. `crypto-stablecoin-rwa.md`
   - USDC/USDT 发行量、ETF 流入流出、监管法案、RWA、AI agent 支付。
   - crypto 不是原生叙事革命，而是 AI 时代金融基建和真实业务上链。
   - 稳定币、合规交易所、RWA、agentic wallet 是核心链条。

3. `software-ai-disruption.md`
   - 轻版，先从现有 sector/stock 推文中抽 AI 对纯软件 workflow 的冲击。
   - 用于解释为什么部分 SaaS 是被 AI 替代风险，而安全、数据、入口层可能被错杀。

4. `semiconductor-memory-hbm.md`
   - 可后置，若 MU/HBM/存储相关推文足够多则独立成 skill。
   - 如果证据不足，先作为 `ai-infrastructure.md` 的子章节。

### Ticker Skills

Ticker skill 不做公司介绍，而是回答：

```text
这个 ticker 在 qinbafrank 框架里被放在哪条链、看哪些指标、什么情况下升级或降级？
```

完整 playbook 候选：

```text
NVDA, GOOGL, MSFT, META, AMZN, MU, AVGO, ORCL, MSTR, COIN, RKLB, PLTR
```

每个 ticker 文件必须包含：

- 覆盖状态：`direct coverage: high / medium / low / none`
- 所属上级 sector。
- 博主如何定位。
- 他看什么具体信息。
- 他如何理解这些信息。
- 什么情况下升级、观察、不追高、减风险。
- 已持有怎么看，未持有怎么看。
- 常见误读。
- 输出模板。

弱覆盖 ticker 只做 marker，不做完整 thesis。示例：

```md
# Ticker Marker: MRVL

## 覆盖状态
direct coverage: low / unclear

## fallback
- sector/ai-infrastructure.md
- ticker/avgo.md for peer comparison if relevant
- generic stock thesis logic

## related themes
- custom silicon
- optical interconnect
- data-center capex

## rule
不能把 AI 基建相邻证据说成 qinbafrank 对 MRVL 的直接观点。
```

## 再蒸馏流程

### Step 1: 导出全量推文语料

优先从数据库读取，而不是只使用 `extraction_log/*.prompt.md`。

目标输出：

```text
backend/app/features/twitter/methodologies/_drafts/qinbafrank-skill-v3/evidence/all-tweets.jsonl
```

每条保留：

```json
{
  "tweet_id": "...",
  "created_at": "...",
  "text": "...",
  "quoted_tweet_text": "...",
  "category": "...",
  "symbols": {
    "tickers": [],
    "sectors": [],
    "events": [],
    "quality": "high",
    "content_summary_zh": "..."
  },
  "metrics": {
    "likes": 0,
    "views": 0
  }
}
```

如果数据库访问暂不可用，可以从 v1 `extraction_log/*.prompt.md` 恢复语料作为临时 fallback，但要在 manifest 中标注来源不完整。

### Step 2: 预分类到四层桶

每条推文可以进入多个桶：

```text
core:
  投资原则、能力圈、风险、方法论、杀估值/杀业绩/杀逻辑

macro:
  Fed、流动性、财政、地缘、CPI、TGA、RRP、SOFR、关税

sector:
  AI 算力、crypto/stablecoin/RWA、software disruption、HBM/存储、电力

ticker:
  NVDA、GOOGL、MU、AVGO、ORCL、MSTR、COIN 等
```

Ticker 桶不能只依赖 `symbols.tickers`，还要语义匹配公司名、产品名和 peer：

- 美光 / Micron / MU
- Google / GOOGL / GCP
- 博通 / AVGO / custom silicon
- 英伟达 / NVDA / Blackwell
- Circle / USDC / CRCL

### Step 3: 抽取 atomic rules

不要直接生成 skill。先让模型从每个桶抽小颗粒规则。

Atomic rule schema：

```json
{
  "module": "sector",
  "submodule": "ai-infrastructure",
  "rule_type": "interpretation_rule",
  "claim": "AI 算力短缺会从 GPU 迁移到 HBM、光互连、电力、CPU 等瓶颈环节。",
  "what_he_watches": ["token consumption", "capex", "RPO", "capacity", "lead time"],
  "how_he_interprets": "瓶颈迁移代表产业链价值捕获点变化。",
  "decision_implication": "越靠近物理瓶颈，确定性越高。",
  "applicable_questions": ["AI 算力够不够", "AI 基建看哪些方向"],
  "evidence": [
    {"tweet_id": "...", "quote": "..."}
  ]
}
```

规则类型：

```text
data_preference
interpretation_rule
decision_rule
veto_rule
misread_warning
output_pattern
```

### Step 4: 聚类、去重、打分

同义规则需要合并。每条 rule cluster 打分：

```text
support_count: 被多少条推文支持
quality_count: high quality 推文数量
recency: 最近是否还出现
cross_category: 是否跨 stock/macro/sector 都出现
specificity: 是否有具体指标/公司/场景
actionability: 能不能指导 Agent 下一步回答
```

进入正式 skill 的最低门槛：

- core 规则：至少 5 条推文支持，或跨多个 category 反复出现。
- macro 规则：至少 3 条高质量宏观推文支持。
- sector 规则：至少 3 条同板块推文支持。
- ticker playbook：至少 3 到 5 条 direct 或 near-direct 推文支持。
- 低于门槛的 ticker 只能生成 marker。

### Step 5: 生成四层 skill 文件

基于 rule clusters 生成 skill 文件，而不是直接基于原推文生成。

生成时必须保留：

- 规则来源。
- 关键 tweet_id。
- 代表 quote。
- 与 v1 的对应关系。
- 缺口说明。

### Step 6: 验证蒸馏结果

必须做四类验证：

1. Evidence audit
   - 每条核心规则必须能回到原推文。
   - quote 必须是源推文里的连续原文。

2. Holdout replay
   - 留出 10% 到 20% 推文不参与蒸馏。
   - 检查生成的 skill 能不能解释 holdout 推文里的分析路径。

3. User-question eval
   - 用真实用户问题测试 skill 是否 actionable：
     - `NVDA 财报前要不要加仓？`
     - `MRVL 怎么看？`
     - `美股现在是大顶吗？`
     - `AI 是不是泡沫？`
     - `Circle 还能买吗？`

4. v1 diff check
   - 对比 v1：哪些规则被保留，哪些被删除，哪些是新增。
   - 删除规则必须有理由，不能静默丢失。

## 数据流

```text
kol_tweets DB
  -> export all tweets
  -> all-tweets.jsonl + corpus-manifest.json
  -> bucket assignment: core / macro / sector / ticker
  -> atomic-rules.jsonl
  -> rule-clusters.json
  -> skill markdown files
  -> evidence audit + holdout replay + user-question eval
```

## API / 工程变更

第一阶段可以先做离线脚本，不改线上 API：

```text
backend/app/features/twitter/methodology_v3/
  export_corpus.py
  bucketizer.py
  atomic_rule_models.py
  atomic_rule_extractor.py
  skill_writer.py
  validators.py
```

后续如果要产品化，再考虑新增 cron/admin endpoint：

```text
POST /api/twitter/extract-skill-v3
```

该 endpoint 不进入 MVP，避免在方案未稳定前增加线上复杂度。

## 实施步骤

1. [ ] 确认 v3 draft 输出目录和文件命名。
2. [ ] 实现或手动执行全量推文导出，生成 `all-tweets.jsonl` 和 `corpus-manifest.json`。
3. [ ] 设计 `AtomicRule` Pydantic schema。
4. [ ] 设计四层 bucket 规则：core / macro / sector / ticker。
5. [ ] 实现第一版 bucketizer，支持 ticker 别名、公司名、产品名匹配。
6. [ ] 针对 core/macro/sector/ticker 分桶抽取 atomic rules。
7. [ ] 聚类、去重、打分，生成 `rule-clusters.json`。
8. [ ] 从 clusters 生成 `core/operating-system.md`。
9. [ ] 从 clusters 生成 `macro/macro-regime.md`。
10. [ ] 从 clusters 生成第一批 sector skills：AI infrastructure、crypto/stablecoin/RWA。
11. [ ] 生成第一批 ticker playbooks：NVDA、GOOGL、MSFT、META、AMZN、MU、AVGO、ORCL、MSTR、COIN、RKLB、PLTR。
12. [ ] 生成弱覆盖 ticker marker：MRVL。
13. [ ] 执行 evidence audit，检查每条规则的 tweet_id 和 quote。
14. [ ] 执行 holdout replay，记录无法解释的样本。
15. [ ] 执行 user-question eval，检查回答是否比 v1/v2 更 actionable。
16. [ ] 执行 v1 diff check，确认 v1 重要规则没有丢失。
17. [ ] 根据验证结果修订 skill 文件。
18. [ ] 决定是否替换现有 methodology chat 的路由逻辑，或先以 draft 方式并行测试。

## 验收标准

- `core / macro / sector / ticker` 四层结构完整落地。
- 每个正式 skill 都包含统一模板：适用问题、核心问题、看什么信息、如何理解、决策框架、常见误读、输出模板、Evidence Map。
- 每条核心规则至少有一个 tweet_id 和连续原文 quote。
- 高覆盖 ticker 有完整 playbook，低覆盖 ticker 不伪造强观点，只生成 marker。
- `MRVL` 这类弱覆盖标的能正确 fallback 到 sector skill，而不是被写成直接观点。
- user-question eval 中，v3 回答必须比 v1/v2 更能说明：
  - 当前调用了哪一层 skill。
  - 需要看哪些具体信息。
  - 如何理解这些信息。
  - 如何做动作姿态或判断升级/降级。

## 待定问题

1. 全量语料是否直接从 Insforge DB 导出，还是先从 `extraction_log/*.prompt.md` 恢复一版临时语料？
2. v3 extractor 是否继续使用 Google ADK `LlmAgent + output_schema`，还是先用离线脚本加模型 API 生成 JSONL？
3. Ticker playbook 的 direct coverage 门槛是 3 条、5 条，还是按质量分加权？
4. `software-ai-disruption` 和 `semiconductor-memory-hbm` 是否第一批独立成 sector skill，还是先作为 `ai-infrastructure.md` 子章节？
5. v3 draft 通过验证后，是替换 `methodology_chat` 的现有 category 路由，还是在新 UI/新 endpoint 中灰度？
