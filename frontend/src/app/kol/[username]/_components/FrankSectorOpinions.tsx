'use client';

import Link from 'next/link';
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowUpRight,
  Bot,
  BriefcaseBusiness,
  ChevronDown,
  Cloud,
  Coins,
  Cpu,
  Database,
  Globe2,
  Layers,
  LineChart,
  Network,
  Server,
  Zap,
  type LucideIcon,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  FRANK_FEATURED_GROUPS,
  getFeaturedByIds,
  getFeaturedItemsForGroup,
  sortFeaturedByDateAsc,
  type FrankFeaturedContent,
  type FrankFeaturedGroup,
  type FrankHighlightTopicId,
} from './frankContentData';
import { tweetHref } from './researchMapData';

type FrankSectorOpinionId =
  | 'ai-industry'
  | 'crypto-rwa'
  | 'market-cycle'
  | 'macro-geopolitics'
  | 'company-theses';

type TimelineType = '起点' | '补充' | '争议' | '验证' | '风险' | '修正';
type BoardTone = 'primary' | 'amber' | 'sky' | 'rose' | 'zinc';
type InsightKind = 'how' | 'data' | 'opportunity' | 'risk';
type AISubsectorId =
  | 'cloud-commercialization'
  | 'memory'
  | 'optical'
  | 'cpu-asic'
  | 'power-cooling'
  | 'packaging'
  | 'software-agent'
  | 'edge-physical';

interface TimelineRef {
  sourceId: string;
  type: TimelineType;
  note?: string;
}

interface FrankSectorOpinionBoard {
  id: FrankSectorOpinionId;
  label: string;
  shortLabel: string;
  eyebrow: string;
  summary: string;
  plainRead: string;
  topicIds: FrankHighlightTopicId[];
  tickers: string[];
  howHeReads: string[];
  dataToWatch: string[];
  opportunities: string[];
  risks: string[];
  experience: string;
  timeline: TimelineRef[];
  icon: LucideIcon;
  tone: BoardTone;
}

interface AISubsectorTimelineItem {
  date: string;
  phase: TimelineType;
  title: string;
  body: string;
  sourceId?: string;
}

interface AISubsector {
  id: AISubsectorId;
  label: string;
  shortLabel: string;
  tone: BoardTone;
  oneLine: string;
  howHeReads: string[];
  dataToWatch: string[];
  opportunities: string[];
  risks: string[];
  experience: string;
  tickers: string[];
  icon: LucideIcon;
  timeline: AISubsectorTimelineItem[];
}

interface InsightPanel {
  id: InsightKind;
  eyebrow: string;
  title: string;
  items: string[];
  markerClass?: string;
}

interface Props {
  username: string;
  initialSectorId?: string | null;
  initialTopicId?: string | null;
}

const BOARDS: FrankSectorOpinionBoard[] = [
  {
    id: 'ai-industry',
    label: 'AI 产业',
    shortLabel: 'AI',
    eyebrow: 'AI INDUSTRY',
    summary:
      'qinbafrank 看 AI，不是买所有 AI 概念股，而是看 AI 使用量、大厂 capex 和产业瓶颈如何一步步迁移。',
    plainRead:
      '先看 AI 是否还在被更多人和企业使用，再看钱投向哪里，最后看哪个环节开始短缺。',
    topicIds: ['ai-trend', 'capex-war'],
    tickers: ['NVDA', 'MU', 'AVGO', 'PLTR', 'AMD', 'VRT'],
    howHeReads: [
      '先判断 AI 是否还在提高个人和企业的工作效率；如果使用量继续上升，需求就不是一次性主题。',
      '再看商业化闭环：AI 收入、云业务增长和模型公司 ARR 能否解释大厂持续 capex。',
      '最后看瓶颈迁移：从 GPU 到 HBM、光通信、电力、CPU、封装和边缘计算，谁开始缺，谁才可能被重估。',
    ],
    dataToWatch: [
      'Mag7 capex、云业务增速、RPO / backlog 和自由现金流压力',
      'token 消耗、模型厂商 ARR、企业 AI 采购和付费渗透率',
      'GPU / HBM / DRAM / NAND 价格、交期、库存和供给纪律',
      '光模块、数据中心电力、液冷、CPU/ASIC、先进封装的订单和客户认证',
    ],
    opportunities: [
      '商业化继续验证后，市场会从“AI 是不是泡沫”转向寻找下一层紧缺资产。',
      'AI capex 会沿着瓶颈外溢，给存储、光、电力、CPU、封装和软件基础设施带来轮动机会。',
      '真正有用的机会不一定是最热门的股票，而是当前还没被充分定价的下一处短缺。',
    ],
    risks: [
      '如果云收入和模型 ARR 不能支撑 capex，整条硬件链都会被重新估值。',
      '如果供给释放太快，HBM、光模块或电力链会从“紧缺”回到“周期品”。',
      '如果 AI 使用量增长放缓，市场会重新质疑所有上游投入的 ROI。',
    ],
    experience:
      '他的原始逻辑不是“AI 很热所以都买”，而是：AI 使用量继续上升 -> 大客户继续 capex -> 订单和 RPO 写进合同 -> GPU/HBM/电力/CPU 这些硬瓶颈继续紧 -> 产业链硬环节更确定。反过来，如果 capex 还在烧但云收入、RPO、毛利率和算力价格撑不住，这条主线就会从杀估值升级成杀业绩甚至杀逻辑。',
    timeline: [
      { sourceId: '1761228703751971159', type: '起点' },
      { sourceId: '1966309713211175233', type: '补充' },
      { sourceId: '1973043276568781033', type: '补充' },
      { sourceId: '1988826907534860695', type: '争议' },
      { sourceId: '2043910896351883636', type: '验证' },
      { sourceId: '2045031360004558969', type: '验证' },
      { sourceId: '2057739575372706022', type: '验证' },
    ],
    icon: Cpu,
    tone: 'primary',
  },
  {
    id: 'crypto-rwa',
    label: '加密 RWA 产业',
    shortLabel: '加密/RWA',
    eyebrow: 'CRYPTO & RWA',
    summary:
      'qinbafrank 看加密，不是追所有币，而是看稳定币、RWA、美股代币化和交易入口是否变成金融基础设施。',
    plainRead:
      '先过滤纯投机，再看哪些链上资产、交易入口和支付工具开始进入真实金融场景。',
    topicIds: ['crypto-rwa'],
    tickers: ['BTC', 'ETH', 'HOOD', 'COIN', 'CRCL'],
    howHeReads: [
      '先过滤纯币价叙事，只看哪些链上资产真的进入支付、结算、交易或资产发行场景。',
      '再看合规入口：稳定币、RWA、美股代币化、券商和交易所是否被传统金融采用。',
      '最后区分 beta 和基础设施：BTC/ETH 是流动性资产，HOOD/COIN/CRCL 这类入口才体现交易和结算收入。',
    ],
    dataToWatch: [
      '稳定币发行量、链上结算量、支付场景和监管规则变化',
      'RWA TVL、代币化国债/股票成交量、资产发行方质量',
      'BTC ETF / ETH ETF 资金流、美元流动性、风险偏好和利率环境',
      'HOOD / COIN / CRCL 的交易量、take rate、订阅收入和合规进展',
    ],
    opportunities: [
      '稳定币和 RWA 如果变成金融底层管道，入口公司会从交易行情受益者变成基础设施收费者。',
      '美股代币化和 24/7 交易可能让券商、交易所和支付公司获得新流量入口。',
      '加密牛市提供 beta，但真正可持续的是合规、资产上链和真实使用场景扩大。',
    ],
    risks: [
      '监管变化可能同时影响稳定币收益、交易所收入和代币化资产发行。',
      '如果链上活动只由投机交易驱动，收入会高度周期化，不能按基础设施估值。',
      'RWA 采用速度如果低于预期，市场会把它重新归类成题材而不是金融管道。',
    ],
    experience:
      'qinbafrank 过往对加密的经验是：不要把所有上涨都解释成技术革命。先分清价格 beta、流动性周期和基础设施 alpha；只有当真实资产、合规入口和用户行为发生改变时，才值得用更长期的框架看。',
    timeline: [
      { sourceId: '1816383628235989447', type: '起点' },
      { sourceId: '1886233764197736751', type: '修正' },
      { sourceId: '1997561492909298132', type: '风险' },
      { sourceId: '1945825731793322468', type: '补充' },
      { sourceId: '2026602891998539876', type: '验证' },
    ],
    icon: Coins,
    tone: 'amber',
  },
  {
    id: 'market-cycle',
    label: '美股调整规律和行情判断',
    shortLabel: '美股规律',
    eyebrow: 'US MARKET CYCLE',
    summary:
      'qinbafrank 看美股下跌，第一步不是猜牛熊，而是先判断这次到底在杀估值、杀业绩，还是杀逻辑。',
    plainRead:
      '先分清下跌性质，再看产业主线和宏观环境有没有真的坏掉。',
    topicIds: ['market-rules', 'market-timing'],
    tickers: ['QQQ', 'SPY'],
    howHeReads: [
      '先给下跌定性：到底是在杀估值、杀业绩，还是杀产业逻辑；这一步决定是回撤、调整还是趋势反转。',
      '再看主线有没有坏：AI、科技盈利、财报指引和宏观流动性是否仍能支撑指数。',
      '最后看市场位置：跌幅、广度、情绪、反弹质量和资金拥挤度，决定该观察、加仓还是降风险。',
    ],
    dataToWatch: [
      'QQQ / SPY 回撤幅度、市场广度、VIX、put/call、CTA/系统资金仓位',
      'Mag7 财报、EPS revisions、收入指引和估值分位',
      '10Y 美债、美元指数、信用利差、流动性指标和就业/通胀数据',
      'AI 主线股票是否只杀估值，还是开始杀订单、利润和长期叙事',
    ],
    opportunities: [
      '如果只是杀估值，而产业逻辑和盈利没有坏，回撤反而会给核心资产更好的风险回报。',
      '市场恐慌但宏观没有进入信用收缩时，容易出现高质量公司的错杀窗口。',
      '把调整分级以后，散户可以避免在普通回撤里过度防守，也避免在逻辑破坏时硬扛。',
    ],
    risks: [
      '如果从估值压力升级到业绩下修，再升级到产业逻辑被否定，就不能按普通调整处理。',
      '高估值、仓位拥挤、流动性收缩和宏观冲击同时出现时，反弹可能只是风险释放中的中继。',
      'AI 主线如果被证伪，会同时影响指数权重、市场情绪和资金偏好。',
    ],
    experience:
      'qinbafrank 的市场经验不是预测每一个点位，而是先判断市场在“杀什么”。这能把散户最容易犯的两个错拆开：把普通回撤误判成崩盘，或者把逻辑破坏误判成抄底机会。',
    timeline: [
      { sourceId: '1895270832156614924', type: '起点' },
      { sourceId: '1986487386763886825', type: '补充' },
      { sourceId: '1986633517087007159', type: '补充' },
      { sourceId: '1899973508693975221', type: '验证' },
      { sourceId: '1920992310780981284', type: '修正' },
      { sourceId: '1999693092446962158', type: '验证' },
      { sourceId: '2041776052167483750', type: '风险' },
      { sourceId: '2044580442704396782', type: '修正' },
    ],
    icon: LineChart,
    tone: 'sky',
  },
  {
    id: 'macro-geopolitics',
    label: '宏观与地缘',
    shortLabel: '宏观',
    eyebrow: 'MACRO & GEOPOLITICS',
    summary:
      'qinbafrank 看宏观，不是看新闻情绪，而是看流动性、财政、贸易和地缘事件有没有真正传到风险资产。',
    plainRead:
      '先看事件有没有传导路径，再判断它会不会影响利率、美元、风险偏好和企业利润。',
    topicIds: ['macro-geopolitics'],
    tickers: ['SPY', 'QQQ', 'UUP'],
    howHeReads: [
      '先把新闻翻译成传导路径：它会影响流动性、利率、美元、能源、供应链、企业利润，还是只影响情绪。',
      '再判断时间尺度：有些事件只改变一两天风险偏好，有些会通过财政、贸易和通胀改变估值环境。',
      '最后看资产落点：同一个宏观事件，对指数、能源、半导体、军工、加密和美元资产的影响并不一样。',
    ],
    dataToWatch: [
      '准备金、TGA、RRP、SOFR、美元流动性和美债发行节奏',
      '10Y/2Y 美债、实际利率、美元指数、信用利差和金融条件',
      '财政赤字、财政支出、关税税率、贸易谈判节点和供应链政策',
      '油价、天然气、航运、黄金、地缘风险溢价和主要国家汇率',
    ],
    opportunities: [
      '当新闻很吓人但传导路径很弱时，风险资产可能只是情绪回撤。',
      '财政扩张、流动性边际改善或政策宽松，会给成长股和风险资产创造更友好的背景。',
      '真正能改变供需的地缘事件，会让能源、国防、供应链重构和本土制造出现结构性机会。',
    ],
    risks: [
      '关税和能源冲击可能重新抬高通胀，让降息和估值扩张变得更难。',
      '地缘冲突如果传导到航运、能源或金融制裁，会从新闻风险升级为利润和信用风险。',
      '财政扩张如果推高长端利率，可能同时压制估值并放大债务可持续性担忧。',
    ],
    experience:
      'qinbafrank 看宏观的经验是：不要被标题牵着走，要问“它通过哪条管道影响市场”。能落到钱、利率、能源、贸易或信用上的宏观才值得升级；不能传导的新闻，往往只是情绪噪音。',
    timeline: [
      { sourceId: '1814123900399165638', type: '起点' },
      { sourceId: '1947143450492608947', type: '补充' },
      { sourceId: '1991005823351611431', type: '风险' },
      { sourceId: '1998238044877647882', type: '验证' },
      { sourceId: '2018129302114689163', type: '补充' },
      { sourceId: '1984964367629025321', type: '风险' },
    ],
    icon: Globe2,
    tone: 'rose',
  },
  {
    id: 'company-theses',
    label: '过往推荐公司',
    shortLabel: '推荐公司',
    eyebrow: 'COMPANY CASES',
    summary:
      'qinbafrank 看公司，不是孤立看 ticker，而是把公司放回产业主线、商业模式变化和后续验证里。',
    plainRead:
      '先看公司对应哪条产业逻辑，再看这个逻辑有没有被后续业绩、数据或事件继续验证。',
    topicIds: ['company-theses'],
    tickers: ['PLTR', 'HOOD', 'MU', 'AVGO', 'BB', 'EWY'],
    howHeReads: [
      '先把公司放回产业主线：它到底对应 AI 应用、存储、加密入口、ASIC、边缘软件，还是困境反转。',
      '再回到第一次推荐逻辑：当时买点来自估值错杀、产业拐点、业绩验证，还是市场误解。',
      '最后持续复盘：后续财报、价格、客户和事件是否加强原 thesis，还是说明逻辑已经变了。',
    ],
    dataToWatch: [
      '收入增速、毛利率、经营杠杆、自由现金流、RPO / backlog 和业绩指引',
      '从首次提及到后续验证的股价路径、估值倍数和回撤幅度',
      '客户 wins、产品周期、订单、回购、融资、监管和行业数据',
      '个股所处产业链的领先指标：AI 使用量、HBM 价格、交易量、软件 attach rate 等',
    ],
    opportunities: [
      '当产业框架落到被低估公司上，机会可能来自“市场还没把它归入正确赛道”。',
      'PLTR、HOOD、MU、AVGO、BB、NOK 这类案例可以帮助用户学习他如何从主题走到资产。',
      '时间线能展示原 thesis 如何被验证或修正，比单独看一条推荐更接近真实投资过程。',
    ],
    risks: [
      '公司涨太快但证据没跟上时，原来的好 thesis 也可能变成估值风险。',
      '困境反转公司如果客户、收入和现金流没有兑现，故事会比基本面先结束。',
      '单一个股容易受管理层、监管、竞争和仓位拥挤影响，不能只因为属于大主题就无脑持有。',
    ],
    experience:
      'qinbafrank 过往推荐公司的经验，更像一组“框架落地案例”。真正有价值的不是记住他提过哪个 ticker，而是学习他如何把产业判断、公司证据、估值位置和后续修正串成闭环。',
    timeline: [
      { sourceId: '1798953514837610894', type: '起点' },
      { sourceId: '1798703027077206032', type: '起点' },
      { sourceId: '2015377625167089671', type: '补充' },
      { sourceId: '2027238317323137395', type: '验证' },
      { sourceId: '2045031360004558969', type: '补充' },
      { sourceId: '2051838078420242854', type: '补充' },
      { sourceId: '2060388312033182068', type: '验证' },
    ],
    icon: BriefcaseBusiness,
    tone: 'zinc',
  },
];

const AI_SUBSECTORS: AISubsector[] = [
  {
    id: 'cloud-commercialization',
    label: '云厂商 / 商业化验证',
    shortLabel: '云与商业化',
    tone: 'sky',
    oneLine:
      'qinbafrank 看 AI 的第一性原理不是“概念热不热”，而是 AI 使用量能不能转成云收入、ARR 和继续加码的 capex。',
    howHeReads: [
      '先看 AI 渗透率是否跨过早期采用拐点；只要企业和个人使用继续扩大，算力需求就不是单次脉冲。',
      '再看商业化是否兑现：云业务增速、模型厂商 ARR、token 消耗和企业付费，决定 capex 有没有回报。',
      '最后看大厂是否继续加码：MSFT、GOOGL、AMZN、META、ORCL 的 capex 是整条 AI 链条的资金源头。',
    ],
    dataToWatch: [
      '云业务增速、RPO / backlog、AI 相关收入指引',
      'OpenAI / Anthropic 等模型厂商 ARR 与环比增速',
      'Mag7 capex、自由现金流消耗和融资动作',
      'token 消耗、企业采购渗透率、Pro / Max 付费率',
      '财报电话会中对产能不足和 GPU 供给的描述',
    ],
    opportunities: [
      '商业化兑现后，市场会从“AI 是趋势吗”转向“谁能持续收租”。',
      '云厂商收入超预期会反向证明上游 GPU、存储、网络、电力需求仍有支撑。',
      'Oracle、neocloud 和数据中心租赁商可能在供给紧张阶段获得阶段性重估。',
    ],
    risks: [
      '模型厂商 ARR 或云收入低于预期，会直接冲击 capex 战争的底层逻辑。',
      '自由现金流消耗过快、股权融资过密，可能让市场重新质疑 ROI。',
      '如果 token 使用增长放缓，上游硬件链会从“紧缺”回到“过度投资”叙事。',
    ],
    experience:
      'qinbafrank 当时讲的重点是：市场已经经历过“AI 是不是趋势”“算力够不够”两轮争议，现在争议转到“capex 最后能不能赚钱”。所以云厂商这一层要先看模型使用量、云收入、RPO、ARR 和 capex 回报率；这些数据继续验证，上游瓶颈才有理由继续被重估。',
    tickers: ['MSFT', 'GOOGL', 'AMZN', 'META', 'ORCL', 'CRWV'],
    icon: Cloud,
    timeline: [
      {
        date: '2024-02-24',
        phase: '起点',
        title: '把 AI 放入长期渗透率红利框架',
        body: '早期不是按单次财报交易，而是先判断 AI 是否是一轮能持续降低智力成本的产业革命。',
        sourceId: '1761228703751971159',
      },
      {
        date: '2026-02-17',
        phase: '争议',
        title: '大科技 capex 成为市场核心分歧',
        body: '当资金开始质疑“花这么多钱能不能赚回来”，qinbafrank 把焦点放到云收入和模型收入能否验证。',
        sourceId: '2023597321368547520',
      },
      {
        date: '2026-04-25',
        phase: '验证',
        title: 'AI 货币化进入加速验证阶段',
        body: '“加速正在被加速”对应的是技术迭代、资本投入和使用扩散互相强化，市场从质疑转向验证。',
        sourceId: '2048051142975008855',
      },
      {
        date: '2026-06-04',
        phase: '修正',
        title: '采访中明确第三次大辩论：capex 到底能不能赚钱',
        body: '168X 采访把 AI 三次争议归纳为趋势、算力、赚钱。当前阶段的关键是云业务和模型 ARR 是否继续超预期。',
        sourceId: '2062463349573718318',
      },
    ],
  },
  {
    id: 'memory',
    label: '存储 / HBM / DRAM / NAND',
    shortLabel: '存储',
    tone: 'primary',
    oneLine:
      'qinbafrank 看存储不是简单周期反弹，而是 AI 可能把存储从周期品重新定价成长期瓶颈资产。',
    howHeReads: [
      '先看 HBM：新一代 GPU 对 HBM 用量提升，会先吃掉最紧缺、最高价值的供给。',
      '再看外溢：HBM 挤压 DRAM / GDDR 产能，随后传到 NAND、SSD、热存储和冷存储。',
      '最后看市场定价：业绩先改善不够，关键是市场是否愿意给 MU 等公司成长股估值。',
    ],
    dataToWatch: [
      'HBM 价格、长单、客户绑定和份额变化',
      'DRAM / NAND ASP、库存天数和行业 capex 纪律',
      'Blackwell / Rubin 对 HBM 容量和带宽的提升',
      'MU、三星、SK 海力士关于供需和价格的指引',
      'SSD / HDD 需求是否被 agent、多模态和长上下文继续拉动',
    ],
    opportunities: [
      '过去两年产能出清后，供给纪律本身可能让价格弹性更强。',
      '如果 AI 需求持续，存储链会从“周期恢复”进入“结构性紧缺”。',
      'MU 这类公司可能经历从低估周期股到 AI 成长链标的的估值重估。',
    ],
    risks: [
      'HBM 供给释放过快，或者三星等厂商大幅扩产，紧缺逻辑会变弱。',
      'DRAM / NAND ASP 掉头，会证明外溢需求没有市场想象得强。',
      '如果云厂商 capex 放缓，存储会重新暴露周期属性。',
    ],
    experience:
      'qinbafrank 对存储的判断链是：HBM 三家格局相对稳定，厂商经历上一轮惨烈出清后更克制扩产；AI 又把 HBM、DRAM、NAND、SSD 都推向结构性紧平衡。因此他不是只看“存储涨价”，而是看供给纪律、长合约、ASP 和动态 PE/业绩增速是否说明这轮不是普通周期反弹。',
    tickers: ['MU', 'SNDK', 'WDC', 'NVDA', 'TSM'],
    icon: Database,
    timeline: [
      {
        date: '2025-11-19',
        phase: '起点',
        title: '存储与 HBM 被纳入 AI capex 传导链',
        body: 'qinbafrank 开始把存储、HBM 和半导体供给纪律放入 AI 瓶颈地图，不再只看 GPU 一层。',
        sourceId: '1991134950473761055',
      },
      {
        date: '2026-02-27',
        phase: '验证',
        title: '从英伟达财报看 AI 链条最卡点',
        body: 'GPU 放量之后，HBM、封装和存储带宽开始成为判断上游供给的关键证据。',
        sourceId: '2027238317323137395',
      },
      {
        date: '2026-03-18',
        phase: '补充',
        title: '存储链从 HBM 延伸到亚洲半导体链',
        body: '把美光、韩国链、台积电和 AI 硬件周期放在一起看，说明 qinbafrank 更关注产业链位置而非单一 ticker。',
        sourceId: '2034096333314003072',
      },
      {
        date: '2026-06-04',
        phase: '修正',
        title: '采访中总结“紧缺逻辑”：HBM 向 DRAM / NAND / SSD 外溢',
        body: 'qinbafrank 明确说模型参数、上下文、多模态和 agent 会层层挤压存储产能，这是存储页的核心解释。',
        sourceId: '2062463349573718318',
      },
    ],
  },
  {
    id: 'optical',
    label: '光通信 / 光互连 / CPO',
    shortLabel: '光通信',
    tone: 'sky',
    oneLine:
      'qinbafrank 看光通信，是看 AI 数据中心瓶颈从“算得快”迁移到“连得快、连得稳、连得省电”。',
    howHeReads: [
      '先分清确定性：1.6T、LPO / NPO、光源、测试和封装比 CPO 更早兑现收入。',
      '再看终局方向：CPO 是方向，但云厂商大规模部署前必须验证可靠性、良率和可维护性。',
      '最后区分公司位置：元件供应商、光源厂商、系统平台、交换芯片和数据中心互连不是同一类机会。',
    ],
    dataToWatch: [
      '1.6T / 3.2T 光模块出货和客户认证',
      'LPO / NPO 向 CPO 过渡节奏',
      'CPO 交换机良率、故障率、返厂成本和可维护性',
      '云厂商是否开始批量采购 CPO 交换机',
      'LITE / COHR / MRVL / NOK 对数据中心互连的收入指引',
    ],
    opportunities: [
      'AI agent 让计算任务分布式化，数据中心内部连接价值被系统性抬升。',
      'CPO 远期空间大，但短期更可见的机会可能在光源、测试、LPO/NPO 和系统平台。',
      'NOK 这类系统级供应商可以从光传输延伸到数据中心互连和边缘计算。',
    ],
    risks: [
      'CPO 商业化太早被定价，但可靠性和维护问题尚未解决。',
      '光模块环节如果竞争加剧，收入增长未必等于利润兑现。',
      '如果云厂商延迟部署，远期估值会先被杀。',
    ],
    experience:
      'qinbafrank 的逻辑是：AI 数据中心规模变大后，瓶颈会从“芯片能不能算”移动到“集群之间能不能低延迟、高带宽、省电地连接”。但他并不把所有 CPO 都当成当下机会；他更区分 1.6T、LPO/NPO、光源、测试这些先兑现的环节，和 CPO 这种方向正确但需要良率、可靠性、维护成本验证的远期环节。',
    tickers: ['MRVL', 'NOK', 'LITE', 'COHR', 'AVGO', 'AAOI'],
    icon: Network,
    timeline: [
      {
        date: '2025-11-19',
        phase: '起点',
        title: '光互联进入 AI 数据中心瓶颈地图',
        body: 'qinbafrank 把网络和互联方向归入 AI capex 的二阶传导，连接性开始从配角变成主线。',
        sourceId: '1991290721526247791',
      },
      {
        date: '2026-05-30',
        phase: '补充',
        title: 'CPO 是方向，但 2026 更现实的是 LPO / NPO 过渡',
        body: '近期观点强调云厂商不会为了节能牺牲可靠性，真正要看 1.6T、LPO/NPO、光源、测试等确定性环节。',
        sourceId: '2060560681984991697',
      },
      {
        date: '2026-06-04',
        phase: '验证',
        title: '168X 采访把 Marvell、CPO、Nokia 放进同一条连接性主线',
        body: '采访明确提出“无距离数据中心”和连接池化，说明 qinbafrank 看的是数据中心架构升级，而不只是光模块行情。',
        sourceId: '2062463349573718318',
      },
    ],
  },
  {
    id: 'cpu-asic',
    label: 'CPU / ARM / ASIC / 算力整合',
    shortLabel: 'CPU/ASIC',
    tone: 'amber',
    oneLine:
      'qinbafrank 看 CPU 和 ASIC，是看 agentic AI 让算力瓶颈从 GPU 训练扩展到任务调度、编排和定制化推理。',
    howHeReads: [
      '先看 GPU 与 CPU 配比：agent 越多，任务调度和编排越重，CPU 重新变成瓶颈。',
      '再看架构迁移：ARM 的功耗和多架构适配，可能更适合云厂商自研芯片时代。',
      '最后看整合者：NVDA、AVGO、MRVL、AMD、INTC 分别处在 GPU、ASIC、CPU 和互联不同位置。',
    ],
    dataToWatch: [
      'Vera / Rubin 机柜中的 CPU:GPU 配比变化',
      '云厂商自研芯片采用 ARM / ASIC 的比例',
      'Intel / AMD CPU 价格、交付周期和数据中心份额',
      'AVGO / MRVL 定制 ASIC、交换和互联收入',
      '推理工作负载中调度、编排、网络 IO 的占比变化',
    ],
    opportunities: [
      'CPU 从“训练不重要”变成 agentic AI 的任务编排入口。',
      'ARM 可能受益于低功耗和云厂商自研芯片生态。',
      'ASIC 和定制芯片让 Broadcom、Marvell 这类公司拥有非 GPU 受益路径。',
    ],
    risks: [
      '如果 agent 工作负载没有爆发，CPU 紧缺叙事会失去基础。',
      '云厂商自研 ASIC 可能削弱部分通用 GPU/CPU 定价能力。',
      'Intel/AMD 的机会需要验证交付、工艺和客户采用，不是只靠概念。',
    ],
    experience:
      'qinbafrank 的原观点是：生成式 AI 往 agentic AI 迁移后，系统不只是训练模型，还要调度大量任务、工具调用和推理流程；这些工作 GPU 做不了，CPU 和 ASIC 会重新变成卡点。所以 AMD/INTC/ARM/AVGO 的机会不是“替代英伟达”，而是瓶颈从 GPU 外溢后的第二层受益。',
    tickers: ['ARM', 'AMD', 'INTC', 'AVGO', 'MRVL', 'NVDA'],
    icon: Cpu,
    timeline: [
      {
        date: '2026-04-17',
        phase: '起点',
        title: 'CPU 紧缺与 Agentic AI 进入框架',
        body: 'qinbafrank 把 CPU、编排和推理服务纳入新增卡点，说明 AI capex 已从训练扩展到执行。',
        sourceId: '2045031360004558969',
      },
      {
        date: '2026-05-30',
        phase: '验证',
        title: 'ARM 架构、AI PC 和自研芯片成为新增线索',
        body: '市场开始讨论 NVDA、ARM、联发科、微软和苹果生态变化，CPU/ARM 从边缘话题进入主线。',
        sourceId: '2060578879170031865',
      },
      {
        date: '2026-06-04',
        phase: '修正',
        title: '采访中把 CPU 紧缺归入“紧缺逻辑”',
        body: 'qinbafrank 明确说 agent 调度、编排需要 CPU，GPU 做不了；CPU:GPU 配比可能继续上升。',
        sourceId: '2062463349573718318',
      },
    ],
  },
  {
    id: 'power-cooling',
    label: '电力 / 液冷 / 800V HVDC',
    shortLabel: '电力',
    tone: 'amber',
    oneLine:
      'qinbafrank 看电力链，是看 AI Factory 把数据中心从芯片竞争推进到供电、配电、散热和能耗效率竞争。',
    howHeReads: [
      '先看数据中心扩容是否被电力接入、变压器、配电和散热约束。',
      '再看技术升级：48V / 54V 走向 800V HVDC，本质是降低电流、损耗和系统成本。',
      '最后看需求持续性：只有 capex 继续、机柜功率继续上升，电力链才不是一次性主题。',
    ],
    dataToWatch: [
      '数据中心单机柜功率、PUE、液冷渗透率',
      '800V HVDC 方案推进、功率半导体和电源管理订单',
      '电网接入排队、变压器交期、供电协议',
      'VRT、ETN 等数据中心电力设备 backlog',
      '云厂商是否把 AI Factory 从概念落实到实际项目',
    ],
    opportunities: [
      'AI 数据中心从芯片扩张到机房工程，电力设备可能成为更稳定的基础设施收益端。',
      '800V HVDC、液冷和功率半导体对应的是架构升级，不只是普通电力需求。',
      '当 GPU/HBM 被充分定价后，资金可能轮动到更后端的配电和散热链条。',
    ],
    risks: [
      '主题太热时，电力链容易被按“AI 概念”过度定价。',
      '项目审批、电网接入或 capex 放缓会延后收入兑现。',
      '如果机柜功率增长不及预期，800V 和液冷升级速度会低于市场想象。',
    ],
    experience:
      'qinbafrank 当时的判断不是简单喊“缺电”，而是把顺序说清楚：GPU 紧 -> HBM 紧 -> 光互连紧 -> 电力/液冷紧。电力的关键在于数据中心建设周期长、容量预订提前到 2027、单机柜功率上升，800V HVDC 则是为了降低电流和损耗。证据要看项目、backlog、接电周期和技术路径，而不是只看题材热度。',
    tickers: ['VRT', 'ETN', 'NVDA', 'TSM'],
    icon: Zap,
    timeline: [
      {
        date: '2026-04-13',
        phase: '起点',
        title: '800V HVDC 与数据中心供电进入 AI 框架',
        body: 'qinbafrank 把数据中心电力改造、供电效率和 HVDC 技术路径放进 capex 战争。',
        sourceId: '2043653387271712962',
      },
      {
        date: '2026-04-14',
        phase: '验证',
        title: '电力约束成为 AI 投资的新观察项',
        body: '算力扩张之后，电力、配电和能源约束被视为下一层瓶颈。',
        sourceId: '2043910896351883636',
      },
      {
        date: '2026-05-22',
        phase: '补充',
        title: '电力链继续跟踪 AI 数据中心扩容',
        body: '后续观点继续把供电、配电和电力设备需求作为 AI capex 的外溢方向。',
        sourceId: '2057739575372706022',
      },
      {
        date: '2026-06-04',
        phase: '修正',
        title: '采访中把 800V HVDC 归入“升级逻辑”',
        body: 'qinbafrank 把数据中心配电从 48V/54V 推到 800V HVDC，解释成能耗效率和电力架构升级。',
        sourceId: '2062463349573718318',
      },
    ],
  },
  {
    id: 'packaging',
    label: '先进封装 / 基板 / 设备',
    shortLabel: '封装设备',
    tone: 'zinc',
    oneLine:
      'qinbafrank 看先进封装，是看制程红利变慢后，性能提升更多转向 3D 堆叠、材料、基板和设备能力。',
    howHeReads: [
      '先看台积电和封装产能：CoWoS、先进封装和良率决定高端 GPU 能否持续放量。',
      '再看材料升级：ABF、玻璃基板、陶瓷基板和 CCL 等材料可能成为结构性瓶颈。',
      '最后看设备链：ASML、测试设备和精密工艺是上游“卖铲子”的基础。',
    ],
    dataToWatch: [
      'TSM CoWoS / advanced packaging 产能扩张和良率',
      'ABF、玻璃基板、陶瓷基板、CCL 的供需和价格',
      'ASML EUV / non-EUV 订单、出口管制和交付周期',
      'NVDA / AMD / Broadcom 新芯片对封装和基板规格的要求',
      '先进封装 capex 是否从单一客户扩展到多个云厂商和 ASIC 客户',
    ],
    opportunities: [
      '当单纯缩小制程性价比下降，封装和材料会承担更多性能提升任务。',
      '台积电、ASML 和上游材料设备更像产业链收租者。',
      'CPO、HBM 和 3D 堆叠都会提高封装、基板和测试的战略重要性。',
    ],
    risks: [
      '如果先进封装扩产过快，短缺溢价会下降。',
      '出口管制和地缘风险可能改变设备链订单节奏。',
      '材料题材容易提前炒作，真正收入兑现可能慢于市场预期。',
    ],
    experience:
      'qinbafrank 对封装设备的逻辑是：先进制程逼近物理极限后，性能提升越来越依赖 CoWoS、3D 堆叠、基板、材料和测试。也就是说，GPU 需求最终会卡到台积电封装产能、HBM 集成和上游设备材料上；这些环节未必最有故事性，但会决定高端 AI 芯片能不能真正放量。',
    tickers: ['TSM', 'ASML', 'AVGO', 'NVDA', 'AMD'],
    icon: Layers,
    timeline: [
      {
        date: '2026-02-27',
        phase: '起点',
        title: '从 NVDA 财报看封装与 HBM 的最卡点',
        body: '先进封装和 HBM 一起成为高端 GPU 放量的约束条件。',
        sourceId: '2027238317323137395',
      },
      {
        date: '2026-04-14',
        phase: '补充',
        title: 'AI 算力产业链瓶颈继续向上游迁移',
        body: 'qinbafrank 梳理算力链瓶颈传导时，把封装、材料、设备视为不可忽视的上游节点。',
        sourceId: '2043991474753417546',
      },
      {
        date: '2026-06-04',
        phase: '修正',
        title: '采访中把先进封装归入“升级逻辑”',
        body: '他用制程接近物理极限解释封装、材料和 3D 堆叠的重要性，说明这不是单一题材。',
        sourceId: '2062463349573718318',
      },
    ],
  },
  {
    id: 'software-agent',
    label: '软件 / Agent / 应用分化',
    shortLabel: '软件Agent',
    tone: 'primary',
    oneLine:
      'qinbafrank 看软件不是“AI 替代所有软件”，而是判断哪些通用任务会被替代，哪些垂直 know-how 和私有数据会被加强。',
    howHeReads: [
      '先区分通用型软件和垂直型软件：大模型能直接完成的公共任务最危险。',
      '再看私有数据和行业 know-how：制造、化工、医药、数据库、安全等领域可能被 AI 反而加强。',
      '最后看软硬件一体化：Cloudflare 这类有物理网络、CDN 和安全基础设施的公司，不容易被纯模型替代。',
    ],
    dataToWatch: [
      '软件公司净留存率、AI 产品 attach rate、RPO 和新客户增长',
      '数据库、向量数据库、安全、CDN 的 AI 工作负载增长',
      '企业私有数据接入、行业模型和内部小模型部署',
      '通用 SaaS 的 seat 收入是否被 agent 自动化侵蚀',
      'SNOW、NET、NOW、MDB 等财报中 AI 对收入的真实贡献',
    ],
    opportunities: [
      '垂直软件、数据库、安全、CDN 和软硬件一体化公司可能被 AI 增强。',
      'Agent 增多会提高工具调用、网络、安全和数据基础设施需求。',
      '有私有数据和深行业流程的软件更可能成为 AI 的工作台，而不是被替代。',
    ],
    risks: [
      '通用任务型软件如果没有数据壁垒和 workflow 粘性，可能被模型直接吃掉。',
      'AI 功能如果只提升体验、不能带来付费，估值会先涨后回落。',
      '企业软件财报一旦显示增长不及预期，会被市场归类为“AI 替代受害者”。',
    ],
    experience:
      'qinbafrank 在软件上的判断更偏分化：通用任务型软件会被模型和 agent 压缩，因为用户要的是结果不是 seat；但有私有数据、行业 know-how、真实工作流、物理网络或安全责任的软件，反而可能被 AI 放大。这里要看 AI 功能有没有变成付费和留存，而不是只看公司说自己接入了 AI。',
    tickers: ['SNOW', 'NET', 'NOW', 'MDB', 'PLTR', 'ORCL'],
    icon: Server,
    timeline: [
      {
        date: '2026-06-04',
        phase: '起点',
        title: '采访中明确软件股的三类分化',
        body: 'qinbafrank 将软件分成通用任务、垂直 know-how、软硬件一体化：危险和机会来自不同壁垒。',
        sourceId: '2062463349573718318',
      },
      {
        date: '2026-01-15',
        phase: '补充',
        title: 'AI 主线从基础设施延伸到应用和入口',
        body: '后续 AI 观点开始补充应用、入口和竞争格局，说明软件页需要回答“谁被替代、谁被加强”。',
        sourceId: '2011679701769863353',
      },
      {
        date: '2024-06-07',
        phase: '验证',
        title: 'PLTR 作为企业 / 政府 AI 操作层案例',
        body: '个股案例显示 qinbafrank 更愿意把应用公司放回“是否有真实工作流和客户粘性”中判断。',
        sourceId: '1798953514837610894',
      },
    ],
  },
  {
    id: 'edge-physical',
    label: '边缘计算 / Physical AI',
    shortLabel: 'Physical AI',
    tone: 'rose',
    oneLine:
      'qinbafrank 看 Physical AI，是看 AI 从云端和屏幕进入真实世界，但它属于远期逻辑，必须等商业化和成本曲线验证。',
    howHeReads: [
      '先区分概念：边缘计算是靠近数据产生处计算，端侧 AI 是手机/PC/车端小模型，Physical AI 是线下 bot。',
      '再看基础设施：AI-RAN、基站边缘算力、车端系统、机器人 OS 和安全软件，都是云端 AI 走向物理世界的桥。',
      '最后看成熟度：机器人和自动驾驶要看量产、成本下降和真实场景，而不是只看发布会。',
    ],
    dataToWatch: [
      'NOK 光连接和 AI & Cloud 订单、AI-RAN 进展',
      'BB QNX 在车厂、机器人、工业设备中的采用',
      'TSLA Optimus / robotaxi 量产节奏和单位成本',
      'Qualcomm / NXP 等端侧 AI 芯片和边缘设备出货',
      '边缘计算收入占比是否从“估值期权”变成财报主线',
    ],
    opportunities: [
      'NOK 可能同时站在光互联、数据中心互连和边缘 AI 叙事上。',
      'BB 这类困境反转公司，如果绑定硬件龙头和安全底座，弹性可能很大。',
      'Physical AI 如果量产，会把 AI 投资从数据中心推向汽车、机器人、工业和医疗设备。',
    ],
    risks: [
      '远期逻辑容易提前定价，商业化成熟度未到时回撤会很剧烈。',
      '机器人、自动驾驶和 AI-RAN 的量产时间不确定。',
      '小公司困境反转需要财报和客户验证，否则只是叙事修复。',
    ],
    experience:
      'qinbafrank 对 Physical AI 的原观点更像远期终局判断：AI 不是只停在屏幕里，最终会进入汽车、机器人、工厂和线下设备；但这一层不能按发布会交易，要等量产、成本曲线、监管、安全数据和真实订单。短期更硬的是电力和边缘基础设施，Physical AI 本身还要用工程进度来约束想象。',
    tickers: ['NOK', 'BB', 'TSLA', 'QCOM', 'NXPI', 'NVDA'],
    icon: Bot,
    timeline: [
      {
        date: '2026-01-06',
        phase: '起点',
        title: '边缘和端侧 AI 被放入 capex 外溢链',
        body: 'qinbafrank 把 AI 从云端训练走向汽车、工厂、机器人和端侧执行，作为低延迟场景的新增方向。',
        sourceId: '2008402498823090398',
      },
      {
        date: '2026-05-06',
        phase: '补充',
        title: 'BB 进入 Physical AI 底层安全软件视角',
        body: 'QNX、智能驾驶、工业设备和机器人软件架构让 BB 从旧手机公司变成边缘系统案例。',
        sourceId: '2051838078420242854',
      },
      {
        date: '2026-05-28',
        phase: '验证',
        title: 'BB 后续跟踪强化“困境反转 + 底层软件”逻辑',
        body: '后续跟踪将 BB 作为机器人和边缘 AI 软件基础设施案例，观察认证、回购和客户信号。',
        sourceId: '2059802180379656378',
      },
      {
        date: '2026-06-04',
        phase: '修正',
        title: '采访中把 Physical AI 明确归入“远期逻辑”',
        body: 'qinbafrank 将边缘计算、Physical AI、机器人和自动驾驶定义为 AI 下一阶段，但强调要等量产和成本下降。',
        sourceId: '2062463349573718318',
      },
    ],
  },
];

const TOPIC_TO_BOARD: Partial<Record<FrankHighlightTopicId, FrankSectorOpinionId>> = {
  'ai-trend': 'ai-industry',
  'capex-war': 'ai-industry',
  'crypto-rwa': 'crypto-rwa',
  'market-rules': 'market-cycle',
  'market-timing': 'market-cycle',
  'macro-geopolitics': 'macro-geopolitics',
  'company-theses': 'company-theses',
};

const toneClass: Record<BoardTone, {
  active: string;
  icon: string;
  inactiveIcon: string;
  hover: string;
  bar: string;
  dot: string;
  chip: string;
  text: string;
}> = {
  primary: {
    active: 'border-primary/35 bg-primary/[0.065]',
    icon: 'border-primary/30 bg-primary/10 text-primary',
    inactiveIcon: 'border-primary/20 bg-primary/[0.045] text-primary/80',
    hover: 'hover:border-primary/30 hover:bg-primary/[0.045]',
    bar: 'bg-primary',
    dot: 'bg-primary',
    chip: 'border-primary/25 bg-primary/10 text-primary',
    text: 'text-primary',
  },
  amber: {
    active: 'border-amber-500/35 bg-amber-500/[0.06]',
    icon: 'border-amber-500/30 bg-amber-500/10 text-amber-500',
    inactiveIcon: 'border-amber-500/20 bg-amber-500/[0.045] text-amber-500/80',
    hover: 'hover:border-amber-500/30 hover:bg-amber-500/[0.045]',
    bar: 'bg-amber-500',
    dot: 'bg-amber-500',
    chip: 'border-amber-500/25 bg-amber-500/10 text-amber-500',
    text: 'text-amber-500',
  },
  sky: {
    active: 'border-sky-500/35 bg-sky-500/[0.055]',
    icon: 'border-sky-500/30 bg-sky-500/10 text-sky-400',
    inactiveIcon: 'border-sky-500/20 bg-sky-500/[0.045] text-sky-400/80',
    hover: 'hover:border-sky-500/30 hover:bg-sky-500/[0.045]',
    bar: 'bg-sky-500',
    dot: 'bg-sky-500',
    chip: 'border-sky-500/25 bg-sky-500/10 text-sky-400',
    text: 'text-sky-400',
  },
  rose: {
    active: 'border-rose-500/35 bg-rose-500/[0.055]',
    icon: 'border-rose-500/30 bg-rose-500/10 text-rose-400',
    inactiveIcon: 'border-rose-500/20 bg-rose-500/[0.045] text-rose-400/80',
    hover: 'hover:border-rose-500/30 hover:bg-rose-500/[0.045]',
    bar: 'bg-rose-500',
    dot: 'bg-rose-500',
    chip: 'border-rose-500/25 bg-rose-500/10 text-rose-400',
    text: 'text-rose-400',
  },
  zinc: {
    active: 'border-border/60 bg-card/45',
    icon: 'border-border/45 bg-card/55 text-foreground',
    inactiveIcon: 'border-border/45 bg-card/35 text-muted-foreground',
    hover: 'hover:border-border/60 hover:bg-card/35',
    bar: 'bg-muted-foreground',
    dot: 'bg-muted-foreground',
    chip: 'border-border/45 bg-card/45 text-foreground',
    text: 'text-muted-foreground',
  },
};

const insightToneClass: Record<InsightKind, {
  tab: string;
  panel: string;
  dot: string;
}> = {
  how: {
    tab: 'border-primary/25 bg-primary/15 text-primary',
    panel: 'border-primary/20 bg-primary/[0.035]',
    dot: 'bg-primary',
  },
  data: {
    tab: 'border-sky-500/25 bg-sky-500/15 text-sky-400',
    panel: 'border-sky-500/20 bg-sky-500/[0.035]',
    dot: 'bg-sky-400',
  },
  opportunity: {
    tab: 'border-amber-500/25 bg-amber-500/15 text-amber-500',
    panel: 'border-amber-500/20 bg-amber-500/[0.035]',
    dot: 'bg-amber-500',
  },
  risk: {
    tab: 'border-rose-500/25 bg-rose-500/15 text-rose-400',
    panel: 'border-rose-500/20 bg-rose-500/[0.035]',
    dot: 'bg-rose-500',
  },
};

const TYPE = {
  englishEyebrow: 'text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground',
  chineseKicker: 'text-sm font-medium leading-snug tracking-wide text-muted-foreground',
  chineseKickerAccent: 'text-sm font-medium leading-snug tracking-wide',
  railHeading: 'mt-1 max-w-[22ch] text-lg font-semibold leading-snug tracking-tight text-foreground',
  body: 'text-sm leading-relaxed text-muted-foreground',
  strongBody: 'text-sm leading-relaxed text-foreground',
  thesis: 'max-w-[34ch] text-xl font-semibold leading-snug tracking-tight text-foreground md:text-2xl',
  timelineTitle: 'mt-2 text-sm font-semibold leading-relaxed text-foreground',
  timelineBody: 'mt-1 line-clamp-3 text-sm leading-relaxed text-muted-foreground',
} as const;

export default function FrankSectorOpinions({
  username,
  initialSectorId,
  initialTopicId,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const routeSector = initialSectorId ?? searchParams?.get('sector') ?? null;
  const routeTopic = initialTopicId ?? searchParams?.get('topic') ?? null;
  const selectedId = resolveBoardId(routeSector, routeTopic);
  const selected = BOARDS.find((board) => board.id === selectedId) ?? BOARDS[0];

  const boardGroups = useMemo(() => getBoardGroups(selected), [selected]);
  const boardItems = useMemo(() => getUniqueItems(boardGroups), [boardGroups]);
  const timelineItems = useMemo(() => getTimelineItems(selected), [selected]);

  function pickBoard(id: FrankSectorOpinionId) {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.set('sector', id);
    params.delete('topic');
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="py-5 md:py-6 lg:py-7">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-8">
        <aside className="h-auto min-h-0 min-w-0 lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)]">
          <BoardRail selectedId={selected.id} onSelect={pickBoard} />
        </aside>

        <main className="min-w-0">
          <BoardDetail
            board={selected}
            groups={boardGroups}
            items={boardItems}
            timelineItems={timelineItems}
            username={username}
          />
        </main>
      </div>
    </div>
  );
}

function BoardRail({
  selectedId,
  onSelect,
}: {
  selectedId: FrankSectorOpinionId;
  onSelect: (id: FrankSectorOpinionId) => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div>
        <p className={TYPE.chineseKicker}>
          选择板块
        </p>
        <h3 className={TYPE.railHeading}>
          qinbafrank 的 5 个观察窗口
        </h3>
      </div>

      <ul className="mt-4 flex max-w-full gap-2 overflow-x-auto pb-2 lg:block lg:min-h-0 lg:space-y-2 lg:overflow-y-auto lg:pb-0 lg:pr-1">
        {BOARDS.map((board, index) => {
          const active = board.id === selectedId;
          const Icon = board.icon;
          const groups = getBoardGroups(board);
          const itemCount = getUniqueItems(groups).length;
          return (
            <li
              key={board.id}
              className="sector-motion-rail-item min-w-[14rem] shrink-0 lg:min-w-0"
              style={motionDelayStyle(index)}
            >
              <button
                type="button"
                onClick={() => onSelect(board.id)}
                aria-pressed={active}
                className={cn(
                  'group relative h-full w-full rounded-md border px-3.5 py-3 text-left transition duration-200 ease-out motion-safe:hover:-translate-y-0.5 active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                  active
                    ? toneClass[board.tone].active
                    : cn('border-border/35 bg-transparent', toneClass[board.tone].hover),
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'absolute left-0 top-2 h-[calc(100%-1rem)] w-0.5 rounded-full transition-opacity',
                    active
                      ? toneClass[board.tone].bar
                      : cn(toneClass[board.tone].bar, 'opacity-0 group-hover:opacity-40'),
                  )}
                />
                <span className="flex items-start gap-3">
                  <span className={cn('mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-md border transition duration-200 group-hover:scale-[1.03]', active ? toneClass[board.tone].icon : toneClass[board.tone].inactiveIcon)}>
                    <Icon className="h-4 w-4" strokeWidth={1.7} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold leading-snug text-foreground">
                      {board.label}
                    </span>
                    <span className="mt-1 hidden text-sm leading-relaxed text-muted-foreground lg:line-clamp-2">
                      {board.plainRead}
                    </span>
                    <span className="mt-2 flex items-center justify-between gap-2 lg:mt-3">
                      <CountMeta value={groups.length} suffix="组精华" />
                      <CountMeta value={itemCount} suffix="条" className="shrink-0" />
                    </span>
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function BoardDetail({
  board,
  groups,
  items,
  timelineItems,
  username,
}: {
  board: FrankSectorOpinionBoard;
  groups: FrankFeaturedGroup[];
  items: FrankFeaturedContent[];
  timelineItems: Array<{ ref: TimelineRef; item: FrankFeaturedContent }>;
  username: string;
}) {
  const firstDate = items[0]?.date ?? '待补原文';
  const latestDate = items.at(-1)?.date ?? '待补原文';
  const tone = toneClass[board.tone];
  const isAIIndustry = board.id === 'ai-industry';
  const aiTimelineCount = AI_SUBSECTORS.reduce(
    (sum, sector) => sum + sector.timeline.length,
    0,
  );

  return (
    <div key={board.id} className="sector-motion-shell flex min-w-0 flex-col">
      <header className="border-b border-border/40 pb-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className={TYPE.englishEyebrow}>
              {board.eyebrow}
            </p>
            <h2 className="mt-1 font-editorial text-3xl leading-tight text-foreground md:text-4xl">
              {board.label}
            </h2>
            <p className="mt-3 max-w-[68ch] text-base leading-relaxed text-muted-foreground">
              {board.summary}
            </p>
          </div>
          <Link
            href={`/kol/${username}/highlights?topic=${encodeURIComponent(board.topicIds[0])}`}
            className="group inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-md border border-border/50 bg-card/35 px-3.5 py-2 text-sm font-medium text-foreground transition duration-200 ease-out motion-safe:hover:-translate-y-0.5 hover:border-primary/40 hover:bg-primary/10 hover:text-primary active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            去精华阅读器
            <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-border/40 pt-4 md:grid-cols-4">
          <Stat label={isAIIndustry ? 'AI 子板块' : '精华组'} value={isAIIndustry ? `${AI_SUBSECTORS.length}` : `${groups.length}`} />
          <Stat label={isAIIndustry ? '观点节点' : '精选原文'} value={isAIIndustry ? `${aiTimelineCount}` : `${items.length}`} />
          <Stat label="时间跨度" value={firstDate === latestDate ? shortDate(firstDate) : `${shortDate(firstDate)} - ${shortDate(latestDate)}`} />
          <Stat label="相关标的" value={board.tickers.slice(0, 3).join(' / ')} />
        </div>
      </header>

      {isAIIndustry ? (
        <AIIndustryDeepDive />
      ) : (
        <div className="sector-motion-frame grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(22rem,0.95fr)] lg:items-start lg:gap-8">
          <BoardFrameworkDeepDive board={board} />
          <section className="mt-6 flex min-h-0 flex-col border-t border-border/40 pt-5">
            <SectionTitle>观点时间线</SectionTitle>
            <p className={cn('-mt-2 mb-4', TYPE.body)}>
              最近观点在上，点原文核对当时语境。
            </p>
            {timelineItems.length === 0 ? (
              <p className="rounded-md border border-dashed border-border/45 px-4 py-10 text-center text-sm text-muted-foreground">
                暂无可整理的观点时间线
              </p>
            ) : (
              <ol className="relative ml-2 max-h-[34rem] space-y-5 overflow-y-auto border-l border-border/40 pl-5 pr-2">
                {timelineItems.map(({ ref, item }, index) => (
                  <TimelineNode
                    key={`${ref.sourceId}-${ref.type}`}
                    item={item}
                    type={ref.type}
                    note={ref.note}
                    tone={tone}
                    isLatest={index === 0}
                    index={index}
                  />
                ))}
              </ol>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function BoardFrameworkDeepDive({ board }: { board: FrankSectorOpinionBoard }) {
  const tone = toneClass[board.tone];
  const points = [
    { label: '先看', body: board.howHeReads[0], labelClass: tone.text },
    { label: '数据', body: board.dataToWatch[0], labelClass: 'text-sky-400' },
    { label: '风险', body: board.risks[0], labelClass: 'text-rose-400' },
  ];

  return (
    <section className="mt-6 min-w-0 border-t border-border/40 pt-5">
      <SectionTitle>分析框架</SectionTitle>
      <div className="pb-4">
        <h4 className={TYPE.thesis}>
          {board.plainRead}
        </h4>
        <div className="mt-3">
          <TickerChips tickers={board.tickers} />
        </div>
      </div>
      <div className="grid gap-3 border-y border-border/40 py-4 md:grid-cols-3">
        {points.map((point) => (
          <div key={point.label} className="min-w-0">
            <p className={cn(TYPE.chineseKickerAccent, point.labelClass)}>
              {point.label}
            </p>
            <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-foreground">
              {point.body}
            </p>
          </div>
        ))}
      </div>
      <InsightSwitcher panels={getInsightPanels(board)} />
      <LogicDisclosure text={board.experience} />
    </section>
  );
}

function AIIndustryDeepDive() {
  const [activeId, setActiveId] = useState<AISubsectorId>('memory');
  const active =
    AI_SUBSECTORS.find((sector) => sector.id === activeId) ?? AI_SUBSECTORS[0];

  return (
    <div className="mt-6">
      <section className="border-t border-border/40 pt-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className={TYPE.chineseKicker}>
              子板块拆解
            </p>
            <h3 className="mt-1 text-xl font-semibold leading-snug tracking-tight text-foreground md:text-2xl">
              每个 AI 子产业，按同一套问题看
            </h3>
          </div>
        </div>

        <AISubsectorNav
          activeId={active.id}
          onSelect={setActiveId}
        />

        <AISubsectorDetail key={active.id} sector={active} />
      </section>
    </div>
  );
}

function AISubsectorNav({
  activeId,
  onSelect,
}: {
  activeId: AISubsectorId;
  onSelect: (id: AISubsectorId) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 pb-3 md:grid-cols-4">
      {AI_SUBSECTORS.map((sector, index) => {
        const active = sector.id === activeId;
        const Icon = sector.icon;
        const tone = toneClass[sector.tone];
        return (
          <button
            key={sector.id}
            type="button"
            onClick={() => onSelect(sector.id)}
            aria-pressed={active}
            style={motionDelayStyle(index)}
            className={cn(
              'sector-motion-subsector-item group flex min-h-12 w-full items-center gap-2 rounded-md border px-3 text-left transition duration-200 ease-out motion-safe:hover:-translate-y-0.5 active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
              active
                ? cn(tone.active, 'text-foreground')
                : cn('border-border/40 bg-card/20 text-muted-foreground hover:text-foreground', tone.hover),
            )}
          >
            <span
              className={cn(
                'grid h-7 w-7 shrink-0 place-items-center rounded-md border transition duration-200 group-hover:scale-[1.05]',
                active ? tone.icon : tone.inactiveIcon,
              )}
            >
              <Icon className="h-3.5 w-3.5" strokeWidth={1.8} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium leading-snug">
                {sector.shortLabel}
              </span>
              <span className="mt-0.5 block font-data text-xs tabular-nums text-muted-foreground">
                {sector.tickers.slice(0, 2).join(' / ')}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function AISubsectorDetail({
  sector,
}: {
  sector: AISubsector;
}) {
  const tone = toneClass[sector.tone];

  return (
    <article className="sector-motion-frame mt-2">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(22rem,0.95fr)] lg:items-start lg:gap-8">
        <SubsectorFramework sector={sector} />

        <section className="min-w-0 border-t border-border/40 pt-5 lg:mt-0">
          <SectionTitle>观点时间线</SectionTitle>
          <p className={cn('-mt-2 mb-4', TYPE.body)}>
            最近观点在上，点证据来源回看原文。
          </p>
          <ol className="relative ml-2 max-h-[42rem] space-y-5 overflow-y-auto border-l border-border/40 pl-5 pr-2">
            {sortAISubsectorTimelineDesc(sector.timeline).map((item, index) => (
              <AISubsectorTimelineNode
                key={`${sector.id}-${item.date}-${item.title}`}
                item={item}
                tone={tone}
                isLatest={index === 0}
                index={index}
              />
            ))}
          </ol>
        </section>
      </div>
    </article>
  );
}

function SubsectorFramework({ sector }: { sector: AISubsector }) {
  const tone = toneClass[sector.tone];
  const points = [
    { label: '先看', body: sector.howHeReads[0], labelClass: tone.text },
    { label: '数据', body: sector.dataToWatch[0], labelClass: 'text-sky-400' },
    { label: '风险', body: sector.risks[0], labelClass: 'text-rose-400' },
  ];

  return (
    <section className="min-w-0 border-t border-border/40 pt-5">
      <SectionTitle>分析框架</SectionTitle>
      <div className="pb-4">
        <h4 className={TYPE.thesis}>
          {sector.oneLine}
        </h4>
        <div className="mt-3">
          <TickerChips tickers={sector.tickers} />
        </div>
      </div>
      <div className="grid gap-3 border-y border-border/40 py-4 md:grid-cols-3">
        {points.map((point) => (
          <div key={point.label} className="min-w-0">
            <p className={cn(TYPE.chineseKickerAccent, point.labelClass)}>
              {point.label}
            </p>
            <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-foreground">
              {point.body}
            </p>
          </div>
        ))}
      </div>
      <InsightSwitcher panels={getInsightPanels(sector)} />
      <LogicDisclosure text={sector.experience} />
    </section>
  );
}

function InsightSwitcher({ panels }: { panels: InsightPanel[] }) {
  const [activeId, setActiveId] = useState<InsightKind>('how');
  const active = panels.find((panel) => panel.id === activeId) ?? panels[0];

  return (
    <section className="mt-5 border-t border-border/40 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className={TYPE.chineseKicker}>
            分析维度
          </p>
          <h5 className="mt-1 text-lg font-semibold leading-snug tracking-tight text-foreground">
            按问题切换阅读
          </h5>
        </div>
        <div
          role="tablist"
          aria-label="板块分析维度"
          className="grid w-full grid-cols-4 gap-1 rounded-md border border-border/40 bg-card/20 p-1 md:w-auto"
        >
          {panels.map((panel) => {
            const activeTab = panel.id === active.id;
            return (
              <button
                key={panel.id}
                type="button"
                role="tab"
                aria-selected={activeTab}
                onClick={() => setActiveId(panel.id)}
                className={cn(
                  'min-h-9 rounded border border-transparent px-2 text-sm font-medium transition duration-200 ease-out motion-safe:hover:-translate-y-px active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                  activeTab
                    ? insightToneClass[panel.id].tab
                    : 'text-muted-foreground hover:border-border/55 hover:bg-muted/35 hover:text-foreground',
                )}
              >
                {panel.eyebrow}
              </button>
            );
          })}
        </div>
      </div>

      <div
        key={active.id}
        className={cn('sector-motion-insight mt-4 rounded-md border px-4 py-4 transition-colors', insightToneClass[active.id].panel)}
      >
        <p className={TYPE.chineseKicker}>
          {active.eyebrow}
        </p>
        <h5 className="mt-1 text-base font-semibold leading-snug tracking-tight text-foreground">
          {active.title}
        </h5>
        <ul className="mt-3 space-y-2.5">
          {active.items.map((item) => (
            <li key={item} className="flex gap-2 text-sm leading-relaxed text-muted-foreground">
              <span className={cn('mt-2 h-1.5 w-1.5 shrink-0 rounded-full', active.markerClass ?? insightToneClass[active.id].dot)} />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function LogicDisclosure({ text }: { text: string }) {
  const { lead, detail } = splitLogicText(text);

  return (
    <section className="mt-5 rounded-md border border-border/40 bg-card/20 px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className={TYPE.chineseKicker}>
          qinbafrank 原观点逻辑
        </p>
        <span className="rounded-sm border border-primary/20 bg-primary/10 px-2 py-1 text-sm font-medium text-primary">
          基于已入库原文
        </span>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-foreground">
        {lead}
      </p>
      {detail ? (
        <details className="group mt-3">
          <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-1.5 rounded-md border border-border/45 bg-background/30 px-3 text-sm font-medium text-muted-foreground transition duration-200 ease-out motion-safe:hover:-translate-y-0.5 hover:border-primary/35 hover:bg-primary/10 hover:text-primary active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
            展开完整判断链
            <ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" />
          </summary>
          <div className="sector-motion-disclosure-copy">
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {detail}
            </p>
          </div>
        </details>
      ) : null}
    </section>
  );
}

function AISubsectorTimelineNode({
  item,
  tone,
  isLatest = false,
  index = 0,
}: {
  item: AISubsectorTimelineItem;
  tone: (typeof toneClass)[BoardTone];
  isLatest?: boolean;
  index?: number;
}) {
  return (
    <li
      className={cn('sector-motion-timeline-item relative pb-1', isLatest && 'sector-motion-latest')}
      style={motionDelayStyle(index)}
    >
      <span
        aria-hidden
        className={cn(
          'absolute -left-[1.55rem] top-1.5 grid h-3 w-3 place-items-center rounded-full border bg-background',
          isLatest ? 'border-primary/45' : 'border-border/70',
        )}
      >
        <span className={cn('sector-motion-dot-core', isLatest ? 'h-2 w-2' : 'h-1.5 w-1.5', 'rounded-full', tone.dot)} />
      </span>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <time className="font-data text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground tabular-nums">
          {shortDate(item.date)}
        </time>
        <span className={cn('rounded-sm border px-1.5 py-0.5 text-xs font-medium', tone.chip)}>
          {item.phase}
        </span>
        {isLatest ? (
          <span className="rounded-sm border border-primary/25 bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
            最新
          </span>
        ) : null}
      </div>
      <p className={TYPE.timelineTitle}>
        {item.title}
      </p>
      <p className={TYPE.timelineBody}>
        {item.body}
      </p>
      {item.sourceId ? (
        <div className="mt-2">
          <AISourceLink sourceId={item.sourceId} />
        </div>
      ) : null}
    </li>
  );
}

function AISourceLink({ sourceId }: { sourceId: string }) {
  return (
    <Link
      href={tweetHref(sourceId)}
      target="_blank"
      rel="noreferrer"
      className="group inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border/45 bg-card/35 px-3 text-sm font-medium text-muted-foreground transition hover:border-primary/40 hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
    >
      证据来源
      <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
    </Link>
  );
}

function TimelineNode({
  item,
  type,
  note,
  tone,
  isLatest = false,
  index = 0,
}: {
  item: FrankFeaturedContent;
  type: TimelineType;
  note?: string;
  tone: (typeof toneClass)[BoardTone];
  isLatest?: boolean;
  index?: number;
}) {
  return (
    <li
      className={cn('sector-motion-timeline-item relative pb-1', isLatest && 'sector-motion-latest')}
      style={motionDelayStyle(index)}
    >
      <span
        aria-hidden
        className={cn(
          'absolute -left-[1.55rem] top-1.5 grid h-3 w-3 place-items-center rounded-full border bg-background',
          isLatest ? 'border-primary/45' : 'border-border/70',
        )}
      >
        <span className={cn('sector-motion-dot-core', isLatest ? 'h-2 w-2' : 'h-1.5 w-1.5', 'rounded-full', tone.dot)} />
      </span>

      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <time className="font-data text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground tabular-nums">
          {shortDate(item.date)}
        </time>
        <span className={cn('rounded-sm border px-1.5 py-0.5 text-xs font-medium', tone.chip)}>
          {type}
        </span>
        {isLatest ? (
          <span className="rounded-sm border border-primary/25 bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
            最新
          </span>
        ) : null}
        <span className="rounded-sm border border-border/45 bg-card/35 px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
          {item.topic}
        </span>
      </div>

      <p className={TYPE.timelineTitle}>
        {item.title}
      </p>
      <p className={TYPE.timelineBody}>
        {note ?? item.summary}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <TickerChips tickers={item.tickers ?? []} />
        <SourceLink item={item} />
      </div>
    </li>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <p className={TYPE.chineseKicker}>
        {children}
      </p>
      <span className="h-px flex-1 bg-border/40" aria-hidden />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const isDataValue = /^[A-Z0-9$./\s-]+$/.test(value);

  return (
    <div>
      <p className={TYPE.chineseKicker}>
        {label}
      </p>
      <p className={cn('mt-1 text-base font-semibold leading-snug text-foreground', isDataValue && 'font-data tabular-nums')}>
        {value}
      </p>
    </div>
  );
}

function CountMeta({
  value,
  suffix,
  className,
}: {
  value: number;
  suffix: string;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-baseline gap-1 text-sm font-medium leading-snug text-muted-foreground', className)}>
      <span className="font-data tabular-nums text-foreground">
        {value}
      </span>
      {suffix}
    </span>
  );
}

function TickerChips({ tickers }: { tickers: string[] }) {
  if (tickers.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1.5">
      {tickers.slice(0, 6).map((ticker) => (
        <span
          key={ticker}
          className="rounded-sm border border-border/45 bg-background/35 px-1.5 py-0.5 font-data text-xs tabular-nums text-muted-foreground"
        >
          {ticker.startsWith('$') ? ticker : `$${ticker}`}
        </span>
      ))}
    </span>
  );
}

function SourceLink({ item }: { item: FrankFeaturedContent }) {
  if (!item.sourceUrl) {
    return (
      <span className="inline-flex min-h-9 items-center rounded-md border border-border/45 bg-card/35 px-3 text-sm font-medium text-muted-foreground">
        原文待补
      </span>
    );
  }

  return (
    <Link
      href={item.sourceUrl}
      target="_blank"
      rel="noreferrer"
      className="group inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border/45 bg-card/35 px-3 text-sm font-medium text-muted-foreground transition hover:border-primary/40 hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
    >
      看原文
      <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
    </Link>
  );
}

function motionDelayStyle(index: number): CSSProperties {
  return { '--sector-item-index': index } as CSSProperties;
}

function getInsightPanels(source: {
  howHeReads: string[];
  dataToWatch: string[];
  opportunities: string[];
  risks: string[];
}): InsightPanel[] {
  return [
    {
      id: 'how',
      eyebrow: '怎么看',
      title: 'qinbafrank 会先拆哪几层',
      items: source.howHeReads,
    },
    {
      id: 'data',
      eyebrow: '数据',
      title: '他会重点看哪些数据',
      items: source.dataToWatch,
    },
    {
      id: 'opportunity',
      eyebrow: '机会',
      title: '机会在哪里',
      items: source.opportunities,
      markerClass: 'bg-amber-500',
    },
    {
      id: 'risk',
      eyebrow: '风险',
      title: '风险在哪里',
      items: source.risks,
      markerClass: 'bg-rose-500',
    },
  ];
}

function splitLogicText(text: string) {
  const parts = text
    .split('。')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length <= 1) {
    return { lead: text, detail: '' };
  }

  return {
    lead: `${parts[0]}。`,
    detail: parts.slice(1).map((part) => `${part}。`).join(''),
  };
}

function getBoardGroups(board: FrankSectorOpinionBoard) {
  return FRANK_FEATURED_GROUPS.filter((group) => board.topicIds.includes(group.topicId));
}

function getUniqueItems(groups: FrankFeaturedGroup[]) {
  const byId = new Map<string, FrankFeaturedContent>();
  for (const group of groups) {
    for (const item of getFeaturedItemsForGroup(group)) {
      if (!byId.has(item.id)) {
        byId.set(item.id, item);
      }
    }
  }
  return sortFeaturedByDateAsc([...byId.values()]);
}

function getTimelineItems(board: FrankSectorOpinionBoard) {
  return board.timeline
    .map((ref) => {
      const item = getFeaturedByIds([ref.sourceId])[0];
      return item ? { ref, item } : null;
    })
    .filter((entry): entry is { ref: TimelineRef; item: FrankFeaturedContent } => Boolean(entry))
    .sort((a, b) => itemDateRank(b.item) - itemDateRank(a.item));
}

function sortAISubsectorTimelineDesc(items: AISubsectorTimelineItem[]) {
  return [...items].sort((a, b) => dateRank(b.date) - dateRank(a.date));
}

function resolveBoardId(
  sectorId: string | null,
  topicId: string | null,
): FrankSectorOpinionId {
  if (sectorId && BOARDS.some((board) => board.id === sectorId)) {
    return sectorId as FrankSectorOpinionId;
  }

  if (topicId && topicId in TOPIC_TO_BOARD) {
    return TOPIC_TO_BOARD[topicId as FrankHighlightTopicId] ?? 'ai-industry';
  }

  return 'ai-industry';
}

function shortDate(date: string) {
  if (!date || date === '待补原文') return date || '待补原文';
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
}

function itemDateRank(item: FrankFeaturedContent) {
  return dateRank(item.date);
}

function dateRank(date: string) {
  const parsed = Date.parse(date);
  return Number.isFinite(parsed) ? parsed : 0;
}
