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

**入库过滤条件**（尽量放宽，保留更多语料）：

```text
symbols.quality ∈ {"high", "medium"}
AND symbols.content_type NOT IN {"noise"}
AND tweet 未被显式 drop / 删除
```

即只排除 `low` / `drop` / `noise`，`high` 和 `medium` 平等进入蒸馏语料库。`corpus-manifest.json` 中分别统计 high / medium 数量，便于事后追溯每条规则的证据池构成。

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
    {"tweet_id": "...", "quote": "...", "evidence_strength": "high"}
  ]
}
```

`evidence_strength` 直接继承 tweet 的 `symbols.quality`（`high` / `medium`）。生成 skill md 时优先选 high 作为代表 quote、medium 作为补充。

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

进入正式 skill 的门槛（放宽到底，避免误伤低频但明确的招牌观点）：

- 一条 atomic rule 只要源自语料库中 ≥1 条推文即可收录。语料库已经
  预先过滤掉 `low` / `drop` / `noise`，`high` 和 `medium` 平等参与。
- core / macro / sector 文件永远生成，不做证据数量准入；sector 候选
  4 个（AI 基建、crypto/stablecoin/RWA、software-AI-disruption、
  semiconductor-memory-HBM）全部独立成文，不再因证据少而合并。
- ticker：博主在历史推文里以任何方式提到过该 ticker（包括 sector
  讨论中带名），即生成 playbook，并标 `coverage: high / medium / low`；
  从未提到的 ticker 才生成 marker；marker 保留 sector fallback 规则。
- 收录时不做数量淘汰，但生成 skill md 时优先用 `evidence_strength: high`
  的 tweet 作代表 quote，`medium` 作为补充证据。

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

## 工程产出

蒸馏过程**由 Claude Code 在对话里直接完成**（读语料 → bucket → 抽 atomic rule → 聚类 → 写 skill md → evidence audit → holdout replay → user-question eval）。**不写额外的 LLM 调用脚本，不调第三方 API**。

唯一需要写的工程脚本是 Step 1 的语料导出：

```text
backend/app/features/twitter/methodology_v3/
  export_corpus.py   # 从 Insforge DB 拉 qinbafrank 全量推文
                     # → all-tweets.jsonl + corpus-manifest.json
```

`export_corpus.py` 职责：

- 调 `kol-tweets` edge function 或直接读 `kol_tweets` 表，分页拉全部 `author_username = 'qinbafrank'` 的推文
- 应用过滤：`symbols.quality ∈ {high, medium}` 且 `symbols.content_type != 'noise'`
- 写出 `evidence/all-tweets.jsonl` + `evidence/corpus-manifest.json`（带 high/medium 分布、时间范围、过滤前后条数）
- 幂等可重跑

之后的所有步骤（bucketize、atomic rule 抽取、聚类、skill md 生成、evidence audit、各类 eval）由 Claude Code 在交互会话里直接产出文件，写入 `_drafts/qinbafrank-skill-v3/` 对应子目录。

产品化阶段（把 v3 skill 加载进 runtime agent）再讨论是否新增 admin endpoint，MVP 不做。

## 实施步骤

1. [x] 确认 v3 draft 输出目录和文件命名。
2. [x] 写 `export_corpus.py` 并执行：1048 条推文入库（过滤 content_type=noise；实际 enrichment 无 quality 字段，注释已说明）。
3. [x] Bucket 分配：`bucketize.py` + 中文别名字典补全 enrichment 漏掉的 ticker（GOOGL 84 / MSFT 63 / AMZN 48 / ORCL 34 等），输出 `ticker-index.json` / `sector-index.json` / `bucket-summary.json` / `bucket-per-tweet.jsonl`。
4. [~] Atomic rules 单独 jsonl 跳过 — Evidence Map 直接嵌在每个 skill md 内（每条 rule 带 tweet_id），等效且避免双写。
5. [~] 聚类去重 跳过 — 在 skill md 内部完成（同义规则合并为单条）。
6. [x] 生成 `core/operating-system.md`。
7. [x] 生成 `macro/macro-regime.md`。
8. [x] 生成 **7 个** sector skills（比 plan 多 3 个）：
   - 计划内：`ai-infrastructure` / `crypto-stablecoin-rwa` / `software-ai-disruption` / `semiconductor-memory-hbm`
   - 计划外（v3 corpus 发现的）：`defense-and-space`（224 条）/ `power-and-physical-ai`（200 条）/ `fintech-brokerage`（62 条）
   - `neocloud`（17 条）作为 ai-infrastructure 子章节
9. [x] 生成 **22 个** ticker playbooks（比 plan 多 10 个），全部带 `coverage` 标签：
   - High（9）：NVDA / GOOGL / MSFT / META / MU / AMZN / HOOD / COIN / ORCL
   - Medium（9）：PLTR / AMD / RKLB / CRCL / TSM / TSLA / ARM / AVGO / INTC
   - Low（14）：CRWV / QCOM / ASTS / SNDK / FUTU / TIGR / LUNR / MSTR / LHX / BMNR / IBM / BB / ON / BA
10. [x] MRVL marker（零提及，fallback 示例）。
11. [x] Evidence audit：`evidence_audit.py` 跑通；143/155 ref 验证通过；12 missing ref（6 unique）已查清根因，详见 `eval/evidence-audit.md`。
12. [ ] Holdout replay：模板已写入 `eval/holdout-replay.md`，执行 pending（需要 agent runtime）。
13. [ ] User-question eval：13 题集已写入 `eval/user-question-eval.md`，执行 pending（需要 agent runtime）。
14. [x] V1 diff check：写入 `eval/v1-diff-check.md`。无规则删除；新增 3 sector + 22 ticker + coverage 标签 + 常见误读 + 输出模板等。
15. [ ] 根据 eval 结果修订 skill 文件（待 holdout / user-question eval 跑完）。
16. [ ] admin flag / query param 灰度（待生产部署）。

## 验收标准

- `core / macro / sector / ticker` 四层结构完整落地。
- 每个正式 skill 都包含统一模板：适用问题、核心问题、看什么信息、如何理解、决策框架、常见误读、输出模板、Evidence Map。
- 每条核心规则至少有一个 tweet_id 和连续原文 quote。
- 博主提到过的 ticker 全部生成 playbook（带 `coverage` 标签），未提到的才用 marker。
- 低覆盖 ticker 的 playbook 不能伪造强观点 — 规则陈述必须能回到 Evidence Map 中的具体 tweet_id。
- `MRVL` 这类博主从未直接讨论过的标的，生成 marker 并 fallback 到 sector skill。
- user-question eval 中，v3 回答必须比 v1/v2 更能说明：
  - 当前调用了哪一层 skill。
  - 需要看哪些具体信息。
  - 如何理解这些信息。
  - 如何做动作姿态或判断升级/降级。

## 决议（原待定问题）

1. **语料来源**：直接从 Insforge DB 导出（`kol_tweets` 表 / `kol-tweets` edge function），不使用 `extraction_log/*.prompt.md`。仅在 DB 不可用时回退，且 manifest 必须显式标注来源。
2. **蒸馏执行方式**：由 Claude Code 在对话里直接蒸馏，**不调 Google ADK、不写额外 LLM 脚本、不调第三方模型 API**。唯一脚本是 `export_corpus.py`（纯 DB 读取）。
3. **Ticker playbook 门槛**：取消数量门槛。凡博主提到过的 ticker 都生成 playbook + `coverage: high / medium / low` 标签；从未提到的才用 marker。
4. **Sector 文件粒度**：候选 4 个（AI 基建、crypto/stablecoin/RWA、software-AI-disruption、semiconductor-memory-HBM）全部独立成文件，不合并为子章节。
5. **上线策略**：v3 draft 并行存放在 `_drafts/qinbafrank-skill-v3/`，**不替换**现有 `methodologies/qinbafrank/` 和 `methodology_chat` 路由。通过 admin flag 或 query param 灰度，跑 v1 / v3 对照 eval 1-2 周后再决定是否替换。
