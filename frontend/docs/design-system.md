# TheMarketBrew Design System v2

> Minimalism meets financial data density. Depth through shadow layers, not borders. Warmth through champagne gold accents.
> Inspired by Apple and Linear Design.

---

## Philosophy

**Three Core Principles:**

1. **Depth Through Shadow** — Elevation and hierarchy via multi-layer shadows, never borders
2. **Data First** — UI serves the data, not the reverse
3. **Warmth in Details** — Premium accents through gold, not excess color

---

## Surface Hierarchy (3 Levels)

Surfaces are organized by elevation and shadow treatment:

| Level | Class | Usage | Shadow | Border |
|-------|-------|-------|--------|--------|
| **Page** | `bg-background` | Page-level background | None | None |
| **Card** | `v2-card` | Elevated containers, sections | Multi-layer | None |
| **Inset** | `v2-inset` | Recessed areas inside cards (data grids, code blocks, analysis text) | Inset | None |

### v2-card

Borderless elevation via sophisticated multi-layer shadow system.

**Dark mode:**
```css
box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.04),
            0 1px 2px rgba(0, 0, 0, 0.3),
            0 4px 16px rgba(0, 0, 0, 0.25);
```

**Light mode:**
```css
box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.04),
            0 1px 3px rgba(0, 0, 0, 0.06),
            0 4px 16px rgba(0, 0, 0, 0.04);
```

**Hover state:** Intensify the shadow for interactive feedback.

```tsx
<div className="v2-card hover:shadow-lg transition-shadow">
  {/* Content */}
</div>
```

### v2-inset

Recessed surface for nested data areas inside cards (data grids, code blocks, analysis blocks).

**Dark mode:**
```css
background: rgba(255, 255, 255, 0.02);
box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.2);
```

**Light mode:**
```css
background: rgba(0, 0, 0, 0.02);
box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.04);
```

```tsx
<div className="v2-inset p-4">
  {/* Data grid, code, or analysis content */}
</div>
```

---

## Dividers & Separation

### Primary Divider

Use the theme-aware subtle border for functional dividers (optional):

```css
border-border/10     /* Theme-aware, works in both dark and light mode */
```

### Alternative: Whitespace Separation

**Preferred approach:** Remove dividers entirely and use whitespace instead.

```tsx
{/* Instead of border-b, use spacing */}
<div className="space-y-8">
  <section>{/* Section 1 */}</section>
  <section>{/* Section 2 */}</section>
</div>
```

---

## Color System

### Primary Brand Color

**Emerald-500** (`#10B981`) — Brand identity, CTAs, active states, positive indicators

```tsx
<button className="bg-emerald-500 hover:bg-emerald-600">Primary Action</button>
<span className="text-emerald-500">Active State</span>
```

### Secondary Accent: Champagne Gold

**Gold** (`#C9A96E`) — Premium features, highlights, and secondary emphasis

```tsx
<span className="text-gold">Premium Badge</span>
<div className="bg-gold/10">Highlighted Section</div>
```

**Exception:** Morning report pages retain `amber-400` (dark) / `amber-500` (light) as theme color. Do not replace with gold on morning report pages.

### Semantic Signal Colors

- **Positive:** `emerald-500`
- **Negative:** `red-500`
- **Neutral/Muted:** `muted-foreground`

```tsx
{/* Bullish signal */}
<span className="border-l-2 border-emerald-500 pl-3">+12.5%</span>

{/* Bearish signal */}
<span className="border-l-2 border-red-500 pl-3">-8.2%</span>
```

---

## Typography

### Font Families

```css
--font-editorial: 'Instrument Serif', serif;   /* Page titles, hero text */
--font-sans: 'DM Sans', sans-serif;             /* Body, labels, UI */
--font-data: 'JetBrains Mono', monospace;       /* Numbers, codes, symbols */
```

### Type Scale

Standardized 10-level type scale. Do not use custom `text-[Npx]` utilities outside of SVG elements.

| Level | Class | Size | Usage |
|-------|-------|------|-------|
| micro | `text-micro` | 10px | Avatar letters, data source tags, hover hints |
| caption | `text-xs` | 12px | Labels, badges, metadata, timestamps |
| body | `text-sm` | 14px | Body text, nav items, buttons, descriptions |
| lead | `text-base` | 16px | Page descriptions, brand names, summaries |
| title-sm | `text-lg` | 18px | Card titles, subsection headers |
| title | `text-xl` | 20px | Prominent titles, stat values |
| title-lg | `text-2xl` | 24px | Page subtitles |
| display | `text-3xl` – `text-6xl` | 30–60px | Page hero titles (responsive chain) |
| data-hero | `text-data-hero` | 40px | Dashboard hero numbers |

**Custom Tokens** (defined in `globals.css`):

```css
--text-micro: 0.625rem;      /* 10px */
--text-data-hero: 2.5rem;    /* 40px */
```

### Usage Rules

| Element | Font | Class | Example |
|---------|------|-------|---------|
| Page hero title | editorial | `text-3xl md:text-4xl font-editorial` | Report titles, page headers |
| Section header | sans (bold) | `text-sm font-semibold uppercase tracking-wider` | "Market Analysis", "Holdings" |
| Body text | sans | `text-sm text-foreground/90 leading-relaxed` | Descriptions, analysis |
| Numbers/Prices | data | `font-data` | $138.50, +2.35%, 2024 Q3 |
| Stock symbols | data | `font-data` | NVDA, AAPL |
| Timestamps | data | `font-data` | 2025-01-19, 14:30 |

---

## Spacing System

### Section Gaps

Use spacing instead of borders to separate major sections.

```tsx
<div className="space-y-8">
  <section>{/* Section 1 */}</section>
  <section>{/* Section 2 */}</section>
  <section>{/* Section 3 */}</section>
</div>
```

### Layout Spacing

| Context | Spacing | Class |
|---------|---------|-------|
| Page sections | Large | `py-8 md:py-12` |
| Card padding | Standard | `p-5` or `p-6` |
| Between major sections | Extra large | `mt-16` or `mt-20` |
| Element spacing | Compact | `space-y-3`, `gap-2` |

---

## Animation

### Entrance Animation

Use fade-in-up with staggered delays for dynamic sections:

```tsx
<div className="animate-fade-in-up" style={{ animationDelay: '0ms' }}>
  {/* First element */}
</div>
<div className="animate-fade-in-up" style={{ animationDelay: '100ms' }}>
  {/* Second element */}
</div>
```

### Transitions

All interactive elements should have smooth transitions:

```tsx
{/* Shorter transitions for quick feedback */}
<button className="transition-all duration-200 hover:shadow-lg">
  Quick action
</button>

{/* Slightly longer for emphasis */}
<div className="transition-all duration-300 hover:bg-emerald-500/10">
  Highlighted section
</div>
```

---

## Component Patterns

### PageHeader (Page Titles)

Hero title section with editorial flourish.

```tsx
<div className="space-y-3">
  {/* Editorial Label */}
  <div className="flex items-center gap-3">
    <div className="h-px flex-1 max-w-[60px] bg-gradient-to-r from-emerald-500 to-transparent" />
    <span className="text-emerald-500 text-xs font-medium tracking-[0.2em] uppercase">
      Section Label
    </span>
  </div>

  {/* Main Title */}
  <h1 className="text-3xl md:text-4xl font-editorial text-foreground tracking-tight">
    Page Title
  </h1>

  {/* Subtitle */}
  <p className="text-muted-foreground text-sm md:text-base max-w-lg">
    Page description or summary
  </p>
</div>
```

### SectionCard (Elevated Containers)

Main content card using v2-card shadow.

```tsx
<div className="v2-card rounded-xl overflow-hidden">
  {/* Card Header (optional) */}
  <div className="px-6 py-5 border-b border-border/10">
    <h2 className="text-lg font-semibold text-foreground">
      Section Title
    </h2>
  </div>

  {/* Card Content */}
  <div className="p-6">
    {/* Content */}
  </div>
</div>
```

### DataGrid (Inset Table)

Data table or grid inside a card using v2-inset:

```tsx
<div className="v2-card rounded-xl overflow-hidden">
  <div className="p-6">
    <div className="v2-inset rounded-lg overflow-hidden">
      {/* Table or grid content */}
    </div>
  </div>
</div>
```

### MetricDisplay (Single Metric)

Standalone metric or stat.

```tsx
<div>
  <div className="text-sm text-muted-foreground mb-2">Metric Name</div>
  <div className="text-3xl font-data font-semibold text-foreground">
    $138.50
  </div>
  <div className="text-xs text-emerald-500 mt-1">+2.35%</div>
</div>
```

---

## Responsive Design

### Breakpoints

- **Mobile-first:** Default styles for mobile
- **md (768px):** Tablet and desktop adjustments

```tsx
{/* Responsive typography */}
<h1 className="text-2xl md:text-4xl font-editorial">
  Responsive Title
</h1>

{/* Responsive spacing */}
<div className="px-4 md:px-6 py-6 md:py-12">
  Content
</div>

{/* Responsive grid */}
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  {/* Items */}
</div>
```

---

## Light Mode Adaptation

Use the `light:` variant (custom variant defined in `globals.css`):

```tsx
{/* Color adaptation */}
<span className="text-amber-400 light:text-amber-600">
  Amber text
</span>

{/* Background adaptation */}
<div className="bg-emerald-500/20 light:bg-emerald-500/10">
  Highlighted section
</div>
```

**Principle:**
- Dark mode: Use 400-level color variants
- Light mode: Use 600-700 level color variants
- Ensure sufficient contrast for accessibility

---

## Prohibited Patterns (v1 Deprecated)

Do **not** use these v1 patterns. Use v2 replacements instead.

| Don't | Use Instead | Reason |
|-------|-------------|--------|
| `terminal-card` | `v2-card` | v2-card has proper elevation |
| `bg-card border border-border` | `v2-card` | Borders are deprecated, use shadow elevation |
| `bg-muted/80 border border-border/50` | `v2-inset` | Proper inset styling with shadow |
| `border-b border-border/50` (decorative) | `border-b border-border/10` or remove | Use subtle border or whitespace |
| `border-t border-border/50` (section divider) | `mt-16` or `space-y-8` | Replace with whitespace |
| `amber-400/500` (non-morning pages) | `text-gold` or `bg-gold/10` | Unified secondary accent |
| `text-amber-400` or `text-amber-500` (non-morning) | `text-gold` | Consistent gold accent |

### Preserved Patterns (Keep As-Is)

These patterns should **not** be changed:

1. **Semantic Signal Borders** — Bullish/bearish indicators:
   ```tsx
   <div className="border-l-2 border-emerald-500">  {/* Bullish */}</div>
   <div className="border-l-2 border-red-500">      {/* Bearish */}</div>
   ```

2. **Functional Borders** — Form elements, interactive controls:
   ```tsx
   <input className="border border-border rounded-lg px-3 py-2" />
   <button className="border border-border/50 hover:border-border">Button</button>
   ```

3. **Morning Report Amber Theme** — Keep `amber-400` (dark) / `amber-500` (light) on morning report pages:
   ```tsx
   {/* Morning report page only */}
   <span className="text-amber-400 light:text-amber-500">Morning Theme</span>
   ```

---

## Accessibility

### Color Contrast

All text must meet WCAG AA standards (4.5:1 for body text):

- ✅ `text-foreground` on `bg-background` — sufficient contrast
- ✅ `text-emerald-500` on `bg-background` — sufficient contrast
- ✅ `text-gold` on `bg-background` — sufficient contrast
- ❌ `text-muted-foreground` on `v2-inset` — may fail; test with color contrast analyzer

### Interactive Elements

All interactive elements must be keyboard accessible:

```tsx
<button className="...focus:outline-none focus:ring-2 focus:ring-emerald-500">
  Accessible button
</button>
```

### Semantic HTML

Use semantic HTML elements (`<button>`, `<nav>`, `<section>`, `<h1>`) over divs for better screen reader support.

---

## File References

- **Global Styles:** `frontend/src/app/globals.css` (tailwind config, custom variants, font families)
- **Component Examples:** `frontend/src/components/` (reference for v2 patterns)
- **Page Implementations:** `frontend/src/app/*/page.tsx` (reference for layout patterns)
