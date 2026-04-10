# Portfolio Health Check (MS2) Engineering Plan

> Status: Planning
> Related: features/brew/.context.md, features/macro/risk/.context.md
> Vision: 产品策略.md > 模块 2: 持仓体检
> CEO Plan: ~/.gstack/projects/nomorekuiqian-stock-agent/ceo-plans/2026-04-09-portfolio-health-check.md

## 目标

让用户在 /for-you 页面通过一个新 tab "持仓体检"，获得一份组合级别的健康诊断：数据卡片提供证据（健康分、板块分布、表现归因、宏观敏感度），AI 叙事报告给出判断。每周自动生成 + 按需手动触发。同时将体检 insights 回流到 daily brew，实现"连线层"。

## 现状

**已有能力（直接复用）**：
- `shared/data_tools/market_data.py` — `get_stock_quotes(symbols)` 获取价格/涨跌, `get_all_market_data()` 获取 SPY/QQQ 等基准
- `features/macro/risk/service.py` — `get_macro_risk_dashboard()` 返回 `MacroRiskDashboard`，其中 `categories: list[CategoryRiskScore]`（每个 category 有 `category_name` 和 `risk_score` 0-10）
- `shared/openbb_service.py` — `get_company_profile(symbol)` 获取 sector/industry（单个 symbol，需批量包装）
- `shared/yfinance_service.py` — `get_stock_quotes()` 获取报价, yfinance `download()` 获取历史数据
- `features/brew/` — digest agent 的 prompt 风格、数据卡片 UI 模式、weekly cron 模式

**完全缺失**：
- `get_historical_returns(symbols, period)` 历史收益率包装函数（需新建）
- `get_company_profiles_batch(symbols)` 批量获取 sector/industry（需新建，用 asyncio.gather 调单个）
- 组合级别分析（板块分布、集中度、归因）
- Portfolio Health Score 计算
- 宏观 → 持仓翻译逻辑
- 体检 insights → brew 注入机制

## 设计

### 系统架构

```
/for-you 页面
  ├── Tab: 持仓日报 (现有 brew)
  └── Tab: 持仓体检 (新建)
         │
         ▼
  POST /api/portfolio/health ──── verify_user_token
         │
         ├── get_user_watchlist(user_id) → symbols[]
         │
         ├── [并行获取数据]
         │   ├── get_stock_quotes(symbols) → 价格/涨跌/市值
         │   ├── get_company_profiles(symbols) → sector/industry (批量)
         │   ├── get_historical_returns(symbols + SPY + QQQ, 1w) → 周收益率
         │   └── get_macro_risk_dashboard() → 4 维度风险评分
         │
         ├── [组合分析 — service.py 纯 Python]
         │   ├── classify_sectors(profiles) → 板块分布
         │   ├── calc_concentration(sectors) → HHI + top_sector_pct
         │   ├── calc_attribution(returns, benchmark) → hero/detractor + vs SPY/QQQ
         │   ├── calc_macro_sensitivity(macro_risk, sectors) → 宏观敏感度
         │   └── calc_health_score(concentration, attribution, macro, stability) → 0-100
         │
         ├── [AI 诊断 — agent.py Gemini Pro]
         │   └── 注入: 全部组合分析结果 + 宏观数据
         │        输出: 叙事报告 markdown
         │
         ├── save_health_report(user_id, report) → DB
         │
         └── save_portfolio_insights(user_id, insights) → DB
              (供 brew agent 读取)
```

### Health Score 计算 (0-100)

4 个维度各 25 分，加总：

```python
health_score = (
    diversification_score +    # 0-25: 板块分散度
    performance_score +        # 0-25: 近期表现
    macro_alignment_score +    # 0-25: 宏观环境适配度
    stability_score            # 0-25: 组合稳定性
)
```

**分散度评分 (0-25)**:
- 板块数量: 1个=5, 2个=10, 3个=15, 4个=20, 5+=25
- 调整因子: 最大板块占比 >80%=x0.3, >60%=x0.6, >40%=x0.8, <=40%=x1.0
- `score = clamp(base_score * adjustment, 0, 25)`

**表现评分 (0-25)**:
- 周收益率 vs SPY: 超额 >2%=25, >0%=20, >-1%=15, >-3%=10, else=5
- 等权组合收益: `portfolio_return = sum(stock_returns) / n_stocks`
- 英雄/拖油瓶: 贡献度 = `stock_return / n_stocks / portfolio_return * 100%`

**宏观适配度评分 (0-25)**:
- 综合宏观风险 = `mean(category.risk_score for category in dashboard.categories)` (0-10)
- 敏感度因子 (0.5-2.5): `1.0 + (tech_pct > 50 ? 0.5 : 0) + (avg_pe > 30 ? 0.5 : 0) + (growth_pct > 70 ? 0.5 : 0)`
- `score = clamp(25 - (macro_risk * sensitivity_factor), 0, 25)`
- 示例: 科技集中组合 (sensitivity=2.0) + 高风险环境 (risk=8) → 25-(8*2.0)=9 分

**稳定性评分 (0-25)**:
- 组合日收益率 = `sum(各股日收益率) / n_stocks` (等权)
- 组合周波动率 = `std(组合日收益率, 过去5个交易日)`
- SPY 周波动率 = `std(SPY日收益率, 过去5个交易日)`
- 比值: `vol_ratio = portfolio_vol / spy_vol`
- `vol_ratio < 0.8 → 25, < 1.0 → 20, < 1.2 → 15, < 1.5 → 10, else → 5`

### 宏观敏感度翻译

将 macro_risk 4 维度评分 + 组合特征，翻译为"人话"：

```python
# 输入 — MacroRiskDashboard.categories 实际结构
# dashboard = await get_macro_risk_dashboard()
# categories = dashboard["categories"]  # list of CategoryRiskScore
# 每个 category: { "category_name": str, "risk_score": float (0-10), "indicators": [...] }
macro_scores = {
    cat["category_name"]: cat["risk_score"]
    for cat in dashboard["categories"]
}
# -> {"Economic Deterioration": 3.2, "Credit / Default Risk": 4.5,
#     "Employment": 2.1, "AI Company Health": 7.8}

portfolio_traits = {
    "avg_pe": 45,
    "tech_pct": 78,   # 科技板块占比 %
    "growth_pct": 85,  # 成长股占比 %
}

# 输出 (传给 AI agent 用，也作为数据卡片文案)
sensitivity_insights = [
    {
        "dimension": "利率环境",
        "impact": "negative",  # positive/neutral/negative
        "summary": "组合平均 PE 45 倍，对利率变动高度敏感。若加息预期升温，高估值标的承压最大。"
    },
    {
        "dimension": "流动性",
        "impact": "positive",
        "summary": "当前流动性环境宽松（风险分 3.2/10），对你的成长型组合有利。"
    },
    ...
]
```

### Insights 回流 Brew

体检生成后，将关键 insights 保存到 DB：

```python
# portfolio_insights 表 (新建 Edge Function)
{
    "user_id": "xxx",
    "date": "2026-04-07",
    "health_score": 62,
    "top_risk": "科技板块集中度 78%",
    "macro_sensitivity": "利率敏感 (高PE组合)",
    "sector_dna": "进攻型科技组合",
}
```

Brew agent 在生成时读取最新 insights，注入 instruction：

```python
# brew/agent.py 修改
portfolio_context = await get_latest_portfolio_insights(user_id)
if portfolio_context:
    DIGEST_INSTRUCTION += f"""
## 用户持仓体检信息 (最近一次)
- 组合健康分: {portfolio_context['health_score']}/100
- 主要风险: {portfolio_context['top_risk']}
- 宏观敏感度: {portfolio_context['macro_sensitivity']}
- 组合风格: {portfolio_context['sector_dna']}

基于以上信息，在分析新闻和个股时，特别关注与用户组合风险相关的内容。
例如，如果用户科技集中度高，芯片相关新闻要重点分析其组合影响。
"""
```

### 容错与降级策略

并行获取 4 个数据源，任何一个可能失败。策略：

| 数据源 | 失败时降级 | 对评分影响 |
|--------|-----------|-----------|
| `get_stock_quotes` | **致命** — 无报价无法分析，返回 502 | 全部不可用 |
| `get_company_profiles_batch` | 失败的 symbol 分类为 "Unknown" 板块 | 分散度评分偏低 |
| `get_historical_returns` | 跳过表现和稳定性评分，这两维度给默认中位分 (12.5) | 表现+稳定性用默认值 |
| `get_macro_risk_dashboard` | 跳过宏观适配度，该维度给默认中位分 (12.5) | 宏观维度用默认值 |

AI 诊断中明确说明缺失的数据："由于宏观数据暂时不可用，本次诊断未包含宏观敏感度分析。"

### 速率限制与缓存

- `POST /api/portfolio/health`: **3 次/分钟** (生成昂贵: 多个并行 API + LLM)
- `GET /api/portfolio/health/latest`: **10 次/分钟** (纯 DB 读取)

**缓存策略** (复用 brew 的 symbols 变化检测逻辑):
- 缓存键: `user_id + report_date (YYYY-MM-DD)`
- 缓存命中: 当日已有报告 && `symbols_used` 与当前 watchlist 一致 → 返回缓存
- 强制刷新: watchlist 变了 → 重新生成 (即使当日已有旧报告)

### 延迟预算

目标: 生成端点 **< 15 秒**。对 25 只股票的最坏情况:

| 步骤 | 预估延迟 | 并行 |
|------|---------|------|
| get_stock_quotes (25 symbols, FMP batch) | ~1s | Y |
| get_company_profiles_batch (25x OpenBB) | ~5s | Y (asyncio.gather) |
| get_historical_returns (yfinance batch) | ~2s | Y |
| get_macro_risk_dashboard (缓存命中) | ~0.1s | Y |
| 组合分析 (纯 Python) | ~0.05s | - |
| AI 诊断 (Gemini) | ~5-8s | - |
| **总计** | **~10-15s** | |

优化: sector 分类缓存（sector 很少变，可以缓存 24h）。前端显示 skeleton + 进度提示。

### API 设计

```
POST /api/portfolio/health          # 生成/获取体检报告
  Request: {} (无需参数，从 token 获取 user_id，从 DB 获取 watchlist)
  Response: PortfolioHealthResponse

GET /api/portfolio/health/latest     # 获取最近一次报告 (用于 tab 加载)
  Response: PortfolioHealthResponse | null

GET /api/portfolio/health/history    # 历史报告列表
  Query: limit=10, offset=0
  Response: { reports: [...], total: int }

POST /api/portfolio/health/generate-all  # Cron: 批量生成
  Auth: verify_cron_secret
```

**Response 结构**:

```json
{
  "success": true,
  "report_id": "uuid",
  "generated_at": "ISO-8601",
  "symbols_used": ["NVDA", "AAPL", "MSFT"],

  "health_score": {
    "total": 62,
    "diversification": 12,
    "performance": 20,
    "macro_alignment": 18,
    "stability": 12,
    "label": "需要关注"
  },

  "sector_breakdown": [
    { "sector": "Technology", "sector_cn": "科技", "count": 4, "pct": 78 },
    { "sector": "Consumer", "sector_cn": "消费", "count": 1, "pct": 22 }
  ],
  "concentration": {
    "hhi": 0.65,
    "top_sector_pct": 78,
    "risk_level": "high",
    "summary": "科技板块占比 78%，集中度风险较高"
  },

  "performance": {
    "portfolio_return_1w": 3.2,
    "spy_return_1w": 1.4,
    "qqq_return_1w": 2.8,
    "excess_return": 1.8,
    "hero": { "symbol": "NVDA", "return_1w": 8.1, "contribution": "贡献了组合 60% 的涨幅" },
    "detractor": { "symbol": "BABA", "return_1w": -3.2, "contribution": "拖累了组合 0.8%" }
  },

  "macro_sensitivity": [
    { "dimension": "利率环境", "impact": "negative", "score": 7, "summary": "..." },
    { "dimension": "流动性", "impact": "positive", "score": 3, "summary": "..." },
    { "dimension": "经济周期", "impact": "neutral", "score": 5, "summary": "..." },
    { "dimension": "市场情绪", "impact": "positive", "score": 4, "summary": "..." }
  ],

  "ai_diagnosis": {
    "content": "## 组合诊断\n\n你的组合本周表现不错...(markdown)",
    "sector_dna": "进攻型科技组合",
    "one_line": "科技集中+高PE，当前宏观有利但要留意利率风险"
  },

  "from_cache": false
}
```

### 前端设计

```
/for-you
  ├── [Tab: 持仓日报]  ← 现有
  └── [Tab: 持仓体检]  ← 新建
        │
        ├── HealthScoreCard (hero)
        │   ├── 大号数字: 62/100
        │   ├── 标签: "需要关注" (颜色: 红/黄/绿)
        │   └── 4 维度小进度条
        │
        ├── SectorBreakdownCard
        │   ├── 横向条形图 (CSS, 不用图表库)
        │   └── 集中度警告 (如有)
        │
        ├── PerformanceCard
        │   ├── "本周 +3.2% vs 标普 +1.4%"
        │   ├── 英雄: NVDA +8.1%
        │   └── 拖油瓶: BABA -3.2%
        │
        ├── MacroSensitivityCard
        │   ├── 4 维度影响标签 (正面/中性/负面)
        │   └── 每个维度一句话翻译
        │
        └── AIDiagnosisSection
            └── markdown 渲染 (复用 brew 的渲染组件)
```

**交互状态**:

| 状态 | 显示 |
|------|------|
| 首次/无报告 | "生成你的第一份持仓体检" CTA 按钮 |
| 生成中 | skeleton + "正在分析你的组合..." |
| 报告就绪 | 完整的数据卡片 + AI 诊断 |
| 加载历史中 | skeleton |
| 错误 | 通用错误提示 + 重试按钮 |

### Weekly Cron (邮件推送)

复用 daily_report 广播模式：
1. GitHub Actions cron 每周一 07:00 UTC 调 `POST /api/portfolio/health/generate-all`
2. 遍历有 watchlist 的付费用户
3. 对每个用户生成体检报告
4. 发送邮件（Resend batch send，非 broadcast，因为每人内容不同）
5. 邮件模板: 健康分 + one_line 摘要 + "查看完整报告" CTA

### 后端文件结构

```
backend/app/features/portfolio_health/
├── __init__.py
├── router.py          # 4 个端点 + 认证
├── agent.py           # PortfolioHealthAgent (Gemini Flash-Lite)
├── service.py         # 组合分析逻辑 (板块/集中度/归因/评分/敏感度)
├── models.py          # Pydantic: HealthScore, SectorBreakdown, PortfolioHealthResponse
├── db.py              # Edge Function 操作 (portfolio_health_reports + portfolio_insights 表)
└── .context.md
```

### 数据库表 (Edge Function)

**portfolio_health_reports**:
```sql
CREATE TABLE portfolio_health_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  report_date DATE NOT NULL,
  symbols TEXT[] NOT NULL,
  health_score INTEGER NOT NULL,
  report_data JSONB NOT NULL,  -- 完整 response 结构
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, report_date)
);
```

**portfolio_insights** (供 brew 读取):
```sql
CREATE TABLE portfolio_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  date DATE NOT NULL,
  health_score INTEGER,
  top_risk TEXT,
  macro_sensitivity TEXT,
  sector_dna TEXT,
  insights_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);
```

### 关键架构决策

**1. Health Score 是确定性计算，不是 AI 生成**

Health Score 由 service.py 的 Python 逻辑计算，不依赖 LLM。这确保：
- 相同输入 = 相同分数（可重复性）
- 计算速度快（<100ms）
- 可以独立于 AI 诊断使用（比如 brew 注入只需分数，不需要跑 agent）

AI agent 只负责叙事报告（解释 why），不负责评分（what）。

**2. 等权重而非市值加权**

用户只提供 symbols，不提供仓位大小。所有分析假设等权重。这意味着：
- 板块分布按股票数量而非金额
- 表现归因是等权组合 return
- 集中度看板块股票数量比例

这在 V1 是合理的简化。V2 可以加仓位输入。

**3. 复用 brew 的 cron + 邮件模式**

Weekly cron 模式和 `broadcast_personal_digests` 架构一致：
- GitHub Actions 触发
- `verify_cron_secret` 认证
- 逐用户生成 + `resend.Batch.send()`
- 非 broadcast（每人内容不同）

**4. Sector 数据来源: OpenBB `get_company_profile` + 24h 缓存**

`shared/openbb_service.py` 的 `get_company_profile(symbol)` 返回 `sector` 和 `industry`。单 symbol 调用，需要 `asyncio.gather` 批量化。因为 sector 很少变化，加 24h 内存缓存 (`_sector_cache: dict[str, tuple[str, float]]`)，大幅减少重复调用。

**5. AI Agent 模型: gemini-3.1-flash-lite-preview (与 brew 一致)**

体检报告的 AI 诊断和 brew 的 digest 复杂度类似（接收结构化数据 → 输出叙事 markdown），不需要 Pro 模型。如果 flash-lite 的输出质量不够，再升级到 Pro。

## 实施步骤

### Phase 1: 后端核心 (数据分析 + API)

1. [ ] **数据工具扩展** — 在 `shared/data_tools/market_data.py` 新增 `get_historical_returns(symbols, period="5d")` (yfinance.download 包装); 在 `shared/openbb_service.py` 新增 `get_company_profiles_batch(symbols)` (asyncio.gather + 24h sector 缓存)
2. [ ] **创建 feature 模块骨架** — `portfolio_health/` 目录 + `__init__.py` + `models.py` (Pydantic 模型)
3. [ ] **service.py — 组合分析逻辑** — `classify_sectors()`, `calc_concentration()`, `calc_attribution()`, `calc_macro_sensitivity()`, `calc_health_score()`，含 clamp 边界保护和降级逻辑
4. [ ] **Edge Function + db.py** — `portfolio_health_reports` 和 `portfolio_insights` 表的 CRUD
5. [ ] **agent.py — AI 诊断** — Gemini Flash-Lite agent，注入组合分析结果 + 宏观数据，输出 markdown 叙事报告；数据缺失时在诊断中说明
6. [ ] **router.py — API 端点** — 4 个端点 + 认证 + 速率限制 (3/min) + 缓存 (同日+相同 symbols 不重复生成，watchlist 变化时刷新)
7. [ ] **注册 router** — `main.py` 添加 portfolio_health router

### Phase 2: 前端 UI

8. [ ] **Tab 切换** — /for-you 页面添加 "持仓日报 | 持仓体检" tab
9. [ ] **数据卡片组件** — HealthScoreCard, SectorBreakdownCard, PerformanceCard, MacroSensitivityCard
10. [ ] **AI 诊断渲染** — 复用 brew 的 markdown 渲染组件
11. [ ] **API 集成** — `api.ts` 添加 portfolio health 方法，/for-you 页面接入
12. [ ] **交互状态** — loading/empty/error/success 状态完整覆盖 + 生成进度提示 (skeleton + "正在分析...")

### Phase 3: Brew 联动 + Cron

13. [ ] **Brew agent 注入** — `brew/agent.py` 读取 `portfolio_insights`，注入 instruction 的"连线层"
14. [ ] **Weekly cron 端点** — `POST /api/portfolio/health/generate-all` + GitHub Actions workflow (周一 07:00 UTC)
15. [ ] **邮件模板** — 健康分摘要 + CTA 链接，复用 email_templates.py 模式
16. [ ] **Resend batch send** — 逐用户发送周度体检邮件 (含重试机制)

### Phase 4: 质量 + 文档

17. [ ] **后端测试** — service.py 单元测试 (评分逻辑 + 边界值 + 降级场景) + router E2E 测试
18. [ ] **前端测试** — 数据卡片组件测试 + /for-you tab 切换测试
19. [ ] **创建 .context.md** — portfolio_health feature 文档
20. [ ] **更新 CLAUDE.md** — 添加 portfolio_health 到模块文档列表
21. [ ] **更新 roadmap.md** — MS2 状态从"完全缺失"改为"V1 已上线"

## 待定问题

1. **Health Score 阈值怎么定？** 初版: 0-40 "需要关注"(红), 41-70 "还不错"(黄), 71-100 "很健康"(绿)。上线后根据用户分布调整。
2. **周报发哪天？** 倾向周一早上（美东 7:00），让用户开盘前看到上周总结。需要确认。
3. **sector 分类用哪个标准？** FMP 返回的 GICS sector（11 个大类）还是更细的 industry？V1 用 sector（大类），更直观。
4. **brew 注入频率** — 每次 brew 生成时读取最新 insights。如果用户本周没生成体检，用上周的。超过 2 周无体检则不注入。
5. **等权 vs 加权** — V1 等权。V2 是否要加"输入仓位"功能？

## NOT in scope (V1)

- What-If 模拟（"去掉这只呢"）— 延后 V2
- 可分享报告卡片（图片生成）— 延后 V2
- 历史健康分趋势图 — V2 (需要积累数据)
- 仓位金额输入 — V2
- 相关性矩阵（股票间相关性）— V2
- Telegram 推送 — V2
