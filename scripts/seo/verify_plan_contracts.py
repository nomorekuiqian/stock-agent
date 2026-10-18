"""Read-only cross-route contracts, including bot parity and visible FAQ consistency."""
import argparse,json,re,urllib.request
from pathlib import Path
from verify_plan import PlanPage
parser=argparse.ArgumentParser();parser.add_argument('--base',default='http://127.0.0.1:3107');parser.add_argument('--http-report',default='docs/seo/2026-10-18/plan-http-acceptance.json');parser.add_argument('--output',default='docs/seo/2026-10-18/plan-cross-route-checks.json');args=parser.parse_args()
BASE=args.base
UAS=['Mozilla/5.0','Googlebot','GPTBot','PerplexityBot','ClaudeBot','Google-Extended']
paths=['/stock/NVDA','/kol/serenity','/morning','/guide/us-market-hours']
def read(path,ua):
 with urllib.request.urlopen(urllib.request.Request(BASE+path,headers={'User-Agent':ua}),timeout=60) as r:
  raw=r.read().decode();p=PlanPage();p.feed(raw);return r.status,p,raw
results=[]
for path in paths:
 baseline=None
 for ua in UAS:
  status,p,raw=read(path,ua)
  data=(status,p.h1,p.canonical,p.robots,''.join(p.text))
  if baseline is None:baseline=data
  assert data==baseline,(path,ua,'crawler discrepancy')
  results.append({'path':path,'ua':ua,'passed':True})
for row in json.loads(Path(args.http_report).read_text())['pages']:
 if row['status']!=200 or row['path']=='/llms.txt':continue
 status,p,raw=read(row['path'],UAS[0]);body=''.join(p.all_text)
 for graph in p.jsonld:
  assert '@graph' in graph
  for node in graph['@graph']:
   assert node.get('@type') not in ('Product','Review','AggregateRating','Offer','Event')
   if node.get('@type')=='FAQPage':
    for faq in node['mainEntity']:
     assert faq['name'] in body,(row['path'],'invisible FAQ question')
     assert faq['acceptedAnswer']['text'] in body,(row['path'],'invisible FAQ answer')
status,p,raw=read('/llms.txt',UAS[0])
assert len(re.findall('/stock/',raw))>=70 and '/kol' in raw
assert '下一个交易日' in read('/guide/us-market-hours',UAS[0])[2]
Path(args.output).write_text(json.dumps({'base':BASE,'bot_parity':results,'visible_faq_schema':True,'llms_sample_links':True,'guide_ssr_session':True},ensure_ascii=False,indent=2)+'\n')
