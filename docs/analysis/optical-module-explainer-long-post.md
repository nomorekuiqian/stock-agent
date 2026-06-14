# Optical Module Explainer Long Post Draft

## 可发布版本

光模块到底是什么？

为什么最近 $LITE、$AAOI、$COHR、$AXTI、$SIVE 这些名字突然被反复讨论？

如果你只把它理解成“AI 概念股又换了一批”，很容易看错。

更准确的理解是：

AI 算力的瓶颈，正在从 GPU 本身，往“GPU 之间怎么连接”这件事上转移。

光模块就是这条链里的关键零件。

一句话解释：

光模块负责把电信号变成光信号，通过光纤传出去，再在另一端把光信号变回电信号。

在普通互联网时代，它已经存在很多年。

但到了 AI 数据中心，问题变得更大。

GPU 集群越来越大。

服务器之间、机柜之间、交换机之间的数据流越来越密。

铜连接在距离、功耗、发热、带宽上开始吃力。

所以市场开始重新看光通信：

不是因为“光”这个概念新。

而是因为 AI 集群把原来不那么显眼的连接问题，推成了新瓶颈。

这也是为什么过去 72 小时很多讨论不再只讲 $NVDA。

它们开始讲：

$LITE、$AAOI、$COHR、$AXTI、$SIVE、$NOK、$MRVL、$CIEN。

要理解这条线，可以先把光模块拆成几层。

第一层：光模块本身。

你可以把它理解成“数据中心里的光电转换盒子”。

它一端接交换机 / 网卡 / 服务器电信号，另一端接光纤。

里面通常会涉及：

激光器、调制器、探测器、驱动芯片、DSP、封装、散热、光纤接口。

对应公司里，$AAOI 更常被讨论为光模块 / 光收发相关的代表。

$LITE、$COHR 则不只是“卖模块”，它们更多被放在激光器、光器件、材料平台、垂直整合能力里看。

第二层：800G 和 1.6T。

这两个词说的是传输速率。

800G 就是每秒 800Gbps。

1.6T 就是每秒 1.6Tbps。

AI 数据中心越大，对带宽的要求越高。

从 400G 到 800G，再到 1.6T，光模块的技术难度、功耗压力、良率压力和供应链复杂度都会上来。

这也是为什么 @KawzInvests 会去翻 800G / 1.6T 供应链的 earnings call。

因为真正重要的问题不是“大家觉得光模块热不热”。

而是需求有没有超过出货能力，订单是不是已经压到供应链上。

原帖：
https://x.com/KawzInvests/status/2065886285160444225

第三层：CPO。

CPO 是 Co-Packaged Optics，共封装光学。

传统做法是光模块插在交换机外面。

CPO 的方向，是把光学组件更靠近交换芯片，甚至和交换芯片封装在一起。

这样可以缩短电信号路径，降低功耗，提高带宽密度。

但它也带来新问题：

良率、测试、维修、散热、量产节奏，都更难。

所以市场在争论一件事：

CPO 是马上兑现，还是还要等到 2027 之后？

@cherryPayment 的讨论有价值就在这里。

他不是简单说 CPO 一定提前或一定延后，而是在拆不同环节什么时候开始兑现收入。

原帖：
https://x.com/cherryPayment/status/2064945251408568486

第四层：InP。

InP 是 Indium Phosphide，磷化铟。

它是一种 III-V 族化合物半导体材料。

为什么重要？

因为很多高速光通信里的主动光器件，比如激光器、调制器、探测器，都和 InP 有关。

AI 数据中心往光互联迁移以后，市场开始意识到：

真正的瓶颈不一定只在最后那个“模块”。

也可能在更上游的 InP 衬底、外延片、Epi wafer、材料供应和出口审批。

这就是为什么 $AXTI 最近被反复提到。

它不是典型的“光模块公司”。

它更像上游材料 / 衬底逻辑。

@Ariston_Macro、@LIWEI_TWCapital、@WealthCode99978、@wallstengine、@ParadisLabs 都在讨论这条线。

原帖：
https://x.com/Ariston_Macro/status/2065101015670743322
https://x.com/LIWEI_TWCapital/status/2065320470615130137
https://x.com/wallstengine/status/2064942274266775718
https://x.com/ParadisLabs/status/2065510031773061331

第五层：激光器。

光通信里最关键的不是“光纤”两个字。

而是谁能稳定、低功耗、高良率地提供光源。

这里会看到几个词：

EML：电吸收调制激光器，常被放在高速可插拔光模块里讨论。

CW laser：连续波激光器，常被放在硅光 / CPO / 外置光源链条里讨论。

ELS：External Laser Source，外置激光源，常和 CPO 架构一起出现。

泵浦激光器：用于光放大等环节，中文讨论里有人把它称为比 EML 更隐蔽的瓶颈。

这条线里，$LITE、$COHR、$SIVE、$AAOI 会被反复拿出来比较。

@tuolaji2024 就专门讲了泵浦激光器这个隐藏瓶颈。

原帖：
https://x.com/tuolaji2024/status/2065658382934294744

第六层：谁对应哪类公司？

可以粗略这样看：

$AAOI：偏光模块 / 光收发 / 800G-1.6T 需求外溢。

$LITE：偏激光器、光器件、EML / ELS / 光源能力，市场经常把它当核心光学平台看。

$COHR：偏光器件、激光器、材料、InP 相关垂直整合能力。

$AXTI：偏 InP / GaAs 等化合物半导体衬底，上游材料层。

$SIVE：更偏 CPO / CW laser / 外置光源相关的高 beta 讨论。

$NOK / Infinera：偏光网络设备、InP PIC 平台、垂直整合能力。

$MRVL、$AVGO：偏交换芯片、DSP、网络 silicon、CPO 平台相关。

$FN：偏光通信硬件制造 / 代工装配链条。

$CIEN、$CSCO：偏网络设备和系统层。

$GLW：偏光纤、玻璃、连接基础设施。

这不是严格分类。

很多公司会跨层。

但这张图能帮你避免一个误区：

光模块不是一个单点赛道。

它是一条从 AI 数据中心需求，到网络交换，再到光模块、激光器、材料、封装、测试的长链条。

所以接下来真正要看三件事：

1. 800G / 1.6T 需求，能不能继续从客户订单和 earnings call 里被验证。
2. InP、Epi wafer、泵浦激光器、EML、ELS 这些上游瓶颈，会不会继续涨价或缺货。
3. CPO 的收入兑现，到底是整体延后，还是部分环节先受益。

如果你只看“哪个光模块票今天涨了”，容易错过重点。

真正有意思的是：

AI 算力链的价值，正在从 GPU 往连接、光学和材料层扩散。

这不是买卖建议。

这是理解光模块板块前，先要搞清楚的一张产业链地图。

## 公司地图

- 光模块 / 光收发：`AAOI`、`LITE`、`COHR`
- 激光器 / 光源：`LITE`、`COHR`、`SIVE`、`AAOI`
- 上游 InP / 衬底 / 材料：`AXTI`、`COHR`、`NOK/Infinera`
- CPO / 外置光源 / 硅光链条：`SIVE`、`LITE`、`COHR`、`MRVL`、`AVGO`
- 交换芯片 / DSP / 网络 silicon：`MRVL`、`AVGO`
- 制造 / 代工 / 装配：`FN`
- 网络设备 / 系统层：`CIEN`、`CSCO`、`NOK`
- 光纤 / 玻璃 / 连接基础设施：`GLW`

## 素材依据

- 来源文章：`docs/analysis/optical-communications-long-post.md`
- 主题：光通信 / 光模块 / CPO / 800G / 1.6T / InP
- 过去 72 小时相关讨论中反复出现的 tickers：`AAOI`、`LITE`、`AXTI`、`COHR`、`SIVE`、`NOK`、`MRVL`、`POET`
- 核心定位：从“72 小时讨论索引”改成“光模块科普 + 公司地图”

## 原帖索引

- @Ariston_Macro：InP 基础科普，解释 AI 数据中心从铜连接向光互联迁移  
  https://x.com/Ariston_Macro/status/2065101015670743322
- @WealthCode99978：AI 光互联背后的 InP 材料逻辑，以及 $AXTI 上游材料 thesis  
  https://x.com/WealthCode99978/status/2065540793629061632  
  https://x.com/WealthCode99978/status/2065805041420677228
- @LIWEI_TWCapital：InP-based Epi Wafer 涨价、中国 InP 出口控制、相关受益/受损标的  
  https://x.com/LIWEI_TWCapital/status/2065320470615130137
- @wallstengine：美国关注中国 InP 出口审批延迟对 AI 数据中心 buildout 的影响  
  https://x.com/wallstengine/status/2064942274266775718
- @ParadisLabs：InP 出口控制、$SIVE 叙事定价和供应链位置讨论  
  https://x.com/ParadisLabs/status/2065510031773061331  
  https://x.com/ParadisLabs/status/2065058856909131778
- @KawzInvests：梳理 800G / 1.6T 供应链 earnings call，讨论真实供需  
  https://x.com/KawzInvests/status/2065886285160444225
- @tuolaji2024：泵浦激光器作为光通信隐藏瓶颈  
  https://x.com/tuolaji2024/status/2065658382934294744
- @cherryPayment：CPO 延迟争议、光学股票下跌后的分歧和 $SIVE TAM 讨论  
  https://x.com/cherryPayment/status/2064945251408568486

## 修改说明

- 新建一篇“光模块是什么”的解释型长帖，不覆盖上一篇光通信讨论索引。
- 内容重点改成：定义、核心概念、产业链层级、对应公司。
- 保留原帖链接作为 evidence，但正文不再围绕“过去 72 小时谁说了什么”展开。
- 避免荐股口吻，只做产业链地图和概念解释。
