import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResearchResult } from '@/lib/api';
import { trackProductEvent } from '@/lib/product-analytics';
import { trackScreenerFilterUsed } from '../screener-analytics';

vi.mock('@/lib/product-analytics', () => ({
  trackProductEvent: vi.fn(),
}));

const productTrack = vi.mocked(trackProductEvent);

function makeResult(overrides: Partial<ResearchResult> = {}): ResearchResult {
  return {
    success: true,
    message: 'ok',
    options: [],
    candidates: [{ symbol: 'AAPL' }],
    candidate_count: 1,
    universe_size: 100,
    recommendations: [],
    accumulated_filters: [],
    reset_results: false,
    title: '',
    data_freshness: null,
    is_stale: false,
    ...overrides,
  };
}

describe('screener analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('tracks applied screener filters without sending raw values', () => {
    trackScreenerFilterUsed({
      result: makeResult({
        accumulated_filters: [
          { field: 'pe_ttm', op: 'lt', value: 20 },
          { field: 'roe', op: 'gt', value: 15 },
          { field: 'roe', op: 'gt', value: 12 },
        ],
        recommendations: [{ symbol: 'AAPL', reason: 'quality' }],
      }),
      queryLength: 24,
      conversationId: 'conv-1',
    });

    expect(productTrack).toHaveBeenCalledWith('screener_filter_used', {
      source: 'research_chat',
      filter_count: 3,
      filter_fields: ['pe_ttm', 'roe'],
      filter_operators: ['lt', 'gt'],
      candidate_count: 1,
      universe_size: 100,
      has_recommendations: true,
      has_candidates: true,
      query_length: 24,
      conversation_id: 'conv-1',
    });
  });

  it('does not track when the agent response has no applied filters', () => {
    trackScreenerFilterUsed({
      result: makeResult(),
      queryLength: 10,
    });

    expect(productTrack).not.toHaveBeenCalled();
  });
});
