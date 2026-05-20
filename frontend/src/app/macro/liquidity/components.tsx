'use client';

/**
 * Shared components and constants for the Liquidity dimension.
 *
 * Used by:
 *  - macro/liquidity/page.tsx  (standalone full page)
 *  - research/_components/LiquidityView.tsx  (research panel tab)
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { NFCIGauge } from '@/components/NFCIGauge';
import type {
  LiquidityMetrics,
  LiquidityMetric,
  LiquidityHistoryObservation,
  GlobalLiquidityMetrics,
  GlobalLiquidityHistoryObservation,
} from '@/lib/api';
import {
  formatLiquidityValue,
  getLatestNonNullObservation,
} from './liquidity-metrics';
import { formatCompareDateLabel } from '@/lib/timezone';
import { Droplets, Layers, Gauge, Globe, Banknote } from 'lucide-react';

// ---------------------------------------------------------------------------
// Dynamic chart imports
// ---------------------------------------------------------------------------

export const TradingViewWidget = dynamic(
  () => import('@/components/TradingViewWidget').then(mod => mod.TradingViewWidget),
  { ssr: false, loading: () => <div className="h-[400px] bg-card animate-pulse rounded-lg" /> },
);
export const NetLiquidityChart = dynamic(
  () => import('@/components/NetLiquidityChart').then(mod => mod.NetLiquidityChart),
  { ssr: false, loading: () => <div className="h-[350px] bg-card animate-pulse rounded-lg" /> },
);
export const GlobalLiquidityChart = dynamic(
  () => import('@/components/GlobalLiquidityChart').then(mod => mod.GlobalLiquidityChart),
  { ssr: false, loading: () => <div className="h-[350px] bg-card animate-pulse rounded-lg" /> },
);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const FRED_SYMBOLS: Record<string, string> = {
  fedAssets: 'FRED:WALCL',
  tga: 'FRED:WDTGAL',
  rrp: 'FRED:RRPONTSYD',
  reserves: 'FRED:WRESBAL',
  sofr: 'FRED:SOFR',
  effr: 'FRED:EFFR',
  nfci: 'FRED:NFCI',
  ecbAssets: 'FRED:ECBASSETSW',
  bojAssets: 'FRED:JPNASSETS',
  usM2: 'FRED:M2SL',
  euroM2: 'FRED:MYAGM2EZM196N',
  japanM2: 'FRED:MABMM301JPM189S',
  usdjpy: 'FX_IDC:USDJPY',
  eurusd: 'FX_IDC:EURUSD',
};

export const INDICATOR_INFO: Record<string, { title: string; description: string }> = {
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
  ecbAssets: {
    title: '欧洲央行 (ECB) 总资产',
    description:
      '欧洲央行 (European Central Bank) 资产负债表规模。ECB通过资产购买计划(APP/PEPP)向欧元区注入流动性。资产扩张意味着欧洲流动性增加,缩表则收紧。',
  },
  bojAssets: {
    title: '日本央行 (BOJ) 总资产',
    description:
      '日本央行 (Bank of Japan) 资产负债表规模。BOJ长期实施收益率曲线控制(YCC)和大规模资产购买,是全球最宽松的主要央行之一。其资产规模变化影响全球套利交易和流动性。',
  },
  usM2: {
    title: '美国 M2 货币供应 (M2SL)',
    description:
      '美国广义货币供应量,包括现金、活期存款、储蓄存款和货币市场基金。M2 增长代表货币环境宽松,下降则意味着流动性紧缩。2022 年 M2 出现 1930 年代以来首次同比下降。',
  },
  euroM2: {
    title: '欧元区 M2 货币供应',
    description:
      '欧元区广义货币供应量,受 ECB 货币政策和成员国信贷环境影响。欧元区 M2 增速放缓通常伴随信贷紧缩,对欧洲经济增长和全球资本流动有重要指示意义。',
  },
  japanM2: {
    title: '日本 M2 货币供应',
    description:
      '日本广义货币供应量。尽管 BOJ 长期实施超宽松政策,日本 M2 增长一直相对温和,反映了低利率环境下信贷需求不足的结构性问题。',
  },
  usdjpy: {
    title: '美元/日元汇率 (USD/JPY)',
    description:
      '日元兑美元汇率,反映中日美利差和套利交易 (Carry Trade) 强度。日元贬值 (汇率上升) 通常伴随日本资本外流和全球风险偏好上升;日元急速升值可能触发套利交易平仓,引发全球风险资产抛售。',
  },
  eurusd: {
    title: '欧元/美元汇率 (EUR/USD)',
    description:
      '欧元兑美元汇率,全球交易量最大的货币对。反映欧美货币政策差异和经济增长预期。欧元走强通常伴随欧洲经济复苏和 ECB 鹰派信号;欧元走弱则反映避险需求和美元流动性收紧。',
  },
};

export type LiquidityTabId = 'us_liquidity' | 'global_liquidity';

export const TAB_ORDER: LiquidityTabId[] = ['us_liquidity', 'global_liquidity'];

export interface TabMeta {
  name: string;
  number: string;
  subtitle: string;
}

export const TAB_META: Record<LiquidityTabId, TabMeta> = {
  us_liquidity: {
    name: '美国流动性',
    number: '01',
    subtitle: '净流动性 / 资产负债表 / M2 / 金融条件',
  },
  global_liquidity: {
    name: '全球流动性',
    number: '02',
    subtitle: '全球流动性指数 / 日本 / 欧洲',
  },
};

export const TIME_RANGES = ['1M', '3M', '6M', '1Y', 'ALL'] as const;

export const EMPTY_METRIC: LiquidityMetric = {
  series_id: '',
  title: '',
  value: null,
  date: null,
  units: '',
  change: null,
};

export const EMPTY_METRICS: LiquidityMetrics = {
  fed_assets: { ...EMPTY_METRIC, series_id: 'WALCL', title: 'Fed Total Assets', units: 'Millions of U.S. Dollars' },
  tga: { ...EMPTY_METRIC, series_id: 'WDTGAL', title: 'Treasury General Account', units: 'Millions of U.S. Dollars' },
  rrp: { ...EMPTY_METRIC, series_id: 'RRPONTSYD', title: 'Overnight Reverse Repo', units: 'Billions of US Dollars' },
  reserves: { ...EMPTY_METRIC, series_id: 'WRESBAL', title: 'Bank Reserves', units: 'Millions of U.S. Dollars' },
  sofr: { ...EMPTY_METRIC, series_id: 'SOFR', title: 'SOFR', units: 'Percent' },
  effr: { ...EMPTY_METRIC, series_id: 'EFFR', title: 'Effective Federal Funds Rate', units: 'Percent' },
  nfci: { ...EMPTY_METRIC, series_id: 'NFCI', title: 'Chicago Fed NFCI', units: 'Index' },
  net_liquidity: { ...EMPTY_METRIC, series_id: 'CALCULATED', title: 'Net Liquidity', units: 'Billions of Dollars' },
};

export const INTERVAL_MAP: Record<string, string> = {
  '1M': 'D', '3M': 'D', '6M': 'W', '1Y': 'W', 'ALL': 'M',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getColorClass(color: string) {
  if (color === 'emerald') return 'text-emerald-400';
  if (color === 'amber') return 'text-amber-400';
  return 'text-red-400';
}

export function interpretChange(change: number | null): string {
  if (change === null) return 'amber';
  return change >= 0 ? 'emerald' : 'red';
}

/**
 * @param threshold  IntersectionObserver threshold
 * @param immediate  Skip animation and show content right away (e.g. when data
 *                   is already cached from a previous visit).
 */
export function useInView(threshold = 0.1, immediate = false) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(
    () => immediate || (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
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

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

/** Defers rendering children until the container scrolls into view. */
function LazySection({ children, className, immediate }: { children: React.ReactNode; className?: string; immediate?: boolean }) {
  const { ref, isVisible } = useInView(0.01, immediate);
  return (
    <div ref={ref} className={className}>
      {isVisible ? children : <div className="h-[350px] bg-card/60 animate-pulse rounded-xl" />}
    </div>
  );
}

export function LiquidityMetricPanel({
  indicatorKey,
  metric,
  theme,
  interval,
  range,
  immediate,
}: {
  indicatorKey: string;
  metric: LiquidityMetric;
  theme: 'light' | 'dark';
  interval: string;
  range?: string;
  immediate?: boolean;
}) {
  const { ref, isVisible } = useInView(0.05, immediate);
  const info = INDICATOR_INFO[indicatorKey];
  const symbol = FRED_SYMBOLS[indicatorKey];

  if (!info || !symbol) return null;

  const hasChange = metric.change != null;
  const isPositive = hasChange && metric.change! >= 0;
  const primaryDisplay = formatLiquidityValue(metric.value, metric.units);

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

      {/* Chart - only mount TradingView when visible */}
      <div className="border-t border-border/30">
        {isVisible ? (
          <TradingViewWidget
            symbol={symbol}
            height={300}
            interval={interval}
            range={range}
            theme={theme}
          />
        ) : (
          <div className="h-[300px] bg-card animate-pulse rounded-lg" />
        )}
      </div>
    </div>
  );
}

export function SectionHeader({
  number,
  title,
  subtitle,
  timeRange,
  onTimeRangeChange,
}: {
  number: string;
  title: string;
  subtitle: string;
  timeRange: string;
  onTimeRangeChange: (range: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4 mb-5">
      <div className="flex items-start gap-3 min-w-0">
        <span className="text-3xl font-data font-bold leading-none text-foreground tracking-tighter select-none">
          {number}
        </span>
        <div className="pt-0.5 min-w-0">
          <h2 className="text-lg font-editorial text-foreground tracking-tight mb-0.5">
            {title}
          </h2>
          <p className="text-xs text-muted-foreground tracking-wide">
            {subtitle}
          </p>
        </div>
      </div>

      <div className="flex items-center bg-muted/50 rounded-lg p-0.5 border border-border/30 shrink-0 self-start">
        {TIME_RANGES.map((range) => (
          <button
            key={range}
            onClick={() => onTimeRangeChange(range)}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
              timeRange === range
                ? 'bg-primary/15 text-primary shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {range}
          </button>
        ))}
      </div>
    </div>
  );
}

export function GlobalMetricCard({
  label,
  metric,
  highlighted,
}: {
  label: string;
  metric: { value: number | null; change?: number | null; units?: string } | null;
  highlighted?: boolean;
}) {
  const val = metric?.value ?? null;
  const change = metric?.change ?? null;
  const units = metric?.units ?? 'Billions of U.S. Dollars';
  return (
    <div
      className={`bg-card/60 rounded-xl border p-4 ${
        highlighted ? 'border-primary/30 bg-primary/5' : 'border-border/40'
      }`}
    >
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className="text-xl font-bold font-data text-foreground tracking-tight">
        {formatLiquidityValue(val, units)}
      </p>
      {change != null && (
        <span
          className={`text-xs font-data font-medium ${
            change >= 0 ? 'text-emerald-500' : 'text-red-500'
          }`}
        >
          {change >= 0 ? '+' : ''}
          {change.toFixed(2)}%
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// USLiquidityDeepDive
// ---------------------------------------------------------------------------

export function USLiquidityDeepDive({
  metrics,
  historyData,
  historyLoading,
  historyError,
  onRetry,
  timeRange,
  onTimeRangeChange,
  theme,
  interval,
  loading,
}: {
  metrics: LiquidityMetrics;
  historyData: LiquidityHistoryObservation[];
  historyLoading: boolean;
  historyError: string | null;
  onRetry: () => void;
  timeRange: string;
  onTimeRangeChange: (range: string) => void;
  theme: 'light' | 'dark';
  interval: string;
  loading: boolean;
}) {
  // Skip fade-in animation when data is already cached from a previous visit
  const hasCachedData = historyData.length > 0 && !historyLoading;
  const { ref, isVisible } = useInView(0.1, hasCachedData);

  const bsIndicatorKeys = ['fedAssets', 'tga', 'rrp', 'reserves'] as const;
  const metricKeys: Record<string, keyof LiquidityMetrics> = {
    fedAssets: 'fed_assets',
    tga: 'tga',
    rrp: 'rrp',
    reserves: 'reserves',
  };

  return (
    <div className="space-y-10">
      {/* ---- Section 1: Net Liquidity ---- */}
      <section className="relative">
        <div
          ref={ref}
          className={`relative transition-all duration-700 ease-out ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <SectionHeader
            number="01"
            title="净流动性"
            subtitle="WALCL - TGA - RRP / 净流动性公式 / 历史趋势"
            timeRange={timeRange}
            onTimeRangeChange={onTimeRangeChange}
          />

          {/* Educational banner */}
          <div className="bg-muted/30 rounded-xl border border-border/40 p-5 mb-5">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Droplets className="w-4 h-4 text-primary" strokeWidth={1.5} />
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
                  <code className="bg-muted px-2 py-1 rounded text-primary">
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
                        ? 'border-primary/30 bg-primary/5'
                        : 'border-border/40'
                    }`}
                  >
                    <p className="text-xs text-muted-foreground mb-1">
                      {labels[key]}
                    </p>
                    <p className="text-xl font-bold font-data text-foreground tracking-tight">
                      {formatLiquidityValue(m.value, m.units)}
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
                            {formatCompareDateLabel(m.previous_date)}
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

      {/* ---- Section 2: Balance Sheet ---- */}
      <section className="relative">
        <SectionHeader
          number="02"
          title="资产负债表"
          subtitle="WALCL / TGA / RRP / 银行准备金"
          timeRange={timeRange}
          onTimeRangeChange={onTimeRangeChange}
        />

        {/* Educational banner */}
        <div className="bg-muted/30 rounded-xl border border-border/40 p-5 mb-5">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Layers className="w-4 h-4 text-primary" strokeWidth={1.5} />
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
                  <span className="text-primary font-medium">WALCL (美联储总资产)</span>
                  {' '}&mdash; 美联储一共往市场里放了多少钱。这个数在涨,说明美联储在「印钱」;在跌,说明在「缩表」回收资金。
                </li>
                <li>
                  <span className="text-primary font-medium">TGA (财政部账户)</span>
                  {' '}&mdash; 政府存在美联储的钱。政府发债收钱时 TGA 上升,市场上的钱就少了;政府花钱时 TGA 下降,钱就流回市场。
                </li>
                <li>
                  <span className="text-primary font-medium">RRP (隔夜逆回购)</span>
                  {' '}&mdash; 金融机构暂时「停放」在美联储的闲钱。RRP 下降 = 钱回到市场;RRP 接近零时,市场就少了一个缓冲垫。
                </li>
                <li>
                  <span className="text-primary font-medium">Reserves (银行准备金)</span>
                  {' '}&mdash; 银行手里的现金储备。低于 3 万亿美元时可能出现资金紧张。
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Metric panels */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {bsIndicatorKeys.map((key) => (
            <LiquidityMetricPanel
              key={key}
              indicatorKey={key}
              metric={metrics[metricKeys[key]]}
              theme={theme}
              interval={interval}
              immediate={hasCachedData}
            />
          ))}
        </div>
      </section>

      {/* ---- Section 3: M2 Money Supply ---- */}
      <section className="relative">
        <SectionHeader
          number="03"
          title="货币供应 M2"
          subtitle="广义货币 / 信贷传导 / 实体经济流动性"
          timeRange={timeRange}
          onTimeRangeChange={onTimeRangeChange}
        />

        {/* Educational banner */}
        <div className="bg-muted/30 rounded-xl border border-border/40 p-5 mb-5">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Banknote className="w-4 h-4 text-primary" strokeWidth={1.5} />
            </div>
            <div>
              <h3 className="text-base font-medium text-foreground mb-2">
                这个板块看什么?
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                前面两个板块讲的是美联储「水龙头」端的情况 &mdash; 放了多少水、留了多少在管道里。
                这个板块讲的是水龙头流出的水最终有多少到了「水池」里,
                也就是实体经济中实际流通的钱有多少。
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed mt-2">
                <span className="text-primary font-medium">M2</span> = 现金 + 活期存款 + 储蓄存款 + 货币市场基金。
                当美联储放水 (QE) 且银行积极放贷时,M2 增长;
                当美联储缩表 (QT) 或银行收紧信贷时,M2 收缩。
                2022 年 M2 出现了 1930 年代大萧条以来的首次同比下降,是当年股市下跌的重要驱动力。
              </p>
              <div className="mt-3 p-3 bg-muted/40 rounded-lg">
                <p className="text-xs text-muted-foreground font-medium mb-1.5">传导链条</p>
                <p className="text-xs text-muted-foreground font-data">
                  美联储操作 (QE/QT) &rarr; 银行准备金 &rarr; 净流动性 &rarr;{' '}
                  <span className="text-primary font-semibold">银行信贷 &rarr; M2 货币供应</span>
                  {' '}&rarr; 金融条件
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <LiquidityMetricPanel
            indicatorKey="usM2"
            metric={EMPTY_METRIC}
            theme={theme}
            interval={interval}
            immediate={hasCachedData}
          />
        </div>
      </section>

      {/* ---- Section 4: Financial Conditions ---- */}
      <section className="relative">
        <SectionHeader
          number="04"
          title="金融条件"
          subtitle="SOFR / EFFR / NFCI"
          timeRange={timeRange}
          onTimeRangeChange={onTimeRangeChange}
        />

        {/* Educational banner */}
        <div className="bg-muted/30 rounded-xl border border-border/40 p-5 mb-5">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Gauge className="w-4 h-4 text-primary" strokeWidth={1.5} />
            </div>
            <div>
              <h3 className="text-base font-medium text-foreground mb-2">
                这个板块看什么?
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                前面三个板块告诉你市场上有多少钱,这个板块告诉你借钱贵不贵、金融环境紧不紧:
              </p>
              <ul className="text-sm text-muted-foreground leading-relaxed mt-2 space-y-1.5 list-none">
                <li>
                  <span className="text-primary font-medium">SOFR / EFFR (隔夜利率)</span>
                  {' '}&mdash; 银行之间互相借钱过夜的「价格」。这个价格稳定在美联储设定的范围内就正常;如果突然飙升,说明市场上的钱不够用了。
                </li>
                <li>
                  <span className="text-primary font-medium">NFCI (金融条件指数)</span>
                  {' '}&mdash; 一个综合打分,告诉你现在金融环境是「宽松」还是「紧缩」。负值 = 宽松 (借钱容易,对股市有利);正值 = 紧缩 (借钱难,股市承压)。
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* NFCI Gauge + Chart */}
        <LazySection className="mb-5" immediate={hasCachedData}>
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
        </LazySection>

        {/* SOFR & EFFR */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <LiquidityMetricPanel
            indicatorKey="sofr"
            metric={metrics.sofr}
            theme={theme}
            interval={interval}
            immediate={hasCachedData}
          />
          <LiquidityMetricPanel
            indicatorKey="effr"
            metric={metrics.effr}
            theme={theme}
            interval={interval}
            immediate={hasCachedData}
          />
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GlobalLiquidityDeepDive
// ---------------------------------------------------------------------------

export function GlobalLiquidityDeepDive({
  globalMetrics,
  globalLoading,
  globalHistoryData,
  globalHistoryLoading,
  globalHistoryError,
  onRetryHistory,
  timeRange,
  onTimeRangeChange,
  theme,
}: {
  globalMetrics: GlobalLiquidityMetrics | null;
  globalLoading: boolean;
  globalHistoryData: GlobalLiquidityHistoryObservation[];
  globalHistoryLoading: boolean;
  globalHistoryError: string | null;
  onRetryHistory: () => void;
  timeRange: string;
  onTimeRangeChange: (range: string) => void;
  theme: 'light' | 'dark';
}) {
  const hasCachedData = globalMetrics !== null && !globalLoading;
  const { ref, isVisible } = useInView(0.1, hasCachedData);
  const latestGlobalObservation = useMemo(
    () => getLatestNonNullObservation(globalHistoryData),
    [globalHistoryData],
  );

  const toMetricProp = (m: GlobalLiquidityMetrics[keyof GlobalLiquidityMetrics] | undefined) =>
    m && typeof m === 'object' && 'series_id' in m
      ? {
          series_id: m.series_id,
          title: m.title,
          value: m.value,
          date: m.date,
          units: m.units,
          change: 'change' in m ? (m.change as number | null) : null,
        }
      : EMPTY_METRIC;

  return (
    <div className="space-y-10">
      {/* ---- Section 1: Global M2 Overview ---- */}
      <section className="relative">
        <div
          ref={ref}
          className={`relative transition-all duration-700 ease-out ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <SectionHeader
            number="01"
            title="全球流动性指数"
            subtitle="Fed + ECB + BOJ - TGA - RRP / 三大央行聚合"
            timeRange={timeRange}
            onTimeRangeChange={onTimeRangeChange}
          />

          {/* Educational banner */}
          <div className="bg-muted/30 rounded-xl border border-border/40 p-5 mb-5">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Globe className="w-4 h-4 text-primary" strokeWidth={1.5} />
              </div>
              <div>
                <h3 className="text-base font-medium text-foreground mb-2">
                  这个板块看什么?
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  衡量全球主要央行向市场注入的总流动性规模。
                  指数越高,全球市场上的「钱」越多,对风险资产通常是利好。
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed mt-2">
                  <code className="bg-muted px-2 py-1 rounded text-primary">
                    全球流动性 = Fed + ECB + BOJ - TGA - RRP
                  </code>
                </p>
              </div>
            </div>
          </div>

          {/* Global Liquidity Index + component cards */}
          {globalLoading && (
            <div className="space-y-3">
              <div className="bg-card/60 rounded-xl border border-border/40 p-5 animate-pulse">
                <div className="h-3 w-40 bg-muted rounded mb-3" />
                <div className="h-9 w-28 bg-muted rounded mb-2" />
                <div className="h-3 w-24 bg-muted rounded" />
              </div>
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="bg-card/60 rounded-xl border border-border/40 p-3 sm:p-4 animate-pulse">
                    <div className="h-3 w-16 bg-muted rounded mb-2" />
                    <div className="h-7 w-20 bg-muted rounded" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {globalMetrics && (
            <div className="space-y-3 mb-5">
              {/* Global Liquidity Index - prominent card */}
              <div className="bg-card/60 rounded-xl border border-primary/30 bg-primary/5 p-5">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">
                      全球流动性指数 (Global Liquidity Index)
                    </p>
                    <p className="text-3xl font-bold font-data text-foreground tracking-tight">
                      {latestGlobalObservation?.value != null
                        ? formatLiquidityValue(latestGlobalObservation.value, 'Billions of U.S. Dollars')
                        : globalMetrics.global_liquidity?.value != null
                        ? formatLiquidityValue(globalMetrics.global_liquidity.value, 'Billions of U.S. Dollars')
                        : 'N/A'}
                    </p>
                    {(latestGlobalObservation?.time || globalMetrics.global_liquidity?.date) && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {latestGlobalObservation?.time ?? globalMetrics.global_liquidity?.date}
                      </p>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground leading-relaxed md:text-right md:max-w-xs">
                    <p>
                      三大央行 (Fed + ECB + BOJ) 资产负债表总和,
                      减去 TGA 和 RRP 冻结资金,折算为美元。
                    </p>
                  </div>
                </div>
              </div>

              {/* Component breakdown */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
                <GlobalMetricCard label="美联储 (Fed) 总资产" metric={globalMetrics.fed_assets} />
                <GlobalMetricCard label="欧洲央行 (ECB) 总资产" metric={globalMetrics.ecb_assets} />
                <GlobalMetricCard label="日本央行 (BOJ) 总资产" metric={globalMetrics.boj_assets} />
              </div>
            </div>
          )}

          {/* Global Liquidity Index historical chart */}
          <GlobalLiquidityChart
            height={400}
            data={globalHistoryData}
            loading={globalHistoryLoading}
            error={globalHistoryError}
            onRetry={onRetryHistory}
          />
        </div>
      </section>

      {/* ---- Section 2: Japan ---- */}
      <section className="relative">
        <SectionHeader
          number="02"
          title="日本"
          subtitle="日本央行 (BOJ) 总资产 / M2 货币供应 / USD/JPY"
          timeRange={timeRange}
          onTimeRangeChange={onTimeRangeChange}
        />

        <div className="bg-muted/30 rounded-xl border border-border/40 p-5 mb-5">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Layers className="w-4 h-4 text-primary" strokeWidth={1.5} />
            </div>
            <div>
              <h3 className="text-base font-medium text-foreground mb-2">
                这个板块看什么?
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                日本央行 (Bank of Japan, BOJ) 长期实施超宽松货币政策,资产负债表规模相对于 GDP 全球最高。
                BOJ 的政策转向 (如调整 YCC、加息) 对全球套利交易 (Carry Trade) 和资本流动有巨大影响 &mdash;
                2024 年日元套利交易平仓就曾引发全球股市剧烈波动。
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <LiquidityMetricPanel
            indicatorKey="bojAssets"
            metric={toMetricProp(globalMetrics?.boj_assets)}
            theme={theme}
            interval="M"
            range="60M"
            immediate={hasCachedData}
          />
          <LiquidityMetricPanel
            indicatorKey="japanM2"
            metric={EMPTY_METRIC}
            theme={theme}
            interval="M"
            range="60M"
            immediate={hasCachedData}
          />
          <LiquidityMetricPanel
            indicatorKey="usdjpy"
            metric={EMPTY_METRIC}
            theme={theme}
            interval="D"
            range="12M"
            immediate={hasCachedData}
          />
        </div>
      </section>

      {/* ---- Section 3: Europe ---- */}
      <section className="relative">
        <SectionHeader
          number="03"
          title="欧洲"
          subtitle="欧洲央行 (ECB) 总资产 / 欧元区 M2 / EUR/USD"
          timeRange={timeRange}
          onTimeRangeChange={onTimeRangeChange}
        />

        <div className="bg-muted/30 rounded-xl border border-border/40 p-5 mb-5">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Layers className="w-4 h-4 text-primary" strokeWidth={1.5} />
            </div>
            <div>
              <h3 className="text-base font-medium text-foreground mb-2">
                这个板块看什么?
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                欧洲央行 (European Central Bank, ECB) 通过资产购买计划 (APP/PEPP) 向欧元区注入流动性。
                ECB 的缩表节奏和利率决策直接影响欧元区信贷环境,并通过汇率渠道影响全球资本流动。
                欧元区 M2 增速放缓通常伴随信贷紧缩和经济放缓。
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <LiquidityMetricPanel
            indicatorKey="ecbAssets"
            metric={toMetricProp(globalMetrics?.ecb_assets)}
            theme={theme}
            interval="M"
            range="60M"
            immediate={hasCachedData}
          />
          <LiquidityMetricPanel
            indicatorKey="euroM2"
            metric={EMPTY_METRIC}
            theme={theme}
            interval="M"
            range="60M"
            immediate={hasCachedData}
          />
          <LiquidityMetricPanel
            indicatorKey="eurusd"
            metric={EMPTY_METRIC}
            theme={theme}
            interval="D"
            range="12M"
            immediate={hasCachedData}
          />
        </div>
      </section>
    </div>
  );
}
