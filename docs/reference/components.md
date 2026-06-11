# 前端组件与库文件

## 组件分类总览

| 分类 | 说明 |
|------|------|
| UI 基础 | shadcn/ui 组件 (Avatar, Badge, Button, Card, Collapsible, Dialog, DropdownMenu, Progress, RadioGroup, Separator, Skeleton, Slider, Switch, Tooltip) |
| 导航布局 | Navbar, NavAuth, MobileMenu, Logo, ThemeToggle |
| 数据展示 | ReportContent, ReportTabs, InsightBanner, MacroPageHeader, PageShell |
| 图表 | 各类金融图表 (基于 Lightweight Charts) + FredAreaChart, FredBarChart |
| 风险指标 | RiskGauge, NFCIGauge, RiskSummaryBar, LiquidityCard |
| 个股 | StockCard, StockAnalysisCard, StockSearchDropdown, WatchlistPanel |
| 技术分析 | TechnicalChart |
| 个性化 (for-you) | ActionBar, ForYouBreadcrumb, DigestInlineReport, RecentReports, StockDetailPanel, StockListItem, StockOverviewPanel |
| 持仓同步 | HoldingsSyncDialog |
| 订阅 | SubscribeForm, PaywallGuard |
| 装饰 | TrustBadges, LogoMarquee, ProductShowcase |
| 全局 | Providers, TradingViewWidget, AuthSubscriptionSync, FeatureSections |
| Auth 表单 | PasswordField |
| 其他 | AiChatLink |

---

## 关键组件说明

### ReportContent
市场日报内容渲染器，纯展示组件。
- **输入**: indices, intro, news, report_summary, calendar, timestamp
- **渲染**: 市场指数网格 (6个) -> 今日要点 -> 新闻 (headlines+briefs) -> 日历 -> 总结
- **使用场景**: `/today`, `/today/[id]`

### WatchlistPanel
自选股管理面板，核心交互组件。
- **功能**: 股票搜索 + 添加/删除 + StockCard 网格
- **限制**: 最多 25 只股票
- **使用场景**: `/for-you`

### StockAnalysisCard
AI 个股分析卡片，支持三种状态。
- **Empty**: 显示生成按钮
- **Loading**: 骨架屏
- **Success**: 6 段分析 (概况/基本面/财务/机会/风险/总结)
- **使用场景**: `/stock/[symbol]`

### InsightBanner
周报 AI 解读横幅，可展开/折叠。
- **输入**: SectionAnalysis (data_changes, trend_interpretation, market_implication)
- **信号灯**: green/yellow/red
- **使用场景**: `/macro` 及子页面

### RiskSummaryBar
宏观风险概览条。
- **组成**: RiskGauge (0-10 综合评分) + 4 个 LiquidityCard (四维度)
- **使用场景**: `/macro`

### StockSearchDropdown
股票搜索下拉组件，支持中文 IME 输入。
- **功能**: 防抖搜索 + 下拉结果列表 + 键盘导航
- **使用场景**: `/stock`, `/for-you` (WatchlistPanel 内嵌)

### PaywallGuard
付费墙守卫组件，根据订阅状态控制内容访问。
- **功能**: 检查用户订阅状态，未订阅时显示升级提示
- **使用场景**: Pro 功能入口

### UnlockCTA
升级/解锁 CTA 组件。
- **功能**: 引导用户登录或升级到对应权益
- **使用场景**: 付费内容 preview / locked states

### PasswordField
认证表单共用密码输入组件。
- **功能**: 密码显示/隐藏切换、统一 label/helper text、复用登录/找回/重置密码样式
- **使用场景**: `/login`, `/forgot-password`, `/reset-password`

### 技术分析组件 (technical/)

| 组件 | 说明 | 使用场景 |
|------|------|----------|
| TechnicalChart | 技术指标图表 | `/stock/[symbol]` |

### 个性化组件 (for-you/)

| 组件 | 说明 | 使用场景 |
|------|------|----------|
| ActionBar | 操作工具栏 | `/for-you` |
| ForYouBreadcrumb | 面包屑导航 | `/for-you` |
| DigestInlineReport | 内嵌摘要报告展示 | `/for-you` |
| RecentReports | 近期报告列表 | `/for-you` |
| StockDetailPanel | 个股详情面板 | `/for-you` |
| StockListItem | 自选股列表项 | `/for-you` |
| StockOverviewPanel | 个股概览面板 | `/for-you` |

---

## 图表组件

| 组件 | 图表类型 | 数据源 | 使用场景 |
|------|----------|--------|----------|
| StockPriceChart | K线/面积图 | 父组件传入 | `/stock/[symbol]` |
| NetLiquidityChart | 面积图 | 父组件传入 | `/macro/liquidity` |
| GlobalLiquidityChart | 面积图 | 父组件传入 | `/macro/liquidity` |
| YieldCurveChart | SVG 曲线 | 父组件传入 | `/macro/inflation-rates` |
| HistoryAreaChart | 面积图 (通用) | 自定义 fetcher | 复用基础组件 |
| IndexAreaChart | 面积图 | api.getSentimentHistory | `/macro/sentiment` |
| CommodityAreaChart | 面积图 | api.getCommodityHistory | `/macro/inflation-rates` |
| FredAreaChart | 面积图 (FRED 数据) | 父组件传入 | 宏观子页面 |
| FredBarChart | 柱状图 (FRED 数据) | 父组件传入 | 宏观子页面 |
| TradingViewWidget | 嵌入式 | TradingView CDN | `/stock/[symbol]` |

**技术栈**: Lightweight Charts (lightweight-charts 库)，非 Recharts/D3

---

## 库文件 (lib/)

### api.ts — Backend API 客户端
- **核心**: 统一封装所有 Backend API 调用
- **缓存**: `cachedFetch(key, fetcher, ttl)` — 5 分钟默认 TTL，最多 100 条
- **请求去重**: inflight deduplication (同一请求不重复发送)
- **模块化**: `api.subscriptions.*`, `api.weeklyReport.*`
- **类型**: 45+ TypeScript 接口定义

### insforge.ts — Insforge 数据库直连
- **功能**: 前端直接操作 Insforge (不经过 Backend)
- **操作**: 日报 CRUD、Watchlist CRUD、Digest CRUD
- **表**: market_reports, user_watchlists, personal_digests

### auth-cookies.ts / auth-redirect.ts / auth-verification.ts — 认证辅助
- **auth-cookies.ts**: server-cookie bridge 的 cookie 读写、PKCE verifier cookie
- **auth-redirect.ts**: 登录 redirect path sanitize + sessionStorage 管理
- **auth-verification.ts**: 邮箱验证 pending 状态和 verify path 构造

### timezone.ts — 时区工具
- **核心**: UTC -> 用户本地时区转换
- **市场时区**: America/New_York (判断"今天"的市场报告)
- **函数**: marketTodayStr(), formatTimestamp(), formatRelativeTime()

### stock-names.ts — 股票中文名
- **数据**: 65+ 股票的中英文名称映射
- **覆盖**: Mag7, AI, 软件, 金融, 中概股, 消费, 医疗

### utils.ts — 工具函数
- `cn()` — Tailwind 类名合并 (clsx + tailwind-merge)

---

## Context

### AuthContext.tsx — 全局认证状态
- **State**: user, isLoading, isAuthenticated
- **Methods**: signIn, signUp, signOut, signInWithGoogle, refreshUser
- **自动行为**:
  - mount 时通过同源 `/api/auth` 恢复当前会话
  - 首次登录自动订阅日报
  - 订阅同步 (syncUser)
  - LocalStorage 记录订阅状态 (避免重复)
- **Hook**: `useAuth()`

### Providers.tsx — 全局 Provider 包裹
- ThemeProvider (next-themes)
- AuthProvider (自定义认证)
- SubscriptionProvider

### AuthSubscriptionSync.tsx — 认证订阅同步
- 监听 AuthContext，订阅状态变化时同步到 SubscriptionContext
- 全局挂载，无 UI 渲染

### FeatureSections.tsx — 功能介绍区块
- 首页功能特性展示区
- 使用场景: `/`

### PageShell.tsx — 页面通用 Shell
- 统一的页面布局包装器 (标题 + 内容区)
- 跨多个页面复用

### PostHogProvider.tsx — PostHog Provider
- 客户端 PostHog 初始化和 provider 包裹
- 使用场景: `Providers`

### MarkdownBody.tsx — Markdown 内容渲染
- 统一 Markdown 正文样式
- 使用场景: 报告、AI 输出、研究面板
- `variant="agent"` 用于 Agent 回答，兼容 `->`/`=>`/`→` 流程箭头和行首 `>` 被 Markdown 解析为 blockquote 后不可见的问题

### ReportTabs.tsx — 报告入口标签页
- 早报 / 晚报 / 推特三个报告入口，高亮当前 `/morning`、`/today` 或 `/twitter-digest` 路径
- 使用场景: `/today`, `/morning`

### ProductShowcase.tsx — 产品展示组件
- 首页产品功能截图/预览展示
- 使用场景: `/`

### AiChatLink.tsx — AI 对话入口链接
- 跳转到 AI 对话功能的快捷入口组件

---
