"""Read-only HTTP/HTML acceptance, including actual main-text uniqueness audit."""
import argparse, concurrent.futures, json, re, urllib.request, urllib.error
from html.parser import HTMLParser
from pathlib import Path
class Page(HTMLParser):
    def __init__(self):super().__init__();self.main=0;self.skip=0;self.text=[];self.title=[];self.in_title=False;self.h1=0;self.robots=[];self.canonical=[];self.jsonld=[];self.ld=False;self.buffer=[];self.ratio=None
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag=='main':
            self.main+=1
            self.ratio=a.get('data-seo-ratio') or self.ratio
        if tag in ('script','style'):self.skip+=1
        if tag=='link' and a.get('rel')=='canonical':self.canonical.append(a.get('href'))
        if tag=='script' and a.get('type')=='application/ld+json':self.ld=True;self.buffer=[]
        if tag=='title':self.in_title=True
        if tag=='h1':self.h1+=1
        if tag=='meta' and a.get('name')=='robots':self.robots.append(a.get('content',''))
    def handle_endtag(self,tag):
        if tag=='script' and self.ld:
            self.jsonld.append(json.loads(''.join(self.buffer)));self.ld=False
        if tag=='main':self.main=max(0,self.main-1)
        if tag in ('script','style'):self.skip=max(0,self.skip-1)
        if tag=='title':self.in_title=False
    def handle_data(self,data):
        if self.ld:self.buffer.append(data)
        if self.main and not self.skip:self.text.append(data)
        if self.in_title:self.title.append(data)
def fetch(base,path):
    try:
        response=urllib.request.urlopen(urllib.request.Request(base+path,headers={'User-Agent':'Googlebot'}),timeout=180);status=response.status
    except urllib.error.HTTPError as e:response=e;status=e.code
    html=response.read().decode();p=Page();p.feed(html)
    body=''.join(p.text);return {'path':path,'status':status,'content_type':response.headers.get('Content-Type'),'robots_header':response.headers.get('X-Robots-Tag'),'title':''.join(p.title),'h1':p.h1,'robots':p.robots,'canonical':p.canonical,'schemas':p.jsonld,'quality_ratio':p.ratio,'main_chars':len(re.sub(r'\s','',body)),'banned':re.findall('必涨|推荐买入|稳赚|保证收益|喊单',body)}
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--base',default='http://127.0.0.1:3107');args=parser.parse_args()
    paths=['/not-a-real-seo-page','/stock/ZZZZQ','/kol','/kol/serenity','/kol/qinbafrank','/llms.txt','/guide/us-market-hours','/earnings-calendar','/ai-stock-research','/today','/morning','/macro/sentiment','/macro/inflation-rates','/macro/liquidity','/morning/2026-10-16-morning-brief','/today/2026-10-16-market-report','/stock/BRK.B','/stock/QBTS','/stock/NVDA/earnings','/twitter-digest/2026-10-16','/indexnow-key.txt']
    samples=json.loads(Path('frontend/src/lib/seo-samples.json').read_text());paths += ['/stock/'+r['symbol'] for r in samples[::7]]
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:results=list(pool.map(lambda p:fetch(args.base,p),paths))
    Path('docs/seo/2026-10-18/http-acceptance.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n')
