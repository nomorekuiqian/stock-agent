---
skill: sector-optical-transceivers
layer: sector
coverage: high
tweets: 235
static_corpus_cutoff: 2026-05-27
recent_direct_evidence_since: 2026-06-16
latest_evidence: 2026-06-18
last_updated: 2026-06-19
---

# Sector: optical-transceivers

## 适用问题

- 「光模块她重点看哪几只?」「800G / 1.6T 还能买吗?」
- 「LITE / AAOI / COHR 哪个更好?」「EML 激光怎么回事?」
- 「光模块超级周期到哪一步了?」

## 核心问题

**Pluggable transceiver (800G / 1.6T) 超级周期处在哪个阶段? 哪些标的还在加仓 vs 部分轮出?**

## 公司或产业是什么

**Optical transceiver** = 光模块, 把电信号转成光信号通过光纤传输. AI 数据中心从 100G/400G 升到 800G(2024-2025), 800G 升到 1.6T(2025-2026), 1.6T 升到 CPO(2026-2028).

每代光模块单价从 ~$200 (100G) → ~$1000 (400G) → ~$2500 (800G) → ~$5000 (1.6T) → ~$8000+ (CPO). AI 数据中心 PCB 上一个 GPU 需要 8-16 个光模块.

**关键标的**:
- **LITE (Lumentum)** — EML 激光器全球第一, NVDA Blackwell / GOOGL TPU v7 / AMZN Trainium 通吃; $26B MC, 涨 316% YTD
- **AAOI (Applied Optoelectronics)** — 美国本土光模块 800G/1.6T 端到端制造, $2.5B MC, ramping to 100K units/month
- **COHR (Coherent)** — 垂直整合的光器件公司, "do everything vertically", capture 光学超级周期

## 她看什么信息

- **EML / VCSEL / DSP / 800G / 1.6T 单价 + 量** (LITE 月产能 800G 10万件)
- **客户 design wins**(LITE 在 TPU v7 Ironwood OCS 中独占地位; AAOI 在 MSFT MAIA + AMZN Trainium)
- **CEO 财报 transcript**(AAOI 2026-05 ER: 100K 月产能确认, Q3 重大增量)
- **超大规模云客户 capex**
- **同环对比**(LITE 利好 Mag7 所有 ASIC; AAOI 利好 MSFT MAIA + Amazon Trainium)

## 她如何理解

### 客户暴露差异化(她明确画的)

```
$LITE  → TPU Ironwood (OCS), NVDA Blackwell, 所有 ASIC 通吃
$AAOI  → MSFT MAIA, AMZN Trainium (差异化 → 美国本土制造溢价)
$COHR  → 垂直整合, 光学全周期 capture
```

### 美国本土制造溢价

AAOI 是少有的"美国本土 800G/1.6T 端到端制造"光模块公司:

> "AAOI has the end-to-end manufacturing scale for 800G/1.6T optical transceivers in a time where hyperscalers will buy anything optical players can make. The fact they're trying to do it all in America + receive tax credits (Texas) should give it premium valuation." (id: 2058376970178847075, 2026-05-24)

### EML 是 LITE 的核心护城河

LITE 在 EML(Electro-Absorption Modulated Laser)上 ~80% 市场份额. AI 高速光模块都需要 EML, 这是 LITE 的核心定价权:

> "The $LITE thesis: The hidden monopoly in the AI. Lumentum makes unbelievable EML chips for every TPU/GPU deployed." (id: 2003019490871869644, 2025-12-22)

### CPO 部分替代 EML 的风险(2026-05 起浮现)

她在 2026-05 部分把 LITE/COHR 轮到 SIVE/FOCI:

> "I cut some exposure too in $LITE $COHR like Leopold, rotated to $SIVE / Foci. The entire photonics supply chain is in the next phase." (id: 2056558267896311996, 2026-05-19)

CPO 量产后, 部分 EML 需求会被 SIVE 的 CW DFB 取代. 但 LITE 仍然是 anchor, 不轮出. AAOI 因美国本土制造溢价继续重仓.

## 2026-06-16 后最新变化

最新证据把 optical transceivers 的问题从"800G/1.6T 是否继续 ramp"推进到"谁能拿到稀缺 CW laser / transceiver capacity"：

- `2066707573139763211` — 2026-06-16，AMD 正在争抢 CW laser supply，Serenity 直接点名 AAOI / SIVE；Lumentum / Coherent 被 Nvidia 锁产能到 2028，使 AAOI 的美国本土链条更有稀缺性。
- `2067071462360666165` — 2026-06-17，AAOI high conviction 被再次强化，理由是 AMD / hyperscaler laser capacity 和美国 800G/1.6T transceiver chain。
- `2067206734427697196` — 2026-06-17，AMD 大额 CW laser procurement 使 AAOI / SIVE / Macom 成为独立西方供给候选。
- `2067542382523122001` — 2026-06-18，AAOI / SIVE 被继续列为个人 favorites；她强调 lasers、modules、engines、ELS 的 revenue capture 可能在 2027 H1/H2 才更明显。

处理口径：问 LITE / COHR / AAOI 时必须拆分 anchor 与弹性。LITE / COHR 仍是核心 anchor，但最新增量更集中在 AAOI / SIVE 这类可捕捉独立西方产能缺口的节点。

## 决策框架

| 标的 | 当前姿态 |
|---|---|
| $LITE | high conviction long, 部分轮出 (因为 CPO 部分替代风险) |
| $AAOI | high conviction long, 持有 (美国本土制造溢价 + 100K 月产能确认) |
| $COHR | high conviction long, 部分轮出 (垂直整合, 但 Sivers 上游分流) |
| Innolight (中国) | 看好但买不了 |
| AMKR (封装) | medium, 配置 |

## 减仓与轮动信号

1. **CPO 量产 H2 2026 开始** → 部分 EML 需求被 SIVE/CW DFB 替代
2. **客户 ASIC 转 CPO 后续代** (GOOGL TPU v8 / NVDA Rubin) → 重新评估
3. **AAOI 100K 月产能 vs 总需求达成**: 如果完全 cap-out, 估值见顶
4. **关税 / 出口管制变化**: 美国本土制造溢价反转

## 常见误读

| 误读 | 实际 |
|---|---|
| LITE / COHR / AAOI 完全互相替代 | 客户暴露完全不同; 不可互换 |
| LITE 是中国 Innolight 的对标 | LITE 是 EML 全球第一; Innolight 是组装 |
| 美国本土制造没溢价 | 她明确说 AAOI 应该有 premium valuation |
| 800G 是终点 | 800G → 1.6T → CPO 是连续的, 1.6T 起 EML 单 ASIC 需求倍增 |

## 回答注意

- 先说明 Optical transceivers 是中游连接层,与 CPO 上游不是同一风险收益阶段。
- 问 LITE / AAOI / COHR 时,重点回答它在 800G / 1.6T / CPO 过渡里的角色和是否已重定价。
- 显式判断当前更像估值回撤、验证窗口还是逻辑破裂;若她历史上已部分轮出,不要写成继续加码。
- 最后给 1-2 个打脸信号: CPO 替代速度、客户 ramp、美国本土制造溢价是否继续。

## Evidence Map

- "$LITE thesis: hidden monopoly in AI, +316% YTD, might be 1000%+ by 2027" (id: 2003019490871869644, 2025-12-22)
- "$AAOI ramping to 100K units/month for 800G, Q3 大幅产能增量" (id: 2052485912714752144, 2026-05-07)
- "AAOI has end-to-end 800G/1.6T manufacturing in America" (id: 2058376970178847075, 2026-05-24)
- "Lite uniquely because of role in GOOGL TPU v7, AMZN Trainium v3/4, NVDA Blackwell" (id: 1999240464420250042, 2025-12-11)
- "$AAOI up 6-7x at $200+ from $30 last year" (id: 2054583956167877111, 2026-05-13)
- "I cut some exposure in $LITE $COHR, rotated to $SIVE / Foci" (id: 2056558267896311996, 2026-05-19)
- "$LITE is now over $1000" (id: 2053857864637436221, 2026-05-11)
- "Optical players go through Sivers, leading CPO hyperscaler supply chains" (id: 2058374522353672558, 2026-05-24) — pluggable → CPO 过渡
- "AMD scrambling for CW laser supply; AAOI / SIVE are obvious beneficiaries" (id: 2066707573139763211, 2026-06-16)
- "AAOI high conviction: scarce laser capacity for AMD / hyperscalers and US transceiver chain" (id: 2067071462360666165, 2026-06-17)
- "AAOI / SIVE personal favorites; revenue capture can expand into modules / engines / ELS" (id: 2067542382523122001, 2026-06-18)
