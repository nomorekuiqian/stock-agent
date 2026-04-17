'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import ReactMarkdown from 'react-markdown';
import { type StockAIAnalysis } from '@/components/StockAnalysisCard';
import { type Timeframe } from '@/hooks/queries/use-technical-data';
import { useAuth } from '@/contexts/AuthContext';
import { useEntitlements } from '@/contexts/EntitlementsContext';
import { AiChatLink } from '@/components/AiChatLink';
import { addRecentStock } from '@/lib/recent-stocks';

const PAYWALL_ENABLED = process.env.NEXT_PUBLIC_ENABLE_PAYWALL === 'true';
import {
  useStockProfile,
  useStockDetail,
  usePriceHistory,
  useValuationComparison,
  useStockAnalysisCache,
  useGenerateStockAnalysis,
  useGenerateTechnicalAnalysis,
  useGenerateNewsAnalysis,
  useGenerateMacroAnalysis,
  useEarningsData,
  useGenerateEarningsAnalysis,
} from '@/hooks/queries/use-stock-data';
import { useWatchlist, useSaveWatchlist } from '@/hooks/queries/use-watchlist';
import { EarningsTab } from './EarningsTab';
import { OverviewTab } from './OverviewTab';
import { TechnicalTab } from './TechnicalTab';
import { MarketTab } from './MarketTab';

// =============================================================================
// Types
// =============================================================================

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

interface TechnicalSignalDetail {
  name: string;
  value: string;
  definition: string;
  reading: string;
}

interface StockTechnicalAnalysis {
  title: string;
  tldr?: string;
  signals?: TechnicalSignalDetail[];
  situation?: string;
  summary?: string;
  chart_annotations?: { type: string; price?: number; date?: string; label: string; direction: string }[];
}

type AnalysisTab = 'overview' | 'earnings' | 'technical' | 'market';

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
  currency?: string;
}): string {
  if (value === null || value === undefined) return '--';

  const { style = 'decimal', minimumFractionDigits = 0, maximumFractionDigits = 2, compact = false } = options || {};

  if (style === 'percent') {
    return `${(value * 100).toFixed(1)}%`;
  }

  if (style === 'currency') {
    const cur = options?.currency || 'USD';
    // Zero-decimal currencies (no cents)
    const zeroDecimal = ['JPY', 'KRW', 'VND', 'IDR', 'CLP', 'TWD'].includes(cur);
    // Extract symbol from Intl (works for any currency)
    const sym = new Intl.NumberFormat('en-US', { style: 'currency', currency: cur })
      .formatToParts(0).find(p => p.type === 'currency')?.value || cur;
    if (compact && Math.abs(value) >= 1e12) {
      return `${sym}${(value / 1e12).toFixed(2)}T`;
    }
    if (compact && Math.abs(value) >= 1e9) {
      return `${sym}${(value / 1e9).toFixed(2)}B`;
    }
    if (compact && Math.abs(value) >= 1e6) {
      return `${sym}${(value / 1e6).toFixed(2)}M`;
    }
    const fd = zeroDecimal ? 0 : undefined;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: cur,
      minimumFractionDigits: fd ?? minimumFractionDigits,
      maximumFractionDigits: fd ?? maximumFractionDigits,
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
// Shared Components (exported for use by other tab files)
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
        <span className="text-foreground font-medium">{metric.zh}</span>
        <svg className="w-3.5 h-3.5 text-muted-foreground/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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

export function FinancialsTable({ quarters, currency }: { quarters: QuarterlyData[]; currency?: string }) {
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
      <div className="sm:hidden flex items-center justify-end gap-1 text-xs text-muted-foreground/70 mb-2">
        <span>左右滑动查看</span>
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
      </div>
      <div className="overflow-x-auto -mx-4">
        <table className="w-full text-sm min-w-[400px]">
          <thead>
            <tr className="border-b border-border/30">
              <th className="text-left py-3 px-4 text-muted-foreground font-medium w-24 sm:w-auto">
                <span>指标</span>
              </th>
              {sortedQuarters.slice(0, 4).map((q, i) => (
                <th key={i} className="text-right py-3 px-3 text-foreground font-medium whitespace-nowrap font-data">
                  {formatQuarter(q.period, q.fiscal_quarter, q.fiscal_year)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="font-data">
            {metrics.map(({ key, zh, getter }) => (
              <tr key={key} className="border-b border-border/20 hover:bg-card/30 transition-colors">
                <td className="py-3 px-4 whitespace-nowrap">
                  <span className="text-muted-foreground font-medium">{zh}</span>
                </td>
                {sortedQuarters.slice(0, 4).map((q, i) => (
                  <td key={i} className="text-right py-3 px-3 text-foreground whitespace-nowrap">
                    {key === 'eps'
                      ? formatNumber(getter(q), { style: 'currency', maximumFractionDigits: 2, currency })
                      : formatNumber(getter(q), { style: 'currency', compact: true, currency })
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
      <span className="text-muted-foreground">{title}</span>
      <span className="text-muted-foreground/70 light:text-muted-foreground font-normal normal-case">{titleEn}</span>
    </h3>
  );
}

export function MarkdownContent({ content, className = '' }: { content: string; className?: string }) {
  return (
    <div className={`max-w-none ${className}`}>
      <ReactMarkdown
        components={{
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
          p: ({ children }) => (
            <p className="text-sm text-muted-foreground leading-relaxed mb-3 last:mb-0">
              {children}
            </p>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">
              {children}
            </strong>
          ),
          ul: ({ children }) => (
            <ul className="pl-4 space-y-2 my-3">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal pl-5 space-y-2 my-3">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="text-sm text-muted-foreground leading-relaxed pl-2">
              {children}
            </li>
          ),
          code: ({ children }) => (
            <code className="font-data text-amber-400 bg-amber-500/15 px-1.5 py-0.5 rounded text-xs font-medium">
              {children}
            </code>
          ),
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
    <div className={`bg-card/50 light:bg-card border border-border/40 rounded-xl overflow-hidden ${className}`}>
      <div className="px-6 py-5 border-b border-border/30 bg-card/40 light:bg-muted/50">
        <div className="flex items-center justify-between">
          <div>
            {numberLabel && (
              <p className="font-data text-xs font-semibold uppercase tracking-[0.2em] text-primary light:text-primary mb-1.5">
                Section {numberLabel}
              </p>
            )}
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <span>{title}</span>
              <span className="text-muted-foreground text-sm font-normal">{titleEn}</span>
            </h2>
          </div>
          {action}
        </div>
      </div>
      <div className="px-6 py-6 space-y-6">
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

  const formatVal = (val: number | null | undefined): string => {
    if (val === null || val === undefined) return '--';
    return val.toFixed(1);
  };

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

  const years = historical_valuation?.years || [];
  const currentPE = currentValuation?.pe ?? years[0]?.pe;

  return (
    <div className="space-y-6">
      {/* Historical Valuation */}
      {years.length > 0 && (
        <div>
          <SubsectionHeader title="历史估值" titleEn="Historical Valuation" />
          <div className="overflow-x-auto -mx-4">
            <table className="w-full text-sm min-w-[400px]">
              <thead>
                <tr className="border-b border-border/30">
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">指标</th>
                  {years.slice(0, 5).map((y, i) => (
                    <th key={y.year} className={`text-right py-3 px-3 font-medium font-data ${i === 0 ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {y.year}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="font-data">
                <tr className="border-b border-border/20 hover:bg-card/30 transition-colors">
                  <td className="py-3 px-4 text-muted-foreground font-medium">P/E</td>
                  {years.slice(0, 5).map((y, i) => (
                    <td key={y.year} className={`text-right py-3 px-3 ${i === 0 ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                      {formatVal(y.pe)}
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-border/20 hover:bg-card/30 transition-colors">
                  <td className="py-3 px-4 text-muted-foreground font-medium">P/B</td>
                  {years.slice(0, 5).map((y, i) => (
                    <td key={y.year} className={`text-right py-3 px-3 ${i === 0 ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                      {formatVal(y.pb)}
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-border/20 hover:bg-card/30 transition-colors">
                  <td className="py-3 px-4 text-muted-foreground font-medium">P/S</td>
                  {years.slice(0, 5).map((y, i) => (
                    <td key={y.year} className={`text-right py-3 px-3 ${i === 0 ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                      {formatVal(y.ps)}
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-border/20 hover:bg-card/30 transition-colors">
                  <td className="py-3 px-4 text-muted-foreground font-medium">EV/EBITDA</td>
                  {years.slice(0, 5).map((y, i) => (
                    <td key={y.year} className={`text-right py-3 px-3 ${i === 0 ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                      {formatVal(y.ev_to_ebitda)}
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-border/20 hover:bg-card/30 transition-colors">
                  <td className="py-3 px-4 text-muted-foreground font-medium">毛利率</td>
                  {years.slice(0, 5).map((y, i) => (
                    <td key={y.year} className={`text-right py-3 px-3 ${i === 0 ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                      {y.gross_margin ? `${y.gross_margin}%` : '--'}
                    </td>
                  ))}
                </tr>
                <tr className="hover:bg-card/30 transition-colors">
                  <td className="py-3 px-4 text-muted-foreground font-medium">净利率</td>
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
            {industry_valuation.sector_pe && (
              <div className="p-3 bg-card/40 rounded-lg border border-border/40 hover:border-border/60 transition-colors">
                <div className="text-sm mb-1.5">
                  <span className="text-foreground font-medium">板块 P/E</span>
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
            {industry_valuation.industry_pe && (
              <div className="p-3 bg-card/40 rounded-lg border border-border/40 hover:border-border/60 transition-colors">
                <div className="text-sm mb-1.5">
                  <span className="text-foreground font-medium">行业 P/E</span>
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
                  <th className="text-left py-3 px-4 text-muted-foreground font-medium">公司</th>
                  <th className="text-right py-3 px-3 text-foreground font-medium">P/E</th>
                  <th className="text-right py-3 px-3 text-foreground font-medium">P/B</th>
                  <th className="text-right py-3 px-3 text-foreground font-medium">ROE</th>
                  <th className="text-right py-3 px-3 text-foreground font-medium">毛利率</th>
                </tr>
              </thead>
              <tbody className="font-data">
                <tr className="border-b border-border/30 bg-primary/5">
                  <td className="py-3 px-4 font-medium text-primary">{peer_comparison.symbol}</td>
                  <td className="text-right py-3 px-3 text-foreground">{formatVal(peer_comparison.company_metrics?.pe_ratio)}</td>
                  <td className="text-right py-3 px-3 text-foreground">{formatVal(peer_comparison.company_metrics?.pb_ratio)}</td>
                  <td className="text-right py-3 px-3 text-foreground">
                    {peer_comparison.company_metrics?.roe ? `${(peer_comparison.company_metrics.roe * 100).toFixed(1)}%` : '--'}
                  </td>
                  <td className="text-right py-3 px-3 text-foreground">
                    {peer_comparison.company_metrics?.gross_margin ? `${(peer_comparison.company_metrics.gross_margin * 100).toFixed(1)}%` : '--'}
                  </td>
                </tr>
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


// =============================================================================
// Loading Skeleton
// =============================================================================

function LoadingSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[1400px] mx-auto px-6 py-6">
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
          <div className="h-10 bg-muted rounded-lg" />
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
  const searchParams = useSearchParams();
  const { isAuthenticated, user } = useAuth();
  const { has: hasEntitlement } = useEntitlements();
  const hasAIAccess = !PAYWALL_ENABLED || hasEntitlement('stock_research');

  // Watchlist
  const { data: watchlistData } = useWatchlist(user?.id);
  const saveWatchlist = useSaveWatchlist();
  const [justAdded, setJustAdded] = useState(false);
  const isInWatchlist = watchlistData?.symbols?.includes(symbol) ?? false;

  const handleAddToWatchlist = useCallback(() => {
    if (!user || isInWatchlist) return;
    const current = watchlistData?.symbols ?? [];
    saveWatchlist.mutate({
      userId: user.id,
      symbols: [...current, symbol],
      email: user.email,
      baseUpdatedAt: watchlistData?.updated_at,
    });
    setJustAdded(true);
  }, [user, isInWatchlist, watchlistData, saveWatchlist, symbol]);

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
  const earningsMutation = useGenerateEarningsAnalysis(symbol);

  // Earnings data (used by Earnings tab)
  const { data: earningsData } = useEarningsData(symbol);


  // Use mutation result if available, otherwise fall back to cached data
  const analysis = (analysisMutation.data as StockAIAnalysis | null) ?? (cachedAnalysis as StockAIAnalysis | null) ?? null;
  const analysisLoading = analysisMutation.isPending || cacheLoading;

  // Technical Analysis state (separate per timeframe, kept local)
  const [dailyTechnicalAnalysis, setDailyTechnicalAnalysis] = useState<StockTechnicalAnalysis | null>(null);
  const [weeklyTechnicalAnalysis, setWeeklyTechnicalAnalysis] = useState<StockTechnicalAnalysis | null>(null);
  const technicalLoading = technicalMutation.isPending;

  // Active analysis tab (initialized from URL)
  const tabFromUrl = searchParams.get('tab') as AnalysisTab | null;
  const [activeAnalysisTab, setActiveAnalysisTab] = useState<AnalysisTab>(
    tabFromUrl && ['overview', 'earnings', 'technical', 'market'].includes(tabFromUrl)
      ? tabFromUrl
      : 'overview'
  );

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

  // Handle analysis tab change
  const handleAnalysisTabChange = (tab: AnalysisTab) => {
    setActiveAnalysisTab(tab);
    // Update URL without full page reload
    const params = new URLSearchParams(searchParams.toString());
    if (tab === 'overview') {
      params.delete('tab');
    } else {
      params.set('tab', tab);
    }
    const newUrl = `${pathname}${params.toString() ? '?' + params.toString() : ''}`;
    router.replace(newUrl, { scroll: false });
  };

  const handleGenerateNews = (force: boolean = false) => newsMutation.mutate({ force });
  const handleGenerateMacro = (force: boolean = false) => macroMutation.mutate({ force });
  const newsAnalysis = (newsMutation.data as { title: string; news_summary: string; analyst_activity: string; upcoming_catalysts: string; sentiment_assessment: string } | null) ?? null;
  const newsLoading = newsMutation.isPending;
  const macroAnalysis = (macroMutation.data as { title: string; macro_impact: string; sector_positioning: string; market_regime: string; outlook_and_risks: string } | null) ?? null;
  const macroLoading = macroMutation.isPending;

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
            className="mt-2 px-5 py-2 bg-card border border-border rounded-lg text-sm font-medium hover:border-primary/30 transition-all cursor-pointer"
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

  // Record stock visit for "recently viewed" list
  useEffect(() => {
    const name = profile?.company_name;
    if (name) {
      addRecentStock(symbol, name);
    }
  }, [symbol, profile?.company_name]);

  const priceChange = quote?.change_percent ?? 0;
  const isPositive = priceChange >= 0;
  const logoUrl = profile?.company_details?.image;

  // Tab definitions
  const tabs: { id: AnalysisTab; label: string }[] = [
    { id: 'overview', label: '概览' },
    { id: 'earnings', label: '财报' },
    { id: 'technical', label: '技术面' },
    { id: 'market', label: '市场' },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[1400px] mx-auto px-6 py-5">

        {/* ================================================================== */}
        {/* BREADCRUMB + PAGE TITLE                                            */}
        {/* ================================================================== */}
        <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-5">
          <Link href="/" className="hover:text-primary transition-colors cursor-pointer">首页</Link>
          <svg className="w-3 h-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <Link href="/stock" className="hover:text-primary transition-colors cursor-pointer">个股调研</Link>
          <svg className="w-3 h-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-foreground font-data">{symbol}</span>
        </nav>

        {/* ================================================================== */}
        {/* HEADER - Inline Layout                                             */}
        {/* ================================================================== */}
        <header className="mb-6">
          <div className="flex items-center gap-4">
            {/* Logo */}
            {logoUrl && !logoError ? (
              <div className="w-11 h-11 rounded-xl bg-white p-1.5 shadow-md flex-shrink-0">
                <Image
                  src={logoUrl}
                  alt={`${profile?.company_name || symbol} logo`}
                  width={44}
                  height={44}
                  className="w-full h-full object-contain"
                  onError={() => setLogoError(true)}
                />
              </div>
            ) : (
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                <span className="font-data font-bold text-primary text-sm">
                  {symbol.slice(0, 2)}
                </span>
              </div>
            )}

            {/* Company Info + Price (all in one row) */}
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-3 flex-wrap">
                <h1 className="text-xl font-semibold text-foreground truncate">
                  {profile?.company_name || symbol}
                </h1>
                {quote?.price != null && (
                  <div className="flex items-baseline gap-2 flex-shrink-0">
                    <span className="text-xl font-data font-bold text-foreground">
                      {formatNumber(quote.price, { style: 'currency', currency: profile?.currency })}
                    </span>
                    <span className={`text-sm font-data font-medium ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                      {isPositive ? '+' : ''}{priceChange.toFixed(2)}%
                    </span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                <span className="font-data font-medium text-foreground/80">{symbol}</span>
                {profile?.exchange && (
                  <>
                    <span className="text-border/60">|</span>
                    <span>{profile.exchange}</span>
                  </>
                )}
                {profile?.classification?.sector && (
                  <>
                    <span className="text-border/60 hidden sm:inline">|</span>
                    <span className="hidden sm:inline truncate">
                      {translateSector(profile.classification.sector)}
                      {profile.classification.industry && ` / ${translateIndustry(profile.classification.industry)}`}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 flex-shrink-0">
              <AiChatLink
                href={`/research?context=stock&symbol=${symbol}`}
              />
              <button
                onClick={isAuthenticated ? handleAddToWatchlist : handleLoginRequired}
                disabled={isInWatchlist || saveWatchlist.isPending}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all border cursor-pointer
                  focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none ${
                  isInWatchlist || justAdded
                    ? 'border-primary/30 bg-primary/10 text-primary'
                    : 'border-border/40 bg-card/50 text-foreground hover:border-primary/40 hover:bg-primary/10 hover:text-primary'
                }`}
              >
                {isInWatchlist || justAdded ? (
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19" strokeLinecap="round" />
                    <line x1="5" y1="12" x2="19" y2="12" strokeLinecap="round" />
                  </svg>
                )}
                {isInWatchlist || justAdded ? '已在自选' : '加入自选'}
              </button>
            </div>
          </div>
        </header>

        {/* ================================================================== */}
        {/* TAB BAR - Pill style                                               */}
        {/* ================================================================== */}
        <div className="mb-6">
          <div className="flex items-center gap-1 bg-muted/30 p-1 rounded-xl border border-border/20">
            {tabs.map((tab) => {
              const isActive = activeAnalysisTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleAnalysisTabChange(tab.id)}
                  className={`flex-1 px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 cursor-pointer
                    focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:outline-none
                    ${isActive
                      ? 'bg-card text-foreground shadow-sm border border-border/40'
                      : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ================================================================== */}
        {/* TAB CONTENT                                                        */}
        {/* ================================================================== */}

        {activeAnalysisTab === 'overview' && (
          <OverviewTab
            symbol={symbol}
            companyName={profile?.company_name || symbol}
            currency={profile?.currency}
            quote={quote}
            fundamentals={fundamentals}
            financials={financials}
            valuationData={valuationData}
            valuationLoading={valuationLoading}
            analysis={analysis}
            analysisLoading={analysisLoading}
            onGenerate={() => handleGenerateAnalysis(false)}
            onRegenerate={() => handleGenerateAnalysis(true)}
            priceHistory={priceHistory}
            priceHistoryLoading={priceHistoryLoading}
            hasAIAccess={hasAIAccess}
          />
        )}

        {activeAnalysisTab === 'earnings' && (
          <section>
            <EarningsTab
              symbol={symbol}
              companyName={profile?.company_name || symbol}
              currency={profile?.currency}
              earningsHistory={earningsData?.earnings_history ?? []}
              revenueSegments={earningsData?.revenue_segments ?? []}
              revenueGeoSegments={earningsData?.revenue_geo_segments}
              financialGrowth={earningsData?.financial_growth ?? []}
              analystEstimates={earningsData?.analyst_estimates}
              dcfValue={earningsData?.dcf_value}
              stockPrice={earningsData?.stock_price}
              nextEarningsDate={earningsData?.next_earnings_date}
              incomeStatements={earningsData?.income_statements}
              cashflowStatements={earningsData?.cashflow_statements}
              balanceSheets={earningsData?.balance_sheets}
              earningsAnalysis={earningsMutation.data as { title: string; earnings_overview: string; earnings_verdict: string; [key: string]: string | undefined } | null}
              analysisLoading={earningsMutation.isPending}
              onGenerate={() => earningsMutation.mutate({ force: false })}
              onRegenerate={() => earningsMutation.mutate({ force: true })}
              hasAIAccess={hasAIAccess}
            />
          </section>
        )}

        {activeAnalysisTab === 'technical' && (
          <TechnicalTab
            symbol={symbol}
            companyName={profile?.company_name || symbol}
            timeframe={technicalTimeframe}
            onTimeframeChange={setTechnicalTimeframe}
            technicalAnalysis={technicalAnalysis}
            technicalLoading={technicalLoading}
            onGenerate={() => handleGenerateTechnical(false)}
            onRegenerate={() => handleGenerateTechnical(true)}
            hasAIAccess={hasAIAccess}
          />
        )}

        {activeAnalysisTab === 'market' && (
          <MarketTab
            symbol={symbol}
            companyName={profile?.company_name || symbol}
            hasAIAccess={hasAIAccess}
          />
        )}

        {/* ================================================================== */}
        {/* ERROR DISPLAY                                                      */}
        {/* ================================================================== */}
        {analysisMutation.error && (
          <div className="mt-5 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
            <div className="flex items-center gap-2 text-red-400">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span className="text-sm font-medium">分析出错</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{analysisMutation.error instanceof Error ? analysisMutation.error.message : '生成分析失败，请重试'}</p>
            <button
              onClick={() => handleGenerateAnalysis(false)}
              className="mt-3 text-sm text-primary hover:text-primary/80 transition-colors cursor-pointer"
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
