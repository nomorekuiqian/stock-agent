import { describe, it, expect } from 'vitest';
import { userDigestToResponse, getStatusColor } from '../digest-utils';
import type { UserDigestItem } from '../api';

// ---------------------------------------------------------------------------
// userDigestToResponse
// ---------------------------------------------------------------------------
describe('userDigestToResponse', () => {
  const baseItem: UserDigestItem = {
    user_id: 'user-1',
    digest_date: '2026-03-15',
    symbols: ['AAPL', 'GOOGL'],
    analysis: 'Test analysis content',
    greeting: 'Good morning',
    one_line_summary: 'Markets are up',
    created_at: '2026-03-15T08:00:00Z',
    digest_data: {
      stocks: [
        {
          symbol: 'AAPL',
          name: 'Apple Inc.',
          price: 195.5,
          daily_change: '+1.2%',
          week_change: '+3.5%',
          status: 'strong',
          quick_take: 'Bullish momentum',
        },
      ],
      news: {
        headlines: [],
        briefs: [],
      },
      events: [],
      summary: { content: 'Summary content' },
    },
  };

  it('maps all fields correctly from a complete item', () => {
    const result = userDigestToResponse(baseItem);
    expect(result.success).toBe(true);
    expect(result.timestamp).toBe('2026-03-15T08:00:00Z');
    expect(result.symbols_used).toEqual(['AAPL', 'GOOGL']);
    expect(result.greeting).toBe('Good morning');
    expect(result.one_line_summary).toBe('Markets are up');
    expect(result.stocks).toHaveLength(1);
    expect(result.stocks[0].symbol).toBe('AAPL');
    expect(result.summary.content).toBe('Summary content');
  });

  it('handles missing digest_data gracefully', () => {
    const item: UserDigestItem = {
      ...baseItem,
      digest_data: undefined,
    };
    const result = userDigestToResponse(item);
    expect(result.stocks).toEqual([]);
    expect(result.news).toEqual({ headlines: [], briefs: [] });
    expect(result.events).toEqual([]);
  });

  it('handles missing optional fields', () => {
    const item: UserDigestItem = {
      user_id: 'user-1',
      digest_date: '2026-03-15',
      symbols: [],
      analysis: '',
    };
    const result = userDigestToResponse(item);
    expect(result.greeting).toBe('');
    expect(result.one_line_summary).toBe('');
    expect(result.timestamp).toBe('');
  });

  it('falls back to bottom_line for summary.content', () => {
    const item: UserDigestItem = {
      ...baseItem,
      digest_data: {},
      bottom_line: 'Bottom line text',
    };
    const result = userDigestToResponse(item);
    expect(result.summary.content).toBe('Bottom line text');
  });

  it('falls back to analysis when bottom_line is missing', () => {
    const item: UserDigestItem = {
      ...baseItem,
      digest_data: {},
      bottom_line: undefined,
      analysis: 'Analysis fallback',
    };
    const result = userDigestToResponse(item);
    expect(result.summary.content).toBe('Analysis fallback');
  });
});

// ---------------------------------------------------------------------------
// getStatusColor
// ---------------------------------------------------------------------------
describe('getStatusColor', () => {
  it('returns emerald classes for "up" status', () => {
    expect(getStatusColor('up')).toContain('emerald');
  });

  it('returns emerald classes for "strong" status', () => {
    expect(getStatusColor('strong')).toContain('emerald');
  });

  it('returns emerald classes for "rise" status', () => {
    expect(getStatusColor('sharp rise')).toContain('emerald');
  });

  it('returns red classes for "down" status', () => {
    expect(getStatusColor('down')).toContain('red');
  });

  it('returns red classes for "weak" status', () => {
    expect(getStatusColor('weak')).toContain('red');
  });

  it('returns red classes for "fall" status', () => {
    expect(getStatusColor('sharp fall')).toContain('red');
  });

  it('returns neutral classes for unrecognized status', () => {
    const result = getStatusColor('stable');
    expect(result).toContain('text-muted-foreground');
    expect(result).toContain('bg-card');
  });
});
