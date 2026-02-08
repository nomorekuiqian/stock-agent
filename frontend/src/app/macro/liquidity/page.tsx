'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { TradingViewWidget } from '@/components/TradingViewWidget';
import { NetLiquidityChart } from '@/components/NetLiquidityChart';
import { NFCIGauge } from '@/components/NFCIGauge';
import { MacroPageHeader } from '@/components/MacroPageHeader';
import {
  api,
  invalidateCache,
  LiquidityMetrics,
  LiquidityMetric,
  LiquidityHistoryObservation,
  WeeklyMacroReport,
} from '@/lib/api';
import { InsightBanner } from '@/components/InsightBanner';
import { formatCompareDateLabel, formatDateTimePacific } from '@/lib/timezone';
import { Droplets, Layers, Gauge } from 'lucide-react';

// ============================================================================
// Constants
// ============================================================================

const FRED_SYMBOLS: Record<string, string> = {
  fedAssets: 'FRED:WALCL',
  tga: 'FRED:WDTGAL',
  rrp: 'FRED:RRPONTSYD',
  reserves: 'FRED:WRESBAL',
  sofr: 'FRED:SOFR',
  effr: 'FRED:EFFR',
  nfci: 'FRED:NFCI',
};

const INDICATOR_INFO: Record<string, { title: string; description: string }> = {
  fedAssets: {
    title: '美联储总资产 (WALCL)',
    description:
      '美联储资产负债表的总规模。当美联储购买国债或MBS时,资产增加,向市场注入流动性(QE);当美联储缩表时,资产减少,回收流动性(QT)。这是影响市场流动性的最核心指标。',
  },
  tga: {
    title: '财政部一般账户 (TGA)',
    description:
      '美国财政部在美联储的存款账户。当财政部发债募资时,TGA余额上升,从市场抽走流动性;当财政部支出时,TGA余额下降,流动性释放回市场。债务上限谈判期间波动通常会加大。',
  },
  rrp: {
    title: '隔夜逆回购 (ON RRP)',
    description:
      '货币市场基金等机构将现金存放在美联储的工具。RRP下降意味着资金从美联储流回市场,释放流动性;RRP上升则吸收市场流动性。当RRP耗尽接近零时,市场将失去这一流动性缓冲,届时QT的紧缩效应将更加明显。',
  },
  reserves: {
    title: '银行准备金 (WRESBAL)',
    description:
      '商业银行存放在美联储的准备金余额。准备金是银行进行借贷和交易的基础。美联储认为准备金在3万亿美元以上属于"充裕"水平,低于该阈值可能触发货币市场压力。',
  },
  sofr: {
    title: 'SOFR (有担保隔夜融资利率)',
    description:
      '基于美国国债回购市场的基准利率,反映银行间短期融资成本。关注SOFR是否稳定在美联储目标区间内——若出现异常波动或突破区间上限,通常预示流动性紧张,如2019年9月的回购市场危机。',
  },
  effr: {
    title: '有效联邦基金利率 (EFFR)',
    description:
      '银行间隔夜无担保借贷的实际利率,是美联储货币政策传导的核心指标。EFFR在目标区间中部表示流动性适中,接近上限暗示流动性趋紧,接近下限则表示流动性充裕。',
  },
  nfci: {
    title: '芝加哥联储金融状况指数 (NFCI)',
    description:
      '综合衡量美国金融状况的指标,包含风险、信贷和杠杆三个维度。负值表示金融条件宽松(有利于风险资产),正值表示金融条件收紧。除当前值外,也需关注变化趋势。',
  },
};

// Tab system
type TabId = 'net_liquidity' | 'balance_sheet' | 'financial_conditions';

const TAB_ORDER: TabId[] = ['net_liquidity', 'balance_sheet', 'financial_conditions'];

const TAB_META: Record<
  TabId,
  {
    name: string;
    number: string;
    subtitle: string;
    primaryKey: keyof LiquidityMetrics;
    secondaryKey: keyof LiquidityMetrics;
    secondaryLabel: string;
    primaryLabel: string;
    format: (m: LiquidityMetric) => string;
    formatSecondary: (m: LiquidityMetric) => string;
    interpret: (m: LiquidityMetric) => string;
  }
> = {
  net_liquidity: {
    name: '净流动性',
    number: '01',
    subtitle: 'WALCL - TGA - RRP / 净流动性公式 / 历史趋势',
    primaryKey: 'net_liquidity',
    secondaryKey: 'reserves',
    secondaryLabel: '银行准备金',
    primaryLabel: 'WALCL - TGA - RRP',
    format: (m) => formatValue(m.value, m.units),
    formatSecondary: (m) => formatValue(m.value, m.units),
    interpret: (m) => {
      if (m.change === null) return 'amber';
      if (m.change >= 0) return 'emerald';
      return 'red';
    },
  },
  balance_sheet: {
    name: '资产负债表',
    number: '02',
    subtitle: 'WALCL / TGA / RRP / 银行准备金',
    primaryKey: 'fed_assets',
    secondaryKey: 'tga',
    secondaryLabel: 'TGA 余额',
    primaryLabel: '美联储总资产',
    format: (m) => formatValue(m.value, m.units),
    formatSecondary: (m) => formatValue(m.value, m.units),
    interpret: (m) => {
      if (m.change === null) return 'amber';
      if (m.change >= 0) return 'emerald';
      return 'amber';
    },
  },
  financial_conditions: {
    name: '金融条件',
    number: '03',
    subtitle: 'SOFR / EFFR / NFCI',
    primaryKey: 'nfci',
    secondaryKey: 'sofr',
    secondaryLabel: 'SOFR',
    primaryLabel: '芝加哥联储金融状况指数',
    format: (m) => (m.value !== null ? m.value.toFixed(2) : 'N/A'),
    formatSecondary: (m) => (m.value !== null ? `${m.value.toFixed(2)}%` : 'N/A'),
    interpret: (m) => {
      if (m.value === null) return 'amber';
      if (m.value < -0.5) return 'emerald';
      if (m.value > 0.5) return 'red';
      return 'amber';
    },
  },
};

const TIME_RANGES = ['1M', '3M', '6M', '1Y', 'ALL'] as const;

// ============================================================================
// Helpers
// ============================================================================

const formatCompareDate = formatCompareDateLabel;

function formatValue(value: number | null, units: string): string {
  if (value === null) return 'N/A';
  if (units.toLowerCase().includes('billion')) {
    if (value >= 1000) return `$${(value / 1000).toFixed(2)}T`;
    return `$${value.toFixed(0)}B`;
  }
  if (units.toLowerCase().includes('million')) {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}T`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}B`;
    return `$${value.toFixed(0)}M`;
  }
  if (units.toLowerCase().includes('percent')) return `${value.toFixed(2)}%`;
  return value.toFixed(2);
}

function getColorClass(color: string) {
  if (color === 'emerald') return 'text-emerald-400';
  if (color === 'amber') return 'text-amber-400';
  return 'text-red-400';
}

// ============================================================================
// Hooks
// ============================================================================

function useInView(threshold = 0.1) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;
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

function LiquidityHeroCard({
  tabId,
  metrics,
  index,
  selected,
  onSelect,
}: {
  tabId: TabId;
  metrics: LiquidityMetrics;
  index: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const config = TAB_META[tabId];
  const primaryMetric = metrics[config.primaryKey];
  const secondaryMetric = metrics[config.secondaryKey];

  const formatted = config.format(primaryMetric);
  const accentColor = config.interpret(primaryMetric);
  const secFormatted = config.formatSecondary(secondaryMetric);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`
        group relative rounded-2xl p-5 flex flex-col text-left
        transition-all duration-300 ease-out cursor-pointer
        ${
          selected
            ? 'bg-card border-2 translate-y-[-3px]'
            : 'bg-card/60 border border-border/40 hover:bg-card hover:border-border/60 hover:translate-y-[-2px]'
        }
        ${
          selected
            ? accentColor === 'emerald'
              ? 'border-emerald-500'
              : accentColor === 'amber'
                ? 'border-amber-500'
                : 'border-red-500'
            : ''
        }
      `}
      style={{
        boxShadow: selected
          ? accentColor === 'emerald'
            ? '0 8px 32px rgba(16,185,129,0.15), 0 0 0 1px rgba(16,185,129,0.1)'
            : accentColor === 'amber'
              ? '0 8px 32px rgba(245,158,11,0.15), 0 0 0 1px rgba(245,158,11,0.1)'
              : '0 8px 32px rgba(239,68,68,0.15), 0 0 0 1px rgba(239,68,68,0.1)'
          : undefined,
        animationDelay: `${index * 120}ms`,
      }}
    >
      {/* Tab label */}
      <div className="mb-3">
        <span className="text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground">
          {config.name}
        </span>
      </div>

      {/* Primary big number */}
      <div className="mb-1">
        <span
          className={`text-data-hero font-bold font-data tracking-tighter leading-none transition-colors duration-300 ${
            selected
              ? getColorClass(accentColor)
              : 'text-foreground group-hover:text-foreground'
          }`}
        >
          {formatted}
        </span>
      </div>

      {/* Label */}
      <p className="text-xs text-muted-foreground mb-3">{config.primaryLabel}</p>

      {/* Divider */}
      <div className="h-px bg-border/50 mb-3 mt-auto" />

      {/* Secondary metric */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{config.secondaryLabel}</span>
        <span className="font-data font-medium text-foreground">
          {secFormatted}
        </span>
      </div>

      {/* Hover hint */}
      <div
        className={`absolute inset-x-0 bottom-2 flex justify-center transition-opacity duration-200 ${
          selected
            ? 'opacity-0'
            : 'opacity-0 group-hover:opacity-100'
        }`}
      >
        <span className="text-micro text-muted-foreground bg-background/80 px-2 py-0.5 rounded-full backdrop-blur-sm">
          点击查看详情
        </span>
      </div>
    </button>
  );
}

function LiquidityMetricPanel({
  indicatorKey,
  metric,
  theme,
  interval,
}: {
  indicatorKey: string;
  metric: LiquidityMetric;
  theme: 'light' | 'dark';
  interval: string;
}) {
  const { ref, isVisible } = useInView(0.05);
  const info = INDICATOR_INFO[indicatorKey];
  const symbol = FRED_SYMBOLS[indicatorKey];

  if (!info || !symbol) return null;

  const hasChange = metric.change != null;
  const isPositive = hasChange && metric.change! >= 0;
  const primaryDisplay = formatValue(metric.value, metric.units);

  return (
    <div
      ref={ref}
      className={`h-full flex flex-col bg-card/60 rounded-xl border border-border/40 overflow-hidden transition-all duration-500 ease-out ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
      }`}
    >
      {/* Header */}
      <div className="flex-1 px-4 pt-4 pb-3">
        <div className="flex items-baseline justify-between gap-3">
          <h4 className="text-sm font-medium text-foreground truncate">
            {info.title}
          </h4>
          <div className="flex items-baseline gap-2 shrink-0">
            <span className="text-xl font-bold font-data tracking-tight text-foreground">
              {primaryDisplay}
            </span>
            {hasChange && (
              <span
                className={`text-xs font-data font-medium ${
                  isPositive ? 'text-emerald-500' : 'text-red-500'
                }`}
              >
                {isPositive ? '+' : ''}
                {metric.change!.toFixed(2)}%
              </span>
            )}
          </div>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed mt-2">
          {info.description}
        </p>
      </div>

      {/* Chart */}
      <div className="border-t border-border/30">
        <TradingViewWidget
          symbol={symbol}
          height={300}
          interval={interval}
          theme={theme}
        />
      </div>
    </div>
  );
}

// ============================================================================
// DeepDive Sections
// ============================================================================

function NetLiquidityDeepDive({
  metrics,
  historyData,
  historyLoading,
  historyError,
  onRetry,
  timeRange,
  onTimeRangeChange,
}: {
  metrics: LiquidityMetrics;
  historyData: LiquidityHistoryObservation[];
  historyLoading: boolean;
  historyError: string | null;
  onRetry: () => void;
  timeRange: string;
  onTimeRangeChange: (range: string) => void;
}) {
  const { ref, isVisible } = useInView();

  return (
    <section className="relative">
      <div
        ref={ref}
        className={`relative transition-all duration-700 ease-out ${
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}
      >
        {/* Section header */}
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="flex items-start gap-3 min-w-0">
            <span className="text-3xl font-data font-bold leading-none text-foreground tracking-tighter select-none">
              01
            </span>
            <div className="pt-0.5 min-w-0">
              <h2 className="text-lg font-editorial text-foreground tracking-tight mb-0.5">
                净流动性详解
              </h2>
              <p className="text-xs text-muted-foreground tracking-wide">
                WALCL - TGA - RRP / 净流动性公式 / 历史趋势
              </p>
            </div>
          </div>

          {/* Time range selector */}
          <div className="flex items-center bg-muted/50 rounded-lg p-0.5 border border-border/30 shrink-0">
            {TIME_RANGES.map((range) => (
              <button
                key={range}
                onClick={() => onTimeRangeChange(range)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
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

        {/* Section explanation banner */}
        <div className="bg-muted/30 rounded-xl border border-border/40 p-5 mb-5">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Droplets className="w-4 h-4 text-emerald-500" strokeWidth={1.5} />
            </div>
            <div>
              <h3 className="text-base font-medium text-foreground mb-2">
                这个板块看什么?
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                净流动性 = 市场上实际能用的钱有多少。你可以把美联储想象成一个大水龙头:
                它印的钱 (WALCL) 是往市场里「放水」,而政府账户 (TGA) 和隔夜逆回购
                (RRP) 是在「抽水」。放的水减去抽的水,就是市场上真正能用的钱。
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed mt-2">
                <code className="bg-muted px-2 py-1 rounded text-emerald-500">
                  净流动性 = 美联储总资产 (WALCL) - TGA - RRP
                </code>
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed mt-2">
                这个数字越大,说明市场上钱越多,对股市等风险资产通常是利好;
                这个数字缩小,说明市场上钱在变少,资产价格容易承压。
              </p>
            </div>
          </div>
        </div>

        {/* Component breakdown cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          {(['net_liquidity', 'fed_assets', 'tga', 'rrp'] as const).map(
            (key) => {
              const m = metrics[key];
              const isHighlight = key === 'net_liquidity';
              const hasChange = m.change != null;
              const isPositive = hasChange && m.change! >= 0;
              const labels: Record<string, string> = {
                net_liquidity: '净流动性',
                fed_assets: '美联储总资产',
                tga: 'TGA 余额',
                rrp: '隔夜逆回购',
              };
              return (
                <div
                  key={key}
                  className={`bg-card/60 rounded-xl border p-4 ${
                    isHighlight
                      ? 'border-emerald-500/30 bg-emerald-500/5'
                      : 'border-border/40'
                  }`}
                >
                  <p className="text-xs text-muted-foreground mb-1">
                    {labels[key]}
                  </p>
                  <p className="text-xl font-bold font-data text-foreground tracking-tight">
                    {formatValue(m.value, m.units)}
                  </p>
                  {hasChange && (
                    <div className="flex items-center gap-1 mt-1">
                      <span
                        className={`text-xs font-data font-medium ${
                          isPositive ? 'text-emerald-500' : 'text-red-500'
                        }`}
                      >
                        {isPositive ? '+' : ''}
                        {m.change!.toFixed(2)}%
                      </span>
                      {m.previous_date && (
                        <span className="text-xs text-muted-foreground">
                          {formatCompareDate(m.previous_date)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            }
          )}
        </div>

        {/* Net Liquidity historical chart */}
        <NetLiquidityChart
          height={400}
          data={historyData}
          loading={historyLoading}
          error={historyError}
          onRetry={onRetry}
        />
      </div>
    </section>
  );
}

function BalanceSheetDeepDive({
  metrics,
  theme,
  interval,
  timeRange,
  onTimeRangeChange,
}: {
  metrics: LiquidityMetrics;
  theme: 'light' | 'dark';
  interval: string;
  timeRange: string;
  onTimeRangeChange: (range: string) => void;
}) {
  const { ref, isVisible } = useInView();
  const indicatorKeys = ['fedAssets', 'tga', 'rrp', 'reserves'] as const;
  const metricKeys: Record<string, keyof LiquidityMetrics> = {
    fedAssets: 'fed_assets',
    tga: 'tga',
    rrp: 'rrp',
    reserves: 'reserves',
  };

  return (
    <section className="relative">
      <div
        ref={ref}
        className={`relative transition-all duration-700 ease-out ${
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}
      >
        {/* Section header */}
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="flex items-start gap-3 min-w-0">
            <span className="text-3xl font-data font-bold leading-none text-foreground tracking-tighter select-none">
              02
            </span>
            <div className="pt-0.5 min-w-0">
              <h2 className="text-lg font-editorial text-foreground tracking-tight mb-0.5">
                资产负债表详解
              </h2>
              <p className="text-xs text-muted-foreground tracking-wide">
                WALCL / TGA / RRP / 银行准备金
              </p>
            </div>
          </div>

          {/* Time range selector */}
          <div className="flex items-center bg-muted/50 rounded-lg p-0.5 border border-border/30 shrink-0">
            {TIME_RANGES.map((range) => (
              <button
                key={range}
                onClick={() => onTimeRangeChange(range)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
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

        {/* Section explanation banner */}
        <div className="bg-muted/30 rounded-xl border border-border/40 p-5 mb-5">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Layers className="w-4 h-4 text-emerald-500" strokeWidth={1.5} />
            </div>
            <div>
              <h3 className="text-base font-medium text-foreground mb-2">
                这个板块看什么?
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                这里拆开看净流动性公式里的每一项,帮你搞懂钱到底从哪来、到哪去:
              </p>
              <ul className="text-sm text-muted-foreground leading-relaxed mt-2 space-y-1.5 list-none">
                <li>
                  <span className="text-emerald-500 font-medium">WALCL (美联储总资产)</span>
                  {' '}&mdash; 美联储一共往市场里放了多少钱。这个数在涨,说明美联储在「印钱」;在跌,说明在「缩表」回收资金。
                </li>
                <li>
                  <span className="text-emerald-500 font-medium">TGA (财政部账户)</span>
                  {' '}&mdash; 政府存在美联储的钱。政府发债收钱时 TGA 上升,市场上的钱就少了;政府花钱时 TGA 下降,钱就流回市场。
                </li>
                <li>
                  <span className="text-emerald-500 font-medium">RRP (隔夜逆回购)</span>
                  {' '}&mdash; 金融机构暂时「停放」在美联储的闲钱。RRP 下降 = 钱回到市场;RRP 接近零时,市场就少了一个缓冲垫。
                </li>
                <li>
                  <span className="text-emerald-500 font-medium">Reserves (银行准备金)</span>
                  {' '}&mdash; 银行手里的现金储备。低于 3 万亿美元时可能出现资金紧张。
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Metric panels */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {indicatorKeys.map((key) => (
            <LiquidityMetricPanel
              key={key}
              indicatorKey={key}
              metric={metrics[metricKeys[key]]}
              theme={theme}
              interval={interval}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function FinancialConditionsDeepDive({
  metrics,
  loading,
  theme,
  interval,
  timeRange,
  onTimeRangeChange,
}: {
  metrics: LiquidityMetrics;
  loading: boolean;
  theme: 'light' | 'dark';
  interval: string;
  timeRange: string;
  onTimeRangeChange: (range: string) => void;
}) {
  const { ref, isVisible } = useInView();

  return (
    <section className="relative">
      <div
        ref={ref}
        className={`relative transition-all duration-700 ease-out ${
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}
      >
        {/* Section header */}
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="flex items-start gap-3 min-w-0">
            <span className="text-3xl font-data font-bold leading-none text-foreground tracking-tighter select-none">
              03
            </span>
            <div className="pt-0.5 min-w-0">
              <h2 className="text-lg font-editorial text-foreground tracking-tight mb-0.5">
                金融条件详解
              </h2>
              <p className="text-xs text-muted-foreground tracking-wide">
                SOFR / EFFR / NFCI
              </p>
            </div>
          </div>

          {/* Time range selector */}
          <div className="flex items-center bg-muted/50 rounded-lg p-0.5 border border-border/30 shrink-0">
            {TIME_RANGES.map((range) => (
              <button
                key={range}
                onClick={() => onTimeRangeChange(range)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
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

        {/* Section explanation banner */}
        <div className="bg-muted/30 rounded-xl border border-border/40 p-5 mb-5">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Gauge className="w-4 h-4 text-emerald-500" strokeWidth={1.5} />
            </div>
            <div>
              <h3 className="text-base font-medium text-foreground mb-2">
                这个板块看什么?
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                前面两个板块告诉你市场上有多少钱,这个板块告诉你借钱贵不贵、金融环境紧不紧:
              </p>
              <ul className="text-sm text-muted-foreground leading-relaxed mt-2 space-y-1.5 list-none">
                <li>
                  <span className="text-emerald-500 font-medium">SOFR / EFFR (隔夜利率)</span>
                  {' '}&mdash; 银行之间互相借钱过夜的「价格」。这个价格稳定在美联储设定的范围内就正常;如果突然飙升,说明市场上的钱不够用了。
                </li>
                <li>
                  <span className="text-emerald-500 font-medium">NFCI (金融条件指数)</span>
                  {' '}&mdash; 一个综合打分,告诉你现在金融环境是「宽松」还是「紧缩」。负值 = 宽松 (借钱容易,对股市有利);正值 = 紧缩 (借钱难,股市承压)。
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* NFCI Gauge + Chart */}
        <div className="mb-5">

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <NFCIGauge value={metrics.nfci?.value ?? 0} loading={loading} />
            <div className="bg-card/60 rounded-xl border border-border/40 overflow-hidden">
              <TradingViewWidget
                symbol={FRED_SYMBOLS.nfci}
                title="NFCI 历史走势"
                height={300}
                interval={interval}
                theme={theme}
              />
            </div>
          </div>
        </div>

        {/* SOFR & EFFR */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <LiquidityMetricPanel
            indicatorKey="sofr"
            metric={metrics.sofr}
            theme={theme}
            interval={interval}
          />
          <LiquidityMetricPanel
            indicatorKey="effr"
            metric={metrics.effr}
            theme={theme}
            interval={interval}
          />
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function LiquidityPage() {
  const [timeRange, setTimeRange] = useState<
    '1M' | '3M' | '6M' | '1Y' | 'ALL'
  >('6M');
  const [theme] = useState<'light' | 'dark'>('dark');
  const [metrics, setMetrics] = useState<LiquidityMetrics | null>(null);
  const [historyData, setHistoryData] = useState<
    LiquidityHistoryObservation[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  // Tab state
  const [selectedTab, setSelectedTab] = useState<TabId>('net_liquidity');
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Weekly report state
  const [weeklyReport, setWeeklyReport] = useState<WeeklyMacroReport | null>(null);
  const [weeklyLoading, setWeeklyLoading] = useState(true);

  const fetchData = useCallback(async (bypassCache = false) => {
    if (bypassCache) invalidateCache('liquidity-history-365');
    setLoading(true);
    setError(null);
    try {
      const response = await api.getLiquidityHistory(365);
      if (response.success && response.data) {
        setHistoryData(response.data.observations);
        setLastUpdated(response.timestamp);
        if (response.data.metrics) {
          setMetrics(response.data.metrics);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取数据失败');
      console.error('Error fetching liquidity data:', err);
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

  const getInterval = () => {
    switch (timeRange) {
      case '1M':
        return 'D';
      case '3M':
        return 'D';
      case '6M':
        return 'W';
      case '1Y':
        return 'W';
      case 'ALL':
        return 'M';
      default:
        return 'W';
    }
  };

  const tabTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (tabTimerRef.current) {
        clearTimeout(tabTimerRef.current);
      }
    };
  }, []);

  const handleTabSelect = (tabId: TabId) => {
    if (selectedTab === tabId) return;
    setIsTransitioning(true);
    tabTimerRef.current = setTimeout(() => {
      setSelectedTab(tabId);
      setIsTransitioning(false);
    }, 200);
  };

  return (
    <main className="min-h-screen bg-background">
      <MacroPageHeader
        section="Liquidity"
        title="流动性环境"
        question="市场上的钱是多了还是少了?"
        lastUpdated={lastUpdated ? formatDateTimePacific(lastUpdated) : null}
        loading={loading}
        onRefresh={() => fetchData(true)}
      />

      {/* Error Message */}
      {error && (
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-4">
          <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
            {error}
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 space-y-8">
        {/* Hero Section: 3 big-number cards (tabs) */}
        <section>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {loading
              ? [0, 1, 2].map((i) => <HeroCardSkeleton key={i} index={i} />)
              : metrics &&
                TAB_ORDER.map((tabId, i) => (
                  <LiquidityHeroCard
                    key={tabId}
                    tabId={tabId}
                    metrics={metrics}
                    index={i}
                    selected={selectedTab === tabId}
                    onSelect={() => handleTabSelect(tabId)}
                  />
                ))}
          </div>
        </section>

        {/* Insight Banner */}
        <InsightBanner
          sectionTitle="流动性"
          analysis={weeklyReport?.liquidity_analysis ?? null}
          signalColor={weeklyReport?.signal_lights.liquidity ?? null}
          weekLabel={weeklyReport?.week_label ?? null}
          loading={weeklyLoading}
        />

        {/* Deep Dive: Selected tab content */}
        {metrics && (
          <div
            className={`transition-all duration-300 ease-out ${
              isTransitioning
                ? 'opacity-0 translate-y-4'
                : 'opacity-100 translate-y-0'
            }`}
          >
            {selectedTab === 'net_liquidity' && (
              <NetLiquidityDeepDive
                metrics={metrics}
                historyData={historyData}
                historyLoading={loading}
                historyError={error}
                onRetry={fetchData}
                timeRange={timeRange}
                onTimeRangeChange={(r) =>
                  setTimeRange(r as typeof timeRange)
                }
              />
            )}
            {selectedTab === 'balance_sheet' && (
              <BalanceSheetDeepDive
                metrics={metrics}
                theme={theme}
                interval={getInterval()}
                timeRange={timeRange}
                onTimeRangeChange={(r) =>
                  setTimeRange(r as typeof timeRange)
                }
              />
            )}
            {selectedTab === 'financial_conditions' && (
              <FinancialConditionsDeepDive
                metrics={metrics}
                loading={loading}
                theme={theme}
                interval={getInterval()}
                timeRange={timeRange}
                onTimeRangeChange={(r) =>
                  setTimeRange(r as typeof timeRange)
                }
              />
            )}
          </div>
        )}

        {/* Footer */}
        <section className="text-center py-4">
          <Link
            href="/macro"
            className="group inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-emerald-400 transition-colors duration-200"
          >
            <svg
              className="w-4 h-4 transition-transform duration-200 group-hover:-translate-x-1"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            返回宏观总览
          </Link>
          <p className="text-xs text-muted-foreground/60 mt-3">
            数据来源{' '}
            <a
              href="https://fred.stlouisfed.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-500 hover:text-emerald-400 transition-colors"
            >
              FRED
            </a>
            {' '}&middot;{' '}图表{' '}
            <a
              href="https://www.tradingview.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-500 hover:text-emerald-400 transition-colors"
            >
              TradingView
            </a>
          </p>
        </section>
      </div>
    </main>
  );
}
