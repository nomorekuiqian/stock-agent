'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { MacroPageHeader } from '@/components/MacroPageHeader';

const TradingViewWidget = dynamic(
  () => import('@/components/TradingViewWidget').then(mod => mod.TradingViewWidget),
  { ssr: false, loading: () => <div className="h-[400px] bg-card animate-pulse rounded-lg" /> },
);
const CommodityAreaChart = dynamic(
  () => import('@/components/CommodityAreaChart').then(mod => mod.CommodityAreaChart),
  { ssr: false, loading: () => <div className="h-[250px] bg-card animate-pulse rounded-lg" /> },
);
import {
  SubDimension,
  RiskIndicator,
  CpiComponent,
} from '@/lib/api';
import { useInflationRates, useCpiBreakdown, useTreasuryCommodities } from '@/hooks/queries/use-macro-data';
import { useWeeklyReport } from '@/hooks/queries/use-weekly-report';
import { queryKeys } from '@/hooks/queries/query-keys';
import { InsightBanner } from '@/components/InsightBanner';
const YieldCurveChart = dynamic(
  () => import('@/components/YieldCurveChart').then(mod => mod.YieldCurveChart),
  { ssr: false, loading: () => <div className="h-[300px] bg-card animate-pulse rounded-lg" /> },
);
import { formatTimestamp } from '@/lib/timezone';
import { DollarSign, Percent, BarChart3, type LucideIcon } from 'lucide-react';


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
    label: 'CPI 消费者价格指数',
    format: (ind) => ind.value != null ? ind.value.toFixed(1) : 'N/A',
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
  commodities: '大宗商品',
};

const SECTION_META: Record<string, { number: string; subtitle: string }> = {
  inflation: { number: '01', subtitle: 'CPI / 核心 PCE / 通胀预期 / 密歇根预期' },
  rates: { number: '02', subtitle: '收益率曲线 / 关键利差 / 联邦基金利率 / 10Y 国债 / 实际利率' },
  commodities: { number: '03', subtitle: '黄金 / 白银 / 原油 / 铜 / 美元指数' },
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
      { label: '收益率曲线', text: '展示从 1 个月到 30 年的完整国债收益率。正常情况下长期利率高于短期利率（正斜率），若短期利率反超长期利率则曲线倒挂，历史上是衰退的可靠信号。' },
      { label: '联邦基金利率', text: '美联储直接设定的短期利率，所有贷款利率都以它为基准。加息时股市承压，降息时股市受益。' },
      { label: '10Y 国债收益率', text: '长期利率的代表，直接影响房贷利率和企业融资成本。10Y 收益率上升，成长股（如科技股）受冲击最大，因为它们的估值依赖于未来的盈利。' },
      { label: '10Y 实际利率 (TIPS)', text: '扣除通胀后的真实利率水平。实际利率越高，说明货币政策越紧，对所有资产价格的压制越强。超过 2% 通常被认为是显著限制性的水平。' },
    ],
  },
  commodities: {
    icon: BarChart3,
    title: '大宗商品如何影响股市?',
    paragraphs: [
      '大宗商品价格反映全球供需和风险偏好。黄金是传统避险资产，金价上涨通常说明市场担忧通胀或地缘风险。原油价格直接影响企业成本和消费者支出。美元指数则衡量美元相对一篮子主要货币的强弱 -- 美元走强会压制大宗商品价格和海外收入占比高的美股。',
    ],
    items: [
      { label: '黄金', text: '避险资产和抗通胀工具。金价持续上涨可能反映市场对通胀、央行政策或地缘政治的担忧加剧。' },
      { label: '白银 (Silver)', text: '兼具贵金属避险属性和工业金属属性（电子、太阳能）。金银比偏高时白银被低估，偏低时市场风险偏好较强。' },
      { label: '原油 (Brent)', text: '全球基准油价。油价飙升推高运输和生产成本，侵蚀企业利润，可能加剧通胀。油价暴跌则可能暗示经济需求走弱。' },
      { label: '铜 (Dr. Copper)', text: '铜被称为"铜博士"，因其广泛用于制造业和基建，铜价走势是经济健康的领先指标。铜价上涨通常预示经济扩张，下跌则暗示需求走弱。' },
      { label: '美元指数 (DXY)', text: '衡量美元对六种主要货币的加权平均汇率。美元走强有利于进口但压制出口企业盈利，同时压低以美元计价的大宗商品。' },
    ],
  },
};


function useInView(threshold = 0.1) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  useEffect(() => {
    if (isVisible) return;
    const el = ref.current;
    if (!el) return;

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
  }, [threshold, isVisible]);

  return { ref, isVisible };
}


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

function getColorClass(color: string): string {
  if (color === 'emerald') return 'text-emerald-400';
  if (color === 'amber') return 'text-amber-400';
  return 'text-red-400';
}

function interpretRatio(value: number, high: number, low: number, highText: string, lowText: string, normalText: string): string {
  if (value > high) return highText;
  if (value < low) return lowText;
  return normalText;
}


function SectionExplainerBanner({ sectionName }: { sectionName: string }) {
  const explainer = SECTION_EXPLAINER[sectionName];
  if (!explainer) return null;

  const Icon = explainer.icon;

  return (
    <div className="bg-muted/30 rounded-xl border border-border/40 p-5">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Icon className="w-4 h-4 text-primary" strokeWidth={1.5} />
        </div>
        <div>
          <h3 className="text-base font-medium text-foreground mb-2">
            {explainer.title}
          </h3>
          {explainer.paragraphs.map((p, i) => (
            <p key={i} className="text-sm text-muted-foreground leading-relaxed mt-2 first:mt-0">
              {p}
            </p>
          ))}
          {explainer.items && (
            <ul className="text-sm text-muted-foreground leading-relaxed mt-3 space-y-1.5 list-none">
              {explainer.items.map((item, i) => (
                <li key={i}>
                  <span className="text-primary font-medium">{item.label}</span>
                  {' '}&mdash; {item.text}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ sectionName, title }: { sectionName: string; title?: string }) {
  const meta = SECTION_META[sectionName];
  const displayTitle = title || `${SUB_DIM_NAMES[sectionName] || sectionName}详解`;

  return (
    <div className="flex items-start gap-3 min-w-0">
      <span className="text-3xl font-data font-bold leading-none text-foreground tracking-tighter select-none">
        {meta?.number || '00'}
      </span>
      <div className="pt-0.5 min-w-0">
        <h2 className="text-lg font-editorial text-foreground tracking-tight mb-0.5">
          {displayTitle}
        </h2>
        <p className="text-xs text-muted-foreground tracking-wide">
          {meta?.subtitle}
        </p>
      </div>
    </div>
  );
}

function HeroCardSkeleton({ index }: { index: number }) {
  return (
    <div
      className="bg-card rounded-2xl border border-border/50 p-3 sm:p-5"
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
  cpiYoy,
}: {
  dim: SubDimension;
  index: number;
  selected: boolean;
  onSelect: () => void;
  cpiYoy?: number | null;
}) {
  const config = HERO_CONFIG[dim.name];
  if (!config) return null;

  const primaryInd = findIndicator(dim, config.primary);
  const secondaryInd = findIndicator(dim, config.secondary);

  // Override inflation hero with CPI YoY% when available
  const hasCpiOverride = dim.name === 'inflation' && cpiYoy != null;
  const formatted = hasCpiOverride
    ? `${cpiYoy!.toFixed(1)}%`
    : primaryInd ? config.format(primaryInd) : 'N/A';
  const interpretation = hasCpiOverride
    ? { color: cpiYoy! <= 2.5 ? 'emerald' : cpiYoy! <= 3.5 ? 'amber' : 'red' }
    : primaryInd ? config.interpret(primaryInd) : { color: 'amber' };
  const heroLabel = hasCpiOverride ? 'CPI 同比通胀率' : config.label;

  const secConfig = SECONDARY_FORMAT[config.secondary];
  const secFormatted = secondaryInd && secConfig ? secConfig.format(secondaryInd) : null;

  const accentColor = interpretation.color;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`
        group relative rounded-2xl p-3 sm:p-5 flex flex-col text-left
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
      <div className="mb-2 sm:mb-3">
        <span className="text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground">
          {SUB_DIM_NAMES[dim.name] || dim.name_zh}
        </span>
      </div>

      <div className="mb-1">
        <span className={`text-2xl sm:text-[2.5rem] font-bold font-data tracking-tighter leading-none transition-colors duration-300 ${
          selected ? getColorClass(accentColor) : 'text-foreground group-hover:text-foreground'
        }`}>
          {formatted}
        </span>
      </div>

      <p className="text-xs text-muted-foreground mb-3">{heroLabel}</p>

      <div className="h-px bg-border/50 mb-3 mt-auto" />

      {secConfig && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{secConfig.label}</span>
          <span className="font-data font-medium text-foreground">{secFormatted || 'N/A'}</span>
        </div>
      )}

      <div className={`absolute inset-x-0 bottom-2 flex justify-center transition-opacity duration-200 ${
        selected ? 'opacity-0' : 'opacity-0 group-hover:opacity-100'
      }`}>
        <span className="text-micro text-muted-foreground bg-background/80 px-2 py-0.5 rounded-full">
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

        <p className="text-xs text-muted-foreground leading-relaxed mt-2">
          {info.description}
        </p>
      </div>

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
}: {
  dim: SubDimension;
  theme: 'light' | 'dark';
  interval: string;
}) {
  const { ref, isVisible } = useInView();

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
        <div className="mb-5">
          <SectionHeader sectionName={dim.name} />
        </div>

        <div className="mb-5">
          <SectionExplainerBanner sectionName={dim.name} />
        </div>

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


const SPREAD_NAMES: Record<string, string> = {
  '10y_3m': '10Y - 3M',
  '10y_2y': '10Y - 2Y',
  '30y_10y': '30Y - 10Y',
  '5y_3m': '5Y - 3M',
};

const SPREAD_INFO: Record<string, string> = {
  '10y_3m': '倒挂是衰退最可靠的前瞻信号',
  '10y_2y': '市场最关注的衰退指标',
  '30y_10y': '反映长端通胀预期',
  '5y_3m': '美联储监控的关键利差',
};

function getSpreadColor(key: string, value: number): string {
  if (key === '10y_3m' || key === '10y_2y' || key === '5y_3m') {
    if (value < 0) return 'text-red-400';
    if (value > 0.5) return 'text-emerald-400';
    return 'text-amber-400';
  }
  if (value < 0) return 'text-red-400';
  if (value > 0.3) return 'text-emerald-400';
  return 'text-amber-400';
}


function CommodityPanel({
  title,
  price,
  changePercent,
  chartSymbol,
  description,
  timeRange,
}: {
  title: string;
  price: number | null;
  changePercent: number | null;
  chartSymbol: string;
  description?: string;
  timeRange: string;
}) {
  const { ref, isVisible } = useInView(0.05);
  const isPositive = changePercent != null && changePercent >= 0;

  return (
    <div
      ref={ref}
      className={`h-full flex flex-col bg-card/60 rounded-xl border border-border/40 overflow-hidden transition-all duration-500 ease-out ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
      }`}
    >
      <div className="flex-1 px-4 pt-4 pb-3">
        <div className="flex items-baseline justify-between gap-3">
          <h4 className="text-sm font-medium text-foreground">{title}</h4>
          <div className="flex items-baseline gap-2 shrink-0">
            <span className="text-xl font-bold font-data tracking-tight text-foreground">
              {price != null ? price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'N/A'}
            </span>
            {changePercent != null && (
              <span className={`text-xs font-data font-medium ${isPositive ? 'text-emerald-500' : 'text-red-500'}`}>
                {isPositive ? '+' : ''}{changePercent.toFixed(2)}%
              </span>
            )}
          </div>
        </div>
        {description && (
          <p className="text-xs text-muted-foreground leading-relaxed mt-2">{description}</p>
        )}
      </div>
      <div className="border-t border-border/30">
        <CommodityAreaChart symbol={chartSymbol} timeRange={timeRange} height={280} />
      </div>
    </div>
  );
}


export default function InflationRatesPage() {
  const [theme] = useState<'light' | 'dark'>('dark');
  const [selectedDim, setSelectedDim] = useState<string>('inflation');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [commodityTimeRange, setCommodityTimeRange] = useState('1Y');
  const queryClient = useQueryClient();

  const { data: ratesResponse, isLoading: ratesLoading, error: ratesError } = useInflationRates();
  const { data: cpiResponse, isLoading: cpiLoading } = useCpiBreakdown();
  const { data: tcResponse, isLoading: tcLoading } = useTreasuryCommodities();
  const { data: weeklyResponse, isLoading: weeklyLoading } = useWeeklyReport();

  const loading = ratesLoading || cpiLoading || tcLoading;
  const data = ratesResponse?.success ? ratesResponse.data : null;
  const lastUpdated = ratesResponse?.timestamp ?? null;
  const error = ratesError ? (ratesError instanceof Error ? ratesError.message : 'Failed to fetch data') : null;
  const cpiComponents: CpiComponent[] = cpiResponse?.success ? cpiResponse.components : [];
  const tcData = tcResponse?.success ? tcResponse : null;
  const weeklyReport = weeklyResponse?.success ? weeklyResponse.data : null;

  const inflationDim = data?.sub_dimensions.find((d) => d.name === 'inflation');
  const ratesDim = data?.sub_dimensions.find((d) => d.name === 'rates');
  const orderedDims = [inflationDim, ratesDim].filter((d): d is SubDimension => d != null);

  const cpiHeadline = cpiComponents.find((c) => c.series_id === 'CPIAUCSL');
  const cpiYoy = cpiHeadline?.yoy_pct ?? null;

  // Commodity hero data
  const goldData = tcData?.commodities?.Gold;
  const oilData = tcData?.commodities?.Oil;
  const silverData = tcData?.commodities?.Silver;
  const copperData = tcData?.commodities?.Copper;

  const handleDimSelect = useCallback((dimName: string) => {
    if (selectedDim === dimName) return;
    setIsTransitioning(true);
    setTimeout(() => {
      setSelectedDim(dimName);
      setIsTransitioning(false);
    }, 200);
  }, [selectedDim]);

  return (
    <main className="min-h-screen bg-background">
      <MacroPageHeader
        section="Inflation & Rates"
        title="通胀与利率"
        question="物价压力如何? 美联储会怎么做?"
        lastUpdated={lastUpdated ? formatTimestamp(lastUpdated) : null}
        loading={loading}
        onRefresh={() => queryClient.invalidateQueries({ queryKey: queryKeys.macro.all })}
      />

      {error && (
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-4">
          <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
            {error}
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 space-y-8">

        <section>
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            {loading ? (
              [0, 1, 2].map((i) => <HeroCardSkeleton key={i} index={i} />)
            ) : (
              <>
                {orderedDims.map((dim, i) => (
                  <HeroCard
                    key={dim.name}
                    dim={dim}
                    index={i}
                    selected={selectedDim === dim.name}
                    cpiYoy={cpiYoy}
                    onSelect={() => handleDimSelect(dim.name)}
                  />
                ))}
                <button
                  type="button"
                  onClick={() => handleDimSelect('commodities')}
                  className={`
                    group relative rounded-2xl p-5 flex flex-col text-left
                    transition-all duration-300 ease-out cursor-pointer
                    ${selectedDim === 'commodities'
                      ? 'bg-card border-2 translate-y-[-3px] border-amber-500'
                      : 'bg-card/60 border border-border/40 hover:bg-card hover:border-border/60 hover:translate-y-[-2px]'
                    }
                  `}
                  style={{
                    boxShadow: selectedDim === 'commodities'
                      ? '0 8px 32px rgba(245,158,11,0.15), 0 0 0 1px rgba(245,158,11,0.1)'
                      : undefined,
                    animationDelay: '240ms',
                  }}
                >
                  <div className="mb-3">
                    <span className="text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground">
                      {SUB_DIM_NAMES.commodities}
                    </span>
                  </div>
                  <div className="mb-1">
                    <span className={`text-data-hero font-bold font-data tracking-tighter leading-none transition-colors duration-300 ${
                      selectedDim === 'commodities' ? 'text-amber-400' : 'text-foreground group-hover:text-foreground'
                    }`}>
                      {goldData?.price != null
                        ? `$${goldData.price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
                        : 'N/A'}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">Gold (XAU/USD)</p>
                  <div className="h-px bg-border/50 mb-3 mt-auto" />
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Brent Oil</span>
                    <span className="font-data font-medium text-foreground">
                      {oilData?.price != null ? `$${oilData.price.toFixed(2)}` : 'N/A'}
                    </span>
                  </div>
                  <div className={`absolute inset-x-0 bottom-2 flex justify-center transition-opacity duration-200 ${
                    selectedDim === 'commodities' ? 'opacity-0' : 'opacity-0 group-hover:opacity-100'
                  }`}>
                    <span className="text-micro text-muted-foreground bg-background/80 px-2 py-0.5 rounded-full">
                      点击查看详情
                    </span>
                  </div>
                </button>
              </>
            )}
          </div>
        </section>

        <InsightBanner
          sectionTitle="通胀与利率"
          analysis={weeklyReport?.inflation_analysis ?? null}
          signalColor={weeklyReport?.signal_lights.inflation ?? null}
          weekLabel={weeklyReport?.week_label ?? null}
          loading={weeklyLoading}
        />

        {selectedDim === 'inflation' && cpiComponents.length > 0 && (
          <section>
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-[0.15em] mb-3">
              CPI 通胀细分
            </h3>
            <div className="grid grid-cols-5 gap-3">
              {cpiComponents.map((comp) => {
                const yoy = comp.yoy_pct;
                const yoyColor = yoy == null ? 'text-muted-foreground'
                  : yoy <= 2.0 ? 'text-emerald-500'
                  : yoy <= 3.5 ? 'text-amber-400'
                  : 'text-red-500';
                return (
                  <div
                    key={comp.series_id}
                    className="bg-card/60 rounded-xl border border-border/40 p-4 text-center"
                  >
                    <p className="text-xs text-muted-foreground mb-2">{comp.name_zh}</p>
                    <p className={`text-2xl font-bold font-data tracking-tight ${yoyColor}`}>
                      {yoy != null ? `${yoy.toFixed(1)}%` : '--'}
                    </p>
                    <p className="text-micro text-muted-foreground mt-1">YoY</p>
                    {comp.mom_pct != null && (
                      <p className={`text-xs font-data mt-1 ${comp.mom_pct >= 0 ? 'text-red-400/70' : 'text-emerald-400/70'}`}>
                        {comp.mom_pct >= 0 ? '+' : ''}{comp.mom_pct.toFixed(2)}% MoM
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {selectedDim === 'rates' && (
          <div className={`space-y-6 transition-all duration-300 ease-out ${
            isTransitioning ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'
          }`}>
            {tcData?.treasury?.rates && Object.keys(tcData.treasury.rates).length > 0 && (
              <section>
                <YieldCurveChart
                  rates={tcData.treasury.rates}
                  shape={tcData.treasury.yield_curve_shape}
                  date={tcData.treasury.date}
                />
              </section>
            )}

            {tcData?.treasury?.spreads && Object.keys(tcData.treasury.spreads).length > 0 && (
              <section>
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-[0.15em] mb-3">
                  关键利差
                </h3>
                <div className="grid grid-cols-4 gap-3">
                  {Object.entries(tcData.treasury.spreads).map(([key, value]) => {
                    const bps = Math.round(value * 100);
                    const colorClass = getSpreadColor(key, value);
                    return (
                      <div
                        key={key}
                        className="bg-card/60 rounded-xl border border-border/40 p-4 text-center"
                      >
                        <p className="text-xs text-muted-foreground mb-2">
                          {SPREAD_NAMES[key] || key}
                        </p>
                        <p className={`text-2xl font-bold font-data tracking-tight ${colorClass}`}>
                          {bps > 0 ? '+' : ''}{bps}<span className="text-sm font-normal ml-0.5">bp</span>
                        </p>
                        <p className="text-micro text-muted-foreground mt-2 leading-snug">
                          {SPREAD_INFO[key] || ''}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {ratesDim && (
              <DeepDiveSection dim={ratesDim} theme={theme} interval="W" />
            )}
          </div>
        )}

        {selectedDim === 'inflation' && inflationDim && (
          <div className={`transition-all duration-300 ease-out ${
            isTransitioning ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'
          }`}>
            <DeepDiveSection dim={inflationDim} theme={theme} interval="W" />
          </div>
        )}

        {selectedDim === 'commodities' && (
          <div className={`space-y-6 transition-all duration-300 ease-out ${
            isTransitioning ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'
          }`}>
            <SectionHeader sectionName="commodities" title="大宗商品与美元详解" />

            <SectionExplainerBanner sectionName="commodities" />

            <div className="flex items-center gap-1">
              {['1M', '3M', '6M', '1Y', 'ALL'].map((range) => (
                <button
                  key={range}
                  type="button"
                  onClick={() => setCommodityTimeRange(range)}
                  className={`px-3 py-1.5 text-xs font-data rounded-lg transition-colors ${
                    commodityTimeRange === range
                      ? 'bg-primary/15 text-primary font-medium'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  }`}
                >
                  {range}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <CommodityPanel
                title="黄金 (Gold)"
                price={goldData?.price ?? null}
                changePercent={goldData?.changePercent ?? null}
                chartSymbol="GOLD"
                description="避险资产和抗通胀工具。金价与实际利率呈负相关 -- 实际利率下降时，持有黄金的机会成本降低。"
                timeRange={commodityTimeRange}
              />
              <CommodityPanel
                title="白银 (Silver)"
                price={silverData?.price ?? null}
                changePercent={silverData?.changePercent ?? null}
                chartSymbol="SILVER"
                description="兼具避险属性和工业属性（电子、太阳能）。金银比偏高时白银被低估，偏低时市场风险偏好较强。"
                timeRange={commodityTimeRange}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <CommodityPanel
                title="原油 (Brent)"
                price={oilData?.price ?? null}
                changePercent={oilData?.changePercent ?? null}
                chartSymbol="OIL"
                description="全球基准油价，直接影响运输和生产成本。油价飙升推高通胀，可能加速美联储加息。"
                timeRange={commodityTimeRange}
              />
              <CommodityPanel
                title="铜 (Dr. Copper)"
                price={copperData?.price ?? null}
                changePercent={copperData?.changePercent ?? null}
                chartSymbol="COPPER"
                description="被称为&ldquo;铜博士&rdquo;，因其广泛用于制造业，铜价是经济活动的领先指标。"
                timeRange={commodityTimeRange}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <CommodityPanel
                title="美元指数 (DXY)"
                price={tcData?.dollar?.price ?? null}
                changePercent={tcData?.dollar?.daily_change ?? null}
                chartSymbol="DXY"
                description="衡量美元对六种主要货币的强弱。美元走强压制大宗商品和海外收入占比高的美股。"
                timeRange={commodityTimeRange}
              />
            </div>

            {/* Cross-Market Signals */}
            {goldData?.price && oilData?.price && (() => {
              const goldOilRatio = goldData.price! / oilData.price!;
              const dxyChange = tcData?.dollar?.daily_change ?? 0;
              const dxyPositive = dxyChange >= 0;

              return (
                <section>
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-[0.15em] mb-3">
                    跨市场信号
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-card/60 rounded-xl border border-border/40 p-4">
                      <p className="text-xs text-muted-foreground mb-2">金油比 (Gold/Oil)</p>
                      <p className="text-2xl font-bold font-data tracking-tight text-foreground">
                        {goldOilRatio.toFixed(1)}
                      </p>
                      <p className="text-micro text-muted-foreground mt-2 leading-snug">
                        {interpretRatio(goldOilRatio, 25, 15, '偏高，市场偏向避险', '偏低，风险偏好较强', '处于正常区间')}
                      </p>
                    </div>
                    {silverData?.price && (() => {
                      const goldSilverRatio = goldData.price! / silverData.price!;
                      return (
                        <div className="bg-card/60 rounded-xl border border-border/40 p-4">
                          <p className="text-xs text-muted-foreground mb-2">金银比 (Gold/Silver)</p>
                          <p className="text-2xl font-bold font-data tracking-tight text-foreground">
                            {goldSilverRatio.toFixed(1)}
                          </p>
                          <p className="text-micro text-muted-foreground mt-2 leading-snug">
                            {interpretRatio(goldSilverRatio, 80, 60, '偏高，白银被低估或避险情绪浓', '偏低，市场偏好风险资产', '处于正常区间')}
                          </p>
                        </div>
                      );
                    })()}
                    {copperData?.price && (
                      <div className="bg-card/60 rounded-xl border border-border/40 p-4">
                        <p className="text-xs text-muted-foreground mb-2">铜金比 (Cu/Au)</p>
                        <p className="text-2xl font-bold font-data tracking-tight text-foreground">
                          {((copperData.price! / goldData.price!) * 1000).toFixed(2)}
                        </p>
                        <p className="text-micro text-muted-foreground mt-2 leading-snug">
                          上升反映经济乐观，下降反映避险升温
                        </p>
                      </div>
                    )}
                    <div className="bg-card/60 rounded-xl border border-border/40 p-4">
                      <p className="text-xs text-muted-foreground mb-2">美元 vs 商品</p>
                      <div className="flex items-baseline gap-2">
                        <span className={`text-lg font-bold font-data ${dxyPositive ? 'text-emerald-500' : 'text-red-500'}`}>
                          DXY {dxyPositive ? '+' : ''}{dxyChange.toFixed(2)}%
                        </span>
                      </div>
                      <p className="text-micro text-muted-foreground mt-2 leading-snug">
                        美元走强时商品价格承压
                      </p>
                    </div>
                  </div>
                </section>
              );
            })()}
          </div>
        )}

        <section className="text-center py-4">
          <Link
            href="/macro"
            className="group inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors duration-200"
          >
            <svg className="w-4 h-4 transition-transform duration-200 group-hover:-translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
            </svg>
            返回宏观总览
          </Link>
          <p className="text-xs text-muted-foreground/60 mt-3">
            数据来源{' '}
            <a href="https://fred.stlouisfed.org/" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80 transition-colors">
              FRED
            </a>
            {' '}&middot;{' '}
            <a href="https://financialmodelingprep.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80 transition-colors">
              FMP
            </a>
            {' '}&middot;{' '}图表{' '}
            <a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80 transition-colors">
              TradingView
            </a>
          </p>
        </section>
      </div>
    </main>
  );
}
