export default function MacroLoading() {
  return (
    <main className="min-h-screen bg-background">
      {/* Header skeleton */}
      <div className="border-b border-border/30">
        <div className="max-w-[1400px] mx-auto px-4 lg:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="h-7 w-32 bg-muted rounded animate-pulse" />
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 bg-muted rounded-lg animate-pulse" />
              <div className="h-8 w-20 bg-muted rounded-lg animate-pulse" />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-4 lg:px-6 py-6 space-y-4">
        {/* Overview strip skeleton */}
        <div className="rounded-xl border border-border/40 bg-card/60 p-4 animate-pulse">
          <div className="flex items-center gap-6">
            <div className="h-16 w-32 bg-muted rounded" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-3/4 bg-muted rounded" />
              <div className="h-3 w-1/3 bg-muted rounded" />
            </div>
            <div className="hidden lg:flex gap-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-3 w-14 bg-muted rounded" />
              ))}
            </div>
          </div>
        </div>

        {/* Four quadrants skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-border/40 bg-card/60 p-4 animate-pulse" style={{ animationDelay: `${i * 100}ms` }}>
              <div className="flex items-center justify-between mb-3">
                <div className="h-4 w-24 bg-muted rounded" />
                <div className="h-3 w-10 bg-muted rounded" />
              </div>
              <div className="h-[220px] bg-muted/30 rounded-lg mb-4" />
              <div className="space-y-3">
                {[0, 1, 2, 3, 4].map((j) => (
                  <div key={j} className="flex justify-between">
                    <div className="h-3 w-20 bg-muted rounded" />
                    <div className="h-3 w-16 bg-muted rounded" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
