# Serenity Skill Distillation v1

> Status: v1-promoted · Generated: 2026-05-27 · Refreshed: 2026-06-19

按 **core / macro / framework / sector / ticker** 五层组织的可调用 skill 系统, 源自 Serenity (`@aleabitoreddit`) 的公开推文蒸馏物料。本轮 corpus 覆盖 1438 条保留语料（2025-09-02 ~ 2026-06-19）。

正式物料目录: `backend/app/features/twitter/methodologies/aleabitoreddit/`

## 结构

```
aleabitoreddit/
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
├── ticker/                              (36 个 ticker files, ASML 为 marker-style low lens)
│   高覆盖 (11): NVDA SIVE LITE AXTI AAOI NBIS MRVL COHR SNDK SOI MU
│   中覆盖 (14): IREN IQE TSM EWY AVGO AEHR TSEM AMZN META GOOGL INTC MSFT JBL RKLB
│   低覆盖 (11): AMD CIFR POET HOOD RDDT CRWV WULF ALAB LPK HPS.A ASML
└── marker-style: ASML frontmatter 从 none 修正为 low,但仍不作为独立 thesis
```

生成过程中的 evidence、slice、compact、eval、audit 物料不属于正式运行目录, 已归档到 gitignored 的本地 distillation artifacts 目录。

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
- `low`     博主只零散提过(10-30 提及),主要靠 sector fallback 或 marker-style 口径说明
- `none`    博主从未直接讨论;生成 marker 而非 playbook

## Serenity v1 主要特征

- 视角: 自下而上供应链瓶颈。
- 板块粒度: photonics/CPO/substrates/transceivers/memory/neocloud 各自独立。
- Ticker 池: 小盘 niche 为主 (SIVE/LITE/AXTI/AAOI/SOI/IQE/COHR)。
- 内容形态: 大量 quote-tweet + 自评,所以回答必须区分历史观点、当前事实和方法推断。
- 决策类型: 几乎全 bull,重点在「何时复核 / 何时轮动」。
- Framework: 7 个 (ask-news-decoder、ask-for-top-picks 等)。
- Sector 数: 9 个独立。
- Ticker 数: 11 high + 14 medium + 11 low；ASML 仍按 marker-style 回答,但 coverage 从 `none` 修正为 `low`。
- 2026-06-15 周更补充：IQE 新增 epiwafer price hike、China InP export easing、IQE/TSEM multi-year InP deal 证据；photonics-and-cpo 新增 800V/CPO 延迟争议、InP 出口缓和、SIVE primary-source laser 证据。
- 2026-06-19 即时刷新：SIVE / AAOI / AMD 追加 CW laser supply 与 AMD 采购链证据；photonics-and-cpo / optical-transceivers / substrates 追加 Mizuho CPO 时间线、AAOI/SIVE revenue capture、AEHR 硅光测试、LPK 玻璃基板设备、ALRIB/MBE 证据；memory-and-hbm / MU 追加 memory theme 复盘；neocloud / NBIS / IREN 追加 NBIS ATH vs IREN ATM 稀释对比；ASML / INTC marker/ticker 更新到 2026-06-19。

## Evidence audit

✓ **本目录 Evidence Map 由 `evidence_audit.py --persona-key serenity-skill-v1` 校验**（最近刷新：2026-06-19）

每条 Evidence Map 的 tweet_id 都曾通过 corpus 校验, quote 是连续原文。审计报告和
原始 corpus 属于生成过程物料,保存在本地 ignored distillation archive 中,不随正式
persona 物料提交。

## 已发现的 Serenity 独有特性

1. **AI 资本开支漏斗** — 从 Mag7 → 算力云 → 连接网络 → 定制芯片 → 晶圆代工 → 先进封装 → 衬底 → 材料物理咽喉, 8 层下沉
2. **物理咽喉 vs 产能瓶颈区分** — 物理咽喉重仓 (AXTI/SIVE/FOCI), 产能瓶颈更偏阶段性交易
3. **机构反指机制** — 卖方唱空当下涨幅 = 还在早期识别阶段
4. **"fake-it-til-you-make-it" 排除** — POET / IREN (稀释维持市值)
5. **跨地区 / 跨语言 ticker** — Stockholm (SIVE), Taipei (FOCI 3363, Nextronics 8147), Tokyo (Towa 6315), 韩国 (Samsung 005930, SK Hynix HXSCL)
6. **同环切换** — NBIS > IREN, SIVE/Foci > LITE/COHR (部分轮出), AXTI > SMTOY 不可类比

## 工程产出

参数化流程脚本:

- `backend/app/features/twitter/methodology_v3/personas.py` — persona 配置(ticker 别名 / sector 关键词 / macro / core 信号)
- `backend/app/features/twitter/methodology_v3/export_corpus.py --persona-key serenity-skill-v1` — DB 导出
- `backend/app/features/twitter/methodology_v3/bucketize.py --persona-key serenity-skill-v1` — 中英文混合 ticker / sector 别名识别
- `backend/app/features/twitter/methodology_v3/slice_corpus.py --persona-key serenity-skill-v1` — 按 sector / ticker 切语料
- `backend/app/features/twitter/methodology_v3/compact_slices.py --persona-key serenity-skill-v1` — 每个 slice 的单行精简视图
- `backend/app/features/twitter/methodology_v3/evidence_audit.py --persona-key serenity-skill-v1` — Evidence Map 验证

蒸馏过程(语料 → bucket → atomic rules → skill md → eval)由 Claude Code 在交互会话里直接完成, **不调用第三方 LLM API**.

## 待办

- 重新建立正式的 holdout / 用户问题 / persona 一致性评测,并把大体积过程物料继续放在 ignored archive。
- 灰度上线策略 (admin flag / query param)
