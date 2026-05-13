# /for-you "专属" 改进总纲

> Status: Active Roadmap
> Scope: 仅 `/for-you` 专属页面及其支撑后端
> Related: `frontend/src/app/for-you/.context.md`, `backend/app/features/brew/.context.md`
> Vision: roadmap.md > 支柱 1 · 专属系统

## 一句话目的

把 `/for-you` 从"信息聚合页"升级为**决策伙伴**：懂你、替你决策、出事叫你、没事不扰你。面向**相对被动的投资者**。

## 两条贯穿性原则（所有 P0/P1/P2 决策都必须回答）

### 原则 1 · 真正的"专属"，匹配付费用户心智

**问**：这个功能/文案/数据，没登录或免费用户能看到的页面上**能不能复刻**？

- 能 → 不是"专属"，不放 /for-you（或至少不作为亮点）
- 不能 → 它依赖画像 / 持仓权重 / thesis / 历史反馈 → 是真正的专属

付费心智适应的具体操作：

- **称呼具象化**：不说"你的组合"，说"你 32% 仓位的 NVDA"
- **语气随画像**：long 用户看到"长期逻辑未变"，short 用户看到"本周动能"
- **沉默即专属**：绿态 headline 短于 20 字，专属不是信息更多，是**系统替你过滤掉了不相关的**
- **反例**（必须警惕）：把公共 digest 换个标题放到 /for-you = 伪专属

### 原则 2 · AI 的"定制"必须可被感知

AI 用在 /for-you 的**每一处**都要回答：用户是否能**一眼看出这是为他生成的**？

看得出的证据（至少命中一项）：

| 证据类型 | 示例 |
|---|---|
| 引用用户仓位 | "你的 NVDA（32%）+ AMD（8%）共 40% 半导体敞口" |
| 引用用户 thesis | "你当初说'看好 AI 基建'，本周 ASML 的订单数据支持这一点" |
| 引用用户历史反馈 | "你上次对科技集中度 👎 过，这次仍然偏高" |
| 引用用户画像 | "对长期持有者，-5% 在过去 3 年 80% 回到原位" |
| 画像语气差异 | 同一事件给 passive 和 active 用户说的话**不同** |

AI 分工原则（避免"LLM 什么都做"）：

- **关键决策（颜色/跳转/是否显示/打分）→ 规则引擎或结构化工具**：确定、可测、零幻觉
- **语言表达（headline 文案 / 解释 / 建议措辞）→ LLM**：人话、随画像调语气
- 经典组合：**数据规则定，语言 AI 定**（P0 Action Bar 就是这个模式）

## 四轴需求（被动投资者心智 → 功能映射）

| 轴 | 用户说法 | 设计承诺 | 主责 Plan |
|---|---|---|---|
| 10 秒结论 | "今天我的钱没事吧？" | 顶部 Action Bar 三态（绿/黄/红） | P0 |
| 加权个性化 | "说的是我，不是泛泛而谈" | 所有 AI 输出按画像 + 仓位权重 | P0 / P1 |
| 事件感知 | "下一件我该盯的事" | "最紧迫一件事" 一行结论 | P1 |
| 记忆闭环 | "它越来越懂我" | thesis + 👍/👎 + 建议追踪 | P1 |
| 按需探索 | "模拟 / 稳住我" | What-If / 连线 / 情绪管理 | P2 |

## Plan 结构

```
docs/plans/for-you/
├── README.md                    ← 本文件
├── v2-round2-summary.md         V2 第二轮：Agent 驱动 Action Bar + 复盘笔记上移（✅ 已交付）
├── v2-bugfix-round1.md          V2 灰度首轮 bug 修复（4 bugs + Round 3 follow-up）
├── p2-ai-copilot.md             What-If / 连线 / 情绪 / 月度复盘（未开始）
├── nice-to-have.md              非紧急改进项清单（汇率/多币种/$CASH 等）
└── completed/                   ← 已完成的计划文档归档
    ├── v2-round2/               V2 第二轮完整过程文档（Plan/Design/Hardening）
    ├── v2-ux-fixes.md           V2 灰度 UX 修复计划（9 issues, ~4.5d）
    ├── p0-foundation.md         持仓输入 + Action Bar + 画像 Onboarding
    ├── p1-intelligence.md       事件整合 + 持仓体检 + 记忆反馈
    ├── checkpoint.md            跨 session 交接锚点（进度 + 未决事项）
    └── operator-handbook.md     Insforge / Stripe / Railway 人工操作记录
```

## 优先级与工期

| 层级 | 目标 | 状态 |
|---|---|---|
| **P0 · 基础层** | 让所有个性化有数据基础（仓位 + 画像） | ✅ 完成（2026-04-22） |
| **P1 · 智能层** | 事件 / 体检 / 记忆三条线打通，形成"连线层" | ✅ 完成（2026-04-24） |
| **V2 · 优化层** | UX 抛光 + Agent 驱动 Action Bar | ✅ 完成（2026-04-26） |
| **P2 · Copilot 层** | 按需 AI 深度能力 | ⏳ 待启动 |

## 依赖图

```
P0 · portfolio-input-redesign  ────┐
                                    ├──▶ P1 · portfolio-health-check ──┐
P0 · decision-layer (profile) ──────┤                                   │
                                    ├──▶ P1 · events-integration ──────┤     ← 全部 ✅
                                    │                                   │
                                    └──▶ P1 · memory-feedback ─────────┤
                                                                        │
                                                                        ▼
                                                                   P2 · ai-copilot  ← ⏳ 下一步
```

**铁律**：P0 没就位不动 P1；P1 没验证不动 P2。当前 P0+P1 已完成，P2 可启动。

## 单元划分与进度

| Unit | 功能范围 | 代码状态 | Insforge 部署 |
|---|---|---|---|
| **U0-A** | 数据地基 + Onboarding + 持仓录入 | 🟢 Shipped | ✅ 已部署 |
| **U0-B** | Action Bar（规则引擎 + 模板） | 🟢 Shipped（V1 模板，LLM polish 延后） | ✅ 无需部署 |
| **U0-C** | 通知偏好 notify_mode | 🟢 Shipped | ✅ 无需部署 |
| **U1-A** | 事件整合 → `digest.top_event` | 🟢 Shipped | ✅ 无需部署 |
| **U1-B** | 持仓体检（4 维 health_score + NextAction） | 🟢 Shipped | ✅ 已部署（2026-04-24） |
| **U1-C** | 记忆 / 反馈闭环（thesis + 👍👎 + T+7 追踪） | 🟢 Shipped | ✅ 已部署（2026-04-24） |
| **U2-A** | What-If 模拟 | ⏳ 未开始 | — |
| **U2-B** | 跨持仓连线（周度） | ⏳ 未开始 | — |
| **U2-C** | Crisis Mode | ⏳ 未开始 | — |
| **U2-D** | 月度 AI 回顾 | ⏳ 未开始 | — |

**图例**：⏳ 未开始 / 🟢 Shipped。

P0 + P1 全部完成（含 2 轮审计修复 + Feature Flags 灰度框架），详见 `completed/checkpoint.md`。

## P0/P1 延后项（代码骨架已就位，待灰度验证后逐项打开）

| 项 | 来源 Unit | 状态 | 说明 |
|---|---|---|---|
| Memory 注入 agents | U1-C C10 | ❌ 待开启 | 开启 `ENABLE_MEMORY_INJECTION`（需累积反馈数据后） |
| T+7 outcome cron | U1-C C8 | ❌ 待实现 | 建 cron job 调 `compute_outcome()` |
| FeedbackBar 扩展到 digest | U1-C | ❌ 待做 | 嵌入 digest quick_take / headline 下方 |
| brew agent insights 注入 | U1-B B7 | ❌ 待开启 | `ENABLE_HEALTH_INJECTION` flag 预留 |
| Weekly health cron | U1-B B10 | ❌ 待实现 | 周度体检邮件 |
| LLM headline polish | U0-B V1.1 | 延后 | ActionBar 当前全用 template，可后加 LLM 语气调整 |

## 已完成

P0 全量（U0-A/B/C）+ P1 全量（U1-A/B/C）+ V2 全量（Round 2）+ Feature Flags 灰度框架 + 3 轮审计修复均已 Shipped。

详细交付记录见 `v2-round2-summary.md`，LLD 设计文档见 `completed/v2-round2/design.md`。

- **持仓概览双栏 UI（V1）** — 已交付（`components/for-you/StockOverviewPanel.tsx`）。排序当前按 `|daily_change|` 降序。V2 "按相关性排序" 纳入 P1 体检一部分，等 `effective_weight` 和 conviction 就位后再做。

## 明确不做

| 项 | 原因 |
|---|---|
| 截图导入持仓 | 摩擦高、多券商格式不稳；滑块够用 |
| 基准对比（日度展示） | 诱发情绪化交易；只在月度复盘用 |
| 主题订阅 | 被动用户不想再配置；系统替他决定 |
| Plaid 券商连接 | 合规 + 工程成本过高 |
| 浏览器 / 微信主动推送 | 当前无推送渠道；"提醒"走 Action Bar + 邮件 |

## 新数据源需求（极少）

| 数据 | 来源 | 使用 Plan |
|---|---|---|
| FMP grades / grade-news / price-target-news | 已付费未接入 | P1 events, P2 connections |
| 30d 相关性矩阵 | yfinance（现有库可算） | P1 health, P2 copilot |
| 历史相似回撤检索 | yfinance | P2 crisis mode |

**不引入**：Plaid / 社交舆情 / 期权链 / 邮件解析。

## 用户输入需求（全部低摩擦、可跳过）

| 输入 | 摩擦 | 时机 | 必填 |
|---|---|---|---|
| 投资者画像（2 问 + 可选股票） | < 45 秒 | 首次进 /for-you | 否 |
| 持仓精度（滑块 / 股数 / 均分） | 10 秒 | 加持仓时 | 否 |
| Thesis 一句话（预设 / 语音 / 自由） | < 30 秒 | 加仓后 / 大跌日 | 否 |
| 👍/👎 反馈 | 1 秒 | AI 输出下方 | 否 |
| 通知偏好（silent / events_only / daily） | 1 次选择 | 设置页 | 否 |

**原则**：空画像 + 等权组合 + 无反馈也能用；只是精度下降。

## 维护约定

- 每个 P 层 plan 一份文件；不再按"功能"碎分
- 新增能力前评估能否并入已有层，能并就不新建
- 交付完成的子功能在本 README "已完成" 区标注
- 已完成的 plan 文件移入 `completed/` 目录归档，不删除（便于回溯设计意图）
