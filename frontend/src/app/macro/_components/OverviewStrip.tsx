import Link from 'next/link';

interface OverviewStripProps {
  verdict: string | null;
  landscape: string | null;
  loading: boolean;
}

function StripSkeleton() {
  return (
    <div className="rounded-xl border border-border/40 bg-card/60 p-5 animate-pulse">
      <div className="space-y-3">
        <div className="h-5 w-3/4 bg-muted rounded" />
        <div className="h-4 w-full bg-muted/50 rounded" />
        <div className="h-4 w-5/6 bg-muted/50 rounded" />
        <div className="h-4 w-2/3 bg-muted/50 rounded" />
      </div>
    </div>
  );
}

export function OverviewStrip({ verdict, landscape, loading }: OverviewStripProps) {
  if (loading) return <StripSkeleton />;

  // Extract first paragraph of landscape as summary
  const summaryText = landscape
    ? landscape.split('\n').filter(l => l.trim()).slice(0, 2).join(' ').slice(0, 300)
    : null;

  // 如果 AI 判断和图景都为空,不显示占位空 strip —— 避免"暂无 AI 判断"破坏首屏信任
  if (!verdict && !summaryText) {
    return null;
  }

  return (
    <div className="rounded-xl border border-border/40 bg-card/60 p-5">
      {verdict && (
        <p className="mb-3 text-base font-medium leading-relaxed text-foreground">{verdict}</p>
      )}

      {summaryText && (
        <p className="text-sm text-muted-foreground leading-relaxed mb-4">{summaryText}{landscape && landscape.length > 300 ? '...' : ''}</p>
      )}

      <Link
        href="/macro/weekly"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
      >
        查看完整周报
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </Link>
    </div>
  );
}
