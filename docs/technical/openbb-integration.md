# OpenBB Integration Roadmap

> **最后更新**: 2026-02-23
> **状态**: Planning
> **依赖文档**: [MyBrew Direction](../product/mybrew-direction.md) | [Product Roadmap](../product/roadmap.md) | [Stock Research](./stock-research.md)

---

## 概述

OpenBB Platform v4.x 提供 200+ 金融数据端点，覆盖 15 个模块。当前项目仅使用了 8 个基本面端点（全部在个股研究模块中），大量能力未被开发。

本文档规划 OpenBB 的扩展使用策略，将其能力映射到 MyBrew 五大里程碑 (M1-M5) 和个股研究演进路线。

---

## 现状：已使用的 OpenBB 端点

所有调用集中在 `backend/app/shared/openbb_service.py`，仅服务于 `features/stock/` 模块。

| 端点 | 方法 | 用途 |
|------|------|------|
| `obb.equity.profile` | `get_company_profile()` | 公司基本信息（行业、CEO、员工数等） |
| `obb.equity.fundamental.income` | `get_income_statements()` | 利润表（季度，8期） |
| `obb.equity.fundamental.balance` | `get_balance_sheets()` | 资产负债表（季度，8期） |
| `obb.equity.fundamental.cash` | `get_cash_flows()` | 现金流量表（季度，8期） |
| `obb.equity.fundamental.ratios` | `get_key_metrics()` | 财务比率（PE/PB/ROE 等） |
| `obb.equity.price.quote` | `get_realtime_quote()` | 实时报价 |
| `obb.equity.price.historical` | `get_historical_prices()` | 历史价格 |
| `obb.equity.fundamental.metrics` | (通过 FMP 直接调用) | 估值指标 |

**Provider**: 全部使用 FMP (Financial Modeling Prep)

**架构特点**:
- Singleton 模式，async wrapper（OpenBB SDK 本身是同步的）
- 序列化层处理字段名差异（不同 provider 字段名不同）
- 3 层缓存：Memory (30min) → Insforge DB (30天/季度) → API

---

## OpenBB v4.x 完整能力图谱

### 核心模块

| 模块 | 主要端点 | 与产品的关联 |
|------|---------|------------|
| **equity** | profile, fundamental.*, price.*, estimates.*, ownership.*, calendar.*, compare.*, screener | 个股研究 + MyBrew 核心 |
| **economy** | fred_series, calendar, indicators | 宏观分析 + 历史事件库 |
| **fixedincome** | government.yield_curve, rate.effr, treasury_rates | 利率环境 + 流动性分析 |
| **index** | price.historical, sp500_multiples, constituents | 基准对比 + 估值分位 |
| **news** | company, world | 新闻聚合 |
| **derivatives** | options.unusual, options.chains | 期权异动信号 |
| **etf** | search, holdings, info | ETF 分析 |
| **crypto** | price.historical, search | 加密货币（暂不需要） |
| **forex** | price.historical, pairs | 外汇（日元套利监控） |
| **regulators** | sec.filings | SEC 文件 |

---

## 里程碑映射：OpenBB 如何支撑 MyBrew M1-M5

### M1: 历史 Context — 让 Agent 拥有记忆

> 核心需求：结构化历史事件库 + 模式匹配引擎 + 情绪管理语境

| 需求 | OpenBB 端点 | 用法 |
|------|------------|------|
| 历史宏观指标 | `obb.economy.fred_series` | 拉取 VIX、Fed Funds Rate、CPI、失业率等历史序列，作为事件库的量化锚点 |
| 历史收益率曲线 | `obb.fixedincome.government.yield_curve` | 获取 2007/2018/2020/2022 各时期的收益率曲线形态，用于倒挂检测和模式匹配 |
| 历史指数估值 | `obb.index.sp500_multiples` | S&P 500 历史 PE/Shiller PE，判断"当前估值处于历史什么分位" |
| 历史指数价格 | `obb.index.price.historical` | 计算历史事件期间的回撤幅度和恢复天数 |
| 历史个股价格 | `obb.equity.price.historical` (已有) | 计算用户持仓在历史类似事件中的表现 |

**实现思路**:

1. 用 `fred_series` 拉取 2007-2026 的关键指标序列（VIX、EFFR、10Y-2Y 利差、信用利差）
2. 为每个历史事件（2008 金融危机、2020 疫情等）标注触发条件的指标阈值组合
3. 模式匹配引擎：当前指标组合 vs 历史事件触发条件的相似度计算
4. 情绪管理语境：用 `index.price.historical` 计算"历史上类似跌幅的恢复天数"

**示例输出**:
```
当前流动性收紧信号与 2022.08 日元套利平仓前的模式相似度 78%
标普自 2000 年以来经历过 47 次类似跌幅，平均 18 个交易日恢复
```

---

### M2: 个性化 Skills — 让 Agent 理解你

> 核心需求：渐进式用户画像 + Onboarding 模板 + 画像驱动 Agent 行为

| 需求 | OpenBB 端点 | 用法 |
|------|------------|------|
| 模板股票分类 | `obb.equity.profile` (已有) | 按 sector/industry 自动归类，支持"芯片赛道""中概股"等模板 |
| 股票筛选 | `obb.equity.screener` | 按市值/行业/国家筛选，动态生成模板候选池 |
| 同行发现 | `obb.equity.compare.peers` | 用户添加一只股票后，自动推荐同赛道股票扩充模板 |
| 分析师共识 | `obb.equity.estimates.consensus` | 区分用户风格：保守型侧重低估值标的，积极型侧重高增长标的 |

**实现思路**:

1. Onboarding 选择"我在 Google"模板时，用 `screener` 拉取同行业大盘股填充
2. 用户添加 NVDA 后，`compare.peers` 自动建议 AMD/TSM/AVGO
3. L2 问卷中"关注基本面 vs 技术面"影响后续调用的端点：
   - 基本面用户 → 多拉 `fundamental.*`
   - 趋势用户 → 多拉 `price.performance` + 技术指标

---

### M3: 信息→决策升级 — 告诉你该怎么做

> 核心需求：每日策略 + 宏观翻译层 + 持仓归因 + 关注列表机会信号

这是 OpenBB 能发挥**最大价值**的里程碑。

#### 每日策略

| 需求 | OpenBB 端点 | 用法 |
|------|------------|------|
| 分析师目标价 | `obb.equity.estimates.consensus` | "分析师平均目标价 $185，当前 $170，上行空间 8.8%" |
| 前瞻估值 | `obb.equity.estimates.forward_pe` | Forward PE 判断估值是否合理，辅助"是否该买"的决策 |
| 财报日历 | `obb.equity.calendar.earnings` | "下一个关键节点：2/25 NVDA 财报" |
| 经济日历 | `obb.economy.calendar` | "3/7 非农就业数据" |

#### 宏观翻译层

| 需求 | OpenBB 端点 | 用法 |
|------|------------|------|
| 利率数据 | `obb.fixedincome.rate.effr` | "利率不变意味着你的科技股估值压力不会增加" |
| 国债收益率 | `obb.fixedincome.government.treasury_rates` | 实时利率环境翻译为对用户持仓的影响 |

#### 持仓归因分析

| 需求 | OpenBB 端点 | 用法 |
|------|------------|------|
| 多周期表现 | `obb.equity.price.performance` | 1d/5d/1m/3m/YTD 表现，计算各持仓的贡献度 |
| 同行对比 | `obb.equity.compare.peers` | "你的 NVDA -4.5% vs 半导体行业 -2.1%" |

#### 关注列表机会信号

| 需求 | OpenBB 端点 | 用法 |
|------|------------|------|
| 内部人交易 | `obb.equity.ownership.insider_trading` | "CEO 上周增持 $2M，信号积极" |
| 机构持仓变动 | `obb.equity.ownership.institutional` | "Vanguard 本季增持 15%，smart money 看好" |
| 股息数据 | `obb.equity.fundamental.dividends` | 收入型用户关注股息收益率和增长 |

**示例输出**:
```
-- 今日策略 --

整体判断：维持现有仓位，无需操作
信心度：高 (宏观环境稳定、持仓无异常)

持仓归因：
- 组合今日 -1.2% (vs SPY -0.8%)
- 主要拖累：NVDA -4.5% (贡献 -0.9%)，受芯片出口限制消息影响
- 亮点：AAPL +1.2%，分析师上调目标价至 $245

需要关注：
- NVDA 周五财报，分析师预期 EPS $0.89 (vs 上季 $0.82)
- AMD 回调至 $145，接近关注价位区间 ($140-150)

下一个关键节点：
- 2/25 NVDA 财报
- 3/7 非农就业数据
```

---

### M4: 预警系统 — 让 Agent 主动保护你

> 核心需求：阈值触发 + 有 context 的预警 + 实时推送

| 触发条件 | OpenBB 端点 | 监控逻辑 |
|---------|------------|---------|
| VIX > 30 | `obb.economy.fred_series("VIXCLS")` | 每 30 分钟轮询 |
| 持仓个股日跌 >5% | `obb.equity.price.quote` (已有) | 盘中每 5 分钟检查 |
| SOFR 异常波动 | `obb.fixedincome.rate.effr` | 每 30 分钟轮询 |
| 财报 T-1 提醒 | `obb.equity.calendar.earnings` | 每日上午检查 |
| 异常期权活动 | `obb.derivatives.options.unusual` | 盘中监控，"聪明钱"预警 |
| 分析师评级变动 | `obb.equity.estimates.consensus` | 每日比对评级变化 |
| 内部人大额交易 | `obb.equity.ownership.insider_trading` | 每日检查 CXO 级别增减持 |

**独特价值**: `options.unusual` 是 OpenBB 提供的高价值信号——大量看跌期权活动往往先于股价反映风险，可作为早期预警。

**预警内容生成时注入 M1 的历史 context**:
```
[MyBrew 预警] VIX 突破 30

当前 VIX: 32.4 (+28% 日内)
历史参考: VIX > 30 后，标普平均 22 个交易日恢复
对你的持仓影响: 科技股对 VIX 飙升最敏感
建议: 暂不恐慌性卖出
```

---

### M5: 反馈闭环 — 让 Agent 越来越聪明

> 核心需求：建议追踪 + 准确率评分 + Agent 自我调优

| 需求 | OpenBB 端点 | 用法 |
|------|------------|------|
| 追踪建议后果 | `obb.equity.price.historical` (已有) | 拉取 T+7/T+30 的实际价格，计算建议准确性 |
| 预估 vs 实际 | `obb.equity.estimates.historical` | 对比历史分析师预估 vs 实际财报，校准 Agent 对预估数据的依赖权重 |
| 指数基准对比 | `obb.index.price.historical` | 用户组合 vs SPY/QQQ 基准，评估建议的超额收益 |
| 宏观回测 | `obb.economy.fred_series` | 回看 Agent 发出宏观预警时的指标值，评估预警信号的有效性 |

**实现思路**:

1. 定时任务：每天回填 `advice_tracking` 表的 `outcome_7d`、`outcome_30d`
2. 用 `estimates.historical` 的预估准确率作为 Agent "信任分析师共识"的权重校准依据
3. 如果某类宏观指标组合的预警准确率 <50%，自动降低该信号权重

---

## 个股研究模块扩展（Stock Research Roadmap Phase 1）

除 MyBrew 外，OpenBB 也支撑个股研究模块的数据维度扩展：

| 扩展方向 | OpenBB 端点 | 说明 |
|---------|------------|------|
| 技术分析数据 | `obb.equity.price.historical` (已有) + pandas-ta | 价格数据已有，用 pandas-ta 计算 SMA/EMA/RSI/MACD/Bollinger |
| 个股新闻 | `obb.news.company` | 近 7 天个股相关新闻 |
| 内部人交易 | `obb.equity.ownership.insider_trading` | 内部人买卖信号 |
| 机构持仓 | `obb.equity.ownership.institutional` | 机构增减持趋势 |
| 分析师预估 | `obb.equity.estimates.consensus` | 共识目标价和评级 |
| ETF 持仓暴露 | `obb.etf.holdings` | 某只股票被哪些 ETF 持有 |
| SEC 文件 | `obb.regulators.sec.filings` | 10-K/10-Q/8-K 文件链接 |

---

## 新增端点优先级

按里程碑执行顺序 (M2 → M3 → M1 → M4 → M5) 排列：

### P0 — 立即需要（M2/M3 核心依赖）

| 端点 | 服务的里程碑 | 复用价值 |
|------|------------|---------|
| `equity.estimates.consensus` | M2 + M3 + M4 | 目标价、评级、前瞻估值，贯穿所有决策功能 |
| `equity.price.performance` | M3 + M4 | 归因分析、异动检测、多周期对比 |
| `equity.calendar.earnings` | M3 + M4 | 财报提醒、关键节点日历 |

### P1 — 近期需要（M1/M4 核心依赖）

| 端点 | 服务的里程碑 | 复用价值 |
|------|------------|---------|
| `economy.fred_series` | M1 + M4 | 历史宏观指标、VIX/SOFR 监控 |
| `equity.ownership.insider_trading` | M3 + M4 | 内部人信号、预警触发 |
| `fixedincome.rate.effr` | M1 + M3 + M4 | 利率环境翻译、阈值监控 |

### P2 — 中期扩展

| 端点 | 服务的里程碑 | 复用价值 |
|------|------------|---------|
| `equity.compare.peers` | M2 + M3 | 模板扩充、同行归因 |
| `equity.screener` | M2 | Onboarding 模板动态生成 |
| `derivatives.options.unusual` | M4 | 聪明钱预警（独特高价值信号） |
| `fixedincome.government.yield_curve` | M1 | 收益率曲线倒挂检测 |

### P3 — 长期完善

| 端点 | 服务的里程碑 | 复用价值 |
|------|------------|---------|
| `equity.estimates.historical` | M5 | 校准预估可信度 |
| `index.sp500_multiples` | M1 | 估值历史分位判断 |
| `equity.ownership.institutional` | M3 | 机构持仓变动信号 |
| `news.company` | Stock Research | 个股新闻聚合 |
| `regulators.sec.filings` | Stock Research | SEC 文件链接 |

---

## 架构考虑

### OpenBBService 扩展方向

当前 `openbb_service.py` 只有 8 个方法。随着端点增加，建议：

1. **按模块拆分**: 当方法数超过 15 个时，拆分为 `openbb_equity.py`、`openbb_economy.py`、`openbb_fixedincome.py`
2. **缓存层统一**: 新增端点复用现有 3 层缓存架构 (Memory → DB → API)
3. **Provider 策略**: 部分端点 FMP 不支持，需回退到 `yfinance` 或 `intrinio` provider
4. **错误处理**: 不同端点的 rate limit 不同，需要按端点类型设置重试策略

### 数据流

```
OpenBB Service (expanded)
        |
        | 结构化数据
        v
Feature Agent (Digest / Stock / Alert)
        |
        | Pydantic schema
        v
Insforge DB (缓存 + 持久化)
```

### 成本控制

- FMP API 免费额度：250 次/天 → 需要合理缓存
- 优先使用有免费额度的 provider
- 监控类端点（M4）频繁调用，必须做好缓存和去重
