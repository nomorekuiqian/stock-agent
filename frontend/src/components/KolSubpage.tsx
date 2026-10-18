import { notFound } from 'next/navigation';
import Link from 'next/link';
import { seoData, type KolData } from '@/lib/seo-data';
import { PublicDisclaimer, SourceStamp } from './PublicSeo';
import { serializeJsonLd, SITE_URL } from '@/lib/seo';
export async function KolSubpage({slug,tab,children}:{slug:string;tab:string;children:React.ReactNode}) {
 const canonicalSlug=slug==='aleabitoreddit'?'serenity':slug;
 const doc=await seoData<KolData>(`kol/${slug==='serenity'?'aleabitoreddit':slug}`);
 if(doc?.license_status==='prohibited')notFound();
 const title=({latest:'最新观点',highlights:'观点精选',sectors:'板块与产业链',stocks:'提及个股'} as Record<string,string>)[tab];
 return <main><section className="mx-auto max-w-5xl px-4 py-8 space-y-4"><h1 className="text-3xl font-editorial">{slug} · {title}</h1><Link href={`/kol/${canonicalSlug}`}>返回博主公开观点主页</Link><p>以下为公开摘要。完整资料、证据链与研究工具仍按账户权益提供。</p>{doc?.timeline.slice(0,3).map(r=><p key={r.id}>{r.date} · {r.summary} <a href={r.url}>原帖</a></p>)}<SourceStamp at={doc?.updated_at} source="已存档观点摘要"/><PublicDisclaimer at={doc?.updated_at}/></section><section className="paywalled-content">{children}</section><script type="application/ld+json" dangerouslySetInnerHTML={{__html:serializeJsonLd({'@context':'https://schema.org','@graph':[{'@type':'WebPage',url:`${SITE_URL}/kol/${canonicalSlug}/${tab}`,name:`${slug} ${title}`,isAccessibleForFree:false,hasPart:{'@type':'WebPageElement',isAccessibleForFree:false,cssSelector:'.paywalled-content'}}]})}}/></main>;
}
