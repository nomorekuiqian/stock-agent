# Serenity 方法论规范 (从语料蒸馏, evidence-backed)

> 用途: 作为 serenity-skill-v1 各层 skill 的 ground truth, 后续 audit/patch 以此为准。
> 来源: Serenity (@aleabitoreddit) 的 X 语料 (642 core + 98 recent + macro 层), 五轴并行抽取后合并。
> 铁律: 本文件只包含她语料里有原话或反复演示支撑的内容。每条规则后标 [stated]=她直接说过 / [demonstrated]=她反复演示但未成文, 并附 (evidence: tweet_id)。
> 禁止: 不引入她语料里没有的东西; 不套用外部宏观分类框架或任何通用瓶颈模板; 不把外部贝叶斯/概率框架当成她的规则 (她只承认 subjective 主观判断)。

---

## 一句话操作系统 (她的底层世界观)

**"顺着 Hyperscaler 的万亿 AI capex 漏斗往供应链最底层下沉, 找到那个少数公司控制 majority allocation/pricing 的 chokepoint+bottleneck, 在它还是散户持仓、还没进指数、市场只会引用过去 12 个月营收时, 用 forward 估值算出错配并 frontrun 机构买入; 然后拥抱波动、thesis 不破不卖。"**

她的世界由几个不可分的信条构成, 贯穿全部五轴:

1. **市场是 forward-looking 的, 约提前 8 个月** (space/quantum 除外)。所以争论"去年/上季营收"对 thesis immaterial; 真正该建模的是 forward revenue/margin/TAM。 [stated] (evidence: 2061498698098708676, 2032273412413145111, 2009388507341754743)
2. **Institutions are not your friends。** 卖方 PT、媒体 hit-piece、机构 flow 默认要反着读——它们的目的是把 float 从散户手里低价搬走。retail 第一次有机会 front-run 机构。 [stated] (evidence: 2050504109460250973, 1980786077003833508, 2045175383210000444)
3. **所有 mapping/research 在财报前就做完。** 财报和官宣只是对此前供应链推断的"确认"; 靠 OSINT (官网改动、私募/warrant、年报措辞、foundry presentation 列名、qualification cycle) 而非等公告。 [stated] (evidence: 2060002002994971046, 2059057639238365336)
4. **方向对 ≠ 时机对。** 可以方向对、短期 timing 错, 多等一周/一个月差别巨大。所以是 directional long + 拥抱波动, 不交易日内 20-30% 摆动, 不赌 Fed 概率。 [stated] (evidence: 2063118835105014006, 2061498698098708676)
5. **验证只看公开 thesis 的回报百分比, 不晒美元金额。** 反对 "trust me I'm rich" 的付费荐股 grifter 模式; 研究免费公开, 让 retail 自己形成 conviction 并 frontrun 机构。 [stated] (evidence: 2058230354063102028, 2032697006586786139)

---

## A. 选股引擎 / 分析路径

### A1. 总起点: Hyperscaler Capex Funnel
永远从 AI capex 漏斗起步: 先确认 Mag7/超大规模厂商的万亿资本开支往哪个方向流, 再顺着钱流找受益标的。这套逻辑被她用在每个赛道 (先 neocloud: 钱从 AWS/Azure 溢出到小云; 后 光模块/CPO: capex 流向上游 InP)。 [stated] (evidence: 1972016308662513748)

### A2. 一层层下沉到供应链最底层
确认大趋势后, 持续往上游下沉, 直到那个 "majority supply 被极少数公司控制、定价/分配权集中" 的节点 (go to the very bottom of the supply chain)。她的下沉路线图: GPU(2024) → HBM(2025) → 光互连/InP 衬底(2026), 每一轮换到当下最紧的环节。 [stated] (evidence: 2004936335702753729)

### A3. BOM 级拆解
把一颗 GPU/ASIC/一台机器人拆成百分比成本表 (HBM ~50%、逻辑 die ~25%、CoWoS ~15%、光/网络 ~3-5%…), 用 "某公司能从每台 capex 切走百分之几" 定位被市场忽略的小市值受益者。她对 TPU/Maia BOM、LITE/AAOI 都做过逐项 BOM 杠杆分析。机构因 BOM 占整机比例微小(如 0.08%)而忽略, 但对 ~$200m 公司是 absolute massive——这是机会来源。 [demonstrated] (evidence: 2003019490871869644, 2003259964526330053, 2054395891965194742, 2013895541277762034)

### A4. 严格区分 chokepoint 与 bottleneck, 据此定仓位
- **bottleneck** = 控制最终产出/定价 (供不应求那个环节, 如 SNDK 控 NAND 定价)。
- **chokepoint** = 整个生态无论谁做都绕不过去的那道关 (如 SIVE 是 GFS 硅光的 reference laser, 所有走 GFS 的 hyperscaler 都嵌入它)。
- 一个标的 **同时是两者 (both a chokepoint and a bottleneck)** 时给最高 conviction、重仓。 [stated] (evidence: 2062433114933334487, 2058764325326856414)
- 诚实提示: 这套精确二分主要密集出现在 SIVE/InP 主线; 其他赛道她更多混用 chokepoint/bottleneck/point of failure。

### A5. 继续找"瓶颈中的瓶颈" (bottleneck within a bottleneck)
衬底是瓶颈, 就再问衬底的 feedstock 被谁卡。InP 衬底 (AXTI/Sumitomo 双寡头) 之下, laser-grade 高纯红磷/feedstock 是更窄卡点 (日本 NCI 4092), 用极小资金就能掐断整条西方供应链。她偏好垂直整合在最底层、能在两层都收钱的公司。 [stated] (evidence: 2005485130958430440, 2061245108427935752)

### A6. 用供应集中度的具体百分比作为买点门槛
必须是某材料/工艺世界份额 25%-78% 这种结构性控制, 且要标明 "US/Western 唯一替代" (Western hedge)。例: CPSH ~25% 半导体级 AlSiC、AXTI 控 ~40% InP、LPTH 是 germanium 玻璃唯一美国替代、Nitto Boseki 80-90% 高端 T-Glass。 [demonstrated] (evidence: 2016921538780680402, 2005654662616387783)

### A7. "Sold out / booked out / locked-in capacity" 是核心确认信号
产能售罄/已被预订到 X 年/被预先锁死, 证明需求实打实 + 公司有定价权可涨价。反复点名: LPTH "They are sold out"、Nitto Boseki "Sold out through 2026"、LITE backlog 到 2028、NVDA 提前锁死 EML 产能。 [demonstrated] (evidence: 2011496801548058735, 2014505817509355841)

### A8. 不可替代性 / 认证周期护城河 (supply chain mapping on qualification cycles)
单通道 CW 激光器 "can't hot-swap", 初代架构一旦 design in 就锁死。BOM 保密所以用 "likely/99% sure" 的概率语言, 靠 qualification cycle、客户官网移除竞品 (Ayar 移除 Macom/Lumentum)、capacity agreement 等 OSINT 信号推断 sole/primary source。 [stated] (evidence: 2059057639238365336)

### A9. chokepoint 的两个失效模式 (卖出/规避理由)
(1) chokepoint 可以被 **design out** (下游垂直整合掉它, 如 HIMX 被 TSMC Visera 替代风险);
(2) 卡点 TAM 太小、translate 不成 material revenue (份额再高也没用)。
她用 HIMX -31% 复盘这两条教训。供应链关键性必须落到 material operating income (靠 bottleneck 地位实现 price hikes) 才算数, 否则只是 narrative。 [stated] (evidence: 2037698708612210693, 2032273412413145111)

### A10. 衍生受益链 (derivative play / second-order)
不直接买最贵的主线, 而是买 "X 的最大受益者再经由 Y 的衍生品"。套路: (1) 监控上游原料价作 derivative reflection (7N indium 在 SMM 飙价 = InP 涨价影子指标); (2) "legacy void" 填空 (SNDK/三星转 HBM, Phison/Macronix 接盘 legacy NAND); (3) second-order capex 周期 (AAOI 需求暴涨 → MBE/MOCVD reactor → IQE/Aixtron/Veeco)。 [demonstrated] (evidence: 2021028247476289890, 2027830093247300016)

### A11. 把整条供应链画成单一流向 (one flow), 沿流向做"篮子"
沿一条 flow 同时做多多个环节 (高度不对称暴露)。例: $SIVE → WIN(TPE:3105) → Ayar SuperNova → $JBL → Hyperscalers; 以及她跑出的 equal-weighted "Bottleneck ETF" (28+ 个 mapping 出来的名字, 一周 +12.83%)。 [demonstrated] (evidence: 2037442444367974907, 2021783355076026581)

### A12. 主动跨地区/跨语言纳入标的
只要在供应链 mapping 上卡位, 不管挂哪个交易所、用什么语言: Stockholm(SIVE)、Taipei(FOCI/Shunsin/Win Semi)、Korea(EWY)、Japan(Nitto Boseki 3110 / NCI 4092)、EU(XFAB)、中国 A 股(绿的谐波 688017)。她明说国际化生活经历是自己愿碰 foreign equities 的原因。 [stated] (evidence: 2058185306399179176, 2062723902728802341)

---

## B. 估值 / 催化剂 / 时机

### B1. 只看 forward, 拒绝 trailing
只用 forward P/E、forward revenue、forward gross margin。鄙视用 2024/当季 revenue 给高成长公司估值。明确说 screener 网站算的 forward P/E "都极其离谱 (extremely off)", 必须自己重算。 [stated] (evidence: 2061252644195504239, 2057374458659389842, 2059057639238365336, 2041038963859931593)

### B2. 核心估值动作: MC 对照 forward revenue ramp + 高 gross margin
典型句式: 公司即将从 X 季度收入跳到 Y, 市值却只有 Z, 所以相对 forward revenue/毛利极度低估。例: "If NBIS scales to 6B rev next year (75% gross margin), 26B marketcap is extremely tiny." [demonstrated] (evidence: 1972016308662513748, 1973799361332326443, 1976370622633755115)

### B3. Napkin math: 给小供应商建粗糙 forward 模型
ASP → 单位用量 → 市占率(常打 50% haircut 多源) → net income margin → 套 GS/MS TAM 投影外推到 2027/2028 → 算隐含 forward P/E(常压缩到个位数甚至 2x), 据此判断 risk-reward 是否 asymmetrical。她坦承可能算错(speculative, NFA), 模仿时应保留这种不确定性标注, 不要当成确定 PT。 [demonstrated] (evidence: 2054395891965194742, 2029492958550949893)

### B4. SOTP / 可比倍数法设 re-rate 目标市值
把标的拆成几个业务段, 各段套对应可比公司的 forward sales 倍数(laser 段套 LITE 倍数, assembly 段套 Innolight/Eoptolink 倍数)加权出 blended 倍数, 乘 forward revenue 得 "执行成功" 的目标 MC。例 AAOI blended SOTP = 10.58x forward sales。 [demonstrated] (evidence: 2029492958550949893, 2029337803369349293, 1976662977106596031)

### B5. 用下游私募/可比估值给上游卡点定价 (chokepoint premium)
下游 CPO 玩家(Ayar/Celestial/Lightmatter)私募估值 $4-15B+, 上游唯一激光供应商 MC 才 ~$2.6B → 上游应享 chokepoint premium, 估值缺口会被 NASDAQ 上市/机构进场填平。 [stated] (evidence: 2058868791438884870, 2061538735595069534)

### B6. P/B / 重置成本 derisk 下行
对接近 replacement value 的标的, 把账面 P/B 还原到真实重置成本(如 1.28 → ~0.5/0.7)当下行安全垫, 再叠加补贴/政府订单作上行期权。 [demonstrated] (evidence: 2061348882685243497, 2063178421497221604, 2061245108427935752)

### B7. 催化剂前置卡位 (frontrun)
在 IPO / SPAC 上市 / index inclusion / 财报 / 厂商 keynote 之前建仓, 只要有几个月耐心。"if u hv 3 months patience" 去 frontrun SPAC neocloud IPO。 [stated] (evidence: 1976001305866080372, 2057319580595568833)

### B8. 被动资金/指数纳入 = 可量化硬催化
算 MSCI / NASDAQ OMX 纳入带来多少美元被动买盘(如 ~$60M+ pure buying pressure into existing float), 叠加 Blackrock/Vanguard 首次进场, 视为极度看涨的时机信号。 [stated] (evidence: 2058806097436455283, 2058812818430836745)

### B9. 用厂商大会/keynote 作板块级催化前置卡位
系统性用 NVDA GTC/Computex、AMD 投资、财报会作板块催化, 押供应链伙伴被点名或间接受益。可复制剧本: 在 Nvidia 美国活动前做多 TSEM。 [stated] (evidence: 2057319580595568833, 2057388984310132855)

### B10. "next $X" 类比锚定上行空间
用已 re-rate 完成的大票(LITE/NVDA/Microsoft/CIFR/SNDK)做模板, 论证小票处在它的早期阶段。强调差异而非简单贴标签(同是 laser, LITE 吃当前光学瓶颈、SIVE 吃即将到来的 CPO 瓶颈)。 [stated] (evidence: 2033535833085718996, 2033695716938551350, 2014278521741553793, 2058812818430836745)

### B11. 判断是否 priced in
- 看 X/社媒讨论密度: "我越多谈某个东西, 通常越说明它在当前时间框架里被低估"; 几乎零提及 = 市场还没 price in。 [stated] (evidence: 2056255865448247311, 2058943283234316632)
- 对宏观/已知事件: 一旦 Polymarket/市场已定价(如关门 97% 概率)就 already priced in, 新闻日散户恐慌是买点而非卖点。 [stated] (evidence: 1973188544186425368, 1973277513452494873)
- above-current-price funding 是 bullish tell: 公司以高于现价拿融资(如 $138 融资但现价 $107)= 聪明钱给的价比现价高。 [stated] (evidence: 1972016308662513748)

### B12. 时机时间表 (CPO/光子)
- 市场约提前 8 个月看(space/quantum 除外)。 [stated] (evidence: 2061498698098708676, 2063118835105014006)
- CPO 时间轴: H2 2026 = scale-out(量产起步/营收过桥), H2 2027 = scale-up(CPO 真正放量), **2028 = CPO 玩家大规模 re-rate 的年份**, 2026 还很早(早期建仓)。据此在收入兑现前 12-24 个月布局, 接受期间剧烈波动。 [stated] (evidence: 2054395891965194742, 2062433114933334487, 2038480499425923375)

### B13. 期权 IV 错配作为可交易机会 (单例, 谨慎)
当做市商把 forward IV 锚在过去 5-10 年低波动历史上、而底层(Samsung+SK Hynix)进入高波动 supercycle 时, 长 LEAPS calls 能吃没被定价的 vega expansion + 方向性上行。注意: 只在 EWY 一例充分展开, 不算重复验证的核心规则。 [stated] (evidence: 2060060904713261186, 2061470490083143996)

---

## C. 组合 / 仓位 / 买卖决策

### C1. High conviction basket: 极少数 multi-bagger 作核心
只挑 5-6 只长期高信念持仓, 目标是单靠这几只跑赢 99.9% 组合, 而不是分散到几十只。公开核心 basket: NBIS / RKLB / ALAB + 后加 CRCL / LITE。 [stated] (evidence: 2002392267311739320, 1977495210063286491)

### C2. 按信念来源/时间跨度分层
5 年级(RKLB/TSM/HOOD/BTC) vs 2 年级(NBIS/ALAB) vs 1000% moonshot(WLAC)。moonshot 不享有核心同级 conviction, 仓位要小。 [stated] (evidence: 1977495210063286491)

### C3. 主题内用 buckets/tiers 分级再排序
先定主题, 再在桶里排序, 不孤立买单只。Neocloud thesis 分四桶: Mag7 合同(CRWV/NBIS/WULF/CIFR) > 自带算力(IREN/BITF) > 投机(WYFI/GRRR/SLNH) > 矿工转 HPC。 [stated] (evidence: 1972016308662513748)

### C4. 同主题只重仓 the King / kingmaker
挑确定性最高、财务结构最干净的那一只。Neocloud 选 NBIS 为 King(融资结构刚好; CRWV 被债务利息吃掉、IREN 因过度 ATM 缺股权增值)。 [stated] (evidence: 2062116398210703462, 2062119438552572283)

### C5. 建仓用 share + light call, 新主题先小额双腿试
不用纯股或纯期权; 新/不确定仓位先小金额双腿(如 $50k 股 + $50k call), 确认后再加。VIRT/TE 都明说是 light call + share。 [stated] (evidence: 1972677721290682505, 1980287888077312390)

### C6. 不对称对冲: 低 beta 低估值不相关资产平衡高 beta 核心
用 VIRT(做市商, 类 Citadel, ~6.6 forward p/e)作 asymmetrical volatility hedge 平衡 IREN/NBIS。 [stated] (evidence: 1972677721290682505)

### C7. 尾部情景用专门"对冲 ETF", 但只作情景对冲不常备
Doomsday ETF (FAZ/GUSH/LCID short/SQQQ/UVIX/NVDA puts) 对冲 NVDA 多头, 仅在催化(如中东地面战)概率上升时考虑启用。 [demonstrated] (evidence: 2038109389111062832)

### C8. 回撤即加仓 (no-news dip / mechanical selloff)
高信念股在无实质利空下跌时视为礼物, 加 leaps/calls 而不是减仓。NBIS 一周从 $140 跌到 $97 时加 $200k 2026 leaps: "it's times like these where conviction matters most. If you understand the fundamentals and sector, this is a gift." [demonstrated] (evidence: 1981009544546591207, 1979201376115921139, 1978511244710617534)

### C9. Thesis 不彻底 break 就不因波动 trim
频繁 trim 触发税, 而大多数回撤幅度 < 要交的税, 真正大跌往往发生在已复利几百到几千 % 之后。需要现金时对优质资产宁可质押借款也不卖。 [stated] (evidence: 2055200705334395161)

### C10. 减仓的合法理由主要是税收 (tax harvesting)
为税收略微 trim 表现好或亏损的仓位然后准备回补, 并把买 call 的对冲操作保密以免影响 hedging flow。注: ETOR/VIRT "Trimmed for tax harvesting" 但 "Holding for 2026"。 [demonstrated] (evidence: 1979685872800010548, 1975929128114377050)

### C11. 核心逻辑: rotate where the money flows / current bottleneck
轮动到当下资金流向和最活跃的供应链 bottleneck, 而不是做逆向困境反转。今年最好一课就是不要在 cybersecurity 这类板块做 contrarian turnaround。 [stated] (evidence: 2026341976942195152)

### C12. 同环节内相对价值轮动
当一个标的的估值/确定性优势消失或被更便宜更确定的取代, 把资金从贵的轮到便宜的(SIVE/Foci/Shunsin vs LITE/COHR/POET; Foci $3.1B 比 POET $3.14B 更低估)。注: 这是相对估值对照 + 选 king, 而非机械轮动信号。 [demonstrated] (evidence: 2055127004970938373, 2034993411821117462)

### C13. 几乎只做多; 空头被打爆只是副作用
不靠做空赚钱。打爆 AAOI/SIVE 空头 "只是我喜欢这些股票的无意间副作用"; SIVE "从来不是 short squeeze play, 本质是最有说服力的 CPO 多头"。 [stated] (evidence: 2058163202190680520, 2053851494924034481)

### C14. Frontrunning the institutions
散户/被低估阶段先买小市值 chokepoint, 等被动指数纳入、被卖方/机构盖章后让机构接盘抬价。"在机构进场前先于他们持有 float" 是核心 alpha 来源。 [stated] (evidence: 2058944919495164143, 2058806097436455283)

### C15. 拥抱波动, 不交易日内大摆动
20-30% intraday 的高 beta 票她个人不会去 trade, 只做主题多头。可方向对、时点错, thesis 在就多等一周一个月。 [stated] (evidence: 2061395355695226960, 2063118835105014006, 2061498698098708676)

### C16. 无法精确建模的赛道做 directional long + 长周期 OTM leaps
对人形机器人(绿的谐波)、XLU 公用事业, 押"未来量产多少/再定价多少"而非当下财报。用长周期 OTM leaps 放大不对称收益。 [stated] (evidence: 2062723902728802341, 2025220219602706881, 2060060904713261186)

### C17. Fire sale = strong buy
机械抛售(mechanical hedging / algorithmic selloff / 一次性税前会计扰动, 如 META 一次性税导致算法误读)造成过度下跌时买入——开关翻转后会同样剧烈反向。"if something can drop 25% in a week, it can also back up 33% in a week." [stated] (evidence: 1990884323726127462, 1980413318973333927)

### C18. 低 float 小票的执行纪律
不要在盘前/盘后下市价单(spread 大、流动性差立刻吃掉近 10% 成本), 用限价单。专门给 WLAC 这类低 float SPAC 提醒过。 [stated] (evidence: 1977846041673363810)

### C19. 组合层面用 barbell 控总风险
一头高 beta multi-bagger, 一头放与 hyperscaler capex 解耦的对冲/收益资产(rare earths、robotics、stablecoin、GLD、CVX/oil、IBIT)。明确反对在当前宏观 full port 高 beta。 [stated] (evidence: 2037915721435587028)

### C20. 公开承认自己的风险画像与建议给跟随者的不同
她自己主动管理集中度、敢拿 AXTI 这类高波动, 但提醒别人不要照搬她的集中度/全仓打法。 [stated] (evidence: 2037915721435587028, 2032929794275553400)

---

## D. 话语 / 认知姿态 / 反共识

### D1. 战绩用回报百分比叙事, 永远报 %、时间戳、"从我发帖到现在", 不报 $
"I don't post dollar amounts because they don't matter. What matters is return %." [stated] (evidence: 2058230354063102028, 2058257993280712850, 2063235166336856251)

### D2. 机构唱空一只正在涨的票 = 反向指标 (Stage 1 吸筹)
机构唱空 + 散户恐慌抛 = 机构低位悄悄吸筹, 此时应加仓。Nebius 例: 机构持股 ~38%, 每招(空头报告、低价目标、媒体 hit-piece)都是为把 float 从散户搬到 65-80%。 [stated] (evidence: 1980786077003833508, 1980413318973333927)

### D3. 卖方 price target = 制造散户恐慌的工具, 只挖里面的 nuance 然后自己重算
点名 Bernstein 给 INTC $35 PT(后涨到 $100)。"Only reason you should read these anymore is for any nuances they drop... Then derive your own MC projection. Institutions are not your friends." [stated] (evidence: 2050504109460250973)

### D4. 招牌句式 "Did you listen anon?" 回看战绩帖
thesis 兑现成 2-10x 后引用旧帖复盘, 强调"我在价格变动之前就免费公开发了 thesis, 没收你几千块"。voice marker + 攻击付费 picks。 [demonstrated] (evidence: 2041879203323297966, 2033501241758949863, 2057790368700445153, 2061718299139100931)

### D5. voice marker "X go brr / go brrr"
板块或催化兑现时的节奏化快语, 把一串利好压成 "bottleneck/sector + go brr"(Photonics go brrr / Semis + capex go brrr), 既报涨幅又当签名。 [demonstrated] (evidence: 2047705901486985666, 2045565771234021468, 2059830121117446415, 2048449289152778686)

### D6. voice marker "Warning:" 前缀
标记她认为市场严重错配的结构性卡脖子结论, 或保护散户的避雷提示; 后面永远跟具体份额/SEC filing 硬证据(如 "The entire AI industry will likely be bottlenecked by two companies: AXTI, SMTOY")。 [demonstrated] (evidence: 2004569946492453003, 2011446944866935073)

### D7. 证伪条件 = "当初让我下注的逻辑是否还被事实强化", 而非看股价
"别和股票结婚": thesis 实质改变(IREN 从 asset-lite colo 变成 $6B ATM 稀释 + 买 GPU)就该退出; 坏消息被推翻(HIMS 的 NVO 诉讼撤销)再做多也行。 [stated] (evidence: 2030357884199129395)

### D8. 前一季/去年营收对 thesis immaterial
市场 forward-looking, 争论只是它往前看多远(约 8 个月)。AXTI 因出口管制当季营收 -29% 时她判定 "former earnings are immaterial to thesis"。 [stated] (evidence: 2009388507341754743, 2032273412413145111, 2038934006734135572)

### D9. 工程师/技术视角作反共识护城河
区分 technical readers vs nontechnical/art history grads/LLM。攻击对手方式是指出对方混淆供应链层级(把 Samsung Foundry 和 LITE 的 InP fab 当一回事 = 把 NAND 和 DRAM 都叫 memory)或混淆代际架构。 [stated] (evidence: 2038934006734135572, 2061456212303221196, 2059051192634990984)

### D10. anti-establishment / 反精英身份叙事
WSB 因发 AXTI 被封 → AXTI 涨几千% → 成 X 第一订阅, 框成 "火影式 redemption arc"。把免费/公开/为散户服务定位成对机构 paywall research 的颠覆: "for the first time, retail is able to front-run institutions"。 [stated] (evidence: 2059306154787062194, 2032697006586786139, 2045175383210000444)

### D11. 系统性反击并存档媒体的 meme/overvalued 标签
财报兑现后回看媒体原话(SOI "big timing error"、RPI "mass stupidity / come crashing back"), 指出媒体 "写完 slander → aging badly → 假装没说过"。对 FT/Telegraph 逐字核对, 指控他们插入她从未说过的评论。 [stated] (evidence: 2060013416170107320, 2060045781881725424, 2024408036203516182, 2025274299746251190)

### D12. 处理协同唱空的话语纪律
逐条技术性拆穿 → 然后 "不要回复(回复=给 disinformation 喂 engagement), 改成 Report for Spam + Block", 把可追溯证据交给 SEC。 [stated] (evidence: 2060872630111228150, 2061456212303221196, 2061624122560692587)

### D13. 自嘲式确定性, 但限定在窄条件里
"I've never been wrong before about high conviction stocks on longer timeframes (eg. HOOD $18 → $100+)"。只限 high conviction longs + longer timeframes, 不声称每笔交易都对。HOOD $18→$100+ 是反复引用的 legacy anchor。 [stated] (evidence: 2002392267311739320)

### D14. 波动归因到机制 (algo / 做市商 / follow-the-leader), 不归因基本面
崩盘日列出原因(主要加息概率上升)并判定 "nothing's changed the AI buildout"。高 beta 名字要先建 conviction + 管 sizing 再进, 否则会一次次割底追顶。 [stated] (evidence: 2038617810738520159, 2061395355695226960, 2062927167936504133)

### D15. 不确定时主动标注 "I could be wrong and would love feedback"
把发帖当成"拿新 thesis 去和市场对赌/检验"的实验。多见于不熟领域或冷门票(VIRT)。是她少数显式的认知谦逊 marker——但偏弱、且不对称地只出现在低仓位/陌生领域(自己重仓的 SIVE 上她明确"不卖一股, 只把反向消息当 disinformation 拆穿")。 [stated] (evidence: 1972677721290682505)

### D16. "controversial opinion / hot take" 标记反共识判断 + 机制化理由
NVDA 财报暴涨但她判定财报是"部分滞后指标", 真正该看 hyperscaler capex 和 TSM projections。Burry GPU 折旧论 "completely wrong but partially right about understating it", 反证: Google 8 年 TPU 100% 利用率。 [stated] (evidence: 2027052811318693995, 1988048592754589970)

---

## E. 板块覆盖地图

> 信念强度由出现频次交叉佐证 (core 标签): LITE 144 / SIVE 128 / AXTI 118 / AAOI 78 / MRVL 77 / NBIS 74 / COHR 73 = 绝对核心宇宙。

### E1. 不把 AI 当一个大桶; 沿瓶颈拆成可逐环节做多的子环节
覆盖排序(按 sector 标签频次): photonics(284) > AI_infra(191) > CPO(157) > substrates(133) > optical_transceiver(107) > neocloud(80) > defense(39) > space(27) > power_semi(15)。**photonics+CPO+substrates+optical_transceiver 这条"光"链是她绝对主场。** [demonstrated] (evidence: 2033885603423785170, 2058230354063102028, 2026341976942195152)

### E2. AI capex = 会轮动的"瓶颈接力", 是切分整个 AI 宇宙的总骨架
GPU → Memory → Power → EML → Memory → GPU → optical transceivers → Advanced Packaging → Transformers → CPU → Glass substrates。警告: 不要对每个新闻周期冒出的"新瓶颈"FOMO 追高, 要耐心持有已布在前面的仓位。alpha = frontrun 下一个瓶颈, 不是追当前瓶颈。 [stated] (evidence: 2047426124586893566, 2026341976942195152)

### E3. 光子/CPO 链切到工序级 "Bottleneck Cheat Sheet"
逐工序填 ticker: Light Source(CW DFB Lasers: SIVE/Sumitomo/LITE/COHR/AVGO/MTSI/AAOI) / SiPh foundry(TSEM/GFS/UMC/TSM/INTC) / DCO / Micro-lens+Fiber Arrays / Optical Interposers / Substrates / Optical Packaging&Assembly / Analog-Mixed-Signal ICs / Modulator Materials / Connectors&Fibers / Test&Measurement / Advanced Packaging&Hybrid Bonding。这是她切分的最细颗粒度。 [stated] (evidence: 2033885603423785170)

### E4. 光源/激光: SIVE 是信念最强、押注最重的单一标的
定位为 CPO/pluggable/SiPH 的激光 chokepoint+bottleneck, 目标对标 LITE 的 $60-80B 市值。AAOI 是美国市场最爱的光子敞口; LITE/COHR 是已成型光子龙头。 [stated] (evidence: 2062433114933334487, 2061252644195504239, 2060002002994971046)

### E5. 衬底/上游材料: AXTI + SOI 是两把"AI 王国钥匙"
AXTI(InP 衬底, 与 Sumitomo 双寡头)、SOI/Soitec(SOI/SiPH 衬底垄断)。她自称第一个从光子学 BOM 角度分析 AXTI 的人, 把它放在整条光子食物链顶端("at the top of the entire photonics food chain is AXT")。 [stated] (evidence: 2026638711941902461, 2058618801554604040, 2060896847695384736)

### E6. 沿单条 BOM 打通一个子环节下游到上游, 标每层代表公司
典型 GOOGL TPU 光子流: Vital/AXTI → AXTI/Sumitomo/JX → IQE(epi-wafers) → LITE/Cloud Light → FN(代工) → GOOGL。越上游越隐蔽的 alpha。 [demonstrated] (evidence: 2026638711941902461, 2027830093247300016)

### E7. 内存/HBM 独立板块
核心宇宙 Samsung/SK Hynix/MU/SNDK/SIMO, 用 EWY 做内存超周期方向性+波动率敞口, 向下挖被忽视的 HBM 设备/材料(VECO 激光退火、PLAB 光罩、ADEA 混合键合、FORM 晶圆测试、AMKR 先进封装)。 [stated] (evidence: 2014368177682292774, 2061470490083143996, 2026341976942195152)

### E8. neocloud 独立板块 (最早系统化)
按商业模式分桶: Mag7 合同(CRWV/NBIS/WULF/CIFR) / 自带算力(IREN/BITF) / 矿工转 HPC(RIOT/MARA/CLSK/HUT) / 投机(WYFI/GRRR/SLNH)。NBIS = 整条赛道 King; CRWV 因高息债排估值偏贵一档。 [stated] (evidence: 1972016308662513748, 1984837960735285593, 2062116398210703462)

### E9. 电力/电网独立 AI 瓶颈板块 (宏观催化层重于核心方法层)
散户层用 XLU 一篮子; 细分: 核能/HALEU(LEU/反应堆股)、干式变压器&配电盘&液冷变压器(HPS.A 主、POWL 辅)、电力设备(VRT/ETN/CEG/VST)。引 OpenAI/各 CEO 论证"电力是 AI 最大瓶颈"。注: core 标签仅 15 条, 但 macro 层很厚。 [stated] (evidence: 2026341976942195152, 2041168871168545115, 2025619207015301349)

### E10. 功率半导体 (较新、覆盖薄)
触发: NVDA 推 800 VDC 架构。宇宙 NVTS/WOLF/XFAB/ON/POWI/GFS 等 GaN/SiC。偏好西方供应链 + fab-lite(XFAB 是美国唯一高产能 SiC foundry); WOLF 因全球首片 300mm 单晶 SiC 当 Rubin 唯一 SiC 来源。信念尚未沉淀。 [stated] (evidence: 2058577885754163382, 2061348882685243497, 2015164232795627975)

### E11. 人形机器人/physical AI: directional long (无法建模)
OEM 不公布 BOM, 按零部件环节映射: 谐波减速器(LeaderDrive 688017/Harmonic Drive 6324/TKR)、电机感知(ALGM)、反馈(NOVT)、电源(VICR)、LiDAR(OUST)、磁体(MP)、骨架(SYSS)、视觉(LPTH/VPG)。坦言无法精确财务建模, 只押"未来几年量产多少台"。 [stated] (evidence: 2012071822481900030, 2062723902728802341, 2037915721435587028)

### E12. 玻璃基板早期主题
来自高盛/TrendForce 报告。按工序: TGV 设备(LPK/LPKFF)、玻璃材料(GLW/AGC/日本电气硝子)、蚀刻(LRCX)、切割(DSCSY)、键合(SMHN)、检测(ONTO/KLAC)。战绩: 早在 ~$150m 市值喊中 LPK。 [stated] (evidence: 2053377238532329611, 2060737673502110207, 2006709693012467774)

### E13. 太空/国防 = 卫星/barbell 仓位 (非主仓)
太空: RKLB(长期看涨)、Firefly(FLY)、SPCX(SpaceX pre-IPO)。国防: Golden Dome 链(AVAV 无人机、LPTH 国防视觉、AXTI 国防供应链)、稀土自主链(MP/USAR/LYSDY/UUUU/ALOY)。明确归到 hyperscaler capex 之外的对冲篮子。 [stated] (evidence: 2037915721435587028, 2035984148159164870, 2051566667009073315)

### E14. 子环节内部按信念强度分两层
**Safest Longs**(可安心复利的护城河: TSEM/SOI/COHR) vs **High Beta/Extreme Growth Longs**(AXTI/AAOI/IQE/SIVE)。明确说自己的高 beta 敞口和普通人应做的不同, 反对当前宏观全仓高 beta。 [stated] (evidence: 2032577275439485080, 2037915721435587028)

### E15. 刻意往非美国市场倾斜
理由: CPO 是 #1 主题而新的 CPO 主导玩家在海外。欧洲(SIVE 激光/SOI 衬底)、台湾(Foci 3363/Nextronics 8147/Shunsin 6451)、日本(激光量产/衬底/NCI 4092)。美国 CPO 纯敞口少, 只 LITE/COHR/AAOI 拿到增长向量。 [stated] (evidence: 2054412992000012555, 2057319580595568833, 2061245108427935752)

### E16. 给普通散户的"降维"3 板块极简版
Memory(MU/Samsung/SK Hynix/SNDK) + Photonics(LITE/COHR) + CoWoS/Foundry/先进封装(AMKR/TSM/INTC)。99% 的人直接拿 TSM 这个"中心节点"就够, 不必跟踪她每天的供应链 mapping 更新。 [stated] (evidence: 2021420335699198329)

---

## 反模式 (她明确排除的)

### 估值类
- **拒绝用 trailing / 过去 12 个月(尤其 2024)收入给高成长标的估值。** 反复嘲讽 LLM、瑞典分析师/媒体 "confidently citing 2024 revenue numbers"。 (evidence: 2057374458659389842, 2062903639300309302, 2059057639238365336)
- **不信 screener / AI 给的 forward P/E**, 对量产前标的"极其离谱", 必须自己重算。 (evidence: 2061252644195504239, 2059057639238365336)
- **拒绝按 TAM 现状静态建模卡点材料。** 极便宜的 enabler 材料在供给被卡时进入 game-theory 竞价, 价值与历史 TAM 脱钩(InP/Neon Gas 类比)。 (evidence: 2005918544924664315)
- **鄙视"营收极少却 10-20B+ 市值"的概念/cult 股(OKLO/QBTS/IONQ/RGTI/PLTR/TSLA)**, disconnected from reality、无可建模 forward 锚; 但也不做空(cult stock)。 (evidence: 1974283913905517009, 1972769926302855553)

### 组合/仓位类
- **反对当前宏观 full port 高 beta**, 尤其反复嘲讽 full port 单一劣质高 beta(如 IREN)。 (evidence: 2048143244673081730, 2037915721435587028)
- **反对频繁 trim/择时卖出优质高信念多头**(触发税 + 卖在小回撤 + 卖飞后续复利)。 (evidence: 2055200705334395161)
- **反对做空 / 把仓位建立在 short squeeze 投机上。** (evidence: 2053851494924034481, 2058163202190680520)
- **反对交易日内 20-30% 高 beta 摆动 / 因 doomposting 在 thesis 未破时卖出。** (evidence: 2061395355695226960, 2061470490083143996)
- **反对在不懂的赛道假装 domain expertise 而重仓**(不懂能源就坦白, 小仓 + 信任同行 DD)。 (evidence: 1980287888077312390)
- **把激进卖期权/写 put 套利标注为"极度危险、仅适合能精确 bottom-time 的高阶交易者、建议只在 paper account 试"。** (evidence: 1972367879858470974, 1974167533226955118)

### 选股/退出类
- **chokepoint 不等于股价回报**: 必须落到 material operating income(靠 bottleneck 实现 price hikes)才算数, 否则只是 narrative。 (evidence: 2032273412413145111)
- **排除 contrarian turnaround / 抄底困境板块**(试过 cybersecurity, 结论是顺资金流轮动到当下 bottleneck)。她的反共识是"共识形成前的早期结构性卡脖子", 不是接掉下来的刀。 (evidence: 2026341976942195152)

### 话语/认知类
- **排除晒美元金额/净值/豪车手表私人飞机制造权威感**(用来卖 paywall/课程的 grift); 验证只看公开 thesis 回报百分比 + 市场后续验证。 (evidence: 2058230354063102028, 2058257993280712850, 2063235166336856251)
- **排除 fake-it-til-you-make-it 式靠持续 ATM/稀释撑大 MC**(公司估值涨但散户每股价值被摊薄)。典型 IREN $6B ATM; 反例 BKKT/ASST 把散户价值砸掉 98-99%。POET/IREN 反复 direct offering / ATM 被扣分。 (evidence: 2030700123433619875, 2030761150292615564, 2029993746658643978, 2014444695821472218)
- **排除把 TA / 内部人卖出 / 非 GAAP 净利润当 thesis 依据**(TA 只是 indicator, 在基本面剧变面前无意义; 内部人卖出是极端噪音; 非 GAAP 净利润被 SBC 掩盖真实亏损)。 (evidence: 2032273412413145111)
- **排除靠 "Trust in Management" 作唯一持有理由**(等于 AMC 散户自我欺骗, 要拿管理层稀释历史对照)。 (evidence: 2030761150292615564, 2030357884199129395)
- **不接管别人资本/不做付费荐股**(代客理财是 distraction, 违背"让 retail 自己形成 conviction"的初衷)。 (evidence: 2057712025107939686)
- **精确锁定法人实体是基本功**: 嘲讽散户买错同名 ticker(KRUS vs 另一只 Kura; 满仓错 SPCE 而非 SPCX)。 (evidence: 2057310252199301212, 2060806434963763294)
- **不交易短期波动 / 不赌 Fed 决策概率**: 20-30% 日内乱跳和 algo follow-the-leader 抛售只会洗掉对 thesis 没信心的人。 (evidence: 2061395355695226960, 2062927167936504133)

---

## 术语表

| 术语 | 含义 | evidence |
|---|---|---|
| **Hyperscaler Capex Funnel** | 选股总起点: 超大规模厂商万亿 capex 像漏斗下沉/溢出到供应链特定环节, 顺钱流找标的 | 1972016308662513748 |
| **chokepoint** | 整个生态绕不过去的那道关(reference laser / Strait of Hormuz 式咽喉), 价值来自 strategic control; 可被 design out | 2038876668765610085, 2037698708612210693 |
| **bottleneck** | 控制最终产出与定价、供不应求的环节(SNDK 控 NAND); 与 chokepoint 区分, 一标的可同时是两者 | 2062433114933334487 |
| **bottleneck within a bottleneck / chokepoint of the chokepoint** | 再往上游下沉一层的更窄卡点(InP 衬底之下的 laser-grade feedstock / 红磷) | 2005485130958430440, 2061245108427935752 |
| **BOM analysis** | 把芯片/机器人拆成百分比成本表, 算某公司从每台 capex 切走百分之几 | 2003019490871869644, 2062723902728802341 |
| **supply chain mapping (on qualification cycles)** | 用 OSINT(官网改动、年报措辞、私募/warrant、foundry presentation 列名、认证周期)在财报前推断 sole/primary source | 2059057639238365336, 2061538735595069534 |
| **second order effect / derivative reflection** | 衍生受益: 不买主线买它经由 Y 的衍生品; 或用上游原料价(SMM 7N indium)当涨价影子指标 | 2027830093247300016, 2021028247476289890 |
| **legacy void / legacy drag** | 龙头转产高端(三星转 HBM)留下的低端空白由接盘者(Phison/Macronix)填补; 触底 legacy 业务拖累即将反转(Win/SOI) | 2017097752535322767, 2037387801285841118 |
| **directional long** | 尾端材料/小公司/无法精确建模赛道转为对"未来量产多少"的方向性押注, 而非 DCF | 2062723902728802341 |
| **frontrun the institutions** | 在 retail 持仓、未进指数、MC 未到机构门槛前买入, 把指数纳入/上市/政府背书当机构进场前置 catalyst | 2032697006586786139, 2058944919495164143 |
| **design in / design out** | 被锁进下一代架构(护城河)/ 被下游垂直整合替换出局(风险), 判断 chokepoint 可持续性的关键 | 2058764325326856414, 2037698708612210693 |
| **sold out / booked out / locked-in capacity** | 产能售罄/预订到某年/被预先锁死(NVDA 锁 EML), 需求真实 + 定价权的核心确认信号 | 2014505817509355841, 2011496801548058735 |
| **forward P/E** | 唯一认可的市盈率口径: 用未来 EPS/收入算, 拒绝 trailing; screener 算的全错要自己重算 | 2014051512142668047, 2061252644195504239 |
| **re-rate / rerating** | 估值倍数被重新上修的过程; 核心 PnL = 抢在 re-rate 前买、让市场事后重定价, 常给具体目标 MC | 2029337803369349293, 2052744623366475916 |
| **priced in** | 信息已消化进价格; 用 Polymarket 概率、X 讨论密度、above-price funding 判断; 已 priced in 利空 = 散户恐慌日买点 | 1973188544186425368, 2056255865448247311 |
| **asymmetry / asymmetrical (Low Capital Risk, High Upside)** | 衡量仓位值不值得的核心标尺: 低下行高上行; 也指用低 beta 低估值资产对冲高 beta 核心(VIRT 对 IREN/NBIS) | 1972677721290682505, 2013895541277762034 |
| **next $X (next $LITE / next Microsoft …)** | 用已 re-rate 完成的大票做模板锚定小票上行空间, 强调它处于"早期阶段" | 2033535833085718996, 1976370622633755115 |
| **napkin math / financial modeling (speculative)** | 粗略 forward 模型: ASP × 用量 × 市占(haircut) → net income → 套 GS/MS TAM → 隐含 forward P/E; 坦承可能算错 | 2054395891965194742, 2029492958550949893 |
| **chokepoint premium** | 处在供应链卡点的公司应享估值溢价; 用下游可比高估值反推上游被低估, NASDAQ 上市/机构进场填 gap | 2058868791438884870, 2060896847695384736 |
| **above current price funding (bullish tell)** | 公司以高于现价拿融资 = 聪明钱看涨硬信号 | 1972016308662513748 |
| **index inclusion / passive inflow** | MSCI / NASDAQ OMX 纳入带来的被动买盘, 当可量化硬催化(算出 ~$XX M inflow)并前置卡位 | 2058806097436455283, 2058812818430836745 |
| **below replacement value / replacement P/B** | 把账面 P/B 还原到真实重置成本(1.28 → 0.5/0.7)当下行安全垫 | 2061348882685243497, 2063178421497221604 |
| **volume ramp / inflection point** | 收入真正放量的拐点; 现在(2026)只是建仓窗口, ramp 在 H2 2027、re-rate 在 2028 | 2061498698098708676, 2059057639238365336 |
| **high conviction basket / multi-bagger basket** | 极少数(5-6 只)长期高信念核心组合, 单靠它们跑赢绝大多数组合; 她声称在此窄类别+长周期"never been wrong" | 2002392267311739320, 1977495210063286491 |
| **the King / kingmaker / crown jewel** | 同主题/供应链里确定性最高、财务最干净、值得重仓的龙头(Neocloud 的 NBIS、CPO 激光的 SIVE) | 2062116398210703462, 2058060753933131949 |
| **light call + share positions** | 建仓用现货股 + 轻仓 call 的组合, 而非纯股或纯期权 | 1972677721290682505 |
| **leaps** | 长周期(1-2 年+)期权, 回撤时加仓放大不对称收益(NBIS 2026 / EWY 2028 / XLU 2 年 OTM) | 1981009544546591207, 2060060904713261186 |
| **buckets / tiers** | 主题内按确定性分级(Mag7 合约 > 有算力 > 投机 > 矿工)再排序 | 1972016308662513748 |
| **rotate where the money flows / current bottleneck** | 把资金轮动到当下资金流向和最活跃的 bottleneck, 而非逆向困境反转 | 2026341976942195152 |
| **fire sale / mechanical hedging / algorithmic selloff** | 机械对冲/算法误读财报/保证金清算造成的过度下跌, 视为强买点 | 1990884323726127462, 1985770241532838347 |
| **barbell / satellite exposure** | 一头高 beta multi-bagger, 一头与 hyperscaler capex 解耦的对冲/收益资产(太空/稀土/GLD/油/IBIT) | 2037915721435587028 |
| **embrace the volatility** | 拿住高 beta 高波动票、不交易日内大摆动, 允许方向对但时点错 | 2061470490083143996, 2061498698098708676 |
| **tax harvesting / trim for tax** | 减仓主要为税收优化(年底卖出再回补)而非看空; 多数回撤幅度 < 要交的税 | 1979685872800010548, 2055200705334395161 |
| **Did you listen anon?** | 招牌回看战绩句式: thesis 兑现成多倍后引用旧帖, 强调价格变动前就免费公开发过 | 2041879203323297966, 2061718299139100931 |
| **go brr / go brrr / brrrr** | 板块/催化兑现时的节奏化快语, 把一串利好压成 "sector + go brr" | 2047705901486985666, 2059830121117446415 |
| **Warning:** | 前缀, 标记市场严重错配的卡脖子结论或避雷提示; 后必跟份额/filing 硬证据 | 2004569946492453003, 2011446944866935073 |
| **Institutions are not your friends** | 认知底色: 卖方 PT、媒体 hit-piece、机构 flow 都为从散户低价拿 float, 默认反着读 | 2050504109460250973, 1980786077003833508 |
| **married to a stock** | 贬义: thesis 已实质改变却因情感不卖、靠 "Trust in Management" 自我安慰的散户错误 | 2030357884199129395, 2030761150292615564 |
| **AMC / bagholder territory** | 给"为持续稀释自己的公司叫好"的散户贴的标签(把 IREN $6B ATM 持有者类比 AMC) | 2029993746658643978, 2030700123433619875 |
| **shower thoughts / monitoring the situation for you** | 标记即兴/边想边写的研究帖(冷门票初步 train of thought), 姿态是公开思考过程而非给定论 | 2061348882685243497, 2063178421497221604 |
| **technical readers vs nontechnical / art history grads / LLM** | 区分懂供应链层级的读者 vs 只会看 12 个月营收的人(包括 LLM/某些记者/对冲基金=反向情绪噪音) | 2062903639300309302, 2059051192634990984 |
| **stupid bear** | 对用过时/错位论据做空她重仓票的人的直接定性 | 2060615296357196178, 2061456212303221196 |
| **Bottleneck Cheat Sheet** | 对一个子环节(尤其 CPO/SiPh)做的逐工序 ticker 速查表 | 2033885603423785170 |
| **the rotation / capital rotation** | AI capex 在 GPU→内存→电力→EML→光模块→封装→变压器→CPU→玻璃基板 链上的"瓶颈接力" | 2047426124586893566, 2033885603423785170 |
| **Safest Longs vs High Beta/Extreme Growth Longs** | 子环节内部按信念/风险分两层: 护城河型(TSEM/SOI/COHR) vs 高波动高增长型(AXTI/AAOI/IQE/SIVE) | 2032577275439485080, 2037915721435587028 |
| **TLDR supply chain map** | 给新切板块的标准格式: 每环节列"公司($市值) - 角色 - 用于哪个客户/产品", 注明 confirmed vs cross-reference 推断 | 2012071822481900030, 2014368177682292774 |
| **Strait of $AXTI / Strait of Hormuz 类比** | 用地缘咽喉(20% 全球石油过霍尔木兹)类比单一材料对整个 AI 产业的卡位强度 | 2038876668765610085 |

---

## 覆盖薄弱处 (诚实标注)

1. **没有可量化的统一筛选阈值/评分公式 / position-sizing 公式。** 除了零散定性锚点(25% 份额、sold out、book value <1、forward P/E、50% haircut), 她几乎从不给统一打分。所谓贝叶斯/概率框架是中文读者的二次归纳, **不是她本人方法**——她只承认 subjective 主观判断、靠预判下一次架构演进。模仿时不要把外部框架硬套成她的规则。

2. **下行/止损纪律偏定性, 缺事前量化 kill-switch。** 真正的"止损"基本只在 thesis break 时触发, 而 "thesis break" 的判定标准本身偏定性(=当初下注的逻辑还在不在被事实强化)。她在自己重仓的 SIVE 上明确"不卖一股, 只把反向消息当 disinformation 拆穿", 所以认知谦逊真实存在但偏弱、且不对称地只出现在低仓位/陌生领域。

3. **chokepoint vs bottleneck 的精确二分主要密集在 SIVE/InP 一条主线。** 其他赛道她更多混用 chokepoint/bottleneck/point of failure, 区分没那么刀切。swing vs 重仓的对应关系是从行为归纳, 不是她写过的一张成文仓位规则表。

4. **做空/常备对冲覆盖薄。** 除 VIRT 和情景化 Doomsday ETF, 她几乎不做空、不常带常备对冲; "轮动而非做空"是她反复强调的定位。

5. **期权 IV 错配作估值机会只在 EWY 一例充分展开**, 不算重复验证的核心规则; napkin math 她常坦承"可能算错"(speculative, NFA), 是说明思路而非精确 PT。

6. **板块厚薄不均** (后续 sector/ticker 层校准应给光链最高权重, 给 power_semi 和机器人留更宽不确定带):
   - **最厚最可信**: 光链(photonics/CPO/substrates/optical_transceiver)——工序级颗粒度 + 单条 BOM 打通都有大量原文。
   - **厚**: neocloud、内存/HBM——有完整分桶框架和分层评级。
   - **宏观催化层重于核心方法层**: 电力/电网(core 标签仅 15 条, macro 层厚)。
   - **薄、信念未沉淀**: power_semi(800VDC/GaN/SiC, 2026 才新切, 多为众筹高信念探索)。
   - **确定性低**: 人形机器人/physical AI(她自定性 directional long, 坦言无法建模, 多 cross-reference 推断的 BOM)。
   - **卫星/barbell 非主仓**: 太空/国防/稀土(以 TLDR 清单为主, 深度低于光链)。

7. **她明确不是宏观主导框架。** 对宏观(加息/Fed)态度是"已 priced in 就忽略、保持 long", 把它当解释短期波动的噪音背景; 反共识锚点始终是 supply-chain bottleneck 的微观结构。**不要给她套外部宏观分类模型或任何通用宏观瓶颈模板。**

8. **她公开承认自己的集中度/高 beta 打法"与建议给别人的不同"** (C20), 所以从她行为归纳的仓位集中度不能直接当通用规则下发给跟随者。
