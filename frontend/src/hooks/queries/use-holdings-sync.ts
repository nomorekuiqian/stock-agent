'use client';

/**
 * Track M holdings_sync hooks — extract (screenshot/paste/csv/pdf) +
 * commit (replace-by-source). Mirrors `useSavePortfolio`'s invalidation
 * set (portfolio + digests) so the rest of the app sees the new state.
 *
 * Stage 1 ships screenshot only; paste/csv/pdf adapters land in M3/M4.
 * The backend enforces the stage gate — the UI just shows the tile as
 * "即将上线" disabled, but the wrong mode would 400 anyway.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  api,
  HoldingsSyncCommitRequest,
  HoldingsSyncCommitResponse,
  HoldingsSyncExtractDraft,
  HoldingsSyncSource,
} from '@/lib/api';

import { queryKeys } from './query-keys';

export function useHoldingsSyncExtract() {
  return useMutation<HoldingsSyncExtractDraft, Error, { mode: HoldingsSyncSource; file: File }>({
    mutationFn: ({ mode, file }) => api.holdingsSync.extract(mode, file),
  });
}

export function useHoldingsSyncCommit(userId?: string) {
  const queryClient = useQueryClient();
  return useMutation<HoldingsSyncCommitResponse, Error, HoldingsSyncCommitRequest>({
    mutationFn: (payload) => api.holdingsSync.commit(payload),
    onSettled: () => {
      // Mirror useSavePortfolio's invalidation set so the rest of the
      // app (portfolio table, digests, health) sees the new state.
      if (userId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.portfolio.byUser(userId) });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.digests.all });
    },
  });
}
