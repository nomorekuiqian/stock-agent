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

// ============================================================================
// Constants
// ============================================================================

const FRED_SYMBOLS: Record<string, string> = {
  gdp_growth: 'FRED:A191RL1Q225SBEA',
  recession_prob: 'FRED:RECPROUSM156N',
  cfnai: 'FRED:CFNAI',
  consumer_sentiment: 'FRED:UMCSENT',
  retail_sales: 'FRED:RSAFS',
  industrial_production: 'FRED:INDPRO',
  unemployment: 'FRED:UNRATE',
  nonfarm_payrolls: 'FRED:PAYEMS',
  initial_claims: 'FRED:ICSA',
  continued_claims: 'FRED:CCSA',
  sahm_rule: 'FRED:SAHMREALTIME',
  cpi: 'FRED:CPIAUCSL',
  core_pce: 'FRED:PCEPILFE',
  inflation_expectations_5y: 'FRED:T5YIE',
  michigan_inflation: 'FRED:MICH',
  hy_oas: 'FRED:BAMLH0A0HYM2',
  bbb_spread: 'FRED:BAMLC0A4CBBB',
  cre_delinquency: 'FRED:DRCRELEXFACBS',
  business_delinquency: 'FRED:DRBLACBS',
  yield_curve: 'FRED:T10Y2Y',
};

const SERIES_TO_CHART: Record<string, string> = {
  A191RL1Q225SBEA: 'gdp_growth',
  RECPROUSM156N: 'recession_prob',
  CFNAI: 'cfnai',
  UMCSENT: 'consumer_sentiment',
  RSAFS: 'retail_sales',
  INDPRO: 'industrial_production',
  UNRATE: 'unemployment',
  PAYEMS: 'nonfarm_payrolls',
  ICSA: 'initial_claims',
  CCSA: 'continued_claims',
  SAHMREALTIME: 'sahm_rule',
  CPIAUCSL: 'cpi',
  PCEPILFE: 'core_pce',
  T5YIE: 'inflation_expectations_5y',
  MICH: 'michigan_inflation',
  BAMLH0A0HYM2: 'hy_oas',
  BAMLC0A4CBBB: 'bbb_spread',
  DRCRELEXFACBS: 'cre_delinquency',
  DRBLACBS: 'business_delinquency',
  T10Y2Y: 'yield_curve',
};

const HERO_CONFIG: Record<string, {
  primary: string;
  secondary: string;
  label: string;
  format: (ind: RiskIndicator) => string;
  interpret: (ind: RiskIndicator) => { color: string };
}> = {
  growth: {
    primary: 'A191RL1Q225SBEA',
    secondary: 'RECPROUSM156N',
    label: 'GDP 季度年化增长率',
    format: (ind) => ind.value != null ? `${ind.value.toFixed(1)}%` : 'N/A',
    interpret: (ind) => {
      const v = ind.value;
      if (v == null) return { color: 'amber' };
      if (v >= 2) return { color: 'emerald' };
      if (v >= 0) return { color: 'amber' };
      return { color: 'red' };
    },
  },
  employment: {
    primary: 'UNRATE',
    secondary: 'PAYEMS',
    label: '失业率',
    format: (ind) => ind.value != null ? `${ind.value.toFixed(1)}%` : 'N/A',
    interpret: (ind) => {
      const v = ind.value;
      if (v == null) return { color: 'amber' };
      if (v < 4) return { color: 'emerald' };
      if (v < 5) return { color: 'amber' };
      return { color: 'red' };
    },
  },
  inflation: {
    primary: 'CPIAUCSL',
    secondary: 'T5YIE',
    label: 'CPI 月环比通胀率',
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
  credit: {
    primary: 'T10Y2Y',
    secondary: 'BAMLH0A0HYM2',
    label: '10Y-2Y 收益率曲线',
    format: (ind) => {
      const v = ind.value;
      if (v == null) return 'N/A';
      return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
    },
    interpret: (ind) => {
      const v = ind.value;
      if (v == null) return { color: 'amber' };
      if (v > 0.5) return { color: 'emerald' };
      if (v >= 0) return { color: 'amber' };
      return { color: 'red' };
    },
  },
};

const SECONDARY_FORMAT: Record<string, {
  label: string;
  format: (ind: RiskIndicator) => string;
}> = {
  RECPROUSM156N: {
    label: '衰退概率',
    format: (ind) => ind.value != null ? `${ind.value.toFixed(0)}%` : 'N/A',
  },
  PAYEMS: {
    label: '非农就业',
    format: (ind) => ind.change != null ? `${ind.change >= 0 ? '+' : ''}${ind.change.toFixed(1)}% MoM` : 'N/A',
  },
  MICH: {
    label: '消费者通胀预期',
    format: (ind) => ind.value != null ? `${ind.value.toFixed(1)}%` : 'N/A',
  },
  T5YIE: {
    label: '5年期通胀预期',
    format: (ind) => ind.value != null ? `${ind.value.toFixed(2)}%` : 'N/A',
  },
  BAMLH0A0HYM2: {
    label: '高收益债利差',
    format: (ind) => ind.value != null ? `${(ind.value * 100).toFixed(0)}bps` : 'N/A',
  },
};

const INDICATOR_INFO: Record<string, { title: string; description: string }> = {
  gdp_growth: {
    title: 'GDP 实际增长率',
    description: '美国实际GDP季度环比年化增长率。2%以上为健康增长，0-2%增长低迷，连续两个季度负增长是技术性衰退的定义。',
  },
  recession_prob: {
    title: '平滑衰退概率',
    description: 'Piger & Chauvet 基于非农就业、工业产出、实际收入和实际销售的平滑衰退概率模型。超过30%的读数与 NBER 衰退期吻合。',
  },
  cfnai: {
    title: '芝加哥联储国家活动指数',
    description: '85项月度经济指标的加权平均。低于-0.70表明衰退可能性上升。正值表示经济增长高于趋势水平。',
  },
  consumer_sentiment: {
    title: '消费者信心指数',
    description: '密歇根大学消费者信心指数。信心大幅下降通常预示消费支出减少。低于60的读数与衰退期吻合。',
  },
  retail_sales: {
    title: '零售销售',
    description: '预估零售销售月度数据，消费支出占GDP约70%。环比负增长通常预示经济放缓，持续下滑可能触发衰退。',
  },
  industrial_production: {
    title: '工业产出指数',
    description: '衡量制造业、采矿业和公用事业的实际产出。连续下滑是经济衰退的同步指标，领先于GDP数据发布。',
  },
  unemployment: {
    title: '失业率',
    description: '失业率从周期低点持续上升0.5个百分点以上是可靠的衰退信号。周期低点的背景比绝对水平更重要。',
  },
  nonfarm_payrolls: {
    title: '非农就业',
    description: '最受关注的月度就业指标。环比负增长通常只在衰退期出现。趋势比单月数据更重要。',
  },
  initial_claims: {
    title: '初请失业金人数',
    description: '最及时的劳动力市场指标。持续突破25万通常表明劳动力市场恶化，领先失业率上升2-4个月。',
  },
  continued_claims: {
    title: '续请失业金人数',
    description: '反映失业者重新就业的难度。持续上升意味着找工作变难，超过200万人表明就业市场显著恶化。',
  },
  sahm_rule: {
    title: 'Sahm 规则指标',
    description: '失业率3个月移动平均值比过去12个月低点上升0.50个百分点时触发。自1970年以来准确识别每一次衰退，无误报。',
  },
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
  hy_oas: {
    title: '高收益债利差',
    description: '高收益企业债相对国债的期权调整利差。超过500bps表明显著压力；超过800bps为危机级别。最敏感的实时压力指标之一。',
  },
  bbb_spread: {
    title: 'BBB 公司债利差',
    description: 'BBB是最低投资级评级。利差扩大意味着潜在的降级风险，以及企业部门融资条件收紧。',
  },
  cre_delinquency: {
    title: '商业地产贷款违约率',
    description: '违约率上升可能预示更广泛的银行体系压力，因为商业地产贷款在区域性银行资产负债表中占相当大比例。',
  },
  business_delinquency: {
    title: '商业贷款违约率',
    description: '工商业贷款违约率。上升表明企业偿债困难，通常因收入下降或信贷条件收紧所致。',
  },
  yield_curve: {
    title: '10Y-2Y 收益率曲线',
    description: '倒挂（负值）自1970年以来预测了每一次美国经济衰退。曲线通常在衰退实际开始前恢复正常。',
  },
};

/** Maps chart key to the change period label based on FRED data frequency */
const CHANGE_PERIOD: Record<string, string> = {
  gdp_growth: '较上季度',
  recession_prob: '较上月',
  cfnai: '较上月',
  consumer_sentiment: '较上月',
  retail_sales: '较上月',
  industrial_production: '较上月',
  unemployment: '较上月',
  nonfarm_payrolls: '较上月',
  initial_claims: '较上周',
  continued_claims: '较上周',
  sahm_rule: '较上月',
  cpi: '较上月',
  core_pce: '较上月',
  inflation_expectations_5y: '较前日',
  michigan_inflation: '较上月',
  hy_oas: '较前日',
  bbb_spread: '较前日',
  cre_delinquency: '较上季度',
  business_delinquency: '较上季度',
  yield_curve: '较前日',
};

const SUB_DIM_NAMES: Record<string, string> = {
  growth: '增长',
  employment: '就业',
  inflation: '通胀',
  credit: '信用',
};

const SECTION_META: Record<string, { number: string; subtitle: string }> = {
  growth: { number: '01', subtitle: 'GDP / 衰退概率 / CFNAI / 零售销售 / 工业产出 / 消费者信心' },
  employment: { number: '02', subtitle: '失业率 / 非农 / 初请 / 续请 / Sahm 规则' },
  inflation: { number: '03', subtitle: 'CPI / 核心 PCE / 通胀预期 / 密歇根预期' },
  credit: { number: '04', subtitle: '高收益利差 / BBB 利差 / 地产违约 / 商贷违约 / 收益率曲线' },
};

/** Index-level series where MoM change should be displayed as primary value */
const CHANGE_AS_PRIMARY = new Set(['cpi', 'core_pce', 'retail_sales', 'industrial_production']);

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

/**
 * Unified indicator panel: value + change + description + chart in one component.
 * Replaces the old separate IndicatorCard + ChartBlock.
 */
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

  // For index-level series (CPI, PCE, retail sales, industrial production),
  // show MoM change as the primary value since the index level isn't intuitive
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

        {/* Metric panels: each indicator with value + description + chart */}
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

export default function EconomyPage() {
  const [timeRange, setTimeRange] = useState<'1M' | '3M' | '6M' | '1Y' | 'ALL'>('6M');
  const [theme] = useState<'light' | 'dark'>('dark');
  const [data, setData] = useState<EconomicFundamentals | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [selectedDim, setSelectedDim] = useState<string>('growth');
  const [isTransitioning, setIsTransitioning] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.getEconomicFundamentals();
      if (response.success) {
        setData(response.data);
        setLastUpdated(response.timestamp);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
      console.error('Error fetching economic fundamentals:', err);
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

  const growthDim = data?.sub_dimensions.find((d) => d.name === 'growth');
  const employmentDim = data?.sub_dimensions.find((d) => d.name === 'employment');
  const inflationDim = data?.sub_dimensions.find((d) => d.name === 'inflation');
  const creditDim = data?.sub_dimensions.find((d) => d.name === 'credit');
  const orderedDims = [growthDim, employmentDim, inflationDim, creditDim].filter((d): d is SubDimension => d != null);

  return (
    <main className="min-h-screen bg-background">
      <MacroPageHeader
        section="Economy"
        title="经济基本面"
        question="经济是在变好还是变差?"
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

        {/* Hero Section: 4 big-number cards (tabs) */}
        <section>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {loading ? (
              [0, 1, 2, 3].map((i) => <HeroCardSkeleton key={i} index={i} />)
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
