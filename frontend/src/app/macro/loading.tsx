export default function MacroLoading() {
  return (
    <main className="min-h-screen bg-background">
      <section className="border-b border-border/50">
        <div className="max-w-4xl mx-auto px-4 md:px-6 py-8 md:py-12">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-px w-[60px] bg-primary/30" />
            <div className="h-3 w-28 bg-muted rounded animate-pulse" />
          </div>
          <div className="h-10 w-48 bg-muted rounded animate-pulse mb-2" />
          <div className="h-4 w-56 bg-muted rounded animate-pulse" />
        </div>
      </section>
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-8 space-y-8">
        <div className="space-y-8 animate-pulse">
          <div className="h-5 w-48 bg-muted rounded" />
          <div className="space-y-2">
            <div className="h-4 w-full bg-muted rounded" />
            <div className="h-4 w-4/5 bg-muted rounded" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="rounded-xl bg-card/60 border border-border/40 p-4 space-y-2">
                <div className="h-4 w-20 bg-muted rounded" />
                <div className="h-3 w-full bg-muted rounded" />
                <div className="h-3 w-3/4 bg-muted rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
