# 开发清单：关键词 → 页面改造（2026-10-18）
> 详细规格（文案、FAQ、prompt）见 `page_mapping.md` §3–§5。本清单只列"改什么、怎么验收"。时间均为美东时间（ET）。
> 通用验收：`curl -A "Mozilla/5.0 (compatible; Googlebot/2.1)" URL`，去掉 script/style 后统计汉字数；H1 只出现 1 次；JSON-LD 只输出 1 次；禁用词（必涨|推荐买入|稳赚|保证收益|喊单|目标价必达）命中 0；答案块里没有 0、NaN、"--"；页面有免责声明和"数据更新：… ET"。

## W1（10/19–10/25）
- [ ] **KOL 恢复（L）**
  - [ ] /kol、/kol/serenity、/kol/qinbafrank 返回 200，不再 307 → /research；robots=index；canonical 指向自身
  - [ ] /kol/aleabitoreddit 301 → /kol/serenity（canonical 是 serenity）
  - [ ] /kol/qinbafrank/{latest,highlights,sectors,stocks}：匿名用户返回 200 + teaser + `noindex,follow`（不 307）
  - [ ] SSR 输出：答案块、本周摘要、时间线前 10 条（日期 + 摘要 + 原帖链接）、提及个股排行（链到 /stock/{T}#kol）、FAQ、KOL 声明
  - [ ] title / H1 按 §3.1、§3.2；JSON-LD = ProfilePage + Person(sameAs X) + BreadcrumbList + FAQPage
  - [ ] 新建 sitemaps/kol-0.xml 并加入 sitemap index；lastmod = 最新推文时间
  - [ ] 验收：每页 ≥800 个汉字；首页、/twitter-digest 有链接指向两个 KOL 页
- [ ] **/today（S–M）**：title / 固定 H1「美股今天为什么涨跌：每日收盘复盘」/ 当天标题降为 H2 / 答案块 / 近 10 个交易日时间线 / 非交易日文案 / FAQ / WebPage+hasPart Article JSON-LD / H1 去重；日期页 JSON-LD 去重
- [ ] **日报个股自动内链（M）**：日报正文按别名表（代码 / 中文名 / 英文名）匹配 → 链接 /stock/{T}；「近期事件」财报 → /stock/{T}#earnings
- [ ] **/morning（S–M）**：title / 固定 H1「美股盘前分析（每日更新）」/ H2 当天标题 / 答案块 / 公开"期货走势解读"第一段 + 今日关注 / 固定说明区（链到 /guide/us-market-hours）/ FAQ / JSON-LD；日期页补 H1，公开正文 ≥300 字
- [ ] **个股模板 v2 基础（M）**
  - [ ] 中文名：补齐 `company_name_zh`，至少包括 CRWV CoreWeave、SOFI SoFi、NBIS Nebius、SMR NuScale Power、SPCX SpaceX、NVDA 英伟达、GOOGL 谷歌、PLTR Palantir
  - [ ] title / H1 / 别名行 / 答案块按 §3.6–3.12；整块 DOM 只渲染一次
  - [ ] **股息率首屏卡片去掉 ×100**（实测 NVDA 12.9%、GOOGL 24.3%、MSFT 67.5%，概览区的 0.13/0.24/0.67% 正确）；加断言：>15% 就报警
  - [ ] JSON-LD：WebPage + Corporation(tickerSymbol) + BreadcrumbList + FAQPage
  - [ ] CRWV SOFI NBIS SMR SPCX 加入 stock-0.xml；/stock hub 新增「AI 算力与云 / 核电与能源 / 金融科技」分组
  - [ ] 同板块修正：SMR 不再链军工股；CRWV↔NBIS 互链
  - [ ] lastmod 改为内容变化时间，不再全部是同一天
- [ ] **#earnings 公开版（M）**：GOOGL/MSFT/AMZN 显示下次财报日（已确认/预估）、近 4 季预期 vs 实际、分部收入；财报前 14 天自动切换 title。**必须在 10/28 前上线**（TMB 日报显示 MSFT 10/28；GOOGL/AMZN 的日期由数据层确认）
- [ ] **/guide/us-market-hours 新建（M），10/30 前上线**：休市表从 NYSE 官网入库（2026：1/1、1/19、2/16、4/3、5/25、6/19、7/3、9/7、11/26、12/25 休市；11/27、12/24 13:00 提前收盘；同时录入 2027）；夏令时/冬令时时区表；"现在开盘了吗"（SSR 先输出静态的"下一个交易日"）；FAQ；加入 static.xml
- [ ] **小修（S）**：/stock/ZZZZQ → 404 + noindex；/llms.txt → 200 text/plain；/liquidity → 301 /macro/liquidity

## W2（10/26–11/1）
- [ ] #earnings 财报后速读：实际值入库后 ≤3 小时生成（答案块 + 3 条要点），发布后 14 天 title 用"财报解读"版
- [ ] #about：CRWV SOFI NBIS SMR PLTR NVDA，150–300 字，存库，6 篇全部人工审核；SMR 首句先消歧
- [ ] #why：触发条件 = |单日涨跌| ≥3% 或被日报点名；规则匹配 → LLM 写 ≤60 字原因；保留 10 条；PLTR 加"区间总结"；每条链到 /today/{date}-market-report
- [ ] #kol：新增公开、可缓存的 ticker 观点精简接口（不暴露推文全文）；30 天聚合 ticker_theses；NVDA 先上，再推广到被 ≥2 位博主提到的样本股；不满足条件就整块隐藏
- [ ] /macro/sentiment 改成 SSR：title / H1 / 答案块 / 读数卡（数值以文本输出）/ 7 分项表 / 加密版消歧段 / FAQ；**先确认 CNN 数据许可**，不能用就切换成 VIX 等公开数据的版本；SSR ≥500 个汉字
- [ ] /macro/liquidity：title / H1 / 答案块 / 3 个问句 H2 / 近 12 周净流动性文本表 / FAQ / JSON-LD
- [ ] 首页：title / H1 / 答案块 /"今天的研报"SSR 模块（当日 /today、/morning 答案块 + 10 个样本个股 + 2 个 KOL 链接）/ FAQ

## W3（11/2–11/8）
- [ ] /twitter-digest hub 用 `/teaser/latest` 做 SSR；日期页在公开正文 ≥300 字以前设 `noindex,follow`
- [ ] 样本组其余个股批量上模块，独特内容 ≥40% 才进 sitemap
- [ ] 按 GSC 结果改 title（展示多、CTR 低的优先）

## 生成内容的硬规则（所有自动模块）
- [ ] LLM 输出的数字一律是占位符，由模板填值；渲染后做数值回查，找不到对应数据就拦截
- [ ] 原因只能引用输入段落；没有输入段落时，写"当日未见公司特定消息"
- [ ] 输出存库，带 generated_at 和 source_ids；页面不在请求时实时调用 LLM
- [ ] 禁用词扫描 + KOL 授权状态（已授权 / 仅摘要 / 禁止）过滤

## 上线后（周一 / 周四 GSC 例行）
- [ ] 第一次周一：补一份"page × week"导出作为基线（现有数据只有全期累计）
- [ ] 周四：URL Inspection 抽查 /kol/serenity、/kol/qinbafrank、/stock/CRWV、/stock/SOFI、/guide/us-market-hours（目标：已编入索引，canonical = 自身）
- [ ] 周一：按 `page_mapping.md` §6.1 的表格判断每页是否合格，不合格就按表里的动作处理
