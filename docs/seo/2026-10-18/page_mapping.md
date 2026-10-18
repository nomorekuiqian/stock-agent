# TheMarketBrew：20 个关键词 → 现有页面映射与逐页改造规格（2026-10-18）

> 角色：只做 SEO 策略，不改仓库、不开 PR。本文件交给开发 agent 实施。
> 现状实测：2026-10-18 08:50–09:30（美东时间，ET），用 Googlebot UA 抓取线上页面，原始 HTML 和解析结果在 `live_2026-10-18/`（`live_summary.json`、`page_*.html`、`sm_*.xml`）。
> GSC：`/workspace/tmb-growth/gsc/`，数据区间 2026-01-07 ~ 2026-10-16，下文"展示/排名"都是全期累计值。
> 关键词与 SERP：`best_keywords/best_keywords.md`、`scoring.csv`（入选Top20 = 是）、`serp_raw/`。
> 仓库：github.com/nomorekuiqian/stock-agent。**注意：默认分支 master 的最后一次提交是 2026-08-10，线上已经比它新**（例如日报 URL 已经从 uuid 改成 `/today/2026-10-16-market-report`，/kol 现在 307 到 /research）。所以文中的仓库路径只用来判断"已有哪些数据和接口"，路由和模板的实际情况以线上为准。
> 原则：数字只来自数据层，用 `{占位符}` 表示；查不到的写"未知"；不荐股、不写"必涨"；每页都放免责声明。

---

## 0. 一屏结论

- **20 个词由 15 个 URL 承接。其中 14 个是现有页（4 个微调、10 个改造），新建页只有 1 个：`/guide/us-market-hours`。**
  - 原计划里的 `/ai-stock-research` 不建，改由首页承接（首页已经在「美股研报」上排第 8）。
  - `/earnings-calendar` 暂不建，用 `/stock/{T}#earnings` 加上 /today 已有的「近期事件」承接，触发条件见 §4。
- **最大的发现：Google 能看到的正文太少。** 4 个目标页的服务端 HTML 几乎没有正文（/macro/sentiment 65 个汉字，/twitter-digest 7 个，/kol/* 跳到 noindex 的 /research），仓库里这些页面也都是 `'use client'` 渲染。只改 title 没用，核心是把摘要放进服务端渲染（SSR）的 HTML。
- **ROI 最高的 3 处改动：**
  1. **恢复 /kol/serenity 和 /kol/qinbafrank，做成 SSR 公开页。** 这是全站唯一有规模的非品牌展示：分别 1,621 次（排名 8.16）和 892 次（排名 4.81）。**今天实测仍然 307 → /research（noindex），问题没修。**
  2. **个股页模板 v2：中文名、首屏答案、#why/#kol/#earnings。** 一次改动覆盖 8 个词（CRWV/SOFI/NBIS/SMR 是什么公司、PLTR/CoreWeave 为什么跌、博主怎么看英伟达、谷歌财报）。同时把 CRWV/SOFI/NBIS/SMR 加进 sitemap 和 /stock hub（今天实测都不在 sitemap 里；GSC URL Inspection 显示 NVDA、PLTR、CRWV 都是"Google 无法识别此网址"）。
  3. **/today 和 /morning 加固定 H1 和首屏答案块。** 这两页已经有 1,315 次和 1,067 次展示（排名 7–8），正文内容充足（/today 约 5,300 个汉字），缺的只是"美股今天为什么跌""美股盘前"这些词和一段 40–80 字的直接答案。改动量是 S，收益来得最快。

### 0.1 今天实测的现状（相对 dev_handoff 有变化的地方加粗）
| 项 | 2026-10-18 实测 | 状态 |
|---|---|---|
| /kol、/kol/serenity、/kol/qinbafrank、/kol/qinbafrank/latest、/sectors | 307 → /research（200，`noindex, follow`，canonical=/research，正文 16 个汉字） | **未修** |
| /llms.txt | 307 → /login | 未修 |
| /stock/ZZZZQ（不存在的代码） | 200 + `index, follow`（软 404） | 未修 |
| /liquidity（旧 URL，GSC 有 39+13 次展示） | 307 → /login | **新发现**：应 301 → /macro/liquidity |
| 股息率 bug | 首屏卡片 NVDA 12.9%、**GOOGL 24.3%、MSFT 67.5%**；同一页概览区显示 0.13% / 0.24% / 0.67%（正确值） | 未修。只有首屏卡片多乘了 100（仓库参考：`OverviewTab.tsx` 第 447 和 557 行的 MetricCard 用 `toFixed(2)%`，第 280 行用 `fmtPct`，两处口径不一致） |
| 个股页中文名 | NVDA 页 HTML 里"英伟达"出现 0 次；title 形如 `NVIDIA Corporation (NVDA) 个股分析`；H1 渲染了两遍 | 未修（仓库 `generateMetadata` 已支持 `company_name_zh`，但线上为空） |
| 个股页 sitemap | stock-0.xml 共 100 条，lastmod 全部是 2026-10-17；**CRWV、SOFI、NBIS、SMR、SPCX 不在里面** | 未修 |
| 个股页 JSON-LD | 无 | 未修 |
| /today、/today/{date} | hub 有 2 个 H1，都是当天的新闻标题，没有 JSON-LD；日期页有 Article+WebPage JSON-LD（**但同一份重复输出了 2 次**）；日期页 4,703 个汉字 | 部分 |
| /morning、/morning/{date} | hub H1「盘前早报」重复 2 次，874 个汉字；日期页**没有 H1**，442 个汉字，「期货走势解读」「全球市场解读」都是"登录后解锁" | 未修 |
| /twitter-digest、/{date}、/archive | SSR 只有"加载中..."（7 / 206 / 13 个汉字），没有 H1，却是 index，121 个日期页在 sitemap 里 | 薄页，未修 |
| /macro/sentiment | SSR 只有 65 个汉字，没有数值（客户端渲染） | 未修 |
| /macro/liquidity | SSR 494 个汉字，**已有每周分析，含 WALCL/TGA/RRP/净流动性数值**；title 没有品牌；H1「流动性环境」 | 可直接微调 |
| www / 非 www | `themarketbrew.com/*` 308 → www | **已修**（GSC 里还残留非 www 的展示，属于历史数据） |
| 旧 uuid 日期页 | `/today/571ba2e3-…` 308 → `/today/2026-06-05-market-report` | **已修**（GSC 展示最高的日期页，1,252 次，已经承接到新 URL） |
| robots.txt | `Allow: /`，`Disallow: /api/` | 正常 |

---

## 1. 映射总表（20 个词）

决策分类：**微调现有页** = 只改 title/meta/H1/答案块/FAQ/schema，模板结构不变；**改造现有页** = URL 不变，但要改渲染方式（SSR）或加数据模块；**必须新建** = 站内没有能承接的页面。

| # | 关键词（美/加月量，CPC） | 承接 URL | 决策 | 依据（现状 + GSC） |
|---|---|---|---|---|
| 1 | 白毛股神（110/10） | /kol/serenity | 改造现有页 | GSC 1,621 次展示，排名 8.16，有收录记录（URL Inspection：已编入索引，最后抓取 2026-07-28）。现在 307 到 noindex 页面；仓库里是 client 渲染 |
| 2 | serenity aleabitoreddit 最新（GSC 词簇） | /kol/serenity | 同上（同一个 Page Owner） | 33 个查询共 397 次展示，排名 8.6，0 点击；高频修饰词：最新、瓶颈、供应链、涨价、短缺、概念股、2026年9月 |
| 3 | qinbafrank（10/未知） | /kol/qinbafrank | 改造现有页 | 892 次展示，排名 4.81，4 次点击；「qinbafrank」81 次展示，排名 3.84；「from:qinbafrank」排名 2.75；现在 307 |
| 4 | 美股博主怎么看英伟达（未知） | /stock/NVDA（新增 #kol 模块） | 改造现有页 | NVDA 页 200，但没有任何 KOL 内容；后端已有 `/twitter/ticker-discussion?symbol=`（含中文摘要）和 twitter_digest 的 `ticker_theses` |
| 5 | 美股盘前分析（40/10，$24.30） | /morning | 微调现有页 | 1,067 次展示，排名 7.21，7 次点击；「盘前赢家」排名 8；SERP 前排都是科普，和"今日分析"意图错配 |
| 6 | 美股盘前（390/90，$31.15） | /morning | 同上 | 「美股 盘前」1 次展示，排名 42；「每日盘前速递」排名 6 |
| 7 | 美股大跌原因（90/30） | /today | 微调现有页 | 1,315 次展示，排名 8.22；日期页本身就有完整的归因段落（10/16 日报："AI 基建信贷偿付担忧……纳指跌 2.15%"） |
| 8 | 美股今天为什么跌（20/10） | /today | 同上 | GSC 出现 AI 代理式问法「今天neon的市场表现，为什么跌」（13 次展示，落在 /macro，排名 6.6） |
| 9 | 谷歌财报（260/40） | /stock/GOOGL（新增 #earnings 模块，公开） | 改造现有页 | 页面有"财报"Tab，但服务端 HTML 里只有季度表；后端有 `/stocks/{s}/earnings-data`、`/transcript`、`EventCalendarCard`（earningsDate、EPS 预期）。SERP 前 10 没有一条中文解读 |
| 10 | 美股 AI 研报（未知；「美股研报」10/10） | / 首页 | 微调现有页 | 「美股研报」首页 5 次展示，排名 8；首页 H1「你的 AI 投研团队」，title 里没有"研报" |
| 11 | crwv 是什么公司（70/20） | /stock/CRWV（#about） | 改造现有页 | 200，704 个汉字，title 用英文全称；不在 sitemap 里；GSC：Google 无法识别此网址 |
| 12 | CoreWeave为什么跌（未知） | /stock/CRWV（#why） | 同上 | 10/16 日报的头条就是 CoreWeave 债务偿付担忧；实测页面显示 −11.91%（抓取时的报价） |
| 13 | sofi 是什么公司（170/40） | /stock/SOFI（#about） | 改造现有页 | 200，不在 sitemap 里，0 展示 |
| 14 | nbis 是什么公司（140/30） | /stock/NBIS（#about） | 改造现有页 | 同上 |
| 15 | smr 是什么公司（90/10） | /stock/SMR（#about + 消歧） | 改造现有页 | 同上；同板块链接给的是军工股（BA/LMT…），分类不对 |
| 16 | pltr为什么一直跌（未知） | /stock/PLTR（#why） | 改造现有页 | 在 sitemap 里，但 GSC 显示"无法识别"；实测页面 −7.22% |
| 17 | 恐慌贪婪指数（480/170，$21.84） | /macro/sentiment | 改造现有页 | 200，但 SSR 只有 65 个汉字，没有数值；GSC 0 展示；「美股恐慌指数」落在 /macro，排名 52 |
| 18 | 美联储资产负债表（70/10） | /macro/liquidity | 微调现有页 | 490 次展示，排名 7.98；「流动性状况」排名 4.75；正文里已经有 WALCL/TGA/RRP 的数值和解读 |
| 19 | 美股休市时间2026（170/170） | /guide/us-market-hours | **必须新建** | 站内没有任何交易时间或休市内容；/macro、/today 都放不下这个常青意图 |
| 20 | 美股开盘时间（1,300/390，$7.80） | /guide/us-market-hours | 同上 | 同一个 Page Owner；有 AIO，零点击风险高，作为副词 |

**统计**：承接 URL 共 15 个，其中现有页 14 个（微调 4 个：/、/today、/morning、/macro/liquidity；改造 10 个：/kol/serenity、/kol/qinbafrank、/macro/sentiment、/stock/NVDA、CRWV、SOFI、NBIS、SMR、PLTR、GOOGL），新建 1 个。
另外有 3 个连带页面，不算进 20 词，但做了能互相增强：/stock/MSFT、/stock/AMZN（微软、亚马逊财报，与 #earnings 同模板）、/twitter-digest（802 次展示，SSR 是空的）。

---

## 2. 共用规则（所有页面都适用，后面不再重复）

1. **SSR 硬性要求**：title、meta、H1、首屏答案块、FAQ、JSON-LD、公开模块正文都要出现在**初始 HTML** 里。验收方法：`curl -A "Googlebot"` 抓取，去掉 script/style 后统计汉字数，必须达到各页列出的下限。现在 /kol、/macro/sentiment、/twitter-digest 都是 client 渲染，不达标。
2. **H1 只输出一次**。现在 /stock、/today、/morning 的 H1 和整块正文都重复渲染了两遍（看起来是桌面和移动端各一份 DOM）。改成 CSS 响应式，只输出一份 DOM。
3. **首屏答案块**（40–80 个汉字。只数汉字，英文名、代码、数字和占位符不计；渲染后的总字符数不超过约 140 个）：用 `<p class="answer" data-updated="{ISO}">` 包起来，紧跟在 H1 后面。句子里的数字全部用模板变量渲染。某个变量为空时，整句删掉，不能显示 0、NaN 或"--"。
4. **"更新时间"**：每个模块都写 `数据更新：{YYYY-MM-DD HH:mm} ET · 来源：{source}`。
5. **免责声明**（首屏下方放短版，页脚放完整版，沿用 dev_handoff 的模板）：
   > 本页内容由 TheMarketBrew 基于公开数据与 AI 生成，仅供研究与信息参考，不构成任何投资建议或买卖推荐。美股投资有风险，请独立判断。数据更新时间：{updated_at_ET}。
   KOL 相关模块另外加一句：「观点来自博主公开发言，仅代表其本人，TheMarketBrew 只做整理，不构成推荐。」
6. **禁用词**（title、H1、正文、FAQ 都要扫）：必涨、推荐买入、稳赚、保证收益、喊单、目标价必达、抄底、闭眼买、翻倍。FAQ 里不能出现「值得买吗」「能涨到多少」。
7. **JSON-LD** 输出一次（日期页现在输出了两次，要去重），内容与页面可见内容一致；禁止使用 Product、Review、AggregateRating、Offer。
8. **lastmod** 只在内容真正变化时更新（现在 static 和 stock 的 sitemap 全部是 2026-10-17，看起来像每天整体刷新）。
9. **公开和 Pro 的分界**：公开部分 = 事实、数据、结论第一段、观点摘要（一句话）；Pro/Max 部分 = 全文解读、论据展开、原文证据链、AI 对话。锁定的内容用 `isAccessibleForFree: false` 加 `hasPart` 标注（paywalled content 规范）。

---

## 3. 逐页规格

### 3.1 /kol/serenity — 白毛股神 · serenity aleabitoreddit 最新（改造，L）

**现状**：307 → /research（noindex，正文 16 个汉字）。GSC 全期 1,621 次展示，排名 8.16，0 点击。仓库 master 里 `/kol/serenity` 会 `redirect('/kol/aleabitoreddit')`，`[username]` 布局和页面都是 `'use client'`，SSR 拿不到正文。
**路由决定**：**`/kol/serenity` 返回 200 并作为 canonical**（GSC 的历史信号都积累在这个 URL 上）；反过来让 `/kol/aleabitoreddit` 301 → `/kol/serenity`。子页（/latest、/stocks 等）如果需要付费墙，对匿名用户返回 200 + 公开 teaser + `noindex,follow`，不要再 307。

| 字段 | 规格 |
|---|---|
| Title | `白毛股神 Serenity（@aleabitoreddit）最新观点：瓶颈理论与提及个股｜TheMarketBrew` |
| Meta description | `追踪白毛股神 Serenity（X：@aleabitoreddit）最新推文观点：AI 供应链瓶颈、涨价与短缺主题、近 30 天提及个股排行，每日更新，附原帖链接。仅供研究参考。` |
| H1 | `白毛股神 Serenity（@aleabitoreddit）最新观点追踪` |
| 首屏答案块（样例） | `Serenity（X 账号 @aleabitoreddit，中文圈常称"白毛股神"）是在 X 上公开讨论美股的博主，常用"瓶颈理论"分析 AI 供应链里的短缺环节。截至 {date}，近 7 天主要在谈 {top_themes_3}，提及最多的是 {top_tickers_3}。` |

**模块（按顺序）**
1. 答案块 + `数据更新：{date} ET · 共追踪 {n_posts_30d} 条公开推文`。
2. **本周观点摘要**（公开，150–250 字，由 LLM 根据最近 7 天推文生成，见 §5.4）。
3. **近 30 天观点时间线**（公开前 10 条，每条 = 日期 + 主题标签 + 一句中文摘要（≤60 字）+ 原帖链接）。第 11 条以后和完整论据锁给 Max。
4. **提及个股排行**（公开）：代码 + 中文名 + 提及次数 + 最近一次的观点方向（偏多/偏空/中性）+ 链接到 `/stock/{T}#kol`。数据来自 cockpit `personas/{username}/tickers`（已有提及次数和价格）。
5. **核心框架：什么是"瓶颈理论"**（常青段落，200–300 字，人工审一次后固定；只描述框架本身，不评价对错）。
6. FAQ（下方）。
7. Max 区（锁定）：高确信度清单、产业链视图、AI 对话。保留现有的付费功能，只是不再整页跳走。

**FAQ（来自 GSC 和 SERP 的真实问法）**
- 白毛股神是谁？Serenity 的 X 账号是什么？
- Serenity（aleabitoreddit）最新观点是什么？（答案引用本周摘要第一句和日期）
- 什么是 Serenity 的"瓶颈理论"？
- Serenity 最近提到了哪些股票？（列出排行前 5，**不用"推荐"二字**）
- TheMarketBrew 的 Serenity 观点多久更新一次？
- ⚠️ GSC 里出现过「概念股 喊单」「推荐」这类查询，**不做对应的 FAQ**，只在页面声明里写"不构成推荐"。

**JSON-LD**：`ProfilePage`（dateModified）+ `mainEntity: Person`（name: "Serenity"，alternateName: ["白毛股神","aleabitoreddit"]，sameAs: ["https://x.com/aleabitoreddit"]）+ `BreadcrumbList`（首页 › 博主观点 › 白毛股神 Serenity）+ `FAQPage`。
**内链**：入链来自首页（"用博主视角看待市场"卡片目前只是文字，改成链接）、/kol hub、/twitter-digest、每个被提及个股页的 #kol 模块、导航栏"KOL 日报"旁边；出链去提及个股 `/stock/{T}#kol`（前 10）、/kol/qinbafrank、/twitter-digest。
**sitemap**：新建 `sitemaps/kol-0.xml`（/kol、/kol/serenity、/kol/qinbafrank），加入 sitemap index；lastmod = 最新一条已收录推文的时间。
**更新频率**：时间线每 4 小时一次（与推文抓取频率一致；仓库里 zsxq 有 4h 节奏，KOL 抓取的实际频率**未知**，以后端为准）；本周摘要每天 1 次（ET 07:00）。
**SSR 下限**：≥800 个汉字。

### 3.2 /kol/qinbafrank — qinbafrank（改造，M，与 3.1 共用模板）

**现状**：307。GSC 892 次展示，排名 4.81，4 次点击。仓库里根页面渲染的是 `QinbafrankMaxLandingClient`（Max 销售页）。子页 /latest（64 次展示）、/highlights（22）、/sectors（21）、/stocks（8）也有展示，但都锁给 Max。

| 字段 | 规格 |
|---|---|
| Title | `qinbafrank 最新观点：美股、宏观与板块观点追踪（@qinbafrank）｜TheMarketBrew` |
| Meta | `整理 qinbafrank（X：@qinbafrank）每日公开推文：最新美股与宏观观点、板块看法、近 30 天提及个股，附原帖链接，每日更新。仅供研究参考。` |
| H1 | `qinbafrank 最新观点追踪` |
| 答案块样例 | `qinbafrank（X：@qinbafrank）是用中文在 X 上分享美股与宏观观点的博主。截至 {date}，他近 7 天主要讨论 {top_topics_3}，提及最多的标的是 {top_tickers_3}；以下为按日期整理的观点摘要和原帖链接。` |

> ⚠️ "他"这个代称需要确认，不确定就改成"该博主"。

**模块**：和 3.1 一样（答案块 → 本周摘要 → 时间线前 10 条 → **板块观点摘要**（复用 /sectors 的数据，每个板块公开一句结论，展开锁定）→ 提及个股 → FAQ → Max 区，保留销售文案但下移）。
**FAQ**：qinbafrank 是谁？/ qinbafrank 最近怎么看美股？/ qinbafrank 最近怎么看 AI 板块？（GSC：「美股ai板块每日分析」落在 /sectors，排名 6.33）/ qinbafrank 最近提到哪些股票？/ 在哪里看 qinbafrank 的原帖？
**子页**：/latest、/highlights、/sectors、/stocks 对匿名用户返回 200 + teaser + `noindex,follow`，页面里链回根页。不 301，Max 用户还要用这些页面。
**JSON-LD、内链、sitemap、更新频率**：同 3.1。
⚠️ GSC 里有大量「加密货币 xxx 实时行情」「币对 xxx 看多事件」查询落在这个页面（意图错配，加密也不在 TMB 的覆盖范围内），**不做针对性优化**。

### 3.3 /morning — 美股盘前分析 · 美股盘前（微调，S–M）

**现状**：title「盘前早报 | TheMarketBrew」；H1「盘前早报」重复 2 次；SSR 874 个汉字；公开的有期货数据和"三个要点"（都是机械罗列涨跌幅），"期货走势解读"和"全球市场解读"锁定；没有 JSON-LD。10/16 早报的生成时间是 13:00:50Z = **09:00 ET**。日期页没有 H1，442 个汉字。

| 字段 | 规格 |
|---|---|
| Title | `美股盘前分析：今日美股期货、隔夜要闻与盘前异动（每日更新）｜TheMarketBrew` |
| Meta | `每个交易日美东早上更新的美股盘前分析：标普/纳指/道指期货、VIX、美债与原油，隔夜要闻与今日关注事件，AI 中文解读。仅供研究参考。` |
| H1（固定） | `美股盘前分析（每日更新）` |
| H2（当天） | `{date} 盘前：{当天标题}`，例如 `2026-10-16 盘前：沃什讲话缓解加息忧虑，期指分化科技独弱` |
| 答案块样例（用 10/16 已发布的数据回填） | `2026-10-16 美股盘前：标普 500 期货 +0.15%、纳指期货 −0.23%、道指期货 +0.14%，VIX 15.98。隔夜主线是沃什讲话缓解加息忧虑，科技股期货相对偏弱。`（模板：`{date} 美股盘前：标普 500 期货 {es_chg}、纳指期货 {nq_chg}、道指期货 {ym_chg}，VIX {vix}。隔夜主线是{theme_1}。`） |

**公开 / 锁定调整**
- **公开**："期货走势解读"的第一段（150–250 字）+ 「今日关注」列表（财报、经济数据、美联储讲话，可以复用日报 `calendar` 的同类字段）。这样日期页的公开正文能达到 ≥300 字（dev_handoff P0-1 #8）。
- **锁定**："全球市场解读"全文、个股异动深度解读、邮件推送。
- 把"三个要点"从罗列涨跌幅改成**事件型要点**（见 §5.2 的 prompt）。

**固定说明区**（常青，放在页面底部，约 150 字，同时承接"美股盘前"的科普意图）：盘前交易时段是美东 4:00–9:30（不同券商开放时间不同）；本页每个交易日约 09:00 ET 更新；覆盖哪些指标；链接到 `/guide/us-market-hours`。
**FAQ**：今天美股盘前怎么看？/ 美股盘前交易时间是几点（北京时间）？/ 美股期货和盘前股价有什么区别？/ 本页几点更新？
**JSON-LD**：`WebPage`（dateModified = 当天早报的生成时间）+ `hasPart: Article`（当天早报的 headline、datePublished）+ `BreadcrumbList` + `FAQPage`。日期页保留现有的 Article（去重），补上 H1 = 当天标题。
**内链**：出链到当日 /today（前一天收盘）、/guide/us-market-hours、早报里提到的个股 `/stock/{T}`（自动识别代码和中文名）、/macro/sentiment（VIX）；入链来自首页、/today、/guide/us-market-hours。
**sitemap**：/morning 的 lastmod = 当天早报的生成时间；日期页在公开正文 ≥300 字以后才保留 index。
**更新频率**：每个交易日 1 次（现在约 09:00 ET）。建议提前到 08:00 ET 前，和"每日盘前分析"的搜索时段对齐。这只是建议，搜索时段的分布**未知**。

### 3.4 /today — 美股大跌原因 · 美股今天为什么跌（微调，S–M）

**现状**：title「美股每日报告 - AI 智能市场分析 | TheMarketBrew」；H1 是当天新闻标题，重复 2 次；SSR 5,340 个汉字（内容质量足够）；hub 没有 JSON-LD；有「近期事件」模块（10/16 列出了 NFLX 10/20、META 10/21、TSLA 10/21、FOMC 10/28、MSFT 10/28）；日报生成时间 22:00Z = **18:00 ET**。

| 字段 | 规格 |
|---|---|
| Title | `美股今天为什么涨跌？今日收盘复盘与大跌原因（每日更新）｜TheMarketBrew` |
| Meta | `每个交易日收盘后更新：美股今天为什么涨/跌、三大指数与 VIX 表现、主要驱动事件与后续关注，AI 中文复盘，附历史归档。仅供研究参考。` |
| H1（固定） | `美股今天为什么涨跌：每日收盘复盘` |
| H2（当天） | `{date} 收盘：{当天标题}` |
| 答案块样例（用 10/16 日报回填） | `美股 10 月 16 日收盘：纳指跌 2.15%、标普 500 跌 1.09%。主要原因是 AI 基建债务与资本开支回报担忧从 CoreWeave 等算力服务商扩散到芯片和云软件板块，同时油价重上 100 美元推升通胀担忧。` |
| 非交易日 | `美股 {weekday}（{date}）休市。最近一个交易日 {last_date}：{last_answer}`。休市日期取自 §3.15 的休市表 |

**模块调整**
- 在答案块下方新增**「美股为什么涨跌：近 10 个交易日时间线」**：每条 = 日期 + 纳指/标普涨跌幅 + 一句原因 + 链接到 `/today/{date}-market-report`。这样"美股大跌原因"能拿到"这一次"和"最近几次"两层答案。
- **个股自动内链**：日报正文里出现的公司（中文名、英文名、代码）自动链接到 `/stock/{T}`。例如 10/16 日报提到 CoreWeave、奈飞，现在只有 calendar 里的 4 个代码带链接。这是 CRWV 等页面获得入链、被 Google 发现的主要途径。
- 「近期事件」里的财报条目链接到 `/stock/{T}#earnings`（现在链到 `/stock/{T}`）。
- 保留「往期报告」，只显示最近 7 天，其余放进 archive（/today/archive 的 SSR 只有 26 个汉字，也要补上列表的 SSR）。

**FAQ**：美股今天为什么跌？/ 美股今天为什么涨？/ 最近美股大跌的原因是什么？（链到时间线）/ 美股几点收盘、日报几点更新？/ VIX 恐慌指数今天是多少？（链到 /macro/sentiment）
**JSON-LD**：`WebPage` + `hasPart: Article`（当天日报）+ `BreadcrumbList` + `FAQPage`。日期页的 JSON-LD 去重。
**内链**：出链到当日 /morning、提到的个股、`/macro/sentiment`、`/macro/liquidity`、`/kol/*`（如果当天推特简报有热门标的）；入链来自首页、/morning、所有个股页的 #why（"当日复盘"链接）。
**sitemap**：/today 的 lastmod = 当天日报的生成时间（日期页已经有真实 lastmod，保持不变）。
**更新频率**：每个交易日 18:00 ET；时间线随日报更新。

### 3.5 / 首页 — 美股 AI 研报（微调，S）

**现状**：title「TheMarketBrew - AI 美股分析平台」；H1「你的 AI 投研团队」；1,405 个汉字；JSON-LD 有 Organization + WebSite；首页只有 9 个内链（没有链到 /kol、个股样本、/macro/sentiment）。GSC：「美股研报」排名 8，「美股研究室」排名 12，「美股日报」排名 10。

| 字段 | 规格 |
|---|---|
| Title | `TheMarketBrew：中文 AI 美股研报、每日美股日报与博主观点` |
| Meta | `面向华人投资者的中文 AI 美股研究平台：AI 个股研报、每日盘前早报与收盘复盘、推特美股博主观点追踪、宏观仪表盘。免费版可看每日日报。` |
| H1 | `中文 AI 美股研报与每日美股日报`（「你的 AI 投研团队」降为副标题） |
| 答案块（真实信息，来自 /pricing 和首页现有文案） | `TheMarketBrew 是面向华人投资者的中文 AI 美股研究网站：每个交易日生成盘前早报和收盘复盘，追踪 qinbafrank、Serenity 等推特博主观点，并提供 AI 个股研报与宏观仪表盘。免费版可看每日市场日报。` |

**新增模块**："今天的研报"板块，SSR 输出当天 /today 和 /morning 的标题与答案块各 1 条、热门个股样本 10 个（链接 + 中文名）、2 个 KOL 页链接。这块同时就是首页给 /stock 样本组和 /kol 提供的入链。
**FAQ（3–4 条）**：有没有中文的 AI 美股研报网站？/ TheMarketBrew 免费版包含什么？（直接用 /pricing 的原文）/ AI 生成的研报准确吗，数据从哪来？（链到 /about 和数据来源说明）
**JSON-LD**：保留 Organization + WebSite，补 `sameAs`（X 账号）、`SearchAction`（站内个股搜索，前提是有搜索 URL；**没有就不加**）。
**不做**：不新建 `/ai-stock-research`。等首页在「美股 AI 研报」类词上稳定进前 5、需要单独承接"ai 炒股/ai 选股"时再评估（这两个词不在本次 20 词内）。

### 3.6–3.12 /stock/{T} 模板 v2 + 7 个目标页（改造，M–L）

**模板层（所有样本组个股页共用，沿用 dev_handoff P0-2/P0-3，这里只补充和 20 个词直接相关的部分）**
- 数据源：中文名优先读 `profile.company_name_zh`（仓库的 `generateMetadata` 已经支持，线上为空，需要把字段补全），后备读 `frontend/src/lib/stock-names.ts`（130 条，**没有 CRWV、SOFI、NBIS、SMR、SPCX**，要补）。
- 首屏顺序：H1 → 别名行 → **答案块** → 报价卡（修好股息率）→ **#why**（如有）→ **#kol**（如有）→ **#earnings** → **#about** → 现有数据表（保留一份）→ FAQ → 同板块。
- **公开 / 锁定**：#about、#why、#kol 摘要、#earnings 的数字和第一段解读全部公开；"AI 深度个股分析"全文、技术面解读、AI 对话保留给 Max。
- JSON-LD：`WebPage` + `Corporation`（tickerSymbol，例如 "NASDAQ: CRWV"）+ `BreadcrumbList` + `FAQPage`；#why 和 #earnings 有内容时，在 WebPage 的 `hasPart` 里加 `Article`（headline 用模块标题，dateModified 用最新事件日期）。
- **同板块修正**：SMR 现在链到 BA/LMT/NOC 等军工股，应改成核电和电力主题（如 OKLO、CEG、VST，**只链样本组里已有页面的**）；CRWV、NBIS 现在链到半导体，应改成 AI 云/算力主题（NBIS↔CRWV 互链，再链 NVDA、ORCL）。依据是行业分类或主题表，不按 FMP 的 sector 粗分。
- sitemap：CRWV、SOFI、NBIS、SMR 加进 stock-0.xml；lastmod = max(#why 最新事件日期, #kol 最新观点日期, #earnings 更新日期, #about 审核日期)，**不用每天的报价时间**。
- 内链入口：/stock hub 新增「AI 算力与云」「核电与能源」「金融科技」分组（现有的 hub 分组没有这几只），加上 §3.4 的日报自动内链。

#### 3.6 /stock/CRWV — crwv 是什么公司 + CoreWeave为什么跌
| 字段 | 规格 |
|---|---|
| Title | `CoreWeave(CRWV)是什么公司？最近为什么跌｜股价与AI解读｜TheMarketBrew` |
| Meta | `CoreWeave（代码 CRWV）是专注 GPU 算力的 AI 云服务商。查看最新股价、近期涨跌原因时间线、博主观点与财报日期，AI 每日更新。仅供研究参考。` |
| H1 | `CoreWeave（CRWV）是什么公司？最近为什么跌？` |
| 别名行 | `又称：CoreWeave / CRWV / 科威（**别名需要确认，查不到可靠来源就删掉**）` |
| 答案块样例 | `CoreWeave（CRWV）是专注 GPU 算力租赁的 AI 云服务商，2025 年 3 月在纳斯达克上市，主要为 AI 模型训练和推理提供算力。截至 {date} 收盘报 {price} 美元（{chg}）；近期波动主要与{why_latest_short}有关。` |
| #about（150–300 字） | 业务（GPU 云基础设施）；客户集中度（按 10-K 披露的大客户占比写，**数字由数据层提供**）；主要竞争对手（链到 NBIS、ORCL、AMZN 等页面）；所属主题：AI 算力 |
| #why 样例 | `10/16（{chg_1016}）：TMB 日报指出，市场对 CoreWeave 等新型算力服务商的高额债务偿付与 AI 变现周期错配的担忧升温，抛售扩散至芯片与云软件板块。→ 查看当日复盘` |
| FAQ | CoreWeave 是什么公司？/ CRWV 是哪家公司的股票代码，在哪上市？/ CoreWeave 最近为什么跌？/ CoreWeave 的主要客户是谁？/ CoreWeave 下一次财报是什么时候？/ 投资 CoreWeave 需要关注哪些风险？（债务、客户集中度，只写事实） |

#### 3.7 /stock/SOFI — sofi 是什么公司
- Title：`SoFi(SOFI)是什么公司？股价、业务与财报解读｜TheMarketBrew`
- H1：`SoFi Technologies（SOFI）是什么公司？`
- 答案块样例：`SoFi Technologies（SOFI）是美国的线上金融服务公司，提供个人贷款、学生贷款再融资、银行储蓄和投资服务，并通过旗下 Galileo 向其他金融机构提供技术平台；2022 年取得美国国民银行牌照。截至 {date} 收盘报 {price} 美元（{chg}）。`
- FAQ：SoFi 是什么公司？/ SoFi 是银行吗？/ SOFI 在哪个交易所上市？/ SoFi 下一次财报是什么时候？/ SoFi 最近为什么涨（跌）？
- 同板块：现在链到 JPM/BAC 等大银行，可以保留，但要加 AFRM、HOOD 等金融科技页（如果在样本组里）。

#### 3.8 /stock/NBIS — nbis 是什么公司
- Title：`Nebius(NBIS)是什么公司？AI云算力业务、股价与解读｜TheMarketBrew`
- H1：`Nebius Group（NBIS）是什么公司？`
- 答案块样例：`Nebius Group（NBIS）是总部位于荷兰阿姆斯特丹的 AI 基础设施公司，前身是 Yandex N.V.，2024 年剥离俄罗斯业务后更名，主营 GPU 云算力服务，在纳斯达克交易。截至 {date} 收盘报 {price} 美元（{chg}）。`
- FAQ：Nebius 是什么公司？/ Nebius 和 Yandex 是什么关系？/ NBIS 和 CoreWeave 有什么区别？（事实对比表：业务、上市时间、总部、营收规模由数据层提供）/ NBIS 最近为什么涨跌？
- 繁体搜索量 40：别名行加「Nebius / 尼比斯（**需要确认**）」，不做繁体页。

#### 3.9 /stock/SMR — smr 是什么公司
- Title：`SMR是什么公司？NuScale Power股票、核电业务与解读｜TheMarketBrew`
- H1：`SMR 是什么公司？NuScale Power（SMR）股票`
- 答案块样例（首句先消歧）：`SMR 是 NuScale Power 在纽交所的股票代码，也是"小型模块化反应堆（Small Modular Reactor）"的英文缩写。NuScale 是美国的小型模块化核反应堆设计公司，2022 年通过 SPAC 上市。截至 {date} 收盘报 {price} 美元（{chg}）。`
- #about 补一段"SMR（小型模块化反应堆）是什么"（80–120 字），然后链到 OKLO 等核电页。
- FAQ：SMR 是什么公司？/ SMR 是什么意思（核电）？/ NuScale 的反应堆获得美国核管会批准了吗？（只写有公开来源、带日期的事实，由人工审核）/ SMR 最近为什么涨跌？
- 修正行业：现在显示「工业 / Electrical Equipment & Parts」，同板块链接是军工股，按上文改成核电主题。

#### 3.10 /stock/PLTR — pltr为什么一直跌
- Title（随 #why 的方向动态切换，两套句式，避免和其他页重复）：最近 20 个交易日累计下跌时用 `Palantir(PLTR)为什么一直跌？近期下跌原因时间线｜TheMarketBrew`；上涨时用 `Palantir(PLTR)最近为什么涨？涨跌原因与AI解读｜TheMarketBrew`。⚠️ 方向切换会导致 title 抖动，**每 7 天最多切换一次**。
- H1：`Palantir（PLTR）最近为什么{涨/跌}？`
- 答案块样例：`Palantir（PLTR）是美国数据分析与 AI 软件公司，产品包括 Gotham、Foundry 和 AIP。截至 {date}，PLTR 较 52 周高点 {drawdown_from_high}，近 20 个交易日 {chg_20d}；主要原因见下方按日期整理的时间线。`
- #why 是核心模块：最近 5–10 次单日涨跌超过 ±3% 的事件，加一行"区间总结"（LLM 根据事件写，比如"估值回调 + 大盘科技股抛售"，**每条原因都要能追溯到某一天的日报段落**）。
- FAQ：PLTR 为什么一直跌？/ Palantir 是做什么的？/ Palantir 下一次财报是什么时候？/ Palantir 的估值高吗？（只给 P/E、P/S 数据和行业对比，不下结论）

#### 3.11 /stock/NVDA — 美股博主怎么看英伟达（#kol 模板样板）
- Title：`英伟达(NVDA)股票：博主观点、涨跌原因与财报解读｜TheMarketBrew`。"博主观点"放进 title，这个词簇的 SERP 前排是视频，而文字答案是空白。
- H1：`英伟达（NVDA）`；副标题 `NVIDIA Corporation · NASDAQ · 半导体`；别名行 `英伟达 / 輝達 / NVIDIA`
- 答案块样例：`英伟达（NVDA）是全球主要的 GPU 与 AI 加速芯片设计公司。截至 {date} 收盘报 {price} 美元（{chg}）；最近 30 天 TMB 追踪的 {n_kol} 位美股博主 {n_posts} 次提到英伟达，偏多 {bull} / 偏空 {bear} / 分歧 {disputed}。`
- **#kol 模块（H2：`美股博主怎么看英伟达？`）**：
  - 第一段 40–60 字结论：`最近 30 天，{n_kol} 位博主讨论英伟达，主要分歧在 {point_bull} 与 {point_bear}。`
  - 表格：博主（链到 /kol/{slug}，有页面的才链）| 日期 | 方向 | 一句话摘要（≤60 字）| 原帖链接。公开 10 条，更多和论据展开锁给 Pro。
  - 数据：`/twitter/ticker-discussion?symbol=NVDA&hours=168`（已有中文摘要，但需要登录，**要新增一个 SSR 可调用的公开精简版**），30 天窗口需要从 `kol_daily_digests.ticker_theses` 按日聚合（字段：side、primary_kols、tweet_count、stance_summary）。
  - 声明：`观点来自博主公开发言，仅代表其本人，不构成投资建议。`
- FAQ：美股博主怎么看英伟达？/ 英伟达最近为什么涨（跌）？/ 英伟达下一次财报是什么时候？/ 英伟达发股息吗，股息率多少？（**股息 bug 修好之前不上这条**）
- 推广：#kol 模块适用于所有在近 30 天被 ≥2 位博主提到的个股；不满足就隐藏整个模块，不写"暂无"。

#### 3.12 /stock/GOOGL — 谷歌财报（#earnings 模板样板，MSFT/AMZN 同步）
- Title（财报前后自动切换）：
  - 财报前 14 天到发布当天：`谷歌(GOOGL)财报：{季度}财报日期、预期与AI解读｜TheMarketBrew`
  - 发布后 14 天内：`谷歌(GOOGL){季度}财报解读：营收、EPS与云业务要点｜TheMarketBrew`
  - 其余时间：模板 v2 的默认 title
- H1：`谷歌（GOOGL）`；#earnings 的 H2：`谷歌财报：{季度}业绩怎么样？`
- 答案块（财报前）：`谷歌母公司 Alphabet（GOOGL）预计于 {next_earnings_date}（{bmo_amc}）发布 {季度} 财报，市场预期 EPS {eps_est} 美元、营收 {rev_est}。上一季营收 {rev_last}，EPS {eps_last}，{beat_or_miss_last} 预期。`
- 答案块（财报后）：`Alphabet（GOOGL）{季度}财报已于 {date} 发布：营收 {rev}（预期 {rev_est}），EPS {eps}（预期 {eps_est}）；{盘后/次日}股价 {reaction}。要点：{point_1}；{point_2}。`
- #earnings 模块（公开）：财报日期（标明"已确认/预估"）→ 预期 vs 实际表（最近 4 季）→ 分部收入（取自 `earnings-data` 的 revenue segments）→ AI 速读第一段（150–250 字）→ 电话会要点 3 条（取自 `/transcript`，有才显示）→ 博主怎么看（复用 #kol）。锁定：完整 AI 财报分析（`POST /{symbol}/earnings`）。
- **日期**：TMB 10/16 日报的「近期事件」列出 MSFT 10/28；**GOOGL 和 AMZN 的财报日期在本次抓取的材料里没有出现，属于未知**，由 `EventCalendarCard.earningsDate` 或 FMP earnings-calendar 填充，并以公司 IR 公告为准。
- FAQ：谷歌财报什么时候公布？/ 谷歌上一季财报怎么样？/ 谷歌云（Google Cloud）收入增长多少？/ 谷歌财报后股价怎么走？（只写已发生的事实）
- 子页 `/stock/GOOGL/earnings`：**先不拆**。等 #earnings 模块 ≥600 字、GSC 显示「谷歌财报」类词和 /stock/GOOGL 的行情类词明显分流时再拆（依据 dev_handoff P1-3）。

### 3.13 /macro/sentiment — 恐慌贪婪指数（改造，M）

**现状**：title「市场情绪 - 恐惧贪婪指数、VIX 与资金流向」（没有品牌，用的是"恐惧"，搜索词是"恐慌"）；SSR 65 个汉字，没有数值；仓库里整页都是 `'use client'`；后端 `/macro/sentiment` 返回 CNN 综合分（0–100）+ 7 个分项 + 4 个市场指标。GSC 0 展示。

| 字段 | 规格 |
|---|---|
| Title | `美股恐慌贪婪指数与VIX恐慌指数：今日市场情绪｜TheMarketBrew` |
| Meta | `美股恐慌贪婪指数（CNN Fear & Greed）与 VIX 恐慌指数今日读数、历史分位与中文解读，每个交易日更新。本页为美股版，非加密货币指数。仅供参考。` |
| H1 | `美股恐慌贪婪指数与 VIX：今日市场情绪` |
| 答案块样例 | `截至 {date} {time} ET，CNN 美股恐慌贪婪指数为 {fg}（{fg_label}），VIX 恐慌指数 {vix}（{vix_chg}），处于近一年 {vix_pct} 分位。恐慌贪婪指数由 CNN 用 7 项市场指标合成，0 代表极度恐慌，100 代表极度贪婪。` |

**模块**：答案块 → 读数卡（SSR 输出数值文本，不能只放图）→ 「7 个分项分别是什么、现在各在什么区间」表格 → 「历史极端值对照」（只列有数据的日期和读数）→ 「今天日报怎么看情绪」（引用当日 /today 里和 VIX 相关的句子，并链接过去）→ **消歧段**：「本页是美股恐慌贪婪指数，不是加密货币恐慌贪婪指数」（SERP 前 9 条里有 5 条是加密版）→ FAQ。
**⚠️ 许可**：页面现在已经展示 CNN 数据（来源写着 CNN Fear & Greed），但 CNN 数据能否转载和展示，许可状态**未知**。上线前要确认；不能用的话，改为"自建情绪面板（VIX、Put/Call、市场宽度、信用利差，来自 FRED/CBOE 等公开数据）+ 链接到 CNN 原页"，答案块里去掉 {fg}。
**FAQ**：恐慌贪婪指数是什么？/ 美股恐慌贪婪指数今天多少？/ VIX 恐慌指数多少算高？/ 恐慌贪婪指数和 VIX 有什么区别？/ 恐慌贪婪指数在哪里看？
**JSON-LD**：`WebPage`（dateModified）+ `BreadcrumbList`（首页 › 宏观 › 市场情绪）+ `FAQPage`；可以加 `Dataset`（VIX 历史序列），前提是页面上有对应的可见表格。
**内链**：入链来自 /today 和 /morning 里的 VIX 数字（加链接）、/macro hub、首页；出链到 /today、/macro/liquidity。
**sitemap**：lastmod = 读数更新日期（交易日）。**更新频率**：交易日每 1 小时，或按数据源节奏（数据源节奏**未知**）；解读每日 1 次。
**SSR 下限**：≥500 个汉字。

### 3.14 /macro/liquidity — 美联储资产负债表 · 流动性状况（微调，S）

**现状**：title「美元流动性状况与趋势分析」（没有品牌）；H1「流动性环境」；SSR 494 个汉字，**已有 W42 分析和数值**（净流动性约 5.87 万亿美元、WALCL 约 6.76 万亿、TGA 约 8,858 亿、RRP 约 0.10 亿，这些都是页面上的实测值，数据来源 FRED）；没有 JSON-LD。GSC 490 次展示，排名 7.98；「流动性状况」排名 4.75。旧 URL /liquidity 现在 307 → /login。

| 字段 | 规格 |
|---|---|
| Title | `美联储资产负债表与美元流动性状况：TGA、逆回购每周更新｜TheMarketBrew` |
| Meta | `每周更新美联储资产负债表（总资产 WALCL）、财政部 TGA 账户、隔夜逆回购与银行准备金，计算净流动性并给出中文解读，判断美股流动性状况。` |
| H1 | `美联储资产负债表与美元流动性状况` |
| 答案块样例 | `截至 {week_end}，美联储总资产（WALCL）为 {walcl}，周变动 {walcl_chg}；扣除 TGA {tga} 与逆回购 {rrp} 后，净流动性 {net_liq}，处于近一年 {pct} 分位。整体判断：{one_line_view}。` |

**改动**：把"如何判断美元流动性状况"拆成 3 个问句 H2（`美联储资产负债表是什么？` / `TGA 和逆回购怎么影响流动性？` / `现在美股流动性状况怎么样？`）；数值卡 SSR 输出；加「近 12 周净流动性表」（文本表格）；/liquidity 改成 **301 → /macro/liquidity**。
**FAQ**：美联储资产负债表现在多少？/ 美联储缩表结束了吗？（只引用美联储官方声明并写明日期，人工审核）/ 净流动性怎么算？/ 逆回购下降意味着什么？
**JSON-LD**：`WebPage` + `BreadcrumbList` + `FAQPage`（如果有可见表格，可加 `Dataset`）。
**更新频率**：每周（WALCL 周四发布；现在的分析生成于 2026-10-18 02:01Z，即 10/17 22:01 ET）。lastmod = 分析生成时间。

### 3.15 /guide/us-market-hours — 美股休市时间2026 · 美股开盘时间（必须新建，M）

沿用 `content_briefs/05`，这里补充事实核对结果和截止时间。
- **截止时间：10/30（周五）前上线**。美国 2026-11-01（周日）结束夏令时，北京时间对应的开盘时间从 21:30 变成 22:30，这是需求高峰。
- Title：`美股开盘时间、收盘时间与2026休市日历（北京/台北/温哥华时间对照）｜TheMarketBrew`
- Meta：`美股几点开盘？常规交易时间为美东 9:30–16:00。2026 年 11 月 1 日起恢复冬令时，北京时间 22:30 开盘。附 2026 全年 NYSE 休市日、提前收盘日与各地时差表。`
- H1：`美股开盘时间与 2026 年休市日历`
- 答案块（已和 NYSE 官网核对，2026-10-18 抓取 nyse.com/markets/hours-calendars）：`美股常规交易时间为美东时间 9:30–16:00。2026 年 11 月 1 日起美国恢复冬令时，对应北京时间 22:30 至次日 5:00（夏令时期间为 21:30–4:00）；温哥华 6:30–13:00，多伦多与纽约同时区。`
- **「现在开盘了吗」状态条**：客户端每分钟计算一次。SSR 先输出静态文本"下一个交易日：{date}"，避免 Googlebot 抓到空值。
- **2026 休市表**（来自 NYSE 官网，入库时以官网为准）：1/1、1/19、2/16、4/3、5/25、6/19、7/3（独立日调休）、9/7、11/26 休市；**11/27 和 12/24 13:00 ET 提前收盘**；12/25 休市。2027 年也一并入库（官网已列出）。
- 时区换算表：纽约、洛杉矶、温哥华、多伦多、北京/台北/香港/新加坡，夏令时和冬令时各一列。
- 盘前和盘后：NYSE Arca 早盘 4:00–9:30 ET，晚盘 16:00–20:00 ET；各券商开放时间不同，要写明。
- FAQ：美股几点开盘（北京时间）？/ 美股几点收盘？/ 2026 年美股哪天休市？/ 美股感恩节休市吗？/ 美股夏令时和冬令时什么时候切换？/ 美股盘前盘后交易时间是几点？
- JSON-LD：`WebPage` + `BreadcrumbList` + `FAQPage`。**不用 Event**。
- 内链：入链来自 /morning 和 /today 的固定说明区、/today 非交易日答案块、首页页脚；出链到 /morning、/today。
- sitemap：加入 static.xml；lastmod 只在休市表或时令变化时更新。
- 更新频率：每年 1 次（NYSE 公布新一年日历时）+ 每次夏令时切换前复核。

---

## 4. 真正需要新建的页面（最小集合）

| 页面 | 决定 | 理由 |
|---|---|---|
| `/guide/us-market-hours` | **新建（唯一一个）** | 常青、事实型意图（开盘/休市/时差），和现有任何页面的意图都不重合；量最大（开盘时间 1,300/390）；有 11/1 时令切换的时间窗口 |
| `/earnings-calendar` | **暂不建** | /today 已有「近期事件」（含财报和 FOMC 日期），个股 #earnings 能承接"谷歌/微软/亚马逊财报"。**触发条件**：GSC 出现「美股财报日历」「本周财报」类查询 ≥30 次展示/周，或 /today 的「近期事件」点击明显 → 再做滚动单页 |
| `/ai-stock-research` | **不建** | 首页就是品类页，已在「美股研报」排第 8；新建会和首页抢同一个意图 |
| `/kol` hub | 不算新建（路由已存在，只是 307 了） | 随 3.1 一起恢复：200，SSR 列出 KOL 卡片（简介 + 最近一条观点 + 提及前 5 代码）。承接「美股博主」「推特博主」等长尾，并给两个 KOL 页提供入链 |
| `/stock/{T}/earnings`、`/theme/*`、繁体页 | 不建 | 见 3.12 和 dev_handoff P2 |

---

## 5. 内容生产机制（复用 TMB 现有流水线）

### 5.1 数据来源 → 页面模块（仓库参考，以生产为准）
| 流水线 / 接口 | 现有字段 | 供给哪些模块 |
|---|---|---|
| 收盘日报 `daily_report`（`/market/reports/latest`、`/date/{date}`），约 18:00 ET | title、summary、intro、`news.headlines[]`（title、fact_summary、deep_analysis、published_at）、`briefs[]`、`report_summary[]`、`calendar[]`（date、event、analysis） | /today 答案块和时间线；个股 #why（NER 抽取）；"近期事件" → #earnings 日期交叉校验 |
| 盘前早报 `morning_report`（`/morning/reports/latest`），约 09:00 ET | 期货、全球指数、解读（锁定） | /morning 答案块和"今日关注" |
| 推特简报 `twitter_digest`（`/{date}`、`/teaser/latest` 公开） | hot_tickers、hot_sectors、hot_events、`ticker_theses[]`（ticker、side、primary_kols、tweet_count、stance_summary）、macro_threads、watchpoints | 个股 #kol（30 天聚合）；/twitter-digest SSR teaser；/kol hub |
| KOL cockpit `kol_research`（`personas/{u}/profile`、`/tickers`、`/feed`、`/tickers/{t}/timeline`、`/sectors`） | 提及次数、价格、ticker summary、推文流 | /kol/serenity、/kol/qinbafrank 全部模块；个股 #kol 的"博主链接" |
| `/twitter/ticker-discussion?symbol=&hours=`（需要登录） | 24–168 小时内的推文 + `generate_chinese_discussion_summary` | 个股 #kol 的 7 天摘要（**需要新增一个可缓存的公开精简接口**，不暴露推文全文） |
| 个股 `stock`（`/{s}/profile`、`/earnings-data`、`/transcript`、`/news-feed`、`EventCalendarCard`） | company_name_zh、description（英文）、财报历史/预期/分部、电话会文本、下次财报日、EPS 预期 | #about（LLM 根据 description 和 10-K 生成中文版，存库）、#earnings |
| 宏观 `macro`（`/sentiment` = CNN + 7 分项 + 4 指标；liquidity 周报） | 读数、周变动、分位 | /macro/sentiment、/macro/liquidity 答案块 |
| NYSE 官方日历（手工入库，每年一次） | 休市日、提前收盘日 | /guide/us-market-hours；/today 非交易日判断 |

### 5.2 通用生成规则（所有自动答案块共用）
1. 输入：结构化 JSON（数值、单位、来源、时间戳）+ 可以引用的原文段落（日报段落、推文摘要）。
2. LLM 只写**措辞**，数字一律输出成占位符（`{nasdaq_chg}`），由模板填值。生成后做**数值回查**：渲染后的文本里每个数字都要能在 JSON 里找到，找不到就拦截，退回上一版。
3. 长度：答案块 40–80 个汉字；#why 每条原因 ≤60 字；KOL 摘要每条 ≤60 字。
4. 归因只能来自输入的段落，不允许模型"补充背景"。没有可引用的原因时，写成"当日无明确单一驱动，随大盘{涨/跌}"，不能编造原因。
5. 合规扫描：禁用词表（§2.6），外加"建议买入/卖出/加仓/减仓/目标价将达"。命中就拦截并转人工。
6. 输出存库，带 `generated_at`、`source_ids`。页面只读库，不在请求时实时生成（和 dev_handoff 一致）。

### 5.3 Prompt 草案：/today 答案块与「美股为什么涨跌」时间线
```
系统：你是美股收盘复盘编辑。只根据输入写作，不添加输入之外的事实和数字。
输入：{index_moves: {spx_chg, ndx_chg, dji_chg, vix, vix_chg}, report_title, report_summary, headlines:[{title, fact_summary}], date}
任务 A（答案块）：用 1–2 句、≤80 个汉字回答"美股今天为什么{涨/跌}"。
  格式：「美股 {M月D日} 收盘：{领涨/领跌指数} {占位符}…。主要原因是{原因1}，{同时/叠加}{原因2}。」
  - 涨跌方向以 ndx_chg 和 spx_chg 为准；两者方向相反时写"分化"。
  - 原因必须出自 headlines 的前 2 条或 report_summary；所有数字用占位符。
任务 B（时间线条目）：≤60 个汉字，格式「{date}：{指数涨跌占位符}，{一句原因}」。
禁止：预测、建议、"必然""一定"、任何不在输入里的数字。
```

### 5.4 Prompt 草案：个股 #why 事件抽取（CRWV/PLTR 等）
```
触发：|单日涨跌幅| ≥ 3%（来自行情数据层），或该股在当日日报 headlines/briefs 里被点名。
步骤 1（规则，不用 LLM）：按别名表（代码 / 中文名 / 英文名 / 常见简称）在当日日报 headlines、briefs、report_summary 里匹配段落；再匹配当日 twitter_digest.ticker_theses 里 ticker = T 的条目。
步骤 2（LLM）：
  输入：{ticker, name_zh, date, chg_placeholder, matched_paragraphs[], kol_thesis?}
  输出 JSON：{reason: "≤60 字，只用 matched_paragraphs 里的事实", source: "daily_report|twitter_digest|none", confidence: "high|low"}
  - matched_paragraphs 为空 → reason = "当日未见公司特定消息，走势与{板块/大盘}一致"，source = none。
  - confidence = low 的条目不进入 FAQ 答案，只放进时间线。
步骤 3：保留最近 10 条；"区间总结"（PLTR 一直跌类）= LLM 只根据这 10 条 reason 归纳出 1 句，≤60 字。
```

### 5.5 Prompt 草案：个股 #kol 汇总与 KOL 页"本周摘要"
```
输入：近 30 天该 ticker 的 ticker_theses[]（side、primary_kols、stance_summary、date）+ 推文摘要列表（author、date、url、text_zh_summary）
输出：
  - 统计（规则计算，不交给 LLM）：n_kol、n_posts、bull、bear、disputed
  - conclusion（≤60 字）：「最近 30 天 {n_kol} 位博主讨论{name_zh}，主要分歧在{多方论点}与{空方论点}。」
  - rows[]：每条 ≤60 字中文摘要，忠于原意，不加评价；必须带 author、date、url。
规则：只用"偏多/偏空/分歧"，不用"推荐/喊单/看好买入"；授权状态 = 禁止 的博主不展示（字段按 SKILL §6.6 记录在数据层）。
KOL 页本周摘要：输入 = 该博主近 7 天的 feed + sectors；输出 150–250 字，结构 = 主线主题 → 提及最多的 3 个标的及方向 → 和上周相比的变化。
```

### 5.6 Prompt 草案：#earnings 速读、#about
- #earnings（财报发布后 ≤3 小时生成；数据层先拿到实际值才触发）：输入 = 实际值 vs 预期 JSON + 新闻稿/电话会摘要；输出 = 答案块（§3.12 格式）+ 3 条要点（每条 ≤50 字，只写公司披露和已发生的股价反应）。
- #about（一次生成，人工抽检 10% 后存库，每季度或公司有重大变化时复核）：输入 = profile.description（英文）+ 10-K 业务描述段落；输出 = 150–300 字中文简介，固定结构为"是什么 → 怎么赚钱 → 主要客户/竞争对手 → 所属主题"。首句必须能单独成立（AI 引用按段落）。代码有歧义（SMR）时首句先消歧。

### 5.7 更新频率总表
| 页面 / 模块 | 频率 | 触发 |
|---|---|---|
| /today 答案块和时间线 | 每个交易日 1 次 | 日报生成后（约 18:00 ET） |
| /morning 答案块 | 每个交易日 1 次 | 早报生成后（现在约 09:00 ET，建议 ≤08:00） |
| 个股 #why | 每个交易日 1 次 | 日报生成后，只处理当天满足触发条件的代码 |
| 个股 #kol | 每天 1 次 | 推特简报生成后 |
| 个股 #earnings | 事件驱动 | 财报日前 14 天切换 title；实际值入库后 ≤3 小时生成速读 |
| 个股 #about | 每季度复核 | 人工 |
| /kol/* 时间线 / 本周摘要 | 每 4 小时 / 每天 | 推文抓取 |
| /macro/sentiment | 交易日每小时（读数）/ 每天（解读） | 数据源 |
| /macro/liquidity | 每周 | WALCL 周四发布后 |
| /guide/us-market-hours | 每年 + 时令切换前 | 人工 |
| 首页"今天的研报" | 跟随 /today、/morning | — |

---

## 6. 上线顺序（W1 / W2 / W3）与 GSC 验收

工作量：**S** ≤0.5 天，**M** 1–2 天，**L** 3–5 天（开发 agent 的估算，仅供排期参考）。

### W1（10/19 周一 – 10/25 周日）：先恢复已有排名、修模板基础
| 顺序 | 页面 / 任务 | 工作量 | 说明 |
|---|---|---|---|
| 1 | /kol/serenity、/kol/qinbafrank、/kol 恢复 200 + SSR 公开模块 + kol-0.xml；/kol/aleabitoreddit 301 → /kol/serenity | L | ROI 最高；验收：Googlebot 抓到 ≥800 个汉字，没有 307 |
| 2 | /today、/morning 固定 H1 + title + 答案块 + JSON-LD + H1 去重 | S–M | 已有展示，见效最快 |
| 3 | 个股模板 v2 基础：中文名（补 CRWV/SOFI/NBIS/SMR/SPCX）、title/H1/答案块、去掉重复 DOM、修股息率、JSON-LD；4 只加入 sitemap 和 /stock hub；/today 正文自动个股内链 | M | 是 W2 各模块的前提 |
| 4 | #earnings 公开版（日期 + 预期 vs 实际表）先上 GOOGL/MSFT/AMZN | M | 要赶在 TMB 日报列出的 MSFT 10/28 财报之前；GOOGL/AMZN 的日期由数据层确认（目前未知） |
| 5 | /guide/us-market-hours 上线 | M | 必须在 11/1 夏令时结束前，越早越好，给 Google 留出抓取时间 |
| 6 | 顺手修：/stock/ZZZZQ → 404；/llms.txt 200；/liquidity 301 → /macro/liquidity | S | 来自 P0-1 |

### W2（10/26 – 11/1）：独特模块和财报窗口
| 顺序 | 页面 / 任务 | 工作量 |
|---|---|---|
| 1 | #earnings 财报后速读（GOOGL/MSFT/AMZN，按实际发布日期触发）+ title 自动切换 | M |
| 2 | #about：CRWV、SOFI、NBIS、SMR、PLTR、NVDA（人工审核全部 6 篇） | M |
| 3 | #why 事件抽取上线（CRWV、PLTR 优先，其余样本组跟着上） | M–L |
| 4 | #kol 公开精简接口 + NVDA 样板，然后推广到被 ≥2 位博主提到的样本股 | M |
| 5 | /macro/sentiment 改成 SSR + 新 title/H1/答案块（CNN 许可确认结果决定答案块写法） | M |
| 6 | /macro/liquidity 微调；首页 title/H1/答案块/"今天的研报"模块 | S + S |

### W3（11/2 – 11/8）：补齐、看数据迭代
| 顺序 | 页面 / 任务 | 工作量 |
|---|---|---|
| 1 | /twitter-digest hub 用 teaser SSR（公开接口已有）；日期页在 ≥300 字以前先 noindex,follow | S–M |
| 2 | 样本组剩余页面批量上 #about/#why/#kol（按 dev_handoff P0-3，独特内容 ≥40% 才进 sitemap） | L |
| 3 | 按第一轮 GSC 数据改 title（展示多、CTR 低的先改）；GEO 20 问基线测试 | S |
| 4 | 评估是否需要 /earnings-calendar（§4 的触发条件） | S |

### 6.1 周一 / 周四 GSC 例行怎么判断每个页面
运行命令沿用 strategy.md §5（`pull_gsc.py`，只读）。基线写在 `gsc_summary_prev_2026-10-17.md` 里，**按页面的周度基线数据缺失**（现有导出都是全期累计），所以第一次周一例行要先补一份"按 page × week"的导出，作为 W0 基线。

| 页面 | 周四（健康检查） | 周一（效果判断） | 合格线（4 周内）/ 不合格时怎么办 |
|---|---|---|---|
| /kol/serenity | URL Inspection：200、已编入索引、Google canonical = 自身；上线后第一个周四没有被重新抓取 → 在 GSC 手动请求编入索引（只做一次） | serenity 词簇（含"白毛股神"）的展示、排名 | 2 周内恢复展示（基线：页面 307 期间约等于 0）；4 周排名 ≤8 且出现点击。只有展示没有点击 → 改 title，加"最新 {月份}" |
| /kol/qinbafrank | 同上 | 「qinbafrank」「@qinbafrank」排名 | 排名恢复到 ≤4，点击 ≥1/周；被 /kol/qinbafrank/latest 等子页替代 → 检查子页的 noindex 是否生效 |
| /morning | lastmod 是否跟着早报更新；日期页公开字数 ≥300 | 「美股盘前」「盘前分析」类查询数、排名 | 出现「美股盘前分析/美股盘前」展示，并且排名 ≤20；CTR <1% → 改 title 句式 |
| /today | 同上 | 「为什么跌/涨」「大跌原因」类查询数 | 出现「美股今天为什么跌」类展示；全页 CTR 从 0.15% 提高到 ≥1% |
| /stock/CRWV、SOFI、NBIS、SMR | URL Inspection 从"无法识别"变成"已编入索引"；在 sitemap 里 | 「是什么公司」「为什么跌」查询的展示 | 4 页里 ≥2 页出现目标词展示；3 周后仍未收录 → 检查独特内容占比和入链数（日报自动内链是否生效） |
| /stock/PLTR、NVDA | 同上 | 「pltr 为什么跌」「博主怎么看英伟达」类查询 | 出现长尾展示即算合格（这两个词量未知） |
| /stock/GOOGL（含 MSFT/AMZN） | 财报日前 3 天检查 #earnings 和 title 切换 | 财报周「谷歌/微软/亚马逊财报」的展示和点击 | 财报周有展示；没有 → 记录下来，下一季提前 14 天上线 |
| /macro/sentiment | SSR 字数 ≥500，数值出现在 HTML 里 | 「恐慌贪婪指数」「vix」类展示 | 4 周出现展示且排名 ≤30（这个词竞争最强，预期放低） |
| /macro/liquidity | /liquidity 301 是否生效 | 「美联储资产负债表」「流动性状况」 | 「流动性状况」保持 ≤5；出现「资产负债表」类展示 |
| / | 不涉及 | 「美股研报」「美股研究室」排名 | 从 8 提到 ≤5 |
| /guide/us-market-hours | 已编入索引（11/1 前） | 「开盘时间」「休市」类展示 | 11 月出现展示；有 AIO 导致 CTR 低属于预期，看展示和排名就行 |

**通用止损**：任何页面上线 3 周后仍然"已发现/已抓取 - 尚未编入索引"，先停止同类页面扩量，补独特内容和入链，再提交（依据 SKILL §4.4、strategy.md 的护栏）。

---

## 7. 未知与风险
- KOL 推文的抓取频率、授权状态字段：**未知**。上线前按 SKILL §6.6 在数据层补齐（已授权 / 仅摘要 / 禁止）。
- CNN 恐慌贪婪指数的展示许可：**未知**（页面已经在用）。
- GOOGL、AMZN 下一次财报日期：本次材料里**未知**；MSFT 10/28 来自 TMB 日报的「近期事件」，没有和公司 IR 核对。
- 仓库 master 落后于线上：路由和模板的具体实现以生产代码为准；文中仓库行号只作为线索。
- 「美股博主怎么看英伟达」「pltr为什么一直跌」「CoreWeave为什么跌」的搜索量**未知**，入选的依据是 SERP 弱加上 TMB 有独有数据。
- 个股别名（如 CoreWeave、Nebius 的中文译名）没有可靠来源时不要写进页面。
- 本次没有调用任何付费 API。
