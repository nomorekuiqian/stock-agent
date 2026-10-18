import Link from 'next/link';
import { seoData } from '@/lib/seo-data';
import { percent } from '@/lib/seo-public';
import { SourceStamp } from './PublicSeo';
type Row={date:string;timestamp:string;summary:string;indices:{name:string;change_percent?:number}[]};
export async function ReportTimeline(){const rows=await seoData<Row[]>('report-timeline');if(!rows?.length)return null;return <section className="mx-auto max-w-5xl px-4 py-8 space-y-4"><h2 className="text-xl">美股为什么涨跌：近 10 个交易日时间线</h2><ol className="space-y-4">{rows.slice(0,10).map(r=><li key={r.date} className="border-b border-border pb-4"><Link href={`/today/${r.date}-market-report`}>{r.date} 收盘复盘</Link><p>{r.indices.filter(i=>/nasdaq|s&p|纳斯达克|纳指|标普/i.test(i.name)).map(i=>percent(i.change_percent)?`${i.name} ${percent(i.change_percent)}`:'').filter(Boolean).join(' · ')}</p><p>{r.summary}</p><SourceStamp at={r.timestamp||r.date} source="当日收盘日报"/></li>)}</ol></section>}
