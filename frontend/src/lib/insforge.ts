import { createClient } from '@insforge/sdk';

const INSFORGE_BASE_URL = 'https://9wmhxyi4.us-east.insforge.app';
const INSFORGE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3OC0xMjM0LTU2NzgtOTBhYi1jZGVmMTIzNDU2NzgiLCJlbWFpbCI6ImFub25AaW5zZm9yZ2UuY29tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU2NTAyNDF9.impMF8IELyFYgeBbgiOGJ3OWDqBpVMsyRXHhgaIyS4E';

export const insforge = createClient({
  baseUrl: INSFORGE_BASE_URL,
  anonKey: INSFORGE_ANON_KEY,
});

export interface MarketReport {
  id?: string;
  report_date: string;
  timestamp: string;
  short_analysis: string;
  in_depth_analysis: string;
  draft_analysis?: string;
  evaluation_report?: string;
  indices?: unknown[];
  economic_calendar?: unknown;
  earnings_calendar?: unknown;
  news_data?: unknown;
  market_data?: unknown;
  created_at?: string;
}

export async function saveMarketReport(report: Omit<MarketReport, 'id' | 'created_at'>): Promise<{ success: boolean; data?: MarketReport; error?: string }> {
  try {
    console.log('[Insforge] Saving report for date:', report.report_date);
    console.log('[Insforge] Report data keys:', Object.keys(report));

    // Check if report for this date already exists
    console.log('[Insforge] Checking if report exists...');
    const { data: existing, error: selectError } = await insforge.database
      .from('market_reports')
      .select('id')
      .eq('report_date', report.report_date)
      .maybeSingle();

    if (selectError) {
      console.error('[Insforge] Select error:', selectError);
      return { success: false, error: `Select failed: ${selectError.message}` };
    }

    console.log('[Insforge] Existing record:', existing);

    let result;
    if (existing) {
      // Update existing report
      console.log('[Insforge] Updating existing report...');
      result = await insforge.database
        .from('market_reports')
        .update(report)
        .eq('report_date', report.report_date)
        .select();
    } else {
      // Insert new report
      console.log('[Insforge] Inserting new report...');
      result = await insforge.database
        .from('market_reports')
        .insert([report])
        .select();
    }

    console.log('[Insforge] Result:', result);

    if (result.error) {
      console.error('[Insforge] Save error:', result.error);
      return { success: false, error: result.error.message };
    }

    console.log('[Insforge] Save successful:', result.data?.[0]?.id);
    return {
      success: true,
      data: result.data?.[0] as MarketReport
    };
  } catch (error) {
    console.error('[Insforge] Caught exception:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

export async function getLatestReport(): Promise<MarketReport | null> {
  try {
    const { data, error } = await insforge.database
      .from('market_reports')
      .select('*')
      .order('report_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error fetching latest report:', error);
      return null;
    }

    return data as MarketReport | null;
  } catch (error) {
    console.error('Error fetching latest report:', error);
    return null;
  }
}

export async function getReportByDate(date: string): Promise<MarketReport | null> {
  try {
    const { data, error } = await insforge.database
      .from('market_reports')
      .select('*')
      .eq('report_date', date)
      .maybeSingle();

    if (error) {
      console.error('Error fetching report:', error);
      return null;
    }

    return data as MarketReport | null;
  } catch (error) {
    console.error('Error fetching report:', error);
    return null;
  }
}

export async function getReportsList(limit = 10, offset = 0): Promise<{ data: MarketReport[]; total: number }> {
  try {
    const { data, error, count } = await insforge.database
      .from('market_reports')
      .select('id, report_date, timestamp, short_analysis, created_at', { count: 'exact' })
      .order('report_date', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Error fetching reports:', error);
      return { data: [], total: 0 };
    }

    return {
      data: (data || []) as MarketReport[],
      total: count || 0
    };
  } catch (error) {
    console.error('Error fetching reports:', error);
    return { data: [], total: 0 };
  }
}
