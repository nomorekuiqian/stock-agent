import { DIRECTORY_SYMBOLS } from './stock-directory';
import { publicFetch } from './public-fetch';
import type { MarketData, MorningReport } from './api';
import { dailyText, morningIndexable } from './report-seo';
import { han } from './seo-public';
import samples from './seo-samples.json';
import { seoData, type StockSeoData, type KolData } from './seo-data';
import { stockContent } from './stock-seo-content';
import { SITE_URL } from './seo';
import { reportPath, validReportDate } from './report-url';

// Small shards bound API work as well as staying below Google's 50,000 URL limit.
export const SHARD_SIZE = 1000;
// Content/template revision date, never the request or build time. Update when visible content changes.
const STATIC_REVISIONS:Record<string,string> = {'/guide/us-market-hours':'2026-10-18','/about':'2026-10-17','/privacy':'2026-10-17','/contact':'2026-10-17','/terms':'2026-10-18','/stock':'2026-10-18'};
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';
const endpoints = { today: 'market/reports', morning: 'morning/reports', 'twitter-digest': 'twitter-digest/archive/teaser' };
type Kind = keyof typeof endpoints;
type Row = { id: string; report_date?: string; timestamp?: string; date?: string; generated_at?: string };
export type Entry = { url: string; lastModified?: string };
export const STATIC_PATHS = ['', '/today', '/today/archive', '/morning', '/morning/archive', '/macro', '/macro/economy', '/macro/inflation-rates', '/macro/liquidity', '/macro/sentiment', '/macro/weekly', '/stock', '/pricing', '/contact', '/about', '/terms', '/privacy', '/twitter-digest', '/twitter-digest/archive', '/guide/us-market-hours'];
async function page(kind: Kind, limit: number, offset: number): Promise<{ data: Row[]; total?: number }> {
  const response = await fetch(`${API_BASE}/${endpoints[kind]}?limit=${limit}&offset=${offset}`, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`Sitemap ${kind}: HTTP ${response.status}`);
  return response.json();
}
export async function sitemapFiles(): Promise<string[]> {
  const files = ['static.xml', 'stock-0.xml', 'kol-0.xml'];
  for (const kind of Object.keys(endpoints) as Kind[]) {
    // An unavailable source must not publish a successful incomplete index.
    const first = await page(kind, 1, 0);
    const count = Math.ceil((first.total ?? first.data.length) / SHARD_SIZE);
    for (let i = 0; i < count; i++) files.push(`${kind}-${i}.xml`);
  }
  return files;
}
export async function sitemapEntries(file: string): Promise<Entry[] | null> {
  if (file === 'kol-0.xml') {
    const docs=await Promise.all(['qinbafrank','aleabitoreddit'].map(name=>seoData<KolData>(`kol/${name}`)));
    const newest=docs.map(d=>d?.updated_at).filter((d):d is string=>!!d).sort().at(-1);
    return [{url:`${SITE_URL}/kol`,...(newest?{lastModified:newest}:{})},...docs.filter((d):d is KolData=>!!d&&d.license_status!=='prohibited').map(d=>({url:`${SITE_URL}/kol/${d.username==='aleabitoreddit'?'serenity':d.username}`,...(d.updated_at?{lastModified:d.updated_at}:{})}))];
  }
  if (file === 'static.xml') {
    const [weekly,sentiment,liquidity]=await Promise.all([publicFetch<{data:{generated_at?:string}|null}>('/weekly-report'),seoData<{indicators:{date?:string}[];history:{date?:string;time?:string}[]}>('sentiment'),publicFetch<{data:{metrics?:{net_liquidity:{date?:string}}}}>('/liquidity/history?days=365')]);
    const [daily,morning]=await Promise.all([publicFetch<{data:MarketData}>('/market/reports/latest'),publicFetch<{data:MorningReport}>('/morning/reports/latest')]);
    const revisions={...STATIC_REVISIONS,'/macro/sentiment':sentiment?.indicators.map(r=>r.date).filter(Boolean).sort().at(-1)||sentiment?.history.at(-1)?.date||sentiment?.history.at(-1)?.time,'/macro/liquidity':weekly?.data?.generated_at||liquidity?.data.metrics?.net_liquidity.date,'/today':daily?.data?.timestamp,'/morning':morning?.data?.timestamp,'':[daily?.data?.timestamp,morning?.data?.timestamp].filter(Boolean).sort().at(-1)};
    return STATIC_PATHS.map(path=>({url:`${SITE_URL}${path}`,...(revisions[path as keyof typeof revisions]?{lastModified:revisions[path as keyof typeof revisions]}:{})}));
  }
  if (file === 'stock-0.xml') {
    const entries:Entry[]=[];
    const symbols=[...new Set([...DIRECTORY_SYMBOLS,...samples.map(s=>s.symbol)])];
    // Bound upstream concurrency; do not silently omit an outage as a successful sitemap.
    for(let offset=0;offset<symbols.length;offset+=4){
      const docs=await Promise.all(symbols.slice(offset,offset+4).map(symbol=>seoData<StockSeoData>(`stock/${symbol}`)));
      for(const d of docs){if(!d)continue; const c=stockContent(d);if(c.quality.index){entries.push({url:`${SITE_URL}/stock/${d.symbol}`,...(d.updated_at?{lastModified:d.updated_at}:{})});}}
    }
    return entries;
  }
  const match = /^(today|morning|twitter-digest)-(0|[1-9]\d*)\.xml$/.exec(file);
  if (!match) return null;
  const kind = match[1] as Kind;
  const start = Number(match[2]) * SHARD_SIZE;
  if (!Number.isSafeInteger(start)) return null;
  const entries: Entry[] = [];
  const limit = kind === 'twitter-digest' ? 50 : 100;
  for (let offset = start; offset < start + SHARD_SIZE; offset += limit) {
    const result = await page(kind, limit, offset);
    for(let batch=0;batch<result.data.length;batch+=4) {
      const candidates=await Promise.all(result.data.slice(batch,batch+4).map(async row=>{
        const date=row.report_date||row.date;
        if(!validReportDate(date))return null;
        if(kind==='twitter-digest'){
          const teaser=await publicFetch<{intro_preview:string;generated_at?:string}>(`/twitter-digest/teaser/${date}`);
          if(!teaser||han(teaser.intro_preview)<300)return null;
          return {url:`${SITE_URL}/twitter-digest/${date}`,...(teaser.generated_at?{lastModified:teaser.generated_at}:{})};
        }
        const endpoint=kind==='today'?'market':'morning';
        const detail=await publicFetch<{data:MarketData|MorningReport}>(`/${endpoint}/reports/date/${date}`);
        if(!detail?.data)return null;
        const indexable=kind==='morning'?morningIndexable(detail.data as MorningReport):han(dailyText(detail.data as MarketData))>=300;
        if(!indexable)return null;
        const path=reportPath(kind as 'today'|'morning',row);
        const modified=detail.data.timestamp||row.timestamp||row.report_date;
        return {url:`${SITE_URL}${path}`,...(modified?{lastModified:modified}:{})};
      }));
      entries.push(...candidates.filter((row):row is Entry=>row!==null));
    }
    if (result.data.length < limit || (result.total !== undefined && offset + result.data.length >= result.total)) break;
  }
  return [...new Map(entries.map(entry => [entry.url, entry])).values()];
}
export function xmlEscape(value: string) { return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;'); }
export function sitemapXml(entries: Entry[]) {
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.map(entry => `<url><loc>${xmlEscape(entry.url)}</loc>${entry.lastModified ? `<lastmod>${xmlEscape(entry.lastModified)}</lastmod>` : ''}</url>`).join('')}</urlset>`;
}
export const XML_HEADERS = { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=300' };
