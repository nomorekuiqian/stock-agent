/**
 * Content-shape skeletons for KOL persona pages. All use a single shimmer
 * animation (`animate-pulse`) on muted backgrounds — no spinners. Shapes
 * mirror the post-load layout so there's no jump.
 */

function Bar({ className = '' }: { className?: string }) {
  return <div className={`rounded bg-muted/50 ${className}`} />;
}

// ----------------------------------------------------------------- Hero

export function HeroSkeleton() {
  return (
    <header className="border-b border-border/60 bg-background">
      <div className="mx-auto flex max-w-7xl items-center gap-5 px-4 py-5 md:px-6">
        <div className="h-12 w-12 shrink-0 animate-pulse rounded-full bg-muted/60" />
        <div className="min-w-0 flex-1 animate-pulse space-y-2">
          <Bar className="h-6 w-48 max-w-full" />
          <Bar className="h-3 w-72 max-w-full" />
        </div>
        <div className="hidden shrink-0 animate-pulse flex-col items-end gap-1 md:flex">
          <Bar className="h-3 w-24" />
          <Bar className="h-3 w-20" />
        </div>
      </div>
    </header>
  );
}

// ------------------------------------------------------ Mini preview card

export function MiniPreviewSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <section className="animate-pulse rounded-lg border border-border/60 bg-card/30">
      <header className="border-b border-border/40 p-5 pb-4">
        <Bar className="h-5 w-32" />
      </header>
      <div className="space-y-3 p-5 pt-4">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Bar className="h-3 w-2/3" />
            <Bar className="h-3 w-[90%]" />
          </div>
        ))}
      </div>
    </section>
  );
}

// ----------------------------------------------------- Overview page (2x2)

export function OverviewSkeleton() {
  return (
    <div className="space-y-7 py-6 md:space-y-8 md:py-8">
      <section className="max-w-3xl animate-pulse space-y-2">
        <Bar className="h-3 w-24" />
        <Bar className="h-7 w-full max-w-md" />
        <Bar className="h-7 w-2/3" />
      </section>
      <div className="h-[88px] animate-pulse rounded-xl bg-card/40" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
        <MiniPreviewSkeleton rows={3} />
        <MiniPreviewSkeleton rows={4} />
        <MiniPreviewSkeleton rows={3} />
        <MiniPreviewSkeleton rows={3} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------ Feed list

export function FeedListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="divide-y divide-border/40">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="animate-pulse py-5 md:py-6">
          <div className="flex gap-2">
            <Bar className="h-3 w-16" />
            <Bar className="h-3 w-12" />
            <Bar className="h-3 w-10" />
          </div>
          <div className="mt-3 space-y-2">
            <Bar className="h-4 w-[92%]" />
            <Bar className="h-4 w-[78%]" />
            <Bar className="h-4 w-[58%]" />
          </div>
          <div className="mt-3 flex gap-4">
            <Bar className="h-3 w-10" />
            <Bar className="h-3 w-10" />
            <Bar className="h-3 w-10" />
          </div>
        </div>
      ))}
    </div>
  );
}

// --------------------------------------------------- Industry chain row

export function IndustryChainSkeleton({ nodes = 5 }: { nodes?: number }) {
  return (
    <div className="flex flex-col gap-9 pb-12">
      <header className="animate-pulse space-y-2">
        <Bar className="h-8 w-72 max-w-full" />
        <Bar className="h-4 w-[420px] max-w-full" />
      </header>
      <div className="flex animate-pulse items-stretch gap-1.5">
        {Array.from({ length: nodes }).map((_, i) => (
          <div
            key={i}
            className="flex w-[176px] shrink-0 flex-col gap-2 rounded-lg border border-transparent p-4"
          >
            <Bar className="h-4 w-3/4" />
            <Bar className="h-3 w-full" />
            <Bar className="h-3 w-5/6" />
            <div className="mt-2 flex gap-1.5">
              <Bar className="h-3 w-10" />
              <Bar className="h-3 w-10" />
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-border/40 pt-7">
        <div className="animate-pulse space-y-2">
          <Bar className="h-7 w-60" />
          <Bar className="h-4 w-80" />
        </div>
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <TickerCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function TickerCardSkeleton() {
  return (
    <div className="animate-pulse rounded-lg border border-border/40 bg-card/30 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <div className="space-y-1.5">
          <Bar className="h-5 w-16" />
          <Bar className="h-3 w-24" />
        </div>
        <div className="space-y-1">
          <Bar className="h-4 w-12" />
          <Bar className="h-3 w-10" />
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <Bar className="h-3 w-[92%]" />
        <Bar className="h-3 w-3/4" />
      </div>
    </div>
  );
}

// -------------------------------------------------------------- Sub-nav

export function SubNavSkeleton() {
  return (
    <div className="border-b border-border/60 bg-background lg:hidden">
      <div className="mx-auto h-16 max-w-7xl md:h-20" />
    </div>
  );
}
