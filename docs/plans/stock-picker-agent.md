# Stock Picker Agent - 对话引导式选股助手

> Status: All Phases Complete
> Related: `backend/app/features/screener/.context.md`, `frontend/src/app/screener/.context.md`

## Context

当前 `/screener` 是工具型 Screener（7 策略卡片 + 自然语言筛选 + 智能收窄 chips），对新手不友好。目标是重构为**对话引导式选股助手** — Agent 主动提问、提供动态选项，引导小白用户通过自然对话找到个性化的股票。

**核心理念**：Agent 是引导者，不是被动工具。用户只需点击选项或简单描述，Agent 负责把模糊偏好翻译为精确筛选条件。用户可以无限轮对话，直到找到满意的股票。

## 页面布局：左右分栏

```
/screener
+---------------------------+----------------------------------+
| Chat Panel (左)            | Results Panel (右)                |
|                           |                                  |
| [AI] 你好！想找什么类型    | ┌─ 筛选进度 ─────────────────┐   |
|      的投资机会？          | │ 3,680 → 45 → 12 → 5       │   |
|                           | │ ● 大盘股 ● 高分红 ● 科技     │   |
| [稳健收息] [高成长]        | └─────────────────────────────┘   |
| [被低估的好公司] [跟趋势]  |                                  |
| [我有具体想法]             | (结果出现前: 空状态插画/提示)     |
|                           |                                  |
| [User] 稳健收息            | ┌─ 候选股 ─────────────────────┐ |
|                           | │ AAPL Apple   $185 +1.2%     │ |
| [AI] 想要多稳健？          | │ 连续10年分红，股息率2.3%     │ |
|                           | │                               │ |
| [大公司分红稳] [分红高优先] | │ KO   Coca    $62  -0.3%     │ |
|                           | │ 股息王，连续61年增加分红     │ |
| [User] 大公司分红稳        | │                               │ |
|                           | │ ...                           │ |
| [AI] 好的！找到45只。      | └─────────────────────────────┘ |
|      对哪个行业有兴趣？    |                                  |
|                           | [查看 AAPL 详情] [加入持仓]      |
| [科技] [金融] [医疗] [不限]|                                  |
|                           |                                  |
| [___输入框___________] [→] |                                  |
+---------------------------+----------------------------------+

移动端: 顶部 Tab 切换 [对话 | 结果]，默认显示对话
```

## 对话设计

**无显式阶段状态机** — Agent 自主决定何时问问题、何时筛选。不在 schema 中追踪 phase。

**每轮都筛选**: Agent 每次回复时，只要积累了 filters，后端就立即执行筛选并更新右侧面板。用户能实时看到漏斗收窄（3,680 → 230 → 45 → 5），而不是等到最后才看结果。

**前端判断逻辑简单**:
- 响应有 `candidates`? → 更新右侧面板
- 响应有 `options`? → 在 AI 消息下方渲染 chips
- 响应有 `pick_reasons`? → 右侧面板切换为推荐卡片模式

**Welcome 选项** (融合旧策略卡片，前端硬编码):
- "稳健收息" → 映射 high_dividend 方向
- "高成长潜力" → 映射 momentum/growth 方向
- "被低估的好公司" → 映射 value_discovery 方向
- "跟着趋势走" → 映射 momentum/technical 方向
- "我有具体想法" → 聚焦输入框

**关键规则**:
- 用户随时可自由打字，Agent 自适应（专业条件如 "PE<15" 直接筛选）
- **无轮次限制**，用户可以一直对话直到找到满意的股票
- Welcome 消息**前端硬编码**，不调 Agent（零延迟）
- 所有金融术语用白话翻译（"盈利能力"不说"ROE"）
- Agent 每次回复都尝试带上 filters → 后端每次都执行筛选 → 右侧面板实时更新

## 后端变更

### 新文件: `backend/app/features/screener/picker_agent.py`

与现有 `agent.py` 并存（`/ask` 端点不变），新 Agent 专注引导式对话。

**复用现有基础设施**:
- `_current_universe` ContextVar (from `agent.py`)
- `_run_agent_session` 辅助函数 (from `agent.py`)
- `filter_custom` 函数 (from `filters.py`)

#### 分层工具架构

```python
# --- Base Tools (screener 相关，V1 使用) ---
base_tools = [
    execute_screener,        # 执行筛选条件，返回匹配结果
    get_field_distribution,  # 获取字段分布统计（设合理阈值）
    list_available_sectors,  # 列出板块和计数
]

# --- Extended Tools (个股深度，V2+ 扩展) ---
# extended_tools = [
#     get_stock_profile,     # 业务描述、竞争格局 (FMP)
#     get_recent_news,       # 近期新闻摘要
#     get_earnings_summary,  # 最近财报亮点
# ]

# Agent 使用的工具列表
picker_tools = base_tools  # V2 时: base_tools + extended_tools
```

3 个 base_tools 复用自 `agent.py`（同样的函数，共享 `_current_universe` ContextVar）。未来扩展只需写新 tool 函数 + 加入 `extended_tools` 列表 + Agent 自动发现。

#### Output Schema

```python
class PickerAgentOutput(BaseModel):
    message: str          # Agent 回复（通俗中文，60-200 字）
    options: str          # JSON array: [{"label":"稳健收息","value":"稳健收息"}, ...]
    filters: str          # JSON array: 累积的筛选条件 [{field, op, value}, ...]
    sort_by: str | None
    sort_order: str       # "asc" | "desc"
    limit: int            # 默认 30
    pick_reasons: str     # JSON array: [{"symbol":"AAPL","reason":"连续10年分红..."}, ...]
```

没有 `phase` 字段。Agent 自主决定何时提问、何时筛选、何时推荐。后端每次都尝试用 `filters` 执行筛选（如果 filters 非空）。

#### Agent 指令设计

**身份与性格**:
- 像一个懂行的朋友，温暖友好，不说行话
- 所有金融术语用白话翻译（"盈利能力"不说"ROE"，"市盈率"不说"PE"）

**核心能力**（5 个）:

1. **引导对话** — 主动提问，把模糊偏好翻译为精确筛选条件
   - 生成 3-5 个动态选项供点击，最后一个通常是开放式的（如"其他想法"）
   - 选项基于当前对话上下文动态生成（不是硬编码清单）

2. **数据探索** — 用 `get_field_distribution` 了解数据分布
   - 设置阈值前先看分布（如"高分红"到底是 >2% 还是 >3%？看分布决定）
   - 用 `list_available_sectors` 了解板块选项

3. **渐进筛选** — 每轮对话尝试积累 filters
   - 用户每说一个偏好 → 翻译为 filter 条件 → 追加到累积列表
   - 用 `execute_screener` 预览结果数量，确保不会一下子筛到 0
   - 如果条件过严导致空结果 → 主动放宽并告知用户

4. **最终推荐** — 当候选收窄到合理数量（3-8 只）时
   - 给每只股票写个性化推荐理由，呼应用户之前表达的偏好
   - 用通俗语言解释为什么这只股票适合用户

5. **自适应** — 根据用户水平调整行为
   - 小白用户（"想找稳一点的"）→ 引导式提问
   - 专业用户（"PE<15 ROE>20% 科技股"）→ 直接执行筛选，少问多做

**工具使用策略**:
- 对话早期：`get_field_distribution` + `list_available_sectors`（了解数据）
- 条件明确后：`execute_screener`（执行筛选 + 预览结果）
- 每次新增条件前：先用 `execute_screener` 试跑，确认结果数量合理

### 修改文件: `backend/app/features/screener/models.py`

新增 3 个模型:
```python
class PickerOption(BaseModel):
    label: str
    value: str

class PickRequest(BaseModel):
    message: str = Field(max_length=500)
    history: list[dict] = Field(default_factory=list)  # 无轮次限制
    accumulated_filters: list[dict] = Field(default_factory=list)

class PickResult(BaseModel):
    success: bool
    message: str                        # Agent 回复文本
    options: list[PickerOption]         # 动态选项 chips
    candidates: list[dict]              # 股票结果（filters 非空时返回）
    candidate_count: int
    universe_size: int
    pick_reasons: list[dict]            # 推荐理由（最终推荐时非空）
    accumulated_filters: list[dict]     # 回传累积条件
    data_freshness: str | None
    is_stale: bool
```

### 修改文件: `backend/app/features/screener/router.py`

新增端点 `POST /api/screener/pick`（需 Bearer token）:
1. 加载 universe（复用 `_load_universe` + 内存缓存）
2. 调用 `StockPickerAgent.guide(message, history, accumulated_filters, universe)`
3. 解析 Agent 输出（message, options, filters, sort_by, sort_order, limit, pick_reasons）
4. 如果 Agent 返回的 `filters` 非空 → 调用 `filter_custom(universe, filters, sort_by, sort_order, limit)` 获取候选股
5. 返回 `PickResult`（candidates 为空则前端右侧面板不更新）

**不修改的端点**: `/filter`, `/ask`, `/status`, `/sectors`, `/refresh` 全部保留。

## 前端变更

### 修改文件: `frontend/src/lib/api.ts`

新增类型 + API 方法:
```typescript
// 类型
interface PickerOption { label: string; value: string }
interface PickRequest { message: string; history: ChatTurn[]; accumulated_filters: Filter[] }
interface PickResult { success: boolean; message: string; options: PickerOption[]; candidates: StockCandidate[]; candidate_count: number; universe_size: number; pick_reasons: { symbol: string; reason: string }[]; accumulated_filters: Filter[]; data_freshness: string | null; is_stale: boolean }

// API
api.screener.pick = async (req: PickRequest): Promise<PickResult> => POST /screener/pick + auth
```

### 重写文件: `frontend/src/app/screener/page.tsx`

从 14 个 useState 重构为 useReducer:

```typescript
interface PickerState {
  messages: ChatMessage[];                    // 对话历史
  accumulatedFilters: Filter[];               // 累积条件（从后端回传）
  candidates: StockCandidate[];               // 右侧面板的候选股
  candidateCount: number;
  universeSize: number;
  pickReasons: { symbol: string; reason: string }[];
  isLoading: boolean;
  error: string | null;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  options?: PickerOption[];                   // AI 消息附带的选项
  timestamp: number;
}
```

布局: 左右分栏 (lg breakpoint)，移动端 Tab 切换。

### 新增组件

| 组件 | 职责 |
|------|------|
| `ChatPanel.tsx` | 左侧对话面板：消息列表 + 底部输入框 |
| `ResultsPanel.tsx` | 右侧结果面板：筛选进度 + 候选股列表 + 推荐理由 |
| `ChatMessage.tsx` | 单条消息 bubble (AI 左对齐 / User 右对齐) |
| `OptionChips.tsx` | 可点击选项 (AI 消息底部，点击后 disabled) |
| `ChatInput.tsx` | 底部输入框 (从 ScreenerInput 演化) |
| `FilterProgress.tsx` | 右侧顶部: 筛选进度条 (3,680 → 45 → 5) + 已用条件 chips |
| `PickReasonCard.tsx` | 带推荐理由的股票卡片 |
| `MobileTabSwitch.tsx` | 移动端: [对话 | 结果] Tab 切换 |

### 保留组件 (右侧面板复用)

- `CandidateList.tsx` — 候选股表格/卡片，右侧面板复用
- `DataStatus.tsx` — 数据状态

### 删除/废弃组件

- `StrategyCards.tsx` — 策略卡片融入 welcome 选项
- `NarrowingSuggestions.tsx` — 智能收窄 chips 被 Agent 动态选项替代
- `AppliedFilters.tsx` — 筛选条件改为右侧 FilterProgress 展示
- `AiSummary.tsx` — 被 ChatMessage 替代
- `FunnelProgress.tsx` — 被 FilterProgress 替代
- `SectorSelector.tsx` — 板块选择融入 Agent 对话

## 数据流：一次 Chat Turn

```
1. 用户点击 chip "稳健收息" 或打字
   → dispatch SEND_MESSAGE
   → 左侧面板添加 user bubble

2. POST /api/screener/pick {
     message: "稳健收息",
     history: [{role:"assistant", content:"你好..."}, {role:"user", content:"稳健收息"}],
     accumulated_filters: []
   }

3. 后端: StockPickerAgent.guide()
   → Agent 调用工具了解数据 / 执行筛选
   → Agent 输出: message + options + filters + pick_reasons

4. 后端处理:
   → 如果 filters 非空 → filter_custom(universe, filters) → 得到 candidates
   → 如果 filters 为空 → candidates = []（Agent 还在提问阶段）

5. 前端收到响应:
   → 左侧面板: 添加 assistant bubble + option chips
   → 右侧面板: 有 candidates → 更新筛选进度 + 候选股列表
   → 右侧面板: 有 pick_reasons → 切换为推荐卡片模式

--- 典型对话流 ---

Turn 1: "稳健收息" → Agent 追问偏好 → filters=[] → 右侧无变化
Turn 2: "大公司分红稳" → Agent 开始筛选 → filters=[...] → 右侧出现 45 只候选
Turn 3: "科技行业" → filters 累积 → 右侧收窄到 12 只
Turn 4: Agent 主动推荐 → pick_reasons=[...] → 右侧切换推荐卡片 (3-8 只)
```

## 实施步骤

### Phase 1: 后端 Agent + API

- [x] 1. `models.py` — 新增 PickerOption, PickRequest, PickResult
- [x] 2. `picker_agent.py` — 新文件: StockPickerAgent 类 + PickerAgentOutput schema + PICKER_AGENT_INSTRUCTION。复用 agent.py 的 ContextVar + 3 FunctionTool
- [x] 3. `router.py` — 新增 `POST /api/screener/pick` 端点
- [x] 4. 手动测试 Agent 对话质量（curl 3-5 个对话流程）

### Phase 2: 前端 UI 重构

- [x] 5. `api.ts` — 新增 PickRequest/PickResult 类型 + api.screener.pick()
- [x] 6. `page.tsx` — 重写: useReducer + 左右分栏布局 + 移动端 Tab
- [x] 7. `ChatPanel.tsx` — 对话面板 (消息列表 + 自动滚动)
- [x] 8. `ChatMessage.tsx` — 消息 bubble + 入场动画
- [x] 9. `OptionChips.tsx` — 可点击选项 (点击后 disabled)
- [x] 10. `ChatInput.tsx` — 底部输入框
- [x] 11. `ResultsPanel.tsx` — 右侧结果面板
- [x] 12. `FilterProgress.tsx` — 筛选进度
- [x] 13. `PickReasonCard.tsx` — 推荐理由卡片
- [x] 14. `MobileTabSwitch.tsx` — 移动端 Tab 切换

### Phase 3: 集成与打磨

- [x] 15. Welcome 消息硬编码（前端，零延迟首屏）
- [x] 16. 清理废弃组件 (StrategyCards, NarrowingSuggestions, AppliedFilters, AiSummary, FunnelProgress, SectorSelector)
- [x] 17. 移动端适配测试
- [x] 18. 错误处理: 超时/空结果/网络错误
- [x] 19. 更新 .context.md (后端 + 前端)

## 验证方案

1. **后端 API 测试**: curl 模拟完整对话流（3-5 轮），验证：
   - 第一轮（无 filters）→ 返回 message + options，candidates 为空
   - 中间轮（有 filters）→ 返回 candidates + 筛选进度
   - 最终轮 → 返回 pick_reasons + 少量精选候选
2. **浏览器测试**: Chrome DevTools MCP 打开 `/screener`，完整走一遍引导流程:
   - 点击 welcome chip → 看 AI 追问 → 点击 → 看右侧结果出现 → 最终推荐
   - 自由打字 "PE<15 科技股" → 验证跳过引导直达筛选
   - 移动端视口测试 Tab 切换
3. **Edge cases**: 空结果自动放宽、重新开始、长对话上下文管理
