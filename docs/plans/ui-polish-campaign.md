# UI Polish Campaign - Engineering Plan

> Status: Done
> Related: frontend/docs/design-system.md
> Vision: "Financial Terminal + Editorial Luxury" 设计语言的全站落地与提升

## 目标

对所有用户可见页面进行系统性的 UI 审查和优化，提升整体高端感和设计一致性。

## 现状

- 设计系统已建立（`design-system.md`），定义了配色、字体、间距、组件规范
- 3 套字体已就位：LXGW WenKai（中文 editorial）、DM Sans（正文）、JetBrains Mono（数据）
- HarmonyOS Sans SC（中文正文）通过 CDN 加载
- 各页面独立开发，设计一致性可能有偏差
- 交互动效较少，整体风格偏保守

## 设计约束

- **不破坏设计系统**：配色（emerald/amber）、字体族、间距规范保持不变
- **只改样式和布局**：不动业务逻辑、数据流、API 调用
- **不新增依赖**：用现有 Tailwind + shadcn/ui + Radix UI
- **双主题适配**：暗色/亮色主题都要检查
- **每页独立 commit**：方便 review 和回滚

## 优化维度（Critique 检查项）

每个页面从以下 6 个维度评估（0-10 分）：

1. **Typography（排版）**：字体层级是否清晰、字重搭配是否合理、行高/字间距是否舒适
2. **Spacing & Layout（间距与布局）**：视觉节奏是否一致、留白是否合理、网格是否对齐
3. **Color & Contrast（色彩与对比度）**：强调色使用是否克制、对比度是否足够、语义色是否一致
4. **Interaction & Motion（交互与动效）**：hover/focus 状态是否完整、过渡是否流畅、加载状态是否优雅
5. **Consistency（一致性）**：组件风格是否统一、与 design-system.md 是否匹配
6. **Polish（细节打磨）**：边角是否精致、对齐是否精确、整体是否有高端感

## 页面批次

### Batch 1 - 公开页面（第一印象）
1. [x] `/` Landing Page
2. [x] `/today` 市场日报
3. [x] `/stock` + `/stock/[symbol]` 个股研究 (StockCard 组件)

### Batch 2 - 核心产品页面
4. [x] `/for-you` 个性化摘要
5. [x] `/macro` 宏观仪表盘
6. [x] `/morning` 盘前早报

### Batch 3 - 转化与用户管理
7. [x] `/pricing` 定价页
8. [x] `/login` 登录页
9. [x] `/profile` 用户资料

### Batch 4 - 次要页面 + 全站一致性
10. [x] `/contact` 联系页面
11. [x] 全站 eyebrow 统一 (`font-semibold tracking-[0.25em]`)
12. [x] 存档页面 + 认证页面 + PaywallGuard 组件

## 每页执行流程

```
Step 1: Critique
  - 读取页面源码 + 浏览器截图（如可用）
  - 按 6 个维度打分
  - 产出问题清单 + 优先级

Step 2: 必跑 Skills（每个页面都执行）
  - /typeset   → 优化字体层级、字重、行高、字间距
  - /animate   → 加入有目的的动画和过渡效果
  - /delight   → 加微交互和惊喜感，让界面有品味

Step 3: 按 Critique 问题补充修复
  - 间距/布局乱    → /arrange 调整视觉节奏
  - 太保守/平淡    → /bolder 增加视觉冲击
  - 颜色单调       → /colorize 策略性加色
  - 细节粗糙       → /polish 最终打磨

Step 4: 验证
  - 再次 Critique 确认分数提升
  - next build 确认无编译错误
  - 独立 commit 该页面的改动

Step 5: 下一个页面
```

## 质量门禁

- [ ] 每个页面 Critique 6 维度平均分 >= 7
- [ ] `npm run build` 通过
- [ ] 暗色/亮色主题都检查
- [ ] 不破坏现有 E2E 测试
- [ ] 每个页面改动独立 commit，commit message 格式：`ui: polish /page-name - [改动摘要]`

## 待定问题

- 是否需要引入新的动效库（如 framer-motion），还是纯 CSS/Tailwind 动效
- Landing Page 是否需要更大幅度的重新设计，还是在现有基础上打磨
- 是否需要在优化过程中更新 `design-system.md`（如发现规范需要补充）
