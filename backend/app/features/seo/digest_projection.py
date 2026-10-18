"""License-aware, bounded projections from stored digest summaries, never raw tweets."""
from collections import Counter
import re
from .policy import license_status, public_text


def digest_rows(digests):
    rows = {}
    for digest in digests:
        for thesis in digest.get('ticker_theses') or []:
            for group, stance in [('buy_arguments','bull'),('sell_arguments','bear'),('observation_arguments','neutral')]:
                for argument in thesis.get(group) or []:
                    author = str(argument.get('kol') or '').lower().lstrip('@')
                    if license_status(author) == 'prohibited':
                        continue
                    summary = public_text(argument.get('point_zh'),60)
                    url = argument.get('tweet_url') or ''
                    if re.search(r'加密|比特币|以太坊|币价|稳定币|\b(?:BTC|ETH|crypto)\b', summary, re.I):
                        continue
                    if not summary or not url.startswith(('https://x.com/', 'https://twitter.com/')):
                        continue
                    key = (url, thesis['ticker'])
                    rows[key] = {'id':url.rsplit('/',1)[-1], 'username':author, 'date':digest['date'], 'summary':summary, 'url':url, 'tickers':[thesis['ticker']], 'stances':[{'ticker':thesis['ticker'],'stance':stance}], 'source_ids':[f"digest:{digest['date']}:{thesis['ticker']}"]}
    return sorted(rows.values(), key=lambda r:r['date'], reverse=True)


def discussion(rows, symbol):
    selected = [row for row in rows if symbol in row['tickers']]
    authors = set(row['username'] for row in selected)
    counts = Counter(row['stances'][0]['stance'] for row in selected)
    stats = {'n_kol':len(authors), 'n_posts':len({r['url'] for r in selected}), 'bull':counts['bull'], 'bear':counts['bear'], 'disputed':0}
    dates = {r['date'] for r in selected}
    stats['disputed'] = sum({'bull','bear'} <= {r['stances'][0]['stance'] for r in selected if r['date']==date} for date in dates)
    return {'rows':selected[:10] if len(authors)>=2 else [], 'stats':stats}
