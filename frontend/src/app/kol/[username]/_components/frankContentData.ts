import { tweetHref } from './researchMapData';

export type FrankSectionId = 'highlights' | 'stocks' | 'library' | 'chat';
export type FrankHighlightTopicId =
  | 'ai-trend'
  | 'capex-war'
  | 'company-theses'
  | 'market-rules'
  | 'market-timing'
  | 'macro-geopolitics'
  | 'crypto-rwa';
export type FrankContentType = 'tweet' | 'thread' | 'article';

export interface FrankHighlightTopicSummary {
  id: FrankHighlightTopicId;
  label: string;
  shortLabel: string;
  description: string;
  principle: string;
  href: string;
  question: string;
}

export interface FrankFeaturedContent {
  id: string;
  sourceId?: string;
  topicId: FrankHighlightTopicId;
  topic: string;
  title: string;
  date: string;
  type: FrankContentType;
  summary: string;
  whyItMatters: string;
  tickers?: string[];
  sourceUrl?: string;
}

export interface FrankFeaturedGroup {
  id: string;
  topicId: FrankHighlightTopicId;
  title: string;
  summary: string;
  whyItMatters: string;
  tickers?: string[];
  itemIds: string[];
}

export interface FrankSectionSummary {
  id: FrankSectionId;
  label: string;
  shortLabel: string;
  href: string;
  purpose: string;
  mapHint: string;
  featuredCount: number;
}

export interface FrankCompanyRecommendation {
  ticker: string;
  name: string;
  industryPosition: string;
  thesis: string;
  firstMention: string;
  followThrough: string;
  evidenceIds: string[];
}

export interface FrankMacroBlock {
  id: string;
  label: string;
  thesis: string;
  transmission: string;
  watch: string[];
  evidenceIds: string[];
}

export const FRANK_HIGHLIGHT_TOPICS: FrankHighlightTopicSummary[] = [
  {
    id: 'ai-trend',
    label: 'AI 大趋势',
    shortLabel: 'AI 趋势',
    href: '/kol/qinbafrank/highlights?topic=ai-trend',
    description: '最早 AI 大趋势、过往 AI 推文、渗透率、产业进化、加速正在被加速，以及竞争格局演化。',
    principle: '先判断 AI 是否仍处在渗透率红利和产业进化窗口，再看估值、竞争和资本回报争议。',
    question: '按 qinbafrank 的 AI 大趋势框架，AI 渗透率、产业进化和竞争格局现在分别处在什么阶段？',
  },
  {
    id: 'capex-war',
    label: '资本开支战争',
    shortLabel: 'Capex',
    href: '/kol/qinbafrank/highlights?topic=capex-war',
    description: '资本开支战争、算力瓶颈传导逻辑，以及存储、光、CPU、800V HVDC、电力、边缘/端侧 AI 等行业拆解。',
    principle: 'AI 机会不是停在 GPU 一层，而是沿着瓶颈向存储、互联、CPU、电力和端侧继续传导。',
    question: '按 qinbafrank 的资本开支战争框架，AI capex 的瓶颈正在向哪些产业链环节传导？',
  },
  {
    id: 'company-theses',
    label: '过往推荐公司',
    shortLabel: '公司',
    href: '/kol/qinbafrank/highlights?topic=company-theses',
    description: 'PLTR、Robinhood、美光、7709、EWY、CPU 产业链核心、博通、BB，以及待补证据的 IBM。',
    principle: '个股不是孤立 ticker，而是产业主线、宏观环境和商业模式变化在公司层面的落点。',
    question: '按 qinbafrank 的公司推荐框架，PLTR、HOOD、MU、AVGO、BB、EWY、7709 分别对应什么产业逻辑？',
  },
  {
    id: 'market-rules',
    label: '美股调整规律',
    shortLabel: '调整规律',
    href: '/kol/qinbafrank/highlights?topic=market-rules',
    description: '美股调整规律、杀估值、杀业绩、杀逻辑，以及不同回撤性质的判断框架。',
    principle: '先识别下跌性质，再决定是估值重置、业绩压力还是核心逻辑破坏。',
    question: '按 qinbafrank 的美股调整规律，当前回撤更像杀估值、杀业绩还是杀逻辑？',
  },
  {
    id: 'market-timing',
    label: '美股行情判断',
    shortLabel: '行情判断',
    href: '/kol/qinbafrank/highlights?topic=market-timing',
    description: '从 2025 年初开始的美股行情判断、节奏复盘、关键节点和后续验证。',
    principle: '把行情观点放回当时的时间点，观察判断条件、风险等级和后续走势是否被验证。',
    question: '按 qinbafrank 从 2025 年初开始的行情判断，美股当前节奏应该如何复盘和定位？',
  },
  {
    id: 'macro-geopolitics',
    label: '宏观与地缘',
    shortLabel: '宏观',
    href: '/kol/qinbafrank/highlights?topic=macro-geopolitics',
    description: '宏观流动性、有限度宽松、财政扩张 2.0、中美贸易战、中日、委内瑞拉、伊朗等相关推文。',
    principle: '宏观不是背景板，而是通过流动性、财政、贸易、能源和风险溢价传导到风险资产。',
    question: '按 qinbafrank 的宏观框架，流动性、财政扩张和地缘贸易如何传导到美股与加密资产？',
  },
  {
    id: 'crypto-rwa',
    label: '加密基建与 RWA',
    shortLabel: '加密/RWA',
    href: '/kol/qinbafrank/highlights?topic=crypto-rwa',
    description: '代币化、RWA、美股代币化、加密认知迭代、暴论和虚无论，以及加密与 AI 的结合。',
    principle: '加密主线从纯流动性 beta 走向真实资产上链、金融基础设施和 AI 交互入口。',
    question: '按 qinbafrank 的加密框架，RWA、美股代币化和 AI 结合分别对应什么机会与风险？',
  },
];

const topicById = FRANK_HIGHLIGHT_TOPICS.reduce(
  (acc, topic) => {
    acc[topic.id] = topic;
    return acc;
  },
  {} as Record<FrankHighlightTopicId, FrankHighlightTopicSummary>,
);

const SOURCE_DATES: Record<string, string> = {
  '1761228703751971159': '2024-02-24',
  '1781141289381273831': '2024-04-19',
  '1798703027077206032': '2024-06-06',
  '1798953514837610894': '2024-06-07',
  '1799037612503793666': '2024-06-07',
  '1814123900399165638': '2024-07-19',
  '1816383628235989447': '2024-07-25',
  '1817509953545838620': '2024-07-28',
  '1886233764197736751': '2025-02-03',
  '1887674164867440965': '2025-02-07',
  '1895270832156614924': '2025-02-28',
  '1899973508693975221': '2025-03-12',
  '1918556140264153535': '2025-05-03',
  '1919010067225120824': '2025-05-04',
  '1920992310780981284': '2025-05-10',
  '1926526254494150796': '2025-05-25',
  '1945825731793322468': '2025-07-17',
  '1947143450492608947': '2025-07-21',
  '1950809665794986321': '2025-07-31',
  '1966309713211175233': '2025-09-12',
  '1973043276568781033': '2025-09-30',
  '1975423593787047963': '2025-10-07',
  '1976176693984592273': '2025-10-09',
  '1984556367093395469': '2025-11-01',
  '1984964367629025321': '2025-11-02',
  '1986487386763886825': '2025-11-06',
  '1986633517087007159': '2025-11-07',
  '1988826907534860695': '2025-11-13',
  '1991005823351611431': '2025-11-19',
  '1991134950473761055': '2025-11-19',
  '1991290721526247791': '2025-11-19',
  '1992490737573724577': '2025-11-23',
  '1994216596479594609': '2025-11-28',
  '1997561492909298132': '2025-12-07',
  '1998238044877647882': '2025-12-09',
  '1999693092446962158': '2025-12-13',
  '2008402498823090398': '2026-01-06',
  '2011679701769863353': '2026-01-15',
  '2015377625167089671': '2026-01-25',
  '2018129302114689163': '2026-02-02',
  '2018978431732760904': '2026-02-04',
  '2020093693819289895': '2026-02-07',
  '2023597321368547520': '2026-02-17',
  '2026602891998539876': '2026-02-25',
  '2027238317323137395': '2026-02-27',
  '2029074784429195357': '2026-03-04',
  '2034096333314003072': '2026-03-18',
  '2041776052167483750': '2026-04-08',
  '2043653387271712962': '2026-04-13',
  '2043910896351883636': '2026-04-14',
  '2043991474753417546': '2026-04-14',
  '2044580442704396782': '2026-04-16',
  '2044677096526741639': '2026-04-16',
  '2044758715967156502': '2026-04-16',
  '2045031360004558969': '2026-04-17',
  '2048051142975008855': '2026-04-25',
  '2051838078420242854': '2026-05-06',
  '2057739575372706022': '2026-05-22',
  '2059802180379656378': '2026-05-28',
  '2060388312033182068': '2026-05-29',
};

function content(
  sourceId: string,
  topicId: FrankHighlightTopicId,
  title: string,
  summary: string,
  whyItMatters: string,
  tickers: string[] = [],
  type: FrankContentType = 'tweet',
  date?: string,
): FrankFeaturedContent {
  return {
    id: `${topicId}-${sourceId}`,
    sourceId,
    topicId,
    topic: topicById[topicId].label,
    title,
    date: date ?? SOURCE_DATES[sourceId] ?? '',
    type,
    summary,
    whyItMatters,
    tickers,
    sourceUrl: tweetHref(sourceId),
  };
}

function featuredItemId(topicId: FrankHighlightTopicId, sourceId: string) {
  return `${topicId}-${sourceId}`;
}

function group(
  id: string,
  topicId: FrankHighlightTopicId,
  title: string,
  summary: string,
  whyItMatters: string,
  itemSourceIds: string[],
  tickers: string[] = [],
): FrankFeaturedGroup {
  return {
    id: `${topicId}-${id}`,
    topicId,
    title,
    summary,
    whyItMatters,
    itemIds: itemSourceIds.map((sourceId) => featuredItemId(topicId, sourceId)),
    tickers,
  };
}

function pendingContent(
  id: string,
  topicId: FrankHighlightTopicId,
  title: string,
  summary: string,
  whyItMatters: string,
  tickers: string[] = [],
): FrankFeaturedContent {
  return {
    id: `${topicId}-${id}`,
    topicId,
    topic: topicById[topicId].label,
    title,
    date: '待补原文',
    type: 'tweet',
    summary,
    whyItMatters,
    tickers,
  };
}

export const FRANK_FEATURED_CONTENT: FrankFeaturedContent[] = [
  content(
    '1761228703751971159',
    'ai-trend',
    '最早把 AI 作为长期产业主线',
    '归入 AI 大趋势起点：不是按单次财报交易，而是把 AI 放进长期产业革命和渗透率框架。',
    '后续所有 AI capex、算力瓶颈和竞争格局讨论，都应该回到这个长期主线判断。',
    ['NVDA', 'MSFT', 'GOOGL'],
    'thread',
    '2024-02-24',
  ),
  content(
    '1988826907534860695',
    'ai-trend',
    'AI 趋势从共识走向回报率争议',
    '承接 AI 大趋势，讨论市场争议如何从“是不是趋势”推进到“投入的钱能否赚回来”。',
    '它帮助用户理解为什么 AI 主线会出现阶段性估值波动，但不等于产业逻辑结束。',
    ['NVDA', 'AVGO'],
    'thread',
  ),
  content(
    '1966309713211175233',
    'ai-trend',
    'AI 渗透率与科技股红利窗口',
    '把 AI 采用率、产业渗透和科技股投资窗口放在同一个框架里。',
    '这是判断 AI 板块是否还处在主升阶段，而不是只看短期涨跌的关键尺子。',
    ['NVDA', 'PLTR'],
  ),
  content(
    '1919010067225120824',
    'ai-trend',
    'AI 产业进化的阶段性观察',
    '围绕 AI 从模型叙事走向应用、基础设施和商业化的产业进化路径。',
    '用户可以用它理解 qinbafrank 不是只追单个龙头，而是在看产业阶段切换。',
    ['MSFT', 'GOOGL', 'PLTR'],
  ),
  content(
    '2048051142975008855',
    'ai-trend',
    '加速正在被加速',
    '归档到 AI 大趋势中“加速正在被加速”的判断：技术进步、资本投入和应用扩散互相强化。',
    '这是解释 AI 叙事为何会连续扩散到多个产业节点的核心内容。',
    ['NVDA', 'AVGO', 'PLTR'],
  ),
  content(
    '2011679701769863353',
    'ai-trend',
    'AI 主线的再确认',
    '用于补齐 AI 大趋势在后续阶段的复盘和再确认。',
    '它让用户看到 qinbafrank 的观点不是一次性判断，而是持续校准的历史链条。',
    ['QQQ', 'NVDA'],
  ),
  content(
    '1950809665794986321',
    'ai-trend',
    'AI 产业演化与投资节奏',
    '从产业演化角度讨论 AI 主线的阶段、节奏和分化。',
    '这条内容适合和渗透率框架放在一起，判断哪些公司仍在产业主线内。',
    ['NVDA', 'AMD', 'PLTR'],
  ),
  content(
    '1976176693984592273',
    'ai-trend',
    'AI 竞争格局继续演化',
    '归档为 AI 竞争格局演化内容，用来观察巨头、芯片、应用和基础设施之间的再分配。',
    '它能帮助用户把“谁受益”从单点公司扩展到产业链位置。',
    ['NVDA', 'AVGO', 'MSFT'],
  ),

  content(
    '1973043276568781033',
    'capex-war',
    '资本开支战争的总框架',
    '从 AI 巨头资本开支出发，讨论算力需求、供给瓶颈和产业链受益方向。',
    '它是资本开支战争板块的入口：先看钱投向哪里，再看瓶颈在哪里。',
    ['NVDA', 'AVGO', 'MSFT'],
    'thread',
  ),
  content(
    '1975423593787047963',
    'capex-war',
    'AI capex 向硬件链传导',
    '整理 AI 资本开支对硬件、互联、供电和供应链的传导路径。',
    '这解释为什么过往精华内容库不能只收录推文，而要展示从 capex 到行业环节的结构。',
    ['NVDA', 'AVGO'],
  ),
  content(
    '1991134950473761055',
    'capex-war',
    '存储与 HBM 进入瓶颈链',
    '把存储、HBM 和半导体供给纪律纳入 AI capex 传导。',
    '它连接 AI 大趋势和美光等公司推荐，是产业链拆解的重要节点。',
    ['MU', 'NVDA'],
  ),
  content(
    '1991290721526247791',
    'capex-war',
    '光互联与网络链',
    '归入光、网络和互联方向，解释 AI 数据中心扩张后新的带宽瓶颈。',
    '当 GPU 之外的互联瓶颈开始定价，用户需要看到对应行业环节。',
    ['AVGO', 'ANET'],
  ),
  content(
    '1992490737573724577',
    'capex-war',
    '算力瓶颈的继续外溢',
    '补齐算力瓶颈从芯片向更多基础设施环节外溢的判断。',
    '它支持“看好的行业”不止一层，而是沿瓶颈顺序展开。',
    ['NVDA', 'AVGO', 'MU'],
  ),
  content(
    '2008402498823090398',
    'capex-war',
    '边缘和端侧 AI 的位置',
    '归档到边缘/端侧 AI：当 AI 从云端训练走向落地执行，端侧计算和低延迟场景变得重要。',
    '这让过往精华内容库覆盖从数据中心到终端设备的完整链路。',
    ['AAPL', 'QCOM', 'NVDA'],
  ),
  content(
    '2043910896351883636',
    'capex-war',
    '电力约束进入 AI 投资框架',
    '把数据中心供电、配电和能源约束放入 AI capex 战争。',
    '当算力扩张遇到电力瓶颈，受益行业会继续向基础设施层下沉。',
    ['VRT', 'ETN'],
  ),
  content(
    '2023597321368547520',
    'capex-war',
    '大科技 capex 成为核心争议',
    '围绕大科技继续加码 AI 资本开支，讨论市场如何定价需求、回报和竞争压力。',
    '这条内容把 AI 投资从“模型故事”推进到“资本开支战争”。',
    ['MSFT', 'GOOGL', 'AMZN', 'META'],
  ),
  content(
    '2043653387271712962',
    'capex-war',
    '800V HVDC 与数据中心供电',
    '归入 800V HVDC 和数据中心电力改造，展示 AI 机房能耗约束的技术路径。',
    '它能让用户理解电力链不是外围题材，而是 capex 继续扩张后的硬约束。',
    ['VRT', 'ETN'],
  ),
  content(
    '2045031360004558969',
    'capex-war',
    'CPU 紧缺与 Agentic AI',
    'Agentic AI 从训练走向任务执行后，CPU、编排和推理服务可能成为新增瓶颈。',
    '它把 AI 产业链从 GPU 扩展到 CPU 产业链，也是公司推荐中 CPU 受益标的的证据。',
    ['AMD', 'INTC', 'AVGO'],
  ),
  content(
    '2057739575372706022',
    'capex-war',
    '电力链与 AI 数据中心扩容',
    '继续跟踪 AI 数据中心扩容后的供电、配电和电力设备需求。',
    '这让资本开支战争板块保留从算力到电力的完整传导链。',
    ['VRT', 'ETN'],
  ),

  content(
    '1798953514837610894',
    'company-theses',
    'PLTR 作为企业 AI 落地代表',
    '早期把 PLTR 放进 AI 应用和企业操作系统位置，而不是普通 SaaS 估值故事。',
    '个股页需要展示它对应的是 AI 落地层，而不是孤立涨幅。',
    ['PLTR'],
    'thread',
    '2024-06-07',
  ),
  content(
    '1799037612503793666',
    'company-theses',
    'PLTR 推荐逻辑的补充',
    '补齐 PLTR 作为企业 AI、政府订单和生产率工具的持续推荐证据。',
    '它让 PLTR 的推荐链条从首次提及扩展到后续验证。',
    ['PLTR'],
    'tweet',
    '2024-06-07',
  ),
  content(
    '1887674164867440965',
    'company-theses',
    'PLTR 后续验证',
    '把 PLTR 后续表现和 AI 应用落地继续放回 qinbafrank 的公司推荐框架。',
    '它适合和价格验证、后续财报和市场定价放在一起看。',
    ['PLTR'],
  ),
  content(
    '1798703027077206032',
    'company-theses',
    'HOOD 的交易入口价值',
    '早期推荐 Robinhood，并把它从零售交易工具看成金融入口。',
    '它是“交易入口 + 加密 + 财富管理”公司推荐逻辑的起点。',
    ['HOOD'],
    'thread',
    '2024-06-06',
  ),
  content(
    '1926526254494150796',
    'company-theses',
    'HOOD 逻辑的阶段性延伸',
    '补充 HOOD 在美股、加密和产品扩展中的入口价值。',
    '它说明 HOOD 不是只靠单一交易周期，而是有金融平台化逻辑。',
    ['HOOD'],
  ),
  content(
    '1918556140264153535',
    'company-theses',
    'HOOD 后续跟踪',
    '归入 Robinhood 后续跟踪证据，用来展示推荐不是一次性观点。',
    '用户可以用它回看 qinbafrank 是否持续更新公司逻辑。',
    ['HOOD'],
  ),
  content(
    '2044758715967156502',
    'company-theses',
    'HOOD 与金融入口升级',
    '继续围绕 Robinhood 的交易入口、加密业务和金融产品升级做跟踪。',
    '这条内容适合和加密/RWA 板块互相链接。',
    ['HOOD'],
  ),
  content(
    '2060388312033182068',
    'company-theses',
    'HOOD 最新推荐链条',
    '补齐 HOOD 后续原文证据，作为公司推荐页的最新跟踪节点。',
    '它让 HOOD 案例呈现完整的“早期推荐到持续跟踪”链条。',
    ['HOOD'],
  ),
  content(
    '2015377625167089671',
    'company-theses',
    '美光与 AI 存储链确定性',
    '把美光放在 AI 存储、HBM 和供给纪律的产业位置上。',
    '它连接资本开支战争里的 HBM 节点和公司推荐页的 MU 案例。',
    ['MU'],
  ),
  content(
    '2043991474753417546',
    'company-theses',
    '美光后续跟踪',
    '归入美光后续推荐证据，继续观察 AI 存储链需求和供给变化。',
    '它让 MU 不是单条推荐，而是 AI capex 传导后的持续验证。',
    ['MU'],
  ),
  content(
    '2027238317323137395',
    'company-theses',
    '美光 / EWY / 7709 产业链联动',
    '把美光、韩国链和 7709 放进同一条半导体存储链观察。',
    '它帮助用户从公司扩展到区域 ETF 与亚洲半导体链。',
    ['MU', 'EWY', '7709'],
  ),
  content(
    '2029074784429195357',
    'company-theses',
    'EWY 与韩国半导体链',
    '归入 EWY 和韩国半导体 beta，用来观察存储链与区域资产联动。',
    '它让公司推荐页能覆盖 ETF 和区域表达，而不是只有美股单票。',
    ['EWY', '7709'],
  ),
  content(
    '2034096333314003072',
    'company-theses',
    '7709 与亚洲半导体链',
    '补齐 7709、EWY 和美光相关的亚洲半导体链证据。',
    '这条内容适合放在“美光/EWY/7709”组合里统一展示。',
    ['7709', 'EWY', 'MU'],
  ),
  content(
    '2045031360004558969',
    'company-theses',
    'CPU 紧缺受益标的',
    '同一条 CPU 紧缺内容在公司推荐板块中用于承载 CPU 产业链受益标的。',
    '它把产业瓶颈和具体可跟踪公司连接起来。',
    ['AMD', 'INTC', 'AVGO'],
  ),
  content(
    '2051838078420242854',
    'company-theses',
    'BB 从硬件叙事转向 QNX 软件业务',
    '重新理解黑莓：重点不在手机硬件，而在 QNX、车端系统和机器人软件架构。',
    '这是公司推荐页中“软件定义硬件”的代表案例。',
    ['BB'],
  ),
  content(
    '2059802180379656378',
    'company-theses',
    'BB 后续跟踪',
    '补充 BB 在 QNX、端侧系统和机器人软件方向上的后续原文证据。',
    '它让 BB 推荐链条能被持续追踪和验证。',
    ['BB'],
  ),
  pendingContent(
    'ibm-pending',
    'company-theses',
    'IBM 原文证据待补',
    'qinbafrank 反馈中已点名 IBM，但这次未提供对应推文链接。',
    '先把 IBM 作为待补证据项保留，避免后续整理时遗漏这个主动提到的公司。',
    ['IBM'],
  ),

  content(
    '1895270832156614924',
    'market-rules',
    '美股调整先分级',
    '先给美股调整分级，再讨论是普通回撤、阶段调整还是更大级别风险。',
    '这是后续判断杀估值、杀业绩、杀逻辑的底层尺子。',
    ['QQQ', 'SPY'],
    'thread',
  ),
  content(
    '1817509953545838620',
    'market-rules',
    '历史回撤规律',
    '补充美股调整规律中的历史回撤观察和风险分类。',
    '它让用户不是一跌就按系统性崩盘理解，而是先判断调整性质。',
    ['QQQ', 'SPY'],
  ),
  content(
    '2020093693819289895',
    'market-rules',
    '调整性质的再判断',
    '归入美股调整规律，用来分析下跌是估值、业绩还是逻辑问题。',
    '这条内容适合和三杀框架放在一起看。',
    ['QQQ', 'SPY'],
  ),
  content(
    '1986487386763886825',
    'market-rules',
    '杀估值而非整体崩盘',
    '把一段美股调整放入估值重置框架，而不是直接理解为牛市终结。',
    '它展示 qinbafrank 如何区分情绪回撤和产业逻辑破裂。',
    ['QQQ', 'SPY'],
  ),
  content(
    '1986633517087007159',
    'market-rules',
    '杀估值、杀业绩、杀逻辑',
    '完整拆解市场下跌的三种性质，以及每一种对后续行情的含义。',
    '这是美股调整规律板块的核心内容。',
    ['QQQ', 'SPY'],
    'thread',
  ),
  content(
    '1984556367093395469',
    'market-rules',
    '三杀框架的前置判断',
    '补齐三杀框架形成前后的行情判断和风险识别。',
    '它让用户能看到 qinbafrank 如何从市场状态推导调整性质。',
    ['QQQ', 'SPY'],
  ),

  content(
    '1899973508693975221',
    'market-timing',
    '2025 年初行情判断起点',
    '从 2025 年初开始归档美股行情判断，用来建立后续复盘时间线。',
    '这条内容是行情判断板块的时间起点。',
    ['QQQ', 'SPY'],
  ),
  content(
    '1920992310780981284',
    'market-timing',
    '春季行情节奏判断',
    '归入 2025 年行情节奏复盘，观察当时对调整、反弹和风险性质的判断。',
    '它帮助用户把观点放回当时市场环境，而不是事后看结论。',
    ['QQQ', 'SPY'],
  ),
  content(
    '1999693092446962158',
    'market-timing',
    '复盘 11 月以来的美股节奏',
    '回看此前对市场调整级别、反转条件和风险性质的判断。',
    '它适合和指数走势放在一起做历史验证。',
    ['QQQ', 'SPY'],
  ),
  content(
    '1994216596479594609',
    'market-timing',
    '行情中段的风险定位',
    '补齐美股行情判断中对风险等级、节奏和仓位感受的讨论。',
    '这条内容能让时间线更完整，而不是只保留命中的节点。',
    ['QQQ', 'SPY'],
  ),
  content(
    '2018978431732760904',
    'market-timing',
    '行情判断的后续校准',
    '归入 2025 年后的行情判断校准，观察条件变化后框架如何调整。',
    '它体现历史内容库应该保存“判断过程”，不只保存结论。',
    ['QQQ', 'SPY'],
  ),
  content(
    '2041776052167483750',
    'market-timing',
    '地缘事件后的市场恐慌判断',
    '把地缘事件、谈判节奏和市场恐慌结合起来判断行情阶段。',
    '这条内容与宏观地缘板块互相链接，说明行情判断会吸收外部冲击。',
    ['QQQ', 'SPY'],
  ),
  content(
    '1781141289381273831',
    'market-timing',
    '早期行情判断补充',
    '作为行情判断时间线中的早期补充内容。',
    '它能帮助用户回看 qinbafrank 对美股节奏的更长周期判断。',
    ['QQQ', 'SPY'],
  ),
  content(
    '2044677096526741639',
    'market-timing',
    '关键节点后的行情复盘',
    '归档为 2025 年后行情判断的重要复盘节点。',
    '它让行情判断板块能展示从判断到验证的链条。',
    ['QQQ', 'SPY'],
  ),
  content(
    '2044580442704396782',
    'market-timing',
    '行情节奏与风险再评估',
    '补齐行情时间线中相邻节点的风险再评估。',
    '这条内容用于帮助用户理解观点如何随着市场变化更新。',
    ['QQQ', 'SPY'],
  ),

  content(
    '1814123900399165638',
    'macro-geopolitics',
    '宏观流动性框架',
    '归入宏观流动性：关注流动性环境如何传导到估值、风险偏好和高 beta 资产。',
    '它是宏观与地缘板块中“流动性不是背景板”的起点。',
    ['SPY', 'QQQ'],
  ),
  content(
    '1947143450492608947',
    'macro-geopolitics',
    '财政扩张 2.0',
    '用财政扩张 2.0 解释市场节奏、政策约束和风险资产路径。',
    '这是区别于单纯 Fed 叙事的关键宏观节点。',
    ['SPY', 'QQQ'],
    'thread',
  ),
  content(
    '1991005823351611431',
    'macro-geopolitics',
    '有限度宽松与流动性临界',
    '从准备金、TGA、回购压力等变量观察市场流动性状态。',
    '它解释流动性如何从资金面传到估值和风险偏好。',
    ['SPY', 'QQQ'],
  ),
  content(
    '1998238044877647882',
    'macro-geopolitics',
    '流动性压力的后续观察',
    '补齐宏观流动性在后续阶段的压力、缓和和市场影响。',
    '它让宏观板块形成连续追踪，而不是单点判断。',
    ['SPY', 'QQQ'],
  ),
  content(
    '2018129302114689163',
    'macro-geopolitics',
    '财政扩张与政策节奏',
    '继续归档财政扩张、政策落地和市场节奏之间的关系。',
    '它帮助用户理解财政变量如何影响行业和资产配置。',
    ['SPY', 'QQQ'],
  ),
  content(
    '1984964367629025321',
    'macro-geopolitics',
    '中美贸易战与战略相持',
    '把中美贸易和地缘政治放进市场框架，而不是孤立新闻。',
    '宏观与地缘板块需要展示政策、贸易和供应链如何传到风险资产。',
    ['SPY', 'UUP'],
  ),

  content(
    '1816383628235989447',
    'crypto-rwa',
    '加密产业发展的早期认知',
    '归入加密产业发展和认知迭代，用来观察 qinbafrank 如何从早期叙事演进到金融基础设施。',
    '它是加密/RWA 板块的历史起点。',
    ['BTC', 'ETH'],
  ),
  content(
    '1886233764197736751',
    'crypto-rwa',
    '加密认知迭代',
    '补齐加密认知从普涨叙事到分化、虚无论和真实落地方向的变化。',
    '这让用户看到 qinbafrank 对加密不是单纯看多或看空，而是在迭代框架。',
    ['BTC', 'ETH'],
  ),
  content(
    '1997561492909298132',
    'crypto-rwa',
    '暴论、虚无论与成熟市场分化',
    '讨论加密市场从叙事交易走向分化、出清和真实价值落地。',
    '它解释为什么加密不能只当流动性 beta 看。',
    ['BTC', 'ETH'],
  ),
  content(
    '1945825731793322468',
    'crypto-rwa',
    'RWA 与资产代币化',
    '归入 RWA 和资产代币化，用来观察真实资产上链如何改变交易和发行结构。',
    '它是加密基建与传统金融结合的关键证据。',
    ['COIN', 'HOOD'],
  ),
  content(
    '2026602891998539876',
    'crypto-rwa',
    '美股代币化与交易入口',
    '把美股代币化、RWA 和交易入口重构放在同一个金融基础设施框架里。',
    '它连接 HOOD、COIN、RWA 和加密与 AI 结合，是加密板块的核心节点。',
    ['HOOD', 'COIN', 'CRCL'],
    'thread',
  ),
];

export const FRANK_FEATURED_GROUPS: FrankFeaturedGroup[] = [
  group(
    'long-term-adoption',
    'ai-trend',
    '长期主线、渗透率和智力成本',
    '把 AI 从一次性行情放回长期产业革命：社会智力成本下降、企业渗透率抬升，是最早那组 AI 大趋势观点的主线。',
    '用户进入这个板块时，先看到 qinbafrank 判断 AI 长周期是否仍成立，而不是直接跳到某只股票。',
    ['1761228703751971159', '1919010067225120824', '1966309713211175233', '2048051142975008855'],
    ['NVDA', 'MSFT', 'GOOGL', 'PLTR'],
  ),
  group(
    'industry-evolution',
    'ai-trend',
    '产业进化、入口变化和竞争格局',
    '整理 AI 从云端、模型、应用到入口形态的演化，并观察赢家集中、竞争格局和资本回报争议。',
    '这组内容帮助用户理解 AI 不是一个静态主题，而是会沿着产业阶段持续换主角。',
    ['1950809665794986321', '1976176693984592273', '1988826907534860695', '2011679701769863353'],
    ['NVDA', 'AVGO', 'MSFT', 'QQQ'],
  ),

  group(
    'capex-framework',
    'capex-war',
    '资本开支战争总框架',
    '从 OpenAI 和大科技资本开支出发，讨论 AI 应用扩散、算力需求、回报率质疑和市场对 AI 投入的再定价。',
    '它是整张产业链地图的入口：先判断钱为什么继续花，再判断瓶颈会传到哪里。',
    ['1973043276568781033', '1975423593787047963', '1992490737573724577', '2023597321368547520'],
    ['NVDA', 'MSFT', 'GOOGL', 'AMZN', 'META'],
  ),
  group(
    'memory-hbm',
    'capex-war',
    '存储 / HBM 瓶颈',
    '把存储、HBM 和供给纪律放入 AI capex 传导链，解释为什么算力扩张会继续外溢到内存层。',
    '这组内容直接连接美光和亚洲存储链，是从产业地图走向公司推荐的关键桥。',
    ['1991134950473761055'],
    ['MU', 'NVDA'],
  ),
  group(
    'optical-network',
    'capex-war',
    '光互联 / 网络链',
    '归档光、网络和互联方向，观察 AI 数据中心扩容后从 GPU 继续传导出的带宽瓶颈。',
    '当市场不再只给 GPU 定价，网络和互联会成为用户理解 AI 基建二阶机会的入口。',
    ['1991290721526247791'],
    ['AVGO', 'ANET'],
  ),
  group(
    'cpu-agentic',
    'capex-war',
    'CPU 紧缺 / Agentic AI',
    'Agentic AI 从训练走向任务执行后，CPU、编排和推理服务可能成为新的卡点。',
    '它让用户看到 AI capex 不是只有 GPU，CPU 产业链也可能进入瓶颈定价。',
    ['2045031360004558969'],
    ['AMD', 'INTC', 'AVGO'],
  ),
  group(
    'power-hvdc',
    'capex-war',
    '电力 / 800V HVDC',
    '整理数据中心电力、配电、800V HVDC 和基础设施供给约束。',
    '这组内容把 AI capex 从芯片层继续推到电力设备和数据中心改造，是产业地图中最容易被漏掉的一层。',
    ['2043910896351883636', '2043653387271712962', '2057739575372706022'],
    ['VRT', 'ETN'],
  ),
  group(
    'edge-physical-ai',
    'capex-war',
    '边缘 / 端侧 AI',
    '当 AI 从云端训练走向汽车、工厂、机器人和端侧执行，低延迟和本地计算开始成为新增方向。',
    '它补齐从数据中心到终端设备的产业传导，避免页面只停留在云端 capex。',
    ['2008402498823090398'],
    ['AAPL', 'QCOM', 'NVDA'],
  ),

  group(
    'pltr',
    'company-theses',
    'PLTR',
    '把 PLTR 作为企业 AI 和政府 AI 操作层来整理，集中展示早期推荐、补充观点和后续验证。',
    '同一个公司放在一个卡片里，用户才能看清 qinbafrank 的推荐链条是否从起点延续到验证。',
    ['1798953514837610894', '1799037612503793666', '1887674164867440965'],
    ['PLTR'],
  ),
  group(
    'hood',
    'company-theses',
    'HOOD / Robinhood',
    '把 HOOD 的交易入口、加密入口、财富管理、预测市场和 Agentic Trading 观点放在同一条时间线上。',
    '这能把 HOOD 从单次事件交易还原为金融入口升级的长期案例。',
    [
      '1798703027077206032',
      '1918556140264153535',
      '1926526254494150796',
      '2044758715967156502',
      '2060388312033182068',
    ],
    ['HOOD'],
  ),
  group(
    'micron',
    'company-theses',
    '美光 / AI 存储链',
    '把美光放在 HBM、存储供需和 AI capex 传导里，而不是孤立看单季度财报。',
    '它是资本开支战争落到公司层面的代表案例。',
    ['2015377625167089671', '2043991474753417546'],
    ['MU'],
  ),
  group(
    'ewy-7709',
    'company-theses',
    '7709 / EWY / 亚洲半导体链',
    '把 7709、EWY、韩国资产和亚洲半导体链放在同一个区域表达里。',
    '用户可以从这里看到 qinbafrank 如何把美股主线扩展到区域 ETF 和亚洲供应链。',
    ['2027238317323137395', '2029074784429195357', '2034096333314003072'],
    ['7709', 'EWY', 'MU'],
  ),
  group(
    'cpu-avgo',
    'company-theses',
    'CPU 产业链 / 博通',
    '把 CPU 紧缺内容放到公司推荐语境里，承载 CPU 产业链和博通等受益标的。',
    '这张卡把产业瓶颈和可跟踪公司连接起来，是产业地图到投资落点的桥。',
    ['2045031360004558969'],
    ['AVGO', 'AMD', 'INTC'],
  ),
  group(
    'bb',
    'company-theses',
    'BB / BlackBerry',
    '把 BB 从手机硬件叙事中拿出来，归到 QNX、车端系统和机器人软件架构。',
    '这组内容体现 qinbafrank 对“软件定义硬件”机会的再理解。',
    ['2051838078420242854', '2059802180379656378'],
    ['BB'],
  ),
  group(
    'ibm',
    'company-theses',
    'IBM',
    'qinbafrank 反馈中已点名 IBM，但这次没有给出对应原文链接。',
    '先保留 IBM 卡片，避免这个公司在后续补证据时丢失。',
    ['ibm-pending'],
    ['IBM'],
  ),

  group(
    'drawdown-sizing',
    'market-rules',
    '调整分级与历史回撤',
    '先把美股下跌按历史幅度和调整性质分级，再判断是否进入更大级别风险。',
    '这能避免用户一跌就把所有回撤都理解成系统性崩盘。',
    ['1817509953545838620', '1895270832156614924'],
    ['QQQ', 'SPY'],
  ),
  group(
    'valuation-earnings-logic',
    'market-rules',
    '杀估值、杀业绩、杀逻辑',
    '集中整理三杀框架：估值重置、业绩压力和核心逻辑破坏分别意味着不同后续路径。',
    '这是用户复盘美股调整最应该优先掌握的判断尺子。',
    ['1984556367093395469', '1986487386763886825', '1986633517087007159', '2020093693819289895'],
    ['QQQ', 'SPY'],
  ),

  group(
    'early-2025-cycle',
    'market-timing',
    '2025 年初到春季调整',
    '从 2025 年初的调整判断开始，整理政策冲击、主要矛盾和早期行情定位。',
    '这组内容让用户回到当时环境，而不是只看事后涨跌。',
    ['1781141289381273831', '1899973508693975221', '1920992310780981284'],
    ['QQQ', 'SPY'],
  ),
  group(
    'late-2025-recap',
    'market-timing',
    '11 月以来的行情节奏复盘',
    '把 2025 年 11 月后的风险定位、节奏判断和后续校准串起来。',
    '它帮助用户看清 qinbafrank 如何在行情中段持续修正框架。',
    ['1994216596479594609', '1999693092446962158', '2018978431732760904'],
    ['QQQ', 'SPY'],
  ),
  group(
    'geopolitical-scare',
    'market-timing',
    '春劫、地缘冲击与反转条件',
    '整理地缘事件、谈判节奏、恐慌衰减和反转后的观察条件。',
    '这组内容说明行情判断会吸收外部冲击，但仍然要回到传导路径和条件变化。',
    ['2041776052167483750', '2044580442704396782', '2044677096526741639'],
    ['QQQ', 'SPY'],
  ),

  group(
    'macro-liquidity',
    'macro-geopolitics',
    '宏观流动性 / 有限度宽松',
    '把准备金、TGA、回购压力和有限度宽松放在同一个流动性框架里。',
    '这是宏观变量传导到估值、风险偏好和高 beta 资产的核心入口。',
    ['1814123900399165638', '1991005823351611431', '1998238044877647882'],
    ['SPY', 'QQQ'],
  ),
  group(
    'fiscal-expansion',
    'macro-geopolitics',
    '财政扩张 2.0 / 政策节奏',
    '整理财政扩张 2.0、财政主导和政策落地节奏对风险资产的影响。',
    '它让宏观板块不只围绕 Fed，而是把财政、发债和产业政策纳入市场框架。',
    ['1947143450492608947', '2018129302114689163'],
    ['SPY', 'QQQ'],
  ),
  group(
    'trade-war',
    'macro-geopolitics',
    '中美贸易战 / 战略相持',
    '把中美贸易战和战略相持放进供应链、关税和风险溢价传导框架。',
    '这能把地缘新闻转成可观察的市场变量，而不是情绪化判断。',
    ['1984964367629025321'],
    ['SPY', 'UUP'],
  ),

  group(
    'crypto-recognition',
    'crypto-rwa',
    '加密认知迭代、暴论和虚无论',
    '整理 qinbafrank 对加密产业从早期基础设施、山寨分化到成熟市场虚无化的认知变化。',
    '用户可以看到他不是单纯看多/看空，而是在随着市场结构迭代判断框架。',
    ['1816383628235989447', '1886233764197736751', '1997561492909298132'],
    ['BTC', 'ETH'],
  ),
  group(
    'rwa-tokenization',
    'crypto-rwa',
    'RWA / 美股代币化 / 交易入口',
    '把稳定币法案、RWA、美股代币化和交易入口重构放在同一个金融基础设施框架里。',
    '这组内容连接 HOOD、COIN、RWA 和 AI 交易自动化，是加密板块最具体的用户价值。',
    ['1945825731793322468', '2026602891998539876'],
    ['HOOD', 'COIN', 'CRCL'],
  ),
];

const sectionMeta: Omit<FrankSectionSummary, 'featuredCount'>[] = [
  {
    id: 'highlights',
    label: '他的精华',
    shortLabel: '他的精华',
    href: '/kol/qinbafrank/highlights',
    purpose:
      '把 qinbafrank 最常用的 AI、Capex、美股调整、宏观/加密判断拆成 7 条主线，先拿到判断路径，再点进原文看证据。',
    mapHint: '7 条主线 / 判断路径 / 原文证据',
  },
  {
    id: 'stocks',
    label: '个股验证',
    shortLabel: '个股验证',
    href: '/kol/qinbafrank/stocks',
    purpose:
      '把 qinbafrank 点过的 PLTR、HOOD、MU、AVGO 等公司按 ticker 归档，直接看首次提及、核心逻辑、后续观点和当前价格。',
    mapHint: '首次提及 / 核心逻辑 / 价格验证',
  },
  {
    id: 'library',
    label: '原文证据库',
    shortLabel: '原文库',
    href: '/kol/qinbafrank/latest',
    purpose:
      '想核对原话时，直接按主题、ticker 或时间筛全量推文，不用从 X 时间线里重翻。',
    mapHint: '全量原文 / 主题筛选 / Ticker 检索',
  },
  {
    id: 'chat',
    label: '框架追问',
    shortLabel: '追问',
    href: '/research?agent=kol&persona=qinbafrank',
    purpose:
      '带着 qinbafrank 的历史原文和方法论追问：一只票是否还符合他的逻辑、AI 瓶颈怎么传导、下跌属于哪一类。',
    mapHint: '历史原文 / 方法论 / 个股推演',
  },
];

export const FRANK_SECTIONS: FrankSectionSummary[] = sectionMeta.map((section) => ({
  ...section,
  featuredCount:
    section.id === 'stocks'
      ? FRANK_FEATURED_CONTENT.filter((item) => item.topicId === 'company-theses').length
      : section.id === 'chat'
        ? 0
        : FRANK_FEATURED_CONTENT.length,
}));

export const FRANK_COMPANY_RECOMMENDATIONS: FrankCompanyRecommendation[] = [
  {
    ticker: 'PLTR',
    name: 'Palantir',
    industryPosition: 'AI 应用 / 企业 AI 操作系统',
    thesis: '不是普通 SaaS，而是企业和政府把 AI 接进业务流程的操作层。',
    firstMention: '2024-06-07',
    followThrough: '后续继续跟踪 AIP、政府订单和 AI 生产率兑现。',
    evidenceIds: ['1798953514837610894', '1799037612503793666', '1887674164867440965'],
  },
  {
    ticker: 'HOOD',
    name: 'Robinhood',
    industryPosition: '交易入口 / 加密金融化 / 财富管理',
    thesis: '价值不只来自零售交易，而是美股、加密、预测市场和财富管理的统一入口。',
    firstMention: '2024-06-06',
    followThrough: '从 HOOD vs COIN 到预测市场、财富管理和 Agentic Trading 持续升级。',
    evidenceIds: [
      '1798703027077206032',
      '1926526254494150796',
      '1918556140264153535',
      '2044758715967156502',
      '2060388312033182068',
    ],
  },
  {
    ticker: 'MU',
    name: 'Micron',
    industryPosition: 'HBM / 存储瓶颈',
    thesis: 'AI 存储链代表，逻辑来自需求强、扩产克制和业绩确定性。',
    firstMention: '2026-01-25',
    followThrough: '与 HBM、韩国链、AI capex 传导一起验证。',
    evidenceIds: ['2015377625167089671', '2043991474753417546', '2027238317323137395'],
  },
  {
    ticker: '7709',
    name: '7709',
    industryPosition: '亚洲半导体链 / 存储链表达',
    thesis: '与美光、EWY、HBM 和韩国链一起观察半导体存储周期。',
    firstMention: '2026-02-27',
    followThrough: '需要和区域资产、存储报价、出口数据和 AI capex 一起验证。',
    evidenceIds: ['2027238317323137395', '2029074784429195357', '2034096333314003072'],
  },
  {
    ticker: 'EWY',
    name: 'iShares MSCI South Korea ETF',
    industryPosition: '韩国存储链 / 亚洲半导体 beta',
    thesis: '韩国市场是存储和半导体情绪的区域表达，也叠加地缘和汇率。',
    firstMention: '2026-02-27',
    followThrough: '与美光、7709、HBM 和韩国出口一起观察。',
    evidenceIds: ['2027238317323137395', '2029074784429195357', '2034096333314003072'],
  },
  {
    ticker: 'AVGO',
    name: 'Broadcom',
    industryPosition: 'ASIC / 网络 / 光互联 / CPU 产业链',
    thesis: 'AI 基建从 GPU 扩散到 ASIC、网络、互联和 CPU 相关瓶颈后的受益层。',
    firstMention: '2025-09-30',
    followThrough: '跟随云厂商自研芯片、网络芯片、光互联和 CPU 瓶颈继续验证。',
    evidenceIds: ['1973043276568781033', '1991134950473761055', '2045031360004558969'],
  },
  {
    ticker: 'BB',
    name: 'BlackBerry',
    industryPosition: 'QNX / 机器人软件 / 端侧软件',
    thesis: '不按手机硬件理解，而按车端系统、QNX 和机器人软件架构理解。',
    firstMention: '2026-05-06',
    followThrough: '机器人瓶颈从硬件转向软件架构与集成时，BB 的位置被重新理解。',
    evidenceIds: ['2051838078420242854', '2059802180379656378'],
  },
  {
    ticker: 'IBM',
    name: 'IBM',
    industryPosition: '企业 AI / 传统 IT 服务重估',
    thesis: '反馈中已点名 IBM，适合放在企业 AI 和传统 IT 服务重估层。',
    firstMention: '待补原文',
    followThrough: '需要从数据库或后续补充中补齐原文证据。',
    evidenceIds: [],
  },
];

export const FRANK_MACRO_BLOCKS: FrankMacroBlock[] = [
  {
    id: 'liquidity',
    label: '宏观流动性',
    thesis: '看准备金、TGA、有限度宽松和回购压力，而不是只听 Fed 表态。',
    transmission: '流动性松紧先影响利率和美元，再影响估值、风险偏好和高 beta 资产。',
    watch: ['银行准备金', 'TGA 抽放水', '有限度宽松', '回购压力'],
    evidenceIds: ['1814123900399165638', '1991005823351611431', '1998238044877647882'],
  },
  {
    id: 'fiscal',
    label: '财政扩张 2.0',
    thesis: '市场不只由货币政策定价，财政扩张和政策节奏会改变风险资产路径。',
    transmission: '财政主导会影响美债供给、产业补贴、名义增长和市场风险偏好。',
    watch: ['财政赤字', '发债节奏', '产业政策', '政策落地时间'],
    evidenceIds: ['1947143450492608947', '2018129302114689163'],
  },
  {
    id: 'trade-geopolitics',
    label: '贸易战与地缘',
    thesis: '中美、中日、伊朗、委内瑞拉等事件要看传导路径，而不是按新闻情绪交易。',
    transmission: '地缘风险通过关税、能源、美元、供应链和风险溢价影响市场。',
    watch: ['关税政策', '谈判节点', '能源价格', '区域资产表现'],
    evidenceIds: ['1984964367629025321', '2041776052167483750', '2044677096526741639'],
  },
];

export function getFeaturedByTopic(topicId: FrankHighlightTopicId) {
  return FRANK_FEATURED_CONTENT.filter((item) => item.topicId === topicId);
}

export function getFeaturedByIds(ids: string[]) {
  return ids
    .map((id) =>
      FRANK_FEATURED_CONTENT.find((item) => item.id === id) ??
      FRANK_FEATURED_CONTENT.find((item) => item.sourceId === id),
    )
    .filter((item): item is FrankFeaturedContent => Boolean(item));
}

export function getGroupsByTopic(topicId: FrankHighlightTopicId) {
  return FRANK_FEATURED_GROUPS.filter((item) => item.topicId === topicId);
}

export function getFeaturedItemsForGroup(group: FrankFeaturedGroup) {
  return sortFeaturedByDateAsc(getFeaturedByIds(group.itemIds));
}

export function sortFeaturedByDateAsc(items: FrankFeaturedContent[]) {
  return [...items].sort((a, b) => {
    const diff = dateRank(a.date) - dateRank(b.date);
    if (diff !== 0) return diff;
    return a.title.localeCompare(b.title, 'zh-Hans-CN');
  });
}

function dateRank(date: string) {
  const parsed = Date.parse(date);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

export function getTopicSummary(topicId: FrankHighlightTopicId | string | null | undefined) {
  if (!topicId) return null;
  return FRANK_HIGHLIGHT_TOPICS.find((item) => item.id === topicId) ?? null;
}

export function getCompanyRecommendation(ticker: string | null | undefined) {
  if (!ticker) return null;
  return FRANK_COMPANY_RECOMMENDATIONS.find((item) => item.ticker === ticker.toUpperCase()) ?? null;
}
