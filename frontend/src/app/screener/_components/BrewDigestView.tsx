'use client';

import { useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useDigestList, useDigestById } from '@/hooks/queries/use-digest-data';
import { userDigestToResponse } from '@/lib/digest-utils';
import DigestInlineReport from '@/components/for-you/DigestInlineReport';
import type { StockAnalysis, DigestNewsSection, DigestEvent } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Data payload passed to parent for Agent context injection. */
export interface BrewContextPayload {
  type: 'brew';
  digest_date: string | null;
  symbols: string[] | null;
  greeting: string | null;
  one_line_summary: string | null;
  stocks: StockAnalysis[] | null;
  news: DigestNewsSection | null;
  events: DigestEvent[] | null;
  summary_content: string | null;
}

interface BrewDigestViewProps {
  /** If provided, load a specific digest by ID. Otherwise load the latest. */
  digestId?: string;
  /** Called when digest data is loaded, so parent can send context to Agent. */
  onContextReady?: (payload: BrewContextPayload) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BrewDigestView({
  digestId,
  onContextReady,
}: BrewDigestViewProps) {
  const { user } = useAuth();
  const userId = user?.id ?? '';

  // Conditional data fetching: specific digest vs latest
  const {
    data: specificDigest,
    isLoading: specificLoading,
    error: specificError,
  } = useDigestById(digestId ?? '', !!digestId);

  const {
    data: listData,
    isLoading: listLoading,
    error: listError,
  } = useDigestList(userId, 1, 0, !digestId && !!userId);

  // Determine which data source to use
  const hasSpecificId = !!digestId;
  const rawItem = hasSpecificId ? specificDigest : listData?.data?.[0] ?? null;
  const isLoading = hasSpecificId ? specificLoading : listLoading;
  const error = hasSpecificId ? specificError : listError;

  // Convert to display format
  const digest = useMemo(() => {
    if (!rawItem) return null;
    return userDigestToResponse(rawItem);
  }, [rawItem]);

  // Build context payload for parent
  useEffect(() => {
    if (!onContextReady || !digest || !rawItem) return;

    onContextReady({
      type: 'brew',
      digest_date: rawItem.digest_date ?? null,
      symbols: digest.symbols_used ?? null,
      greeting: digest.greeting ?? null,
      one_line_summary: digest.one_line_summary ?? null,
      stocks: digest.stocks ?? null,
      news: digest.news ?? null,
      events: digest.events ?? null,
      summary_content: digest.summary?.content ?? null,
    });
  }, [digest, rawItem, onContextReady]);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 rounded-full border border-emerald-500/20" />
          <div className="absolute inset-0 rounded-full border-t border-emerald-500 animate-spin" />
          <svg
            className="absolute inset-0 m-auto w-5 h-5 text-emerald-500/60"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth="1.5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
            />
          </svg>
        </div>
        <span className="text-xs text-muted-foreground">
          加载专属日报
        </span>
      </div>
    );
  }

  // Error state
  if (error || !digest) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
        <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
          <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
            />
          </svg>
        </div>
        <p className="text-sm text-muted-foreground">
          {error ? '无法加载专属日报' : '暂无专属日报数据'}
        </p>
        <p className="text-xs text-muted-foreground/60">
          请先在「持仓总览」页面添加持仓并生成日报
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <DigestInlineReport digest={digest} />
    </div>
  );
}
