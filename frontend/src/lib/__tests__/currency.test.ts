import { describe, expect, it } from 'vitest';
import {
  formatStockPrice,
  getCurrency,
  inferCurrencyCodeFromSymbol,
  resolveCurrency,
} from '../currency';

describe('currency utilities', () => {
  it('infers local currencies from common market suffixes', () => {
    expect(inferCurrencyCodeFromSymbol('7203.T')).toBe('JPY');
    expect(inferCurrencyCodeFromSymbol('005930.KS')).toBe('KRW');
    expect(inferCurrencyCodeFromSymbol('600519.SS')).toBe('CNY');
    expect(inferCurrencyCodeFromSymbol('000001.SZ')).toBe('CNY');
    expect(inferCurrencyCodeFromSymbol('0700.HK')).toBe('HKD');
  });

  it('keeps cash and US tickers in USD', () => {
    expect(getCurrency('$CASH').code).toBe('USD');
    expect(getCurrency('AAPL').code).toBe('USD');
  });

  it('uses explicit currency before symbol inference', () => {
    expect(resolveCurrency('7203.T', 'USD').code).toBe('USD');
    expect(formatStockPrice(1234, '7203.T', 'USD')).toBe('$1,234.00');
  });

  it('formats zero-decimal Asian currencies without cents', () => {
    expect(formatStockPrice(1234, '7203.T')).toBe('¥1,234');
    expect(formatStockPrice(70000, '005930.KS')).toBe('₩70,000');
  });

  it('uses ISO currency codes for dense Asian stock price surfaces', () => {
    expect(formatStockPrice(193500, '005935.KS', undefined, { compactPrice: true })).toBe('KRW 193,500');
    expect(formatStockPrice(46800, '005935.KS', undefined, { compactPrice: true })).toBe('KRW 46,800');
    expect(formatStockPrice(2752, '7203.T', undefined, { compactPrice: true })).toBe('JPY 2,752');
    expect(formatStockPrice(11.31, '000001.SZ', undefined, { compactPrice: true })).toBe('CNY 11.31');
  });

  it('formats CNY and HKD with market-specific symbols', () => {
    expect(formatStockPrice(123.45, '600519.SS')).toBe('CN¥123.45');
    expect(formatStockPrice(50.25, '0700.HK')).toBe('HK$50.25');
  });
});
