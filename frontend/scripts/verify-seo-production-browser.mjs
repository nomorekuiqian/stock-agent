import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
const base=process.env.SEO_BASE||'http://127.0.0.1:3107';
if(base!=='https://www.themarketbrew.com')throw new Error('Explicit production domain required');
const out='../docs/seo/2026-10-18/production-browser';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'});const results=[];
try {
 for(const width of [1440,390]) {
 const context=await browser.newContext({viewport:{width,height:900},storageState:{cookies:[],origins:[]}});
 await context.route('**/*',route=>route.request().method()==='GET' && ['https://www.themarketbrew.com','https://stock-agent-production.up.railway.app'].includes(new URL(route.request().url()).origin)?route.continue():route.abort());
 const page=await context.newPage();
 for(const path of ['/stock/NVDA','/stock/SMR','/stock/GOOGL','/kol/serenity','/kol/qinbafrank/latest','/morning','/macro/sentiment','/macro/liquidity','/guide/us-market-hours']) {
 const errors=[];const onError=error=>errors.push(error.message);page.on('pageerror',onError);
 await page.goto(base+path,{waitUntil:'networkidle',timeout:90000});
 const data=await page.evaluate(()=>{const main=document.querySelector('[data-seo-total]');let actual=null;if(main){const clone=main.cloneNode(true);clone.querySelectorAll('nav,script,footer').forEach(n=>n.remove());clone.querySelectorAll('p').forEach(p=>{if(/^(本页内容由 TheMarketBrew|仅供研究与信息参考|观点来自博主公开发言)/.test(p.textContent||''))p.remove();});actual=(clone.textContent||'').replace(/\s/g,'').length;}return ({actualChars:actual,modeledChars:main?Number(main.getAttribute('data-seo-total')):null,h1:document.querySelectorAll('h1').length,overflow:document.documentElement.scrollWidth>innerWidth+2,answer:document.querySelector('.answer')?.textContent||'',title:document.title,paywalls:document.querySelectorAll('.paywalled-content,.kol-paywall,.morning-paywall').length,ratio:document.querySelector('[data-seo-ratio]')?.getAttribute('data-seo-ratio')});});
 if(['/stock/NVDA','/kol/serenity','/guide/us-market-hours'].includes(path))await page.screenshot({path:`${out}/${path.replaceAll('/','_')}-${width}.png`,fullPage:true});
 results.push({path,width,...data,errors});page.off('pageerror',onError);
 }
 await context.close();
 }
} finally {await browser.close();}
await fs.writeFile(`${out}/results.json`,JSON.stringify({environment:'production anonymous; only GET requests to frontend/backend allowed; auth/analytics/writes blocked',results},null,2));
const failures=results.filter(r=>r.h1!==1||r.overflow||r.errors.length||(r.actualChars!==null&&r.actualChars!==r.modeledChars));console.info(JSON.stringify({checked:results.length,failures}));if(failures.length)process.exitCode=1;
