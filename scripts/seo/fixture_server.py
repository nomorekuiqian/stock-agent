"""Loopback-only synthetic API for SEO integration checks; never contacts a provider.
All prices, report prose, authors and timestamps here are test fixtures, not market evidence.
"""
import json
import logging
import sqlite3
from datetime import date,timedelta
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse,parse_qs
ROOT=Path(__file__).resolve().parents[2]
SAMPLES=json.loads((ROOT/'frontend/src/lib/seo-samples.json').read_text())
NAMES={row['symbol']:row['name'] for row in SAMPLES}
with sqlite3.connect(f'file:{ROOT}/backend/app/features/seo/company_content.sqlite?mode=ro',uri=True) as db:
    COMPANIES={s:{'about':a,'source':u,'updated':d} for s,a,u,d in db.execute('SELECT symbol,about,source_url,updated_at FROM companies')}
COMPANY_FACTS=json.loads((ROOT/'backend/app/features/seo/company_facts.json').read_text())
NEWS='公司披露产品进展与客户需求，市场同时关注资本开支、订单交付和成本变化。研究时应区分已完成业务与未来计划，结合原始公告核对事实。'
REPORT={'report_id':'test-report','report_date':'2026-10-16','timestamp':'2026-10-16T22:00:00Z','title':'隔离验收：科技行业与市场事件','summary':NEWS,'intro':NEWS*3,'indices':[{'name':'NASDAQ','value':100,'change_percent':-2.15},{'name':'S&P 500','value':100,'change_percent':-1.09},{'name':'VIX','value':20,'change_percent':1.2}],'news':{'headlines':[{'title':f'研究事项 {i}：CoreWeave 与 NVDA','fact_summary':NEWS,'deep_analysis':NEWS*5,'url':'https://example.test/source'} for i in range(6)],'briefs':[]},'report_summary':[{'title':'资料核对','content':NEWS*6}],'calendar':[{'date':'2026-10-28','event':'MSFT 财报','analysis':'核对业绩与公司公告。'}]}
MORNING={'report_id':'test-morning','report_date':'2026-10-16','timestamp':'2026-10-16T13:00:00Z','title':'隔离验收：盘前事件与关注事项','public_excerpt':NEWS*3,'futures':[{'name':'S&P 500','value':100,'daily_change':.15},{'name':'NASDAQ','value':100,'daily_change':-.23},{'name':'Dow Jones','value':100,'daily_change':.14}],'global_markets':{'asia':[],'europe':[],'other':[{'name':'VIX','value':20,'daily_change':1.2}]},'market_pulse':'','futures_analysis':'','global_markets_analysis':'','overnight_news':[],'today_focus':[{'title':'公司业绩公告','analysis':NEWS*3}],'summary':[],'is_locked':True,'public_event_points':[{'title':'公司发布产品进展，关注供应链披露'}]}
TEASER={'date':'2026-10-16','generated_at':'2026-10-16T20:30:00Z','headline':'隔离验收：AI 产业与公司讨论','intro_preview':NEWS*2,'input_tweet_count':20,'tracked_kol_count':2,'hot_tickers':[{'label':'NVDA','count':5},{'label':'CRWV','count':3}],'hot_sectors':[{'label':'AI 供应链','count':7}],'hot_events':[{'label':'产品发布','count':4}]}
def kol(name):
 return {'username':name,'license_status':'summary_only','updated_at':'2026-10-16T20:30:00Z','total':20,'source':'kol_daily_digests','weekly_summary':NEWS*3,'top_tickers':[{'symbol':s,'count':5,'stance':'bull'} for s in ['NVDA','CRWV','NBIS']],'timeline':[{'id':f'{name}{i}','date':'2026-10-16','summary':'公司披露产品和客户进展，关注订单兑现与成本变化。','url':f'https://x.com/{name}/status/{i}','tickers':['NVDA','CRWV','NBIS'],'stances':[{'ticker':'NVDA','stance':'bull'}]} for i in range(10)]}
def stock(symbol):
 company=COMPANIES.get(symbol,{})
 rows=[{**kol(name)['timeline'][0],'username':name,'tickers':[symbol],'stances':[{'ticker':symbol,'stance':'bull'}]} for name in ['qinbafrank','aleabitoreddit']]
 return {'company_faq':[{'q':row['q'],'a':row['a'].format_map(row['facts']),'source':row['source']} for row in COMPANY_FACTS.get(symbol,[])],'symbol':symbol,'updated_at':company.get('updated','2026-10-01T12:00:00Z'),'content_hash':'fixture-only','profile':{'company_name':NAMES.get(symbol,symbol),'company_name_zh':NAMES.get(symbol,symbol),'exchange':'NASDAQ','company_details':{'website':'https://example.test'}},'stock':{'quote':{'price':123.45,'change_percent':-1.2},'meta':{'quote_fetched_at':'2026-10-16T20:00:00Z'}},'about':company.get('about',''),'about_source':company.get('source'),'ai_summary':'公开研究摘要；本页面用于隔离环境验收。','reports':[{'date':'2026-10-16','summary':NEWS[:60],'url':'/today/2026-10-16-market-report','change_percent':-4}],'why':[{'date':'2026-10-16','summary':NEWS[:60],'url':'/today/2026-10-16-market-report','change_percent':-4,'confidence':'high','source':'daily_report'}],'kol':rows,'kol_stats':{'n_kol':2,'n_posts':2,'bull':2,'bear':0,'disputed':0},'kol_conclusion':'摘要来自已记录的公开发言，观点保留原帖来源供核对。','earnings':{'earnings_history':[{'quarter':f'FY2026 Q{i}','eps_actual':1.1,'eps_estimate':1,'revenue_actual':1000,'revenue_estimate':900} for i in range(4,0,-1)],'segments':[{'period':'FY2026 Q4','name':'测试分部','revenue':1000}]},'earnings_analysis':NEWS*3,'earnings_notes':'','next_earnings':{'date':'2026-10-28','time':'amc','confirmation':'estimated','symbol':symbol},'analyst':{'low':100,'mean':120,'high':150,'number_of_analysts':10},'dividend_yield':.13,'title_variant':{'direction':'跌','title_variant_changed_at':'2026-10-16'},'change_20d':-5,'drawdown_from_high':-8}
def listing(kind,query):
 rows=[{'id':f'test-{i}','report_date':str(date(2026,10,16)-timedelta(days=i)),'date':str(date(2026,10,16)-timedelta(days=i)),'timestamp':f'{date(2026,10,16)-timedelta(days=i)}T22:00:00Z','title':'隔离验收：'+NEWS[:40],'headline':'隔离验收：市场讨论','summary':NEWS,'intro_preview':NEWS} for i in range(30)]
 offset=int(query.get('offset',['0'])[0]);limit=int(query.get('limit',['30'])[0]);return {'data':rows[offset:offset+limit],'total':len(rows),'success':True}
def metric(key,value):return {'series_id':key,'title':key,'value':value,'date':'2026-10-15','units':'Billions of Dollars','change':1}
METRICS={key:metric(key,value) for key,value in [('fed_assets',6500),('tga',700),('rrp',50),('reserves',3000),('sofr',4),('effr',4),('nfci',-.5),('net_liquidity',5750)]}
HISTORY=[{'time':str(date(2026,7,23)+timedelta(days=i*7)),'value':5750+i,'fed_assets':6500+i,'tga':700,'rrp':50} for i in range(13)]
class Handler(BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  parsed=urlparse(self.path);path=parsed.path.removeprefix('/api');query=parse_qs(parsed.query);result=None
  if path.startswith('/seo/stock/'):
   symbol=path.rsplit('/',1)[-1]
   if symbol!='ZZZZQ':result=stock(symbol)
  elif path.endswith('/profile') and path.startswith('/stocks/'):
   symbol=path.split('/')[2]
   if symbol!='ZZZZQ':result={'profile':stock(symbol)['profile'],'source':'fixture'}
  elif path.startswith('/seo/kol/'):result=kol(path.rsplit('/',1)[-1])
  elif path=='/seo/report-timeline':result=[{'date':str(date(2026,10,16)-timedelta(days=i)),'timestamp':'2026-10-16T22:00:00Z','summary':NEWS[:60],'indices':REPORT['indices']} for i in range(10)]
  elif path=='/seo/sentiment':result={'indicators':[{'series_id':'VIX','name':'VIX 波动率指数','value':20,'date':'2026-10-16','change':1.2}],'history':[{'date':str(date(2026,9,1)+timedelta(days=i)),'value':15+i%10} for i in range(45)],'source':'隔离数据 / CBOE','cnn_enabled':False}
  elif path in ['/market/reports','/morning/reports','/twitter-digest/archive/teaser']:result=listing(path,query)
  elif path.startswith('/market/reports/'):
   report=dict(REPORT)
   if '/date/' in path:report['report_date']=path.rsplit('/',1)[-1]
   result={'success':True,'data':report}
  elif path.startswith('/morning/reports/'):
   report=dict(MORNING)
   if '/date/' in path:report['report_date']=path.rsplit('/',1)[-1]
   if report['report_date']=='2026-10-01':report={**report,'public_excerpt':'短摘要','today_focus':[]}
   result={'success':True,'data':report}
  elif path.startswith('/twitter-digest/teaser/'):result=TEASER
  elif path=='/liquidity/metrics':result={'success':True,'timestamp':'2026-10-16T12:00:00Z','metrics':METRICS}
  elif path=='/liquidity/history':result={'success':True,'timestamp':'2026-10-16T12:00:00Z','data':{'observations':HISTORY,'metrics':METRICS,'units':'Billions of Dollars','formula':'WALCL - TGA - RRP'}}
  elif path.startswith('/liquidity/'):result={'success':False,'data':None}
  self.send_response(200 if result is not None else 404);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(json.dumps(result if result is not None else {'error':'fixture not found'},ensure_ascii=False).encode())
if __name__=='__main__':
 logging.basicConfig(level=logging.INFO);logging.info('Isolated fixture API on http://127.0.0.1:18998')
 ThreadingHTTPServer(('127.0.0.1',18998),Handler).serve_forever()
