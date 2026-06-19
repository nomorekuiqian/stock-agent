---
skill: sector-photonics-and-cpo
layer: sector
coverage: high
direct_mention_count: 484
static_corpus_cutoff: 2026-05-27
recent_direct_evidence_since: 2026-06-12
latest_evidence: 2026-06-18
last_updated: 2026-06-19
---

# Sector: photonics-and-cpo

## 适用问题

用户问 photonics、CPO、co-packaged optics、光模块、CPO 时间线、SIVE / AXTI / LITE / COHR / AAOI / SOI / FOCI / Nextronics 等供应链机会。

## 一句话定位

在 Serenity 体系里,Photonics + CPO 不是一个泛 AI 主题,而是 AI capex 漏斗从 GPU/HBM 继续下沉后,在光互连、激光、衬底、FAU、封装和测试上形成的一串物理 chokepoint。

## 核心问题

1. CPO / photonics 的量产时间线是否仍在推进?
2. 当前最窄的 bottleneck 是 EML、CW laser、InP、SiPh、FAU、connector,还是封装?
3. 哪些公司是真 chokepoint,哪些只是相邻概念或已经较充分定价?
4. 哪个事实出现后,这条链从验证窗口转成逻辑破裂?

## 公司或产业是什么

Photonics 是用光传输数据的基础设施。普通说法: AI 数据中心的数据流越来越大,电信号互连在功耗、带宽和延迟上吃紧,因此 800G / 1.6T 光模块和 CPO 会变得更重要。

CPO (Co-Packaged Optics) 是把光引擎放到 GPU、ASIC 或 switch ASIC 附近,让数据中心互连更省电、更高带宽。Serenity 看重的是 CPO 量产背后的 BOM 节点,不是“光模块”这个宽泛标签。

## 她看什么信息

- CPO 时间线: H2 2026 scale-out、H2 2027 scale-up、2028 大规模 re-rate。
- 激光路线: EML (LITE) 与 CW DFB (SIVE) 的分工和替代性。
- 衬底材料: InP (AXTI / SMTOY) 与 SiPh (SOI) 是否仍是上游约束。
- FAU / connector / thermal module: FOCI、Nextronics、Shunsin、JBL 等下游组装节点。
- 客户链: NVDA、MRVL、GOOGL、MSFT、AMZN、AMD、Ayar、Lightmatter、Lightelligence。
- 公司是否能从材料/组件走向更高 revenue capture,而不是只停留在小 BOM 占比。

## 她如何理解

Serenity 的 photonics 链条可以压成:

```text
AI capex -> 800G / 1.6T / CPO demand
  -> lasers / substrates / FAU / packaging / testing
  -> 谁绕不过去、谁扩不快、谁还小
```

这条链的回答重点不是“CPO 好不好”,而是“当前 CPO 量产最卡哪一层”。旧瓶颈被市场追认后,她会继续往更窄、更上游或更未被覆盖的节点找下一站。

## 2026-06-12 后最新变化

本轮新增证据集中在五件事：CPO / 800V 延迟争议、InP 出口管制缓和、SIVE/IQE 等上游节点的客户链验证、AMD CW laser 采购链、以及 photonics revenue capture 从 lasers 扩到 modules / engines / ELS。

- `2065289672356745561` — 2026-06-12，Serenity 复盘自己 2025 年的 high conviction ideas，承认部分 nuance 曾有偏差，但核心 AI / photonics 方向显著兑现。
- `2065291889885274552` — 2026-06-12，她用 AXTI 的验证周期提醒用户：InP substrate bottleneck 花了数月才被公司和政府确认，CPO 相关 idea 不应按 1 个月时间框架判定失败。
- `2066331049605627951` — 2026-06-15，NVDA / GOOGL 800V DC 小量出货节奏提前到 2026 Q3，作为 800V / CPO 方向未坏的 anchor evidence。
- `2066340661633372452` — 2026-06-15，中国放松 InP substrate 出口预期缓解 photonics mass production bottlenecks，直接指向 AXTI / IQE / AAOI / LITE / SIVE。
- `2066498742942159288` / `2066509405634597036` — 2026-06-15，Serenity 继续把 SIVE 定位为下一代 photonics 的 foundational / primary-source laser，尤其连接 JBL、Ayar、NVDA NVLink CPO ecosystem。
- `2066535221554733278` — 2026-06-15，欧洲核心 longs 复盘中把 SIVE / LPK / SOI / RPI / IQE / ALRIB / XFAB 归为欧洲 photonics / supply-chain chokepoint 集合。
- `2066707573139763211` / `2067206734427697196` / `2067626358940082653` — 2026-06-16 ~ 2026-06-18，AMD CW laser supply 需求成为新的验证线；SIVE / AAOI / Macom 被放在独立西方供给候选中，Lumentum / Coherent 因 Nvidia 产能锁定而更像 anchor 而非最大弹性。
- `2067033934194696469` — 2026-06-16，Mizuho 口径显示 CPO / 800V 没有延迟，optical engine 预期上修；Serenity 强调 InP DFB lasers 是更成熟的关注点。
- `2067267047781015579` — 2026-06-17，AEHR 获得 major silicon photonics customer 的 wafer-level burn-in follow-up production order，说明 photonics 测试设备也在进入量产链条。
- `2067216066905088237` — 2026-06-17，LPK 玻璃基板设备被 80% major global players 选中，Absolics / Samsung Electro-Mechanics / 可能的 TSM CoPoS 时间线给玻璃基板设备链增加新证据。
- `2067513458812473533` — 2026-06-18，ALRIB / Riber 的 ROSIE 和 BTO/STO photonics BD 证据，补充欧洲 MBE / photonics equipment 分支。
- `2067542382523122001` — 2026-06-18，AAOI / SIVE 被再次列为个人 favorites；她强调 photonics 仍早，更多收入 ramp 可能落在 2027 H1/H2。

处理口径：这组证据足以补强"估值回撤 vs 验证窗口"判断，但不能写成所有 photonics 小票都已去风险。回答时仍要分开：已验证的客户链、正在验证的 revenue capture、以及可能被时间线后推或客户链证伪打脸的条件。

## 支持信号

- Coherent / 产业 CEO 继续确认 CPO H2 2026 / H2 2027 时间线。
- hyperscaler ASIC / GPU / switch roadmap 对 optical interconnect 依赖继续上升。
- LITE / AAOI / COHR 等已验证 pluggable cycle,但 CPO 上游仍有更早期节点。
- SIVE、AXTI、SOI、FOCI、Nextronics 等节点继续出现 design-in、capacity、客户或政策证据。
- 卖方/媒体只追认大主题,还没有充分理解具体 chokepoint。

## 削弱信号

- CPO 量产系统性推迟,导致相关小盘只能停留在开发合同。
- 客户路线图改用替代架构,绕开 InP / CW DFB / 关键 FAU 或封装节点。
- 下游大客户砍 AI capex,使 photonics 从紧缺转成周期库存问题。
- 公司无法把 BOM 关键性转化成 material revenue / margin。
- 旧环节已经 fully crowded,但没有新一层 bottleneck 可接。

## 打脸条件

- CPO scale-out / scale-up 时间线被主流客户或供应商明确后推多年。
- 关键 chokepoint 被成熟替代方案 design out。
- SIVE / AXTI / SOI / FOCI 等代表节点的客户链被证伪。
- 市场只剩主题交易,但没有订单、capacity、qualification 或 revenue ramp 证据。

## 决策框架

1. **估值回撤**: AI capex 和 CPO 时间线没坏,只是小盘高 beta 或旧环节涨太快。
2. **验证窗口**: 量产方向还在,但某家公司客户链/收入 ramp 尚未证明。
3. **逻辑破裂**: CPO 时间线、材料依赖、客户链或 revenue capture 根本失效。

### 看多 / 支持条件

- Coherent / 产业 CEO / hyperscaler roadmap 继续确认 CPO H2 2026 scale-out、H2 2027 scale-up。
- AI ASIC / GPU / switch roadmap 对 optical interconnect 依赖继续上升。
- SIVE、AXTI、SOI、FOCI、Nextronics 等节点继续出现 design-in、capacity、客户或政策证据。
- 市场只追认大主题,还没有充分理解具体 chokepoint 和 revenue capture。

### 看空 / 减风险条件

- CPO 量产系统性推迟,小盘节点停留在开发合同。
- 客户路线图改用替代架构,绕开 InP、CW DFB、关键 FAU 或封装节点。
- 下游 AI capex 被砍,photonics 从紧缺转成库存周期问题。
- 旧环节已经 crowded,但没有新的更窄 bottleneck 可接。

### Veto / 禁忌

- 不把“光模块”当成完整 photonics thesis;必须拆到 BOM 和 chokepoint。
- 不把 NVDA / TSM 这类 anchor 当作 Serenity 体系里的最大弹性来源。
- 不把资本结构或 revenue capture 不能证明的 CPO 相邻概念当成直接受益股。

### 可证伪

- CPO scale-out / scale-up 时间线被主流客户或供应商明确后推多年。
- 关键 chokepoint 被成熟替代方案 design out。
- 代表节点的客户链被证伪。
- 市场只剩主题交易,没有订单、capacity、qualification 或 revenue ramp 证据。

板块内排序要按角色,不要按涨幅:

- chokepoint + Stage 0/1: 优先复核 SIVE、FOCI、Nextronics 等早期节点。
- chokepoint + 已重定价: AXTI、SOI 继续看下一段验证。
- bottleneck / 已兑现环节: LITE、COHR、AAOI 需要看是否还有新 ramp。
- anchor: NVDA、GOOGL、MSFT、AMZN、MRVL 验证方向,但不是最大弹性来源。
- Veto / 规避: 资本结构或 revenue capture 不能证明的 CPO 相邻概念。

## 如何发现下一站

沿 BOM 往更窄处问:

1. 当前大厂 roadmap 新增了哪种物理约束?
2. 这个约束的供应商是不是极少数、扩产慢、客户认证周期长?
3. 供应商市值是否仍按旧业务定价?
4. 它能不能把 BOM 重要性转化成收入和毛利?
5. 旧环节被追认后,资金是否正在迁移到这个节点?

## 常见误读

1. 光模块 = photonics。光模块只是其中一环,CPO 会改变 BOM 分配。
2. NVDA 涨 = 所有 photonics 受益。上游 chokepoint 弹性和风险都不同。
3. POET = CPO 纯受益。Serenity 对其资本结构和兑现能力明显更谨慎。
4. TSM / NVDA 是最大机会。它们是 anchor,不是她主要找的小盘错配。
5. H2 2026 量产 = 立刻收入兑现。她更看 2026 -> 2027 -> 2028 三段式。

## 用户可见术语翻译

- 800G / 1.6T: 数据中心光模块传输速率升级。
- CPO: 把光引擎放到芯片附近,降低互连功耗。
- FAU: 光纤阵列组件,把光信号接到封装和光纤链路。
- EML: 一类高速调制激光器,LITE 是代表。
- CW DFB: 持续波激光器,SIVE 是 Serenity 重点关注的代表。
- InP / SiPh: 光互连相关的关键衬底材料路线。

## Evidence Map

- "Photonics TAM goes from $14B -> $154B in two years" (id: 2055822766600016238, 2026-05-17)
- "GS predicts CPO from $1B -> $91B TAM" (id: 2052296867653066978, 2026-05-07)
- "Coherent CEO: CPO ... Scale-out H2 2026, Scale-up H2 2027" (id: 2052278391928500502, 2026-05-07)
- "TSM COUPE FAU bottleneck" (id: 2054365028820881794, 2026-05-13)
- "Last year I called out LITE, COHR, AAOI, AXTI. This year: SOI = AXTI, SIVE = LITE" (id: 2050790690591048002, 2026-04-21)
- "I cut some exposure in LITE COHR ... rotated to SIVE / Foci" (id: 2056558267896311996, 2026-05-19)
- "InP Chokepoint: The Bottleneck of the AI Buildout" (id: 2004936335702753729, 2025-12-27)
- "$POET literally won the Fake it Until you make it award" (id: 2056171199512891790, 2026-05-18)
- "CPO related ideas should not be judged in a 1 month timeframe" (id: 2065291889885274552, 2026-06-12)
- "$NVDA and $GOOGL lead 800V DC ahead of schedule" (id: 2066331049605627951, 2026-06-15)
- "China eased InP substrate exports... relieve mass production bottlenecks" (id: 2066340661633372452, 2026-06-15)
- "$SIVE is the next SIVE... primary/sole source with JBL and Ayar/NVDA NVLink CPO ecosystem" (id: 2066498742942159288, 2026-06-15)
- "Ayar ... likely made $SIVE primary source" (id: 2066509405634597036, 2026-06-15)
- "core European longs: SIVE / LPK / SOI / RPI / IQE / ALRIB / XFAB" (id: 2066535221554733278, 2026-06-15)
- "AMD scrambling for CW laser supply; SIVE / AAOI are obvious beneficiaries" (id: 2066707573139763211, 2026-06-16)
- "Mizuho: no CPO / 800V delays; optical engine estimates revised up" (id: 2067033934194696469, 2026-06-16)
- "AEHR follow-up production order from major silicon photonics customer" (id: 2067267047781015579, 2026-06-17)
- "LPK glass substrate equipment selected by 80% of major global players" (id: 2067216066905088237, 2026-06-17)
- "AAOI / SIVE are personal favorites; photonics revenue ramp mostly 2027 H1/H2" (id: 2067542382523122001, 2026-06-18)
- "AAOI + SIVEF likely guesses for AMD CW laser purchase agreements" (id: 2067626358940082653, 2026-06-18)
