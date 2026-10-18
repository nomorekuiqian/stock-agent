"""Check every local sitemap URL without submitting anything to search engines."""
import argparse,concurrent.futures,json,urllib.request,urllib.parse,xml.etree.ElementTree as ET
from pathlib import Path
from verify_pages import fetch
parser=argparse.ArgumentParser();parser.add_argument('--base',default='http://127.0.0.1:3107');parser.add_argument('--output',default='docs/seo/2026-10-18/sitemap-acceptance.json');args=parser.parse_args();BASE=args.base; NS={'s':'http://www.sitemaps.org/schemas/sitemap/0.9'}
def xml(path):
    with urllib.request.urlopen(BASE+path,timeout=300) as response:return ET.fromstring(response.read())
files=[urllib.parse.urlsplit(n.text).path for n in xml('/sitemap.xml').findall('s:sitemap/s:loc',NS)]
paths=[]
for file in files:
    paths.extend(urllib.parse.urlsplit(n.text).path for n in xml(file).findall('s:url/s:loc',NS))
def check(path):
    try:
        row=fetch(BASE,path)
        row['passed']=row['status']==200 and not any('noindex' in r for r in row['robots']) and 'noindex' not in (row['robots_header'] or '') and row['canonical']==['https://www.themarketbrew.com'+path] and row['h1']==1 and not row['banned']
        return row
    except Exception as error:return {'path':path,'passed':False,'error':str(error)}
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:rows=list(pool.map(check,paths))
result={'files':files,'count':len(rows),'passed':sum(row['passed'] for row in rows),'failures':[row for row in rows if not row['passed']],'rows':rows}
Path(args.output).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
raise SystemExit(0 if result['count']==result['passed'] else 1)
