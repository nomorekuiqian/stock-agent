'use client';

import { IndicatorBar } from './IndicatorBar';
import { SIGNAL_LABELS, SIGNAL_COLORS } from './constants';

export type Timeframe = 'daily' | 'weekly';

interface TimeframeRatings {
  overall: string;
  overall_score: number | null;
  moving_averages: string;
  ma_score: number | null;
  oscillators: string;
  osc_score: number | null;
}

export interface TechnicalSnapshot {
  symbol: string;
  ratings: {
    daily: TimeframeRatings;
    weekly?: TimeframeRatings;
  };
  oscillators: {
    rsi_14: number | null;
    macd_histogram: number | null;
    rsi_14_weekly?: number | null;
    macd_histogram_weekly?: number | null;
    macd_level?: number | null;
    macd_signal?: number | null;
  };
  trend: {
    adx_14: number | null;
    adx_14_weekly?: number | null;
    adx_plus_di?: number | null;
    adx_minus_di?: number | null;
  };
  moving_averages: {
    sma_20: number | null;
    sma_50: number | null;
    sma_200: number | null;
  };
  volatility: {
    bb_upper: number | null;
    bb_lower: number | null;
  };
  support_resistance: {
    current_price?: number;
    support_1?: number;
    resistance_1?: number;
  };
  price_volume: {
    price: number | null;
  };
  trend_context?: {
    macd_cross?: string | null;
    macd_histogram_direction?: string | null;
    rsi_direction?: string | null;
    rsi_recently_overbought?: boolean | null;
    rsi_recently_oversold?: boolean | null;
    volume_ratio?: number | null;
    volume_trend?: string | null;
  };
  pattern_signals?: {
    bb_squeeze?: boolean | null;
    bb_position?: string | null;
    volume_confirmation?: boolean | null;
    ma_alignment?: string | null;
    sma_cross?: string | null;
  };
  derived?: {
    above_sma_20?: boolean | null;
    rsi_zone?: string | null;
  };
  fetched_at?: string;
}

interface TechnicalSignalDashboardProps {
  snapshot: TechnicalSnapshot;
  timeframe: Timeframe;
}

// ---------------------------------------------------------------------------
// Typography tokens (aligned with design-system.md)
//
// Section title:  SubsectionHeader pattern (text-sm, amber dot, uppercase)
// Summary:        text-base font-medium text-foreground  (lead level)
// Item label:     text-sm text-foreground
// Item value:     text-sm font-data font-medium text-foreground
// Interpretation: text-xs text-muted-foreground leading-relaxed
// Data source:    text-micro text-muted-foreground/70
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function formatPrice(value: number | null | undefined): string {
  if (value === null || value === undefined) return '--';
  return `$${value.toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Hardcoded interpretation functions
// ---------------------------------------------------------------------------

function getADXInterpretation(adx: number, plusDI?: number | null, minusDI?: number | null): string {
  let direction = '';
  if (plusDI != null && minusDI != null) {
    if (plusDI > minusDI) direction = '+DI > -DI，多方主导。';
    else if (minusDI > plusDI) direction = '-DI > +DI，空方主导。';
    else direction = '+DI 和 -DI 接近，多空均衡。';
  }
  let strength = '';
  if (adx > 40) strength = 'ADX 衡量趋势的强弱。当前趋势非常强劲，顺势操作的胜率较高。';
  else if (adx > 25) strength = 'ADX 衡量趋势的强弱。>25 表示方向明确，市场有清晰趋势。';
  else if (adx > 20) strength = 'ADX 衡量趋势的强弱。趋势刚形成或正在减弱，方向还不够确定。';
  else strength = 'ADX 衡量趋势的强弱。<20 表示没有明显趋势，市场在横盘震荡。';
  return direction ? `${direction}${strength}` : strength;
}

function getMAInterpretation(alignment: 'bullish' | 'bearish' | 'crossing'): string {
  if (alignment === 'bullish')
    return '价格 > 短(20日) > 中(50日) > 长(200日)期均线，各周期趋势一致向上。';
  if (alignment === 'bearish')
    return '价格 < 短(20日) < 中(50日) < 长(200日)期均线，各周期趋势一致向下。';
  return '均线之间出现交叉，短期和长期方向不一致，市场可能正在转向。';
}

function getRSIInterpretation(
  rsi: number,
  direction?: string | null,
  recentlyOverbought?: boolean | null,
  recentlyOversold?: boolean | null,
): string {
  let base = '';
  if (rsi > 80) base = '严重超买，短期涨幅过大，回调风险较高。';
  else if (rsi > 70) base = '进入超买区域，买方力量开始透支，注意短期回调风险。';
  else if (rsi > 55) base = '偏强，买方力量略占上风。';
  else if (rsi > 45) base = '买卖力量基本均衡，没有明显超买或超卖信号。';
  else if (rsi > 30) base = '偏弱，卖方力量略占上风。';
  else if (rsi > 20) base = '进入超卖区域，卖压可能过度，留意反弹机会。';
  else base = '严重超卖，短期跌幅过大，反弹概率较高。';

  const parts = [base];
  if (direction === 'rising') parts.push('RSI 近期上行，动能增强。');
  else if (direction === 'declining') parts.push('RSI 近期下行，动能减弱。');

  if (recentlyOverbought && rsi <= 70) parts.push('近期刚从超买区域回落。');
  if (recentlyOversold && rsi >= 30) parts.push('近期刚从超卖区域反弹。');

  return parts.join('');
}

function getMACDInterpretation(
  histogram: number,
  cross?: string | null,
  histogramDirection?: string | null,
): string {
  // Priority: cross > histogram direction > zero-line position
  if (cross === 'bullish_cross')
    return 'MACD 金叉（短期线上穿信号线），看涨信号，上行动能正在积聚。';
  if (cross === 'bearish_cross')
    return 'MACD 死叉（短期线下穿信号线），看跌信号，下行压力增大。';

  let directionNote = '';
  if (histogramDirection === 'rising') directionNote = '柱状图在扩大，动能增强。';
  else if (histogramDirection === 'declining') directionNote = '柱状图在收缩，动能减弱。';

  let base = '';
  if (histogram > 0) base = '短期动能偏多，MACD 在零轴上方，上涨趋势中。';
  else if (histogram < 0) base = '短期动能偏空，MACD 在零轴下方，注意下行风险。';
  else base = '多空力量均衡，短期和长期均线接近持平。';

  return directionNote ? `${directionNote}${base}` : base;
}

function getBBInterpretation(width: number, squeeze?: boolean | null, bbPosition?: string | null): string {
  const parts: string[] = [];

  if (squeeze) {
    parts.push('布林带挤压（Squeeze），波动率显著低于近期平均，往往预示即将出现较大价格波动。');
  } else if (width < 4) {
    parts.push('布林带极度收窄，波动率很低，像弹簧被压紧，往往预示着即将出现较大的价格波动。');
  } else if (width < 6) {
    parts.push('布林带收窄，市场波动在减小，可能在酝酿下一波行情。');
  } else if (width > 12) {
    parts.push('布林带大幅扩张，市场波动非常剧烈，风险和机会都在增大。');
  } else if (width > 8) {
    parts.push('布林带偏宽，市场有一定波动。');
  } else {
    parts.push('布林带宽度正常，市场波动在平均水平。');
  }

  if (bbPosition === 'above_upper') parts.push('价格突破上轨，强势但有回调风险。');
  else if (bbPosition === 'below_lower') parts.push('价格跌破下轨，弱势但有反弹可能。');
  else if (bbPosition === 'upper_half') parts.push('价格在上半区运行，偏强。');
  else if (bbPosition === 'lower_half') parts.push('价格在下半区运行，偏弱。');

  return parts.join('');
}

function getVolumeInterpretation(ratio?: number | null, trend?: string | null, confirmation?: boolean | null): string {
  if (ratio == null) return '';
  const ratioText = `成交量为 20 日均量的 ${ratio.toFixed(1)} 倍。`;
  let trendText = '';
  if (trend === 'above_average') trendText = '放量，市场参与度增加。';
  else if (trend === 'below_average') trendText = '缩量，市场观望情绪浓厚。';
  else trendText = '成交量正常。';

  let confirmText = '';
  if (confirmation === true) confirmText = '量价配合，信号可靠性较高。';
  else if (confirmation === false) confirmText = '量能不足，信号可靠性存疑。';

  return [ratioText, trendText, confirmText].filter(Boolean).join('');
}

const SUPPORT_EXPLANATION = '近期价格多次在此反弹的低点。价格跌到支撑位附近时，买方力量通常增加。';
const RESISTANCE_EXPLANATION = '近期价格多次在此回落的高点。价格涨到阻力位附近时，卖压增加。';

// ---------------------------------------------------------------------------
// MA alignment (with price condition to match backend logic)
// ---------------------------------------------------------------------------

type MAAlignment = 'bullish' | 'bearish' | 'crossing';

function getMAAlignment(
  price: number | null | undefined,
  sma20: number | null,
  sma50: number | null,
  sma200: number | null,
): MAAlignment | null {
  if (sma20 == null || sma50 == null || sma200 == null) return null;
  if (price != null && price > sma20 && sma20 > sma50 && sma50 > sma200) return 'bullish';
  if (price != null && price < sma20 && sma20 < sma50 && sma50 < sma200) return 'bearish';
  return 'crossing';
}

const MA_LABELS: Record<MAAlignment, string> = {
  bullish: '多头排列',
  bearish: '空头排列',
  crossing: '交叉整理',
};

// ---------------------------------------------------------------------------
// TLDR generation
// ---------------------------------------------------------------------------

interface TLDR {
  signal: string;
  signalLabel: string;
  summary: string;
  priceLine: string;
}

function generateTLDR(snapshot: TechnicalSnapshot, timeframe: Timeframe): TLDR {
  const ratings = timeframe === 'weekly' ? snapshot.ratings?.weekly : snapshot.ratings?.daily;
  const overall = ratings?.overall || 'NEUTRAL';
  const rsi = timeframe === 'weekly' ? snapshot.oscillators?.rsi_14_weekly : snapshot.oscillators?.rsi_14;
  const adx = timeframe === 'weekly' ? snapshot.trend?.adx_14_weekly : snapshot.trend?.adx_14;
  const sma20 = snapshot.moving_averages?.sma_20;
  const sma50 = snapshot.moving_averages?.sma_50;
  const sma200 = snapshot.moving_averages?.sma_200;
  const price = snapshot.price_volume?.price;
  const support = snapshot.support_resistance?.support_1;
  const resistance = snapshot.support_resistance?.resistance_1;
  const plusDI = snapshot.trend?.adx_plus_di;
  const minusDI = snapshot.trend?.adx_minus_di;
  const macdCross = snapshot.trend_context?.macd_cross;

  const alignment = getMAAlignment(price, sma20, sma50, sma200);
  const maLabel = alignment ? `均线${MA_LABELS[alignment]}` : '';

  let rsiStatus = '';
  if (rsi != null) {
    if (rsi > 70) rsiStatus = `RSI 超买(${rsi.toFixed(0)})`;
    else if (rsi < 30) rsiStatus = `RSI 超卖(${rsi.toFixed(0)})`;
    else rsiStatus = `RSI 中性(${rsi.toFixed(0)})`;
  }

  let adxStatus = '';
  if (adx != null) {
    let dirLabel = '';
    if (plusDI != null && minusDI != null) {
      dirLabel = plusDI > minusDI ? '多方' : minusDI > plusDI ? '空方' : '';
    }
    if (adx > 25) adxStatus = `趋势较强(ADX ${adx.toFixed(0)})${dirLabel ? `/${dirLabel}主导` : ''}`;
    else if (adx > 20) adxStatus = `趋势一般(ADX ${adx.toFixed(0)})`;
    else adxStatus = `无明显趋势(ADX ${adx.toFixed(0)})`;
  }

  let crossStatus = '';
  if (macdCross === 'bullish_cross') crossStatus = 'MACD金叉';
  else if (macdCross === 'bearish_cross') crossStatus = 'MACD死叉';

  const parts = [rsiStatus, maLabel, adxStatus, crossStatus].filter(Boolean);
  const summary = parts.join(', ');
  const priceLine = `当前 ${formatPrice(price)}  >  支撑 ${formatPrice(support)}  >  阻力 ${formatPrice(resistance)}`;

  return { signal: overall, signalLabel: SIGNAL_LABELS[overall] || '观望', summary, priceLine };
}

// ---------------------------------------------------------------------------
// Color dot helper
// ---------------------------------------------------------------------------

const DOT_COLOR: Record<string, string> = {
  emerald: 'bg-emerald-400',
  amber: 'bg-amber-400',
  red: 'bg-red-400',
  gray: 'bg-muted-foreground/50',
};

// ---------------------------------------------------------------------------
// SubsectionHeader (design-system.md standard pattern)
// ---------------------------------------------------------------------------

function SectionTitle({ zh, en }: { zh: string; en: string }) {
  return (
    <h3 className="flex items-center gap-2 text-sm font-medium uppercase tracking-wide">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400/80 light:bg-amber-600" />
      <span className="text-amber-400 light:text-amber-700">{zh}</span>
      <span className="text-muted-foreground/70 font-normal normal-case">{en}</span>
    </h3>
  );
}

// ---------------------------------------------------------------------------
// TrendSection
// ---------------------------------------------------------------------------

function TrendSection({ snapshot, timeframe }: { snapshot: TechnicalSnapshot; timeframe: Timeframe }) {
  const adx = timeframe === 'weekly' ? snapshot.trend?.adx_14_weekly : snapshot.trend?.adx_14;
  const plusDI = snapshot.trend?.adx_plus_di;
  const minusDI = snapshot.trend?.adx_minus_di;
  const sma20 = snapshot.moving_averages?.sma_20;
  const sma50 = snapshot.moving_averages?.sma_50;
  const sma200 = snapshot.moving_averages?.sma_200;
  const price = snapshot.price_volume?.price;
  const alignment = getMAAlignment(price, sma20, sma50, sma200);
  const smaCross = snapshot.pattern_signals?.sma_cross;

  let trendLabel = '数据不足';
  let dotColor = 'gray';
  if (alignment && adx != null) {
    const direction = alignment === 'bullish' ? '上升趋势' : alignment === 'bearish' ? '下降趋势' : '方向不明';
    const strength = adx > 40 ? '强度很强' : adx > 25 ? '强度较强' : adx > 20 ? '强度一般' : '强度较弱';
    trendLabel = `${direction}，${strength}`;
    if (alignment === 'bullish' && adx > 25) dotColor = 'emerald';
    else if (alignment === 'bearish' && adx > 25) dotColor = 'red';
    else dotColor = 'amber';
  } else if (adx != null) {
    trendLabel = adx > 25 ? '强度较强' : adx > 20 ? '强度一般' : '无明显趋势';
    dotColor = adx > 25 ? 'amber' : 'gray';
  }

  const maLabel = alignment ? MA_LABELS[alignment] : '--';
  const maDetail = alignment
    ? `(20日${sma20 != null ? ` $${sma20.toFixed(0)}` : ''} > 50日${sma50 != null ? ` $${sma50.toFixed(0)}` : ''} > 200日${sma200 != null ? ` $${sma200.toFixed(0)}` : ''})`
    : '';

  return (
    <div className="p-5 bg-card/50 rounded-lg border border-border/40 space-y-4">
      <SectionTitle zh="趋势方向" en="Trend" />

      {/* Summary: lead level */}
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full shrink-0 ${DOT_COLOR[dotColor]}`} />
        <span className="text-base font-medium text-foreground">{trendLabel}</span>
      </div>

      {/* Sub-item: ADX */}
      {adx != null && (
        <>
          <IndicatorBar
            name="ADX"
            value={adx}
            min={0}
            max={50}
            zones={[{ value: 20, label: '20' }, { value: 25, label: '25' }]}
            interpretation={getADXInterpretation(adx, plusDI, minusDI)}
          />
          {/* +DI / -DI direction */}
          {plusDI != null && minusDI != null && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className={plusDI > minusDI ? 'text-emerald-400 font-medium' : ''}>
                +DI {plusDI.toFixed(1)}
              </span>
              <span className="text-muted-foreground/70">/</span>
              <span className={minusDI > plusDI ? 'text-red-400 font-medium' : ''}>
                -DI {minusDI.toFixed(1)}
              </span>
              <span className="text-muted-foreground/70 ml-1">
                {plusDI > minusDI ? '(多方主导)' : minusDI > plusDI ? '(空方主导)' : '(多空均衡)'}
              </span>
            </div>
          )}
        </>
      )}

      {/* Sub-item: MA alignment */}
      {alignment && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-foreground">均线排列</span>
            <span className="text-sm font-data font-medium text-foreground">{maLabel} {maDetail}</span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {getMAInterpretation(alignment)}
          </p>
        </div>
      )}

      {/* SMA50/200 Golden/Death Cross */}
      {smaCross && smaCross !== 'none' && (
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
            smaCross === 'golden_cross'
              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
              : 'bg-red-500/15 text-red-400 border border-red-500/30'
          }`}>
            {smaCross === 'golden_cross' ? 'SMA 50/200 金叉' : 'SMA 50/200 死叉'}
          </span>
          <span className="text-xs text-muted-foreground">
            {smaCross === 'golden_cross' ? '50日均线上穿200日均线，中长期看涨信号' : '50日均线下穿200日均线，中长期看跌信号'}
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LevelsSection
// ---------------------------------------------------------------------------

function LevelsSection({ snapshot }: { snapshot: TechnicalSnapshot }) {
  const price = snapshot.price_volume?.price;
  const support = snapshot.support_resistance?.support_1;
  const resistance = snapshot.support_resistance?.resistance_1;

  let positionPct: number | null = null;
  let dotColor = 'amber';
  let summary = '数据不足';

  if (price != null && support != null && resistance != null && resistance !== support) {
    positionPct = ((price - support) / (resistance - support)) * 100;
    positionPct = Math.min(Math.max(positionPct, 0), 100);
    if (positionPct > 75) {
      dotColor = 'amber';
      summary = `当前价格偏向阻力位 (${positionPct.toFixed(0)}% 位置)`;
    } else if (positionPct < 25) {
      dotColor = 'emerald';
      summary = `当前价格偏向支撑位 (${positionPct.toFixed(0)}% 位置)`;
    } else {
      dotColor = 'amber';
      summary = `当前价格在中间位置 (${positionPct.toFixed(0)}% 位置)`;
    }
  }

  return (
    <div className="p-5 bg-card/50 rounded-lg border border-border/40 space-y-4">
      <SectionTitle zh="关键价位" en="Levels" />

      {/* Summary: lead level */}
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full shrink-0 ${DOT_COLOR[dotColor]}`} />
        <span className="text-base font-medium text-foreground">{summary}</span>
      </div>

      {/* Price position bar */}
      {positionPct != null && support != null && resistance != null && (
        <div className="space-y-1.5">
          <div className="relative h-1.5 bg-muted/40 rounded-full overflow-visible">
            <div
              className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border-2 border-background shadow-sm bg-foreground/70"
              style={{ left: `calc(${positionPct}% - 5px)` }}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-data text-emerald-400">{formatPrice(support)}</span>
            <span className="text-sm font-data text-foreground">当前 {formatPrice(price)}</span>
            <span className="text-sm font-data text-red-400">{formatPrice(resistance)}</span>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground/70">
            <span>支撑位</span>
            <span>阻力位</span>
          </div>
        </div>
      )}

      {/* Support explanation */}
      {support != null && (
        <div className="space-y-1">
          <span className="text-sm text-foreground">支撑 {formatPrice(support)}</span>
          <p className="text-xs text-muted-foreground leading-relaxed">{SUPPORT_EXPLANATION}</p>
        </div>
      )}

      {/* Resistance explanation */}
      {resistance != null && (
        <div className="space-y-1">
          <span className="text-sm text-foreground">阻力 {formatPrice(resistance)}</span>
          <p className="text-xs text-muted-foreground leading-relaxed">{RESISTANCE_EXPLANATION}</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MACD mini indicator (upgraded with cross badge + histogram direction)
// ---------------------------------------------------------------------------

function MACDIndicator({
  histogram,
  cross,
  histogramDirection,
}: {
  histogram: number | null | undefined;
  cross?: string | null;
  histogramDirection?: string | null;
}) {
  if (histogram == null) return null;
  const isPositive = histogram > 0;

  // Cross badge takes priority
  let label: string;
  let colors: { text: string; bg: string; dot: string; border: string };
  if (cross === 'bullish_cross') {
    label = '金叉';
    colors = SIGNAL_COLORS.BUY;
  } else if (cross === 'bearish_cross') {
    label = '死叉';
    colors = SIGNAL_COLORS.SELL;
  } else {
    label = isPositive ? '看涨' : histogram < 0 ? '看跌' : '中性';
    colors = isPositive
      ? SIGNAL_COLORS.BUY
      : histogram < 0
        ? SIGNAL_COLORS.SELL
        : SIGNAL_COLORS.NEUTRAL;
  }

  return (
    <div className="space-y-1.5">
      {/* Label + value + optional cross badge */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-foreground">MACD</span>
        <div className="flex items-center gap-2">
          {(cross === 'bullish_cross' || cross === 'bearish_cross') && (
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
              cross === 'bullish_cross'
                ? 'bg-emerald-500/15 text-emerald-400'
                : 'bg-red-500/15 text-red-400'
            }`}>
              {cross === 'bullish_cross' ? '金叉' : '死叉'}
            </span>
          )}
          <span className={`text-sm font-data font-medium ${colors.text}`}>{label}</span>
        </div>
      </div>
      {/* Blocks */}
      <div className="flex items-center gap-1 h-2.5">
        {Array.from({ length: 5 }).map((_, i) => {
          const threshold = (i + 1) * 0.2;
          const filled = Math.abs(histogram) > threshold;
          return (
            <div
              key={i}
              className={`flex-1 h-full rounded-sm transition-colors ${
                filled
                  ? isPositive ? 'bg-emerald-500/60' : 'bg-red-500/60'
                  : 'bg-muted/30'
              }`}
            />
          );
        })}
      </div>
      {/* Interpretation */}
      <p className="text-xs text-muted-foreground leading-relaxed">
        {getMACDInterpretation(histogram, cross, histogramDirection)}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Volume Indicator
// ---------------------------------------------------------------------------

function VolumeIndicator({
  ratio,
  trend,
  confirmation,
}: {
  ratio?: number | null;
  trend?: string | null;
  confirmation?: boolean | null;
}) {
  if (ratio == null) return null;

  const trendLabel = trend === 'above_average' ? '放量' : trend === 'below_average' ? '缩量' : '正常';
  const trendColor = trend === 'above_average' ? 'text-emerald-400' : trend === 'below_average' ? 'text-amber-400' : 'text-foreground';

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-foreground">成交量</span>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-data font-medium ${trendColor}`}>
            {ratio.toFixed(1)}x ({trendLabel})
          </span>
          {confirmation != null && (
            <span className={`text-xs ${confirmation ? 'text-emerald-400/80' : 'text-muted-foreground/70'}`}>
              {confirmation ? '量价配合' : '量能不足'}
            </span>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        {getVolumeInterpretation(ratio, trend, confirmation)}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// IndicatorsSection
// ---------------------------------------------------------------------------

function IndicatorsSection({ snapshot, timeframe }: { snapshot: TechnicalSnapshot; timeframe: Timeframe }) {
  const rsi = timeframe === 'weekly' ? snapshot.oscillators?.rsi_14_weekly : snapshot.oscillators?.rsi_14;
  const macdHist = timeframe === 'weekly' ? snapshot.oscillators?.macd_histogram_weekly : snapshot.oscillators?.macd_histogram;
  const price = snapshot.price_volume?.price;
  const bbUpper = snapshot.volatility?.bb_upper;
  const bbLower = snapshot.volatility?.bb_lower;

  const trendCtx = snapshot.trend_context;
  const patternSigs = snapshot.pattern_signals;

  let bbWidth: number | null = null;
  let bbState = '';
  if (price != null && bbUpper != null && bbLower != null && price > 0) {
    bbWidth = ((bbUpper - bbLower) / price) * 100;
    bbState = bbWidth < 5 ? '收窄' : bbWidth > 10 ? '扩张' : '正常';
  }

  return (
    <div className="p-5 bg-card/50 rounded-lg border border-border/40 space-y-4">
      <SectionTitle zh="技术指标" en="Indicators" />

      {/* RSI */}
      {rsi != null && (
        <IndicatorBar
          name="RSI"
          value={rsi}
          min={0}
          max={100}
          zones={[{ value: 30, label: '30' }, { value: 70, label: '70' }]}
          interpretation={getRSIInterpretation(
            rsi,
            trendCtx?.rsi_direction,
            trendCtx?.rsi_recently_overbought,
            trendCtx?.rsi_recently_oversold,
          )}
        />
      )}

      {/* MACD */}
      {macdHist != null && (
        <MACDIndicator
          histogram={macdHist}
          cross={trendCtx?.macd_cross}
          histogramDirection={trendCtx?.macd_histogram_direction}
        />
      )}

      {/* Bollinger Band Width */}
      {bbWidth != null && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-foreground">布林带宽</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-data font-medium text-foreground">
                {bbWidth.toFixed(1)}% ({bbState})
              </span>
              {patternSigs?.bb_squeeze && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-500/15 text-amber-400">
                  Squeeze
                </span>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {getBBInterpretation(bbWidth, patternSigs?.bb_squeeze, patternSigs?.bb_position)}
          </p>
        </div>
      )}

      {/* Volume */}
      <VolumeIndicator
        ratio={trendCtx?.volume_ratio}
        trend={trendCtx?.volume_trend}
        confirmation={patternSigs?.volume_confirmation}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// ConfluenceSection (signal confluence / consistency)
// ---------------------------------------------------------------------------

type SignalDirection = 'bullish' | 'bearish' | 'neutral';

interface ConfluenceSignal {
  name: string;
  direction: SignalDirection;
}

function getConfluenceSignals(snapshot: TechnicalSnapshot, timeframe: Timeframe): ConfluenceSignal[] {
  const signals: ConfluenceSignal[] = [];
  const trendCtx = snapshot.trend_context;
  const patternSigs = snapshot.pattern_signals;

  // 1. MA alignment
  const maAlignment = patternSigs?.ma_alignment;
  if (maAlignment) {
    signals.push({
      name: '均线',
      direction: maAlignment === 'bullish' ? 'bullish' : maAlignment === 'bearish' ? 'bearish' : 'neutral',
    });
  }

  // 2. RSI
  const rsi = timeframe === 'weekly' ? snapshot.oscillators?.rsi_14_weekly : snapshot.oscillators?.rsi_14;
  if (rsi != null) {
    signals.push({
      name: 'RSI',
      direction: rsi > 55 ? 'bullish' : rsi < 45 ? 'bearish' : 'neutral',
    });
  }

  // 3. MACD
  const macdHist = timeframe === 'weekly' ? snapshot.oscillators?.macd_histogram_weekly : snapshot.oscillators?.macd_histogram;
  const macdCross = trendCtx?.macd_cross;
  if (macdHist != null) {
    let dir: SignalDirection = 'neutral';
    if (macdCross === 'bullish_cross' || macdHist > 0) dir = 'bullish';
    else if (macdCross === 'bearish_cross' || macdHist < 0) dir = 'bearish';
    signals.push({ name: 'MACD', direction: dir });
  }

  // 4. ADX direction (+DI/-DI)
  const plusDI = snapshot.trend?.adx_plus_di;
  const minusDI = snapshot.trend?.adx_minus_di;
  const adx = timeframe === 'weekly' ? snapshot.trend?.adx_14_weekly : snapshot.trend?.adx_14;
  if (plusDI != null && minusDI != null && adx != null && adx > 20) {
    signals.push({
      name: 'ADX',
      direction: plusDI > minusDI ? 'bullish' : minusDI > plusDI ? 'bearish' : 'neutral',
    });
  }

  // 5. Volume
  const volConfirmation = patternSigs?.volume_confirmation;
  const volTrend = trendCtx?.volume_trend;
  if (volConfirmation != null) {
    // Volume confirms the price direction
    const priceUp = macdHist != null ? macdHist > 0 : (rsi != null ? rsi > 50 : null);
    if (volConfirmation && priceUp != null) {
      signals.push({ name: '成交量', direction: priceUp ? 'bullish' : 'bearish' });
    } else if (volTrend === 'below_average') {
      signals.push({ name: '成交量', direction: 'neutral' });
    }
  }

  // 6. BB position
  const bbPosition = patternSigs?.bb_position;
  if (bbPosition) {
    let dir: SignalDirection = 'neutral';
    if (bbPosition === 'above_upper' || bbPosition === 'upper_half') dir = 'bullish';
    else if (bbPosition === 'below_lower' || bbPosition === 'lower_half') dir = 'bearish';
    // price above bb_upper could also mean overbought, but for confluence we treat position as direction
    signals.push({ name: '布林带', direction: dir });
  }

  return signals;
}

function ConfluenceSection({ snapshot, timeframe }: { snapshot: TechnicalSnapshot; timeframe: Timeframe }) {
  const signals = getConfluenceSignals(snapshot, timeframe);
  if (signals.length < 2) return null;

  const bullish = signals.filter(s => s.direction === 'bullish').length;
  const bearish = signals.filter(s => s.direction === 'bearish').length;
  const total = signals.length;

  let summary: string;
  let dotColor: string;
  const bullishPct = bullish / total;
  const bearishPct = bearish / total;

  if (bullishPct >= 0.7) {
    summary = `${bullish}/${total} 个指标看涨，信号高度一致`;
    dotColor = 'emerald';
  } else if (bearishPct >= 0.7) {
    summary = `${bearish}/${total} 个指标看跌，信号高度一致`;
    dotColor = 'red';
  } else {
    summary = `${bullish} 看涨，${bearish} 看跌，${total - bullish - bearish} 中性，信号不一致`;
    dotColor = 'amber';
  }

  const DIRECTION_COLORS: Record<SignalDirection, string> = {
    bullish: 'bg-emerald-400',
    bearish: 'bg-red-400',
    neutral: 'bg-muted-foreground/40',
  };
  const DIRECTION_LABELS: Record<SignalDirection, string> = {
    bullish: '涨',
    bearish: '跌',
    neutral: '--',
  };

  return (
    <div className="p-5 bg-card/50 rounded-lg border border-border/40 space-y-4">
      <SectionTitle zh="信号一致性" en="Confluence" />

      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full shrink-0 ${DOT_COLOR[dotColor]}`} />
        <span className="text-base font-medium text-foreground">{summary}</span>
      </div>

      {/* Signal grid */}
      <div className="flex flex-wrap gap-2">
        {signals.map((s) => (
          <div
            key={s.name}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted/20 border border-border/30"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${DIRECTION_COLORS[s.direction]}`} />
            <span className="text-xs text-muted-foreground">{s.name}</span>
            <span className={`text-xs font-medium ${
              s.direction === 'bullish' ? 'text-emerald-400' :
              s.direction === 'bearish' ? 'text-red-400' :
              'text-muted-foreground/70'
            }`}>
              {DIRECTION_LABELS[s.direction]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Dashboard
// ---------------------------------------------------------------------------

export function TechnicalSignalDashboard({ snapshot, timeframe }: TechnicalSignalDashboardProps) {
  const tldr = generateTLDR(snapshot, timeframe);
  const signalColors = SIGNAL_COLORS[tldr.signal] || SIGNAL_COLORS.NEUTRAL;

  return (
    <div className="space-y-4">
      {/* TLDR Summary Bar */}
      <div className={`p-4 rounded-lg border ${signalColors.bg} ${signalColors.border}`}>
        <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
          <span className={`w-2.5 h-2.5 rounded-full ${signalColors.dot} shrink-0`} />
          <span className={`text-base font-medium ${signalColors.text}`}>
            {tldr.signalLabel}
          </span>
          {tldr.summary && (
            <span className="text-sm text-muted-foreground">
              &mdash; {tldr.summary}
            </span>
          )}
        </div>
        <div className="text-sm font-data text-muted-foreground ml-5">
          {tldr.priceLine}
        </div>
      </div>

      {/* Sections */}
      <TrendSection snapshot={snapshot} timeframe={timeframe} />
      <LevelsSection snapshot={snapshot} />
      <IndicatorsSection snapshot={snapshot} timeframe={timeframe} />
      <ConfluenceSection snapshot={snapshot} timeframe={timeframe} />

      {/* Data source note: text-micro */}
      <div className="flex items-center gap-1 text-micro text-muted-foreground/70">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>
          数据每 15 分钟更新 &middot; TradingView
          {snapshot.fetched_at && ` \u00b7 ${new Date(snapshot.fetched_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`}
        </span>
      </div>
    </div>
  );
}
