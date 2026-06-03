import { describe, expect, it } from 'vitest';

import { getHistoryFetchDays, resolveHistoryData } from '../HistoryAreaChart';

describe('getHistoryFetchDays', () => {
  it('fetches a short padded window for compact dashboard charts', () => {
    expect(getHistoryFetchDays('6M')).toBe(207);
    expect(getHistoryFetchDays('1Y')).toBe(420);
  });

  it('keeps enough history for very short ranges and caps long ranges', () => {
    expect(getHistoryFetchDays('1M')).toBe(180);
    expect(getHistoryFetchDays('ALL')).toBe(1825);
  });
});

describe('resolveHistoryData', () => {
  it('uses primary data when available', () => {
    const primary = [{ date: '2026-01-02', close: 2 }];
    const fallback = [{ date: '2026-01-01', close: 1 }];

    expect(resolveHistoryData(primary, fallback)).toBe(primary);
  });

  it('falls back when primary data is empty', () => {
    const fallback = [{ date: '2026-01-01', close: 1 }];

    expect(resolveHistoryData([], fallback)).toBe(fallback);
  });
});
