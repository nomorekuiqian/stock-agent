'use client';

import { useRouter, useSearchParams } from 'next/navigation';

import { useKolCockpitTickers } from '@/hooks/queries/use-kol-data';
import TickerList from './TickerList';
import TickerDetail from './TickerDetail';
import { FRANK_COMPANY_RECOMMENDATIONS } from './frankContentData';

interface Props {
  username: string;
}

export default function StockExplorer({ username }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlTicker = searchParams?.get('ticker')?.toUpperCase() ?? null;

  const { data, isError } = useKolCockpitTickers(username);
  const tickers = data?.tickers ?? null;
  const isFrank = username.toLowerCase() === 'qinbafrank';
  const preferredTicker =
    isFrank && tickers
      ? FRANK_COMPANY_RECOMMENDATIONS.find((company) =>
          tickers.some((ticker) => ticker.ticker === company.ticker),
        )?.ticker ?? null
      : null;

  // Selected derives from URL + data at render time. URL is source of truth;
  // pickTicker updates URL and React re-derives — no setState-in-effect needed.
  const selected =
    tickers && urlTicker && tickers.some((t) => t.ticker === urlTicker)
      ? urlTicker
      : preferredTicker ?? tickers?.[0]?.ticker ?? null;

  // Keep URL in sync with selection (shallow — no scroll/refetch).
  function pickTicker(t: string) {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.set('ticker', t);
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  if (isError) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-destructive">无法获取标的列表 · 请检查网络或稍后重试</p>
      </div>
    );
  }

  if (!tickers) {
    return <LoadingPlaceholder />;
  }

  if (tickers.length === 0) {
    return (
      <div className="py-16 text-center text-sm font-medium text-muted-foreground">
        暂无个股观点
      </div>
    );
  }

  return (
    <div className="py-5 md:py-6 lg:py-7">
      <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-8">
        {/* Left rail */}
        <aside className="h-72 min-h-0 overflow-hidden sm:h-96 lg:sticky lg:top-24 lg:h-auto lg:max-h-[calc(100vh-7rem)]">
          <TickerList
            tickers={tickers}
            selected={selected}
            onSelect={pickTicker}
          />
        </aside>

        {/* Right detail */}
        <div className="min-w-0">
          <TickerDetail username={username} ticker={selected} />
        </div>
      </div>
    </div>
  );
}

function LoadingPlaceholder() {
  return (
    <div className="grid gap-6 py-6 lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-8 lg:py-8">
      <div className="h-72 space-y-2 sm:h-96 lg:h-auto">
        <div className="h-9 w-full rounded-md bg-muted/40" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="border-b border-border/30 py-3">
            <div className="h-3 w-16 rounded bg-muted/40" />
            <div className="mt-2 h-1 w-full rounded bg-muted/30" />
          </div>
        ))}
      </div>
      <div className="space-y-4">
        <div className="h-8 w-32 rounded bg-muted/40" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-3 w-16 rounded bg-muted/30" />
              <div className="h-4 w-20 rounded bg-muted/40" />
            </div>
          ))}
        </div>
        <div className="h-72 w-full rounded-md bg-muted/20" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="border-b border-border/30 py-4">
              <div className="h-3 w-16 rounded bg-muted/40" />
              <div className="mt-3 space-y-2">
                <div className="h-4 w-[92%] rounded bg-muted/40" />
                <div className="h-4 w-[78%] rounded bg-muted/30" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
