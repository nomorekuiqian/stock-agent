'use client';

/**
 * Shared components and constants for the Sentiment dimension.
 *
 * Used by:
 *  - macro/sentiment/page.tsx  (standalone full page)
 *  - research/_components/SentimentView.tsx  (research panel tab)
 */

import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import type { SubDimension, RiskIndicator } from '@/lib/api';
import { ShieldAlert, Activity, type LucideIcon } from 'lucide-react';

// ---------------------------------------------------------------------------
// Dynamic chart imports
// ---------------------------------------------------------------------------

export const TradingViewWidget = dynamic(
  () => import('@/components/TradingViewWidget').then(mod => mod.TradingViewWidget),
  { ssr: false, loading: () => <div className="h-[400px] bg-card animate-pulse rounded-lg" /> },
);
export const IndexAreaChart = dynamic(
  () => import('@/components/IndexAreaChart').then(mod => mod.IndexAreaChart),
  { ssr: false, loading: () => <div className="h-[250px] bg-card animate-pulse rounded-lg" /> },
);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const SUB_DIM_NAMES: Record<string, string> = {
  cnn_indicators: '恐慌贪婪',
  volatility: '波动率',
};

export const DIM_ORDER = ['cnn_indicators', 'volatility'];

export const HERO_CONFIG: Record<string, {
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
};

export const CNN_COMPONENT_INFO: Record<string, { description: string }> = {
  CNN_STOCK_PRICE_STRENGTH: { description: 'S&P 500 股票中处于 52 周高点附近 vs 52 周低点附近的数量对比。越多股票接近高点，得分越高（贪婪）。' },
  CNN_STOCK_PRICE_BREADTH: { description: 'NYSE 上涨股票成交量 vs 下跌股票成交量之比。上涨成交量占优时得分高。' },
  CNN_PUT_CALL_OPTIONS: { description: 'CBOE 看跌期权与看涨期权的 5 日均值比率。Put/Call < 1 表示看涨情绪（贪婪），> 1 表示看跌情绪（恐慌）。' },
  CNN_MARKET_MOMENTUM: { description: 'S&P 500 相对于 125 日均线的偏离。指数高于均线时得分高，代表上涨动能强劲。' },
  CNN_JUNK_BOND_DEMAND: { description: '垃圾债与投资级债券收益率之差。利差收窄表示风险偏好高（贪婪），利差扩大表示避险（恐慌）。' },
  CNN_MARKET_VOLATILITY: { description: 'VIX 指数相对于 50 日均线的偏离。VIX 低于均线时得分高（市场平静 = 贪婪）。' },
  CNN_SAFE_HAVEN_DEMAND: { description: '国债与股票的 20 日回报之差。资金流入股票时得分高（贪婪），流入国债时得分低（恐慌）。' },
};

export const CHART_CONFIG: Record<string, {
  chartType: 'yfinance' | 'tradingview' | 'none';
  tvSymbol?: string;
  yfSymbol?: string;
  description: string;
}> = {
  VIX: { chartType: 'yfinance', yfSymbol: 'VIX', description: 'CBOE 波动率指数，衡量 S&P 500 期权隐含波动率。VIX > 30 通常表示市场恐慌，< 15 表示市场异常平静。被称为「恐慌指数」，是最直接的市场情绪温度计。' },
  VVIX: { chartType: 'yfinance', yfSymbol: 'VVIX', description: 'VIX 的波动率 -- 衡量市场对 VIX 本身未来波动的预期。VVIX 高意味着市场对未来波动方向存在很大不确定性，通常出现在重大事件（FOMC、财报季）前后。' },
  SKEW: { chartType: 'yfinance', yfSymbol: 'SKEW', description: 'CBOE SKEW 指数，衡量 S&P 500 期权市场对尾部风险（黑天鹅事件）的定价。正常范围 110-130；SKEW > 150 表示市场对极端下行风险的对冲需求异常高，投资者在为黑天鹅买保险。' },
};

export const SECTION_EXPLAINER: Record<string, {
  icon: LucideIcon;
  title: string;
  paragraphs: string[];
  items?: { label: string; text: string }[];
}> = {
  cnn_indicators: {
    icon: ShieldAlert,
    title: '恐慌贪婪指数如何影响投资?',
    paragraphs: ['CNN Fear & Greed Index 综合 7 个市场信号，生成 0-100 的情绪评分。0 表示极度恐慌，100 表示极度贪婪。巴菲特名言「别人恐惧时我贪婪，别人贪婪时我恐惧」就是对这一指标的最好诠释。'],
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
    paragraphs: ['波动率是衡量市场恐慌程度最直接的指标组。VIX 被称为「恐慌指数」，当投资者预期市场将大幅下跌时，他们会大量购买看跌期权来保护自己，推高 VIX。VVIX 和 SKEW 则提供更深层的风险视角。'],
    items: [
      { label: 'VIX', text: '> 30 通常意味着市场恐慌，< 15 意味着市场异常平静（可能是暴风雨前的宁静）。2020 年 3 月 VIX 曾飙升至 82。' },
      { label: 'VVIX', text: 'VIX 的波动率。高 VVIX 意味着市场对波动率方向存在高度不确定性，通常出现在重大事件前后。' },
      { label: 'SKEW', text: '衡量尾部风险定价。正常范围 110-130；> 150 表示市场对黑天鹅事件的对冲需求异常高，投资者在为极端下行情景买保险。' },
    ],
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getRatingZh(score: number): { label: string; color: string } {
  if (score <= 25) return { label: '极度恐慌', color: 'red' };
  if (score <= 45) return { label: '恐慌', color: 'red' };
  if (score <= 55) return { label: '中性', color: 'amber' };
  if (score <= 75) return { label: '贪婪', color: 'emerald' };
  return { label: '极度贪婪', color: 'emerald' };
}

export function findIndicator(dim: SubDimension, seriesId: string): RiskIndicator | null {
  return dim.indicators.find((ind) => ind.series_id === seriesId) ?? null;
}

export function getColorClass(color: string) {
  if (color === 'emerald') return 'text-emerald-400';
  if (color === 'amber') return 'text-amber-400';
  return 'text-red-400';
}

export function getBgColorClass(color: string) {
  if (color === 'emerald') return 'bg-emerald-500/10';
  if (color === 'amber') return 'bg-amber-500/10';
  return 'bg-red-500/10';
}

export function formatIndicatorValue(indicator: RiskIndicator): string {
  const v = indicator.value;
  if (v == null) return 'N/A';
  if (indicator.units === 'Percent') return `${v.toFixed(1)}%`;
  if (indicator.units === 'Ratio') return v.toFixed(2);
  return v.toFixed(2);
}

export function useInView(threshold = 0.1) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const prefersReducedMotion = useRef(false);
  useEffect(() => { prefersReducedMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches; }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion.current) { const raf = requestAnimationFrame(() => setIsVisible(true)); return () => cancelAnimationFrame(raf); }
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setIsVisible(true); observer.unobserve(el); } }, { threshold, rootMargin: '0px 0px -40px 0px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);
  return { ref, isVisible };
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

export function CnnComponentCard({ indicator }: { indicator: RiskIndicator }) {
  const { ref, isVisible } = useInView(0.05);
  const score = indicator.value;
  const info = CNN_COMPONENT_INFO[indicator.series_id];
  const { label, color } = score != null ? getRatingZh(score) : { label: 'N/A', color: 'amber' };

  return (
    <div ref={ref} className={`bg-card/60 rounded-xl border border-border/40 p-4 transition-all duration-500 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <h4 className="text-sm font-medium text-foreground">{indicator.name}</h4>
        <div className={`px-2 py-0.5 rounded-full text-micro font-medium shrink-0 ${getBgColorClass(color)} ${getColorClass(color)}`}>{label}</div>
      </div>
      <div className="flex items-baseline gap-2 mb-3">
        <span className={`text-2xl font-bold font-data tracking-tight ${getColorClass(color)}`}>{score != null ? score.toFixed(0) : 'N/A'}</span>
        <span className="text-xs text-muted-foreground">/100</span>
      </div>
      <div className="w-full h-1 rounded-full bg-muted/50 overflow-hidden mb-3">
        <div className={`h-full rounded-full transition-all duration-700 ${color === 'emerald' ? 'bg-emerald-500' : color === 'amber' ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${score ?? 0}%` }} />
      </div>
      {info && <p className="text-xs text-muted-foreground leading-relaxed">{info.description}</p>}
    </div>
  );
}

export function MarketDataPanel({
  indicator, theme, interval, timeRange,
}: {
  indicator: RiskIndicator; theme: 'light' | 'dark'; interval: string; timeRange: string;
}) {
  const { ref, isVisible } = useInView(0.05);
  const config = CHART_CONFIG[indicator.series_id];
  if (!config) return null;

  const hasChange = indicator.change != null;
  const isPositiveChange = hasChange && indicator.change! >= 0;
  const invertedSeries = new Set(['VIX', 'VVIX', 'SKEW']);
  const isInverted = invertedSeries.has(indicator.series_id);
  const changeColor = isInverted
    ? (isPositiveChange ? 'text-red-500' : 'text-emerald-500')
    : (isPositiveChange ? 'text-emerald-500' : 'text-red-500');

  return (
    <div ref={ref} className={`h-full flex flex-col bg-card/60 rounded-xl border border-border/40 overflow-hidden transition-all duration-500 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
      <div className="flex-1 px-4 pt-4 pb-3">
        <div className="flex items-baseline justify-between gap-3">
          <h4 className="text-sm font-medium text-foreground truncate">{indicator.name}</h4>
          <div className="flex items-baseline gap-2 shrink-0">
            <span className="text-xl font-bold font-data tracking-tight text-foreground">{formatIndicatorValue(indicator)}</span>
            {hasChange && (
              <span className={`text-xs font-data font-medium ${changeColor}`}>{isPositiveChange ? '+' : ''}{indicator.change!.toFixed(2)}%</span>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed mt-2">{config.description}</p>
      </div>
      {config.chartType === 'yfinance' && config.yfSymbol && (
        <div className="border-t border-border/30"><IndexAreaChart symbol={config.yfSymbol!} timeRange={timeRange} height={280} /></div>
      )}
      {config.chartType === 'tradingview' && config.tvSymbol && (
        <div className="border-t border-border/30"><TradingViewWidget symbol={config.tvSymbol} height={300} interval={interval} theme={theme} /></div>
      )}
    </div>
  );
}

export function DeepDiveSection({
  dim, theme, interval, timeRange,
}: {
  dim: SubDimension; theme: 'light' | 'dark'; interval: string; timeRange: string;
}) {
  const explainer = SECTION_EXPLAINER[dim.name];
  const isCnnSection = dim.name === 'cnn_indicators';

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="flex items-start gap-3 min-w-0">
          <div className="pt-0.5 min-w-0">
            <h2 className="text-lg font-editorial text-foreground tracking-tight mb-0.5">{SUB_DIM_NAMES[dim.name] || dim.name_zh}</h2>
            <p className="text-xs text-muted-foreground tracking-wide">{dim.headline}</p>
          </div>
        </div>
      </div>

      {explainer && (
        <div className="bg-muted/30 rounded-xl border border-border/40 p-5 mb-5">
          <div className="flex items-start gap-3">
            {(() => { const Icon = explainer.icon; return (
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Icon className="w-4 h-4 text-primary" strokeWidth={1.5} />
            </div>
            ); })()}
            <div>
              <h3 className="text-base font-medium text-foreground mb-2">{explainer.title}</h3>
              {explainer.paragraphs.map((p, i) => (
                <p key={i} className="text-sm text-muted-foreground leading-relaxed mt-2 first:mt-0">{p}</p>
              ))}
              {explainer.items && (
                <ul className="text-sm text-muted-foreground leading-relaxed mt-3 space-y-1.5 list-none">
                  {explainer.items.map((item, i) => (
                    <li key={i}><span className="text-primary font-medium">{item.label}</span>{' '}&mdash; {item.text}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {isCnnSection ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {dim.indicators.map((ind: RiskIndicator) => (
            <CnnComponentCard key={ind.series_id} indicator={ind} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {dim.indicators.map((ind: RiskIndicator) => (
            <MarketDataPanel key={ind.series_id} indicator={ind} theme={theme} interval={interval} timeRange={timeRange} />
          ))}
        </div>
      )}
    </div>
  );
}
