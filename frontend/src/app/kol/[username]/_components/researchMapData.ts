export type ResearchStepKey = 'trend' | 'mechanism' | 'pricing' | 'assets' | 'verification';

export interface EvidenceArticle {
  title: string;
  sourceLabel?: string;
  body: string[];
}

export interface EvidenceTweet {
  id: string;
  date: string;
  label: string;
  summary: string;
  article?: EvidenceArticle;
}

export interface ResearchCell {
  title: string;
  body: string;
  bullets: string[];
  evidence: EvidenceTweet[];
}

export interface ResearchLine {
  id: 'ai' | 'crypto' | 'macro';
  label: string;
  eyebrow: string;
  thesis: string;
  question: string;
  assets: string[];
  steps: Record<ResearchStepKey, ResearchCell>;
}

export interface ChainStep {
  key: ResearchStepKey;
  label: string;
  question: string;
  description: string;
}

export interface VerificationCase {
  id: string;
  lineId: ResearchLine['id'];
  date: string;
  title: string;
  judgment: string;
  result: string;
  evidence: EvidenceTweet[];
  tickers: string[];
}

export const CHAIN_STEPS: ChainStep[] = [
  {
    key: 'trend',
    label: '大势判断',
    question: '为什么这是长期趋势',
    description: '先确认产业、政策或金融结构是否真的发生变化。',
  },
  {
    key: 'mechanism',
    label: '传导机制',
    question: '变化怎么传到产业链/资金链',
    description: '把大判断拆成渗透率、capex、瓶颈、流动性和政策约束。',
  },
  {
    key: 'pricing',
    label: '市场定价',
    question: '市场何时买单或反向定价',
    description: '判断是杀估值、杀业绩、杀逻辑，还是预期正在重估。',
  },
  {
    key: 'assets',
    label: '资产落点',
    question: '最后体现在哪些公司/资产',
    description: '把逻辑落到龙头、卡脖子环节、交易入口和指数/ETF。',
  },
  {
    key: 'verification',
    label: '历史验证',
    question: '过去判断后来如何',
    description: '用原文时间点回看后续市场、产业和宏观数据变化。',
  },
];

function tweet(
  id: string,
  date: string,
  label: string,
  summary: string,
  article?: EvidenceArticle,
): EvidenceTweet {
  return { id, date, label, summary, article };
}

export function tweetHref(id: string) {
  return `https://x.com/qinbafrank/status/${id}`;
}

export const RESEARCH_LINES: ResearchLine[] = [
  {
    id: 'ai',
    label: 'AI 产业革命',
    eyebrow: 'AI INDUSTRIAL REVOLUTION',
    thesis: '从认知成本下降、企业渗透率跨过早期拐点，到 Agent 普及后重新点燃算力需求。',
    question: 'AI 是不是仍在加速，瓶颈会传到哪里，哪些公司能真正吃到 capex 红利？',
    assets: ['NVDA', 'MU', 'AVGO', 'AMD', 'INTC', 'BB', 'IBM'],
    steps: {
      trend: {
        title: 'AI 从工具渗透走向生产率重构',
        body: '先看 AI 是否跨过社会智力成本拐点，再看企业渗透率是否进入 10%-50% 的黄金区间。',
        bullets: ['企业 AI 渗透率接近 10%', '模型智力继续抬升', 'Agent 从对话走向办事'],
        evidence: [
          tweet('1966309713211175233', '2025-09-12', 'AI 渗透率', '科技股吃渗透率红利，10%-50% 是黄金投资期。'),
          tweet('1919010067225120824', '2025-05-04', '认知成本', 'AI 的价值拐点是越过社会智力成本拐点。'),
          tweet('2048051142975008855', '2026-04-25', '模型竞争', '算力和模型竞争的本质是认知成本下降。'),
          tweet('2011679701769863353', '2026-01-15', 'Agent 加速', '26 年 AI 代理加速之年从一周内多个产品事件开启。'),
        ],
      },
      mechanism: {
        title: 'Agent 普及把 capex 推成产业链战争',
        body: '需求先体现为 token 消耗，再传到 GPU、HBM、光模块、CPU、电力和 800V HVDC 等约束。',
        bullets: ['OpenAI 算力军备竞赛', 'Mag4 capex 与收入兑现', '瓶颈从 GPU 扩散到 CPU/电力'],
        evidence: [
          tweet('1975423593787047963', '2025-10-07', '算力军备', '巨头逐步认可 Sam 对算力需求的早期判断。'),
          tweet('2023597321368547520', '2026-02-17', 'Capex 战争', '大科技资本开支成为市场争议焦点。'),
          tweet('2043653387271712962', '2026-04-13', '瓶颈传导', 'AI 硬件瓶颈扩散到电力、芯片、存储、设备和材料。'),
          tweet('2045031360004558969', '2026-04-17', 'CPU 紧缺', 'Agentic AI 迁移中 CPU 成为新的卡脖子环节。'),
          tweet('2057739575372706022', '2026-05-22', '800V HVDC', 'AI 数据中心电力关键环节进入关注窗口。'),
        ],
      },
      pricing: {
        title: 'AI 三次辩论决定市场如何重估',
        body: '市场从“是不是趋势”争到“算力够不够”，再争到“投入的钱能不能赚回来”。',
        bullets: ['趋势确认', '算力不足确认', '资本开支兑现待验证'],
        evidence: [
          tweet('1988826907534860695', '2025-11-13', '三次辩论', '第三次辩论后市场会认识到投出去的钱会赚回来。'),
          tweet('1992490737573724577', '2025-11-23', 'AI 危机清单', 'AI 危机质疑从债务、画饼扩展到英伟达财报。'),
          tweet('2020093693819289895', '2026-02-07', '估值框架', '脱离增速、兑现和叙事阶段，单纯估值指标意义有限。'),
        ],
      },
      assets: {
        title: '落到龙头和卡脖子环节',
        body: '资产不按传统行业切，而按产业链位置切：底层算力、存储、CPU、电力、企业 AI 和软件定义硬件。',
        bullets: ['MU/HBM 和存储周期', 'AMD/INTC 的 CPU 紧缺', 'BB/IBM 的软件与企业 AI'],
        evidence: [
          tweet('2015377625167089671', '2026-01-25', '美光', '存储厂商业绩确定性、需求强、克制扩产。'),
          tweet('2027238317323137395', '2026-02-27', '英伟达财报', 'AI 算力链上的卡点继续被财报验证。'),
          tweet('2051838078420242854', '2026-05-06', 'BB/QNX', '黑莓从手机硬件转向 QNX 软件业务。'),
          tweet('2059802180379656378', '2026-05-28', 'BB 机器人', '机器人瓶颈从硬件转向软件架构与集成。'),
        ],
      },
      verification: {
        title: '看短缺和商业化是否继续被验证',
        body: '验证不只看股价，也看 token 用量、云收入、capex 指引、紧缺环节是否继续扩散。',
        bullets: ['API token 消耗加速', '算力短缺临界点', 'CPU/800V 等新瓶颈出现'],
        evidence: [
          tweet('2043910896351883636', '2026-04-14', '算力紧缺', 'API token 用量不到半年增长 2.5 倍，算力进入临界点。'),
          tweet('2045031360004558969', '2026-04-17', 'CPU 验证', 'CPU 紧缺成为 Agentic AI 的新增瓶颈。'),
          tweet('2057739575372706022', '2026-05-22', '电力验证', '800V HVDC 成为 AI 数据中心电力关键环节。'),
        ],
      },
    },
  },
  {
    id: 'crypto',
    label: '加密金融化',
    eyebrow: 'CRYPTO FINANCIALIZATION',
    thesis: '不把加密当纯投机，而是看稳定币、RWA、美股代币化和交易入口重构。',
    question: '加密是否从叙事资产，变成传统金融资产上链和交易入口迁移的基础设施？',
    assets: ['HOOD', 'COIN', 'CRCL', 'MSTR', 'USDC', 'BTC'],
    steps: {
      trend: {
        title: '加密从原生叙事转向金融基建',
        body: '核心变化不是山寨币轮动，而是稳定币、监管框架和传统资产上链。',
        bullets: ['稳定币法案', '美股代币化', 'RWA 进入主流交易所'],
        evidence: [
          tweet('1945825731793322468', '2025-07-17', '认知迭代', '梳理稳定币法案、币股融合和加密产业发展。'),
          tweet('2026602891998539876', '2026-02-25', '代币化股票', '交易所全面拥抱代币化股票，RWA 进入新阶段。'),
        ],
      },
      mechanism: {
        title: '监管放松与入口变化推动资产上链',
        body: '稳定币提供结算层，交易所和券商争夺入口，美股代币化把传统资产接入 24/7 市场。',
        bullets: ['USDC/稳定币支付', '美股 24 小时交易', '币股无缝切换'],
        evidence: [
          tweet('2026602891998539876', '2026-02-25', '链上美股', '币安、Coinbase、OKX 等推进美股代币化。'),
          tweet('1926526254494150796', '2025-05-25', 'HOOD 加密入口', 'Robinhood 同时占据美股和加密两大资产品类。'),
        ],
      },
      pricing: {
        title: '成熟市场会更分化，而不是普涨',
        body: '币市虚无化不是单纯流动性问题，而是创新不足、一级市场估值和有效市场分化共同作用。',
        bullets: ['山寨币出清', '有效市场分化', '价值落地优先'],
        evidence: [
          tweet('1886233764197736751', '2025-02-03', '山寨分化', '小币问题深层原因不是流动性，而是创新和估值结构。'),
          tweet('1997561492909298132', '2025-12-07', '虚无化', '币市进入新常态，市场越成熟越分化。'),
        ],
      },
      assets: {
        title: '落到合规入口和金融基础设施',
        body: '重点不是所有币，而是能承接交易、结算、资产上链和用户入口的公司。',
        bullets: ['HOOD 的美股/加密双入口', 'COIN 的合规交易所位置', 'CRCL/USDC 的稳定币层'],
        evidence: [
          tweet('1918556140264153535', '2025-05-03', 'HOOD vs COIN', '从三五年周期比较 HOOD 与 COIN 的市值空间。'),
          tweet('2044758715967156502', '2026-04-16', 'HOOD 财富管理', 'Robinhood 长远在财富管理，当下在预测市场。'),
          tweet('2060388312033182068', '2026-05-29', 'Agentic Trading', 'HOOD 推出 Agentic Trading 与特朗普账户事件驱动。'),
        ],
      },
      verification: {
        title: '看代币化是否扩大到传统资产',
        body: '验证点是美股、港股、ETF 和稳定币支付能否进入更多真实交易场景。',
        bullets: ['交易所上线代币化股票', '稳定币交易传统资产', 'HOOD 继续扩入口'],
        evidence: [
          tweet('2034096333314003072', '2026-03-18', '港股代币化', '用稳定币直接交易港股和韩国资产的尝试出现。'),
          tweet('2026602891998539876', '2026-02-25', '美股代币化', '加密交易所全面拥抱代币化股票。'),
          tweet('2060388312033182068', '2026-05-29', 'HOOD 验证', '加密低迷时 HOOD 仍受新业务事件驱动。'),
        ],
      },
    },
  },
  {
    id: 'macro',
    label: '宏观政经周期',
    eyebrow: 'MACRO POLITICAL ECONOMY',
    thesis: '把市场放进财政、货币、地缘、关税和政治约束的组合里，而不是只看 Fed 点阵图。',
    question: '流动性和政策节奏怎么影响风险资产，什么时候只是小级别杀估值，什么时候升级为大风险？',
    assets: ['QQQ', 'SPY', 'EWY', 'IEF', 'UUP', 'HOOD'],
    steps: {
      trend: {
        title: '财政扩张与地缘政治重塑风险偏好',
        body: '市场不只由货币政策决定，财政扩张、关税、地缘和美国政治约束会共同改变节奏。',
        bullets: ['财政扩张 2.0', '有限度宽松', '中美博弈与地缘风险'],
        evidence: [
          tweet('1947143450492608947', '2025-07-21', '财政扩张 2.0', '从财政扩张 2.0 梳理几个月市场走势。'),
          tweet('1984964367629025321', '2025-11-02', '中美博弈', '中美博弈进入战略相持与 G2 成形。'),
          tweet('2044677096526741639', '2026-04-16', '地缘推演', '地缘博弈要看传导路径和市场影响。'),
        ],
      },
      mechanism: {
        title: '流动性通过准备金、TGA、SLR 传导',
        body: '宏观不是口号，而是看银行准备金、回购压力、TGA 抽放水、SLR 约束和购债重启可能性。',
        bullets: ['准备金临界点', 'SLR 解绑', '购债扩表包装与实质'],
        evidence: [
          tweet('1991005823351611431', '2025-11-19', '流动性临界', '准备金回落到充裕但不过剩的临界点。'),
          tweet('1998238044877647882', '2025-12-09', 'SLR 规则', 'SLR 最终规则与生效时间影响美债做市能力。'),
          tweet('2018129302114689163', '2026-02-02', '政策节奏', '政策节奏比政策主张对市场影响更大。'),
        ],
      },
      pricing: {
        title: '市场调整先分级，再分三杀',
        body: '先定小/中/大级别，再判断是杀估值、杀业绩还是杀逻辑；不是所有下跌都是系统性崩盘。',
        bullets: ['小级别约 10%', '中级别 15%-20%', '大级别 25%-30%+', '杀逻辑最致命'],
        evidence: [
          tweet('1895270832156614924', '2025-02-28', '调整分级', '用过去二十年美股调整幅度定义小/中/大级别。'),
          tweet('1986487386763886825', '2025-11-06', '三杀框架', '一波调整核心是杀估值，而非整体崩盘。'),
          tweet('1986633517087007159', '2025-11-07', '三杀展开', '杀估值、杀业绩、杀逻辑的完整拆解。'),
          tweet('1984556367093395469', '2025-11-01', '大顶条件', '基本面主导市场的大顶需要产业叙事破或宏观大危机。'),
        ],
      },
      assets: {
        title: '落到指数、区域资产和高弹性行业',
        body: '宏观主线不直接等于某个股票，而是影响指数、利率、美元、韩国/存储链和高弹性风险资产。',
        bullets: ['QQQ/SPY 的调整级别', 'EWY/韩国存储链', '美元与利率资产'],
        evidence: [
          tweet('2029074784429195357', '2026-03-04', 'EWY/韩国', '韩国股市与存储情绪、地缘风险叠加。'),
          tweet('1994216596479594609', '2025-11-28', '大盘节奏', '用几个维度研判美股大盘调整级别。'),
        ],
      },
      verification: {
        title: '用时间线回看节奏判断',
        body: '验证重点是主要矛盾是否识别正确：川普政策、Fed put、地缘谈判、流动性和财报季。',
        bullets: ['2025 年初阵风局', '春劫行情', '11 月杀估值调整', '伊朗谈判与反转'],
        evidence: [
          tweet('1899973508693975221', '2025-03-12', '年初调整清单', '汇总 2025 年初关于市场调整的一系列判断。'),
          tweet('1920992310780981284', '2025-05-10', '主要矛盾', '2-4 月下跌主驱动是川普政策冲击。'),
          tweet('1999693092446962158', '2025-12-13', '节奏复盘', '复盘 11 月以来对美股大盘节奏的判断。'),
          tweet('2041776052167483750', '2026-04-08', '春劫尾声', '伊朗谈判进入阶段后，市场恐慌不应再放大。'),
          tweet('2044580442704396782', '2026-04-16', '反转条件', '春劫反转后关注流动性、伊朗与一季度财报。'),
        ],
      },
    },
  },
];

export const VERIFICATION_CASES: VerificationCase[] = [
  {
    id: 'market-drawdown-scale',
    lineId: 'macro',
    date: '2025-02-28',
    title: '把调整先分级，再讨论牛熊',
    judgment: '纳指 -10% 左右是小级别，-15%-20% 是中级别，-25%-30% 以上才是大级别。',
    result: '这个分级后来成为 2025 年春季调整、11 月杀估值判断的底层尺子。',
    tickers: ['QQQ', 'SPY'],
    evidence: [tweet('1895270832156614924', '2025-02-28', '调整分级', '过去二十年美股调整幅度。')],
  },
  {
    id: 'november-valuation-reset',
    lineId: 'macro',
    date: '2025-11-28',
    title: '11 月调整被归为小级别杀估值',
    judgment: 'AI 主线未破、宏观没有大危机时，不应把情绪性调整直接解释成崩盘。',
    result: '后续复盘中，他把这段行情归入节奏判断相对清晰的一次杀估值调整。',
    tickers: ['QQQ', 'SPY'],
    evidence: [
      tweet('1994216596479594609', '2025-11-28', '小级别调整', '纳指最大跌幅 -8.8%，标普接近 6%。'),
      tweet('1999693092446962158', '2025-12-13', '节奏复盘', '复盘 11 月以来的美股节奏。'),
    ],
  },
  {
    id: 'compute-shortage',
    lineId: 'ai',
    date: '2026-04-14',
    title: '算力紧缺从 GPU 扩散到更多环节',
    judgment: 'Agent 普及会让 token 消耗快速增长，算力短缺不止是 GPU 单点问题。',
    result: '随后 CPU、800V HVDC、电力等瓶颈陆续进入他的跟踪框架。',
    tickers: ['NVDA', 'AMD', 'INTC', 'MU'],
    evidence: [
      tweet('2043910896351883636', '2026-04-14', '算力短缺', 'API token 用量不到半年增长 2.5 倍。'),
      tweet('2045031360004558969', '2026-04-17', 'CPU 紧缺', 'CPU 成为新的卡脖子环节。'),
      tweet('2057739575372706022', '2026-05-22', '800V HVDC', 'AI 数据中心电力关键环节。'),
    ],
  },
  {
    id: 'crypto-tokenization',
    lineId: 'crypto',
    date: '2026-02-25',
    title: '加密机会转向传统资产上链',
    judgment: '加密未来更可能在资产上链、传统真实资产结合和金融入口上出现大机会。',
    result: '美股代币化、港股代币化、券商与交易所入口成为后续验证点。',
    tickers: ['HOOD', 'COIN', 'CRCL'],
    evidence: [
      tweet('2026602891998539876', '2026-02-25', '美股代币化', '主流交易所拥抱代币化股票。'),
      tweet('2034096333314003072', '2026-03-18', '港股代币化', '稳定币交易港股与韩国资产。'),
    ],
  },
  {
    id: 'spring-risk-reversal',
    lineId: 'macro',
    date: '2026-04-16',
    title: '春劫行情反转后的条件清单',
    judgment: '伊朗问题、流动性和一季度云业务财报，是春劫反转后继续观察的关键条件。',
    result: '这类判断不是单点预测，而是把地缘、TGA、财报季放进同一个后续验证框架。',
    tickers: ['QQQ', 'SPY', 'GOOGL', 'MSFT', 'AMZN'],
    evidence: [
      tweet('2041776052167483750', '2026-04-08', '春劫尾声', '以打促谈和恐慌衰减。'),
      tweet('2044580442704396782', '2026-04-16', '反转条件', '春劫反转后的后续观察条件。'),
    ],
  },
];
