import Link from 'next/link';
import { notFound } from 'next/navigation';
import { publicFetch } from '@/lib/public-fetch';
import type { TwitterDigestTeaser } from '@/lib/api';
import { pageMetadata, serializeJsonLd, SITE_URL } from '@/lib/seo';
import { Answer, PublicDisclaimer, SourceStamp } from '@/components/PublicSeo';
import { han, cleanPublic, breadcrumbs } from '@/lib/seo-public';
import { PaidDateAccess } from './PaidDateAccess';
export const dynamic='force-dynamic';
type Props={params:Promise<{date:string}>};
async function data(date:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return null;return publicFetch<TwitterDigestTeaser>(`/twitter-digest/teaser/${date}`);}
export async function generateMetadata({params}:Props){const {date}=await params;const d=await data(date);return {...pageMetadata(`/twitter-digest/${date}`,`${date} 美股博主观点简报`,cleanPublic(d?.intro_preview,80)||'公开摘要与来源入口。'),robots:{index:!!d&&han(cleanPublic(d.intro_preview))>=300,follow:true}};}
export default async function Page({params}:Props){const {date}=await params;const d=await data(date);if(!d)notFound();return <main className="mx-auto max-w-5xl px-4 py-10 space-y-6"><h1 className="text-3xl font-editorial">{date} · {cleanPublic(d.headline)||'美股博主观点简报'}</h1><Answer at={d.generated_at}>{cleanPublic(d.intro_preview)}</Answer><section><h2 className="text-xl">公开观点摘要</h2><p>{cleanPublic(d.intro_preview)}</p></section><SourceStamp at={d.generated_at} source="美股博主观点简报"/><div className="flex flex-wrap gap-4">{d.hot_tickers.map(r=><Link key={r.label} href={`/stock/${r.label.replace(/^\$/,'')}#kol`}>{r.label} · {r.count} 次提及</Link>)}</div><nav className="flex gap-4"><Link href="/twitter-digest">最新简报</Link><Link href="/kol/serenity">Serenity 观点</Link><Link href="/kol/qinbafrank">qinbafrank 观点</Link></nav><section className="paywalled-content"><h2 className="text-xl">完整观点与来源证据</h2><Link href="/pricing">Pro 订阅权益</Link><PaidDateAccess/></section><PublicDisclaimer at={d.generated_at}/><script type="application/ld+json" dangerouslySetInnerHTML={{__html:serializeJsonLd({'@context':'https://schema.org','@graph':[{'@type':'Article',headline:cleanPublic(d.headline),url:`${SITE_URL}/twitter-digest/${date}`,datePublished:d.generated_at,dateModified:d.generated_at,isAccessibleForFree:false,hasPart:{'@type':'WebPageElement',isAccessibleForFree:false,cssSelector:'.paywalled-content'}},breadcrumbs([{name:'博主观点简报',path:'/twitter-digest'},{name:date,path:`/twitter-digest/${date}`}])]})}}/></main>}
