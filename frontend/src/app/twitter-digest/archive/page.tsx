import Link from 'next/link';
import { publicFetch } from '@/lib/public-fetch';
import { pageMetadata, serializeJsonLd, SITE_URL } from '@/lib/seo';
import { PublicDisclaimer, SourceStamp } from '@/components/PublicSeo';
import { cleanPublic, breadcrumbs } from '@/lib/seo-public';
export const dynamic='force-dynamic';
export const metadata=pageMetadata('/twitter-digest/archive','美股博主观点简报归档','按发布时间浏览已发布内容与公开摘要。');
export default async function Page({searchParams}:{searchParams:Promise<{page?:string}>}){
 const page=Math.max(0,Number((await searchParams).page)||0);
 const result=await publicFetch<{data:{id?:string;report_date?:string;date?:string;timestamp?:string;generated_at?:string;title?:string;headline?:string;summary?:string;intro_preview?:string}[];total:number}>(`/twitter-digest/archive/teaser?limit=30&offset=${page*30}`);
 const rows=result?.data||[];
 return <main className="mx-auto max-w-5xl px-4 py-10 space-y-6"><h1 className="text-3xl font-editorial">美股博主观点简报归档</h1><p>按发布日期查阅报告，核对当时的市场信息与后续变化。历史内容反映生成时可用资料，不能代替最新公司公告或行情。</p>{rows.map((r,i)=>{const date=r.report_date||r.date;return <article key={r.id||date||i} className="border-b border-border py-4"><h2 className="text-xl"><Link href={`/twitter-digest/${date}`}>{date} · {cleanPublic(r.title||r.headline)}</Link></h2><p>{cleanPublic(r.summary||r.intro_preview)}</p><SourceStamp at={r.timestamp||r.generated_at||date} source="已发布报告"/></article>})}<nav className="flex gap-4">{page>0&&<Link href={`?page=${page-1}`}>上一页</Link>}{result&&result.total>(page+1)*30&&<Link href={`?page=${page+1}`}>下一页</Link>}<Link href="/twitter-digest">最新一期</Link></nav><PublicDisclaimer at={rows[0]?.timestamp||rows[0]?.generated_at}/><script type="application/ld+json" dangerouslySetInnerHTML={{__html:serializeJsonLd({'@context':'https://schema.org','@graph':[{'@type':'CollectionPage',name:'美股博主观点简报归档',url:`${SITE_URL}/twitter-digest/archive`},breadcrumbs([{name:'美股博主观点简报归档',path:'/twitter-digest/archive'}])]})}}/></main>;
}
