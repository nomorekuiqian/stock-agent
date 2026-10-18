import {describe,it,expect} from 'vitest';
import {stockContent,stockTitle} from '../stock-seo-content';
import {formatDividendYield,cleanPublic,compactAnswer,formatET} from '../seo-public';
import {morningIndexable,dailyAnswer} from '../report-seo';
import {daylightTransitions,nextTradingDay} from '../market-hours';
import type {StockSeoData} from '../seo-data';
const base:StockSeoData={symbol:'CRWV',updated_at:'2026-10-18',content_hash:'a',profile:{company_name:'CoreWeave'},stock:{quote:{}},about:'',ai_summary:'',earnings_analysis:'',earnings_notes:'',earnings:{},reports:[],why:[],kol:[],analyst:{},next_earnings:null,dividend_yield:null};
describe('SEO implementation plan contracts',()=>{
 it.each([[.1289,'0.13%'],[.243,'0.24%'],[.675,'0.68%'],[2.26,'2.26%'],[.307,'0.31%'],[26,null],[NaN,null],[null,null]])('formats percentage-point yield %s without multiplying', (v,expected)=>expect(formatDividendYield(v as number|null)).toBe(expected));
 it('expires the five-stock W1 exception at the end of W2',()=>{
  expect(stockContent(base,new Date('2026-11-01T23:59:59-05:00')).quality.index).toBe(true);
  expect(stockContent(base,new Date('2026-11-02T00:00:00-05:00')).quality.index).toBe(false);
  expect(stockContent({...base,symbol:'QBTS'},new Date('2026-10-18')).quality.index).toBe(false);
 });
 it('retains the canonical earnings title window without guessing fiscal quarters',()=>{
  const d={...base,symbol:'MSFT',next_earnings:{symbol:'MSFT',date:'2026-10-28'}};
  expect(stockTitle(d,'微软',new Date('2026-10-20T12:00:00Z'))).toContain('财报日期');
  expect(stockTitle(d,'微软',new Date('2026-09-20T12:00:00Z'))).toContain('股票');
  expect(stockTitle({...d,next_earnings:null,latest_actuals:{symbol:'MSFT',date:'2026-10-28',fiscal_period:'FY2027 Q1'}},'微软',new Date('2026-10-29T12:00:00Z'))).toContain('FY2027 Q1');
 });
 it('counts only public report prose for thin date pages',()=>{
  expect(morningIndexable({public_excerpt:'市场'.repeat(120),today_focus:[]})).toBe(false);
  expect(morningIndexable({public_excerpt:'市场'.repeat(120),today_focus:[{title:'事件',analysis:'消息'.repeat(40)}]})).toBe(true);
 });
 it('handles mixed indices, DST and holiday calendars',()=>{
  expect(dailyAnswer({timestamp:'2026-10-16',report_date:'2026-10-16',indices:[{name:'NASDAQ',value:100,change_percent:-1},{name:'S&P 500',value:100,change_percent:1}]})).toContain('分化');
  expect(daylightTransitions(2026)).toEqual({start:'2026-03-08',end:'2026-11-01'});
  expect(nextTradingDay(new Date('2026-10-31T16:00:00Z'))).toBe('2026-11-02');
 });
 it('never publishes banned claims or unsupported translations',()=>{
  expect(cleanPublic('目标价必达')).toBe('');
  expect(stockContent({...base,symbol:'NBIS'}).name).toBe('Nebius');
  expect(stockContent({...base,symbol:'SMR'}).peers.map(p=>p.symbol)).toEqual(['OKLO','CEG','VST']);
 });
 it('respects fourteen ET calendar days and does not invent source times',()=>{
  const d={...base,symbol:'GOOGL',next_earnings:{symbol:'GOOGL',date:'2026-11-12'}};
  expect(stockTitle(d,'谷歌',new Date('2026-10-29T12:00:00Z'))).toContain('财报日期');
  expect(stockTitle(d,'谷歌',new Date('2026-10-28T12:00:00Z'))).toContain('股票');
  expect(formatET('2026-10-18')).toBe('2026-10-18（来源仅提供日期）');
  const bounded=compactAnswer('有来源的事实。'.repeat(40));
  expect(bounded.length).toBeLessThanOrEqual(140);
  expect((bounded.match(/[\u4e00-\u9fff]/g)||[]).length).toBeLessThanOrEqual(80);
 });

});

import dividendSnapshot from '../../../../docs/seo/2026-10-18/dividend-audit.json';
it('hides every high-yield anomaly in the previously captured full-universe audit',()=>{
 expect(dividendSnapshot.complete).toBe(true);
 expect(dividendSnapshot.anomalies.length).toBeGreaterThan(0);
 for(const row of dividendSnapshot.anomalies)expect(formatDividendYield(row.dividend_yield)).toBeNull();
});
