# UI 升级 · 自主决策记录（待用户复核）

> 2026-06-06 起，按 `/goal 走完所有 stage` 自主执行期间做的决定。标 ❓ 的需用户最终确认。

## 框架性决策

- **D1 · Git 提交** ❓：本次自主运行**不自动 commit**（遵守 CLAUDE.md「禁止自动 Git 操作」硬规则），改动留在 worktree 工作区，验收时一并请你确认后再提交。
- **D2 · 设计方向（已锁，自行决定）**：Warm Editorial Data Terminal（Lovart 暖编辑感 + Linear/YouMind 克制）。不再跑 design-shotgun 让你挑变体——按 goal 要求我自己定方向并推进。
- **D3 · 自托管中文字体** ❓ 暂缓：需下载/子集化大体积 CJK 字体二进制，易撑大仓库；建议后续配子集化流程再做。当前保留 CDN 注入（有轻微闪烁）。
- **D4 · 106 处 emerald 硬编码 codemod** ❓ 暂缓：需逐处区分"品牌色 vs 涨信号"，高风险且几乎无视觉变化；改为在触碰到的页面里增量替换。
- **D5 · 假信任元素**（重绘竞品 logo 墙 / "500+ 投资者"等编造数字 / 匿名五星）❓ **不擅自删**（遵守「不 drive-by 改文案」）。强烈建议移除或换成真实出处，**留待你确认**。
- **D6 · 外部出图工具**：本环境无法运行 Recraft / Nano Banana。能手写的 SVG（品牌母题、图标）我自己做；位图/摄影类资产暂缓，需你用外部工具或授权。
- **D7 · Stage 4 范围**：本轮聚焦高 ROI 且安全的表面（research WelcomeScreen 去能力炫技、PersonaSelector token/图标修复、落地页层次/slop 收尾）。全站 ~60 路由逐页精修超出单轮安全范围，其余页面记为后续迭代。

## 逐 Stage 执行记录

### Stage 0 ✅（已提交 90e5cb5c）
去装饰：删 emerald 辉光/噪点一层/网格点/渐变文字/3D 倾斜 + float/gradient-shift/pulse-glow 动画；keyframes 27→24；13 组件清理；build/lint/tsc 通过。

### Stage 1 ✅（已提交 90e5cb5c）
暖 token 地基：暖近黑 #100f09 + 奶油 #f5f4ef + 亮度阶梯（card #201f1d > muted #1a1915 > secondary #17160e）；真 `:root,.dark` 契约；消除 --color-accent/--input 矛盾；删 @theme 死字面量；暖 hairline 边框 + --input 解耦；语义 --gain/--loss(+@theme inline)；亮色调暖。对比度过 WCAG。build 通过。

### Stage 1b ❓ 暂缓（见 D3/D4）：自托管字体 + 106 emerald codemod。

### Stage 2 ✅（自行定方向，见 D2）：Warm Editorial Data Terminal，不跑变体板。

### Stage 4（进行中）
- ✅ research `WelcomeScreen`：5 色彩虹能力卡 + 角落辉光 → 单一中性 monochrome（品牌 emerald 仅在 active 态）、glow 全去。直接对应用户反感的"engineer 能力炫技"。
- ✅ `PersonaSelector`：🎙️/✕ emoji → lucide `Glasses`/`X`；硬编码 gray-*/bg-white/emerald-50 → 设计 token（暗模式安全）；`text-[10px]`→`text-micro`。
- ❓ 暂缓：`window.confirm` → styled dialog（需 sync→async 流程重构，风险高；功能正常仅样式原生）。记为后续。
- ❓ 暂缓：WelcomeScreen persona 模式的独立装饰光（avatar blur / 顶部 radial / lens header radial）——flag-gated、非默认可见，后续清。

### Stage 3 ❓ 暂缓：动态 OG 卡（@vercel/og+Satori）——加依赖+新路由，UI 内不可见、对"页面好看"无直接贡献、有 build 风险；记为后续。

### Stage 5 ❓ 暂缓：精造图标族/品牌母题——Recraft 不可用（D6）；现有 Logo/glyph 够用，暂不手搓整套。

### Stage 6/7：build/lint/tsc 通过即作为收口；`/codex review` 外部，记为可选。

### Stage 4 追加 ✅
- 删 5 处内联装饰 glow blob（`blur-[60/80px]` 彩色光晕，在 page.tsx 价格卡 / ProductShowcase / FeatureSections 三处 mockup 背后）——Stage 0 漏掉的 arbitrary-value 光晕，正是 quick-wins 说的"mockup 背后辉光团"。build/tsc 通过。

### 验收结果（dev server 截图，已登录 Voya）
- ✅ 暗色（主）：landing / research welcome / macro 仪表盘 —— 统一暖近黑、克制、无装饰噪点；研究台欢迎页彻底去彩虹去辉光、ChatGPT 风、Glasses 图标。
- ✅ 亮色：暖纸张、不破。截图里"我们的故事"区淡粉色是 JPEG 压缩伪影（实为 `bg-muted/20` 暖灰），非真实问题。
- ⚠️ 数据驱动页（图表/日报）因本地未起后端(:8000)显示 N/A/空态，无法用真数据验证视觉；chrome/布局正常。
- build / tsc / lint(0 error) 全过。

### 仍不满意 / 待办（需你定）
1. 落地页仍偏 SaaS 模板：tiny-caps eyebrow、三列卡、五星 testimonial、重绘竞品 logo 墙、"500+ 投资者"编造数字 → **假信任元素需你点头才删/换**（D5）。
2. 宏观仪表盘密度低（每象限 4 KPI 只显 1）——Stage 4 密度重构，较大，待排期。
3. 字体自托管(D3)、emerald codemod(D4)、OG 卡(Stage3)、精造图标/母题(Stage5)、window.confirm 弹窗、persona 模式装饰光 —— 均记为后续。

---

## Agent 丝滑化（新 /goal：对标 ChatGPT，从底层优化）

深度研究（6-agent workflow）找到的**架构级根因**：①每 token `flushSync` 同步提交（打掉 React19 批处理，主线程冻结）②流式中每 token 全量重解析 markdown（O(n²)）③自动滚动键 `messages.length` 但流式就地 mutate → 视图不跟随 ④无运动 token 地基 ⑤默认 research agent 根本不流式 ⑥"停止"是假的（不真 abort）。完整报告见 `.ui-research/agent_*.json`。

### 本轮已落地（地基层，build/tsc/lint 全过）
- ✅ **运动 token 系统**（globals.css @theme）：`--duration-{instant,fast,base,slow}` + `--ease-out-expo/standard`（后者生成 Tailwind `ease-*` 工具）。这是 owner 点名的"设计系统层"地基。
- ✅ **删除全部 5 处 `flushSync`**（page.tsx）→ 恢复 React 19 自动批处理。**#1 jank 修复**。
- ✅ **`React.memo`**：ChatMessage + MarkdownBody → 流式只重渲染活跃消息，历史消息/已结算 markdown 不再重解析（缓解 O(n²) 与"越聊越卡"）。
- ✅ **自动滚动跟随流式**：依赖改为最后一条消息 content/thinking，流式时用 instant 滚动（不与 smooth 打架）。修复 P0"视图不跟随"。
- ✅ **终端 caret**：`animate-pulse` 软呼吸 → `caret-blink` steps() 硬闪，流式结束即移除。
- ✅ 顺手修 ChatPanel persona chip 硬编码 emerald → token。

### ❓ 下一阶（更高 ROI 但需新依赖/后端联调验证）
- **rAF 匀速 reveal 缓冲**（target vs shown 按 --stream-cps 匀速释放，中文用 Intl.Segmenter）——真正的 ChatGPT 匀速手感；需新 hook + reducer 改 + 跑后端调速。
- **use-stick-to-bottom** 库 + "跳到最新"浮动按钮（替手写滚动）。
- **增量分块 markdown**（marked.lexer + memo 块 或 Streamdown）——彻底 O(n²)→O(n)。
- **真停止**：AbortController 上抛到 handleCancelLoading。
- 默认 research agent 改真流式（需后端协议）。乐观占位 / send↔stop morph / 消息复制·重生成工具栏 / sidebar transform 折叠。
- **验证限制**：本地未起后端(:8000)，流式手感无法运行时实测；以上靠 build + 架构推理保证正确，需起后端联调才能逐项调优。
