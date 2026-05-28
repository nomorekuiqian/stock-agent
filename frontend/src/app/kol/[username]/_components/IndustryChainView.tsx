'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, TrendingUp, TrendingDown, Loader2, HelpCircle, MessageCircle } from 'lucide-react';

import { api, type KolIndustryChain, type KolChainLayer, type KolChainTicker } from '@/lib/api';
import SparklineMini from './SparklineMini';

interface Props {
  username: string;
  boardKey: string;
}

/**
 * Horizontal industry-chain visualization. 6 layer nodes side by side with
 * arrows between them. Each node has two sparklines (mention frequency +
 * representative-ticker price). Click any node to expand a detail panel
 * below with per-ticker mini cards (price + change + cockpit count +
 * Frank's 1-line stance for each ticker).
 */
export default function IndustryChainView({ username, boardKey }: Props) {
  const [data, setData] = useState<KolIndustryChain | null>(null);
  const [loading, setLoading] = useState(false);
  const [errored, setErrored] = useState(false);
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErrored(false);
    api.kolResearch
      .cockpitIndustryChain(username, boardKey)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        // Auto-select the most active layer
        const top = [...d.layers].sort(
          (a, b) => b.total_mentions - a.total_mentions,
        )[0];
        setActiveLayerId(top?.id ?? d.layers[0]?.id ?? null);
      })
      .catch(() => {
        if (!cancelled) setErrored(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [username, boardKey]);

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span className="font-data text-xs uppercase tracking-[0.18em]">载入产业链</span>
      </div>
    );
  }

  if (errored || !data) {
    return (
      <div className="py-20 text-center">
        <p className="text-sm text-destructive">无法获取产业链数据 · 请检查网络或稍后重试</p>
      </div>
    );
  }

  const maxMentions = Math.max(1, ...data.layers.map((l) => l.total_mentions));
  const activeLayer = data.layers.find((l) => l.id === activeLayerId) ?? null;
  const chatHref = `/research?agent=kol&persona=${encodeURIComponent(username)}&q=${encodeURIComponent(`按你的产业链框架，现在 AI 算力哪一层最重要？`)}`;

  return (
    <div className="flex flex-col gap-7 pb-10">
      {/* Header */}
      <header className="border-b border-border/40 pb-5">
        <p className="font-data text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          {data.board.eyebrow}
        </p>
        <div className="mt-1.5 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-editorial text-3xl tracking-tight text-foreground md:text-[34px]">
              {data.board.label}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{data.board.intro}</p>
          </div>
          <Link
            href={chatHref}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-3.5 py-2 text-sm font-medium text-primary transition hover:border-primary hover:bg-primary/15"
          >
            问问他这个板块
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <p className="mt-3 font-data text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
          上面是 {data.weeks} 周提及频率 · 下面是代表股价 · 点击任一层看详情
        </p>
      </header>

      {/* Chain: horizontal scroll on narrow screens */}
      <div className="-mx-4 overflow-x-auto px-4 pb-2 md:-mx-6 md:px-6">
        <div className="flex min-w-fit items-stretch gap-2">
          {data.layers.map((layer, idx) => (
            <ChainNodeWithArrow
              key={layer.id}
              layer={layer}
              isLast={idx === data.layers.length - 1}
              active={activeLayerId === layer.id}
              maxMentions={maxMentions}
              onClick={() => setActiveLayerId(layer.id)}
            />
          ))}
        </div>
      </div>

      {/* Expanded layer detail */}
      {activeLayer ? (
        <LayerDetail layer={activeLayer} username={username} />
      ) : null}
    </div>
  );
}

// -----------------------------------------------------------------

function ChainNodeWithArrow({
  layer,
  isLast,
  active,
  maxMentions,
  onClick,
}: {
  layer: KolChainLayer;
  isLast: boolean;
  active: boolean;
  maxMentions: number;
  onClick: () => void;
}) {
  return (
    <>
      <ChainNode
        layer={layer}
        active={active}
        maxMentions={maxMentions}
        onClick={onClick}
      />
      {!isLast ? (
        <div className="flex shrink-0 items-center pt-12 text-muted-foreground/40">
          <ArrowRight className="h-5 w-5" strokeWidth={1.25} />
        </div>
      ) : null}
    </>
  );
}

function ChainNode({
  layer,
  active,
  maxMentions,
  onClick,
}: {
  layer: KolChainLayer;
  active: boolean;
  maxMentions: number;
  onClick: () => void;
}) {
  const isQuiet = layer.total_mentions === 0;
  const topTickers = layer.tickers.slice(0, 4);
  const moreCount = Math.max(0, layer.tickers.length - 4);
  const intensity = layer.total_mentions / maxMentions;
  const priceValues = layer.rep_ticker_series.map((p) => p.close);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group/node relative flex w-[190px] shrink-0 flex-col rounded-md border bg-card/30 px-3.5 py-3 text-left transition ${
        active
          ? 'border-primary bg-accent shadow-[0_0_0_1px_var(--primary)]'
          : 'border-border/60 hover:border-primary/40 hover:bg-muted/40'
      } ${isQuiet ? 'opacity-70' : ''}`}
    >
      {/* Eyebrow + layer name */}
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-data text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {layer.id}
        </span>
        <span
          className="font-data text-[10px] tabular-nums text-muted-foreground"
          title="该层标的累计提及总数"
        >
          {layer.total_mentions} 次
        </span>
      </div>
      <h3
        className={`mt-0.5 text-sm font-medium tracking-tight ${
          active ? 'text-primary' : 'text-foreground'
        }`}
      >
        {layer.label}
      </h3>
      <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
        {layer.stance}
      </p>

      {/* Two sparklines */}
      <div className="mt-2.5 space-y-1.5">
        <SparklineRow
          label="提及频率 · 12 周"
          values={layer.weekly_mentions}
          strokeClass="stroke-primary text-primary"
          fill
        />
        <SparklineRow
          label={
            layer.rep_ticker
              ? `${layer.rep_ticker} 价格 · 90 天`
              : '价格 · 无可定价标的'
          }
          values={priceValues}
          strokeClass="stroke-foreground/70 text-foreground/70"
          fill={false}
          emptyHint="无报价"
        />
      </div>

      {/* Ticker chips */}
      <div className="mt-2.5 flex flex-wrap gap-1">
        {topTickers.map((t) => (
          <span
            key={t.ticker}
            className="rounded-sm bg-primary/10 px-1.5 py-0.5 font-data text-[10px] font-medium tabular-nums text-primary"
          >
            ${t.ticker}
          </span>
        ))}
        {moreCount > 0 ? (
          <span className="font-data text-[10px] text-muted-foreground/70">
            +{moreCount}
          </span>
        ) : null}
      </div>

      {/* Intensity indicator at bottom */}
      <div
        aria-hidden
        className="mt-3 h-[2px] overflow-hidden rounded-full bg-muted/60"
      >
        <div
          className={`h-full ${active ? 'bg-primary' : 'bg-primary/40'}`}
          style={{ width: `${Math.max(4, Math.round(intensity * 100))}%` }}
        />
      </div>
    </button>
  );
}

function SparklineRow({
  label,
  values,
  strokeClass,
  fill,
  emptyHint,
}: {
  label: string;
  values: number[];
  strokeClass: string;
  fill?: boolean;
  emptyHint?: string;
}) {
  return (
    <div>
      <SparklineMini
        values={values}
        width={162}
        height={22}
        strokeClass={strokeClass}
        fill={fill}
        emptyHint={emptyHint}
      />
      <p className="mt-0.5 font-data text-[9px] uppercase tracking-wider text-muted-foreground/70">
        {label}
      </p>
    </div>
  );
}

// -----------------------------------------------------------------

function LayerDetail({ layer, username }: { layer: KolChainLayer; username: string }) {
  const hasSubcats = layer.subcategories.length > 0;
  return (
    <section
      key={layer.id}
      className="animate-fade-in rounded-lg border border-border/60 bg-card/30 p-5 md:p-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="font-data text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            {layer.id}
          </p>
          <h3 className="mt-1 font-editorial text-2xl tracking-tight text-foreground">
            {layer.label}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">{layer.stance}</p>
        </div>
        <div className="flex items-baseline gap-3 font-data text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          <span className="tabular-nums">{layer.total_mentions} 次提及</span>
          <span className="tabular-nums">{layer.tickers.length} 个标的</span>
        </div>
      </div>

      <p className="mt-3 rounded-md border-l-2 border-primary/40 bg-primary/5 px-3 py-2 text-sm leading-relaxed text-foreground/90">
        <span className="font-data text-[10px] uppercase tracking-[0.18em] text-primary">
          核心问题
        </span>
        <br />
        {layer.primary_question}
      </p>

      {/* Subcategory navigation */}
      {hasSubcats ? (
        <div className="mt-5 flex flex-wrap gap-2">
          <SubcatChip
            label="全部"
            count={layer.tickers.length}
            active={true}
          />
          {layer.subcategories.map((s) => (
            <SubcatChip
              key={s.name}
              label={s.name}
              count={s.tickers.length}
              active={false}
            />
          ))}
        </div>
      ) : null}

      {/* Ticker mini cards */}
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {layer.tickers.map((t) => (
          <TickerStanceCard
            key={t.ticker}
            ticker={t}
            username={username}
            layerLabel={layer.label}
          />
        ))}
      </div>

      {layer.tickers.length === 0 ? (
        <p className="mt-5 py-10 text-center font-data text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          这一层暂时没有覆盖的标的
        </p>
      ) : null}
    </section>
  );
}

function SubcatChip({
  label,
  count,
  active,
}: {
  label: string;
  count: number;
  active: boolean;
}) {
  return (
    <button
      type="button"
      className={`inline-flex items-center gap-2 rounded-md px-2.5 py-1 text-xs font-medium transition ${
        active
          ? 'bg-primary text-primary-foreground'
          : 'border border-border/60 text-muted-foreground hover:border-foreground/40 hover:text-foreground'
      }`}
    >
      <span>{label}</span>
      <span className="font-data text-[10px] tabular-nums opacity-70">
        {count}
      </span>
    </button>
  );
}

function TickerStanceCard({
  ticker,
  username,
  layerLabel,
}: {
  ticker: KolChainTicker;
  username: string;
  layerLabel: string;
}) {
  const hasChange = ticker.daily_change != null;
  const up = (ticker.daily_change ?? 0) > 0;
  const flat = (ticker.daily_change ?? 0) === 0;
  const color = !hasChange || flat
    ? 'text-muted-foreground'
    : up
      ? 'text-primary'
      : 'text-destructive';
  const ChangeIcon = hasChange && !flat ? (up ? TrendingUp : TrendingDown) : null;

  const isCovered = ticker.frank_coverage === 'covered';
  // Main click: covered tickers go to /stocks; supplements jump to chat (no /stocks data).
  const stocksHref = `/kol/${username}/stocks?ticker=${encodeURIComponent(ticker.ticker)}`;
  const applyQ = isCovered
    ? `用你的「${layerLabel}」框架重看 ${ticker.ticker} —— 你之前怎么定位它？现在还成立吗？`
    : `${ticker.ticker} 你没专门写过，但按你的「${layerLabel}」4 条必要条件，它符合吗？哪条最该 Veto？`;
  const applyHref =
    `/research?agent=kol&persona=${encodeURIComponent(username)}` +
    `&symbol=${encodeURIComponent(ticker.ticker)}` +
    `&q=${encodeURIComponent(applyQ)}`;

  const mainHref = isCovered ? stocksHref : applyHref;

  return (
    <div
      className={`group/card relative rounded-md border bg-background/40 p-3.5 transition ${
        isCovered
          ? 'border-border/40 hover:border-primary/40 hover:bg-primary/5'
          : 'border-dashed border-border/60 hover:border-primary/40 hover:bg-primary/5'
      }`}
    >
      {/* Main clickable area */}
      <Link href={mainHref} className="absolute inset-0 z-0" aria-label={ticker.ticker} />

      <div className="relative z-10 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="font-data text-base font-medium tabular-nums text-foreground">
              ${ticker.ticker}
            </span>
            {!isCovered ? (
              <span className="inline-flex items-center gap-0.5 rounded-sm bg-muted/60 px-1.5 py-0.5 font-data text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                <HelpCircle className="h-2.5 w-2.5" />
                未详谈
              </span>
            ) : null}
          </div>
          {ticker.name ? (
            <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
              {ticker.name}
            </span>
          ) : null}
        </div>
        <div className="shrink-0 text-right">
          {ticker.price != null ? (
            <div className={`font-data text-sm tabular-nums ${color}`}>
              ${ticker.price.toFixed(2)}
            </div>
          ) : (
            <div className="font-data text-[10px] uppercase tracking-wider text-muted-foreground/70">
              无报价
            </div>
          )}
          {hasChange && ChangeIcon ? (
            <div className={`flex items-center justify-end gap-0.5 font-data text-[10px] tabular-nums ${color}`}>
              <ChangeIcon className="h-2.5 w-2.5" />
              {Math.abs(ticker.daily_change!).toFixed(2)}%
            </div>
          ) : null}
        </div>
      </div>

      {/* Mention count line */}
      <div className="relative z-10 mt-2 flex items-center justify-between gap-2">
        <span className="font-data text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {isCovered ? `${ticker.cockpit_count} 次提及` : '同板块候选'}
        </span>
        <span className="opacity-0 transition group-hover/card:opacity-100">
          <ArrowUpRight className="h-3 w-3 text-primary" />
        </span>
      </div>

      {/* Thesis (1-line, prominent) + key logic (smaller, 2-line) */}
      {ticker.summary?.thesis ? (
        <p className="relative z-10 mt-2.5 line-clamp-2 text-[13px] font-medium leading-snug text-foreground">
          {ticker.summary.thesis}
        </p>
      ) : null}
      {ticker.summary?.key_logic ? (
        <p className="relative z-10 mt-1 line-clamp-2 border-l-2 border-primary/30 pl-2.5 text-[11px] leading-relaxed text-muted-foreground">
          {ticker.summary.key_logic}
        </p>
      ) : ticker.stance && !ticker.summary ? (
        <p className="relative z-10 mt-2.5 line-clamp-3 border-l-2 border-primary/40 pl-2.5 text-[12px] leading-relaxed text-foreground/85">
          {ticker.stance}
        </p>
      ) : isCovered ? (
        <p className="relative z-10 mt-2.5 border-l-2 border-border pl-2.5 font-data text-[10px] uppercase tracking-wider text-muted-foreground/70">
          暂无单股立场
        </p>
      ) : (
        <p className="relative z-10 mt-2.5 border-l-2 border-dashed border-muted-foreground/40 pl-2.5 text-xs leading-relaxed text-muted-foreground/80">
          Frank 没专门讨论过这只 · 用他的框架问问
        </p>
      )}

      {/* Apply CTA — always visible, top-right corner */}
      <Link
        href={applyHref}
        title={isCovered ? '用 Frank 框架追问这只' : '让 Frank 框架评估这只'}
        className="relative z-20 mt-2.5 inline-flex w-full items-center justify-center gap-1 rounded-sm border border-primary/30 bg-primary/5 px-2 py-1.5 font-data text-[10px] uppercase tracking-wider text-primary transition hover:border-primary hover:bg-primary/10"
        onClick={(e) => e.stopPropagation()}
      >
        <MessageCircle className="h-3 w-3" />
        {isCovered ? '用框架追问' : '让框架评估'}
      </Link>
    </div>
  );
}
