"use client";

import { useEffect, useRef, useState } from "react";

import { useKolTickerDetail } from "@/hooks/queries/use-kol-data";
import type { KolCockpitTweet } from "@/lib/api";
import PriceTimelineChart from "./PriceTimelineChart";
import TweetFeedCard from "./TweetFeedCard";
import TickerNarrative from "./TickerNarrative";
import TickerOpinionTimeline from "./TickerOpinionTimeline";
import { IndustryChainSkeleton } from "./Skeletons";

interface Props {
  username: string;
  ticker: string | null;
}

type ExcerptTab = "latest" | "top";

const SECTION_LABEL = "text-sm font-medium leading-snug tracking-wide text-muted-foreground";

export default function TickerDetail({ username, ticker }: Props) {
  const {
    data: detail,
    isLoading,
    isError,
  } = useKolTickerDetail(username, ticker);
  const [tab, setTab] = useState<ExcerptTab>("latest");

  // Right column (opinion timeline) is locked to the left column's intrinsic
  // height at lg+ and scrolls internally. Measuring the left with
  // ResizeObserver keeps the two visually matched even when content reflows;
  // matchMedia gates the height constraint so the stacked mobile layout stays
  // natural.
  const narrativeRef = useRef<HTMLDivElement | null>(null);
  const [narrativeHeight, setNarrativeHeight] = useState<number | null>(null);
  const [isWide, setIsWide] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setIsWide(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const node = narrativeRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      setNarrativeHeight(Math.round(node.getBoundingClientRect().height));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [detail?.ticker]);

  if (!ticker) {
    return <EmptyState />;
  }

  if (isLoading || !detail) {
    if (isError) {
      return (
        <div className="py-20 text-center">
          <p className="text-sm text-destructive">
            无法获取个股详情 · 请检查网络或稍后重试
          </p>
        </div>
      );
    }
    return <IndustryChainSkeleton />;
  }

  const tweetsByLikes = [...detail.tweets].sort(
    (a, b) => (b.like_count || 0) - (a.like_count || 0),
  );
  const visible = (tab === "latest" ? detail.tweets : tweetsByLikes).slice(
    0,
    8,
  );

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border/40 pb-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className={SECTION_LABEL}>
                提及 <span className="font-data tabular-nums text-foreground">{detail.count}</span> 次
              </p>
              {detail.summary?.coverage ? (
                <span className="rounded-sm border border-primary/25 bg-primary/10 px-2 py-1 text-sm font-medium text-primary">
                  {detail.summary.coverage === "high"
                    ? "深度覆盖"
                    : detail.summary.coverage === "medium"
                      ? "中度覆盖"
                      : "轻度提及"}
                </span>
              ) : null}
            </div>
            <h2 className="mt-1 font-editorial text-3xl leading-tight text-foreground md:text-4xl">
              ${detail.ticker}
            </h2>
            {detail.market.name ? (
              <p className="mt-1 max-w-[44ch] text-base leading-relaxed text-muted-foreground">
                {detail.market.name}
              </p>
            ) : null}
          </div>
        </div>

        {/* Coverage metadata — kept lean: 次数 + 时间跨度 */}
        <div className="mt-5 grid grid-cols-3 gap-x-6 gap-y-3 border-t border-border/40 pt-4">
          <Stat label="提及次数" value={`${detail.count}`} />
          <Stat label="首次提及" value={shortDate(detail.first)} />
          <Stat label="最新提及" value={shortDate(detail.latest)} />
        </div>
      </div>

      {/* Two-column: 左 静态观点框架 · 右 动态观点时间线.
          Left's measured height is applied as an explicit `height` on the
          right column at lg+; flex inside lets the scroll area fill whatever
          is left after the header. Mobile (stacked) falls back to natural
          height. */}
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start lg:gap-8">
        <div ref={narrativeRef} className="min-w-0">
          {detail.summary ? (
            <TickerNarrative summary={detail.summary} />
          ) : (
            <section className="mt-6 border-t border-border/40 pt-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className={SECTION_LABEL}>
                  观点框架
                </p>
                <span className="h-px flex-1 bg-border/40" aria-hidden />
              </div>
              <div className="rounded-md border border-dashed border-border/40 bg-card/15 px-4 py-10 text-center text-sm text-muted-foreground">
                暂无方法论观点框架
              </div>
            </section>
          )}
        </div>
        <div
          className="flex min-w-0 flex-col"
          style={
            isWide && narrativeHeight
              ? { height: `${narrativeHeight}px` }
              : undefined
          }
        >
          <section className="mt-6 flex min-h-0 flex-1 flex-col border-t border-border/40 pt-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <p className={SECTION_LABEL}>
                观点时间线
              </p>
              <span className="h-px flex-1 bg-border/40" aria-hidden />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pr-2">
              <TickerOpinionTimeline
                username={username}
                ticker={detail.ticker}
              />
            </div>
          </section>
        </div>
      </div>

      {/* Chart — hidden entirely for tickers without price data (crypto /
          private / unsupported). */}
      {detail.priceable && detail.price_series.length > 0 ? (
        <div className="border-b border-border/40 py-6">
          <p className={`mb-3 ${SECTION_LABEL}`}>
            价格 × 提及时间线
          </p>
          <PriceTimelineChart
            priceSeries={detail.price_series}
            tweets={detail.tweets}
          />
        </div>
      ) : null}

      {/* Tweet excerpts */}
      <div className="pt-6">
        <div className="mb-3 flex items-center justify-between">
          <p className={SECTION_LABEL}>
            原文摘录
          </p>
          <div className="flex items-center gap-1 rounded-md border border-border/60 p-0.5">
            <TabButton
              active={tab === "latest"}
              onClick={() => setTab("latest")}
            >
              最新表态
            </TabButton>
            <TabButton active={tab === "top"} onClick={() => setTab("top")}>
              高赞观点
            </TabButton>
          </div>
        </div>

        {visible.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            暂无相关原文
          </p>
        ) : (
          <div className="divide-y divide-border/40">
            {visible.map((tweet, idx) => (
              <TweetFeedCard
                key={tweet.id}
                item={toFeedItem(tweet)}
                staggerMs={idx < 4 ? idx * 60 : undefined}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function toFeedItem(t: KolCockpitTweet) {
  return {
    id: t.id,
    text: t.text,
    created_at: t.created_at,
    url: t.url,
    like_count: t.like_count,
    retweet_count: t.retweet_count,
    reply_count: t.reply_count,
    tweet_type: t.tweet_type,
    tickers: t.tickers,
    sectors: [] as string[],
    reply_kind: t.reply_kind ?? null,
  };
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className={SECTION_LABEL}>
        {label}
      </p>
      <p className="mt-1 font-data text-base font-semibold leading-snug text-foreground tabular-nums">
        {value}
      </p>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-9 rounded-sm px-3 py-1 text-sm font-medium transition duration-200 ease-out motion-safe:hover:-translate-y-px active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
        active
          ? "border border-primary/25 bg-primary/10 text-primary"
          : "border border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function EmptyState() {
  return (
    <div className="flex h-96 items-center justify-center text-center">
      <p className="text-sm text-muted-foreground">
        左侧选择标的查看他的历史观点
      </p>
    </div>
  );
}

function shortDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const y = String(d.getFullYear()).slice(2);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
