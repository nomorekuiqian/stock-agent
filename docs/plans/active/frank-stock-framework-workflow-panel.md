# Frank Stock Framework Workflow Panel Engineering Plan

> Status: Planning
> Related: `backend/app/features/kol_research/.context.md`, `frontend/src/app/research/.context.md`, `frontend/src/app/kol/.context.md`, `docs/plans/active/frank-agent-readable-framework.md`, `docs/audits/agent-query-workflow-audit-2026-06-10.md`
> Vision: Frank Agent 的价值不是普通聊天，而是把用户的问题放进 qinbafrank 的公开方法论、历史观点和当前市场数据里跑一遍，并把过程可视化。

## 目标

为 KOL Research Agent 增加第一个 workflow artifact：当用户问「按 Frank 框架怎么看某只股票现在的状态」时，右侧 panel 展示可检查的研究过程，左侧 Agent 自然总结判断，不强制固定回答框架。

## 现状

当前 `/research?agent=kol&persona=qinbafrank` 已经具备基础能力：

- 后端 `backend/app/features/kol_research/agent.py` 会加载 persona methodology skills、调用 `search_kol_tweets`、调用 stock / macro / industry brief tools，并在最终 response 里返回 `kol_chunks`、`activated_skills`、`tool_calls` 和 `navigate`。
- 前端 `frontend/src/app/research/page.tsx` 在 KOL 模式下固定把右侧 panel 渲染为 `KolChunksPanel`，只展示本轮召回的历史推文引用。
- KOL 研究室页面 `frontend/src/app/kol/[username]/` 已经有更丰富的 artifact：
  - `TickerDetail` / `TickerNarrative`：个股观点框架、机会、风险、关注数据。
  - `TickerOpinionTimeline`：个股观点时间线。
  - `FrankSectorOpinions`：Frank 板块框架、分析维度和历史节点。
  - `FrankHighlights` / `frankContentData.ts`：策展后的历史观点主题、子话题和原文证据。
- 后端已有公开 cockpit API：
  - `GET /api/kol_research/personas/{u}/tickers/{ticker}`
  - `GET /api/kol_research/personas/{u}/tickers/{ticker}/timeline`
  - `GET /api/kol_research/personas/{u}/sectors/{sector_key}`
  - `GET /api/kol_research/personas/{u}/tweets/by-ids`
- 后端已有 MCP workflow context pack：`POST /api/kol_research/personas/{u}/mcp/workflow`，支持 `stock_diagnosis`、`market_regime`、`compare`、`research_memo`。这可以作为生产 artifact 的参考，但网站 chat 目前没有消费它。

关键缺口：

- 没有显式 workflow type。前端不知道本轮是「个股框架适配」还是普通 KOL 问答。
- 右侧只显示原文，不显示 Agent 做过的中间判断。
- `activated_skills` / `tool_calls` 是技术 trace，不适合直接给用户看。
- 没有结构化字段表达：覆盖强度、方法论路径、历史观点时间线、当前客观数据、支持/削弱/打脸条件。

## 设计原则

### 1. 右侧结构化，左侧不模板化

右侧 panel 用固定 workflow 步骤展示「研究过程」。左侧 Agent 的最终回答只遵守高层边界：

- 基于右侧已完成的 workflow 进行自然语言总结。
- 区分 Frank 历史观点、方法论推断和当前市场事实。
- 说明覆盖不足或不适配时要降级。
- 不给直接买卖指令或精确目标价。

不要要求左侧回答必须使用固定标题、固定段落、固定顺序或固定四段模板。用户要求简短、表格、二选一、详细展开时，Agent 应优先适配用户意图。

### 2. 显示中间结果，而不是只显示最终卡片

右侧 panel 的核心价值是让用户看到 Agent 在做什么：

```text
确认覆盖强度
  -> 匹配方法论路径
  -> 检索历史观点
  -> 读取当前客观数据
  -> 生成支持 / 削弱 / 打脸条件
```

每一步都要有可读的中间结果，而不是只有 loading checkmark。

### 3. 直接覆盖和框架推断必须分开

覆盖强度分四档：

- `direct`: Frank 直接覆盖该 ticker，有 ticker playbook 或多条历史观点。
- `strong_fit`: 没有足够 ticker 直接覆盖，但属于 Frank 反复讨论的核心板块或产业链环节。
- `weak_fit`: 只能用上级 sector / core methodology 做有限推断。
- `not_applicable`: 直接观点和方法论适配都不足，不适合用 Frank 框架判断。

弱覆盖和不适配本身就是高信任产物，不能为了显得有能力而硬套 Frank 框架。

### 4. 右侧不是完整 stock page

右侧只放与 Frank 框架验证相关的信息，不搬完整 stock research 页面：

- 不放完整财报表。
- 不放完整技术分析页。
- 不放完整 tweet feed。
- 不做全屏长文阅读器。

右侧目标是回答：这只股票现在是否还符合 Frank 的判断框架，以及哪些事实正在支持或削弱它。

## Workflow 范围

### 触发问题

第一版只覆盖单只股票现状判断：

- `按 Frank 框架怎么看 NVDA？`
- `Frank 怎么看 MU 现在的位置？`
- `CRCL 还能不能追？`
- `NVDA 最近跌了，是杀估值还是逻辑坏了？`
- `这只票还在 Frank 的 AI 主线里吗？`

非目标：

- 多股票比较：后续走 compare workflow。
- 总行情判断：后续走 market regime workflow。
- 纯方法论教学：后续走 method map workflow。
- 纯历史观点查询：后续走 opinion timeline workflow。
- 选股雷达：已有 `frank-style-stock-radar.md` 单独规划。

## 数据流

```text
用户消息
  -> deterministic parser 抽 ticker / 当前问题类型
  -> workflow classifier: stock_framework_status
  -> coverage resolver
       ticker detail / ticker summary / sector mapping / kol chunks
  -> methodology path builder
       core + ask-about-stock + ticker lens 或 sector lens
  -> historical opinion timeline builder
       ticker timeline + kol chunks + curated evidence fallback
  -> market fact collector
       stock brief + quote + fundamentals + news + optional macro / industry brief
  -> workflow artifact
       steps[] + summary cards + evidence references
  -> SSE final response
  -> frontend FrankWorkflowPanel
```

## 后端设计

### Response Shape

在 `KolResearchResponse` 增加可选字段：

```python
workflow_artifact: Optional[KolWorkflowArtifact] = None
```

建议结构：

```python
class KolWorkflowArtifact(BaseModel):
    workflow_type: Literal["stock_framework_status"]
    persona_username: str
    primary_ticker: str
    title: str
    status: Literal["complete", "partial", "not_applicable"]
    confidence: Literal["high", "medium", "low"]
    steps: list[KolWorkflowStep]
    coverage: KolCoverageResult
    methodology_path: KolMethodologyPath
    opinion_timeline: list[KolOpinionTimelineNode]
    market_facts: list[KolMarketFact]
    judgment_matrix: KolJudgmentMatrix
    evidence: list[KolEvidenceRef]
```

字段语义：

- `steps`: 右侧 workflow 的纵向步骤和完成状态。
- `coverage`: Frank 对该 ticker / sector 的覆盖强度。
- `methodology_path`: 本轮用了哪些高层判断维度，不规定最终回答结构。
- `opinion_timeline`: 历史观点节点，3-6 条即可。
- `market_facts`: 当前客观事实，只放与框架验证相关的事实。
- `judgment_matrix`: 支持、削弱、打脸条件。
- `evidence`: 原文、lens、market data 的引用索引。

### Step 1: 覆盖强度解析

输入：ticker、persona、`kol_chunks`、ticker cockpit detail、methodology ticker lens。

输出示例：

```json
{
  "level": "direct",
  "label": "直接覆盖",
  "reason": "Frank 有 NVDA ticker playbook，且历史观点中多次把它放入 AI 算力基础设施主线。",
  "sector_keys": ["ai-infrastructure"],
  "related_topics": ["AI 产业", "资本开支战争", "算力瓶颈"],
  "direct_mention_count": 12,
  "latest_evidence_at": "2026-04-17"
}
```

数据来源优先级：

1. `cockpitTickerDetail.summary` / ticker playbook。
2. `cockpitTickerTimeline`。
3. 本轮 `search_kol_tweets` chunks。
4. `skill_cockpit.get_ticker_summary()` / `cockpit_v3.get_ticker_summary()`。
5. sector lens fallback。

### Step 2: 方法论路径

方法论路径用于右侧展示，不用于约束左侧固定回答格式。

建议高层节点：

```text
是否属于 Frank 的长期产业主线
-> 处在产业链哪个位置
-> 当前业绩 / 订单 / 需求是否还在验证
-> 估值和预期是否已经透支
-> 什么事实会让原判断失效
```

后端可以返回：

```json
{
  "headline": "本轮主要用 AI capex / 算力瓶颈 / 打脸条件这条路径判断",
  "nodes": [
    {
      "label": "长期主线",
      "read": "先判断 AI 需求是否还在扩张，而不是先看单一 PE。",
      "source": "core/operating-system.md"
    },
    {
      "label": "产业位置",
      "read": "再看 NVDA 是否仍处在算力基础设施的关键瓶颈层。",
      "source": "ticker/NVDA.md"
    }
  ]
}
```

### Step 3: 历史观点时间线

优先使用 `GET /tickers/{ticker}/timeline`。若该 ticker 没有 timeline：

- 用本轮 `kol_chunks` 生成 3-6 个节点。
- 如果只命中 sector 观点，则标记为 `sector_context`，不要伪装成 ticker 直接观点。
- 如果没有历史证据，timeline 可以为空，并在 coverage 中降级。

节点类型：

- `origin`: 起点
- `reinforcement`: 加强
- `revision`: 修正
- `risk`: 风险
- `validation`: 验证
- `latest`: 最新
- `sector_context`: 板块背景

### Step 4: 当前客观数据

市场事实只收集和本轮方法论路径相关的数据：

- 基础 quote：价格、日涨跌、52 周位置。
- 估值：PE / forward PE / PEG 等可用字段。
- 财报：收入、利润、毛利、指引、RPO / backlog 等如果 brief 可用。
- 新闻：近期核心催化和风险新闻。
- 行业变量：AI capex、半导体库存、HBM 价格、稳定币发行量等后续逐步接入。
- 宏观：只有当用户问下跌、追涨、风险、市场状态时才拉 macro brief。

原则：不为了展示丰富而塞数据。每条 `market_fact` 都要能解释它验证了哪一个方法论节点。

### Step 5: 支持 / 削弱 / 打脸条件

返回三组高层判断：

```json
{
  "supporting": ["AI capex 仍未明显下修", "相关需求指标仍在验证"],
  "weakening": ["估值已反映较高预期", "市场对 capex ROI 更敏感"],
  "falsifiers": ["云厂商削减 capex", "订单/RPO/利润开始下修", "瓶颈从紧缺转为供给过剩"]
}
```

这些内容可以来自 ticker / sector skill 的 `signals_watched`、`bear_triggers`、`falsifiers`，也可以由 Agent 结合当前事实生成。不要把它写成买卖建议。

## 前端设计

### 新组件

新增：

```text
frontend/src/app/research/_components/KolWorkflowPanel.tsx
frontend/src/app/research/_components/kol-workflow/StockFrameworkWorkflow.tsx
frontend/src/app/research/_components/kol-workflow/WorkflowStepSection.tsx
frontend/src/app/research/_components/kol-workflow/EvidenceMiniCard.tsx
```

`KolWorkflowPanel` 负责根据 `workflow_artifact.workflow_type` 分发。没有 artifact 时 fallback 到现有 `KolChunksPanel`。

### Right Panel Layout

右侧采用纵向 workflow，不用第一版做 tabs。

```text
[顶部状态条]
NVDA · Frank 个股框架适配
覆盖强度：直接覆盖
当前判断：主线仍在，但进入验证期
置信度：中高

[Step 1 覆盖强度]
Frank 是否直接覆盖 / 属于哪个板块 / 过去怎么看这个板块

[Step 2 方法论路径]
本轮用了哪些高层判断维度，以及每个维度为什么相关

[Step 3 历史观点时间线]
3-6 个节点，可展开原文

[Step 4 当前客观数据]
价格 / 估值 / 财报 / 新闻 / 行业变量，只显示与框架验证相关的数据

[Step 5 支持 · 削弱 · 打脸]
三组判断矩阵
```

### Loading State

SSE 过程中右侧可以逐步显示步骤状态：

```text
正在确认 Frank 覆盖强度
正在匹配方法论路径
正在检索历史观点
正在读取当前市场数据
正在整理支持 / 削弱 / 打脸条件
```

第一版如果后端无法流式返回每个 artifact step，可以先用前端根据 `skill_activated` / `tool_call_start` 做轻量映射，最终以 `final.data.workflow_artifact` 替换为真实结果。

### Persistence

`researchReducer` 需要新增：

```ts
kolWorkflowArtifact: KolWorkflowArtifact | null
```

保存到 `picker_conversations.data`：

```json
{
  "kol_chunks": [...],
  "kol_workflow_artifact": {...},
  "persona_username": "qinbafrank"
}
```

恢复历史对话时，如果 artifact 存在，右侧展示 artifact；否则 fallback 到 `kol_chunks`。

### Mobile

移动端仍沿用现有 chat / results tab。右侧 workflow 在 results tab 中展示：

- 顶部状态条 sticky。
- 步骤默认全部展开，但时间线和证据内容最多显示 3 条，提供展开按钮。
- 不要求移动端展示完整数据表。

## Agent 行为约束

本功能不新增硬性回答模板。只给 Agent 高层工作空间：

- 本轮若生成了 `workflow_artifact`，最终回答应该自然引用其核心发现。
- 不需要逐项复述右侧所有步骤。
- 不规定标题名称、段落顺序、列表数量或固定 conclusion format。
- 用户明确要求短答时，可以只给短结论，并让右侧承载细节。
- 用户要求详细时，可以展开右侧已经整理出的证据和条件。
- 覆盖不足时，必须清楚说明是「方法论推断」或「不适配」，不能冒充 Frank 直接观点。

## API / 类型变更

### Backend

- `backend/app/features/kol_research/models.py`
  - 新增 `KolWorkflowArtifact` 及子模型。
  - `KolResearchResponse` 增加 `workflow_artifact`。
- `backend/app/features/kol_research/agent.py`
  - 在最终 response 构造前生成 artifact。
  - 可先用 deterministic builder 基于 `kol_chunks`、`activated_skills`、`tool_calls`、ticker summary、timeline 和 brief payload 生成。
- `backend/app/features/kol_research/input_guard.py`
  - 可增加轻量 workflow hint：`stock_framework_status`、ticker、question subtype。
- `backend/app/features/kol_research/router.py`
  - SSE `final` 自动携带 artifact。
  - 后续可新增只读 artifact debug endpoint，但 P0 不需要。

### Frontend

- `frontend/src/lib/api.ts`
  - 新增 `KolWorkflowArtifact` TypeScript types。
  - `KolResearchResponse` 增加 `workflow_artifact`。
- `frontend/src/app/research/_lib/researchReducer.ts`
  - 增加 artifact state、保存、恢复。
- `frontend/src/app/research/page.tsx`
  - `handleKolSend` 接收并持久化 `workflow_artifact`。
  - KOL 右栏渲染 `KolWorkflowPanel`。
- `frontend/src/app/research/_components/KolChunksPanel.tsx`
  - 保持 fallback，不强行合并。

## 实施步骤

1. [ ] 定义后端和前端 `KolWorkflowArtifact` 类型，覆盖 `stock_framework_status` 的最小字段。
2. [ ] 在后端实现 deterministic workflow classifier：识别单 ticker 个股现状问题，避免误伤普通闲聊或纯历史观点查询。
3. [ ] 实现 coverage resolver：基于 ticker summary、ticker timeline、kol chunks 和 sector fallback 生成覆盖强度。
4. [ ] 实现 methodology path builder：返回高层路径和每个节点的解释，不写死 Agent 最终回答模板。
5. [ ] 实现 opinion timeline builder：优先调用 cockpit ticker timeline，fallback 到 kol chunks。
6. [ ] 实现 market facts builder：复用 stock brief / quote / fundamentals / news，只保留与方法论节点相关的事实。
7. [ ] 在 `KolResearchResponse` final 中返回 artifact，并确保普通 KOL 问答没有 artifact 时行为不变。
8. [ ] 新增 `KolWorkflowPanel` 和 `StockFrameworkWorkflow`，右侧按步骤展示中间结果。
9. [ ] 将 artifact 接入 `researchReducer` 保存 / 恢复，保留 `KolChunksPanel` fallback。
10. [ ] 增加测试：
    - backend artifact builder unit tests。
    - frontend reducer restore tests。
    - `KolWorkflowPanel` component tests。
11. [ ] 手动验证 4 类样例：
    - Frank 直接覆盖 ticker，如 `NVDA` / `MU`。
    - 框架强适配但直接观点较少的 ticker。
    - 弱适配 ticker。
    - 不适配 ticker。

## 验证标准

- 用户问单只股票现状时，右侧不再只是推文列表，而是显示 workflow 中间结果。
- 右侧每个步骤至少有一个可读结论或明确的空状态。
- 左侧回答没有被强制成固定四段模板；短答请求仍能短答。
- 直接覆盖、框架推断、不适配三类场景能被清楚区分。
- 恢复历史 KOL conversation 时，右侧 artifact 能恢复；老 conversation 仍能 fallback 到 `kol_chunks`。
- 没有新增买卖指令、目标价或冒充 Frank 本人发言的风险。

## 待定问题

- workflow artifact 是在 Agent 运行后由 deterministic builder 生成，还是单独调用 `/mcp/workflow` context pack 生成？P0 建议先 deterministic builder，减少异步链路和额外 LLM 成本。
- coverage 阈值如何定义：直接观点数量、ticker playbook、timeline 节点、sector fit 的权重需要用真实 query 校准。
- 当前市场事实如何裁剪：不同板块需要不同事实字段，P0 可以先从 stock brief 的通用字段开始。
- 时间线节点是否允许 LLM 归类为 origin / risk / validation？P0 建议先用已有 `content_type` 和时间顺序，避免过度生成。
- 是否需要把 artifact 暴露为独立 shareable URL？P0 不做，等用户验证右栏价值后再考虑。
