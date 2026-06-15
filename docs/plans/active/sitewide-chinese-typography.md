# Sitewide Chinese Typography Engineering Plan

> Status: Implemented
> Related: `docs/constraints/design-system.md`, `frontend/src/app/.context.md`, `frontend/src/components/.context.md`
> Vision: 中文优先、金融研究优先；让密集信息更清楚，让长文本更耐读，同时保留 TheMarketBrew 的编辑气质。

## 目标

建立一套全站字体使用规则：什么场景用什么字体、字号、行高和字重。核心目标是解决当前默认字体在密集页面、表格、Agent 消息和研究正文里不够清晰的问题。

## 现状

当前全站 `font-sans` 和 `font-serif` 都把 `LXGW WenKai` 放在最前面：

```css
--font-serif: "LXGW WenKai", var(--font-instrument-serif), "Songti SC", Georgia, serif;
--font-sans: "LXGW WenKai", "HarmonyOS Sans SC", var(--font-dm-sans), "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
```

这带来一个关键问题：`LXGW WenKai` 的手写/楷体气质适合品牌、标题和少量编辑化表达，但不适合作为全站 UI 正文默认字体。尤其在以下场景会拖累阅读：

1. Agent message、Markdown 回答、长段落解释。
2. KOL 资料库、个股观点时间线、日报等密集信息。
3. 表格、卡片列表、标签和导航。
4. 中文夹杂英文 ticker、数字、百分比、日期的金融内容。

另外，项目里已经有 `.font-data` 的规范，但实际代码中仍存在把整句中文放进 monospace/data font 的情况。这会让中文阅读显著变差，后续需要专项清理。

## 研究结论

中文网页排版和拉丁文字不同。W3C 的中文布局资料强调，中文在 web/eBook 上有专门的版式要求，不能只套用英文排版习惯；中文与英文/数字混排时，也需要比普通空格更克制的间距处理。对于我们这种中文金融研究产品，字体方案应优先服务三件事：

1. **扫描效率**：用户需要快速扫过公司名、板块、观点、日期、涨跌幅和状态。
2. **长文本耐读**：Agent 和研究正文要能连续读 5-10 分钟不累。
3. **品牌辨识度**：落地页、Hero、Qinbafrank 研究室可以有更温暖的编辑感，但不能牺牲主体阅读。

候选字体判断：

| 字体 | 优点 | 风险 | 推荐角色 |
| --- | --- | --- | --- |
| Noto Sans SC / Noto CJK | 开源、覆盖稳定、Google/Adobe 生态成熟，适合 UI 和长文本 | 字体体积需要控制 | 全站长期主力 UI/阅读字体 |
| Source Han Sans SC | Adobe 开源 Pan-CJK，字形可靠，适合正式信息产品 | 自托管和子集化需要工程处理 | Noto 的同级备选或自托管来源 |
| HarmonyOS Sans SC | 已在项目里加载，现代、清楚，适合 UI 密集场景 | 当前 CDN/包来源需做许可证和性能确认 | 短期 UI 字体，长期可作为 fallback |
| MiSans | 字形现代、覆盖大，适合产品界面 | 商业/自托管策略要确认 | 可作为视觉备选，不建议第一阶段引入 |
| Alibaba PuHuiTi | 免费商用、适合中文商业界面 | 字形品牌感更强，可能改变现有气质 | 可做后续视觉实验 |
| LXGW WenKai | 识别度强、温暖、有研究笔记感 | 不适合密集正文和表格 | 只用于 Hero、编辑标题、少量强调 |
| JetBrains Mono | 数字、代码、ticker 对齐效果好 | 中文阅读差 | 只用于数字、ticker、代码，不包整句中文 |

## 字体决策

### 总原则

默认正文从 `LXGW WenKai-first` 改为 `Sans-first`。`LXGW WenKai` 保留为品牌/编辑字体，而不是全站 body 字体。

### 建议 token

```css
--font-ui: "HarmonyOS Sans SC", "PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui, sans-serif;
--font-reading: "Noto Sans SC", "Source Han Sans SC", "HarmonyOS Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
--font-editorial: "LXGW WenKai Screen", "LXGW WenKai", "Kaiti SC", "STKaiti", serif;
--font-latin-display: var(--font-instrument-serif), Georgia, serif;
--font-data: var(--font-jetbrains-mono), "SFMono-Regular", ui-monospace, monospace;
```

第一阶段可以先使用已经接入的 `HarmonyOS Sans SC` 作为 `--font-ui`，降低改动风险；同时把 `Noto Sans SC` / `Source Han Sans SC` 作为长期自托管评估对象。核心不是一次性换成某个新字体，而是先把「UI」「阅读」「编辑」「数据」四种角色分清楚。

## 使用矩阵

| 场景 | 字体 | 字号/行高 | 规则 |
| --- | --- | --- | --- |
| 全站导航、按钮、表单、卡片 | `font-ui` | 14px / 1.45-1.6 | 清晰优先，字重 400/500/600 |
| Agent message / Markdown 回答 | `font-reading` | 15-16px / 1.72-1.82 | 长文耐读；段落间距稳定；不使用楷体 |
| 研究报告正文、日报正文 | `font-reading` | 16px / 1.75-1.85 | 最大宽度 68-72ch，避免太宽 |
| KOL 观点时间线、列表摘要 | `font-ui` 或 `font-reading` | 14-15px / 1.6-1.75 | 如果连续文本超过两行，用 reading |
| 表格、指标列表、密集 dashboard | `font-ui` | 14px / 1.45-1.55 | 中文最小 14px；只让数字用 data font |
| 价格、百分比、日期、ticker | `font-data` | 12-16px / 1.2-1.5 | 只包数字、ticker、短代码 |
| Hero H1、落地页大标题 | `font-editorial` | 36-60px / 1.08-1.18 | 保留品牌感，不用于正文 |
| Section heading | `font-ui` 或 `font-editorial` | 20-32px / 1.2-1.35 | 产品页面可 editorial，工具页面用 UI |
| Caption、meta、时间戳 | `font-ui` | 12px / 1.5 | 只用于辅助信息，避免低对比度 |

## Agent Message 规范

Agent message 是最需要先改的地方。它不是 UI 标签，也不是品牌标题，而是用户真正要读的内容。

建议新增：

```css
.font-reading {
  font-family: var(--font-reading);
  font-feature-settings: "kern";
}

.prose-agent {
  font-family: var(--font-reading);
  font-size: 0.9375rem;
  line-height: 1.78;
}
```

对应规则：

1. `MarkdownBody` 默认使用 `.prose-agent`，除非调用方明确是 compact 模式。
2. 段落、列表、引用、表格分别定义稳定间距，不依赖浏览器默认 margin。
3. inline code 用独立 code font；不要继承 `.font-data` 的金融数字样式。
4. 表格里的中文列名和解释仍用 `font-ui`，数字单元格单独用 `font-data`。
5. Agent 气泡最大宽度控制在约 `72ch`，避免一行过长。

## 实施步骤

1. [x] 更新 `globals.css` 的字体 token：拆出 `--font-reading`，并让默认 sans-first 栈承担 UI/正文。
2. [x] 把 `body` / `font-sans` 默认切到 sans-first，不再默认使用 `LXGW WenKai`。
3. [x] 保留 `.font-editorial`，但只用于 Hero、落地页标题、少量编辑化标题。
4. [x] 新增 `.font-reading` 和 `.prose-agent`，应用到 `MarkdownBody`、Agent 消息、长文本报告容器。
5. [x] 清理首批 `.font-data` 误用：整句中文、中文标签、段落不能使用 data font；只包数字、ticker、日期和短代码。
6. [x] 检查所有 `text-[10px]`、`text-[11px]`、`text-[12px]` 的中文内容。中文正文低于 14px 的地方要升级；非 SVG DOM 中已清除任意 `text-[Npx]`，SVG logo text 保留为例外。
7. [x] 针对 `/research`、`/kol/qinbafrank`、`/pricing`、`/macro/weekly`、`/contact`、`/today` 做浏览器视觉回归抽查。
8. [x] 更新 `docs/constraints/design-system.md` 和相关 `.context.md`，避免之后又回到 `LXGW WenKai-first`。

## 验收标准

1. 密集页面的中文正文默认不是 `LXGW WenKai`。
2. Agent message 连续阅读时更清晰，段落、列表、表格不挤。
3. 中文正文最小 14px；长文主要阅读区 15-16px。
4. `font-data` 不再包裹整句中文。
5. Hero 和 Qinbafrank 落地页仍保留适量编辑气质，不变成普通 SaaS 页面。
6. 字体加载不依赖 JS 注入完成后才出现核心 UI 字体；后续应评估自托管或构建期引入。

## 待定问题

1. 长期主字体到底选 `Noto Sans SC`、`Source Han Sans SC`，还是继续使用 `HarmonyOS Sans SC`，需要结合许可证、字体体积、加载性能和视觉截图决定。
2. 是否要为 Agent message 单独加载更完整的阅读字体，还是使用系统/现有字体栈即可。
3. 是否需要建立 lint/check 脚本，自动抓取 `.font-data` 包中文、中文 `text-xs`、过低对比度等问题。

## 当前 sweep 结果

- 非 SVG DOM 文本不再使用 `text-[Npx]` 任意字号；`LogoMarquee` / `TrustBadges` 的 SVG `<text>` 仍按设计系统例外保留。
- 全站 `text-muted-foreground/60` 及以下、`text-foreground/60` 及以下的低对比文字已清零。
- `/research`、KOL 研究室、Twitter Digest、For You、Macro、Stock、Morning、认证/联系表单和 Admin 页面已完成字号与对比度 sweep。
- `.font-data` 风险点已复查，剩余用法集中在数字、ticker、日期、计数、价格、@handle 和短代码。
- 全站静态扫描为空：非 SVG DOM 中无任意 `text-[Npx]` 字号、无 `leading-none`、无低透明度 foreground/muted/white/gray/slate/neutral/zinc 文本、无 `border-l-2` / `border-r-2` 侧边条。
- 浏览器抽查页面均渲染完成、无横向溢出，且页面 DOM 中禁止 class 命中为 0：`/research?agent=kol&persona=qinbafrank`、`/kol/qinbafrank`、`/pricing`、`/macro/weekly`、`/contact`、`/today`。

## 参考资料

- [W3C Chinese Layout Gap Analysis](https://www.w3.org/TR/clreq-gap/)
- [W3C: Managing inline spaces in Chinese and Japanese](https://www.w3.org/International/articles/styling/inline-space)
- [Google Fonts: Noto Sans SC](https://fonts.google.com/noto/specimen/Noto+Sans+SC)
- [Noto CJK GitHub](https://github.com/notofonts/noto-cjk)
- [Adobe Source Han Sans](https://github.com/adobe-fonts/source-han-sans)
- [LXGW WenKai Webfont](https://github.com/chawyehsu/lxgw-wenkai-webfont)
- [HarmonyOS Sans, iF Design](https://ifdesign.com/en/winner-ranking/project/harmonyos-sans/351136)
- [MiSans, Xiaomi HyperOS Fonts](https://hyperos.mi.com/font/en/download/)
