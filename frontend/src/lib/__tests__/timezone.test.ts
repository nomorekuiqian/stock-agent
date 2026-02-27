import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  marketTodayStr,
  isMarketToday,
  formatTimestamp,
  formatTime,
  formatReportDate,
  formatDateShort,
  formatRelativeTime,
  formatCompareDateLabel,
  formatCalendarDate,
} from '../timezone';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setSystemTime(date: Date | string) {
  vi.setSystemTime(new Date(date));
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// marketTodayStr
// ---------------------------------------------------------------------------
describe('marketTodayStr', () => {
  it('returns YYYY-MM-DD format', () => {
    setSystemTime('2026-03-15T12:00:00Z');
    const result = marketTodayStr();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('uses New York timezone for date boundary', () => {
    // 2026-03-15 23:00 UTC = 2026-03-15 19:00 ET (same day)
    setSystemTime('2026-03-15T23:00:00Z');
    const result = marketTodayStr();
    expect(result).toBe('2026-03-15');
  });
});

// ---------------------------------------------------------------------------
// isMarketToday
// ---------------------------------------------------------------------------
describe('isMarketToday', () => {
  it('returns true for today in market timezone', () => {
    setSystemTime('2026-03-15T12:00:00Z');
    const today = marketTodayStr();
    expect(isMarketToday(today)).toBe(true);
  });

  it('returns false for a past date', () => {
    setSystemTime('2026-03-15T12:00:00Z');
    expect(isMarketToday('2026-03-14')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// formatTimestamp
// ---------------------------------------------------------------------------
describe('formatTimestamp', () => {
  it('returns empty string for null', () => {
    expect(formatTimestamp(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(formatTimestamp(undefined)).toBe('');
  });

  it('formats a valid UTC timestamp to zh-CN locale', () => {
    const result = formatTimestamp('2026-03-15T08:30:00Z');
    // Should contain year, month, day, and time components
    expect(result).toBeTruthy();
    expect(result.length).toBeGreaterThan(5);
  });
});

// ---------------------------------------------------------------------------
// formatTime
// ---------------------------------------------------------------------------
describe('formatTime', () => {
  it('returns empty string for null', () => {
    expect(formatTime(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(formatTime(undefined)).toBe('');
  });

  it('formats a valid UTC timestamp to HH:MM format', () => {
    const result = formatTime('2026-03-15T08:30:00Z');
    // Should be a time string like "16:30" or "04:30" depending on timezone
    expect(result).toMatch(/\d{2}:\d{2}/);
  });
});

// ---------------------------------------------------------------------------
// formatReportDate
// ---------------------------------------------------------------------------
describe('formatReportDate', () => {
  it('returns empty string for null', () => {
    expect(formatReportDate(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(formatReportDate(undefined)).toBe('');
  });

  it('formats YYYY-MM-DD to zh-CN with weekday', () => {
    const result = formatReportDate('2026-03-15');
    // zh-CN format includes year, month, day and weekday
    expect(result).toContain('2026');
    expect(result).toContain('3');
    expect(result).toContain('15');
  });
});

// ---------------------------------------------------------------------------
// formatDateShort
// ---------------------------------------------------------------------------
describe('formatDateShort', () => {
  it('returns empty string for null', () => {
    expect(formatDateShort(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(formatDateShort(undefined)).toBe('');
  });

  it('formats to month + day in zh-CN (e.g. "3月15日")', () => {
    const result = formatDateShort('2026-03-15');
    expect(result).toContain('3');
    expect(result).toContain('15');
  });
});

// ---------------------------------------------------------------------------
// formatRelativeTime
// ---------------------------------------------------------------------------
describe('formatRelativeTime', () => {
  it('returns empty string for null', () => {
    expect(formatRelativeTime(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(formatRelativeTime(undefined)).toBe('');
  });

  it('returns "刚刚" for just now', () => {
    setSystemTime('2026-03-15T12:00:00Z');
    expect(formatRelativeTime('2026-03-15T12:00:00Z')).toBe('刚刚');
  });

  it('returns minutes for recent time', () => {
    setSystemTime('2026-03-15T12:05:00Z');
    expect(formatRelativeTime('2026-03-15T12:00:00Z')).toBe('5分钟前');
  });

  it('returns hours for same-day time', () => {
    setSystemTime('2026-03-15T15:00:00Z');
    expect(formatRelativeTime('2026-03-15T12:00:00Z')).toBe('3小时前');
  });

  it('returns days for recent past', () => {
    setSystemTime('2026-03-15T12:00:00Z');
    expect(formatRelativeTime('2026-03-13T12:00:00Z')).toBe('2天前');
  });

  it('returns formatted date for >= 7 days', () => {
    setSystemTime('2026-03-22T12:00:00Z');
    const result = formatRelativeTime('2026-03-10T12:00:00Z');
    // Should fall back to formatDateShort
    expect(result).toContain('3');
    expect(result).toContain('10');
  });
});

// ---------------------------------------------------------------------------
// formatCompareDateLabel
// ---------------------------------------------------------------------------
describe('formatCompareDateLabel', () => {
  it('returns empty string for null', () => {
    expect(formatCompareDateLabel(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(formatCompareDateLabel(undefined)).toBe('');
  });

  it('returns "较昨天" for 1 day ago', () => {
    setSystemTime('2026-03-15T12:00:00Z');
    expect(formatCompareDateLabel('2026-03-14T12:00:00Z')).toBe('较昨天');
  });

  it('returns "较3天前" for 2-3 days ago', () => {
    setSystemTime('2026-03-15T12:00:00Z');
    expect(formatCompareDateLabel('2026-03-12T12:00:00Z')).toBe('较3天前');
  });

  it('returns "较上周" for 4-7 days ago', () => {
    setSystemTime('2026-03-15T12:00:00Z');
    expect(formatCompareDateLabel('2026-03-10T12:00:00Z')).toBe('较上周');
  });

  it('accepts Date objects', () => {
    setSystemTime('2026-03-15T12:00:00Z');
    const date = new Date('2026-03-14T12:00:00Z');
    expect(formatCompareDateLabel(date)).toBe('较昨天');
  });
});

// ---------------------------------------------------------------------------
// formatCalendarDate
// ---------------------------------------------------------------------------
describe('formatCalendarDate', () => {
  it('parses YYYY-MM-DD string correctly', () => {
    const result = formatCalendarDate('2026-03-15');
    expect(result.month).toBe('Mar');
    expect(result.day).toBe(15);
    expect(result.weekday).toBe('Sun');
  });

  it('parses ISO datetime string', () => {
    const result = formatCalendarDate('2026-03-15T08:30:00Z');
    expect(result.month).toBeTruthy();
    expect(result.day).toBeGreaterThan(0);
    expect(result.weekday).toBeTruthy();
  });

  it('accepts Date objects', () => {
    const date = new Date(2026, 2, 15); // March 15, 2026
    const result = formatCalendarDate(date);
    expect(result.month).toBe('Mar');
    expect(result.day).toBe(15);
  });
});
