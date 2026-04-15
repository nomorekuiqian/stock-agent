# Earnings Transcript Analysis Engineering Plan

> Status: In Progress (Phase 1-3 done, pending E2E testing)
> Related: features/stock/.context.md, docs/plans/active/stock-research-upgrade.md
> Vision: 产品策略.md > 模块 3 -- 个股深研

## 目标

以 Earnings Call Transcript 为核心数据源，构建财报日第一时间可用的深度财报分析功能，取代当前以结构化三张表为中心的分析模式。

## 背景与动机

### 为什么要做这个

1. **ChatGPT 已经能做财报分析** -- 抓 PDF、解析数字。我们的差异化不在"能不能拿到数据"，而在"持续性 + 结构化 + 宏观联动 + Transcript 深度解读"
2. **结构化数据有偏差** -- FMP 的 `financial-growth` 端点用 QoQ 而非 YoY；NVIDIA 等非标准财年公司的 fiscal year 映射经常出错
3. **时效性问题** -- 三张表（10-Q/10-K）在财报日当天可能还没进 FMP，真正第一时间能拿到的是 Transcript 和 8-K Press Release

### 信息发布时间线

```
财报日当天（盘后/盘前）
|
+-- 1. Press Release (8-K)          -- 最先出来，几分钟内
|     摘要数字：营收、EPS、guidance、精简版损益表
|
+-- 2. Earnings Call                -- 通常在 8-K 后 1-2 小时
|     管理层演讲 (prepared remarks) + 分析师 Q&A
|
+-- 3. 精简版三张表                  -- 随 8-K 或几小时内
|     初版，可能有修订
|
+-- 4. 10-Q / 10-K Filing          -- 几周后（10-Q 最多 45 天，10-K 最多 60 天）
      完整报表 + MD&A + 脚注 + 审计意见
```

### 核心设计理念

```
当前:  结构化数据（主） -> AI 解读数字（辅）
新:    Transcript（主） -> AI 深度解读（核心） -> 结构化数据（补充验证）
```

## 现状

### 已有能力（features/stock/）

- **EarningsTab 前端组件** (600+ 行): 季度选择器、三张表展示、增长趋势表、EPS Surprise 历史、分析师预期、AI 分析区域
- **get_earnings_data() 服务方法**: 并行获取 9 个数据源（yfinance earnings history、FMP 三张表各 12 季度、analyst estimates、revenue segments、DCF、next earnings date）
- **_compute_yoy_growth()**: 自研 YoY 增长率计算（修复了 FMP 的 QoQ 问题）
- **earnings.py Agent**: 7 段式中文财报分析（Gemini Pro），含智能模式切换（最新解读/前瞻/历史回顾）
- **AI 分析输出**: title, earnings_overview, revenue_breakdown, profitability_cashflow, balance_sheet_capital, growth_trends, earnings_verdict

### 完全缺失

- Earnings Call Transcript 抓取和展示
- 基于 transcript 的 AI 深度解读
- 8-K Press Release 抓取
- 管理层 Guidance 追踪（跨季度对比）
- Analyst Q&A 关键议题提取

### FMP 可用端点（待验证定价）

| 端点 | 说明 | 当前状态 |
|------|------|---------|
| `/stable/earning-call-transcript?symbol=X&year=Y&quarter=Q` | 完整电话会纪要文本 | **未实现，需验证是否在 Premium Plan 内** |
| `/stable/earnings-transcript-list` | 公司 transcript 列表 | **未实现** |
| `/stable/sec-filings-8k` | 8-K Press Release | **未实现** |
| `/stable/sec-filings-search/symbol?symbol=X` | 公司 SEC Filing 列表 | **未实现** |
| `/api/form10k?symbol=X&year=Y` | 10-K JSON 结构化版本 | **未实现** |
| `/stable/financial-reports-json?symbol=X` | 10-K 完整 JSON（含 MD&A） | **未实现** |

> **注意**: `stock-research-upgrade.md` 标注 transcript 需要 FMP Ultimate ($139/mo)。Step 1 必须先验证这一点。

## 设计

### 数据流

```
用户进入个股页 -> 选择季度
        |
        +-- GET /earnings-data（已有 + 新增 transcript 可用性标记）
        |   -> 展示结构化数据（底部补充区域）
        |   -> 标记该季度是否有 transcript
        |
        +-- GET /transcript?year=X&quarter=Y（新增）
        |   -> 展示 transcript 原文（可折叠区域）
        |
        +-- POST /earnings（已有，重写 agent 逻辑）
            -> Agent 检测到有 transcript -> 模式 A（transcript 深度解读）
            -> Agent 没有 transcript -> 模式 B（纯数字分析，现有逻辑）
            -> 展示 AI 分析（主区域）
```

### API 变更

#### 新增端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/stocks/{symbol}/transcript` | GET | 获取指定季度的 transcript 原文 |

Query params: `year` (int, required), `quarter` (int, 1-4, required)

返回:
```json
{
  "symbol": "AAPL",
  "year": 2025,
  "quarter": 1,
  "transcript": "...完整文本...",
  "available": true
}
```

#### 修改现有端点

**GET `/api/stocks/{symbol}/earnings-data`**

新增返回字段:
```json
{
  "...existing fields...",
  "transcript_quarters": [
    {"year": 2025, "quarter": 1, "available": true},
    {"year": 2024, "quarter": 4, "available": true}
  ]
}
```

**POST `/api/stocks/{symbol}/earnings`**

AI 分析输入新增 transcript 文本。输出结构调整（见下方 Agent 设计）。

### Agent 设计

#### 输入数据

在现有 `_prepare_earnings_data_for_agent()` 基础上新增：

```python
def _prepare_earnings_data_for_agent(earnings_data, quote_snapshot, transcript=None):
    data = {
        # --- 现有数据（保留） ---
        "earnings_history": [...],        # 最近 8Q EPS surprise
        "analyst_estimates": [...],       # 下 4 期预测
        "revenue_segments": [...],        # 最近 4 期产品线拆分
        "revenue_geo_segments": [...],    # 最近 4 期地区拆分
        "financial_growth": [...],        # 最近 8Q YoY 增长率
        "income_statements": [...],       # 最近 2Q 损益表
        "cashflow_statements": [...],     # 最近 2Q 现金流
        "balance_sheets": [...],          # 最近 1Q 资产负债表
        "company_context": {...},         # 行业/指标/估值

        # --- 新增 ---
        "transcript": "...",              # 完整 transcript 文本（或截取后的版本）
        "has_transcript": True/False,     # 标记
    }
```

#### Token 管理

Transcript 通常 1-3 万字（英文），直接全文可能超限。策略：

```
原文 transcript（约 15K-30K tokens）
    |
    +-- 截取策略：
    |   1. 保留 prepared remarks 全文（管理层演讲，信息最密集）
    |   2. 保留 Q&A 全文
    |   3. 跳过 operator 的程序性发言（"Our next question comes from..."）
    |
    +-- 如果仍超限（> 20K tokens）：
        prepared remarks 全文 + Q&A 前 10 个问答
```

实现：在 service 层做文本预处理，不在 agent 层。

#### 输出结构（新）

```python
class EarningsAnalysisOutput(BaseModel):
    # 保留
    title: str                    # 有观点的标题（15-40 字）
    earnings_overview: str        # Beat/miss 判断 + 核心数字（600-900 字）

    # 新增（transcript 相关，模式 A 才有内容）
    management_highlights: str    # 管理层核心要点 -- prepared remarks 中的关键信息（500-700 字）
    guidance_and_outlook: str     # 前瞻指引 + 与上季 guidance 对比（500-700 字）
    analyst_concerns: str         # Q&A 环节的关键问题和管理层回应（500-700 字）

    # 调整（合并原有字段）
    revenue_breakdown: str        # 分部分析，结合 transcript 叙述 + 数字验证（500-700 字）
    financial_health: str         # 合并原 profitability_cashflow + balance_sheet_capital（500-700 字）
    earnings_verdict: str         # 评分卡 + 关注指标 + 下季预判（500-700 字）
```

对比原有 7 段 -> 新 8 段。模式 B（无 transcript）时，management_highlights / guidance_and_outlook / analyst_concerns 返回空字符串或提示"暂无电话会纪要数据"。

#### 智能模式切换（更新）

```
模式 A：有 Transcript（财报已发布且有纪要）
  -> 以 transcript 为主要分析材料
  -> 结构化数据用于验证管理层说的数字
  -> 重点提取：管理层核心观点、guidance 变化、Q&A 关键交锋、回避的问题

模式 B：无 Transcript（财报未发布 / transcript 缺失）
  -> 退回现有逻辑，纯结构化数据分析
  -> management_highlights / guidance_and_outlook / analyst_concerns 返回空
  -> 根据时间：
     - 下次财报 < 30 天 -> "财报前瞻"模式
     - 最近财报 < 45 天 -> "最新财报回顾"模式
     - 其他 -> "历史趋势"模式
```

### 前端变更

#### EarningsTab 布局重构

```
当前布局:
+---------------+------------------+
| AI 分析(左)    | 数据标签页(右)    |
|  7 个板块      | 损益表/现金流/资产 |
+---------------+------------------+

新布局:
+----------------------------------+
| 季度选择器 + 下一财报日倒计时      |
+----------------------------------+
| AI 深度解读（全宽，核心区域）       |
|  - 整体判断                       |
|  - 管理层要点（来自 transcript）   |
|  - 前瞻指引                       |
|  - 分析师关注点                    |
|  - 分部分析                       |
|  - 财务健康 + 评分卡               |
+----------------------------------+
| Transcript 原文（可展开/折叠）     |
+----------------------------------+
| 财务数据（标签页，补充参考）        |
|  损益表 | 现金流 | 资产负债表       |
+----------------------------------+
```

核心变化：
- AI 分析从左侧栏提升为全宽主区域
- 新增 transcript 原文可折叠展示区域
- 三张表降级为底部补充区域
- 季度选择器优先标记有 transcript 的季度

#### Transcript 原文展示组件

- 折叠/展开控制
- 文本内搜索（Ctrl+F 即可，不需要自建）
- 区分 Prepared Remarks 和 Q&A 两部分（如果文本格式允许）
- 长文本虚拟滚动（transcript 可能很长）

### 后端新增文件

```
backend/app/shared/fmp_service.py        # 新增 2 个方法
backend/app/features/stock/service.py    # 修改 get_earnings_data() + 新增 get_transcript()
backend/app/features/stock/router.py     # 新增 1 个端点，修改 1 个端点
backend/app/features/stock/agent/earnings.py  # 重写 agent 指令 + 输出结构
backend/app/features/stock/models.py     # 更新 EarningsAnalysisOutput + 新增 TranscriptResponse
```

### 缓存策略

| 数据 | 缓存方式 | TTL | 原因 |
|------|---------|-----|------|
| Transcript 原文 | DB (Insforge) | 永久 | 历史 transcript 不会变 |
| Transcript 列表 | 内存 | 24 小时 | 只需每天更新一次 |
| AI 分析（有 transcript） | DB | 7 天 | 基于不变的 transcript，分析也稳定 |
| AI 分析（无 transcript） | DB | 24 小时 | 保持现有策略 |

## 实施步骤

### Phase 0: 验证数据可用性（必须先做）

1. [ ] 调用 FMP `/stable/earning-call-transcript?symbol=AAPL&year=2025&quarter=1` 验证 Premium Plan 是否可用
2. [ ] 检查返回数据质量：文本完整度、格式、覆盖范围（大盘股 vs 小盘股）
3. [ ] 调用 `/stable/earnings-transcript-list` 确认覆盖的公司数量
4. [ ] 如果 transcript 端点不在 Premium Plan 内，评估：升级到 Ultimate ($139/mo) 是否值得，或寻找替代数据源

> **Phase 0 是 gate** -- 如果 transcript 数据不可用或质量差，后续方案需要调整。

### Phase 1: 后端 Transcript 接入

5. [ ] `fmp_service.py` 新增 `get_earning_call_transcript(symbol, year, quarter)` 方法
6. [ ] `fmp_service.py` 新增 `get_earnings_transcript_list(symbol)` 方法
7. [ ] `service.py` 新增 `get_transcript(symbol, year, quarter)` 方法（含 DB 缓存）
8. [ ] `service.py` 修改 `get_earnings_data()` -- 新增 `transcript_quarters` 字段
9. [ ] `router.py` 新增 `GET /{symbol}/transcript` 端点
10. [ ] `models.py` 新增 `TranscriptResponse` 模型

### Phase 2: Agent 重写

11. [ ] `agent/earnings.py` -- Transcript 文本预处理函数（去 operator 发言、截取策略）
12. [ ] `agent/earnings.py` -- 更新 `_prepare_earnings_data_for_agent()` 加入 transcript
13. [ ] `agent/earnings.py` -- 重写 Agent 指令（模式 A: transcript 深度解读）
14. [ ] `agent/earnings.py` -- 更新 `EarningsAnalysisOutput` 输出结构（7 段 -> 8 段）
15. [ ] `agent/earnings.py` -- 保持模式 B 兼容（无 transcript 时退回现有逻辑）

### Phase 3: 前端重构

16. [ ] `EarningsTab.tsx` -- 布局重构：AI 分析全宽 + transcript 折叠区 + 三张表底部
17. [ ] `EarningsTab.tsx` -- 新增 transcript 原文展示组件
18. [ ] `EarningsTab.tsx` -- AI 分析区域适配新的 8 段输出结构
19. [ ] `EarningsTab.tsx` -- 季度选择器标记有 transcript 的季度
20. [ ] hooks/queries -- 新增 `useTranscript(symbol, year, quarter)` hook

### Phase 4: 收尾

21. [ ] 端到端测试：有 transcript 的公司（AAPL/NVDA）+ 无 transcript 的公司
22. [ ] 更新 `features/stock/.context.md`
23. [ ] 更新 `features/stock/models.py` 补全类型定义

## 与现有 stock-research-upgrade 计划的关系

`stock-research-upgrade.md` 的 Part A（新增财报 Tab）已经大部分实现。本计划是在已实现基础上的**重大升级** -- 核心变化是数据源优先级和分析方法论的转变。

保留的部分：
- 三张表展示、增长率计算、EPS Surprise、分析师预期、分部营收 -- 这些作为补充数据保留
- 智能模式切换框架（前瞻/回顾/历史）-- 在模式 B 中保留

替代的部分：
- AI 分析的核心输入：从"结构化数字"变为"transcript + 结构化数字验证"
- AI 分析的核心输出：从 7 段数字解读变为 8 段 transcript 深度解读
- 前端布局：从左右分栏变为全宽主次布局

## 待定问题

1. **FMP Plan 限制**: transcript 端点是否在 Premium Plan ($69/mo) 内？这是 Phase 0 的 gate
2. **Token 预算**: Gemini Pro 的 context window 能否容纳 transcript + 结构化数据？需要实测
3. **Transcript 格式**: FMP 返回的是纯文本还是有结构标记（Prepared Remarks vs Q&A）？影响预处理策略
4. **历史覆盖**: transcript 数据追溯到哪一年？小盘股覆盖率如何？
5. **跨季度对比（后续）**: 本次不做，但需要为"管理层 guidance 追踪"预留数据结构
