import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from './query-keys';

const DISCUSSION_WINDOW_HOURS = 24;
const DISCUSSION_LIMIT = 200;

export function useTwitterTickerDiscussion(
  symbol?: string,
  enabled: boolean = true,
) {
  const normalizedSymbol = (symbol || '').trim().toUpperCase();

  return useQuery({
    queryKey: queryKeys.twitter.tickerDiscussion(
      normalizedSymbol,
      DISCUSSION_WINDOW_HOURS,
      DISCUSSION_LIMIT,
    ),
    queryFn: () =>
      api.getTwitterTickerDiscussion(
        normalizedSymbol,
        DISCUSSION_WINDOW_HOURS,
        DISCUSSION_LIMIT,
      ),
    enabled: enabled && Boolean(normalizedSymbol),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}
