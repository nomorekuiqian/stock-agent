# serenity-skill-v1 Gap-Fill 变更日志

> 生成: 2026-06-07 · 总编: Serenity 蒸馏总编
> Ground truth: `_audit/methodology-spec.md` (覆盖薄弱处 + 反模式 + A/B/C/D/E 轴)
> 语料基线: `evidence/all-tweets.jsonl` 1043 条 noise-filtered (2025-09-02 ~ 2026-05-24) + `evidence/recent-supplement.jsonl` 170 条补充 (延伸到 2026-06-07)
> 铁律: 只补 spec 里有 [stated]/[demonstrated] 支撑的内容; 删除一切"非她方法"(贝叶斯/概率打分、外部宏观分类、通用 stack-mapping 模板); 所有 napkin math / PT 标 speculative。

---

## 总览

54 个 skill 文件 (1 core + 1 macro + 7 framework + 9 sector + 36 ticker), gap-fill 分两批完成:

- **第一批**: core/bottleneck-operating-system + macro/ai-capex-cycle + 7 framework + 9 sector + 首批 16 ticker。建立模板对齐(适用问题 / 核心问题 / 公司或产业是什么 / 她看什么信息 / 她如何理解 / 决策框架 / 减仓与轮动信号 / 常见误读 / 输出模板 / Evidence Map)、删 Bayesian / 外部宏观分类、补 chokepoint vs bottleneck 二分。
- **第二批 (本轮)**: 26 ticker 全部 `patched=true`。重点是 (a) 用 2026-06 最新语料刷新已过时的 re-rate 锚 / PT 表述; (b) 给每个 ticker 补 spec A4 的 "chokepoint / bottleneck / 衍生受益分类" 小节; (c) 给每条信号挂 tweet_id; (d) 把所有 forward 估值降级为自标 speculative 的 napkin math。

两批合计覆盖 36 个 ticker(本轮 26 + 首批已含 SIVE/NVDA/AXTI/LITE/AAOI/NBIS/MRVL/COHR/SNDK/SOI 等核心)。Evidence 全部回得到 corpus。

---

## 按层关键修正

### core 层 (bottleneck-operating-system)
- **删"非她方法"**: 明确标注"贝叶斯先验/后验/全概率轮动"是中文读者二次归纳, 非她本人框架; 引她原话"凭主观判断来进行操作, 很大程度上取决于能否准确预判下一次的技术架构演进"(id 2060929513794515451)。同句拒绝外部宏观分类 / 通用 stack-mapping L1-L5 模板。该禁忌在 core 出现 3 次(总纲、信条、术语), 并向下贯穿到 framework / macro / 多个 ticker。

### macro 层 (ai-capex-cycle)
- **去外部宏观分类**: 把她对 Fed 的态度统一为"已 priced in 就忽略、stay long", 利率当解释短期波动的噪音背景; 误读表显式写"不要给她套宏观主导分类模型"(id 2062927167936504133)。

### framework 层 (7 个)
- ask-about-stock / ask-about-sector / ask-about-positioning 三处同步加"不要套贝叶斯/概率打分框架——她只承认 subjective 主观判断 + 预判下一次架构演进"。
- ask-news-decoder / ask-for-top-picks 承接 Serenity 高频问题:"反推下游受益链"与"跟单抄什么"。

### sector 层 (9 个) — 本轮主要动的 photonics / substrates 相关
- **photonics-and-cpo**: 升级到 2026-06-06 口径(GFS reference laser 默认路由、Win Semi CW 产能锁定、optical TAM 10x→~$141B / CPO 0→$81B), chokepoint/bottleneck 定义统一用更精确 tweet 2062433114933334487。
- **substrates / memory / neocloud** 配合 ticker 层修正(TSEM 从 substrates 迁到 photonics; SNDK bottleneck 范式; IREN 资本结构淘汰对象)。

### ticker 层 (36 个) — 见下"本轮 26 ticker 修正摘要"

---

## 纠偏 (删了哪些"非她方法" / 改了哪些过时或错误定性)

> 这是本次 gap-fill 最核心的价值: 不是加内容, 而是把"看似对但不是她"的东西拆掉。

1. **删 Bayesian / 概率打分 / 外部宏观分类 (全局, 最重要)**: core + macro + 4 framework + IQE/AXTI 等 ticker 一致标注"她只承认 subjective 主观判断、不套贝叶斯/评分/外部宏观分类/通用 stack-mapping"。这是 spec 覆盖薄弱处 #1 / #7 的硬红线。

2. **LITE: 删过时 re-rate 锚**。$26B 锚已过时, LITE 已走完 re-rate 到 ~$75B; "$60B+" 已于 2026-05 前兑现超越只剩回看意义, "$80B" 是给 SIVE 不是给 LITE 的对标。LITE 现作"已兑现模板 / 板块 beta 反向锚"用(id 2061815015892791408 / 2059242587354169403 / 2062433114933334487)。

3. **IREN: stance 从单点 bear 升级为五段式时间线 + 资本结构淘汰对象**。明确 IREN 既非 chokepoint 也非 bottleneck, 是 capex 漏斗受益桶成员中的"toxic financing structure"头号案例(到 2026-06-07 "basically trash"); spec A4 高信念重仓逻辑不适用, 误用框架去 frontrun 是错的; 不给 IREN 做看涨 napkin math(share count 持续 ATM 膨胀摊薄每股价值)。

4. **POET: stance 从静态 "bearish/avoid" 改为两阶段演进**(early promising 衍生标的 → MRVL 单客户爆雷 + 稀释定性后转 avoid)。解码为中游 optical interposer packager(非 chokepoint 非 bottleneck), 核心一句话 = SIVE 的 demand read-through; 补 fake-it-til-you-make-it 稀释定性、vs FOCI 估值错配。

5. **RDDT / TSEM 的 sector 错配修正**:
   - RDDT sector 从 `ai-infrastructure-mag7`(误导)改为 `software-non-ai-exception`; 纠正为高毛利 money printer + 网络效应护城河, data licensing 仅 ~5% 是非因子; 删掉原 "AI 数据 dual exposure" 误分类, 警告不要套 BOM/chokepoint premium/supply chain mapping。
   - TSEM sector 从 `substrates` 改为 `photonics`(TSEM 是 SiPh foundry 不是衬底), 新增 `classification=chokepoint` / `conviction=high`; 删除 "涨幅大 ($250+ MC)" 与无证据的 "AI photonics 量产关键 supplier", 改为有原话支撑的 "TSM of photonics / SiPh PIC 代工 chokepoint"; 修正 $TSIM typo。

**其他重要事实纠偏**:
- **MU**: 改正市值($1T 量级, 非 $80→$887 的混淆), 定位为核心内存持仓而非"占坑小盘"; 明确 MU=bottleneck 最佳美国敞口、AXTI=更深 chokepoint 并存。
- **SIVE: 纠偏 short squeeze**。把"短仓挤压预期"小节改写为"SIVE 从来不是 short squeeze play"(spec C13), 短仓浮亏只是 CPO 多头副作用(id 2053851494924034481 / 2062520852537917649); 决策框架/风险标签/误读表同步去 squeeze 立论。
- **MSFT**: 删未证实的 "Strong Buy MSFT (multiple)" 和无法验证的 quote id 1973693781888417816, 改为 grounded 的 capex-funnel quote(id 2062378784855368077); 新增信念分层标注 MSFT = 高覆盖分析入口 / 低-零直接持仓信念, 纠正"她看好 MSFT"的误读。
- **MRVL**: 把"MRVL > AVGO"从被当作"实际"改为被否定的误读(并列竞争者非排序), 把 Jensen "$1T/5x" 标为喊话催化锚/speculative 而非她建模的 PT。
- **AAOI**: 市值时间线由 ~$11.5B 修正为她本人原话 $12-15B 量级(随报价漂移), 弃用旧 $2.5B / $11.5B。
- **NVDA**: 删 NVDA 自身确定 PT, 明确"她做的是 NVDA 的供应链衍生品, 不是 NVDA 本身"; NVDA 不套二分, 是 funnel head + 衍生受益放大器(A10) + 命名预言机三角色。
- **NBIS**: 删开头 "她对 NBIS 的 PT: $400/1Y" 这句确定 PT; $400/$100B 降级为自标 speculative 上行锚; 公司数字标注为"财报 reiterate 口径, 非她推算"。
- **AMZN**: 新增"认知谦逊/自我纠偏"段, 承认当初 "光模块独家锁定" 假设被纠正为 more interchangeable / mass producible(spec A8/D15)。

---

## 新增方法钩子 (本轮系统性补的可复用结构)

1. **"chokepoint / bottleneck / 衍生受益分类" 小节 (spec A4) 普及到所有 ticker**: 每个 ticker 显式判定它是 chokepoint / bottleneck / 都不是(funnel 落点 / 资本结构桶成员 / 衍生受益)。典型: SIVE=both(最高 conviction); SNDK=bottleneck 范式; SOI/TSEM=chokepoint; NVDA/MSFT/META/GOOGL/AMZN=funnel 水源不是卡点; IREN/NBIS/WULF/RDDT=都不是。
2. **"forward 估值口径 (napkin math, speculative)" 小节 (spec B1/B3/B10)**: 所有给数字的 ticker 都标 speculative / 非确定 PT, 区分卖方 PT(如 SOI 的 Nomura、MRVL 的 Fubon)。
3. **"信念分层 (按覆盖度)" 小节 (spec C2)**: high(本体定性/反复表态)/ medium(napkin 建模)/ speculative(Jensen 喊话锚)三档, 逐条挂证据。区分"覆盖度 high"≠"必然兑现"(AXTI/IQE 显式免责 "Could always be wrong")。
4. **"frontrun 催化刷新" 小节**: 把 2026-06 最新催化(GOOGL $80B capex / AVGO networking insatiable / GFS reference laser / 玻璃基板 volume order)接到既有 frontrun 逻辑上。
5. **"减仓与轮动信号" 小节**: 区分"可能减仓理由"(税收 harvesting / 相对价值轮动 / thesis break)和"不该误当减仓信号"(displacement FUD 当买点 / 高 beta 暴跌 thesis 未破续持)。
6. **BOM 下沉表**: MSFT MAIA 链(ASIC→MRVL / 光 fabric→AAOI/COHR/Innolight / InP→AXTI/SMTOY / CPO 激光→SIVE)等, 把 funnel 源头落到具体卡点。

---

## 用最新语料刷新的表态 (1043 corpus + 170 supplement, 到 2026-06-07)

- **Goldman 四大 hyperscaler capex 上修**: 2025-2030 从 $4.5T → $5.3T(2026-2031 aggregate $7.6T), 钱"flows upward to tiny chokepoints like $SIVE/$SOI"(id 2062378784855368077, 2026-06-04)。写入 META / GOOGL / AMZN / MSFT / SIVE / photonics 多处作"漏斗放大"再确认。
- **GFS reference laser (2026-06-02, +54%)**: SIVE 成为走 GlobalFoundries 硅光的 BRCM/NVDA/MRVL/AMD 默认激光路由; CEO 产能 derisk 表态。写入 SIVE / photonics / AMD。
- **NVLink fusion (2026-06-03)**: Ayar 加入后 NVLink CPO 三家(Marvell Celestial/Lightmatter/Ayar)全走 Sivers → SIVE = "NVDA NVLink fusion CPO 生态结构性激光 chokepoint"(id 2062079425475473595/2062064540075123050)。
- **AVGO 2027 财报 read-through (2026-06-03)**: networking 毛利 insatiable → LITE 正向; TPU 压 AVGO 毛利; Google "diversity of sources" → MediaTek primary、不被 AVGO sole-source 卡住; 能见度到 2028。写入 AVGO / GOOGL / LITE / MRVL。
- **玻璃基板时间线 (TrendForce 2026-06-07)**: SKC Absolics H2 2026 × AMAT 供 AMD / Samsung electromechanics H2 2027 × Sumitomo 供 Apple/AVGO; volume order = 最直接兑现信号。写入 AMD / LPK。
- **JBL 1.6T LRO door-opener (2026-06)**: 拉动 SIVE pluggable TAM 横向扩张、forward pipeline +77%(标 speculative/方法推断)。写入 JBL / SIVE。
- **Jensen 2026-06 命名预言机更新**: memory shortage 多年 / SiPH supply beyond imagination / Vera Rubin N72 / MRVL $1T(留怀疑)。写入 NVDA / MRVL。
- **AXTI 2026-06-07 game-theory 定价口径**: few-hundred-million TAM 当 joke / 按 NAND 式 bottleneck 反推 MC(id 2063465386960736396), 配"方法本质免责"。
- **IQE 2026-05 主动加仓**: no-news -12.13% 暴跌时 "personally adding to positions"(spec C8/C17 直接演示), 同时诚实标注 "higher hopes than 3x+" 的略失望。

---

## 全局遗留 gap (诚实标注, 对齐 spec 覆盖薄弱处)

1. **没有可量化统一筛选阈值 / position-sizing 公式**(spec #1)。除零散定性锚点(25% 份额 / sold out / book value <1 / forward P/E / 50% haircut), 她从不给统一打分。已在所有相关层加"非她方法"免责, 但这意味着 skill 永远给不出"打 X 分就买"的机械答案——这是她方法的本质属性, 不是缺陷, 但模仿者易误填。

2. **下行 / 止损纪律偏定性, 缺事前量化 kill-switch**(spec #2)。"thesis break" 判定本身定性(=当初下注逻辑还在不在被事实强化); 她在重仓 SIVE 上"不卖一股、把反向消息当 disinformation 拆穿", 认知谦逊真实但偏弱、且不对称地只出现在低仓位/陌生领域(VIRT/IQE/AXTI 的 "could be wrong")。减仓与轮动信号小节只能给定性触发, 给不出数字止损位。

3. **薄板块信念未沉淀 + chokepoint/bottleneck 精确二分仅在光链密集**(spec #3/#6)。
   - power_semi(800VDC/GaN/SiC, NVTS/WOLF/XFAB)只有 core 标签 ~17 条, 多为众筹高信念探索, 信念未沉淀。
   - humanoid robotics 她自定性 directional long、坦言无法建模, 多 cross-reference 推断的 BOM。
   - 太空/国防/稀土(RKLB barbell)是 TLDR 清单为主, 深度低于光链。
   - chokepoint vs bottleneck 的刀切二分主要在 SIVE/InP 主线; 其他赛道她更多混用 chokepoint/bottleneck/point of failure, 本轮虽给每个 ticker 补了分类小节, 但部分(尤其非光链)是从行为归纳而非她成文规则。

> 其余 spec 薄弱处(做空/常备对冲覆盖薄 #4、期权 IV 错配仅 EWY 一例 #5、她公开承认自己集中度打法与建议给别人不同 #8)已在对应 ticker / framework 里就地标注, 不作为本轮新增 gap。
