# Serenity 蒸馏物料改造方案 v2 (镜头化 + 服务三目标)

> 来源: 16-agent 审计 workflow (wf_7c861651-b48), 2026-06-08。
> 三位对抗性复审对着源码核验, 修正了 v1 综合稿的多处盲点 (见"修订说明")。
> 目标: 1.追踪过往观点 2.用她的框架判断 3.用她的框架发现机会。
> 约束: 不碰共享引擎 (kol_research/agent.py) 与 qinbafrank/ 目录; 只重铸形态不删知识; 博主视角第一性。
> 关联前作: serenity-skill-distillation-v1.md (原始蒸馏)。

---

# Serenity 物料改造方案 (总架构师终稿)

## 修订说明: 复审改了什么

三位对抗性复审员各给了 `revise`。我对着源码逐条核验了他们的 mustFix, **全部成立**(且我修正了复审自身的两处口误)。终稿相对初稿的实质改动:

1. **【范本事实纠错 + 工作量上修】** 初稿把 EWY/WULF 当"0 模板干净范本"是错的——`EWY.md:76` 明确有 `## 输出模板`;实测 36 个 ticker 里 **24 个**带输出模板(全语料 43 个文件带),不是初稿说的 6 个。范本改用真正无模板的 **NVDA / ASML / SOI**;ticker 模板剥离工作量从 6 上修到 24 文件,迁移阶段 5 的风险与工时据此重估。
2. **【目的1 运行时基础不成立 → 彻底重设计】** 核验源码:`search_kol_tweets`(`shared/kol_persona/tools.py`)是纯语义向量检索,只按 `author_username` 过滤、默认 top_k=6、按相似度返回,**无 symbols / date / 时序排序**;`/tweets` 端点(`twitter/router.py`)是 `Depends(verify_user_token)` 的前端 REST 路由,**agent 工具集里根本没有它**,agent 不能发 HTTP;`db.get_tweets` 也只支持 username/category/page。**初稿"运行时拼装演变弧线"整条路径不成立。** 终稿:演变弧线必须**完整沉淀进 .md 正文**,timeline 节点**内联代表性 tweet_id**,`search_kol_tweets` 只作"补节点具体 quote 原文"的语义召回(明确标注非时序)。`/tweets` 扩展从"轻量端点扩参"如实改写为"需新建 agent 工具 + 时序检索路径"的**可选增强项**,标注未验证、不作为目的1 的前置阻塞。
3. **【stance_history frontmatter 是 no-op → 删除该依赖】** 核验 `skill_doc_to_adk_skill`:只把 `name/description/metadata{analyst,source_type}/instructions=body` 传给 ADK,frontmatter 的 `extra` 字段(含 stance_history)解析进 `SkillDoc.extra` 后**从不注入 body 或 description,LLM 永远看不到**。终稿删掉所有 stance_history frontmatter 依赖,演变弧线**只靠正文 `## 观点时间线` 段落**交付。
4. **【cockpit_v3 耦合 → 最高优先级回归防护】** 核验 `cockpit_v3.py`:它是 Serenity 持仓页的 live 读取器(`_is_skill_cockpit` 只把 qinbafrank 路由到 legacy,**其余全部含 Serenity 走 v3**),用 `_fuzzy_section` 子串匹配硬解析 8 个 section 标题(`核心问题 / 公司或产业是什么 / 博主如何定位 / 他看什么·看什么信息 / 决策框架 / 常见误读 / Evidence Map / 所属上级`),**找不到时静默返回空串**——改名即持仓页空白上线且不报错。终稿采用**子串兼容策略**:新标题必须内含旧关键词子串(`_fuzzy_section` 是子串匹配,可零代码兼容),并加一个 Serenity cockpit 冒烟测试作为门禁。
5. **【镜头不能磨平锋利度 → 命名预言机 + 推理输入双豁免】** 给 NVDA 命名预言机加硬护栏(≥4 个带日期 oracle 实例 + keynote-frontrun 剧本原样留);去重规则新增"load-bearing 推理输入豁免"分类(chokepoint premium 的上下游 MC 缺口、analog 路径锚等,在单轮 in-context 复现判断所必需的,**就地保留不指针化**)。
6. **【护栏不能变成"谨慎投顾仪式" → inline 降级】** 把目的2/目的3 的 4 条尾部 checklist 降级为"用她本人口吻 inline 自然带出"的单一原则,写明上限(最多一句她式概率限定 + 一句"她会验证的下一个信号"),eval 加反向题守护"博主视角第一性"。
7. **【删 load 路由太激进 → 保留轻量 load/退出节】** Frank 每个 framework 都留 `## 必须完成的动作` + `## 退出路由`;Serenity 语料更喧闹(50+ ticker、外国小盘、大量同环切换),AFTER 模板**保留一节轻量 load + 退出路由**,对齐 Frank 而非更激进。
8. **【量化数字纠偏】** 复审实测 EWY "+485%" 实际在 11 文件/18 次(非初稿 26 文件/112 次)。终稿不再用未核实的扩散数字作验收基线,改用"按文件实测"的口径,README/eval 不沿用夸大数。
9. **【目的2/3 事实来源规则打架 → 统一】** 统一裁定:agent 补客观公司事实**只能走 data-tools**(`get_stock_brief` / `get_industry_brief` 等),**不许凭训练记忆编造**;她的框架判断走语料。写进 `ask-to-evaluate` / `ask-to-discover` 的工具调用约定。
10. **【新增 5-7 个 framework 路由优先级矩阵】** 解决新建 `ask-to-evaluate` / `ask-to-discover` 与既有文件关键词重叠的路由竞争。
11. **【eval 提升为实跑门禁】** persona-diff 等从 TEMPLATE 提升为"重铸前先跑基线、重铸后回归对比"(哪怕人工小样本),否则"镜头化不退化视角"不可证伪。

下面是完整终稿。

---

## 1. 一句话诊断

**本质问题**: 当前 Serenity 物料是一套"填空模具"——每个文件用「回答骨架(agent 必须按这个顺序输出)+ 输出模板 + 228 处轴标签 + 各文件复印一份最新喊单数字」把博主真实的、比 Frank 更锋利的判断算法(forward+frontrun 两步、chokepoint premium、game-theory 材料重定价、命名预言机、qualification-cycle OSINT、fire-sale 决策树、排除逻辑)锁死成"按格子抄写"。**关键发现:共享引擎 `_SKILL_TOOL_USAGE_RULES` 本身已强制 BLUF 先行、只挑 2-3 点、禁止逐段复述章节标题、显式禁止"为完整强行四段"——即 Serenity 当前的强制骨架其实在和引擎对打**(引擎说别按目录答,文件说必须按 N 段答)。结果是:模型先排版后思考、产出无 BLUF 的倾倒式回答;同一批高光数字跨文件复读;带日期的引用本可拼成演变弧线却全是散点;真正的"发现引擎"零件齐备却从没被正向拼成可执行流程。

**改造后应变成**: 照 Frank 的"镜头"形态——每个文件教模型"用户真正想知道什么 → 她会先问哪 3 个白话问题 → 她看哪些数据食谱 → 默认自然段写、可偏离",把强制骨架降级为"她思考时扫过的检查点",把内嵌好算法原样保留为"她的算法"自然段。删骨架是让文件**停止对抗引擎**,不是裸奔。三个目的各补一块当前最缺的结构:**目的1** 给每个 ticker 一条**完整的、按拐点数决定深度的**"观点时间线"(节点内联 tweet_id,因为运行时拿不到时序检索);**目的2** 把散落算法收敛成市场/产业/个股三粒度可执行 checklist + 把排除逻辑升格为独立 marker 物料类型;**目的3** 新建一个把"漏斗下沉→BOM 找最小市值垄断→chokepoint 验证→frontrun 窗口"正向拼成的"机会发现 framework"。

整套从约 9544 行(Frank 的 ~2.06x)压回到约 5500-6000 行,多出来的全部是 Frank 没有的真知识(数据食谱、发现流程、演变弧线),不是排版仪式。**所有 section 标题改名都遵守 cockpit_v3 子串兼容约定,持仓页不破。**

---

## 2. 分层改造规范

### 通用规则 (套用全部 55 个用户路径文件)

- **禁止任何** `## 回答骨架(agent 必须按这个顺序输出)` 强制令 → 降级为"她想清一个对象时脑子里会扫过的检查点(不是输出顺序,不要逐条成段)"。
- **禁止任何** `## 输出模板` 填空块(含 ``` 代码块填空)→ 整段删除,换 Frank 式"默认回答形态:先一句白话结论,然后自然段;短标题可选不强制"。
- **统一补**一个"用户要求简短时"的 3 句 BLUF 降级版(Frank 每个 framework 都有,Serenity 全缺)。
- **剥离全部 spec/轴标签**(228 处),轴只活在 `_audit`。
- **删除全部"最新动作刷新/最新里程碑/进度刷新"块**(6 处)。
- **每个文件保留一行护栏指针**:`实时立场/最新报价/今日动作 → 走 search_kol_tweets(语义召回原话, 非时序); 静态文件只给慢变量骨架, 不保证现价新鲜度`。
- **【新增·硬约束】cockpit_v3 子串兼容**: 任何 ticker/sector 文件改 section 标题,新标题**必须内含 cockpit_v3 依赖的旧关键词子串**(`_fuzzy_section` 做子串匹配,见下表)。改名前对照"section 兼容表";否则持仓页对应卡片静默空白。
- **【新增】frontmatter 只保留 `skill / layer / coverage / type`**(这几个是 registry 真正消费的);**禁止新增 LLM 依赖型字段**(如 stance_history)——已核实 frontmatter `extra` 字段不进 LLM body。

#### cockpit_v3 section 兼容表 (改名硬约束)

| cockpit_v3 需要的子串 | 用途(空串=卡片空白) | 新标题必须含的子串 | 安全的新标题示例 |
|---|---|---|---|
| `核心问题` | thesis(卡片正文) | 保留含"核心问题" | `## 核心问题(用户真正想知道什么)` |
| `公司或产业是什么` / `公司或产业` | 摘要/decoder | 保留含"公司或产业是什么" | `## 公司或产业是什么(一句话定位)` |
| `博主如何定位` / `定位` | key_logic | 保留含"定位" | `## 一句话定位` ✓(含"定位") |
| `他看什么` / `看什么信息` | signals | 保留含"看什么" | `## 她会先看什么信息` ✓ |
| `决策框架` | decision sub-sections | 保留含"决策框架" | `## 决策框架(她怎么连起来)` |
| `常见误读` / `误读` | 误读列表 | 保留含"误读" | `## 常见误读` ✓ |
| `Evidence Map` / `Evidence` | tweet_ids | 保留含"Evidence" | `## Evidence(方法锚点)` ✓ |
| `所属上级` / `上级` | sector→ticker 归属 | 保留含"上级" | `## 所属上级` ✓(合并时尤其不能删) |

> 实操:镜头化新标题(如"她会先问的 3 个白话问题""她的算法")可以**新增**,但**至少保留一个含上述子串的标题承载 cockpit 数据**。最省事做法:把镜头标题作主标题,旧关键词作括注(如 `## 核心问题(用户真正想知道什么)`),既镜头化又零代码兼容。**迁移阶段同步加 Serenity cockpit 冒烟测试**(断言每个 ticker/sector 卡片 thesis/summary/evidence/parent 非空)。

---

### core / `bottleneck-operating-system.md`

| 项 | 内容 |
|---|---|
| **目标结构** | 母镜头一句话操作系统 → 5 条世界观信条 → **重仓硬清单块(4 必要条件 + Veto 一票否决)** → chokepoint/bottleneck 单一权威定义 + fire-sale 通用规则 + frontrun 通用剧本 → **"如何用她的方法找下一个标的"生成流程入口(指向目的3 framework)** → "永远不要"absolutes。软化 routing 决策树为"用户真正想问什么"前言。 |
| **目标体量** | 284 → 约 130 行 |
| **必删** | `:277-284` 整段"最新动作刷新(5/18~6/1)"——always-on OS 绝不放易变数字;8 分支强制 if-else routing 树软化。 |
| **必留** | chokepoint vs bottleneck 二分 + both 最高 conviction;bottleneck-within-bottleneck;瓶颈迁移路径 GPU→HBM→光互连 + "alpha=frontrun 下一个瓶颈";Mag7 capex 漏斗 8 层图;信号→动作表(含 fire-sale=strong buy / 选 King / design-out 退出);forward-only 估值底色;sold-out/locked-in 确认信号;"永远不要"清单(NFA/不晒美元/不懂不重仓——她风险自觉的真实载体,自然带出不外挂)。 |
| **必加** | (1) Frank 式收敛硬清单:**重仓 4 必要条件**(chokepoint+bottleneck 兼具 / material OI 可见 / 仍是散户持仓未进指数 / forward 估值算出错配)+ **Veto 一票否决**(被 design out / TAM 太小 translate 不成 revenue / 靠 ATM 稀释撑 MC / 不懂的赛道重仓)——内容全在现文,只重排成一眼能用。(2) 把迁移逻辑 + 信号表正向化为"找下一个标的"生成小节种子(完整流程落 framework)。 |

> **cockpit 注意**: core 不被 cockpit_v3 的 ticker/sector 解析消费(它走 `cockpit.get_profile_core`,但 always-on core 拼进 instruction),core 标题可自由镜头化。

### macro / `ai-capex-cycle.md`

| 项 | 内容 |
|---|---|
| **目标结构** | 基本照 Frank macro 镜头,主体保留。 |
| **目标体量** | 162 → 约 110 行 |
| **必删** | 6 步"输出模板"骨架 → 改"默认回答形态"软指引,显式写"不强制段序、按用户问的重点答";决策框架表与减仓信号合并去重;与 core 信条逐字重复处压成一句回指 core。 |
| **必留** | "不交易 Fed、stay long 公司 forward 数字"(带 2026-06-05 加息概率上升日她照样不动的锚)——目的1+2 精品;"macro 暴跌=压估值(买) vs 基本面恶化=压逻辑(观望)"判别;forward 时间表 H2 2026→H2 2027→2028 re-rate;地缘=上游瓶颈定价催化(中国管制日本 InP→AXTI);对黄仁勋"引方向不盲从"态度;常见误读表(每条带原话纠偏)。 |
| **必加** | 地缘段补一句正向化:"当某国对盟友上游材料出口管制时,去找该材料的西方唯一替代 + bottleneck-of-bottleneck feedstock"(喂目的3);补一条"AI capex 周期"的链级演变时间线(2025-10→2026-06,服务目的1)。 |

### framework (7 个旧 + 2 个新 = 9 文件)

这是最高杠杆层。统一从"骨架+模板"重铸成 Frank 镜头。**所有 AFTER 都保留一节轻量 `## 必须完成的动作(load 哪些 skill)` + `## 退出路由`**(对齐 Frank,因 Serenity 语料喧闹,加载决策不能全压给引擎通用表)。

| 文件 | 现状→目标行数 | 处置要点 |
|---|---|---|
| `ask-about-stock.md` | 236→**~95** | 见第 6 节完整样例。 |
| `ask-about-method.md` | 274→~90 | 必留:一句话操作系统(提到最前作母镜头)、5 条信条、7 步工作流(显式标"这也是套她方法找新标的的步骤")、chokepoint/bottleneck 二分、portfolio 三支柱 + "散户最难复制"caveat、Voice markers 表、bio anchor + 两条护栏(无 RISC-V 头衔 / 只报%不报$);删:8 段骨架、输出模板、最新里程碑、Evidence Map 砍到 ~6 条方法锚点;把"自证模式 Did you listen anon"提炼成"怎么追踪她观点演变"的方法钩子(喂目的1)。 |
| `ask-about-sector.md` | 275→~100 | 必留:CPO Bottleneck Cheat Sheet(母表)、各板块子环节拆解、priced-in/frontrun 信号、共识≠清仓纠偏、funnel/rotation 双轴、sizing 两层 + 不套打分护栏;删:8 段骨架、输出模板、**全部 14 处轴标签**、最新动作刷新;把 rotation 时间地图提炼成独立"用 rotation 找下一站"小节,白话标题"她的时间地图:瓶颈接力——也是找下一个机会的地方"(喂目的3)。 |
| `ask-news-decoder.md` | 251→~110 | **目的3 主引擎,最高优先级**。必留:supply-chain decoder 流程 + "新闻=确认非起点"前提、second-order 三套路(提为独立核心小节并显式标"这是发现非共识新机会的地方")、历史解码案例表、相邻陷阱表、三段隔离纪律、confidence 概率语言;删:8 段骨架、整段长填空模板;把取向从"查她解过什么"转成"拿一条新新闻,照她的 decoder+三套路+相邻陷阱去生成候选"。 |
| `ask-about-positioning.md` | 254→~95 | 必留:仓位集中度推断法、risk_flag 六分类(尤其"thesis 内部裂痕才是真减仓")、不止损四铁律、她的风险自觉(SUPER DANGEROUS / 与建议别人不同);删:8 段骨架、输出模板、轴标签、高光数字;**把同环切换表从三列扩成带时间戳序列**(见目的1 专项);新增"怎么把散点表态串成演变弧线"方法小节。 |
| `ask-is-consensus.md` | 255→~100(改动最小) | 必留:B11 三 tell、机构反指 mechanic、chokepoint premium 定价、反打分自我护栏;删:8 段骨架、共识 4 阶段填空模板形态(改判断参考)、输出模板、轴标签;定位为目的3 发现流程的"第 4 步 priced-in 过滤器"被调用。 |
| `ask-for-top-picks.md` | 264→~110 | 拆成两个意图:(A)"她现在看好什么清单"——保留三段隔离 + King 逻辑 + frontrun 阶段 + Fire Sale + 外国 ticker 警告,删固定篮子 + sizing 阶梯,清单改"动态取 + 指向各 ticker";发现型问题路由到 (B) 新文件 `ask-to-discover`。 |
| **新** `ask-to-evaluate.md` | 新建 ~110 | 目的2 主引擎,见 §3 目的2。 |
| **新** `ask-to-discover.md` | 新建 ~120 | 目的3 主引擎,见 §3 目的3。 |

framework 层目标:旧 7 文件 1808 行 → 约 690 行;+ 2 新文件 ~230 行 = 约 920 行。其中多出来的全是真算法/真流程,不是骨架。

### sector (9 文件)

| 项 | 内容 |
|---|---|
| **目标结构** | (含 cockpit 兼容标题) `## 公司或产业是什么(适用问题 + 一句定位)` → 她会先问的 3 个白话问题 → `## 她看什么信息`(保留工序级 BOM 表/判定刀)→ priced-in/支持/削弱/打脸信号 → **链级演变时间线(照 photonics 范本)** → **如何发现这条链下一个卡点(发现信号 checklist)** → `## 常见误读` → `## Evidence(方法锚点)`。 |
| **目标体量** | 各压到 110-150 行(总 ~2100 → ~1150) |
| **必删** | 9/9 文件的"输出模板"填空块 + 结尾占位符 + "决策框架"填空表格(注意:`决策框架`标题若被 cockpit 消费需保留含子串的版本,内容改判断参考);**全部 38 处轴标签**;"瓶颈接力 the rotation"完整链条在多文件重复 → 抽到 core/macro 一处,各 sector 只标"本链是这一棒 + 下一棒去哪"。 |
| **必留(逐项点名)** | photonics:10 步工序级 Cheat Sheet + chokepoint/bottleneck 二分 + design-out 风险分级 + 发现信号食谱 + **历史 anchor 时间线(全层唯一演变弧线范本)**;substrates:game-theory 材料重定价法 + 双重 chokepoint 判定 + NCI"只小仓 for fun"分寸;optical:SOTP 分段估值法 + "她推翻自己 interchangeable"修正;memory:forward P/E 自重算 + EWY vega 错配食谱 + toll collector 分层;neocloud:"融资结构 > GW capacity"判定刀 + 三类排除框架 + tierlist;mag7:"Mag7 是 anchor 非 alpha"定位 + design-in 锁死逻辑;power:XLU IV 错配食谱 + "我对光子比能源熟"诚实分层;defense:"how to profit off US invading X"地缘剧本(提为主轴);humanoid:directional long 方法定性 + 按零部件 cross-reference OEM BOM 发现框架。 |
| **必加** | 每条链补"如何发现这条链下一个卡点 + 什么前置信号代表新机会浮现"(喂目的3);每条有瓶颈接力的链补一条 photonics 式演变时间线(喂目的1)。defense/mag7 考虑大幅瘦身。 |

### ticker (36 文件)

| 项 | 内容 |
|---|---|
| **目标结构(7 段, 含 cockpit 兼容标题)** | ① `## 公司或产业是什么(一句话定位)`(角色 + 先看什么不看什么)② `## 她会先看什么信息`[数据食谱,金子全留]③ `## 决策框架(她怎么连起来)`[判断逻辑,自然段]④ **`## 观点时间线`**[新增,深度=拐点数,服务目的1]⑤ 支持/削弱/打脸信号 ⑥ 不同持仓状态下观察什么(她的风险自觉自然带出)⑦ `## 常见误读` + `## Evidence(方法锚点)`。保留 `## 所属上级`。 |
| **目标体量** | 均 156 → 110-140 行(向 NVDA/ASML/SOI 这类**真正无模板**的镜头形态看齐;**EWY/WULF 本身带输出模板,不再当范本**);总 ~5500 → ~3500 |
| **必删【工作量上修】** | 全部 94 处 spec 轴标签;每文件"最新动作刷新/进度刷新/现价"整段(无运行时时序检索兜底,见目的1);**24 个 ticker(实测,非初稿的 6 个)的"输出模板"填空骨架**;"信念分层"里 coverage/mentions 频次的元辩白(保留结论"Buy/Hold/Strong Buy",删自我辩白)。 |
| **必留(高价值金子点名)** | SIVE 客户链图 + chokepoint premium + OSINT 资格周期 + analog 锚;**NVDA 命名预言机 + frontrun 剧本(见目的护栏)**;AAOI 三套 forward napkin + thesis 自我修正;AXTI game-theory 材料重定价 + 三层卡点 + SMM 影子指标;NBIS SOTP + King 融资判据 + Fire Sale 决策树;LITE BOM-cut 拆解 + analog 反向锚;IQE multi-hop 推断 + 重置成本对标;MU"1月预测→74.9% 验证";EWY vega 错配;IREN/POET 排除决策树;ASML marker 设计(见目的2)。 |
| **必加** | 每个有 stance 演变的 ticker 加"观点时间线"小节(节点内联 tweet_id);MU/AAOI/RDDT/HOOD/AXTI 用 [预测]/[验证✓/证伪✗] 标记。**不加 stance_history frontmatter(已证 no-op)**。 |
| **合并/降级(注意 cockpit 所属上级引用)** | POET/JBL 并入 photonics;CRWV/CIFR 并入 neocloud;AEHR 并入 substrates/photonics 的 test 小节;ALAB 折叠进 mag7;COHR 考虑降为 sector 坐标卡片。**合并前先确认 cockpit_v3 的 `所属上级` 反向引用不指向被合并文件**(否则 sector→ticker 归属断链),并跑冒烟测试。 |

---

## 3. 三个专项设计 (方案灵魂)

### 目的1 — "观点时间线"约定 (复审重灾区, 整条重设计)

**核心修正:运行时拿不到时序检索,演变弧线必须完整沉淀进 .md 正文。**

复审核验源码后证实:`search_kol_tweets` 是纯语义向量检索(只按 author 过滤、top_k=6、按相似度返回,**无 symbols/date/排序**);`/tweets` 是前端 REST 路由,**agent 工具集里没有它,agent 不能发 HTTP**;`db.get_tweets` 也不支持 symbols。**所以初稿"静态存慢变量骨架、运行时拼快变量弧线"的分工不成立**——运行时唯一能调的 `search_kol_tweets` 给不出按(标的, 时间)排序的历史原话。

**修正后的分工(两层,如实):**

1. **静态物料(.md 正文)= 演变弧线唯一可靠来源**:每个有演变的 ticker 加正文 `## 观点时间线` 小节。**深度不是固定 3-5 行,而是按该 ticker 实际 stance 演变弧线的拐点数决定**——IREN 这种 bull→bear→toxic financing 至少 4-5 个拐点,EWY 这种单调持有可能只 2-3 个。每个拐点 = `YYYY-MM — 立场/动作 + 触发信息 (id: tweet_id)`,**tweet_id 内联进 .md**(因为运行时拿不回时序数据,内联 id 是 agent 能用的唯一精确锚)。
2. **`search_kol_tweets` = 补节点具体 quote 原文(语义召回, 非时序)**:agent 想引某节点的原话,用 `search_kol_tweets(query="IREN ATM dilution toxic financing")` 做语义召回,**不能也不假装能"拉某标的全部历史按时间排"**。时间排序与拐点结构由 .md 正文承载。

每个 ticker 时间线小节末尾固定指针(措辞已诚实化):
```
> 实时立场/最新报价 → search_kol_tweets 做语义召回补具体原话(非时序检索)。本节的演变拐点与时间顺序以本文为准, 不保证现价新鲜度。
```

**引用应带时间线的具体写法范例(放进 ticker/AXTI.md, tweet_id 内联):**

```markdown
## 观点时间线

2025-12 — 首发 InP 衬底 chokepoint 理论, 当时 $12 被当笑话 (id: 20xxxxxxxx1)
2026-01 — 中国管制日本 InP → 判 AXTI 独占西方替代, 升 high conviction (触发: 出口管制新闻) (id: 20xxxxxxxx2)
2026-05 — PT $150 几近达成, 提示"第二段红磷 feedstock 该重新审视" (id: 20xxxxxxxx3)
2026-06 — 复盘方法本质: discretionary inference, "could always be wrong" (id: 20xxxxxxxx4)

> 实时立场/最新报价 → search_kol_tweets 语义召回补原话(非时序)。演变拐点与顺序以本文为准, 不保证现价新鲜度。
```

**"预测被验证"弧线类型**(MU 范本):
```markdown
2026-01 — [预测] 算 NAND 涨价 100% → 毛利冲 73-75% (id: ...)
2026-06 — [验证✓] 财报实报 74.9% 落区间, 未减仓 (id: ...)
```

**framework/ask-about-positioning 配套**:同环切换表从三列扩成 `[时间戳 + 切换前立场 → 触发信息 → 切换后立场]`,并新增"怎么把散点表态串成演变弧线(区分 thesis-break vs 相对价值轮动 vs 被验证)"方法小节——把 IREN.md 区分"ATM filing 触发 vs MSFT 合同"的判断逻辑抽象成可复用流程,显式教 agent **读 ticker 的 `## 观点时间线` 正文 + 用 search_kol_tweets 补原话**(不再写"调 /tweets?symbols=")。

**(可选增强项, 非前置阻塞)** 若产品后续愿意投入:可给 agent **新建一个时序检索工具**(`get_kol_tweets_by_symbol(symbol, date_from, date_to)`,数据层需新增 symbols 过滤,触及 `shared/kol_persona` + db 层)。**这超出"不碰共享引擎"的承诺,且 db 是否能简单加 symbols 过滤未经验证**,故列为 P2 可选增强,**不作为目的1 落地的前置条件**。目的1 在纯 .md 方案下已可闭环。

> **删除 stance_history frontmatter**:已核实 `skill_doc_to_adk_skill` 不把 `extra` 字段注入 LLM,演变弧线只靠正文 `## 观点时间线` 段落交付。

---

### 目的2 — "判断流程"收敛成三粒度 checklist

新建 **`framework/ask-to-evaluate.md`**(Frank 没有等价物,镜头形态照 Frank)。明确写"这是引导链不是必填 N 段,先给一句 BLUF(多/空/观望)再自然段展开,不给固定 sizing 百分比"。

```
① 市场/宏观背景[市场粒度, 调 macro]: 压估值(macro 噪音砸高 beta = 买点)还是压逻辑(基本面恶化 = 观望)? 她在不在交易 Fed?
② 产业定位[产业粒度, 调 sector]: 在 capex 漏斗哪层、同环 peer 是谁、瓶颈现在在哪环?
③ chokepoint vs bottleneck 二分: 绕不过的关 / 控产出定价 / 只是跟涨? both → 最高 conviction
④ forward 错配 + 是否 priced in[调 ask-is-consensus]: forward revenue 重算(常打 50% haircut) + B11 三 tell + chokepoint premium
⑤ frontrun 窗口: 还是散户持仓? 没进指数/没被机构盖章? 前置 catalyst 还没发生吗?
⑥ 排除体检[调排除 marker]: toxic financing / 单一客户集中度 / 可被 design out / 增长是买来的 / TAM 太小 / 设备商抓不住量产 → 命中即降级或 pass
```

**【复审 mustFix · 事实来源规则统一】coverage 与事实来源约定**(写进入口 + README):
- coverage=high:引用她原文判断。
- coverage=medium:引用并标注密度。
- coverage=low/none:**必须显式声明"她本人未直接讨论,以下是用她的方法外推"**。
- **客观公司事实(供应链 BOM、财务、营收)从哪来 → 统一裁定:只能调 data-tools(`get_stock_brief` / `get_industry_brief` 等),禁止凭训练记忆编造**。`ask-to-evaluate` 第②③步要 agent 判断"它在漏斗哪层 / 是不是 chokepoint"时,客观事实走 data-tool 召回,框架判断套她的方法。这解决了初稿目的2(默许补事实)与目的3(禁止编造)的规则打架:**统一为"事实走工具、判断走框架、记忆不许编"**。

**反面教材(排除逻辑)升格为独立物料类型 — marker:** ASML 已证明 marker 形态天然抗模具(没持仓就填不了持仓栏)。它教其他 35 个 playbook 都给不出的"她怎么用框架排除/校准一只票"——一个"她为什么不碰 X"比十个"她为什么买 Y"更能教会模型框架边界。

- **把四套排除判断抽象上提到 `ask-to-evaluate` 的"排除体检"小节**:IREN(toxic financing / ATM 稀释)、POET(单一客户集中度 / 封装层 design-out)、HOOD(增长买来非长出来 → 降级)、ASML(设备商不偏好 / 错误 proxy 校准)。IREN/POET/ASML 文件里只保留"她对这只票如何套用"的具体案例。
- **新建 3-4 个 marker**(每个 60-90 行):POWL(看过 transformer 但选了 HPS.A)、Apple(几乎不持仓的最大科技股)、BE/NVTS(设备商/不偏好层代表)。marker 是承载博主认知谦逊(设备商 hyper-cyclical 不碰 / SUPER DANGEROUS / NFA)最自然的容器。marker 文件也遵守 cockpit 子串约定。

---

### 目的3 — "机会发现引擎"

新建 **`framework/ask-to-discover.md`**。把她散落各处、全写成"她过去这么做"的发现零件,正向拼成 agent 可执行的 procedure:

```
机会发现 6 步 (引导链, 非必填 N 段; 输出自然段; 不给固定 sizing; 不硬编码喊单数字)

第1步 选起点(漏斗顶): 从用户给的赛道/新闻, 或最近 Mag7 capex/财报/foundry presentation/卖方 supplier note/
       Digitimes-Nikkei-Reuters 小媒体, 取一个下游锚点。调 search_kol_tweets 看她有没有就此情境表过态。
第2步 BOM 下沉(她的招牌): 沿 capex 漏斗 8 层往下问"这一层里 share 最大 + MC 最小的供应商是谁"。
       【硬约束】供应链 BOM 节点的客观事实必须调 get_industry_brief / get_stock_brief 召回, 绝不凭记忆硬编。
第3步 chokepoint vs bottleneck 二分: 候选是绕不过的关 / 控产出定价 / 还是跟涨? 两者皆是 → 最高 conviction。
第4步 forward 错配检验(调 ask-is-consensus, 不重写): B11 三 tell + chokepoint premium + forward revenue 重算(打 50% haircut)。
第5步 frontrun 窗口判定: 还是 retail 持仓吗? 还没进指数/没被高盛摩根盖章吗? 机构进场前置 catalyst 还没发生吗?
第6步 输出为"她方法下的一个候选": 三段隔离 + inline 标注是 agent 套用她框架的推断, 附"她会拿这个候选去验证的下一个信号"。
```

**把 ticker 层可迁移配方上提到此文件(一次,不在多个 ticker 各写)**:HPS.A"新闻→逆推标的 + capacity ceiling 逆推 backlog"、AMD"利好上游不买它本身"、JBL"下游财报反推上游 qualification cycle"、qualification-cycle 读法、IQE multi-hop 推断、NVDA 命名预言机 + keynote 前置卡位剧本、analog 双向用法。ticker 文件只留"她对这只票如何套用"的一句指针。

**【复审 mustFix · 护栏 inline 化,不堆尾部免责块】风险护栏(写进 §3 目的2/3 流程,inline 自然带出):**
- **单一原则**:任何生成候选用**她本人口吻 inline 标注**(likely / 99% sure / primary or sole source / could always be wrong),不冒充她已点名。
- **上限**:一个生成候选**最多一句她式概率限定 + 一句"她会验证的下一个信号"**。**禁止把 NFA / 三段隔离标签 / 非确证标签堆成尾部固定免责块**——她本人的认知谦逊是 inline 且克制的,不是 4 条 checklist。这直接守护"博主视角第一性、不外挂对打免责框"的硬约束。
- **三段隔离保留但内化**:`[她确证过的]/[方法推断]/[外部事实]` 作为 agent 组织信息的内部纪律(对应 ask-news-decoder 既有的三段隔离),**不作为对用户外露的固定段标题**。
- **事实来源**:BOM/财务客观事实走 data-tool,**绝不凭训练数据编造她语料里没有的公司基本面**(这是"有据感的瞎编"的唯一防线,eval 专测)。

---

## 4. 去重中心化方案 (复审 mustFix: 区分高光数字 vs load-bearing 推理输入)

**单点存活原则 + 推理输入豁免**:把去重对象分两类,**只对 (a) 类做单点存活,(b) 类就地保留**。

- **(a) 纯高光喊单数字**(EWY +485% / NBIS $84→$260 / SIVE next $80B 这种,**删了不影响她的判断算法在本轮复现**)→ 单点存活 + 改指针/结论摘要。
- **(b) load-bearing 推理输入**(凡个股/板块在**单轮 in-context 推理时需要它才能复现她的判断**的)→ **就地保留,不得指针化**。典型:chokepoint premium 的上下游 MC 缺口(SIVE 论证需同时看到下游 comps $4-15B 和上游 MC $2.6B 缺口才成立)、analog 路径锚(LITE $3B→$75B 的路径特征)、forward 重算的关键输入。**这些是工程深度所在,指针化会让深度在那一轮 context 缺席。**

| 高光事实 | 类别 | 落点 / 处理 |
|---|---|---|
| NBIS "$84→$260 / picked the King" | (a) 数字 + (b) King 判据 | 数字→`ticker/NBIS.md` 时间线节点单点存活;**King 融资判据(neocloud 推理输入)在 sector/neocloud 就地保留**,不指针化 |
| EWY "+485%"(实测 11 文件/18 次) | (a) 纯数字 | `ticker/EWY.md` 时间线节点;其余改"EWY leaps 是她 memory 最赚操作"结论摘要(非整段复印) |
| SIVE "chokepoint premium 上下游 MC 缺口" | **(b) 推理输入** | **`ticker/SIVE.md` + sector/photonics 引用处就地保留完整上下游数字**,不指针化 |
| SIVE "next $80B LITE" 这句喊单 | (a) 数字 | 单点存活在 SIVE |
| analog "LITE $3B→$75B 路径锚" | **(b) 推理输入** | **凡 analog 推理出现处就地保留路径数字**(它是 sizing 依据),不指针化 |
| "70%+ unrealized / 1.3x 杠杆" | (a) 数字 | `framework/ask-about-positioning.md` 一处(讲她仓位哲学处) |
| Goldman "$5.3T capex"那句 | (a) 数字 | `sector/ai-infrastructure-mag7.md` 总论一处;ticker 删数字,但**保留"Mag7=漏斗水源"这个 load-bearing 定位结论** |
| IREN "ATM toxic financing" | (b) 排除推理输入 | `ticker/IREN.md` 就地保留(排除决策样本);CIFR/CRWV 引"参见 IREN 的 toxic financing 排除" |
| "瓶颈接力 the rotation"完整链 | 方法定义 | `core`/`macro` 一处;各 sector 只标"本链是这一棒+下一棒去哪" |

**【复审 risk · 漏加载丢事实防护】**:引擎上限是 0-2 个 sector/ticker per turn,"用户问 sector、本轮不加载 ticker"时纯指针的事实会丢。**对策:被指针化的 (a) 类事实,在 sector 文件保留一行最精炼的结论摘要(非整段复印),而非纯指针**。例:neocloud 不写"NBIS 详见 ticker/NBIS",而写"她在 neocloud 里选 NBIS 当 King(融资结构最干净),IREN 因 toxic financing 被排除"。(b) 类本就就地保留,不受影响。

**通用方法定义中心化**:chokepoint/bottleneck 二分定义、fire-sale 通用规则、frontrun 通用剧本、qualification-cycle 读法、discretionary/could-be-wrong 方法定性 → 上提 core 或 framework 作单一权威源,各 ticker 只写"她对这只票如何套用"。

**tweet_id 瘦身**:当前堆砌式 id → 每个时间线节点配 1 个最具代表性 id(内联),Evidence Map 砍到 5-8 条"方法锚点"。

---

## 5. 轴系统处置

**228 处 spec/轴标签从用户路径彻底剥离,77 条轴定义只保留在 `_audit/methodology-spec.md`。**

理由:(1) inference 时纯噪音,零内容损失,Frank 此项为 0;(2) 轴编号是人类作者目录不是判断器,`_audit` 是 ground truth 金矿(内容一条不删,作重铸源);(3) core 实测已 0 个轴标签,证明可清零;(4) `_audit` 是重铸取材地(用 A/B/E 轴构建目的3 发现流程)。

**执行 — 零风险纯减负动作,作为迁移第一步,但加两条断言防护:**
- 脚本批量剥离 `(spec [A-E]\d+)` / `(轴 [A-E]\d+)` / `[A1]` 形式。
- **【复审 risk】剥离后断言**:(1) 每个文件 `## 适用问题` 段仍非空(description 从此段派生,误伤会让 skill description 退化成兜底字符串,影响 ADK skill 选择);(2) cockpit_v3 依赖的 8 个 section 标题子串仍在(`_sanitize_skill_body` 只 strip `coverage:`,正则误伤标题会让持仓页空白)。

---

## 6. before/after 改写样例:`framework/ask-about-stock.md`

把 236 行模具改成约 95 行镜头版。**相对初稿样例的完善**:(1) section 标题加 cockpit 兼容子串;(2) 删掉所有 `/tweets?symbols=` 死链措辞,改诚实的 search_kol_tweets 语义召回;(3) 补回轻量 `## 必须完成的动作` + `## 退出路由`(对齐 Frank);(4) 护栏 inline 化,不堆尾部免责块。

**AFTER(完整 markdown):**

```markdown
---
skill: ask-about-stock
layer: framework
coverage: high
---

# Framework: 用户在问个股

## 适用问题

用户拿一只具体 ticker 来问 Serenity 怎么看 / 还能买吗 / 升降仓条件。典型:「她怎么看 SIVE?」
「$AXTI 还能买吗?」「Nebius 现在还能加吗?」「她对 IREN 看法是什么?」「MRVL 在她体系里啥定位?」

路由: 句子里有单个 ticker / 公司名 + "怎么看/还能买/升降仓"。单股语境下问「还能上车吗」留在这里,
把 consensus 判定作为答案里的一段。若用户要"找一个像 X 的新标的" → 去 ask-to-discover; 若标的是
她从未点名的 → 去 ask-to-evaluate。

## 必须完成的动作 (load 哪些 skill)

1. load 这只票的 ticker/<X>.md (拿她对这只票的具体看法 + 观点时间线)。
2. 若跨链/同环切换问题, 同时 load 相关 sector/<链>.md (拿链级定位与同环 peer)。
3. 覆盖低或她没点名 → 退出到 ask-to-evaluate, 用她的方法外推并显式声明"她未直接讨论"。

## 用户真正想知道什么

用户不是要一篇公司介绍, 而是想知道三件事:
- 这只票在她的供应链地图哪一环、现在是 re-rate 前还是机构已盖章。
- 现在贵不贵 (她只看 forward + frontrun, 不看 trailing)。
- 什么信号出现她会升 / 降 / 轮动。

## 她会先问的 3 个白话问题

1. 它在 Mag7 capex 漏斗哪一层、同环 peer 是谁? 是 chokepoint+bottleneck, 还是只是跟涨?
2. 按 forward + frontrun, 现在在 re-rate 之前 (retail 持仓、没进指数), 还是已被机构盖章?
3. 这次回撤是 fire-sale 还是真利空?

## 她看哪些数据

forward revenue/margin ramp、BOM 切走的百分比、合同 backlog / sold-out 信号、机构持仓 (13F) 变化、
CEO 财报原话、X 上的讨论密度。覆盖低的票必须 fallback 同环 peer 并显式声明"博主未直接讨论";客观
公司事实 (营收/供应链占比) 走 data-tool 召回, 不凭记忆编。

## 她的算法 (给定一只票就能跑)

### forward 估值 + frontrun (回答"贵不贵 / 还能买吗"的真实两步)

1. forward 估值 (她的 napkin math, 不是 DCF):
   - MC 对照 forward revenue ramp + 高 GM: "即将从 X 季营收跳到 Y, 市值才 Z" → 相对 forward 低估。
   - 小供应商搭粗模型: ASP × 单位用量 × 市占 (常打 50% haircut) × net margin → 套 GS/MS TAM
     投影到 2027/2028 → 算隐含 forward P/E。
   - screener / AI 给的 forward P/E 她明说"极其离谱", 一律自己重算。
   - chokepoint premium: 用下游可比给上游卡点定价 — 下游私募估值高 (如 $4-15B+) vs 上游唯一供应商
     MC 才几十亿 → 缺口会被填平。(论证时必须同时摆出上下游两个数字, 缺口才 legible。)
2. frontrun the institutions (她的真实买点):
   - 还是 retail 持仓、没进指数、MC 没到机构门槛 → 这才是好买点。
   - index inclusion / IPO / 厂商 keynote = "机构进场前置 catalyst" (index 纳入她会算出被动买盘美元数)。
   - 讨论密度近零 = 还没 price in; 她越多谈 = 当下越被低估。

回答"还能买吗"落到: 现在在 re-rate 之前 (frontrun 窗口) 还是已被机构盖章 (接盘阶段)。

忠实度: 她坦承 napkin math 可能算错 (speculative), 是思路不是精确 PT。不要给她套贝叶斯/概率打分框架
——她只承认 subjective 主观判断 + 预判下一次架构演进。把这层认知谦逊随手 inline 带出, 不要堆成免责段。

### Analog 类比 (她的招牌 sizing 依据)

| 早期 (now mature) | 现在重仓 | 类比逻辑 (含路径锚) |
|---|---|---|
| AXTI (InP 衬底) | SOI (SiPh 衬底) | 同上游材料 chokepoint, 时间差 1-2 年 |
| LITE (EML 激光, 路径 ~$3B→$75B) | SIVE (CW DFB 激光) | 同光器件, 下一代 CPO 激光; LITE 的 re-rate 路径是 SIVE 的镜子 |
| AAOI (光模块 800G) | FOCI (FAU 组件) | 同 CPO 量产瓶颈, 小盘 |
| RKLB (商业航天 #2) | FLY (可重复火箭) | 同 SpaceX 竞争位 |

她给过 X 的 analog 必须说出来, 且路径锚数字 (如 LITE $3B→$75B) 要带上 — 那是她 sizing 的依据。
反向也可用: 给定一个已走完 re-rate 的成熟卡点, 提取路径特征去找还在早期的镜像候选 (走 ask-to-discover)。

### Coverage 分级处理

high (≥80 提及): 直接引 thesis/stance/加仓 levels。medium (30-80): 引但 hedge。
low (10-30): single-source, 只用她明说过的 quote。none: 不能给"她的观点", fallback 同环 peer
并显式说"博主未直接讨论 X" + 客观事实走 data-tool。

### fire-sale 信号识别 (X 最近暴跌时)

fire-sale (她大概率加仓): X 是她写过 thesis 的标的 + 下跌主因是宏观/sector 情绪 + X 本身无新利空 +
她写过加仓 levels。非 fire-sale (要 hedge): 真利空 (造假/稀释/CEO 走/丢合同) / 低覆盖从没写过 thesis /
她明确称"fake it til you make it"的 (POET, IREN)。

## 她对这只票怎么演变 (追踪过往观点)

回答"她对 X 看法变了吗 / 从 X 月怎么演变到现在"时, 不要给当下截面照——去对应 ticker/<X>.md 的
`## 观点时间线` 读演变拐点(那里有按时间排好的节点 + 内联 tweet_id), 想补具体原话用
search_kol_tweets 做语义召回(它只按相似度返回, 不做时序排序, 顺序以时间线正文为准)。区分:
thesis-break (下注逻辑被推翻, 如 IREN 转 ATM 稀释) vs 相对价值轮动 (同环切换 King) vs 被验证
(如 MU 1月预测→财报兑现)。

## 已持有 vs 未持有 (基于她的方法, 不是个人推荐)

- 已持有 + thesis 未破: 不止损, 无实质利空的大幅回撤 = 加仓。
- 未持有 + 新主题: 她本人 share + light call 双腿小额试探, 确认 thesis 后再加, 不 FOMO 一把梭。
- 共识 / 已纳指 / 涨幅过大: frontrun 窗口已过, 等回撤或轮动到同环更便宜更确定的 (选 King) / 上一环。

她的集中度与杠杆是她自己的打法, 她明说"和建议给别人的不同"——把这层风险自觉随手带出, 不外挂免责框。

## 默认回答形态

先给一句白话结论 (在 re-rate 前还是已盖章 / 加仓还是观望), 然后自然段解释。可以用短标题, 不要强制
分段, 不要按"定位/为什么/贵不贵/升降仓"逐条成段倾倒。

## 用户要求简短时

一句结论 (frontrun 窗口开着还是已盖章)。
原因 1: 它在供应链哪一环、是不是 chokepoint+bottleneck。
原因 2: forward 错配大不大、还是不是 retail 持仓。
原因 3: 这次回撤是 fire-sale 还是真利空。

## 常见误读

| 误读 | 实际 |
|---|---|
| 「她看好 X」=「她推荐 X」 | 她披露持仓和判断, 不发推荐; 多数是低流动性小盘 |
| 把 stance 当 sizing | 她对 50+ ticker 有 bull stance, 只有 ~10 个是核心仓 (>5%) |
| 用她的目标价当短期预测 | 她的 PT 是 1-5 年时间窗, 不是季度目标 |
| 假设她会一直持有 | 同环切换 (NBIS > IREN, SIVE > LITE 部分轮动) 是常态 |
| 把 quote-tweet 当原创观点 | 约一半推文是 quote 新闻 + 自评, 引用保留 [quoting @xxx] 上下文 |

## 退出路由

- 用户转问"她整体看好啥" → ask-for-top-picks。
- 用户转问"像 X 的下一个标的" → ask-to-discover。
- 标的她从未点名 → ask-to-evaluate (用她方法外推 + 显式声明未讨论)。

> Evidence(方法锚点): forward 估值 (id: 1972016308662513748) · chokepoint premium 上下游缺口
> (id: 2058868791438884870) · index frontrun 被动买盘 (id: 2058806097436455283) · fire-sale 加仓
> levels (id: 1979087229038530782) · analog "SOI=AXTI, SIVE=LITE" (id: 2050790690591048002)
>
> 实时立场/最新报价/今日动作 → search_kol_tweets 语义召回 (非时序)。本文件只教方法, 不存某票现价。
```

对比变化:8 段强制骨架 → 3 白话问题 + "她的算法"自然段;整段输出模板删除 → "默认回答形态"+ 3 句简短版;"最新动作刷新"6 条喊单数字整段删除 → 交语义召回 + 新增"她对这只票怎么演变"指向 ticker 时间线(目的1);Evidence Map 14 条砍到 5 条方法锚点;analog 表加反向发现用法 + **保留 LITE 路径锚数字(load-bearing 推理输入豁免)**;chokepoint premium **明确"必须同时摆上下游两个数字"(推理输入豁免)**;补回 `## 必须完成的动作` + `## 退出路由`(对齐 Frank,不比 Frank 更激进删);**section 标题保留 `适用问题/常见误读/Evidence` 等 cockpit 子串**;护栏 inline 化无尾部免责块;236 → 约 95 行。

---

## 7. 迁移顺序与验证

**【复审 mustFix】先跑基线再改造**:四个 eval 全是 TEMPLATE(从未执行),无 before 基线则"改造后更好"是无对照主张。**阶段 0 并行动作:对现状 v1 跑一遍现有 13 题 user-question-eval + persona-diff(哪怕人工小样本),拿到 before 分数**,作为可证伪基线。

| 阶段 | 动作 | 收益 / 风险 |
|---|---|---|
| **0a. 基线** | 对现状 v1 实跑 user-question-eval + persona-diff 拿 before 分(人工小样本可) | 让后续回归可证伪;无代码改动 |
| **0b. 纯减负** | 脚本批量剥离 228 处轴标签 + 删 6 处"最新动作刷新";**加断言:`## 适用问题` 非空 + 8 个 cockpit section 子串仍在** | 零内容损失、零风险、立省 token |
| **1. cockpit 防护先行** | 写 Serenity cockpit 冒烟测试(断言每 ticker/sector 卡片 thesis/summary/evidence/parent 非空);定 section 兼容表 | **改任何标题前必须先有这道门**,否则持仓页空白上线 |
| **2. 去重中心化** | 按 §4 落点,(a) 类收敛 + 结论摘要,**(b) 类就地保留**;通用方法定义上提 core | 中风险,直接消除复读放大 |
| **3. core + macro 重铸** | core 收敛硬清单 + 删 always-on 易变数字;macro 软化模板 | always-on 最影响所有回答,改对收益最大 |
| **4. framework 去模具(最高杠杆)** | 旧 7 文件删骨架/模板、补 3 白话问题 + 简短版 + 保留轻量 load/退出路由;先改 ask-about-stock(样例)作模板 | 直接塑造输出形态;批量同构 |
| **5. 新建三专项** | `ask-to-evaluate`(目的2)、`ask-to-discover`(目的3)、3-4 个新 marker;ticker 加 `## 观点时间线`(深度按拐点数,**tweet_id 内联,不加 stance_history frontmatter**) | 补全三目标核心增量 |
| **6. ticker 重铸 + 合并降级【工作量上修】** | **24 个(非 6 个)带输出模板的 ticker 全量套 7 段镜头模板**(标题守 cockpit 子串);NBIS 这类核心票单文件成本最高(进度刷新+King论证+模板+轴+重复数字);POET/JBL/CRWV/CIFR/AEHR/ALAB 合并前查 `所属上级` 反向引用 + 跑冒烟测试 | 量大同构放后;合并需谨慎 |
| **7. (可选 P2) 运行时时序工具** | 若产品愿投入:新建 `get_kol_tweets_by_symbol` 工具 + db symbols 过滤(触及共享层,未验证) | **非目的1 前置;不做也能闭环** |
| **8. README + eval 实跑回归** | README 改掉"统一模板比 Frank 多 2 段"定调;eval 升级并实跑对比 before/after | 收尾 |

**eval 验证(三目标导向 + 复审守护,实跑非模板):**

- **evidence-audit**:对扩展后 corpus 重跑,补 quote 原文连续子串匹配 + 归因正确性(只管引用真实性)。
- **目的1 回归**:给一个标的(IREN/POET),要求答出**带日期的演变弧线**(她 X 月说什么→触发→现在),区分 thesis-break vs 轮动 vs 被验证才得分;**验证 agent 是否读到 `## 观点时间线` 正文 + 内联 id(因运行时无时序检索,弧线只能来自正文)**。
- **目的2 回归(硬考法)**:(a) 给她覆盖过的赛道里**从未点名的标的**,看 agent 能否跑判断链 + 正确声明"用她方法外推"+ **客观事实是否走 data-tool 而非编造**;(b) **persona-diff(从 TEMPLATE 提升为实跑门禁)**守护"博主视角不退化成免责投顾";加一道反向题测"面对她重仓的高波动小盘,agent 是否把她本人风险自觉 **inline 自然织入论证**,而非外挂尾部免责块"。
- **目的3 回归**:(a) holdout——给她发推**之前**一条新闻,看 agent 能否 frontrun 出她**后来**点名的标的;(b) **专测"有据感的瞎编"失败模式**——无语料支撑时 agent 是否仍硬编 BOM 节点(应走 data-tool 或诚实标注 `[方法推断]`);(c) "下一个可能被点名的 InP/CPO 上游卡点"评分要求走完整方法链 + 诚实标注,而非背已知名单。
- **命名预言机回归(复审 mustFix)**:专测 NVDA.md 压缩后是否仍能复现"被点名环节→她卡位下游标的"的 frontrun 推理。
- **删除/改造**表面合规评法(routing 命中、skill 加载、有没有 voice marker、贴风险标签即得分)和期望答案里的过时硬 PT。

---

## 8. 逐条 mustFix 回应台账

| # | 复审 mustFix | 处置 |
|---|---|---|
| F1 | EWY/WULF 范本事实错误 + ticker 模板工作量 6→24 | **采纳**。范本改 NVDA/ASML/SOI;§2 ticker 节 + 阶段 6 上修到 24 文件 |
| F2 | 命名预言机加保护护栏(≥4 dated 实例 + keynote 剧本,去重豁免) | **采纳**。§2 ticker 必留 + §4 oracle 不指针化 + §7 eval 专测 |
| F3 | 去重加"推理输入豁免"分类((a) 数字 vs (b) load-bearing) | **采纳**。§4 整表重做,(b) 类就地保留 |
| F4 | 护栏从 4 条 checklist 降为 inline 单一原则 + 上限 + eval 反向题 | **采纳**。§3 目的2/3 护栏 inline 化 + §7 反向题 |
| F5 | persona-diff 从 TEMPLATE 升为实跑门禁(前基线+后回归) | **采纳**。§7 阶段 0a + eval |
| T1 | 目的1 运行时工具不存在(search_kol_tweets 无时序、/tweets 非 agent 工具) | **采纳·重设计**。§3 目的1 改纯 .md + 内联 id + 语义召回;时序工具降为 P2 可选 |
| T2 | timeline 深度按拐点数(非固定 3-5 行)+ 删运行时时序措辞 | **采纳**。§3 目的1 |
| T3 | ticker 输出模板 6→实测 24+(全语料 43)工作量重估 | **采纳**。同 F1,§2 + 阶段 6 |
| T4 | 目的2/3 事实来源规则打架 → 统一(data-tool 补事实 vs 记忆编造) | **采纳**。§3 目的2 统一裁定:事实走工具、判断走框架、记忆不许编 |
| R1 | cockpit_v3 section 标题耦合(改名→持仓页空白) | **采纳·最高优先级**。§2 子串兼容表 + 冒烟测试 + 阶段 1 门禁 |
| R2 | 目的1 运行时基础不成立,如实写清依赖 | **采纳**。同 T1,/tweets 扩展降为可选非阻塞 |
| R3 | stance_history frontmatter 是 no-op | **采纳**。全删该依赖,弧线只靠正文 `## 观点时间线` |
| (risk) 量化夸大(EWY 11文件/18次非26/112) | **采纳**。§4 用实测口径,不作夸大基线 |
| (risk) 删 load 路由太激进 | **采纳**。§2 + §6 AFTER 保留 `## 必须完成的动作` + `## 退出路由` |
| (risk) 漏加载丢事实 | **采纳**。§4 被指针化事实在 sector 留一行结论摘要(非纯指针) |
| (risk) 轴剥离误伤 `## 适用问题` | **采纳**。§5 + 阶段 0b 加断言 |
| (risk) 新 framework 路由竞争 | **采纳**。见下方路由矩阵 |

**【复审 risk · 新增】framework 路由优先级矩阵**(解决 ask-to-evaluate / ask-to-discover 与既有文件关键词重叠):

| 用户意图信号 | 路由到 | 优先级说明 |
|---|---|---|
| 句中单个 ticker/公司名 + "怎么看/还能买/升降仓" | `ask-about-stock` | 标的明确 + 问判断 → 个股镜头 |
| "她整体看好啥 / top picks / 现在买什么" | `ask-for-top-picks` | 要她现有清单 |
| 标的**她从未点名** + 问"怎么看/值不值" | `ask-to-evaluate` | ask-about-stock coverage=none 时退出到此 |
| "找一个像 X 的 / 下一个 X / 还有什么机会 / 帮我发现" | `ask-to-discover` | 生成式发现,无既定标的 |
| "X 是不是共识 / price in 了吗 / 大家都知道了吗" | `ask-is-consensus` | priced-in 判定;也被 evaluate/discover 第④步调用 |
| 一条新闻 + "这意味着什么 / 谁受益" | `ask-news-decoder` | 新闻解码;discover 的上游 |
| "她对 X 看法变了吗 / 从 X 月怎么演变" | `ask-about-stock` 的"演变"段 → 读 ticker `## 观点时间线` | 目的1 |

判别核心:**有既定标的且她覆盖过 → about-stock;有既定标的但她没覆盖 → evaluate;无既定标的要生成 → discover**。三者在入口前言互写一句"如果……请去……"的退出路由,降低误命中。

---

**全程不碰** `kol_research/agent.py` 的 `_SKILL_TOOL_USAGE_RULES` 共享引擎(已核实它本就强制 BLUF + 只挑 2-3 点,删骨架是停止与它对打)、**不碰 `qinbafrank/` 目录**、**不碰 `shared/kol_persona` 向量层**(P2 可选时序工具若做需另立项重新表态);所有物料改动限定在 `serenity-skill-v1/` 内;只重铸形态不删知识;第一性是博主视角,认知谦逊作为她视角的一部分 inline 自然带出,不外挂对打免责框。**新增唯一非物料硬依赖:Serenity cockpit 冒烟测试 + 轴剥离断言脚本(防回归,不改业务逻辑)。**

相关文件路径(worktree 下 `/Users/kedeng/projects/stock-agent/.claude/worktrees/serenity-skill-distillation/`):
- 改造入口:`backend/app/features/twitter/methodologies/_drafts/serenity-skill-v1/core/bottleneck-operating-system.md`、`.../framework/ask-about-stock.md`(样例已给)
- 新建:`.../framework/ask-to-evaluate.md`、`.../framework/ask-to-discover.md`、`.../framework/` 下 3-4 个 marker
- 轴定义保留地:`.../_audit/methodology-spec.md`
- **回归耦合点(改 section 标题前必读)**:`backend/app/features/kol_research/cockpit_v3.py`(`_fuzzy_section` 第 263 行 + 8 个 needle)、路由 `backend/app/features/kol_research/router.py`(`_is_skill_cockpit` 第 164 行,Serenity 走 v3)
- **运行时事实核验来源**:`backend/app/shared/kol_persona/tools.py`(`search_kol_tweets` 纯语义,无时序)、`backend/app/shared/kol_persona/skills.py`(`skill_doc_to_adk_skill` frontmatter extra 不进 LLM)、`backend/app/features/twitter/router.py`(`/tweets` 是 REST 非 agent 工具)、`backend/app/features/twitter/db.py`(`get_tweets` 无 symbols)
- 对照范本(只读不改):`backend/app/features/twitter/methodologies/qinbafrank/framework/ask-about-stock.md`