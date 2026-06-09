# Serenity Skill Distillation v1

> Status: v1-draft · Generated: 2026-05-27
> Plan: `docs/plans/active/serenity-skill-distillation-v1.md`

按 **core / macro / framework / sector / ticker** 五层组织的可调用 skill 系统, 源自 Serenity (`@aleabitoreddit`) 的 987 条 noise-filtered 推文 (2025-09-27 ~ 2026-05-28).

## 结构

```
serenity-skill-v1/
├── README.md                            本文件
├── core/
│   └── bottleneck-operating-system.md   底层操作系统(始终加载, 含 routing 决策树)
├── macro/
│   └── ai-capex-cycle.md                AI 资本开支周期 + KR/TW/JP 地缘
├── framework/                           (7 个用户提问形态承接层)
│   ├── ask-about-stock.md               「她怎么看 X 这只股?」
│   ├── ask-about-sector.md              「她在 X 板块看什么机会?」
│   ├── ask-news-decoder.md              「这条新闻对哪些标的有利?」(招牌)
│   ├── ask-about-positioning.md         「她现在重仓什么? 警惕什么?」
│   ├── ask-is-consensus.md              「这个 thesis 已经 priced in 了吗?」
│   ├── ask-about-method.md              「她到底怎么找到这些冷门股的?」
│   └── ask-for-top-picks.md             「她推荐什么? 跟单能抄什么?」(招牌)
├── sector/                              (9 个 sector + 1 个子环节)
│   ├── photonics-and-cpo.md             346 条, 绝对核心
│   ├── optical-transceivers.md          187 条
│   ├── substrates.md                    182 条
│   ├── memory-and-hbm.md                302 条
│   ├── neocloud.md                      127 条
│   ├── ai-infrastructure-mag7.md        472 条 (anchor 配置)
│   ├── power-and-electrical.md          197 条
│   ├── defense-and-space.md             208 条
│   └── humanoid-robotics.md             162 条
├── ticker/                              (35 个 playbook + 1 marker)
│   高覆盖 (11): NVDA SIVE LITE AXTI AAOI NBIS MRVL COHR SNDK SOI MU
│   中覆盖 (14): IREN IQE TSM EWY AVGO AEHR TSEM AMZN META GOOGL INTC MSFT JBL RKLB
│   低覆盖 (10): AMD CIFR POET HOOD RDDT CRWV WULF ALAB LPK HPS.A
│   marker  ( 1): ASML
├── evidence/
│   ├── all-tweets.jsonl                 987 条 noise-filtered 语料
│   ├── corpus-manifest.json             语料统计 + 过滤参数
│   ├── ticker-index.json                ticker -> tweet_ids
│   ├── sector-index.json                sector -> tweet_ids
│   ├── bucket-summary.json              分桶统计
│   ├── bucket-per-tweet.jsonl           每条推文的桶分配
│   ├── compact/                         每个 slice 的单行精简视图
│   └── slices/                          每个 skill 对应的 jsonl 切片
└── eval/
    ├── evidence-audit.json              ✓ 309/309 refs valid
    ├── evidence-audit.md
    ├── holdout-replay.md                pending (runtime)
    ├── user-question-eval.md            pending (runtime)
    └── persona-diff-serenity.md           pending (runtime)
```

## 调用层级

```
ticker → 落回 sector → 落回 framework → 落回 macro → 落回 core

例:
  用户问「SIVE 怎么看?」
    → core 永远加载
    → framework/ask-about-stock 命中 (单 ticker)
    → 加载 ticker/SIVE.md
    → 必要时加载 sector/photonics-and-cpo.md

  用户问「她推荐什么?」
    → core 永远加载
    → framework/ask-for-top-picks 命中 (无 ticker / sector, 高信念标的关键词)
    → 加载多个 sector + ticker 的历史高信念集中地
```

## Skill 分层约定

Skill 文件是 Agent 的判断素材库,不是用户可见输出模板。core / framework
约束意图识别、素材优先级和引用纪律;sector / ticker 提供具体知识和证据。
最终回答由模型根据用户问题自然组织,不要逐段复述文件章节。

常见章节包括:

```
适用问题 / 核心问题 / 公司或产业是什么 / 她看什么信息 / 她如何理解 /
决策框架 / 减仓与轮动信号 / 常见误读 / 回答注意 / Evidence Map
```

- **"公司或产业是什么"** 解决 SIVE/AXTI 这类陌生标的的解码问题
- **"减仓与轮动信号"** 反映 Serenity 几乎只做多但会轮动的事实
- **"回答注意"** 只提醒边界和取舍,不得写成固定输出格式

## Coverage 标签语义

- `high`    博主反复深度讨论(≥80 提及);可直接引用博主观点
- `medium`  博主提到过并表过态(30-80 提及),但深度有限;引用时带 hedge
- `low`     博主只零散提过(10-30 提及),主要靠 sector fallback
- `none`    博主从未直接讨论;生成 marker 而非 playbook

## Serenity v1 主要特征

- 视角: 自下而上供应链瓶颈。
- 板块粒度: photonics/CPO/substrates/transceivers/memory/neocloud 各自独立。
- Ticker 池: 小盘 niche 为主 (SIVE/LITE/AXTI/AAOI/SOI/IQE/COHR)。
- 内容形态: 大量 quote-tweet + 自评,所以回答必须区分历史观点、当前事实和方法推断。
- 决策类型: 几乎全 bull,重点在「何时复核 / 何时轮动」。
- Framework: 7 个 (ask-news-decoder、ask-for-top-picks 等)。
- Sector 数: 9 个独立。
- Ticker 数: 11 high + 14 medium + 10 low + 1 marker。

## Evidence audit

✓ **309 / 309 refs valid** (2026-05-27)

每条 Evidence Map 的 tweet_id 都能回到 corpus, quote 是连续原文.

## 已发现的 Serenity 独有特性

1. **AI 资本开支漏斗** — 从 Mag7 → 算力云 → 连接网络 → 定制芯片 → 晶圆代工 → 先进封装 → 衬底 → 材料物理咽喉, 8 层下沉
2. **物理咽喉 vs 产能瓶颈区分** — 物理咽喉重仓 (AXTI/SIVE/FOCI), 产能瓶颈更偏阶段性交易
3. **机构反指机制** — 卖方唱空当下涨幅 = 还在早期识别阶段
4. **"fake-it-til-you-make-it" 排除** — POET / IREN (稀释维持市值)
5. **跨地区 / 跨语言 ticker** — Stockholm (SIVE), Taipei (FOCI 3363, Nextronics 8147), Tokyo (Towa 6315), 韩国 (Samsung 005930, SK Hynix HXSCL)
6. **同环切换** — NBIS > IREN, SIVE/Foci > LITE/COHR (部分轮出), AXTI > SMTOY 不可类比

## 工程产出

参数化的 4 个脚本(已运行):

- `backend/app/features/twitter/methodology_v3/personas.py` — persona 配置(ticker 别名 / sector 关键词 / macro / core 信号)
- `backend/app/features/twitter/methodology_v3/export_corpus.py --persona-key serenity-skill-v1` — DB 导出
- `backend/app/features/twitter/methodology_v3/bucketize.py --persona-key serenity-skill-v1` — 中英文混合 ticker / sector 别名识别
- `backend/app/features/twitter/methodology_v3/slice_corpus.py --persona-key serenity-skill-v1` — 按 sector / ticker 切语料
- `backend/app/features/twitter/methodology_v3/compact_slices.py --persona-key serenity-skill-v1` — 每个 slice 的单行精简视图
- `backend/app/features/twitter/methodology_v3/evidence_audit.py --persona-key serenity-skill-v1` — Evidence Map 验证

蒸馏过程(语料 → bucket → atomic rules → skill md → eval)由 Claude Code 在交互会话里直接完成, **不调用第三方 LLM API**.

## 待办

- `eval/holdout-replay.md` — 留出 10-20% 推文, 验证 skill 能否解释 holdout 中的分析路径
- `eval/user-question-eval.md` — 跑预设用户问题集
- `eval/persona-diff-serenity.md` — Serenity 答案一致性评估
- 灰度上线策略 (admin flag / query param)
