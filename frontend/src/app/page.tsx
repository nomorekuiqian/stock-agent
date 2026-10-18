import Link from 'next/link';
import HomePage from './HomePage';
import { pageMetadata, serializeJsonLd, SITE_URL } from '@/lib/seo';
import { publicFetch } from '@/lib/public-fetch';
import { dailyAnswer, morningAnswer } from '@/lib/report-seo';
import type { MarketData, MorningReport } from '@/lib/api';
import { PublicFaq, SourceStamp, PublicDisclaimer } from '@/components/PublicSeo';
import { faqSchema } from '@/lib/seo-public';
import { STOCK_NAMES } from '@/lib/stock-names';
export const dynamic='force-dynamic';
const title='TheMarketBrew：中文 AI 美股研报、每日美股日报与博主观点';
export const metadata={...pageMetadata('/',title,'面向华人投资者的中文 AI 美股研究平台：AI 个股研报、每日盘前早报与收盘复盘、推特美股博主观点追踪、宏观仪表盘。免费版可看每日日报。'),title:{absolute:title}};
const faq=[{q:'有没有中文的 AI 美股研报网站？',a:'TheMarketBrew 提供中文收盘复盘、盘前早报、AI 个股研究与美股博主观点汇总，可以从免费的每日市场日报开始阅读。'}, {q:'TheMarketBrew 免费版包含什么？',a:'盘后总览（网站阅读）、宏观仪表盘、基础市场资讯，无需信用卡。完整订阅权益以定价页面为准。'}, {q:'AI 生成的研报准确吗，数据从哪来？',a:'报告基于公开市场数据、公司资料、新闻与博主公开发言生成，并保留来源和更新时间。AI 可能误读信息，行情也可能延迟；请对照公司公告核实。关于页面说明产品与数据来源。'}];
export default async function Page(){
 const [daily,morning]=await Promise.all([publicFetch<{data:MarketData}>('/market/reports/latest'),publicFetch<{data:MorningReport}>('/morning/reports/latest')]);
 const at=[daily?.data?.timestamp,morning?.data?.timestamp].filter(Boolean).sort().at(-1);
 return <><script type="application/ld+json" dangerouslySetInnerHTML={{__html:serializeJsonLd({'@context':'https://schema.org','@graph':[{'@type':'Organization','@id':`${SITE_URL}/#organization`,name:'TheMarketBrew',url:SITE_URL,logo:`${SITE_URL}/logo-avatar.png`},{'@type':'WebSite','@id':`${SITE_URL}/#website`,name:'TheMarketBrew',url:SITE_URL,inLanguage:'zh-CN',publisher:{'@id':`${SITE_URL}/#organization`}},faqSchema(faq)]})}}/><HomePage><section className="mx-auto max-w-5xl px-4 py-12 space-y-8"><h2 className="text-2xl font-editorial">今天的研报</h2>{daily?.data&&<article><h3 className="text-xl"><Link href="/today">{daily.data.title}</Link></h3><p>{dailyAnswer(daily.data)}</p><SourceStamp at={daily.data.timestamp} source="收盘日报"/></article>}{morning?.data&&<article><h3 className="text-xl"><Link href="/morning">{morning.data.title}</Link></h3><p>{morningAnswer(morning.data)}</p><SourceStamp at={morning.data.timestamp} source="盘前早报"/></article>}<div className="flex flex-wrap gap-4">{['CRWV','SOFI','NBIS','SMR','PLTR','NVDA','GOOGL','MSFT','AMZN','SPCX'].map(s=><Link key={s} href={`/stock/${s}`}>{STOCK_NAMES[s]?.zh||s}（{s}）</Link>)}</div><nav className="flex flex-wrap gap-4"><Link href="/kol/serenity">Serenity 公开观点</Link><Link href="/kol/qinbafrank">qinbafrank 公开观点</Link><Link href="/macro/sentiment">VIX 市场情绪</Link><Link href="/guide/us-market-hours">美股开盘与休市时间</Link><Link href="/pricing">订阅权益</Link><Link href="/about">数据来源与关于我们</Link></nav><PublicFaq items={faq}/><PublicDisclaimer at={at}/></section></HomePage></>;
}
