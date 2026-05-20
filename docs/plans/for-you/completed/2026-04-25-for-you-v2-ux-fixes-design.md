# 专属日报 V2 UX 改进设计

7 项交互改进，覆盖导航结构、数据展示、内容质量三个方面。

---

## 1. 全局导航 "专属" Dropdown 重构 (#5)

### 现状
V2 模式下 "专属" 是纯链接，管理入口（投资画像、关注列表、模拟持仓、持仓体检）作为按钮行放在 `/for-you` 页面头部。按钮外观不像管理入口，用户容易困惑。

### 改动
将 "专属" 从 `NavLink` 改为 `NavDropdown`，dropdown 内容：

```
我的专属          ← 分组标题（仅文字，不可点击）
├─ 专属日报        → /for-you
├─ 投资画像        → /for-you/onboarding
├─ 关注列表        → /for-you/watchlist
├─ 模拟持仓 [🔒]   → /for-you/portfolio    ← 锁标志基于 entitlement
└─ 持仓体检 [🔒]   → /for-you/health       ← 锁标志基于 entitlement
```

- `NavDropdown` 的 `href` 设为 `/for-you`，点击直接导航，hover 展开 dropdown
- 锁标志通过 `useEntitlements()` 动态判断，检查对应 entitlement（如 `watchlist_extended`）。无权限时显示锁图标，点击跳转 `/pricing`
- 整个 dropdown 形态受 `for_you_v2` feature flag 控制：flag on → 新 dropdown（含分组标题 + 5 入口）；flag off → 保持 V1 的 dropdown 结构（专属日报 + 我的自选股）
- 移除 `/for-you` 页面头部的按钮行（投资画像/关注列表/模拟持仓/持仓体检）
- MobileMenu 中同步更新，在"专属"下展开相同子菜单

### 影响文件
- `frontend/src/components/Navbar.tsx` — 修改 V2 分支从 NavLink 改为 NavDropdown
- `frontend/src/components/MobileMenu.tsx` — 同步子菜单
- `frontend/src/app/for-you/_components/ForYouContentV2.tsx` — 移除按钮行

---

## 2. 面包屑导航统一 (#7)

### 现状
Portfolio 页面有 "返回专属日报" 链接，Health 页面没有，各子页面导航不一致。

### 改动
创建通用面包屑组件 `ForYouBreadcrumb`，所有专属子页面统一使用：

```
专属 / 持仓体检
专属 / 模拟持仓
专属 / 关注列表
专属 / 投资画像
专属 / 历史日报
专属 / 日报详情
```

- "专属" 为链接（→ `/for-you`），当前页面名为纯文本
- 样式：小字号、muted 色调，不抢主内容注意力
- 替换 portfolio 页面现有的 "返回专属日报" 链接

### 影响文件
- 新组件：`frontend/src/components/for-you/ForYouBreadcrumb.tsx`
- 应用到：`health/page.tsx`, `portfolio/page.tsx`, `watchlist/page.tsx`, `onboarding/page.tsx`, `archive/page.tsx`, `[id]/page.tsx`

---

## 3. 持仓概览分组展示 (#1)

### 现状
`StockOverviewPanel` 将 portfolio 和 watchlist 股票合并为一个列表，按波动率排序，无法区分"持有"和"观察"。

### 改动
将持仓概览拆为两个视觉分组：

**"我的持仓" 板块（上方，绿色边框/背景）：**
- 顶部：总市值 + 当日变动金额和百分比
- AI 一句话总结（组合维度：归因分析，哪只股票贡献/拖累最大）
- 股票列表：每行显示 symbol、权重百分比、价格、当日涨跌
- $CASH 显示为金额，无涨跌

**"观察列表" 板块（下方，灰色边框/背景）：**
- 更紧凑的行格式：symbol + 价格 + 涨跌
- 无权重、无总额、无 AI 总结

分组逻辑：
- 股票在 portfolio 中 → "我的持仓"
- 股票仅在 watchlist 中 → "观察列表"
- 两者都有 → 仅显示在"我的持仓"（portfolio 优先）

### 总市值计算依赖
此功能依赖 #4（自动转股数），因为需要 `shares × 最新价` 才能算出总市值。如果用户尚未有 shares 数据（纯 cost_basis 模式），总市值区域回退显示总投入成本。

### 持仓 AI 总结生成
在日报生成时（brew agent）额外输出一个 `portfolio_summary` 字段，专门从组合视角总结当日表现。模板提示：
- 组合整体涨跌归因（哪只贡献最大/拖累最大）
- 与用户 thesis 的一致性（如果有）
- 不重复市场事件叙事（那是 `one_line_summary` 的职责）

### 影响文件
- `frontend/src/components/for-you/StockOverviewPanel.tsx` — 拆分渲染逻辑
- `frontend/src/components/for-you/DigestInlineReport.tsx` — 传入 portfolio vs watchlist 分组数据
- `backend/app/features/brew/agent.py` — 日报 agent 输出增加 `portfolio_summary`
- `backend/app/features/brew/models.py` — DigestResponse 增加 `portfolio_summary` 字段

---

## 4. 添加持仓自动转股数 (#4)

### 现状
用户输入 `cost_basis`（投入金额），系统按 `cost_basis / 总cost_basis` 算权重。没有股数概念，无法追踪市值变化。

### 改动

**录入时自动折算：**
- 用户输入 cost_basis 并保存后，后端获取当日收盘价，自动计算 `shares = cost_basis / price`
- 同时记录 `entry_price`（录入日价格）到 holding 中，作为默认成本基准
- 返回的 HoldingView 包含 shares、cost_basis、entry_price

**前端提示：**
- 保存成功后，在新增股票旁显示折算结果："按 04/25 收盘价 $142.50 折算 → 70.18 股"
- 蓝色信息条："股数按录入当日价格自动折算。如果实际买入价不同，可以在持仓详情中修正成本。"

**后续成本修正：**
- portfolio 编辑界面（`/for-you/portfolio`）的每只股票行增加"买入均价"编辑字段
- 修改买入均价后，股数按 `cost_basis / 新均价` 自动重算，实时预览
- 保存后，`entry_price` 更新为用户输入的买入均价
- 日报 StockDetailPanel 中仅展示（不编辑）：市值、盈亏、成本

**数据模型变更：**
- `user_portfolios` 表新增 `entry_price NUMERIC(18,6)` 列
- `HoldingInput` 新增可选字段 `entry_price: float`
- `HoldingView` 新增字段 `entry_price: float`, `market_value: float`, `unrealized_pnl: float`（后两者为计算字段）
- `compute_effective_weights()` 优先级最高模式变为 `shares × price`（已存在），自动折算保证所有新增持仓都有 shares

### 影响文件
- `backend/migrations/` — 新增 migration 添加 `entry_price` 列
- `backend/app/features/portfolio/models.py` — HoldingInput/HoldingView 新增字段
- `backend/app/features/portfolio/service.py` — 保存时获取价格折算 shares
- `backend/app/features/portfolio/router.py` — bulk save 逻辑调整
- `frontend/src/app/for-you/portfolio/page.tsx` — 显示折算结果 + 提示
- `frontend/src/components/for-you/StockDetailPanel.tsx` — 买入均价编辑

---

## 5. Action Bar 无警报状态改进 (#3 + #6)

### 现状
Green 状态显示 "今天没有需要特别关注的事" + "查看日报" chip。用户已在日报页面，点击无反馈。

### 改动

**Headline 改进：**
- 从固定模板改为组合维度的积极总结
- 模板变量：`overall_drag_pct`、最大贡献股 symbol + 变动、最大拖累股 symbol + 变动
- 示例："组合今日涨 1.4%，NVDA 领跑 (+3.2%)"、"组合微跌 0.2%，整体波动不大"
- 与日报 `one_line_summary` 职责区分：action bar 只说**组合表现**，不说市场事件

**Headline vs 日报总结职责分离：**

| | Action Bar headline | 日报 one_line_summary |
|---|---|---|
| 视角 | 你的组合怎么样 | 市场发生了什么 |
| 数据 | 总涨跌、权重归因、最大贡献/拖累 | 市场事件、行业趋势、个股新闻 |
| 口吻 | 行动导向 | 叙事导向 |

**Chip 引导优先级（后端 service 判断）：**
1. 有持仓股票缺 thesis → "补充投资论点"（link: `#stock-{symbol}` anchor 滚动到 StockOverviewPanel 中该股票的 thesis 输入框）
2. 距上次体检 > 14 天 → "查看持仓体检"（link: /for-you/health）
3. 距上次更新持仓 > 30 天 → "检查持仓"（link: /for-you/portfolio）
4. 兜底 → "查看历史日报"（link: /for-you/archive）

**移除 "查看日报" chip。**

### 影响文件
- `backend/app/features/for_you/service.py` — `_build_stable_signal()` 逻辑重写
- `backend/app/features/for_you/templates.py` — green headline 模板改为组合归因
- `backend/app/features/for_you/models.py` — Signal.data 增加 thesis 缺失列表、体检时间等

---

## 6. Thesis 提示多样化 (#2)

### 现状
唯一提示："一句话说说为什么买 {股票代码}？"

### 改动

**5 个固定主题 + 快选标签：**

| 主题 | 适用场景 | 示例变体 |
|---|---|---|
| 买入理由 | 默认 / 新加入 | "你看好 {sym} 的核心逻辑是？"、"一句话说说为什么持有 {sym}？" |
| 卖出条件 | 已持有 > 7 天 | "什么情况下你会考虑卖出 {sym}？"、"{sym} 跌到多少你会离场？" |
| 风险认知 | 高波动 / 集中持仓 | "持有 {sym} 最大的风险是什么？"、"{sym} 有什么让你担心的？" |
| 预期展望 | 长期持有型 | "你觉得 {sym} 一年后会怎样？"、"{sym} 的下一个催化剂是什么？" |
| 事件驱动 | 有当日事件 | "{sym} 即将发布财报，你怎么看？"（可选 cron 预生成） |

**每主题 3-5 个预写变体，总计约 20 条。**

**选择逻辑：**
1. 检查股票状态匹配适用场景
2. 符合条件的主题中随机选一个
3. 该主题内随机选一个变体
4. "事件驱动"主题：可选每日 cron 根据当天新闻/事件对每只持仓股预生成一条提示，缓存 24h

**快选标签（降低输入门槛）：**
- 每个提示下方附 3-4 个预写标签
- 按行业/板块分组预写（科技股、消费股、金融股等通用标签）
- 用户点击标签即填入 thesis 文本框，可继续编辑
- 示例（科技股 + 买入理由主题）：`[AI 算力需求持续增长]` `[数据中心业务护城河]` `[估值合理可长期持有]` `[跟随市场趋势]`

**存储：**
- 主题 + 变体 + 快选标签定义在前端常量文件中（不存数据库）
- thesis 文本仍存入 `user_portfolios.thesis` 字段，不区分来源

### 影响文件
- 新文件：`frontend/src/lib/thesis-prompts.ts` — 主题/变体/快选标签常量
- `frontend/src/components/for-you/QuickThesisInput.tsx` — 接收主题选择参数，渲染快选标签
- `frontend/src/components/for-you/StockDetailPanel.tsx` — 传入股票状态供主题匹配

---

## 7. 技术约束与注意事项

### Feature Flag 兼容
- 导航 dropdown 形态受 `for_you_v2` 控制
- V1 用户保持原有 dropdown 结构不变
- 面包屑组件对 V1/V2 通用

### Entitlement 动态检查
- Dropdown 锁标志通过 `useEntitlements()` 检查
- 点击锁定入口跳转到 pricing 页面或显示升级提示
- 不在前端硬编码哪些入口需要锁

### 数据模型向后兼容
- `entry_price` 列为可选（nullable），老数据不受影响
- 无 shares 的老持仓在"我的持仓"板块回退显示投入成本而非市值
- `portfolio_summary` 为 digest_data 新增可选字段，老日报不受影响

### 边界情况处理

**自动折算股数 — 非交易日/盘后录入：**
- 后端获取价格时使用"最近一个交易日的收盘价"，而非严格的"当日收盘价"
- 如果 `get_batch_quotes` 返回的价格为 None 或 0，跳过自动折算，保留纯 cost_basis 模式，前端提示"暂时无法获取价格，稍后会自动折算"
- 折算结果中注明实际使用的价格日期（如"按 04/24 收盘价折算"而非假设当天）

**持仓概览 — 空状态：**
- 用户有观察列表但无持仓时，"我的持仓"板块保留，显示空状态占位："还没有模拟持仓，添加后可追踪组合表现"+ CTA 按钮 → /for-you/portfolio
- 反之，有持仓无观察列表时，隐藏"观察列表"板块（不显示空占位）

**Action Bar green chip — 防疲劳：**
- "距上次体检 > 14 天" 等引导 chip，用户如果不点击，不做额外 dismiss 追踪——因为 chip 内容会随每日数据变化自然轮换（今天提示补 thesis，明天可能提示体检）
- 如果连续多天同一个 chip（如只剩一个兜底），后端轮换措辞变体避免视觉疲劳

**移动端 dropdown：**
- MobileMenu 中"专属"展开为缩进子列表，点击区域 ≥ 44px 高度（iOS touch target 标准）
- 开发时在真机测试展开/收起动画流畅度

### 不在本次范围
- Yellow/Red severity action bar chip 行为验证（留到实现时测试）
- 移动端 MobileMenu 的详细交互调整（跟随 dropdown 结构同步即可）
- 事件驱动 thesis 的 cron 预生成（标记为可选，V1 先用纯前端随机逻辑）
- thesis 快选标签的完整行业分类覆盖（先做科技、消费、金融三个大类，后续迭代补充）
