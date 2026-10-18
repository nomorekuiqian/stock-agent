import type { MarketData, MorningReport } from '@/lib/api';
import { StockLinkedText } from './StockLinkedText';
type Quote = { name: string; value: number; change_percent?: number; change_unit?: string };
const groups = [
  { label: '标普 500', pattern: /s&p|标普/i },
  { label: '纳斯达克', pattern: /nasdaq|nas|nq|纳斯达克/i },
  { label: '道琼斯', pattern: /dow|道琼斯/i },
  { label: 'VIX', pattern: /vix/i },
  { label: '10 年美债收益率', pattern: /10y|10.year|10年/i },
  { label: '美元指数', pattern: /dollar|dxy|美元/i },
  { label: '原油', pattern: /oil|crude|brent|wti|原油/i },
];
function change(quote?: Quote) {
  const value = quote?.change_percent;
  if (typeof value !== 'number' || !Number.isFinite(value)) return '涨跌未提供';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}${quote?.change_unit === 'bps' ? ' bp' : '%'}`;
}
export function MarketSummary({ daily, morning }: { daily?: MarketData; morning?: MorningReport }) {
  const report = daily || morning;
  if (!report) return null;
  // Morning summaries use public numeric snapshots only, never gated narrative.
  const quotes: Quote[] = daily?.indices || [
    ...(morning?.futures || []), ...(morning?.global_markets?.other || []),
  ].map(quote => ({ ...quote, change_percent: quote.daily_change }));
  const values = groups.map(group => ({ ...group, quote: quotes.find(quote => group.pattern.test(quote.name)) }));
  const describe = (indices: number[]) => indices.map(i => `${values[i].label}：${values[i].quote ? change(values[i].quote) : '本期未提供'}`).join('；');
  const points = morning?.public_event_points?.slice(0,3).map(item=>item.title) || daily?.news?.headlines?.slice(0, 3).map(item => item.title) || [];
  const fallbacks = [describe([0, 1, 2]), describe([3, 4]), describe([5, 6])];
  while (!morning && points.length < 3) points.push(fallbacks[points.length]);
  return <section aria-label="市场摘要" className="my-6 rounded-xl border border-border/40 bg-card/50 p-5 space-y-4">
    <h2 className="text-lg font-medium">{morning ? '盘前' : '收盘'}市场摘要 · {report.report_date}</h2>
    <p className="text-xs text-muted-foreground">本期快照，非实时行情；{morning ? '指数为股指期货。' : '指数为现货指数。'}生成时间：<time dateTime={report.timestamp}>{report.timestamp}</time></p>
    <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">{values.map(({ label, quote }) => <div key={label}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-data text-sm">{quote && Number.isFinite(quote.value) ? `${quote.value.toLocaleString('en-US', { maximumFractionDigits: 2 })}${label.includes('收益率') ? '%' : ''}（${change(quote)}）` : '本期未提供'}</dd>
    </div>)}</dl>
    <h3 className="font-medium text-sm">事件要点</h3>
    <ol className="list-decimal pl-5 space-y-2 text-sm leading-6">{points.map((point, i) => <li key={i}><StockLinkedText text={point} /></li>)}</ol>
  </section>;
}
