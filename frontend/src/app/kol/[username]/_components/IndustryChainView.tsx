'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronRight, TrendingUp, TrendingDown } from 'lucide-react';

import { useKolIndustryChain } from '@/hooks/queries/use-kol-data';
import type { KolChainLayer, KolChainTicker } from '@/lib/api';
import { IndustryChainSkeleton } from './Skeletons';

interface Props {
  username: string;
  boardKey: string;
}

/** Tickers Frank has actually discussed — drop supplements ("未详谈") from the UI. */
function coveredTickers(layer: KolChainLayer): KolChainTicker[] {
  return layer.tickers.filter((t) => t.frank_coverage === 'covered');
}

/**
 * Industry-chain view — editorial magazine layout.
 *
 * First-principles value: in 30 seconds, give the user Frank's mental
 * model of a sector + per-ticker one-liner + live price + one-click drill.
 * Everything else (sparklines, mention counts, CTAs) is stripped.
 */
export default function IndustryChainView({ username, boardKey }: Props) {
  const { data, isLoading, isError } = useKolIndustryChain(username, boardKey);
  // User's explicit pick from a chain card click. `null` means "use derived
  // default" (the layer with the most covered tickers). When `boardKey` flips
  // and the picked id no longer exists in the new data, we fall back too.
  const [userPickedId, setUserPickedId] = useState<string | null>(null);

  if (isLoading || !data) {
    if (isError) {
      return (
        <div className="py-20 text-center">
          <p className="text-sm text-destructive">无法获取产业链数据 · 请稍后重试</p>
        </div>
      );
    }
    return <IndustryChainSkeleton />;
  }

  // Derive default active layer at render time — avoids the
  // `react-hooks/set-state-in-effect` blocker.
  const derivedDefaultId =
    [...data.layers].sort(
      (a, b) => coveredTickers(b).length - coveredTickers(a).length,
    )[0]?.id ?? data.layers[0]?.id ?? null;
  const activeLayerId =
    userPickedId && data.layers.some((l) => l.id === userPickedId)
      ? userPickedId
      : derivedDefaultId;
  const activeLayer = data.layers.find((l) => l.id === activeLayerId) ?? null;

  return (
    <div className="flex flex-col gap-9 pb-12">
      {/* Header — editorial, minimal */}
      <header>
        <h2 className="font-editorial text-3xl tracking-tight text-foreground md:text-4xl">
          {data.board.label}
        </h2>
        <p className="mt-2.5 max-w-2xl font-editorial italic text-base leading-relaxed text-muted-foreground">
          {data.board.intro}
        </p>
      </header>

      {/* Chain row */}
      <div className="-mx-4 overflow-x-auto px-4 pb-1 md:-mx-6 md:px-6">
        <div className="flex min-w-fit items-stretch gap-1.5">
          {data.layers.map((layer, idx) => (
            <ChainNodeWithArrow
              key={layer.id}
              layer={layer}
              isLast={idx === data.layers.length - 1}
              active={activeLayerId === layer.id}
              onClick={() => setUserPickedId(layer.id)}
            />
          ))}
        </div>
      </div>

      {/* Active layer detail */}
      {activeLayer ? <LayerSection layer={activeLayer} username={username} /> : null}
    </div>
  );
}

// -----------------------------------------------------------------

function ChainNodeWithArrow({
  layer,
  isLast,
  active,
  onClick,
}: {
  layer: KolChainLayer;
  isLast: boolean;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <>
      <ChainCard layer={layer} active={active} onClick={onClick} />
      {!isLast ? (
        <div className="flex shrink-0 items-center px-0.5 text-muted-foreground/30">
          <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
        </div>
      ) : null}
    </>
  );
}

function ChainCard({
  layer,
  active,
  onClick,
}: {
  layer: KolChainLayer;
  active: boolean;
  onClick: () => void;
}) {
  const covered = coveredTickers(layer);
  const top3 = covered.slice(0, 3);
  const extra = covered.length - top3.length;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex w-[176px] shrink-0 flex-col rounded-lg px-4 py-3.5 text-left transition-all ${
        active
          ? 'bg-primary/[0.06] ring-1 ring-primary/40'
          : 'border border-transparent hover:bg-muted/40'
      }`}
    >
      <h3
        className={`text-base font-medium tracking-tight ${
          active ? 'text-primary' : 'text-foreground/90'
        }`}
      >
        {layer.label}
      </h3>
      <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
        {layer.stance}
      </p>
      {top3.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
          {top3.map((t) => (
            <span
              key={t.ticker}
              className={`font-data text-xs font-medium tabular-nums ${
                active ? 'text-foreground/75' : 'text-muted-foreground/85'
              }`}
            >
              ${t.ticker}
            </span>
          ))}
          {extra > 0 ? (
            <span className="font-data text-xs text-muted-foreground/70">+{extra}</span>
          ) : null}
        </div>
      ) : null}
    </button>
  );
}

// -----------------------------------------------------------------

function LayerSection({ layer, username }: { layer: KolChainLayer; username: string }) {
  return (
    <section className="animate-fade-in" key={layer.id}>
      <div className="border-t border-border/40 pt-7">
        <h3 className="font-editorial text-2xl tracking-tight text-foreground md:text-3xl">
          {layer.label}
        </h3>
        {layer.primary_question ? (
          <p className="mt-1.5 font-editorial italic text-base leading-relaxed text-muted-foreground">
            {layer.primary_question}
          </p>
        ) : null}
      </div>

      {(() => {
        const covered = coveredTickers(layer);
        return covered.length > 0 ? (
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {covered.map((t) => (
              <TickerCard key={t.ticker} ticker={t} username={username} />
            ))}
          </div>
        ) : (
          <p className="mt-6 py-10 text-center text-sm text-muted-foreground/80">
            这一层他暂时没有专门讨论过的标的
          </p>
        );
      })()}
    </section>
  );
}

// -----------------------------------------------------------------

function TickerCard({
  ticker,
  username,
}: {
  ticker: KolChainTicker;
  username: string;
}) {
  const hasChange = ticker.daily_change != null;
  const up = (ticker.daily_change ?? 0) > 0;
  const flat = (ticker.daily_change ?? 0) === 0;
  const priceColor = !hasChange || flat
    ? 'text-muted-foreground'
    : up
      ? 'text-primary'
      : 'text-destructive';
  const ChangeIcon = hasChange && !flat ? (up ? TrendingUp : TrendingDown) : null;

  const stocksHref = `/kol/${username}/stocks?ticker=${encodeURIComponent(ticker.ticker)}`;
  const thesis = ticker.summary?.thesis || ticker.stance || '';

  return (
    <Link
      href={stocksHref}
      className="group block rounded-lg border border-border/40 bg-card/30 p-4 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-primary/[0.04]"
    >
      {/* Top row: ticker + price */}
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h4 className="font-data text-lg font-semibold tabular-nums text-foreground transition-colors group-hover:text-primary">
            ${ticker.ticker}
          </h4>
          {ticker.name ? (
            <p className="mt-0.5 truncate text-xs text-muted-foreground/80">
              {ticker.name}
            </p>
          ) : null}
        </div>
        <div className="shrink-0 text-right">
          {ticker.price != null ? (
            <>
              <div className="font-data text-sm tabular-nums text-foreground/85">
                ${ticker.price.toFixed(2)}
              </div>
              {hasChange && ChangeIcon ? (
                <div
                  className={`flex items-center justify-end gap-0.5 font-data text-xs tabular-nums ${priceColor}`}
                >
                  <ChangeIcon className="h-2.5 w-2.5" />
                  {Math.abs(ticker.daily_change!).toFixed(2)}%
                </div>
              ) : null}
            </>
          ) : (
            <span className="font-data text-xs text-muted-foreground/70">无报价</span>
          )}
        </div>
      </div>

      {/* Thesis */}
      {thesis ? (
        <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-foreground/80 group-hover:text-foreground/95">
          {thesis}
        </p>
      ) : null}
    </Link>
  );
}
