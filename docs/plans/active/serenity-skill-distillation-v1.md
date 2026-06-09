# Serenity Skill Distillation V1 Engineering Plan

> Status: Planning → Executing
> Updated: 2026-05-27
> Related:
> - `backend/app/features/twitter/methodologies/_drafts/qinbafrank-skill-v3/`(对照模板)
> - `docs/plans/active/qinbafrank-skill-distillation-v3.md`(范式来源)
> - `docs/plans/active/kol-persona-cockpit.md`(消费方:`/kol/[username]` 驾驶舱)
> Vision: 把 Serenity(`@aleabitoreddit`)8 个月以来的 AI/半导体供应链推文蒸馏成可调用、可验证、可追溯的多层 skill 系统,让 agent 能模仿她的方式回答"她怎么看 X""她推荐什么""这条新闻对哪些标的有利"等问题。

## 目标

针对 Serenity 的语料特点(深度专一的 AI/半导体供应链分析师 · 自下而上 · 多头偏向 · 工程师视角)重新蒸馏一套 skill 系统,**有意识地偏离 qinbafrank v3 的模板**:

- 不复用 Frank 的「政治经济学世界 + 宏观主导」框架——Serenity 几乎不写 Fed 流动性
- 不沿用 Frank 的「AI 大桶 sector」——Serenity 把 AI 拆到 photonics / CPO / substrates / transceivers / memory / neocloud 多个子环节
- 不沿用 Frank 的「ticker 池以 Mag7 为中心」——Serenity 的高频标的是 SIVE / LITE / AXTI / AAOI / SOI / IQE / COHR 等小盘 niche
- 新增 framework 层「ask-news-decoder」「ask-for-top-picks」——前者是 Serenity 招牌动作(50% 推文是 quote-tweet 翻译新闻),后者承接"她推荐什么"这类无 ticker/sector 的高频用户提问

## 数据现状

通过 `kol-tweets` edge function 拉取 `aleabitoreddit` 2025-09-01 ~ 2026-05-31 推文:

```
Total unique: 1,335
After noise filter: ~1,072
Range: 2025-09-27 ~ 2026-05-28 (≈ 8 个月)
Language: English 1327 / CJK present 8
tweet_type: original 531 / quote 663 / reply 141
Avg length: 838 chars (long >500: 643)
content_type:
  thesis           420
  noise            263  (filtered out)
  catalyst         132
  trade_action     126
  sector_framework 109
  macro_view       106
  risk_flag         94
  None              45
```

**Top 30 tickers** (频次):
```
SIVE 224 · LITE 194 · AXTI 164 · AAOI 129 · NBIS 120 · MRVL 108 · NVDA 106
COHR  98 · SNDK  88 · SOI  83 · MU   81 · IREN  73 · IQE   64 · TSM   62
EWY   54 · AVGO  49 · AEHR  49 · TSEM 45 · AMZN  42 · META  41 · GOOGL 41
INTC  41 · MSFT  40 · JBL   35 · RKLB  33 · AMD   31 · CIFR  30 · POET  29
HOOD  26 · RDDT  26
```

**Top sectors** (enrichment 标签):
```
photonics 435 · AI_infra 284 · CPO 258 · substrates 174 · optical_transceiver 149
macro 147 · neocloud 123 · defense 63 · space 32 · power_semi 17
```

**Stance 分布**(从 `ticker_stances`):
- bull 1,346 / neutral 59 / bear 104 — **极度多头偏向**
- 唯一明显切换案例: IREN(bull 31 / bear 31)

## 与 qinbafrank v3 的关键差异

| 维度 | qinbafrank | Serenity | 蒸馏含义 |
|------|------------|----------|----------|
| 视角 | 自上而下宏观 + 个股 | 自下而上供应链瓶颈 | core 写「瓶颈迁移操作系统」 |
| 板块粒度 | AI 算力一个大桶 | photonics/CPO/substrates/transceivers 各自独立 | sector 拆到子环节级 |
| Ticker 池 | Mag7 为主 | 小盘 niche 为主(SIVE/LITE/AXTI/AAOI/SOI/IQE/COHR) | 每个 ticker playbook 顶部强制公司解码 |
| 内容形态 | 原创长文 | 50% 是 quote-tweet + 自评 | 抽 atomic rule 必读 quoted_tweet_text |
| 宏观比重 | 极高(621 条) | 次要(147 条) | macro skill 写薄,聚焦 AI capex 周期 + KR/TW/JP 地缘 |
| 决策类型 | bull/bear/观望 | 几乎全 bull,做空极少 | decision framework 重心在「何时减仓 / 轮动 / 兑现」 |
| 语言 | 中文 | 英文(cockpit UI 是中文) | skill md 用中文写,Evidence quote 保留英文原文 |
| 风格指纹 | 「我有 90% 把握」「杀估值 vs 杀逻辑」 | 「these go brr」「last year's X = this year's Y」「called out before the supercycle」 | overview 专门记 voice markers |

## 设计

### 四层 + 一层 Skill 结构

目录: `backend/app/features/twitter/methodologies/_drafts/serenity-skill-v1/`

```text
serenity-skill-v1/
├── README.md
│
├── core/
│   └── bottleneck-operating-system.md      不是 operating-system,是「瓶颈迁移操作系统」
│
├── macro/
│   └── ai-capex-cycle.md                   替代 macro-regime;只写 AI capex 周期 + KR/TW/JP 地缘
│
├── framework/                              用户提问形态承接层(7 个)
│   ├── ask-about-stock.md                  「她怎么看 X 这只股?」
│   ├── ask-about-sector.md                 「她在 X 板块看什么机会?」
│   ├── ask-news-decoder.md                 「这条新闻 / 数据点对哪些标的有利?」(招牌)
│   ├── ask-about-positioning.md            「她现在重仓什么? 警惕什么?」
│   ├── ask-is-consensus.md                 「这个 thesis 已经 priced in 了吗?」
│   ├── ask-about-method.md                 「她到底怎么找到这些冷门股的?」
│   └── ask-for-top-picks.md                「她推荐什么? 跟单能抄什么?」(招牌)
│
├── sector/
│   ├── photonics-and-cpo.md                435+258 条,绝对核心
│   ├── optical-transceivers.md             149 条,LITE/COHR/AAOI 主战场
│   ├── substrates.md                       174 条,AXTI/IQE/TSEM/SOI/POET
│   ├── memory-and-hbm.md                   MU/SNDK + AEHR(测试设备)
│   ├── neocloud.md                         123 条,NBIS/IREN/CIFR/CRWV/WULF
│   ├── ai-infrastructure-mag7.md           NVDA/AVGO/MRVL/TSM 等大盘 anchor 标的
│   ├── power-and-electrical.md             17 条 power_semi + 散落电力推文,薄一些
│   ├── defense-and-space.md                63+32 条,RKLB 等
│   └── humanoid-robotics.md                她有专门 crowdsourced list(新主题)
│
├── ticker/
│   高覆盖 (≥80 提及, 11 个):
│     SIVE  LITE  AXTI  AAOI  NBIS  MRVL  NVDA  COHR  SNDK  SOI  MU
│   中覆盖 (30-80 提及, 14 个):
│     IREN  IQE   TSM   EWY   AVGO  AEHR  TSEM  AMZN  META  GOOGL
│     INTC  MSFT  JBL   RKLB
│   低覆盖 (10-30 提及, 10 个):
│     AMD   CIFR  POET  HOOD  RDDT  CRWV  WULF  ALAB  LPK   HPS.A
│   marker (零提及示例, 1 个):
│     ASML(供应链上游但她基本不提)
│
├── evidence/
│   ├── all-tweets.jsonl
│   ├── corpus-manifest.json
│   ├── ticker-index.json
│   ├── sector-index.json
│   ├── bucket-summary.json
│   ├── bucket-per-tweet.jsonl
│   ├── compact/                            每个 slice 的单行精简视图
│   └── slices/                             每个 skill 对应的 jsonl 切片
│
└── eval/
    ├── evidence-audit.md
    ├── holdout-replay.md
    ├── user-question-eval.md
    └── persona-diff-frank-vs-serenity.md   同问题两人答案对比(新增,Serenity 独有)
```

### Routing 决策树(写入 core 文件最后一节)

```text
1. 「她这个人怎么工作」?                       → framework/ask-about-method
2. 带外部新闻/数据要反推受益链?                 → framework/ask-news-decoder
3. 「推荐 / top picks / 抄作业 / 该买什么」
   且没指定 ticker / sector?                  → framework/ask-for-top-picks
4. 「持仓变化 / 警惕什么 / 看法变了吗」?         → framework/ask-about-positioning
5. 句子里有 consensus / FOMO / priced-in?      → framework/ask-is-consensus
6. 单个 ticker?                              → framework/ask-about-stock
7. 板块词或多 ticker?                        → framework/ask-about-sector
8. 兜底:给「她整体看的几条产业链」               → framework/ask-about-sector
```

每个 framework 在被命中后,按需加载对应的 `sector/*.md` 和/或 `ticker/*.md`,`core/` 和 `macro/` 永远在 instruction 里。

### 统一 Skill 模板(比 Frank v3 多 2 段)

```md
# Skill: {name}

## 适用问题
用户大概率会用的原话(列 4-6 条具体句子)。

## 核心问题
这个 skill 真正要回答的判断问题。

## 公司或产业是什么 (NEW)
仅 ticker / sector 文件用。≤2 句的解码,纯事实,内容必须来自语料,不补训练数据。

## 她看什么信息
指标、数据源、事件、产业链变量。

## 她如何理解
变量之间的因果链、瓶颈迁移路径、价值捕获点。

## 决策框架
什么情况下加仓、观察、轮动。

## 减仓与轮动信号 (NEW)
她几乎不做空,但会减仓 / 轮动 / 兑现。这一段消化 risk_flag + trade_action 推文。

## 常见误读
agent 或用户最容易犯的外推错误。

## 输出模板
agent 回答时应该如何组织答案。

## Evidence Map
每条规则对应的 tweet_id 和原文 quote(quote 必须连续原文;若源推文是 quote-tweet,
quote 字段格式为 `[quoting @xxx]: ... | Serenity: ...`)。
```

## Framework 层详细设计

### ask-about-stock
- **适用问题**: 「她怎么看 SIVE?」「NVDA 财报前她表过态吗?」「$AXTI 还能买吗?」「MRVL 在她体系里什么定位?」「她为啥这么喜欢 IQE?」
- **回答骨架**: 公司在她供应链地图哪一环 → 该环节当前瓶颈位置 → 她给过的 analog(「这是去年的 X」) → 她最近一次表态(stance + content_type + 日期) → 升级/减仓触发条件 → 同环 peer 兜底
- **嵌入 mechanic**: bottleneck-rotation · analog-pattern-matching

### ask-about-sector
- **适用问题**: 「CPO 还有什么机会?」「光模块她重点看哪几只?」「substrate 是什么?」「AI 算力链最看好哪一段?」「neocloud 还能玩吗?」
- **回答骨架**: 板块在 AI capex 周期当前节点位置 → 板块内她拆出的子环节 → 每个子环节她现在的代表标的 → 当前最被低估 vs 最 crowded 的子环节 → 「下一站会去哪一环」
- **嵌入 mechanic**: bottleneck-rotation · consensus-rotation

### ask-news-decoder(Serenity 独有,Frank v3 没有)
- **适用问题**: 「Intel CEO 说 CPU 比例从 1:8 到 1:1,她怎么解读?」「DuPont 涨价了对哪些股有利?」「台积电 capex 上调,她会盯哪几只?」「美光指引超预期哪些 peer 受益?」「玻璃基板缺货新闻她怎么看?」
- **回答骨架**: 新闻触发产业链哪一节点 → 节点上游 / 下游 / 替代品 → 她过去同类新闻挑过哪几个受益标的 → 注意「相邻不等于直接受益」
- **嵌入 mechanic**: supply-chain-decoder

### ask-about-positioning
- **适用问题**: 「她现在重仓什么?」「她最近警惕什么?」「她对 IREN 看法变了吗?」「她的多仓最集中在哪?」「她有没有清仓某个标的?」
- **回答骨架**: ticker_stances 高频 bull 集中区 → 最近 4 周 risk_flag + trade_action → IREN 那种 bull→bear 切换案例怎么读 → 「看好 X」≠「重仓 X」
- **嵌入 mechanic**: risk_flag 显式信号读取规则

### ask-is-consensus
- **适用问题**: 「CPO 已经是 consensus 了吗?」「光通信涨太多了吗?」「niche bottleneck 故事被喊烂了吗?」「现在追是不是 FOMO?」
- **回答骨架**: 主流是否在喊(她常用「FOMO / parroting / bot farms」当反指) → 估值是否反映 RPO / 订单 → 她有没有「下车」语言信号 → 「supercycle 还没结束」vs「这是最后一波」判定
- **嵌入 mechanic**: consensus-rotation

### ask-about-method
- **适用问题**: 「她怎么找到这些冷门小盘的?」「她看哪些数据?」「她和别的 AI 分析师有什么不一样?」「怎么学她的思路?」「她为什么敢这么早 call 出 LITE?」
- **回答骨架**: 工程视角(ex-RISC-V FDN, AI research) → 信号源类型(财报 CapEx、CEO 原话、产业链涨价、Reddit/X 反向指标) → 招牌动作("these go brr"、30-stock list、analog) → voice markers
- **嵌入 mechanic**: 兼任 voice marker 承载

### ask-for-top-picks(Serenity 独有)
- **适用问题**: 「她推荐什么?」「她最看好哪几只?」「跟她抄作业能抄什么?」「她 top picks 是什么?」「她仓位最重的?」「她说过哪些是 supercycle 受益股?」
- **回答骨架**:
  1. 先校正预期:她不发"荐股清单",她披露判断和持仓
  2. 高确信 mechanic: ticker_stances bull 计数 + 最近 4 周仍在提 + 「supercycle / called out / they go brr」高确信语言 + 排除已切换(IREN)
  3. 按供应链桶聚合输出(不要散乱给 5 只票)
  4. 每只 ≤1 行公司解码 + 链到 ask-about-stock
  5. 风险标签必须出现(niche 小盘 / 几乎不止损 / 重仓单只 / 跟单需理解故事)

## 蒸馏流程(与 Frank v3 一致,by Claude Code,不调第三方 API)

### Step 1: 导出语料

**唯一需写的脚本**(改造现有 `export_corpus.py`):

```text
backend/app/features/twitter/methodology_v3/export_corpus.py
  - 添加 --username CLI 参数,默认 qinbafrank(回归测试不破坏)
  - 输出目录按 username 路由:
    qinbafrank   → _drafts/qinbafrank-skill-v3/evidence/
    aleabitoreddit → _drafts/serenity-skill-v1/evidence/
```

过滤规则同 Frank:`content_type != 'noise'`,quality 字段不存在故不用。

### Step 2: Bucket 分配

`bucketize.py` 扩展中文/英文 sector 别名字典:
- photonics / 光通信 / 光子 / SiPh / silicon photonics
- CPO / co-packaged optics / 光封装
- substrates / 衬底 / SiPh substrate
- optical transceiver / 光模块 / EML / VCSEL / DSP
- HBM / 高带宽内存 / DRAM
- neocloud / GPU cloud / neoclouds
- power_semi / 电力半导体 / 电源 / transformer
- defense / 国防, space / 太空
- humanoid / robotics

ticker 别名扩展:
- Sive Health → SIVE, Lumentum → LITE, AXT Inc → AXTI
- Applied Optoelectronics → AAOI, Nebius → NBIS, Coherent → COHR
- SanDisk → SNDK, SOITEC → SOI, IQE plc → IQE, Tower Semi → TSEM
- Aehr Test → AEHR, Astera Labs → ALAB, Cipher Mining → CIFR

### Step 3-5: 抽 atomic rules + 聚类 + 写 skill md

跟 Frank v3 一样合并到 skill md 中(Evidence Map 直接嵌在文件内),避免双写。

### Step 6: 验证

四类验证沿用 Frank v3:
1. Evidence audit — `evidence_audit.py` 直接复用,扫 serenity-skill-v1/
2. Holdout replay — 留出 10-20% 推文,验证 skill 能解释 holdout 分析路径
3. User-question eval — 13 道题集,含 Serenity 特有问题:
   - "她推荐什么股票?"
   - "SIVE 还能买吗?"
   - "Intel CPU 1:1 那条新闻她会怎么看?"
   - "AXTI 在她体系里是什么?"
   - "CPO 已经是 consensus 了吗?"
4. **persona-diff(新增)** — 同样问题让 Frank v3 和 Serenity v1 各自回答,人工判定差异是否反映「Frank 偏宏观、Serenity 偏供应链」分工

## 工程改动清单

| 文件 | 改造 |
|------|------|
| `methodology_v3/export_corpus.py` | 添加 `--username` 参数 + 按 username 路由输出目录 |
| `methodology_v3/bucketize.py` | 扩展英文 sector + 小盘 ticker 别名字典 |
| `methodology_v3/slice_corpus.py` | 复用 |
| `methodology_v3/compact_slices.py` | 复用 |
| `methodology_v3/evidence_audit.py` | 复用(可能需要 path 参数化) |
| `shared/kol_persona/registry.py` | `_load_persona_v3_uncached` 当前 hardcoded `username == "qinbafrank"`;改成 username → 子目录映射 |
| `kol_research/cockpit_v3.py` | `V3_ROOT` 和 `SECTOR_DISPLAY` 按 username 路由 |
| `kol_research/router.py` | `/api/kol/{username}/cockpit-v3` 把 username 透传 |

## 前端落地(驾驶舱页面 `/kol/serenity`)

### 第一性原理

用户打开 KOL 驾驶舱的真实意图,按高频→低频排:

| 意图 | 占比估算 | 答案在哪 |
|------|---------|---------|
| 她现在看好/重仓什么? 我能不能抄一点? | ~60% | 当下 high conviction 清单 |
| 我手里有 X / 听人提过 X, 她怎么看? | ~25% | 个股查询 |
| 她到底是谁? 为什么值得听? | ~10% | 一行画像 + 信誉数据 |
| 她的方法论 / 怎么思考 | ~5% | 可折叠学习区, 不主推 |

用户带着「钱往哪放」的问题来, 不是来上课。Frank 页面把方法论放最大、个股 explorer 放最下面是工程视角错误, Serenity 页面不重蹈覆辙。

### 页面砍到 3 块

```
┌─────────────────────────────────────────────────────┐
│ ① HERO (紧凑)                                        │
│   @Serenity · AI 半导体供应链分析师                    │
│   8 个月 / 987 推文 / 30+ 标的 / 全多头偏向            │
│                                                      │
│   她的脑回路 (一行 + inline 漏斗):                     │
│   钱从 Mag7 资本开支 → 沿供应链流到上游瓶颈            │
│   [Mag7]→[Neocloud]→[光通信]→[衬底/材料]              │
│   (横向迷你漏斗, 点击锚到下方持仓)                     │
│                                                      │
│   [用 Serenity 视角向她提问 →]                        │
│   [展开她的完整方法论 ↓] (折叠默认收起)                 │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ ② 她现在押注什么 · HIGH CONVICTION   ← 页面真正主角    │
│                                                      │
│   按 7-8 个供应链环节横排分组:                        │
│   光通信 │ 衬底材料 │ Neocloud │ 存储HBM │ 电力 │ ... │
│   LITE   │ AXTI    │ NBIS     │ MU     │ HPS.A│      │
│   提及数 │ 30d 涨跌 │ 一句 thesis │ [问她→]            │
│                                                      │
│   (一屏装下所有押注; 这就是 95% 用户来的答案)           │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ ③ 查一只股 · 她怎么看 X                              │
│                                                      │
│   搜索框 [NVDA / 英伟达 / AXTI / SIVE...]            │
│   ┌────────────────────────────────────────────┐    │
│   │ AXTI · $4.20 +3.2% · 美股 · Substrates    │    │
│   │ 公司是什么: InP/GaAs 衬底, 全球前三 (NEW 解码) │    │
│   │ Mention timeline + 价格曲线叠加              │    │
│   │ 最新表态 / 高赞观点 (TweetCard, quote 展示)   │    │
│   └────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘

(footer disclaimer 复用 Frank)
```

### 砍掉的东西及理由

| 砍掉 | 理由 |
|------|------|
| 独立 SectorExplorer 9 张卡 | 信息已经在 ②③ 全展示; 9 张卡是工程视角, 没人逐张点 |
| 独立 BottleneckFunnel 模块 | 收缩成 Hero 里一行 inline 漏斗; 用户看一眼懂思路就够 |
| 独立 NewsDecoder 模块 | 这是 chat 的一种 prompt, 不是页面级功能; 「向她提问」已覆盖 |
| MethodologyCore 大区块 | 收成 Hero 里一行画像 + 折叠按钮; 99% 用户不点开 |
| "明确不做 / 减仓信号" 独立 section | 全多头, 没什么真正不做的; 放进方法论折叠区 |

### 信息效率原则

- **Above the fold** 必须能回答"她是谁 + 她现在押什么"两件事
- **每个 ticker 卡片只显示 4 条信息**: 代码、提及数、近期涨跌、一句 thesis; 再多稀释注意力
- **任何"了解她的方法"内容默认折叠**, 不与"行动信息"抢视觉权重
- **个股查询前置**, 让带着 ticker 来的用户能立刻搜索, 不用滚到页底

### 后端只要 2 个真正新的端点

不复用 Frank 那套 `sectors` + `sectors/{key}` + `tickers` 三端点组合; 直接给前端一次性聚合:

```
GET /api/kol_research/personas/{username}/high-conviction
    → 按供应链环节分组的核心 ticker + 一句 thesis + 提及数 + 价格快照
    数据源: ticker.md 的 thesis 段 + sector.md 的 short + cockpit ticker stats

GET /api/kol_research/personas/{username}/tickers/{ticker}
    → 复用 Frank 已有结构, 增加:
       - decoder 字段 (来自 ticker.md "公司或产业是什么" 段, 冷门股专用)
       - region 字段 (US / SE / TW / JP / KR)
```

`/profile` 端点 + chat 入口复用现有的, 不新增。

### 前端组件清单

| 组件 | 复用 / 新建 | 备注 |
|------|------------|------|
| `SerenityPage.tsx` (容器) | 新建 | 编排 3 个模块 + 拉数据 |
| `SerenityHero.tsx` | 新建 | 紧凑画像 + inline 漏斗 + 折叠方法论 |
| `HighConvictionGrid.tsx` | 新建 | 按供应链环节分组的 ticker 卡片墙 |
| `TickerExplorer.tsx` | **复用 Frank**, 微调 | 加 decoder 解码框 + region badge |
| `TweetCard.tsx` | **复用 Frank**, 扩展 | 支持 quote-tweet 双层展示 |
| `MentionTimelineChart.tsx` | 复用 Frank | 不变 |
| `AskSerenityButton.tsx` | 从 `AskFrankButton` 拷贝改 persona | URL 参数 `persona=aleabitoreddit` |

### 前端实施分两阶段

| 阶段 | 范围 | 目标 |
|------|------|------|
| **FE-M1** | Hero + HighConvictionGrid + 复用 TickerExplorer | 页面能开, 95% 用户意图能被满足 |
| **FE-M2** | TickerExplorer 扩展 decoder + region + quote-tweet 展示 | 解决"冷门小盘不知道是什么"和"50% quote-tweet" |

Inline 漏斗、TopPicks 高级排序、News Decoder 不进 v1; 灰度跑 1-2 周再看是否需要。

## 验收标准

继承 Frank v3 的 6 条(四层结构 / 模板统一 / Evidence Map 可追溯 / 提到过的 ticker 都有 playbook / 低覆盖不伪造观点 / marker fallback),**Serenity 额外要求**:

1. **每个低知名度 ticker playbook 顶部必须有 ≤2 句的公司解码**,内容来自语料,不补训练数据
2. **quote-tweet 必须保留上下文**: Evidence Map quote 字段格式为 `[quoting @xxx]: ... | Serenity: ...`
3. **bottleneck-rotation mechanic** 必须能解释她过去 8 个月里至少 80% 的 catalyst + sector_framework 推文
4. **ask-for-top-picks 必须显式包含风险标签**(niche 小盘 / 几乎不止损 / 重仓单只)
5. **persona-diff 报告** 5 个问题中至少 4 个能看出两人分工

## 实施步骤

1. [x] 确认目录结构和文件命名
2. [ ] 改造 `export_corpus.py` 参数化 username + Frank 回归测试不破
3. [ ] 跑 Serenity 全量导出 + bucketize + slice + compact
4. [ ] 写 `core/bottleneck-operating-system.md`(含 routing 决策树)
5. [ ] 写 `macro/ai-capex-cycle.md`
6. [ ] 写 7 个 `framework/ask-*.md`
7. [ ] 写 9 个 `sector/*.md`(从 photonics-and-cpo 开始,先验证模板)
8. [ ] 写 35 个 `ticker/*.md`(11 高 + 14 中 + 10 低 + 1 marker)
9. [ ] 改造 `registry.py` 支持多博主 v3
10. [ ] 跑 `evidence_audit.py` 验证 Evidence Map
11. [ ] 写 `eval/*.md` 模板(执行 holdout 和 user-question 留待 runtime 验证)
12. [ ] 改造 cockpit_v3.py 支持多 persona(等 admin flag 灰度上线再做)
13. [ ] **FE-M1**: 后端 `/high-conviction` 端点 + `SerenityPage` + `SerenityHero` + `HighConvictionGrid` + 复用 TickerExplorer
14. [ ] **FE-M2**: `/tickers/{t}` 增加 decoder + region 字段; TickerExplorer 加解码框 + region badge; TweetCard 扩展 quote-tweet 双层展示

## 决议

1. **语料来源**: 直接从 Insforge DB(`kol-tweets` edge function)导出,不使用 extraction_log
2. **蒸馏执行方式**: Claude Code 在对话里直接读语料并写 skill md,**不调第三方 LLM API**,不写额外 LLM 脚本。唯一脚本是 `export_corpus.py`(纯 DB 读取)
3. **Ticker playbook 门槛**: 凡她提到过的 ticker 都生成 playbook + `coverage` 标签;未提到的生成 marker
4. **Sector 文件粒度**: 9 个独立 sector 文件(photonics-and-cpo / optical-transceivers / substrates / memory-and-hbm / neocloud / ai-infrastructure-mag7 / power-and-electrical / defense-and-space / humanoid-robotics)
5. **上线策略**: v1 draft 并行存放在 `_drafts/serenity-skill-v1/`,**不替换** Frank。registry 改造后通过 admin flag 灰度,跑 1-2 周 user-question + persona-diff eval 后决定是否上线
