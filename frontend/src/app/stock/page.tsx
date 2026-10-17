import Link from 'next/link';
import StockSearchPage from './StockSearchPage';
import { STOCK_SECTORS } from '@/lib/stock-directory';
import { STOCK_NAMES } from '@/lib/stock-names';
export default function StockPage() {
  return <><StockSearchPage /><section className="mx-auto max-w-5xl px-4 py-10 md:px-6" aria-labelledby="directory-title">
    <h2 id="directory-title" className="text-2xl font-editorial">按板块浏览股票</h2>
    <p className="mt-2 text-sm text-muted-foreground">当前研究目录中的全部股票；其他标的可通过上方搜索查找。</p>
    <div className="mt-6 grid gap-6 sm:grid-cols-2">{STOCK_SECTORS.map(group => <section key={group.name}>
      <h3 className="mb-3 font-medium">{group.name}</h3>
      <ul className="flex flex-wrap gap-3">{group.symbols.map(symbol => <li key={symbol}><Link prefetch={false} className="text-sm text-primary hover:underline" href={`/stock/${symbol}`}>{symbol} {STOCK_NAMES[symbol]?.zh}</Link></li>)}</ul>
    </section>)}</div>
  </section></>;
}
