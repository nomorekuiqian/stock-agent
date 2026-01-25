'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { StockPriceChart } from '@/components/StockPriceChart';
import {
  InlineAnalysisText,
  type StockAIAnalysis,
} from '@/components/StockAnalysisCard';

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
  };
  growth: {
    revenue_yoy?: number;
    eps_yoy?: number;
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
}

interface QuarterlyData {
  period: string;
  fiscal_quarter?: string;
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
  };
}

interface PriceHistoryData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
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
  eps_yoy: {
    zh: 'EPS 同比',
    en: 'EPS YoY',
    tip: '每股收益同比增长率。直接影响股东回报，对估值至关重要。',
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
};

// =============================================================================
// Utility Functions
// =============================================================================

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

async function fetchStockData(symbol: string): Promise<StockData> {
  const response = await fetch(`${API_BASE_URL}/stock/${symbol}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch stock data: ${response.status}`);
  }
  return response.json();
}

async function fetchPriceHistory(symbol: string, days: number = 365): Promise<PriceHistoryData[]> {
  const response = await fetch(`${API_BASE_URL}/stock/${symbol}/history?days=${days}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch price history: ${response.status}`);
  }
  const result = await response.json();
  return result.data || [];
}

async function fetchStockAnalysis(symbol: string, force: boolean = false): Promise<StockAIAnalysis | null> {
  const response = await fetch(`${API_BASE_URL}/stock/${symbol}/analysis?force=${force}`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch analysis: ${response.status}`);
  }
  const result = await response.json();
  return result.success ? result.analysis : null;
}

function formatNumber(value: number | null | undefined, options?: {
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

function formatQuarter(dateStr: string, fiscalQuarter?: string): string {
  if (!dateStr) return '--';
  const date = new Date(dateStr);
  const year = date.getFullYear();
  if (fiscalQuarter) {
    return `${year} ${fiscalQuarter}`;
  }
  const month = date.getMonth();
  const quarter = Math.floor(month / 3) + 1;
  return `${year} Q${quarter}`;
}

// =============================================================================
// Components
// =============================================================================

function Tooltip({ content, children }: { content: string; children: React.ReactNode }) {
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

function MetricLabel({ metricKey }: { metricKey: string }) {
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

function MetricCard({ metricKey, value, trend }: {
  metricKey: string;
  value: string;
  trend?: 'up' | 'down' | 'neutral';
}) {
  const trendColors = {
    up: 'text-emerald-400',
    down: 'text-red-400',
    neutral: 'text-foreground',
  };

  return (
    <div className="p-3 bg-card/40 rounded-lg border border-border/40 hover:border-border/60 transition-colors">
      <div className="text-sm mb-1.5">
        <MetricLabel metricKey={metricKey} />
      </div>
      <div className={`font-data text-lg font-semibold ${trend ? trendColors[trend] : 'text-foreground'}`}>
        {value}
      </div>
    </div>
  );
}

function StatRow({ metricKey, value, trend }: {
  metricKey: string;
  value: string;
  trend?: 'up' | 'down' | 'neutral';
}) {
  const trendColors = {
    up: 'text-emerald-400',
    down: 'text-red-400',
    neutral: 'text-foreground',
  };

  return (
    <div className="flex items-center justify-between py-3 border-b border-border/25 last:border-0">
      <span className="text-sm">
        <MetricLabel metricKey={metricKey} />
      </span>
      <span className={`font-data text-base font-semibold ${trend ? trendColors[trend] : 'text-foreground'}`}>
        {value}
      </span>
    </div>
  );
}

function FinancialsTable({ quarters }: { quarters: QuarterlyData[] }) {
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
    <div className="overflow-x-auto -mx-4">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/30">
            <th className="text-left py-3 px-4 text-foreground/80 font-medium">
              <span className="flex items-center gap-1.5">
                <span>指标</span>
              </span>
            </th>
            {sortedQuarters.slice(0, 4).map((q, i) => (
              <th key={i} className="text-right py-3 px-3 text-foreground/70 font-medium whitespace-nowrap font-data">
                {formatQuarter(q.period, q.fiscal_quarter)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="font-data">
          {metrics.map(({ key, zh, getter }) => (
            <tr key={key} className="border-b border-border/20 hover:bg-card/30 transition-colors">
              <td className="py-3 px-4">
                <span className="flex items-center gap-1.5">
                  <span className="text-foreground/80 font-medium">{zh}</span>
                </span>
              </td>
              {sortedQuarters.slice(0, 4).map((q, i) => (
                <td key={i} className="text-right py-3 px-3 text-foreground">
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
  );
}

function SubsectionHeader({ title, titleEn }: {
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

function SectionCard({ title, titleEn, children, className = '', action }: {
  title: string;
  titleEn: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={`bg-card/50 border border-border/40 rounded-xl overflow-hidden ${className}`}>
      <div className="px-5 py-4 border-b border-border/30 bg-card/40">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <div className="w-1 h-5 bg-emerald-500 rounded-full" />
            <span>{title}</span>
            <span className="text-muted-foreground text-sm font-normal">{titleEn}</span>
          </h2>
          {action}
        </div>
      </div>
      <div className="p-5">
        {children}
      </div>
    </div>
  );
}

function GenerateAnalysisButton({ onClick, loading, hasAnalysis }: {
  onClick: () => void;
  loading: boolean;
  hasAnalysis: boolean;
}) {
  if (hasAnalysis) {
    return (
      <button
        onClick={onClick}
        disabled={loading}
        className="p-2 text-muted-foreground hover:text-emerald-400 transition-colors disabled:opacity-50"
        title="重新生成分析"
      >
        <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:text-emerald-300 border border-emerald-500/30 hover:border-emerald-500/50 rounded-lg transition-all disabled:opacity-50"
    >
      {loading ? (
        <>
          <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span>分析中...</span>
        </>
      ) : (
        <>
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <span>生成 AI 分析</span>
        </>
      )}
    </button>
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

export default function StockPage() {
  const params = useParams();
  const router = useRouter();
  const symbol = (params.symbol as string)?.toUpperCase();

  const [data, setData] = useState<StockData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [priceHistory, setPriceHistory] = useState<PriceHistoryData[]>([]);
  const [priceHistoryLoading, setPriceHistoryLoading] = useState(true);
  const [showDescription, setShowDescription] = useState(false);
  const [logoError, setLogoError] = useState(false);

  // AI Analysis state
  const [analysis, setAnalysis] = useState<StockAIAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  useEffect(() => {
    if (!symbol) return;

    setLoading(true);
    setError(null);
    setLogoError(false);

    fetchStockData(symbol)
      .then(setData)
      .catch((err) => {
        console.error('Failed to fetch stock data:', err);
        setError(err.message || 'Failed to load stock data');
      })
      .finally(() => setLoading(false));

    setPriceHistoryLoading(true);
    fetchPriceHistory(symbol, 1825) // 5 years of data for "ALL" option
      .then(setPriceHistory)
      .catch((err) => console.error('Failed to fetch price history:', err))
      .finally(() => setPriceHistoryLoading(false));
  }, [symbol]);

  const handleGenerateAnalysis = async (force: boolean = false) => {
    setAnalysisLoading(true);
    setAnalysisError(null);

    try {
      const result = await fetchStockAnalysis(symbol, force);
      if (result) {
        setAnalysis(result);
      } else {
        setAnalysisError('Failed to generate analysis');
      }
    } catch (err) {
      console.error('Analysis error:', err);
      setAnalysisError(err instanceof Error ? err.message : 'Failed to generate analysis');
    } finally {
      setAnalysisLoading(false);
    }
  };

  if (loading) return <LoadingSkeleton />;

  if (error || !data) {
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

  const { profile, quote, fundamentals, financials } = data;
  const priceChange = quote.change_percent ?? 0;
  const isPositive = priceChange >= 0;
  const logoUrl = profile.company_details?.image;

  // Calculate 52-week position
  const pricePosition = quote.week_52_low && quote.week_52_high && quote.price
    ? ((quote.price - quote.week_52_low) / (quote.week_52_high - quote.week_52_low)) * 100
    : 50;

  const hasAnalysis = !!analysis;

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
                    alt={`${profile.company_name} logo`}
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
              <h1 className="text-xl font-semibold text-foreground truncate leading-tight mb-1">
                {profile.company_name}
                <span className="ml-2 text-base font-data font-medium text-muted-foreground">
                  {symbol}
                </span>
                {profile.exchange && (
                  <span className="ml-1.5 text-sm font-normal text-muted-foreground/60">
                    {profile.exchange}
                  </span>
                )}
              </h1>
              {profile.classification?.sector && (
                <p className="text-sm text-muted-foreground">
                  {profile.classification.sector}
                  {profile.classification.industry && ` / ${profile.classification.industry}`}
                </p>
              )}
            </div>

            {/* Price */}
            <div className="text-right flex-shrink-0">
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
            </div>
          </div>
        </header>

        {/* ================================================================== */}
        {/* CHART */}
        {/* ================================================================== */}
        <section className="mb-5">
          <div className="terminal-card overflow-hidden rounded-xl">
            <StockPriceChart
              symbol={symbol}
              data={priceHistory}
              loading={priceHistoryLoading}
              height={280}
            />
          </div>
        </section>

        {/* ================================================================== */}
        {/* FUNDAMENTALS */}
        {/* ================================================================== */}
        <section className="mb-5">
          <SectionCard
            title="基本面分析"
            titleEn="Fundamentals"
            action={
              <GenerateAnalysisButton
                onClick={() => handleGenerateAnalysis(hasAnalysis)}
                loading={analysisLoading}
                hasAnalysis={hasAnalysis}
              />
            }
          >
            {/* AI Fundamentals Analysis */}
            {analysis?.fundamentals_analysis && (
              <div className="mb-5 pb-5 border-b border-border/40">
                <SubsectionHeader title="AI 分析" titleEn="Insights" />
                <InlineAnalysisText text={analysis.fundamentals_analysis} loading={analysisLoading} />
              </div>
            )}

            {/* Market Overview */}
            <div className="mb-5 pb-5 border-b border-border/40">
              <SubsectionHeader title="市场概览" titleEn="Overview" />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                <MetricCard metricKey="market_cap" value={formatNumber(quote.market_cap, { style: 'currency', compact: true })} />
                <MetricCard metricKey="pe" value={formatNumber(fundamentals.valuation.pe)} />
                <MetricCard metricKey="ps" value={formatNumber(fundamentals.valuation.ps)} />
                <MetricCard metricKey="volume" value={formatNumber(quote.volume, { compact: true })} />
              </div>
              {/* 52-Week Range */}
              {quote.week_52_low && quote.week_52_high && (
                <div className="bg-card/30 border border-border/30 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-foreground/70">
                      52 周区间
                    </span>
                    <span className="text-sm text-muted-foreground font-data">
                      at {pricePosition.toFixed(0)}%
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-data font-medium text-red-400 w-18">${quote.week_52_low.toFixed(2)}</span>
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-red-500/70 via-amber-500/70 to-emerald-500/70 relative rounded-full">
                        <div
                          className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-background shadow-sm"
                          style={{ left: `calc(${Math.min(Math.max(pricePosition, 5), 95)}% - 7px)` }}
                        />
                      </div>
                    </div>
                    <span className="text-sm font-data font-medium text-emerald-400 w-18 text-right">${quote.week_52_high.toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Valuation */}
            <div className="mb-5 pb-5 border-b border-border/40">
              <SubsectionHeader title="估值指标" titleEn="Valuation" />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <MetricCard metricKey="pb" value={formatNumber(fundamentals.valuation.pb)} />
                <MetricCard metricKey="ev_ebitda" value={formatNumber(fundamentals.valuation.ev_to_ebitda)} />
              </div>
            </div>

            {/* Growth */}
            <div className="mb-5 pb-5 border-b border-border/40">
              <SubsectionHeader title="增长指标" titleEn="Growth" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
                <StatRow
                  metricKey="revenue_yoy"
                  value={formatNumber(fundamentals.growth.revenue_yoy, { style: 'percent' })}
                  trend={fundamentals.growth.revenue_yoy ? (fundamentals.growth.revenue_yoy > 0 ? 'up' : 'down') : 'neutral'}
                />
                <StatRow
                  metricKey="net_income_yoy"
                  value={formatNumber(fundamentals.growth.net_income_yoy, { style: 'percent' })}
                  trend={fundamentals.growth.net_income_yoy ? (fundamentals.growth.net_income_yoy > 0 ? 'up' : 'down') : 'neutral'}
                />
                <StatRow
                  metricKey="eps_yoy"
                  value={formatNumber(fundamentals.growth.eps_yoy, { style: 'percent' })}
                  trend={fundamentals.growth.eps_yoy ? (fundamentals.growth.eps_yoy > 0 ? 'up' : 'down') : 'neutral'}
                />
                <StatRow
                  metricKey="revenue_qoq"
                  value={formatNumber(fundamentals.growth.revenue_qoq, { style: 'percent' })}
                  trend={fundamentals.growth.revenue_qoq ? (fundamentals.growth.revenue_qoq > 0 ? 'up' : 'down') : 'neutral'}
                />
              </div>
            </div>

            {/* Profitability */}
            <div>
              <SubsectionHeader title="盈利能力" titleEn="Profitability" />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <MetricCard metricKey="gross_margin" value={formatNumber(fundamentals.profitability.gross_margin, { style: 'percent' })} />
                <MetricCard metricKey="net_margin" value={formatNumber(fundamentals.profitability.net_margin, { style: 'percent' })} />
                <MetricCard metricKey="roe" value={formatNumber(fundamentals.profitability.roe, { style: 'percent' })} />
                <MetricCard metricKey="roa" value={formatNumber(fundamentals.profitability.roa, { style: 'percent' })} />
              </div>
            </div>
          </SectionCard>
        </section>

        {/* ================================================================== */}
        {/* FINANCIALS */}
        {/* ================================================================== */}
        <section className="mb-5">
          <SectionCard title="财务报表" titleEn="Financials">
            {/* AI Financials Analysis */}
            {analysis?.financials_analysis && (
              <div className="mb-5 pb-5 border-b border-border/40">
                <SubsectionHeader title="AI 分析" titleEn="Insights" />
                <InlineAnalysisText text={analysis.financials_analysis} loading={analysisLoading} />
              </div>
            )}

            {/* TTM Summary */}
            <div className="mb-5 pb-5 border-b border-border/40">
              <SubsectionHeader title="过去十二个月" titleEn="TTM" />
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                <MetricCard metricKey="revenue" value={formatNumber(fundamentals.ttm.revenue, { style: 'currency', compact: true })} />
                <MetricCard metricKey="net_income" value={formatNumber(fundamentals.ttm.net_income, { style: 'currency', compact: true })} />
                <MetricCard metricKey="ebitda" value={formatNumber(fundamentals.ttm.ebitda, { style: 'currency', compact: true })} />
                <MetricCard metricKey="operating_cash_flow" value={formatNumber(fundamentals.ttm.operating_cash_flow, { style: 'currency', compact: true })} />
                <MetricCard metricKey="free_cash_flow" value={formatNumber(fundamentals.ttm.free_cash_flow, { style: 'currency', compact: true })} />
                <MetricCard metricKey="eps" value={formatNumber(fundamentals.ttm.eps, { style: 'currency', maximumFractionDigits: 2 })} />
              </div>
            </div>

            {/* Quarterly Table */}
            <div>
              <SubsectionHeader title="季度数据" titleEn="Quarterly" />
              <FinancialsTable quarters={financials.quarters} />
            </div>
          </SectionCard>
        </section>

        {/* ================================================================== */}
        {/* COMPANY DESCRIPTION */}
        {/* ================================================================== */}
        {(profile.description?.en || profile.description?.zh) && (
          <section className="mb-5">
            <SectionCard title="公司概况" titleEn="About">
              {/* AI Company Overview */}
              {analysis?.company_overview && (
                <div className="mb-4 pb-4 border-b border-border/40">
                  <SubsectionHeader title="AI 概述" titleEn="Overview" />
                  <InlineAnalysisText text={analysis.company_overview} loading={analysisLoading} />
                </div>
              )}

              {/* Company Details */}
              {profile.company_details && (
                <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm mb-4 pb-4 border-b border-border/20">
                  {profile.company_details.ceo && (
                    <span><span className="text-muted-foreground">CEO:</span> {profile.company_details.ceo}</span>
                  )}
                  {profile.company_details.employees && (
                    <span><span className="text-muted-foreground">员工:</span> <span className="font-data">{formatNumber(profile.company_details.employees)}</span></span>
                  )}
                  {profile.company_details.ipo_date && (
                    <span><span className="text-muted-foreground">上市日期:</span> <span className="font-data">{profile.company_details.ipo_date}</span></span>
                  )}
                  {profile.company_details.website && (
                    <a href={profile.company_details.website} target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:text-emerald-300 transition-colors">
                      官网
                    </a>
                  )}
                </div>
              )}
              <p className={`text-sm text-muted-foreground leading-relaxed ${!showDescription ? 'line-clamp-3' : ''}`}>
                {profile.description?.en || profile.description?.zh}
              </p>
              {((profile.description?.en || profile.description?.zh)?.length ?? 0) > 200 && (
                <button
                  onClick={() => setShowDescription(!showDescription)}
                  className="mt-3 text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
                >
                  {showDescription ? '收起' : '展开'}
                </button>
              )}
            </SectionCard>
          </section>
        )}

        {/* ================================================================== */}
        {/* INVESTMENT VIEW (Opportunities & Risks) */}
        {/* ================================================================== */}
        {analysis && (analysis.opportunities || analysis.risks || analysis.investment_summary) && (
          <section className="mb-5">
            <SectionCard title="投资观点" titleEn="Investment View">
              {/* Opportunities & Risks - Side by Side */}
              {(analysis.opportunities || analysis.risks) && (
                <div className="mb-5 pb-5 border-b border-border/40">
                  <div className="grid md:grid-cols-2 gap-4">
                    {analysis.opportunities && (
                      <div>
                        <SubsectionHeader title="投资机会" titleEn="Opportunities" />
                        <p className="text-sm text-muted-foreground leading-relaxed">{analysis.opportunities}</p>
                      </div>
                    )}
                    {analysis.risks && (
                      <div>
                        <SubsectionHeader title="风险因素" titleEn="Risks" />
                        <p className="text-sm text-muted-foreground leading-relaxed">{analysis.risks}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Investment Summary */}
              {analysis.investment_summary && (
                <div>
                  <SubsectionHeader title="投资总结" titleEn="Summary" />
                  <div className="p-4 bg-card/60 border border-border/40 rounded-lg">
                    <p className="text-sm text-foreground/90 leading-relaxed">{analysis.investment_summary}</p>
                  </div>
                </div>
              )}
            </SectionCard>
          </section>
        )}

        {/* Analysis Error Display */}
        {analysisError && (
          <div className="mb-5 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
            <div className="flex items-center gap-2 text-red-400">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span className="text-sm font-medium">分析出错</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{analysisError}</p>
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
