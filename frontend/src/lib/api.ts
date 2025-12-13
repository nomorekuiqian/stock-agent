const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

export interface MarketIndex {
  name: string;
  value: number;
  previous_value?: number;
  change_percent?: number;
}

export interface MarketData {
  indices: MarketIndex[];
  timestamp: string;
  short_analysis: string;
  in_depth_analysis: string;
  economic_calendar?: unknown;
  earnings_calendar?: unknown;
  news_data?: unknown;
  market_data?: unknown;
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

export const api = {
  getMarketAnalysis: async (): Promise<MarketData> => {
    const response = await fetch(`${API_BASE_URL}/market`, {
      method: 'POST',
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
};
