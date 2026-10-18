import { STOCK_NAMES } from './stock-names';
import { DIRECTORY_SYMBOLS, STOCK_SECTORS, relatedStocks } from './stock-directory';
import samples from './seo-samples.json';
import type { StockSeoData } from './seo-data';
import { cleanPublic, formatDividendYield, percent, compactAnswer, formatET, han } from './seo-public';
export const DISCLAIMER='本页内容由 TheMarketBrew 基于公开数据与 AI 生成，仅供研究与信息参考，不构成任何投资建议或买卖推荐。美股投资有风险，请独立判断。';
export interface Block { id:string;title:string; rows:{text:string;unique?:string;href?:string;label?:string;cells?:string[]}[] }
const THEMES:Record<string,string[]>={SMR:['OKLO','CEG','VST'],CRWV:['NBIS','NVDA','ORCL'],NBIS:['CRWV','NVDA','ORCL'],SOFI:['JPM','BAC','HOOD']};
const W1_SYMBOLS=['CRWV','SOFI','NBIS','SMR','SPCX'];
export function stockTitle(d:StockSeoData,name:string,now=new Date()) {
 const label=`${name}(${d.symbol})`;
 const direction=d.title_variant?.direction;
 const fixed:Record<string,string>={SOFI:'SoFi(SOFI)是什么公司？股价、业务与财报解读',NBIS:'Nebius(NBIS)是什么公司？AI云算力业务、股价与解读',SMR:'SMR是什么公司？NuScale Power股票、核电业务与解读',NVDA:'英伟达(NVDA)股票：博主观点、涨跌原因与财报解读',SPCX:'SpaceX(SPCX)股票：股价、上市表现与AI解读'};
 if(fixed[d.symbol]) return fixed[d.symbol];
 if(d.symbol==='CRWV')return `CoreWeave(CRWV)是什么公司？最近为什么${direction||'涨跌'}｜股价与AI解读`;
 if(d.symbol==='PLTR')return direction==='跌'?'Palantir(PLTR)为什么一直跌？近期下跌原因时间线':`Palantir(PLTR)最近为什么${direction||'涨跌'}？涨跌原因与AI解读`;
 if(['GOOGL','MSFT','AMZN'].includes(d.symbol)) {
  const upcoming=d.next_earnings; const actual=d.latest_actuals;
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const days=(date:string)=>(Date.parse(date.slice(0,10))-Date.parse(today))/86400000;
  if(upcoming&&days(upcoming.date)>=0&&days(upcoming.date)<=14) return `${label}财报：${upcoming.fiscal_period||''}财报日期、预期与AI解读`;
  if(actual&&days(actual.date)<=0&&days(actual.date)>=-14)return `${label}${actual.fiscal_period||''}财报解读：营收、EPS与${d.symbol==='MSFT'?'智能云':d.symbol==='AMZN'?'AWS':'谷歌云'}业务要点`;
 }
 return `${label}股票：股价、财报与AI解读`;
}
export function stockContent(d: StockSeoData, now=new Date()) {
 const sample=samples.find(x=>x.symbol===d.symbol);
 const name=d.profile.company_name_zh||(sample?.name!==d.symbol?sample?.name:undefined)||STOCK_NAMES[d.symbol]?.zh||d.profile.company_name;
 const subtitle=[d.profile.company_name,d.profile.exchange,STOCK_SECTORS.find(group=>group.symbols.includes(d.symbol))?.name||d.profile.classification?.industry].filter(Boolean).join(' · ');
 const aliases=[...new Set([name,sample?.traditional,STOCK_NAMES[d.symbol]?.en,d.symbol==='NVDA'?'NVIDIA':null].filter(Boolean))].join(' / ');
 const about=cleanPublic(d.about); const quote=d.stock.quote;
 const business=about.split(/[。\n]/)[0];
 const businessPrefix=(han(business)>=40?business:about).slice(0,95);
 const stop=Math.max(businessPrefix.lastIndexOf('。'),businessPrefix.lastIndexOf('，'),businessPrefix.lastIndexOf('；'));
 const businessShort=stop>=40?businessPrefix.slice(0,stop):businessPrefix;
 const quoteText=quote?.price!=null&&quote.price>0?`最新可用报价 ${quote.price.toFixed(2)} 美元${percent(quote.change_percent)?`（${percent(quote.change_percent)}）`:''}。`:'';
 let answer=(businessShort?`${businessShort}。`:'')+quoteText;
 if(d.symbol==='PLTR'&&d.change_20d!=null) answer=`Palantir 是数据分析与 AI 软件公司。近 20 个交易日累计 ${d.change_20d.toFixed(2)}%${d.drawdown_from_high!=null?`，较 52 周高点 ${d.drawdown_from_high.toFixed(2)}%`:''}；以下按日期整理可核对的事件，价格变化并不单独证明某项消息是原因。`;
 if(d.symbol==='NVDA'&&d.kol_stats&&d.kol_stats.n_kol>=2)answer=`英伟达（NVDA）设计 GPU 与 AI 加速芯片。近 30 天已收录 ${d.kol_stats.n_kol} 位博主的 ${d.kol_stats.n_posts} 条相关观点，偏多 ${d.kol_stats.bull}、偏空 ${d.kol_stats.bear}；下方摘要保留来源，观点不代表公司未来表现。`;
 if(['GOOGL','MSFT','AMZN'].includes(d.symbol)) {
  const title=stockTitle(d,name,now); const e=d.next_earnings; const a=d.latest_actuals;
  if(title.includes('财报日期')&&e)answer=`${name}（${d.symbol}）${e.confirmation==='confirmed'?'已确认':'预计'}于 ${e.date} 发布${e.fiscal_period||''}财报${e.time==='bmo'?'，时间为盘前':e.time==='amc'?'，时间为盘后':''}。${e.epsEstimated!=null?`市场预期 EPS ${e.epsEstimated} 美元。`:''}${e.revenueEstimated!=null?`营收预期 ${e.revenueEstimated} 美元。`:''}尚未确认的日程应以公司公告为准，下方列出历史预期与实际数据。`;
  else if(title.includes('财报解读：')&&a)answer=`${name}（${d.symbol}）${a.fiscal_period||''}财报于 ${a.date} 发布。${a.revenueActual!=null?`营收 ${a.revenueActual} 美元。`:''}${a.epsActual!=null?`EPS ${a.epsActual} 美元。`:''}以下按来源列出历史预期与实际业绩，分部收入与公开解读用于核对经营变化。`;
 }
 const direction=d.title_variant?.direction||'涨跌';
 const h1=({CRWV:`CoreWeave（CRWV）是什么公司？最近为什么${direction}？`,SOFI:'SoFi Technologies（SOFI）是什么公司？',NBIS:'Nebius Group（NBIS）是什么公司？',SMR:'SMR 是什么公司？NuScale Power（SMR）股票',PLTR:`Palantir（PLTR）最近为什么${direction}？`} as Record<string,string>)[d.symbol]||`${name}（${d.symbol}）`;
 const target=d.analyst; const low=target.low??target.target_low; const mean=target.mean??target.target_mean; const high=target.high??target.target_high; const count=target.number_of_analysts??target.analyst_count;
 const kol=d.kol.filter(row=>cleanPublic(row.summary));
 const hasKol=new Set(kol.map(r=>r.username)).size>=2;
 const blocks:Block[]=[
  {id:'why',title:'近期为什么涨跌',rows:d.why.filter(r=>cleanPublic(r.summary)).slice(0,10).map(r=>({text:`${r.date}${percent(r.change_percent)?` · ${percent(r.change_percent)}`:''} · ${cleanPublic(r.summary,60)}`,unique:cleanPublic(r.summary,60),href:r.url,label:r.source==='none'?'查看行情':'查看当日复盘'}))},
  {id:'kol',title:`美股博主怎么看${name}？`,rows:hasKol?kol.slice(0,10).map(r=>({text:`${r.username} · ${r.date.slice(0,10)} · ${{bull:'偏多',bear:'偏空',disputed:'分歧',neutral:'中性'}[r.stances.find(s=>s.ticker===d.symbol)?.stance||'neutral']||'中性'}：${cleanPublic(r.summary,60)}`,unique:cleanPublic(r.summary,60),href:r.url,label:'查看原帖'})):[]},
  {id:'earnings',title:`${name}财报：日期、预期与实际业绩`,rows:[
   ...(d.next_earnings?[{text:`下一次财报：${d.next_earnings.date}（${d.next_earnings.confirmation==='confirmed'?'已确认':'预估'}；${d.next_earnings.time==='bmo'?'盘前':d.next_earnings.time==='amc'?'盘后':'时间未公布'}）`}]:[]),
   ...(d.next_earnings?.epsEstimated!=null?[{text:`本期 EPS 预期 ${d.next_earnings.epsEstimated} 美元`}]:[]),
   ...(d.next_earnings?.revenueEstimated!=null?[{text:`本期营收预期 ${d.next_earnings.revenueEstimated} 美元`}]:[]),
   ...(d.latest_actuals?[{text:`最近发布日 ${d.latest_actuals.date}${d.latest_actuals.epsActual!=null?`，EPS ${d.latest_actuals.epsActual} 美元`:''}${d.latest_actuals.revenueActual!=null?`，营收 ${d.latest_actuals.revenueActual} 美元`:''}`}]:[]),
   ...(d.earnings.earnings_history||[]).slice(0,4).map(r=>({cells:[r.quarter,String(r.eps_actual??'未提供'),String(r.eps_estimate??'未提供'),String(r.revenue_actual??'未提供'),String(r.revenue_estimate??'未提供')],text:`${r.quarter}：EPS 实际 ${r.eps_actual??'未提供'} / 预期 ${r.eps_estimate??'未提供'}${r.revenue_actual!=null?`；营收 ${r.revenue_actual} 美元`:''}${r.revenue_estimate!=null?` / 预期 ${r.revenue_estimate} 美元`:''}`})),
   ...(d.earnings.income_statements||[]).slice(0,4).map(r=>({text:`${r.date}：营收 ${r.revenue??'未提供'} 美元${r.eps!=null?`，EPS ${r.eps} 美元`:''}`})),
   ...(d.earnings.segments||[]).map(r=>({text:`${r.period} ${r.name}：${r.revenue} 美元`})),
   ...(cleanPublic(d.earnings_analysis)?[{text:cleanPublic(d.earnings_analysis,250),unique:cleanPublic(d.earnings_analysis,250)}]:[]),
   ...(d.earnings.transcript_points||[]).slice(0,3).filter(x=>cleanPublic(x)).map(x=>({text:cleanPublic(x,50),unique:cleanPublic(x,50)}))]},
  {id:'about',title:`${name}是什么公司`,rows:about?[{text:about,unique:about,href:d.about_source,label:d.about_source?'公司资料来源':undefined}]:[]},
 ];
 if(low!=null&&mean!=null&&high!=null) blocks.push({id:'analyst',title:'华尔街分析师预期（非投资建议）',rows:[{text:`目标价最低 ${low}、均值 ${mean}、最高 ${high} 美元${count!=null?`；覆盖 ${count} 位分析师`:''}。仅供参考，不构成投资建议。`}]});
 const recentReason=d.why.find(r=>r.confidence!=='low'&&cleanPublic(r.summary));
 const quoteMetrics=[{label:'最新报价（美元）',raw:quote?.price},{label:'市值（美元）',raw:quote?.market_cap},{label:'市盈率',raw:quote?.pe_ratio}].filter((m):m is {label:string;raw:number}=>m.raw!=null&&Number.isFinite(m.raw)&&m.raw!==0).map(m=>({label:m.label,value:m.raw.toLocaleString('en-US',{maximumFractionDigits:2})}));
 const dividend=formatDividendYield(d.dividend_yield);
 const faq:{q:string;a:string;unique:string;source?:string}[]=[...(d.company_faq||[]).map(f=>({...f,unique:f.a})),...(about?[{q:`${name}是什么公司？`,a:business+'。',unique:''}]:[]),{q:`${name}的股票代码是什么，在哪个交易所上市？`,a:`股票代码是 ${d.symbol}${d.profile.exchange?`，交易所为 ${d.profile.exchange}`:''}。`,unique:''},...(d.next_earnings?[{q:`${name}下一次财报是什么时候？`,a:`${d.next_earnings.confirmation==='confirmed'?'已确认':'预计'} ${d.next_earnings.date}，以公司公告为准。`,unique:''}]:[]),...(recentReason?[{q:`${name}最近为什么涨跌？`,a:cleanPublic(recentReason.summary,60),unique:''}]:[]),...(dividend?[{q:`${name}发股息吗？`,a:`数据源显示股息率为 ${dividend}。股息政策可能调整，历史股息不保证未来支付。`,unique:''}]:[]),{q:`研究${name}需要关注哪些风险？`,a:'核对公司财报中的业务竞争、现金流、负债和估值信息；资料与 AI 解读可能延迟，历史表现不能预测后续走势。',unique:''}].slice(0,6);
 const peers=(THEMES[d.symbol]||relatedStocks(d.symbol,d.profile.classification?.sector)).map(symbol=>({symbol,name:STOCK_NAMES[symbol]?.zh||symbol}));
 // Public article only: navigation, footer and disclaimers do not dilute the ratio.
 const visibleBlocks=blocks.filter(b=>b.rows.length);
 const stamp=(at:string|null|undefined,source:string)=>`数据更新：${formatET(at)} ET · 来源：${source}`;
 const interval=d.change_20d!=null?`区间总结：近 20 个交易日累计 ${d.change_20d.toFixed(2)}%。${d.why_summary||d.why.find(r=>r.confidence==='high')?.summary||''}`:'';
 const article=[h1,subtitle,aliases?`又称：${aliases}`:'',compactAnswer(answer),...quoteMetrics.flatMap(m=>[m.label,m.value]),stamp(d.stock.meta?.quote_fetched_at||d.updated_at,'行情数据源'),dividend?`股息率：${dividend}`:'','完整行情与研究工作台',
  ...(d.ai_summary?['AI 解读摘要',d.ai_summary]:[]),
  ...visibleBlocks.flatMap(b=>[b.title,...(b.id==='kol'?['博主日期方向一句话摘要来源',d.kol_conclusion||'',...kol.slice(0,10).map(r=>`${r.username}${r.date.slice(0,10)}${{bull:'偏多',bear:'偏空',disputed:'分歧',neutral:'中性'}[r.stances[0]?.stance||'neutral']||'中性'}${r.summary.slice(0,60)}原帖`)]:[...(b.rows.some(r=>r.cells)?['财季EPS 实际EPS 预期营收实际（美元）营收预期（美元）']:[]),...b.rows.map(r=>r.cells?r.cells.join(''):r.text+(r.href?r.label||'':''))]),stamp(d.module_dates?.[b.id]||d.updated_at,b.id==='kol'?'kol_daily_digests':b.id==='why'?'收盘日报与历史行情':'公司公告与财务数据')]),
  interval,'AI 深度研究与完整财报分析','Max 提供完整 AI 分析、技术面解读与 AI 对话；更多博主论据按 Pro 权益提供。','进入研究工作台','查看订阅权益','常见问题',...faq.flatMap(f=>[f.q,f.a,f.source?'资料来源':''])];
 const total=article.join('').replace(/\s/g,'').length;
 const unique=[...new Set([...blocks.flatMap(b=>b.rows.map(r=>r.unique||'')),...faq.map(f=>f.unique)])].join('').split(/(?<=[。])/).filter(sentence=>! /^(研究时|研究其|投资研究|阅读财报|公司属于|具体|公司的具体|平台名称)/.test(sentence)).join('').replace(/\s/g,'').length;
 const ratio=total?unique/total:0;
 const temporaryException=W1_SYMBOLS.includes(d.symbol)&&now.getTime()<Date.parse('2026-11-02T00:00:00-05:00');
 const eligible=(samples.some(s=>s.symbol===d.symbol)||DIRECTORY_SYMBOLS.includes(d.symbol))&&((ratio>=0.4&&han(about)>=150)||temporaryException);
 return {name,title:stockTitle(d,name,now),h1,subtitle,aliases,answer,blocks,faq,peers,dividend,hasKol,quoteMetrics,quality:{unique,total,ratio,index:eligible,temporaryException}};
}
// Legacy links are redirected to the canonical #earnings module.
export function earningsEligible(d:StockSeoData){void d;return false;}
