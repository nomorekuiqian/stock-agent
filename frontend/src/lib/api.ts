const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

export interface MarketIndex {
  name: string;
  value: number;
  previous_value?: number;
  change_percent?: number;
}

export interface MarketTrend {
  name: string;
  current: number;
  week_change: number;
  month_change: number;
  trend: string;
}

export interface YieldCurveData {
  rates: Record<string, number>;
  changes: Record<string, number>;
}

export interface SpreadsData {
  '10y_3m': number | null;
  '10y_5y': number | null;
  inversion_warning: boolean;
}

export interface LiquidityData {
  yield_curve: YieldCurveData;
  spreads: SpreadsData;
}

export interface MacroData {
  indices: MarketIndex[];
  trends: MarketTrend[];
  liquidity?: LiquidityData;
  timestamp: string;
  short_analysis: string;
  in_depth_analysis: string;
}

export const api = {
  getMacroAnalysis: async (): Promise<MacroData> => {
    const response = await fetch(`${API_BASE_URL}/macro`, {
      method: 'POST',
    });
    if (!response.ok) {
      throw new Error('Failed to fetch macro analysis');
    }
    return response.json();
  },
};
