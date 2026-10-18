import { writeFile, mkdir } from 'node:fs/promises';
import { DIRECTORY_SYMBOLS } from '../src/lib/stock-directory';
import samples from '../src/lib/seo-samples.json';
import { stockContent, earningsEligible } from '../src/lib/stock-seo-content';
import type { StockSeoData } from '../src/lib/seo-data';
async function main(){
 const symbols=[...new Set([...samples.map(s=>s.symbol),...DIRECTORY_SYMBOLS])];
 const rows:Record<string,unknown>[]=[];
 for(let offset=0;offset<symbols.length;offset+=3){await Promise.all(symbols.slice(offset,offset+3).map(async symbol=>{
  try{const response=await fetch(`${process.env.NEXT_PUBLIC_API_URL||'http://localhost:8000/api'}/seo/stock/${symbol}`,{signal:AbortSignal.timeout(120000)});if(!response.ok){rows.push({symbol,status:response.status});return;}const d=await response.json() as StockSeoData;const c=stockContent(d);rows.push({symbol,status:200,...c.quality,about_chars:d.about.length,earnings_page:earningsEligible(d),updated_at:d.updated_at,content_hash:d.content_hash});console.info(`SEO ${symbol}: unique=${c.quality.unique} total=${c.quality.total} ratio=${c.quality.ratio.toFixed(3)} robots=${c.quality.index?'index,follow':'noindex,follow'} in_sitemap=${c.quality.index} temporary_exception=${c.quality.temporaryException}`);
  }catch(error){rows.push({symbol,status:'error',error:String(error)});}
 }));}
 await mkdir('../docs/seo/2026-10-18',{recursive:true});
 await writeFile(process.env.SEO_AUDIT_OUTPUT||'../docs/seo/2026-10-18/content-audit.json',JSON.stringify(rows,null,2)+'\n');
 if(rows.some(r=>r.status!==200&&(r.status!==404||samples.some(s=>s.symbol===r.symbol))))process.exitCode=1;
}
main();
