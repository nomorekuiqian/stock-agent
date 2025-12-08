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

export interface StockInfo {
  symbol: string;
  longName: string;
  currentPrice: number | null;
  sector: string;
  industry: string;
  marketCap: number | null;
}

export interface AnalysisResponse {
  fundamental_analysis: string;
  technical_analysis: string;
  news_analysis: string;
  sentiment_analysis: string;
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

  getStockInfo: async (ticker: string): Promise<StockInfo> => {
    const response = await fetch(`${API_BASE_URL}/stock/${ticker}`);
    if (!response.ok) {
      throw new Error('Failed to fetch stock info');
    }
    return response.json();
  },

  analyzeStock: async (ticker: string): Promise<AnalysisResponse> => {
    const response = await fetch(`${API_BASE_URL}/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ticker }),
    });
    if (!response.ok) {
      throw new Error('Failed to analyze stock');
    }
    return response.json();
  },
};
