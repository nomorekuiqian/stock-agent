'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Archive, ArrowRight, LockKeyhole, Zap } from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { useEntitlements } from '@/contexts/EntitlementsContext';
import { api, type TwitterDigestListItem } from '@/lib/api';

const PAGE_SIZE = 12;
const ARCHIVE_ERROR_MESSAGE = '归档暂时不可用，请稍后再试';

// `date` is the ET market day stored by the backend. Build the formatted
// string from a UTC-anchored Date so the weekday matches across timezones.
function formatArchiveDate(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('zh-CN', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    weekday: 'short',
  });
}

function tickerLabels(item: TwitterDigestListItem): string[] {
  return item.hot_tickers
    .slice(0, 4)
    .map((ticker) => ticker.label)
    .filter(Boolean);
}

export default function TwitterDigestArchivePage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { has: hasEntitlement, isLoading: entitlementLoading } = useEntitlements();
  const hasTwitterDigestAccess = isAuthenticated && hasEntitlement('twitter_digest');

  const [items, setItems] = useState<TwitterDigestListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || (isAuthenticated && entitlementLoading)) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    const request = api.twitterDigest.listArchive(PAGE_SIZE, 0);

    request
      .then((result) => {
        if (cancelled) return;
        setItems(result.data ?? []);
        setTotal(result.total ?? 0);
        setOffset(result.data?.length ?? 0);
      })
      .catch(() => {
        if (cancelled) return;
        setError(ARCHIVE_ERROR_MESSAGE);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, entitlementLoading, hasTwitterDigestAccess, isAuthenticated]);

  async function loadMore() {
    if (loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const result = await api.twitterDigest.listArchive(PAGE_SIZE, offset);
      const nextItems = result.data ?? [];
      setItems((current) => [...current, ...nextItems]);
      setTotal(result.total ?? total);
      setOffset((current) => current + nextItems.length);
    } catch {
      setError(ARCHIVE_ERROR_MESSAGE);
    } finally {
      setLoadingMore(false);
    }
  }

  if (authLoading || (isAuthenticated && entitlementLoading) || loading) {
    return (
      <main className="min-h-screen bg-background">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-20">
          <div className="flex flex-col items-center justify-center gap-4">
            <div className="w-10 h-10 rounded-full border-2 border-sky-400/20 border-t-sky-400 animate-spin" />
            <p className="text-muted-foreground text-sm">加载中...</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <section className="border-b border-border/50">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-10 md:py-14">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 max-w-[60px] bg-gradient-to-r from-sky-400 to-transparent" />
                <span className="text-sky-400 text-xs font-semibold tracking-[0.25em] uppercase">
                  Twitter Digest Archive
                </span>
              </div>
              <div className="space-y-2">
                <h1 className="text-3xl md:text-5xl font-editorial text-foreground tracking-tight leading-[1.1]">
                  推特 KOL 日报归档
                </h1>
                <p className="text-sm md:text-base text-muted-foreground max-w-xl leading-relaxed">
                  每天 5 分钟带你看清美股高质量 KOL 观点 · 回看历史每期
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-card px-3 py-2">
              {hasTwitterDigestAccess ? (
                <Zap className="w-4 h-4 text-sky-400" />
              ) : (
                <LockKeyhole className="w-4 h-4 text-muted-foreground" />
              )}
              <span className="text-xs text-muted-foreground">
                {hasTwitterDigestAccess ? '完整归档' : '标题预览'}
              </span>
            </div>
          </div>
        </div>
      </section>

      <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 md:py-10 space-y-8">
        {!hasTwitterDigestAccess && (
          <section className="rounded-lg border border-primary/30 bg-primary/5 p-5 md:p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 text-primary text-xs font-semibold uppercase tracking-[0.18em]">
                  <Zap className="w-4 h-4" />
                  Pro 专属
                </div>
                <h2 className="text-xl font-editorial text-foreground">解锁完整推特日报</h2>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
                  免费用户可浏览标题和热门标的预览；升级 Pro 后可阅读完整观点、原推证据和每日邮件推送。
                </p>
              </div>
              <Link
                href={isAuthenticated ? '/pricing' : `/login?redirect=${encodeURIComponent('/twitter-digest/archive')}`}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                {isAuthenticated ? '升级 Pro' : '登录后开通 Pro'}
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </section>
        )}

        {error && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {items.length === 0 ? (
          <section className="text-center py-16 border border-border/50 rounded-lg bg-card/30">
            <Archive className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
            <h2 className="text-xl font-editorial text-foreground">暂无归档</h2>
            <p className="text-sm text-muted-foreground mt-2">有新一期日报后会出现在这里。</p>
          </section>
        ) : (
          <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {items.map((item) => (
              <Link
                key={item.date}
                href={`/twitter-digest/${item.date}`}
                className="group rounded-lg border border-border/50 bg-card/40 p-5 transition-all hover:border-sky-400/35 hover:bg-card/70 hover:-translate-y-0.5"
              >
                <div className="flex items-center justify-between gap-3 mb-4">
                  <span className="text-xs font-data tabular-nums text-muted-foreground">
                    {formatArchiveDate(item.date)}
                  </span>
                  <ArrowRight className="w-4 h-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-sky-400" />
                </div>
                <h2 className="text-base font-semibold text-foreground leading-snug line-clamp-2 group-hover:text-sky-300 transition-colors">
                  {item.headline || '推特 KOL 观点日报'}
                </h2>
                <p className="text-xs text-muted-foreground leading-relaxed mt-3 line-clamp-3">
                  {item.intro_preview || '本期包含市场主线、个股分歧和关键观察事件。'}
                </p>
                <div className="flex flex-wrap gap-2 mt-5">
                  {tickerLabels(item).length > 0 ? tickerLabels(item).map((label) => (
                    <span
                      key={label}
                      className="inline-flex items-center rounded-md border border-border/60 bg-background px-2 py-1 text-xs font-data text-muted-foreground"
                    >
                      {label.startsWith('$') ? label : `$${label}`}
                    </span>
                  )) : (
                    <span className="text-xs text-muted-foreground">暂无热门标的</span>
                  )}
                </div>
                <div className="mt-5 pt-4 border-t border-border/40 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{item.tracked_kol_count} 位 KOL</span>
                  <span>{item.input_tweet_count} 条推文</span>
                </div>
              </Link>
            ))}
          </section>
        )}

        {items.length < total && (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-border/60 px-5 py-2.5 text-sm text-foreground transition-colors hover:border-sky-400/40 hover:text-sky-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingMore ? (
                <span className="w-4 h-4 rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground animate-spin" />
              ) : null}
              加载更多
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
