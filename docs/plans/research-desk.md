# Research Desk (统一研究台) Engineering Plan

> Status: Phase 1 Complete (Steps 1-11 implemented)
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
  params: Record<string, string>;
  available_actions: string[];
};
```

### Agent Context 传递策略

**核心原则：Agent 拥有用户在右边面板看到的一切数据。**

传递分两层：被动 context（instruction 注入）+ 主动 context（Agent tools）。

#### 被动 context：完整数据注入

用户切到个股面板时，前端已从 API 拿到渲染数据。把**完整结构化数据**（不是 summary）随请求发给后端：

```typescript
// 前端构建完整 context payload
interface StockContextPayload {
  type: "stock";
  symbol: string;
  // Layer 1: 硬数据 (~300 tokens) — 前端已有，必传
  quote: { price, change_percent, market_cap, volume, week_52_high, week_52_low, pe_ratio, eps };
  fundamentals: { valuation, growth, profitability, balance_sheet, market_data };
  // Layer 2: AI 分析 — 仅传已生成的，可能 null
  ai_analysis: string | null;         // 完整 markdown (公司画像+财务体检+估值+催化剂+总结)
  technical_analysis: string | null;   // 完整 markdown
  news_analysis: string | null;        // 完整 markdown
  macro_analysis: string | null;       // 完整 markdown
  // Layer 3: 表格数据 (~800 tokens) — 前端已有，必传
  quarterly_financials: QuarterlyData[];
  valuation_comparison: ValuationComparisonData | null;
}
```

后端注入 Agent instruction：

```python
instruction = f"""
你是用户的投资研究助手。

## 用户当前正在查看: {symbol} 个股研究

### 实时数据
价格: ${quote.price} ({quote.change_percent:+.2%})
市值: {format_market_cap(quote.market_cap)}
估值: PE {valuation.pe}, PB {valuation.pb}, PS {valuation.ps}, EV/EBITDA {valuation.ev_to_ebitda}
盈利: 毛利率 {profitability.gross_margin:.1%}, ROE {profitability.roe:.1%}
增长: 营收同比 {growth.revenue_yoy:+.1%}
52周位置: {week_52_position:.0%}

### AI 投资分析
{ai_analysis or '(用户尚未生成，你可以调用 generate_stock_analysis 工具生成)'}

### AI 技术分析
{technical_analysis or '(用户尚未生成，你可以调用 generate_technical_analysis 工具生成)'}

### AI 新闻分析
{news_analysis or '(用户尚未生成，你可以调用 generate_news_analysis 工具生成)'}

### AI 宏观分析
{macro_analysis or '(用户尚未生成，你可以调用 generate_macro_analysis 工具生成)'}

### 季度财务 (最近4季)
{format_quarterly_table(quarterly_financials)}

### 估值对比
{format_valuation_comparison(valuation_comparison)}

基于以上所有数据回答用户问题。你拥有用户在右边面板看到的全部信息。
"""
```

Token 预算：

| 内容 | 估计 tokens | 何时传递 |
|------|-------------|----------|
| 硬数据 (quote + fundamentals + financials) | ~1100 | 始终 |
| AI 投资分析 (5 维度 markdown) | ~2500 | 仅当已生成 |
| AI 技术/新闻/宏观 (各) | ~1500 | 仅当已生成 |
| **总计** | **~1100 (最小) ~ ~8600 (全部已生成)** | |

#### 主动 context：Agent Tools

面板上可能有未生成的 AI 分析（用户没点"生成"按钮）。Agent 需要能主动获取：

```python
tools = [
    # 读取已缓存的分析 (不触发重新生成，快速)
    get_cached_analysis,        # symbol -> 缓存的投资分析 or null
    # 触发生成新分析 (用户说"帮我分析一下技术面")
    generate_stock_analysis,    # symbol -> 生成完整投资分析
    generate_technical_analysis,
    generate_news_analysis,
    generate_macro_analysis,
    # 导航工具
    navigate_to_content,        # 切换右边面板
    # 选股工具 (复用)
    execute_screener,
    get_field_distribution,
    list_available_sectors,
]
```

两层配合示例：

| 用户问题 | Agent 行为 |
|----------|-----------|
| "PE 在同行里高吗？" | 被动 context 有估值对比数据，直接回答 |
| "最近有什么新闻？" | 被动 context 有新闻分析就引用，没有就调 generate_news_analysis |
| "帮我重新分析基本面" | 调 generate_stock_analysis tool |
| "刚才选的那只 AAPL 呢？" | 对话历史跨 content 保留，直接引用 |
| "帮我看看 MSFT" | 调 navigate_to_content 切换面板 |

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
    content_type: str,   # "stock" | "daily_report" | "macro" | "sector" | "screener"
    params: dict,        # {"symbol": "NVDA"} 或 {"date": "2026-03-05"}
    reason: str,         # Agent 简要说明为什么切换，显示给用户
) -> dict:
    """切换右边面板到指定内容。调用此工具后，用户的右边面板会显示对应内容。"""
    return {
        "action": "navigate",
        "content_type": content_type,
        "params": params,
        "reason": reason,
    }
```

#### Agent 自动导航机制

**核心问题**：Agent 什么时候应该自动切换面板，什么时候只用文字回答？

**Instruction 中的导航规则**：

```python
NAVIGATION_RULES = """
## 何时使用 navigate_to_content

你可以通过 navigate_to_content 工具切换用户右边面板的内容。但不要滥用。

### 必须导航的场景
- 用户明确要求查看某个内容："帮我看看 NVDA"、"打开今天的日报"、"切到宏观"
- 用户从选股结果中说"看看第一只"、"详细看一下 AAPL"
- 用户说"返回选股"、"回到刚才的筛选结果"

### 不要导航的场景
- 用户只是提到一只股票但不要求查看："NVDA 最近涨了不少" → 用已有 context 回答
- 用户问的问题可以用当前 context 直接回答：当前在 NVDA 页面，问"PE 多少" → 直接答
- 用户在讨论策略或抽象话题："我应该买什么？" → 对话回答，不要切换

### 导航行为
- 从选股进入个股 → 使用 PUSH（用户可以返回选股结果）
- 从个股 A 切到个股 B → 使用 SWITCH（替换当前，不压栈）
- 回到上一层 → 提示用户点返回按钮，或使用 navigate 回到 screener
- 导航后，在回复中简要说明你做了什么："已经帮你打开了 NVDA 的详细研究。"
"""
```

**前端处理 Agent 导航响应**：

```typescript
// handleSend 中处理 navigate 响应
if (result.navigate) {
  const { content_type, params } = result.navigate;
  // 1. 获取目标内容数据
  const provider = contentProviders[content_type];
  const data = provider.fetchData ? await provider.fetchData(params) : null;
  // 2. 构建 ContentContext
  const context = provider.buildContext(data, params);
  // 3. 决定导航方式：从选股进个股用 PUSH，同类型间用 SWITCH
  if (state.activeContent.type !== content_type) {
    dispatch({ type: 'PUSH_CONTENT', content: context });
  } else {
    dispatch({ type: 'SWITCH_CONTENT', content: context });
  }
}
```

**导航后的 Context 更新**：面板切换后，下一次用户发消息时，前端会构建新面板的完整 context payload 发送给后端。Agent 在下一轮对话中自动获得新面板的完整数据。

#### API 设计

```
# Phase 2: 复用 /pick 端点，扩展请求体
POST /api/screener/pick
{
  "message": "帮我看看 NVDA 的深度研究",
  "history": [...],
  "accumulated_filters": [...],
  // 新增：完整 context payload (前端已有的渲染数据)
  "active_context": {
    "type": "stock",
    "symbol": "NVDA",
    "quote": { "price": 850, "change_percent": 2.3, ... },
    "fundamentals": { ... },
    "ai_analysis": "## 公司画像\n...",  // 完整 markdown 或 null
    "quarterly_financials": [...]
  }
}

Response:
{
  "success": true,
  "message": "NVDA 当前 PE 35 倍，在半导体板块中偏高...",
  "options": [],
  // 新增：导航指令（仅当 Agent 调用 navigate_to_content 时）
  "navigate": {
    "type": "stock",
    "params": { "symbol": "NVDA" },
    "reason": "帮你打开 NVDA 的详细研究"
  }
}

# Phase 4: 独立端点
POST /api/research/chat  (相同结构，/pick 保持兼容)
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

每种内容类型需要一个 provider：组件 + context 构建 + 数据获取。

Context 构建分两部分：
- `buildContext()` → `ContentContext`（label/summary/actions，用于 UI 显示和 contentStack 持久化）
- `buildAgentPayload()` → 完整结构化数据（发给后端注入 Agent instruction，见"Agent Context 传递策略"）

```typescript
// frontend/src/app/screener/_lib/contentProviders.ts

export const contentProviders: Record<ContentType, ContentProvider> = {
  screener: {
    component: ResultsPanel,
    buildContext: (state) => ({
      type: "screener",
      label: `选股结果 (${state.candidateCount} 只)`,
      summary: `筛选出 ${state.candidateCount} 只股票`,
      params: {},
      available_actions: ["继续收窄", "查看个股详情", "重新筛选"],
    }),
    // screener 的 Agent payload 就是 reducer 中的选股数据
    buildAgentPayload: (state) => ({
      type: "screener",
      filters: state.accumulatedFilters,
      candidates: state.candidates,
      candidate_count: state.candidateCount,
      universe_size: state.universeSize,
      pick_reasons: state.pickReasons,
    }),
    fetchData: null,  // 数据来自 reducer state
  },

  stock: {
    component: StockResearchView,
    buildContext: (data) => ({
      type: "stock",
      label: `${data.symbol} 个股研究`,
      summary: `${data.profile?.companyName || data.symbol}`,
      params: { symbol: data.symbol },
      available_actions: ["技术面分析", "查看新闻", "返回选股", "查看宏观影响"],
    }),
    // 完整数据 payload — Agent 拿到用户看到的一切
    buildAgentPayload: (data) => ({
      type: "stock",
      symbol: data.symbol,
      quote: data.quote,
      fundamentals: data.fundamentals,
      ai_analysis: data.aiAnalysis?.content || null,
      technical_analysis: data.technicalAnalysis?.content || null,
      news_analysis: data.newsAnalysis?.content || null,
      macro_analysis: data.macroAnalysis?.content || null,
      quarterly_financials: data.quarterlyFinancials,
      valuation_comparison: data.valuationComparison,
    }),
    fetchData: async (params) => {
      const [profile, quotes, fundamentals, analysisCache] = await Promise.all([
        api.stock.getProfile(params.symbol),
        api.stock.getQuotes(params.symbol),
        api.stock.getFundamentals(params.symbol),
        api.stock.getAnalysisCache(params.symbol),
      ]);
      return { symbol: params.symbol, profile, quote: quotes, fundamentals, ...analysisCache };
    },
  },

  daily_report: {
    component: DailyReportView,
    buildContext: (data) => ({
      type: "daily_report",
      label: `${data.date} 市场日报`,
      summary: data.title || '市场日报',
      params: { date: data.date },
      available_actions: ["追问日报内容", "查看提到的个股", "查看宏观背景"],
    }),
    buildAgentPayload: (data) => ({
      type: "daily_report",
      date: data.date,
      // 日报全文 markdown 直接传递
      content: data.content,
    }),
    fetchData: async (params) => api.daily.getReport(params.date),
  },

  macro: {
    component: MacroOverview,
    buildContext: (data) => ({
      type: "macro",
      label: "宏观风险仪表盘",
      summary: `整体风险: ${data.overall_risk}`,
      params: {},
      available_actions: ["深入某个维度", "查看对持仓影响", "返回选股"],
    }),
    buildAgentPayload: (data) => ({
      type: "macro",
      risk_summary: data,  // 完整风险评估数据
    }),
    fetchData: async () => api.macro.getRiskSummary(),
  },

  sector: {
    component: SectorView,
    buildContext: (data) => ({
      type: "sector",
      label: `${data.sectorName} 板块分析`,
      summary: `${data.sectorName} 板块`,
      params: { sector: data.sectorId },
      available_actions: ["查看板块个股", "板块间对比", "返回选股"],
    }),
    buildAgentPayload: (data) => ({
      type: "sector",
      sector_name: data.sectorName,
      sector_data: data,  // 完整板块数据
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
7. [ ] **Agent context 注入** — 前端用 `buildAgentPayload()` 构建完整数据 payload，随 `/pick` 请求发送 `active_context` 字段
8. [ ] **后端 Picker Agent 扩展** — 识别 `active_context`，将完整结构化数据格式化为自然语言注入 instruction。增加 `navigate_to_content` tool + 导航规则 instruction
9. [ ] **Agent 驱动导航** — 前端解析 Agent 响应中的 `navigate` 字段，根据导航类型执行 PUSH/SWITCH，获取目标数据并切换面板
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

**决策：前端发送完整结构化数据，后端注入 Agent instruction**

两种方案：
- A: 前端发 content_type + params，后端自己查数据生成 context
- B: 前端发送完整数据 payload，后端直接注入

**选 B** 因为：
- 前端已经有渲染数据了（刚从 API 获取的），不需要后端重复查询
- Agent 获得用户看到的**完全相同的数据**，不会有信息差
- 减少后端 API 调用和延迟
- 支持渐进式 context（AI 分析仅在已生成时才传递）

**不是 summary，而是完整数据**：前端发送 `StockContextPayload`（见"Agent Context 传递策略"节），包含 quote、fundamentals、AI 分析 markdown、季度财务等完整数据。后端格式化为自然语言注入 instruction，token 预算 ~1100（最小）到 ~8600（全部 AI 分析已生成）。

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

1. ~~**context 的 token 预算**~~ — **已决定**：传完整结构化数据，非 summary。Token 预算 ~1100（硬数据）到 ~8600（全部 AI 分析已生成）。AI 分析仅在已生成时传递，未生成时 Agent 可调 tool 按需生成。
2. ~~**Agent 何时自动导航**~~ — **已决定**：通过 instruction 中的导航规则控制（见"Agent 自动导航机制"）。明确要求时导航，只是提及不导航。
3. **离线内容** — 日报是每天生成的，如果用户查的是历史日报怎么办？params 里传 date，fetchData 时拉历史数据。
4. **多 Agent vs 单 Agent** — Phase 3 是用一个大 Research Agent（所有 tools）还是根据 content type 路由到不同的专业 Agent？暂定单 Agent + 所有 tools，如果 tool 太多导致模型困惑再拆分。
5. **并发数据获取** — 切换面板时 fetchData 可能较慢（个股研究 ~3-5s），需要 loading 态。是否要预取？暂不预取，先做好 loading UX。
