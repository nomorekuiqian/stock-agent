# SEO 清单修复 — 2026-10-17

## 交付状态

代码已提交并推送至 `restart/prod-baseline`，提交 `4a6eba972c514b5210819cb775a0757684430f3e`；Vercel 生产部署 `dpl_47YbcsJdeRQgN9VkdPTuSm5iVoYE` 已 READY 并绑定正式域名，线上检查通过。用户明确排除第 5、6 项，KOL 研究室继续下线；没有修改暂停开关。保留工作区原有的其他修改。

唯一已执行的线上设置变更：TheMarketBrew 团队的 stock-agent 项目中，`themarketbrew.com` → `www.themarketbrew.com` 的域名跳转改为 308。更新后 API 确认目标与状态码；HTTP 实测 `/` 和 `/today?utm_source=seo-check` 均为 308，路径与参数保留。API 更新必须同时发送 redirect 与 redirectStatusCode；只发状态码会清空 redirect，本次已立即纠正并验证最终状态。

## 清单结果

| 项目 | 本次结果 |
|---|---|
| 1 | `/sitemap.xml` 改为索引；静态、股票、日报、早报、推特简报分开。动态按实际 total 分片，每片最多 1000 条；早晚报请求 limit=100，推特 limit=50。不再截断于 500。报告使用有效内容日期作 lastmod；静态/股票使用本次公开模板修订日期，不使用每次请求时间。源服务失败返回 503/no-store。KOL 不纳入。 |
| 2 | 股票入口服务端输出当前精选目录的全部 100 只股票链接，原赛道行情卡片也有真实 anchor。没有声称覆盖整个交易所；其他标的仍可搜索。 |
| 3 | 股票详情输出同赛道/同板块关联链接，最多 10 个；NVDA 实测 10 个。候选不足时不凑无关股票，未知板块不伪造。早晚报正文的已知 ticker 自动链接，歧义词 AI 等需 $ 或括号；外部新闻标题不嵌套 anchor。 |
| 4 | 未操作。Search Console 打开后进入 Google 登录页，没有可用登录会话。需新代码部署并检查地图后，提交 www 版本、核对并移除旧提交记录。 |
| 5、6 | 按用户要求排除，KOL 仍 307 到 research。 |
| 7 | 已在 Vercel 线上改成 308 并实测；应用层也添加 308 兜底。 |
| 8 | 原有 www 首页、归档自引用 canonical 保留。 |
| 9 | research/login metadata noindex；middleware 对 research 及普通带参数页输出 X-Robots-Tag noindex。私有路由仍受鉴权保护。 |
| 10 | 详情标题统一加入日期与真实范围：美股全市场日报/美股盘前早报，保留原新闻主题。没有将全市场报告伪装成半导体专报。 |
| 11 | 新地址 `/today/YYYY-MM-DD-market-report`、`/morning/YYYY-MM-DD-morning-brief`；使用已有按日期读取 API，不改数据库。UUID 请求在 middleware 读取公开日期后返回真实 308；canonical、Article URL、归档和 sitemap 同步。 |
| 12 | 保留 Article、datePublished、dateModified，与新 canonical 对齐。 |
| 13 | 流动性标题改为“美元流动性状况与趋势分析”；流动性/经济 layout 服务端输出指标解释、内链及公开周报日期和分析摘要，上游失败保留解释。 |
| 14 | 早晚报顶部加入同一格式的行情快照和三个要点，标注报告日期、生成时间以及期货/现货口径。早报三个要点仅来源于公开行情，未开放付费 AI 文本。早报源数据尚无 10Y 美债收益率，显示“本期未提供”，不能称该数据项已补齐。 |

## 验证证据

- 相关 6 个测试文件共 79 项通过：爬虫与鉴权、分片分页、503、日期 slug、旧 UUID 跳转、来源归因 cookie、股票卡片、早晚报正文、付费摘要隔离。
- 修改文件 ESLint、TypeScript 检查通过；生产构建通过。
- 本地生产服务接隔离 fixture API，未使用生产数据库、邮件、付款或生成任务。
- HTTP：索引与子 sitemap 200；research 参数页 noindex；profile 仍 307 到 login；两个 KOL 页继续暂停；新日期地址 200；旧早晚报 UUID 返回 HTTP 308。
- HTML：股票入口 100 个去重股票链接，NVDA 10 个相关链接；报告正文股票代码可抓取；详情标题/JSON-LD/canonical 使用同一日期地址；经济页原始 HTML 包含正文解释。
- 浏览器检查股票目录、早晚报、经济页和 390px 手机日报：无横向溢出，摘要、链接和正文可见。所有浏览器外部请求均拦截，数据来自 fixture。
- 保留已存在的测试 mock 对 Image `unoptimized` 属性警告及 baseline-browser-mapping 版本提示；均未导致检查失败。

## 发布后验收

1. 部署本次代码后检查线上 sitemap 索引、各分片、真实数据 URL 数量和抽样 lastmod。
2. 抽查真实 UUID → 日期 slug 的 308、canonical/Article 一致性及匿名早报付费边界。
3. GSC 登录后提交 www sitemap，核对旧提交；收录、排名和 AI 引用率需单独观察，本次未声称改善。
4. 如需早报完整 10Y 快照，后续应在早报生成时保存带数据日期的收益率与 bp 变化，不能给历史早报拼接当前利率。

## 生产验收（2026-10-17，部署后）

- 仅提交本次 39 个 SEO 文件；另外 53 个原有改动路径逐项哈希核对，内容/删除状态不变。
- 仅用暂存内容导出的隔离目录运行 79 项相关测试，全部通过。Vercel 预览与生产构建均通过，生产提交 SHA 与修复提交一致。
- 正式域名 `https://www.themarketbrew.com` 上 25 项 HTTP/HTML/XML 检查全部通过。
- sitemap 索引返回 200，包含 5 个分片：静态 19、股票 100、日报 216、早报 162、推特简报 121，共 618 个 URL，全部带 lastmod；日报按日期 canonical 去重。
- 股票入口输出 100 个去重股票链接；NVDA 输出 10 个相关股票链接。
- 日报旧 UUID `9d93e4ef-a418-4078-a510-acbc8611fe23` 返回 308 到 `/today/2026-10-16-market-report`；早报旧 UUID `3cbbffbd-ae7d-4561-ac17-a2adf80a4471` 返回 308 到 `/morning/2026-10-16-morning-brief`。两个新地址均 200，日期标题、canonical、Article mainEntityOfPage 一致。
- `/research`、persona 参数页、`/login` 返回 noindex；日报归档 canonical 指向自身。
- 早晚报原始 HTML 可见三个要点；经济/流动性原始 HTML 可见说明正文，流动性新标题生效。
- 两个 KOL 页仍 307 到 research；profile 匿名请求仍 307 到 login。
- 裸域名首页、带参数路径均 308 到 www，路径和参数完整保留。
- 未完成项保持不变：GSC 无登录会话，未提交/删除地图记录；早报源数据缺美债收益率，不用其他日期数据补齐。上述结果证明技术配置生效，不代表 Google 已重新抓取或排名改善。
