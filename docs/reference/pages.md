# 前端页面路由

## 路由总览

### 主要页面
| 路由 | 页面 | 数据来源 | 需要认证 |
|------|------|----------|----------|
| `/` | 首页 (Landing) | 无 API 调用 | 否 |
| `/today` | 市场日报 | Insforge (getLatestReport) + Backend (getMarketAnalysis) | 否 |
| `/today/[id]` | 日报详情 | Insforge (getReportById) | 否 |
| `/today/archive` | 日报存档 | Insforge (getReportsList) | 否 |
| `/morning` | 盘前早报 | Backend (morningReports API) | 否 |
| `/morning/[id]` | 早报详情 | Backend (morningReports.getById) | 否 |
| `/morning/archive` | 早报存档 | Backend (morningReports API) | 否 |
| `/twitter-digest` | 推特 KOL 观点日报 | Backend (twitterDigest.getLatest / getLatestTeaser) | 否（全文需 Max） |
| `/twitter-digest/[date]` | 推特 KOL 观点日报详情 | Backend (twitterDigest.getByDate / getTeaserByDate) | 否（全文需 Max） |
| `/twitter-digest/archive` | 推特 KOL 日报归档 | Backend (twitterDigest.listArchive / listArchiveTeaser) | 否（全文需 Max） |
| `/kol/qinbafrank` | qinbafrank 博主研究室 | skill 资产 + Backend (kolResearch cockpit/chatStream) | 浏览否；对话需登录 |
| `/stock` | 个股研究 | Backend (searchStocks, getStockQuotes) | 否 |
| `/stock/[symbol]` | 个股详情 | Backend (stock API 多端点) | 否 |
| `/for-you` | 个性化摘要 | Insforge (watchlist/digests) + Backend (generateDigest) | 是 |
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
| `/login` | 登录 | Insforge Auth | 否 |
| `/profile` | 用户资料 | Insforge Auth (profiles API) | 是 |
| `/verify-email` | 邮箱验证 | Insforge Auth (verifyEmail + resendVerificationEmail) | 否 |
| `/forgot-password` | 忘记密码 | Insforge Auth (sendPasswordResetEmail) | 否 |
| `/reset-password` | 重置密码 | Insforge Auth (resetPassword) | 否 |
| `/onboarding` | 用户引导 | 无 API 调用 | 否 |
| `/pricing` | 定价页 | Backend (payment API) | 否 |
| `/pricing/success` | 支付成功 | Backend (payment API) | 否 |
| `/request-access` | 申请邀请码 | Backend (invites/request) | 否 |
| `/contact` | 联系/反馈 | Backend (feedback/user) | 否 |
| `/feedback` | 邮件反馈处理 | Backend (feedback) | 否 |
| `/unsubscribe` | 邮件退订 | Backend (subscriptions API) | 否 |
| `/email-test` | 邮件测试 | Backend (notification API) | 否 |
| `/research` | 投研助手 (Research Desk) | Backend (screener/research API) | 是 |
| `/research/kb` | 投研知识库 | Backend (research_kb API) | 是 |
| `/research/gallery` | 投研画廊 | Backend (screener API) | 是 |
| `/settings` | 用户设置 | Backend (notification API) | 是 |
| `/admin` | 管理后台 | Backend (admin API) | 是 (admin) |
| `/admin/users/[id]` | 用户管理详情 | Backend (admin API) | 是 (admin) |
| `/admin/flags` | Feature Flag 管理 | Backend (admin/flags API) | 是 (admin) |
| `/admin/llm-usage` | LLM 用量与费用面板 | Backend (admin/llm-usage API) | 是 (admin) |
| `/dev/feedback` | 开发反馈页 | Backend (feedback) | 否 |
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
- 纯展示页面，无 API 调用

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

### `/kol/qinbafrank` qinbafrank 博主研究室
- Server page + Client Component,页面浏览不要求登录；右侧 Ask the Framework 对话需要登录并开启 `kol_research_agent` flag
- 模块：身份锚点、最新观点、宏观视角、板块地图、个股雷达、KOL Research Agent 深链入口
- 方法论与技能默认来自 `backend/app/features/twitter/methodologies/qinbafrank/`
- 对话入口调用 `api.kolResearch.chatStream()` -> `POST /api/kol_research/chat/stream`，SSE 展示 skill/tool 进度，并在 final 后展示回答、激活 lens 和命中 chunks
- 页面明确标注不是 qinbafrank 本人，不构成投资建议；有 RAG 命中才可说原文支持，否则只能说方法论推断

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

### `/research` AI 选股助手
- 需要登录，首层由项目自定义 middleware 拦截
- 页面内仍保留 `useAuth()` 的登录兜底跳转

### `/profile` 用户资料
- 需要登录，未登录跳转 `/login?redirect=/profile`
- 账户页可修改昵称
- 订阅页展示免费 / 试用 / Pro / Max / 已取消五种状态
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

### `/verify-email` 邮箱验证
- 支持验证码验证和邮件链接验证两种模式
- 支持 resend verification email
- 验证成功后恢复 session，并跳回原始 redirect

### `/feedback` 邮件反馈处理
- 接收邮件中的反馈链接参数 (report_date, email, rating)
- 自动提交到 Backend
- 显示感谢页面

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
