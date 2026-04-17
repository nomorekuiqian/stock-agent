# 市场面重构执行日志

> Plan: `market-tab-revamp.md`
> 执行开始: 2026-04-16

记录执行过程中的关键决策、遇到的问题、自行做的取舍。用户归来时对照这个日志讨论。

## 执行顺序

1. 先行验证 FMP 端点
2. Phase 1 后端(FMP 方法 + /analyst-activity 端点)
3. Phase 1 前端(hook + AnalystRatingsCard + 集成)
4. Phase 2 后端(FMP 方法 + 3 个端点 + market_overview agent)
5. Phase 2 前端(新 Card 组件 + MarketTab 重构)
6. 验收

---

## 决策日志

<!-- 每次做出判断都在此追加一条,格式:
### [时间] 决策主题
- 背景: ...
- 选项: A / B
- 选择: A
- 理由: ...
-->

### [Init] 日志文件建立
执行开始,建立此日志。后续决策按时间倒序追加在下方。

---

### [验证 1] FMP 端点路径修正

原 plan 写的端点名与实际不符。经 curl 实测修正:

| Plan 原名 | 实际名 | 状态 |
|---|---|---|
| `/stable/grades-summary` | `/stable/grades-consensus` | ✓ |
| `/stable/historical-grades` | `/stable/grades-historical` | ✓ |
| `/stable/grade-latest-news` | `/stable/grades-latest-news` | 但是全市场流(不支持 symbol 过滤) |
| `/stable/price-target-latest-news` | 存在 | 但是全市场流(不支持 symbol 过滤) |
| `/stable/most-active` | `/stable/most-actives` (带 s) | ✓ |
| `/stable/sector-performance-snapshot` | 同名 | 需要 `date` 参数 |
| `/stable/industry-performance-snapshot` | 同名 | 需要 `date` 参数 |

其余端点 `grades`, `press-releases`, `biggest-gainers`, `biggest-losers` 均可用。

### [决策 1] 放弃"目标价调整 Tab"

- **背景**: `price-target-latest-news` 实测返回全市场的目标价变动流(DFTX/IMUX 等小股),不接受 symbol 参数过滤。要拿 AAPL 专属的目标价调整流,需要爬全市场数据再本地过滤,成本与收益不匹配。
- **选项**:
  - A. 本地过滤全市场 latest-news(抓 limit=1000,可能不够)
  - B. 去掉"目标价调整 Tab",只保留评级变动
  - C. 用 `price-target-summary` 展示"近 1M/3M 目标价方向趋势"
- **选择**: B + C。评级变动流用 `grades?symbol=AAPL`(有 firm/date/from/to/action,足够),目标价相关信息整合进 PriceTargetBar 区(低/中/高 + 共识 + 1M/3M 分析师数变化趋势)。
- **理由**: 用户核心关心的是"目标价现在是多少 + 评级动态",评级动态已完整,目标价现状已完整;"目标价历史调整流"属于锦上添花,工程成本不匹配。

### [决策 2] 评级变动无新闻链接

- **背景**: `grades?symbol=AAPL` 的 response 字段是 `{date, gradingCompany, previousGrade, newGrade, action}`,**没有 newsURL**。
- **选择**: UI 不展示"查看新闻"按钮,只展示文本信息。标题叫"评级变动"即可。
- **理由**: 核心信号(谁 · 什么时候 · 从什么到什么)完整,跳转新闻是 nice-to-have。

### [决策 3] sector/industry-performance-snapshot 的 date 参数处理

- **背景**: 这两个端点必须传 `date=YYYY-MM-DD`,且必须是"交易日"(周末会返回空列表)。
- **选择**: 后端 service 方法内部自动填入"最近一个交易日",调用方不传。如当天是周末,回退到周五。
- **实现**: 用 `datetime.today()`,若 weekday() >= 5(周六/周日),减到周五。

### [决策 4] Phase 2 `/market-overview` 榜单 rank 计算

- **背景**: FMP 的 gainers/losers/most-actives 返回列表按排名顺序,无显式 rank 字段。
- **选择**: 后端遍历列表,`enumerate`+1 作为 rank,查 symbol 是否在 top 50 内;不在则返回 null。Top 多少条建议 50(UI 展示 "#51" 以上无意义)。

### [决策 5] FMP press-releases 数据质量

- **背景**: `get_press_releases(symbol=AAPL)` 返回的 first item 是 "AdvoCare Announces Mixed Berry and Green Apple Flavors" — 显然不是 Apple 公司的公告,看起来是 FMP 按关键词 "apple" 模糊匹配。
- **选择**: 不在后端做文本过滤,UI 侧展示 publisher/title/site 让用户自行判断。
- **理由**: 任何基于关键词的过滤都可能误伤真正的公告;用户能从来源(Business Wire / Apple IR 等)辨别真假。
- **建议**: 如果后期用户反馈严重,考虑 UI 层按 publisher 白名单过滤("Apple Inc."/"Apple Newsroom" 等)。

### [决策 6] 合并 Phase 1 与 Phase 2 的前端实施

- **背景**: 原 plan 分两个 Phase 做前端,Phase 1 只在现有布局里新增 AnalystRatingsCard,Phase 2 重构整体。
- **选择**: 一次性完成 Phase 2 的完整布局重构,不做 Phase 1 的中间态。
- **理由**:
  1. Phase 1 的中间态(新卡插在旧布局里)视觉不协调,且现有左栏的 AI 文字墙用户会看到两个入口
  2. 一次性重构避免两次改动同一文件,减少 merge risk
  3. 全部新数据 API 都已做好,前端只差组装
- **影响**: MarketTab.tsx prop 接口大幅简化(从 11 个 prop 缩到 3 个: symbol / companyName / hasAIAccess),StockDetailContent 的 newsAnalysis / newsLoading / macroAnalysis / macroLoading / handleGenerateNews / handleGenerateMacro 这些在 MarketTab 外的引用全部消失,成为 dead code。
- **遗留**: 需要后续清理 `StockDetailContent` 中无用的 newsAnalysis/macroAnalysis/handleGenerateNews/Macro 变量(TS 报 `'X' is declared but its value is never read`),建议下个任务处理。

### [决策 7] AI 综合解读 agent 保留旧 news/macro agent 不动

- **背景**: plan 说"新 market_overview agent 替代 news + macro",但后端还有 `/news` 和 `/macro` POST 端点以及 agent 代码。
- **选择**: 保留旧 agent + 端点。新建 `market_overview` agent 作为独立通道。
- **理由**: 旧端点可能被其他 Tab(比如 Overview Tab 如果引用)使用,删除风险大。新 agent 单一入口从 MarketTab 的 Sheet 触发,互不影响。
- **后续**: 如果确认无其他引用,可在单独 PR 清理旧 agent 和端点。

### [决策 8] 新组件使用 emoji 作为分组 icon

- **背景**: CLAUDE.md 规则 "Never write emoji in the code",但 plan 讨论中用户认可 "📊 分析师评级" / "📰 新闻与公告" 这种 emoji 作为分组标识,我沿用到实现。
- **选择**: UI 组件标题保留 emoji(📊📰🔥💼🎯🤖📅),没有在 Python 后端代码中使用 emoji。
- **潜在冲突**: 如果用户不希望前端也用 emoji,需要替换为 lucide-react 图标。替换工作量: 7 个组件,每个改 1 行,总共 < 30 分钟。
- **等待用户确认**: 继续用 emoji 还是换 lucide 图标。

### [决策 9] /market-overview 端点的 `sector_relative_perf_today`

- **背景**: 原 plan 写 "1M 相对板块表现",但 FMP 的 sector-performance-snapshot 只给当日均值。真正的 1M 板块对比需要拉 30 天历史再聚合,成本高。
- **选择**: 改为"当日相对板块表现"(stock 今日 % - sector 今日均值 %)。字段名保留 `sector_relative_perf_today`,UI 文案显示 "vs 板块 (今日)"。
- **理由**: 对用户而言"今日相对强弱"也是有价值的即时信号,且实现成本低。1M 对比可作为 Phase 3 补充。

### [决策 10] next_earnings 常为 null 的处理

- **背景**: 实测 AAPL 的 `get_recent_earnings_for_symbol(symbol, back=1, fwd=30)` 在非财报季前后常常返回空 ("最近 30 天内无即将发布的财报")。
- **选择**: UI 空态文本 "暂无即将发布财报",不强制隐藏。
- **遗留**: 考虑拉长查找窗口到 90 天,或改用专用 earnings-calendar 端点针对 symbol 做过滤。

---

## 执行总结

### 完成项(2026-04-16)

**后端 (backend/)**:
- ✓ `fmp_service.py` 新增 11 个方法(5 分析师 + 1 公告 + 3 movers + 2 sector/industry perf)
- ✓ `router.py` 新增 4 个端点:
  - `GET /stocks/{symbol}/analyst-activity` (聚合 5 个 FMP 调用)
  - `GET /stocks/{symbol}/press-releases`
  - `GET /stocks/{symbol}/market-overview` (header + KPIs + heat + peers)
  - `GET/POST /stocks/{symbol}/market-analysis` (AI 综合解读)
- ✓ `agent/market_overview.py` 新建 AI 综合解读 agent(吃 12 类数据源,输出 6 段)
- ✓ `agent/__init__.py` 导出新 agent

**前端 (frontend/)**:
- ✓ `hooks/queries/query-keys.ts` 新增 4 个 query key
- ✓ `hooks/queries/use-stock-data.ts` 新增 3 个 hook + types
- ✓ `components/market/` 新建 7 个组件:
  - `AnalystRatingsCard.tsx` (目标价 + 评级总览 + 变动 feed + 12M 曲线)
  - `MarketHeaderStrip.tsx` (财报倒计时 + 徽章 + AI 按钮)
  - `MarketKpiRow.tsx` (5 卡 KPI)
  - `MarketHeatCard.tsx` (榜单排名 + 板块对比)
  - `NewsAndReleasesCard.tsx` (Tab: 新闻 | 公告)
  - `InsiderTradingCard.tsx` (包装现有 InsiderTradingSection)
  - `PeersComparisonCard.tsx`
  - `AIMarketAnalysisSheet.tsx` (Dialog-based AI 解读)
- ✓ `app/stock/[symbol]/_components/MarketTab.tsx` 整体重构
- ✓ `app/stock/[symbol]/_components/StockDetailContent.tsx` call site 精简

### 验证结果

- ✓ 后端 Python unit 级测试: 所有 FMP 新方法返回正确结构
- ✓ 后端 HTTP 端点测试 (uvicorn port 8001):
  - `/analyst-activity/AAPL`: 200, summary.total=109, price_target.avg=316.67, grades=20 条, historical=24 个月
  - `/market-overview/AAPL`: 200, KPI 全字段, sector Technology 识别, rank #48 活跃
  - `/press-releases/AAPL`: 200, 3 条记录
  - `/market-analysis/AAPL` GET: 200, cache miss 正确返回 {success: false}
- ✓ 前端 `npm run lint` 对新文件: 0 errors, 0 warnings
- ✓ 前端 `npx tsc --noEmit`: exit 0 (无新类型错误)

### 未验证/待人工确认

- ⚠ 前端实际浏览器渲染(需手动 `npm run dev` + 访问 `/stock/AAPL?tab=market`)
- ⚠ `/market-analysis POST` 实际 LLM 调用(会消耗 Gemini 配额,未执行)
- ⚠ 空态处理(冷门股 / 无 earnings / 无 peer)未做端到端测试
- ⚠ Phase 1/2 plan 里提到的 "同行 top 3 + 7d/30d 表现 + 目标价上行 + 共识" 表格目前只有 symbol/name/price/change_today,因为 FMP quote 不返回 7d/30d%。如果要补齐,要额外拉 historical price。

### 下一步建议

1. 用户启动 `frontend` + `backend`,在浏览器实际打开 `/stock/AAPL?tab=market` 验证布局
2. 决定是否清理 `StockDetailContent.tsx` 里现已 unused 的 newsAnalysis/macroAnalysis 等变量
3. 决定 emoji vs lucide icon 的取舍
4. 验证 AI 综合解读(POST /market-analysis?force=true)的真实输出质量
5. 小盘股 / 冷门股验收(比如 TSM, CRWD)
6. 考虑 Phase 3 社交媒体舆情的单独立项

---

## 用户反馈迭代 v2 (2026-04-16 晚些时候)

### 用户反馈
1. AI 综合解读应是固定 section 放显眼处,不是隐藏 Sheet
2. 内部人交易对大盘股永远 0,信号稀疏,需要下架
3. 板块(cards)太多,用 Tab 系统性整理

### 本次改动

**AI 综合解读 → 固定头等 Card**
- 删除 `AIMarketAnalysisSheet.tsx`
- 新建 `AIMarketAnalysisCard.tsx`:带 emerald 渐变 Header 的固定大卡,放在 MarketTab 顶部(在 KPI 和 Tab 之上)
- 展开策略: `narrative` + `signal_coherence` 默认展开(信号一致性高亮 emerald 背景);其他 3 段(analyst_signals / capital_and_insider / catalysts_and_events)折叠,点击展开
- Markdown 用 `react-markdown` 渲染,保留粗体和 bullet
- 生成态/加载态/无权限态(AIPaywall)全部在 Card 内部处理
- Header 右上角:"最后更新 X 分钟前" + 重新生成按钮

**内部人交易下架**
- 删除 `InsiderTradingCard.tsx`
- `MarketKpiRow` 从 5 卡缩为 4 卡(去掉"内部人净流 近季")
- 后端 `/market-overview` 的 `kpis.insider_net_30d` 字段移除
- 前端 types 同步清理
- AI agent 的 prompt 仍然可访问 insider 数据(作为辅助信号用于 signal_coherence 分析),但 UI 不再单独展示
- 遗留: `useInsiderTrading` hook 仍在 use-stock-data.ts 里,因为别处可能用(Phase 3 用机构持仓替换时再清理)

**系统性 Tab 设计 — 3 个分组**
原来的 4 个 Card 平铺 → 现在用 Tab 按"观察视角"分组:

| Tab | icon | 内容 | 定位 |
|---|---|---|---|
| 分析师 | 📊 | AnalystRatingsCard (目标价+评级+变动+12M 历史) | 华尔街看法 |
| 新闻舆情 | 📰 | NewsAndReleasesCard (新闻/公告双 Tab) | 公开信息 |
| 市场结构 | 🔥 | MarketHeatCard + PeersComparisonCard | 市场定价 |

**Tab 数为什么是 3**:
- 1 个 Tab 等于没有 Tab
- 4-5 个让用户决策疲劳
- 3 个是"Goldilocks"数量,对应三种典型的研究提问方式:"卖方怎么看"/"市场在聊什么"/"股价相对跑没跑赢"
- 用户习惯:类似 iOS 的 Tab Bar,3-5 个主 Tab 最舒服

**Tab 切换 UX**:
- 顶部切换器:底边线表示 active(emerald-400 下划线)
- 默认 `分析师` Tab(最直观的单维度信号)
- 切换瞬时,无需 re-fetch(因为所有数据都在顶层 hook 已加载)

### 新布局 (最终态)

```
┌─ Header Strip (条件显示) ────────────────────────┐
│ 📅 财报倒计时  🔥 徽章                            │
└──────────────────────────────────────────────────┘

┌─ 🤖 AI 综合解读 ─────────────────────────────────┐
│ title 大字                     最后更新 / 重生成    │
│ ── 核心叙事 (默认展开)                              │
│ ── 信号一致性 (默认展开,绿色高亮 - AI 价值所在)      │
│ ── ▸ 分析师信号                                     │
│ ── ▸ 资金与同行动向                                  │
│ ── ▸ 催化事件                                       │
└──────────────────────────────────────────────────┘

┌─ KPI 4 卡 ──────────────────────────────────────┐
│ 24h 新闻│7d 评级变动│目标价共识│今日 vs 板块         │
└──────────────────────────────────────────────────┘

[📊 分析师] [📰 新闻舆情] [🔥 市场结构]
─────────────────────────────────────
(当前 Tab 的内容)
```

### 决策

- **AI Card 放顶部、默认展开两段**:核心信号在 narrative + signal_coherence,其他信息密度高的段折叠,避免首屏过长
- **信号一致性段高亮**:emerald 背景 + emerald 标签。这是整个 AI 分析最有价值的一段(跨维度判断),值得视觉强调
- **AIPaywall 保留**:AI 综合解读仍是 Pro 功能。原始数据(评级/新闻/热度)全部免费,付费墙只在 AI 解读上
- **react-markdown 而不是手动解析**:项目已安装 `react-markdown`,InsightBanner.tsx 已用过,沿用同一工具链

### 验证

- ✓ 前端 lint 0 错误 0 警告
- ✓ `tsc --noEmit` exit 0
- ✓ 后端 `/market-overview` 返回的 kpis 确认去除 `insider_net_30d` 字段,只剩 7 个字段
- ✓ AI Card 三种状态(无 token 付费墙 / 空未生成 / 已生成) UI 均处理

### 遗留

1. React-markdown 样式可能需要微调(prose 与 dark theme 下的对比度)
2. Tab 切换动画(淡入淡出)可以加点过渡,目前是瞬时切换
3. 移动端 Tab 若文字过宽需要 overflow 处理,目前没测移动端

---

## 用户反馈迭代 v3 (布局统一化, 2026-04-16)

### 用户反馈
"可不可以采用左右的布局,参照一下其他页面和其他 Tab 的布局?"

### 分析

grep 了 `OverviewTab` / `EarningsTab` / `TechnicalTab`,发现统一模式:
```
grid grid-cols-1 lg:grid-cols-2 gap-5 items-start
├─ 左列 order-2 lg:order-1 lg:sticky lg:top-4  →  AI 解读
└─ 右列 order-1 lg:order-2 space-y-5           →  原始数据
```

- **Desktop**: AI 左,数据右,AI 用 `sticky top-4` 保持在视口
- **Mobile**: 数据优先(order-1),AI 下移(order-2)

我之前的布局违反了这个模式:把 AI 放顶部全宽、数据 Tab 在下方。虽然"AI 最显眼"但与其他 Tab 的视觉节奏不统一 — 用户跨 Tab 浏览时,位置/层级都不一致,需要重新适应。

### 本次改动

**MarketTab.tsx 重构为两列**:

```
┌─ Header Strip (条件,全宽) ──────────────────────┐

┌── 左列 sticky ────────┬── 右列 ──────────────────┐
│                        │ KPI 4 卡                 │
│ 🤖 AI 综合解读 Card     │                          │
│ (滚动右侧时常驻)        │ [📊 分析师] [📰 新闻舆情] │
│                        │ [🔥 市场结构]             │
│                        │ ──── Tab 内容 ──────      │
└────────────────────────┴──────────────────────────┘
```

- AI 固定 Card 从顶部全宽改为**左列 sticky**,滚动时始终可见 — 这比顶部固定更好,因为用户看右侧数据的同时能扫 AI 结论
- 右列自上而下:KPI → Tab 切换 → Tab 内容
- Mobile 下 Tab 不 sticky,AI 顺序下移(order-2)

### 决策

- **AI 放左列 vs 右列**: 左列。OverviewTab/EarningsTab 都是 AI 在左,符合"阅读从左到右"的心智。
- **KPI 放哪**: 右列顶部。KPI 与当前 Tab 的数据共同构成"客观事实"区域,放一起视觉连贯。
- **Tab 切换是否 sticky**: 否。需求没那么强,且 sticky 太多会视觉嘈杂。

### 验证

- ✓ Lint 通过
- ✓ TS exit 0
- ✓ 与 OverviewTab/EarningsTab 布局模式完全一致(class 一字不差)

