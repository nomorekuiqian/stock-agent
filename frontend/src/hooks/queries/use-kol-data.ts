import { useQuery } from '@tanstack/react-query';

import { api, type KolCockpitFeedOpts } from '@/lib/api';
import { queryKeys } from './query-keys';

/**
 * Shared TanStack Query hooks for KOL persona pages. Same query keys across
 * layout + sub-pages let TanStack Query serve cached data instantly on
 * navigation. Default cache windows (5 min stale / 30 min gc) come from
 * `query-client.ts` and fit how often Frank's data actually changes.
 */

const ENABLED = (username: string | null | undefined) => Boolean(username);

export function useKolCockpitProfile(username: string) {
  return useQuery({
    queryKey: queryKeys.kol.profile(username),
    queryFn: () => api.kolResearch.cockpitProfile(username),
    enabled: ENABLED(username),
  });
}

export function useKolCockpitTickers(username: string) {
  return useQuery({
    queryKey: queryKeys.kol.tickers(username),
    queryFn: () => api.kolResearch.cockpitTickers(username),
    enabled: ENABLED(username),
  });
}

export function useKolCockpitFeed(username: string, opts: KolCockpitFeedOpts = {}) {
  const sector = opts.sector ?? null;
  const ticker = opts.ticker ?? null;
  const topic = opts.topic ?? null;
  const limit = opts.limit ?? 20;
  const offset = opts.offset ?? 0;
  return useQuery({
    queryKey: queryKeys.kol.feed(username, sector, ticker, limit, offset, topic),
    queryFn: () => api.kolResearch.cockpitFeed(username, opts),
    enabled: ENABLED(username),
  });
}

export function useKolCockpitTopics(username: string) {
  return useQuery({
    queryKey: queryKeys.kol.topics(username),
    queryFn: () => api.kolResearch.cockpitTopics(username),
    enabled: ENABLED(username),
  });
}

export function useKolCockpitSectors(username: string) {
  return useQuery({
    queryKey: queryKeys.kol.sectors(username),
    queryFn: () => api.kolResearch.cockpitSectors(username),
    enabled: ENABLED(username),
  });
}

export function useKolCockpitSector(username: string, sectorKey: string | null) {
  return useQuery({
    queryKey: queryKeys.kol.sectorDetail(username, sectorKey ?? ''),
    queryFn: () => api.kolResearch.cockpitSector(username, sectorKey!),
    enabled: ENABLED(username) && Boolean(sectorKey),
  });
}

export function useKolIndustryChain(username: string, boardKey: string) {
  return useQuery({
    queryKey: queryKeys.kol.industryChain(username, boardKey),
    queryFn: () => api.kolResearch.cockpitIndustryChain(username, boardKey),
    enabled: ENABLED(username) && Boolean(boardKey),
  });
}

export function useKolTickerDetail(username: string, ticker: string | null) {
  return useQuery({
    queryKey: queryKeys.kol.tickerDetail(username, ticker ?? ''),
    queryFn: () => api.kolResearch.cockpitTickerDetail(username, ticker!),
    enabled: ENABLED(username) && Boolean(ticker),
  });
}

export function useKolTickerTimeline(username: string, ticker: string | null) {
  return useQuery({
    queryKey: queryKeys.kol.tickerTimeline(username, ticker ?? ''),
    queryFn: () => api.kolResearch.cockpitTickerTimeline(username, ticker!),
    enabled: ENABLED(username) && Boolean(ticker),
  });
}

export function useKolEvidenceTweets(username: string, ids: string[]) {
  const stableIds = ids.filter(Boolean);
  return useQuery({
    queryKey: queryKeys.kol.evidenceTweets(username, stableIds),
    queryFn: () => api.kolResearch.cockpitTweetsByIds(username, stableIds),
    enabled: ENABLED(username) && stableIds.length > 0,
  });
}

export function useKolCockpitHighConviction(username: string) {
  return useQuery({
    queryKey: queryKeys.kol.highConviction(username),
    queryFn: () => api.kolResearch.cockpitHighConviction(username),
    enabled: ENABLED(username),
  });
}
