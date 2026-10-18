import { cache } from 'react';
const API=process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';
export const seoData=cache(async <T,>(path: string): Promise<T | null> => {
  const response=await fetch(`${API}/seo/${path}`,{next:{revalidate:3600},signal:AbortSignal.timeout(60000)});
  if(response.status===404) return null;
  if(!response.ok) throw new Error(`SEO source ${path}: ${response.status}`);
  return response.json();
});
export interface KolData { username:string; license_status?:string; weekly_summary?:string; source?:string; refresh_frequency?:string; updated_at:string|null; total:number; top_tickers:{symbol:string;count:number;stance?:string}[]; timeline:{id:string;date:string;summary:string;url:string;tickers:string[];stances:{ticker:string;stance:string}[]}[] }
export interface EarningsCalendar { week_start:string; updated_at:string; earnings:{symbol:string;date:string;time?:string;confirmation?:string;fiscal_period?:string;epsEstimated?:number|null;epsActual?:number|null;revenueActual?:number|null;revenueEstimated?:number|null}[] }
export interface StockSeoData {
 company_faq?:{q:string;a:string;source:string}[]; symbol:string; why_summary?:string; title_variant?:{direction:string;title_variant_changed_at:string}|null; change_20d?:number|null; drawdown_from_high?:number|null; kol_stats?:{n_kol:number;n_posts:number;bull:number;bear:number;disputed:number}; updated_at:string|null; content_hash:string; about:string; about_source?:string; ai_summary:string; earnings_analysis:string; earnings_notes:string;kol_conclusion?:string;module_dates?:Record<string,string|null>;
 profile:{company_name:string;exchange?:string;company_name_zh?:string;company_details?:{website?:string};classification?:{industry?:string;sector?:string}};
 stock:{quote:{price?:number;change_percent?:number;market_cap?:number;pe_ratio?:number};meta?:{quote_fetched_at?:string};financials?:{quarters:{period:string;income_statement?:{revenue?:number;eps?:number}}[]}};
 reports:{date:string;summary:string;url:string;change_percent:number|null;source?:string;source_ids?:string[];confidence?:string}[]; why:StockSeoData['reports']; kol:(KolData['timeline'][number]&{username:string})[];
 earnings:{segments?:{period:string;name:string;revenue:number}[];transcript_points?:string[];income_statements?:{date:string;revenue?:number;eps?:number}[];earnings_history?:{quarter:string;eps_actual?:number;eps_estimate?:number;revenue_actual?:number;revenue_estimate?:number}[]}; next_earnings:EarningsCalendar['earnings'][number]|null;
 latest_actuals?:EarningsCalendar['earnings'][number]|null;
 analyst:{low?:number;mean?:number;high?:number;number_of_analysts?:number;target_low?:number;target_mean?:number;target_high?:number;analyst_count?:number}; dividend_yield:number|null;
}
