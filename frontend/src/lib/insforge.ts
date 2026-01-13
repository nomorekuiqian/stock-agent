import { createClient } from '@insforge/sdk';
import { nowIso, todayStr } from './timezone';
import {
  MacroSection,
  NewsSection,
  CalendarEvent,
  StockAnalysis,
  DigestNewsSection,
  DigestEvent,
  DigestSummary,
  DigestResponse,
} from './api';

const INSFORGE_BASE_URL = 'https://9wmhxyi4.us-east.insforge.app';
const INSFORGE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3OC0xMjM0LTU2NzgtOTBhYi1jZGVmMTIzNDU2NzgiLCJlbWFpbCI6ImFub25AaW5zZm9yZ2UuY29tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU2NTAyNDF9.impMF8IELyFYgeBbgiOGJ3OWDqBpVMsyRXHhgaIyS4E';

export const insforge = createClient({
  baseUrl: INSFORGE_BASE_URL,
  anonKey: INSFORGE_ANON_KEY,
});

// MarketReport schema - matches database directly (snake_case)
export interface MarketReport {
  id?: string;
  created_at?: string;
  report_date: string;
  timestamp: string;
  title?: string;
  summary?: string;
  short_analysis?: string;
  in_depth_analysis?: string;
  intro?: string;
  macro?: MacroSection;
  news?: NewsSection;
  report_summary?: string;
  calendar?: CalendarEvent[];
  indices?: unknown[];
  market_data?: unknown;
}

export async function saveMarketReport(report: Omit<MarketReport, 'id' | 'created_at'>): Promise<{ success: boolean; data?: MarketReport; error?: string }> {
  try {
    console.log('[Insforge] Saving new report for date:', report.report_date);
    console.log('[Insforge] Report timestamp:', report.timestamp);

    // Always insert a new report (don't overwrite existing ones)
    const result = await insforge.database
      .from('market_reports')
      .insert([report])
      .select();

    if (result.error) {
      console.error('[Insforge] Save error:', result.error);
      return { success: false, error: result.error.message };
    }

    console.log('[Insforge] Save successful, new report ID:', result.data?.[0]?.id);
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
    // Get the latest report for this date (in case there are multiple)
    const { data, error } = await insforge.database
      .from('market_reports')
      .select('*')
      .eq('report_date', date)
      .order('created_at', { ascending: false })
      .limit(1)
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

export async function getReportById(id: string): Promise<MarketReport | null> {
  try {
    const { data, error } = await insforge.database
      .from('market_reports')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('Error fetching report by ID:', error);
      return null;
    }

    return data as MarketReport | null;
  } catch (error) {
    console.error('Error fetching report by ID:', error);
    return null;
  }
}

export async function getReportsList(limit = 10, offset = 0): Promise<{ data: MarketReport[]; total: number }> {
  try {
    // Order by created_at to show all reports including multiple per day
    const { data, error, count } = await insforge.database
      .from('market_reports')
      .select('id, report_date, timestamp, title, summary, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
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


// =============================================================================
// User Watchlist Functions
// =============================================================================

export interface UserWatchlist {
  id?: string;
  user_id: string;
  symbols: string[];
  created_at?: string;
  updated_at?: string;
}

export async function getUserWatchlist(userId: string): Promise<UserWatchlist | null> {
  try {
    const { data, error } = await insforge.database
      .from('user_watchlists')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching watchlist:', error);
      return null;
    }

    return data as UserWatchlist | null;
  } catch (error) {
    console.error('Error fetching watchlist:', error);
    return null;
  }
}

export async function saveUserWatchlist(
  userId: string,
  symbols: string[]
): Promise<{ success: boolean; data?: UserWatchlist; error?: string }> {
  try {
    console.log('[Insforge] Saving watchlist for user:', userId);

    // Debug: Check current session
    const { data: sessionData } = insforge.auth.getCurrentSession();
    console.log('[Insforge] Current session:', sessionData?.session ? 'Active' : 'None');
    console.log('[Insforge] Session user ID:', sessionData?.session?.user?.id);
    console.log('[Insforge] Requested user ID:', userId);
    console.log('[Insforge] Access token exists:', !!sessionData?.session?.accessToken);
    console.log('[Insforge] Access token (first 50 chars):', sessionData?.session?.accessToken?.substring(0, 50));

    if (!sessionData?.session) {
      console.error('[Insforge] No active session - RLS will block this operation');
      return { success: false, error: 'Not authenticated. Please sign in again.' };
    }

    if (sessionData.session.user.id !== userId) {
      console.error('[Insforge] User ID mismatch - session:', sessionData.session.user.id, 'requested:', userId);
      return { success: false, error: 'User ID mismatch. Please sign in again.' };
    }

    // Check if watchlist exists for this user
    const { data: existing, error: selectError } = await insforge.database
      .from('user_watchlists')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    if (selectError) {
      console.error('[Insforge] Select error:', selectError);
      return { success: false, error: `Select failed: ${selectError.message}` };
    }

    const watchlistData: Record<string, unknown> = {
      user_id: userId,
      symbols: symbols,
      updated_at: nowIso(),
    };

    let result;
    if (existing) {
      // Update existing watchlist
      result = await insforge.database
        .from('user_watchlists')
        .update(watchlistData)
        .eq('user_id', userId)
        .select();
    } else {
      // Insert new watchlist
      result = await insforge.database
        .from('user_watchlists')
        .insert([watchlistData])
        .select();
    }

    if (result.error) {
      console.error('[Insforge] Save watchlist error:', JSON.stringify(result.error, null, 2));
      const errorMsg = result.error.message || result.error.details || JSON.stringify(result.error);
      return { success: false, error: errorMsg };
    }

    return {
      success: true,
      data: result.data?.[0] as UserWatchlist
    };
  } catch (error) {
    console.error('[Insforge] Caught exception:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}


// =============================================================================
// User Digest Functions (PersonalDigest)
// =============================================================================

export interface UserDigest {
  id?: string;
  user_id: string;
  digest_date: string;
  symbols: string[];
  // Legacy fields
  analysis: string;
  news_data?: unknown[];
  // New structured fields
  greeting?: string;
  one_line_summary?: string;
  bottom_line?: string;  // Legacy, kept for backward compatibility
  digest_data?: {
    stocks?: StockAnalysis[];
    news?: DigestNewsSection;
    events?: DigestEvent[];
    summary?: DigestSummary;
  };
  created_at?: string;
}

export async function saveUserDigest(
  userId: string,
  digest: DigestResponse
): Promise<{ success: boolean; data?: UserDigest; error?: string }> {
  try {
    const digestDate = todayStr();

    const digestData = {
      user_id: userId,
      digest_date: digestDate,
      symbols: digest.symbols_used,
      // Legacy field for backward compatibility
      analysis: digest.summary?.content || '',
      news_data: digest.news || { headlines: [], briefs: [] },
      // New structured fields
      greeting: digest.greeting || '',
      one_line_summary: digest.one_line_summary || '',
      bottom_line: digest.summary?.content || '',
      digest_data: {
        stocks: digest.stocks || [],
        news: digest.news || { headlines: [], briefs: [] },
        events: digest.events || [],
        summary: digest.summary || null,
      },
    };

    // Check if digest exists for this user and date
    const { data: existing, error: selectError } = await insforge.database
      .from('personal_digests')
      .select('id')
      .eq('user_id', userId)
      .eq('digest_date', digestDate)
      .maybeSingle();

    if (selectError) {
      console.error('[Insforge] Select error:', selectError);
      return { success: false, error: `Select failed: ${selectError.message}` };
    }

    let result;
    if (existing) {
      // Update existing digest
      result = await insforge.database
        .from('personal_digests')
        .update(digestData)
        .eq('user_id', userId)
        .eq('digest_date', digestDate)
        .select();
    } else {
      // Insert new digest
      result = await insforge.database
        .from('personal_digests')
        .insert([digestData])
        .select();
    }

    if (result.error) {
      console.error('[Insforge] Save error:', result.error);
      return { success: false, error: result.error.message };
    }

    console.log('[Insforge] Digest saved successfully');
    return {
      success: true,
      data: result.data?.[0] as UserDigest
    };
  } catch (error) {
    console.error('[Insforge] Caught exception:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

export async function getUserDigestByDate(
  userId: string,
  date: string
): Promise<UserDigest | null> {
  try {
    const { data, error } = await insforge.database
      .from('personal_digests')
      .select('*')
      .eq('user_id', userId)
      .eq('digest_date', date)
      .maybeSingle();

    if (error) {
      console.error('Error fetching digest:', error);
      return null;
    }

    return data as UserDigest | null;
  } catch (error) {
    console.error('Error fetching digest:', error);
    return null;
  }
}

export async function getUserDigests(
  userId: string,
  limit = 10,
  offset = 0
): Promise<{ data: UserDigest[]; total: number }> {
  try {
    const { data, error, count } = await insforge.database
      .from('personal_digests')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('digest_date', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Error fetching digests:', error);
      return { data: [], total: 0 };
    }

    return {
      data: (data || []) as UserDigest[],
      total: count || 0
    };
  } catch (error) {
    console.error('Error fetching digests:', error);
    return { data: [], total: 0 };
  }
}

export async function getUserDigestById(id: string): Promise<UserDigest | null> {
  try {
    const { data, error } = await insforge.database
      .from('personal_digests')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('Error fetching digest by ID:', error);
      return null;
    }

    return data as UserDigest | null;
  } catch (error) {
    console.error('Error fetching digest by ID:', error);
    return null;
  }
}
