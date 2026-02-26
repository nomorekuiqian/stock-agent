'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { api, DigestResponse } from '@/lib/api';
import { userDigestToResponse } from '@/lib/digest-utils';
import DigestInlineReport from '@/components/for-you/DigestInlineReport';

export default function ForYouDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();

  const [digest, setDigest] = useState<DigestResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Validate UUID format
  const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push(`/login?redirect=/for-you/${id}`);
    }
  }, [authLoading, isAuthenticated, router, id]);

  // Load digest
  useEffect(() => {
    const loadDigest = async () => {
      if (!user?.id) return;

      if (!isValidUUID) {
        setError('Invalid report ID');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const historyItem = await api.digests.getById(id);

        if (!historyItem) {
          setError('Report not found');
          return;
        }

        // Verify ownership
        if (historyItem.user_id !== user.id) {
          setError('You do not have access to this report');
          return;
        }

        setDigest(userDigestToResponse(historyItem));
      } catch (err) {
        console.error('Failed to load digest:', err);
        setError('Failed to load report');
      } finally {
        setLoading(false);
      }
    };

    if (user?.id && id) {
      loadDigest();
    }
  }, [user?.id, id, isValidUUID]);

  // Show loading while checking auth
  if (authLoading) {
    return (
      <main className="min-h-screen bg-background">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-20">
          <div className="flex flex-col items-center justify-center gap-4">
            <div className="w-10 h-10 rounded-full border-2 border-emerald-500/20 border-t-emerald-500 animate-spin" />
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
          <Link
            href="/for-you"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            返回专属日报
          </Link>
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
            <div className="w-10 h-10 rounded-full border-2 border-emerald-500/20 border-t-emerald-500 animate-spin" />
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
