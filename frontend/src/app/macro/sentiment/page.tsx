'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { TradingViewWidget } from '@/components/TradingViewWidget';
import { IndexAreaChart } from '@/components/IndexAreaChart';
import { MacroPageHeader } from '@/components/MacroPageHeader';
import {
  api,
  invalidateCache,
  EconomicFundamentals,
  SubDimension,
  RiskIndicator,
  WeeklyMacroReport,
} from '@/lib/api';
import { InsightBanner } from '@/components/InsightBanner';
import { formatTimestamp } from '@/lib/timezone';
import { ShieldAlert, Activity, BarChart3, TrendingDown, type LucideIcon } from 'lucide-react';

// ============================================================================
// Constants
// ============================================================================

const SUB_DIM_NAMES: Record<string, string> = {
  cnn_indicators: '恐慌贪婪',
  volatility: '波动率',
  breadth_options: '市场宽度',
  credit: '信用利差',
};

const DIM_ORDER = ['cnn_indicators', 'volatility', 'breadth_options', 'credit'];

function getRatingZh(score: number): { label: string; color: string } {
  if (score <= 25) return { label: '极度恐慌', color: 'red' };
  if (score <= 45) return { label: '恐慌', color: 'red' };
  if (score <= 55) return { label: '中性', color: 'amber' };
  if (score <= 75) return { label: '贪婪', color: 'emerald' };
  return { label: '极度贪婪', color: 'emerald' };
}

function findIndicator(dim: SubDimension, seriesId: string): RiskIndicator | null {
  return dim.indicators.find((ind) => ind.series_id === seriesId) ?? null;
}

// Hero card config: what metric to show on each tab button
const HERO_CONFIG: Record<string, {
  primary: string;
  secondary?: string;
  label: string;
  secondaryLabel?: string;
  format: (ind: RiskIndicator, dim: SubDimension) => string;
  secondaryFormat?: (ind: RiskIndicator) => string;
  interpret: (ind: RiskIndicator | null, dim: SubDimension) => { color: string };
}> = {
  cnn_indicators: {
    primary: '__overall__',
    label: 'CNN 恐慌贪婪综合评分',
    format: (_ind, dim) => {
      const score = dim.score != null ? dim.score * 10 : null;
      return score != null ? score.toFixed(0) : 'N/A';
    },
    interpret: (_ind, dim) => {
      const score = dim.score != null ? dim.score * 10 : null;
      if (score == null) return { color: 'amber' };
      return getRatingZh(score);
    },
  },
  volatility: {
    primary: 'VIX',
    secondary: 'VVIX',
    label: 'VIX 恐慌指数',
    secondaryLabel: 'VVIX',
    format: (ind) => ind.value != null ? ind.value.toFixed(2) : 'N/A',
    secondaryFormat: (ind) => ind.value != null ? ind.value.toFixed(1) : 'N/A',
    interpret: (ind) => {
      const v = ind?.value;
      if (v == null) return { color: 'amber' };
      if (v < 15) return { color: 'emerald' };
      if (v < 30) return { color: 'amber' };
      return { color: 'red' };
    },
  },
  breadth_options: {
    primary: 'BREADTH',
    secondary: 'PCCE',
    label: 'S&P 500 上涨比例',
    secondaryLabel: '看跌/看涨比率',
    format: (ind) => ind.value != null ? `${ind.value.toFixed(0)}%` : 'N/A',
    secondaryFormat: (ind) => ind.value != null ? ind.value.toFixed(2) : 'N/A',
    interpret: (ind) => {
      const v = ind?.value;
      if (v == null) return { color: 'amber' };
      if (v >= 70) return { color: 'emerald' };
      if (v >= 30) return { color: 'amber' };
      return { color: 'red' };
    },
  },
  credit: {
    primary: 'BAMLH0A0HYM2',
    secondary: 'BAMLC0A4CBBB',
    label: '高收益债利差 (OAS)',
    secondaryLabel: 'BBB 利差',
    format: (ind) => ind.value != null ? `${ind.value.toFixed(2)}%` : 'N/A',
    secondaryFormat: (ind) => ind.value != null ? `${ind.value.toFixed(2)}%` : 'N/A',
    interpret: (ind) => {
      const v = ind?.value;
      if (v == null) return { color: 'amber' };
      if (v < 3) return { color: 'emerald' };
      if (v < 5) return { color: 'amber' };
      return { color: 'red' };
    },
  },
};

const CNN_COMPONENT_INFO: Record<string, { description: string }> = {
  CNN_STOCK_PRICE_STRENGTH: {
    description: 'S&P 500 股票中处于 52 周高点附近 vs 52 周低点附近的数量对比。越多股票接近高点，得分越高（贪婪）。',
  },
  CNN_STOCK_PRICE_BREADTH: {
    description: 'NYSE 上涨股票成交量 vs 下跌股票成交量之比。上涨成交量占优时得分高。',
  },
  CNN_PUT_CALL_OPTIONS: {
    description: 'CBOE 看跌期权与看涨期权的 5 日均值比率。Put/Call < 1 表示看涨情绪（贪婪），> 1 表示看跌情绪（恐慌）。',
  },
  CNN_MARKET_MOMENTUM: {
    description: 'S&P 500 相对于 125 日均线的偏离。指数高于均线时得分高，代表上涨动能强劲。',
  },
  CNN_JUNK_BOND_DEMAND: {
    description: '垃圾债与投资级债券收益率之差。利差收窄表示风险偏好高（贪婪），利差扩大表示避险（恐慌）。',
  },
  CNN_MARKET_VOLATILITY: {
    description: 'VIX 指数相对于 50 日均线的偏离。VIX 低于均线时得分高（市场平静 = 贪婪）。',
  },
  CNN_SAFE_HAVEN_DEMAND: {
    description: '国债与股票的 20 日回报之差。资金流入股票时得分高（贪婪），流入国债时得分低（恐慌）。',
  },
};

// Chart configuration: yfinance for CBOE indices, tradingview for FRED, none for computed
const CHART_CONFIG: Record<string, {
  chartType: 'yfinance' | 'tradingview' | 'none';
  tvSymbol?: string;
  yfSymbol?: string;
  description: string;
}> = {
  VIX: {
    chartType: 'yfinance',
    yfSymbol: 'VIX',
    description: 'CBOE 波动率指数，衡量 S&P 500 期权隐含波动率。VIX > 30 通常表示市场恐慌，< 15 表示市场异常平静。被称为「恐慌指数」，是最直接的市场情绪温度计。',
  },
  VVIX: {
    chartType: 'yfinance',
    yfSymbol: 'VVIX',
    description: 'VIX 的波动率 -- 衡量市场对 VIX 本身未来波动的预期。VVIX 高意味着市场对未来波动方向存在很大不确定性，通常出现在重大事件（FOMC、财报季）前后。',
  },
  SKEW: {
    chartType: 'yfinance',
    yfSymbol: 'SKEW',
    description: 'CBOE SKEW 指数，衡量 S&P 500 期权市场对尾部风险（黑天鹅事件）的定价。SKEW > 150 表示市场对极端下行风险的对冲需求异常高。',
  },
  BREADTH: {
    chartType: 'none',
    description: '当日 S&P 500 代表股中上涨的比例。> 70% 表示广泛上涨（强势市场），< 30% 表示广泛下跌（恐慌抛售）。',
  },
  PCCE: {
    chartType: 'none',
    description: 'CBOE 看跌/看涨期权总量比率。> 1.0 表示看跌者多于看涨者（偏恐慌），< 0.7 表示看涨者占优（偏贪婪）。极端读数往往是反向指标。',
  },
  BAMLH0A0HYM2: {
    chartType: 'tradingview',
    tvSymbol: 'FRED:BAMLH0A0HYM2',
    description: '高收益债券（垃圾债）与同期国债的利差。利差扩大 = 信用风险上升、风险偏好下降（恐慌）；利差收窄 = 信用条件宽松、风险偏好上升（贪婪）。',
  },
  BAMLC0A4CBBB: {
    chartType: 'tradingview',
    tvSymbol: 'FRED:BAMLC0A4CBBB',
    description: 'BBB 级公司债券与同期国债的利差。BBB 是投资级的最低档，利差变动反映市场对企业信用恶化的担忧程度。利差扩大预示经济前景恶化。',
  },
};

const SECTION_EXPLAINER: Record<string, {
  icon: LucideIcon;
  title: string;
  paragraphs: string[];
  items?: { label: string; text: string }[];
}> = {
  cnn_indicators: {
    icon: ShieldAlert,
    title: '恐慌贪婪指数如何影响投资?',
    paragraphs: [
      'CNN Fear & Greed Index 综合 7 个市场信号，生成 0-100 的情绪评分。0 表示极度恐慌，100 表示极度贪婪。巴菲特名言「别人恐惧时我贪婪，别人贪婪时我恐惧」就是对这一指标的最好诠释。',
    ],
    items: [
      { label: '0-25 极度恐慌', text: '市场极度恐慌，可能出现非理性抛售。历史上往往是较好的买入时机，但需要结合基本面判断是否有系统性风险。' },
      { label: '25-45 恐慌', text: '市场偏悲观，投资者风险偏好下降。适合关注被错杀的优质资产。' },
      { label: '45-55 中性', text: '市场情绪中性，无明显方向性偏向。' },
      { label: '55-75 贪婪', text: '市场偏乐观，风险偏好上升。需要警惕追高风险。' },
    ],
  },
  volatility: {
    icon: Activity,
    title: '波动率如何反映市场恐慌?',
    paragraphs: [
      '波动率是衡量市场恐慌程度最直接的指标组。VIX 被称为「恐慌指数」，当投资者预期市场将大幅下跌时，他们会大量购买看跌期权来保护自己，推高 VIX。VVIX 和 SKEW 则提供更深层的风险视角。',
    ],
    items: [
      { label: 'VIX', text: '> 30 通常意味着市场恐慌，< 15 意味着市场异常平静（可能是暴风雨前的宁静）。2020 年 3 月 VIX 曾飙升至 82。' },
      { label: 'VVIX', text: 'VIX 的波动率。高 VVIX 意味着市场对波动率方向存在高度不确定性，通常出现在重大事件前后。' },
      { label: 'SKEW', text: '衡量尾部风险定价。> 150 表示市场对黑天鹅事件的对冲需求异常高，投资者在为极端下行情景买保险。' },
    ],
  },
  breadth_options: {
    icon: BarChart3,
    title: '市场宽度与期权情绪',
    paragraphs: [
      '市场宽度衡量「上涨是否广泛参与」。如果指数上涨但只有少数大盘股带动（宽度差），说明上涨基础脆弱。Put/Call Ratio 则直接反映期权市场的看空/看多力量对比。',
    ],
    items: [
      { label: '市场宽度', text: '> 70% 表示多数股票参与上涨（健康牛市），< 30% 表示下跌广泛（恐慌抛售）。50% 左右是中性。' },
      { label: 'Put/Call 比率', text: '> 1.0 看跌情绪主导（恐慌），< 0.7 看涨情绪主导（贪婪）。极端值往往是反转信号 -- 当所有人都在恐慌时，反弹可能即将到来。' },
    ],
  },
  credit: {
    icon: TrendingDown,
    title: '信用利差与风险偏好',
    paragraphs: [
      '信用利差是债券市场对风险的定价。当投资者担心企业违约风险上升时，他们要求更高的收益率补偿，利差就会扩大。信用市场往往比股市更早反映出经济恶化的信号。',
    ],
    items: [
      { label: '高收益债利差', text: '高收益债（垃圾债）利差。< 3% 表示风险偏好高（贪婪），> 5% 表示避险情绪浓厚（恐慌）。2020 年 3 月利差一度飙升至 10% 以上。' },
      { label: 'BBB 利差', text: 'BBB 级是投资级债券的最低档。如果 BBB 利差快速扩大，可能预示大量「堕落天使」（从投资级降到垃圾级），引发连锁抛售。' },
    ],
  },
};

// ============================================================================
// Hooks
// ============================================================================

function useInView(threshold = 0.1) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const prefersReducedMotion = useRef(false);

  useEffect(() => {
    prefersReducedMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (prefersReducedMotion.current) {
      // Use rAF to defer setState out of the synchronous effect body
      const raf = requestAnimationFrame(() => setIsVisible(true));
      return () => cancelAnimationFrame(raf);
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

function getColorClass(color: string) {
  if (color === 'emerald') return 'text-emerald-400';
  if (color === 'amber') return 'text-amber-400';
  return 'text-red-400';
}

function getBgColorClass(color: string) {
  if (color === 'emerald') return 'bg-emerald-500/10';
  if (color === 'amber') return 'bg-amber-500/10';
  return 'bg-red-500/10';
}

function formatIndicatorValue(indicator: RiskIndicator): string {
  const v = indicator.value;
  if (v == null) return 'N/A';
  if (indicator.units === 'Percent') return `${v.toFixed(1)}%`;
  if (indicator.units === 'Ratio') return v.toFixed(2);
  return v.toFixed(2);
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
  overallScore,
}: {
  dim: SubDimension;
  index: number;
  selected: boolean;
  onSelect: () => void;
  overallScore: number;
}) {
  const config = HERO_CONFIG[dim.name];
  if (!config) return null;

  // Primary indicator
  const primaryInd = config.primary === '__overall__'
    ? null
    : findIndicator(dim, config.primary);

  // For CNN, we use overallScore directly
  const formatted = config.primary === '__overall__'
    ? overallScore.toFixed(0)
    : primaryInd ? config.format(primaryInd, dim) : 'N/A';

  const interpretation = config.primary === '__overall__'
    ? getRatingZh(overallScore)
    : config.interpret(primaryInd, dim);

  // Secondary
  const secondaryInd = config.secondary ? findIndicator(dim, config.secondary) : null;
  const secFormatted = secondaryInd && config.secondaryFormat
    ? config.secondaryFormat(secondaryInd)
    : null;

  const accentColor = interpretation.color;

  // For CNN tab, also show rating label
  const ratingLabel = config.primary === '__overall__'
    ? getRatingZh(overallScore).label
    : null;

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
      {/* Tab label */}
      <div className="mb-3">
        <span className="text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground">
          {SUB_DIM_NAMES[dim.name] || dim.name_zh}
        </span>
      </div>

      {/* Primary big number + optional rating */}
      <div className="mb-1 flex items-baseline gap-2">
        <span className={`text-data-hero font-bold font-data tracking-tighter leading-none transition-colors duration-300 ${
          selected ? getColorClass(accentColor) : 'text-foreground group-hover:text-foreground'
        }`}>
          {formatted}
        </span>
        {ratingLabel && (
          <span className={`text-sm font-medium ${selected ? getColorClass(accentColor) : 'text-muted-foreground'}`}>
            {ratingLabel}
          </span>
        )}
      </div>

      {/* Label */}
      <p className="text-xs text-muted-foreground mb-3">{config.label}</p>

      {/* Divider */}
      <div className="h-px bg-border/50 mb-3 mt-auto" />

      {/* Secondary metric */}
      {config.secondaryLabel && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{config.secondaryLabel}</span>
          <span className="font-data font-medium text-foreground">{secFormatted || 'N/A'}</span>
        </div>
      )}

      {/* CNN: show gauge bar instead of secondary */}
      {config.primary === '__overall__' && (
        <div className="w-full h-1.5 rounded-full bg-muted/50 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${
              accentColor === 'emerald' ? 'bg-emerald-500' :
              accentColor === 'amber' ? 'bg-amber-500' : 'bg-red-500'
            }`}
            style={{ width: `${overallScore}%` }}
          />
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

function CnnComponentCard({ indicator }: { indicator: RiskIndicator }) {
  const { ref, isVisible } = useInView(0.05);
  const score = indicator.value;
  const info = CNN_COMPONENT_INFO[indicator.series_id];
  const { label, color } = score != null ? getRatingZh(score) : { label: 'N/A', color: 'amber' };

  return (
    <div
      ref={ref}
      className={`bg-card/60 rounded-xl border border-border/40 p-4 transition-all duration-500 ease-out ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <h4 className="text-sm font-medium text-foreground">{indicator.name}</h4>
        <div className={`px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0 ${getBgColorClass(color)} ${getColorClass(color)}`}>
          {label}
        </div>
      </div>

      <div className="flex items-baseline gap-2 mb-3">
        <span className={`text-2xl font-bold font-data tracking-tight ${getColorClass(color)}`}>
          {score != null ? score.toFixed(0) : 'N/A'}
        </span>
        <span className="text-xs text-muted-foreground">/100</span>
      </div>

      <div className="w-full h-1 rounded-full bg-muted/50 overflow-hidden mb-3">
        <div
          className={`h-full rounded-full transition-all duration-700 ${
            color === 'emerald' ? 'bg-emerald-500' :
            color === 'amber' ? 'bg-amber-500' : 'bg-red-500'
          }`}
          style={{ width: `${score ?? 0}%` }}
        />
      </div>

      {info && (
        <p className="text-xs text-muted-foreground leading-relaxed">
          {info.description}
        </p>
      )}
    </div>
  );
}

function MarketDataPanel({
  indicator,
  theme,
  interval,
  timeRange,
}: {
  indicator: RiskIndicator;
  theme: 'light' | 'dark';
  interval: string;
  timeRange: string;
}) {
  const { ref, isVisible } = useInView(0.05);
  const config = CHART_CONFIG[indicator.series_id];
  if (!config) return null;

  const hasChange = indicator.change != null;
  const isPositiveChange = hasChange && indicator.change! >= 0;
  const invertedSeries = new Set(['VIX', 'VVIX', 'SKEW', 'BAMLH0A0HYM2', 'BAMLC0A4CBBB']);
  const isInverted = invertedSeries.has(indicator.series_id);
  const changeColor = isInverted
    ? (isPositiveChange ? 'text-red-500' : 'text-emerald-500')
    : (isPositiveChange ? 'text-emerald-500' : 'text-red-500');

  return (
    <div
      ref={ref}
      className={`h-full flex flex-col bg-card/60 rounded-xl border border-border/40 overflow-hidden transition-all duration-500 ease-out ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
      }`}
    >
      <div className="flex-1 px-4 pt-4 pb-3">
        <div className="flex items-baseline justify-between gap-3">
          <h4 className="text-sm font-medium text-foreground truncate">{indicator.name}</h4>
          <div className="flex items-baseline gap-2 shrink-0">
            <span className="text-xl font-bold font-data tracking-tight text-foreground">
              {formatIndicatorValue(indicator)}
            </span>
            {hasChange && (
              <span className={`text-xs font-data font-medium ${changeColor}`}>
                {isPositiveChange ? '+' : ''}{indicator.change!.toFixed(2)}%
              </span>
            )}
          </div>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed mt-2">
          {config.description}
        </p>
      </div>

      {config.chartType === 'yfinance' && config.yfSymbol && (
        <div className="border-t border-border/30">
          <IndexAreaChart symbol={config.yfSymbol!} timeRange={timeRange} height={280} />
        </div>
      )}

      {config.chartType === 'tradingview' && config.tvSymbol && (
        <div className="border-t border-border/30">
          <TradingViewWidget symbol={config.tvSymbol} height={300} interval={interval} theme={theme} />
        </div>
      )}
    </div>
  );
}

function DeepDiveSection({
  dim,
  theme,
  interval,
  timeRange,
}: {
  dim: SubDimension;
  theme: 'light' | 'dark';
  interval: string;
  timeRange: string;
}) {
  const explainer = SECTION_EXPLAINER[dim.name];
  const isCnnSection = dim.name === 'cnn_indicators';

  return (
    <div>
      {/* Section header */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="flex items-start gap-3 min-w-0">
          <div className="pt-0.5 min-w-0">
            <h2 className="text-lg font-editorial text-foreground tracking-tight mb-0.5">
              {SUB_DIM_NAMES[dim.name] || dim.name_zh}
            </h2>
            <p className="text-xs text-muted-foreground tracking-wide">
              {dim.headline}
            </p>
          </div>
        </div>
      </div>

      {/* Section explainer */}
      {explainer && (
        <div className="bg-muted/30 rounded-xl border border-border/40 p-5 mb-5">
          <div className="flex items-start gap-3">
            {(() => { const Icon = explainer.icon; return (
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Icon className="w-4 h-4 text-emerald-500" strokeWidth={1.5} />
            </div>
            ); })()}
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

      {/* Content */}
      {isCnnSection ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {dim.indicators.map((ind: RiskIndicator) => (
            <CnnComponentCard key={ind.series_id} indicator={ind} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {dim.indicators.map((ind: RiskIndicator) => (
            <MarketDataPanel
              key={ind.series_id}
              indicator={ind}
              theme={theme}
              interval={interval}
              timeRange={timeRange}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function SentimentPage() {
  const [theme] = useState<'light' | 'dark'>('dark');
  const [data, setData] = useState<EconomicFundamentals | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [selectedDim, setSelectedDim] = useState<string>('cnn_indicators');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const transitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (transitionTimer.current) clearTimeout(transitionTimer.current);
    };
  }, []);

  // Weekly report state
  const [weeklyReport, setWeeklyReport] = useState<WeeklyMacroReport | null>(null);
  const [weeklyLoading, setWeeklyLoading] = useState(true);

  const fetchData = useCallback(async (bypassCache = false) => {
    if (bypassCache) invalidateCache('market-sentiment');
    setLoading(true);
    setError(null);
    try {
      const response = await api.getMarketSentiment();
      if (response.success) {
        setData(response.data);
        setLastUpdated(response.timestamp);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
      console.error('Error fetching market sentiment:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    api.weeklyReport
      .getLatest()
      .then((res) => {
        if (res.success) setWeeklyReport(res.data);
      })
      .catch(() => {})
      .finally(() => setWeeklyLoading(false));
  }, [fetchData]);

  const overallScore = data?.overall_score ?? 50;

  // Order dimensions consistently
  const orderedDims = data
    ? DIM_ORDER
        .map((name) => data.sub_dimensions.find((d: SubDimension) => d.name === name))
        .filter((d): d is SubDimension => d != null)
    : [];

  return (
    <main className="min-h-screen bg-background">
      <MacroPageHeader
        section="Sentiment"
        title="市场情绪"
        question="市场恐慌还是贪婪? 恐慌指数怎么看?"
        lastUpdated={lastUpdated ? formatTimestamp(lastUpdated) : null}
        loading={loading}
        onRefresh={() => fetchData(true)}
      />

      {/* Error */}
      {error && (
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-4">
          <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
            {error}
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 space-y-10">

        {/* Hero Cards = Tab Buttons */}
        <section>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {loading ? (
              [0, 1, 2, 3].map((i) => <HeroCardSkeleton key={i} index={i} />)
            ) : (
              orderedDims.map((dim, i) => (
                <HeroCard
                  key={dim.name}
                  dim={dim}
                  index={i}
                  selected={selectedDim === dim.name}
                  overallScore={overallScore}
                  onSelect={() => {
                    if (selectedDim === dim.name) return;
                    setIsTransitioning(true);
                    if (transitionTimer.current) clearTimeout(transitionTimer.current);
                    transitionTimer.current = setTimeout(() => {
                      setSelectedDim(dim.name);
                      setIsTransitioning(false);
                      transitionTimer.current = null;
                    }, 200);
                  }}
                />
              ))
            )}
          </div>
        </section>

        {/* Insight Banner */}
        <InsightBanner
          sectionTitle="市场情绪"
          analysis={weeklyReport?.sentiment_analysis ?? null}
          signalColor={weeklyReport?.signal_lights.sentiment ?? null}
          weekLabel={weeklyReport?.week_label ?? null}
          loading={weeklyLoading}
        />

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
                interval="W"
                timeRange="1Y"
              />
            </div>
          ))}

        {/* Loading skeleton for section */}
        {loading && (
          <div className="animate-pulse">
            <div className="h-6 w-48 bg-muted rounded mb-4" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="h-48 bg-muted/50 rounded-xl" />
              <div className="h-48 bg-muted/50 rounded-xl" />
            </div>
          </div>
        )}

        {/* Footer */}
        <section className="text-center py-4">
          <Link
            href="/macro"
            className="group inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-emerald-400 transition-colors duration-200"
          >
            <svg className="w-4 h-4 transition-transform duration-200 group-hover:-translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
            </svg>
            返回宏观总览
          </Link>
          <p className="text-xs text-muted-foreground/60 mt-3">
            数据来源{' '}
            <a href="https://www.cnn.com/markets/fear-and-greed" target="_blank" rel="noopener noreferrer" className="text-emerald-500 hover:text-emerald-400 transition-colors">
              CNN Fear & Greed
            </a>
            {' '}&middot;{' '}
            <a href="https://fred.stlouisfed.org/" target="_blank" rel="noopener noreferrer" className="text-emerald-500 hover:text-emerald-400 transition-colors">
              FRED
            </a>
            {' '}&middot;{' '}
            <a href="https://finance.yahoo.com/" target="_blank" rel="noopener noreferrer" className="text-emerald-500 hover:text-emerald-400 transition-colors">
              Yahoo Finance
            </a>
          </p>
        </section>
      </div>
    </main>
  );
}
