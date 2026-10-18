# TheMarketBrew SEO 实施文档（交给 Codex 执行，2026-10-18 定稿）

> **读者**：在仓库 `stock-agent`（github.com/nomorekuiqian/stock-agent）里干活的编码 agent（Codex）。不需要其他上下文，按本文从上往下执行即可。
> **代码基线**：仓库默认分支 `master` 最后一次提交是 2026-08-10，**线上生产版本比它新**（例如日报 URL 已经从 uuid 改成 `/today/2026-10-16-market-report`，`/kol` 现在 307 → `/research`）。**以你手上拿到的当前代码为准**。文中出现的文件名和行号（如 `OverviewTab.tsx`、`generateMetadata`、`stock-names.ts`）只是线索，找不到就按“要求的行为”自己定位实现。
> **现状来源**：2026-10-18 08:50–09:30 ET 用 Googlebot UA 抓取线上（`live_2026-10-18/`）；GSC 数据区间 2026-01-07 ~ 2026-10-16，文中“展示/排名”都是全期累计值。
> **冲突处理**：各来源文档有冲突时，以 `page_mapping.md`（最新、基于线上实测）为准。本文已经合并好，直接按本文做。
> **铁律**：所有数字只从数据层渲染（模板里用 `{占位符}`），查不到就显示“未知”或整句不输出；不荐股；每页带免责声明。
> 时间一律为美东时间（ET）。

---

## 0. 背景与目标

**TMB 是什么**：TheMarketBrew（www.themarketbrew.com）是面向华人投资者的中文 AI 美股研究网站：每个交易日生成盘前早报（约 09:00 ET）和收盘日报（约 18:00 ET），追踪推特美股博主（Serenity/@aleabitoreddit、qinbafrank 等）观点，提供 AI 个股研报和宏观仪表盘。订阅分 Free / Pro($10) / Max($20)。

**现状一句话**：有内容、有数据，但 Google 几乎看不到。GSC 查询级的非品牌点击全期只有 1 次（888 次非品牌展示）；有展示的 /stock 页只有 2 个（SPCX 8 次展示、排名 8.75；AMD 2 次）。全站唯二有规模非品牌展示的 `/kol/serenity`（1,621 次，排名 8.16）和 `/kol/qinbafrank`（892 次，排名 4.81）**目前 307 到 noindex 的 /research**（2026-10-18 复测仍然如此）。

**北极星指标**：每周非品牌自然点击（GSC，品牌词 themarketbrew / market brew / marketbrew 以外）。
**先行指标**：被收录且有展示的 `/stock/*` 页数（基线 2）。

**4 周目标**（是目标不是预测）：
- 样本组 70 页里 ≥35 页在 GSC 有展示；
- 非品牌点击 ≥10/周；
- /kol 两页恢复到下线前的展示水平；
- 护栏：样本组收录比例 ≥60%；若 <30%，暂停扩量，先补独特内容。

**指导原则**（每个任务都要遵守）：
1. **一个意图一个 URL**（Page Owner）。“为什么跌”不每天开新 URL，写进 `/stock/{T}#why` 和 `/today` 滚动模块。
2. **先改现有页，再建新页**。本轮唯一新建页：`/guide/us-market-hours`。不建 `/ai-stock-research`（首页承接）、不建 `/earnings-calendar`（用 `/stock/{T}#earnings` + /today「近期事件」承接）。
3. **公开摘要 + 付费深度**：事实、数据、结论第一段、观点一句话摘要公开；全文解读、论据展开、AI 对话锁给 Pro/Max。锁定部分用 Google paywalled content 结构化数据标注（`isAccessibleForFree: false` + `hasPart` / `cssSelector`，见 §2.0.6）。
4. **服务端渲染（SSR）**：title、meta、H1、答案块、FAQ、JSON-LD、公开模块正文必须出现在初始 HTML 里，Googlebot 不执行也能看到。现在 /kol、/macro/sentiment、/twitter-digest 都是 `'use client'` 渲染，不达标。
5. **先样本组再放量**：先做 70 只样本股（重点 10 页），观察 2–4 周收录再扩；独特内容 <40% 的页面 noindex。
6. **合规**：不给买卖建议；禁用“必涨/推荐买入/稳赚/保证收益/喊单/目标价必达/抄底/闭眼买/翻倍”；FAQ 不出现“值得买吗/能涨到多少”；每页免责声明；不做开户、券商、税务内容。

---

## 1. P0 技术修复（W1 必须完成）

### 1.0 验收工具（所有验收都用它）

```bash
# 在本地/预览环境验收时把 BASE 换成预览地址
BASE=https://www.themarketbrew.com
UA='Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'

status() { curl -s -o /dev/null -A "$UA" -w '%{http_code} -> %{redirect_url}\n' "$BASE$1"; }
html()   { curl -s -A "$UA" "$BASE$1"; }
# 去掉 script/style/noscript 后的汉字数（JSON-LD 和 RSC payload 都在 script 里，不计入）
han()    { html "$1" | python3 -c 'import sys,re,html as H;h=sys.stdin.read();h=re.sub(r"(?is)<(script|style|noscript)\b.*?</\1>","",h);t=H.unescape(re.sub(r"<[^>]+>"," ",h));print(len(re.findall(r"[\u4e00-\u9fff]",t)))'; }
h1n()    { html "$1" | grep -o '<h1' | wc -l; }
ldn()    { html "$1" | grep -o 'application/ld+json' | wc -l; }
robots() { html "$1" | grep -oE '<meta[^>]+name="robots"[^>]*>'; }
canon()  { html "$1" | grep -oE '<link[^>]+rel="canonical"[^>]*>'; }
banned() { html "$1" | grep -cE '必涨|推荐买入|稳赚|保证收益|喊单|目标价必达|抄底|闭眼买|翻倍'; }
```

通用验收（每个改过的页面都跑）：`h1n` = 1；`ldn` = 1（一个 `@graph`）；`banned` = 0；答案块里没有 `0`（占位空值）、`NaN`、`--`、`undefined`、`null`；页面有免责声明和“数据更新：… ET”。

### 1.1 修复清单

| # | 问题（2026-10-18 实测症状） | 要求的行为 | 验收（期望结果） | 工作量 |
|---|---|---|---|---|
| P0-1 | `/kol`、`/kol/serenity`、`/kol/qinbafrank`、`/kol/qinbafrank/latest`、`/kol/qinbafrank/sectors` 全部 **307 → /research**（/research 是 200 + `noindex, follow`，canonical=/research，正文 16 个汉字）。仓库 master 里 `/kol/serenity` 会 `redirect('/kol/aleabitoreddit')`，`[username]` 布局和页面都是 `'use client'` | 三个页面**匿名访问返回 200**，`index, follow`，canonical 指向自身，SSR 输出公开模块（规格见 §2.2–2.4）。`/kol/aleabitoreddit` **301 → `/kol/serenity`**（serenity 是 canonical，因为 GSC 历史信号都在它上面）。子页 `/kol/qinbafrank/{latest,highlights,sectors,stocks}` 及 serenity 的子页：匿名返回 **200 + 公开 teaser + `noindex,follow`**，链回根页；不 301、不 307（Max 用户还要用）。付费功能保留，只是不再整页跳走 | `status /kol/serenity` → `200 ->`（无跳转）；`status /kol/qinbafrank`、`status /kol` 同；`status /kol/aleabitoreddit` → `301 -> …/kol/serenity`；`robots /kol/serenity` 含 `index`；`canon` = 自身；`han /kol/serenity` ≥ 800、`han /kol/qinbafrank` ≥ 800、`han /kol` ≥ 300；`status /kol/qinbafrank/latest` → 200 且 `robots` 含 `noindex` | L |
| P0-2 | 个股页首屏卡片股息率**多乘了 100**：NVDA 12.9%、GOOGL 24.3%、MSFT 67.5%；同一页概览区显示 0.13% / 0.24% / 0.67%（正确）。线索：`OverviewTab.tsx` 约第 447、557 行的 MetricCard 用 `toFixed(2)%`，约第 280 行用 `fmtPct`，两处口径不一致 | 抽一个共享格式化函数（例如 `formatDividendYield(raw)`，明确输入单位），首屏卡片和概览区都用它，两处显示一致。**健全性告警**：任何代码股息率 >25% 时，该卡片不显示数值（整块隐藏，不显示 0 或“--”）并记录告警日志；对全部代码跑一次批量断言 | NVDA/GOOGL/MSFT 首屏卡片 = 概览区数值（约 0.13% / 0.24% / 0.67%，以数据源为准）；KO、AAPL 与数据源一致；批量断言脚本输出 >25% 的数量 = 0（或全部为已知真实高息股并人工确认）。在 bug 修好之前，任何页面 FAQ 不得上线“发股息吗/股息率多少” | S |
| P0-3 | 无效代码软 404：`/stock/ZZZZQ` 返回 200 + `index, follow`，title `ZZZZQ (ZZZZQ) 个股分析`，540 个汉字 | 数据库中不存在的代码返回 **HTTP 404** + `noindex`，渲染带站内导航的 404 页 | `status /stock/ZZZZQ` → `404`；`robots` 含 `noindex`；`status /stock/NVDA` 仍 200 | S |
| P0-4 | 公开路由表之外的未知路径 307 → /login | 未知公开路径返回 404 页（带导航），不重定向。真正需要登录的应用路由（账户、设置等）可以继续跳登录 | `status /this-path-does-not-exist-123` → `404` | S |
| P0-5 | `/llms.txt` **307 → `/login?redirect=%2Fllms.txt`** | 公开 200，`Content-Type: text/plain; charset=utf-8`，内容见下方模板；样本组 URL 构建时自动生成。确认 middleware 不拦截 GPTBot、PerplexityBot、ClaudeBot、Google-Extended（robots.txt 现状 `Allow: /`、`Disallow: /api/`，保持） | `curl -sI -A "$UA" $BASE/llms.txt` → `200` 且 `content-type: text/plain`；内容含 `/kol` 和至少 10 个 `/stock/` 链接 | S |
| P0-6 | 旧 URL `/liquidity`（GSC 有展示）**307 → /login** | **301 → `/macro/liquidity`** | `status /liquidity` → `301 -> …/macro/liquidity` | S |
| P0-7 | 薄日期页：`/twitter-digest`（hub）SSR 只有“加载中...”7 个汉字、无 H1；`/twitter-digest/2026-10-16` 206 个汉字（约 384 字符）、无 H1、无 JSON-LD；`/twitter-digest/archive` 13 个汉字；这些都是 `index`，121 个日期页在 sitemap 里。`/morning/2026-10-16-morning-brief` 442 个汉字、**无 H1**，“期货走势解读”“全球市场解读”是“登录后解锁” | **/twitter-digest 日期页**：W1 先设 `noindex,follow` 并从 `twitter-digest-0.xml` 移除（这是 S 级安全修复，提前到 W1）；W3 hub 用公开接口 `/teaser/latest` 做 SSR；日期页公开摘要 ≥300 字后才恢复 index + 进 sitemap。**/morning 日期页**：补 H1（= 当天标题），公开“期货走势解读”第一段（150–250 字）+「今日关注」，使公开正文 ≥300 字，锁定部分做 paywall 标注；达不到 300 字的日期页 `noindex,follow`。**规则统一**：任何日期页公开正文（去掉导航和模板句）<300 字 → noindex,follow 且不进 sitemap | `robots /twitter-digest/2026-10-16` 含 `noindex`（W1）；`grep -c '<loc>' twitter-digest-0.xml` 只剩 hub/达标页；`h1n /morning/2026-10-16-morning-brief` = 1；该页匿名可见“期货走势解读”第一段；`han` 公开解读部分 ≥ 300 | S（noindex）+ M（morning 公开） |
| P0-8 | **H1 与正文整块重复渲染两次**：`/stock/*` H1 两次（如 `NVIDIA Corporation` ×2）、数据表两遍；`/today` H1 两次；`/morning` H1「盘前早报」两次；`/today/{date}` H1 两次。看起来是桌面和移动端各输出一份 DOM。日期页 JSON-LD（Article+WebPage）也**重复输出 2 次** | 只输出一份 DOM，用 CSS 响应式适配移动端；JSON-LD 合并为一个 `@graph` 只输出一次 | 对 `/stock/NVDA`、`/today`、`/morning`、`/today/2026-10-16-market-report`：`h1n` = 1，`ldn` = 1；数据表关键行（如“市值”）在 HTML 里只出现一次 | M |
| P0-9 | Sitemap：`stock-0.xml` 100 条，lastmod **全部 2026-10-17**；`static.xml` 19 条 lastmod 也全部 2026-10-17（像每天整体刷新）；样本组里 27 只不在 sitemap：SPCX SNDK CRCL SOFI NBIS RKLB SMR CRWV OKLO MSTR LITE IONQ VRT RGTI HIMS ALAB TEM APP QBTS VST GEV CEG NVO ANET UBER SHOP DELL；没有 kol sitemap | (a) 新建 `sitemaps/kol-0.xml`（/kol、/kol/serenity、/kol/qinbafrank），加入 sitemap index；(b) W1 把 **CRWV、SOFI、NBIS、SMR、SPCX** 加进 `stock-0.xml`；其余 22 只在独特内容 ≥40% 后自动加入（§3.6）；(c) **lastmod 诚实**：只在页面内容真正变化时更新（个股页 = max(#why 最新事件日期, #kol 最新观点日期, #earnings 更新日期, #about 审核日期)，不用每天报价时间；static 页 = 内容变更时间）；(d) `static.xml` 加入 `/guide/us-market-hours`；(e) sitemap 里每个 URL 必须 200 + index | `curl -s $BASE/sitemap.xml` 含 `kol-0.xml`；`stock-0.xml` 含 `/stock/CRWV` 等 5 个；`stock-0.xml` 的 lastmod 去重后不止 1 个值；脚本遍历 sitemap 所有 `<loc>`：全部 200 且无 `noindex` | M |
| P0-10 | 个股页无中文名：NVDA 页 HTML 里“英伟达”出现 0 次；title 形如 `NVIDIA Corporation (NVDA) 个股分析`；仓库 `generateMetadata` 已支持 `profile.company_name_zh` 但线上为空；后备表 `frontend/src/lib/stock-names.ts`（130 条）**没有 CRWV、SOFI、NBIS、SMR、SPCX**；个股页无 JSON-LD | 补齐 `company_name_zh`（数据层）和后备表；至少：NVDA 英伟达、GOOGL 谷歌、MSFT 微软、AMZN 亚马逊、PLTR Palantir、CRWV CoreWeave、SOFI SoFi、NBIS Nebius、SMR NuScale Power、SPCX SpaceX；样本组 70 只按 §2.1.9 名单。title/H1/JSON-LD 按模板 v2（§2.1） | `html /stock/NVDA \| grep -c 英伟达` ≥ 3；title 以 `英伟达(NVDA)` 开头；`ldn` = 1 且含 `Corporation` | M |

**大小写**：`/stock/nvda` 现在 200 且 canonical → `/stock/NVDA`，可以接受（不强制改 301）。

**llms.txt 模板**（P0-5）：
```
# TheMarketBrew
> 面向华人投资者的中文 AI 美股研究网站：个股页、每日美股日报、盘前早报、宏观数据与推特博主观点汇总。内容仅供研究参考，不构成投资建议。
## 核心页面
- 个股：https://www.themarketbrew.com/stock
- 今日行情复盘：https://www.themarketbrew.com/today
- 盘前早报：https://www.themarketbrew.com/morning
- 宏观：https://www.themarketbrew.com/macro
- 博主观点：https://www.themarketbrew.com/kol
- 美股开盘时间与休市日历：https://www.themarketbrew.com/guide/us-market-hours
## 样本个股
（构建时自动列出样本组 70 只的 URL + 中文名，例如 - 英伟达（NVDA）：https://www.themarketbrew.com/stock/NVDA）
```

---

## 2. 页面改造规格

### 2.0 共用规则（所有页面适用，下文不重复）

1. **SSR 下限**：各页列出的汉字数下限用 §1.0 的 `han` 检查。
2. **H1 只输出一次**；JSON-LD 一个 `@graph` 只输出一次，内容与可见内容一致；**禁止** `Product`、`Review`、`AggregateRating`、`Offer`。
3. **首屏答案块**：紧跟 H1（或别名行）之后，`<p class="answer" data-updated="{ISO8601}">…</p>`。40–80 个汉字（只数汉字；英文名、代码、数字、占位符不计；渲染后总字符数 ≤ 约 140）。句子里的数字全部用模板变量渲染；**某个变量为空时整句删掉**，不能显示 0、NaN、“--”。
4. **更新时间**：每个数据模块写 `数据更新：{YYYY-MM-DD HH:mm} ET · 来源：{source}`。
5. **免责声明**：首屏下方短版 + 页脚完整版：
   > 本页内容由 TheMarketBrew 基于公开数据与 AI 生成，仅供研究与信息参考，不构成任何投资建议或买卖推荐。美股投资有风险，请独立判断。数据更新时间：{updated_at_ET}。

   KOL 相关模块另加：「观点来自博主公开发言，仅代表其本人，TheMarketBrew 只做整理，不构成推荐。」
6. **公开 / 付费分界与 paywall 标注**：
   - 公开 = 事实、数据、结论第一段、观点一句话摘要；Pro/Max = 全文解读、论据展开、原文证据链、AI 对话。
   - Googlebot 与匿名用户拿到**同一份 HTML**，不按 UA 区别输出（不 cloaking）。
   - 锁定区域用统一 class 包起来（例如 `<section class="paywalled-content">`），JSON-LD 的页面主实体（Article / WebPage）加：
     ```json
     {"isAccessibleForFree": false,
      "hasPart": {"@type": "WebPageElement", "isAccessibleForFree": false, "cssSelector": ".paywalled-content"}}
     ```
   - 页面没有锁定内容时不要加这两个字段。
7. **禁用词扫描**（title、H1、正文、FAQ）：必涨、推荐买入、稳赚、保证收益、喊单、目标价必达、抄底、闭眼买、翻倍；生成内容另扫“建议买入/卖出/加仓/减仓/目标价将达”。FAQ 不能出现「值得买吗」「能涨到多少」，要承接只能写「投资{X}需要关注哪些风险？」。
8. **title 分隔符**统一用全角 `｜TheMarketBrew`。`<html lang="zh-CN">`，不做 hreflang。
9. **lastmod** 只在内容真正变化时更新。
10. **内链**：用 `<a href>` 真链接（不是 onClick），SSR 输出。

---

### 2.1 个股页模板 v2（可复用模板，作用于所有 `/stock/{T}`）

#### 2.1.1 URL 与数据源
- URL 不变：`/stock/{TICKER}`（大写）；`BRK.B` 等带点代码保持现状，canonical 一致。
- 中文名：优先 `profile.company_name_zh`，后备 `stock-names.ts`；别名只取 alias 表中确认过的，**没有可靠来源的中文译名不写**。
- 一句话业务、#about：存库的生成内容（§3.5），不在请求时实时调用 LLM。

#### 2.1.2 Head
- **Title（默认）**：`{中文名}({TICKER})股票：股价、财报与AI解读｜TheMarketBrew`；无中文名：`{英文短名}({TICKER})股票：股价、财报与AI解读｜TheMarketBrew`。目标页有专属 title 的按 §2.8–2.14。
- **Meta description**（≤80 汉字）：`{中文名}（{英文名}，代码 {TICKER}）最新股价、涨跌原因、财报日期、分析师预期与推特博主观点汇总，AI 每日更新。仅供研究参考。`
- robots：按 §3.6 独特内容占比自动计算。

#### 2.1.3 首屏顺序
H1 → 副标题 → 别名行 → **答案块** → 免责短版 → 报价卡（股息率已修复）→ `#why`（有才显示）→ `#kol`（有才显示）→ `#earnings` → `#about` → 现有数据表（只保留一份）→ `#analyst`（有数据才显示）→ `#faq` → 同主题个股 → 「出现在这些日报中」（最近 5 篇 /today 链接）→ 「相关博主」（/kol/{slug}，有页面才链）。

- **H1**：`{中文名}（{TICKER}）`；副标题 `{英文全称} · {交易所} · {行业中文}`。
- **别名行**（可见文本）：`又称：{繁体名} / {英文名} / {常见简称}`。
- **答案块模板**：`{中文名}（{TICKER}）是{一句话业务}。截至 {date} 收盘报 {price} 美元（{chg}）；下一次财报预计在 {next_earnings_date}。`

#### 2.1.4 模块（锚点）

| 锚点 | 内容 | 公开/锁定 | 数据来源 | 显示条件 |
|---|---|---|---|---|
| `#about` 公司是做什么的 | 150–300 字：是什么 → 怎么赚钱 → 主要客户/竞争对手（链到同行页）→ 所属主题；首句能独立成立 | 公开 | profile.description + 10-K 业务段落 → LLM 生成存库，人工审核（§3.5） | 有审核过的内容才显示 |
| `#why` 近期为什么涨/跌 | 滚动时间线：最近 5–10 次触发事件，每条 = 日期 + 涨跌幅 + ≤60 字原因 + 链接 `/today/{date}-market-report`（“查看当日复盘”） | 公开 | 日报段落匹配 + LLM（§3.3） | 至少 1 条 |
| `#kol` 推特博主怎么看 | H2 `美股博主怎么看{中文名}？`；结论 40–60 字；表格：博主 \| 日期 \| 方向（偏多/偏空/分歧）\| 一句话摘要 ≤60 字 \| 原帖链接；公开 10 条 | 摘要公开；更多条目和论据展开锁 Pro | twitter_digest.ticker_theses 30 天聚合 + 公开精简接口（§3.4） | 近 30 天被 ≥2 位博主提到；否则整块隐藏，不写“暂无” |
| `#earnings` 财报 | 下次财报日（标“已确认/预估”、盘前/盘后）→ 近 4 季 预期 vs 实际 → 分部收入 → AI 速读第一段 150–250 字 → 电话会要点 3 条（有才显示）→ 博主怎么看（复用 #kol） | 数字和第一段公开；完整 AI 财报分析锁 Max | `/stocks/{s}/earnings-data`、`/transcript`、`EventCalendarCard.earningsDate`/EPS 预期 | 有财报数据 |
| `#analyst` 分析师预期 | 标题「华尔街分析师预期（非投资建议）」；目标价最低/均值/最高 + 覆盖分析师数 + 数据日期 | 公开 | 数据层 | 无数据整块隐藏 |
| `#faq` | 4–6 条（问题池见下），答案在页面上可见 | 公开 | 数据层 + #about | — |
| AI 深度个股分析、技术面解读、AI 对话 | 现有功能 | 锁 Max，paywall 标注 | 现有 | — |

**FAQ 问题池**（每只选 4–6 条）：
1. {中文名}是什么公司？
2. {中文名}的股票代码是什么，在哪个交易所上市？
3. {中文名}下一次财报是什么时候？
4. {中文名}最近为什么涨/跌？（链到 #why）
5. {中文名}发股息吗？股息率是多少？（**P0-2 修好之后才能上线**）
6. 华尔街分析师对{中文名}的目标价是多少？（答案以「仅供参考，不构成投资建议」结尾）
7. 投资{中文名}需要关注哪些风险？（只写事实：负债、客户集中度、未盈利等）

#### 2.1.5 JSON-LD（@graph）
```json
{"@context":"https://schema.org","@graph":[
 {"@type":"WebPage","@id":"{url}#webpage","url":"{url}","name":"{title}","inLanguage":"zh-CN","dateModified":"{lastmod}",
  "hasPart":[{"@type":"Article","headline":"{#why 模块标题}","dateModified":"{最新事件日期}"}]},
 {"@type":"Corporation","name":"{英文法定名}","alternateName":["{中文名}","{繁体名}"],"tickerSymbol":"{交易所}: {TICKER}","url":"{公司官网，有才写}"},
 {"@type":"BreadcrumbList","itemListElement":[
  {"@type":"ListItem","position":1,"name":"首页","item":"https://www.themarketbrew.com/"},
  {"@type":"ListItem","position":2,"name":"个股","item":"https://www.themarketbrew.com/stock"},
  {"@type":"ListItem","position":3,"name":"{中文名}（{TICKER}）","item":"{url}"}]},
 {"@type":"FAQPage","mainEntity":[{"@type":"Question","name":"…","acceptedAnswer":{"@type":"Answer","text":"…"}}]}
]}
```
- `hasPart: Article` 只在 #why / #earnings 有内容时加；FAQPage 只在页面真有可见 FAQ 时输出；有锁定区域时按 §2.0.6 加 paywall 字段。

#### 2.1.6 同主题个股（替换按 FMP sector 的粗分）
- 依据行业分类或主题表，只链样本组里已有页面的代码，显示中文名。
- 修正：**SMR** 现在链 BA/LMT/NOC 等军工股 → 改成核电/电力主题（OKLO、CEG、VST）；**CRWV、NBIS** 现在链半导体 → 改成 AI 云/算力（NBIS↔CRWV 互链，再链 NVDA、ORCL）；**SOFI** 现链 JPM/BAC 可保留，加 HOOD（样本组内）。

#### 2.1.7 /stock hub
新增分组「AI 算力与云」（CRWV、NBIS…）、「核电与能源」（SMR、OKLO、CEG、VST、GEV…）、「金融科技」（SOFI、HOOD…），SSR 输出链接 + 中文名。

#### 2.1.8 模板 v2 验收（样本组随机抽 10 只）
title/H1 含中文名；`h1n` = 1；`ldn` = 1 且含 Corporation + BreadcrumbList，无 Product/Review；答案块无空值/0/NaN/“--”；股息率断言通过；JSON-LD 通过 Rich Results Test / Schema Validator。

#### 2.1.9 样本组名单（`sample_group_tickers.csv`，共 70 只）
“★”= 当前不在 sitemap（27 只，需按 P0-9 规则加入）。中文名是 CSV 的简体名，英文名的直接用英文。

**第 1 批（50 只，W1–W2 上模板 v2，W2 起上独特模块）**
| 分组 | 代码（简体名） |
|---|---|
| 头部大盘 | TSLA 特斯拉、NVDA 英伟达、SPCX★ SpaceX、AMD、INTC 英特尔、MSFT 微软、MU 美光、ORCL 甲骨文、GOOGL 谷歌、SNDK★ 闪迪、META、AAPL 苹果、AMZN 亚马逊 |
| 热门中大盘 | PLTR Palantir、AVGO 博通、TSM 台积电、NFLX 奈飞、JPM 摩根大通、ASML 阿斯麦、SMCI 超微电脑、MRVL 迈威尔、UNH 联合健康、HOOD Robinhood、GS 高盛、ARM、NVO★ 诺和诺德 |
| 小众/新兴（是什么公司类需求） | CRCL★ Circle、SOFI★ SoFi、NBIS★ Nebius、RKLB★ Rocket Lab、SMR★ NuScale、CRWV★ CoreWeave、OKLO★ Oklo、MSTR★ 微策略、LITE★ Lumentum、IONQ★ IonQ、VRT★ Vertiv、RGTI★ Rigetti、HIMS★ Hims、ALAB★ Astera Labs、NOW ServiceNow、RIVN Rivian、TEM★ Tempus、APP★ AppLovin、QBTS★ D-Wave、VST★ Vistra、GEV★ GE Vernova、CEG★ 星座能源 |
| 中概股 | BABA 阿里巴巴、PDD 拼多多 |

**第 2 批（20 只，W3）**：ANET★ Arista、UBER★ Uber、SHOP★ Shopify、BIDU 百度、COIN Coinbase、JD 京东、LLY 礼来、DELL★ 戴尔、RTX 雷神技术、NIO 蔚来、BRK.B 伯克希尔、COST 好市多、CRWD CrowdStrike、QCOM 高通、SNOW Snowflake、CRM Salesforce、ADBE Adobe、XPEV 小鹏汽车、LI 理想汽车、NET Cloudflare。

**本轮重点 10 页**（先做独特模块）：CRWV、SOFI、NBIS、SMR、PLTR、NVDA、GOOGL、MSFT、AMZN、SPCX（SPCX 只做模板 v2 + sitemap，见 §2.18）。
**对照组**：现有 sitemap 中不在样本组的约 57 只（如 DDOG、MS、BAC、HII、TDG、GPN…）只上模板 v2，独特内容 ≥40% 才留在 sitemap；样本组以外的约 3,610 只保留可访问但 `noindex,follow`。
**MSTR**：只讲业务，不讲币价。

---

### 2.2 /kol/serenity — 白毛股神 · serenity aleabitoreddit 最新（改造，L，W1）

- **目标词**：白毛股神（US 110 / CA 10）；serenity aleabitoreddit 最新（GSC 词簇：33 个查询 397 次展示，排名 8.6，0 点击；修饰词：最新、瓶颈、供应链、涨价、短缺、概念股、2026年9月）；aleabitoreddit（590，副词）。
- **现状**：307 → /research（noindex，16 个汉字）。GSC 1,621 次展示，排名 8.16，0 点击。
- **URL**：`/kol/serenity`（canonical，200）；`/kol/aleabitoreddit` 301 → 这里。
- **Title**：`白毛股神 Serenity（@aleabitoreddit）最新观点：瓶颈理论与提及个股｜TheMarketBrew`
- **Meta**：`追踪白毛股神 Serenity（X：@aleabitoreddit）最新推文观点：AI 供应链瓶颈、涨价与短缺主题、近 30 天提及个股排行，每日更新，附原帖链接。仅供研究参考。`
- **H1**：`白毛股神 Serenity（@aleabitoreddit）最新观点追踪`
- **答案块模板**：`Serenity（X 账号 @aleabitoreddit，中文圈常称"白毛股神"）是在 X 上公开讨论美股的博主，常用"瓶颈理论"分析 AI 供应链里的短缺环节。截至 {date}，近 7 天主要在谈 {top_themes_3}，提及最多的是 {top_tickers_3}。`
- **模块（顺序）**：
  1. 答案块 + `数据更新：{date} ET · 共追踪 {n_posts_30d} 条公开推文`（公开）
  2. 本周观点摘要 150–250 字（公开，§3.4）
  3. 近 30 天观点时间线：公开前 10 条（日期 + 主题标签 + ≤60 字中文摘要 + 原帖链接）；第 11 条以后和完整论据锁 Max
  4. 提及个股排行（公开）：代码 + 中文名 + 提及次数 + 最近一次方向（偏多/偏空/中性）+ 链到 `/stock/{T}#kol`；数据 `personas/{username}/tickers`
  5. 按主题分组（光模块/CPO、激光、存储等，只用真实提及数据）（公开）
  6. 核心框架「什么是"瓶颈理论"」200–300 字常青段落（人工审一次后固定，只描述框架，不评价对错）
  7. FAQ；KOL 声明；免责声明
  8. Max 区（锁定，paywall 标注）：高确信度清单、产业链视图、AI 对话
- **FAQ**：白毛股神是谁？Serenity 的 X 账号是什么？/ Serenity（aleabitoreddit）最新观点是什么？（引用本周摘要第一句 + 日期）/ 什么是 Serenity 的"瓶颈理论"？/ Serenity 最近提到了哪些股票？（列排行前 5，不用“推荐”）/ TheMarketBrew 的 Serenity 观点多久更新一次？（答：自动抓取公开推文、AI 摘要，不代表推荐）。GSC 出现过「概念股 喊单」「推荐」类查询，**不做对应 FAQ**。
- **JSON-LD**：`ProfilePage`（dateModified）+ `mainEntity: Person`（name "Serenity"，alternateName ["白毛股神","aleabitoreddit"]，sameAs ["https://x.com/aleabitoreddit"]）+ `BreadcrumbList`（首页 › 博主观点 › 白毛股神 Serenity）+ `FAQPage`。
- **内链**：入链 — 首页（“用博主视角看待市场”卡片改成链接 + “今天的研报”模块）、/kol hub、/twitter-digest、被提及个股页 #kol、导航栏“KOL 日报”旁；出链 — 提及个股前 10 `/stock/{T}#kol`、/kol/qinbafrank、/twitter-digest。
- **sitemap / 频率**：`kol-0.xml`，lastmod = 最新一条已收录推文时间；时间线每 4 小时（KOL 抓取实际频率未知，以后端为准）；本周摘要每天 07:00 ET。
- **验收**：`status` 200 无跳转；`robots` index；canonical 自身；`han` ≥ 800；`h1n` = 1；JSON-LD 含 ProfilePage+Person；首页和 /twitter-digest 有指向它的 `<a href>`；`/kol/aleabitoreddit` 301 → 本页。

### 2.3 /kol/qinbafrank — qinbafrank（改造，M，W1，与 2.2 共用模板）

- **目标词**：qinbafrank（US 10 / CA 未知；GSC：页面 892 次展示、排名 4.81、4 次点击；「qinbafrank」排名 3.84；「from:qinbafrank」排名 2.75）。
- **现状**：307。仓库根页面渲染 `QinbafrankMaxLandingClient`（Max 销售页）。子页 /latest、/highlights、/sectors、/stocks 也有展示但锁 Max。
- **Title**：`qinbafrank 最新观点：美股、宏观与板块观点追踪（@qinbafrank）｜TheMarketBrew`
- **Meta**：`整理 qinbafrank（X：@qinbafrank）每日公开推文：最新美股与宏观观点、板块看法、近 30 天提及个股，附原帖链接，每日更新。仅供研究参考。`
- **H1**：`qinbafrank 最新观点追踪`
- **答案块模板**：`qinbafrank（X：@qinbafrank）是用中文在 X 上分享美股与宏观观点的博主。截至 {date}，该博主近 7 天主要讨论 {top_topics_3}，提及最多的标的是 {top_tickers_3}；以下为按日期整理的观点摘要和原帖链接。`（代称用“该博主”，不确认性别前不用“他”）
- **模块**：答案块 → 本周摘要 → 时间线前 10 条 → **板块观点摘要**（复用 /sectors 数据，每个板块公开一句结论，展开锁定）→ 提及个股 → FAQ → Max 区（保留销售文案，但下移到正文之后）。
- **FAQ**：qinbafrank 是谁？/ qinbafrank 最近怎么看美股？/ qinbafrank 最近怎么看 AI 板块？/ qinbafrank 最近提到哪些股票？/ 在哪里看 qinbafrank 的原帖？
- **子页**：/latest、/highlights、/sectors、/stocks 匿名 200 + teaser + `noindex,follow`，链回根页。
- **不做**：GSC 里落到本页的「加密货币 xxx 实时行情」「币对 xxx 看多事件」类查询（意图错配，加密不在覆盖范围）。
- **JSON-LD / 内链 / sitemap / 频率**：同 2.2（Person.sameAs = https://x.com/qinbafrank）。
- **验收**：同 2.2，`han` ≥ 800；子页 `robots` 含 noindex 且 200。

### 2.4 /kol — 博主观点 hub（恢复，S–M，W1）

- **目标词**：美股博主、推特博主等长尾（量未知）；主要作用是给两个 KOL 页提供入链。
- **Title**：`美股推特博主观点汇总：Serenity、qinbafrank 等中文大V每日观点｜TheMarketBrew`
- **H1**：`美股推特博主观点汇总`
- **答案块**：`TheMarketBrew 每天整理 {n_kol} 位美股推特博主的公开观点，包括白毛股神 Serenity（@aleabitoreddit）和 qinbafrank，按博主列出最近观点与提及最多的个股，附原帖链接。`
- **模块**：KOL 卡片（简介、最近一条观点一句话摘要、提及前 5 代码，链到 /kol/{slug} 和 /stock/{T}#kol）；FAQ 2–3 条（TheMarketBrew 追踪哪些博主？/ 观点多久更新？/ 这些观点是投资建议吗？）；KOL 声明。
- **JSON-LD**：`CollectionPage` + `BreadcrumbList` + `FAQPage`。
- **sitemap**：`kol-0.xml`，lastmod = 各 KOL 最新推文时间的最大值。
- **验收**：200、index、`han` ≥ 300，含指向两个 KOL 页的链接。

### 2.5 /today — 美股大跌原因 · 美股今天为什么跌/涨（微调，S–M，W1）

- **目标词**：美股大跌原因（90/30）；美股今天为什么跌（20/10）；美股今天为什么涨（20/10）；美股大跌 480/110、美股暴跌 170/40 顺带。GSC：页面 1,315 次展示，排名 8.22，CTR 约 0.15%。
- **现状**：title「美股每日报告 - AI 智能市场分析 | TheMarketBrew」；H1 是当天新闻标题且重复 2 次；SSR 5,340 汉字；hub 无 JSON-LD；日报 22:00Z = 18:00 ET 生成；已有「近期事件」（10/16 列出 NFLX 10/20、META 10/21、TSLA 10/21、FOMC 10/28、MSFT 10/28）。
- **Title**：`美股今天为什么涨跌？今日收盘复盘与大跌原因（每日更新）｜TheMarketBrew`
- **Meta**：`每个交易日收盘后更新：美股今天为什么涨/跌、三大指数与 VIX 表现、主要驱动事件与后续关注，AI 中文复盘，附历史归档。仅供研究参考。`
- **H1（固定）**：`美股今天为什么涨跌：每日收盘复盘`；**H2（当天）**：`{date} 收盘：{当天标题}`
- **答案块模板**：`美股 {M月D日} 收盘：{领涨/领跌指数} {ndx_chg}、标普 500 {spx_chg}。主要原因是{原因1}，同时{原因2}。`
  - 样例（10/16 日报回填）：`美股 10 月 16 日收盘：纳指跌 2.15%、标普 500 跌 1.09%。主要原因是 AI 基建债务与资本开支回报担忧从 CoreWeave 等算力服务商扩散到芯片和云软件板块，同时油价重上 100 美元推升通胀担忧。`
  - 非交易日：`美股 {weekday}（{date}）休市。最近一个交易日 {last_date}：{last_answer}`（休市日期取 §2.17 的休市表）。
- **模块调整**：
  1. 答案块下新增「美股为什么涨跌：近 10 个交易日时间线」（公开）：日期 + 纳指/标普涨跌幅 + 一句原因 + 链 `/today/{date}-market-report`。
  2. **个股自动内链**：日报正文出现的公司（代码 / 中文名 / 英文名，按别名表匹配）自动链到 `/stock/{T}`（每篇每个代码只链第一次出现）。这是 CRWV 等页面被发现的主要入链。
  3. 「近期事件」里的财报条目链到 `/stock/{T}#earnings`。
  4. 「往期报告」只显示最近 7 天，其余进 `/today/archive`；archive 现在 SSR 只有 26 个汉字，列表要 SSR。
  5. 页面里的 VIX 数字链到 /macro/sentiment。
- **FAQ**：美股今天为什么跌？/ 美股今天为什么涨？/ 最近美股大跌的原因是什么？（链时间线）/ 美股几点收盘、日报几点更新？/ VIX 恐慌指数今天是多少？（链 /macro/sentiment）
- **JSON-LD**：`WebPage` + `hasPart: Article`（当天日报 headline/datePublished）+ `BreadcrumbList` + `FAQPage`；日期页保留 Article 但去重为一次。
- **内链**：出链 当日 /morning、提及个股、/macro/sentiment、/macro/liquidity、/kol/*、/guide/us-market-hours；入链 首页、/morning、所有个股页 #why。
- **sitemap / 频率**：/today lastmod = 当天日报生成时间；日期页现有真实 lastmod 保持；每个交易日 18:00 ET。
- **验收**：title/H1 如上；`h1n` = 1；`ldn` = 1；答案块存在且无空值；`han` ≥ 3,000；10/16 日报中 CoreWeave 链到 `/stock/CRWV`；archive `han` ≥ 300。

### 2.6 /morning — 美股盘前分析 · 美股盘前（微调，S–M，W1）

- **目标词**：美股盘前分析（40/10，CPC $24.30）；美股盘前（390/90，CPC $31.15）。GSC：页面 1,067 次展示，排名 7.21，7 次点击。
- **现状**：title「盘前早报 | TheMarketBrew」；H1「盘前早报」×2；SSR 874 汉字；期货数据和“三个要点”（机械罗列涨跌幅）公开，“期货走势解读”“全球市场解读”锁定；无 JSON-LD；10/16 早报生成于 13:00:50Z = 09:00 ET；日期页无 H1、442 汉字。
- **Title**：`美股盘前分析：今日美股期货、隔夜要闻与盘前异动（每日更新）｜TheMarketBrew`
- **Meta**：`每个交易日美东早上更新的美股盘前分析：标普/纳指/道指期货、VIX、美债与原油，隔夜要闻与今日关注事件，AI 中文解读。仅供研究参考。`
- **H1（固定）**：`美股盘前分析（每日更新）`；**H2**：`{date} 盘前：{当天标题}`
- **答案块模板**：`{date} 美股盘前：标普 500 期货 {es_chg}、纳指期货 {nq_chg}、道指期货 {ym_chg}，VIX {vix}。隔夜主线是{theme_1}。`
  - 样例（10/16 已发布数据）：`2026-10-16 美股盘前：标普 500 期货 +0.15%、纳指期货 −0.23%、道指期货 +0.14%，VIX 15.98。隔夜主线是沃什讲话缓解加息忧虑，科技股期货相对偏弱。`
- **公开 / 锁定**：
  - 公开：“期货走势解读”第一段（150–250 字）+「今日关注」列表（财报、经济数据、美联储讲话；复用日报 `calendar` 字段）；“三个要点”改为**事件型要点**（§3.2）；盘前异动个股 Top 5（链 `/stock/{T}#why`）。
  - 锁定（paywall 标注）：“全球市场解读”全文、个股异动深度解读、邮件推送。
- **固定说明区**（页面底部约 150 字常青）：盘前交易时段美东 4:00–9:30（各券商开放时间不同）；本页每个交易日约 09:00 ET 更新；覆盖哪些指标；同时标北京/台北时间；链到 `/guide/us-market-hours`。
- **FAQ**：今天美股盘前怎么看？/ 美股盘前交易时间是几点（北京时间）？/ 美股期货和盘前股价有什么区别？/ 本页几点更新？
- **JSON-LD**：`WebPage`（dateModified = 当天早报生成时间）+ `hasPart: Article`（headline、datePublished）+ `BreadcrumbList` + `FAQPage`；日期页 Article 去重，补 H1。
- **内链**：出链 前一交易日 /today、/guide/us-market-hours、提及个股（自动识别）、/macro/sentiment（VIX）；入链 首页、/today、/guide/us-market-hours。
- **sitemap / 频率**：/morning lastmod = 当天早报生成时间；日期页公开正文 ≥300 字才 index。每个交易日 1 次（现约 09:00 ET；建议提前到 08:00 ET 前，这只是建议，搜索时段分布未知，需产品确认）。
- **验收**：title/H1 如上；`h1n` = 1（hub 和日期页）；匿名可见解读第一段；日期页公开解读 ≥300 字；`ldn` = 1。

### 2.7 / 首页 — 美股 AI 研报（微调，S，W2）

- **目标词**：美股 AI 研报（量未知；「美股研报」US 10 / CA 10）。GSC：「美股研报」排名 8，「美股研究室」12，「美股日报」10。
- **现状**：title「TheMarketBrew - AI 美股分析平台」；H1「你的 AI 投研团队」；1,405 汉字；JSON-LD 有 Organization + WebSite；只有 9 个内链。
- **Title**：`TheMarketBrew：中文 AI 美股研报、每日美股日报与博主观点`
- **Meta**：`面向华人投资者的中文 AI 美股研究平台：AI 个股研报、每日盘前早报与收盘复盘、推特美股博主观点追踪、宏观仪表盘。免费版可看每日日报。`
- **H1**：`中文 AI 美股研报与每日美股日报`（「你的 AI 投研团队」降为副标题）
- **答案块**（静态）：`TheMarketBrew 是面向华人投资者的中文 AI 美股研究网站：每个交易日生成盘前早报和收盘复盘，追踪 qinbafrank、Serenity 等推特博主观点，并提供 AI 个股研报与宏观仪表盘。免费版可看每日市场日报。`
- **新增模块「今天的研报」**（SSR）：当天 /today 与 /morning 的标题 + 答案块各 1 条、样本个股 10 个（中文名 + 链接）、2 个 KOL 页链接、/macro/sentiment 链接；页脚加 /guide/us-market-hours。
- **FAQ（3–4 条）**：有没有中文的 AI 美股研报网站？/ TheMarketBrew 免费版包含什么？（直接用 /pricing 原文）/ AI 生成的研报准确吗，数据从哪来？（链 /about）
- **JSON-LD**：保留 Organization + WebSite，补 `sameAs`（TMB 官方 X 账号，**账号地址需确认，未知则不加**）；`SearchAction` 只有存在站内搜索 URL 时才加；FAQPage。
- **不做**：不新建 `/ai-stock-research`。
- **验收**：title/H1 如上；首页内链数 ≥ 20，含 /kol/serenity、/kol/qinbafrank、≥10 个 /stock/。

### 2.8 /stock/CRWV — crwv 是什么公司 · CoreWeave为什么跌（改造，W1 模板 + W2 模块）

- **目标词**：crwv 是什么公司（70/20）；CoreWeave是什么公司（50/10）；CoreWeave为什么跌（未知）；crwv 股票 880。
- **现状**：200，704 汉字，title 英文全称，不在 sitemap，GSC URL Inspection“Google 无法识别此网址”；同板块链半导体。
- **Title**：`CoreWeave(CRWV)是什么公司？最近为什么跌｜股价与AI解读｜TheMarketBrew`（#why 方向转涨时换成“最近为什么涨”，切换规则同 §2.12）
- **Meta**：`CoreWeave（代码 CRWV）是专注 GPU 算力的 AI 云服务商。查看最新股价、近期涨跌原因时间线、博主观点与财报日期，AI 每日更新。仅供研究参考。`
- **H1**：`CoreWeave（CRWV）是什么公司？最近为什么跌？`
- **别名行**：`又称：CoreWeave / CRWV`（中文译名无可靠来源，不写）
- **答案块模板**：`CoreWeave（CRWV）是专注 GPU 算力租赁的 AI 云服务商，{ipo_date_text}在纳斯达克上市，主要为 AI 模型训练和推理提供算力。截至 {date} 收盘报 {price} 美元（{chg}）；近期波动主要与{why_latest_short}有关。`（上市时间取数据层；page_mapping 草稿写的是 2025 年 3 月，入库前核对）
- **#about**（150–300 字）：GPU 云基础设施；客户集中度（按 10-K 披露占比，数字由数据层提供）；竞争对手（链 NBIS、ORCL、AMZN）；主题 AI 算力。
- **#why 样例**：`10/16（{chg_1016}）：TMB 日报指出，市场对 CoreWeave 等新型算力服务商的高额债务偿付与 AI 变现周期错配的担忧升温，抛售扩散至芯片与云软件板块。→ 查看当日复盘`
- **FAQ**：CoreWeave 是什么公司？/ CRWV 是哪家公司的股票代码，在哪上市？/ CoreWeave 最近为什么跌？/ CoreWeave 的主要客户是谁？/ CoreWeave 下一次财报是什么时候？/ 投资 CoreWeave 需要关注哪些风险？（债务、客户集中度，只写事实）
- **同主题**：NBIS、NVDA、ORCL。
- **验收**：模板 v2 通用验收 + 在 stock-0.xml + /stock hub「AI 算力与云」分组 + /today 10/16 日报链到本页 + #about/#why 出现在 SSR HTML。

### 2.9 /stock/SOFI — sofi 是什么公司

- **目标词**：sofi 是什么公司（170/40）；SoFi股票 1,000。
- **Title**：`SoFi(SOFI)是什么公司？股价、业务与财报解读｜TheMarketBrew`
- **Meta**：模板 v2 默认，中文名 = SoFi。
- **H1**：`SoFi Technologies（SOFI）是什么公司？`
- **答案块模板**：`SoFi Technologies（SOFI）是美国的线上金融服务公司，提供个人贷款、学生贷款再融资、银行储蓄和投资服务，并通过旗下 Galileo 向其他金融机构提供技术平台；2022 年取得美国国民银行牌照。截至 {date} 收盘报 {price} 美元（{chg}）。`（事实句入库前与 10-K 核对）
- **FAQ**：SoFi 是什么公司？/ SoFi 是银行吗？/ SOFI 在哪个交易所上市？/ SoFi 下一次财报是什么时候？/ SoFi 最近为什么涨（跌）？
- **同主题**：保留 JPM/BAC，加 HOOD。hub 分组「金融科技」。
- **验收**：同 2.8。

### 2.10 /stock/NBIS — nbis 是什么公司

- **目标词**：nbis 是什么公司（140/30，另有繁体 40）；nbis 股票 880。
- **Title**：`Nebius(NBIS)是什么公司？AI云算力业务、股价与解读｜TheMarketBrew`
- **H1**：`Nebius Group（NBIS）是什么公司？`
- **别名行**：`又称：Nebius / NBIS`（「尼比斯」需确认来源，未确认不写）；不做繁体页。
- **答案块模板**：`Nebius Group（NBIS）是总部位于荷兰阿姆斯特丹的 AI 基础设施公司，前身是 Yandex N.V.，2024 年剥离俄罗斯业务后更名，主营 GPU 云算力服务，在纳斯达克交易。截至 {date} 收盘报 {price} 美元（{chg}）。`
- **FAQ**：Nebius 是什么公司？/ Nebius 和 Yandex 是什么关系？/ NBIS 和 CoreWeave 有什么区别？（事实对比表：业务、上市时间、总部、营收规模由数据层提供）/ NBIS 最近为什么涨跌？
- **同主题**：CRWV、NVDA、ORCL。
- **验收**：同 2.8。

### 2.11 /stock/SMR — smr 是什么公司

- **目标词**：smr 是什么公司（90/10）；smr 股票 1,000。
- **Title**：`SMR是什么公司？NuScale Power股票、核电业务与解读｜TheMarketBrew`
- **H1**：`SMR 是什么公司？NuScale Power（SMR）股票`
- **答案块模板（首句先消歧）**：`SMR 是 NuScale Power 在纽交所的股票代码，也是"小型模块化反应堆（Small Modular Reactor）"的英文缩写。NuScale 是美国的小型模块化核反应堆设计公司，2022 年通过 SPAC 上市。截至 {date} 收盘报 {price} 美元（{chg}）。`
- **#about** 加一段「SMR（小型模块化反应堆）是什么」80–120 字，链 OKLO 等核电页。
- **FAQ**：SMR 是什么公司？/ SMR 是什么意思（核电）？/ NuScale 的反应堆获得美国核管会批准了吗？（只写有公开来源、带日期的事实，人工审核）/ SMR 最近为什么涨跌？
- **修正**：行业现显示「工业 / Electrical Equipment & Parts」，同板块链军工股 → 改核电主题（OKLO、CEG、VST）；hub 分组「核电与能源」。
- **验收**：同 2.8；HTML 中不再出现指向 /stock/BA、/stock/LMT、/stock/NOC 的同板块链接。

### 2.12 /stock/PLTR — pltr为什么一直跌

- **目标词**：pltr为什么一直跌（未知）；pltr 股票 1,900。现状：在 sitemap，但 GSC“无法识别”。
- **Title（随方向切换）**：最近 20 个交易日累计下跌 → `Palantir(PLTR)为什么一直跌？近期下跌原因时间线｜TheMarketBrew`；上涨 → `Palantir(PLTR)最近为什么涨？涨跌原因与AI解读｜TheMarketBrew`。**每 7 天最多切换一次**（防 title 抖动；记录 `title_variant_changed_at`）。
- **H1**：`Palantir（PLTR）最近为什么{涨/跌}？`
- **答案块模板**：`Palantir（PLTR）是美国数据分析与 AI 软件公司，产品包括 Gotham、Foundry 和 AIP。截至 {date}，PLTR 较 52 周高点 {drawdown_from_high}，近 20 个交易日 {chg_20d}；主要原因见下方按日期整理的时间线。`
- **#why（核心）**：最近 5–10 次单日 ±3% 事件 + 一行「区间总结」（LLM 只根据这些事件写，≤60 字，每条原因可追溯到某天日报段落）。
- **FAQ**：PLTR 为什么一直跌？/ Palantir 是做什么的？/ Palantir 下一次财报是什么时候？/ Palantir 的估值高吗？（只给 P/E、P/S 和行业对比数据，不下结论）
- **验收**：模板 v2 通用验收 + #why ≥5 条（数据不足时显示已有条目）+ 区间总结存在。

### 2.13 /stock/NVDA — 美股博主怎么看英伟达（#kol 样板）

- **目标词**：美股博主怎么看英伟达（未知，代表「博主怎么看{股票}」整类）；英伟达股票 22,200（头部词，不投内容，模板自然承接）。
- **Title**：`英伟达(NVDA)股票：博主观点、涨跌原因与财报解读｜TheMarketBrew`
- **H1**：`英伟达（NVDA）`；副标题 `NVIDIA Corporation · NASDAQ · 半导体`；别名行 `英伟达 / 輝達 / NVIDIA`
- **答案块模板**：`英伟达（NVDA）是全球主要的 GPU 与 AI 加速芯片设计公司。截至 {date} 收盘报 {price} 美元（{chg}）；最近 30 天 TMB 追踪的 {n_kol} 位美股博主 {n_posts} 次提到英伟达，偏多 {bull} / 偏空 {bear} / 分歧 {disputed}。`
- **#kol 模块**（H2 `美股博主怎么看英伟达？`）：结论 `最近 30 天，{n_kol} 位博主讨论英伟达，主要分歧在 {point_bull} 与 {point_bear}。`；表格公开 10 条；更多锁 Pro；声明 `观点来自博主公开发言，仅代表其本人，不构成投资建议。`
- **数据**：现有 `/twitter/ticker-discussion?symbol=NVDA&hours=168` 有中文摘要但需登录 → **新增可缓存的公开精简接口**（只返回统计 + 摘要 + 原帖链接，不暴露推文全文）；30 天窗口从 `kol_daily_digests.ticker_theses` 按日聚合（字段 side、primary_kols、tweet_count、stance_summary）。
- **FAQ**：美股博主怎么看英伟达？/ 英伟达最近为什么涨（跌）？/ 英伟达下一次财报是什么时候？/ 英伟达发股息吗，股息率多少？（P0-2 修好后才上）
- **推广**：#kol 适用于近 30 天被 ≥2 位博主提到的所有样本股；否则整块隐藏。
- **验收**：`html /stock/NVDA | grep -c 英伟达` ≥ 3；#kol 表格在 SSR HTML 里；股息率卡片 ≈ 概览区值。

### 2.14 /stock/GOOGL（+ MSFT、AMZN）— 谷歌财报（#earnings 样板，W1 公开版必须在 10/28 前）

- **目标词**：谷歌财报（260/40）；微软财报（170/40）；亚马逊财报（110/20）。SERP 前 10 没有一条中文解读。
- **现状**：页面有“财报”Tab，但 SSR HTML 只有季度表。
- **Title（自动切换，三只股票同规则）**：
  - 财报前 14 天到发布当天：`谷歌(GOOGL)财报：{季度}财报日期、预期与AI解读｜TheMarketBrew`
  - 发布后 14 天内：`谷歌(GOOGL){季度}财报解读：营收、EPS与云业务要点｜TheMarketBrew`
  - 其余时间：模板 v2 默认 title
  - MSFT/AMZN 替换为 `微软(MSFT)`、`亚马逊(AMZN)`，“云业务”按公司实际分部改写（MSFT 财年与自然年不同，`{季度}` 标签以数据层/公司公告为准）。
- **H1**：`谷歌（GOOGL）`；#earnings H2：`谷歌财报：{季度}业绩怎么样？`
- **答案块（财报前）**：`谷歌母公司 Alphabet（GOOGL）预计于 {next_earnings_date}（{bmo_amc}）发布 {季度} 财报，市场预期 EPS {eps_est} 美元、营收 {rev_est}。上一季营收 {rev_last}，EPS {eps_last}，{beat_or_miss_last} 预期。`
- **答案块（财报后）**：`Alphabet（GOOGL）{季度}财报已于 {date} 发布：营收 {rev}（预期 {rev_est}），EPS {eps}（预期 {eps_est}）；{盘后/次日}股价 {reaction}。要点：{point_1}；{point_2}。`
- **#earnings 模块（公开）**：财报日期（“已确认/预估”）→ 近 4 季预期 vs 实际表 → 分部收入（`earnings-data` revenue segments）→ AI 速读第一段 150–250 字（W2）→ 电话会要点 3 条（`/transcript`，有才显示）→ 博主怎么看（复用 #kol）。锁定：完整 AI 财报分析（`POST /{symbol}/earnings`），paywall 标注。
- **日期**：MSFT 10/28 来自 TMB 10/16 日报「近期事件」（未与 IR 核对）；**GOOGL、AMZN 下一次财报日期未知**，由 `EventCalendarCard.earningsDate` 或 FMP earnings-calendar 填充，以公司 IR 公告为准；未确认时标“预估”。
- **FAQ**：谷歌财报什么时候公布？/ 谷歌上一季财报怎么样？/ 谷歌云（Google Cloud）收入增长多少？/ 谷歌财报后股价怎么走？（只写已发生的事实）
- **子页** `/stock/GOOGL/earnings`：**先不拆**（#earnings ≥600 字且 GSC 显示财报词与行情词明显分流后再评估）。
- **验收**：`html /stock/GOOGL` SSR 中含下次财报日、近 4 季表；在财报日前 14 天内 title 为“财报”版；MSFT/AMZN 同样通过；10/27 前在生产可见。

### 2.15 /macro/sentiment — 恐慌贪婪指数（改造，M，W2）

- **目标词**：恐慌贪婪指数（480/170，CPC $21.84）；美股恐慌贪婪指数（110/30，$20.45）；vix恐慌指数 590。GSC 0 展示；「美股恐慌指数」落在 /macro，排名 52。
- **现状**：title「市场情绪 - 恐惧贪婪指数、VIX 与资金流向」（无品牌，用“恐惧”，用户搜“恐慌”）；H1「市场情绪」；SSR 65 汉字、无数值；整页 `'use client'`；后端 `/macro/sentiment` 返回 CNN 综合分（0–100）+ 7 分项 + 4 个市场指标。
- **Title**：`美股恐慌贪婪指数与VIX恐慌指数：今日市场情绪｜TheMarketBrew`
- **Meta**：`美股恐慌贪婪指数（CNN Fear & Greed）与 VIX 恐慌指数今日读数、历史分位与中文解读，每个交易日更新。本页为美股版，非加密货币指数。仅供参考。`
- **H1**：`美股恐慌贪婪指数与 VIX：今日市场情绪`
- **答案块模板**：`截至 {date} {time} ET，CNN 美股恐慌贪婪指数为 {fg}（{fg_label}），VIX 恐慌指数 {vix}（{vix_chg}），处于近一年 {vix_pct} 分位。恐慌贪婪指数由 CNN 用 7 项市场指标合成，0 代表极度恐慌，100 代表极度贪婪。`
  - **CNN 许可未确认前的备用模板（feature flag `SENTIMENT_USE_CNN=false`）**：`截至 {date} {time} ET，VIX 恐慌指数为 {vix}（{vix_chg}），处于近一年 {vix_pct} 分位；看跌/看涨比率 {put_call}，市场宽度 {breadth}。恐慌贪婪指数由 CNN 编制，原始读数请见 CNN 官网。`（数据来自 FRED/CBOE 等公开源；链接 CNN 原页）
- **模块**：答案块 → 读数卡（数值以文本 SSR，不能只有图）→ 「7 个分项是什么、现在各在什么区间」表格（CNN 模式）或自建面板指标表（备用模式）→ 「历史极端值对照」（只列有数据的日期和读数）→ 「今天日报怎么看情绪」（引用当日 /today 中 VIX 相关句子并链接）→ **消歧段**「本页是美股恐慌贪婪指数，不是加密货币恐慌贪婪指数」→ FAQ。
- **FAQ**：恐慌贪婪指数是什么？/ 美股恐慌贪婪指数今天多少？/ VIX 恐慌指数多少算高？/ 恐慌贪婪指数和 VIX 有什么区别？/ 恐慌贪婪指数在哪里看？
- **JSON-LD**：`WebPage`（dateModified）+ `BreadcrumbList`（首页 › 宏观 › 市场情绪）+ `FAQPage`；有可见 VIX 历史表时可加 `Dataset`。
- **内链**：入链 /today 与 /morning 的 VIX 数字、/macro hub、首页；出链 /today、/macro/liquidity。
- **sitemap / 频率**：lastmod = 读数更新日期（交易日）；读数交易日每小时或按数据源节奏（未知）；解读每日 1 次。
- **验收**：`han` ≥ 500；VIX 数值出现在 SSR HTML；`h1n` = 1；默认 `SENTIMENT_USE_CNN=false`，直到许可确认。

### 2.16 /macro/liquidity — 美联储资产负债表 · 流动性状况（微调，S，W2）

- **目标词**：美联储资产负债表（70/10）；流动性状况（GSC 排名 4.75）；逆回购 90/10、tga账户 20/10 顺带。GSC 页面 490 次展示，排名 7.98。
- **现状**：title「美元流动性状况与趋势分析」（无品牌）；H1「流动性环境」；SSR 494 汉字，已有 W42 分析与 WALCL/TGA/RRP/净流动性数值（来源 FRED）；无 JSON-LD；最新分析生成于 2026-10-17 22:01 ET。
- **Title**：`美联储资产负债表与美元流动性状况：TGA、逆回购每周更新｜TheMarketBrew`
- **Meta**：`每周更新美联储资产负债表（总资产 WALCL）、财政部 TGA 账户、隔夜逆回购与银行准备金，计算净流动性并给出中文解读，判断美股流动性状况。`
- **H1**：`美联储资产负债表与美元流动性状况`
- **答案块模板**：`截至 {week_end}，美联储总资产（WALCL）为 {walcl}，周变动 {walcl_chg}；扣除 TGA {tga} 与逆回购 {rrp} 后，净流动性 {net_liq}，处于近一年 {pct} 分位。整体判断：{one_line_view}。`
- **改动**：拆 3 个问句 H2（`美联储资产负债表是什么？` / `TGA 和逆回购怎么影响流动性？` / `现在美股流动性状况怎么样？`）；数值卡 SSR；加「近 12 周净流动性表」（文本表格）；`/liquidity` 301 → 本页（P0-6）。
- **FAQ**：美联储资产负债表现在多少？/ 美联储缩表结束了吗？（只引用美联储官方声明并写日期，人工审核）/ 净流动性怎么算？/ 逆回购下降意味着什么？
- **JSON-LD**：`WebPage` + `BreadcrumbList` + `FAQPage`（有可见表格可加 `Dataset`）。
- **sitemap / 频率**：每周（WALCL 周四发布后）；lastmod = 分析生成时间。
- **验收**：title/H1 如上；`han` ≥ 600；12 周表在 SSR HTML；`status /liquidity` 301。

### 2.17 /guide/us-market-hours — 美股休市时间2026 · 美股开盘时间（**唯一新建页**，M，**10/30 前上线**，目标 W1 完成）

- **目标词**：美股开盘时间（1,300/390，CPC $7.80，有 AIO，零点击风险高）；美股休市时间（260/210）；美股休市时间2026（170/170）；美股收盘时间（170/40）；美股盘后交易时间 70；美股盘前交易时间 50。
- **截止原因**：美国 2026-11-01（周日）结束夏令时，北京时间开盘从 21:30 变 22:30，查询集中。
- **Title**：`美股开盘时间、收盘时间与2026休市日历（北京/台北/温哥华时间对照）｜TheMarketBrew`
- **Meta**：`美股几点开盘？常规交易时间为美东 9:30–16:00。2026 年 11 月 1 日起恢复冬令时，北京时间 22:30 开盘。附 2026 全年 NYSE 休市日、提前收盘日与各地时差表。`
- **H1**：`美股开盘时间与 2026 年休市日历`
- **答案块**（已于 2026-10-18 与 nyse.com/markets/hours-calendars 核对）：`美股常规交易时间为美东时间 9:30–16:00。2026 年 11 月 1 日起美国恢复冬令时，对应北京时间 22:30 至次日 5:00（夏令时期间为 21:30–4:00）；温哥华 6:30–13:00，多伦多与纽约同时区。`
- **模块**：
  1. 「现在开盘了吗」状态条：客户端每分钟计算；**SSR 先输出静态文本** `下一个交易日：{date}`（构建/请求时由服务端按休市表计算），避免 Googlebot 抓到空值。
  2. 时段表：盘前 4:00–9:30、常规 9:30–16:00、盘后 16:00–20:00（美东，NYSE Arca 早盘/晚盘；写明各券商开放时间不同）。
  3. 时区换算表：纽约、洛杉矶、温哥华、多伦多、北京/台北/香港/新加坡，夏令时、冬令时各一列（由程序按 IANA 时区计算，不手写）。
  4. 2026 休市表（存数据层，入库时以 NYSE 官网为准、发布前人工核对一次）：1/1、1/19、2/16、4/3、5/25、6/19、7/3（独立日调休）、9/7、11/26、12/25 休市；**11/27、12/24 13:00 ET 提前收盘**。同时录入 2027（NYSE 官网已列出，录入时从官网取）。
  5. 夏令时说明（切换日期由程序计算）。
  6. 内链：/morning、/today。
- **FAQ**：美股几点开盘（北京时间）？/ 美股几点收盘？/ 2026 年美股哪天休市？/ 美股感恩节休市吗？/ 美股夏令时和冬令时什么时候切换？/ 美股盘前盘后交易时间是几点？
- **JSON-LD**：`WebPage` + `BreadcrumbList` + `FAQPage`；**不用 Event**。
- **内链**：入链 /morning 与 /today 固定说明区、/today 非交易日答案块、首页页脚、llms.txt；出链 /morning、/today。
- **sitemap / 频率**：加入 `static.xml`；lastmod 只在休市表或时令变化时更新；每年 1 次（NYSE 公布新日历）+ 每次夏令时切换前复核。
- **共享**：休市表作为共享数据（`market_holidays`），/today 非交易日判断复用。
- **验收**：200、index、`han` ≥ 600；休市表与 NYSE 官网逐条一致；单元测试覆盖 2026-10-31（夏令时，北京 21:30）与 2026-11-02（冬令时，北京 22:30）的换算；SSR HTML 含“下一个交易日”文本；在 static.xml 中。

### 2.18 连带页面（不在 20 词内，顺带做）

- **/twitter-digest**（GSC 802 次展示，SSR 空）：W1 日期页 noindex + 移出 sitemap（P0-7）；W3 hub 用 `/teaser/latest` SSR（H1 `美股博主观点简报（每日更新）`、当天热门标的/主题 teaser、链到 /kol/* 和 /stock/{T}#kol），`han` ≥ 300；日期页公开摘要 ≥300 字后恢复 index。
- **/stock/SPCX**（降级）：spacex 股票 12,100/4,400，但 10/18 SERP 实测全是行情页，用户要的是报价，**不单独投内容**。只做：模板 v2（title `SpaceX(SPCX)股票：股价、上市表现与AI解读｜TheMarketBrew`，H1 `SpaceX（SPCX）`，答案块 `SPCX 是 SpaceX（太空探索技术公司）的美股交易代码。截至 {date} 收盘报 {price} 美元（{chg}）；上市日期 {ipo_date}，发行价 {ipo_price} 美元。`，上市日期/发行价取数据层，没有就删整句）+ 加入 sitemap。#about/#why 随第 1 批常规流程。
- **/stock/MSFT、/stock/AMZN**：#earnings 同 §2.14。

---

## 3. 内容自动生成规则

### 3.1 数据来源 → 模块（以生产代码为准）

| 流水线 / 接口 | 现有字段 | 供给模块 |
|---|---|---|
| 收盘日报 `daily_report`（`/market/reports/latest`、`/date/{date}`），约 18:00 ET | title、summary、intro、`news.headlines[]`（title、fact_summary、deep_analysis、published_at）、`briefs[]`、`report_summary[]`、`calendar[]`（date、event、analysis） | /today 答案块、时间线；个股 #why；「近期事件」与 #earnings 日期交叉校验 |
| 盘前早报 `morning_report`（`/morning/reports/latest`），约 09:00 ET | 期货、全球指数、解读（锁定） | /morning 答案块、今日关注、事件型要点 |
| 推特简报 `twitter_digest`（`/{date}`、`/teaser/latest` 公开） | hot_tickers、hot_sectors、hot_events、`ticker_theses[]`（ticker、side、primary_kols、tweet_count、stance_summary）、macro_threads、watchpoints | 个股 #kol（30 天聚合）、/twitter-digest teaser、/kol hub |
| KOL cockpit `kol_research`（`personas/{u}/profile`、`/tickers`、`/feed`、`/tickers/{t}/timeline`、`/sectors`） | 提及次数、价格、ticker summary、推文流 | /kol/serenity、/kol/qinbafrank 全部模块 |
| `/twitter/ticker-discussion?symbol=&hours=`（需登录） | 24–168h 推文 + `generate_chinese_discussion_summary` | **新增公开可缓存精简接口**（统计 + 摘要 + 原帖链接，不含推文全文） |
| 个股 `stock`（`/{s}/profile`、`/earnings-data`、`/transcript`、`/news-feed`、`EventCalendarCard`） | company_name_zh、description（英文）、财报历史/预期/分部、电话会文本、下次财报日、EPS 预期 | #about、#earnings、答案块 |
| 宏观 `macro`（`/sentiment`、liquidity 周报） | 读数、周变动、分位 | /macro/sentiment、/macro/liquidity 答案块 |
| NYSE 官方日历（手工入库，每年一次） | 休市日、提前收盘日 | /guide/us-market-hours；/today 非交易日判断 |

### 3.2 通用生成规则（所有自动模块）

1. **输入**：结构化 JSON（数值、单位、来源、时间戳）+ 可引用的原文段落（带 source_id）。
2. **LLM 只写措辞**，数字一律输出占位符（如 `{ndx_chg}`），由模板填值。
3. **数值回查**：渲染后的文本里每个数字都必须能在输入 JSON 里找到（允许格式化差异：百分号、千分位、保留位数），找不到 → 拦截，保留上一版。
4. **长度**：答案块 40–80 汉字；#why 每条 ≤60 字；KOL 摘要每条 ≤60 字；区间总结 ≤60 字；本周摘要 150–250 字。
5. **归因只能来自输入段落**，不得“补充背景”；无可引用原因时写“当日未见公司特定消息，走势与{板块/大盘}一致”。
6. **合规扫描**：§2.0.7 禁用词 + “建议买入/卖出/加仓/减仓/目标价将达/一定/必然”；命中 → 拦截转人工队列。
7. **数据一致性 QA**（发布前自动）：
   - 方向一致：答案块的“涨/跌”与 `chg` 正负一致；/today 以 ndx_chg 与 spx_chg 为准，方向相反写“分化”。
   - 同一指标在答案块、卡片、表格中数值一致（同一 `data_version`）。
   - 日期一致：答案块 `{date}` = 数据时间戳日期；非交易日走休市文案。
   - 单位健全性：股息率 >25%、单日涨跌 >±60%、P/E <0 显示为数值等异常 → 不渲染该字段并告警。
   - 财报日期：数据层日期与日报「近期事件」不一致时，标“预估”并告警。
8. **存储**：输出存库，带 `generated_at`、`source_ids`、`model`、`prompt_version`；页面只读库，不在请求时调用 LLM。
9. **KOL 授权过滤**：数据层每位博主有 `license_status`（已授权 / 仅摘要 / 禁止）；“禁止”不展示，“仅摘要”不展示原文引文，只展示摘要 + 链接。

### 3.3 Prompt 草案

**A. /today 答案块与时间线**
```
系统：你是美股收盘复盘编辑。只根据输入写作，不添加输入之外的事实和数字。
输入：{index_moves:{spx_chg, ndx_chg, dji_chg, vix, vix_chg}, report_title, report_summary, headlines:[{title, fact_summary}], date}
任务A（答案块）：1–2 句、≤80 个汉字回答"美股今天为什么{涨/跌}"。
 格式：「美股 {M月D日} 收盘：{领涨/领跌指数} {占位符}…。主要原因是{原因1}，{同时/叠加}{原因2}。」
 - 方向以 ndx_chg、spx_chg 为准；相反时写"分化"。
 - 原因必须出自 headlines 前 2 条或 report_summary；数字全部用占位符。
任务B（时间线条目）：≤60 个汉字，「{date}：{指数涨跌占位符}，{一句原因}」。
禁止：预测、建议、"必然""一定"、任何不在输入里的数字。
输出 JSON：{answer, timeline_item, source_ids:[...]}
```

**B. /morning 答案块与事件型要点**
```
输入：{futures:{es_chg, nq_chg, ym_chg}, vix, overnight_news:[{title, summary}], calendar_today:[{time_et, event}], date}
任务A：答案块，≤80 汉字，格式「{date} 美股盘前：标普 500 期货 {es_chg}、纳指期货 {nq_chg}、道指期货 {ym_chg}，VIX {vix}。隔夜主线是{theme_1}。」
任务B：3 条事件型要点，每条 ≤50 字，结构「事件 → 影响的板块/个股」，只用 overnight_news 与 calendar_today；不要罗列涨跌幅。
任务C：「期货走势解读」公开第一段 150–250 字。
禁止：交易建议、预测点位。
```

**C. 个股 #why 事件抽取**
```
触发：|单日涨跌| ≥ 3%（行情数据层），或该股在当日日报 headlines/briefs 被点名。
步骤1（规则，非 LLM）：按别名表（代码/中文名/英文名/常见简称）在当日日报 headlines、briefs、report_summary 匹配段落；再匹配当日 twitter_digest.ticker_theses 中 ticker=T 的条目。
步骤2（LLM）：
 输入：{ticker, name_zh, date, chg_placeholder, matched_paragraphs[], kol_thesis?}
 输出 JSON：{reason:"≤60字，只用 matched_paragraphs 的事实", source:"daily_report|twitter_digest|none", confidence:"high|low"}
 - matched_paragraphs 为空 → reason="当日未见公司特定消息，走势与{板块/大盘}一致"，source=none。
 - confidence=low 不进入 FAQ 答案，只放时间线。
步骤3：保留最近 10 条；"区间总结"=LLM 只根据这 10 条 reason 归纳 1 句 ≤60 字。
```

**D. 个股 #kol 汇总与 KOL 页本周摘要**
```
输入：近 30 天该 ticker 的 ticker_theses[]（side、primary_kols、stance_summary、date）+ 推文摘要列表（author、date、url、text_zh_summary）
输出：
 - 统计（规则计算，不交给 LLM）：n_kol、n_posts、bull、bear、disputed
 - conclusion（≤60 字）：「最近 30 天 {n_kol} 位博主讨论{name_zh}，主要分歧在{多方论点}与{空方论点}。」
 - rows[]：每条 ≤60 字中文摘要，忠于原意，不加评价；必须带 author、date、url。
规则：只用"偏多/偏空/分歧"，不用"推荐/喊单/看好买入"；license_status=禁止 的博主不展示。
KOL 页本周摘要：输入=该博主近 7 天 feed + sectors；输出 150–250 字，结构=主线主题 → 提及最多的 3 个标的及方向 → 与上周相比的变化。
```

**E. #earnings 速读**（实际值入库后 ≤3 小时生成）
```
输入：{actual:{rev, eps, segments}, estimate:{rev_est, eps_est}, price_reaction?, press_release_summary, transcript_summary?}
输出：答案块（§2.14 财报后格式）+ 3 条要点（每条 ≤50 字，只写公司披露与已发生的股价反应）+ 公开第一段 150–250 字。
禁止：对下季度股价的判断、评级。
```

**F. #about**（一次生成，存库；每季度或重大变化时复核）
```
输入：profile.description（英文）+ 10-K 业务描述段落 + 事实字段（总部、上市时间、交易所，来自数据层）
输出：150–300 字中文，结构固定「是什么 → 怎么赚钱 → 主要客户/竞争对手 → 所属主题」；首句能单独成立；代码有歧义（如 SMR）首句先消歧；事实字段只能用输入值。
审核：重点 6 篇（CRWV、SOFI、NBIS、SMR、PLTR、NVDA）100% 人工审核；其余样本组抽检 10%。
```

### 3.4 薄内容 noindex 规则（构建时自动计算，写入 meta 和构建日志）

- **独特内容占比** = （#about + #why + #kol + #earnings 解读 + FAQ 中**不属于模板句**的字符）÷ 页面正文总字符（去掉导航、页脚、免责声明）。
- ≥40% → `index,follow`，进 sitemap，lastmod 按内容变化。
- 30–40% → `noindex,follow`，不进 sitemap。
- <30% → `noindex,follow`，不进 sitemap（硬性停止线，不得作为样本页上线）。
- 例外：本轮 W1 强制加入 sitemap 的 CRWV/SOFI/NBIS/SMR/SPCX，若到 W2 结束仍 <40%，同样转 noindex。
- 日期页（/morning/{date}、/twitter-digest/{date}）：公开正文 <300 字 → noindex,follow，不进 sitemap。
- 构建日志输出每页：ticker、unique_ratio、robots、in_sitemap。

### 3.5 更新频率总表

| 页面 / 模块 | 频率 | 触发 |
|---|---|---|
| /today 答案块、时间线 | 每个交易日 1 次 | 日报生成后（约 18:00 ET） |
| /morning 答案块、要点 | 每个交易日 1 次 | 早报生成后（现约 09:00 ET） |
| 个股 #why | 每个交易日 1 次 | 日报生成后，只处理当天触发的代码 |
| 个股 #kol | 每天 1 次 | 推特简报生成后 |
| 个股 #earnings | 事件驱动 | 财报前 14 天切 title；实际值入库后 ≤3 小时生成速读；发布后 14 天切回 |
| 个股 #about | 每季度复核 | 人工 |
| /kol/* 时间线 / 本周摘要 | 每 4 小时 / 每天 07:00 ET | 推文抓取 |
| /macro/sentiment | 交易日每小时（读数）/ 每天（解读） | 数据源 |
| /macro/liquidity | 每周 | WALCL 周四发布后 |
| /guide/us-market-hours | 每年 + 时令切换前 | 人工 |
| 首页「今天的研报」 | 跟随 /today、/morning | — |

---

## 4. 排期

工作量：**S** ≤0.5 天，**M** 1–2 天，**L** 3–5 天（估算，仅供排期）。

### Week 1（10/19 周一 – 10/25 周日）：恢复已有排名 + 修基础

| 顺序 | 任务 | 工作量 | 截止 |
|---|---|---|---|
| 1 | P0-1 /kol、/kol/serenity、/kol/qinbafrank 恢复 200 + SSR 公开模块（§2.2–2.4）+ kol-0.xml + /kol/aleabitoreddit 301 + 子页 200/noindex | L | 10/23 |
| 2 | /today、/morning：固定 H1、title、答案块、JSON-LD、H1/DOM 去重、日期页 JSON-LD 去重、/morning 公开第一段（§2.5–2.6，P0-7 morning 部分，P0-8） | S–M | 10/21 |
| 3 | 个股模板 v2 基础：中文名补齐、title/H1/别名/答案块、DOM 去重、股息率修复 + >25% 告警、JSON-LD；CRWV/SOFI/NBIS/SMR/SPCX 进 stock-0.xml 和 /stock hub 新分组；同主题修正；lastmod 诚实；/today 日报个股自动内链（P0-2、P0-8、P0-9、P0-10） | M | 10/23 |
| 4 | #earnings 公开版（下次财报日 + 近 4 季预期 vs 实际 + 分部收入 + title 自动切换）：GOOGL/MSFT/AMZN | M | **硬截止 10/27**（MSFT 10/28 财报，日期来自 TMB 日报未核对；GOOGL/AMZN 日期由数据层确认） |
| 5 | /guide/us-market-hours 新建（§2.17） | M | 目标 10/25，**硬截止 10/30**（11/1 夏令时结束） |
| 6 | 小修：/stock/ZZZZQ → 404、未知路径 404、/llms.txt 200、/liquidity 301、/twitter-digest 日期页 noindex + 移出 sitemap（P0-3/4/5/6/7） | S | 10/20 |

W1 结束：跑 §7.1 全局验收；由 SEO 侧在 GSC 提交新 sitemap。

### Week 2（10/26 – 11/1）：独特模块 + 财报窗口

| 顺序 | 任务 | 工作量 |
|---|---|---|
| 1 | #earnings 财报后速读（GOOGL/MSFT/AMZN，按实际发布日触发）+ “财报解读”版 title | M |
| 2 | #about：CRWV、SOFI、NBIS、SMR、PLTR、NVDA（6 篇全部人工审核） | M |
| 3 | #why 事件抽取上线（CRWV、PLTR 优先，其余第 1 批跟上）；PLTR 区间总结 + title 方向切换 | M–L |
| 4 | #kol 公开精简接口 + NVDA 样板 → 推广到近 30 天 ≥2 位博主提到的样本股 | M |
| 5 | /macro/sentiment SSR 改造（默认 VIX 备用模式，CNN 许可确认后再切） | M |
| 6 | /macro/liquidity 微调；首页 title/H1/答案块/「今天的研报」/FAQ | S + S |
| 7 | 第 1 批 50 只：模板 v2 + 独特内容占比计算，≥40% 才进 sitemap（其余 22 只未在 sitemap 的样本股按此规则加入） | M |

### Week 3（11/2 – 11/8）：补齐 + 看数据迭代

| 顺序 | 任务 | 工作量 |
|---|---|---|
| 1 | /twitter-digest hub 用 `/teaser/latest` SSR；日期页 ≥300 字前保持 noindex | S–M |
| 2 | 第 2 批 20 只 + 第 1 批剩余页面批量上 #about/#why/#kol（独特内容 ≥40% 才进 sitemap） | L |
| 3 | 按第一轮 GSC 数据改 title（展示多、CTR 低优先）；GEO 20 问基线测试（SEO 侧执行） | S |
| 4 | 评估 /earnings-calendar 触发条件（GSC「美股财报日历/本周财报」类 ≥30 次展示/周） | S |

---

## 5. 不要做的事

1. 不新建 `/ai-stock-research`（首页承接）、`/earnings-calendar`（触发前不建）、`/stock/{T}/earnings` 子页、`/theme/*`、`/compare/*`、`/learn/*`、繁体页。
2. 不为“XX 今天为什么跌”每天新建 URL；不批量生成“A vs B”对比页。
3. 不一次性放出全部约 3,680 只股票的索引；样本组以外 `noindex,follow`；独特内容 <40% 不进 sitemap。
4. 不出现荐股表达：必涨、推荐买入、稳赚、保证收益、喊单、目标价必达、抄底、闭眼买、翻倍；FAQ 不写“值得买吗/能涨到多少”；不做“十大牛股/美股推荐 2026”类页面。
5. 不做开户、券商、美股 app 推荐、税务（TFSA/1099/W-8BEN 等）内容；不做加密货币内容（含 qinbafrank 页上的加密查询）；MSTR 只讲业务不讲币价。
6. 不硬抢指数/ETF/期货行情头部词（纳斯达克指数、标普500、美股期货）；SPCX、闪迪、海力士只做模板 v2，不单独投内容。
7. 不按 User-Agent 给 Googlebot 输出与用户不同的内容（cloaking）；不用 307 把可索引页跳到登录/销售页。
8. 不每天把全部 lastmod 刷成当天；不在 sitemap 放 noindex/非 200 的 URL。
9. 不在请求时实时调 LLM；不让 LLM 输出数字；不编造原因、日期、别名、财报日期；空值不显示 0/NaN/“--”。
10. 不使用 Product/Review/AggregateRating/Offer schema；不用 Event 标注交易时间。
11. 不用 Google Indexing API，不买外链，不做英文内容；不暴露推文全文接口；不展示 license_status=禁止 的博主。
12. 不在 P0-2 修好前上线任何股息率 FAQ；CNN 许可确认前默认不展示 CNN 读数。
13. （给 Codex）不调用任何付费 API 做验证；不改生产数据之外的第三方配置。

---

## 6. 待确认事项（实现时留开关，不阻塞开发）

| # | 事项 | 现状 | 实现上的默认处理 |
|---|---|---|---|
| 1 | CNN Fear & Greed 数据展示/转载许可 | 未知（页面已在用） | `SENTIMENT_USE_CNN=false`：只展示 VIX、Put/Call、市场宽度、信用利差等公开数据 + 链接 CNN 原页；答案块去掉 `{fg}`。确认可用后切 true |
| 2 | GOOGL、AMZN 下一次财报日期 | 未知（本次材料未出现）；MSFT 10/28 来自 TMB 日报，未与 IR 核对 | 由 `EventCalendarCard.earningsDate` / FMP earnings-calendar 填充，未经 IR 确认标“预估”；与日报「近期事件」不一致时告警 |
| 3 | KOL 推文抓取频率 | 未知（文档按 4 小时写） | 时间线更新频率读配置，以后端实际为准 |
| 4 | KOL 授权状态 | 未知 | 数据层新增 `license_status`（已授权 / 仅摘要 / 禁止），默认“仅摘要” |
| 5 | qinbafrank 的代称 | 未知 | 用“该博主” |
| 6 | 个股中文别名（CoreWeave、Nebius 等的中文译名） | 无可靠来源 | 不写，只用英文名 |
| 7 | TMB 官方 X 账号（首页 Organization.sameAs） | 未知 | 未确认不加 |
| 8 | 早报是否提前到 08:00 ET 前 | 建议，搜索时段分布未知 | 不改生成时间，除非产品确认 |
| 9 | 站内搜索 URL（SearchAction） | 未知 | 没有就不加 |

---

## 7. 验收与监测

### 7.1 每次上线跑的全局验收清单（Codex 负责）

- [ ] §1.1 P0-1 ~ P0-10 每一行的验收命令全部通过。
- [ ] 样本组随机抽 10 只：title/H1 含中文名；`h1n`=1；`ldn`=1；答案块无空值/0/NaN/“--”；JSON-LD 无 Product/Review。
- [ ] 无效代码 404；/kol 三页 200 + index；/llms.txt 200 text/plain；/liquidity 301。
- [ ] 全站禁用词扫描命中 0（title/H1/正文/FAQ）。
- [ ] sitemap 中每个 URL 200 + index，lastmod 真实（stock-0.xml lastmod 不再全部同一天）。
- [ ] 构建日志含每页独特内容占比；<40% 的不在 sitemap。
- [ ] 股息率断言通过（无 >25% 未确认值）。
- [ ] /guide/us-market-hours 时区换算单元测试通过（夏令时切换前后）。

### 7.2 周一 / 周四 GSC 例行（SEO 侧执行，Codex 无需实现）

运行：`cd /workspace/tmb-growth/gsc && .venv/bin/python pull_gsc.py --no-inspect`（只读）。第一次周一先补一份 “page × week” 导出作为 W0 基线（现有数据只有全期累计）。
- **周四（健康检查）**：URL Inspection 抽查 /kol/serenity、/kol/qinbafrank、/stock/CRWV、/stock/SOFI、/guide/us-market-hours（目标：已编入索引，Google canonical = 自身）；软 404/重定向/5xx；sitemap lastmod 是否真实更新；AI 代理式查询对应的 #why 是否存在。
- **周一（效果判断）**：北极星（上周非品牌点击）、有展示的 /stock 页数、样本组 vs 对照组；排名 5–20 且展示 ≥50 的词进待办（改 title/H1/首段/FAQ）；同词多 URL → 合并或 canonical。

| 页面 | 周四检查 | 周一指标 | 4 周合格线 / 不合格动作 |
|---|---|---|---|
| /kol/serenity | 200、已编入索引、canonical=自身；上线后第一个周四未重抓 → 手动请求编入索引一次 | serenity 词簇（含白毛股神）展示、排名 | 2 周内恢复展示；4 周排名 ≤8 且有点击。只有展示无点击 → title 加“最新 {月份}” |
| /kol/qinbafrank | 同上 | 「qinbafrank」「@qinbafrank」排名 | 排名恢复到 ≤4，点击 ≥1/周；被子页替代 → 检查子页 noindex 是否生效 |
| /morning | lastmod 跟随早报；日期页公开 ≥300 字 | 「美股盘前」「盘前分析」类查询数与排名 | 出现目标词展示且排名 ≤20；CTR <1% → 改 title 句式 |
| /today | 同上 | 「为什么跌/涨」「大跌原因」类查询 | 出现目标词展示；全页 CTR 从约 0.15% 提到 ≥1% |
| /stock/CRWV、SOFI、NBIS、SMR | URL Inspection 从“无法识别”变“已编入索引”；在 sitemap | 「是什么公司」「为什么跌」展示 | 4 页中 ≥2 页出现目标词展示；3 周后仍未收录 → 查独特内容占比和入链（日报自动内链是否生效） |
| /stock/PLTR、NVDA | 同上 | 「pltr 为什么跌」「博主怎么看英伟达」类 | 出现长尾展示即合格（量未知） |
| /stock/GOOGL（+MSFT/AMZN） | 财报日前 3 天检查 #earnings 和 title 切换 | 财报周「谷歌/微软/亚马逊财报」展示与点击 | 财报周有展示；没有 → 记录，下一季提前 14 天上线 |
| /macro/sentiment | SSR ≥500 汉字、数值在 HTML 中 | 「恐慌贪婪指数」「vix」类展示 | 4 周出现展示且排名 ≤30 |
| /macro/liquidity | /liquidity 301 生效 | 「美联储资产负债表」「流动性状况」 | 「流动性状况」保持 ≤5；出现「资产负债表」类展示 |
| / | — | 「美股研报」「美股研究室」排名 | 从 8 提到 ≤5 |
| /guide/us-market-hours | 11/1 前已编入索引 | 「开盘时间」「休市」类展示 | 11 月出现展示；CTR 低（AIO）属预期，看展示与排名 |

**通用止损**：任何页面上线 3 周后仍“已发现/已抓取 - 尚未编入索引” → 停止同类页面扩量，先补独特内容和入链，再提交。样本组收录率 <30% → 暂停扩量。

---

## 附录 A：目标关键词表

量 = DataForSEO Google Ads 口径（该国所有语言，简繁近似词合并，分档近似值，10 为最低档）；CPC 单位美元；未查到写“未知”。

| # | 关键词 | US 月量 | CA 月量 | CPC | 承接 URL |
|---|---|---|---|---|---|
| 1 | 白毛股神 | 110 | 10 | 未知 | /kol/serenity |
| 2 | serenity aleabitoreddit 最新（GSC 词簇，397 次展示） | 未知 | 未知 | 未知 | /kol/serenity |
| 3 | qinbafrank | 10 | 未知 | 未知 | /kol/qinbafrank |
| 4 | 美股博主怎么看英伟达 | 未知 | 未知 | 未知 | /stock/NVDA#kol |
| 5 | 美股盘前分析 | 40 | 10 | 24.30 | /morning |
| 6 | 美股盘前 | 390 | 90 | 31.15 | /morning |
| 7 | 美股大跌原因 | 90 | 30 | 未知 | /today |
| 8 | 美股今天为什么跌 | 20 | 10 | 未知 | /today |
| 9 | 谷歌财报 | 260 | 40 | 未知 | /stock/GOOGL#earnings |
| 10 | 美股 AI 研报（同义「美股研报」10/10） | 未知 | 未知 | 未知 | / |
| 11 | crwv 是什么公司 | 70 | 20 | 未知 | /stock/CRWV#about |
| 12 | CoreWeave为什么跌 | 未知 | 未知 | 未知 | /stock/CRWV#why |
| 13 | sofi 是什么公司 | 170 | 40 | 未知 | /stock/SOFI#about |
| 14 | nbis 是什么公司 | 140 | 30 | 未知 | /stock/NBIS#about |
| 15 | smr 是什么公司 | 90 | 10 | 未知 | /stock/SMR#about |
| 16 | pltr为什么一直跌 | 未知 | 未知 | 未知 | /stock/PLTR#why |
| 17 | 恐慌贪婪指数 | 480 | 170 | 21.84 | /macro/sentiment |
| 18 | 美联储资产负债表 | 70 | 10 | 未知 | /macro/liquidity |
| 19 | 美股休市时间2026 | 170 | 170 | 未知 | /guide/us-market-hours |
| 20 | 美股开盘时间 | 1,300 | 390 | 7.80 | /guide/us-market-hours |

**同页副词**

| 关键词 | US | CA | CPC | 承接 URL |
|---|---|---|---|---|
| aleabitoreddit | 590 | 未知 | 未知 | /kol/serenity |
| 美股今天为什么涨 | 20 | 10 | 未知 | /today |
| 美股大跌 / 美股暴跌 | 480 / 170 | 110 / 40 | 未知 | /today |
| CoreWeave是什么公司 | 50 | 10 | 未知 | /stock/CRWV |
| 微软财报 | 170 | 40 | 未知 | /stock/MSFT#earnings |
| 亚马逊财报 | 110 | 20 | 未知 | /stock/AMZN#earnings |
| 美股恐慌贪婪指数 | 110 | 30 | 20.45 | /macro/sentiment |
| vix恐慌指数 | 590 | 320 | 18.20（CA 1.75） | /macro/sentiment |
| 美股休市时间 | 260 | 210 | 未知 | /guide/us-market-hours |
| 美股收盘时间 | 170 | 40 | 未知 | /guide/us-market-hours |
| 美股盘后交易时间 / 盘前交易时间 | 70 / 50 | 20 / 20 | 未知 | /guide/us-market-hours |
| 逆回购 / tga账户 | 90 / 20 | 10 / 10 | 未知 | /macro/liquidity |
| spacex 股票（降级，只做模板 v2） | 12,100 | 4,400 | 未知 | /stock/SPCX |
| 英伟达股票（头部词，不投内容） | 22,200 | 9,900 | 未知 | /stock/NVDA |

## 附录 B：GSC 基线（全期 2026-01-07 ~ 2026-10-16，累计）

| 页面 | 展示 | 点击 | 平均排名 |
|---|---|---|---|
| /kol/serenity | 1,621 | 0 | 8.16 |
| /today | 1,315 | 2 | 8.22 |
| /morning | 1,066 | 7 | 7.2 |
| /kol/qinbafrank | 892 | 4 | 4.81 |
| /twitter-digest | 802 | 0 | 8.13 |
| /macro/liquidity | 489 | 0 | 7.97 |
| /stock（hub） | 347 | 0 | 6.07 |
| /stock/SPCX | 8 | 未知 | 8.75 |

## 附录 C：来源文件（同目录，需要细节时查）
`strategy.md`、`dev_handoff.md`、`page_mapping.md`（冲突时以它为准）、`page_mapping_dev_checklist.md`、`best_keywords/best_keywords.md`、`best_keywords/scoring.csv`、`sample_group_tickers.csv`、`content_briefs/01–05`、`live_2026-10-18/`（`live_summary.json`、`page_*.html`、`sm_*.xml`）、`gsc_summary_prev_2026-10-17.md`。
