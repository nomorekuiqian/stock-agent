# 前端页面路由

## 路由总览

### 主要页面
| 路由 | 页面 | 数据来源 | 需要认证 |
|------|------|----------|----------|
| `/` | 首页 (Landing) | 无 API 调用 | 否 |
| `/today` | 市场日报 | Insforge (getLatestReport) + Backend (getMarketAnalysis) | 否 |
| `/today/[id]` | 日报详情 | Insforge (getReportById) | 否 |
| `/today/archive` | 日报存档 | Insforge (getReportsList) | 否 |
| `/stock` | 个股研究 | Backend (searchStocks, getStockQuotes) | 否 |
| `/stock/[symbol]` | 个股详情 | Backend (stock API 多端点) | 否 |
| `/for-you` | 个性化摘要 | Insforge (watchlist/digests) + Backend (generateDigest) | 是 |
| `/for-you/[id]` | 摘要详情 | Insforge (getUserDigestById) | 是 |
| `/for-you/archive` | 摘要存档 | Backend (digests API) | 是 |
| `/for-you/watchlist` | 自选股管理 | Backend (watchlist API) + StockQuotes | 是 |
| `/sectors` | 板块分析 | Backend (sectors API) | 否 |
| `/macro` | 宏观仪表盘 | Backend (macro-risk + weekly-report API) | 否 |
| `/macro/liquidity` | 流动性 | Backend (liquidity API) | 否 |
| `/macro/economy` | 经济基本面 | Backend (macro-risk/economy) | 否 |
| `/macro/inflation-rates` | 通胀与利率 | Backend (macro-risk/inflation-rates + cpi) | 否 |
| `/macro/sentiment` | 市场情绪 | Backend (macro-risk/sentiment) | 否 |
| `/sectors/archive` | 板块存档 | Backend (sectors API) | 否 |
| `/login` | 登录 | Insforge Auth | 否 |
| `/profile` | 用户资料 | Insforge Auth (profiles API) | 是 |
| `/auth/callback` | OAuth 回调 | Insforge Auth (code exchange) | 否 |
| `/forgot-password` | 忘记密码 | Insforge Auth (sendPasswordResetEmail) | 否 |
| `/reset-password` | 重置密码 | Insforge Auth (resetPassword) | 否 |
| `/contact` | 联系/反馈 | Backend (feedback/user) | 否 |
| `/feedback` | 邮件反馈处理 | Backend (feedback) | 否 |
| `/unsubscribe` | 邮件退订 | Backend (subscriptions API) | 否 |
| `/email-test` | 邮件测试 | Backend (notification API) | 否 |

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
- WatchlistPanel 管理自选股 (最多 25 只)
- 调用 `api.generateDigest()` 生成摘要
- Watchlist 保存到 Insforge (user_watchlists 表)
- 摘要保存到 Insforge (personal_digests 表)

### `/macro` 宏观仪表盘
- 4 维度卡片: 流动性、经济、通胀、情绪
- 每个维度显示: 信号灯 (green/yellow/red) + 子维度分析
- 周报集成: `api.weeklyReport.getLatest()`
- RiskGauge + RiskSummaryBar 展示综合风险评分

### `/macro/liquidity` 流动性
- 净流动性图表 (NetLiquidityChart)
- 全球流动性图表 (GlobalLiquidityChart)
- 6 个 LiquidityCard 展示关键指标
- NFCI 仪表盘 (NFCIGauge)

### `/login` 登录
- Email + Password 表单
- Google OAuth 按钮
- 登录后重定向到之前页面 (sessionStorage)

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
