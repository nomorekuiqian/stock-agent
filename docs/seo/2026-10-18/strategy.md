# TheMarketBrew SEO 策略（2026-10-18 版）

> 数据截至 2026-10-18（美东时间）。GSC 于 2026-10-18 07:37 ET 重新拉取（只读）。关键词量来自 DataForSEO（经 Monid，本次花费 $0.27）。
> 所有数字可追溯到 `keywords_clustered.csv` / `sample_group_tickers.csv` / `gsc/`。查不到的数据一律标注「未知」。

## 0. 现状一句话
有内容、有数据、也有 100 只股票的 sitemap，但 Google 几乎看不到我们：全期非品牌点击约 1 次，/stock 页面只有 2 个有展示（SPCX 8 次展示、平均排名 8.75；AMD 2 次）。直接原因如下（2026-10-18 实测）：
- 个股页 title/H1 只有英文名，NVDA 页面里「英伟达」出现 0 次。中文用户搜的是「英伟达股票」，页面却没有这个词。
- 个股页正文基本是一张数据表重复了两遍，AI 解读要注册才能看，没有 JSON-LD，股息率有 bug（NVDA 显示 12.9%，实际约 0.13%）。
- 唯一有非品牌展示的 /kol/serenity（1,621 次展示）和 /kol/qinbafrank（892 次）目前 307 跳到 /research，等于把仅有的流量入口关掉了。
- 不存在的代码（如 /stock/ZZZZQ）返回 200 且 index（软 404）；llms.txt 跳到 /login。
- /twitter-digest/{date} 正文约 386 字符，/morning/{date} 约 1,122 字符且解读被锁，属于薄内容但仍是 index。

## 1. 北极星指标
**每周非品牌自然点击（GSC，品牌词以外）**，配套 **「有展示的 /stock 页面数」** 作为先行指标。
- 基线：非品牌点击约 1（全期）；有展示的 /stock 页 = 2。
- 4 周目标（这是目标，不是预测）：样本组 70 页里 ≥35 页在 GSC 有展示；非品牌点击 ≥10/周；/kol 两页恢复到下线前的展示水平。
- 护栏：样本组被收录比例 ≥60%（GSC 覆盖率/URL Inspection 抽样）。若 <30%，暂停扩量，先补独特内容。
- 与增长计划对齐：最终看 MRR / WARU。SEO 侧的转化以「自然流量 → 注册」为准，需在 GA/后端给 /stock、/kol、/morning 打上 landing 来源。

## 2. 四大支柱（一个意图对应一个 URL）
| 支柱 | 吃哪些词（美国月量，示例） | 承接 URL | 为什么能赢 |
|---|---|---|---|
| ① 个股页中文化 + 70 只样本组 | 特斯拉股票 27,100；英伟达股票 22,200；spacex 股票 12,100；闪迪股票 2,900；crcl 股票 1,900；「是什么公司」类合计 2,290（sofi 170、nbis 140、rklb 140、crcl 140、oklo 110、mstr 110） | /stock/{T}（#about #why #kol #earnings 等模块） | 头部词很难，但小众/新兴股的中文 SERP 偏弱（前次 SERP 抽样：CoreWeave 为什么跌、pltr 为什么一直跌 等结果多为社媒/视频），而我们有每日 AI 日报和博主观点这类独特素材 |
| ② 时效 Hub（日报/盘前/宏观） | 美股行情 2,900；美股期货 1,300（CPC $11.76）；纳指期货 720；美股盘前 390（CPC $31.15）；美股大跌 480；美债收益率 1,000；vix恐慌指数 590；恐慌贪婪指数 480 | /today、/morning、/macro/* 做成滚动 hub；日期页只做归档 | 页面已经有了，只需要改 title/H1、公开摘要、加 schema，投入最小 |
| ③ KOL 观点（护城河） | GSC 已证明有需求：serenity aleabitoreddit… 135 次展示（排名 8.3），qinbafrank 82 次（排名 3.9）；白毛股神 美国 110/月 | /kol、/kol/{slug}、个股页「博主怎么看」模块 | 中文网络上没有人系统整理推特美股博主的观点。这是 TMB 独有的数据，也最容易被 AI 搜索引用 |
| ④ 常青工具页 + AEO/GEO | 美股开盘时间/開盤時間 1,300；美股休市时间 260 + 2026 版 170；美股财报 110；ai 炒股 210；ai選股（台湾）880，KD 0 | /guide/us-market-hours、/earnings-calendar、/ai-stock-research；llms.txt；JSON-LD | 常青需求，一次做好长期受益；AI 引擎爱引用结构化的事实页 |

> 量的口径：Google Ads 的量是「该国所有语言」的量，且会把简繁体近似词合并（股价=股價，同一个数）。英文 token（tqqq、soxl、1099-b 等）不代表中文需求，已在 CSV 里标为「排除」。美国/加拿大没有 KD（Google Ads 不提供），台湾/新加坡的 KD 来自前次 Labs 调研。

## 3. 我们不做什么（同样重要）
1. **不做荐股**：不出现「必涨」「推荐买入」「十大牛股」「美股推荐 2026」类页面（这类词已在 CSV 标为「排除(YMYL荐股)」）。「还能买吗」这类词只做信息性回答，并配免责声明。
2. 不做开户、券商、税务（TFSA/1099/W-8BEN 等）。这类意图离产品远，YMYL 风险高，标为 P2 暂缓。
3. 不硬抢指数/ETF 行情的头部词（纳斯达克指数 9,900、标普500 8,100、美股 22,200）。这些 SERP 被行情站占据，只靠 /today 自然覆盖。
4. 不批量生成「A vs B」对比页（中文对比词量几乎为 0，例如「英伟达和amd哪个好」只有 10）。
5. 不为「XX 今天为什么跌」每天生成新 URL。统一写进 /stock/{T}#why 滚动模块和 /today hub。
6. 不一次性放出 3,680 只股票的索引。按 50–100 只分批，独特内容不足 40% 的页面 noindex。
7. 不用 Google Indexing API，不买外链，不做英文内容。

## 4. 四周时间表（美东时间）
| 周 | 日期 | 交付（开发 agent） | 交付（内容/运营） | 验收 |
|---|---|---|---|---|
| W1 | 10/19–10/25 | P0-1 技术修复（软 404、/kol 恢复、llms.txt、股息 bug、薄页 noindex）；P0-2 个股页模板 v2（中文 title/H1、JSON-LD、去掉重复表格） | 70 只样本组中文名/别名表定稿；SPCX、/kol/serenity 两份 brief 落地 | dev_handoff 中 P0-1/P0-2 的验收清单全部通过；GSC 提交新 sitemap |
| W2 | 10/26–11/1 | P0-3 第 1 批 50 只独特模块上线（#about #why #kol #earnings FAQ）；P0-4 /kol hub；P0-5 /today、/morning hub 改造 | 「是什么公司」中文简介批量生成 + 人工抽检 10%；财报季（10 月底大型科技股集中发财报）用 /stock#earnings 承接 | 第 1 批独特内容占比 ≥40%；IndexNow 推送 |
| W3 | 11/2–11/8 | P1：/guide/us-market-hours、/earnings-calendar、宏观页 title/schema；第 2 批 20 只 | GEO 20 问测试第 1 轮（基线） | 第 1 批收录率抽查；有展示的 /stock 页数 |
| W4 | 11/9–11/15 | P1：/ai-stock-research 落地页；按 GSC 数据调整 title | 复盘：样本组 vs 对照组（sitemap 中未升级的 57 只） | 决定是扩到下一批 100 只，还是继续修内容 |

## 5. GSC 例行（每周一、周四，美东上午）
运行：`cd /workspace/tmb-growth/gsc && .venv/bin/python pull_gsc.py --no-inspect`（只读；密钥放在环境变量里，绝不打印）。
- **周一（周度复盘，约 20 分钟）**
  1. 北极星：上周非品牌点击、有展示的 /stock 页数、样本组 vs 对照组的展示/点击。
  2. 触达距离词：平均排名 5–20 且展示 ≥50 → 进待办，改 title/H1/首段/FAQ。
  3. 新出现的查询：按意图簇归类，写入 research_log（30 天内不重复付费查词）。
  4. 被替代的 URL（同一个词出现多个 URL）→ 合并或 canonical。
- **周四（健康检查，约 10 分钟）**
  1. 覆盖率：样本组 URL Inspection 抽 10 个（可去掉 `--no-inspect` 运行，但会消耗配额）。
  2. 软 404/重定向/5xx 异常；sitemap lastmod 是否真实更新。
  3. AI 代理式查询（如「今天neon的市场表现，为什么跌」）→ 对应的个股 #why 模块是否存在。
- 关键词研究：只查 30 天内没查过的词（先看 research_log.csv）；每次付费前先估算，单次 ≤$0.10。

## 6. AEO / GEO
- 每个页面首屏放一段 40–80 字的「直接答案」（例如 SPCX 页：「SPCX 是 SpaceX（太空探索技术公司）在美股的交易代码……」），数字全部来自数据层并标注更新时间。
- JSON-LD：个股页用 Corporation（tickerSymbol）+ BreadcrumbList + FAQPage（只为语义，不指望出富结果）；报告页保留 Article。**不用 Product/Review。**
- llms.txt 公开（200），列出 /stock hub、/kol、/today、/morning、/macro 和样本组 URL。robots 允许 GPTBot、PerplexityBot、ClaudeBot、Google-Extended。
- Bing 用 IndexNow（ChatGPT 搜索依赖 Bing 索引）。
- GEO 20 问测试：W3 做基线，之后每两周一次。问题示例：「CoreWeave 是什么公司」「SPCX 股票是什么」「白毛股神 serenity 最新观点」「美股盘前怎么看」，在 ChatGPT/Perplexity/Google AI Overview 中记录是否引用 TMB。

## 7. 风险与未知
- 加拿大的 Google Ads 量相对美国偏高（特斯拉股票 CA 12,100 vs US 27,100）。Google Ads 是区间化的量，以后要用 GSC 实际展示校准，不要拿来当绝对值。
- 美国/加拿大的 KD：未知。难度判断依据前次 SERP 抽样，属于推断。
- 57 只在 sitemap 但不在样本组的股票（HII、TDG、GPN 等）：中文需求「未知（本次未调研）」，不代表 0。
- 繁体市场（台湾「輝達股價」673,000，KD 42）量很大，但需要单独的 zh-Hant 页面才可能有排名。放 P2，等简体样本组验证有效后再做。
