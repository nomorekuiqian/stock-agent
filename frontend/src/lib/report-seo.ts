import type { MarketData, MorningReport } from './api';
import { cleanPublic, han, percent } from './seo-public';
import { marketSession } from './market-hours';
export function publicMorningText(report: Pick<MorningReport,'public_excerpt'|'today_focus'>) {
 return [cleanPublic(report.public_excerpt),...(report.today_focus||[]).map(r=>cleanPublic(r.title)+' '+cleanPublic(r.analysis))].join(' ');
}
export function morningIndexable(report: Pick<MorningReport,'public_excerpt'|'today_focus'>) {return han(publicMorningText(report))>=300;}
export function dailyText(report:MarketData) {
 return [report.intro,report.summary,...(report.news?.headlines||[]).flatMap(r=>[r.title,r.fact_summary,r.deep_analysis]),...(report.news?.briefs||[]).flatMap(r=>[r.title,r.summary]),typeof report.report_summary==='string'?report.report_summary:(report.report_summary||[]).map(r=>r.content).join(' ')].map(x=>cleanPublic(x)).join(' ');
}
export function dailyAnswer(report:MarketData,now?:Date) {
 const indices=report.indices||[];
 const ndx=indices.find(r=>/nasdaq|纳指|纳斯达克/i.test(r.name));
 const spx=indices.find(r=>/s&p|标普/i.test(r.name));
 const moves=[ndx&&percent(ndx.change_percent)?`纳指 ${percent(ndx.change_percent)}`:'',spx&&percent(spx.change_percent)?`标普 ${percent(spx.change_percent)}`:''].filter(Boolean).join('、');
 const mixed=ndx?.change_percent!=null&&spx?.change_percent!=null&&ndx.change_percent*spx.change_percent<0;
 const reason=cleanPublic(report.news?.headlines?.[0]?.fact_summary||report.summary,65);
 const answer=cleanPublic(report.public_answer)||`美股 ${report.report_date||''} 收盘${mixed?'表现分化':''}${moves?`：${moves}`:''}。${reason}`;
 const session=now&&marketSession(now);
 return session?.known&&/休市/.test(session.label)?`${session.date} 美股休市。最近交易日：${answer}`:answer;
}
export function morningAnswer(report:MorningReport) {
 const moves=(report.futures||[]).slice(0,3).map(r=>percent(r.daily_change)?`${r.name} ${percent(r.daily_change)}`:'').filter(Boolean).join('、');
 return cleanPublic(report.public_answer)||`${report.report_date||''} 美股盘前${moves?`：${moves}`:''}。${cleanPublic(report.public_excerpt,65)}`;
}
export const TODAY_FAQ=[{q:'美股今天为什么跌？',a:'请查看本期收盘复盘中的指数表现与事件时间线。价格变化可能受多个因素共同影响；没有可核对的来源时，不把时间上的同时发生写成确定因果。'}, {q:'美股今天为什么涨？',a:'本期日报按已发布的公司消息、宏观数据和行业变化整理市场驱动。指数可能分化，应同时观察标普、纳指和相关板块，不能用个别股票代表整个市场。'}, {q:'最近美股大跌的原因是什么？',a:'下方时间线按交易日列出市场表现与来源摘要；点击对应日期可查看当天新闻、公开信息和后续关注事件。历史归因需要结合当时信息理解。'}, {q:'美股几点收盘，日报几点更新？',a:'常规交易于美东时间下午四点收盘，收盘日报通常约下午六点更新。提前收盘日和休市日请查看本站交易时间指南。'}, {q:'VIX 恐慌指数今天是多少？',a:'本期报告中的 VIX 为报告生成时可用的读数；最新数据与来源时间请查看市场情绪页面。VIX 衡量隐含波动率，不直接预测市场方向。'}];
export const MORNING_FAQ=[{q:'今天美股盘前怎么看？',a:'先核对期货、隔夜事件与今日关注日程，再对照公司公告和数据发布时间。盘前成交与正式开盘后的交易条件不同，早报中的变化不代表收盘结果。'}, {q:'美股盘前交易时间是几点（北京时间）？',a:'纽约盘前时段通常从凌晨四点到上午九点半；夏令时对应北京、台北下午四点至晚上九点半，冬令时顺延一小时。不同券商、交易场所和证券的实际开放范围不同。'}, {q:'美股期货和盘前股价有什么区别？',a:'股指期货反映指数合约的交易价格，盘前股价是单只股票在延长时段的成交报价。两者的标的、交易机制和流动性不同，不能把期货涨跌直接视作单只股票的价格变化。'}, {q:'本页几点更新？',a:'每个交易日约美东时间上午九点更新，覆盖主要股指期货、全球市场、隔夜消息与当日关注事项。北京和台北通常为夏令时晚上九点、冬令时晚上十点；以本期数据更新时间为准。'}];
