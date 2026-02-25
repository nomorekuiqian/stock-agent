# 从 Financial Analysis Plugin 中获得的产品优化启发

> 背景：Claude Code 的 financial-analysis plugin 提供了投行级别的 DCF、Comps、LBO、三表联动等建模技能。
> 虽然它面向机构用户（投行/PE），与我们面向散户的定位完全不同，但其分析框架和方法论对优化我们的**个股投研模块**有直接参考价值。

---

## 现状评估

### 我们已有的能力

| 能力 | 数据源 | 状态 |
|------|--------|------|
| TTM 指标（收入/净利/EPS/EBITDA/OCF/FCF） | yfinance | 完善 |
| 估值倍数（P/E, P/B, P/S, EV/EBITDA, PEG） | yfinance | 完善 |
| 前瞻估值（Forward P/E, 隐含 EPS 增速） | yfinance | 完善 |
| 盈利能力（毛利率/营业利润率/净利率/ROE/ROA） | yfinance | 完善 |
| 增长率（YoY 收入/净利, QoQ 收入） | yfinance + OpenBB | 完善 |
| 同行对比（5 家可比公司的 P/E, P/B, P/S, ROE） | FMP | 基础 |
| 行业/板块平均 P/E | FMP | 基础 |
| 5 年历史估值趋势 | FMP | 完善 |
| 最近 4 季度财务报表 | OpenBB | 完善 |
| 技术分析（MA/RSI/MACD/布林带/支撑阻力） | tvscreener + pandas-ta | 完善 |

### 我们缺失的、Plugin 做得好的

| 缺失能力 | Plugin 来源 | 对散户的价值 |
|----------|------------|-------------|
| 内在价值估算（目标价区间） | DCF 技能 | 极高 - "到底值多少钱"是核心需求 |
| 同行估值分位数统计 | Comps 技能 | 高 - "估值在同行中处于什么位置" |
| 场景分析思维（Bear/Base/Bull） | DCF + Comps | 高 - 帮助理解风险收益比 |
| 结构化分析检查清单 | 三表公式库 | 中 - 提升 Agent 输出一致性 |
| 输出验证机制 | DCF validate 脚本 | 中 - 让分析结论更可信 |
| 盈利质量深度检查 | 三表联动公式 | 中 - OCF/NI 比率、应收异常等 |

---

## 优化计划

### Phase 1: 简化版目标价区间（高价值、低成本）

**目标**：让 Agent 输出一个 Bear/Base/Bull 目标价区间，回答用户最核心的问题。

**原理**：不需要建完整 DCF 模型，而是利用已有数据做**倍数法估值 + 增长假设**。

**方法**：

```
1. 同行中位数 P/E × 公司 Forward EPS → 基于同行的隐含价格
2. 5 年历史 P/E 中位数 × Forward EPS → 基于历史的隐含价格
3. PEG = 1 时的隐含 P/E × Forward EPS → 基于增速的合理价格

Bear Case: 取三者中的最低值，再打 10-15% 折扣
Base Case: 三者的中位数
Bull Case: 取三者中的最高值，再加 10-15% 溢价
```

**需要修改的文件**：

- `features/stock/agent.py` — 在 `STOCK_ANALYST_INSTRUCTION` 中新增估值推算指引
- `features/stock/models.py` — 在 `StockAnalysisOutput` 中新增 `valuation_range` 字段

**新增字段设计**：

```python
class ValuationRange(BaseModel):
    bear_price: float        # 悲观目标价
    base_price: float        # 基准目标价
    bull_price: float        # 乐观目标价
    current_price: float     # 当前价格
    methodology: str         # 简述估值逻辑（100-200 字）
    key_assumptions: str     # 关键假设（100-200 字）
```

**Agent Instruction 新增段落**（加入 fundamentals_analysis 部分）：

```
## 估值区间推算

基于以下三种方法，给出 Bear/Base/Bull 目标价：

方法 1 - 同行倍数法：
  同行中位数 P/E x 公司 Forward EPS = 隐含价格 A

方法 2 - 历史回归法：
  公司 5 年 P/E 中位数 x Forward EPS = 隐含价格 B

方法 3 - 增速匹配法：
  PEG=1 隐含的合理 P/E x Forward EPS = 隐含价格 C
  （合理 P/E = 预期 EPS 增速 x 100，例如 20% 增速对应 20x P/E）

Bear: min(A, B, C) x 0.85
Base: median(A, B, C)
Bull: max(A, B, C) x 1.15

如果数据不足以计算（如无同行 P/E 或无 Forward EPS），跳过该方法，并在 methodology 中说明。
至少需要 2 种方法才能给出区间，否则不输出 valuation_range。
```

**数据依赖**（全部已有，无需新增 API 调用）：

- Forward EPS → yfinance (`forward_pe` 反推或直接取)
- 同行 P/E 中位数 → FMP peer_comparison 已有
- 5 年历史 P/E 中位数 → FMP historical_valuation 已有
- EPS 增速 → yfinance growth 已有

---

### Phase 2: 同行估值分位数统计（提升对比深度）

**目标**：告诉用户"你的股票在同行中估值处于什么位置"。

**借鉴来源**：Comps 技能的四分位统计框架。

**方法**：

当前我们只拿 5 家同行的原始数据。改进为：

```
同行数据（已有）:
  AAPL: P/E 28x, P/S 8.5x, EV/EBITDA 22x
  MSFT: P/E 32x, P/S 12x, EV/EBITDA 25x
  GOOGL: P/E 22x, P/S 6x, EV/EBITDA 16x
  META: P/E 25x, P/S 9x, EV/EBITDA 18x
  AMZN: P/E 40x, P/S 3x, EV/EBITDA 20x

新增计算:
  Max / 75th / Median / 25th / Min
  + 目标公司在分布中的百分位排名
```

**需要修改的文件**：

- `features/stock/service.py` — 在 `_get_peer_comparison()` 中新增分位数计算
- `features/stock/agent.py` — Instruction 中引导 Agent 解读分位数含义

**新增计算逻辑**（纯 Python，不需要额外 API）：

```python
import statistics

def calculate_percentile_stats(peers: list[dict]) -> dict:
    """从已有的 peer_comparison 数据计算分位数统计"""
    metrics = ["pe_ratio", "pb_ratio", "ps_ratio", "roe"]
    stats = {}
    for metric in metrics:
        values = sorted([p[metric] for p in peers if p.get(metric)])
        if len(values) >= 3:
            stats[metric] = {
                "max": values[-1],
                "p75": values[int(len(values) * 0.75)],
                "median": statistics.median(values),
                "p25": values[int(len(values) * 0.25)],
                "min": values[0],
            }
    return stats
```

**Agent Instruction 新增段落**（加入 fundamentals_analysis 的估值解读部分）：

```
如果有同行分位数统计数据，请在估值解读中明确指出：
- 目标公司的估值处于同行的哪个分位（如"P/E 处于同行 75 分位以上，属于溢价区间"）
- 溢价/折价是否合理（高增速支撑溢价？还是市场过度乐观？）
```

---

### Phase 3: 结构化分析检查清单（提升一致性）

**目标**：让 Agent 每次输出的分析都覆盖关键维度，避免遗漏。

**借鉴来源**：三表模型的 `references/formulas.md` — 把分析框架变成结构化参考。

**方法**：

将当前较自由的 Instruction 改为**检查清单驱动**的分析框架。

**修改 `STOCK_ANALYST_INSTRUCTION` 的 fundamentals_analysis 部分**：

```
## 基本面分析检查清单

请逐项检查并在分析中覆盖（不需要逐条列出，融入叙述中）：

### 估值健康度
- [ ] 当前 P/E vs 5 年中位数 P/E → 溢价/折价百分比
- [ ] 当前 P/E vs 同行中位数 → 相对位置
- [ ] Forward P/E vs Trailing P/E → 市场对未来的预期方向
- [ ] PEG 是否 < 1（被低估）或 > 2（可能高估）

### 盈利质量
- [ ] OCF / Net Income > 1？（现金流质量好）
- [ ] FCF 是否持续为正？（有真实自由现金流）
- [ ] 毛利率趋势（最近 4 季度是扩张还是收缩）

### 成长性
- [ ] 收入 YoY 增速 vs 同行中位数（跑赢还是落后）
- [ ] 收入增速趋势（加速/减速/稳定）
- [ ] EPS 增速是否匹配收入增速（利润率在扩张还是收缩）

### 财务健康
- [ ] Debt/EBITDA 比率（< 3x 健康，> 5x 警告）
- [ ] 流动比率或速动比率是否充足
- [ ] 有无大额商誉/无形资产（占总资产比例）

如果某项数据不可用，跳过该项，不要编造。
```

**需要修改的文件**：

- `features/stock/agent.py` — 重写 `STOCK_ANALYST_INSTRUCTION` 的分析指引部分

**注意**：不改变输出结构（仍然是 7 段），只改变 Instruction 中的引导方式，从"自由发挥"变为"清单驱动"。

---

### Phase 4: 输出验证机制（提升可信度）

**目标**：在 Agent 生成分析后，自动检查逻辑一致性。

**借鉴来源**：DCF 技能的 `validate_dcf.py` 验证脚本。

**方法**：

在 Pydantic 模型层加入 `model_validator`，检查 Agent 输出与原始数据的一致性。

**需要修改的文件**：

- `features/stock/models.py` — 新增验证逻辑
- `features/stock/agent.py` — 在 Agent 调用后增加校验步骤

**验证规则设计**：

```python
# 在 Agent 输出后，用原始数据做 sanity check
def validate_analysis_consistency(analysis: StockAnalysisOutput, raw_data: dict) -> list[str]:
    warnings = []

    # 如果有 valuation_range
    if analysis.valuation_range:
        vr = analysis.valuation_range
        # Bear < Base < Bull
        if not (vr.bear_price < vr.base_price < vr.bull_price):
            warnings.append("目标价排序异常: Bear >= Base 或 Base >= Bull")

        # 目标价不应偏离当前价超过 100%
        current = vr.current_price
        if vr.bull_price > current * 3 or vr.bear_price < current * 0.2:
            warnings.append("目标价偏离当前价过大，可能不合理")

    return warnings
```

**处理方式**：验证警告不阻断输出，而是作为 metadata 返回给前端，前端可选择性展示（如"AI 分析仅供参考"提示）。

---

## 优先级与依赖

```
Phase 1 (目标价区间)
  ├── 不依赖任何新数据源
  ├── 改动范围: agent.py + models.py
  ├── 预期效果: 用户价值感最强
  └── 建议优先级: P0

Phase 2 (分位数统计)
  ├── 不依赖新数据源（基于已有 peer 数据计算）
  ├── 改动范围: service.py + agent.py
  ├── 预期效果: 估值对比更直观
  └── 建议优先级: P1

Phase 3 (分析检查清单)
  ├── 纯 Instruction 改动
  ├── 改动范围: agent.py
  ├── 预期效果: 输出质量更稳定
  └── 建议优先级: P1

Phase 4 (输出验证)
  ├── 依赖 Phase 1 的 valuation_range 字段
  ├── 改动范围: models.py + agent.py
  ├── 预期效果: 减少 AI 幻觉/矛盾
  └── 建议优先级: P2
```

---

## 不做的事情

以下是 Plugin 有但我们**不应该做**的：

| Plugin 能力 | 不做的原因 |
|------------|-----------|
| 生成 Excel 文件 | 散户不看 Excel，我们的载体是 Web 报告 |
| 完整 DCF 建模 | 需要太多假设输入，散户无法提供 |
| LBO 模型 | 完全不是我们的用户场景 |
| 三表联动 | 过于专业，散户不需要 |
| 要求用户提供模板 | 我们的产品是全自动的，不应该要求用户输入 |

**核心原则**：借鉴 Plugin 的**分析思维**，而非**建模工具**。我们的用户需要的是结论和判断，不是 Excel 公式。
