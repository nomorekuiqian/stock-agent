# 博主对话 Agent · 验证策略与行为指标框架

> Status: In Progress
> Related: features/kol_research/.context.md · features/payment · features/quota · features/subscription · [product/blogger-partnership.md](../../product/blogger-partnership.md)
> 来源: 2026-06-05 / 06 office-hours 创业审计 + ultracode 行为分析工作流（探查真实 schema → 4 视角设计 → 合并 → 对抗审查 6.5/10 → 应用修复）
> 详细 dashboard 面板与 SQL 草图: `~/.gstack/projects/nomorekuiqian-stock-agent/kedeng-master-analytics-dashboard-20260606.md`
> 创业审计原始文档: `~/.gstack/projects/nomorekuiqian-stock-agent/kedeng-master-design-20260605-223603.md`

## 目标

验证"把金融博主（KOL）的方法论打包成对话 Agent、卖给其粉丝"这件事是否成立。核心不是"有没有人付费"，而是先验证**忠实度命门**：AI 能否把博主的判断方式忠实套用到新问题上，忠实到博主敢押名字。用**用户行为数据**做主验证手段，尽量不靠问卷和大量 1:1 访谈。

## 现状

- 已有上线网站 + 自建 Agent（博主对话 = `kol_research_agent`），接了方法论与金融数据，能多轮对话；付费墙（Max）已上线，免费每日配额 `DAILY_LIMIT=2`。
- 博主已帮忙推广一波，**约几百名新用户涌入，主要冲着对博主的信任而来**。这意味着当前几乎所有正向信号都被"博主光环"污染。
- 现有可用数据表：`agent_session_events`、`research_quota`、`subscriptions`、`llm_usage`、`ai_feedback`。
- 缺口：无 acquisition_source/UTM、无干净的检索命中数字段、无真付费时间戳、无撞墙事件时间戳、KOL 答案无质量反馈入口（详见第四节）。

## 一、产品定性（office-hours 审计结论）

**两个不同的生意，押注 A：**
- 生意 A「博主装进盒子」：给博主做 Agent，卖给**他的粉丝**；客户是粉丝，博主是渠道 + 可信背书。（本期押注）
- 生意 B「自家网站差异化 Agent」：客户是网站用户，博主方法论只是内容来源之一。

**产品形态 = 框架代劳（不是喊单）：** 用户**不学**框架，Agent **替**用户用博主的方法论看他问的当下问题。主动放弃"给结果/喊单"，规避金融建议的信任崩塌与合规风险。

**四条前提（均已认领）：**
- P1 形态：框架代劳。
- P2 护城河：博主**非公开、具体的判断方式** + 预装信任，不是数据接入。
- P3 命门：AI 能否**忠实蒸馏并套用方法论到新问题**，忠实到博主敢押名字。**目前未验证，最大风险。**
- P4 验证顺序：先测**忠实度**，不是先测付费；第一验证人是创始人本人（专家），其次博主，公开推广放最后。

**核心张力（已被接受并收编）：** 博主的价值在于"适应性/当下判断"，而 Agent 基于历史内容是"过去时"。创始人反驳成立——"观点会过期，方法论不会"，且可用持续抓取/蒸馏/审计管线保鲜；但这把全部风险压到"AI 能否忠实蒸馏**部分隐性**方法论"这一未验证点上。

## 二、当前进展与转向（反馈收集方式之争）

推广后创始人想验证付费意愿与痛点契合，倾向"问卷 + 激励"。结论与转向：

- **问卷（尤其带激励）测的是"嘴"，不是"手"**，会产出虚高、误导性的满意度/付费意愿数字。激励买参与度，不买真相。
- **博主光环是当前最大污染源**：任何剥不掉光环的信号（群里公开夸、点赞、首聊率）都不可信。能剥光环的只有两类信号：**真金白银** + **新鲜感退潮后仍持续的行为**。
- **决策：以行为数据为主，辅以极轻量产品内 micro-signal + 每周专家抽检，放弃大量 1:1 访谈。** 问卷至多降级为"筛选愿意 1:1 的活跃用户"的漏斗，不当答案。

## 三、行为指标框架

**北极星 WHEU（周·光环剥离后的合格回访对话用户数）：** 过去 7 天去重 `user_id`，同时满足：
1. 注册满 7 天（跨过博主新鲜感首周）；
2. 当周 ≥2 个不同自然日发起 `kol_research_agent` 的 `user_message`（跨天回访，排除一次性连问）；
3. 当周至少一个回答含 `[#N]` 引用标记（真引用博主原话，非通用话术）。

三道闸门各砍一类光环。WHEU 衡量"为 Agent 本身、不是为博主"持续回来的人数。

> **对抗审查抓出的头号漏洞（已修正）：** 原闸门 3 用"是否调用了 `search_kol_tweets` 工具"判定。核查 `agent_runtime/events.py` 与 `kol_research/agent.py` 后确认：工具召回 **0 条**（博主没讲过该话题）照样记 `ok=True`，等于把"扮演博主"当成"引用博主"——正是 P3 命门最危险的形态。改用回答正文 `[#N]` 标记判定（后端有引用范围硬约束 + 非法引用号 strip）；补 `results_count` 后升级为精确版。

**今天就能从现有库算的指标：** 合格激活率、激活停滞率、D7/D30 留存（看 D30 是断崖还是走平）、新鲜感衰减斜率 W2/W1、答砸即走率（发问→收答 5 分钟内秒退，不被光环污染）、追问深度、检索覆盖率（`[#N]` 占比，必要非充分）、免费配额触墙率、Max 付费后使用集中度、单激活用户 LLM 成本。

**忠实度（P3）真主指标 = 每周专家抽检 30 条日志**（见第五节第二层）；机器检索覆盖率只当筛选器。

**反指标（别盯，会骗你）：** 累计注册数、会话创建数、`/kol` 页面 PV、AI 点赞绝对值、Max 订阅总数/总 MRR（不拆使用）、总提问数/token 量、首聊率、工具调用次数。特别地——**不要把"这不是博主会说的"举报当忠实度主信号**：粉丝因信任更可能默默离开而非举报，召回极低；秒退率比举报可信。

## 四、埋点缺口清单（P0 优先级高于任何 dashboard 面板）

| # | 补什么 | 加在哪 | 为什么 |
|---|---|---|---|
| P0-1 | `search_kol_tweets` 写 `results_count`；assistant 消息写 `cited_chunk_count` / `kol_chunk_count` | `features/agent_runtime/events.py::tool_call_events` + `features/kol_research/agent.py` 的 `complete_turn` | 没它忠实度只能靠 `[#N]` 粗代理；`result_preview` 会被截断，脆弱 |
| P0-2 | `paid_at` 真付费时间戳 | `features/payment/router.py:233` `checkout.session.completed` 落库 | `subscriptions.updated_at` 会被改邮件偏好/Resend 同步刷新，≠付费时刻，付费归因系统性错配 |
| P0-3 | `quota_wall_hit` 撞墙事件 + 当时层级快照 | `features/quota/service.py::consume_quota` 返回 `allowed=false` 处 | `research_quota.count` 原地 UPDATE 无历史；撞墙→升级漏斗只能前瞻、无法回填 |
| P0-4 | `acquisition_source`，解析 `?utm_source=qinbafrank` | `frontend/src/app/actions/auth.ts` signup | 约 1 小时。**唯一能真正剥离博主光环的根因修复**；之前只能用注册时间 ±3 天瞎猜博主粉 |

P1（替代访谈的 WHY 来源，排在聚类/复制按钮之前）：扩 `ai_feedback.target_type` 加 `kol_research_answer` / `kol_voice_mismatch`；撞墙 micro-signal（且补"还剩 1 次"更早触发点，否则样本太稀）。P2（暂不做）：regenerate 唯一 client_event_id、复制/分享行为、问题主题聚类（几百用户阶段先手动归类）。

## 五、免问卷 / 免 1:1 方案（三层）+ 诚实边界

1. **行为 = WHAT（零打扰，纯现有日志）：** 留存/衰减/秒退/触墙/集中度全从 `agent_session_events` + `research_quota` + `subscriptions` + `llm_usage` 算。人不会因信任博主就连续三周跨天回来、天天撞墙、升级后还把额度都烧在 kol_research 上——天然剥光环。
2. **每周专家抽检 30 条日志 = P3 忠实度主基线（约 15 分钟）：** 脚本分层抽样（向零引用/被点踩/秒退倾斜），创始人或博主按"忠实/接地/有用"三项 1-5 打分，每条 <30 秒。反校机器检索覆盖率：覆盖率高但抽检忠实度低 = Agent 在"凑引用"，告警。
3. **行为触发的一句话 micro-signal = 廉价 WHY：** 只在撞墙/点踩那一瞬弹单选（7 天最多 1 次），把"为什么"摊薄成上万次现场一键。

**诚实边界：** 行为只给 WHAT 不给 WHY；P0/P1 埋点上线并攒够样本前（可能数周），WHY 仍得靠每周读 transcript + 极少量（3-5 个）定向追问高风险用户，不能假装纯行为已替代访谈。归因与忠实度在补 P0-4 / P0-1 前均为 partial。

## 实施步骤

1. [ ] P0-4：signup 解析 `?utm_source`，加 `acquisition_source`（先把光环闸门装上，约 1 小时）
2. [ ] P0-1：`results_count` + `cited_chunk_count` 落库（忠实度精确化）
3. [ ] 立刻启动"每周抽检 30 条"人工协议（go/no-go 真信号，不依赖任何埋点，今天就能开始）
4. [ ] P0-2 / P0-3：真付费时间戳 + 撞墙事件
5. [ ] P1：KOL 答案 thumbs + 举报；撞墙/剩余配额 micro-signal
6. [ ] 搭 Dashboard A（实时运营盘 5 面板）与 Dashboard B（每周真相盘 5 面板，详见 gstack spec 文档）

## 待定问题

- 忠实度通过线的具体阈值（建议起点：检索覆盖率 ≥70% 告警线；抽检忠实度均分目标待校准）。
- 隐性方法论：博主真正的 edge 有多少没写在内容里？抽检要专门盯"理由是否能指回博主公开内容，还是 AI 脑补"。
- `llm_usage` 能否按 `user_id` 切（维度在 `extra` JSONB？）——决定 Paid-Then-Use 能否按用户算集中度（待确认）。
- 楔子博主/垂直主题锁定为"答应推广的那位"及其差异化最深的领域；扩展到多博主平台属生意 A 的后续，本期不做。
