const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

export interface MarketIndex {
  name: string;
  value: number;
  previous_value?: number;
  change_percent?: number;
}

export interface MacroData {
  indices: MarketIndex[];
  timestamp: string;
  short_analysis: string;
  in_depth_analysis: string;
}

export interface SendEmailResponse {
  success: boolean;
  message: string;
  email_id?: string;
  sent_to?: string;
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
};
