'use client';

/**
 * Shared components and constants for the Inflation & Rates dimension.
 *
 * Used by:
 *  - macro/inflation-rates/page.tsx  (standalone full page)
 *  - research/_components/InflationView.tsx  (research panel tab)
 */

import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import type { SubDimension, RiskIndicator } from '@/lib/api';
import { DollarSign, Percent, BarChart3, type LucideIcon } from 'lucide-react';

// ---------------------------------------------------------------------------
// Dynamic chart imports
// ---------------------------------------------------------------------------

export const FredAreaChart = dynamic(
  () => import('@/components/FredAreaChart').then(mod => mod.FredAreaChart),
  { ssr: false, loading: () => <div className="h-[300px] bg-card animate-pulse rounded-lg" /> },
);
export const TradingViewWidget = dynamic(
  () => import('@/components/TradingViewWidget').then(mod => mod.TradingViewWidget),
  { ssr: false, loading: () => <div className="h-[300px] bg-card animate-pulse rounded-lg" /> },
);
export const CommodityAreaChart = dynamic(
  () => import('@/components/CommodityAreaChart').then(mod => mod.CommodityAreaChart),
  { ssr: false, loading: () => <div className="h-[250px] bg-card animate-pulse rounded-lg" /> },
);
export const YieldCurveChart = dynamic(
  () => import('@/components/YieldCurveChart').then(mod => mod.YieldCurveChart),
  { ssr: false, loading: () => <div className="h-[300px] bg-card animate-pulse rounded-lg" /> },
);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const FRED_SERIES: Record<string, string> = {
  cpi: 'CPIAUCSL', core_pce: 'PCEPILFE', ppi: 'PPIFIS', michigan_inflation: 'MICH',
  fed_funds_rate: 'FEDFUNDS', treasury_10y: 'DGS10', real_rate_10y: 'DFII10',
};

export const SERIES_TO_CHART: Record<string, string> = {
  CPIAUCSL: 'cpi', PCEPILFE: 'core_pce', PPIFIS: 'ppi', MICH: 'michigan_inflation',
  FEDFUNDS: 'fed_funds_rate', DGS10: 'treasury_10y', DFII10: 'real_rate_10y',
};

export const YOY_CHART_SERIES = new Set(['cpi', 'core_pce', 'ppi']);

export const TV_SYMBOLS: Record<string, string> = {
  fed_funds_rate: 'FRED:FEDFUNDS', treasury_10y: 'FRED:DGS10', real_rate_10y: 'FRED:DFII10',
};

export const HERO_CONFIG: Record<string, {
  primary: string;
  secondary: string;
  label: string;
  format: (ind: RiskIndicator) => string;
  interpret: (ind: RiskIndicator) => { color: string };
}> = {
  inflation: {
    primary: 'CPIAUCSL', secondary: 'PPIFIS', label: 'CPI 同比通胀率',
    format: (ind) => ind.value != null ? `${ind.value.toFixed(1)}%` : 'N/A',
    interpret: (ind) => {
      const v = ind.value;
      if (v == null) return { color: 'amber' };
      if (v <= 2.5) return { color: 'emerald' };
      if (v <= 3.5) return { color: 'amber' };
      return { color: 'red' };
    },
  },
  rates: {
    primary: 'FEDFUNDS', secondary: 'DGS10', label: '联邦基金利率',
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

export const SECONDARY_FORMAT: Record<string, {
  label: string;
  format: (ind: RiskIndicator) => string;
}> = {
  PPIFIS: { label: 'PPI 同比', format: (ind) => ind.value != null ? `${ind.value.toFixed(1)}%` : 'N/A' },
  DGS10: { label: '10Y Treasury', format: (ind) => ind.value != null ? `${ind.value.toFixed(2)}%` : 'N/A' },
};

export const INDICATOR_INFO: Record<string, { title: string; description: string }> = {
  cpi: { title: 'CPI 消费者价格指数', description: '衡量城市消费者一篮子商品和服务价格变动的指标。月环比超过0.3%意味着年化通胀率超过3.5%，可能迫使美联储维持紧缩立场。' },
  core_pce: { title: '核心 PCE 物价指数', description: '剔除食品和能源的个人消费支出物价指数，是美联储首选的通胀度量。美联储的目标是核心PCE年化率回到2%。' },
  ppi: { title: 'PPI 生产者价格指数', description: '衡量生产端出厂价格变动的指标，是通胀的领先信号。PPI上升意味着企业成本增加，最终会传导到消费者价格(CPI)。PPI持续高于CPI暗示企业利润率承压。' },
  fed_funds_rate: { title: '联邦基金利率', description: '美联储设定的银行间隔夜拆借利率目标区间的有效利率。是所有短期利率的锚，直接影响信用卡、汽车贷款和企业短期融资成本。' },
  treasury_10y: { title: '10年期国债收益率', description: '全球资产定价的基准利率。直接决定抵押贷款利率和企业长期融资成本。收益率上升压制股票估值，尤其是成长股。' },
  real_rate_10y: { title: '10年期实际利率', description: '10年期TIPS收益率，剔除通胀预期后的真实资金成本。实际利率越高，资产估值压力越大。超过2%被视为显著限制性水平。' },
  michigan_inflation: { title: '消费者通胀预期', description: '密歇根大学调查的消费者对未来一年物价预期。如果老百姓觉得物价会继续涨，他们可能会提前消费，反过来推高通胀（自我实现的预期）。' },
};

export const CHANGE_PERIOD: Record<string, string> = {
  cpi: 'MoM', core_pce: 'MoM', ppi: 'MoM', michigan_inflation: 'MoM',
  fed_funds_rate: 'MoM', treasury_10y: 'DoD', real_rate_10y: 'DoD',
};

export const SUB_DIM_NAMES: Record<string, string> = {
  inflation: '通胀', rates: '利率', commodities: '大宗商品',
};

export const SECTION_META: Record<string, { number: string; subtitle: string }> = {
  inflation: { number: '01', subtitle: 'CPI / 核心 PCE / PPI / 消费者通胀预期' },
  rates: { number: '02', subtitle: '收益率曲线 / 联邦基金利率 / 10Y 国债 / 实际利率' },
  commodities: { number: '03', subtitle: '黄金 / 白银 / 原油 / 铜 / 美元指数' },
};

export const SECTION_EXPLAINER: Record<string, {
  icon: LucideIcon;
  title: string;
  paragraphs: string[];
  items?: { label: string; text: string }[];
}> = {
  inflation: {
    icon: DollarSign,
    title: '通胀如何影响股市?',
    paragraphs: ['通胀衡量的是物价上涨的速度。美联储的目标是把通胀控制在 2% 附近。当通胀高于 2%，美联储倾向于加息压制物价；当通胀回到 2% 附近，美联储才有空间降息。加息压低股价，降息推高股价 -- 所以通胀的走向直接决定了美联储的下一步动作，也就决定了股市的方向。'],
    items: [
      { label: 'CPI', text: '覆盖面最广的物价指数，包含食品、能源、住房等。月环比超过 0.3% 就意味着年化通胀率在 3.5% 以上，远高于 2% 目标，股市通常会下跌。' },
      { label: '核心 PCE', text: '剔除食品和能源后的物价指数，美联储制定利率政策时主要看这个。核心 PCE 持续高于 2.5%，市场就会预期美联储不会降息。' },
      { label: 'PPI', text: '衡量生产端出厂价格变动。PPI 是通胀的领先信号 -- PPI 上升意味着企业成本增加，最终会传导到 CPI。PPI 持续高于 CPI 暗示企业利润率承压。' },
    ],
  },
  rates: {
    icon: Percent,
    title: '利率如何影响股市?',
    paragraphs: ['利率决定了借钱的成本。利率越高，企业借钱扩张越贵、消费者贷款买房买车越贵，经济增长会放缓。同时，利率越高，投资者可以从国债等无风险资产获得的回报越多，持有股票的吸引力就下降，股价就会承压。反过来，利率下降时，资金会从债券流向股市，推高股价。'],
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
    paragraphs: ['大宗商品价格反映全球供需和风险偏好。黄金是传统避险资产，金价上涨通常说明市场担忧通胀或地缘风险。原油价格直接影响企业成本和消费者支出。美元指数则衡量美元相对一篮子主要货币的强弱 -- 美元走强会压制大宗商品价格和海外收入占比高的美股。'],
    items: [
      { label: '黄金', text: '避险资产和抗通胀工具。金价持续上涨可能反映市场对通胀、央行政策或地缘政治的担忧加剧。' },
      { label: '白银 (Silver)', text: '兼具贵金属避险属性和工业金属属性（电子、太阳能）。金银比偏高时白银被低估，偏低时市场风险偏好较强。' },
      { label: '原油 (Brent)', text: '全球基准油价。油价飙升推高运输和生产成本，侵蚀企业利润，可能加剧通胀。油价暴跌则可能暗示经济需求走弱。' },
      { label: '铜 (Dr. Copper)', text: '铜被称为"铜博士"，因其广泛用于制造业和基建，铜价走势是经济健康的领先指标。铜价上涨通常预示经济扩张，下跌则暗示需求走弱。' },
      { label: '美元指数 (DXY)', text: '衡量美元对六种主要货币的加权平均汇率。美元走强有利于进口但压制出口企业盈利，同时压低以美元计价的大宗商品。' },
    ],
  },
};

export const SPREAD_NAMES: Record<string, string> = {
  '10y_3m': '10Y - 3M', '10y_2y': '10Y - 2Y', '30y_10y': '30Y - 10Y', '5y_3m': '5Y - 3M',
};

export const SPREAD_INFO: Record<string, string> = {
  '10y_3m': '倒挂是衰退最可靠的前瞻信号',
  '10y_2y': '市场最关注的衰退指标',
  '30y_10y': '反映长端通胀预期',
  '5y_3m': '美联储监控的关键利差',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function useInView(threshold = 0.1) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  useEffect(() => {
    if (isVisible) return;
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setIsVisible(true); observer.unobserve(el); } },
      { threshold, rootMargin: '0px 0px -40px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold, isVisible]);
  return { ref, isVisible };
}

export function findIndicator(dim: SubDimension, seriesId: string): RiskIndicator | undefined {
  return dim.indicators.find((ind) => ind.series_id === seriesId);
}

export function formatRiskValue(value: number | null | undefined, units: string): string {
  if (value === null || value === undefined) return 'N/A';
  if (units.toLowerCase().includes('percent')) return `${value.toFixed(2)}%`;
  const absVal = Math.abs(value);
  if (absVal >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (absVal >= 10_000) return `${(value / 1_000).toFixed(0)}K`;
  if (absVal >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(2);
}

export function getColorClass(color: string): string {
  if (color === 'emerald') return 'text-emerald-400';
  if (color === 'amber') return 'text-amber-400';
  return 'text-red-400';
}

export function getSpreadColor(key: string, value: number): string {
  if (key === '10y_3m' || key === '10y_2y' || key === '5y_3m') {
    if (value < 0) return 'text-red-400';
    if (value > 0.5) return 'text-emerald-400';
    return 'text-amber-400';
  }
  if (value < 0) return 'text-red-400';
  if (value > 0.3) return 'text-emerald-400';
  return 'text-amber-400';
}

export function interpretRatio(value: number, high: number, low: number, highText: string, lowText: string, normalText: string): string {
  if (value > high) return highText;
  if (value < low) return lowText;
  return normalText;
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

export function SectionExplainerBanner({ sectionName }: { sectionName: string }) {
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
          <h3 className="text-base font-medium text-foreground mb-2">{explainer.title}</h3>
          {explainer.paragraphs.map((p, i) => (
            <p key={i} className="text-sm text-muted-foreground leading-relaxed mt-2 first:mt-0">{p}</p>
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

export function SectionHeader({ sectionName, title }: { sectionName: string; title?: string }) {
  const meta = SECTION_META[sectionName];
  const displayTitle = title || `${SUB_DIM_NAMES[sectionName] || sectionName}详解`;

  return (
    <div className="flex items-start gap-3 min-w-0">
      <span className="text-3xl font-data font-bold leading-none text-foreground tracking-tighter select-none">
        {meta?.number || '00'}
      </span>
      <div className="pt-0.5 min-w-0">
        <h2 className="text-lg font-editorial text-foreground tracking-tight mb-0.5">{displayTitle}</h2>
        <p className="text-xs text-muted-foreground tracking-wide">{meta?.subtitle}</p>
      </div>
    </div>
  );
}

export function MetricPanel({
  indicator, chartKey, timeRange,
}: {
  indicator: RiskIndicator;
  chartKey: string;
  timeRange: string;
}) {
  const { ref, isVisible } = useInView(0.05);
  const info = INDICATOR_INFO[chartKey];
  const seriesId = FRED_SERIES[chartKey];
  const period = CHANGE_PERIOD[chartKey];

  if (!info || !seriesId) return null;

  const hasChange = indicator.change != null;
  const isPositive = hasChange && indicator.change! >= 0;
  const primaryDisplay = formatRiskValue(indicator.value, indicator.units);
  const isYoy = YOY_CHART_SERIES.has(chartKey);

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
            <span className="text-xl font-bold font-data tracking-tight text-foreground">{primaryDisplay}</span>
            {hasChange && (
              <span className={`text-xs font-data font-medium ${isPositive ? 'text-emerald-500' : 'text-red-500'}`}>
                {period} {isPositive ? '+' : ''}{indicator.change!.toFixed(2)}%
              </span>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed mt-2">{info.description}</p>
      </div>
      <div className="border-t border-border/30">
        {TV_SYMBOLS[chartKey] ? (
          <TradingViewWidget symbol={TV_SYMBOLS[chartKey]} height={300} interval="W" theme="dark" />
        ) : (
          <FredAreaChart seriesId={seriesId} timeRange={timeRange} height={300} units={isYoy ? 'pc1' : undefined} valueFormat="percent" />
        )}
      </div>
    </div>
  );
}

export function DeepDiveSection({ dim, timeRange }: { dim: SubDimension; timeRange: string }) {
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
        <div className="mb-5"><SectionHeader sectionName={dim.name} /></div>
        <div className="mb-5"><SectionExplainerBanner sectionName={dim.name} /></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {metricPanels.map(({ indicator, chartKey }) => (
            <MetricPanel key={chartKey} indicator={indicator} chartKey={chartKey} timeRange={timeRange} />
          ))}
        </div>
      </div>
    </section>
  );
}

export function CommodityPanel({
  title, price, changePercent, chartSymbol, description, timeRange,
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
        {description && <p className="text-xs text-muted-foreground leading-relaxed mt-2">{description}</p>}
      </div>
      <div className="border-t border-border/30">
        <CommodityAreaChart symbol={chartSymbol} timeRange={timeRange} height={280} />
      </div>
    </div>
  );
}
