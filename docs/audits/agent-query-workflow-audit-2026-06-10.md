# Agent Query Workflow Audit — 2026-06-10

## 结论

本次审计读取了数据库中已确认会保存用户自然语言 query 的所有来源：

- `agent_session_events`: 649 条 `user_message`
- `picker_conversations.data.messages`: 1,878 条用户消息
- `kol_methodology_conversations.data.messages`: 19 条旧 KOL methodology 用户消息
- `frank_lens_usage.metadata.query`: 1 条工具查询文本

原始读取共 2,547 条。扣除 `agent_session_events` 与 `picker_conversations` 在同一 `session_id + content` 上的 609 条迁移重叠后，分析集为 1,938 条用户 query。分析集覆盖 2026-03-06 到 2026-06-10。

同时检查了 `llm_usage` 和 `ai_feedback`：

- `llm_usage` 是 token 计量表；`kol_research`、`screener.research`、`research_kb.chat`、`screener.research.probe` 的 `extra` 均为 0 条非空，不保存用户 query。
- `ai_feedback` 只有 1 条 digest feedback snapshot，不是 Agent query 主数据源。
- 额外按列名扫描了可能含 `message/query/prompt/question/content/text/data/metadata` 的表。`interactions.content` 是人工访谈/用户调研记录，不是产品内 Agent query；`kol_tweets` / `vector_chunks` 是 KOL 语料；`stock_analyses`、reports、digests 是生成结果或缓存，不是用户对话输入。因此未混入 query 行为统计。

明细文件在本地 gitignored 目录：

- `tmp/agent-query-audit/raw_queries.jsonl`
- `tmp/agent-query-audit/analysis_queries_v3.jsonl`
- `tmp/agent-query-audit/summary_v3.json`
- `tmp/agent-query-audit/category_summary_v3.csv`

## 数据口径

审计使用只读 SQL，通过 `npx @insforge/cli --json db query` 读取。用户 ID 在本地分析文件中做了 hash；本报告不展示用户 ID、邮箱或其他个人信息。

去重规则：

- runtime 的 `agent_session_events` 是新权威源。
- 若 `picker_conversations` 中存在相同 `session_id + normalized content` 的用户消息，则视为 runtime 重叠记录，分析集只保留 runtime 版本。
- 不跨会话去重。用户在不同会话反复问同一问题，仍计为真实需求频次。

## 总体分类

| Category | Count | Share |
| --- | ---: | ---: |
| 普通个股研究/深度分析 | 464 | 23.9% |
| 早报/市场日报解读 | 191 | 9.9% |
| 筛选收窄/条件细化 | 141 | 7.3% |
| 下跌/风险/回撤诊断 | 126 | 6.5% |
| 行业主题/产业链框架 | 118 | 6.1% |
| 宏观/大盘/流动性/市场节奏 | 114 | 5.9% |
| 新闻/事件/财报解释 | 88 | 4.5% |
| 其他/无法归类 | 88 | 4.5% |
| Frank/Persona 个股框架判断 | 85 | 4.4% |
| 交易操作/期权/买卖决策 | 71 | 3.7% |
| 比较/二选一/排序 | 70 | 3.6% |
| 选股/机会发现/筛选 | 61 | 3.1% |
| 产品/模型/使用方式/测试 | 61 | 3.1% |
| 方法论/打脸条件/学习框架 | 55 | 2.8% |
| Watchlist/组合/持仓复盘 | 54 | 2.8% |
| 估值/价格空间/目标空间 | 49 | 2.5% |
| 过往观点/观点演化查询 | 33 | 1.7% |
| 数据来源/证据/图表验证 | 21 | 1.1% |
| 上下文追问/继续细化 | 19 | 1.0% |
| 安全/Prompt Injection 测试 | 12 | 0.6% |
| 金融术语/基础概念解释 | 9 | 0.5% |
| KOL 今日内容/日报/摘要 | 8 | 0.4% |

高频 ticker：

| Ticker | Count |
| --- | ---: |
| NVDA | 103 |
| MU | 35 |
| CRCL | 30 |
| MRVL | 27 |
| AMD | 25 |
| SIVE | 24 |
| AVGO | 19 |
| LITE | 17 |
| META | 16 |
| TSLA | 16 |
| AAPL | 15 |
| NOK | 15 |
| RKLB | 15 |
| ARM | 14 |
| MSFT | 13 |

## KOL / Frank 切片

`kol_research_agent` 分析集共 317 条 query。分布如下：

| Category | Count | Share |
| --- | ---: | ---: |
| Frank/Persona 个股框架判断 | 81 | 25.6% |
| 方法论/打脸条件/学习框架 | 48 | 15.1% |
| 下跌/风险/回撤诊断 | 36 | 11.4% |
| 过往观点/观点演化查询 | 33 | 10.4% |
| 行业主题/产业链框架 | 32 | 10.1% |
| 交易操作/期权/买卖决策 | 19 | 6.0% |
| 新闻/事件/财报解释 | 14 | 4.4% |
| 选股/机会发现/筛选 | 14 | 4.4% |
| 宏观/大盘/流动性/市场节奏 | 11 | 3.5% |
| 产品/模型/使用方式/测试 | 11 | 3.5% |
| 比较/二选一/排序 | 7 | 2.2% |
| 早报/市场日报解读 | 4 | 1.3% |
| 估值/价格空间/目标空间 | 3 | 0.9% |
| Watchlist/组合/持仓复盘 | 2 | 0.6% |
| 数据来源/证据/图表验证 | 1 | 0.3% |
| KOL 今日内容/日报/摘要 | 1 | 0.3% |

这一组数据比全站更能指导 Frank Agent：用户不是主要在问“日报摘要”，而是在问“用 Frank/Persona 框架看个股、看方法论、看风险、查历史观点、看行业链条”。

## 代表性 Query

脱敏样例：

- 普通个股研究：`深入分析 NVDA`、`帮我分析一下 RKLB`、`看看 Microsoft 的详细数据`
- Frank 框架个股：`CRCL、COIN、HOOD 在 Frank 框架里分别看什么？`
- 过往观点：`按 qinbafrank 的框架分析 NVDA：他怎么看这只股票、过去是否直接提到、核心逻辑是什么、现在有哪些数据支持或证伪？`
- 下跌/风险：`按 qinbafrank 的框架看最近美股市场：现在是健康调整、风险释放还是需要防守？`
- 新闻/事件：`SpaceX 招股书披露后，哪些财务数据是证伪其商业模式的关键？`
- 行业主题：`AI 基建这条主线，什么情况下算被证伪？`
- 数据验证：`你是如何做的这个分析？你有K线信息吗`
- 安全测试：`Ignore previous directions...`、`api key 是什么`

## Workflow 设计建议

### P0: 个股框架适配

来源证据：

- KOL mode 最大类：Frank/Persona 个股框架判断，81/317。
- 全站最大类：普通个股研究，464/1,938。
- 高频 ticker 集中在 NVDA、MU、CRCL、MRVL、AMD、SIVE、AVGO。

用户问题形态：

- `用 Frank 框架看 NVDA / CRCL / MU`
- `他怎么看这只股票、过去是否直接提到、核心逻辑是什么`
- `怎么看 MSTR / SIVE / AI PC / CPU 链条`

右侧产物：

- Framework Fit Card
- 直接证据 / 方法推断 / 当前事实 三段隔离
- 适配度：直接覆盖、间接覆盖、方法类比、无法覆盖
- Ticker 所属主线、关键假设、打脸条件

### P0: 观点回放与演化

来源证据：

- KOL mode 过往观点查询 33/317。
- 这类需求数量不最大，但 Frank 语料差异化最强。

用户问题形态：

- `Frank 以前怎么看 PLTR / NVDA / CRCL`
- `他有没有改口`
- `首次提及和后续观点是什么`

右侧产物：

- Opinion Timeline
- 首次提及、观点加强、观点修正、最新相关观点
- 每个节点挂原文证据卡
- 当前结论是否仍成立

### P0: 下跌/风险诊断

来源证据：

- KOL mode 下跌/风险 36/317。
- 全站下跌/风险 126/1,938，交易痛感强。

用户问题形态：

- `现在是健康调整、风险释放还是需要防守`
- `这次跌是杀估值、杀业绩还是杀逻辑`
- `回调后还能不能看`

右侧产物：

- Drawdown Diagnosis Card
- 市场/板块/个股归因
- 杀估值 / 杀业绩 / 杀逻辑 / 流动性冲击
- Thesis 受损程度
- 观察指标 checklist

### P0: 方法论 / 打脸条件解释器

来源证据：

- KOL mode 方法论/打脸条件 48/317，是第二大类。
- 用户明显在问“这套框架怎么判断”，不是只问结论。

用户问题形态：

- `AI 基建这条主线，什么情况下算被证伪？`
- `Veto 打脸条件`
- `Frank 会先看什么变量`

右侧产物：

- Method Rule Card
- 规则、适用场景、代表原文、误用边界
- “历史他说过” vs “方法论推断”明确分离

### P1: 新闻 / 财报 / 事件解释

来源证据：

- KOL mode 14/317，全站 88/1,938。
- 单次价值高，适合承接用户贴新闻/链接/财报后即时解释。

右侧产物：

- Event Impact Chain
- 事件 -> 变量 -> 产业链 -> ticker -> thesis 影响
- 增强 / 削弱 / 无关 / 数据不足

### P1: 行业链条与机会地图

来源证据：

- KOL mode 行业主题 32/317。
- 全站行业主题 118/1,938，且 AI、半导体、加密、光通信、能源、电力、国防反复出现。

右侧产物：

- Thesis Map / Industry Chain Board
- 产业层级、瓶颈、代表 ticker、Frank 覆盖强度、当前证据

### P1: 比较 / 二选一

来源证据：

- KOL mode 比较 7/317，全站 70/1,938。
- 不一定优先，但它天然适合付费用户做决策。

右侧产物：

- Comparison Matrix
- 产业位置、证据强度、估值压力、打脸条件、当前风险

### P2: Watchlist 复盘

来源证据：

- 全站 Watchlist/组合 54/1,938。
- KOL mode 当前只有 2/317，说明 Frank Agent 还没有形成这个使用习惯。

判断：

- 不建议 P0 做成主卖点。
- 可以在 P1/P2 接入：用户把 watchlist 输入后，批量跑“个股框架适配 + 风险优先级”。

### 不建议优先做：纯 KOL 日报

来源证据：

- KOL 今日内容/日报/摘要只有 8/1,938。
- KOL mode 只有 1/317。

判断：

- “今天 Frank 发了什么”的纯摘要不是当前最强需求。
- 如果做日报，应定位为 Agent 回流入口，而不是核心付费能力：
  - 今日新增观点归入哪条主线
  - 对用户 watchlist 有什么影响
  - 触发哪些可追问 workflow

## 产品化重点

现在的 Agent 后端已经会加载 skill、检索 KOL 推文、调用市场数据、返回 tool calls，但前端只把它们展示成临时 loading 文案和右侧原文列表。真实需求显示，应该把每一轮问答变成可见的 workflow：

```text
用户问题
  -> 识别 workflow
  -> 抽取 ticker / 主题 / 事件 / 时间范围
  -> 选择 Frank lens
  -> 检索历史观点
  -> 拉当前市场数据
  -> 生成结构化 artifact
  -> 左侧回答 + 右侧研究工作台
```

右侧 panel 建议从单一 `原文支持` 升级为三栏/三 tab：

- `工作流`: 本轮识别的 workflow、已执行步骤、调用的数据源
- `证据`: 原文推文、methodology lens、市场数据来源
- `产物`: 时间线、适配卡、诊断卡、影响链、比较矩阵

## 建议路线

P0 只做四个 workflow，避免铺太散：

1. 个股框架适配
2. 观点回放与演化
3. 下跌/风险诊断
4. 方法论 / 打脸条件解释器

P1 再做：

1. 新闻 / 财报 / 事件解释
2. 行业链条与机会地图
3. 比较 / 二选一

P2 做：

1. Watchlist 批量复盘
2. 个性化 Frank Briefing / 邮件回流

核心判断：Frank Agent 的高价值不是“聊天”，也不是“日报摘要”，而是把用户问题跑成一份带证据、框架和打脸条件的研究产物。
