import Link from 'next/link';
import { pageMetadata, serializeJsonLd, SITE_URL } from '@/lib/seo';
import { Answer, PublicFaq, PublicDisclaimer, SourceStamp } from '@/components/PublicSeo';
import { breadcrumbs, faqSchema } from '@/lib/seo-public';
import type { LiquidityMetricsResponse, LiquidityHistoryResponse, WeeklyReportResponse } from '@/lib/api';
import { formatLiquidityValue, mergeLiquidityMetricsForDisplay } from './liquidity-metrics';
export const metadata=pageMetadata('/macro/liquidity','美联储资产负债表与美元流动性状况：TGA、逆回购每周更新','每周更新美联储资产负债表、财政部 TGA、隔夜逆回购与净流动性。');
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { getQueryClient } from '@/hooks/queries/query-client';
import { queryKeys } from '@/hooks/queries/query-keys';
import Dashboard from './Dashboard';
export const dynamic = 'force-dynamic';
export default async function Page() {
  const client = getQueryClient();
  const sources = [
    { key: queryKeys.weeklyReport.latest(), path: '/weekly-report' },
    { key: queryKeys.liquidity.metrics(), path: '/liquidity/metrics' },
    { key: queryKeys.liquidity.history(365), path: '/liquidity/history?days=365' },
    { key: queryKeys.liquidity.global(), path: '/liquidity/global' },
  ];
  await Promise.all(sources.map(({key, path}) => client.prefetchQuery({
    queryKey: key,
    queryFn: async () => {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api'}${path}`, {next: {revalidate: 1800}, signal: AbortSignal.timeout(15000)});
      if (!response.ok) throw new Error('Liquidity source unavailable');
      return response.json();
    },
  })));
  const metrics=client.getQueryData<LiquidityMetricsResponse>(queryKeys.liquidity.metrics());
  const history=client.getQueryData<LiquidityHistoryResponse>(queryKeys.liquidity.history(365));
  const weeks=new Map<string,NonNullable<typeof history>['data']['observations'][number]>();
  for(const row of history?.data.observations||[]){const date=new Date(row.time);const key=Math.floor((date.getTime()+3*86400000)/(7*86400000)).toString();weeks.set(key,row);}
  const rows=[...weeks.values()].slice(-12).reverse();
  const m=mergeLiquidityMetricsForDisplay(history?.data.metrics||null,metrics?.metrics||null); const weekly=client.getQueryData<WeeklyReportResponse>(queryKeys.weeklyReport.latest()); const at=weekly?.data?.generated_at||m?.net_liquidity.date; const units=history?.data.units||m?.net_liquidity.units||'';
  const answer=m&&m.fed_assets.value!=null&&m.tga.value!=null&&m.rrp.value!=null&&m.net_liquidity.value!=null?`美联储总资产 ${formatLiquidityValue(m.fed_assets.value,m.fed_assets.units)}，TGA ${formatLiquidityValue(m.tga.value,m.tga.units)}，逆回购 ${formatLiquidityValue(m.rrp.value,m.rrp.units)}，净流动性 ${formatLiquidityValue(m.net_liquidity.value,m.net_liquidity.units)}。`:'';
  const faq=[{q:'美联储资产负债表是什么？',a:'资产负债表记录美联储持有的证券、贷款等资产以及准备金、流通现金等负债。WALCL 是总资产序列，能描述央行资产规模变化，但不能单独代表流向股票市场的资金。比较不同周的数据时，要注意统计截止日期和发布时点。'}, {q:'TGA 和逆回购怎么影响流动性？',a:'TGA 是美国财政部在美联储的账户。账户余额变化与税收、发债和财政支出有关；隔夜逆回购则是货币市场资金配置工具。两者变动可能影响银行体系准备金，但还需结合其他资产负债项目和市场融资需求分析。'}, {q:'现在美股流动性状况怎么样？',a:'上方指标卡和下方周度表列出当前可用数值。请比较多个观察期的变化，并核对准备金、融资利率与财政资金流。单周净流动性上升不等于资金会进入股票，也不能据此预测指数涨跌。'}, {q:'净流动性怎么算？',a:'本页使用美联储总资产减去 TGA、再减去隔夜逆回购的观察口径。计算前需要把各序列转换为同一货币单位，并对齐日期。它是研究中的近似指标，并非美联储发布的股票市场流动性官方指数。'}, {q:'逆回购下降意味着什么？',a:'逆回购余额下降表明这一工具的使用规模缩小，可能伴随资金转向国库券、其他回购或银行存款。实际去向需要其他数据佐证，不能把余额下降全部理解为风险资产新增买盘。'}, {q:'美联储资产负债表现在多少？',a:m?.fed_assets.value!=null?`最近可用总资产为 ${formatLiquidityValue(m.fed_assets.value,m.fed_assets.units)}，观测日期 ${m.fed_assets.date}。`:'当前来源未提供可用值，请查看 FRED 的 WALCL 原始序列。'}];
  return <><section className="mx-auto max-w-5xl px-4 pt-10 space-y-5"><h1 className="text-3xl font-editorial">美联储资产负债表与美元流动性状况</h1><Answer at={at}>{answer}这些序列共同描述美元资金环境，需结合观察日期与统计口径理解，不能直接推断股价方向。</Answer><SourceStamp at={at} source="FRED / 美联储"/></section><HydrationBoundary state={dehydrate(client)}><Dashboard /></HydrationBoundary><section className="mx-auto max-w-5xl px-4 py-10 space-y-8"><h2 className="text-xl">近 12 周净流动性表</h2><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th>观察日期</th><th>美联储总资产</th><th>TGA</th><th>逆回购</th><th>净流动性</th></tr></thead><tbody>{rows.map(r=><tr key={r.time} className="border-t border-border"><td>{r.time}</td>{[r.fed_assets,r.tga,r.rrp,r.value].map((v,i)=><td key={i} className="p-3 font-data">{formatLiquidityValue(v,units)}</td>)}</tr>)}</tbody></table></div><PublicFaq items={faq}/><Link href="/today">结合收盘复盘阅读</Link><PublicDisclaimer at={at}/><script type="application/ld+json" dangerouslySetInnerHTML={{__html:serializeJsonLd({'@context':'https://schema.org','@graph':[{'@type':'WebPage',url:`${SITE_URL}/macro/liquidity`,name:'美联储资产负债表与美元流动性状况',dateModified:at},breadcrumbs([{name:'宏观',path:'/macro'},{name:'美元流动性',path:'/macro/liquidity'}]),faqSchema(faq)]})}}/></section></>;
}
