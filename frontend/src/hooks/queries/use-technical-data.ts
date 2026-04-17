import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './query-keys';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

export type Timeframe = 'daily' | 'weekly';

export interface OHLCVPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IndicatorPoint {
  date: string;
  value: number;
}

export interface MACDPoint {
  date: string;
  macd: number;
  signal: number;
  histogram: number;
}

export interface BBPoint {
  date: string;
  upper: number;
  middle: number;
  lower: number;
}

export interface ChartAnnotation {
  type: 'support' | 'resistance' | 'signal';
  price?: number;
  date?: string;
  label: string;
  direction: 'bullish' | 'bearish' | 'neutral';
}

export interface TechnicalData {
  symbol: string;
  timeframe: string;
  ohlcv: OHLCVPoint[];
  indicators: {
    rsi_14: IndicatorPoint[];
    sma_20: IndicatorPoint[];
    sma_50: IndicatorPoint[];
    sma_200: IndicatorPoint[];
    ema_12: IndicatorPoint[];
    ema_26: IndicatorPoint[];
    adx_14: IndicatorPoint[];
    macd: MACDPoint[];
    bb: BBPoint[];
  };
  current: Record<string, number | null>;
  derived: {
    ma_alignment: string;
    rsi_zone: string;
    macd_cross: string;
    sma_50_200_cross: string;
    bb_position: string;
    bb_squeeze: boolean;
    trend_direction: string;
    trend_strength: number;
    volume_trend: string;
    volume_ratio: number;
  };
  support_resistance: {
    current_price?: number;
    support_1?: number;
    support_2?: number;
    resistance_1?: number;
    resistance_2?: number;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  trend_summary: Record<string, any>;
  fetched_at: string;
}

export function useTechnicalData(symbol: string, timeframe: string = 'daily', enabled: boolean = true) {
  return useQuery<TechnicalData>({
    queryKey: queryKeys.stocks.technicalData(symbol, timeframe),
    queryFn: async () => {
      const response = await fetch(
        `${API_BASE_URL}/stocks/${symbol}/technical-data?timeframe=${timeframe}`
      );
      if (!response.ok) {
        throw new Error(`Failed to fetch technical data: ${response.status}`);
      }
      return response.json();
    },
    enabled: enabled && !!symbol,
    staleTime: 10 * 60 * 1000,    // 10 min
    gcTime: 30 * 60 * 1000,       // 30 min
  });
}
