"""Import NYSE's published calendar; fail closed if the source layout changes."""
import json
import re
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

SOURCE = 'https://www.nyse.com/trade/hours-calendars'
class CalendarParser(HTMLParser):
    def __init__(self):
        super().__init__(); self.rows=[]; self.row=[]; self.cell=None; self.text=[]
    def handle_starttag(self, tag, attrs):
        if tag == 'tr': self.row=[]
        if tag in ('td','th'): self.cell=[]
    def handle_data(self, data):
        self.text.append(data)
        if self.cell is not None: self.cell.append(data)
    def handle_endtag(self, tag):
        if tag in ('td','th') and self.cell is not None:
            self.row.append(' '.join(self.cell)); self.cell=None
        if tag == 'tr' and self.row: self.rows.append(self.row)

def parse(html):
    parser=CalendarParser(); parser.feed(html)
    rows=parser.rows; header=next(r for r in rows if r[0].strip()=='Holiday')
    years=[int(re.search(r'20\d{2}', c)[0]) for c in header[1:]]
    result={str(year): {'holidays':[], 'early_closes':[]} for year in years}
    for row in rows:
        if len(row)!=len(header) or row==header: continue
        for year, cell in zip(years,row[1:]):
            match=re.search(r'(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})',cell)
            if match:
                date=datetime.strptime(f'{year} {match[1]} {match[2]}','%Y %B %d').date().isoformat()
                result[str(year)]['holidays'].append({'date':date,'name':row[0].strip()})
    text=' '.join(parser.text)
    for section in re.findall(r'Each market will close early at 1:00 p\.m\..*?(?:All times are Eastern Time\.|</)',text,re.S):
        for month,day,year in re.findall(r'(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s*(20\d{2})',section):
            if year in result:
                date=datetime.strptime(f'{year} {month} {day}','%Y %B %d').date().isoformat()
                result[year]['early_closes'].append({'date':date,'close':'13:00','late_close':'17:00'})
    for year, data in result.items():
        data['early_closes']=list({r['date']:r for r in data['early_closes']}.values())
        if len(data['holidays'])<9 or not data['early_closes']: raise ValueError(f'Incomplete NYSE calendar: {year}')
    return result

if __name__=='__main__':
    html=urllib.request.urlopen(SOURCE,timeout=30).read().decode()
    payload={'source':SOURCE,'retrieved_at':datetime.now(timezone.utc).isoformat(),'years':parse(html)}
    target=Path(__file__).resolve().parents[2]/'frontend/src/lib/nyse-calendar.json'
    target.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n')
