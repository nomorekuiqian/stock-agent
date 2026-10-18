# 开发交接文档（给开发 agent）—— TheMarketBrew SEO v2

> 范围：只描述「做什么、怎么验收」，不包含代码。全部基于 2026-10-18 线上实测（以 Googlebot UA 用 curl 抓取）。
> 原则：数字只能来自数据层（不在模板里写死）；一个意图对应一个 URL；独特内容 <40% 的页面 noindex，<30% 不得上线。
> 合规：所有页面不得出现「必涨 / 推荐买入 / 目标价必达 / 稳赚」，底部固定放免责声明（简体模板见下）。

免责声明（简体，固定在页脚上方）：
> 本页内容由 TheMarketBrew 基于公开数据与 AI 生成，仅供研究与信息参考，不构成任何投资建议或买卖推荐。美股投资有风险，请独立判断。数据更新时间：{updated_at_ET}。

---
## P0（W1–W2 必须完成）

### P0-1 全站技术修复
| # | 问题（实测） | 要求 | 验收 |
|---|---|---|---|
| 1 | /stock/ZZZZQ 等无效代码返回 200 且 index,follow（软 404） | 数据库中不存在的代码返回 **HTTP 404** + noindex | `curl -o /dev/null -w '%{http_code}' https://www.themarketbrew.com/stock/ZZZZQ` 返回 404 |
| 2 | 未知路径 307 到 /login | 未知路径返回 404 页（带站内导航），不重定向 | 随机路径返回 404 |
| 3 | /kol/serenity、/kol/qinbafrank 307 到 /research（这是全站唯一有非品牌展示的页面：1,621 + 892 次） | 恢复为公开 200 页面（未登录也能看到摘要内容），self-canonical | 两页返回 200，title 含 KOL 名，Googlebot 能抓到正文 ≥800 中文字 |
| 4 | /kol 不在 sitemap | 新建 `sitemaps/kol-0.xml`，加入 sitemap index | sitemap.xml 包含 kol-0.xml |
| 5 | /llms.txt 307 到 /login | 公开返回 text/plain，内容见下方「llms.txt 规范」 | 返回 200，content-type 为 text/plain |
| 6 | 股息率 bug：NVDA 显示 12.9%（应约 0.13%） | 修正单位换算（疑似把小数当成了百分比，或乘了 100 两次），并对全部代码跑一遍断言：股息率 >25% 的报警 | NVDA/AAPL/MSFT/KO 股息率与数据源一致 |
| 7 | /twitter-digest/{date} 正文约 386 字符、无 H1、无 JSON-LD | 方案 A：公开 ≥300 字摘要 + H1 + Article schema；方案 B：日期页 noindex,follow，只保留 /twitter-digest hub 为 index | 二选一，并说明选择了哪个 |
| 8 | /morning/{date} 正文约 1,122 字符，「期货走势解读 / 全球市场解读」被「登录后解锁」 | 每页公开前 2 段解读（≥300 字），其余可锁；锁定部分用 `isAccessibleForFree=false` + `hasPart` 标注（paywalled content 规范） | 未登录抓取能看到 ≥300 字的解读 |
| 9 | 个股页 AI 解读全部锁住 | 公开 AI 摘要的第一段（约 150–250 字），其余锁定，同样做 paywall 标注 | 同上 |

### P0-2 个股页模板 v2（作用于所有 /stock/{T}）
- **URL**：`/stock/{TICKER}`（不变，大写）；`BRK.B` 等带点代码保持现状，并保证 canonical 一致。
- **Title**：`{简体中文名}({TICKER})股票：股价、财报与AI解读 | TheMarketBrew`
  - 没有中文名时：`{英文短名}({TICKER})股票：股价、财报与AI解读 | TheMarketBrew`
  - 示例：`英伟达(NVDA)股票：股价、财报与AI解读 | TheMarketBrew`；`SpaceX(SPCX)股票：股价、上市表现与AI解读 | TheMarketBrew`
- **Meta description**（≤80 个汉字）：`{中文名}（{英文名}，代码 {TICKER}）最新股价、涨跌原因、财报日期、分析师预期与推特博主观点汇总，AI 每日更新。仅供研究参考。`
- **H1**：`{中文名}（{TICKER}）` + 副标题 `{英文全称} · {交易所} · {行业中文}`
- **别名行**（首屏，可见文本）：`又称：{繁体名} / {英文名} / {常见简称}`，例如 `英伟达 / 輝達 / NVIDIA / 老黄`。别名只取 alias 表中确认过的。
- **首屏直接答案**（40–80 字，模板化 + 数据填充）：`{中文名}（{TICKER}）是{一句话业务}。截至 {date} 收盘报 {price} 美元，{涨跌幅}；下一次财报预计在 {next_earnings_date}。`（没有数据的字段整句省略，不能写 0 或编造）
- **去重**：当前数据表在页面中渲染了两次，只保留一份（另一份如果是移动端版本，用 CSS 响应式实现，不要输出两份 DOM 文本）。
- **JSON-LD**（@graph）：
  - `WebPage`（url、name、dateModified、inLanguage: "zh-CN"）
  - `Corporation`（name 用英文法定名，alternateName 填中文名、繁体名，tickerSymbol: "NASDAQ: NVDA" 格式，url 用公司官网（如有））
  - `BreadcrumbList`：首页 › 个股 › {中文名}（{TICKER}）
  - `FAQPage`：只在页面上真有 FAQ 时输出，内容与可见文本一致
  - **禁止**：Product、Review、AggregateRating、Offer
- **内链**：面包屑；同行业 10 只（现有）改为显示中文名；「出现在这些日报中」（最近 5 篇 /today 链接）；「相关博主」（/kol/{slug}）。
- **hreflang**：暂不做（只有 zh-CN 一个版本）。`<html lang="zh-CN">`。

### P0-3 样本组 70 只的独特模块 + 索引规则
样本组名单：`sample_group_tickers.csv`（第 1 批 50 只在 W2 上线，第 2 批 20 只在 W3 上线）。其中 27 只当前不在 sitemap 中，需要加入：SPCX SNDK CRCL SOFI NBIS RKLB SMR CRWV OKLO MSTR LITE IONQ VRT RGTI HIMS ALAB TEM APP QBTS VST GEV CEG NVO ANET UBER SHOP DELL。

| 模块（锚点） | 内容 | 数据来源 | 对应词簇 |
|---|---|---|---|
| `#about` 公司是做什么的 | 150–300 字中文简介：业务、收入构成、主要竞争对手（链接到同行页）、所属主题（AI 算力/核电/量子/稳定币等） | LLM 根据 10-K/公司简介生成 + 人工抽检 10%，存入数据库，不在每次请求时实时生成 | 个股:是什么公司（如 sofi 是什么公司 170、nbis 140） |
| `#why` 近期为什么涨/跌 | 滚动模块：最近 3 次单日涨跌幅超过 ±3% 的事件，每条 = 日期 + 涨跌幅 + 1–2 句原因 + 链接到当日 /today 报告 | 从 /today 日报中抽取提到该代码的段落 | 个股:涨跌原因（甲骨文股票为什么暴跌 70；台湾 英特爾股價暴跌 480）+ GSC 中的 AI 代理式查询 |
| `#kol` 推特博主怎么看 | 最近 30 天 KOL 提到该股的观点摘要（博主名 + 日期 + 观点方向 + 1 句摘要），链接到 /kol/{slug} | twitter-digest 数据 | KOL/大V观点 |
| `#earnings` 财报 | 下一次财报日期（盘前/盘后）、上一季 EPS/营收实际值 vs 预期、AI 一段话解读 | 数据层 | 个股:财报（谷歌财报 260、微软财报 170、阿里巴巴财报 170） |
| `#analyst` 分析师预期 | 目标价区间（最低/均值/最高）+ 覆盖分析师数 + 数据日期；标题写「华尔街分析师预期（非投资建议）」 | 数据层；没有数据时整块隐藏 | 个股:前景/目标价（amd 股票 预测 70） |
| `#faq` 常见问题 4–6 条 | 固定问题池（见下），答案由数据填充 | 数据层 + #about | 长尾问题 |

FAQ 问题池（按代码选 4–6 条，答案必须在页面上可见）：
1. {中文名}是什么公司？
2. {中文名}的股票代码是什么，在哪个交易所上市？
3. {中文名}下一次财报是什么时候？
4. {中文名}最近为什么涨/跌？（链接到 #why）
5. {中文名}发股息吗？股息率是多少？（股息 bug 修好之后才能上线）
6. 华尔街分析师对{中文名}的目标价是多少？（答案以「仅供参考，不构成投资建议」结尾）
- **禁止**的问题形式：「{X}值得买吗」「{X}能涨到多少」。如果要承接「还能买吗」类搜索，只写成「投资{X}需要关注哪些风险？」

**索引规则**（构建时自动计算，写入页面 meta）：
- 独特内容占比 = （#about + #why + #kol + #earnings 解读 + FAQ 中**不属于模板句**的字符）÷ 页面正文总字符。
- ≥40%：index,follow，进入 sitemap，lastmod 只在内容实际变化时更新（**不要每天把全部 lastmod 刷成当天**。目前 100 只全部是 2026-10-17）。
- 30–40%：noindex,follow，不进 sitemap。
- <30%：不进 sitemap，同样 noindex（这是硬性停止线）。
- 样本组以外的约 3,610 只：页面保留供用户访问，但 noindex,follow；现有 sitemap 中的其余 57 只（DDOG MS BAC…BILI）用模板 v2 后作为**对照组**，只要独特内容 ≥40% 就保留在 sitemap。

### P0-4 /kol hub 与 /kol/{slug}
- `/kol`：title `美股推特博主观点汇总：Serenity、qinbafrank 等中文大V每日观点 | TheMarketBrew`；H1 `美股推特博主观点汇总`；列出所有 KOL 卡片（头像、简介、最近一条观点、提及最多的 5 个代码）。
- `/kol/{slug}`：title `{KOL 中文常用名}（@{handle}）最新观点：持仓主题与提及个股 | TheMarketBrew`，例如 `白毛股神 Serenity（@aleabitoreddit）最新观点：瓶颈理论与提及个股 | TheMarketBrew`。
  - 模块：人物简介（公开信息，不做人身判断）、最近 30 天观点时间线（日期 + 摘要 + 原帖链接）、提及个股排行（链接到 /stock/{T}#kol）、核心框架（如「瓶颈理论」）解释、FAQ。
  - JSON-LD：`ProfilePage` + `mainEntity: Person`（name、alternateName、sameAs: X 主页）+ BreadcrumbList。
  - 合规：明确写出「观点来自博主公开发言，TMB 只做整理，不代表推荐」。不要使用「喊单」一词作为标题。
- 验收：两页 200 + index；正文 ≥800 中文字；每日更新且 lastmod 跟着变；/kol 加入 sitemap。

### P0-5 /today、/morning hub 改造
- `/today`：title 改为 `美股今日行情与收盘复盘：今天为什么涨/跌（每日更新）| TheMarketBrew`；H1 固定为 `美股今日行情复盘`，当天标题作为 H2（当前 H1 是每天变化的新闻标题）。首屏放「今天美股为什么涨/跌」直接答案（≤80 字）。JSON-LD：WebPage + 最新一篇 Article 的 `hasPart`。
- `/morning`：title 改为 `美股盘前早报：美股期货、纳指期货与盘前异动（每日更新）| TheMarketBrew`（当前是「盘前早报 | TheMarketBrew」）；H1 `美股盘前早报`；首屏公开期货数据 + 一段公开解读。
- 日期页（/today/{date}、/morning/{date}）：保留 index（/today 日期页正文约 7,000 字符，质量合格），canonical 指向自己；在 hub 上只链接最近 7 天，其余放进 archive。
- 验收：title/H1 与上面一致；hub 有 JSON-LD；未登录能看到解读首段。

### llms.txt 规范（P0-1 #5）
```
# TheMarketBrew
> 面向华人投资者的中文 AI 美股研究网站：个股页、每日美股日报、盘前早报、宏观数据与推特博主观点汇总。内容仅供研究参考，不构成投资建议。
## 核心页面
- 个股：https://www.themarketbrew.com/stock
- 今日行情复盘：https://www.themarketbrew.com/today
- 盘前早报：https://www.themarketbrew.com/morning
- 宏观：https://www.themarketbrew.com/macro
- 博主观点：https://www.themarketbrew.com/kol
## 样本个股
（构建时自动列出样本组 70 只的 URL + 中文名）
```

---
## P1（W3–W4）
| # | 页面 | URL | Title 模式 | 关键模块 | 目标词（美国月量） | 验收 |
|---|---|---|---|---|---|---|
| 1 | 美股交易时间与休市日历 | `/guide/us-market-hours` | `美股开盘时间、收盘时间与2026休市日历（北京/台北/温哥华时间对照）| TheMarketBrew` | 实时「美股现在开盘了吗」状态；常规/盘前/盘后时段，含夏令时与冬令时；时区换算表（北京、台北、香港、新加坡、温哥华、多伦多、纽约、洛杉矶）；当年休市与半日市表（**必须取自 NYSE 官方日历，存入数据层，不得手写**） | 美股开盘时间/開盤時間 1,300；美股休市时间 260；美股休市时间2026 170；美股收盘时间 170；盘后交易时间 70 | 夏令时切换日（2026-11-01）前上线；休市表与 NYSE 官网一致 |
| 2 | 美股财报日历 | `/earnings-calendar`（滚动，一个 URL） | `美股财报日历：本周财报时间表（盘前/盘后）| TheMarketBrew` | 本周/下周财报列表（中文名 + 代码 + 时间 + 预期 EPS），每个链接到 /stock/{T}#earnings | 美股财报/財報 110；以及个股财报词 | 上线时 10 月底的财报季已开始；数据每日更新 |
| 3 | 个股财报子页（只做前 20 只） | `/stock/{T}/earnings` | `{中文名}({T})财报：最新季度业绩、下次财报日期与AI解读 | TheMarketBrew` | 历史 8 季度表、最新一季 AI 解读、电话会要点 | 谷歌财报 260、微软财报 170、阿里巴巴财报 170、亚马逊财报 110 | 只有在 #earnings 模块已经存在、内容 ≥600 字时才拆出子页，否则保留在模块里 |
| 4 | AI 美股研究工具落地页 | `/ai-stock-research` | `AI美股研究工具：中文AI个股分析、日报与博主观点 | TheMarketBrew` | 产品能力介绍、截图、Free/Pro($10)/Max($20) 对比、与「问 ChatGPT」相比的差异（数据实时、来源可追溯）、FAQ | ai 炒股 210；ai选股 50（CPC $10.76）；台湾 ai選股 880（KD 0）；美股分析網站 70 | 不写「AI 选股保证收益」之类的话；pricing 有内链 |
| 5 | 宏观页 title/H1/schema | `/macro/sentiment` 等 | sentiment：`恐慌贪婪指数与VIX恐慌指数实时：美股市场情绪 | TheMarketBrew`；inflation-rates：`美债收益率（10年期）、CPI与美联储利率实时 | TheMarketBrew`；liquidity：保留「美元流动性」，H1 改为 `美元流动性状况` | 每页首屏放当前值 + 一句解读 + 更新时间；Dataset 或 WebPage schema | vix恐慌指数 590；恐慌贪婪指数 480；美债收益率 1,000；10年期美债收益率 480；美联储 2,400；非农数据 590 | H1 包含目标词；GSC 中「流动性状况」（目前排名 4.75）保持或上升 |
| 6 | IndexNow | — | — | 新建/更新 URL 时推送到 Bing IndexNow | — | 有推送日志 |

## P2（第 5 周以后，视样本组结果而定）
- `/theme/{slug}` 主题页（AI 概念股、核电、量子计算、稳定币等）：先由 /today 的板块段落承接，样本组验证有效后再做。
- zh-Hant 繁体版个股页（台湾「輝達股價」673,000，KD 42）：需要 hreflang zh-Hans/zh-Hant 和独立的繁体文本。不要只做简繁字形转换。
- `/compare/{a}-vs-{b}`：只在 GSC 出现真实对比查询时再做。
- `/learn/*` 入门（市盈率是什么意思 140 等）：暂缓。

## 全局验收清单（每次上线跑一遍）
- [ ] 样本组随机抽 10 只：title/H1 含中文名；首屏直接答案中没有空值或 0；JSON-LD 通过 Rich Results Test / Schema Validator，没有 Product/Review。
- [ ] 无效代码返回 404；/kol 两页返回 200；llms.txt 返回 200。
- [ ] 全站搜索禁用词「必涨|推荐买入|稳赚|保证收益|喊单」命中为 0（title/H1/正文）。
- [ ] sitemap 中每个 URL 都返回 200 且 index，lastmod 真实。
- [ ] 独特内容占比计算结果写入构建日志，<40% 的页面不在 sitemap 中。
- [ ] 股息率断言通过（没有 >25% 的异常值）。
