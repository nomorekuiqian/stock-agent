import { STOCK_SECTORS } from '@/lib/stock-directory';
import { notFound } from 'next/navigation';
import { Answer, SourceStamp, PublicFaq } from '@/components/PublicSeo';
import { faqSchema, KOL_DISCLAIMER, cleanPublic } from '@/lib/seo-public';
import { STOCK_NAMES } from '@/lib/stock-names';
import { seoData, type KolData } from '@/lib/seo-data';
import Link from 'next/link';
import { SITE_URL, serializeJsonLd } from '@/lib/seo';
import { FRANK_FEATURED_CONTENT, FRANK_HIGHLIGHT_TOPICS } from '@/app/kol/[username]/_components/frankContentData';
import sectors from '@/lib/serenity-public-sectors.json';
export async function KolPublicProfile({ slug }: { slug: 'serenity' | 'qinbafrank' }) {
  const frank = slug === 'qinbafrank';
  const name = frank ? 'qinbafrank' : '白毛股神 Serenity';
  const handle = frank ? 'qinbafrank' : 'aleabitoreddit';
  const live=await seoData<KolData>(`kol/${handle}`);
  if(live?.license_status==='prohibited')notFound();
  const faq=[{q:`${name}是谁？`,a:frank?'qinbafrank 是在 X 上公开讨论美股、宏观与板块变化的博主。TheMarketBrew 按来源日期整理摘要，不推断该博主的身份、持仓或未公开交易。':'Serenity 的 X 账号是 @aleabitoreddit，中文圈也称白毛股神。其公开讨论涉及 AI 资本开支、供应链与瓶颈研究。'},
    {q:`${name}最新观点是什么？`,a:live?.weekly_summary?.split('。')[0]||live?.timeline[0]?.summary||'本期尚无可核对的摘要，请通过原始主页查看最新公开发言。'},
    {q:`${name}最近提到哪些股票？`,a:live?.top_tickers.length?live.top_tickers.slice(0,5).map(t=>`${STOCK_NAMES[t.symbol]?.zh||t.symbol}（${t.symbol}）`).join('、')+'。这些是提及记录，不代表当前持仓。':'以有日期和原帖来源的公开记录为准。'},
    {q:'观点多久更新一次？',a:live?.refresh_frequency||'跟随已启用的推文采集与简报生成任务更新。以模块标注的来源时间为准，抓取时间与原帖发表时间可能不同。'},
    {q:'如何使用摘要和原帖？',a:'摘要只保留公开讨论的核心信息，可能省略限定条件。请打开原帖检查语境，并核对后续公司公告和财报。不同博主的分歧会并列保留，不能把提及次数当成结论可靠性的评分。'}];
  return <main className="mx-auto max-w-5xl px-4 py-12 space-y-8">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd({ '@context': 'https://schema.org', '@graph': [ faqSchema(faq), { '@type': 'ProfilePage', url: `${SITE_URL}/kol/${slug}`, ...(live?.updated_at ? { dateModified: live.updated_at } : {}), isAccessibleForFree:false,hasPart:{'@type':'WebPageElement',isAccessibleForFree:false,cssSelector:'.kol-paywall'},mainEntity: { '@type': 'Person', name:frank?'qinbafrank':'Serenity', alternateName:frank?[handle]:['白毛股神',handle], sameAs: [`https://x.com/${handle}`] } }, { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: '首页', item: SITE_URL }, { '@type': 'ListItem', position: 2, name: '博主观点', item: `${SITE_URL}/kol` }, { '@type': 'ListItem', position: 3, name, item: `${SITE_URL}/kol/${slug}` }] } ] }) }} />
    <nav><Link href="/">首页</Link> › <Link href="/kol">博主观点</Link> › {name}</nav>
    <h1 className="text-3xl font-editorial">{frank ? 'qinbafrank 最新观点追踪' : '白毛股神 Serenity（@aleabitoreddit）最新观点追踪'}</h1>
    <Answer at={live?.updated_at}>{frank?'qinbafrank 在 X 上分享美股与宏观观点。这里按日期整理该博主的公开讨论、板块看法与提及个股，摘要附来源链接，供读者核对原帖和前后语境。':'Serenity（@aleabitoreddit，白毛股神）在 X 上讨论美股，常用瓶颈理论分析 AI 供应链里的短缺环节。这里整理有来源的近期观点与提及个股。'}</Answer>
    <SourceStamp at={live?.updated_at} source="KOL 公开发言的已存档摘要"/>
    {live?.weekly_summary&&<section><h2 className="text-xl">本周观点摘要</h2><p>{live.weekly_summary}</p></section>}
    <p className="text-sm text-muted-foreground">{KOL_DISCLAIMER}</p>
    <a className="text-primary" href={`https://x.com/${handle}`} rel="noopener noreferrer">查看 X 原始主页</a>
    {live && <section className="space-y-5"><h2 className="text-xl font-medium">最近 30 天观点时间线</h2><p className="text-xs text-muted-foreground">{live.total} 条已收录观点 · 最近更新 {live.updated_at||'本期暂无发言'}。仅展示中文摘要，原文请访问来源链接。</p><div className="flex flex-wrap gap-4">{live.top_tickers.map(item=><Link key={item.symbol} href={`/stock/${item.symbol}#kol`}>{STOCK_NAMES[item.symbol]?.zh||item.symbol}（{item.symbol}） · {item.count} 次 · {{bull:'偏多',bear:'偏空',neutral:'中性',disputed:'分歧'}[item.stance||'neutral']||'中性'}</Link>)}</div>{live.timeline.slice(0,10).map(row=><article key={row.id} className="terminal-card p-5 space-y-2"><time>{row.date.slice(0,10)}</time><p className="leading-7">{row.summary.slice(0,60)}</p><a href={row.url} className="text-primary">查看原帖</a></article>)}</section>}
    <section className="space-y-4"><h2 className="text-xl">按主题查看实际提及</h2>{STOCK_SECTORS.map(group=>({name:group.name,items:live?.top_tickers.filter(t=>group.symbols.includes(t.symbol))||[]})).filter(group=>group.items.length).map(group=><article key={group.name}><h3>{group.name}</h3>{group.items.map(t=><Link className="mr-4" key={t.symbol} href={`/stock/${t.symbol}#kol`}>{STOCK_NAMES[t.symbol]?.zh||t.symbol}（{t.symbol}）</Link>)}</article>)}</section>
    <section className="kol-paywall space-y-3"><h2 className="text-xl">Max 深度研究</h2><p>完整论据、观点精选与产业链视图按 Max 权益开放。</p><Link href={`/kol/${slug}/highlights`}>查看观点精选</Link><Link className="ml-4" href={`/kol/${slug}/sectors`}>产业链视图</Link></section>
    <section className="space-y-4"><h2 className="text-xl font-medium">核心研究框架</h2>{frank ? FRANK_HIGHLIGHT_TOPICS.filter(topic=>!/加密|比特币|稳定币|以太坊/.test(topic.description+topic.label)).map(topic => <article key={topic.id} className="space-y-2"><h3 className="font-medium">{topic.label}</h3><p>{topic.description}</p><p>{topic.principle}</p></article>) : <><p>Serenity 的研究围绕 AI 资本开支如何沿供应链传导展开：从大型云厂商投资，到算力云与数据中心，再到网络连接、定制芯片、先进封装、衬底、材料和电力设备。整理这些观点时，需要区分产业需求增长与单家公司能够兑现的收入，不能把处于相关产业链直接等同于投资机会。</p><p>“瓶颈”指的是产业链中难以绕过、短期难以扩产的环节。判断时需要核对产能、良率、交付周期、客户认证与订单，而非仅凭公司名称或业务标签。随着产能扩张、技术替代与客户采购变化，原有瓶颈可能缓解；历史判断应当与后续财报和公司公告交叉检查。</p>{sectors.map(item => <article key={item.label}><h3 className="font-medium">{item.label}</h3><p>{item.short}</p></article>)}</>}</section>
    {!frank && <section className="space-y-5"><h2 className="text-xl font-medium">如何阅读这些观点</h2>
      <article><h3 className="font-medium">瓶颈理论关注哪些证据？</h3><p>在供应链分析中，需求强不等于每个供应商都有议价能力。需要核对产品是否难以替代、扩产是否需要较长时间、客户认证是否已经完成，以及收入是否开始兑现。订单、产能、良率与交付周期应相互印证。如果只看到行业新闻，却没有公司层面的业务证据，就还不能把行业趋势转换为具体公司的结论。</p></article>
      <article><h3 className="font-medium">资本开支如何传导到供应商？</h3><p>云厂商宣布投资只是研究起点。投资需要经过数据中心建设、设备采购、客户认证与实际交付，才可能体现为供应商收入。不同环节的兑现时间和资本需求不同，订单增长也可能伴随存货增加、应收账款上升或现金流压力。因此需要逐层追踪资金投向，区分规划、签约、交付和财务确认。</p></article>
      <article><h3 className="font-medium">怎样区分历史观点与当前判断？</h3><p>历史发言反映的是当时的信息与预期，不能直接作为今天的结论。应先找到原文日期和上下文，再对照后续财报、客户进展、产能变化与融资公告。价格上涨也不能单独证明原有业务逻辑已经兑现。这里整理的是分析方法与历史材料，博主是否仍持有某只股票、是否改变观点，需要以其后续公开发言为准。</p></article>
      <article><h3 className="font-medium">哪些变化会削弱原有逻辑？</h3><p>研究应同时记录支持证据和反证。扩产快于需求、替代技术进入、客户认证延迟、订单未转化为收入，都会影响对瓶颈持续性的判断。融资也需要结合条件分析：资金用于有订单支持的扩产，和依赖持续稀释维持经营，含义并不相同。把需要观察的条件写清楚，比只保留乐观的行业叙事更有帮助。</p></article>
    </section>}
    {frank && <section className="space-y-5"><h2 className="text-xl font-medium">历史观点摘要</h2>{FRANK_FEATURED_CONTENT.filter(item=>!/加密|比特币|稳定币|以太坊/.test(item.summary+item.title)&&cleanPublic(item.summary)).slice(0, 8).map(item => <article key={item.id} className="terminal-card p-5 space-y-2"><h3 className="font-medium">{item.title}</h3><time>{item.date}</time><p>{item.summary.slice(0,60)}</p>{item.sourceUrl && <a className="text-primary" href={item.sourceUrl}>原文来源</a>}<div className="flex gap-3">{item.tickers?.map(ticker => <Link key={ticker} href={`/stock/${ticker}#kol`}>{ticker}</Link>)}</div></article>)}</section>}
    <PublicFaq items={faq}/>
    <nav className="flex flex-wrap gap-4"><Link href="/twitter-digest">美股博主观点简报</Link><Link href={`/kol/${frank?'serenity':'qinbafrank'}`}>另一位博主</Link>{['latest','highlights','sectors','stocks'].map(tab=><Link key={tab} href={`/kol/${slug}/${tab}`}>{{latest:'最新观点',highlights:'观点精选',sectors:'产业链视图',stocks:'个股清单'}[tab]}</Link>)}<Link href={`/research?persona=${handle}`}>AI 对话</Link></nav>
    <p className="text-sm text-muted-foreground">本页内容由 TheMarketBrew 基于公开数据与 AI 生成，仅供研究与信息参考，不构成任何投资建议或买卖推荐。美股投资有风险，请独立判断。</p>
  </main>;
}
