export interface CurrencyInfo {
  code: string;
  symbol: string;
  zeroDecimal: boolean;
}

interface FormatCurrencyAmountOptions {
  currency?: string | null;
  symbol?: string;
  compact?: boolean;
  compactPrice?: boolean;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
}

const ZERO_DECIMAL_CURRENCIES = new Set([
  'BIF',
  'CLP',
  'DJF',
  'GNF',
  'ISK',
  'JPY',
  'KMF',
  'KRW',
  'PYG',
  'RWF',
  'UGX',
  'VND',
  'VUV',
  'XAF',
  'XOF',
  'XPF',
]);

const MARKET_CURRENCY_BY_SUFFIX: Record<string, string> = {
  '.HK': 'HKD',
  '.T': 'JPY',
  '.KS': 'KRW',
  '.KQ': 'KRW',
  '.SS': 'CNY',
  '.SZ': 'CNY',
  '.TW': 'TWD',
  '.TWO': 'TWD',
  '.NS': 'INR',
  '.BO': 'INR',
  '.TO': 'CAD',
  '.V': 'CAD',
  '.AX': 'AUD',
  '.L': 'GBP',
  '.PA': 'EUR',
  '.DE': 'EUR',
  '.AS': 'EUR',
  '.BR': 'EUR',
  '.MI': 'EUR',
  '.MC': 'EUR',
  '.IR': 'EUR',
  '.SW': 'CHF',
  '.ST': 'SEK',
  '.OL': 'NOK',
  '.CO': 'DKK',
  '.HE': 'EUR',
  '.SA': 'BRL',
  '.MX': 'MXN',
  '.JO': 'ZAR',
};

function normalizeStockSymbol(stockSymbol: string): string {
  const raw = (stockSymbol || '').trim().toUpperCase();
  if (!raw) return raw;
  return raw.includes(':') ? raw.split(':').pop() || raw : raw;
}

function normalizeCurrencyCode(currency?: string | null): string | null {
  const code = currency?.trim().toUpperCase();
  return code && /^[A-Z]{3}$/.test(code) ? code : null;
}

export function getCurrencySymbol(currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency })
      .formatToParts(0)
      .find((part) => part.type === 'currency')?.value || currency;
  } catch {
    return currency;
  }
}

export function getCurrencyInfo(currency: string): CurrencyInfo {
  const code = normalizeCurrencyCode(currency) || 'USD';
  return {
    code,
    symbol: getCurrencySymbol(code),
    zeroDecimal: ZERO_DECIMAL_CURRENCIES.has(code),
  };
}

export function inferCurrencyCodeFromSymbol(stockSymbol: string): string {
  const symbol = normalizeStockSymbol(stockSymbol);
  if (symbol === '$CASH') return 'USD';

  for (const [suffix, currency] of Object.entries(MARKET_CURRENCY_BY_SUFFIX)) {
    if (symbol.endsWith(suffix)) return currency;
  }

  // Bare numeric tickers in this app are normally Japanese 4-digit tickers
  // such as 7709. Six-digit bare tickers are more commonly China A-shares.
  if (/^\d{4}$/.test(symbol)) return 'JPY';
  if (/^\d{6}$/.test(symbol)) return 'CNY';

  return 'USD';
}

export function getCurrency(stockSymbol: string): CurrencyInfo {
  return getCurrencyInfo(inferCurrencyCodeFromSymbol(stockSymbol));
}

export function resolveCurrency(stockSymbol: string, explicitCurrency?: string | null): CurrencyInfo {
  const code = normalizeCurrencyCode(explicitCurrency);
  return code ? getCurrencyInfo(code) : getCurrency(stockSymbol);
}

export function formatAmount(amount: number, currency: CurrencyInfo): string {
  return formatCurrencyAmount(amount, {
    currency: currency.code,
    maximumFractionDigits: 0,
  });
}

export function formatCurrencyAmount(
  amount: number | null | undefined,
  options: FormatCurrencyAmountOptions = {},
): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return '--';

  const currency = options.symbol
    ? resolveCurrency(options.symbol, options.currency)
    : getCurrencyInfo(options.currency || 'USD');
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);

  if (options.compactPrice) {
    const localizedPrice = formatLocalizedStockPrice(abs, currency);
    if (localizedPrice) return `${sign}${localizedPrice}`;
  }

  if (options.compact) {
    const compactDigits = currency.zeroDecimal ? 1 : 2;
    if (abs >= 1e12) return `${sign}${currency.symbol}${(abs / 1e12).toFixed(compactDigits)}T`;
    if (abs >= 1e9) return `${sign}${currency.symbol}${(abs / 1e9).toFixed(compactDigits)}B`;
    if (abs >= 1e6) return `${sign}${currency.symbol}${(abs / 1e6).toFixed(compactDigits)}M`;
  }

  const maximumFractionDigits = currency.zeroDecimal
    ? 0
    : options.maximumFractionDigits ?? 2;
  const minimumFractionDigits = currency.zeroDecimal
    ? 0
    : Math.min(options.minimumFractionDigits ?? Math.min(2, maximumFractionDigits), maximumFractionDigits);

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.code,
      minimumFractionDigits,
      maximumFractionDigits,
    }).format(amount);
  } catch {
    return `${sign}${currency.symbol}${abs.toLocaleString('en-US', {
      minimumFractionDigits,
      maximumFractionDigits,
    })}`;
  }
}

export function formatStockPrice(
  amount: number | null | undefined,
  stockSymbol: string,
  explicitCurrency?: string | null,
  options: Omit<FormatCurrencyAmountOptions, 'symbol' | 'currency'> = {},
): string {
  return formatCurrencyAmount(amount, {
    ...options,
    symbol: stockSymbol,
    currency: explicitCurrency,
  });
}

function formatLocalizedStockPrice(abs: number, currency: CurrencyInfo): string | null {
  if (currency.code === 'KRW' || currency.code === 'JPY' || currency.code === 'CNY') {
    return `${currency.code} ${abs.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: currency.zeroDecimal ? 0 : 2,
    })}`;
  }
  return null;
}
