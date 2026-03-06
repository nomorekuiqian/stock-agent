'use client';

import { useState, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import FundamentalsReport from './FundamentalsReport';
import Image from 'next/image';
import ReactMarkdown from 'react-markdown';
import dynamic from 'next/dynamic';

const StockPriceChart = dynamic(
  () => import('@/components/StockPriceChart').then(mod => mod.StockPriceChart),
  { ssr: false, loading: () => <div className="h-[400px] bg-card animate-pulse rounded-lg" /> },
);
import { type StockAIAnalysis } from '@/components/StockAnalysisCard';
import { TechnicalSignalDashboard, type Timeframe } from '@/components/technical/TechnicalSignalDashboard';
import { TechnicalChart } from '@/components/technical/TechnicalChart';
import { TechnicalAnalysisContent } from '@/components/technical/TechnicalAnalysisContent';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import {
  useStockProfile,
  useStockDetail,
  usePriceHistory,
  useValuationComparison,
  useTechnicalSnapshot,
  useStockAnalysisCache,
  useGenerateStockAnalysis,
  useGenerateTechnicalAnalysis,
  useGenerateNewsAnalysis,
  useGenerateMacroAnalysis,
} from '@/hooks/queries/use-stock-data';

// =============================================================================
// Types
// =============================================================================

interface StockQuote {
  price: number | null;
  change: number | null;
  change_percent: number | null;
  market_cap: number | null;
  volume: number | null;
  week_52_high: number | null;
  week_52_low: number | null;
  pe_ratio: number | null;
  eps: number | null;
}

interface StockProfile {
  company_name: string;
  company_name_zh?: string;
  exchange?: string;
  classification?: {
    sector?: string;
    industry?: string;
  };
  description?: {
    en?: string;
    zh?: string;
  };
  company_details?: {
    ceo?: string;
    employees?: number;
    website?: string;
    country?: string;
    city?: string;
    address?: string;
    phone?: string;
    image?: string;
    state?: string;
    postal_code?: string;
    ipo_date?: string;
  };
}

interface StockFundamentals {
  ttm: {
    revenue?: number;
    net_income?: number;
    eps?: number;
    ebitda?: number;
    free_cash_flow?: number;
    operating_cash_flow?: number;
  };
  valuation: {
    pe?: number;
    ps?: number;
    pb?: number;
    ev_to_ebitda?: number;
    dividend_yield?: number;
    peg?: number;
  };
  growth: {
    revenue_yoy?: number;
    revenue_qoq?: number;
    net_income_yoy?: number;
  };
  profitability: {
    gross_margin?: number;
    operating_margin?: number;
    net_margin?: number;
    roe?: number;
    roa?: number;
  };
  balance_sheet?: {
    current_ratio?: number;
    quick_ratio?: number;
    debt_to_equity?: number;
    total_debt?: number;
    total_cash?: number;
  };
  market_data?: {
    beta?: number;
    short_ratio?: number;
    insider_ownership?: number;
    institutional_ownership?: number;
  };
}

interface QuarterlyData {
  period: string;
  fiscal_quarter?: string;
  fiscal_year?: number;
  income_statement?: {
    revenue?: number;
    gross_profit?: number;
    operating_income?: number;
    net_income?: number;
    eps?: number;
  };
  balance_sheet?: {
    total_assets?: number;
    total_liabilities?: number;
    total_equity?: number;
    cash_and_equivalents?: number;
  };
  cash_flow?: {
    operating_cash_flow?: number;
    free_cash_flow?: number;
  };
}

interface StockData {
  profile: StockProfile;
  quote: StockQuote;
  fundamentals: StockFundamentals;
  financials: {
    latest_quarter: string | null;
    quarters: QuarterlyData[];
  };
  meta: {
    symbol: string;
    quote_fetched_at: string;
    latest_quarter?: string;
  };
}

interface StockTechnicalAnalysis {
  title: string;
  trend_analysis: string;
  entry_exit_signals: string;
  pattern_analysis: string;
  technical_summary: string;
}

interface StockNewsAnalysis {
  title: string;
  news_summary: string;
  analyst_activity: string;
  upcoming_catalysts: string;
  sentiment_assessment: string;
}

interface StockMacroAnalysis {
  title: string;
  macro_impact: string;
  sector_positioning: string;
  market_regime: string;
  outlook_and_risks: string;
}

type AnalysisTab = 'fundamental' | 'technical' | 'news' | 'macro';

interface PriceHistoryData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Valuation Comparison Types
interface PeerMetrics {
  symbol: string;
  metrics: {
    pe_ratio?: number | null;
    pb_ratio?: number | null;
    ps_ratio?: number | null;
    ev_to_ebitda?: number | null;
    roe?: number | null;
    gross_margin?: number | null;
  };
}

interface ValuationComparisonData {
  success: boolean;
  symbol: string;
  industry?: string;
  sector?: string;
  peer_comparison: {
    symbol: string;
    company_metrics: {
      pe_ratio?: number | null;
      pb_ratio?: number | null;
      ps_ratio?: number | null;
      ev_to_ebitda?: number | null;
      roe?: number | null;
      gross_margin?: number | null;
    };
    peers: PeerMetrics[];
  };
  industry_valuation: {
    industry?: string;
    industry_pe?: number | null;
    sector?: string;
    sector_pe?: number | null;
  };
  historical_valuation: {
    years?: Array<{
      year: string;
      date?: string;
      pe?: number | null;
      pb?: number | null;
      ps?: number | null;
      ev_to_ebitda?: number | null;
      gross_margin?: number | null;
      net_margin?: number | null;
    }>;
    error?: string;
  };
}

// =============================================================================
// Metric Definitions with Explanations
// =============================================================================

const METRIC_EXPLANATIONS: Record<string, { zh: string; en: string; tip: string }> = {
  // Valuation
  pe: {
    zh: '市盈率 P/E',
    en: 'P/E',
    tip: '股价与每股收益的比值。较低的值可能意味着被低估，但需结合行业背景分析。',
  },
  ps: {
    zh: '市销率 P/S',
    en: 'P/S',
    tip: '股价与每股销售额的比值。适用于评估尚未盈利的成长型公司。',
  },
  pb: {
    zh: '市净率 P/B',
    en: 'P/B',
    tip: '股价与每股净资产的比值。低于 1 可能意味着被低估，常用于金融和重资产行业。',
  },
  ev_ebitda: {
    zh: 'EV/EBITDA',
    en: 'EV/EBITDA',
    tip: '企业价值与 EBITDA 的比值。排除资本结构影响，适合跨公司比较。',
  },
  peg: {
    zh: 'PEG',
    en: 'PEG',
    tip: '市盈率相对盈利增长比率。PEG < 1 可能被低估，> 2 可能被高估。',
  },
  dividend_yield: {
    zh: '股息率',
    en: 'Div Yield',
    tip: '年度股息与股价的比率。反映持有股票的现金回报，收益型投资者关注。',
  },
  // Growth
  revenue_yoy: {
    zh: '营收同比',
    en: 'Revenue YoY',
    tip: '营收同比增长率。正值表示增长，负值表示下降。',
  },
  net_income_yoy: {
    zh: '净利润同比',
    en: 'Net Income YoY',
    tip: '净利润同比增长率。反映盈利能力的变化趋势。',
  },
  revenue_qoq: {
    zh: '营收环比',
    en: 'Revenue QoQ',
    tip: '营收环比增长率。反映短期经营动能。',
  },
  // Profitability
  gross_margin: {
    zh: '毛利率',
    en: 'Gross Margin',
    tip: '毛利占营收的比例。反映基本盈利能力和定价能力。',
  },
  net_margin: {
    zh: '净利率',
    en: 'Net Margin',
    tip: '净利润占营收的比例。综合反映最终盈利水平。',
  },
  roe: {
    zh: 'ROE',
    en: 'ROE',
    tip: '净资产收益率。衡量利用股东权益创造利润的效率。',
  },
  roa: {
    zh: 'ROA',
    en: 'ROA',
    tip: '总资产收益率。衡量利用全部资产创造利润的效率。',
  },
  // TTM Metrics
  revenue: {
    zh: '营收',
    en: 'Revenue',
    tip: '核心业务总收入，衡量公司规模和增长的关键指标。',
  },
  net_income: {
    zh: '净利润',
    en: 'Net Income',
    tip: '扣除所有成本、费用和税款后的最终利润。',
  },
  ebitda: {
    zh: 'EBITDA',
    en: 'EBITDA',
    tip: '息税折旧摊销前利润。反映核心业务的现金创造能力。',
  },
  operating_cash_flow: {
    zh: '经营现金流',
    en: 'Operating Cash Flow',
    tip: '日常经营活动产生的现金。正值表示公司从经营中产生现金。',
  },
  free_cash_flow: {
    zh: '自由现金流',
    en: 'Free Cash Flow',
    tip: '经营现金流减去资本支出。可用于分红、回购或再投资。',
  },
  eps: {
    zh: 'EPS',
    en: 'EPS',
    tip: '每股收益，即净利润除以总股本。直接反映每股盈利水平。',
  },
  // Quote Metrics
  market_cap: {
    zh: '市值',
    en: 'Market Cap',
    tip: '股价乘以总股本。反映市场对公司总价值的评估。',
  },
  volume: {
    zh: '成交量',
    en: 'Volume',
    tip: '今日交易的股票数量。高成交量通常伴随显著的价格波动。',
  },
  // Balance Sheet
  current_ratio: {
    zh: '流动比率',
    en: 'Current Ratio',
    tip: '流动资产与流动负债的比值。> 1 表示短期偿债能力充足，< 1 需要关注短期资金压力。',
  },
  quick_ratio: {
    zh: '速动比率',
    en: 'Quick Ratio',
    tip: '扣除存货后的流动资产与流动负债的比值。比流动比率更严格的短期偿债能力指标。',
  },
  debt_to_equity: {
    zh: '负债/权益比',
    en: 'D/E Ratio',
    tip: '总负债与股东权益的比值。衡量公司的杠杆水平，越高风险越大。',
  },
  total_debt: {
    zh: '总负债',
    en: 'Total Debt',
    tip: '公司的总债务规模，包括短期和长期借款。',
  },
  total_cash: {
    zh: '现金储备',
    en: 'Total Cash',
    tip: '公司持有的现金及现金等价物总额。充足的现金储备是财务安全的保障。',
  },
  // Market Data
  beta: {
    zh: 'Beta',
    en: 'Beta',
    tip: '股票相对于大盘的波动率。Beta > 1 表示比大盘波动更大，< 1 表示更稳定。',
  },
  short_ratio: {
    zh: '做空比率',
    en: 'Short Ratio',
    tip: '做空股数与日均成交量的比值。高比率可能暗示市场看空情绪，但也可能引发轧空。',
  },
  insider_ownership: {
    zh: '内部人持股',
    en: 'Insider Own',
    tip: '公司高管和董事持有的股份比例。较高的内部人持股通常被视为管理层信心的信号。',
  },
  institutional_ownership: {
    zh: '机构持股',
    en: 'Inst. Own',
    tip: '机构投资者持有的股份比例。高机构持股表示专业投资者认可公司质量。',
  },
};

// =============================================================================
// Sector/Industry Translations
// =============================================================================

const SECTOR_TRANSLATIONS: Record<string, string> = {
  'Technology': '科技',
  'Healthcare': '医疗保健',
  'Financial Services': '金融服务',
  'Consumer Cyclical': '可选消费',
  'Consumer Defensive': '必需消费',
  'Industrials': '工业',
  'Energy': '能源',
  'Utilities': '公用事业',
  'Real Estate': '房地产',
  'Basic Materials': '基础材料',
  'Communication Services': '通信服务',
};

const INDUSTRY_TRANSLATIONS: Record<string, string> = {
  // Technology
  'Consumer Electronics': '消费电子',
  'Software - Infrastructure': '基础软件',
  'Software - Application': '应用软件',
  'Semiconductors': '半导体',
  'Semiconductor Equipment & Materials': '半导体设备与材料',
  'Information Technology Services': '信息技术服务',
  'Electronic Components': '电子元器件',
  'Computer Hardware': '计算机硬件',
  'Scientific & Technical Instruments': '科学技术仪器',
  // Internet & Media
  'Internet Content & Information': '互联网内容与信息',
  'Internet Retail': '互联网零售',
  'Electronic Gaming & Multimedia': '电子游戏与多媒体',
  'Entertainment': '娱乐',
  'Advertising Agencies': '广告代理',
  // Financial
  'Banks - Diversified': '综合银行',
  'Banks - Regional': '区域银行',
  'Capital Markets': '资本市场',
  'Insurance - Diversified': '综合保险',
  'Credit Services': '信贷服务',
  'Asset Management': '资产管理',
  'Financial Data & Stock Exchanges': '金融数据与交易所',
  // Healthcare
  'Drug Manufacturers - General': '制药 - 综合',
  'Drug Manufacturers - Specialty & Generic': '制药 - 专科与仿制药',
  'Biotechnology': '生物技术',
  'Medical Devices': '医疗器械',
  'Healthcare Plans': '医疗保险',
  'Diagnostics & Research': '诊断与研究',
  // Consumer
  'Restaurants': '餐饮',
  'Specialty Retail': '专业零售',
  'Home Improvement Retail': '家居建材零售',
  'Apparel Retail': '服装零售',
  'Auto Manufacturers': '汽车制造',
  'Leisure': '休闲',
  'Beverages - Non-Alcoholic': '非酒精饮料',
  'Packaged Foods': '包装食品',
  'Household & Personal Products': '家居与个人用品',
  'Discount Stores': '折扣店',
  // Industrial
  'Aerospace & Defense': '航空航天与国防',
  'Farm & Heavy Construction Machinery': '农业与重型工程机械',
  'Railroads': '铁路',
  'Airlines': '航空',
  'Trucking': '货运',
  'Integrated Freight & Logistics': '综合货运与物流',
  // Energy
  'Oil & Gas Integrated': '综合油气',
  'Oil & Gas E&P': '油气勘探与生产',
  'Oil & Gas Midstream': '油气中游',
  'Oil & Gas Refining & Marketing': '油气炼化与销售',
  // Telecom
  'Telecom Services': '电信服务',
  // Utilities
  'Utilities - Regulated Electric': '受监管电力',
  'Utilities - Diversified': '综合公用事业',
};

function translateSector(sector: string | undefined): string {
  if (!sector) return '';
  return SECTOR_TRANSLATIONS[sector] || sector;
}

function translateIndustry(industry: string | undefined): string {
  if (!industry) return '';
  return INDUSTRY_TRANSLATIONS[industry] || industry;
}

// =============================================================================
// Utility Functions
// =============================================================================

export function formatNumber(value: number | null | undefined, options?: {
  style?: 'currency' | 'percent' | 'decimal';
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  compact?: boolean;
}): string {
  if (value === null || value === undefined) return '--';

  const { style = 'decimal', minimumFractionDigits = 0, maximumFractionDigits = 2, compact = false } = options || {};

  if (style === 'percent') {
    return `${(value * 100).toFixed(1)}%`;
  }

  if (style === 'currency') {
    if (compact && Math.abs(value) >= 1e12) {
      return `$${(value / 1e12).toFixed(2)}T`;
    }
    if (compact && Math.abs(value) >= 1e9) {
      return `$${(value / 1e9).toFixed(2)}B`;
    }
    if (compact && Math.abs(value) >= 1e6) {
      return `$${(value / 1e6).toFixed(2)}M`;
    }
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits,
      maximumFractionDigits,
    }).format(value);
  }

  if (compact && Math.abs(value) >= 1e9) {
    return `${(value / 1e9).toFixed(2)}B`;
  }
  if (compact && Math.abs(value) >= 1e6) {
    return `${(value / 1e6).toFixed(2)}M`;
  }

  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(value);
}

export function formatQuarter(dateStr: string, fiscalQuarter?: string, fiscalYear?: number): string {
  if (!dateStr) return '--';
  const date = new Date(dateStr);
  if (fiscalQuarter && fiscalYear) {
    return `FY${fiscalYear} ${fiscalQuarter}`;
  }
  if (fiscalQuarter) {
    return `${date.getFullYear()} ${fiscalQuarter}`;
  }
  const month = date.getMonth();
  const quarter = Math.floor(month / 3) + 1;
  return `${date.getFullYear()} Q${quarter}`;
}

// =============================================================================
// Components
// =============================================================================

export function Tooltip({ content, children }: { content: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLSpanElement>(null);

  const handleMouseEnter = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPosition({
        top: rect.top - 8,
        left: rect.left + rect.width / 2,
      });
    }
    setShow(true);
  };

  return (
    <span
      ref={triggerRef}
      className="inline-flex items-center"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <span
          className="fixed px-3 py-2 text-xs text-foreground bg-card border border-border rounded-lg shadow-xl w-56 leading-relaxed -translate-x-1/2 -translate-y-full pointer-events-none"
          style={{ top: position.top, left: position.left, zIndex: 9999 }}
        >
          {content}
          <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-border" />
        </span>
      )}
    </span>
  );
}

export function MetricLabel({ metricKey }: { metricKey: string }) {
  const metric = METRIC_EXPLANATIONS[metricKey];
  if (!metric) return null;

  return (
    <Tooltip content={metric.tip}>
      <span className="flex items-center gap-1.5 cursor-help">
        <span className="text-foreground/90 font-medium">{metric.zh}</span>
        <svg className="w-3.5 h-3.5 text-muted-foreground/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </span>
    </Tooltip>
  );
}

const TREND_COLORS = {
  up: 'text-emerald-400',
  down: 'text-red-400',
  neutral: 'text-foreground',
} as const;

export function MetricCard({ metricKey, value, trend }: {
  metricKey: string;
  value: string;
  trend?: 'up' | 'down' | 'neutral';
}) {
  return (
    <div className="p-3 bg-card/40 rounded-lg border border-border/40 hover:border-border/60 transition-colors">
      <div className="text-sm mb-1.5">
        <MetricLabel metricKey={metricKey} />
      </div>
      <div className={`font-data text-lg font-semibold ${trend ? TREND_COLORS[trend] : 'text-foreground'}`}>
        {value}
      </div>
    </div>
  );
}

export function StatRow({ metricKey, value, trend }: {
  metricKey: string;
  value: string;
  trend?: 'up' | 'down' | 'neutral';
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border/25 last:border-0">
      <span className="text-sm">
        <MetricLabel metricKey={metricKey} />
      </span>
      <span className={`font-data text-base font-semibold ${trend ? TREND_COLORS[trend] : 'text-foreground'}`}>
        {value}
      </span>
    </div>
  );
}

export function FinancialsTable({ quarters }: { quarters: QuarterlyData[] }) {
  if (!quarters || quarters.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground">
        <svg className="w-6 h-6 mx-auto mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="text-xs">暂无财务数据</p>
      </div>
    );
  }

  // Sort quarters by date (newest first)
  const sortedQuarters = [...quarters].sort((a, b) => {
    const dateA = new Date(a.period);
    const dateB = new Date(b.period);
    return dateB.getTime() - dateA.getTime();
  });

  const metrics = [
    { key: 'revenue', zh: '营收', en: 'Revenue', getter: (q: QuarterlyData) => q.income_statement?.revenue },
    { key: 'gross_profit', zh: '毛利润', en: 'Gross Profit', getter: (q: QuarterlyData) => q.income_statement?.gross_profit },
    { key: 'operating_income', zh: '营业利润', en: 'Op. Income', getter: (q: QuarterlyData) => q.income_statement?.operating_income },
    { key: 'net_income', zh: '净利润', en: 'Net Income', getter: (q: QuarterlyData) => q.income_statement?.net_income },
    { key: 'eps', zh: 'EPS', en: 'EPS', getter: (q: QuarterlyData) => q.income_statement?.eps },
    { key: 'fcf', zh: '自由现金流', en: 'FCF', getter: (q: QuarterlyData) => q.cash_flow?.free_cash_flow },
  ];

  return (
    <div className="relative">
      {/* Mobile scroll hint */}
      <div className="sm:hidden flex items-center justify-end gap-1 text-xs text-muted-foreground/60 mb-2">
        <span>左右滑动查看</span>
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
      </div>
      <div className="overflow-x-auto -mx-4">
        <table className="w-full text-sm min-w-[400px]">
          <thead>
            <tr className="border-b border-border/30">
              <th className="text-left py-3 px-4 text-foreground/80 font-medium w-24 sm:w-auto">
                <span>指标</span>
              </th>
              {sortedQuarters.slice(0, 4).map((q, i) => (
                <th key={i} className="text-right py-3 px-3 text-foreground/70 font-medium whitespace-nowrap font-data">
                  {formatQuarter(q.period, q.fiscal_quarter, q.fiscal_year)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="font-data">
            {metrics.map(({ key, zh, getter }) => (
              <tr key={key} className="border-b border-border/20 hover:bg-card/30 transition-colors">
                <td className="py-3 px-4 whitespace-nowrap">
                  <span className="text-foreground/80 font-medium">{zh}</span>
                </td>
                {sortedQuarters.slice(0, 4).map((q, i) => (
                  <td key={i} className="text-right py-3 px-3 text-foreground whitespace-nowrap">
                    {key === 'eps'
                      ? formatNumber(getter(q), { style: 'currency', maximumFractionDigits: 2 })
                      : formatNumber(getter(q), { style: 'currency', compact: true })
                    }
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SubsectionHeader({ title, titleEn }: {
  title: string;
  titleEn: string;
}) {
  return (
    <h3 className="flex items-center gap-2 text-sm font-medium uppercase tracking-wide mb-3">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400/80 light:bg-amber-600" />
      <span className="text-amber-400 light:text-amber-700">{title}</span>
      <span className="text-muted-foreground/70 light:text-muted-foreground font-normal normal-case">{titleEn}</span>
    </h3>
  );
}

export function MarkdownContent({ content, className = '' }: { content: string; className?: string }) {
  return (
    <div className={`max-w-none ${className}`}>
      <ReactMarkdown
        components={{
          // Heading styles - more prominent with better hierarchy
          h1: ({ children }) => (
            <h4 className="text-base font-semibold text-foreground mt-5 mb-3 first:mt-0 pb-2 border-b border-border/30">
              {children}
            </h4>
          ),
          h2: ({ children }) => (
            <h5 className="text-sm font-semibold text-foreground mt-4 mb-2 first:mt-0">
              {children}
            </h5>
          ),
          h3: ({ children }) => (
            <h6 className="text-sm font-medium text-foreground mt-3 mb-2">
              {children}
            </h6>
          ),
          // Paragraph styles - better readability
          p: ({ children }) => (
            <p className="text-sm text-foreground/80 leading-relaxed mb-3 last:mb-0">
              {children}
            </p>
          ),
          // Strong/bold text - used as inline headers in AI content
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">
              {children}
            </strong>
          ),
          // List styles - proper indentation and spacing
          ul: ({ children }) => (
            <ul className="pl-4 space-y-2 my-3 border-l-2 border-border/40">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal pl-5 space-y-2 my-3">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="text-sm text-foreground/80 leading-relaxed pl-2">
              {children}
            </li>
          ),
          // Code styles - for financial terms like P/E, ROE
          code: ({ children }) => (
            <code className="font-data text-amber-400 bg-amber-500/15 px-1.5 py-0.5 rounded text-xs font-medium">
              {children}
            </code>
          ),
          // Horizontal rule
          hr: () => <hr className="my-4 border-border/30" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export function SectionCard({ title, titleEn, children, className = '', action, numberLabel }: {
  title: string;
  titleEn: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
  numberLabel?: string;
}) {
  return (
    <div className={`bg-card/50 border border-border/40 rounded-xl overflow-hidden ${className}`}>
      <div className="px-6 py-5 border-b border-border/30 bg-card/40">
        <div className="flex items-center justify-between">
          <div>
            {numberLabel && (
              <p className="font-data text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-500/60 light:text-emerald-600/70 mb-1.5">
                Section {numberLabel}
              </p>
            )}
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2.5">
              <div className="w-1 h-5 bg-emerald-500 rounded-full" />
              <span>{title}</span>
              <span className="text-muted-foreground/60 text-sm font-normal">{titleEn}</span>
            </h2>
          </div>
          {action}
        </div>
      </div>
      <div className="px-6 py-6">
        {children}
      </div>
    </div>
  );
}

export function ValuationComparisonSection({
  data,
  loading,
  currentValuation,
}: {
  data: ValuationComparisonData | null;
  loading: boolean;
  currentValuation?: { pe?: number; pb?: number; ps?: number; ev_to_ebitda?: number; dividend_yield?: number; peg?: number };
}) {
  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-24 bg-muted rounded-lg" />
        <div className="h-32 bg-muted rounded-lg" />
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const { industry_valuation, historical_valuation, peer_comparison } = data;

  // Helper to format valuation number
  const formatVal = (val: number | null | undefined): string => {
    if (val === null || val === undefined) return '--';
    return val.toFixed(1);
  };

  // Helper to determine trend color (handles null, undefined, and zero benchmark)
  const getValuationTrend = (current: number | null | undefined, benchmark: number | null | undefined): 'premium' | 'discount' | 'neutral' => {
    if (current == null || benchmark == null || benchmark === 0) return 'neutral';
    const diff = (current - benchmark) / benchmark;
    if (diff > 0.1) return 'premium';
    if (diff < -0.1) return 'discount';
    return 'neutral';
  };

  const trendColors = {
    premium: 'text-amber-400',
    discount: 'text-emerald-400',
    neutral: 'text-foreground',
  };

  const trendLabels = {
    premium: '溢价',
    discount: '折价',
    neutral: '持平',
  };

  // Get years data for historical valuation
  const years = historical_valuation?.years || [];
  const currentPE = currentValuation?.pe ?? years[0]?.pe;

  return (
    <div className="space-y-6">
      {/* Historical Valuation - By Year */}
      {years.length > 0 && (
        <div>
          <SubsectionHeader title="历史估值" titleEn="Historical Valuation" />
          <div className="overflow-x-auto -mx-4">
            <table className="w-full text-sm min-w-[400px]">
              <thead>
                <tr className="border-b border-border/30">
                  <th className="text-left py-3 px-4 text-foreground/80 font-medium">指标</th>
                  {years.slice(0, 5).map((y, i) => (
                    <th key={y.year} className={`text-right py-3 px-3 font-medium font-data ${i === 0 ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {y.year}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="font-data">
                <tr className="border-b border-border/20 hover:bg-card/30 transition-colors">
                  <td className="py-3 px-4 text-foreground/80 font-medium">P/E</td>
                  {years.slice(0, 5).map((y, i) => (
                    <td key={y.year} className={`text-right py-3 px-3 ${i === 0 ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                      {formatVal(y.pe)}
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-border/20 hover:bg-card/30 transition-colors">
                  <td className="py-3 px-4 text-foreground/80 font-medium">P/B</td>
                  {years.slice(0, 5).map((y, i) => (
                    <td key={y.year} className={`text-right py-3 px-3 ${i === 0 ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                      {formatVal(y.pb)}
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-border/20 hover:bg-card/30 transition-colors">
                  <td className="py-3 px-4 text-foreground/80 font-medium">P/S</td>
                  {years.slice(0, 5).map((y, i) => (
                    <td key={y.year} className={`text-right py-3 px-3 ${i === 0 ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                      {formatVal(y.ps)}
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-border/20 hover:bg-card/30 transition-colors">
                  <td className="py-3 px-4 text-foreground/80 font-medium">EV/EBITDA</td>
                  {years.slice(0, 5).map((y, i) => (
                    <td key={y.year} className={`text-right py-3 px-3 ${i === 0 ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                      {formatVal(y.ev_to_ebitda)}
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-border/20 hover:bg-card/30 transition-colors">
                  <td className="py-3 px-4 text-foreground/80 font-medium">毛利率</td>
                  {years.slice(0, 5).map((y, i) => (
                    <td key={y.year} className={`text-right py-3 px-3 ${i === 0 ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                      {y.gross_margin ? `${y.gross_margin}%` : '--'}
                    </td>
                  ))}
                </tr>
                <tr className="hover:bg-card/30 transition-colors">
                  <td className="py-3 px-4 text-foreground/80 font-medium">净利率</td>
                  {years.slice(0, 5).map((y, i) => (
                    <td key={y.year} className={`text-right py-3 px-3 ${i === 0 ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                      {y.net_margin ? `${y.net_margin}%` : '--'}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Industry Comparison */}
      {(industry_valuation?.industry_pe || industry_valuation?.sector_pe) && (
        <div>
          <SubsectionHeader title="行业对比" titleEn="Industry Comparison" />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {/* Sector P/E */}
            {industry_valuation.sector_pe && (
              <div className="p-3 bg-card/40 rounded-lg border border-border/40 hover:border-border/60 transition-colors">
                <div className="text-sm mb-1.5">
                  <span className="text-foreground/90 font-medium">板块 P/E</span>
                </div>
                <div className="font-data text-lg font-semibold text-foreground">
                  {formatVal(industry_valuation.sector_pe)}
                </div>
                <div className="text-xs text-muted-foreground mt-1 truncate">
                  {industry_valuation.sector}
                </div>
                {currentPE && (
                  <div className={`text-xs mt-1 font-data ${trendColors[getValuationTrend(currentPE, industry_valuation.sector_pe)]}`}>
                    vs {formatVal(currentPE)} ({trendLabels[getValuationTrend(currentPE, industry_valuation.sector_pe)]})
                  </div>
                )}
              </div>
            )}
            {/* Industry P/E */}
            {industry_valuation.industry_pe && (
              <div className="p-3 bg-card/40 rounded-lg border border-border/40 hover:border-border/60 transition-colors">
                <div className="text-sm mb-1.5">
                  <span className="text-foreground/90 font-medium">行业 P/E</span>
                </div>
                <div className="font-data text-lg font-semibold text-foreground">
                  {formatVal(industry_valuation.industry_pe)}
                </div>
                <div className="text-xs text-muted-foreground mt-1 truncate">
                  {industry_valuation.industry}
                </div>
                {currentPE && (
                  <div className={`text-xs mt-1 font-data ${trendColors[getValuationTrend(currentPE, industry_valuation.industry_pe)]}`}>
                    vs {formatVal(currentPE)} ({trendLabels[getValuationTrend(currentPE, industry_valuation.industry_pe)]})
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Peer Comparison */}
      {peer_comparison?.peers && peer_comparison.peers.length > 0 && (
        <div>
          <SubsectionHeader title="同行对比" titleEn="Peer Comparison" />
          <div className="overflow-x-auto -mx-4">
            <table className="w-full text-sm min-w-[400px]">
              <thead>
                <tr className="border-b border-border/30">
                  <th className="text-left py-3 px-4 text-foreground/80 font-medium">公司</th>
                  <th className="text-right py-3 px-3 text-foreground/70 font-medium">P/E</th>
                  <th className="text-right py-3 px-3 text-foreground/70 font-medium">P/B</th>
                  <th className="text-right py-3 px-3 text-foreground/70 font-medium">ROE</th>
                  <th className="text-right py-3 px-3 text-foreground/70 font-medium">毛利率</th>
                </tr>
              </thead>
              <tbody className="font-data">
                {/* Current company row */}
                <tr className="border-b border-border/30 bg-emerald-500/5">
                  <td className="py-3 px-4 font-medium text-emerald-400">{peer_comparison.symbol}</td>
                  <td className="text-right py-3 px-3 text-foreground">{formatVal(peer_comparison.company_metrics?.pe_ratio)}</td>
                  <td className="text-right py-3 px-3 text-foreground">{formatVal(peer_comparison.company_metrics?.pb_ratio)}</td>
                  <td className="text-right py-3 px-3 text-foreground">
                    {peer_comparison.company_metrics?.roe ? `${(peer_comparison.company_metrics.roe * 100).toFixed(1)}%` : '--'}
                  </td>
                  <td className="text-right py-3 px-3 text-foreground">
                    {peer_comparison.company_metrics?.gross_margin ? `${(peer_comparison.company_metrics.gross_margin * 100).toFixed(1)}%` : '--'}
                  </td>
                </tr>
                {/* Peer rows */}
                {peer_comparison.peers.slice(0, 5).map((peer) => (
                  <tr key={peer.symbol} className="border-b border-border/20 hover:bg-card/30 transition-colors">
                    <td className="py-3 px-4 text-muted-foreground">{peer.symbol}</td>
                    <td className="text-right py-3 px-3 text-muted-foreground">{formatVal(peer.metrics?.pe_ratio)}</td>
                    <td className="text-right py-3 px-3 text-muted-foreground">{formatVal(peer.metrics?.pb_ratio)}</td>
                    <td className="text-right py-3 px-3 text-muted-foreground">
                      {peer.metrics?.roe ? `${(peer.metrics.roe * 100).toFixed(1)}%` : '--'}
                    </td>
                    <td className="text-right py-3 px-3 text-muted-foreground">
                      {peer.metrics?.gross_margin ? `${(peer.metrics.gross_margin * 100).toFixed(1)}%` : '--'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function AnalysisTabBar({
  activeTab,
  onTabChange,
}: {
  activeTab: AnalysisTab;
  onTabChange: (tab: AnalysisTab) => void;
}) {
  const tabs: { id: AnalysisTab; label: string; labelEn: string; desc: string; color: string; activeBg: string }[] = [
    { id: 'fundamental', label: '基本面', labelEn: 'Fundamentals', desc: '财务 / 估值 / AI 投资分析', color: 'amber', activeBg: 'bg-amber-500/[0.07]' },
    { id: 'technical', label: '技术面', labelEn: 'Technical', desc: '趋势 / 信号 / AI 技术分析', color: 'emerald', activeBg: 'bg-emerald-500/[0.07]' },
    { id: 'news', label: '新闻面', labelEn: 'News', desc: '新闻 / 分析师 / 催化事件', color: 'blue', activeBg: 'bg-blue-500/[0.07]' },
    { id: 'macro', label: '宏观面', labelEn: 'Macro', desc: '宏观 / 板块 / 市场环境', color: 'violet', activeBg: 'bg-violet-500/[0.07]' },
  ];

  const colorMap: Record<string, { text: string; bar: string }> = {
    amber: { text: 'text-amber-400 light:text-amber-600', bar: 'bg-amber-500' },
    emerald: { text: 'text-emerald-400 light:text-emerald-600', bar: 'bg-emerald-500' },
    blue: { text: 'text-blue-400 light:text-blue-600', bar: 'bg-blue-500' },
    violet: { text: 'text-violet-400 light:text-violet-600', bar: 'bg-violet-500' },
  };

  return (
    <div className="grid grid-cols-4 rounded-xl overflow-hidden border border-border/40">
      {tabs.map((tab, i) => {
        const isActive = activeTab === tab.id;
        const colors = colorMap[tab.color];
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`relative px-3 py-3 text-left transition-all cursor-pointer ${
              i < tabs.length - 1 ? 'border-r border-border/40' : ''
            } ${isActive ? tab.activeBg : 'bg-card/30 hover:bg-card/60'}`}
          >
            {isActive && <div className={`absolute top-0 left-0 right-0 h-[2px] ${colors.bar}`} />}
            <div className={`text-sm font-semibold ${isActive ? colors.text : 'text-muted-foreground'}`}>
              {tab.label}
              <span className="ml-1 text-xs font-normal opacity-60 hidden sm:inline">{tab.labelEn}</span>
            </div>
            <div className="text-[11px] text-muted-foreground/50 mt-1 hidden sm:block">
              {tab.desc}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function AIAnalysisSection({
  analysis,
  loading,
  onGenerate,
  onRegenerate,
  technicalAnalysis,
  technicalLoading,
  onGenerateTechnical,
  onRegenerateTechnical,
  newsAnalysis,
  newsLoading,
  onGenerateNews,
  onRegenerateNews,
  macroAnalysis,
  macroLoading,
  onGenerateMacro,
  onRegenerateMacro,
  companyName,
  symbol,
  isAuthenticated,
  isPro,
  onLoginRequired,
  onUpgradeRequired,
  activeTab,
}: {
  analysis: StockAIAnalysis | null;
  loading: boolean;
  onGenerate: () => void;
  onRegenerate: () => void;
  technicalAnalysis: StockTechnicalAnalysis | null;
  technicalLoading: boolean;
  onGenerateTechnical: () => void;
  onRegenerateTechnical: () => void;
  newsAnalysis: StockNewsAnalysis | null;
  newsLoading: boolean;
  onGenerateNews: () => void;
  onRegenerateNews: () => void;
  macroAnalysis: StockMacroAnalysis | null;
  macroLoading: boolean;
  onGenerateMacro: () => void;
  onRegenerateMacro: () => void;
  companyName: string;
  symbol: string;
  isAuthenticated: boolean;
  isPro: boolean;
  onLoginRequired: () => void;
  onUpgradeRequired: () => void;
  activeTab: AnalysisTab;
}) {
  const analysisMap: Record<AnalysisTab, { data: unknown; loading: boolean; generate: () => void; regenerate: () => void }> = {
    fundamental: { data: analysis, loading, generate: onGenerate, regenerate: onRegenerate },
    technical: { data: technicalAnalysis, loading: technicalLoading, generate: onGenerateTechnical, regenerate: onRegenerateTechnical },
    news: { data: newsAnalysis, loading: newsLoading, generate: onGenerateNews, regenerate: onRegenerateNews },
    macro: { data: macroAnalysis, loading: macroLoading, generate: onGenerateMacro, regenerate: onRegenerateMacro },
  };

  const current = analysisMap[activeTab];
  const currentAnalysis = current.data;
  const currentLoading = current.loading;

  // TODO: temporarily bypass auth/pro check for dev
  const handleGenerateClick = () => {
    current.generate();
  };

  const handleRegenerateClick = () => {
    current.regenerate();
  };

  // State A: Not analyzed yet - show CTA
  if (!currentAnalysis && !currentLoading) {
    return (
      <div className="relative">
        <div className="relative bg-card/30 border border-border/50 rounded-xl overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/50 to-transparent" />
          <div className="px-6 py-8 md:px-10 md:py-10">
            <div className="max-w-2xl mx-auto text-center">
              <p className="text-xs uppercase tracking-[0.2em] text-amber-500/80 light:text-amber-600 mb-4">
                {{ fundamental: 'AI 投研', technical: 'AI 技术分析', news: 'AI 新闻分析', macro: 'AI 宏观分析' }[activeTab]}
              </p>
              <h3 className="font-editorial text-2xl md:text-3xl text-foreground mb-3 leading-tight">
                {{ fundamental: 'amber', technical: 'emerald', news: 'blue', macro: 'violet' }[activeTab] === 'amber' ? (
                  <>解锁 <span className="text-amber-400 light:text-amber-600">{symbol}</span> 深度洞察</>
                ) : { technical: 'emerald', news: 'blue', macro: 'violet' }[activeTab as 'technical' | 'news' | 'macro'] === 'emerald' ? (
                  <><span className="text-emerald-400 light:text-emerald-600">{symbol}</span> 技术面透视</>
                ) : activeTab === 'news' ? (
                  <><span className="text-blue-400 light:text-blue-600">{symbol}</span> 新闻速递</>
                ) : (
                  <><span className="text-violet-400 light:text-violet-600">{symbol}</span> 宏观环境</>
                )}
              </h3>
              <p className="text-sm md:text-base text-muted-foreground leading-relaxed mb-8 max-w-lg mx-auto">
                {{
                  fundamental: `为 ${companyName} 生成全面的基本面分析，涵盖财务体检、估值判断、催化剂与风险等维度。`,
                  technical: `分析 ${companyName} 的技术指标、趋势信号、支撑阻力位和图表形态。`,
                  news: `汇总 ${companyName} 近期新闻、分析师动态和即将到来的催化事件。`,
                  macro: `分析宏观环境、板块定位和市场状态对 ${companyName} 的影响。`,
                }[activeTab]}
              </p>
              <button
                onClick={handleGenerateClick}
                className="group inline-flex items-center gap-3 px-8 py-4 bg-foreground text-background font-medium rounded-lg transition-all hover:opacity-90"
              >
                {/* TODO: temporarily bypass auth/pro check for dev */}
                <>
                  <span>{{ fundamental: '生成分析报告', technical: '生成技术分析', news: '生成新闻简报', macro: '生成宏观分析' }[activeTab]}</span>
                  <svg className="w-4 h-4 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </>
              </button>
              {/* TODO: auth hints temporarily removed for dev */}
            </div>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border/50 to-transparent" />
        </div>
      </div>
    );
  }

  // State B: Loading - show progress
  if (currentLoading) {
    return (
      <div className="relative">
        <div className="relative bg-card/30 border border-border/50 rounded-xl overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/50 to-transparent" />
          <div className="px-6 py-10 md:px-10 md:py-12">
            <div className="max-w-md mx-auto text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 mb-6">
                <svg className="animate-spin w-8 h-8 text-amber-500/70" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
              <p className="text-sm text-muted-foreground">
                {{
                  fundamental: `正在分析 ${companyName}...`,
                  technical: `正在分析 ${symbol} 技术面...`,
                  news: `正在汇总 ${symbol} 新闻...`,
                  macro: `正在分析 ${symbol} 宏观环境...`,
                }[activeTab]}
              </p>
            </div>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border/50 to-transparent" />
        </div>
      </div>
    );
  }

  // State C: Analysis complete - show results
  if (!currentAnalysis) return null;

  return (
    <div className="relative">
      <div className="relative bg-card/50 border border-border/40 rounded-xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border/30 bg-card/40">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <div className={`w-1 h-5 rounded-full ${{ fundamental: 'bg-amber-500', technical: 'bg-emerald-500', news: 'bg-blue-500', macro: 'bg-violet-500' }[activeTab]}`} />
              <span>{{ fundamental: '投资分析', technical: '技术分析', news: '新闻分析', macro: '宏观分析' }[activeTab]}</span>
              <span className="text-muted-foreground text-sm font-normal font-data">{symbol}</span>
            </h2>
            <button
              onClick={handleRegenerateClick}
              disabled={currentLoading}
              className={`p-2 text-muted-foreground transition-colors disabled:opacity-50 ${{
                fundamental: 'hover:text-amber-400', technical: 'hover:text-emerald-400',
                news: 'hover:text-blue-400', macro: 'hover:text-violet-400',
              }[activeTab]}`}
              title="重新生成"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 space-y-6">
          {activeTab === 'fundamental' && analysis ? (
            <>
              {/* V5: 5-dimension layout (with V4 legacy fallback) */}
              {/* Dim 1: Company Profile */}
              {(analysis.company_profile || analysis.company_overview) && (
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-medium tracking-wide mb-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400/80" />
                    <span className="text-amber-400">公司画像</span>
                    <span className="text-muted-foreground/50 text-xs font-normal">Company Profile</span>
                  </h3>
                  <MarkdownContent content={analysis.company_profile || analysis.company_overview || ''} />
                </div>
              )}

              {/* Dim 2: Financial Health */}
              {(analysis.financial_health || analysis.financials_analysis) && (
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-medium tracking-wide mb-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/80" />
                    <span className="text-emerald-400">财务体检</span>
                    <span className="text-muted-foreground/50 text-xs font-normal">Financial Health</span>
                  </h3>
                  <MarkdownContent content={analysis.financial_health || analysis.financials_analysis || ''} />
                </div>
              )}

              {/* Dim 3: Valuation Judgment */}
              {(analysis.valuation_judgment || analysis.valuation_range || analysis.fundamentals_analysis) && (
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-medium tracking-wide mb-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400/80" />
                    <span className="text-blue-400">估值判断</span>
                    <span className="text-muted-foreground/50 text-xs font-normal">Valuation</span>
                  </h3>
                  <MarkdownContent content={analysis.valuation_judgment || analysis.valuation_range || analysis.fundamentals_analysis || ''} />
                </div>
              )}

              {/* Dim 4: Catalysts & Risks */}
              {(analysis.catalysts_and_risks || analysis.opportunities || analysis.risks) && (
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-medium tracking-wide mb-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-400/80" />
                    <span className="text-violet-400">催化剂与风险</span>
                    <span className="text-muted-foreground/50 text-xs font-normal">Catalysts & Risks</span>
                  </h3>
                  {analysis.catalysts_and_risks ? (
                    <MarkdownContent content={analysis.catalysts_and_risks} />
                  ) : (
                    <div className="grid md:grid-cols-2 gap-4">
                      {analysis.opportunities && <MarkdownContent content={analysis.opportunities} />}
                      {analysis.risks && <MarkdownContent content={analysis.risks} />}
                    </div>
                  )}
                </div>
              )}

              {/* Dim 5: Investment Summary */}
              {analysis.investment_summary && (
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-medium tracking-wide mb-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400/80" />
                    <span className="text-amber-400">投资总结</span>
                    <span className="text-muted-foreground/50 text-xs font-normal">Summary</span>
                  </h3>
                  <div className="p-4 bg-card/60 border border-border/40 rounded-lg">
                    <MarkdownContent content={analysis.investment_summary} />
                  </div>
                </div>
              )}
            </>
          ) : activeTab === 'technical' && technicalAnalysis ? (
            <>
              {/* Technical Summary - Most prominent */}
              {technicalAnalysis.technical_summary && (
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-medium tracking-wide mb-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/80" />
                    <span className="text-emerald-400">技术总结</span>
                    <span className="text-muted-foreground/50 text-xs font-normal">Summary</span>
                  </h3>
                  <div className="p-4 bg-card/60 border border-border/40 rounded-lg">
                    <TechnicalAnalysisContent content={technicalAnalysis.technical_summary} />
                  </div>
                </div>
              )}

              {/* Trend Analysis */}
              {technicalAnalysis.trend_analysis && (
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-medium tracking-wide mb-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/80" />
                    <span className="text-emerald-400">趋势分析</span>
                    <span className="text-muted-foreground/50 text-xs font-normal">Trend</span>
                  </h3>
                  <TechnicalAnalysisContent content={technicalAnalysis.trend_analysis} />
                </div>
              )}

              {/* Entry/Exit Signals */}
              {technicalAnalysis.entry_exit_signals && (
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-medium tracking-wide mb-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/80" />
                    <span className="text-emerald-400">关键价位</span>
                    <span className="text-muted-foreground/50 text-xs font-normal">Key Levels</span>
                  </h3>
                  <TechnicalAnalysisContent content={technicalAnalysis.entry_exit_signals} />
                </div>
              )}

              {/* Pattern Analysis */}
              {technicalAnalysis.pattern_analysis && (
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-medium tracking-wide mb-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/80" />
                    <span className="text-emerald-400">信号与风险</span>
                    <span className="text-muted-foreground/50 text-xs font-normal">Signals & Risk</span>
                  </h3>
                  <TechnicalAnalysisContent content={technicalAnalysis.pattern_analysis} />
                </div>
              )}
            </>
          ) : activeTab === 'news' && newsAnalysis ? (
            <>
              {newsAnalysis.news_summary && (
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-medium tracking-wide mb-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400/80" />
                    <span className="text-blue-400">新闻综述</span>
                    <span className="text-muted-foreground/50 text-xs font-normal">Headlines</span>
                  </h3>
                  <div className="p-4 bg-card/60 border border-border/40 rounded-lg">
                    <MarkdownContent content={newsAnalysis.news_summary} />
                  </div>
                </div>
              )}
              {newsAnalysis.analyst_activity && (
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-medium tracking-wide mb-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400/80" />
                    <span className="text-blue-400">分析师动态</span>
                    <span className="text-muted-foreground/50 text-xs font-normal">Analysts</span>
                  </h3>
                  <MarkdownContent content={newsAnalysis.analyst_activity} />
                </div>
              )}
              {newsAnalysis.upcoming_catalysts && (
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-medium tracking-wide mb-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400/80" />
                    <span className="text-blue-400">催化事件</span>
                    <span className="text-muted-foreground/50 text-xs font-normal">Catalysts</span>
                  </h3>
                  <MarkdownContent content={newsAnalysis.upcoming_catalysts} />
                </div>
              )}
              {newsAnalysis.sentiment_assessment && (
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-medium tracking-wide mb-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400/80" />
                    <span className="text-blue-400">情绪判断</span>
                    <span className="text-muted-foreground/50 text-xs font-normal">Sentiment</span>
                  </h3>
                  <div className="p-4 bg-blue-500/[0.04] border border-blue-500/20 rounded-lg">
                    <MarkdownContent content={newsAnalysis.sentiment_assessment} />
                  </div>
                </div>
              )}
            </>
          ) : activeTab === 'macro' && macroAnalysis ? (
            <>
              {macroAnalysis.macro_impact && (
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-medium tracking-wide mb-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-400/80" />
                    <span className="text-violet-400">宏观影响</span>
                    <span className="text-muted-foreground/50 text-xs font-normal">Macro Impact</span>
                  </h3>
                  <div className="p-4 bg-card/60 border border-border/40 rounded-lg">
                    <MarkdownContent content={macroAnalysis.macro_impact} />
                  </div>
                </div>
              )}
              {macroAnalysis.sector_positioning && (
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-medium tracking-wide mb-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-400/80" />
                    <span className="text-violet-400">板块定位</span>
                    <span className="text-muted-foreground/50 text-xs font-normal">Sector</span>
                  </h3>
                  <MarkdownContent content={macroAnalysis.sector_positioning} />
                </div>
              )}
              {macroAnalysis.market_regime && (
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-medium tracking-wide mb-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-400/80" />
                    <span className="text-violet-400">市场环境</span>
                    <span className="text-muted-foreground/50 text-xs font-normal">Regime</span>
                  </h3>
                  <MarkdownContent content={macroAnalysis.market_regime} />
                </div>
              )}
              {macroAnalysis.outlook_and_risks && (
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-medium tracking-wide mb-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-400/80" />
                    <span className="text-violet-400">前景与风险</span>
                    <span className="text-muted-foreground/50 text-xs font-normal">Outlook</span>
                  </h3>
                  <div className="p-4 bg-violet-500/[0.04] border border-violet-500/20 rounded-lg">
                    <MarkdownContent content={macroAnalysis.outlook_and_risks} />
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="animate-pulse space-y-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-muted rounded-xl" />
            <div className="flex-1 space-y-2">
              <div className="h-5 w-40 bg-muted rounded" />
              <div className="h-3 w-28 bg-muted rounded" />
            </div>
            <div className="text-right space-y-2">
              <div className="h-8 w-28 bg-muted rounded" />
              <div className="h-4 w-20 bg-muted rounded ml-auto" />
            </div>
          </div>
          <div className="h-64 bg-muted rounded-xl" />
          <div className="grid grid-cols-4 gap-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-20 bg-muted rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Main Page Component
// =============================================================================

export default function StockDetailContent({ symbol }: { symbol: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated } = useAuth();
  const { isPro, createCheckout } = useSubscription();

  // --- TanStack Query hooks (4 parallel data queries) ---
  const { data: quickProfile, isLoading: quickProfileLoading } = useStockProfile(symbol);
  const { data, isLoading: loading, error: detailError } = useStockDetail(symbol);
  const { data: priceHistory = [], isLoading: priceHistoryLoading } = usePriceHistory(symbol, 1825);
  const { data: valuationData, isLoading: valuationLoading } = useValuationComparison(symbol);

  const error = detailError ? (detailError instanceof Error ? detailError.message : 'Failed to load stock data') : null;

  // UI state
  const [logoError, setLogoError] = useState(false);

  // Auto-fetch cached analysis on page load
  const { data: cachedAnalysis, isLoading: cacheLoading } = useStockAnalysisCache(symbol);

  // AI Analysis mutations (for generate/regenerate)
  const analysisMutation = useGenerateStockAnalysis(symbol);
  const technicalMutation = useGenerateTechnicalAnalysis(symbol);
  const newsMutation = useGenerateNewsAnalysis(symbol);
  const macroMutation = useGenerateMacroAnalysis(symbol);

  // Use mutation result if available, otherwise fall back to cached data
  const analysis = (analysisMutation.data as StockAIAnalysis | null) ?? (cachedAnalysis as StockAIAnalysis | null) ?? null;
  const analysisLoading = analysisMutation.isPending || cacheLoading;

  // Technical Analysis state (separate per timeframe, kept local)
  const [dailyTechnicalAnalysis, setDailyTechnicalAnalysis] = useState<StockTechnicalAnalysis | null>(null);
  const [weeklyTechnicalAnalysis, setWeeklyTechnicalAnalysis] = useState<StockTechnicalAnalysis | null>(null);
  const technicalLoading = technicalMutation.isPending;

  // News & Macro analysis
  const newsAnalysis = (newsMutation.data as StockNewsAnalysis | null) ?? null;
  const newsLoading = newsMutation.isPending;
  const macroAnalysis = (macroMutation.data as StockMacroAnalysis | null) ?? null;
  const macroLoading = macroMutation.isPending;

  // Active analysis tab (synced from AIAnalysisSection to control chart)
  const [activeAnalysisTab, setActiveAnalysisTab] = useState<AnalysisTab>('fundamental');

  // Technical Snapshot (lazy-loaded on tab change)
  const [snapshotEnabled, setSnapshotEnabled] = useState(false);
  const { data: technicalSnapshot = null, isLoading: snapshotLoading } = useTechnicalSnapshot(symbol, snapshotEnabled);
  const [technicalTimeframe, setTechnicalTimeframe] = useState<Timeframe>('daily');

  // Redirect to login with current page as redirect target
  const handleLoginRequired = () => {
    const redirectUrl = encodeURIComponent(pathname);
    router.push(`/login?redirect=${redirectUrl}`);
  };

  const handleGenerateAnalysis = (force: boolean = false) => {
    analysisMutation.mutate({ force });
  };

  const handleGenerateTechnical = (force: boolean = false) => {
    technicalMutation.mutate(
      { force, timeframe: technicalTimeframe },
      {
        onSuccess: (result) => {
          if (result) {
            if (technicalTimeframe === 'daily') {
              setDailyTechnicalAnalysis(result as StockTechnicalAnalysis);
            } else {
              setWeeklyTechnicalAnalysis(result as StockTechnicalAnalysis);
            }
          }
        },
      }
    );
  };

  // Computed: current timeframe's technical analysis
  const technicalAnalysis = technicalTimeframe === 'daily' ? dailyTechnicalAnalysis : weeklyTechnicalAnalysis;

  // Handle analysis tab change (enable snapshot fetch on first technical tab visit)
  const handleAnalysisTabChange = (tab: AnalysisTab) => {
    setActiveAnalysisTab(tab);
    if (tab === 'technical' && !snapshotEnabled) {
      setSnapshotEnabled(true);
    }
  };

  const handleGenerateNews = (force: boolean = false) => {
    newsMutation.mutate({ force });
  };

  const handleGenerateMacro = (force: boolean = false) => {
    macroMutation.mutate({ force });
  };

  // Show full skeleton only if we have nothing to show yet
  if (loading && !quickProfile && quickProfileLoading) return <LoadingSkeleton />;

  // Use quick profile for immediate display, fall back to full data profile
  const displayProfile = data?.profile || quickProfile;

  if (error || (!loading && !data)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4 max-w-md px-6">
          <div className="w-14 h-14 mx-auto rounded-xl bg-red-500/10 flex items-center justify-center">
            <svg className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-lg font-medium text-foreground">无法加载股票数据</h2>
          <p className="text-sm text-muted-foreground">{error || `未找到 ${symbol} 的数据`}</p>
          <button
            onClick={() => router.back()}
            className="mt-2 px-5 py-2 bg-card border border-border rounded-lg text-sm font-medium hover:border-emerald-500/30 transition-all"
          >
            返回
          </button>
        </div>
      </div>
    );
  }

  // Extract data with fallbacks for progressive loading
  const profile = displayProfile;
  const quote = data?.quote;
  const fundamentals = data?.fundamentals;
  const financials = data?.financials;

  const priceChange = quote?.change_percent ?? 0;
  const isPositive = priceChange >= 0;
  const logoUrl = profile?.company_details?.image;

  // 52-week position is now calculated inside FundamentalsReport

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-5">

        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-5">
          <Link href="/" className="hover:text-emerald-400 transition-colors">首页</Link>
          <svg className="w-3 h-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <Link href="/stock" className="hover:text-emerald-400 transition-colors">个股调研</Link>
          <svg className="w-3 h-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-foreground">{symbol}</span>
        </nav>

        {/* ================================================================== */}
        {/* HEADER */}
        {/* ================================================================== */}
        <header className="mb-5">
          <div className="flex items-start gap-3">
            {/* Logo */}
            <div className="flex-shrink-0">
              {logoUrl && !logoError ? (
                <div className="w-12 h-12 rounded-xl bg-white p-1.5 shadow-md">
                  <Image
                    src={logoUrl}
                    alt={`${profile?.company_name || symbol} logo`}
                    width={48}
                    height={48}
                    className="w-full h-full object-contain"
                    onError={() => setLogoError(true)}
                  />
                </div>
              ) : (
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border border-emerald-500/20 flex items-center justify-center">
                  <span className="font-data font-bold text-emerald-400 text-base">
                    {symbol.slice(0, 2)}
                  </span>
                </div>
              )}
            </div>

            {/* Company Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 mb-1">
                <h1 className="text-lg sm:text-xl font-semibold text-foreground leading-tight truncate">
                  {profile?.company_name || symbol}
                </h1>
                <span className="flex-shrink-0 text-sm sm:text-base font-data font-medium text-muted-foreground">
                  {symbol}
                </span>
                {profile?.exchange && (
                  <span className="hidden sm:inline flex-shrink-0 text-sm font-normal text-muted-foreground/60">
                    {profile.exchange}
                  </span>
                )}
              </div>
              {profile?.classification?.sector && (
                <p className="text-xs sm:text-sm text-muted-foreground truncate">
                  {translateSector(profile.classification.sector)}
                  {profile.classification.industry && ` / ${translateIndustry(profile.classification.industry)}`}
                </p>
              )}
            </div>

            {/* Price - show loading skeleton while quote is being fetched */}
            <div className="text-right flex-shrink-0">
              {quote ? (
                <>
                  <div className="text-3xl font-data font-bold text-foreground tracking-tight">
                    ${quote.price?.toFixed(2) ?? '--'}
                  </div>
                  <div className="flex items-center justify-end gap-2 mt-1">
                    <span className="text-xs text-muted-foreground">今日</span>
                    <span className={`inline-flex items-center gap-1 text-sm font-data font-medium ${
                      isPositive ? 'text-emerald-400' : 'text-red-400'
                    }`}>
                      <svg className={`w-3.5 h-3.5 ${isPositive ? '' : 'rotate-180'}`} fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                      </svg>
                      {quote.change !== null && (
                        <span>{isPositive ? '+' : ''}${Math.abs(quote.change).toFixed(2)}</span>
                      )}
                      <span>({isPositive ? '+' : ''}{(priceChange * 100).toFixed(2)}%)</span>
                    </span>
                  </div>
                </>
              ) : (
                <div className="animate-pulse">
                  <div className="h-9 w-28 bg-muted rounded mb-1" />
                  <div className="h-5 w-20 bg-muted rounded ml-auto" />
                </div>
              )}
            </div>
          </div>
        </header>

        {/* ================================================================== */}
        {/* ANALYSIS TAB SWITCHER - fixed position between header and chart */}
        {/* ================================================================== */}
        <div className="mb-5">
          <AnalysisTabBar activeTab={activeAnalysisTab} onTabChange={handleAnalysisTabChange} />
        </div>

        {/* ================================================================== */}
        {/* TIMEFRAME SWITCHER (technical tab only) */}
        {/* ================================================================== */}
        {activeAnalysisTab === 'technical' && (
          <div className="mb-4 flex items-center gap-3">
            <span className="text-xs text-muted-foreground/60 uppercase tracking-wider">Timeframe</span>
            <div className="flex gap-0.5 p-0.5 bg-muted/40 rounded-lg border border-border/30">
              <button
                onClick={() => setTechnicalTimeframe('daily')}
                className={`px-4 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer ${
                  technicalTimeframe === 'daily'
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-sm'
                    : 'text-muted-foreground hover:text-foreground border border-transparent'
                }`}
              >
                日线 Daily
              </button>
              <button
                onClick={() => setTechnicalTimeframe('weekly')}
                className={`px-4 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer ${
                  technicalTimeframe === 'weekly'
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-sm'
                    : 'text-muted-foreground hover:text-foreground border border-transparent'
                }`}
              >
                周线 Weekly
              </button>
            </div>
          </div>
        )}

        {/* ================================================================== */}
        {/* CHART */}
        {/* ================================================================== */}
        <section className="mb-5">
          {activeAnalysisTab === 'technical' ? (
            <TechnicalChart symbol={symbol} interval={technicalTimeframe === 'weekly' ? 'W' : 'D'} />
          ) : (
            <div className="v2-card overflow-hidden rounded-xl">
              <StockPriceChart
                symbol={symbol}
                data={priceHistory}
                loading={priceHistoryLoading}
                height={280}
              />
            </div>
          )}
        </section>

        {/* ================================================================== */}
        {/* AI ANALYSIS / FUNDAMENTALS REPORT */}
        {/* ================================================================== */}
        {activeAnalysisTab === 'fundamental' ? (
          <FundamentalsReport
            symbol={symbol}
            companyName={profile?.company_name || symbol}
            analysis={analysis}
            analysisLoading={analysisLoading}
            onGenerate={() => handleGenerateAnalysis(false)}
            onRegenerate={() => handleGenerateAnalysis(true)}
            isAuthenticated={isAuthenticated}
            isPro={isPro}
            onLoginRequired={handleLoginRequired}
            onUpgradeRequired={createCheckout}
            quote={quote}
            fundamentals={fundamentals}
            financials={financials}
            valuationData={valuationData}
            valuationLoading={valuationLoading}
            stockDataMeta={data?.meta || null}
          />
        ) : (
          <section className="mb-5">
            <AIAnalysisSection
              analysis={analysis}
              loading={analysisLoading}
              onGenerate={() => handleGenerateAnalysis(false)}
              onRegenerate={() => handleGenerateAnalysis(true)}
              technicalAnalysis={technicalAnalysis}
              technicalLoading={technicalLoading}
              onGenerateTechnical={() => handleGenerateTechnical(false)}
              onRegenerateTechnical={() => handleGenerateTechnical(true)}
              newsAnalysis={newsAnalysis}
              newsLoading={newsLoading}
              onGenerateNews={() => handleGenerateNews(false)}
              onRegenerateNews={() => handleGenerateNews(true)}
              macroAnalysis={macroAnalysis}
              macroLoading={macroLoading}
              onGenerateMacro={() => handleGenerateMacro(false)}
              onRegenerateMacro={() => handleGenerateMacro(true)}
              companyName={profile?.company_name || symbol}
              symbol={symbol}
              isAuthenticated={isAuthenticated}
              isPro={isPro}
              onLoginRequired={handleLoginRequired}
              onUpgradeRequired={createCheckout}
              activeTab={activeAnalysisTab}
            />
          </section>
        )}

        {/* ================================================================== */}
        {/* SIGNAL DASHBOARD (technical tab only) */}
        {/* ================================================================== */}
        {activeAnalysisTab === 'technical' && (
          <section className="mb-5">
            <div className="relative bg-card/50 border border-border/40 rounded-xl overflow-hidden">
              {/* Header */}
              <div className="px-5 py-3 border-b border-border/30 bg-card/40">
                <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                  <div className="w-1 h-4 rounded-full bg-emerald-500" />
                  <span>技术信号</span>
                  <span className="text-muted-foreground/40 text-xs font-normal">Signals</span>
                </h3>
              </div>
              {/* Content */}
              {snapshotLoading ? (
                <div className="px-5 py-4 animate-pulse space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    {[1, 2, 3].map(i => <div key={i} className="h-16 bg-muted/30 rounded-lg" />)}
                  </div>
                  <div className="h-16 bg-muted/30 rounded-lg" />
                  <div className="grid grid-cols-2 gap-2">
                    {[1, 2].map(i => <div key={i} className="h-20 bg-muted/30 rounded-lg" />)}
                  </div>
                </div>
              ) : technicalSnapshot ? (
                <div className="px-5 py-4">
                  <TechnicalSignalDashboard snapshot={technicalSnapshot} timeframe={technicalTimeframe} />
                </div>
              ) : (
                <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                  加载中...
                </div>
              )}
            </div>
          </section>
        )}

        {/* Fundamentals data sections now rendered by FundamentalsReport above */}

        {/* Analysis Error Display */}
        {analysisMutation.error && (
          <div className="mb-5 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
            <div className="flex items-center gap-2 text-red-400">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span className="text-sm font-medium">分析出错</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{analysisMutation.error instanceof Error ? analysisMutation.error.message : '生成分析失败，请重试'}</p>
            <button
              onClick={() => handleGenerateAnalysis(false)}
              className="mt-3 text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              重试
            </button>
          </div>
        )}

        <div className="h-4" />
      </div>
    </div>
  );
}
