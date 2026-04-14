# Stock Detail Page Redesign Brief

> Status: In Progress
> Confirmed: 2026-04-13

## Feature Summary

个股研究页面 (`/stock/[symbol]`) 全面重设计。从单列 mobile feed 布局改为桌面优先的 financial research terminal 风格。4 个 tab（概览/财报/技术面/市场），header 区域固定显示价格 + AI 综合判断。

## Primary User Action

一眼看懂这只股票的状态：价格 + AI 综合判断（看多/看空/中性），然后按需深入任意分析维度。

## Design Direction

- Financial Research Terminal 风格
- 暗色主题，emerald accent 克制使用
- 容器宽度 max-w-[1400px]，桌面填满
- 图表和表格各占约一半数据展示
- AI 解读内嵌在对应数据旁边
- 中高信息密度，不留大面积空白

## Tab Structure (从 5 合并为 4)

1. **概览 Overview** — 关键指标仪表盘 + 价格图表 + AI 投资摘要
2. **财报 Earnings** — 左 AI 解读 + 右数据(图表+表格)，季度切换
3. **技术面 Technical** — 信号仪表盘 + K线图 + AI 技术分析
4. **市场 Market** — 新闻 + 宏观 + 内部人交易 + 分析师共识

## Header

- 左：logo + 公司名 + ticker + 交易所
- 中：大字号价格 + 涨跌幅
- 右：AI 综合判断徽章 + 加入自选按钮
- 下方：事件提示条（财报倒计时、除息日）

## Components to Rewrite

- StockDetailContent.tsx (主页面壳)
- EarningsTab.tsx (财报 tab)
- FundamentalsReport.tsx -> OverviewTab.tsx (概览 tab)
- TechnicalSignalDashboard -> TechnicalTab.tsx (技术面 tab)
- NewsEnhancements -> MarketTab.tsx (市场 tab)
- EventCalendarCard.tsx (事件日历)
