# Twitter KOL 观点日报 Engineering Plan

> Status: Phase 1 Done · Phase 2 V1/V2 done · **Phase 2 V3 重构进行中** · Phase 3 邮件模板就位但发送链路未通
> Updated: 2026-05-04
> Related: `backend/app/features/twitter/.context.md`, `backend/app/features/twitter_digest/.context.md`, `backend/app/features/subscription/`, `backend/app/edge_functions/kol-tweets.js`
> Vision: 把英文 Twitter 上少数优质金融博主的当前观点,翻译 + 解读,做成付费用户的每日早晨阅读。

## 目标

为每个工作日早晨的付费用户产出一份**标准日报**(全员共享、非个性化),回答两个问题:

> "今天哪些股票被博主推荐?哪些股票有更系统的客观分析值得我读?"

不是新闻聚合,不是翻译机器。核心差异化在三件事:

1. **Curation** — 选哪些 KOL 是产品本身。
2. **聚类 + 综合**(V3 升级) — LLM 把同一事件下所有 KOL 推文聚成话题卡,展示立场分布和分歧点,按 macro / industry / stock 三层组织。同时以快讯条扩大覆盖面、以独家声音保留单 KOL 深度。
3. **中英对照 + 解读** — 让不上推特、英文吃力的散户能理解原文、核心论证和为什么值得读。

## 当前阶段

- Phase 1(数据管道)已完成: `kol_tweets` + `twitter_fetch_runs` + KOL 目录。
- Phase 2 V1/V2 已完成: 单阶段挑推文 pipeline、`kol_daily_digests` 持久化、`GET /latest` / `GET /{date}`、前端 `/twitter-digest` 和 `/twitter-digest/[date]` 真实读取、cron 已落 (`kol-tweets-fetch.yml` 每小时,`twitter-digest-generate.yml` 北京 06:00 工作日)。
- **Phase 2 V3 进行中**(2026-05-04 起): 从"挑推文"重构为"聚事件"。读者价值从"看几张高质量卡片"升级为"成体系看到今天 KOL 圈在讨论什么"。详见下文 [关键设计转变(V3)](#关键设计转变v3) 和 [Phase 2 V3 实施步骤](#phase-2-v3-实施步骤进行中)。
- Phase 3 邮件模板已落: `format_twitter_digest_html`(in `email_templates.py`),V3 重构后需要同步更新。**Resend 发送链路 / broadcast endpoint / batch send 任务尚未实现。**
- 当前未完成: V3 重构、邮件发送链路、Pro / Max 付费墙、历史归档列表。

V1/V2 实现是单次 LLM 调用,输出 `{takeaway, macro_picks, industry_picks, stock_picks}`,每张卡片 = 一条精选推文。V3 把单元从"推文"换成"话题",输出 `{headline, intro, takeaway, topics, briefs, solo_voices, crosscut, watch_next}`,详见下文。

## 非目标

- 不做市场情绪监控仪表盘。
- 不输出 `bullish_pct` / `bearish_pct` / 讨论量趋势等情绪结构化指标。
- 不做全网噪音抓取。
- 不把 AI 总结当作不可追溯结论 — 每个观点都必须能回到原始 tweet。
- **不做个性化**(不按用户持仓推送)— 标准日报全员共享,简化产品和运营。
- **不为发而发** — 稀疏日允许 section / 话题 / 快讯 / 独家声音任一类别为空,不强行凑数(质量门槛见各阶段评估)。

## 关键设计转变(V3)

V1/V2 把推文当最小单元: LLM 从池子里挑 ~20 张高信号卡片,按 macro / industry / stock 分类。
V3 把事件 / 话题当最小单元: 同一事件下所有 KOL 推文聚合,综合"多人怎么看这件事"。

**为什么改**:

- 用户实际心智是"今天大家在吵什么 + 哪些股票被讨论最多",不是"今天最值得读的几条推文"。
- 5月4日 $CRCL 因 Clarity Act 暴涨,5+ 个 KOL 同时发推。V1/V2 只挑 1-2 张卡; V3 把它们聚成一个"$CRCL · Clarity Act"话题卡,展示立场分布、综合论据、所有原推作为证据。
- 单条高质量推文的价值仍在,但要分流到"独家声音"区,不再当主菜。

**单元从"推文"换成"话题"导致的连锁改造**:

1. 推文入库后由 daily enrichment cron(flash-lite)一次性打上 `quality` / `quality_features` / `content_summary_zh` / `tickers` / `sectors` / `events`(以前 `kol_tweets.symbols` 列预留为空,现在填齐)
2. Digest 生成 pipeline 从"挑 + 质量判定"变成"聚类 + 综合 + 编辑",质量判定职责前移到 enrichment 阶段
3. 卡片形态重构为三类: **完整话题卡 / 快讯条 / 独家声音**,触发条件直接读 enrichment 的 `quality` 字段
4. 整份日报的 section 结构重新设计: 开场 + 热门话题 + 独家声音 + 收尾

**三类卡片如何分工**:

| 卡型 | 触发条件(基于 enrichment metadata) | 形态 | 给读者的价值 |
|------|-----------------------------------|------|------------|
| 完整话题卡 | ≥2 条 `quality=high` 推文聚到同一事件 / ticker / sector;或 1 条 `quality=high` + `tweet_type ∈ {thread, article}` | 标题 + ticker/sector + 立场分布 + 综述 + 关键论据 | 深度: 多人怎么看 |
| 快讯条 | 单条 `quality ∈ {high, medium}` 推文,有 ticker / sector,未进话题或独家声音 | 一行话题标签 + 一句梗概(直接来自 `content_summary_zh`)+ 原推链接 | 广度: 还有这些事在被讨论 |
| 独家声音 | 单 KOL 的 `quality=high` + `tweet_type ∈ {thread, article}`,无人合谈但论证完整 | 标题 + TLDR + AI 解读 + 原推链接 | 独到见解: 值得静下来读的 |

`quality=low` 的推文标了但永远不进 digest(保留供 Phase 4 个股页 KOL 视图、KOL 长期画像用)。三类互不重叠,合在一起达成"成体系、完整"。

## 产品定义

### 形态

| 项目 | 设计 |
|------|------|
| 受众 | Pro / Max 付费用户(复用现有 Stripe entitlement) |
| 频率 | 周一至周五,周末跳过 |
| 送达时间 | 北京 **08:00**(含前一日美股收盘 + 当天早间 KOL 反应) |
| 语言 | 中英对照(原推英文 + 中文翻译) |
| Section(V3) | A. 开场 / B. 热门话题(macro·industry·stock 三层) / C. 独家声音 / D. 收尾 / E. 追踪博主 |
| 卡型(V3) | 完整话题卡(多 KOL 综合) · 快讯条(单条值得知道) · 独家声音卡(单 KOL 深度) |
| 分组 | 热门话题按 layer 分三层;stock 内允许同 ticker 多卡(不同事件) |
| Web 页面 | `/twitter-digest` latest + `/twitter-digest/[date]` 单日详情 |

### 邮件结构(V3)

每日邮件 = web 等价(不简化),按下面 section 顺序渲染:

A. 开场(Hook + 要点合并)
B. 热门话题
C. 独家声音
D. 收尾
E. 追踪博主(折叠)

### 当前 section 结构(V3)

```
┌──────── KOL 观点日报 · 05-04 ────────┐
│                                       │
│ A. 开场(Hook + 要点合并)               │
│    主线一句 + 导言段 + 3-5 行要点        │
│    要点带锚点,可跳到下面具体话题         │
│                                       │
│ B. 热门话题(主菜)                      │
│    分三层:macro / industry / stock     │
│    每层混合两种卡型:                     │
│      · 完整话题卡(多 KOL 综合)          │
│      · 快讯条(单条值得知道)             │
│    stock 内允许同 ticker 多卡平铺        │
│                                       │
│ C. 独家声音                             │
│    单 KOL 高质量深度(thread / article)  │
│    无人合谈但论证完整                    │
│                                       │
│ D. 收尾                                │
│    跨话题呼应/分歧 + 明日观察            │
│                                       │
│ E. 本日报追踪 N 位博主(折叠)           │
└───────────────────────────────────────┘
```

### 卡片设计(V3)

**1. 完整话题卡**

触发条件:≥2 条 `quality=high` 推文聚到同一 event / ticker / sector;或 1 条 `quality=high` + `tweet_type ∈ {thread, article}`。

```
┌── $CRCL · Clarity Act 通过推涨 ──┐
│ 5 位博主参与 · 4 看多 / 1 谨慎      │
│                                     │
│ 综合观点:                           │
│ Clarity Act 把稳定币纳入合规框架,    │
│ 多位博主认为 Circle 是最大受益方,    │
│ 但 X 提醒短期估值已 price in 利好。   │
│                                     │
│ 关键论据(展开):                    │
│ · @userA 看多: USDC 流通量将系统性...│
│ · @userB 谨慎: 估值已 price in...    │
│ · ...                               │
│                                     │
│              [查看完整讨论 →]        │
└─────────────────────────────────────┘
```

**2. 快讯条**

触发条件:单条 `quality ∈ {high, medium}`,有 ticker / sector 标签,未进话题或独家声音。`content_summary_zh` 直接当 `one_liner_zh` 用,不再让 pro 模型重写。

```
· $TSLA  @userC 短评:Q2 deliveries 数据将推动股价 [→ 原推]
· 半导体  @userD "出口管制再升级风险" [→ 原推]
```

设计原则:一行内容 + 来源 + 原推跳转,不做综合。给读者"还有这些事在被讨论"的视野,扩大覆盖面而非加深度。

**3. 独家声音卡**

触发条件:单 KOL 的 `quality=high` + `tweet_type ∈ {thread, article}`,无人合谈但论证结构和信息密度都够:

```
┌── @beth_kindig 长文:Hopper vs Sovereign AI ──┐
│ Thread · 12 条 · NVDA                          │
│ TLDR:三句中文摘要保留论证结构和关键数字          │
│ AI 解读:为什么这条值得读                        │
│                                                │
│             [查看完整 thread →]                 │
└────────────────────────────────────────────────┘
```

### 设计原则(V3)

1. **事件是最小单元** — 多 KOL 同谈一事的话题卡 > 单条精选推文。
2. **完整话题 / 快讯 / 独家声音 三类互不重叠** — 深度 / 广度 / 独到见解三种价值并存。
3. **稀疏日不强凑** — 任一类别都允许为空,诚实优先。
4. **每条观点都可追溯** — 原推链接和原文(中英对照)始终保留。
5. **AI 综合不是翻译** — 综合段落要解释立场分布、分歧点、共识点。

### 详情页

当前已有 `/twitter-digest` 和 `/twitter-digest/[date]`。还没有历史归档列表页,也没有主题详情页。

## 现状(Phase 1 已完成)

Phase 1 数据管道已建成,详见 `backend/app/features/twitter/.context.md`。

已有能力:

- `kol_config.py` 金融博主目录 + `POST /api/twitter/fetch-configured-kols` 批量采集
- 单 KOL 采集:`fetch-tweets` / `search-tweets` / `fetch-articles`
- 运行记录 `twitter_fetch_runs`
- `GET /api/twitter/tweets` / `stats` / `kol-accounts` / `fetch-runs`

`kol_tweets` 精简后 schema:

```
id, author_username, text, tweet_type, conversation_id,
quoted_tweet_text, in_reply_to_username, created_at, url,
like_count, retweet_count, reply_count, view_count,
category, symbols
```

`symbols JSONB` 列已建,**当前日报产品不需要**。它是为 Phase 4(股票级 KOL 视图)准备的。当前日报直接基于 `kol_tweets` 行做 LLM 筛选和分类,不依赖预先逐条标注 ticker。

## 平台设计

```text
1. Source Catalog        金融博主目录       [DONE]
2. Ingestion Pipeline    推文采集管道       [DONE]
3. Enrichment Pipeline   推文增强管道       [V3 NEW]
4. Daily Digest Pipeline 日报生成管道       [V3 重构]
5. Delivery Layer        Web + 邮件         [V3 重构 · Web partial · 无邮件发送]
6. Stock-Level KOL View  股票级 KOL 视图    [Phase 4 - deferred]
```

### 1. Source Catalog [DONE]

代码配置 `backend/app/features/twitter/kol_config.py`,目前字段 = `username` + `display_name`。后续可加 `category` / 迁移到 DB / Admin UI。

### 2. Ingestion Pipeline [DONE]

代码已实现 `fetch-configured-kols`,每 KOL 拉最新 1 页(~20 条),upsert 去重,run 记录写 `twitter_fetch_runs`。`.github/workflows/kol-tweets-fetch.yml` 每小时触发。

### 3. Enrichment Pipeline [V3 NEW]

入库阶段一次性给推文打上质量、内容摘要、ticker / sector / event 标签,使下游 digest pipeline 可以直接读 metadata 做聚类 + 综合,不再做质量判定。

**Cron**: 北京 05:30 工作日(UTC 21:30 Sun-Thu),先于 06:00 digest 生成 cron。一天一次足够,不跟随 hourly 采集。

**模型**: `gemini-3.1-flash-lite-preview`(enrichment 是结构化抽取任务,不需深度推理)。事件抽取允许粗,digest 综合阶段(pro 模型)会做最终事件命名归并。

**输入**: `kol_tweets` 中 `symbols IS NULL` 且 `created_at >= 36h ago` 的推文。已 enrichment 的跳过,避免重复成本。

**输出 schema**(每条推文一份):

```
quality: "high" | "medium" | "low"
                      - 直接复用 V1/V2 的 5 特征质量门:
                        ≥2 特征 → high(完整话题 + 独家声音候选)
                        =1 特征 → medium(快讯候选)
                        =0 特征 → low(永不进 digest,保留供 Phase 4)

quality_features: list[str]
                      - 命中的特征枚举:["data", "reasoning", "catalyst", "comparison", "risk"]
                      - 用于事后审计 / KOL 画像

content_summary_zh: str
                      - 一句中文梗概,15-40 字
                      - 不是翻译,是"这条推文在讲什么"
                      - 高复用价值:digest 聚类直接读 summary,快讯条 one_liner_zh 直接用

tickers: list[str]    例:["CRCL", "USDC"]
                      - 只接受 $XYZ 形式或全大写 2-5 字符 + 已知 ticker 词典校验
                      - 防止把 Twitter 用户名误判为 ticker

sectors: list[str]    例:["加密资产", "金融科技"]
                      - 中文短词组,从 KOL 圈惯用赛道名取

events: list[str]     例:["Clarity Act", "Q2 财报前瞻", "Fed 5月会议"]
                      - 中文或英文短词组,从推文里抽出
                      - 允许漂移(同一事件不同推文打不同标签),digest 阶段再归并
```

**写回**: `kol_tweets.symbols` JSONB 列,结构:

```json
{
  "quality": "high",
  "quality_features": ["data", "reasoning"],
  "content_summary_zh": "Circle 在 Clarity Act 通过后股价暴涨 40%,博主认为合规身份兑现",
  "tickers": ["CRCL", "USDC"],
  "sectors": ["加密资产"],
  "events": ["Clarity Act"],
  "enriched_at": "2026-05-04T05:30:00Z",
  "enriched_model": "gemini-3.1-flash-lite-preview"
}
```

`enriched_at` / `enriched_model` 让我们以后可以重跑(比如改了质量标准、换了模型)时按版本筛选。

**质量判定标准**(写在 prompt 里,严格复用现有 5 特征):

| 命中特征数 | 质量档 | 后续用途 |
|----------|--------|---------|
| ≥2 | high | 完整话题 key_arguments + 独家声音候选 |
| =1 | medium | 快讯候选(精神等同 V1/V2 的 flash) |
| =0 | low | 不进 digest,保留供 Phase 4 / KOL 画像 |

5 特征定义沿用现有 prompt(`backend/app/features/twitter_digest/prompts.py`):
1. 具体数据 / 数字
2. 明确推理链
3. 可证伪 claim / 具体 catalyst
4. 横向 / 历史对比
5. 自我承认风险 / 反方论点

**评估指标**:
- enrichment 覆盖率: 36h 窗口内已 enrichment 推文比例 ≥ 95%
- ticker 误识别率(用 ticker 词典反查): < 2%
- 质量分档准确率: 人工抽查 50 条 / 周,校准 prompt
- 事件归并率: 监控同义事件出现率,不强约束

### 4. Daily Digest Pipeline [V3 重构]

V1/V2 通过 `POST /api/twitter-digest/generate`(`twitter-digest-generate.yml` 北京 06:00 工作日)把候选推文用单次 pro 调用挑成三 bucket。**V3 重构后这一步从"挑 + 质量判定"变成"聚类 + 综合 + 编辑"**,依赖 Enrichment Pipeline 已经把 `kol_tweets.symbols` 填齐(quality / summary / tickers / sectors / events)。

#### 输入(V3)

- 过去 24-36 小时的 `kol_tweets`,**已 enrichment**
- **过滤 `quality = "low"` 的推文**(永不进 digest)
- 过滤互动量极低的 reply(降噪,沿用 V1/V2 逻辑)
- 含原推 + 引用上下文(`quoted_tweet_text`)+ enrichment metadata
- KOL profile(可选,用于综述时区分博主立场倾向)

pro 模型只看 `quality ∈ {high, medium}` 的推文,context 大幅缩小,综合质量提升。

#### 单次 LLM 流水线(V3)

模型: `gemini-3.5-flash`(综合 + 编辑性输出仍需深度推理)。

输入: 全部已标注候选 + KOL profile。

输出 schema(`CuratedDigestOutput`):

```
headline: str                  # 主线一句,15-25 字
intro: str                     # 导言段,20-50 字,今天 KOL 圈子在吵什么
takeaway: list[str]            # 3-5 条要点,挂锚点跳到具体话题

topics: list[Topic]            # 完整话题卡列表
  Topic:
    title: str                 # 例:"$CRCL · Clarity Act 通过推涨"
    layer: "macro" | "industry" | "stock"
    primary_ticker: str        # stock 类必填,其他为空字符串
    sector: str                # industry 类必填,其他为空字符串
    event: str                 # 可空,事件归并后的统一名
    participating_kols: list[str]
    stance_distribution: str   # 例:"5 位博主 · 4 看多 / 1 谨慎"
    synthesis_zh: str          # 综合观点中文,3-5 句,带分歧点
    key_arguments: list[KeyArg]    # 关键论据,2-5 条
      KeyArg:
        username: str
        stance: "bullish" | "bearish" | "neutral"
        tldr_zh: str           # 一句话提炼论点
        tweet_url: str

briefs: list[Brief]            # 快讯条列表
  Brief:
    layer: "macro" | "industry" | "stock"
    label: str                 # 例:"$TSLA" / "半导体" / "Fed 5月会议"
    one_liner_zh: str          # 一行梗概,不做综合
    username: str
    tweet_url: str

solo_voices: list[SoloVoice]   # 独家声音
  SoloVoice:
    title: str
    username: str
    primary_ticker: str        # 可空
    tweet_type: "thread" | "article"
    tldr_zh: str               # 3-5 句中文摘要,保留论证结构
    interpretation_zh: str     # 为什么这条值得读
    tweet_url: str

crosscut: str | None           # 跨话题呼应/分歧,2-3 句,可空
watch_next: list[str]          # 明日观察,1-3 条,可空
```

数量目标(允许稀疏日为空,不强凑):

- topics: 5-15 条(每张卡聚合 2-5 条原推作为 key_arguments)
- briefs: 10-25 条(主要的覆盖面拉手,单条一行不增阅读负担)
- solo_voices: 0-5 条
- takeaway: 3-5 条

**典型日原推覆盖目标 ~50 条**(topics × args ≈ 30 + briefs ≈ 15 + solo ≈ 3),爆发日可达 80-90,稀疏日 15-20。卡片数 ≠ 推文数,topic 卡聚合多条 KOL 发声。

#### Layer 定义(写在 prompt 里)

- **macro**: 大盘、指数、利率、地缘、关税、跨资产、加密和美股相关性等
- **industry**: 赛道级判断,包括 AI 算力、半导体、锂电、光通信、加密资产类别等
- **stock**: 单一 ticker 判断,允许同 ticker 一天多个话题(不同事件)

聚类规则(基于 enrichment metadata,不再做质量判定):

- 完整话题: ≥2 条 `quality=high` 推文聚到同一 event / ticker / sector;或 1 条 `quality=high` + `tweet_type ∈ {thread, article}`
- 快讯: 单条 `quality ∈ {high, medium}`,有 ticker / sector,未进话题或独家声音
- 独家声音: 单 KOL 的 `quality=high` + `tweet_type ∈ {thread, article}`,无人合谈
- 三类互不重叠,同一推文只能进一类
- `quality=low` 推文已在 enrichment 阶段筛掉,不到 pro 模型

#### 持久化

`kol_daily_digests`(Insforge)V3 列扩展(向后兼容,V1/V2 旧列保留过渡期):

```
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
date DATE UNIQUE,
-- V1/V2 legacy
takeaway JSONB,
macro_picks JSONB,
industry_picks JSONB,
stock_picks JSONB,
-- V3 new
headline TEXT,
intro TEXT,
topics JSONB,
briefs JSONB,
solo_voices JSONB,
crosscut TEXT,
watch_next JSONB,
-- meta
tracked_kols JSONB,
generated_at TIMESTAMPTZ,
model_version TEXT,
input_tweet_count INT,
schema_version TEXT,           -- "v2" | "v3"
updated_at TIMESTAMPTZ
```

`schema_version` 标识当行用的是 V2 还是 V3 输出,前端读到 v2 走旧渲染、v3 走新渲染,过渡期共存。`kol-tweets` edge function 现有 `upsert_digest` / `get_digest` / `get_latest_digest` 需要扩列。

#### 成本估算(V3)

每日成本 = Enrichment Pipeline + Daily Digest:

- **Enrichment**: flash-lite 一次 ~36h 推文(假设 200-400 条),输入 ~30K tokens,输出 ~25K tokens(每条多了 quality + features + summary,~50 tokens / 条)。仍极便宜。
- **Daily Digest**: pro 一次,输入 **~30-40K tokens**(只看 high+medium,context 比 V2 小 30-50%),输出 ~15K tokens(topics 综合段较长)。
- 整体每日成本比 V1/V2 略低(pro context 缩小抵消 enrichment 增量)。

#### 模块拆分(V3 计划)

`backend/app/features/twitter_digest/`:

- `models.py`: `Topic` / `Brief` / `SoloVoice` / `CuratedDigestOutput`(V3)/ `DailyDigest`(扩展) + `EnrichmentOutput`(quality / features / summary / tickers / sectors / events)
- `prompts.py`: V3 综合 prompt(聚类规则、layer 分配、编辑性输出)
- `agents.py`: pro 综合 agent(单 LLM 调用)
- `service.py`: `pull_candidate_tweets()`(读 `quality ∈ {high, medium}`)+ `curate_tweets()` + `generate_daily_digest()`
- `db.py`: 写入 V3 字段,读取兼容 V1/V2

新建 `backend/app/features/twitter_digest/enrichment.py`(或并入 `twitter/`):

- `enrich_unenriched_tweets()` + flash-lite agent + 写回 `kol_tweets.symbols`(完整 enrichment payload)
- enrichment prompt:5 特征质量门 + summary 写法 + ticker / sector / event 抽取规则 + ticker 词典校验

### 5. Delivery Layer [Phase 3 + V3 重构]

#### Email

- Resend 模板,中英对照,移动端友好
- 发送时间: 北京 **08:00 工作日**,周末跳过
- 收件人: Pro / Max 付费用户(复用现有 Stripe entitlement 判断)
- 每天一个 batch send,失败重试用现有 Resend 机制
- 邮件内容: 渲染 `kol_daily_digests` 当日行
- 链接: `https://themarketbrew.com/twitter-digest/{date}` 和 `/twitter-digest/{date}/themes/{theme_index}`

#### Web 详情页

- `/twitter-digest` — 最新一期 web 版,当前仅登录可读
- `/twitter-digest/{date}` — 整份日报的 web 版,当前仅登录可读
- `/twitter-digest/{date}/themes/{theme_index}` — 单主题详情
  - 多空地图
  - 完整综述(超出邮件容量的部分)
  - 时间线: 该主题相关 tweets,中英对照
  - 涉及股票 chips
- 历史档案列表页尚未实现

### 6. Stock-Level KOL View [Phase 4 - deferred]

**原 Stock Detail Market Tab 的设计移到这里**,日报产品验证之后再做。

设计:
- 个股页 Market Tab 内嵌 KOL 观点 panel
- 左栏: 这只股票当前 KOL 综述(LLM 生成)
- 右栏: 时间线证据(中英对照)
- 数据来源: 复用 `kol_tweets`,通过 `kol_tweets.symbols`(Phase 4 时才需要回填标注)+ stock chip 关联

依赖项:
- 标注 `kol_tweets.symbols`(只有进入 Phase 4 才需要;thread 合并 + flash-lite 标注)
- 新增 `GET /api/stocks/{symbol}/twitter-kol-opinions`
- 前端 `TwitterKolOpinionsPanel` 组件

## 分阶段路线

### Phase 1: 数据管道 [DONE]

每小时 cron → KOL timelines → kol_tweets。Schema 精简,`symbols JSONB` 留位。

### Phase 2: 日报生成

V1/V2(已完成):

```
kol_tweets (last 36h)
  → curate_tweets (single LLM call)
      → CuratedDigestOutput {takeaway, macro_picks, industry_picks, stock_picks}
  → DailyDigest
  → kol_daily_digests
```

V3(进行中,从"挑推文"换成"聚事件"+ 入库 enrichment):

```
kol_tweets (hourly fetch)
  ↓ daily enrichment cron (flash-lite, 北京 05:30)
  ↓ 写回 symbols: {quality, quality_features, content_summary_zh, tickers, sectors, events}
kol_tweets (last 36h, enriched)
  ↓ filter quality ∈ {high, medium}
  → curate_tweets (single LLM call, pro,只做聚类+综合+编辑)
      → CuratedDigestOutput {headline, intro, takeaway, topics, briefs, solo_voices, crosscut, watch_next}
  → DailyDigest (schema_version=v3)
  → kol_daily_digests
```

cron:北京 06:00 工作日触发 digest(`twitter-digest-generate.yml` 已落),enrichment cron 北京 05:30 工作日(`kol-tweets-enrich.yml` V3 待加),失败重试至 07:30 cutoff,07:30 后跳过 + 告警。

### Phase 3: 邮件 + 详情页

- Resend 邮件模板 + 付费用户 batch send 北京 08:00
- Next.js 详情页(列表 + 单日 + 主题三种视图,付费墙)
- 历史档案

### Phase 4: 股票级 KOL 视图 [deferred]

只有日报产品验证后才启动。回填 `kol_tweets.symbols`,接个股页 Market Tab。

### Phase 5: 发现优质博主

基于 advanced search 和现有 KOL 的 quote / reply / mention 网络:
- 高互动 query 提取作者
- 计算账号质量分(金融相关推文占比、互动、是否写长文、被现有 KOL 引用)
- 候选列表,人工最终确认加入 `kol_config.py`

## 实施步骤

### Phase 2 V1 实施步骤(已完成)

- [x] 新增 `backend/app/features/twitter_digest/` 模块: `models.py` / `prompts.py` / `agents.py` / `service.py` / `router.py`
- [x] `models.py` — pydantic schemas: `CuratedTweet`、`CuratedCategory = macro | industry | stock`、`CuratedDigestOutput`、`DailyDigest`
- [x] `service.pull_candidate_tweets(window_hours=36)` — 复用 `kol-tweets` Edge Function `list_batch` action,过滤低互动 reply
- [x] `service.curate_tweets()` — 单次 LLM 调用,输出 takeaway + 三 bucket 分类
- [x] `service.generate_daily_digest()` 顶层调度,失败冒泡
- [x] `router.py` — `POST /api/twitter-digest/generate`,返回 `DailyDigest` JSON
- [x] 单测覆盖 pull/curate composition、schema 边界、dedup、DB 持久化读写
- [x] 前端 `frontend/src/app/twitter-digest/`:`DigestView` + 三个 `CategorySection`(大盘/行业/个股),按 sector / ticker 分组,中英对照 + AI 解读
- [x] 接入 nav:`日报` 下拉新增 `推特日报` → `/twitter-digest`
- [x] `backend/app/features/twitter_digest/.context.md`

### Phase 2 V2 实施步骤(部分完成)

- [ ] 收集真实推文,跑 V1 endpoint,人工评估输出质量
- [x] Insforge `kol_daily_digests` 读写路径接入 edge function
- [x] 扩展 `kol-tweets` Edge Function: `upsert_digest` / `get_digest` / `get_latest_digest`
- [x] `service.generate_daily_digest()` 默认生成后落库
- [x] 新增 `GET /api/twitter-digest/latest`
- [x] 新增 `GET /api/twitter-digest/{date}` 返回指定日期日报
- [x] `/twitter-digest/[date]` 切换为真实 fetch
- [ ] 读取端点和前端接 Pro / Max 付费墙
- [ ] 历史归档列表页
- [x] Cron 配置: 北京 06:00 (UTC 22:00) 工作日触发 generate (`.github/workflows/twitter-digest-generate.yml`); curl `--retry 3` 处理瞬态失败,失败建 issue
- [x] KOL 采集 cron: 每小时触发 `fetch-configured-kols` (`.github/workflows/kol-tweets-fetch.yml`)
- [ ] 评估集: 手工审 5 天的输出,比对"质量是否达到付费内容标准"

### Phase 2 V3 实施步骤(进行中)

V3 是把日报单元从"推文"换成"话题"的重构。施工分四步,每步可独立验证、独立 ship,**前一步通过验证再开下一步**。

#### Step 1 · 推文 enrichment 管道(daily cron)

- [ ] `backend/app/features/twitter_digest/enrichment.py`(或并入 `twitter/`):flash-lite agent + `enrich_unenriched_tweets()`
- [ ] enrichment prompt:**5 特征质量门** + content_summary_zh 写法 + tickers / sectors / events 抽取规则 + 已知 ticker 词典校验防误识
- [ ] `EnrichmentOutput` pydantic schema:quality / quality_features / content_summary_zh / tickers / sectors / events
- [ ] `service.enrich_unenriched_tweets()` 增量处理 `kol_tweets.symbols IS NULL` 且 `created_at >= 36h ago`
- [ ] 写回 `kol_tweets.symbols` JSONB(完整 payload + `enriched_at` + `enriched_model`)
- [ ] daily cron `.github/workflows/kol-tweets-enrich.yml`(北京 05:30 工作日,UTC 21:30 Sun-Thu),先于 06:00 digest cron
- [ ] 单测:happy path、已 enrichment 跳过、ticker 词典反查、5 特征质量分档边界、LLM 失败不阻塞 digest

**验证关:跑一天 → 人工抽查 50 条 → 质量分档准确率 ≥ 80%, ticker 误识别率 < 2%。**

#### Step 2 · Schema + Prompt + 聚合 pipeline

- [ ] `models.py` V3 扩展:`Topic` / `Brief` / `SoloVoice` / `CuratedDigestOutput` 加新字段
- [ ] `kol_daily_digests` 加 V3 列(`headline` / `intro` / `topics` / `briefs` / `solo_voices` / `crosscut` / `watch_next` / `schema_version`)
- [ ] `kol-tweets` edge function 扩 `upsert_digest` / `get_digest` / `get_latest_digest` 支持新列
- [ ] `pull_candidate_tweets()` 加 `quality ∈ {high, medium}` 过滤,丢掉 low 不喂 pro 模型
- [ ] `prompts.py` 重写:**去掉质量判定职责**,只做聚类规则 + 三类卡型分流(读 enrichment 字段)+ layer 分配 + headline / intro / crosscut / watch_next 编辑性指令
- [ ] `service.curate_tweets()` 改造 + 后处理(立场分布字符串生成、tweet_url 回填、quality 排序、briefs 用 `content_summary_zh`)
- [ ] `service.generate_daily_digest()` 写入 `schema_version="v3"`
- [ ] 单测:话题聚类、三类不重叠、空 bucket 处理、quality 过滤、向后兼容(老 v2 行可读)

**验证关:在测试环境调一次 generate,人工读输出,judge "是否成体系、完整"。**

#### Step 3 · Web 渲染 + 测试环境生成按钮

- [ ] 新组件:`OpeningSection` / `TopicCard` / `BriefRow` / `SoloVoiceCard` / `ClosingSection`
- [ ] `DigestView` 按 `schema_version` 分流:v3 走新组件,v2 走老组件,过渡期共存
- [ ] 锚点联动:开场要点 → 话题卡(`#topic-{idx}`)
- [ ] **测试环境"生成今日日报"按钮**:nonprod 环境在 `/twitter-digest` 顶部显示,点击调 `POST /api/twitter-digest/generate`,带 loading + 完成后 refetch latest
- [ ] E2E 测试新结构(空 / 稀疏 / 满载三种数据)

**验证关:测试环境点击生成 → 等待 → 看到 V3 渲染。**

#### Step 4 · 邮件模板(等价于 web,不简化)

- [ ] `format_twitter_digest_html` 重写为 V3 结构,保持 web/邮件等价
- [ ] 三类卡片在邮件 HTML 内的等效布局(无 JS,纯 inline CSS)
- [ ] `tests/test_email_rendering.py::TestTwitterDigestRendering` 同步更新
- [ ] `/email-test` 页面预览验证

**验证关:邮件预览读起来和 web 一致,移动端不挤压。**

---

### Phase 3 实施步骤(邮件)

- [x] 新增 Resend 邮件模板(三个 section、中英对照、移动端友好) — `format_twitter_digest_html` in `app/features/subscription/email_templates.py`,带单测 `tests/test_email_rendering.py::TestTwitterDigestRendering`
- [ ] 新增 broadcast endpoint(POST `/api/twitter-digest/broadcast`,cron-secret 保护,枚举 Pro/Max 收件人后调 Resend batch)
- [ ] 新增 batch send cron workflow,北京 08:00 工作日触发上面的 broadcast,复用 morning-report.yml 模板
- [ ] 付费墙: 复用 `useSubscription` Hook,non-Pro 用户在 web 上看 paywall 引导

### Phase 4-5 [deferred,先不实施]

(原 Stock Detail Market Tab 内容已移到 Phase 4 的 Stock-Level KOL View 描述中,KOL 发现移到 Phase 5。暂时归档,等日报产品验证。)

## 待定问题

1. **生成失败的 fallback**: Phase 2 cron 失败到 07:30 cutoff,是 (a) 跳过当天 + 告警, (b) 用前一日内容 + 显著标注"昨日重发", (c) 改 weekly 形式补一份?倾向 (a)。
2. **历史档案权限**: Pro 看多少天?Max 看完整历史?V1 简单点 = Pro 看全量。
3. **邮件转发 / 公开分享**: 付费内容理论上不许转发,但社交传播又是增长。是否在邮件里加水印 / 单条主题可对外分享?
4. **新付费用户 onboarding**: 当天就发?还是次日?当天发可能尴尬(他们 09:00 才付费,内容 08:00 已发)。倾向次日开始。
5. **退订**: 是否提供"我只想要日报但不想要其他邮件"的细粒度订阅控制?
6. **KOL profile 内容**: Stage 2 给 LLM 的"过去 90 天代表性 tweets"具体怎么选?用互动量 top N 还是 LLM 提前总结一次?

## 风险

| 风险 | 应对 |
|------|------|
| LLM 把"提到一只股票"误判为"个股观点" | Prompt 要求数据 / 推理链 / 可证伪 claim / 比较 / 风险至少命中一项,后续用评估集校准 |
| 翻译质量差 | 中英对照本身降低风险(用户能 verify),重点抽审高阅读量条目 |
| 当日真没好内容 | 三个 bucket 都允许为空,不强凑(诚实优先) |
| AI 解读流于表面 | 评估集 + 每周人工抽审,prompt 强调"不是翻译重复",持续 iterate |
| 邮件成本 | Resend batch + segments,成本可控 |
| 生成 cron 失败(V2) | 06:00 触发,失败重试至 07:30,仍失败则当天跳过 + 告警 |
| 用户觉得日报"水" | 评估集 + 收集付费用户反馈,优先 iterate prompt 而不是加功能 |
| KOL 长期失活 | `twitter_fetch_runs` 已有运行记录,加监控:某 KOL 7 天无新 tweets 自动告警 |
| LLM 输出 JSON 格式不稳定 | 用 pydantic 强校验,失败 → 端到端 RuntimeError,不伪造成功 |
| (V3) Enrichment 把 Twitter 用户名误判为 ticker | flash-lite 已知问题。prompt 强制只接受 `$XYZ` 形式或全大写 2-5 字符;再用已知 ticker 词典反查校验,词典外的 ticker 丢弃 |
| (V3) 事件名漂移(同一事件不同推文打不同标签) | enrichment 允许粗,digest 综合阶段 pro 模型做最终归并;监控同义事件出现率,若高则在 prompt 里加事件别名表 |
| (V3) 快讯条噪音过高 | enrichment 阶段已用 5 特征质量门把 low 滤掉,快讯只取 `quality ∈ {high, medium}`;`content_summary_zh` 替代 LLM 临时一行,质量更稳 |
| (V3) 独家声音判定标准模糊 | 触发条件硬约束:`quality=high` + `tweet_type ∈ {thread, article}`;不能光靠互动量 |
| (V3) Enrichment 质量分档不准(把 low 标 high 或反过来) | 5 特征量化判定 + 抽查校准 prompt;quality 字段独立可重跑,不影响其他列 |
| (V3) Enrichment cron 失败 / 部分推文 unenriched | digest 默认只看已 enrichment 推文,unenriched 跳过(下次 cron 再补);若覆盖率 < 80% 告警 |

## 参考

- Phase 1 数据管道实现见 `backend/app/features/twitter/.context.md`。
- TwitterAPI.io 已有 user timeline 能力在 `backend/app/features/twitter/service.py` 中使用。
- 现有 daily / morning report 邮件模式 `backend/app/features/daily_report/`、`backend/app/features/morning_report/` 可复用 batch send 框架。
- TwitterAPI.io 官方文档提供 `tweet/advanced_search` endpoint,可作为 Phase 5 发现新博主的数据源:[Advanced Search](https://docs.twitterapi.io/api-reference/endpoint/tweet_advanced_search)。
