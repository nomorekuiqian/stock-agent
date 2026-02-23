export default function StockLoading() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero skeleton */}
      <section className="relative">
        <div className="relative max-w-5xl mx-auto px-4 md:px-6 pt-16 pb-10 md:pt-24 md:pb-14">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-px w-[60px] bg-primary/30" />
              <div className="h-3 w-32 bg-muted rounded animate-pulse" />
            </div>
            <div className="h-12 w-40 bg-muted rounded animate-pulse" />
            <div className="h-5 w-72 bg-muted rounded animate-pulse" />
          </div>

          {/* Search bar skeleton */}
          <div className="mt-10 max-w-xl">
            <div className="h-14 bg-card/40 border border-border/50 rounded-2xl animate-pulse" />
          </div>
        </div>
      </section>

      {/* Track sections skeleton */}
      <div className="max-w-5xl mx-auto px-4 md:px-6 pb-8 space-y-10">
        {[1, 2, 3].map((track) => (
          <section key={track}>
            <div className="mb-4">
              <div className="h-4 w-40 bg-muted rounded animate-pulse" />
              <div className="h-3 w-64 bg-muted/60 rounded animate-pulse mt-2" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {[1, 2, 3, 4, 5].map((card) => (
                <div key={card} className="rounded-xl border border-border/40 bg-card/60 p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-muted animate-pulse" />
                    <div className="space-y-1.5 flex-1">
                      <div className="h-3.5 w-12 bg-muted rounded animate-pulse" />
                      <div className="h-2.5 w-16 bg-muted/60 rounded animate-pulse" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="h-4 w-16 bg-muted rounded animate-pulse" />
                    <div className="h-3.5 w-12 bg-muted rounded animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
