# Frank Persona Content Architecture Engineering Plan

> Status: Planning
> Related: `docs/reference/frank-feedback-raw.md`, `frontend/src/app/kol/.context.md`, `frontend/src/app/kol/[username]/page.tsx`, `frontend/src/app/kol/[username]/sectors/page.tsx`, `frontend/src/app/kol/[username]/latest/page.tsx`, `frontend/src/app/kol/[username]/stocks/page.tsx`
> Vision: 把 qinbafrank 专属页从“博主驾驶舱”升级为“Frank 过往精华内容与产业/市场框架的结构化档案馆”，让用户既能读到原文精华，也能直观看懂他如何拆产业、判断市场和落到标的。

## Frank 反馈记录（2026-06-01 整理）

这份反馈是内容策展和信息架构输入，不是运行时事实源。面向用户展示时，仍必须回到公开推文、日期和原文链接验证；没有命中原文的点只能标为「待补原文证据」或「方法论推断」。

### 原始反馈主题

1. **AI 大趋势**：最早 AI 大趋势、过往 AI 推文、渗透率、产业进化、加速正在被加速、竞争格局演化。
2. **Capex 战争与瓶颈传导**：资本开支战争、算力瓶颈传导逻辑、看好的行业，以及存储、光、CPU、800V HVDC、电力、边缘/端侧 AI 等行业拆解地图。
3. **美股规律**：美股调整规律、杀估值、杀业绩、杀逻辑，以及从 2025 年初开始的美股行情判断。
4. **公司推荐 / 公司案例**：PLTR、Robinhood / HOOD、美光 / MU、7709、EWY、CPU 产业链核心、AVGO、BB、IBM 等。
5. **宏观流动性**：宏观流动性、过往流动性推文、有限度宽松、财政扩张 2.0。
6. **贸易战与地缘 / 商业内容**：中美贸易战、中日、委内瑞拉、伊朗，以及相关财经和商业推文。
7. **加密 / RWA / 美股代币化**：加密产业发展、美股代币化、RWA、加密认知迭代、暴论和虚无论、加密与 AI 的结合。
8. **内容库**：Frank 发来的精选推文和文章需要归档为可读、可验证、可继续追问的精华内容，而不是只按时间倒序散落在 feed 中。

### 产品解读

- Frank feedback 最适合沉淀为一个独立的「过往精华观点」页面或内容库 tab，负责展示人工策展后的长期主题。
- 它不应该吞掉完整产品架构。用户仍需要三个独立价值层：全量原文 / ticker 聚合 / 最新动态，个股研究与价格验证，以及 Chat 追问。
- 原先「五个一级板块」是对反馈的一次内容架构解读；后续可收敛为「精华观点」页面内部导航，把 AI、Capex、美股规律、公司案例、宏观、Crypto/RWA 放在同一个精选档案馆里。
- 首页更适合承担总控台职责：最近更新、新出现 ticker、高频标的、进入精华观点 / 个股 / 全量内容库 / Chat 的入口，而不是完整承载所有 Frank feedback。
- 个股页和全量内容库是用户信任基础：必须让用户看到不是只挑了几条推文，而是能查完整 corpus、回到原文、验证价格和时间线。

## 目标

重构 `/kol/qinbafrank` 的内容架构，把 Frank 反馈中的全部主题收敛为五个一级板块：产业板块、美股规律、公司推荐、宏观内容、内容库。AI 和加密/RWA 都归入产业板块；公司推荐复用并升级现有 stocks 页面；内容库复用并升级现有 latest 页面。每个板块同时承担两个任务：展示过往精华内容，以及把他对产业链/市场机制的理解用可视化、地图化、时间线化的方式呈现给用户。

## 现状

当前页面已有基础：

- `/kol/qinbafrank` 首页：展示产业地图 preview、历史验证、标的案例、原文库、追问入口。
- `/kol/qinbafrank/sectors`：当前承载产业地图，但结构仍偏“产业卡片”，还没有严格按 Frank 反馈的五大板块重组。
- `/kol/qinbafrank/latest`：全量原文库，但缺少“精华内容库”的人工分类和精选入口。
- `/kol/qinbafrank/stocks`：标的案例，适合升级为“过往公司推荐”独立页面。
- `/kol/qinbafrank/history`：历史验证，适合和“美股规律”结合，但目前还不是完整的市场规律页。
- `/kol/qinbafrank/macro`：旧兼容入口，后续应升级为“宏观内容”页面。

关键问题：

1. 页面价值不够清楚：用户不知道这是“看原文库”还是“看方法论”还是“看股票”。
2. 板块不贴 Frank 原反馈：当前产业地图把内容重组得过于产品化。
3. “精华内容”和“框架理解”没有在同一个板块里互相支撑。

## 页面定位

Frank 专属页应该是：

> 一个基于 qinbafrank 公开历史内容整理出来的“投资研究档案馆 + 框架地图”。它不是普通博主页，也不是简单推文列表，而是把他过去反复讲过的 AI、宏观、美股规律、加密和公司案例，整理成用户能读、能看懂、能验证、能继续追问的结构化页面。

页面的核心用户体验：

1. **先看到他长期关注什么**：产业、美股规律、公司、宏观、内容库五个入口，而不是一堆混杂卡片。
2. **进入某个板块后，先看框架图**：例如产业板块先看 AI 和加密/RWA 两条产业主线。
3. **再看精华内容**：每个节点下面挂精选推文/文章，而不是让用户自己翻 2000 多条原文。
4. **最后能继续追问或验证**：跳到研究助手、标的页、历史验证页。

## 一级板块

### 1. 产业板块

产业板块合并 AI 相关和加密货币/RWA。原因：这两类内容本质上都是 Frank 对“新产业如何形成、如何传导、最后落到哪些资产”的拆解。AI 是算力和应用产业链，加密/RWA 是金融基础设施产业链。

来源于 Frank 反馈中的第 1、2、7 个话题。

#### 1.1 AI 大趋势与 Capex 战争

来源于 Frank 反馈中的第 1、2 个话题：

- 最早 AI 大趋势
- 过往 AI 推文
- 渗透率
- 产业进化
- 加速正在被加速
- 竞争格局演化
- 资本开支战争
- 算力瓶颈传导逻辑
- 看好的行业
- 行业拆解地图：存储、光、CPU、800V HVDC、电力、边缘/端侧 AI

页面表达：

- 产业地图只有两个 Tab：`AI` 和 `Crypto / RWA`。
- AI Tab 固定两层，不再把 AI 基建 / AI 应用 / 半导体链做成并列顶层卡片。
- 第一层是“AI 大趋势”，是一条认知演化线：
  `社会智力成本拐点 → 渗透率黄金区间 → Agent 加速 → 竞争格局收敛`
- 第二层是“资本开支战争 / 瓶颈传导”，是一张产业链传导图：
  `Capex War → 算力紧俏 → HBM/存储 → 光模块/800G/网络/ASIC → CPU → 电力/800V HVDC → 边缘/端侧 AI`
- 每个节点右侧 inspector 固定展示：
  - Frank 的判断
  - 观察指标
  - 相关标的
  - 精选原文
- AI 下方继续挂产业板块精华内容，作为跨节点的原文库入口。

#### 1.2 加密货币与 RWA

来源于 Frank 反馈中的第 7 个话题：

- 加密产业发展
- 美股代币化
- RWA
- 加密认知迭代
- 暴论和虚无论
- 加密与 AI 的结合

页面表达：

- Crypto / RWA Tab 是一张“加密金融化地图”：
  `稳定币 → RWA → 美股代币化 → 交易入口 → 加密 x AI`
- 子板块：
  - 稳定币 / 结算层
  - RWA / 代币化股票
  - 交易入口：HOOD、COIN、CRCL
  - 认知迭代：从投机到金融基础设施
  - 虚无论：成熟市场分化、山寨币出清
  - 加密 x AI：Agent wallet、链上结算、自动交易
- 精华内容按“AI / 加密”两个 tab 或 segment 展示，不再单独开一级加密页面。

### 2. 美股的规律

来源于 Frank 反馈中的第 3 个话题：

- 美股调整规律
- 杀估值
- 杀业绩
- 杀逻辑
- 从 2025 年初开始的美股行情判断

页面表达：

- 顶部是一张“市场调整分级图”：
  `小级别调整 → 中级别调整 → 大级别风险`
- 第二层是“三杀框架”：
  `杀估值 / 杀业绩 / 杀逻辑`
- 第三层是时间线验证：
  - 2025 年初判断
  - 春劫行情
  - 11 月杀估值
  - 后续反转条件
- 每个判断节点需要配：
  - 当时原文
  - 判断框架
  - 指数后续走势
  - 是否验证 / 部分验证 / 待验证

### 3. 公司推荐

来源于 Frank 反馈中的第 4 个话题：

- PLTR
- Robinhood / HOOD
- 美光 / MU
- 7709
- EWY
- CPU 产业链核心
- 博通 / AVGO
- BB
- IBM

页面表达：

- 这不是新建一个完全独立页面，而是升级现有 `/kol/qinbafrank/stocks`。导航 label 从“标的案例”改为“公司推荐”，路由可继续保留 `/stocks` 以减少改动。
- 每家公司不是简单展示 ticker，而是展示“他为什么推荐/关注”：
  - 最早提及时间
  - 核心 thesis
  - 所属产业节点
  - 后续价格/基本面变化
  - 精选原文
  - 当前是否仍在框架内
- 与现有 stocks 能力结合：
  - 左侧/顶部仍保留 ticker 搜索和覆盖列表。
  - 详情区新增“推荐档案”：最早提及、核心 thesis、产业归属、精选原文、后续价格走势。
  - 当前价格图和推文时间线继续保留，作为验证层。

### 4. 宏观内容

来源于 Frank 反馈中的第 5、6 个话题：

- 宏观流动性
- 过往关于宏观流动性的推文
- 有限度宽松
- 财政扩张 2.0
- 中美贸易战
- 中日
- 委内瑞拉
- 伊朗
- 相关财经和商业推文

页面表达：

- 顶部是“宏观传导地图”：
  `流动性 → 财政扩张 → 利率/美元 → 地缘/贸易 → 风险资产`
- 子板块：
  - 流动性：TGA、准备金、SLR、Fed put
  - 财政扩张 2.0：政策节奏、财政主导、市场影响
  - 贸易战与地缘：中美、中日、伊朗、委内瑞拉
  - 宏观如何传到美股、加密、区域资产
- 每个节点下面挂精选原文。

### 5. 内容库

内容库合并 “library” 和现有 `/latest`。原因：用户不需要同时理解“精选库”和“最新原文”两个入口；一个页面内用 tab 区分即可。

来源：

- Frank 发来的所有精选推文和文章
- 全量公开推文流
- 每个板块下挂载的 evidence

页面表达：

- 路由继续使用 `/kol/qinbafrank/latest`，导航 label 改为“内容库”或“原文库”。
- 页面顶部提供两个主要 tab：
  - 精华内容：按产业 / 美股规律 / 公司推荐 / 宏观分类，展示人工整理的高质量内容。
  - 全量原文：保留当前 latest feed 的分页、过滤和原文流能力。
- 每张精选内容卡包含：
  - 所属板块
  - 主题标签
  - 日期
  - 摘要
  - 为什么重要
  - 原文链接
- 这样 library 不另开新页，latest 从“时间流”升级为“精选 + 全量”的内容库。

## 导航设计

Frank 专属页导航应改为：

1. 主页
2. 产业板块
3. 美股规律
4. 公司推荐
5. 宏观
6. 内容库
7. 追问

如果横向空间不够，移动端可用横向 scroll，桌面侧栏用 icon + tooltip。

## 页面关系

建议路由：

```text
/kol/qinbafrank                    首页：五大板块总览
/kol/qinbafrank/sectors            产业板块：AI 大趋势 / capex 战争 / 加密货币与 RWA
/kol/qinbafrank/market-rules       美股规律：三杀框架 + 指数历史验证
/kol/qinbafrank/stocks             公司推荐：PLTR / HOOD / MU / 7709 / EWY / AVGO / BB / IBM
/kol/qinbafrank/macro              宏观内容：流动性 / 财政扩张 / 贸易战 / 地缘
/kol/qinbafrank/latest             内容库：精选内容 + 全量原文流
```

MVP 可以复用现有路由降低改动：

- `/sectors` 改为“产业板块”，内部合并 AI 和加密/RWA
- `/stocks` 改名为“公司推荐”，保留股票价格、提及时间线和 ticker 搜索
- `/history` 后续升级为“美股规律”
- `/latest` 改为“内容库”，顶部加“精华内容 / 全量原文”tab，不新建 `/library`

## 数据结构

所有板块共用一个内容策展结构：

```ts
interface FrankContentSection {
  id: 'industries' | 'market-rules' | 'companies' | 'macro' | 'library';
  label: string;
  purpose: string;
  mapBlocks: FrankMapBlock[];
  featuredItems: FrankFeaturedContent[];
}

interface FrankMapBlock {
  id: string;
  label: string;
  type: 'timeline' | 'chain-map' | 'matrix' | 'case-grid';
  thesis: string;
  nodes: FrankMapNode[];
}

interface FrankMapNode {
  id: string;
  label: string;
  frankView: string;
  watchMetrics?: string[];
  assets?: string[];
  evidenceIds: string[];
}

interface FrankFeaturedContent {
  id: string;
  title: string;
  type: 'tweet' | 'thread' | 'article';
  date: string;
  sourceUrl: string;
  sectionId: FrankContentSection['id'];
  topicIds: string[];
  summary: string;
  whyItMatters: string;
}
```

## 实施步骤

1. [ ] 把当前 `industryMapData.ts` 升级或替换为 `frankContentData.ts`，按“产业 / 美股规律 / 公司推荐 / 宏观 / 内容库”建数据。
2. [ ] 首页改成五大板块总览，每张卡同时显示“框架图入口 + 精华内容数量”。
3. [ ] 将 `/sectors` 改造成“产业板块”，内部合并 AI 大趋势、capex/算力瓶颈地图、加密货币与 RWA。
4. [ ] 新增或改造美股规律页面，承载三杀框架和指数验证。
5. [ ] 将 `/stocks` 改造成“公司推荐”页面，并保留现有 ticker 列表、价格图和推文时间线。
6. [ ] 将 `/macro` 改造成 Frank 宏观内容页。
7. [ ] 将 `/latest` 改造成“内容库”，增加“精华内容 / 全量原文”tab，避免新建 `/library`。
8. [ ] 更新 `SubNav`、`frontend/src/app/kol/.context.md`、`docs/reference/pages.md`。
9. [ ] 跑 lint、tsc、build 和 Playwright 桌面/移动端验证。

## 待定问题

1. 美股规律是否复用 `/history`，还是新增 `/market-rules` 并让 `/history` 只做验证子页。
2. 精华内容库是否只放 Frank 发来的这些链接，还是从 Insforge 全量推文里再筛一轮高质量内容。
3. 文章和推文是否共用同一张内容卡；如果有长文，需要补文章来源、标题和摘要字段。
4. 指数历史走势验证需要数据源，市场规律页是否使用现有行情 API 还是先静态展示时间点。
