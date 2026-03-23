export default function TodayLoading() {
  return (
    <main className="min-h-screen bg-background">
      <section className="border-b border-border/50">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 md:py-12">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-px w-[60px] bg-primary/30" />
              <div className="h-3 w-28 bg-muted rounded animate-pulse" />
            </div>
            <div className="h-10 w-36 bg-muted rounded animate-pulse" />
            <div className="h-4 w-80 bg-muted rounded animate-pulse" />
          </div>
        </div>
      </section>
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-20">
        <div className="flex flex-col items-center justify-center gap-4">
          <div className="w-10 h-10 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
          <p className="text-muted-foreground text-sm">加载市场数据...</p>
        </div>
      </div>
    </main>
  );
}
