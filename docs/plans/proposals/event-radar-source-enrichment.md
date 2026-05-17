# 事件雷达数据源增强（专属日报未来事件）Proposal

> Status: Proposal（Backlog / 未进入 active 开发）
> **定位：本文是 `docs/plans/active/catalyst-events-radar.md` 的增强补充，不是替代。**
> Related: docs/plans/active/catalyst-events-radar.md（基线，已有 spike 验证）、features/brew/.context.md、backend/scripts/probe_forward_events.py
> 并行关系: 与 `proposals/holdings-sync-design.md` **完全独立**，无先后、无依赖（事件雷达消费 `user_portfolios` ∪ watchlist，与持仓"如何录入"无关）。

---

## 阅读约定（避免重复）

`catalyst-events-radar.md` 已完整定义：`catalyst_events` 表 schema、ingest 流水线（Source A/B/C）、去重/合并、`date_precision`/`confidence`/`related_symbols`/`superseded_by` 字段决策、`/api/event-radar` API、`/for-you` 事件雷达 tab、brew 集成、6 阶段排期、成本（~$6/月）。

**本文不重述以上任何内容。** 本文只补该基线**显式 defer 到 V2 / 列入 NOT-in-scope / 留为待定问题**的部分——这正是本次 deep research 的增量价值落点。

## 用户痛点

> "专属日报的未来事件怎么能更丰富一些？查找更多有价值的数据源，分析数据源并与用户关注列表/持仓关联。**基本要求：财报事件一定都要在上面，包括同行业其他公司的财报、上下游之类的。** 可以用推特日报的数据源采集其他事件。"

## 目标

在不推翻基线 plan 的前提下，补齐三件基线显式留空、却是本痛点**硬要求**的能力：

1. **更多免费结构化源**——基线把公司行动/确认财报/精确宏观日程 defer 到 V2 或留为待定；这些其实零成本即可开。
2. **同行 + 上下游供应链关系图 + 财报完整性硬不变量**——基线把 value-chain 列入 NOT-in-scope（"需新数据源"），而这正是用户的硬要求和产品差异化护城河。
3. **推特/KOL 催化抽取的可落地去重方案**——基线 Source E 留 V2 且未解其幻觉风险（待定问题 #4）。

并给出一个**高端差异化升级路径**（Wall Street Horizon）——基线完全没有的天花板。

## 现状：基线已覆盖 vs 本文补齐

| 能力 | 基线 catalyst-events-radar.md | 本文增强 |
|---|---|---|
| FMP 财报/经济日历镜像 | Source A 已覆盖 | — |
| 新闻流 LLM 抽取（fan-out） | Source B 已覆盖（spike 验证） | — |
| transcript 抽取 | Source C 已覆盖 | — |
| 同行财报 | peers 反查（FMP industry peers） | 升级为**关系图 + 完整性不变量** |
| 股息/拆股/IPO/M&A 日历 | "→ **V2**"（defer） | **立即开**（已付费 FMP 即有） |
| 估计 vs 确认财报 | 无 | FMP `earnings-confirmed` 端点 |
| 精确宏观日程 | 待定问题 #2 未决 | **FRED `releases/dates`** + `affects_sectors[]`（解其 #2） |
| OPEX/四巫日、Russell/S&P 再平衡 | 无 | 确定性计算事件（零成本） |
| **上下游供应链事件** | **NOT-in-scope V1**（"需新数据源"） | **本文给出可负担数据源 + 建图配方** |
| KOL 推文催化 | Source E "→ V2" | 可落地去重方案（structured wins）+ 解其 #4 |
| 高端付费源 | 无 | Wall Street Horizon 升级路径 |

---

## 增强设计

### 增强 1：立即可开的免费结构化源（落到基线 Source A）

基线 Source A 已是"直接镜像 FMP、零 LLM 成本、每 6 小时全量替换未发生同类事件"。只需把以下 fetcher 加进同一 Source A 框架（**不新建机制**）：

- `fetch_fmp_corporate_actions()`：FMP **dividends-calendar / splits-calendar / IPO-calendar / latest-M&A / symbol-change**——基线写"→ V2"，实际已在现有付费档，**提前到 V1**。`event_type` 复用基线枚举（M&A→`ma`；新增 `dividend|split|ipo`）。
- `fetch_fmp_earnings_confirmed()`：FMP **`earnings-confirmed`** 端点与估计财报日历分离 → 用基线已有 `status` 字段：confirmed 写 `status='confirmed'`，估计写 `status='scheduled'`。前端可据此区分"已确认/预估"。
- `fetch_fred_release_dates()`：**FRED `fred/releases/dates`**（免费 key，含未来日期）替代对 BLS/BEA/Fed 发布日的猜测——直接解基线**待定问题 #2**。写入基线的 `symbol='__MACRO__'` 特殊行，并补 `affects_sectors[]`（采纳基线 #2 的"方案 B"，因为现在有了精确日程，按板块反查的价值才成立）。
- `compute_deterministic_events()`：纯算法、零数据源——月度 OPEX（每月第 3 个周五）、四巫日（3/6/9/12 月第 3 周五）、Russell 重构（LSEG 公布日程，注意 2026 起改半年度）、S&P 调整（S&P DJI RSS 事件驱动）。`source_type='computed'`，`confidence=1.0`。

净效果：事件类型从基线 V1 的 ~3 类扩到 ~15 类，**零新增月成本**。

### 增强 2：同行 + 上下游关系图 + 财报完整性硬不变量（核心护城河）

基线靠 `peers.get_peer_companies()` 在查询时反查同行，且把供应链列入 NOT-in-scope。研究结论：**没有竞品低成本地把个性化事件流扩到"同行 + 上下游"——这就是"专属"差异化**。

**新增 `ticker_relationships` 表**（与基线 `catalyst_events` 解耦，独立 migration）：

```
ticker | kind('peer'|'supplier'|'customer') | related_ticker | source | confidence | as_of
```

**建图配方（可负担，复用已付费源 + 年度 LLM 批）**：

- 同行层：`FMP stock_peers` ∪ 同行业/同 GICS-SIC 桶 ∪ 同板块/主题 ETF 成分（FMP ETF-holder/holdings，做 peer 代理——Koyfin 同款廉价技巧）∪（可选）Polygon Related Tickers（$29/月，含新闻共现+收益相关性的"市场感知同行"）。季度刷新。
- 上下游 1-hop：CSIMarket suppliers/customers 页做廉价种子 → **每年一次对每只持仓的最新 10-K（分部附注 / "customers" / "suppliers" / 风险因素）跑 LLM 抽取** named counterparties → 用确定性别名/ticker 字典 + 模糊匹配解析（低置信拒绝）。边存 `source / confidence / as_of_filing_date`。10-K 年度更新 → 每票每年一次批，边际成本极低。

**财报完整性硬不变量**（直接满足用户硬要求，基线没有）：

> 对用户每只持仓/watchlist 标的，其**自身** + **1-hop 同行** + **1-hop 上下游**在 horizon 内的**财报事件必须出现在专属日报**。

实现：查询 `catalyst_events` 时把 symbol 集合扩为 `holdings ∪ watchlist ∪ peers(1-hop) ∪ supply_chain(1-hop)`；在 brew 集成（基线 Phase 4）的后处理加确定性兜底——若 LLM 输出漏了任何应在的财报，**强制回填**（与 `twitter_digest` 的 `_enforce_caps` / `_fallback_thesis_for_missing` 同模式）。事件携带 `relation ∈ {direct|peer|supplier|customer|macro}`，brew 的 `why_important` 必须讲清关系链（"ASML 财报 → 你持有的 NVDA 上游设备风向标"）。

### 增强 3：推特/KOL 催化抽取的可落地去重（落到基线 Source E，解其待定 #4）

基线 Source E 留 V2 且置信封顶 0.6，但未解"LLM 从推测性文本抽出事实性事件"的幻觉风险（待定问题 #4）。研究给出标准模式：

- 复用 `twitter_digest` 已有的时间切片拉取 + flash-lite enrichment 基建，加一个 forward-catalyst 抽取分支，产出 `{ticker, event_type, date|range, confidence}`。
- 归一为 `(ticker, event_type, date_bucket)` 后与结构化日历做模糊聚类去重：**结构化日历永远是 source of truth**；匹配上 → 丢弃 LLM 重复（或仅用于补描述/提早 source_published_at）；未匹配 → 进**独立"未确认"低置信 tier**，前端标注来源。
- 直接解基线 #4：`leadership_change / ma` 等高幻觉类，要求 **≥2 个独立 source_url** 才升级 `status='confirmed'`；ticker 映射过字典模糊校验杀掉最大一类错误。

### 增强 4：高端差异化升级路径（基线没有的天花板）

当收入支撑时，引入 **Wall Street Horizon**（经 IBKR Enchilada Pro ~$149/月，或 Massive/Polygon 的 TMX Corporate Events add-on）作为 Source A 的一个高质量 fetcher：唯一单一源原生覆盖**分析师/投资者日、行业会议演讲、回购、锁定期到期、指数增删、已核实财报日**——这些廉价 API 都没有。接入方式与基线 Source A 一致（写同一 `catalyst_events` 表，`source_type='wsh'`，`confidence` 高），不改架构。触发条件：付费用户事件丰富度成为核心卖点且收入可覆盖时。

---

## 与基线排期的衔接（不另起炉灶）

| 增强 | 落到基线哪一步 | 增量动作 |
|---|---|---|
| 1 免费结构化源 | 基线 Phase 1 Source A | 加 4 个 fetcher（FMP 公司行动 / earnings-confirmed / FRED / computed），复用其去重 |
| 2 关系图 + 不变量 | 基线 Phase 3（peer events）替换升级 + Phase 4（brew 集成）加硬不变量 | 新 `ticker_relationships` 表 + 建图 cron + 完整性兜底 |
| 3 KOL 去重 | 基线 Phase 6 V2 Source E | 加抽取分支 + structured-wins 去重 + 双源升级 |
| 4 WSH 高端 | 基线 Source A 之上，独立触发 | 一个高质量 fetcher，付费触发 |

## 解决基线的待定问题

- **基线 #2（宏观如何挂用户）**：本文增强 1 引入 FRED 精确日程后，采纳其"方案 B"（`affects_sectors[]` 按板块反查）成为可行——精确日程是方案 B 成立的前提。
- **基线 #4（leadership_change/ma 幻觉）**：本文增强 3 给出 ≥2 独立源升级 + structured-wins 去重的可落地规则。
- **基线 NOT-in-scope "value chain"**：本文增强 2 给出可负担数据源（CSIMarket 种子 + 年度 10-K LLM + ETF 代理），将其从 V2 NOT-in-scope 提为可实施。

## 资源 / 成本（基线 ~$6/月 之上的增量）

| 项 | 量 | 增量成本 |
|---|---|---|
| FMP 公司行动/earnings-confirmed | 现有付费档 | $0 |
| FRED releases/dates | 免费 key | $0 |
| 确定性计算事件 | 纯算法 | $0 |
| 关系图：FMP peers/ETF | 现有付费档 | $0 |
| 关系图：Polygon Related Tickers（可选） | Starter | ~$29/月（可选） |
| 关系图：年度 10-K LLM 批 | 每票/年一次 | 极低（年度批） |
| CSIMarket 种子 | 抓取/授权下载 | 极低 |
| Wall Street Horizon（高端，收入支撑后） | IBKR Enchilada Pro 或 TMX add-on | ~$149/月（延后） |

**净结论**：~$0–29/月增量即把事件类型从 ~3 扩到 ~20+，并补上"同行+上下游财报必现"的硬要求；WSH 是收入支撑后的明确下一步天花板。

## NOT in scope（沿用基线，不重复造）

- `catalyst_events` 表 / 去重合并 / `/api/event-radar` / 前端雷达 tab / brew 集成机制——**全部沿用基线**，本文不重做。
- 事件影响预测、准确率闭环、单条事件提醒订阅——同基线，仍 V2+。
- 垂直源（ClinicalTrials.gov / 航天 / CoinMarketCal）——基线 Source D/Phase 6 已规划，本文不重复。

## 引用（研究依据）

- Wall Street Horizon：[40+ 事件类型](https://www.wallstreethorizon.com/stock-events)、[TMX 收购](https://www.prnewswire.com/news-releases/tmx-group-announces-acquisition-of-wall-street-horizon-301669875.html)、[IBKR Enchilada Pro](https://www.wallstreethorizon.com/interactive-brokers)、[Massive/Polygon TMX add-on](https://massive.com/docs/rest/partners/tmx/corporate-events)
- FMP：[earnings-confirmed](https://site.financialmodelingprep.com/developer/docs/stable/earnings-calendar)、[dividends-calendar](https://site.financialmodelingprep.com/developer/docs/stable/dividends-calendar)、[stock-peers](https://site.financialmodelingprep.com/developer/docs/stock-peers-api)、[ETF holders](https://site.financialmodelingprep.com/developer/docs/etf-holders-api)
- FRED：[releases/dates（含未来日期）](https://fred.stlouisfed.org/docs/api/fred/releases_dates.html)
- 计算事件：[期权到期日历](https://www.optionseducation.org/referencelibrary/expiration-calendar)、[Russell 改半年度(2026)](https://www.lseg.com/content/dam/ftse-russell/en_us/documents/announcement/russell-us-indexes-move-to-semi-annual-reconstitution.pdf)
- 供应链：[10-K 客户披露挖掘(学术)](https://onlinelibrary.wiley.com/doi/10.1111/jscm.12294)、[CSIMarket 供应链/竞争](https://csimarket.com/stocks/suppliers_glance.php?code=SCS)、[Polygon Related Companies](https://massive.com/blog/related-companies-api)
- 新闻→事件抽取与去重（先例）：[Benzinga WIIM](https://www.benzinga.com/apis/cloud-product/bz-why-is-it-moving/)、[生成式 LLM 金融事件抽取](https://arxiv.org/abs/2504.14633)
- 竞品对标：[Koyfin 按 ETF/指数成分筛财报](https://www.koyfin.com/help/earnings-calendar-feature/)、[Seeking Alpha Catalyst Watch](https://seekingalpha.com/news/3651929-seeking-alpha-catalyst-watch)、[Catacal 组合催化日历](https://www.catacal.com/portfolio-catalyst-tracker)
