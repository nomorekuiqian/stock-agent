import Link from 'next/link';
import { STOCK_NAMES } from '@/lib/stock-names';
const ambiguous = new Set(['AI','IT','ON','ALL','NOW','ARM','NET','CAT','F','C','V','A']);
const aliasMap:Record<string,string> = {CoreWeave:'CRWV',Nebius:'NBIS',SoFi:'SOFI',Palantir:'PLTR',NVIDIA:'NVDA',Microsoft:'MSFT',Google:'GOOGL',Alphabet:'GOOGL',Amazon:'AMZN',SpaceX:'SPCX',NuScale:'SMR'};
for(const [symbol,names] of Object.entries(STOCK_NAMES)) if(/[\u4e00-\u9fff]/.test(names.zh))aliasMap[names.zh]=symbol;
const escape=(text:string)=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const aliases=Object.keys(aliasMap).sort((a,b)=>b.length-a.length).map(escape).join('|');
const pattern=new RegExp(`(${aliases}|\\$[A-Z]{1,5}(?:\\.[A-Z])?|\\([A-Z]{1,5}(?:\\.[A-Z])?\\)|\\b[A-Z]{2,5}(?:\\.[A-Z])?\\b)`,'g');
export function StockLinkedText({text,seen=new Set<string>(),anchor=''}:{text?:string;seen?:Set<string>;anchor?:string}) {
 if(!text)return null;
 return text.split(pattern).map((part,i)=>{
  if(part==='VIX')return <Link key={i} href="/macro/sentiment">{part}</Link>;
  const symbol=aliasMap[part]||part.replace(/^[$(]|\)$/g,'');
  const explicit=!!aliasMap[part]||part.startsWith('$')||part.startsWith('(');
  if(!STOCK_NAMES[symbol]||(!explicit&&ambiguous.has(symbol))||seen.has(symbol))return part;
  seen.add(symbol);
  return <Link prefetch={false} key={i} href={`/stock/${symbol}${anchor}`} className="text-primary hover:underline">{part}</Link>;
 });
}
