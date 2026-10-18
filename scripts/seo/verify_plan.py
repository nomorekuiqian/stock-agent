"""Plan acceptance against explicit --base; use fixture_server for zero-provider checks."""
import argparse
import concurrent.futures
import json
import re
import urllib.request
import urllib.error
from pathlib import Path
from verify_pages import Page
class PlanPage(Page):
 def __init__(self):
  super().__init__();self.all_text=[];self.in_body=False;self.in_answer=False;self.answer_text=[]
 def handle_starttag(self,tag,attrs):
  super().handle_starttag(tag,attrs)
  if tag=='body':self.in_body=True
  if tag=='p' and 'answer' in dict(attrs).get('class','').split():self.in_answer=True
 def handle_endtag(self,tag):
  super().handle_endtag(tag)
  if tag=='p':self.in_answer=False
  if tag=='body':self.in_body=False
 def handle_data(self,data):
  super().handle_data(data)
  if self.in_body and not self.skip:self.all_text.append(data)
  if self.in_answer and not self.skip:self.answer_text.append(data)
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args):return None

def check(base,path):
 request=urllib.request.Request(base+path,headers={'User-Agent':'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'})
 try:response=urllib.request.build_opener(NoRedirect).open(request,timeout=90)
 except urllib.error.HTTPError as error:response=error
 html=response.read().decode();p=PlanPage();p.feed(html);text=''.join(p.all_text)
 return {'path':path,'status':response.status,'redirect':response.headers.get('Location'),'content_type':response.headers.get('Content-Type'),'robots_header':response.headers.get('X-Robots-Tag'),'answer_text':''.join(p.answer_text),'disclaimer':'不构成任何投资建议' in text,'h1':p.h1,'jsonld':len(p.jsonld),'graph':all('@graph' in d for d in p.jsonld),'schemas':p.jsonld,'han':len(re.findall(r'[\u4e00-\u9fff]',text)),'title':''.join(p.title),'canonical':p.canonical,'robots':p.robots,'banned':re.findall('必涨|推荐买入|稳赚|保证收益|喊单|目标价必达|抄底|闭眼买|翻倍',text),'answer':'class="answer' in html,'updated':'数据更新：' in text,'empty_values':re.findall(r'\bNaN\b|\bundefined\b|\bnull\b',text)}
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--base',required=True);parser.add_argument('--production',action='store_true');parser.add_argument('--output',default='docs/seo/2026-10-18/plan-http-acceptance.json');args=parser.parse_args()
 paths=['/','/stock','/kol','/kol/serenity','/kol/qinbafrank','/today','/morning','/today/archive','/morning/archive','/twitter-digest','/twitter-digest/archive','/twitter-digest/2026-10-16','/macro/sentiment','/macro/liquidity','/guide/us-market-hours','/morning/2026-10-16-morning-brief','/morning/2026-10-01-morning-brief','/today/2026-10-16-market-report','/liquidity','/kol/aleabitoreddit','/llms.txt','/stock/ZZZZQ','/this-path-does-not-exist-123','/ai-stock-research','/earnings-calendar','/stock/NVDA/earnings']
 paths += ['/stock/'+s for s in ['CRWV','SOFI','NBIS','SMR','PLTR','NVDA','GOOGL','MSFT','AMZN','SPCX','BRK.B','QBTS']]
 paths += [f'/kol/{name}/{tab}' for name in ['qinbafrank','serenity'] for tab in ['latest','highlights','sectors','stocks']]
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:results=list(pool.map(lambda path:check(args.base,path),paths))
 Path(args.output).write_text(json.dumps({'environment':'production public read-only checks' if args.production else 'isolated fixture API; not live market evidence','base':args.base,'pages':results},ensure_ascii=False,indent=2)+'\n')
 redirects={'/liquidity':'/macro/liquidity','/kol/aleabitoreddit':'/kol/serenity','/ai-stock-research':'/','/earnings-calendar':'/today#events','/stock/NVDA/earnings':'/stock/NVDA#earnings'}
 errors=[]
 for r in results:
  path=r['path']; expected=301 if path in redirects else 404 if path in ['/stock/ZZZZQ','/this-path-does-not-exist-123'] else 200
  if r['status']!=expected:errors.append(f'{path} expected {expected}, got {r["status"]}')
  if path in redirects and not (r['redirect'] or '').endswith(redirects[path]):errors.append(f'{path} redirect target')
  if r['status']==200 and r['path']!='/llms.txt':
   if r['canonical']!=['https://www.themarketbrew.com'+('' if path=='/' else path)]:errors.append(f'{path} canonical mismatch')
   if '/kol/' in path and path.count('/')==3 or (not args.production and path in ['/twitter-digest/2026-10-16','/morning/2026-10-01-morning-brief']):
    if not any('noindex' in value for value in r['robots']):errors.append(f'{path} thin page not noindex')
   answer=r['answer_text']
   if len(answer)>140 or len(re.findall(r'[\u4e00-\u9fff]',answer))>80:errors.append(f'{path} oversized answer')
   if re.search(r'\b(?:NaN|undefined|null)\b|--',answer):errors.append(f'{path} invalid answer')
   if r['h1']!=1:errors.append(f"{r['path']} h1={r['h1']}")
   if r['jsonld']!=1 or not r['graph']:errors.append(f"{r['path']} schema={r['jsonld']} graph={r['graph']}")
   if r['banned'] or r['empty_values']:errors.append(f"{r['path']} prohibited or empty text")
  if path=='/llms.txt' and 'text/plain' not in r['content_type']:errors.append('llms content type')
  if r['status']==404 and not any('noindex' in v for v in r['robots']):errors.append(f'{path} 404 without noindex')
  if r['status']>=500:errors.append(f"{r['path']} status={r['status']}")
 print(json.dumps({'checked':len(results),'errors':errors,'counts':[{k:r[k] for k in ('path','status','han','h1','jsonld')} for r in results]},ensure_ascii=False))
 raise SystemExit(bool(errors))
