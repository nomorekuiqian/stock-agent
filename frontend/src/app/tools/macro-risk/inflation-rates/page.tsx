'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { TradingViewWidget } from '@/components/TradingViewWidget';
import { MacroPageHeader } from '@/components/MacroPageHeader';
import {
  api,
  EconomicFundamentals,
  SubDimension,
  RiskIndicator,
} from '@/lib/api';
import { formatTimestamp } from '@/lib/timezone';
import { DollarSign, Percent, type LucideIcon } from 'lucide-react';

// ============================================================================
// Constants
// ============================================================================

const FRED_SYMBOLS: Record<string, string> = {
  cpi: 'FRED:CPIAUCSL',
  core_pce: 'FRED:PCEPILFE',
  inflation_expectations_5y: 'FRED:T5YIE',
  michigan_inflation: 'FRED:MICH',
  fed_funds_rate: 'FRED:FEDFUNDS',
  treasury_10y: 'FRED:DGS10',
  real_rate_10y: 'FRED:DFII10',
};

const SERIES_TO_CHART: Record<string, string> = {
  CPIAUCSL: 'cpi',
  PCEPILFE: 'core_pce',
  T5YIE: 'inflation_expectations_5y',
  MICH: 'michigan_inflation',
  FEDFUNDS: 'fed_funds_rate',
  DGS10: 'treasury_10y',
  DFII10: 'real_rate_10y',
};

const HERO_CONFIG: Record<string, {
  primary: string;
  secondary: string;
  label: string;
  format: (ind: RiskIndicator) => string;
  interpret: (ind: RiskIndicator) => { color: string };
}> = {
  inflation: {
    primary: 'CPIAUCSL',
    secondary: 'T5YIE',
    label: 'CPI MoM change',
    format: (ind) => {
      const c = ind.change;
      if (c == null) return 'N/A';
      return `${c >= 0 ? '+' : ''}${c.toFixed(2)}%`;
    },
    interpret: (ind) => {
      const c = ind.change;
      if (c == null) return { color: 'amber' };
      if (Math.abs(c) <= 0.2) return { color: 'emerald' };
      if (Math.abs(c) <= 0.4) return { color: 'amber' };
      return { color: 'red' };
    },
  },
  rates: {
    primary: 'FEDFUNDS',
    secondary: 'DGS10',
    label: 'Federal Funds Rate',
    format: (ind) => ind.value != null ? `${ind.value.toFixed(2)}%` : 'N/A',
    interpret: (ind) => {
      const v = ind.value;
      if (v == null) return { color: 'amber' };
      if (v < 3) return { color: 'emerald' };
      if (v < 5) return { color: 'amber' };
      return { color: 'red' };
    },
  },
};

const SECONDARY_FORMAT: Record<string, {
  label: string;
  format: (ind: RiskIndicator) => string;
}> = {
  T5YIE: {
    label: '5Y Breakeven',
    format: (ind) => ind.value != null ? `${ind.value.toFixed(2)}%` : 'N/A',
  },
  DGS10: {
    label: '10Y Treasury',
    format: (ind) => ind.value != null ? `${ind.value.toFixed(2)}%` : 'N/A',
  },
};

const INDICATOR_INFO: Record<string, { title: string; description: string }> = {
  cpi: {
    title: 'CPI 消费者价格指数',
    description: '衡量城市消费者一篮子商品和服务价格变动的指标。月环比超过0.3%意味着年化通胀率超过3.5%，可能迫使美联储维持紧缩立场。',
  },
  core_pce: {
    title: '核心 PCE 物价指数',
    description: '剔除食品和能源的个人消费支出物价指数，是美联储首选的通胀度量。美联储的目标是核心PCE年化率回到2%。',
  },
  inflation_expectations_5y: {
    title: '5年期通胀预期',
    description: '由5年期TIPS与名义国债的利差推导，反映市场对未来5年平均通胀的定价。超过2.5%表明市场认为通胀将持续高于目标。',
  },
  michigan_inflation: {
    title: '密歇根通胀预期',
    description: '密歇根大学调查的1年期消费者通胀预期。消费者预期自我实现：预期上升会推动工资要求和提前消费，形成通胀螺旋。',
  },
  fed_funds_rate: {
    title: '联邦基金利率',
    description: '美联储设定的银行间隔夜拆借利率目标区间的有效利率。是所有短期利率的锚，直接影响信用卡、汽车贷款和企业短期融资成本。',
  },
  treasury_10y: {
    title: '10年期国债收益率',
    description: '全球资产定价的基准利率。直接决定抵押贷款利率和企业长期融资成本。收益率上升压制股票估值，尤其是成长股。',
  },
  real_rate_10y: {
    title: '10年期实际利率',
    description: '10年期TIPS收益率，剔除通胀预期后的真实资金成本。实际利率越高，资产估值压力越大。超过2%被视为显著限制性水平。',
  },
};

const CHANGE_PERIOD: Record<string, string> = {
  cpi: 'MoM',
  core_pce: 'MoM',
  inflation_expectations_5y: 'DoD',
  michigan_inflation: 'MoM',
  fed_funds_rate: 'MoM',
  treasury_10y: 'DoD',
  real_rate_10y: 'DoD',
};

const CHANGE_AS_PRIMARY = new Set(['cpi', 'core_pce']);

const SUB_DIM_NAMES: Record<string, string> = {
  inflation: '通胀',
  rates: '利率',
};

const SECTION_META: Record<string, { number: string; subtitle: string }> = {
  inflation: { number: '01', subtitle: 'CPI / 核心 PCE / 通胀预期 / 密歇根预期' },
  rates: { number: '02', subtitle: '联邦基金利率 / 10Y 国债 / 10Y 实际利率' },
};

const SECTION_EXPLAINER: Record<string, {
  icon: LucideIcon;
  title: string;
  paragraphs: string[];
  items?: { label: string; text: string }[];
}> = {
  inflation: {
    icon: DollarSign,
    title: '通胀如何影响股市?',
    paragraphs: [
      '通胀衡量的是物价上涨的速度。美联储的目标是把通胀控制在 2% 附近。当通胀高于 2%，美联储倾向于加息压制物价；当通胀回到 2% 附近，美联储才有空间降息。加息压低股价，降息推高股价 — 所以通胀的走向直接决定了美联储的下一步动作，也就决定了股市的方向。',
    ],
    items: [
      { label: 'CPI', text: '覆盖面最广的物价指数，包含食品、能源、住房等。月环比超过 0.3% 就意味着年化通胀率在 3.5% 以上，远高于 2% 目标，股市通常会下跌。' },
      { label: '核心 PCE', text: '剔除食品和能源后的物价指数，美联储制定利率政策时主要看这个。核心 PCE 持续高于 2.5%，市场就会预期美联储不会降息。' },
      { label: '通胀预期 (T5YIE / 密歇根)', text: '市场和消费者认为未来通胀会是多少。如果预期大幅上升，美联储会被迫更激进地加息，对股市冲击更大。' },
    ],
  },
  rates: {
    icon: Percent,
    title: '利率如何影响股市?',
    paragraphs: [
      '利率决定了借钱的成本。利率越高，企业借钱扩张越贵、消费者贷款买房买车越贵，经济增长会放缓。同时，利率越高，投资者可以从国债等无风险资产获得的回报越多，持有股票的吸引力就下降，股价就会承压。反过来，利率下降时，资金会从债券流向股市，推高股价。',
    ],
    items: [
      { label: '联邦基金利率', text: '美联储直接设定的短期利率，所有贷款利率都以它为基准。加息时股市承压，降息时股市受益。' },
      { label: '10Y 国债收益率', text: '长期利率的代表，直接影响房贷利率和企业融资成本。10Y 收益率上升，成长股（如科技股）受冲击最大，因为它们的估值依赖于未来的盈利。' },
      { label: '10Y 实际利率 (TIPS)', text: '扣除通胀后的真实利率水平。实际利率越高，说明货币政策越紧，对所有资产价格的压制越强。超过 2% 通常被认为是显著限制性的水平。' },
    ],
  },
};

const TIME_RANGES = ['1M', '3M', '6M', '1Y', 'ALL'] as const;

// ============================================================================
// Hooks
// ============================================================================

function useInView(threshold = 0.1) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(el);
        }
      },
      { threshold, rootMargin: '0px 0px -40px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return { ref, isVisible };
}

// ============================================================================
// Helper functions
// ============================================================================

function findIndicator(dim: SubDimension, seriesId: string): RiskIndicator | undefined {
  return dim.indicators.find((ind) => ind.series_id === seriesId);
}

function formatRiskValue(value: number | null | undefined, units: string): string {
  if (value === null || value === undefined) return 'N/A';
  if (units.toLowerCase().includes('percent')) return `${value.toFixed(2)}%`;
  const absVal = Math.abs(value);
  if (absVal >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (absVal >= 10_000) return `${(value / 1_000).toFixed(0)}K`;
  if (absVal >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(2);
}

function getColorClass(color: string) {
  if (color === 'emerald') return 'text-emerald-400';
  if (color === 'amber') return 'text-amber-400';
  return 'text-red-400';
}

// ============================================================================
// Components
// ============================================================================

function HeroCardSkeleton({ index }: { index: number }) {
  return (
    <div
      className="bg-card rounded-2xl border border-border/50 p-5"
      style={{ animationDelay: `${index * 100}ms` }}
    >
      <div className="animate-pulse">
        <div className="h-3 w-12 bg-muted rounded mb-3" />
        <div className="h-10 w-28 bg-muted rounded mb-2" />
        <div className="h-3 w-24 bg-muted rounded mb-3" />
        <div className="h-px bg-border my-3" />
        <div className="h-3 w-32 bg-muted rounded" />
      </div>
    </div>
  );
}

function HeroCard({
  dim,
  index,
  selected,
  onSelect,
}: {
  dim: SubDimension;
  index: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const config = HERO_CONFIG[dim.name];
  if (!config) return null;

  const primaryInd = findIndicator(dim, config.primary);
  const secondaryInd = findIndicator(dim, config.secondary);

  const formatted = primaryInd ? config.format(primaryInd) : 'N/A';
  const interpretation = primaryInd ? config.interpret(primaryInd) : { color: 'amber' };

  const secConfig = SECONDARY_FORMAT[config.secondary];
  const secFormatted = secondaryInd && secConfig ? secConfig.format(secondaryInd) : null;

  const accentColor = interpretation.color;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`
        group relative rounded-2xl p-5 flex flex-col text-left
        transition-all duration-300 ease-out cursor-pointer
        ${selected
          ? 'bg-card border-2 translate-y-[-3px]'
          : 'bg-card/60 border border-border/40 hover:bg-card hover:border-border/60 hover:translate-y-[-2px]'
        }
        ${selected
          ? accentColor === 'emerald' ? 'border-emerald-500' :
            accentColor === 'amber' ? 'border-amber-500' :
            'border-red-500'
          : ''
        }
      `}
      style={{
        boxShadow: selected
          ? accentColor === 'emerald' ? '0 8px 32px rgba(16,185,129,0.15), 0 0 0 1px rgba(16,185,129,0.1)' :
            accentColor === 'amber' ? '0 8px 32px rgba(245,158,11,0.15), 0 0 0 1px rgba(245,158,11,0.1)' :
            '0 8px 32px rgba(239,68,68,0.15), 0 0 0 1px rgba(239,68,68,0.1)'
          : undefined,
        animationDelay: `${index * 120}ms`,
      }}
    >
      {/* Sub-dimension label */}
      <div className="mb-3">
        <span className="text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
          {SUB_DIM_NAMES[dim.name] || dim.name_zh}
        </span>
      </div>

      {/* Primary big number */}
      <div className="mb-1">
        <span className={`text-[2.5rem] font-bold font-data tracking-tighter leading-none transition-colors duration-300 ${
          selected ? getColorClass(accentColor) : 'text-foreground group-hover:text-foreground'
        }`}>
          {formatted}
        </span>
      </div>

      {/* Label */}
      <p className="text-xs text-muted-foreground mb-3">{config.label}</p>

      {/* Divider */}
      <div className="h-px bg-border/50 mb-3 mt-auto" />

      {/* Secondary metric */}
      {secConfig && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{secConfig.label}</span>
          <span className="font-data font-medium text-foreground">{secFormatted || 'N/A'}</span>
        </div>
      )}

      {/* Hover hint */}
      <div className={`absolute inset-x-0 bottom-2 flex justify-center transition-opacity duration-200 ${
        selected ? 'opacity-0' : 'opacity-0 group-hover:opacity-100'
      }`}>
        <span className="text-[10px] text-muted-foreground bg-background/80 px-2 py-0.5 rounded-full backdrop-blur-sm">
          点击查看详情
        </span>
      </div>
    </button>
  );
}

function MetricPanel({
  indicator,
  chartKey,
  theme,
  interval,
}: {
  indicator: RiskIndicator;
  chartKey: string;
  theme: 'light' | 'dark';
  interval: string;
}) {
  const { ref, isVisible } = useInView(0.05);
  const info = INDICATOR_INFO[chartKey];
  const symbol = FRED_SYMBOLS[chartKey];
  const period = CHANGE_PERIOD[chartKey];

  if (!info || !symbol) return null;

  const isIndexSeries = CHANGE_AS_PRIMARY.has(chartKey);
  const hasChange = indicator.change != null;
  const isPositive = hasChange && indicator.change! >= 0;

  let primaryDisplay: string;
  let secondaryDisplay: string | null = null;

  if (isIndexSeries && hasChange) {
    primaryDisplay = `${isPositive ? '+' : ''}${indicator.change!.toFixed(2)}%`;
    secondaryDisplay = formatRiskValue(indicator.value, indicator.units);
  } else {
    primaryDisplay = formatRiskValue(indicator.value, indicator.units);
  }

  return (
    <div
      ref={ref}
      className={`h-full flex flex-col bg-card/60 rounded-xl border border-border/40 overflow-hidden transition-all duration-500 ease-out ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
      }`}
    >
      {/* Header: title + value & change on one line */}
      <div className="flex-1 px-4 pt-4 pb-3">
        <div className="flex items-baseline justify-between gap-3">
          <h4 className="text-sm font-medium text-foreground truncate">{info.title}</h4>
          <div className="flex items-baseline gap-2 shrink-0">
            <span className={`text-xl font-bold font-data tracking-tight ${
              isIndexSeries && hasChange
                ? isPositive ? 'text-emerald-500' : 'text-red-500'
                : 'text-foreground'
            }`}>
              {primaryDisplay}
            </span>
            {isIndexSeries ? (
              secondaryDisplay && (
                <span className="text-xs font-data text-muted-foreground">
                  {period} / {secondaryDisplay}
                </span>
              )
            ) : (
              hasChange && (
                <span className={`text-xs font-data font-medium ${isPositive ? 'text-emerald-500' : 'text-red-500'}`}>
                  {period} {isPositive ? '+' : ''}{indicator.change!.toFixed(2)}%
                </span>
              )
            )}
          </div>
        </div>

        {/* Description */}
        <p className="text-xs text-muted-foreground leading-relaxed mt-2">
          {info.description}
        </p>
      </div>

      {/* Chart */}
      <div className="border-t border-border/30">
        <TradingViewWidget symbol={symbol} height={300} interval={interval} theme={theme} />
      </div>
    </div>
  );
}

function DeepDiveSection({
  dim,
  theme,
  interval,
  timeRange,
  onTimeRangeChange,
}: {
  dim: SubDimension;
  theme: 'light' | 'dark';
  interval: string;
  timeRange: string;
  onTimeRangeChange: (range: string) => void;
}) {
  const { ref, isVisible } = useInView();
  const meta = SECTION_META[dim.name];

  const metricPanels = dim.indicators
    .map((ind) => {
      const chartKey = SERIES_TO_CHART[ind.series_id];
      return chartKey ? { indicator: ind, chartKey } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return (
    <section className="relative">
      <div
        ref={ref}
        className={`relative transition-all duration-700 ease-out ${
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}
      >
        {/* Section header row: title + time range selector */}
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="flex items-start gap-3 min-w-0">
            <span className="text-[2rem] font-data font-bold leading-none text-foreground tracking-tighter select-none">
              {meta?.number || '00'}
            </span>
            <div className="pt-0.5 min-w-0">
              <h2 className="text-lg font-editorial text-foreground tracking-tight mb-0.5">
                {dim.name_zh}详解
              </h2>
              <p className="text-xs text-muted-foreground tracking-wide">
                {meta?.subtitle}
              </p>
            </div>
          </div>

          {/* Time range selector */}
          <div className="flex items-center bg-muted/50 rounded-lg p-0.5 border border-border/30 shrink-0">
            {TIME_RANGES.map((range) => (
              <button
                key={range}
                onClick={() => onTimeRangeChange(range)}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all ${
                  timeRange === range
                    ? 'bg-emerald-500/15 text-emerald-500 shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {range}
              </button>
            ))}
          </div>
        </div>

        {/* Section explainer banner */}
        {SECTION_EXPLAINER[dim.name] && (
          <div className="bg-muted/30 rounded-xl border border-border/40 p-5 mb-5">
            <div className="flex items-start gap-3">
              {(() => { const Icon = SECTION_EXPLAINER[dim.name].icon; return (
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Icon className="w-4 h-4 text-emerald-500" strokeWidth={1.5} />
              </div>
              ); })()}
              <div>
                <h3 className="text-base font-medium text-foreground mb-2">
                  {SECTION_EXPLAINER[dim.name].title}
                </h3>
                {SECTION_EXPLAINER[dim.name].paragraphs.map((p, i) => (
                  <p key={i} className="text-sm text-muted-foreground leading-relaxed mt-2 first:mt-0">
                    {p}
                  </p>
                ))}
                {SECTION_EXPLAINER[dim.name].items && (
                  <ul className="text-sm text-muted-foreground leading-relaxed mt-3 space-y-1.5 list-none">
                    {SECTION_EXPLAINER[dim.name].items!.map((item, i) => (
                      <li key={i}>
                        <span className="text-emerald-500 font-medium">{item.label}</span>
                        {' '}&mdash; {item.text}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Metric panels */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {metricPanels.map(({ indicator, chartKey }) => (
            <MetricPanel
              key={chartKey}
              indicator={indicator}
              chartKey={chartKey}
              theme={theme}
              interval={interval}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function InflationRatesPage() {
  const [timeRange, setTimeRange] = useState<'1M' | '3M' | '6M' | '1Y' | 'ALL'>('6M');
  const [theme] = useState<'light' | 'dark'>('dark');
  const [data, setData] = useState<EconomicFundamentals | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [selectedDim, setSelectedDim] = useState<string>('inflation');
  const [isTransitioning, setIsTransitioning] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.getInflationRates();
      if (response.success) {
        setData(response.data);
        setLastUpdated(response.timestamp);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
      console.error('Error fetching inflation & rates:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const getInterval = () => {
    switch (timeRange) {
      case '1M': return 'D';
      case '3M': return 'D';
      case '6M': return 'W';
      case '1Y': return 'W';
      case 'ALL': return 'M';
      default: return 'W';
    }
  };

  const inflationDim = data?.sub_dimensions.find((d) => d.name === 'inflation');
  const ratesDim = data?.sub_dimensions.find((d) => d.name === 'rates');
  const orderedDims = [inflationDim, ratesDim].filter((d): d is SubDimension => d != null);

  return (
    <main className="min-h-screen bg-background">
      <MacroPageHeader
        section="Inflation & Rates"
        title="通胀与利率"
        question="物价压力如何? 美联储会怎么做?"
        lastUpdated={lastUpdated ? formatTimestamp(lastUpdated) : null}
        loading={loading}
        onRefresh={fetchData}
      />

      {/* Error */}
      {error && (
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-4">
          <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
            {error}
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 space-y-8">

        {/* Hero Section: 2 big-number cards (tabs) */}
        <section>
          <div className="grid grid-cols-2 gap-4">
            {loading ? (
              [0, 1].map((i) => <HeroCardSkeleton key={i} index={i} />)
            ) : (
              orderedDims.map((dim, i) => (
                <HeroCard
                  key={dim.name}
                  dim={dim}
                  index={i}
                  selected={selectedDim === dim.name}
                  onSelect={() => {
                    if (selectedDim === dim.name) return;
                    setIsTransitioning(true);
                    setTimeout(() => {
                      setSelectedDim(dim.name);
                      setIsTransitioning(false);
                    }, 200);
                  }}
                />
              ))
            )}
          </div>
        </section>

        {/* Deep Dive: Only selected dimension */}
        {orderedDims
          .filter((dim) => dim.name === selectedDim)
          .map((dim) => (
            <div
              key={dim.name}
              className={`transition-all duration-300 ease-out ${
                isTransitioning ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'
              }`}
            >
              <DeepDiveSection
                dim={dim}
                theme={theme}
                interval={getInterval()}
                timeRange={timeRange}
                onTimeRangeChange={(r) => setTimeRange(r as typeof timeRange)}
              />
            </div>
          ))}

        {/* Footer */}
        <section className="text-center py-4">
          <Link
            href="/tools"
            className="group inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-emerald-400 transition-colors duration-200"
          >
            <svg className="w-4 h-4 transition-transform duration-200 group-hover:-translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
            </svg>
            返回宏观总览
          </Link>
          <p className="text-[11px] text-muted-foreground/60 mt-3">
            数据来源{' '}
            <a href="https://fred.stlouisfed.org/" target="_blank" rel="noopener noreferrer" className="text-emerald-500 hover:text-emerald-400 transition-colors">
              FRED
            </a>
            {' '}&middot;{' '}图表{' '}
            <a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer" className="text-emerald-500 hover:text-emerald-400 transition-colors">
              TradingView
            </a>
          </p>
        </section>
      </div>
    </main>
  );
}
