# 宏观周报产品方案

> 本文档定义"宏观周报"的内容架构、AI 分析策略、网站呈现和邮件分发方案。
> 技术实现细节（FRED series、评分逻辑等）参考 `macro-roadmap.md`。

---

## 一、产品定位

### 与日报的边界

| | 日报 (Daily Report) | 宏观周报 (Weekly Macro) |
|---|---|---|
| 回答的问题 | 今天市场发生了什么？ | 当前宏观环境怎么样？对投资意味着什么？ |
| 视角 | **市场**（价格、事件、新闻） | **宏观**（指标、趋势、政策） |
| 时间尺度 | 日 | 周 / 月 |
| 语气 | 描述性（发生了什么） | 判断性（意味着什么） |
| 数据来源 | yfinance 行情 + FMP 新闻 | FRED 指标 + 经济日历 + yfinance 指数 |
| 更新频率 | 每个交易日 | 每周一期 |

**核心原则：日报讲"果"，周报讲"因"。**

日报告诉你 Nasdaq 今天涨了 2%。周报告诉你为什么最近科技股有支撑——因为净流动性在扩张、通胀在回落、美联储态度偏鸽。

### 不是什么

- 不是日报的周汇总（不重复每天讲过的内容细节）
- 不是纯客观数据报表（需要有观点和判断）
- 不是实时更新的 dashboard（每周生成一次，固定内容）

---

## 二、内容架构 — 三层结构

### 总览

```
┌─────────────────────────────────────────────┐
│                                             │
│  [1] 本周宏观定调              ── 判断层     │
│  [2] 本周市场回顾              ── 判断层     │
│                                             │
│  [3] 流动性环境                ── 分析层     │
│  [4] 经济基本面                ── 分析层     │
│  [5] 通胀与利率                ── 分析层     │
│  [6] 市场情绪                  ── 分析层     │
│                                             │
│  [7] 对股市的启示              ── 行动层     │
│  [8] 下周关注                  ── 行动层     │
│                                             │
└─────────────────────────────────────────────┘
```

---

### 判断层：这周发生了什么

#### [1] 本周宏观定调（Executive Summary）

**内容**: 2-3 段话，跨四大板块的综合判断。

**要求**:
- 必须给出明确的环境定性（利好风险资产 / 中性 / 利空风险资产）
- 必须关联到股市，不能纯讲经济学
- 附带四个维度的信号灯（绿 / 黄 / 红）

**示例**:

> 本周宏观环境对风险资产**偏利好**。流动性环境维持宽松（净流动性 6.1T，环比 +2.3%），为科技股估值提供支撑。经济基本面依然健康，GDP 增长 2.8% 且非农就业超预期，但 CPI 环比 +0.4% 略高于预期，可能限制美联储降息空间。市场情绪方面，VIX 维持在 16 附近，Put/Call Ratio 0.85，整体偏乐观但未到极端贪婪。
>
> 综合来看，当前环境更有利于**成长股而非价值股**，但通胀的不确定性意味着需要对利率敏感的板块（如地产、公用事业）保持谨慎。

**信号灯**:

```
流动性 [绿]  经济基本面 [绿]  通胀与利率 [黄]  市场情绪 [绿]
```

#### [2] 本周市场回顾（Market Recap）

**定位**: 高层面的市场表现概览，不深入每日细节。

**与日报的区别**:
- 日报："今天 S&P 500 涨 1.2%，因为 NVDA 财报超预期"（具体事件驱动）
- 周报："本周美股整体上行，成长股领涨，资金从防御板块流向科技"（趋势和风格总结）

**内容要素**:
- 主要指数周度表现（S&P 500 / Nasdaq / 道琼斯 — 仅周涨跌幅，一行数据）
- 本周风格特征（成长 vs 价值、大盘 vs 小盘 — 一句话）
- 板块强弱（最强/最弱的 2-3 个板块 — 一句话）
- 一句话点评市场行为与宏观环境的呼应关系

**示例**:

> 本周市场：S&P 500 +1.8%，Nasdaq +2.4%，道琼斯 +0.9%。成长股明显跑赢价值股，科技和通信板块领涨，能源和公用事业落后。市场的风格偏好与当前流动性宽松、通胀回落的宏观环境一致。

**注意**: 控制在 3-4 句话以内。不讲个股、不讲每日走势、不讲新闻事件。这些是日报的领域。

---

### 分析层：为什么会这样

#### [3]-[6] 四大宏观板块分析

每个板块的结构统一，包含三个部分：

**A. 本周数据变化（客观）**

列出本周有显著变化的 2-3 个关键指标：

```
净流动性: 6.1T (+2.3% 环比)
NFCI: -0.32 (上周 -0.28，金融条件略微收紧)
TGA: 7,200亿 (-5.1%，流动性释放)
```

**B. 趋势解读（分析）**

1-2 句话解释数据变化的含义：

> 净流动性继续扩张，主要由 TGA 余额下降驱动。虽然 NFCI 小幅走高，但仍处于宽松区间（<0），整体流动性环境对风险资产依然友好。

**C. 对股市的含义（判断）**

每个板块末尾 1 句话，明确说"这对股市意味着什么"：

> 流动性宽松 → 历史上这种环境下 Nasdaq 未来一个月上涨概率约 70%，对高 beta 成长股尤为有利。

---

### 行动层：这对投资意味着什么

#### [7] 对股市的启示（Investment Implications）

**这是整份周报最有态度的部分**。综合四大板块的分析结论，给出跨板块的投资判断。

**内容要素**:

| 要素 | 说明 |
|------|------|
| 风格倾向 | 成长 vs 价值 / 大盘 vs 小盘 / 进攻 vs 防御 |
| 板块偏好 | 当前宏观环境利好/利空哪些板块，以及为什么 |
| 风险提示 | 当前最需要警惕的 1-2 个宏观风险点 |

**示例**:

> **风格**: 偏向成长。流动性宽松 + 通胀回落 = 长久期资产受益。
>
> **板块**: 科技、通信服务受益于低利率预期；能源、公用事业在当前环境中缺乏催化剂。金融板块关注信用利差走向。
>
> **风险**: 下周三 CPI 若超预期回升，可能逆转当前"通胀回落"的叙事，对成长股形成短期压力。

#### [8] 下周关注（Week Ahead）

**内容要素**:

| 类型 | 数据源 | 示例 |
|------|--------|------|
| 经济数据发布 | FMP 经济日历 / `calendar.py` | 周二 PPI / 周三 CPI / 周四 初请 |
| 美联储动态 | FMP + 手动维护 | FOMC 会议、联储官员讲话 |
| 财报季关键公司 | `earnings.py` | NVDA / AAPL 等（如在财报季） |

每个事件附带一句话预判：

```
周三 CPI (预期 +0.2% MoM)
  → 若高于预期：成长股承压，美元走强
  → 若符合/低于预期：继续支撑当前"软着陆"叙事
```

---

## 三、AI 分析架构 — 两层设计

### 设计原则

AI 分析分为两个层级，定位不同、深度不同：

| | 入口级 AI（宏观定调） | 板块级 AI（深度分析） |
|---|---|---|
| 对应内容 | [1] 本周宏观定调 | [3]-[6] 各板块分析 |
| 定位 | 首席经济学家的晨会发言 | 领域分析师的研究报告 |
| 深度 | 浅，2-3 段话 | 深，结构化多段分析 |
| 覆盖范围 | 跨所有 4 个板块的综合判断 | 单一板块的详细解读 |
| 生成方式 | 周报 CRON 自动生成 | 周报 CRON 自动生成 |
| 是否需要登录 | 否（公开内容，引流价值） | 否（周报内容整体公开） |
| 关键差异 | 强调跨板块关联和投资含义 | 强调单板块数据变化和趋势 |

### 为什么需要两层

四个宏观板块之间是有关联的：流动性影响利率 → 利率影响经济增长 → 经济增长影响市场情绪。

- 如果只有板块级 AI → 用户拿到 4 份独立分析，缺失跨板块联动的判断
- 如果只有入口级 AI → 分析太浅，无法满足想深入了解单一领域的用户
- 两层结合 = 先给全局地图，再让用户选择性深入

### AI 生成策略

所有 AI 内容在周报 CRON 任务中一次性生成：

```
CRON 触发（每周五收盘后）
    │
    ├── 1. 收集四大板块数据（FRED + yfinance）
    ├── 2. 收集本周市场表现（yfinance 指数周度数据）
    ├── 3. 收集下周经济日历（calendar.py）
    │
    ▼
AI Agent 生成（单次调用，结构化输出）
    │
    ├── [1] 本周宏观定调（入口级）
    ├── [2] 本周市场回顾
    ├── [3]-[6] 四板块分析（板块级）
    ├── [7] 对股市的启示
    └── [8] 下周关注
    │
    ▼
存入数据库 → 网站展示 + 邮件推送
```

---

## 四、网站呈现

### 核心设计

网站上的宏观内容 = 最新一期周报的内容。不是实时 dashboard，而是每周固定更新的"本周宏观快讯"。

**用户体验与日报一致**：打开页面就能直接阅读，不需要触发任何生成操作。

### 页面结构

```
/tools  宏观入口页
│
├── 宏观速览卡片
│   四个维度信号灯 + 综合定性
│
├── [1] 本周宏观定调
│   AI 生成的 2-3 段综合判断
│
├── [2] 本周市场回顾
│   指数表现 + 风格/板块一句话总结
│
├── 四大板块导航
│   ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│   │ 流动性    │ │ 经济基本面│ │ 通胀与利率│ │ 市场情绪  │
│   │ 评分 + 摘要│ │ 评分 + 摘要│ │ 评分 + 摘要│ │ 评分 + 摘要│
│   └──────────┘ └──────────┘ └──────────┘ └──────────┘
│
├── [7] 对股市的启示
│   风格倾向 + 板块偏好 + 风险提示
│
└── [8] 下周关注
    经济日历 + 事件预判

/tools/liquidity          板块详情页 — [3] 流动性深度分析
/tools/macro-risk/economy 板块详情页 — [4] 经济基本面深度分析
/tools/macro-risk/inflation  板块详情页 — [5] 通胀与利率深度分析
/tools/macro-risk/sentiment  板块详情页 — [6] 市场情绪深度分析
```

### 入口页 vs 板块详情页

| | 入口页 `/tools` | 板块详情页 |
|---|---|---|
| 显示内容 | 综合定调 + 各板块摘要 + 启示 + 日历 | 单板块完整数据 + AI 深度分析 |
| 数据量 | 精简（每板块 2-3 句） | 完整（所有指标 + 图表） |
| 用户目的 | 30 秒了解本周宏观全貌 | 5 分钟深入某个板块 |
| 更新频率 | 每周（随周报更新） | 每周（随周报更新） |

---

## 五、邮件分发

### 邮件内容 = 网站内容

网站和邮件共享同一套数据，只是展示形式不同：
- 网站：可交互、可点进板块详情、有图表
- 邮件：扁平化、一封邮件读完、纯文本 + 简单排版

### 邮件结构

```
┌─ MarketBrew 宏观周报 · 2025.W03 ─────────┐
│                                            │
│  [1] 本周宏观定调                           │
│  信号灯 + 2-3 段综合判断                     │
│                                            │
│  [2] 本周市场回顾                           │
│  指数表现 + 风格总结                         │
│                                            │
│  [3]-[6] 四大板块速览                       │
│  每板块：数据变化 + 趋势 + 对股市的含义       │
│  (附"查看完整分析"链接 → 网站板块详情页)      │
│                                            │
│  [7] 对股市的启示                           │
│  风格 / 板块 / 风险                         │
│                                            │
│  [8] 下周关注                              │
│  经济日历 + 事件预判                         │
│                                            │
│  ─────────────────────────────             │
│  "在网站上查看完整分析和历史图表"              │
│  → themarketbrew.com/tools                 │
│                                            │
└────────────────────────────────────────────┘
```

### 分发机制

- 生成时机：每周五美股收盘后（Pacific 时间 16:00 后触发 CRON）
- 发送时间：周六早晨（用户周末阅读）
- 复用现有 `features/subscription/` 邮件订阅系统
- 复用现有 `/api/report/send` 广播机制
- HTML 邮件模板风格与日报一致

---

## 六、周报 AI Agent 设计

### 输入数据

| 数据 | 来源 | 用途 |
|------|------|------|
| 四板块当前指标值 + 周度变化 | FRED API | 分析层 [3]-[6] |
| 主要指数周度表现 | yfinance (SPY/QQQ/DIA) | 市场回顾 [2] |
| 板块 ETF 周度表现 | yfinance (XLK/XLE/XLF...) | 市场回顾 [2] + 启示 [7] |
| 下周经济日历 | `calendar.py` / FMP | 下周关注 [8] |
| 下周财报日历 | `earnings.py` / FMP | 下周关注 [8] |

### 输出 Schema（Pydantic）

```python
class WeeklyMacroReport(BaseModel):
    week_label: str                      # "2025.W03"
    generated_at: datetime

    # 判断层
    executive_summary: str               # [1] 本周宏观定调
    signal_lights: dict[str, str]        # {"liquidity": "green", "economy": "green", ...}
    market_recap: str                    # [2] 本周市场回顾

    # 分析层
    liquidity_analysis: SectionAnalysis  # [3]
    economy_analysis: SectionAnalysis    # [4]
    inflation_analysis: SectionAnalysis  # [5]
    sentiment_analysis: SectionAnalysis  # [6]

    # 行动层
    investment_implications: str         # [7] 对股市的启示
    week_ahead: list[WeekAheadEvent]     # [8] 下周关注

class SectionAnalysis(BaseModel):
    data_changes: str                    # A. 本周数据变化
    trend_interpretation: str            # B. 趋势解读
    market_implication: str              # C. 对股市的含义

class WeekAheadEvent(BaseModel):
    date: str                            # "周三"
    event: str                           # "CPI (预期 +0.2% MoM)"
    if_above: str                        # "成长股承压，美元走强"
    if_below: str                        # "继续支撑软着陆叙事"
```

### Agent Prompt 要点

- 你是 MarketBrew 的首席宏观策略师
- 你的读者是有 1-5 年投资经验的美股个人投资者
- 每个分析都必须回答"这对股市/投资意味着什么"
- 观点要明确，不要模棱两可（"偏利好"而不是"有利有弊"）
- 用数据支撑判断，但不要堆砌数据
- 本周市场回顾只讲 high-level 趋势（3-4 句话），不讲个股和每日走势

---

## 七、Engineering Plan

### 依赖关系

```
M1 数据管线 + DB → M2 AI Agent → M3 前端展示 → M4 邮件分发
                                      ↑
                          M1 完成后 M3 可以先用 mock 数据并行启动
```

---

### Milestone 1: 数据管线 + 存储基础设施（Data Pipeline + DB）

> **目标**: 数据能收集、能存储、能查询。先把桌子摆好，M2 只管往上放菜。
> **产出**: `collect_weekly_data() -> WeeklyRawData` + `weekly_macro_reports` 表 + CRUD API

#### 1A. 数据收集层

**现有基础（直接复用）**:

| 模块 | 状态 | 可复用 |
|------|------|--------|
| FRED 数据获取 | `fred_service.py` 已有 | 直接复用 `get_latest_value()` |
| 流动性指标 | `features/liquidity/` 完整 | 直接复用 |
| 经济基本面指标 | `features/macro_risk/` 已有部分 | 复用已有 series，补充缺失的 |
| yfinance 行情 | `shared/yfinance_service.py` 已有 | 复用，新增周度汇总逻辑 |
| 经济日历 | `shared/data_tools/calendar.py` 已有 | 直接复用 |
| 财报日历 | `shared/data_tools/earnings.py` 已有 | 直接复用 |

**需要新建/补充**:

| 任务 | 说明 | 涉及文件 |
|------|------|---------|
| 通胀与利率数据 | 新增 6 个 FRED series (CPI/PCE/T5YIE/FEDFUNDS/DGS10/DFII10) | `features/macro_risk/service.py` |
| 市场情绪数据 | VIX + Put/Call Ratio + 市场宽度 via yfinance | `features/macro_risk/sentiment.py` (新建) |
| 市场表现周度汇总 | SPY/QQQ/DIA 周涨跌幅 + 11 个板块 ETF 周度表现 | `features/weekly_report/data_collector.py` (新建) |
| 数据聚合服务 | 将上述所有数据打包为 `WeeklyRawData` | `features/weekly_report/data_collector.py` |

#### 1B. 存储基础设施（与日报同模式）

参考日报的 `market-reports.js` + `market/db.py` 模式：

| 任务 | 说明 | 涉及文件 |
|------|------|---------|
| Pydantic Schema | `WeeklyMacroReport` / `SectionAnalysis` / `WeekAheadEvent` 数据模型 | `features/weekly_report/models.py` (新建) |
| Edge Function | `weekly-macro-reports.js`，支持 upsert/get latest/get by week/list | `edge_functions/weekly-macro-reports.js` (新建) |
| DB 操作层 | `save_weekly_report()` / `get_latest_report()` / `get_report_by_week()` | `features/weekly_report/db.py` (新建) |
| API 读取端点 | `GET /api/weekly-report` 获取最新 + `GET /api/weekly-report?week=2025.W03` 查历史 | `features/weekly_report/router.py` (新建) |
| 注册路由 | 在 `main.py` 注册 weekly_report router | `app/main.py` |

**数据库表设计** (`weekly_macro_reports`):

| 列 | 类型 | 说明 |
|----|------|------|
| `id` | UUID | 主键，自动生成 |
| `week_label` | TEXT | `"2025.W03"`，upsert key |
| `generated_at` | TIMESTAMPTZ | 生成时间 |
| `executive_summary` | TEXT | [1] 本周宏观定调 |
| `signal_lights` | JSONB | `{"liquidity": "green", ...}` |
| `market_recap` | TEXT | [2] 本周市场回顾 |
| `liquidity_analysis` | JSONB | [3] SectionAnalysis |
| `economy_analysis` | JSONB | [4] SectionAnalysis |
| `inflation_analysis` | JSONB | [5] SectionAnalysis |
| `sentiment_analysis` | JSONB | [6] SectionAnalysis |
| `investment_implications` | TEXT | [7] 对股市的启示 |
| `week_ahead` | JSONB | [8] WeekAheadEvent[] |
| `raw_data` | JSONB | 原始数据快照（可选，用于调试/回溯） |
| `created_at` | TIMESTAMPTZ | 系统时间戳 |

**Edge Function 操作**（与 `market-reports.js` 一致）:

| 操作 | 请求 | 说明 |
|------|------|------|
| Upsert | `POST ?action=upsert` | 按 `week_label` 幂等写入 |
| 最新一期 | `GET ?latest=true` | 按 `week_label` 降序取第一条 |
| 按周查询 | `GET ?week=2025.W03` | 精确查询某一期 |
| 历史列表 | `GET ?limit=20&offset=0` | 分页列表（摘要字段） |

#### 验收标准

- [ ] `collect_weekly_data()` 返回完整的 `WeeklyRawData` 对象
- [ ] 包含四板块所有指标的当前值 + 周度/月度变化
- [ ] 包含 SPY/QQQ/DIA + 板块 ETF 的周度表现
- [ ] 包含下周经济日历 + 财报日历
- [ ] Edge Function 部署成功，支持 upsert / get latest / get by week / list
- [ ] `db.py` 的 CRUD 函数可正常读写数据库
- [ ] `GET /api/weekly-report` 返回最新周报（当数据库为空时返回合理空状态）
- [ ] 单元测试覆盖数据收集和 DB 操作逻辑
- [ ] 所有外部 API 调用有错误处理和降级策略

---

### Milestone 2: AI Agent + 生成逻辑（Content Generation）

> **目标**: 输入原始数据，AI 生成结构化周报内容，通过 M1 的存储层写入数据库。
> **产出**: `POST /api/weekly-report` 端点可生成并存储一期完整周报。

#### 任务清单

| 任务 | 说明 | 涉及文件 |
|------|------|---------|
| AI Agent | Google ADK Agent (gemini-3-pro-preview)，prompt 参考第六节 | `features/weekly_report/agent.py` (新建) |
| 生成端点 | `POST /api/weekly-report` 调用 data_collector → Agent → db.save | `features/weekly_report/router.py` (追加) |
| CRON 触发 | 每周五收盘后自动调用生成端点 (X-Cron-Secret 认证) | `features/weekly_report/router.py` |
| Prompt 工程 | 调优 Agent prompt，确保输出有判断、有态度、关联股市 | `features/weekly_report/agent.py` |
| 端到端测试 | 从数据收集到存储的完整流程测试 | `tests/test_weekly_report.py` |

#### 验收标准

- [ ] `POST /api/weekly-report` 成功生成完整的 8 个模块内容
- [ ] AI 输出符合 `WeeklyMacroReport` schema，无字段缺失
- [ ] 内容语气符合要求（有判断、有态度、关联股市）
- [ ] 生成后自动通过 M1 的 db.py 存入数据库
- [ ] `GET /api/weekly-report` 能读到刚生成的周报
- [ ] CRON 端点有 `X-Cron-Secret` 认证保护
- [ ] 重复生成同一周的周报时覆盖（幂等，upsert by week_label）

---

### Milestone 3: 前端展示（Website Display）

> **目标**: 用户打开 `/tools` 看到最新周报内容，体验与日报一致。
> **产出**: 入口页 + 板块详情页展示周报内容。

#### 任务清单

| 任务 | 说明 | 涉及文件 |
|------|------|---------|
| 入口页重构 | 将 `/tools` 从导航页改为周报内容页 | `app/tools/page.tsx` |
| 宏观速览组件 | 四维度信号灯 + 综合定性 | `components/macro/SignalLights.tsx` (新建) |
| 宏观定调区块 | 展示 [1] executive_summary | `app/tools/page.tsx` |
| 市场回顾区块 | 展示 [2] market_recap + 指数卡片 | `app/tools/page.tsx` |
| 板块导航卡片 | 展示每板块评分 + 摘要，点击进入详情 | `app/tools/page.tsx` |
| 投资启示区块 | 展示 [7] investment_implications | `app/tools/page.tsx` |
| 下周关注区块 | 展示 [8] week_ahead 日历 + 预判 | `components/macro/WeekAhead.tsx` (新建) |
| 板块详情页更新 | 各板块详情页展示对应的 AI 深度分析 (data_changes / trend / implication) | `app/tools/liquidity/page.tsx` 等 |
| API 对接 | 前端调用 `GET /api/weekly-report` 获取数据 | `lib/api.ts` 或对应 fetch 函数 |

#### 验收标准

- [ ] `/tools` 页面展示最新周报全部内容（判断层 + 行动层）
- [ ] 四板块导航卡片显示信号灯颜色 + 一句话摘要
- [ ] 点击板块卡片进入详情页，能看到该板块的 AI 深度分析
- [ ] 无周报数据时显示合理的空状态
- [ ] 页面加载性能 < 2s（周报数据为静态 JSON，无实时计算）
- [ ] 移动端适配良好
- [ ] 设计风格与现有 terminal-card 体系一致

---

### Milestone 4: 邮件分发（Email Distribution）

> **目标**: 每周自动向订阅用户推送周报邮件。
> **产出**: 订阅用户周六早晨收到宏观周报。

#### 任务清单

| 任务 | 说明 | 涉及文件 |
|------|------|---------|
| 邮件模板 | HTML 模板，风格与日报一致 | `features/weekly_report/email_template.py` (新建) |
| 邮件发送 | 复用 Resend API 发送逻辑 | `features/subscription/email_service.py` |
| 订阅类型 | 订阅表新增 `weekly_macro` 类型，与日报 `daily_market` 分开 | `features/subscription/service.py` |
| 前端订阅入口 | `/tools` 页面底部添加周报订阅 CTA | `app/tools/page.tsx` |
| CRON 发送 | 周报生成后自动触发邮件广播 | `features/weekly_report/router.py` |
| 邮件内引流 | 每个板块附"查看完整分析"链接，指向网站详情页 | 邮件模板 |

#### 验收标准

- [ ] 订阅用户收到格式正确的周报邮件
- [ ] 邮件包含全部 8 个模块的内容
- [ ] 各板块"查看完整分析"链接正确跳转到网站
- [ ] 用户可单独订阅/退订周报（不影响日报订阅）
- [ ] 邮件在主流客户端（Gmail / Apple Mail / Outlook）渲染正常
- [ ] 发送失败时有重试机制和错误告警

---

### Milestone 路线图

```
Week 1-2              Week 3          Week 4         Week 5
┌────────────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│      M1        │──→│    M2    │──→│    M3    │──→│    M4    │
│ 数据管线 + DB   │   │ AI Agent │   │ 前端展示  │   │ 邮件分发  │
│                │   │          │   │          │   │          │
│ 通胀/情绪数据   │   │ Agent    │   │ 入口页重构│   │ 邮件模板  │
│ 市场周度汇总    │   │ Prompt   │   │ 板块更新  │   │ 订阅系统  │
│ 数据聚合服务    │   │ CRON     │   │ 组件开发  │   │ CRON 发送 │
│ Schema + DB    │   │ E2E 测试  │   │ 移动端适配│   │ 引流链接  │
│ Edge Function  │   │          │   │          │   │          │
│ CRUD + GET API │   │          │   │          │   │          │
└────────────────┘   └──────────┘   └──────────┘   └──────────┘
```

### Feature 模块结构（最终）

```
backend/app/features/weekly_report/    # 新建 feature 模块
├── router.py                          # API 端点 + CRON 触发
├── agent.py                           # Google ADK Agent
├── models.py                          # WeeklyMacroReport schema
├── data_collector.py                  # 数据聚合服务
├── db.py                              # 数据库操作
└── email_template.py                  # 邮件 HTML 模板
```
