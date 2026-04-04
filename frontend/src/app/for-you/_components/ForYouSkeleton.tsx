export function ForYouSkeleton() {
  return (
    <main className="min-h-screen bg-background">
      {/* Page Header */}
      <section className="border-b border-border/50">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 md:py-12">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 max-w-[60px] bg-gradient-to-r from-primary to-transparent" />
              <span className="text-primary text-xs font-semibold tracking-[0.25em] uppercase">MYBREW</span>
            </div>
            <div className="h-10 w-44 bg-muted rounded-lg animate-pulse" />
            <div className="h-4 w-60 bg-muted rounded animate-pulse" />
            <div className="flex items-center gap-3 pt-1">
              <div className="h-9 w-24 bg-muted rounded-lg animate-pulse" />
              <div className="h-9 w-24 bg-muted rounded-lg animate-pulse" />
              <div className="h-9 w-28 bg-muted rounded-lg animate-pulse" />
            </div>
          </div>
        </div>
      </section>

      {/* Content skeleton */}
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 space-y-4">
        <div className="h-72 bg-muted/60 rounded-xl animate-pulse" />
        <div className="h-32 bg-muted/40 rounded-xl animate-pulse" />
        <div className="h-32 bg-muted/40 rounded-xl animate-pulse" />
      </div>
    </main>
  );
}
