export interface CurrencyInfo {
  code: string;
  symbol: string;
}

export function getCurrency(stockSymbol: string): CurrencyInfo {
  if (stockSymbol === '$CASH') return { code: 'USD', symbol: '$' };
  if (/^\d+$/.test(stockSymbol)) return { code: 'JPY', symbol: '¥' };
  if (stockSymbol.endsWith('.HK')) return { code: 'HKD', symbol: 'HK$' };
  return { code: 'USD', symbol: '$' };
}

export function formatAmount(amount: number, currency: CurrencyInfo): string {
  return `${currency.symbol}${amount.toLocaleString()}`;
}
