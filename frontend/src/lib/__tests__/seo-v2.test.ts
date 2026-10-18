import { describe,it,expect } from 'vitest';
import { marketSession,sessionTimes } from '../market-hours';
import { stockContent,earningsEligible } from '../stock-seo-content';
import type { StockSeoData } from '../seo-data';
const base:StockSeoData={symbol:'NVDA',updated_at:'2026-10-18T12:00:00Z',content_hash:'test',about:'',ai_summary:'',earnings_analysis:'',earnings_notes:'',profile:{company_name:'NVIDIA',exchange:'NASDAQ'},stock:{quote:{}},reports:[],why:[],kol:[],earnings:{},next_earnings:null,analyst:{},dividend_yield:null};
describe('official trading sessions',()=>{
 it('handles summer/winter opening boundary and the DST change weekend',()=>{
  expect(marketSession(new Date('2026-07-15T13:29:00Z')).open).toBe(false);
  expect(marketSession(new Date('2026-07-15T13:30:00Z')).open).toBe(true);
  expect(marketSession(new Date('2026-11-02T14:29:00Z')).open).toBe(false);
  expect(marketSession(new Date('2026-11-02T14:30:00Z')).open).toBe(true);
  expect(marketSession(new Date('2026-11-01T15:00:00Z')).label).toContain('周末');
 });
 it('respects holidays, early closes and unknown years',()=>{
  expect(marketSession(new Date('2026-12-25T15:00:00Z')).open).toBe(false);
  expect(marketSession(new Date('2026-11-27T18:00:00Z')).open).toBe(false);
  expect(marketSession(new Date('2026-11-27T17:59:00Z')).open).toBe(true);
  expect(marketSession(new Date('2030-07-15T15:00:00Z')).known).toBe(false);
  expect(sessionTimes('summer','Asia/Shanghai')[1]).toContain('21:30');
  expect(sessionTimes('winter','Asia/Shanghai')[1]).toContain('22:30');
 });
});
describe('stock quality gates',()=>{
 it('does not index empty templates or invent missing prices/earnings',()=>{
  const c=stockContent(base);expect(c.quality.index).toBe(false);expect(c.answer).toBe('');expect(stockContent({...base,stock:{quote:{price:0}}}).answer).toBe('');expect(c.blocks.some(b=>b.id==='analyst')).toBe(false);
 });
 it('counts repeated FAQ material only once and gates non-candidates',()=>{
  const about='公司经营业务与客户服务。'.repeat(20);
  const c=stockContent({...base,about});expect(c.quality.unique).toBe(about.length);expect(c.quality.total).toBeGreaterThan(about.length);
  expect(stockContent({...base,symbol:'UNLISTED',about}).quality.index).toBe(false);
 });
 it('keeps earnings on the canonical stock page regardless of depth',()=>{
  expect(earningsEligible(base)).toBe(false);
  const d={...base,earnings_analysis:'业绩'.repeat(300),earnings:{income_statements:Array.from({length:8},(_,i)=>({date:`2026-0${i+1}-01`}))}};
  expect(earningsEligible(d)).toBe(false);expect(earningsEligible({...d,symbol:'NET'})).toBe(false);
 });
 it('does not publish suspicious dividend yield FAQ',()=>{expect(stockContent({...base,dividend_yield:30}).faq.some(f=>f.q.includes('股息'))).toBe(false);});
});
