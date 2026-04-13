# 持仓概览 UI 重构 Engineering Plan

> Status: Ready to Implement
> Related: frontend/src/components/for-you/DigestInlineReport.tsx
> Scope: 纯前端改动，不涉及后端或数据结构变更

## 目标

将 DigestInlineReport 中的"持仓概览"section 从线性列表重构为**双栏布局 + 按波动排序 + 异常高亮**，提升信息密度和交互效率。

## 现状问题

当前实现在 `DigestInlineReport.tsx:63-97`：

- 所有股票等权排列，无视觉层次
- 10 只股票需要滚动很长才能看完
- symbol 不可点击，无法跳转 `/stock/{symbol}`
- quick_take（3-4 句）全部展开，信息过载

## 设计

### 桌面端：双栏布局

```
┌─ 持仓概览 ──────────────────────────────────────────────────────┐
│                                                                  │
│  ┌─ 股票列表（按|涨跌|排序）─┐  ┌─ 详情面板 ─────────────────┐  │
│  │                            │  │                             │  │
│  │  🔴 TSLA  $182.30  -4.2% ◀│  │  特斯拉 TSLA → /stock/TSLA │  │
│  │  ━━━━━━━━━━━━━━━━━━━━━━━━  │  │  $182.30                   │  │
│  │  🟢 NVDA  $850.25  +2.4%  │  │  -4.2% 今日  |  -6.8% 本周  │  │
│  │  ────────────────────────  │  │                             │  │
│  │  🟢 AMD   $165.80  +1.8%  │  │  ┌ 跟随板块回调 ┐           │  │
│  │  ────────────────────────  │  │  └──────────────┘           │  │
│  │  🟢 AAPL  $250.00  +0.5%  │  │                             │  │
│  │  ────────────────────────  │  │  受欧盟关税加征消息影响，    │  │
│  │  🔴 MSFT  $420.10  -0.3%  │  │  特斯拉今日领跌。市场担忧    │  │
│  │  ────────────────────────  │  │  欧洲市场收入占比较高的      │  │
│  │  🟢 COST  $920.50  +0.1%  │  │  特斯拉将首当其冲。          │  │
│  │                            │  │                             │  │
│  │                            │  │  → 查看 TSLA 完整分析        │  │
│  └────────────────────────────┘  └─────────────────────────────┘  │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

**左栏**（固定宽度 ~260px）：
- 每行：symbol + 价格 + 涨跌%
- 按 `|daily_change|` 降序排列
- `|change| > 3%` 的行加低透明度背景高亮（红/绿）
- 选中行左侧加 emerald 竖线指示器
- 默认选中第一行（波动最大的）

**右栏**（自适应宽度）：
- **始终展示完整信息**：name + symbol（可点击跳转 /stock） + price + daily_change + week_change + status badge + quick_take 全文
- 点击左栏切换右栏内容，带淡入过渡
- 底部 "查看完整分析 →" 链接到 `/stock/{symbol}`

### 移动端：手风琴模式

屏幕宽度 < md（768px）时降级为单栏手风琴：

```
┌─ 持仓概览 ───────────────────────────┐
│                                       │
│  🔴 TSLA  $182.30  -4.2%        ▼   │  ← 默认展开（波动最大）
│  ┌────────────────────────────────┐   │
│  │  特斯拉 · 跟随板块回调          │   │
│  │  -4.2% 今日  |  -6.8% 本周     │   │
│  │  受欧盟关税加征消息影响...      │   │
│  │  → 查看 TSLA 完整分析          │   │
│  └────────────────────────────────┘   │
│  🟢 NVDA  $850.25  +2.4%        ▶   │  ← 折叠
│  🟢 AMD   $165.80  +1.8%        ▶   │
│  🔴 MSFT  $420.10  -0.3%        ▶   │
│                                       │
└───────────────────────────────────────┘
```

- 点击行展开详情，同时折叠其他（同一时间只展开一个）
- 默认展开波动最大的那只

## 改动范围

### 涉及文件

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `components/for-you/DigestInlineReport.tsx` | **修改** | 替换持仓概览 section（L63-97） |
| `components/for-you/StockOverviewPanel.tsx` | **新建** | 双栏布局主组件 |
| `components/for-you/StockListItem.tsx` | **新建** | 左栏单行股票条目 |
| `components/for-you/StockDetailPanel.tsx` | **新建** | 右栏详情面板 |
| `lib/digest-utils.ts` | **修改** | 新增排序辅助函数 |

### 不涉及的文件

- 后端代码 — 无需改动，数据结构不变
- `lib/api.ts` — StockAnalysis 接口不变
- 其他 digest sections（头条新闻、更多新闻、重要事件、总结）— 不动

## 详细实现

### 1. 排序辅助函数（`lib/digest-utils.ts`）

```typescript
/**
 * Parse percentage string like "+2.35%" or "-4.2%" to number.
 */
export function parseChangePercent(change: string): number {
  return parseFloat(change.replace('%', '').replace('+', ''));
}

/**
 * Sort stocks by absolute daily change (highest volatility first).
 */
export function sortByVolatility(stocks: StockAnalysis[]): StockAnalysis[] {
  return [...stocks].sort(
    (a, b) => Math.abs(parseChangePercent(b.daily_change)) - Math.abs(parseChangePercent(a.daily_change))
  );
}

/**
 * Whether a stock's daily move is notable (>3%).
 */
export function isNotableMove(change: string): boolean {
  return Math.abs(parseChangePercent(change)) >= 3;
}
```

### 2. StockListItem 组件

左栏单行，紧凑展示：

```tsx
interface StockListItemProps {
  stock: StockAnalysis;
  isSelected: boolean;
  isHighlighted: boolean;  // |change| > 3%
  onClick: () => void;
}
```

- 选中态：左侧 2px emerald 竖线 + 略深背景
- 高亮态（异常波动）：红/绿 低透明度底色
- hover：轻微背景变化

### 3. StockDetailPanel 组件

右栏完整详情：

```tsx
interface StockDetailPanelProps {
  stock: StockAnalysis;
}
```

内容（全部展示，不折叠）：
1. **Header**: 中文名 + Symbol（Link → `/stock/{symbol}`）
2. **价格行**: 当前价 + 日涨跌 + 周涨跌
3. **Status badge**: 使用 `getStatusColor()`
4. **Quick take**: 全文展示（3-4 句）
5. **Footer**: "查看完整分析 →" Link

切换时加 `animate-fade-in` 过渡。

### 4. StockOverviewPanel 组件

组合左栏 + 右栏：

```tsx
export default function StockOverviewPanel({ stocks }: { stocks: StockAnalysis[] }) {
  const sorted = sortByVolatility(stocks);
  const [selectedSymbol, setSelectedSymbol] = useState(sorted[0]?.symbol);
  const selectedStock = sorted.find(s => s.symbol === selectedSymbol) || sorted[0];

  return (
    <>
      {/* 桌面端：双栏 */}
      <div className="hidden md:grid md:grid-cols-[260px_1fr] gap-4">
        {/* 左栏 */}
        <div className="space-y-0 divide-y divide-border/30 max-h-[400px] overflow-y-auto">
          {sorted.map(stock => (
            <StockListItem
              key={stock.symbol}
              stock={stock}
              isSelected={stock.symbol === selectedSymbol}
              isHighlighted={isNotableMove(stock.daily_change)}
              onClick={() => setSelectedSymbol(stock.symbol)}
            />
          ))}
        </div>
        {/* 右栏 */}
        <StockDetailPanel stock={selectedStock} />
      </div>

      {/* 移动端：手风琴 */}
      <div className="md:hidden space-y-0 divide-y divide-border/30">
        {sorted.map(stock => (
          <MobileStockAccordion
            key={stock.symbol}
            stock={stock}
            isOpen={stock.symbol === selectedSymbol}
            isHighlighted={isNotableMove(stock.daily_change)}
            onToggle={() => setSelectedSymbol(
              stock.symbol === selectedSymbol ? '' : stock.symbol
            )}
          />
        ))}
      </div>
    </>
  );
}
```

### 5. DigestInlineReport 改动

替换 L63-97 的持仓概览 section：

```diff
  {/* Watchlist Overview */}
  {digest.stocks.length > 0 && (
    <section className="terminal-card p-6 animate-fade-in-up">
      <div className="flex items-center gap-2 mb-5">
        <div className="w-1 h-5 bg-primary rounded-full" />
        <h3 className="text-sm font-medium text-foreground uppercase tracking-wider">持仓概览</h3>
      </div>
-     <div className="divide-y divide-border/30">
-       {digest.stocks.map((stock: StockAnalysis) => (
-         // ... 现有线性列表
-       ))}
-     </div>
+     <StockOverviewPanel stocks={digest.stocks} />
    </section>
  )}
```

## 测试计划

### 单元测试：新建 `components/__tests__/StockOverviewPanel.test.tsx`

```
描述: StockOverviewPanel
├── 排序逻辑
│   ├── 按涨跌绝对值降序排列
│   ├── -4.2% 排在 +2.4% 前面（绝对值更大）
│   └── 涨跌相同时保持原顺序（稳定排序）
│
├── 默认选中
│   ├── 默认选中第一行（波动最大）
│   └── 右栏显示该股票的完整信息（name + price + change + status + quick_take）
│
├── 点击切换
│   ├── 点击左栏不同股票 → 右栏内容更新
│   ├── 选中行有视觉指示器（emerald 竖线）
│   └── 之前选中行的指示器消失
│
├── 异常高亮
│   ├── |daily_change| >= 3% 的行有高亮背景
│   ├── 正向 >3% → 绿色背景
│   ├── 负向 <-3% → 红色背景
│   └── |daily_change| < 3% 的行无高亮
│
├── 链接跳转
│   ├── 右栏 symbol 渲染为 Link → /stock/{symbol}
│   └── "查看完整分析" 链接指向正确路径
│
└── 响应式
    ├── md 以上：渲染双栏布局（grid）
    └── md 以下：渲染手风琴布局
```

### 单元测试：更新 `lib/__tests__/digest-utils.test.ts`（如存在）

```
描述: digest-utils 排序辅助
├── parseChangePercent
│   ├── "+2.35%" → 2.35
│   ├── "-4.2%" → -4.2
│   └── "0.00%" → 0
│
├── sortByVolatility
│   ├── [-4.2%, +2.4%, +0.5%] → [-4.2%, +2.4%, +0.5%]
│   └── 空数组 → 空数组
│
└── isNotableMove
    ├── "-4.2%" → true
    ├── "+3.0%" → true
    └── "+2.9%" → false
```

### 手动验证清单

- [ ] 桌面端双栏布局正常显示
- [ ] 默认选中波动最大的股票，右栏显示完整信息
- [ ] 点击左栏切换右栏，过渡动画流畅
- [ ] 异常波动行（>3%）有对应颜色高亮
- [ ] Symbol 可点击跳转到 /stock/{symbol}
- [ ] 移动端自动切换为手风琴模式
- [ ] 移动端默认展开波动最大的股票
- [ ] 移动端点击展开/折叠正常工作
- [ ] 左栏股票数量多时（>6 只）可滚动，不撑破布局
- [ ] 只有 1 只股票时布局不崩溃
- [ ] 现有 digest 的其他 section（新闻、事件、总结）不受影响

## 实施步骤

1. [ ] `lib/digest-utils.ts` — 新增 `parseChangePercent`, `sortByVolatility`, `isNotableMove`
2. [ ] `components/for-you/StockListItem.tsx` — 新建左栏条目组件
3. [ ] `components/for-you/StockDetailPanel.tsx` — 新建右栏详情组件
4. [ ] `components/for-you/StockOverviewPanel.tsx` — 新建双栏主组件（含移动端手风琴）
5. [ ] `components/for-you/DigestInlineReport.tsx` — 替换持仓概览 section（L63-97）
6. [ ] `components/__tests__/StockOverviewPanel.test.tsx` — 单元测试
7. [ ] 手动验证桌面端 + 移动端

## 待定问题

1. **左栏是否需要搜索/筛选？** 如果用户 watchlist 有 20+ 只股票，左栏会很长。V1 先用 `max-h-[400px] overflow-y-auto` 滚动，后续按需加搜索。
2. **右栏是否需要 sticky 定位？** 如果左栏很长需要滚动，右栏固定不动体验更好。建议加 `md:sticky md:top-4`。
3. **手风琴展开动画？** 建议用 CSS `grid-template-rows: 0fr → 1fr` 过渡，或 Radix Accordion 组件（项目已有 Radix 依赖）。
