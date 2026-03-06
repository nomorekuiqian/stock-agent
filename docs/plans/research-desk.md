# Research Desk (统一研究台) Engineering Plan

> Status: Planning
> Related: features/screener/.context.md, app/screener/.context.md
> Vision: 产品策略.md > 方向三：统一研究台

## 目标

将 /screener 的左右分栏扩展为通用研究台：左边 Agent 对话（固定），右边内容面板（动态切换）。Agent 自动感知右边 context，对话跨 context 保留，Agent 可驱动右边面板切换。

## 现状

**已有**：
- /screener 是唯一的左右分栏页面（ChatPanel + ResultsPanel）
- Picker Agent 对话系统完整：reducer (8 actions) + sessionStorage + DB 持久化
- 其他页面（/today, /stock, /macro, /sectors）各自独立，无对话能力
- 后端各 feature 数据能力齐全（日报、个股研究、宏观分析、板块分析）

**缺什么**：
- 右边面板只能显示选股结果，不能切换到其他内容类型
- Agent 只理解选股 context，不理解其他内容类型
- 对话和右边面板没有 context 关联机制
- 没有 Agent 驱动面板切换的能力

## 设计

### 核心抽象：ContentContext

每种内容类型实现统一的 context 接口，Agent 通过这个接口感知右边面板的内容。

```typescript
// 前端 context 抽象
type ContentType = "screener" | "stock" | "daily_report" | "macro" | "sector";

type ContentContext = {
  type: ContentType;
  label: string;            // 显示名: "NVDA 个股研究", "3月5日 市场日报"
  summary: string;          // 给 Agent 的自然语言摘要 (~500 tokens)
  structured_data?: Record<string, unknown>;  // 结构化数据 (Agent 可引用)
  available_actions: string[];  // 该 context 下可执行的动作
};
```

```python
# 后端：每种 content type 的 context 生成器
def build_stock_context(symbol: str, analysis: dict) -> str:
    """把个股研究结果压缩为 Agent 可用的 context 摘要"""
    return f"""
用户正在查看 {symbol} 的深度研究。
基本面: PE {analysis['pe']}, ROE {analysis['roe']}%, ...
技术面: RSI {analysis['rsi']}, 趋势 {analysis['trend']}
近期事件: {analysis['recent_news_summary']}
"""
```

### 前端架构

#### 状态管理演进

从 screener-only 的 `pickerReducer` 演进为通用的 `researchReducer`：

```
当前 (pickerReducer):
  messages[] + candidates[] + pickReasons[] + funnelSteps[]

目标 (researchReducer):
  messages[]           // 对话历史 (跨 context 保留)
  contentStack[]       // 内容面板历史栈 (可回退)
  activeContent        // 当前右边面板的 ContentContext
  conversationId       // 持久化 ID
```

新增 Action:

```typescript
type ResearchAction =
  // 继承 Picker 的所有 actions
  | { type: "SWITCH_CONTENT"; payload: ContentContext }  // 切换右边面板
  | { type: "PUSH_CONTENT"; payload: ContentContext }    // 压栈 (从选股进入个股)
  | { type: "POP_CONTENT" }                              // 弹栈 (返回上一个)
  | { type: "AGENT_NAVIGATE"; payload: ContentContext }  // Agent 驱动切换
```

#### 页面结构

```
/screener (Phase 2-3, 复用现有路由)
  或
/research (Phase 4, 独立路由)
    |
    v
ResearchLayout (左右分栏)
    |
    ├── ChatPanel (左, 固定)
    │     ├── 对话消息列表
    │     ├── 输入框
    │     └── Context 指示器 ("当前: NVDA 个股研究")
    │
    └── ContentPanel (右, 动态)
          ├── ContentHeader (面板标题 + 返回按钮 + 切换 tabs)
          └── ContentRenderer (根据 type 渲染不同内容)
                ├── type="screener" → 现有 ResultsPanel
                ├── type="stock"   → StockResearchView (嵌入式个股研究)
                ├── type="daily"   → DailyReportView (嵌入式日报)
                ├── type="macro"   → MacroOverview (嵌入式宏观)
                └── type="sector"  → SectorView (嵌入式板块)
```

#### 内容面板切换机制

**用户手动切换**：ContentHeader 提供 tab 切换或下拉菜单。

**Agent 驱动切换**：Agent 返回特殊指令，前端解析后执行：

```typescript
// Agent 响应中的导航指令
type AgentResponse = {
  message: string;
  options?: string[];
  // 新增：导航指令
  navigate?: {
    type: ContentType;
    params: Record<string, string>;  // e.g. { symbol: "NVDA" }
  };
};
```

前端收到 `navigate` 后：
1. 获取目标内容数据（调对应 API）
2. Dispatch `PUSH_CONTENT` 压栈
3. 右边面板切换到新内容
4. Agent 自动获得新 context

### 后端架构

#### 统一 Research Agent

不是 5 个独立 agent，而是 1 个 Research Agent + 动态 context 注入 + 多种 tools：

```python
# backend/app/features/research/agent.py

from google.adk.agents import LlmAgent
from google.adk.tools import FunctionTool

# 复用现有各模块的能力作为 tools
research_agent = LlmAgent(
    model="gemini-3.1-pro-preview",
    name="research_agent",
    instruction=RESEARCH_INSTRUCTION,  # 动态注入 context
    tools=[
        # 选股工具 (复用 screener)
        execute_screener,
        get_field_distribution,
        list_available_sectors,
        # 个股工具 (新增)
        get_stock_analysis,
        get_stock_technical,
        get_stock_news,
        # 宏观工具 (新增)
        get_macro_risk_summary,
        get_liquidity_status,
        # 导航工具 (新增)
        navigate_to_content,
    ],
    output_schema=ResearchOutput,
)
```

#### 动态 Context 注入

```python
RESEARCH_INSTRUCTION = """
你是用户的投资研究助手。你可以帮用户选股、研究个股、分析宏观环境。

## 当前用户正在查看

{active_context}

## 你的能力

1. 回答用户关于当前内容的问题
2. 调用工具获取更多数据
3. 通过 navigate_to_content 切换右边面板，帮用户查看其他内容
4. 跨内容串联分析（"刚才选的那只股票在宏观环境下的风险"）

## 对话历史中的 context 变化

{context_history}
"""
```

#### navigate_to_content Tool

```python
def navigate_to_content(
    content_type: str,   # "stock" | "daily_report" | "macro" | "sector"
    params: dict,        # {"symbol": "NVDA"} 或 {"date": "2026-03-05"}
) -> dict:
    """切换右边面板到指定内容。调用此工具后，用户的右边面板会显示对应内容。"""
    # 返回导航指令，router 透传给前端
    return {
        "action": "navigate",
        "content_type": content_type,
        "params": params,
    }
```

#### API 设计

```
# 统一研究端点 (Phase 2 先复用 /pick, Phase 4 迁移)
POST /api/research/chat
{
  "message": "帮我看看 NVDA 的深度研究",
  "history": [...],
  "active_context": {
    "type": "screener",
    "summary": "用户刚筛选出 8 只高股息股票: AAPL, MSFT, ..."
  }
}

Response:
{
  "message": "好的，让我帮你查看 NVDA 的深度分析。",
  "navigate": {
    "type": "stock",
    "params": { "symbol": "NVDA" }
  },
  "context_summary": "NVDA 基本面: PE 35, ROE 28%, ..."
}
```

### 对话持久化演进

现有的 `picker_conversations` 表结构基本够用，`data` JSONB 列扩展：

```jsonc
{
  // 现有字段保留
  "messages": [...],
  "accumulated_filters": [...],
  "candidates": [...],
  "pick_reasons": [...],
  "funnel_steps": [...],
  // 新增
  "content_stack": [
    { "type": "screener", "label": "高股息筛选", "params": {} },
    { "type": "stock", "label": "NVDA 个股研究", "params": { "symbol": "NVDA" } }
  ],
  "active_content_type": "stock",
  "context_transitions": [
    { "at_message": 5, "from": "screener", "to": "stock", "params": { "symbol": "NVDA" } }
  ]
}
```

### Content Provider 实现

每种内容类型需要一个 provider 组件和一个 context 生成函数：

```typescript
// frontend/src/app/screener/_lib/contentProviders.ts

export const contentProviders: Record<ContentType, ContentProvider> = {
  screener: {
    // 渲染组件
    component: ResultsPanel,
    // 从当前数据生成 context 摘要
    buildContext: (state) => ({
      type: "screener",
      label: `选股结果 (${state.candidateCount} 只)`,
      summary: `用户筛选出 ${state.candidateCount} 只股票。
        条件: ${state.accumulatedFilters.map(f => f.label).join(', ')}。
        候选: ${state.candidates.slice(0, 5).map(c => c.symbol).join(', ')}...`,
      available_actions: ["继续收窄", "查看个股详情", "重新筛选"],
    }),
    // 获取数据
    fetchData: null,  // screener 数据来自 reducer state
  },

  stock: {
    component: StockResearchView,
    buildContext: (data) => ({
      type: "stock",
      label: `${data.symbol} 个股研究`,
      summary: `${data.symbol} (${data.name}): 价格 $${data.price},
        PE ${data.pe}, ROE ${data.roe}%,
        近期: ${data.recentNewsSummary}`,
      available_actions: ["技术面分析", "查看新闻", "返回选股", "查看宏观影响"],
    }),
    fetchData: async (params) => {
      const [quotes, analysis] = await Promise.all([
        api.stock.getQuotes(params.symbol),
        api.stock.analysis(params.symbol),
      ]);
      return { ...quotes, ...analysis };
    },
  },

  daily_report: {
    component: DailyReportView,
    buildContext: (data) => ({
      type: "daily_report",
      label: `${data.date} 市场日报`,
      summary: data.executive_summary,
      available_actions: ["追问日报内容", "查看提到的个股", "查看宏观背景"],
    }),
    fetchData: async (params) => api.daily.getReport(params.date),
  },

  macro: {
    component: MacroOverview,
    buildContext: (data) => ({
      type: "macro",
      label: "宏观风险仪表盘",
      summary: `四维度评分: 流动性 ${data.liquidity}/10, 经济 ${data.economy}/10,
        通胀 ${data.inflation}/10, 情绪 ${data.sentiment}/10。
        整体风险: ${data.overall_risk}`,
      available_actions: ["深入某个维度", "查看对持仓影响", "返回选股"],
    }),
    fetchData: async () => api.macro.getRiskSummary(),
  },

  sector: {
    component: SectorView,
    buildContext: (data) => ({
      type: "sector",
      label: `${data.sectorName} 板块分析`,
      summary: `${data.sectorName}: 今日 ${data.dailyChange}%,
        领涨: ${data.topGainers.join(', ')},
        领跌: ${data.topLosers.join(', ')}`,
      available_actions: ["查看板块个股", "板块间对比", "返回选股"],
    }),
    fetchData: async (params) => api.sectors.getAnalysis(params.sector),
  },
};
```

### 移动端适配

移动端保持现有 tab 切换模式，但 tab 从 "Chat | Results" 扩展为 "Chat | Content"，Content tab 下显示当前活跃的内容面板。

## 实施步骤

### Phase 2: 选股 + 个股研究 (最小可用)

> 目标：选股完成后，点击候选股直接在右边面板打开个股研究，Agent 保持 context。

1. [ ] **ContentContext 类型定义** — 创建 `_lib/contentTypes.ts`，定义 `ContentType`, `ContentContext`, `ContentProvider` 接口
2. [ ] **Reducer 扩展** — `pickerReducer` 新增 `activeContent`, `contentStack` 状态 + `PUSH_CONTENT`, `POP_CONTENT`, `SWITCH_CONTENT` actions
3. [ ] **ContentPanel 组件** — 创建 `ContentPanel.tsx`，根据 `activeContent.type` 渲染不同内容。默认渲染 `ResultsPanel`（保持现有行为）
4. [ ] **StockResearchView 组件** — 从 `/stock/[symbol]` 提取核心展示逻辑为可嵌入组件（不包含页面 layout/nav）
5. [ ] **CandidateList 点击行为** — 从"跳转 /stock/{symbol}"改为 `dispatch(PUSH_CONTENT, { type: "stock", params: { symbol } })`
6. [ ] **ContentHeader 组件** — 面板顶部显示当前内容标题 + 返回按钮（弹栈回到选股结果）
7. [ ] **Agent context 注入** — 发送 `/pick` 请求时，附带 `active_context` 字段（当前面板的 summary）
8. [ ] **后端 Picker Agent 扩展** — 识别 `active_context`，在 instruction 中注入当前 context。增加 `navigate_to_content` tool
9. [ ] **Agent 驱动导航** — 前端解析 Agent 响应中的 `navigate` 字段，自动执行面板切换
10. [ ] **持久化扩展** — conversation data JSONB 增加 `content_stack` 和 `active_content_type`
11. [ ] **SessionStorage 扩展** — 持久化和恢复 `contentStack` 和 `activeContent`

### Phase 3: 加入日报/宏观 context

> 目标：用户可以在研究台内查看日报、宏观数据，Agent 理解这些 context。

12. [ ] **DailyReportView 组件** — 从 `/today` 提取核心展示逻辑为可嵌入组件
13. [ ] **MacroOverview 组件** — 从 `/macro` 提取风险仪表盘为可嵌入组件
14. [ ] **SectorView 组件** — 从 `/sectors` 提取板块分析为可嵌入组件
15. [ ] **ContentHeader tabs** — 在面板顶部增加 content type 切换 tabs
16. [ ] **Research Agent (后端)** — 从 Picker Agent 演进为通用 Research Agent，注册所有 content type 的 tools
17. [ ] **API 端点** — 新增 `POST /api/research/chat`，替代 `/pick` 作为统一入口（`/pick` 保持兼容）
18. [ ] **宏观/日报 context 生成器** — 后端为每种 content type 实现 context summary 生成

### Phase 4: 独立 /research 路由

> 目标：研究台成为独立入口，不只是 screener 的扩展。

19. [ ] **新路由 `/research`** — 独立页面，默认 welcome screen 提供多种入口（选股/日报/宏观/个股搜索）
20. [ ] **入口多样化** — 从首页、日报、个股页面都可以"在研究台中打开"
21. [ ] **对话命名空间** — conversations 表增加 `type` 字段区分选股对话和研究对话
22. [ ] **旧路由兼容** — /screener 重定向到 /research?mode=screener

## 关键架构决策

### 1. 内容面板渲染策略

**决策：提取 + 嵌入，而非 iframe**

从各页面（/stock, /today, /macro）提取核心展示组件，作为无 layout 的纯展示组件嵌入 ContentPanel。不用 iframe 因为：
- 需要和 Agent 共享状态（context 传递）
- 样式一致性
- 性能（避免多个 React 实例）

**实施方式**：每个页面的展示逻辑抽取为 `XxxView` 组件（无页面 layout、无 nav），原页面改为引用 `XxxView` + 页面 layout。

### 2. Agent 模型选择

**决策：Research Agent 使用 gemini-3.1-pro-preview**

Picker Agent 目前用 flash-lite，但 Research Agent 需要：
- 理解多种 content context
- 跨 context 串联分析
- 决定何时调用 navigate_to_content

这需要更强的推理能力，用 pro 模型。选股部分的 tools 可以继续复用，不影响速度（tool 执行是 Python 代码，不走 LLM）。

### 3. Context 传递方式

**决策：前端生成 summary，随请求发送**

两种方案：
- A: 前端发 content_type + params，后端自己查数据生成 context
- B: 前端生成 context summary，随请求发送

**选 B** 因为：
- 前端已经有渲染数据了（刚从 API 获取的），不需要后端重复查询
- 减少一次后端 API 调用
- 前端更了解用户当前看到的内容（滚动位置、展开的 section 等）

后端收到 summary 后注入 Agent instruction，不需要额外查询。

### 4. 对话历史管理

**决策：统一历史，标记 context 切换点**

对话历史不按 content type 分割，而是一个连续的 messages[]。当 context 切换时，在历史中插入一条系统消息标记：

```typescript
{ role: "system", content: "[Context 切换] 用户从选股结果切换到 NVDA 个股研究" }
```

Agent 看到完整历史（包含 context 切换标记），可以跨 context 引用。

### 5. 内容面板导航模型

**决策：栈模型 (stack)**

用户研究流程是线性深入的：选股 → 看个股 → 查宏观影响 → 返回个股 → 返回选股。

栈模型最自然：
- `PUSH_CONTENT`：进入下一层（选股 → 个股）
- `POP_CONTENT`：返回上一层（个股 → 选股）
- `SWITCH_CONTENT`：平级切换（个股 A → 个股 B，替换栈顶）

ContentHeader 显示返回按钮（栈深度 > 1 时）。

## 待定问题

1. **content summary 的 token 预算** — 每次发给 Agent 的 context summary 控制在多少 tokens？太少信息不够，太多浪费 tokens。暂定 ~500 tokens/context。
2. **Agent 主动推荐切换的阈值** — Agent 什么时候应该主动建议"要不要看看 NVDA 的详细研究？"vs 只是回答问题？需要在 instruction 中调教。
3. **离线内容** — 日报是每天生成的，如果用户查的是历史日报怎么办？params 里传 date，fetchData 时拉历史数据。
4. **多 Agent vs 单 Agent** — Phase 3 是用一个大 Research Agent（所有 tools）还是根据 content type 路由到不同的专业 Agent？暂定单 Agent + 所有 tools，如果 tool 太多导致模型困惑再拆分。
5. **并发数据获取** — 切换面板时 fetchData 可能较慢（个股研究 ~3-5s），需要 loading 态。是否要预取？暂不预取，先做好 loading UX。
