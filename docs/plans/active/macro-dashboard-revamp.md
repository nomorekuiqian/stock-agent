# 宏观仪表盘 Revamp Engineering Plan

> Status: Phase 2-4 shipped · Phase 1 pending decisions
> Related: `frontend/src/app/macro/*`, `backend/app/features/macro/*`, `frontend/src/components/HistoryAreaChart.tsx`
> Vision: 把 /macro 从"数据堆砌页"升级为"每个数字都说得清、看得懂、有出口的宏观数据终端"

## 进度

- **Phase 1**:⏳ 等 D1(指标精选方案)拍板后执行
- **Phase 2**:✅ 已完成(导读 + 空态修复 + 问题加粗 + 象限点击提示)
- **Phase 3**:✅ 已完成(周报 tab + context-aware CTA)
- **Phase 4**:✅ 已完成(术语统一 + SKEW 正常值 + 移除冗余)

## 背景

宏观页面已经从 paywall 开放为免费引流阵地。但当前页面存在三类问题:

1. **数据"说谎"**:主仪表盘有 4 个指标硬编码/lookup 错误,永远显示 N/A,用户第一眼就看到"这站挂了"
2. **用户看不懂**:主仪表盘没有任何说明书(绿/黄/红代表什么、阈值多少、先看哪个),详情页虽然做得好但首入口没有导读
3. **看完无出口**:所有页面没有"下一步做什么"的 CTA,用户读完就关 tab,浪费引流流量

另外,从产品视角审视**指标选择本身**——当前主仪表盘塞了 15 个指标,大部分是"看起来全面"的噪音,真正的代表性指标(例如衰退概率、CPI、10Y 国债、净流动性)反而被淹没。

## 现状问题清单(from 审计)

### P0 · 数据 bug

| 位置 | 问题 | 根因 |
|------|------|------|
| `macro/page.tsx:213` | LEI 硬编码 `value: 'N/A'`,chart 正常渲染 | 没有从 `economy.sub_dimensions` 里读 USSLIND |
| `macro/page.tsx:234` | T5YIFR 硬编码 `value: 'N/A'`,chart 正常渲染 | 没有从 `inflation.sub_dimensions` 里读 |
| `macro/page.tsx:102-103` | UNRATE/PAYEMS 显示 N/A | 用了 `dashboard.categories`(risk 评分用的结构),应该用 `economy.sub_dimensions` |
| `components/HistoryAreaChart.tsx:70-72` | fetch 失败时永远转圈 | error 状态被 capture 但 render 从不绘制错误 UI |
| `macro/page.tsx:250` | 恐贪指数 null 时显示 N/A,无备用文案 | — |

### P1 · 用户不懂在看什么

- 主仪表盘无 legend(绿/黄/红、阈值、"先看哪个")
- 每个数字无"正常范围 / 触发阈值"参照
- MacroQuadrant 里的图表隐藏在 tab 后面,新用户不知道能点
- `OverviewStrip` 的 verdict 为空时显示"暂无 AI 判断"(`OverviewStrip.tsx:35`),首屏即破坏信任
- 移动端 4 象限每个都很长,用户要滚 5-6 屏

### P2 · 无出口

- 所有 macro 页底部没有 "下一步" CTA → /research、/stock
- MacroTabBar 没有"周报"入口,`/macro/weekly` 实际上找不到
- 详情页没有横向 tab(要先返回总览再切换)

### P3 · 打磨

- 中英混杂:`Federal Funds Rate`、`Brent Oil`、`DXY`、`XAU/USD`、`BAMLH0A0HYM2`
- SKEW 有阈值但无"正常值范围"说明
- 数据时效性不透明,N/A 时不告诉用户"下次更新时间"
- OverviewStrip + MacroQuadrant AI 文案 + weekly report 三处 AI 总结,内容可能重复

---

## 指标精选(核心提案)

**原则**:每个象限只保留**最具代表性的 1-2 个指标**,详情页负责深挖。主仪表盘是"数据终端一览",不是"百科全书"。

### 当前 vs 建议

#### 流动性(Liquidity)

| 当前(4 个) | 建议(2 个) | 理由 |
|---|---|---|
| 净流动性 ⭐ | 净流动性 ⭐ | composite,直接回答"钱多了还是少了" |
| Fed 资产 | ❌ 移至详情页 | 是净流动性的组成部分,重复 |
| TGA | ❌ 移至详情页 | 同上 |
| 银行准备金 | ❌ 移至详情页 | 同上 |
| — | RRP 逆回购余额 🆕 | 场外"干火药"存量,和净流动性互补而非重复 |

#### 经济基本面(Economy)

| 当前(4 个) | 建议(2 个) | 理由 |
|---|---|---|
| GDP 季度 | ❌ 移至详情页 | 季度更新太滞后,不适合 dashboard 日常看 |
| 失业率 ⭐ | 失业率 ⭐(修 bug) | 最被市场关注的月度指标 |
| 非农就业 | ❌ 移至详情页 | 和失业率高度相关 |
| LEI 领先指标 | ❌ 移至详情页 | 发布延迟,经常 N/A |
| — | 衰退概率 🆕 (RECPROUSM156N) | NY Fed 模型,直接回答"硬着陆风险",可操作性强 |

#### 通胀与利率(Inflation & Rates)

| 当前(5 个) | 建议(2 个) | 理由 |
|---|---|---|
| CPI YoY ⭐ | CPI YoY ⭐ | 市场最关注的通胀指标 |
| 核心 PCE | ❌ 移至详情页 | 和 CPI 相关度 90%+,重复 |
| 联邦基金利率 | ❌ 移至详情页 | 政策利率变化低频,和 10Y 二选一 |
| 长期通胀预期(T5YIFR) | ❌ 移至详情页 | 市场关注度低于 CPI |
| 10Y 国债 ⭐ | 10Y 国债 ⭐(修 bug) | 所有股票估值的锚,股民必看 |

#### 市场情绪(Sentiment)

| 当前(2 个) | 建议(2 个) | 理由 |
|---|---|---|
| 恐贪指数 ⭐ | 恐贪指数 ⭐ | CNN F&G 预聚合,用户熟悉 |
| VIX | VIX ⭐ | 波动率基准 |

### 汇总:15 → 8 个指标

- 主仪表盘只保留 **8 个最具代表性的指标**,每个都有图表 + 阈值说明
- 移除的指标全部移至各自详情页的"其他指标"或"补充数据"分区,数据不丢,只是不占主屏
- 详情页本来就有 SECTION_EXPLAINER + INDICATOR_INFO 做深度解读,用户想看细节点进去即可

---

## 实施计划(4 个 Phase)

### Phase 1 · 数据修复 + 指标精选(P0 + 核心 UX)

**目标**:让主仪表盘的数字 100% 可信,精简到 8 个代表性指标。

1. **修 4 个 N/A bug**(`macro/page.tsx`)
   - 失业率、非农就业(→ 此项会在精选后删除,只修保留的)、LEI(删除)、T5YIFR(删除)都从 `economy.sub_dimensions` / `inflation.sub_dimensions` 取值
2. **精选到 8 个指标**
   - 流动性象限:净流动性 + RRP
   - 经济象限:失业率 + 衰退概率
   - 通胀象限:CPI YoY + 10Y 国债
   - 情绪象限:恐贪指数 + VIX
3. **修 `HistoryAreaChart` 的 error 态**——加错误 UI("数据暂缓更新" + 重试按钮)
4. **每个指标加阈值参照线**
   - 失业率:4% 绿 / 5% 黄 / >5% 红
   - 衰退概率:<20% 绿 / 20-40% 黄 / >40% 红
   - CPI YoY:≤2.5% 绿 / ≤3.5% 黄 / >3.5% 红
   - 10Y:上下文"过去 5 年区间"
   - F&G:<25 极度恐惧 / 25-45 恐惧 / 45-55 中性 / 55-75 贪婪 / >75 极度贪婪
   - VIX:<15 低 / 15-20 正常 / 20-30 警戒 / >30 危机

**验收**:打开 `/macro`,8 个数字全部显示真实数据;打开 DevTools 断网,chart 显示"数据暂缓更新"而非转圈。

### Phase 2 · 说明书 + 导读(P1)

**目标**:让首次访问的用户 10 秒内知道"这个页面是什么、怎么看"。

1. **主仪表盘顶部加导读 strip**
   - 2 句话解释:"8 个关键数字告诉你宏观环境。红色 = 压力大,绿色 = 健康,黄色 = 观察。"
   - 列出 4 个维度 emoji + 一句话("💧 流动性 · 📈 经济 · 🔥 通胀 · 😱 情绪")
   - 隐藏/展开的"详细说明"展开区,解释每个维度是什么
2. **MacroQuadrant 加视觉提示**
   - Chart tab 加"可点击"的微动画/底部小圆点
   - 默认展示 primary 指标的 chart,加"查看其他指标 →"的 hint
3. **OverviewStrip 空态修复**
   - verdict 为 null 时,不显示"暂无 AI 判断"。改为隐藏 verdict 段,只显示 landscape 摘要
   - 如果 landscape 也为空,整个 strip 隐藏,不占位
   - 或:加"AI 分析每周一 8:00 更新 · 下次更新:{next_monday}"的文案
4. **`MacroPageHeader` 改进**
   - question 文字加粗,和 title 等强度
   - "上次更新"时间戳放显眼处,移动端也可见
5. **阈值标注在图表上**
   - 例如失业率 chart 叠加一条 5% 的虚线,标"衰退警戒"
   - 用 Lightweight Charts 的 priceLine 功能即可

**验收**:新用户打开 `/macro`,不需要问任何问题就能读懂颜色 + 趋势 + 阈值。

### Phase 3 · 出口 CTA + 导航(P2)

**目标**:把宏观流量导向付费功能(AI 投研、个股分析)。

1. **每个 macro 页底部加"下一步"模块**(复用现有 `MacroUpgradeCTA` 但更具针对性)
   - Economy 页:"想知道这对哪些板块影响最大?→ AI 投研引擎(传参 ?context=economy)"
   - Inflation 页:"想看利率敏感股票?→ Screener(还没做)/ AI 投研"
   - Liquidity 页:"流动性紧缩时期防御标的?→ AI 投研"
   - Sentiment 页:"极度恐慌时的反转机会?→ AI 投研"
2. **MacroTabBar 加"周报"入口**
   - 现在 5 个 tab,加第 6 个"周报"→ `/macro/weekly`
3. **详情页加横向 tab 切换**
   - 在 MacroPageHeader 下加 4 个小 tab(经济 / 通胀 / 流动性 / 情绪),无需先返回总览
   - 或者复用 MacroTabBar 即可(已经有了,但用户习惯是从总览进,不是直接跳详情)
4. **weekly report 页结尾加 CTA**
   - "这就是本周的宏观图景。想知道你的自选股在这个环境下会怎样?→ /research?context=weekly"

**验收**:用户打开任何 macro 页,滚到底都有下一步引导。

### Phase 4 · 打磨(P3)

**目标**:细节一致性,消除"不专业"的微观印象。

1. **中英术语统一**
   - 扫描所有 macro 页,英文术语第一次出现时加中文括号(例如 `DXY → 美元指数 (DXY)`)
   - `BAMLH0A0HYM2` 这类 series_id 绝不展示,全部改中文描述
2. **阈值/正常范围补齐**
   - SKEW 加"正常 110-130"
   - 所有指标 INDICATOR_INFO 都要有"正常值 / 警戒值"
3. **数据时效透明**
   - N/A 时显示"数据更新中 · 下次:{date}"
   - 每个指标右上角加小 tooltip:"数据截至 {latest_date}"
4. **移除冗余**
   - OverviewStrip / MacroQuadrant AI 文案 / weekly report 三处做内容去重
   - 主仪表盘 subtitle "流动性 / 经济基本面 / 通胀与利率 / 市场情绪" 删除(和 TabBar 重复)

---

## 文件改动清单

### Phase 1
- `frontend/src/app/macro/page.tsx` — 重写 4 象限 metrics 定义,精选到 8 个指标
- `frontend/src/components/HistoryAreaChart.tsx` — 加 error UI
- `frontend/src/components/FredAreaChart.tsx` — 可能需要透传 error 状态
- 新建:`frontend/src/app/macro/_components/ThresholdLine.tsx`(阈值虚线)或在指标卡内内联渲染

### Phase 2
- `frontend/src/app/macro/page.tsx` — 顶部加导读 strip
- `frontend/src/app/macro/_components/MacroQuadrant.tsx` — 加 tab 提示
- `frontend/src/app/macro/_components/OverviewStrip.tsx` — 空态改进
- `frontend/src/components/MacroPageHeader.tsx` — question 加粗
- 新建:`frontend/src/app/macro/_components/DashboardLegend.tsx`(颜色 + 阈值说明 banner)

### Phase 3
- `frontend/src/app/macro/_components/MacroUpgradeCTA.tsx` — 支持 context 参数
- `frontend/src/app/macro/_components/MacroTabBar.tsx` — 加"周报" tab
- `frontend/src/app/macro/{economy,inflation-rates,liquidity,sentiment}/page.tsx` — 结尾加针对性 CTA
- `frontend/src/app/macro/weekly/page.tsx` — 结尾 CTA

### Phase 4
- 全部 macro 页 — 中英术语扫描 + INDICATOR_INFO 补齐正常范围
- `frontend/src/app/macro/page.tsx` — 删除冗余 subtitle

---

## 需要用户拍板的决策点

### D1 · 指标精选方案
上面建议的 8 个指标精选是否 ok? 特别是:
- 流动性只留"净流动性 + RRP",删 Fed 资产/TGA/银行准备金——是否太激进?
- 经济删 GDP + 非农就业 + LEI,只留失业率 + 衰退概率——是否 ok?
- 通胀删 PCE + FEDFUNDS + T5YIFR,只留 CPI + 10Y——是否 ok?

**备选方案**:保留 3 个/象限,总共 12 个指标,精简程度居中。

### D2 · 阈值参照线
要不要在 chart 上叠加虚线标阈值(例如失业率 5% 红线)? 这会让图表"有味道"但也增加复杂度。

### D3 · 导读 strip 默认展开/收起
顶部说明书默认展开(新用户友好但占屏)还是收起(老用户清爽)?

### D4 · 详情页 CTA 的传参策略
`/research?context=economy` 这种参数需要后端 agent 识别并定向回答。要不要本期做,还是只传参数,agent 侧单独立项?

### D5 · 周报 tab 放在 MacroTabBar 的位置
- 方案 A:放最右边(和现有 5 个并列)
- 方案 B:放最左边(取代"总览"作为首屏)
- 方案 C:单独做一个 hero CTA 在总览页顶部,不加 tab

---

## 开工顺序建议

1. **立即**:Phase 1(数据修复 + 指标精选)——这是**一眼可见的丢脸问题**,必须先做
2. **紧接**:Phase 2(说明书 + 空态)——让页面对新用户"自解释"
3. **再做**:Phase 3(CTA)——转化要有付费功能相对成熟再接
4. **最后**:Phase 4(打磨)——可以随时插空做

Phase 1 + 2 做完,页面已经上了一个大台阶。Phase 3/4 可以分散到接下来几个迭代。

## Open Questions(后续讨论)

- 是否要在主仪表盘顶部加一个"今天的宏观一句话"?(类似日报的 headline,独立于 weekly verdict)
- MacroQuadrant 是否值得重构? 当前 1 chart + tab 切换的模式是否最优?
- `/macro` 主页是否应该比 `/macro/weekly` 更重?目前主页权重不如周报。
