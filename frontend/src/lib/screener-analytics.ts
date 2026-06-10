'use client';

import type { ResearchResult } from '@/lib/api';
import { trackProductEvent } from '@/lib/product-analytics';

type ScreenerFilter = { field: string; op: string; value: unknown };

function isScreenerFilter(value: unknown): value is ScreenerFilter {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Partial<ScreenerFilter>).field === 'string' &&
    typeof (value as Partial<ScreenerFilter>).op === 'string'
  );
}

function summarizeFilters(filters: unknown[] | undefined): ScreenerFilter[] {
  return (filters ?? []).filter(isScreenerFilter);
}

export function trackScreenerFilterUsed(params: {
  result: ResearchResult;
  queryLength: number;
  conversationId?: string | null;
}): void {
  const filters = summarizeFilters(params.result.accumulated_filters);
  if (filters.length === 0) return;

  trackProductEvent('screener_filter_used', {
    source: 'research_chat',
    filter_count: filters.length,
    filter_fields: [...new Set(filters.map((filter) => filter.field))],
    filter_operators: [...new Set(filters.map((filter) => filter.op))],
    candidate_count: params.result.candidate_count,
    universe_size: params.result.universe_size,
    has_recommendations: params.result.recommendations.length > 0,
    has_candidates: params.result.candidates.length > 0,
    query_length: params.queryLength,
    conversation_id: params.conversationId ?? undefined,
  });
}
