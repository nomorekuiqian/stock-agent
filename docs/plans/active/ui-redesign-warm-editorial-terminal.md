# UI 升级：Warm Editorial Data Terminal

> Status: In Progress（2026-06-06 启动；分支 `worktree-ui+warm-editorial-terminal`）
> Related: frontend/src/app/globals.css, frontend/src/components/.context.md, docs/constraints/design-system.md（若存在）
> Memory: [[project_ui_redesign_direction]]、[[feedback_agent_ui_design]]、[[feedback_macro_dashboard_vision]]、[[feedback_chart_library]]、[[feedback_no_drive_by_copy_changes]]
> 调研产物: `.ui-research/`（synthesis.json / research.json / skills.json / eval_*.json / 截图）

## 目标

把现有 "Financial Terminal meets Editorial Luxury" 的**过度装饰 + 跨页不一致**设计语言，迁移到一个克制、统一、可信的 **Warm Editorial Data Terminal（暖调编辑式数据终端）**。对标 Lovart 的暖编辑感与 YouMind / Linear 的克制纪律，同时守住产品硬约束。

## 诊断（为什么现在"显得不高级"）

两轮多智能体深研（13 + 6 agent）结论，根因不是"做得太少"，而是：

1. **品牌色 = 数据信号色**：emerald `#10b981` 同时是品牌/CTA/链接/焦点/辉光**和**"涨"语义 → 满屏单色、绿涨辨识度被稀释。**头号元凶。**
2. **Token 系统自相矛盾**：`--color-accent`（@theme=emerald vs :root=#141416）、`--input` 两处不一致；暗色 token 重复 4 遍、`hover-glow` 2 遍、`text-gradient-emerald` 3 遍；**无真 `.dark{}`**，暗色靠 `:root` 巧合生效（潜在 system-light FOUC）。
3. **极繁装饰代替克制**：glass + 三档辉光 + 两层噪点 + 网格点 + mesh + 渐变文字 + 3D 倾斜 + ~30 动画散落 25+ 组件 = 教科书级 AI-slop。
4. **规范未执行**：type scale 文档禁 `text-[Npx]`/<14px 中文，实际 ~140 处违例（幽灵 11px、不可读 9–10px 中文）；`.prose-editorial` 死代码。
5. **无共享布局原语**：报告渲染器 3 套区块标题、宏观 3 套头部、容器宽 1152↔1400 跳变、`today/[id]` 与 `/today` 两套模板、emoji/lucide/手写 SVG 混用。
6. **agent 边缘漏出能力炫技**：聊天内核已是 ChatGPT 级，但 research WelcomeScreen 5 色能力卡 + 辉光、KOL `/chat` 营销落地页（用户明确反感）。
7. **假信任 chrome**：重绘的 Bloomberg/路透/WSJ/CNBC logo 墙、编造用户数、占位头像、匿名五星 → 金融产品反效果。

## 标杆要点（可偷的原则）

- **Lovart**：暖近黑 `rgb(16,15,9)` + 奶油 `rgb(245,244,239)`（非冷黑/纯白）；serif display + grotesque sans + mono 标签三层；单一强调色（violet）；层次靠半透明暖色叠层非阴影；pill 反差 CTA；推理流成 checklist；极致留白。
- **YouMind**：减法即方法（"简单不是隐藏，是一开始就不需要"）；留白为一等材料；content-over-chrome；单一青绿 CTA；AI 产出=可编辑文档；速度即美学。
- **Premium playbook（Linear/Vercel/Stripe/...）**：近单色 + 仅一个强调色用在主操作/链接/焦点；单一字族克制字重；8px 间距 + 慷慨留白；低 alpha hairline + 极小柔影（不与边框同用）；圆角 0–8px；150–220ms ease-out；六态齐全；content is the interface。
- **金融/CJK**：data 即视觉；透明（来源/时间戳/方法）建立信任而非装饰；tabular lining 数字；暗模式是设计非反色（不纯黑、按色相去饱和、涨跌过对比并配符号）；中文行高 1.7–1.8、原生字重、全角标点、专门的拉丁/数字字体。

## 目标设计系统（六支柱）

1. **颜色（承重）**：暖近黑底 `~#0E0E0C` + 暖奶油前景 `~#F5F4EF`，层次靠亮度阶梯（base→raised→card→overlay 差 3–5 L）。语义 `--gain`/`--loss` 为唯一方向色（永远配 +/− 或箭头）。品牌强调色**独立于涨跌**、每屏最多一次填充。codemod 106 处 emerald 硬编码 → `var(--brand)`/`var(--gain)`。
2. **Token & 主题**：一值一处；真 `.dark{}`（或 commit 纯暗色去掉 class 策略+enableSystem）；删重复定义；`--border` 降 ~8% 暖白、`--input` 解耦。Tweakcn 一次锁定。
3. **排版**：`font-data` tabular-nums 给所有数字；editorial serif 给标题时刻；`next/font/local` 自托管+预加载中文字体（删 jsDelivr 运行时脚本）；中文行高 1.7–1.8；正式 11px caption 层、禁 <11px；`.prose-editorial` 接入或删除，再 lint 锁。
4. **装饰——激进做减法**：每表面一种氛围；mesh/辉光只留营销 hero；三档辉光→一档；删第二层噪点/网格点/渐变文字阴影/3D 倾斜/mockup-价格卡背后辉光；层次靠暖色 hairline + 极小柔影（不并用）；选中态=扁平 1px 强调边 + 微强调底色。
5. **数据终端密度**：统一 lightweight-charts + 单一 chart-theme（中性十字线）；退 TradingView iframe；彩虹仪表盘→百分位/分布带；单一数字/百分比/货币/空值格式化器（em-dash）；密集 KPI 网格；数据瞬时渲染；内联来源+as-of。
6. **Agent UX——留内核修边缘**：保留 ChatGPT 级壳；WelcomeScreen→居中问候+输入框+3–4 中性 chip；PersonaSelector emoji→lucide+token、`window.confirm`→正规弹窗；合并双 composer；AI 消息加 hover 复制/重生成；可选 Lovart 推理 checklist + context-as-chip（文档式，非调试日志）。

## 工具 / Skill 决策（"两个方案"裁决）

用户曾权衡两套工作流；研究裁决（详见 `.ui-research/eval_synthesis.json`）：

- **方案A "Claude 先设计"**：Claude Design 是真产品(claude.ai/design, Opus 4.7)，但**只产代码/SVG 不产位图**；本 Claude Code 环境**无出图工具**(issue #22618)。强在锁系统/反 slop/数据艺术，**不解决"缺位图素材"**。
- **方案B "Codex + Build Web Apps"**：Build Web Apps 是真 OpenAI Codex 插件，但脚手架**只对新项目 + Supabase**，对成熟 Next16+Insforge 仓库基本零价值；`$imagegen`(gpt-image-2) raster-only、**无 style-lock → 批量出图必风格漂移 = slop**。
- **裁决（混合，Claude Code 为脊柱）**：
  - **建站/锁方向**留在 Claude Code（仓库在此、反 slop skills 在此、零翻译损耗）。
  - **出图**用 **Recraft V4 Vector**（唯一真 SVG + Style Lock 成套一致），中文文字图用 **Nano Banana Pro**，Midjourney 仅手动偶尔。
  - **Codex** 仅作偶尔独立 `codex review` 第二意见。
- **load-bearing 原则**：① **先减后加**（先删廉价 CSS 特效，再加少量精造资产）；② **data 即视觉**（最高 ROI 的视觉=已有 12+ 图表升格 + 真实报告数据做动态 OG 卡）；生成式装饰插画**降低**金融可信度，绝不上 AI 拟真人脸/3D 等距渲染/假图表。

## 该补的视觉资产清单（非组件视觉）

| 资产 | 工具/skill | 备注 |
|---|---|---|
| 数据艺术 hero（真图表当主视觉） | lightweight-charts/recharts + impeccable | 首选，零 slop |
| 动态 OG/社交卡（真实报告数据） | @vercel/og + Satori | 既品牌图又产品力证明 |
| 一个品牌母题/marque | 手写 SVG 或 Recraft Style Lock | 核心标识别 AI 一键生成 |
| 成套图标族（单一风格） | Lucide/Phosphor+token 或 Recraft 10–15 个 | 矢量、暗模式可重着色 |
| 字体系统（含好中文字面） | typeset + DESIGN.md | 脱离 slop 最快 |
| 信任视觉层（时间戳/来源/免责） | impeccable/design-taste-frontend | 金融的"视觉资产" |
| 一处微噪点 + 一处招牌渐变 | CSS（先减到 0–1） | 整页渐变是头号 slop tell |
| 稀有定制/调色摄影（可选） | 真摄影/统一调色 | 绝不 AI 拟真人脸 |
| 中文文字 banner（仅必要时） | Nano Banana Pro | 非核心风格引擎 |

## 分阶段执行计划

> 原则：先减后加；每阶段独立可 review；不碰产品文案（[[feedback_no_drive_by_copy_changes]]）。

- **Stage 0 — 先减法（本次执行）**：删 1 层噪点（保留 editorial-paper）、网格点 `bg-dot-pattern`、渐变文字 `text-gradient-emerald`、3D 倾斜、emerald 辉光工具类（`glow-emerald*` + emerald `hover-glow`），移除明显装饰动画（`float`/`gradient-shift`/`pulse-glow`）及其类与用法；保留功能性动画（loading/chat 流式/nav indicator/sparkline/modal/reduced-motion）。grep 验证 keyframes / `animate-*` / 目标工具类数量明显下降，`tsc`/`lint`/`build` 通过。**不动颜色 token 结构（属 Stage 1）。**
- **Stage 1 — 锁唯一设计契约**：`/design-consultation` → 用 stitch-design-taste 落 DESIGN.md（暖编辑终端 + emerald=仅品牌 + 独立 gain/loss + CJK + 禁用清单）；修 design-system.md 的 emerald=品牌=涨冲突；Tweakcn 锁暖色调；真 `.dark{}`、一值一处、`--border` 降 8%、`--input` 解耦；codemod emerald 硬编码。
- **Stage 2 — 看着定方向**：`/design-shotgun` 在 3 块高辨识屏（hero/日报预览/立场聚合）出变体对比挑方向。
- **Stage 3 — 数据即视觉**：art-direct 已有图表成 hero 级；`@vercel/og`+Satori 出动态 OG 卡。
- **Stage 4 — 建/精修**：`/impeccable teach`（从 DESIGN.md 写 .impeccable.md）→ `/impeccable craft` 逐页；high-end-visual-design 仅结构打磨且禁用 Ethereal-Glass/mesh-orb 原型。
- **Stage 5 — 出精造资产**：环境外 Recraft V4 Vector 锁 Style+调色板出图标族/品牌母题/稀疏点缀(SVG)；中文字图用 Nano Banana Pro。
- **Stage 6 — 集成收敛**：SVG 内联成 React 组件；稀有位图走 next/image 或 Insforge bucket；`/impeccable extract` 收敛 token/组件。
- **Stage 7 — 上线闸**：design-taste-frontend 机械 pre-flight（emerald 不漏到状态/CTA 信号）+ 一次独立 `/codex review`。

## 红线（别做）

- 别用 Build Web Apps 插件；别 gpt-image-2 批量出装饰图。
- 别在没减掉廉价 CSS 特效前加任何视觉元素。
- 别 AI 拟真人脸/3D 等距光泽渲染。
- 别让 emerald 继续身兼品牌+涨信号。
- 别把主力 coder 换成 Codex；别把 Claude Design SaaS 当主力。
- 别上"看起来像数据但不是真数据"的假图表。
- 别 drive-by 改产品文案。

## 验收标准（整体）

- 每屏只有一个强调色作填充；emerald 不出现在状态/CTA 与涨跌数字旁。
- 跨页 chrome（头部/区块/容器宽/选中态）一致。
- 暗色主题契约明确（真 `.dark{}` 或纯暗色），无 FOUC。
- 所有数字 tabular-nums；统一空值符。
- `npm run build && npm run lint` 通过；reduced-motion 保留。
- 视觉对照（chrome-devtools 截图）较基线明显更克制、更"一个产品"。
