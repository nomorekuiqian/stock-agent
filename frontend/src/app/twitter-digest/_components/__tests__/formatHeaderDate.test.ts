import { describe, expect, it } from 'vitest';
import { formatHeaderDate } from '../formatHeaderDate';

describe('formatHeaderDate', () => {
  it.each([
    ['2026-10-17', '2026 年 10 月 17 日 · 星期六'],
    ['2026-03-08', '2026 年 3 月 8 日 · 星期日'],
    ['2026-11-01', '2026 年 11 月 1 日 · 星期日'],
    ['2027-01-01', '2027 年 1 月 1 日 · 星期五'],
  ])('keeps the market date and weekday for %s in any reader timezone', (date, expected) => {
    expect(formatHeaderDate(date)).toBe(expected);
  });

  it.each(['', 'unknown', '2026-10-17T00:00:00Z'])('preserves unsupported input %s', (date) => {
    expect(formatHeaderDate(date)).toBe(date);
  });
});
