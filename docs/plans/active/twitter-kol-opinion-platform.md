# Twitter KOL 观点日报 Engineering Plan

> Status: Phase 1 Done, Phase 2 V2 partially implemented (persisted web read), Phase 3 pending
> Updated: 2026-05-04
> Related: `backend/app/features/twitter/.context.md`, `backend/app/features/twitter_digest/.context.md`, `backend/app/features/subscription/`, `backend/app/edge_functions/kol-tweets.js`
> Vision: 把英文 Twitter 上少数优质金融博主的当前观点,翻译 + 解读,做成付费用户的每日早晨阅读。

## 目标

为每个工作日早晨的付费用户产出一份**标准日报**(全员共享、非个性化),回答两个问题:

> "今天哪些股票被博主推荐?哪些股票有更系统的客观分析值得我读?"

不是新闻聚合,不是翻译机器。核心差异化在三件事:

1. **Curation** — 选哪些 KOL 是产品本身。
2. **筛选 + 分类** — LLM 从当日推文中挑出真正值得看的,按大盘 / 行业 / 个股组织。
3. **中英对照 + 解读** — 让不上推特、英文吃力的散户能理解原文、核心论证和为什么值得读。

## 当前阶段

- Phase 1(数据管道)已完成: `kol_tweets` + `twitter_fetch_runs` + KOL 目录。
- Phase 2 已部分完成: 单阶段 LLM pipeline、`kol_daily_digests` 持久化、`GET /latest`、`GET /{date}`、前端 `/twitter-digest` 和 `/twitter-digest/[date]` 真实读取。
- 当前未完成: GitHub Actions cron、邮件发送、Pro / Max 付费墙、历史归档列表。

当前实现刻意保持单次 LLM 调用,输出 `{takeaway, macro_picks, industry_picks, stock_picks}`。不再使用早期的 `{bullish_picks, bearish_picks, neutral_analyses}` 情绪 bucket; sentiment 写进解读文本,结构按用户阅读心智组织。

## 非目标

- 不做市场情绪监控仪表盘。
- 不输出 `bullish_pct` / `bearish_pct` / 讨论量趋势等情绪结构化指标。
- 不做全网噪音抓取。
- 不把 AI 总结当作不可追溯结论 — 每个观点都必须能回到原始 tweet。
- **不做个性化**(不按用户持仓推送)— 标准日报全员共享,简化产品和运营。
- **不为发而发** — Prompt 强制选 3 主题,但绝不发劣质 / 凑数内容(质量门槛见 Phase 2 评估集)。

## 产品定义

### 形态

| 项目 | 设计 |
|------|------|
| 受众 | Pro / Max 付费用户(复用现有 Stripe entitlement) |
| 频率 | 周一至周五,周末跳过 |
| 送达时间 | 北京 **08:00**(含前一日美股收盘 + 当天早间 KOL 反应) |
| 语言 | 中英对照(原推英文 + 中文翻译) |
| Section 数 | **3 个**:大盘走势 + 行业判断 + 个股判断 |
| 单条 | 一条 KOL 推文 + headline + TLDR + 原文/译文 + 链接到原推 |
| 分组 | 行业按 `sector` 分组,个股按 `primary_ticker` 分组,大盘不分组 |
| Web 页面 | `/twitter-digest` latest + `/twitter-digest/[date]` 单日详情 |

### 邮件结构

```
══════ KOL 观点日报 · 04-25 ══════

📌 今日要点 (3-5 行,30 秒读完)
📈 大盘走势
🏭 行业判断
📊 个股判断
👥 本日报追踪的博主 (折叠)
```

### 当前 section 结构

```
┌─────── KOL 观点日报 · 04-25 ───────┐
│                                     │
│ 今日要点                              │
│   3-5 行,30 秒扫读                    │
│                                     │
│ 大盘走势                              │
│   跨指数 / 跨资产 / 宏观政策视角        │
│                                     │
│ 行业判断                              │
│   赛道级机会与风险,含加密资产类别       │
│                                     │
│ 个股判断                              │
│   单一标的视角,按 ticker 分组           │
│                                     │
│ 👥 本日报追踪 N 位博主(折叠)           │
└─────────────────────────────────────┘
```

### 单条卡片设计

同一 section 内按股票 ticker 分组(无 ticker 的归"宏观/跨赛道")。每张推文卡片:

```
┌───── $NVDA · 2 条 ─────┐
│                         │
│ Beth Kindig @beth_kindig │
│ Thread · 3 小时前         │
│                         │
│ "Adding to my $NVDA      │
│  position. Sovereign AI  │
│  orders will backfill ..." │
│ "加仓 NVDA。中东和印度的 │
│  Sovereign AI 订单将填补..."│
│                         │
│ ▸ AI 解读: Beth 在市场担忧│
│   Hopper 出货放缓时持续看多│
│   关注 Sovereign AI 这条..│
│                         │
│              [查看原推 →] │
└─────────────────────────┘
```

四个设计原则:

1. **质量门槛优先** — 推文必须带数字、推理链、可证伪 claim、比较或风险意识之一。
2. **单条推文是最小单元** — KOL 原话、翻译、TLDR 和原推链接都保留,用户可以 verify。
3. **按内容类型组织** — 大盘 / 行业 / 个股比单纯多空标签更符合阅读心智。
4. **AI 解读不是翻译** — headline 解释为什么这条值得看,TLDR 还原推文论证。

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
3. Daily Digest Pipeline 日报生成管道       [PARTIAL: manual/API, persisted]
4. Delivery Layer        Web + 邮件         [PARTIAL: Web, no email]
5. Stock-Level KOL View  股票级 KOL 视图    [Phase 4 - deferred]
```

### 1. Source Catalog [DONE]

代码配置 `backend/app/features/twitter/kol_config.py`,目前字段 = `username` + `display_name`。后续可加 `category` / 迁移到 DB / Admin UI。

### 2. Ingestion Pipeline [DONE]

代码已实现 `fetch-configured-kols`,每 KOL 拉最新 1 页(~20 条),upsert 去重,run 记录写 `twitter_fetch_runs`。仓库当前没有对应 GitHub Actions workflow,所以是否定时运行取决于外部调度配置。

### 3. Daily Digest Pipeline [Phase 2]

当前通过 `POST /api/twitter-digest/generate` 手动或内部触发,默认将当日结果写入 `kol_daily_digests`。仓库尚未配置每日生成 workflow 和邮件发送。

#### 输入

- 过去 **24-36 小时**的所有 `kol_tweets`(回看窗口比 24 大,catch 跨日讨论)
- 过滤掉互动量极低的 reply(降噪)
- 含原推 + 引用上下文(`quoted_tweet_text`)

#### 单阶段 LLM 流水线

**`curate_tweets`**(1 次 LLM 调用)

- 模型: `gemini-3.1-pro-preview`
- 输入: 全部候选 tweets(作者、时间、正文、引用上下文、URL)+ KOL profile
- 输出 (JSON, schema = `CuratedDigestOutput`):
  ```json
  {
    "takeaway": ["...", "..."],
    "macro_picks": [CuratedTweet, ...],
    "industry_picks": [CuratedTweet, ...],
    "stock_picks": [CuratedTweet, ...]
  }
  ```
- `CuratedTweet` 字段:
  - `tweet_id`、`username`、`display_name`、`text_en` (verbatim)、`text_zh` (翻译)、`created_at`、`tweet_type`、`url`
  - `primary_ticker`: `stock` 类主要 ticker,其他为空字符串
  - `sector`: `industry` 类中文赛道标签,其他为空字符串
  - `category`: `macro` / `industry` / `stock`
  - `interpretation_zh`: headline,说明非显而易见角度
  - `tldr_zh`: 3-5 句中文摘要,保留推文论证结构和关键数字
- 数量:
  - `macro_picks`: 1-3 条(目标),max 4
  - `industry_picks`: 3-6 条(目标),max 8
  - `stock_picks`: 3-6 条(目标),max 10
  - 任何一类允许为空(稀疏日不强凑)

#### Bucket 定义(写在 prompt 里)

- **macro**: 大盘、指数、利率、地缘、关税、跨资产、加密和美股相关性等。
- **industry**: 赛道级判断,包括 AI 算力、半导体、锂电、光通信、加密资产类别等。
- **stock**: 单一 ticker 判断。若推文同时可归多类,优先 `stock > industry > macro`。

不属于以上三类,或缺少结构化论证的内容(纯新闻转发、闲聊、政治、单纯价格反应、无论证加减仓)直接 drop。

#### V2 持久化

新建表 `kol_daily_digests`(Insforge):

```
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
date DATE UNIQUE,                    -- 一天一行
-- legacy column names; application maps them as:
-- bullish_picks -> macro_picks
-- bearish_picks -> industry_picks
-- neutral_analyses -> stock_picks
bullish_picks JSONB,
bearish_picks JSONB,
neutral_analyses JSONB,
takeaway JSONB,
tracked_kols JSONB,                  -- 当日参与的 KOL list (透明度)
generated_at TIMESTAMPTZ,
model_version TEXT,
input_tweet_count INT,
updated_at TIMESTAMPTZ
```

`kol-tweets` edge function 已实现 `upsert_digest`, `get_digest`, `get_latest_digest`,并负责 legacy column alias mapping。

#### 成本估算

每日 1 次完整 pipeline = 1 次 LLM 调用:
- 输入: ~50K tokens(全部 36h tweets + KOL profile)
- 输出: ~5-10K tokens(三类 picks 合计)

当前使用 `gemini-3.1-pro-preview`,成本应按真实 36h tweet 数和输出长度重新测算。早期 flash-lite 成本估算已不再适用。

#### 模块拆分(V1 已实现)

`backend/app/features/twitter_digest/`:

- `models.py`: `CuratedTweet`、`CuratedCategory`(`Literal["macro", "industry", "stock"]`)、`CuratedDigestOutput`、`DailyDigest`
- `prompts.py`: 单个 `CURATE_INSTRUCTION`(描述三 bucket、数量目标、drop 规则)
- `agents.py`: 单个 `LlmAgent`(curate_agent)+ singleton `InMemoryRunner`
- `service.py`: `pull_candidate_tweets()` + `curate_tweets()` + `generate_daily_digest()`
- `router.py`: `POST /api/twitter-digest/generate`, `GET /api/twitter-digest/latest`, `GET /api/twitter-digest/{date}`
- `db.py`: `save_digest()`, `get_latest_digest()`, `get_digest_by_date()`

### 4. Delivery Layer [Phase 3]

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

### 5. Stock-Level KOL View [Phase 4 - deferred]

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

```
kol_tweets (last 36h)
  → curate_tweets (single LLM call)
      → CuratedDigestOutput {takeaway, macro_picks, industry_picks, stock_picks}
  → DailyDigest
  → kol_daily_digests (persist=True by default)
```

目标 cron:每天北京 06:00 工作日触发,失败重试至 07:30 cutoff,07:30 后还失败则跳过当天发邮件 + 告警。仓库当前尚未配置该 workflow。

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
- [ ] Cron 配置: 北京 06:00 (UTC 22:00) 工作日触发 generate;失败重试至 07:30 cutoff
- [ ] 评估集: 手工审 5 天的输出,比对"质量是否达到付费内容标准"

### Phase 3 实施步骤(邮件)

- [ ] 新增 Resend 邮件模板(三个 section、中英对照、移动端友好)
- [ ] 新增 batch send 任务 — 复用现有 `subscription/email_service` 模式,每天 08:00 北京时间
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

## 参考

- Phase 1 数据管道实现见 `backend/app/features/twitter/.context.md`。
- TwitterAPI.io 已有 user timeline 能力在 `backend/app/features/twitter/service.py` 中使用。
- 现有 daily / morning report 邮件模式 `backend/app/features/daily_report/`、`backend/app/features/morning_report/` 可复用 batch send 框架。
- TwitterAPI.io 官方文档提供 `tweet/advanced_search` endpoint,可作为 Phase 5 发现新博主的数据源:[Advanced Search](https://docs.twitterapi.io/api-reference/endpoint/tweet_advanced_search)。
