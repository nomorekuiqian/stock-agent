'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { formatDateChinese, formatDateShort } from '@/lib/timezone';
import { useDigestList } from '@/hooks/queries/use-digest-data';

export default function ForYouArchivePage() {
  const router = useRouter();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();

  const [page, setPage] = useState(0);
  const pageSize = 12;

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login?redirect=/for-you/archive');
    }
  }, [authLoading, isAuthenticated, router]);

  const { data, isLoading: loading, error: queryError } = useDigestList(
    user?.id ?? '',
    pageSize,
    page * pageSize,
    !!user?.id,
  );

  const digests = data?.data ?? [];
  const total = data?.total ?? 0;
  const error = queryError instanceof Error ? queryError.message : null;
  const totalPages = Math.ceil(total / pageSize);

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
      {/* Header */}
      <section className="border-b border-border/50">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-10 md:py-14">
          <div className="text-center space-y-5">
            <div className="flex items-center justify-center gap-3">
              <div className="h-px flex-1 max-w-[60px] bg-gradient-to-r from-primary to-transparent" />
              <span className="text-primary text-xs font-semibold tracking-[0.25em] uppercase">ARCHIVE</span>
              <div className="h-px flex-1 max-w-[60px] bg-gradient-to-l from-primary to-transparent" />
            </div>
            <h1 className="text-3xl md:text-4xl font-editorial tracking-tight text-foreground">
              专属日报归档
            </h1>
            <p className="text-muted-foreground max-w-lg mx-auto">
              浏览你的个性化市场分析报告
            </p>
            {total > 0 && (
              <p className="text-xs text-muted-foreground">
                共 {total} 份报告
              </p>
            )}
          </div>
        </div>
      </section>

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

      {/* Digests Grid */}
      {!loading && digests.length > 0 && (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {digests.map((digest) => (
              <Link
                key={digest.id}
                href={`/for-you/${digest.id}`}
                className="group terminal-card p-5 hover:border-primary/30 transition-all"
              >
                {/* Date Badge */}
                <div className="flex items-center justify-between mb-4">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card border border-border/50 text-muted-foreground text-xs font-data">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    {formatDateShort(digest.digest_date)}
                  </div>
                  <svg className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>

                {/* Symbols */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {digest.symbols.slice(0, 4).map((sym) => (
                    <span key={sym} className="px-1.5 py-0.5 bg-primary/10 text-primary border border-primary/20 rounded text-xs font-data">
                      {sym}
                    </span>
                  ))}
                  {digest.symbols.length > 4 && (
                    <span className="px-1.5 py-0.5 text-xs text-muted-foreground font-data">
                      +{digest.symbols.length - 4}
                    </span>
                  )}
                </div>

                {/* Title */}
                <h3 className="text-sm font-medium text-foreground mb-2 group-hover:text-primary transition-colors line-clamp-2">
                  {digest.greeting || formatDateChinese(digest.digest_date)}
                </h3>

                {/* Preview */}
                {digest.one_line_summary && (
                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                    {digest.one_line_summary}
                  </p>
                )}

                {/* Footer */}
                <div className="mt-4 pt-3 border-t border-border/30 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    查看报告
                  </span>
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-all">
                    <svg className="w-3.5 h-3.5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-10">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-2 text-muted-foreground hover:text-foreground disabled:text-muted-foreground/70 disabled:cursor-not-allowed transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>

              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum = i;
                  if (totalPages > 5) {
                    if (page < 3) {
                      pageNum = i;
                    } else if (page > totalPages - 4) {
                      pageNum = totalPages - 5 + i;
                    } else {
                      pageNum = page - 2 + i;
                    }
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setPage(pageNum)}
                      className={`w-9 h-9 rounded-lg text-sm font-medium transition-all ${
                        page === pageNum
                          ? 'bg-primary text-white'
                          : 'text-muted-foreground hover:bg-card hover:text-foreground'
                      }`}
                    >
                      {pageNum + 1}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="px-3 py-2 text-muted-foreground hover:text-foreground disabled:text-muted-foreground/70 disabled:cursor-not-allowed transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {!loading && digests.length === 0 && !error && (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-20">
          <div className="text-center space-y-6">
            <div className="w-20 h-20 mx-auto rounded-2xl bg-card border border-border/50 flex items-center justify-center">
              <svg className="w-10 h-10 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <div>
              <h3 className="text-xl font-medium text-foreground mb-2">暂无报告</h3>
              <p className="text-muted-foreground text-sm max-w-sm mx-auto">
                生成你的第一份个性化报告,开始构建你的报告归档
              </p>
            </div>
            <Link
              href="/for-you"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-lg font-medium text-sm transition-all hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/20"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              创建第一份报告
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}
