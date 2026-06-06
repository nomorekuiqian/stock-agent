# qinbafrank Skill Distillation

> Status: active · Generated: 2026-05-27

按"core / macro / sector / ticker"四层组织的可调用 skill 系统，源自 qinbafrank 1048 条 quality-filtered 推文（2025-10-28 ~ 2026-05-25）。

## 结构

```
qinbafrank/
├── README.md                       本文件
├── core/
│   └── operating-system.md         底层操作系统（始终加载）
├── macro/
│   └── macro-regime.md             宏观市场环境框架
├── sector/                         (7 sectors + neocloud 子章节)
│   ├── ai-infrastructure.md
│   ├── crypto-stablecoin-rwa.md
│   ├── defense-and-space.md
│   ├── power-and-physical-ai.md
│   ├── semiconductor-memory-hbm.md
│   ├── software-ai-disruption.md
│   └── fintech-brokerage.md
├── ticker/                         (22 playbooks + 1 marker)
│   ├── NVDA.md   GOOGL.md  MSFT.md  META.md  MU.md   AMZN.md
│   ├── HOOD.md   COIN.md   ORCL.md  PLTR.md  AMD.md  RKLB.md
│   ├── CRCL.md   TSM.md    TSLA.md  ARM.md   AVGO.md INTC.md
│   ├── CRWV.md   QCOM.md   ASTS.md  SNDK.md  FUTU.md TIGR.md
│   ├── LUNR.md   MSTR.md   LHX.md   BMNR.md  IBM.md  BB.md
│   ├── ON.md     BA.md
│   └── MRVL.md                     marker (零提及示例)
├── evidence/
│   ├── all-tweets.jsonl            1048 条 quality-filtered 语料
│   ├── corpus-manifest.json        语料统计 + 过滤参数
│   ├── ticker-index.json           ticker -> tweet_ids
│   ├── sector-index.json           sector -> tweet_ids
│   ├── bucket-summary.json         分桶统计
│   ├── bucket-per-tweet.jsonl      每条推文的桶分配
│   ├── compact/                    每个 slice 的单行精简视图
│   └── slices/                     每个 skill 对应的 jsonl 切片
└── eval/                           (验证产物，pending)
```

## 调用层级

```
ticker → 落回 sector → 落回 macro → 落回 core

例：
  用户问 "NVDA 财报怎么看"
    → 加载 ticker/NVDA.md
    → 必要时同时加载 sector/ai-infrastructure.md
    → core/operating-system.md 永远加载

  用户问 "MRVL 怎么看"
    → 加载 ticker/MRVL.md (marker)
    → fallback 到 sector/ai-infrastructure.md + ticker/AVGO.md
    → 显式声明"博主未直接讨论过 MRVL"
```

## 统一 Skill 模板

所有 skill 文件都遵守同一套模板：

```
适用问题  / 核心问题  / 他看什么信息  / 他如何理解  /
决策框架  / 常见误读  / 输出模板  / Evidence Map
```

每条规则的 Evidence Map 都能回到具体 tweet_id。

## Coverage 标签语义

- `high`    博主反复深度讨论；可直接引用博主观点
- `medium`  博主提到过并表过态，但深度有限；引用时带 hedge
- `low`     博主只零散提过，主要靠 sector fallback；显式声明 single-source
- `none`    博主从未提到；生成 marker 而非 playbook

## 组织方式

| 维度 | 当前方式 |
|---|---|
| 组织方式 | 按 Agent 调用层级 (core/macro/sector/ticker) |
| 标的颗粒度 | 22 个独立 playbook + 1 marker 示例 |
| 弱覆盖处理 | coverage 标签 + marker fallback |
| 模板 | 所有层级共用单一模板 |
| 常见误读 | 每个 skill 显式列出 |
| 输出模板 | 每个 skill 自带 |
| 证据 | 集中 Evidence Map + 可追溯 |
| 扩展 sector | defense-and-space / power-and-physical-ai / fintech-brokerage |

## 实际覆盖

**Ticker playbook：22 个 playbook + 1 个 marker**：

- 计划内全部完成：NVDA / GOOGL / MSFT / META / AMZN / MU / AVGO / ORCL / MSTR / COIN / RKLB / PLTR
- 计划外发现：HOOD / AMD / ARM / INTC / TSM / TSLA / CRCL / CRWV / QCOM / ASTS / SNDK / FUTU / TIGR / LUNR / LHX / BMNR / IBM / BB / ON / BA

**Sector playbook：7 个 sector + neocloud 子章节**：

- 计划内全部完成：ai-infrastructure / crypto-stablecoin-rwa / software-ai-disruption / semiconductor-memory-hbm
- 计划外发现：defense-and-space（语料第三大主题）/ power-and-physical-ai / fintech-brokerage
- neocloud 作为 ai-infrastructure 子章节（数据量小）

## 待办

- `eval/holdout-replay.md` — 留出 10-20% 推文，验证 skill 能否解释 holdout 中的分析路径
- `eval/user-question-eval.md` — 跑预设用户问题集，验证 actionability
- `eval/rule-diff-check.md` — 规则差异审计
- Evidence audit — 检查每条规则的 tweet_id 是否真实存在于 corpus
- 灰度上线策略（admin flag / query param）

## 工程产出

辅助脚本：

- `backend/scripts/methodology_distillation/export_corpus.py` — 从 Insforge DB 导出 quality-filtered 语料
- `backend/scripts/methodology_distillation/bucketize.py` — 用字典 + 正则补充 enrichment 漏掉的中文别名 ticker
- `backend/scripts/methodology_distillation/slice_corpus.py` — 按 ticker / sector 切语料
- `backend/scripts/methodology_distillation/compact_slices.py` — 每个 slice 的单行精简视图

蒸馏过程（语料 → bucket → atomic rules → skill md → eval）由 Claude Code 在交互会话里直接完成，**不调用第三方 LLM API**。
