# Stock Research Page Design System

> 个股研究页面 UI 设计规范
> 适用于：`/stock/[symbol]` 页面及相关金融数据展示页面

## 设计理念

**Financial Terminal + Editorial Luxury**（金融终端 + 编辑奢华）

- **专业感**：参考彭博终端的数据密度和信息层级
- **高端感**：借鉴奢侈品编辑设计的留白和字体选择
- **克制感**：颜色使用克制，避免喧宾夺主

### 核心原则

1. **简洁 > 花哨**：宁可单调也不要杂乱
2. **层级清晰**：通过颜色深浅、字重、大小建立视觉层级
3. **数据优先**：UI 服务于数据，不抢夺注意力
4. **双主题适配**：暗色和亮色主题都要考虑

---

## 颜色系统

### 主题色板

| 用途 | 暗色主题 | 亮色主题 | 说明 |
|------|----------|----------|------|
| **背景** | `#050506` | `white` | 页面主背景 |
| **卡片背景** | `bg-card/50` | `bg-card` | 内容区块背景 |
| **边框** | `border-border/40` | `border-border` | 细微分割线 |

### 强调色

| 层级 | 颜色 | 暗色主题 | 亮色主题 | 用途 |
|------|------|----------|----------|------|
| **主强调** | Emerald | `emerald-500` | `emerald-600` | Section 标题装饰、主按钮、链接 |
| **次强调** | Amber | `amber-400` | `amber-700` | Subsection 标题、次要高亮 |

### 语义色

| 含义 | 暗色主题 | 亮色主题 |
|------|----------|----------|
| 上涨/正面 | `text-emerald-400` | `text-emerald-600` |
| 下跌/负面 | `text-red-400` | `text-red-600` |
| 中性/警告 | `text-amber-400` | `text-amber-600` |

### 文字层级

| 层级 | 暗色主题 | 用途 |
|------|----------|------|
| 主文字 | `text-foreground` | 标题、重要数据 |
| 次文字 | `text-foreground/90` | 指标标签 |
| 辅助文字 | `text-muted-foreground` | 说明文字、英文标签 |
| 弱化文字 | `text-muted-foreground/70` | 次要信息 |

---

## 字体系统

```css
/* 已在 globals.css 中定义 */
--font-editorial: 'Instrument Serif', serif;  /* 大标题、页面标题 */
--font-sans: 'DM Sans', sans-serif;           /* 正文、说明文字 */
--font-data: 'JetBrains Mono', monospace;     /* 数字、代码、股票代码 */
```

### 使用规则

| 元素 | 字体类 | 示例 |
|------|--------|------|
| 页面大标题 | `font-editorial` | 日报标题、报告标题 |
| 区块标题 | `font-sans` (默认) | "基本面分析"、"财报数据" |
| 正文/描述 | `font-sans` (默认) | 公司简介、分析内容 |
| 价格/数值 | `font-data` | $138.50、+2.35%、2024 Q3 |
| 股票代码 | `font-data` | NVDA、AAPL |
| 日期/时间 | `font-data` | 2025-01-19、14:30 |

### 字号规范

| 元素 | 大小 | Tailwind |
|------|------|----------|
| 页面标题 | 24-30px | `text-2xl` / `text-3xl` |
| 区块标题 | 16px | `text-base` |
| 小标题 | 14px | `text-sm` |
| 正文 | 14px | `text-sm` |
| 辅助文字 | 12-13px | `text-xs` / `text-sm` |
| 大数字（价格） | 30px | `text-3xl` |
| 指标数值 | 18px | `text-lg` |

---

## 组件规范

### PageHeader（页面标题）

用于页面顶部的标题区域，采用 Editorial 风格设计。

**基本结构：**

```tsx
<div className="space-y-3">
  {/* Editorial Label */}
  <div className="flex items-center gap-3">
    <div className="h-px flex-1 max-w-[60px] bg-gradient-to-r from-primary to-transparent" />
    <span className="text-primary text-xs font-medium tracking-[0.2em] uppercase">LABEL TEXT</span>
  </div>

  {/* Main Title */}
  <h1 className="text-3xl md:text-4xl font-editorial text-foreground tracking-tight">
    页面标题
  </h1>

  {/* Subtitle */}
  <p className="text-muted-foreground text-sm md:text-base max-w-lg">
    页面描述文字
  </p>
</div>
```

**设计要点：**
- Emerald 渐变线条作为装饰元素
- 大写英文标签 + 增加字间距 (`tracking-[0.2em]`) 提升专业感
- 标签文字使用 `text-primary` 保持品牌一致性
- 主标题使用 `font-editorial` 字体

**带附加信息的变体：**

```tsx
<div className="flex items-center gap-3">
  <div className="h-px flex-1 max-w-[60px] bg-gradient-to-r from-primary to-transparent" />
  <span className="text-primary text-xs font-medium tracking-[0.2em] uppercase">FOR YOU</span>
  {symbols.length > 0 && (
    <span className="text-muted-foreground text-xs font-medium tracking-[0.15em] ml-2">/ {symbols.length} STOCKS</span>
  )}
</div>
```

**居中对齐变体（用于归档页面）：**

```tsx
<div className="flex items-center justify-center gap-3">
  <div className="h-px flex-1 max-w-[60px] bg-gradient-to-r from-primary to-transparent" />
  <span className="text-primary text-xs font-medium tracking-[0.2em] uppercase">ARCHIVE</span>
  <div className="h-px flex-1 max-w-[60px] bg-gradient-to-l from-primary to-transparent" />
</div>
```

**应用页面：**
- `/today` - DAILY REPORT
- `/for-you` - FOR YOU
- `/sectors` - SECTORS
- `/stock` - STOCK RESEARCH
- `/tools` - DATA TOOLS
- `/contact` - CONTACT
- 所有归档页面 - ARCHIVE

---

### SectionCard（主区块卡片）

用于包裹一个完整的内容区块，如"基本面分析"、"财报数据"。

```tsx
<div className="bg-card/50 border border-border/40 rounded-xl overflow-hidden">
  {/* Header */}
  <div className="px-5 py-4 border-b border-border/30 bg-card/40">
    <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
      <div className="w-1 h-5 bg-emerald-500 rounded-full" />
      <span>区块标题</span>
      <span className="text-muted-foreground text-sm font-normal">English Title</span>
    </h2>
  </div>
  {/* Content */}
  <div className="p-5">
    {/* ... */}
  </div>
</div>
```

**设计要点**：
- Emerald 竖条作为视觉锚点
- 中英文标题并列，英文弱化
- 头部有轻微背景色区分

### SubsectionHeader（小标题）

用于区块内部的分组标题，如"估值指标"、"增长指标"。

```tsx
<h3 className="flex items-center gap-2 text-sm font-medium uppercase tracking-wide mb-3">
  <span className="w-1.5 h-1.5 rounded-full bg-amber-400/80 light:bg-amber-600" />
  <span className="text-amber-400 light:text-amber-700">小标题</span>
  <span className="text-muted-foreground/70 font-normal normal-case">English</span>
</h3>
```

**设计要点**：
- Amber 小圆点装饰（与 Emerald 主色形成层级）
- 大写字母 + 字间距增加专业感
- 英文不大写，用 `normal-case` 还原

### MetricCard（指标卡片）

用于展示单个关键指标。

```tsx
<div className="p-3 bg-card/40 rounded-lg border border-border/40 hover:border-border/60 transition-colors">
  <div className="text-sm mb-1.5">
    <span className="text-foreground/90 font-medium">指标名</span>
    <span className="text-muted-foreground text-xs ml-1.5">English</span>
  </div>
  <div className="font-data text-lg font-semibold text-foreground">
    $1.23B
  </div>
</div>
```

### StatRow（数据行）

用于列表式展示指标。

```tsx
<div className="flex items-center justify-between py-3 border-b border-border/25 last:border-0">
  <span className="text-sm">
    <span className="text-foreground/90 font-medium">指标名</span>
    <span className="text-muted-foreground text-xs ml-1.5">English</span>
  </span>
  <span className="font-data text-base font-semibold text-emerald-400">
    +12.5%
  </span>
</div>
```

### 价格/趋势显示

```tsx
{/* 大价格 */}
<div className="text-3xl font-data font-bold text-foreground tracking-tight">
  $138.50
</div>

{/* 今日变化 */}
<div className="flex items-center gap-2">
  <span className="text-xs text-muted-foreground">今日</span>
  <span className="inline-flex items-center gap-1 text-sm font-data font-medium text-emerald-400">
    <svg>...</svg> {/* 箭头 */}
    +$1.23 (+0.89%)
  </span>
</div>
```

---

## 布局规范

### 页面结构

```
max-w-4xl mx-auto px-4 py-5
├── Breadcrumb (mb-5)
├── Header (mb-5)
├── Chart Section (mb-5)
├── Fundamentals Section (mb-5)
├── Financials Section (mb-5)
└── Company Description (mb-5)
```

### 间距系统

| 用途 | 值 | Tailwind |
|------|-----|----------|
| 区块间距 | 20px | `mb-5` |
| 卡片内边距 | 20px | `p-5` |
| 卡片头部内边距 | 16-20px | `px-5 py-4` |
| 小标题下间距 | 12px | `mb-3` |
| 网格间距 | 8px | `gap-2` |
| 子区块间距 | 20px | `mb-5 pb-5 border-b` |

### 圆角

| 元素 | 值 | Tailwind |
|------|-----|----------|
| 主卡片 | 12px | `rounded-xl` |
| 子卡片/按钮 | 8px | `rounded-lg` |
| 徽章/标签 | 4-6px | `rounded` / `rounded-md` |
| 圆点装饰 | 50% | `rounded-full` |

---

## 交互规范

### 悬停效果

```css
/* 卡片悬停 */
hover:border-border/60 transition-colors

/* 链接悬停 */
hover:text-emerald-400 transition-colors

/* 按钮悬停 */
hover:bg-emerald-500/20 transition-colors
```

### Tooltip

- 深色背景 `bg-card`
- 细边框 `border border-border`
- 圆角 `rounded-lg`
- 阴影 `shadow-xl`
- 最大宽度 `w-56`

---

## 国际化

### 行业翻译

页面中已包含 `SECTOR_TRANSLATIONS` 和 `INDUSTRY_TRANSLATIONS` 映射表，用于将英文行业名翻译为中文。

新增行业时，请在对应映射表中添加翻译。

### 中英文并列

- 主要信息用中文
- 英文作为补充，字号更小、颜色更浅
- 分隔符使用 `·` 而非 `/`

---

## 响应式设计

### 断点策略

- 移动端优先 (Mobile First)
- `md:` (768px) 用于平板/桌面适配

### 常用模式

```tsx
{/* 网格响应式 */}
<div className="grid grid-cols-2 md:grid-cols-4 gap-2">

{/* 间距响应式 */}
<div className="px-4 md:px-6 py-8 md:py-12">
```

---

## 亮色主题适配

使用 `light:` 前缀（在 globals.css 中定义的 `@custom-variant`）：

```tsx
{/* 颜色适配 */}
<span className="text-amber-400 light:text-amber-700">

{/* 背景适配 */}
<span className="bg-amber-400/80 light:bg-amber-600">
```

**原则**：
- 暗色主题用 400 级别颜色
- 亮色主题用 600-700 级别颜色
- 确保对比度足够

---

## 禁忌

1. **不要使用鲜艳的彩色**：Sky、Violet、Rose、Cyan 等高饱和度颜色会喧宾夺主
2. **不要过度使用强调色**：Emerald 仅用于一级标题和主要交互元素
3. **不要混用字体**：数字必须用 `font-data`，不要用默认字体显示价格
4. **不要忽略亮色主题**：每个颜色都要考虑双主题适配
5. **不要使用过多动画**：保持克制，只在必要处使用 `transition-colors`

---

## 文件参考

- 主页面实现：`/src/app/stock/[symbol]/page.tsx`
- 全局样式：`/src/app/globals.css`
- 图表组件：`/src/components/StockPriceChart.tsx`
