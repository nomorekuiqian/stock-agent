export const SHORT_DISCLAIMER = '仅供研究与信息参考，不构成投资建议。';
export const KOL_DISCLAIMER = '观点来自博主公开发言，仅代表其本人，TheMarketBrew 只做整理，不构成推荐。';
export const BANNED_PUBLIC = /必涨|推荐买入|稳赚|保证收益|喊单|目标价必达|抄底|闭眼买|翻倍/;
export function cleanPublic(value: unknown, limit = Infinity): string {
  const text = typeof value === 'string' ? value.replace(/<[^>]*>/g, '').trim() : '';
  return BANNED_PUBLIC.test(text) ? '' : text.slice(0, limit);
}
export function han(value: string) { return (value.match(/[\u4e00-\u9fff]/g) || []).length; }
export function formatET(value?: string | null): string {
  if (!value || !Number.isFinite(Date.parse(value))) return '来源未提供';
  if(value.length===10)return `${value}（来源仅提供日期）`;
  const date = new Date(value);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).map(p=>[p.type,p.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}
/** Input is already percentage points: 0.13 means 0.13%, not 13%. */
export function formatDividendYield(raw: number | null | undefined): string | null {
  if (raw == null || !Number.isFinite(raw) || raw < 0 || raw > 25) return null;
  return `${raw.toFixed(2)}%`;
}
export function percent(raw: number | null | undefined): string | null {
  if (raw == null || !Number.isFinite(raw) || Math.abs(raw)>60) return null;
  return `${raw>0?'+':''}${raw.toFixed(2)}%`;
}
export type Faq = {q:string; a:string};
export function faqSchema(faq: Faq[]) { return {'@type':'FAQPage',mainEntity:faq.map(f=>({'@type':'Question',name:f.q,acceptedAnswer:{'@type':'Answer',text:f.a}}))}; }
export function breadcrumbs(items: {name:string;path:string}[]) { return {'@type':'BreadcrumbList',itemListElement:[{name:'首页',path:'/'},...items].map((item,i)=>({'@type':'ListItem',position:i+1,name:item.name,item:`https://www.themarketbrew.com${item.path}`}))}; }

export function compactAnswer(text:string) {
 let out='';let count=0;
 for(const char of text){if(/[\u4e00-\u9fff]/.test(char))count++;if(count>80||out.length+char.length>139)return out.replace(/[，、；： ]+$/,'')+'…';out+=char;}
 return out;
}
