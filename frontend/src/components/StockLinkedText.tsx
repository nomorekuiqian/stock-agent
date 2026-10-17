import Link from 'next/link';
import { STOCK_NAMES } from '@/lib/stock-names';
// Bare AI/IT-like words and single letters are ambiguous; require $ or parentheses.
const ambiguous = new Set(['AI', 'IT', 'ON', 'ALL', 'NOW', 'ARM', 'NET', 'CAT', 'F', 'C', 'V', 'A']);
export function StockLinkedText({ text }: { text?: string }) {
  if (!text) return null;
  return text.split(/(\$[A-Z]{1,5}(?:\.[A-Z])?|\([A-Z]{1,5}(?:\.[A-Z])?\)|\b[A-Z]{2,5}(?:\.[A-Z])?\b)/g).map((part, i) => {
    const symbol = part.replace(/^[$(]|\)$/g, '');
    const explicit = part.startsWith('$') || part.startsWith('(');
    return STOCK_NAMES[symbol] && (explicit || !ambiguous.has(symbol))
      ? <Link prefetch={false} key={i} href={`/stock/${symbol}`} className="text-primary hover:underline">{part}</Link>
      : part;
  });
}
