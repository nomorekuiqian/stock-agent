'use client';

import { useMemo, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { ForYouBreadcrumb } from '@/components/for-you/ForYouBreadcrumb';
import { DigestResponse } from '@/lib/api';
import { userDigestToResponse } from '@/lib/digest-utils';
import DigestInlineReport from '@/components/for-you/DigestInlineReport';
import { useDigestById } from '@/hooks/queries/use-digest-data';

export default function ForYouDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();

  // Validate UUID format
  const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push(`/login?redirect=/for-you/${id}`);
    }
  }, [authLoading, isAuthenticated, router, id]);

  const { data: historyItem, isLoading: queryLoading, error: queryError } = useDigestById(
    id,
    !!user?.id && isValidUUID,
  );

  const loading = queryLoading;

  const { digest, error } = useMemo((): { digest: DigestResponse | null; error: string | null } => {
    if (!isValidUUID) return { digest: null, error: 'Invalid report ID' };
    if (queryError) {
      return {
        digest: null,
        error: queryError instanceof Error ? queryError.message : 'Failed to load report',
      };
    }
    if (!historyItem) return { digest: null, error: loading ? null : 'Report not found' };
    if (historyItem.user_id !== user?.id) return { digest: null, error: 'You do not have access to this report' };
    return { digest: userDigestToResponse(historyItem), error: null };
  }, [isValidUUID, queryError, historyItem, loading, user?.id]);

  // Show loading while checking auth
  if (authLoading) {
    return (
      <main className="min-h-screen bg-background">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-20">
          <div className="flex flex-col items-center justify-center gap-4">
            <div className="w-10 h-10 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
            <p className="text-muted-foreground text-sm">加载中...</p>
          </div>
        </div>
      </main>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <main className="min-h-screen bg-background">
      {/* Back Navigation */}
      <div className="border-b border-border/50">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-3">
          <ForYouBreadcrumb current="日报详情" />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-4">
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
            {error}
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-20">
          <div className="flex flex-col items-center justify-center gap-4">
            <div className="w-10 h-10 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
            <p className="text-muted-foreground text-sm">加载报告...</p>
          </div>
        </div>
      )}

      {/* Main Content */}
      {!loading && digest && (
        <DigestInlineReport digest={digest} />
      )}
    </main>
  );
}
