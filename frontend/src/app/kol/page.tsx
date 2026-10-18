import Link from 'next/link';
import Image from 'next/image';
import { pageMetadata, serializeJsonLd, SITE_URL } from '@/lib/seo';
import { seoData, type KolData } from '@/lib/seo-data';
import { Answer, SourceStamp, PublicFaq, PublicDisclaimer } from '@/components/PublicSeo';
import { breadcrumbs, faqSchema, KOL_DISCLAIMER } from '@/lib/seo-public';
export const dynamic='force-dynamic';
export const metadata=pageMetadata('/kol','美股推特博主观点汇总：Serenity、qinbafrank 等中文大V每日观点','公开发言、近期提及个股与历史研究框架。');
const faq=[{q:'TheMarketBrew 追踪哪些博主？',a:'公开页整理 Serenity（@aleabitoreddit）与 qinbafrank 的美股观点。每位博主有独立页面，可按来源日期查看近期摘要、提及个股和研究框架。'}, {q:'观点多久更新？',a:'摘要跟随已经启用的推文采集和简报任务更新，以模块标注的来源日期为准。数据缺失时不会把历史判断标成最新，也不会推断博主的当前持仓。'}, {q:'这些观点是投资建议吗？',a:'不是。这里提供带来源的研究资料整理，摘要可能省略原文条件，请打开原帖核对上下文。提及次数反映讨论频率，不衡量未来收益，也不能替代公司公告、财务数据和独立判断。'}];
export default async function Page(){
 const authors=[{slug:'qinbafrank',handle:'qinbafrank',name:'qinbafrank',bio:'宏观、美股与 AI 产业板块观点'},{slug:'serenity',handle:'aleabitoreddit',name:'Serenity',bio:'AI 资本开支与供应链瓶颈'}];
 const docs=await Promise.all(authors.map(a=>seoData<KolData>(`kol/${a.handle}`)));
 const updated=docs.map(d=>d?.updated_at).filter((d):d is string=>!!d).sort().at(-1);
 return <main className="mx-auto max-w-5xl px-4 py-12 space-y-8"><h1 className="text-3xl font-editorial">美股推特博主观点汇总</h1><Answer at={updated}>TheMarketBrew 整理 Serenity 和 qinbafrank 的公开美股观点，按博主列出最近摘要与提及个股，附原帖链接。读者可以对照不同观点，回到来源核对语境。</Answer><SourceStamp at={updated} source="kol_daily_digests"/><div className="grid gap-6 md:grid-cols-2">{authors.filter((_,i)=>docs[i]?.license_status!=='prohibited').map(a=>{const d=docs[authors.indexOf(a)];return <article key={a.slug} className="terminal-card p-6 space-y-4"><Image src={`/kol-avatars/${a.handle}.png`} alt={a.name} width={64} height={64}/><h2 className="text-xl"><Link href={`/kol/${a.slug}`}>{a.name}</Link></h2><p>{a.bio}</p>{d?.timeline[0]&&<p>{d.timeline[0].summary}</p>}<div className="flex gap-3 flex-wrap">{d?.top_tickers.slice(0,5).map(t=><Link key={t.symbol} href={`/stock/${t.symbol}#kol`}>{t.symbol}</Link>)}</div></article>})}</div><PublicFaq items={faq}/><p>{KOL_DISCLAIMER}</p><PublicDisclaimer at={updated}/><script type="application/ld+json" dangerouslySetInnerHTML={{__html:serializeJsonLd({'@context':'https://schema.org','@graph':[{'@type':'CollectionPage',url:`${SITE_URL}/kol`,name:'美股推特博主观点汇总',dateModified:updated},breadcrumbs([{name:'博主观点',path:'/kol'}]),faqSchema(faq)]})}}/></main>;
}
