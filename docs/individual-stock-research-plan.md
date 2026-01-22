# 个股投研功能 - 实现计划

> 版本: v1.1
> 创建日期: 2025-01-19
> 最后更新: 2025-01-19
> 状态: Planning

## 一、功能概述

为每只股票提供一个独立的详情页面，展示基本面数据、估值分析、财报解读，并集成 AI 分析能力，帮助散户投资者快速了解一只股票。

### 目标用户
- 想要深入了解个股的散户投资者
- 需要快速获取财报和估值信息的用户
- 希望获得 AI 辅助分析的投资者

### 核心价值
- **信息聚合**: 一站式获取公司基本面、估值、财报数据
- **AI 解读**: 用通俗语言解释专业财务数据
- **决策辅助**: 提供横向/纵向对比，帮助判断估值水平

---

## 二、功能模块优先级

| 优先级 | 模块 | 描述 | 状态 |
|-------|------|------|------|
| **P0** | 基本框架 | 每个股票一个详情页面 `/stock/[symbol]` | Not started |
| **P0** | 个股基本面分析 | 业务介绍、收入、收入增长、盈利能力 | Not started |
| **P0** | 估值分析 | 横向比较 (vs 同行) 和纵向比较 (vs 历史) | Not started |
| **P0** | 最新财报分析 | 抓取最新财报，展示三张表 (利润表/资产负债表/现金流) | Not started |
| P1 | 行业分析 | Value Chain, Competitor, Market Sizing | Not started |
| P1 | 分析师观点汇总 | 目标价、评级、近期变化 | Not started |
| P1 | 个股新闻分析 | 相关新闻聚合与 AI 分析 | Not started |
| P2 | 资金流向 | 机构持仓、内部人交易 | Not started |
| P2 | 宏观环境影响 | 宏观因素对个股的影响分析 | Not started |

---

## 三、技术架构

### 3.1 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                           前端                                   │
│                    Next.js + React                               │
│                 /stock/[symbol]/page.tsx                         │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            │ GET /api/stock/{symbol}
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                           后端                                   │
│                    FastAPI + Python                              │
│                                                                  │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐  │
│  │  stock_service   │  │  openbb_service  │  │ stock_agent   │  │
│  │  (数据聚合/缓存)  │  │  (数据获取)       │  │ (AI 分析)     │  │
│  └────────┬─────────┘  └────────┬─────────┘  └───────┬───────┘  │
│           │                     │                    │          │
└───────────┼─────────────────────┼────────────────────┼──────────┘
            │                     │                    │
            ▼                     ▼                    ▼
┌───────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│     Insforge      │  │  OpenBB / FMP    │  │     Gemini       │
│   (数据库缓存)     │  │   (数据源)        │  │   (AI 分析)      │
└───────────────────┘  └──────────────────┘  └──────────────────┘
```

### 3.2 数据流

```
用户访问 /stock/NVDA
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│                         后端处理                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  并行执行:                                                       │
│                                                                 │
│  ┌─────────────────────────┐  ┌─────────────────────────┐      │
│  │    从数据库读取 (缓存)    │  │    实时 API 调用         │      │
│  │                         │  │                         │      │
│  │  1. stock_profiles      │  │  1. quote (股价、市值)   │      │
│  │     - 公司基本信息       │  │     - 实时获取，不缓存    │      │
│  │     - TTL: 30 天        │  │                         │      │
│  │                         │  │                         │      │
│  │  2. stock_financials    │  │                         │      │
│  │     - 财报数据 (三张表)  │  │                         │      │
│  │     - TTL: 季度更新      │  │                         │      │
│  │                         │  │                         │      │
│  │  3. stock_analyses      │  │                         │      │
│  │     - AI 分析缓存        │  │                         │      │
│  │     - TTL: 24 小时       │  │                         │      │
│  └────────────┬────────────┘  └────────────┬────────────┘      │
│               │                            │                    │
│               └─────────────┬──────────────┘                    │
│                             ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    实时计算                              │   │
│  │                                                         │   │
│  │  PE = 当前股价 / EPS (from financials)                  │   │
│  │  PB = 当前股价 / Book Value Per Share                   │   │
│  │  PS = 当前市值 / Revenue TTM                            │   │
│  │  TTM 指标 = 汇总近 4 季度财报                            │   │
│  └─────────────────────────────────────────────────────────┘   │
│                             │                                   │
│                             ▼                                   │
│                      聚合返回给前端                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.3 缓存策略

| 数据类型 | 存储位置 | TTL | 说明 |
|---------|---------|-----|------|
| 公司信息 (profile) | Insforge | 30 天 | 变化很少 |
| 财报数据 (financials) | Insforge | 季度更新 | 财报发布后刷新 |
| AI 分析 (analyses) | Insforge | 24 小时 | 数据变化时刷新 |
| 股价、市值 | **不缓存** | - | 实时 API 调用 |
| 估值指标 (PE/PB/PS) | **不缓存** | - | 实时计算 |

### 3.4 API Rate Limit 分析

**FMP API 套餐**:
| 套餐 | 费用 | Rate Limit | 日限额 |
|-----|------|-----------|-------|
| Starter | $30/月 | 300 calls/min | 10,000/day |

**预估使用量**:
```
假设: 100 日活用户，每人查看 5 只股票

每日 API 调用:
├── 实时股价 (quote): 100 × 5 = 500 次/天
├── 公司信息: ~10 次/天 (有缓存)
└── 财报数据: ~10 次/天 (有缓存)

总计: ~520 次/天 << 10,000 限额 (仅用 5%)
```

**结论**: 实时调用股价 API 完全可行，无需缓存。

---

## 四、数据库设计

### 4.1 设计原则

1. **JSONB 存储**: 使用 JSONB 存储结构化数据，便于扩展
2. **不过度缓存**: 股价等实时数据不存数据库，直接调用 API
3. **保留原始数据**: 存储 API 原始返回，便于回溯和重新解析
4. **分类清晰**: 按数据性质分表，更新逻辑独立

### 4.2 表结构 (共 3 张表)

#### 表 1: `stock_profiles` (公司信息)

```sql
CREATE TABLE stock_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol VARCHAR(10) UNIQUE NOT NULL,

    -- 基本信息 (高频查询，保留为列)
    company_name VARCHAR(255) NOT NULL,
    company_name_zh VARCHAR(255),
    exchange VARCHAR(50),

    -- 分类信息 (JSONB)
    classification JSONB,
    -- {
    --   "sector": "Technology",
    --   "industry": "Semiconductors",
    --   "sub_industry": "AI Chips",
    --   "sic_code": "3674"
    -- }

    -- 业务描述 (JSONB，支持多语言)
    description JSONB,
    -- {
    --   "en": "NVIDIA Corporation designs and manufactures...",
    --   "zh": "英伟达是全球领先的 AI 芯片制造商...",
    --   "summary_zh": "AI 芯片龙头，数据中心业务占比 83%"
    -- }

    -- 公司详情 (JSONB)
    company_details JSONB,
    -- {
    --   "ceo": "Jensen Huang",
    --   "employees": 29600,
    --   "headquarters": "Santa Clara, CA",
    --   "website": "https://nvidia.com",
    --   "ipo_date": "1999-01-22",
    --   "founded": "1993"
    -- }

    -- 元数据
    data_source VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_profiles_symbol ON stock_profiles(symbol);
```

#### 表 2: `stock_financials` (财报数据)

```sql
CREATE TABLE stock_financials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol VARCHAR(10) NOT NULL,

    -- 报告期信息
    fiscal_year INTEGER NOT NULL,
    fiscal_quarter VARCHAR(2),              -- Q1, Q2, Q3, Q4 (年报为 NULL)
    period_type VARCHAR(10) NOT NULL,       -- 'quarterly' | 'annual'
    period_end_date DATE NOT NULL,

    -- ========== 三张财务报表 (JSONB) ==========

    income_statement JSONB,
    -- {
    --   "revenue": 35100000000,
    --   "cost_of_revenue": 8400000000,
    --   "gross_profit": 26700000000,
    --   "operating_expenses": 4300000000,
    --   "research_and_development": 3100000000,
    --   "selling_general_admin": 1200000000,
    --   "operating_income": 22400000000,
    --   "net_income": 19300000000,
    --   "eps_basic": 0.78,
    --   "eps_diluted": 0.77,
    --   "shares_outstanding": 24700000000
    -- }

    balance_sheet JSONB,
    -- {
    --   "total_assets": 96000000000,
    --   "current_assets": {
    --     "cash_and_equivalents": 18300000000,
    --     "accounts_receivable": 17600000000,
    --     "inventory": 8100000000,
    --     "total": 70300000000
    --   },
    --   "total_liabilities": 32000000000,
    --   "long_term_debt": 9700000000,
    --   "total_equity": 64000000000,
    --   "retained_earnings": 45000000000
    -- }

    cash_flow JSONB,
    -- {
    --   "operating_cash_flow": 17600000000,
    --   "capital_expenditure": -1100000000,
    --   "free_cash_flow": 16500000000,
    --   "investing_cash_flow": -8200000000,
    --   "financing_cash_flow": -9800000000,
    --   "dividends_paid": -500000000,
    --   "stock_repurchased": -9000000000
    -- }

    -- ========== 派生指标 (从三张表计算) ==========

    derived_metrics JSONB,
    -- {
    --   "profitability": {
    --     "gross_margin": 0.76,
    --     "operating_margin": 0.64,
    --     "net_margin": 0.55
    --   },
    --   "growth": {
    --     "revenue_yoy": 0.94,
    --     "revenue_qoq": 0.17,
    --     "net_income_yoy": 1.09,
    --     "eps_yoy": 1.03
    --   },
    --   "health": {
    --     "current_ratio": 4.26,
    --     "debt_to_equity": 0.15
    --   }
    -- }

    -- ========== 原始数据备份 ==========
    raw_response JSONB,

    -- ========== 元数据 ==========
    currency VARCHAR(3) DEFAULT 'USD',
    data_source VARCHAR(50),
    filing_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(symbol, fiscal_year, fiscal_quarter, period_type)
);

CREATE INDEX idx_financials_symbol ON stock_financials(symbol);
CREATE INDEX idx_financials_period ON stock_financials(period_end_date DESC);
```

#### 表 3: `stock_analyses` (AI 分析缓存)

```sql
CREATE TABLE stock_analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol VARCHAR(10) NOT NULL,

    -- 分析类型
    analysis_type VARCHAR(50) NOT NULL,
    -- 'business_overview' | 'valuation' | 'earnings' | 'comprehensive'

    -- AI 分析内容
    content TEXT NOT NULL,

    -- 生成时使用的数据快照
    data_snapshot JSONB,

    -- 元数据
    model VARCHAR(50) DEFAULT 'gemini-3-pro-preview',
    generated_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,

    UNIQUE(symbol, analysis_type, DATE(generated_at))
);

CREATE INDEX idx_analyses_symbol_type ON stock_analyses(symbol, analysis_type);
CREATE INDEX idx_analyses_expires ON stock_analyses(expires_at);
```

### 4.3 ER 图

```
┌─────────────────────────────────────────────────────────────────┐
│                        数据库架构                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  stock_profiles (公司信息)                 ← 长期缓存 (30天)     │
│  ├── classification: JSONB    → 行业分类                        │
│  ├── description: JSONB       → 多语言描述                      │
│  └── company_details: JSONB   → 公司详情                        │
│       │                                                         │
│       │ 1:N (按季度)                                            │
│       ▼                                                         │
│  stock_financials (财报数据)               ← 季度更新            │
│  ├── income_statement: JSONB  → 利润表                          │
│  ├── balance_sheet: JSONB     → 资产负债表                      │
│  ├── cash_flow: JSONB         → 现金流量表                      │
│  ├── derived_metrics: JSONB   → 派生指标                        │
│  └── raw_response: JSONB      → 原始数据                        │
│       │                                                         │
│       │ 1:N (按分析类型)                                        │
│       ▼                                                         │
│  stock_analyses (AI 分析)                  ← 24小时缓存          │
│  ├── analysis_type            → 分析类型                        │
│  ├── content                  → 分析内容                        │
│  └── data_snapshot            → 数据快照                        │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  实时数据 (不存数据库)                                           │
│  ├── 股价、涨跌幅、市值        ← 实时 API 调用                   │
│  ├── PE、PB、PS               ← 实时计算                        │
│  └── TTM 指标                 ← 从 financials 汇总              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 五、API 设计

### 5.1 主接口

```
GET /api/stock/{symbol}
```

**响应结构**:
```json
{
    "profile": {
        "symbol": "NVDA",
        "company_name": "NVIDIA Corporation",
        "company_name_zh": "英伟达",
        "exchange": "NASDAQ",
        "classification": {
            "sector": "Technology",
            "industry": "Semiconductors"
        },
        "description": {
            "zh": "英伟达是全球领先的 AI 芯片制造商...",
            "summary_zh": "AI 芯片龙头，数据中心业务占比 83%"
        },
        "company_details": {
            "ceo": "Jensen Huang",
            "employees": 29600
        }
    },

    "quote": {
        "price": 138.50,
        "change": 2.35,
        "change_percent": 0.017,
        "market_cap": 1800000000000,
        "volume": 45000000
    },

    "fundamentals": {
        "ttm": {
            "revenue": 113000000000,
            "net_income": 62000000000,
            "eps": 2.48
        },
        "growth": {
            "revenue_yoy": 1.22,
            "eps_yoy": 1.68
        },
        "profitability": {
            "gross_margin": 0.76,
            "net_margin": 0.55
        },
        "valuation": {
            "pe": 65.2,
            "pb": 45.8,
            "ps": 35.2
        }
    },

    "financials": {
        "latest_quarter": "2024-Q4",
        "quarters": [
            {
                "period": "2024-Q4",
                "income_statement": {...},
                "balance_sheet": {...},
                "cash_flow": {...}
            }
        ]
    },

    "analyses": {
        "business_overview": "英伟达是 AI 算力军火商...",
        "valuation_analysis": "估值处于历史高位...",
        "earnings_analysis": "Q4 财报全面超预期..."
    },

    "meta": {
        "profile_updated_at": "2025-01-01T00:00:00Z",
        "financials_updated_at": "2025-01-15T00:00:00Z",
        "analysis_generated_at": "2025-01-19T08:00:00Z",
        "quote_fetched_at": "2025-01-19T10:30:00Z"
    }
}
```

### 5.2 辅助接口

```
POST /api/stock/{symbol}/chat        # AI 对话
POST /api/stock/{symbol}/refresh     # 强制刷新数据
GET  /api/stock/search?q=nvidia      # 搜索股票
```

---

## 六、页面设计

### 6.1 页面结构

```
/stock/[symbol]
├── Header (股票名称、实时价格、关键指标快览)
├── 业务概览模块
│   └── 公司介绍 + AI 点评
├── 收入与增长模块
│   ├── 收入趋势图 (近8季度)
│   └── 关键增长指标 (YoY/QoQ)
├── 估值分析模块
│   ├── 当前估值 (PE/PB/PS) - 实时计算
│   ├── 纵向比较 (vs 历史) - 需要 P1 实现
│   ├── 横向比较 (vs 同行) - 需要 P1 实现
│   └── AI 估值点评
├── 最新财报模块
│   ├── 三张表切换 (利润表/资产负债表/现金流)
│   ├── 关键数据高亮
│   └── AI 财报点评
└── AI 助手模块
    ├── 预设问题 (快捷入口)
    └── 自由聊天输入框
```

### 6.2 设计原则

- 延续 MarketBrew 现有设计系统 (深色主题 + 翠绿强调色)
- 数据优先，AI 点评作为辅助
- 移动端友好，响应式布局
- 图表使用 Recharts (已在项目中使用)

---

## 七、实现计划

### Phase 1: 基础设施 (Week 1)
- [ ] 在 Insforge 创建 3 张数据库表
- [ ] 安装配置 OpenBB Python SDK
- [ ] 实现 `openbb_service.py` (数据获取)
- [ ] 实现 `stock_service.py` (缓存逻辑 + 数据聚合)
- [ ] 实现基础 API `GET /api/stock/{symbol}`

### Phase 2: 前端页面 (Week 2)
- [ ] 创建 `/stock/[symbol]/page.tsx`
- [ ] 实现 Header 组件 (实时价格)
- [ ] 实现业务概览模块
- [ ] 实现收入增长模块 (含图表)
- [ ] 实现估值显示 (当前值)

### Phase 3: 财报与 AI (Week 3)
- [ ] 实现财报模块 (三张表切换)
- [ ] 实现 `stock_analysis_agent.py` (AI 分析)
- [ ] 集成 AI 分析到各模块
- [ ] 实现 AI 聊天功能

### Phase 4: 优化与测试 (Week 4)
- [ ] 性能优化 (懒加载、错误处理)
- [ ] 移动端适配
- [ ] 股票搜索功能
- [ ] 用户测试与反馈

---

## 八、数据源

### 8.1 OpenBB / FMP API

| 数据 | API 端点 | 存储位置 |
|-----|---------|---------|
| 公司信息 | `obb.equity.profile` | stock_profiles |
| 利润表 | `obb.equity.fundamental.income` | stock_financials |
| 资产负债表 | `obb.equity.fundamental.balance` | stock_financials |
| 现金流 | `obb.equity.fundamental.cash` | stock_financials |
| 实时股价 | `obb.equity.price.quote` | **不存储** (实时) |

### 8.2 成本预估

| 项目 | 预估用量 | 单价 | 月成本 |
|-----|---------|------|-------|
| FMP API (Starter) | ~500 calls/day | $30/月 | $30 |
| Gemini API | ~3,000 分析/月 | ~$0.01/分析 | ~$30 |
| Insforge | 存储 ~500MB | 免费层 | $0 |
| **总计** | | | **~$60/月** |

---

## 九、风险与应对

| 风险 | 影响 | 应对措施 |
|-----|------|---------|
| FMP API 限额 | 数据获取受限 | 已验证日用量 < 10% 限额 |
| OpenBB 兼容性 | SDK 版本问题 | 锁定版本；关注更新日志 |
| AI 分析质量不稳定 | 用户体验差 | 设计 Prompt 模板；人工审核 |
| 财报数据延迟 | 信息不及时 | 监控财报日历；手动触发刷新 |

---

## 十、成功指标

| 指标 | 目标 | 衡量方式 |
|-----|------|---------|
| 页面加载时间 | < 2s (首次), < 500ms (有缓存) | Performance 监控 |
| 数据覆盖率 | S&P 500 全覆盖 | 500 只股票可访问 |
| AI 分析满意度 | > 80% | 用户反馈 (thumbs up/down) |
| 日活用户 | 100+ | 统计 /stock/* 访问量 |

---

## 十一、扩展性考虑

### 未来可能需要的表

| 表名 | 用途 | 何时添加 |
|-----|------|---------|
| `stock_valuation_history` | 存储历史估值，用于分位计算 | P1 估值分析 |
| `stock_peers` | 同行关系配置 | P1 横向对比 |
| `stock_news` | 个股新闻缓存 | P1 新闻分析 |
| `stock_estimates` | 分析师预测 | P1 分析师观点 |

### JSONB 的扩展优势

当前设计使用 JSONB 存储，新增字段无需 `ALTER TABLE`:

```sql
-- 例: 未来想加 ROE 指标
-- 只需在写入时添加到 derived_metrics JSON 中
-- 无需修改表结构

derived_metrics = {
    "profitability": {
        "gross_margin": 0.76,
        "net_margin": 0.55,
        "roe": 0.89  -- 新增字段，直接加入
    }
}
```

---

## 附录

### A. 参考资料
- [OpenBB Platform Documentation](https://docs.openbb.co/platform)
- [FMP API Documentation](https://site.financialmodelingprep.com/developer/docs)
- [MarketBrew 设计系统](./MarketBrew%20品牌叙事指南与战略蓝图.md)

### B. 相关文档
- [产品需求文档](./stock_agent_prd.md)

### C. 更新日志

| 版本 | 日期 | 变更内容 |
|-----|------|---------|
| v1.0 | 2025-01-19 | 初始版本 |
| v1.1 | 2025-01-19 | 简化数据库设计: 移除 stock_snapshots 表，股价实时获取 |
