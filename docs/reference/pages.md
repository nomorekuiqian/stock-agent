# 前端页面路由

## 路由总览

### 主要页面
| 路由 | 页面 | 数据来源 | 需要认证 |
|------|------|----------|----------|
| `/` | 首页 (Landing + Guided Tour) | 可选 Backend (onboarding complete, 仅 `?tour=1` 完成/跳过时) | 否 |
| `/today` | 市场日报 | Insforge (getLatestReport) + Backend (getMarketAnalysis) | 否 |
| `/today/[id]` | 日报详情 | Insforge (getReportById) | 否 |
| `/today/archive` | 日报存档 | Insforge (getReportsList) | 否 |
| `/morning` | 盘前早报 | Backend (morningReports API) | 否 |
| `/morning/[id]` | 早报详情 | Backend (morningReports.getById) | 否 |
| `/morning/archive` | 早报存档 | Backend (morningReports API) | 否 |
| `/twitter-digest` | 推特 KOL 观点日报 | Backend (twitterDigest.getLatest / getLatestTeaser) | 否（全文需 Max） |
| `/twitter-digest/[date]` | 推特 KOL 观点日报详情 | Backend (twitterDigest.getByDate / getTeaserByDate) | 否（全文需 Max） |
| `/twitter-digest/archive` | 推特 KOL 日报归档 | Backend (twitterDigest.listArchive / listArchiveTeaser) | 否（全文需 Max） |
| `/qinbafrank` | Qinbafrank 旧链接兼容重定向 | redirect(`/kol/qinbafrank`) | 否 |
| `/frank-agent` | Frank waitlist 旧链接兼容重定向 | redirect(`/kol/qinbafrank`) | 否 |
| `/kol` | 博主研究室总入口 | 静态卡片：Qinbafrank / Serenity 研究室选择 | 否 |
| `/kol/[username]` | KOL 博主研究室概览 | qinbafrank 根页静态销售页；Serenity 根页供应链研究室首页；其他 persona 用 skill 资产 + Backend cockpit/feed | 浏览否；qinbafrank 子页需 Max |
| `/kol/[username]/chat` | KOL 对话入口 | Backend (kolResearch chatStream) | 登录后可用；Free/Pro 每日 2 次，Max 无限 |
| `/kol/[username]/highlights` | KOL 精华观点 | Backend (kolResearch feed/topics) | qinbafrank 子页需 Max |
| `/kol/[username]/history` | KOL 历史链接兼容页 | 重定向/兼容 | 否 |
| `/kol/[username]/latest` | KOL 最新内容库 | Backend (kolResearch feed) | 否 |
| `/kol/[username]/macro` | KOL 宏观框架 | Backend (kolResearch profile/topics) | 否 |
| `/kol/[username]/sectors` | KOL 板块观点 | Backend (kolResearch sectors) | 否 |
| `/kol/[username]/stocks` | KOL 个股观点 | Backend (kolResearch tickers) | 否 |
| `/kol/serenity` | Serenity persona 入口 | redirect(`/kol/aleabitoreddit`) | 否 |
| `/kol/serenity/[...path]` | Serenity persona 子路径别名 | redirect(`/kol/aleabitoreddit/[...path]`) | 否 |
| `/stock` | 个股研究 | Backend (searchStocks, getStockQuotes) | 否 |
| `/stock/[symbol]` | 个股详情 | Backend (stock API 多端点) | 否 |
| `/for-you` | 个性化摘要 | Insforge (watchlist/digests) + Backend (generateDigest) | 是 |
| `/for-you/monitor` | AI 关注列表监控台 | Backend (watchlist-monitor API) | 是 + `for_you_website` |
| `/for-you/[id]` | 摘要详情 | Insforge (getUserDigestById) | 是 |
| `/for-you/archive` | 摘要存档 | Backend (digests API) | 是 |
| `/for-you/watchlist` | 自选股管理 | Backend (watchlist API) + StockQuotes | 是 |
| `/for-you/portfolio` | 投资组合管理 | Backend (portfolio API) | 是 |
| `/for-you/health` | 持仓健康度 | Backend (portfolio_health API) | 是 |
| `/for-you/onboarding` | For-You 引导 | Backend (portfolio API) | 是 |
| `/macro` | 宏观仪表盘 | Backend (macro-risk + weekly-report API) | 是 |
| `/macro/liquidity` | 流动性 | Backend (liquidity API) | 是 |
| `/macro/economy` | 经济基本面 | Backend (macro-risk/economy) | 是 |
| `/macro/inflation-rates` | 通胀与利率 | Backend (macro-risk/inflation-rates + cpi) | 是 |
| `/macro/sentiment` | 市场情绪 | Backend (macro-risk/sentiment) | 是 |
| `/macro/weekly` | 宏观周报 | Backend (weekly-report API) | 是 |
| `/mcp/authorize` | MCP 客户端授权 | Backend (kol_research MCP device authorize) | 是 |
| `/login` | 登录 | Insforge Auth | 否 |
| `/profile` | 用户资料 | Insforge Auth (profiles API) | 是 |
| `/verify-email` | 邮箱验证 | Insforge Auth (verifyEmail + resendVerificationEmail) | 否 |
| `/forgot-password` | 忘记密码 | Insforge Auth (sendPasswordResetEmail) | 否 |
| `/reset-password` | 重置密码 | Insforge Auth (resetPassword) | 否 |
| `/pricing` | 定价页 | Backend (payment API) | 否 |
| `/pricing/success` | 支付成功 | Backend (payment API) | 否 |
| `/request-access` | 申请邀请码 | Backend (invites/qualify) | 是（middleware cookie gate） |
| `/contact` | 联系/反馈 | Backend (feedback/user) | 否 |
| `/feedback` | 邮件反馈处理 | Backend (feedback) | 否 |
| `/unsubscribe` | 邮件退订 | Backend (subscriptions API) | 否 |
| `/email-test` | 邮件测试 | Backend (notification API) | 否 |
| `/research` | 投研助手 (Research Desk) | Backend (screener/research API) | 是 |
| `/research/kb` | 投研知识库 | Backend (research_kb API) | 是 |
| `/research/gallery` | 投研画廊 | Backend (screener API) | 是 |
| `/settings` | 用户设置 | Backend (notification API) | 是 |
| `/admin` | 管理后台 | Backend (admin API) | 是 (admin) |
| `/admin/activity` | 活跃趋势后台 | Backend (admin/activity API) | 是 (admin) |
| `/admin/users/[id]` | 用户管理详情 | Backend (admin API) | 是 (admin) |
| `/admin/flags` | Feature Flag 管理 | Backend (admin/flags API) | 是 (admin) |
| `/admin/llm-usage` | LLM 用量与费用面板 | Backend (admin/llm-usage API) | 是 (admin) |
| `/admin/feedback` | 用户反馈 dashboard | Backend (admin/feedback API) | 是 (admin) |
| `/webview-check` | WebView 检测 | 无 API 调用 | 否 |

### 重定向
| 旧路由 | 目标 |
|--------|------|
| `/market` | `/today` |
| `/digest` | `/for-you` |
| `/liquidity` | `/macro/liquidity` |
| `/reports` | `/today/archive` |
| `/reports/[id]` | `/today/[id]` |

## 页面详情

### `/` 首页
- Hero + 功能介绍 + 订阅表单 + 信任标识 (LogoMarquee)
- 支持 `?tour=1` 启动注册后 Guided Tour，高亮顶部导航的 AI 研究助手 / 每日简报 / 投研 / 我的入口，并提醒用户在「我的」里添加自选股；启动前会跳过已完成用户并清理 URL，完成或跳过时 best-effort 调 onboarding complete API。调试/微调用 `?tour=home` 强制显示。

### `/today` 市场日报
- 先从 Insforge 查询今日/最新报告
- 如无缓存，调用 `api.getMarketAnalysis()` 生成
- 使用 `ReportContent` 组件渲染
- SEO: 动态 metadata + JSON-LD 结构化数据

### `/morning` 盘前早报
- ISR Server Component (revalidate 300s)
- 获取今日早报 (by date -> fallback latest)
- 获取历史早报列表 (最多 5 篇)
- `MorningReportContent` 组件渲染 (期货 grid + 全球市场 + 新闻 + 焦点 + 总结)
- SEO: 动态 metadata + JSON-LD 结构化数据
- 琥珀色主题 (amber accent)

### `/twitter-digest` 推特 KOL 观点日报
- Client Component,完整内容需要登录且具备 `twitter_digest` Max entitlement
- Max 用户调用 `api.twitterDigest.getLatest()` 获取完整 `DailyDigest`
- 未登录 / 非 Max 用户调用 `api.twitterDigest.getLatestTeaser()`，只展示标题、热榜、intro preview 和 Max CTA
- 页面结构: 信任条 + 开场 + 热榜 + ticker thesis + macro threads + watchpoints

### `/twitter-digest/[date]` 推特 KOL 观点日报详情
- Client Component,完整内容需要登录且具备 `twitter_digest` Max entitlement
- Max 用户调用 `api.twitterDigest.getByDate(date)` 并复用 `DigestView`
- 未登录 / 非 Max 用户调用 `api.twitterDigest.getTeaserByDate(date)`，显示该日期 teaser
- 后端校验日期格式 `YYYY-MM-DD`,不存在返回 404

### `/twitter-digest/archive` 推特 KOL 日报归档
- Client Component,分页加载
- Max 用户调用 `api.twitterDigest.listArchive(limit, offset)`；未登录 / 非 Max 用户调用 `listArchiveTeaser`
- 卡片链接到 `/twitter-digest/[date]`，非 Max 仍只看到 teaser

### `/qinbafrank` Qinbafrank 旧链接兼容页
- Server page，仅执行 `redirect('/kol/qinbafrank')`，并保留原 query 参数。
- 保留在 `PUBLIC_ROUTES` 中，避免历史分享链接被 middleware 先拦到登录页。

### `/frank-agent` Frank waitlist 旧链接兼容页
- Server page，仅执行 `redirect('/kol/qinbafrank')`，并保留原 query 参数。
- 保留在 `PUBLIC_ROUTES` 中，承接旧 Twitter/UTM waitlist 外链，避免冷流量被 middleware 提前拦截。

### `/kol` 博主研究室总入口
- Server page，无 API 调用。展示 Qinbafrank 与 Serenity 两张研究室卡片、模块深链、选择建议和边界说明。
- 顶部导航「投研 → 博主研究室」指向该页，而不是直接进入 `/kol/qinbafrank`。
- Qinbafrank 卡片入口包含精华、板块、个股、全量库、追问；Serenity 卡片入口包含供应链、个股、内容库、追问，不包含精华库或 AI 周期入口。
- 页面明确标注研究室基于公开内容整理，研究助手不代表博主本人观点，不构成投资建议。

### `/kol/qinbafrank` qinbafrank 博主研究室
- Server page + Client Component,根页面浏览不要求登录；`/kol/qinbafrank/*` 子页先要求登录，再要求 Max。
- 根页是 Qinbafrank 研究室销售首页，首屏标题为 `Qinbafrank 研究室`，核心 offer 是 `Qinbafrank资料包 + AI投研助手`，并保留和子页一致的左侧 `SubNav` / 移动横向导航。CTA 逻辑：未登录跳 `/login?mode=signup&redirect=/kol/qinbafrank?checkout=max`；已登录调用 `createCheckout("max", "/kol/qinbafrank?welcome=1")`。登录回跳后支持 `checkout=max` 自动打开 Stripe 付费流程；旧 `checkout=ultra` 仍兼容触发 Max checkout。
- 根页包含返回 `/kol` 的「所有博主研究室」入口、紧凑资料库入口、资料包内容、适合/不适合人群、示例问题和 Max offer；文案强调“基于公开内容整理”，必须保留非投资建议、研究助手不代表 Qinbafrank 本人观点的边界。
- `/kol/qinbafrank/sectors` 为板块观点页，左侧 5 个板块入口，右侧按左侧「分析框架 / 分析维度切换 / 可展开 Frank 原观点逻辑」+ 右侧「倒序观点时间线」展示；AI 产业额外拆为 8 个子板块，入口桌面端为 4 列 x 2 行网格，子板块详情同样为左侧分析框架 + 右侧观点时间线；完整原文阅读在 `/kol/qinbafrank/highlights`；`/kol/qinbafrank/history` 仅作为旧链接重定向到 `/highlights?topic=market-rules`；`/kol/qinbafrank/stocks` 为个股并结合价格验证；`/kol/qinbafrank/latest` 为全量内容库（过往精华 + 全量原文）
- `/kol/qinbafrank/sectors` 颜色只表达板块 / 子板块 / 分析维度 / 最新观点状态，交互反馈保持轻量 hover lift 与箭头位移，不做大面积装饰动画
- 方法论与技能默认来自 `backend/app/features/twitter/methodologies/qinbafrank/`
- 对话入口调用 `api.kolResearch.chatStream()` -> `POST /api/kol_research/chat/stream`，SSE 展示 skill/tool 进度，并在 final 后展示回答、激活 lens 和命中 chunks
- 页面明确标注不是 qinbafrank 本人，不构成投资建议；有 RAG 命中才可说原文支持，否则只能说方法论推断

### `/kol/aleabitoreddit` Serenity 博主研究室
- `/kol/serenity` 和 `/kol/serenity/[...path]` 是友好别名，服务端重定向到 canonical backend username `/kol/aleabitoreddit`。
- Serenity 页面组使用与 qinbafrank 一致的 SubNav-first 研究室壳，不再渲染通用 `PersonaHero`。根页首屏标题为 `Serenity 研究室`，核心定位是供应链工作台 + AI研究助手。
- 根页包含返回 `/kol` 的「所有博主研究室」入口、研究室入口、研究室内容、供应链漏斗、适合/不适合和示例问题。
- Serenity 不设精华库。首页和 SubNav 只暴露供应链地图、个股档案、内容库和研究助手。
- 首屏 signal card 使用 `cockpitHighConviction` 和 `cockpitTickers` 展示高确信线索与个股快照；供应链漏斗固定为 Mag7 资本开支、Neocloud、光通信、光子学/CPO、衬底材料。
- 页面明确标注基于公开内容整理，研究助手不代表 Serenity 本人观点，不构成投资建议。

### `/stock` 个股研究
- 搜索框 + 热门板块快速入口
- 本地存储最近查看的股票
- 搜索: `api.searchStocks()` (防抖)
- 报价: `api.getStockQuotes()` (批量)

### `/stock/[symbol]` 个股详情
- 渐进加载: Profile (快) -> Quote + Financials (并行)
- 价格图表: `StockPriceChart` + `TradingViewWidget`
- AI 分析: `StockAnalysisCard` (按需生成)
- 中文行业/板块翻译

### `/for-you` 个性化摘要
- 需要登录，未登录重定向到 /login
- 首层由项目自定义 middleware 检查 first-party auth cookie
- 页面内 `useAuth()` 跳转作为兜底
- WatchlistPanel 管理自选股 (最多 25 只)
- 调用 `api.generateDigest()` 生成摘要
- Watchlist 保存到 Insforge (user_watchlists 表)
- 摘要保存到 Insforge (personal_digests 表)

### `/for-you/monitor` AI 关注列表监控台
- Client Component，需要登录和 `for_you_website` entitlement，未登录重定向到 `/login?redirect=/for-you/monitor`，未开通时显示 Pro paywall
- 调用 `api.getWatchlistMonitor()` -> `GET /api/watchlist-monitor`
- 只读取 cached `ticker_daily_briefs`，页面读取不触发 LLM
- 页面结构：顶部全局 summary、左侧 watchlist 选择器、右侧单 ticker 信号面板
- 右侧面板：ticker summary + `useTechnicalData(symbol, "daily")` 价格图，下方用 3 个 Tab 归类详情：`新闻事件`（新闻总结、英文新闻来源、未来事件、财报）、`技术面`（现状总结、完整 K 线/RSI/MACD 图表、技术判断）、`市场讨论`（Twitter/KOL 中文摘要、主题讨论、原文 evidence）
- 技术面板读取 `technical_monitor` 展示简短现状总结、关键价位和突破/跌破/假跌破/放量/均线/RSI/MACD/Bollinger 等 deterministic 硬信号；完整图表复用个股页 `TechnicalChart`，在 Tab 激活时通过 `useTechnicalData(symbol, "daily")` 读取 `/stocks/{symbol}/technical-data`
- 面板提供 `/stock/{symbol}` 深挖入口

### `/macro` 宏观仪表盘
- 需要登录，首层由项目自定义 middleware 拦截
- 4 维度卡片: 流动性、经济、通胀、情绪
- 每个维度显示: 信号灯 (green/yellow/red) + 子维度分析
- 周报集成: `api.weeklyReport.getLatest()`
- RiskGauge + RiskSummaryBar 展示综合风险评分

### `/macro/liquidity` 流动性
- 需要登录，首层由项目自定义 middleware 拦截
- 净流动性图表 (NetLiquidityChart)
- 全球流动性图表 (GlobalLiquidityChart)
- 6 个 LiquidityCard 展示关键指标
- NFCI 仪表盘 (NFCIGauge)

### `/mcp/authorize` MCP 客户端授权
- 需要登录，首层由项目自定义 middleware 拦截；未登录会跳 `/login?redirect=/mcp/authorize?...`
- 接收 `user_code` query，展示给用户确认
- 表单 POST 到 `/api/mcp/authorize`
- Route handler 读取 `app_access_token`，调用 backend
  `POST /api/kol_research/mcp/auth/device/authorize`
- 授权成功后提示用户回到 MCP 客户端调用 `market_lens_auth_status`
- 页面不展示、不存储 MCP bearer token，也不要求用户输入 TheMarketBrew 密码

### `/research` AI 选股助手
- 需要登录，首层由项目自定义 middleware 拦截
- 页面内仍保留 `useAuth()` 的登录兜底跳转

### `/profile` 用户资料
- 需要登录，未登录跳转 `/login?redirect=/profile`
- 账户页可修改昵称
- 订阅页展示免费 / 试用 / Pro / Max / 已取消状态
- 邮件偏好页会按 `EntitlementsContext` 强制约束可编辑项：
  - `daily_report` 始终可编辑
  - `morning_report` 需要 `morning_report_email`
  - `weekly_report` 需要 `weekly_report_email`
  - `twitter_digest` 需要 Max `twitter_digest`
  - `personal_digest` 需要 `personal_digest_email`
  - 无 entitlement 的项默认显示为关闭且不可开启

### `/login` 登录
- Email + Password 表单
- Google OAuth 按钮
- 登录后重定向到之前页面 (sessionStorage)
- 注册态在需要验证邮箱时会跳到 `/verify-email`
- 无显式 redirect 的注册默认落到 `/?tour=1`，由首页 Guided Tour 完成新用户主引导

### `/verify-email` 邮箱验证
- 支持验证码验证和邮件链接验证两种模式
- 支持 resend verification email
- 验证成功后恢复 session，并跳回原始 redirect；注册默认 redirect 是 `/?tour=1`

### `/feedback` 邮件反馈处理
- 接收邮件中的反馈链接参数 (report_date, email, rating)
- 自动提交到 Backend
- 显示感谢页面

### `/admin/feedback` 用户反馈 dashboard
- Admin 页面，生产可访问；未登录或非 admin 由后端 admin API 拒绝
- 首屏服务端读取 auth cookies，调用 `GET /api/admin/feedback`
- 展示邮件内嵌反馈趋势、邮件反馈明细、Contact 页面反馈 inbox、负向反馈跟进信号

## 数据获取模式

### Server Side (RSC)
- 部分页面使用 React Server Components 做初始数据加载

### Client Side
- 大多数页面使用 `useEffect` + `useState` 客户端获取
- `api.ts` 内置 5 分钟缓存 + 请求去重
- 渐进增强: 先显示骨架屏，数据到达后填充

### Insforge 直连
- 日报、Watchlist、Digest 等数据直接从前端查询 Insforge
- 不经过 Backend，减少延迟
- 使用 `lib/insforge.ts` 封装

## 关键技术点

- **IME 处理**: 中文输入法组合输入的特殊处理 (搜索框)
- **时区**: 使用 `lib/timezone.ts` 将 UTC 转换为用户本地时区
- **本地存储**: 最近查看的股票列表
- **Session 存储**: 登录前的目标页面 URL
