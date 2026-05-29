'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Search,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';

import { useKolCockpitSectorV3 } from '@/hooks/queries/use-kol-data';
import type { KolSectorV3RuleItem, KolSectorV3Ticker } from '@/lib/api';
import ExpandableRule from './ExpandableRule';
import TweetFeedCard from './TweetFeedCard';
import MacroRegimeFramework from './MacroRegimeFramework';
import { IndustryChainSkeleton } from './Skeletons';

interface Props {
  username: string;
  sectorKey: string | null;
}

export default function SectorDetailV3({ username, sectorKey }: Props) {
  const { data: detail, isLoading, isError } = useKolCockpitSectorV3(username, sectorKey);
  const [showFullBody, setShowFullBody] = useState(false);

  if (!sectorKey) {
    return (
      <div className="flex h-96 items-center justify-center text-center">
        <p className="font-data text-xs uppercase tracking-[0.18em] text-muted-foreground">
          左侧选择板块查看他的框架
        </p>
      </div>
    );
  }

  if (isLoading || !detail) {
    if (isError) {
      return (
        <div className="py-20 text-center">
          <p className="text-sm text-destructive">无法获取板块详情 · 请检查网络或稍后重试</p>
        </div>
      );
    }
    return <IndustryChainSkeleton />;
  }

  const chatHref =
    `/research?agent=kol&persona=${encodeURIComponent(username)}` +
    `&q=${encodeURIComponent(`按你的框架，现在怎么看${detail.label}？`)}`;

  if (detail.layer === 'macro') {
    return <MacroRegimeFramework detail={detail} username={username} />;
  }

  return (
    <div className="flex flex-col gap-7 pb-10">
      {/* Header */}
      <header className="border-b border-border/40 pb-5">
        <p className="font-data text-xs uppercase tracking-[0.22em] text-muted-foreground">
          {detail.eyebrow}
        </p>
        <div className="mt-1.5 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-editorial text-3xl tracking-tight text-foreground md:text-4xl">
              {detail.label}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{detail.short}</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-data text-xs uppercase tracking-[0.14em] text-muted-foreground/80">
              {detail.tweet_count > 0 ? (
                <span className="tabular-nums">{detail.tweet_count} 条推文</span>
              ) : null}
              <span className="tabular-nums">{detail.tickers.length} 个标的</span>
              <span>板块 · 产业链</span>
            </div>
          </div>
          <Link
            href={chatHref}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-3.5 py-2 text-sm font-medium text-primary transition hover:border-primary hover:bg-primary/15"
          >
            问问他怎么看这个板块
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <p className="mt-3 font-data text-xs uppercase tracking-[0.18em] text-muted-foreground/70">
          点击任何一条规则可以看支撑它的原推 · 鼠标悬浮看「问问他」追问
        </p>
      </header>

      {/* 1. 核心问题 */}
      {detail.core_questions.length > 0 ? (
        <Section
          eyebrow="01"
          title="他想搞清楚什么"
          help="进入这个板块前，他先要回答这几个问题"
        >
          <ol className="space-y-1">
            {detail.core_questions.map((q, i) => (
              <ExpandableRule
                key={i}
                text={q.text}
                evidence={q.evidence}
                askPrefix="详细聊聊他在追问的问题："
                username={username}
                leftAdorn={
                  <span className="grid h-5 w-5 place-items-center rounded-full border border-primary/40 bg-primary/10 font-data text-xs tabular-nums text-primary">
                    {i + 1}
                  </span>
                }
              />
            ))}
          </ol>
        </Section>
      ) : null}

      {/* 2. 信号 / 硬指标 */}
      {detail.signals.length > 0 ? (
        <Section
          eyebrow="02"
          title="他盯什么数据"
          help="这些是他用来判断行情的「硬证据」，不是感受"
        >
          <ul className="space-y-1">
            {detail.signals.map((s, i) => (
              <ExpandableRule
                key={i}
                text={s.text}
                evidence={s.evidence}
                askPrefix="他追踪的这个数据现在什么状态："
                username={username}
                leftAdorn={<Search className="h-3.5 w-3.5 text-primary/70" />}
              />
            ))}
          </ul>
        </Section>
      ) : null}

      {/* 3. 决策框架 — 三栏 */}
      {(detail.bull_conditions.length > 0 ||
        detail.veto.length > 0 ||
        detail.falsifiers.length > 0) ? (
        <Section
          eyebrow="03"
          title="他做判断的标尺"
          help="什么时候看好、什么时候不碰、什么情况下承认看错"
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {detail.bull_conditions.length > 0 ? (
              <DecisionCard
                title="什么时候他会看好"
                tone="bull"
                icon={<CheckCircle2 className="h-4 w-4" />}
                items={detail.bull_conditions}
                askPrefix="这条看多必要条件现在满足吗："
                username={username}
              />
            ) : null}
            {detail.veto.length > 0 ? (
              <DecisionCard
                title="他绝对不碰的事"
                tone="veto"
                icon={<XCircle className="h-4 w-4" />}
                items={detail.veto}
                askPrefix="他为什么不碰这条："
                username={username}
              />
            ) : null}
            {detail.falsifiers.length > 0 ? (
              <DecisionCard
                title="什么情况下他承认看错"
                tone="falsifier"
                icon={<AlertTriangle className="h-4 w-4" />}
                items={detail.falsifiers}
                askPrefix="这条可证伪现在什么状态："
                username={username}
              />
            ) : null}
          </div>
          {detail.bear_triggers.length > 0 ? (
            <div className="mt-4 rounded-md border border-border/40 bg-card/30 p-4">
              <p className="font-data text-xs uppercase tracking-[0.18em] text-muted-foreground">
                他什么时候会看空
              </p>
              <ul className="mt-2 space-y-1">
                {detail.bear_triggers.map((b, i) => (
                  <ExpandableRule
                    key={i}
                    text={b.text}
                    evidence={b.evidence}
                    askPrefix="他看空的触发条件："
                    username={username}
                    leftAdorn={
                      <span className="font-data text-xs text-muted-foreground/70">·</span>
                    }
                  />
                ))}
              </ul>
            </div>
          ) : null}
        </Section>
      ) : null}

      {/* 4. 常见误读 */}
      {detail.misreadings.length > 0 ? (
        <Section
          eyebrow="04"
          title="容易被误解的地方"
          help="新人最容易在这几个点上栽跟头"
        >
          <ul className="space-y-2">
            {detail.misreadings.map((m, i) => (
              <li
                key={i}
                className="rounded-md bg-destructive/[0.04] px-3 py-1.5"
              >
                <ExpandableRule
                  text={m.text}
                  evidence={m.evidence}
                  askPrefix="他纠正这个常见误解："
                  username={username}
                  variant="destructive"
                  leftAdorn={<AlertTriangle className="h-3.5 w-3.5 text-destructive/70" />}
                />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {/* 5. Tickers */}
      {detail.tickers.length > 0 ? (
        <Section
          eyebrow="05"
          title="这个板块他提过的标的"
          help={`共 ${detail.tickers.length} 只 · 点击进入个股观点`}
        >
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
            {detail.tickers.map((t) => (
              <TickerMiniCard key={t.ticker} ticker={t} username={username} />
            ))}
          </div>
        </Section>
      ) : null}

      {/* 6. 代表观点 */}
      {detail.rep_tweets.length > 0 ? (
        <Section
          eyebrow="06"
          title="代表观点"
          help={`由原文证据整理 · 共 ${detail.rep_tweets.length} 条`}
        >
          <div className="divide-y divide-border/40">
            {detail.rep_tweets.slice(0, 6).map((tweet) => (
              <TweetFeedCard
                key={tweet.id}
                item={{
                  id: tweet.id,
                  text: tweet.text,
                  created_at: tweet.created_at,
                  url: tweet.url,
                  like_count: tweet.like_count,
                  retweet_count: tweet.retweet_count,
                  reply_count: tweet.reply_count,
                  tweet_type: tweet.tweet_type,
                  tickers: tweet.tickers,
                  sectors: [],
                  reply_kind: tweet.reply_kind ?? null,
                }}
              />
            ))}
          </div>
        </Section>
      ) : null}

      {/* 7. Full markdown body (foldable) */}
      <section>
        <button
          type="button"
          onClick={() => setShowFullBody((s) => !s)}
          className="flex w-full items-center justify-between border-b border-border/40 py-3 text-left transition hover:text-primary"
        >
          <span>
            <span className="font-data text-xs uppercase tracking-[0.22em] text-muted-foreground">
              07 · 完整框架
            </span>
            <span className="ml-3 text-sm font-medium text-foreground">
              展开他的完整思考流程（含分析步骤 / 输出模板 / 证据）
            </span>
          </span>
          {showFullBody ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
        {showFullBody ? (
          <pre className="mt-4 whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-foreground/85">
            {detail.full_body}
          </pre>
        ) : null}
      </section>
    </div>
  );
}

// -----------------------------------------------------------------

function Section({
  eyebrow,
  title,
  help,
  children,
}: {
  eyebrow: string;
  title: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3">
        <p className="font-data text-xs uppercase tracking-[0.22em] text-muted-foreground">
          {eyebrow}
        </p>
        <h3 className="mt-1 text-lg font-medium tracking-tight text-foreground">{title}</h3>
        {help ? <p className="mt-0.5 text-xs text-muted-foreground">{help}</p> : null}
      </div>
      {children}
    </section>
  );
}

function DecisionCard({
  title,
  tone,
  icon,
  items,
  askPrefix,
  username,
}: {
  title: string;
  tone: 'bull' | 'veto' | 'falsifier';
  icon: React.ReactNode;
  items: KolSectorV3RuleItem[];
  askPrefix: string;
  username: string;
}) {
  const tones = {
    bull: 'border-primary/40 bg-primary/5 text-primary',
    veto: 'border-destructive/40 bg-destructive/5 text-destructive',
    falsifier: 'border-border bg-card/30 text-foreground',
  };
  return (
    <div className="rounded-md border border-border/40 bg-card/30">
      <div
        className={`flex items-center gap-2 border-b border-border/40 px-4 py-2.5 ${tones[tone]}`}
      >
        {icon}
        <span className="text-sm font-medium">{title}</span>
      </div>
      <ul className="space-y-1 p-3">
        {items.map((item, i) => (
          <ExpandableRule
            key={i}
            text={stripLeadingMarker(item.text)}
            evidence={item.evidence}
            askPrefix={askPrefix}
            username={username}
            variant={tone === 'bull' ? 'primary' : tone === 'veto' ? 'destructive' : 'default'}
          />
        ))}
      </ul>
    </div>
  );
}

function stripLeadingMarker(s: string): string {
  return s.replace(/^[❌✅⚠️\s]+/, '').trim();
}

function TickerMiniCard({ ticker, username }: { ticker: KolSectorV3Ticker; username: string }) {
  const href = `/kol/${username}/stocks?ticker=${encodeURIComponent(ticker.ticker)}`;
  const hasChange = ticker.daily_change != null;
  const up = (ticker.daily_change ?? 0) > 0;
  const color = !hasChange
    ? 'text-muted-foreground'
    : up
      ? 'text-primary'
      : (ticker.daily_change ?? 0) === 0
        ? 'text-muted-foreground'
        : 'text-destructive';
  const ChangeIcon = hasChange && (ticker.daily_change ?? 0) !== 0 ? (up ? TrendingUp : TrendingDown) : null;

  return (
    <Link
      href={href}
      className="group/cell block rounded-md border border-border/40 bg-card/30 p-3 transition hover:border-primary/40 hover:bg-primary/5"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-data text-sm font-medium tabular-nums text-foreground">
          ${ticker.ticker}
        </span>
        {ticker.coverage === 'high' ? (
          <span className="font-data text-xs uppercase tracking-wider text-primary/80">深度</span>
        ) : null}
      </div>
      <div className="mt-1 flex items-center gap-1.5 font-data text-xs tabular-nums text-muted-foreground">
        {ticker.price != null ? (
          <span className={color}>${ticker.price.toFixed(2)}</span>
        ) : (
          <span>无报价</span>
        )}
        {ChangeIcon ? (
          <span className={`inline-flex items-center gap-0.5 ${color}`}>
            <ChangeIcon className="h-2.5 w-2.5" />
            {Math.abs(ticker.daily_change!).toFixed(2)}%
          </span>
        ) : null}
      </div>
      <div className="mt-1.5 flex items-center justify-between font-data text-xs uppercase tracking-[0.12em] text-muted-foreground/80">
        <span>{ticker.v3_count} 次提及</span>
        <span className="opacity-0 transition group-hover/cell:opacity-100">查看 →</span>
      </div>
    </Link>
  );
}
