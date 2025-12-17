const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

export interface MarketIndex {
  name: string;
  value: number;
  previous_value?: number;
  change_percent?: number;
}

export interface EconomicEvent {
  date: string;
  event: string;
  previous?: string | number | null;
  estimate?: string | number | null;
  is_key_event?: boolean;
}

export interface EarningsEvent {
  symbol: string;
  date: string;
  epsEstimated?: number | null;
  revenueEstimated?: number | null;
  is_ai_related?: boolean;
}

export interface CalendarEvent {
  date: string;
  event: string;
  analysis: string;
}

// New structured types for market report
export interface MacroSignal {
  name: string;
  current_value: string;
  change: string;
  trend_direction: 'up' | 'down' | 'flat';
  analysis: string;
}

export interface MacroSection {
  signals: MacroSignal[];
  summary: string;
}

export interface HeadlineNews {
  title: string;
  fact_summary: string;
  deep_analysis: string;
  url: string;
}

export interface BriefNews {
  title: string;
  summary: string;
  analysis: string;
  url: string;
}

export interface NewsSection {
  headlines: HeadlineNews[];
  briefs: BriefNews[];
}

export interface MarketData {
  report_id?: string;  // Report ID for navigation
  indices: MarketIndex[];
  timestamp: string;

  // New structured fields
  title?: string;
  summary?: string;
  quick_take?: string;
  market_narrative?: string;
  macro?: MacroSection;
  news?: NewsSection;
  conclusion?: string;
  calendar?: CalendarEvent[];

  // Legacy fields (for backward compatibility)
  short_analysis?: string;
  in_depth_analysis?: string;

  // Raw data
  economic_calendar?: {
    count: number;
    events: EconomicEvent[];
    date_range?: { start: string; end: string };
  };
  earnings_calendar?: {
    count: number;
    earnings: EarningsEvent[];
    date_range?: { start: string; end: string };
  };
  news_data?: unknown;
  market_data?: unknown;
  from_cache?: boolean;  // Whether report came from database cache
}

export interface SendEmailResponse {
  success: boolean;
  message: string;
  email_id?: string;
  sent_to?: string;
}

export interface DigestResponse {
  user_id: string;
  symbols_used: string[];
  analysis: string;
  news_data: unknown[];
  timestamp: string;
}

export interface SubscribeResponse {
  success: boolean;
  message: string;
  email: string;
  contact_id?: string;
}

export interface UnsubscribeResponse {
  success: boolean;
  message: string;
  email: string;
}

export interface EmailPreviewResponse {
  success: boolean;
  html: string;
  report_id: string;
  report_date: string;
}

// Liquidity Monitor Types
export interface LiquidityMetric {
  series_id: string;
  title: string;
  value: number | null;
  date: string | null;
  units: string;
  change: number | null;
  previous_date?: string | null;
  formula?: string;
  error?: string;
}

export interface LiquidityMetrics {
  fed_assets: LiquidityMetric;
  tga: LiquidityMetric;
  rrp: LiquidityMetric;
  reserves: LiquidityMetric;
  sofr: LiquidityMetric;
  effr: LiquidityMetric;
  nfci: LiquidityMetric;
  net_liquidity: LiquidityMetric;
}

export interface LiquidityMetricsResponse {
  success: boolean;
  timestamp: string;
  metrics: LiquidityMetrics;
}

export interface LiquidityHistoryObservation {
  time: string;
  value: number;
  fed_assets: number;
  tga: number;
  rrp: number;
  reserves?: number;
  sofr?: number;
  effr?: number;
  nfci?: number;
}

export interface LiquidityHistoryData {
  series_id: string;
  title: string;
  units: string;
  formula: string;
  observations: LiquidityHistoryObservation[];
  metrics?: LiquidityMetrics;
}

export interface LiquidityHistoryResponse {
  success: boolean;
  timestamp: string;
  data: LiquidityHistoryData;
}

// Liquidity Analysis Types
export interface LiquidityAnalysis {
  id?: string;
  analysis: string;
  status: string;
  generated_at: string;
  model?: string;
  metrics_snapshot?: {
    net_liquidity?: number | null;
    fed_assets?: number | null;
    tga?: number | null;
    rrp?: number | null;
    nfci?: number | null;
  };
}

export interface LiquidityAnalysisResponse {
  success: boolean;
  analysis?: LiquidityAnalysis;
  error?: string;
}

export const api = {
  getMarketAnalysis: async (force: boolean = false): Promise<MarketData> => {
    const response = await fetch(`${API_BASE_URL}/market`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ force }),
    });
    if (!response.ok) {
      throw new Error('Failed to fetch market analysis');
    }
    return response.json();
  },

  sendReportEmail: async (email?: string): Promise<SendEmailResponse> => {
    const response = await fetch(`${API_BASE_URL}/report/send-test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to send email' }));
      throw new Error(error.detail || 'Failed to send email');
    }
    return response.json();
  },

  generateDigest: async (symbols: string[]): Promise<DigestResponse> => {
    const response = await fetch(`${API_BASE_URL}/digest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ symbols }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to generate digest' }));
      throw new Error(error.detail || 'Failed to generate digest');
    }
    return response.json();
  },

  subscribe: async (email: string, firstName?: string): Promise<SubscribeResponse> => {
    const response = await fetch(`${API_BASE_URL}/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, first_name: firstName }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to subscribe' }));
      throw new Error(error.detail || 'Failed to subscribe');
    }
    return response.json();
  },

  unsubscribe: async (email: string): Promise<UnsubscribeResponse> => {
    const response = await fetch(`${API_BASE_URL}/unsubscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to unsubscribe' }));
      throw new Error(error.detail || 'Failed to unsubscribe');
    }
    return response.json();
  },

  getEmailPreview: async (reportId?: string): Promise<EmailPreviewResponse> => {
    const url = reportId
      ? `${API_BASE_URL}/report/preview?report_id=${reportId}`
      : `${API_BASE_URL}/report/preview`;
    const response = await fetch(url);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to get email preview' }));
      throw new Error(error.detail || 'Failed to get email preview');
    }
    return response.json();
  },

  // Liquidity Monitor APIs
  getLiquidityMetrics: async (): Promise<LiquidityMetricsResponse> => {
    const response = await fetch(`${API_BASE_URL}/liquidity/metrics`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to fetch liquidity metrics' }));
      throw new Error(error.detail || 'Failed to fetch liquidity metrics');
    }
    return response.json();
  },

  getLiquidityHistory: async (days: number = 365): Promise<LiquidityHistoryResponse> => {
    const response = await fetch(`${API_BASE_URL}/liquidity/history?days=${days}`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to fetch liquidity history' }));
      throw new Error(error.detail || 'Failed to fetch liquidity history');
    }
    return response.json();
  },

  // Liquidity Analysis APIs
  generateLiquidityAnalysis: async (): Promise<LiquidityAnalysisResponse> => {
    const response = await fetch(`${API_BASE_URL}/liquidity/analysis`, {
      method: 'POST',
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to generate analysis' }));
      throw new Error(error.detail || 'Failed to generate analysis');
    }
    return response.json();
  },

  getLatestLiquidityAnalysis: async (): Promise<LiquidityAnalysisResponse> => {
    const response = await fetch(`${API_BASE_URL}/liquidity/analysis/latest`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to fetch analysis' }));
      throw new Error(error.detail || 'Failed to fetch analysis');
    }
    return response.json();
  },
};
