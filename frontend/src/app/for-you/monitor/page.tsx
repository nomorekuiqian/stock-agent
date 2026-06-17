"use client";

import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Command } from "cmdk";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Bell,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Clock,
  Eye,
  ExternalLink,
  Heart,
  LineChart,
  Loader2,
  MessageCircle,
  Newspaper,
  Plus,
  Quote,
  Radio,
  RefreshCw,
  Repeat2,
  Search,
  X,
} from "lucide-react";

import PaywallGuard from "@/components/PaywallGuard";
import StockSearchDropdown from "@/components/StockSearchDropdown";
import type {
  MonitorEventCandidate,
  MonitorSignal,
  MonitorSignalType,
  MonitorSourceRef,
  MonitorTechnicalMonitor,
  MonitorTechnicalViewDimension,
  MonitorTechnicalSignal,
  MonitorTickerRow,
  MonitorWatchpoint,
  StockSearchResult,
  TwitterTickerDiscussionResponse,
  TwitterTickerDiscussionSummaryStance,
  TwitterTickerDiscussionTweet,
} from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useStockQuotes } from "@/hooks/queries/use-stock-data";
import { useStockSearch } from "@/hooks/useStockSearch";
import { useWatchlistMonitor } from "@/hooks/queries/use-watchlist-monitor";
import { useSaveWatchlist, useWatchlist } from "@/hooks/queries/use-watchlist";
import { queryKeys } from "@/hooks/queries/query-keys";
import {
  useTechnicalData,
  type ChartAnnotation,
} from "@/hooks/queries/use-technical-data";

const TechnicalChart = dynamic(
  () =>
    import("@/components/technical/TechnicalChart").then(
      (mod) => mod.TechnicalChart,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="h-[520px] animate-pulse rounded-lg border border-border/30 bg-card/30 motion-reduce:animate-none" />
    ),
  },
);

type TickerDetailTab = "news_events" | "technical" | "market_discussion";
const MAX_WATCHLIST_SIZE = 25;
type DiscussionTheme = TwitterTickerDiscussionResponse["themes"][number];
type DiscussionSourceLink = {
  id: string;
  author: string;
  url: string;
  createdAt?: string | null;
};
type WatchlistSaveNotice = {
  id: number;
  message: string;
  tone: "success" | "info";
};
type DiscussionTopic = {
  key: string;
  title: string;
  summary: string;
  stance?: TwitterTickerDiscussionSummaryStance | null;
  tweetCount: number;
  authorCount: number;
  links: DiscussionSourceLink[];
};
type MonitorFreshness = {
  label: string;
  description: string;
  badgeClassName: string;
  dotClassName: string;
};

const LOGO_BASE = "https://financialmodelingprep.com/image-stock";

const signalLabel: Record<MonitorSignalType, string> = {
  news: "新闻",
  social: "社交",
  event: "事件",
  technical: "技术",
  fundamental: "基本面",
  macro_sector: "宏观/行业",
};

const confidenceLabel: Record<MonitorEventCandidate["confidence"], string> = {
  low: "低",
  medium: "中",
  high: "高",
};

const eventTypeLabel: Record<MonitorEventCandidate["event_type"], string> = {
  earnings: "财报",
  macro: "宏观",
  corporate_action: "公司行动",
  filing: "文件",
  investor_event: "投资者活动",
  product_business: "业务节点",
  regulatory_legal: "监管/法律",
  conference: "会议",
  industry_event: "行业事件",
  media_report: "媒体线索",
  social_watchpoint: "社交观察",
  technical_trigger: "技术触发",
  other_company_event: "公司事件",
};

const eventStatusLabel: Record<MonitorEventCandidate["status"], string> = {
  scheduled: "已排期",
  tentative: "待确认",
  rumored: "传闻",
  completed: "已发生",
};

const discussionStanceLabel: Record<
  TwitterTickerDiscussionSummaryStance,
  string
> = {
  bull: "偏多",
  bear: "偏空",
  neutral: "中性",
  mixed: "分歧",
};

const tickerDetailTabs: Array<{
  key: TickerDetailTab;
  label: string;
  icon: typeof Activity;
}> = [
  { key: "news_events", label: "新闻事件", icon: Newspaper },
  { key: "technical", label: "技术面", icon: LineChart },
  { key: "market_discussion", label: "市场讨论", icon: Radio },
];

function formatTime(value?: string | null) {
  if (!value) return "未生成";
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatDate(value?: string | null) {
  if (!value) return "持续观察";
  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) return `${dateOnly[2]}/${dateOnly[3]}`;
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatPrice(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) return "-";
  return `$${value.toFixed(value >= 100 ? 1 : 2)}`;
}

function formatSignedPercent(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) return "--";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function formatMetricCount(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) return "0";
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}K`;
  }
  return `${value}`;
}

function formatDiscussionTag(value?: string | null) {
  if (!value) return "";
  const labels: Record<string, string> = {
    thesis: "观点",
    catalyst: "催化",
    news_reaction: "新闻反应",
    technical: "技术",
    macro: "宏观",
    earnings: "财报",
    valuation: "估值",
    position_update: "仓位",
  };
  return labels[value] ?? value.replace(/_/g, " ");
}

function compactDiscussionText(value?: string | null, maxLength = 180) {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).trim()}...`;
}

function ensureSentenceEnd(value: string) {
  return /[。.!?！？]$/.test(value) ? value : `${value}。`;
}

function isMostlyEnglishDiscussionText(value: string) {
  const letters = (value.match(/[A-Za-z]/g) ?? []).length;
  const chinese = (value.match(/[\u4e00-\u9fff]/g) ?? []).length;
  return value.length >= 24 && letters > Math.max(32, chinese * 2);
}

function tweetUrl(tweet: TwitterTickerDiscussionTweet) {
  return tweet.url || `https://x.com/i/web/status/${tweet.id}`;
}

function discussionLinkFromTweet(
  tweet: TwitterTickerDiscussionTweet,
): DiscussionSourceLink {
  return {
    id: tweet.id,
    author: tweet.author_username || "unknown",
    url: tweetUrl(tweet),
    createdAt: tweet.created_at,
  };
}

function discussionLinkFromId(id: string): DiscussionSourceLink {
  return {
    id,
    author: "原文",
    url: `https://x.com/i/web/status/${id}`,
  };
}

function synthesizedThemeSummary(theme: DiscussionTheme) {
  const rawSummary = compactDiscussionText(theme.summary, 320);
  const baseSummary = isMostlyEnglishDiscussionText(rawSummary)
    ? ""
    : rawSummary;
  if (baseSummary) return ensureSentenceEnd(baseSummary);

  const stanceText = discussionStanceLabel[theme.stance];
  return `${theme.title || "相关讨论"}是本组讨论的主要方向，样本覆盖 ${theme.tweet_count} 条讨论、${theme.author_count} 位作者，整体倾向为${stanceText}。这部分更适合视为市场关注点和分歧线索，而不是已验证的公司事实。`;
}

function buildDetailedOverviewSummary(
  symbol: string,
  discussion?: TwitterTickerDiscussionResponse,
) {
  const overview = discussion?.overview;
  if (!overview || overview.tweet_count <= 0) {
    return ["过去 24 小时暂无结构化匹配的 Twitter/KOL 讨论。"];
  }

  const themes = discussion?.themes ?? [];
  const stanceText = discussionStanceLabel[overview.dominant_stance];
  const overviewSummary = overview.one_line_summary || "";
  const base = ensureSentenceEnd(
    (overviewSummary && !isMostlyEnglishDiscussionText(overviewSummary)
      ? overviewSummary
      : "") || `${symbol} 过去 24 小时共有 ${overview.tweet_count} 条讨论。`,
  );
  const structure = `样本覆盖 ${overview.tweet_count} 条讨论、${overview.author_count} 位作者；其中偏多 ${overview.bull_count} 条、偏空 ${overview.bear_count} 条、中性 ${overview.neutral_count} 条，整体主导情绪为${stanceText}。`;

  const themeDetails = themes.slice(0, 3).map((theme, index) => {
    const summary = compactDiscussionText(synthesizedThemeSummary(theme), 210);
    return `${index + 1}) ${theme.title}：${summary}（${theme.tweet_count} 条，${discussionStanceLabel[theme.stance]}）`;
  });

  const themeParagraph = themeDetails.length
    ? `主要讨论集中在：${themeDetails.join("；")}。`
    : "这组讨论暂时没有形成明确主题，更多细节需要结合下方原文逐条验证。";

  return [base + structure, themeParagraph].filter(Boolean);
}

function buildFallbackDiscussionSummary(
  symbol: string,
  tweets: TwitterTickerDiscussionTweet[],
) {
  const authors = new Set(
    tweets.map((tweet) => tweet.author_username?.toLowerCase()).filter(Boolean),
  );
  const counts = tweets.reduce(
    (acc, tweet) => {
      const stance = tweet.stance ?? "neutral";
      acc[stance] += 1;
      return acc;
    },
    { bull: 0, bear: 0, neutral: 0 },
  );
  const dominant =
    counts.bull > counts.bear && counts.bull >= counts.neutral
      ? "bull"
      : counts.bear > counts.bull && counts.bear >= counts.neutral
        ? "bear"
        : "neutral";

  return `${symbol} 过去 24 小时有 ${tweets.length} 条可归类讨论，来自 ${authors.size || tweets.length} 位作者，整体倾向为${discussionStanceLabel[dominant]}。当前样本还没有形成稳定主题，适合只作为市场关注度和讨论方向的辅助线索。`;
}

function buildDiscussionTopics(
  symbol: string,
  discussion?: TwitterTickerDiscussionResponse,
): DiscussionTopic[] {
  const tweets = discussion?.data ?? [];
  const tweetsById = new Map(tweets.map((tweet) => [tweet.id, tweet]));
  const themes = discussion?.themes ?? [];

  if (themes.length) {
    return themes.map((theme) => {
      const links = theme.evidence_tweet_ids.slice(0, 4).map((id) => {
        const tweet = tweetsById.get(id);
        return tweet
          ? discussionLinkFromTweet(tweet)
          : discussionLinkFromId(id);
      });

      return {
        key: theme.key,
        title: theme.title || `${symbol} 市场讨论`,
        summary: synthesizedThemeSummary(theme),
        stance: theme.stance,
        tweetCount: theme.tweet_count,
        authorCount: theme.author_count,
        links,
      };
    });
  }

  if (!tweets.length) return [];

  const links = tweets.slice(0, 4).map(discussionLinkFromTweet);
  return [
    {
      key: `${symbol}-market-discussion`,
      title: `${symbol} 市场讨论`,
      summary: buildFallbackDiscussionSummary(symbol, tweets),
      stance: undefined,
      tweetCount: tweets.length,
      authorCount: new Set(
        tweets
          .map((tweet) => tweet.author_username?.toLowerCase())
          .filter(Boolean),
      ).size,
      links,
    },
  ];
}

function confidenceClass(confidence: MonitorEventCandidate["confidence"]) {
  if (confidence === "high") {
    return "border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  }
  if (confidence === "medium") {
    return "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300";
  }
  return "border-border bg-muted/40 text-muted-foreground";
}

function changeTextClass(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "text-muted-foreground";
  }
  if (value > 0) return "text-emerald-700 dark:text-emerald-300";
  if (value < 0) return "text-rose-700 dark:text-rose-300";
  return "text-muted-foreground";
}

function discussionStanceClass(
  stance?: TwitterTickerDiscussionSummaryStance | null,
) {
  if (stance === "bull") {
    return "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }
  if (stance === "bear") {
    return "border-rose-500/35 bg-rose-500/10 text-rose-700 dark:text-rose-300";
  }
  if (stance === "mixed") {
    return "border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  }
  return "border-border/70 bg-background/40 text-muted-foreground";
}

function signalTone(type: MonitorSignalType) {
  if (type === "news") return "text-amber-700 dark:text-amber-300";
  if (type === "social") return "text-sky-700 dark:text-sky-300";
  if (type === "event") return "text-emerald-700 dark:text-emerald-300";
  if (type === "technical") return "text-cyan-700 dark:text-cyan-300";
  return "text-muted-foreground";
}

function SignalTypeIcon({
  type,
  className,
}: {
  type: MonitorSignalType;
  className: string;
}) {
  if (type === "news") return <Newspaper className={className} aria-hidden />;
  if (type === "social") return <Radio className={className} aria-hidden />;
  if (type === "event")
    return <CalendarDays className={className} aria-hidden />;
  if (type === "technical")
    return <LineChart className={className} aria-hidden />;
  return <Activity className={className} aria-hidden />;
}

function technicalStateClass(state?: string) {
  if (!state) return "border-border bg-muted/40 text-muted-foreground";
  if (/(偏强|突破|修复|转强|放量|扩张向上)/.test(state)) {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }
  if (/(偏热|过快|压力|收敛|待确认)/.test(state)) {
    return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  }
  if (/(偏弱|承压|破位|转弱|扩张向下|降温)/.test(state)) {
    return "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300";
  }
  return "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300";
}

function getSignals(row: MonitorTickerRow): MonitorSignal[] {
  if (row.signals?.length) return row.signals;
  return row.top_signal ? [row.top_signal] : [];
}

function getWatchpoints(row: MonitorTickerRow): MonitorWatchpoint[] {
  if (row.watchpoints?.length) return row.watchpoints;
  return row.next_watchpoint ? [row.next_watchpoint] : [];
}

function getEventCandidates(row: MonitorTickerRow): MonitorEventCandidate[] {
  return row.event_candidates ?? [];
}

function normalizeWatchlistSymbols(symbols?: string[]) {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const raw of symbols ?? []) {
    const symbol = raw.trim().toUpperCase();
    if (!symbol || seen.has(symbol)) continue;
    seen.add(symbol);
    normalized.push(symbol);
  }
  return normalized;
}

function makePendingMonitorRow(symbol: string): MonitorTickerRow {
  return {
    symbol,
    headline: "今日监控尚未生成",
    ai_take:
      "这只股票已经加入关注列表。后台生成完成后，这里会展示新闻、技术面和未来观察点。",
    news_summary: "",
    signal_types: [],
    signals: [],
    watchpoints: [],
    event_candidates: [],
    source_refs: [],
    top_signal: null,
    next_watchpoint: null,
    generated_at: null,
    is_stale: true,
  };
}

function getMonitorFreshness(row: MonitorTickerRow): MonitorFreshness {
  if (!row.generated_at) {
    return {
      label: "待生成",
      description: "等待今日监控",
      badgeClassName:
        "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
      dotClassName: "bg-amber-500",
    };
  }

  if (row.is_stale) {
    return {
      label: "上次监控",
      description: `上次更新 ${formatTime(row.generated_at)}`,
      badgeClassName:
        "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
      dotClassName: "bg-sky-500",
    };
  }

  return {
    label: "今日更新",
    description: `更新 ${formatTime(row.generated_at)}`,
    badgeClassName:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    dotClassName: "bg-primary",
  };
}

function shouldShowMonitorFreshnessBadge(row: MonitorTickerRow) {
  return !row.generated_at || row.is_stale;
}

type FutureEventItems = {
  signals: MonitorSignal[];
  eventCandidates: MonitorEventCandidate[];
  watchpoints: MonitorWatchpoint[];
};

type DedupeEvent = {
  itemKey: string;
  subjectKey: string | null;
  date?: string | null;
  textKey: string;
  tokens: Set<string>;
  sourceRefIds: string[];
};

const eventTokenStopwords = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "of",
  "to",
  "for",
  "with",
  "on",
  "at",
  "in",
  "by",
  "from",
  "as",
  "is",
  "are",
  "be",
  "will",
  "watch",
  "watchpoint",
  "event",
  "update",
  "report",
  "release",
  "scheduled",
  "tentative",
  "rumored",
  "follow",
  "through",
  "next",
]);

const canonicalEventAliases: Array<{
  key: string;
  groups: string[][];
}> = [
  {
    key: "macro:fomc",
    groups: [
      ["fomc"],
      ["federal open market committee"],
      ["联邦公开市场委员会"],
      ["federal reserve", "interest rate"],
      ["fed", "rate decision"],
      ["美联储", "利率"],
    ],
  },
  {
    key: "macro:cpi",
    groups: [["cpi"], ["consumer price index"], ["消费者价格指数"]],
  },
  {
    key: "macro:ppi",
    groups: [["ppi"], ["producer price index"], ["生产者价格指数"]],
  },
  {
    key: "macro:pce",
    groups: [["pce"], ["personal consumption expenditures"], ["个人消费支出"]],
  },
  {
    key: "macro:nfp",
    groups: [["nfp"], ["nonfarm payroll"], ["non farm payroll"], ["非农"]],
  },
  {
    key: "macro:jobless_claims",
    groups: [
      ["jobless claims"],
      ["initial claims"],
      ["首次申请失业救济"],
      ["初请失业金"],
    ],
  },
  {
    key: "macro:gdp",
    groups: [["gdp"], ["gross domestic product"], ["国内生产总值"]],
  },
  {
    key: "macro:retail_sales",
    groups: [["retail sales"], ["零售销售"]],
  },
];

function normalizeEventText(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasWholeWord(text: string, word: string) {
  return new RegExp(`(^| )${word}( |$)`).test(text);
}

function stripTemporalText(text: string) {
  return text
    .replace(/\d{1,2}\s*月\s*\d{1,2}\s*日/g, " ")
    .replace(/\b20\d{2}\s+\d{1,2}\s+\d{1,2}\b/g, " ")
    .replace(/\b\d{1,2}\s+\d{1,2}\b/g, " ")
    .replace(/\bq[1-4]\b/g, " ")
    .replace(/\b20\d{2}\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsEventTerm(text: string, term: string) {
  if (/^[a-z0-9]+$/.test(term)) return hasWholeWord(text, term);
  return text.includes(term);
}

function canonicalEventSubjectKey(text: string) {
  for (const alias of canonicalEventAliases) {
    if (
      alias.groups.some((group) =>
        group.every((term) => containsEventTerm(text, term)),
      )
    ) {
      return alias.key;
    }
  }

  return null;
}

function eventTextTokens(text: string) {
  const stripped = stripTemporalText(text);
  return new Set(
    stripped
      .split(" ")
      .map((token) => token.trim())
      .filter(
        (token) =>
          token.length > 1 &&
          !eventTokenStopwords.has(token) &&
          !/^\d+$/.test(token),
      ),
  );
}

function eventTextOverlap(a: Set<string>, b: Set<string>) {
  const smaller = a.size <= b.size ? a : b;
  const larger = a.size <= b.size ? b : a;
  if (smaller.size === 0 || larger.size === 0) return 0;

  let overlap = 0;
  smaller.forEach((token) => {
    if (larger.has(token)) overlap += 1;
  });
  return overlap / smaller.size;
}

function hasSourceOverlap(a: string[], b: string[]) {
  if (!a.length || !b.length) return false;
  const sourceSet = new Set(a);
  return b.some((id) => sourceSet.has(id));
}

function compactTextKey(text: string) {
  return stripTemporalText(text).replace(/\s+/g, "");
}

function isContainedEventText(a: string, b: string) {
  if (a.length < 8 || b.length < 8) return false;
  return a.includes(b) || b.includes(a);
}

function makeDedupeEvent({
  itemKey,
  date,
  sourceRefIds,
  parts,
}: {
  itemKey: string;
  date?: string | null;
  sourceRefIds: string[];
  parts: Array<string | null | undefined>;
}): DedupeEvent {
  const text = normalizeEventText(parts.filter(Boolean).join(" "));
  return {
    itemKey,
    subjectKey: canonicalEventSubjectKey(text),
    date,
    textKey: compactTextKey(text),
    tokens: eventTextTokens(text),
    sourceRefIds,
  };
}

function candidateDedupeEvent(candidate: MonitorEventCandidate): DedupeEvent {
  const itemKey = candidate.dedupe_key
    ? `candidate:${candidate.dedupe_key}`
    : [
        "candidate",
        candidate.event_type,
        candidate.event_date ?? candidate.date_precision ?? "unknown",
        normalizeEventText(candidate.title),
      ].join(":");

  return makeDedupeEvent({
    itemKey,
    date: candidate.event_date,
    sourceRefIds: candidate.source_ref_ids ?? [],
    parts: [candidate.title, candidate.summary, candidate.why_it_matters],
  });
}

function watchpointDedupeEvent(watchpoint: MonitorWatchpoint): DedupeEvent {
  return makeDedupeEvent({
    itemKey: [
      "watchpoint",
      watchpoint.date ?? "unknown",
      normalizeEventText(watchpoint.title),
    ].join(":"),
    date: watchpoint.date,
    sourceRefIds: watchpoint.source_ref_ids ?? [],
    parts: [
      watchpoint.title,
      watchpoint.what_to_watch,
      watchpoint.why_it_matters,
    ],
  });
}

function signalDedupeEvent(signal: MonitorSignal): DedupeEvent {
  return makeDedupeEvent({
    itemKey: ["signal", signal.type, normalizeEventText(signal.title)].join(
      ":",
    ),
    date: signal.observed_at?.slice(0, 10),
    sourceRefIds: signal.source_ref_ids ?? [],
    parts: [signal.title, signal.summary, signal.why_it_matters],
  });
}

function isDuplicateFutureEvent(current: DedupeEvent, existing: DedupeEvent) {
  if (current.itemKey === existing.itemKey) return true;

  const sameDate = Boolean(
    current.date && existing.date && current.date === existing.date,
  );
  const sourceOverlap = hasSourceOverlap(
    current.sourceRefIds,
    existing.sourceRefIds,
  );
  const textOverlap = eventTextOverlap(current.tokens, existing.tokens);

  if (
    current.subjectKey &&
    existing.subjectKey &&
    current.subjectKey === existing.subjectKey
  ) {
    return sameDate || sourceOverlap || textOverlap >= 0.25;
  }

  if (sourceOverlap && textOverlap >= 0.25) return true;
  if (sameDate && textOverlap >= 0.4) return true;
  if (
    (sameDate || sourceOverlap) &&
    isContainedEventText(current.textKey, existing.textKey)
  ) {
    return true;
  }

  return false;
}

function dedupeFutureEventItems({
  signals,
  eventCandidates,
  watchpoints,
}: FutureEventItems): FutureEventItems {
  const accepted: DedupeEvent[] = [];

  function shouldKeep(event: DedupeEvent) {
    const isDuplicate = accepted.some((existing) =>
      isDuplicateFutureEvent(event, existing),
    );
    if (!isDuplicate) accepted.push(event);
    return !isDuplicate;
  }

  const dedupedEventCandidates = eventCandidates.filter((candidate) => {
    return shouldKeep(candidateDedupeEvent(candidate));
  });

  const dedupedWatchpoints = watchpoints.filter((watchpoint) => {
    return shouldKeep(watchpointDedupeEvent(watchpoint));
  });

  const dedupedSignals = signals.filter((signal) => {
    return shouldKeep(signalDedupeEvent(signal));
  });

  return {
    signals: dedupedSignals,
    eventCandidates: dedupedEventCandidates,
    watchpoints: dedupedWatchpoints,
  };
}

function sourceMap(row: MonitorTickerRow) {
  return new Map((row.source_refs ?? []).map((source) => [source.id, source]));
}

function sourceTypeLabel(type: string) {
  const labels: Record<string, string> = {
    news: "新闻",
    social: "社交",
    quote: "报价",
    technical: "技术",
    event: "事件",
    search: "搜索",
    macro: "宏观",
    macro_event: "宏观",
  };
  return labels[type] ?? type;
}

function sourceDisplayTitle(source: MonitorSourceRef) {
  return source.title_zh || source.title || source.type;
}

function sourceSiteLabel(source: MonitorSourceRef) {
  if (!source.url) return "";
  try {
    const hostname = new URL(source.url).hostname.replace(/^www\./, "");
    const labels: Record<string, string> = {
      "barchart.com": "Barchart",
      "benzinga.com": "Benzinga",
      "finance.yahoo.com": "Yahoo Finance",
      "fxempire.com": "FXEmpire",
      "investing.com": "Investing.com",
      "marketbeat.com": "MarketBeat",
      "seekingalpha.com": "Seeking Alpha",
      "simplywall.st": "Simply Wall St",
      "stockstotrade.com": "StocksToTrade",
      "stocktitan.net": "StockTitan",
      "tipranks.com": "TipRanks",
      "tradersunion.com": "Traders Union",
    };
    return labels[hostname] ?? hostname;
  } catch {
    return "";
  }
}

function levelDotClass(key: string) {
  if (key.startsWith("support")) return "bg-emerald-500";
  if (key.startsWith("resistance")) return "bg-amber-500";
  if (key.startsWith("sma")) return "bg-sky-500";
  return "bg-primary";
}

function levelValueClass(key: string) {
  if (key.startsWith("support"))
    return "text-emerald-700 dark:text-emerald-300";
  if (key.startsWith("resistance")) return "text-amber-700 dark:text-amber-300";
  if (key.startsWith("sma")) return "text-sky-700 dark:text-sky-300";
  return "text-foreground";
}

export default function WatchlistMonitorPage() {
  return (
    <PaywallGuard
      requiredFeature="for_you_website"
      checkoutProduct="pro"
      lockTitle="解锁 AI 监控台"
      lockDescription="AI 监控台属于专属日报权益。升级 Pro 后，可以用同一份关注列表查看每日 AI 监控、新闻事件和技术面信号。"
      lockCtaLabel="升级 Pro"
    >
      <WatchlistMonitorContent />
    </PaywallGuard>
  );
}

function WatchlistMonitorContent() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const userId = user?.id;
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<WatchlistSaveNotice | null>(
    null,
  );
  const { data, isLoading, isError, refetch } = useWatchlistMonitor(
    userId,
    !!userId && isAuthenticated,
  );
  const { data: watchlistData, isSuccess: watchlistLoaded } = useWatchlist(
    userId,
    !!userId && isAuthenticated,
  );
  const saveWatchlistMutation = useSaveWatchlist();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/login?redirect=/for-you/monitor");
    }
  }, [authLoading, isAuthenticated, router]);

  const rows = useMemo(() => data?.ticker_rows ?? [], [data?.ticker_rows]);
  const watchlistSymbols = useMemo(() => {
    if (watchlistLoaded) {
      return normalizeWatchlistSymbols(watchlistData?.symbols);
    }
    return normalizeWatchlistSymbols(
      data?.symbols ?? rows.map((row) => row.symbol),
    );
  }, [data?.symbols, rows, watchlistData?.symbols, watchlistLoaded]);
  const effectiveRows = useMemo(() => {
    if (!watchlistLoaded && !watchlistSymbols.length) return rows;
    const rowBySymbol = new Map(rows.map((row) => [row.symbol, row]));
    return watchlistSymbols.map(
      (symbol) => rowBySymbol.get(symbol) ?? makePendingMonitorRow(symbol),
    );
  }, [rows, watchlistLoaded, watchlistSymbols]);

  const selectedRow = useMemo(
    () =>
      effectiveRows.find((row) => row.symbol === selectedSymbol) ??
      effectiveRows[0] ??
      null,
    [effectiveRows, selectedSymbol],
  );

  const filteredRows = useMemo(() => {
    const term = search.trim().toUpperCase();
    return effectiveRows.filter((row) => {
      const matchesSearch = !term || row.symbol.includes(term);
      return matchesSearch;
    });
  }, [effectiveRows, search]);
  const monitorStats = useMemo(() => {
    let freshCount = 0;
    let staleCount = 0;
    let pendingCount = 0;
    let lastUpdatedAt: string | null = null;

    for (const row of effectiveRows) {
      if (!row.generated_at) {
        pendingCount += 1;
      } else if (row.is_stale) {
        staleCount += 1;
      } else {
        freshCount += 1;
      }

      if (
        row.generated_at &&
        (!lastUpdatedAt ||
          new Date(row.generated_at).getTime() >
            new Date(lastUpdatedAt).getTime())
      ) {
        lastUpdatedAt = row.generated_at;
      }
    }

    return {
      freshCount,
      pendingCount,
      staleCount,
      totalCount: effectiveRows.length,
      lastUpdatedAt,
    };
  }, [effectiveRows]);

  useEffect(() => {
    if (!saveNotice) return;
    const timeout = window.setTimeout(() => {
      setSaveNotice(null);
    }, 1800);
    return () => window.clearTimeout(timeout);
  }, [saveNotice]);

  const saveWatchlistSymbols = useCallback(
    (
      symbols: string[],
      nextSelectedSymbol?: string | null,
      notice?: WatchlistSaveNotice,
    ) => {
      if (!userId || !watchlistLoaded) {
        setSaveError("关注列表还在加载，请稍后再试。");
        return;
      }
      setSaveError(null);
      setSaveNotice(null);
      saveWatchlistMutation.mutate(
        {
          userId,
          symbols,
          baseUpdatedAt: watchlistData?.updated_at,
        },
        {
          onSuccess: async () => {
            setSaveError(null);
            setSaveNotice(notice ?? null);
            if (nextSelectedSymbol !== undefined) {
              setSelectedSymbol(nextSelectedSymbol);
            }
            await queryClient.invalidateQueries({
              queryKey: queryKeys.watchlistMonitor.current(userId),
            });
            await refetch();
          },
          onError: () => {
            setSaveError("关注列表保存失败，请重试。");
          },
        },
      );
    },
    [
      queryClient,
      refetch,
      saveWatchlistMutation,
      userId,
      watchlistData?.updated_at,
      watchlistLoaded,
    ],
  );

  const handleAddSymbol = useCallback(
    (symbol: string) => {
      const normalized = symbol.trim().toUpperCase();
      if (!normalized) return;
      if (watchlistSymbols.includes(normalized)) {
        setSelectedSymbol(normalized);
        setSaveNotice({
          id: Date.now(),
          message: `已定位 ${normalized}`,
          tone: "info",
        });
        return;
      }
      if (watchlistSymbols.length >= MAX_WATCHLIST_SIZE) {
        setSaveError(`关注列表最多支持 ${MAX_WATCHLIST_SIZE} 个标的。`);
        return;
      }
      saveWatchlistSymbols([...watchlistSymbols, normalized], normalized, {
        id: Date.now(),
        message: `已加入 ${normalized}`,
        tone: "success",
      });
    },
    [saveWatchlistSymbols, watchlistSymbols],
  );

  const handleRemoveSymbol = useCallback(
    (symbol: string) => {
      const nextSymbols = watchlistSymbols.filter((item) => item !== symbol);
      const nextSelected =
        selectedRow?.symbol === symbol
          ? (nextSymbols[0] ?? null)
          : selectedRow?.symbol;
      saveWatchlistSymbols(nextSymbols, nextSelected, {
        id: Date.now(),
        message: `已移除 ${symbol}`,
        tone: "success",
      });
    },
    [saveWatchlistSymbols, selectedRow?.symbol, watchlistSymbols],
  );

  if (authLoading || isLoading) {
    return <MonitorSkeleton />;
  }

  if (!isAuthenticated) {
    return null;
  }

  if (isError) {
    return (
      <main className="min-h-screen bg-background text-foreground">
        <div className="mx-auto flex min-h-[60vh] max-w-5xl flex-col items-center justify-center gap-4 px-4 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/10">
            <AlertTriangle className="h-6 w-6 text-amber-500" aria-hidden />
          </div>
          <div className="space-y-1">
            <h1 className="text-lg font-semibold">监控台暂时无法加载</h1>
            <p className="text-sm text-muted-foreground">
              可能是网络或登录状态过期。重新加载通常可以恢复。
            </p>
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-md border border-border px-3 text-sm font-medium text-foreground transition-colors duration-200 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 motion-reduce:transition-none"
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            重新加载
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <TopBar stats={monitorStats} />

      <div className="mx-auto grid w-full max-w-[1800px] gap-4 px-4 py-4 lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-5 lg:px-5 xl:grid-cols-[340px_minmax(0,1fr)] xl:gap-6">
        <WatchlistSidebar
          rows={filteredRows}
          allRows={effectiveRows}
          selectedSymbol={selectedRow?.symbol ?? null}
          search={search}
          onSearchChange={setSearch}
          onSelect={setSelectedSymbol}
          symbols={watchlistSymbols}
          canEdit={watchlistLoaded && !saveWatchlistMutation.isPending}
          isSaving={saveWatchlistMutation.isPending}
          saveError={saveError}
          saveNotice={saveNotice}
          onAddSymbol={handleAddSymbol}
          onRemoveSymbol={handleRemoveSymbol}
        />
        {selectedRow ? (
          <TickerWorkbench key={selectedRow.symbol} row={selectedRow} />
        ) : (
          <EmptyState />
        )}
      </div>
    </main>
  );
}

function TopBar({
  stats,
}: {
  stats: {
    freshCount: number;
    pendingCount: number;
    staleCount: number;
    totalCount: number;
    lastUpdatedAt: string | null;
  };
}) {
  return (
    <section className="monitor-reveal border-b border-border/50 bg-background">
      <div className="mx-auto w-full max-w-[1800px] px-4 py-8 md:py-10 lg:px-5">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-end">
          <div className="max-w-3xl">
            <div className="mb-3 flex items-center gap-3">
              <div className="monitor-eyebrow-line h-px max-w-[60px] flex-1 bg-gradient-to-r from-primary to-transparent" />
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                FOR YOU
              </span>
              <span className="text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground">
                / MONITOR
              </span>
            </div>
            <h1 className="font-editorial text-3xl leading-[1.1] tracking-tight text-foreground md:text-4xl">
              AI 监控台
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
              用同一份关注列表查看每日监控结论、关键新闻、技术面结构和可验证来源。
            </p>
          </div>

          <div className="border-t border-border/50 pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
            <div className="grid grid-cols-3 gap-3">
              <TopBarStat label="跟踪" value={stats.totalCount} />
              <TopBarStat
                label="今日"
                value={stats.freshCount}
                tone="primary"
              />
              <TopBarStat
                label="待更新"
                value={stats.pendingCount + stats.staleCount}
                tone={
                  stats.pendingCount + stats.staleCount > 0 ? "amber" : "muted"
                }
              />
            </div>
            <p className="mt-3 inline-flex items-center gap-2 text-sm leading-relaxed text-muted-foreground">
              <Clock className="h-3.5 w-3.5" aria-hidden />
              最近更新 {formatTime(stats.lastUpdatedAt)}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function TopBarStat({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: number;
  tone?: "primary" | "amber" | "muted";
}) {
  const valueClass =
    tone === "primary"
      ? "text-primary"
      : tone === "amber"
        ? "text-amber-700 dark:text-amber-300"
        : "text-foreground";

  return (
    <div>
      <div className="text-sm font-medium text-muted-foreground">{label}</div>
      <div
        className={`mt-1 font-data text-2xl font-semibold tabular-nums ${valueClass}`}
      >
        {value}
      </div>
    </div>
  );
}

function WatchlistSidebar({
  rows,
  allRows,
  selectedSymbol,
  search,
  onSearchChange,
  onSelect,
  symbols,
  canEdit,
  isSaving,
  saveError,
  saveNotice,
  onAddSymbol,
  onRemoveSymbol,
}: {
  rows: MonitorTickerRow[];
  allRows: MonitorTickerRow[];
  selectedSymbol: string | null;
  search: string;
  onSearchChange: (value: string) => void;
  onSelect: (symbol: string) => void;
  symbols: string[];
  canEdit: boolean;
  isSaving: boolean;
  saveError: string | null;
  saveNotice: WatchlistSaveNotice | null;
  onAddSymbol: (symbol: string) => void;
  onRemoveSymbol: (symbol: string) => void;
}) {
  const {
    query: addQuery,
    results: addResults,
    isSearching,
    open: showAddDropdown,
    containerRef: addSearchContainerRef,
    onQueryChange,
    inputHandlers,
    resetAfterSelect,
    closeDropdown,
    clearSearch,
  } = useStockSearch();
  const atLimit = symbols.length >= MAX_WATCHLIST_SIZE;

  const handleAddResult = useCallback(
    (result: StockSearchResult) => {
      onAddSymbol(result.symbol);
      resetAfterSelect();
    },
    [onAddSymbol, resetAfterSelect],
  );

  const handleEnterRaw = useCallback(() => {
    const symbol = addQuery.trim().toUpperCase();
    if (!symbol) return;
    onAddSymbol(symbol);
    clearSearch();
  }, [addQuery, clearSearch, onAddSymbol]);

  return (
    <aside className="monitor-sidebar-enter max-h-[360px] self-start overflow-hidden rounded-lg border border-border/50 bg-card/60 shadow-sm sm:max-h-[430px] lg:sticky lg:top-4 lg:max-h-[calc(100vh-116px)]">
      <div className="border-b border-border/50 bg-card/30 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-4 w-1 rounded-full bg-primary" aria-hidden />
              <h2 className="text-sm font-semibold">关注列表</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {allRows.length} 个自选标的，点击查看详情
            </p>
          </div>
          <Link
            href="/for-you/watchlist"
            className="monitor-action-button inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-md border border-border text-muted-foreground transition-colors duration-200 hover:border-primary/40 hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 motion-reduce:transition-none"
            aria-label="编辑关注列表"
          >
            <ArrowUpRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>

        <div ref={addSearchContainerRef} className="relative mt-4">
          <Command
            shouldFilter={false}
            loop
            onKeyDown={(event) => {
              if (event.key === "Escape") closeDropdown();
              if (
                event.key === "Enter" &&
                (!showAddDropdown || addResults.length === 0) &&
                addQuery.trim()
              ) {
                event.preventDefault();
                handleEnterRaw();
              }
            }}
          >
            <div
              className={`monitor-input-shell flex h-11 items-center gap-2 rounded-md border px-3 transition-colors duration-200 motion-reduce:transition-none ${
                atLimit
                  ? "border-amber-500/30 bg-amber-500/5"
                  : "border-border/60 bg-background focus-within:border-primary/40"
              }`}
            >
              <Plus className="h-4 w-4 text-muted-foreground" aria-hidden />
              <Command.Input
                value={addQuery}
                onValueChange={onQueryChange}
                {...inputHandlers}
                disabled={!canEdit || atLimit}
                placeholder={atLimit ? "关注列表已满" : "添加股票代码"}
                className="h-10 min-w-0 flex-1 bg-transparent text-sm uppercase outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
              />
              <span className="font-data text-xs tabular-nums text-muted-foreground">
                {symbols.length}/{MAX_WATCHLIST_SIZE}
              </span>
            </div>
            {showAddDropdown && canEdit && !atLimit && (
              <StockSearchDropdown
                results={addResults}
                isSearching={isSearching}
                showEmpty
                mode="watchlist"
                inListSymbols={symbols}
                onSelect={handleAddResult}
                onAdd={handleAddResult}
                atLimit={atLimit}
              />
            )}
          </Command>
        </div>
        <div className="mt-2 min-h-6" aria-live="polite">
          {isSaving ? (
            <p className="monitor-save-status inline-flex items-center gap-2 text-sm leading-relaxed text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              正在同步关注列表
            </p>
          ) : saveError ? (
            <p className="monitor-save-status monitor-save-status-error inline-flex items-center gap-2 text-sm leading-relaxed text-rose-500">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
              {saveError}
            </p>
          ) : saveNotice ? (
            <p
              key={saveNotice.id}
              className={`monitor-save-status inline-flex items-center gap-2 text-sm leading-relaxed ${
                saveNotice.tone === "success"
                  ? "text-primary"
                  : "text-muted-foreground"
              }`}
            >
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
              {saveNotice.message}
            </p>
          ) : null}
        </div>

        <label htmlFor="monitor-search" className="sr-only">
          筛选关注列表
        </label>
        <div className="mt-4 flex h-11 items-center gap-2 rounded-md border border-border/60 bg-background px-3 transition-colors duration-200 focus-within:border-primary/40 motion-reduce:transition-none">
          <Search className="h-4 w-4 text-muted-foreground" aria-hidden />
          <input
            id="monitor-search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="筛选关注列表"
            className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>

      <div className="max-h-72 divide-y divide-border/40 overflow-y-auto lg:max-h-[calc(100vh-256px)]">
        {rows.length === 0 ? (
          <p className="px-4 py-8 text-sm text-muted-foreground">
            没有匹配的标的
          </p>
        ) : (
          rows.map((row, index) => (
            <TickerListItem
              key={row.symbol}
              index={index}
              row={row}
              active={row.symbol === selectedSymbol}
              onSelect={() => onSelect(row.symbol)}
              onRemove={() => onRemoveSymbol(row.symbol)}
              canRemove={canEdit}
            />
          ))
        )}
      </div>
    </aside>
  );
}

function CompanyLogo({
  symbol,
  size = "sm",
}: {
  symbol: string;
  size?: "sm" | "lg";
}) {
  const [logoError, setLogoError] = useState(false);
  const cleanSymbol = symbol.replace(/^\$/, "");
  const dimensions = size === "lg" ? 48 : 32;
  const wrapperClass =
    size === "lg" ? "h-12 w-12 rounded-xl" : "h-8 w-8 rounded-lg";
  const textClass = size === "lg" ? "text-sm" : "text-micro";

  if (logoError || !cleanSymbol) {
    return (
      <span
        className={`${wrapperClass} flex shrink-0 items-center justify-center border border-primary/20 bg-primary/10`}
      >
        <span className={`font-data font-semibold text-primary ${textClass}`}>
          {cleanSymbol.slice(0, 2) || symbol.slice(0, 2)}
        </span>
      </span>
    );
  }

  return (
    <span
      className={`${wrapperClass} flex shrink-0 items-center justify-center border border-border/50 bg-white p-1 shadow-sm`}
    >
      <Image
        src={`${LOGO_BASE}/${cleanSymbol}.png`}
        alt={`${symbol} logo`}
        width={dimensions}
        height={dimensions}
        unoptimized
        className="h-full w-full object-contain"
        loading="lazy"
        onError={() => setLogoError(true)}
      />
    </span>
  );
}

function TickerListItem({
  index,
  row,
  active,
  onSelect,
  onRemove,
  canRemove,
}: {
  index: number;
  row: MonitorTickerRow;
  active: boolean;
  onSelect: () => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const freshness = getMonitorFreshness(row);
  const showFreshnessBadge = shouldShowMonitorFreshnessBadge(row);

  return (
    <div
      className={`monitor-list-row group flex min-h-[68px] w-full items-center gap-2 px-3 transition-colors duration-200 motion-reduce:transition-none ${
        active
          ? "monitor-list-row-active bg-primary/[0.08]"
          : "hover:bg-muted/30"
      }`}
      style={{ "--monitor-item-index": index } as CSSProperties}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={active}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-md px-1 py-2 text-left transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 motion-reduce:transition-none"
      >
        <CompanyLogo symbol={row.symbol} />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="font-data text-base font-semibold text-foreground transition-colors duration-200 group-hover:text-primary motion-reduce:transition-none">
              {row.symbol}
            </span>
            {showFreshnessBadge && (
              <span
                className={`shrink-0 rounded-md border px-1.5 py-0.5 text-xs font-medium ${freshness.badgeClassName}`}
              >
                {freshness.label}
              </span>
            )}
          </span>
          <span className="mt-0.5 block truncate text-sm leading-relaxed text-muted-foreground">
            {row.headline || freshness.description}
          </span>
        </span>
        <span
          className={`monitor-list-dot h-2 w-2 shrink-0 rounded-full transition-colors duration-200 motion-reduce:transition-none ${
            active
              ? freshness.dotClassName
              : "bg-border group-hover:bg-primary/60"
          }`}
          aria-hidden
        />
      </button>
      <button
        type="button"
        onClick={onRemove}
        disabled={!canRemove}
        aria-label={`从关注列表删除 ${row.symbol}`}
        className="monitor-action-button inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground opacity-70 transition-colors duration-200 hover:bg-rose-500/10 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/30 disabled:cursor-not-allowed disabled:opacity-30 motion-reduce:transition-none"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

function TickerWorkbench({ row }: { row: MonitorTickerRow }) {
  const [activeTab, setActiveTab] = useState<TickerDetailTab>("news_events");
  const marketDiscussion = row.market_discussion;
  const signals = getSignals(row);
  const nonNewsSignals = signals.filter((signal) => signal.type !== "news");
  const watchpoints = getWatchpoints(row);
  const eventCandidates = getEventCandidates(row);
  const sources = row.source_refs ?? [];
  const newsSources = sources.filter((source) => source.type === "news");
  const sourceById = sourceMap(row);
  const socialSignals = nonNewsSignals.filter(
    (signal) => signal.type === "social",
  );
  const eventSignals = nonNewsSignals.filter(
    (signal) => signal.type === "event" || signal.type === "macro_sector",
  );
  const futureEvents = dedupeFutureEventItems({
    signals: eventSignals,
    eventCandidates,
    watchpoints,
  });
  const fundamentalSignals = nonNewsSignals.filter(
    (signal) => signal.type === "fundamental",
  );
  const technicalSignalCount = row.technical_monitor?.signals?.length ?? 0;
  const earningsSources = sources.filter((source) => {
    const title = source.title.toLowerCase();
    return source.type === "event" && title.includes("earnings");
  });
  const tabCounts: Record<TickerDetailTab, number> = {
    news_events:
      newsSources.length +
      futureEvents.signals.length +
      futureEvents.eventCandidates.length +
      futureEvents.watchpoints.length +
      fundamentalSignals.length +
      earningsSources.length,
    technical: technicalSignalCount,
    market_discussion:
      marketDiscussion?.count ??
      marketDiscussion?.overview?.tweet_count ??
      socialSignals.length,
  };

  return (
    <div className="monitor-workbench-enter min-w-0 space-y-5">
      <TickerSummary row={row} />

      <TickerTabNav
        activeTab={activeTab}
        counts={tabCounts}
        onChange={setActiveTab}
      />

      <div key={activeTab} className="monitor-tab-panel">
        {activeTab === "news_events" ? (
          <NewsEventsTab
            newsSummary={row.news_summary ?? ""}
            newsSources={newsSources}
            eventSignals={futureEvents.signals}
            eventCandidates={futureEvents.eventCandidates}
            watchpoints={futureEvents.watchpoints}
            earningsSignals={fundamentalSignals}
            earningsSources={earningsSources}
            sourceById={sourceById}
          />
        ) : activeTab === "technical" ? (
          <TechnicalTab symbol={row.symbol} technical={row.technical_monitor} />
        ) : (
          <MarketDiscussionTab
            symbol={row.symbol}
            discussion={marketDiscussion}
            isLoading={false}
            isError={false}
          />
        )}
      </div>
    </div>
  );
}

function TickerTabNav({
  activeTab,
  counts,
  onChange,
}: {
  activeTab: TickerDetailTab;
  counts: Record<TickerDetailTab, number>;
  onChange: (tab: TickerDetailTab) => void;
}) {
  return (
    <div
      className="grid min-w-0 gap-1 rounded-lg border border-border/50 bg-card/60 p-1 shadow-sm sm:grid-cols-3"
      role="tablist"
      aria-label="标的详情分类"
    >
      {tickerDetailTabs.map((tab) => {
        const Icon = tab.icon;
        const active = activeTab === tab.key;
        const count = counts[tab.key] ?? 0;
        return (
          <button
            key={tab.key}
            type="button"
            data-tab={tab.key}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.key)}
            className={`monitor-tab-button inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 motion-reduce:transition-none ${
              active
                ? "border-primary/40 bg-background text-primary shadow-sm"
                : "border-transparent text-muted-foreground hover:border-primary/30 hover:bg-muted/30 hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden />
            <span>{tab.label}</span>
            <span
              className={`rounded px-1.5 py-0.5 font-data text-xs tabular-nums ${
                active
                  ? "bg-primary/15 text-primary"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function NewsEventsTab({
  newsSummary,
  newsSources,
  eventSignals,
  eventCandidates,
  watchpoints,
  earningsSignals,
  earningsSources,
  sourceById,
}: {
  newsSummary: string;
  newsSources: MonitorSourceRef[];
  eventSignals: MonitorSignal[];
  eventCandidates: MonitorEventCandidate[];
  watchpoints: MonitorWatchpoint[];
  earningsSignals: MonitorSignal[];
  earningsSources: MonitorSourceRef[];
  sourceById: Map<string, MonitorSourceRef>;
}) {
  return (
    <div className="grid min-w-0 gap-4 2xl:grid-cols-[minmax(0,1.25fr)_360px]">
      <NewsPanel summary={newsSummary} sources={newsSources} />
      <div className="min-w-0 space-y-4">
        <FutureEventsPanel
          signals={eventSignals}
          eventCandidates={eventCandidates}
          watchpoints={watchpoints}
          sourceById={sourceById}
        />
        <EarningsPanel
          signals={earningsSignals}
          sources={earningsSources}
          sourceById={sourceById}
        />
      </div>
    </div>
  );
}

function MarketDiscussionTab({
  symbol,
  discussion,
  isLoading,
  isError,
}: {
  symbol: string;
  discussion?: TwitterTickerDiscussionResponse;
  isLoading: boolean;
  isError: boolean;
}) {
  const topics = buildDiscussionTopics(symbol, discussion);
  const tweets = discussion?.data ?? [];

  return (
    <div className="min-w-0 space-y-4">
      <TwitterDiscussionBrief
        symbol={symbol}
        discussion={discussion}
        isLoading={isLoading}
      />
      <SectionShell title="市场讨论话题" count={topics.length} icon={Radio}>
        <div className="border-b border-border/40 bg-background/25 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded-md border border-border/60 bg-background/35 px-2 py-1">
              {symbol}
            </span>
            <span>过去 24 小时</span>
            <span>标题 / 摘要 / 原文链接</span>
          </div>
        </div>
        {isLoading ? (
          <DiscussionTopicSkeleton />
        ) : isError ? (
          <EmptySection text="Twitter 讨论读取失败，请稍后重试。" />
        ) : topics.length ? (
          <div className="grid gap-3 p-4 xl:grid-cols-2">
            {topics.map((topic) => (
              <DiscussionTopicCard key={topic.key} topic={topic} />
            ))}
          </div>
        ) : (
          <EmptySection text="过去 24 小时暂无结构化匹配的 Twitter 讨论。" />
        )}
      </SectionShell>
      <SectionShell
        title="Twitter 讨论原文"
        count={tweets.length}
        icon={MessageCircle}
      >
        <div className="border-b border-border/40 bg-background/25 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded-md border border-border/60 bg-background/35 px-2 py-1">
              {symbol}
            </span>
            <span>过去 24 小时</span>
            <span>完整样本验证</span>
          </div>
        </div>
        {isLoading ? (
          <TwitterDiscussionSkeleton />
        ) : isError ? (
          <EmptySection text="Twitter 讨论读取失败，请稍后重试。" />
        ) : tweets.length ? (
          <div className="divide-y divide-border/40">
            {tweets.map((tweet) => (
              <TwitterDiscussionRow key={tweet.id} tweet={tweet} />
            ))}
          </div>
        ) : (
          <EmptySection text="过去 24 小时暂无可验证的 Twitter 讨论原文。" />
        )}
      </SectionShell>
    </div>
  );
}

function DiscussionTopicSkeleton() {
  return (
    <div className="grid gap-3 p-4 xl:grid-cols-2">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={`discussion-topic-skeleton-${index}`}
          className="rounded-lg border border-border/50 bg-background/25 px-4 py-4"
        >
          <div className="h-4 w-2/3 animate-pulse rounded bg-muted motion-reduce:animate-none" />
          <div className="mt-4 space-y-2">
            <div className="h-3 animate-pulse rounded bg-muted motion-reduce:animate-none" />
            <div className="h-3 w-11/12 animate-pulse rounded bg-muted motion-reduce:animate-none" />
          </div>
          <div className="mt-4 h-8 w-32 animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
        </div>
      ))}
    </div>
  );
}

function TwitterDiscussionBrief({
  symbol,
  discussion,
  isLoading,
}: {
  symbol: string;
  discussion?: TwitterTickerDiscussionResponse;
  isLoading: boolean;
}) {
  const overview = discussion?.overview;
  const summaryParagraphs = buildDetailedOverviewSummary(symbol, discussion);

  return (
    <SectionShell
      title="讨论摘要"
      count={overview?.tweet_count ?? 0}
      icon={Activity}
    >
      {isLoading ? (
        <TwitterBriefSkeleton />
      ) : (
        <div className="bg-background/25 px-4 py-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md border border-primary/30 bg-primary/10 px-2 py-1 font-data text-xs font-semibold text-primary">
                  {symbol}
                </span>
                {overview?.dominant_stance && (
                  <span
                    className={`rounded-md border px-2 py-1 text-xs ${discussionStanceClass(overview.dominant_stance)}`}
                  >
                    {discussionStanceLabel[overview.dominant_stance]}
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  过去 24 小时
                </span>
              </div>
              <div className="mt-3 max-w-4xl space-y-2 text-sm leading-relaxed text-foreground md:text-base">
                {summaryParagraphs.map((paragraph, index) => (
                  <p key={`discussion-overview-${index}`}>{paragraph}</p>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <DiscussionStat label="讨论" value={overview?.tweet_count ?? 0} />
              <DiscussionStat
                label="作者"
                value={overview?.author_count ?? 0}
              />
              <DiscussionStat label="偏多" value={overview?.bull_count ?? 0} />
              <DiscussionStat label="偏空" value={overview?.bear_count ?? 0} />
            </div>
          </div>
        </div>
      )}
    </SectionShell>
  );
}

function DiscussionTopicCard({ topic }: { topic: DiscussionTopic }) {
  return (
    <article className="flex min-w-0 flex-col rounded-lg border border-border/50 bg-background/25 px-4 py-4 transition-colors duration-200 hover:border-primary/35 hover:bg-muted/20 motion-reduce:transition-none">
      <div className="flex flex-wrap items-center gap-2">
        {topic.stance && (
          <span
            className={`rounded-md border px-2 py-1 text-xs ${discussionStanceClass(topic.stance)}`}
          >
            {discussionStanceLabel[topic.stance]}
          </span>
        )}
        <span className="rounded-md border border-border/60 px-2 py-1 text-xs text-muted-foreground">
          {topic.tweetCount} 条讨论
        </span>
        <span className="rounded-md border border-border/60 px-2 py-1 text-xs text-muted-foreground">
          {topic.authorCount} 位作者
        </span>
      </div>

      <h4 className="mt-3 text-base font-semibold leading-snug text-foreground">
        {topic.title}
      </h4>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-foreground">
        {topic.summary}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {topic.links.length ? (
          topic.links.map((link, index) => (
            <a
              key={`${topic.key}-source-${link.id}-${index}`}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md border border-border/60 bg-background/35 px-2.5 py-1 text-xs text-muted-foreground transition-colors duration-200 hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 motion-reduce:transition-none"
            >
              <span>
                {link.author === "原文"
                  ? "原文讨论"
                  : `原文讨论 @${link.author}`}
              </span>
              {link.createdAt && (
                <span className="text-muted-foreground/80">
                  {formatTime(link.createdAt)}
                </span>
              )}
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          ))
        ) : (
          <span className="text-xs text-muted-foreground">
            暂无可打开的原文链接
          </span>
        )}
      </div>
    </article>
  );
}

function TwitterBriefSkeleton() {
  return (
    <div className="space-y-4 px-4 py-4">
      <div className="h-20 animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
    </div>
  );
}

function DiscussionStat({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="border-l border-border/50 pl-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-data text-base font-semibold tabular-nums">
        {typeof value === "number" ? formatMetricCount(value) : value}
      </div>
    </div>
  );
}

function TwitterDiscussionSkeleton() {
  return (
    <div className="divide-y divide-border/40">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={`discussion-source-skeleton-${index}`} className="px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-3 w-36 animate-pulse rounded bg-muted motion-reduce:animate-none" />
              <div className="h-3 w-24 animate-pulse rounded bg-muted motion-reduce:animate-none" />
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <div className="h-3 animate-pulse rounded bg-muted motion-reduce:animate-none" />
            <div className="h-3 w-10/12 animate-pulse rounded bg-muted motion-reduce:animate-none" />
            <div className="h-3 w-7/12 animate-pulse rounded bg-muted motion-reduce:animate-none" />
          </div>
        </div>
      ))}
    </div>
  );
}

function TwitterDiscussionRow({
  tweet,
}: {
  tweet: TwitterTickerDiscussionTweet;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const author = tweet.author_username || "unknown";
  const url = tweetUrl(tweet);
  const contentTag =
    formatDiscussionTag(tweet.content_type) ||
    formatDiscussionTag(tweet.category);
  const bodyText = tweet.text || "暂无正文";
  const quotedText = tweet.quoted_tweet_text || "";
  const shouldCollapse =
    bodyText.length > 260 ||
    quotedText.length > 180 ||
    bodyText.split("\n").length > 4 ||
    quotedText.split("\n").length > 3;
  const bodyClassName = isExpanded || !shouldCollapse ? "" : "line-clamp-5";
  const quoteClassName = isExpanded || !shouldCollapse ? "" : "line-clamp-3";

  return (
    <article className="px-4 py-4 transition-colors duration-200 hover:bg-muted/20 motion-reduce:transition-none">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background/50 font-data text-xs font-semibold text-muted-foreground">
          @{author.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={`https://x.com/${author}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-data text-sm font-semibold text-foreground transition-colors duration-200 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 motion-reduce:transition-none"
            >
              @{author}
            </a>
            {tweet.created_at && (
              <span className="text-xs text-muted-foreground">
                {formatTime(tweet.created_at)}
              </span>
            )}
            {tweet.stance && (
              <span
                className={`rounded-md border px-2 py-0.5 text-xs ${discussionStanceClass(tweet.stance)}`}
              >
                {discussionStanceLabel[tweet.stance]}
              </span>
            )}
            {contentTag && (
              <span className="rounded-md border border-border/60 bg-background/35 px-2 py-0.5 text-xs text-muted-foreground">
                {contentTag}
              </span>
            )}
          </div>

          {tweet.key_claim && (
            <p className="mt-2 border-l border-primary/50 pl-3 text-sm leading-relaxed text-foreground">
              {tweet.key_claim}
            </p>
          )}

          <p
            className={`mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground ${bodyClassName}`}
          >
            {bodyText}
          </p>

          {quotedText && (
            <div className="mt-3 flex gap-2 rounded-md border border-border/60 bg-background/35 px-3 py-3 text-sm leading-relaxed text-muted-foreground">
              <Quote className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p
                className={`min-w-0 whitespace-pre-wrap break-words ${quoteClassName}`}
              >
                {quotedText}
              </p>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            {shouldCollapse && (
              <button
                type="button"
                onClick={() => setIsExpanded((value) => !value)}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border/60 px-2 py-1 text-xs text-muted-foreground transition-colors duration-200 hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 motion-reduce:transition-none"
                aria-expanded={isExpanded}
              >
                {isExpanded ? (
                  <>
                    收起原文
                    <ChevronUp className="h-3.5 w-3.5" aria-hidden />
                  </>
                ) : (
                  <>
                    展开原文
                    <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                  </>
                )}
              </button>
            )}
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <TweetMetric icon={Heart} label="赞" value={tweet.like_count} />
              <TweetMetric
                icon={Repeat2}
                label="转"
                value={tweet.retweet_count}
              />
              <TweetMetric
                icon={MessageCircle}
                label="评"
                value={tweet.reply_count}
              />
              <TweetMetric icon={Eye} label="看" value={tweet.view_count} />
            </div>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border/60 px-2 py-1 text-xs text-muted-foreground transition-colors duration-200 hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 motion-reduce:transition-none"
            >
              原文
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          </div>
        </div>
      </div>
    </article>
  );
}

function TweetMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Activity;
  label: string;
  value: number;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <Icon className="h-3.5 w-3.5" aria-hidden />
      <span>{formatMetricCount(value)}</span>
      <span>{label}</span>
    </span>
  );
}

function TickerSummary({ row }: { row: MonitorTickerRow }) {
  const quotesQuery = useStockQuotes([row.symbol]);
  const quote = quotesQuery.data?.quotes.find(
    (item) => item.symbol.toUpperCase() === row.symbol.toUpperCase(),
  );
  const currentPrice =
    quote?.price ?? row.technical_monitor?.key_levels?.current_price;
  const dailyChange = quote?.daily_change;
  const freshness = getMonitorFreshness(row);
  const showFreshnessBadge = shouldShowMonitorFreshnessBadge(row);

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-border/50 bg-card/45">
        <div className="grid gap-4 px-4 py-4 md:px-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <CompanyLogo symbol={row.symbol} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <div className="flex items-center gap-2">
                  <span className="font-data text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
                    {row.symbol}
                  </span>
                </div>
                {showFreshnessBadge && (
                  <span
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium ${freshness.badgeClassName}`}
                  >
                    {freshness.label}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" aria-hidden />
                  {freshness.description}
                </span>
              </div>
              <h2 className="mt-3 max-w-5xl text-balance font-editorial text-xl leading-snug tracking-tight text-foreground md:text-2xl">
                {row.headline}
              </h2>
            </div>
          </div>

          <Link
            href={`/stock/${row.symbol}`}
            className="inline-flex h-10 w-full shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md border border-border/70 px-3 text-sm font-medium text-muted-foreground transition-colors duration-200 hover:border-primary/40 hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 motion-reduce:transition-none sm:w-auto"
          >
            个股研究
            <ExternalLink className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </section>

      <section className="min-w-0 overflow-hidden rounded-lg border border-border/50 bg-card/60 shadow-sm">
        <div className="flex items-start justify-between gap-3 border-b border-border/50 bg-card/30 px-4 py-3">
          <div className="flex min-w-0 gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-primary">
              <Activity className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <h3 className="font-editorial text-lg leading-snug text-foreground">
                今日盯盘结论
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                结合新闻、技术面与未来事件生成
              </p>
            </div>
          </div>
        </div>
        <div className="grid gap-4 px-4 py-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
            <div>
              <p className="text-xs text-muted-foreground">当前价</p>
              <p className="mt-1 font-data text-2xl font-semibold leading-tight tabular-nums text-foreground">
                {formatPrice(currentPrice)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">今日涨跌幅</p>
              <p
                className={`mt-1 font-data text-2xl font-semibold leading-tight tabular-nums ${changeTextClass(dailyChange)}`}
              >
                {formatSignedPercent(dailyChange)}
              </p>
            </div>
          </div>
          <div className="min-w-0 border-l border-primary/50 pl-4">
            <p className="text-sm leading-relaxed text-foreground md:text-base">
              {row.ai_take}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function MarketLevelStrip({
  symbol,
  technical,
}: {
  symbol: string;
  technical?: MonitorTechnicalMonitor;
}) {
  const { data: technicalChartData } = useTechnicalData(
    symbol,
    "daily",
    Boolean(symbol),
  );
  const levels: Record<string, number | null | undefined> = useMemo(() => {
    const fallback = {
      current_price:
        technicalChartData?.support_resistance?.current_price ??
        technicalChartData?.current?.price ??
        null,
      support_1: technicalChartData?.support_resistance?.support_1 ?? null,
      resistance_1:
        technicalChartData?.support_resistance?.resistance_1 ?? null,
      sma_20: technicalChartData?.current?.sma_20 ?? null,
      sma_50: technicalChartData?.current?.sma_50 ?? null,
      sma_200: technicalChartData?.current?.sma_200 ?? null,
    };
    const monitorLevels = Object.fromEntries(
      Object.entries(technical?.key_levels ?? {}).filter(
        ([, value]) => typeof value === "number" && Number.isFinite(value),
      ),
    );
    return {
      ...fallback,
      ...monitorLevels,
    };
  }, [technical?.key_levels, technicalChartData]);
  const items = [
    { key: "current_price", label: "当前价" },
    { key: "support_1", label: "支撑 S1" },
    { key: "resistance_1", label: "阻力 R1" },
    { key: "sma_20", label: "MA20" },
    { key: "sma_50", label: "MA50" },
    { key: "sma_200", label: "MA200" },
  ].flatMap((item) => {
    const value = levels[item.key];
    return typeof value === "number" && Number.isFinite(value)
      ? [{ ...item, value }]
      : [];
  });

  if (!items.length) {
    return (
      <section className="rounded-lg border border-border/50 bg-card/45 px-4 py-3">
        <p className="text-sm text-muted-foreground">关键价位等待生成</p>
      </section>
    );
  }

  return (
    <section
      aria-label={`${symbol} 关键价位`}
      className="grid overflow-hidden rounded-lg border border-border/50 bg-card/60 shadow-sm sm:grid-cols-3 xl:grid-cols-6"
    >
      {items.map((item) => (
        <div
          key={item.key}
          className="border-b border-border/40 px-3 py-3 last:border-b-0 sm:border-r sm:last:border-r-0 xl:border-b-0"
        >
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span
              className={`h-1.5 w-1.5 rounded-full ${levelDotClass(item.key)}`}
              aria-hidden
            />
            {item.label}
          </div>
          <div
            className={`mt-1 font-data text-sm font-semibold tabular-nums ${levelValueClass(item.key)}`}
          >
            {formatPrice(item.value)}
          </div>
        </div>
      ))}
    </section>
  );
}

function SectionShell({
  title,
  count,
  icon: Icon,
  children,
}: {
  title: string;
  count?: number;
  icon: typeof Activity;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-border/50 bg-card/60 shadow-sm">
      <div className="flex min-w-0 items-center justify-between gap-3 border-b border-border/50 bg-card/30 px-4 py-3">
        <h3 className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-primary/25 bg-primary/10 text-primary">
            <Icon className="h-4 w-4" aria-hidden />
          </span>
          <span className="min-w-0 truncate font-editorial text-lg leading-snug text-foreground">
            {title}
          </span>
        </h3>
        <div className="flex shrink-0 items-center gap-2">
          {typeof count === "number" && (
            <span className="rounded-md border border-border/50 bg-background/40 px-2 py-1 text-sm text-muted-foreground">
              {count} 条
            </span>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}

function EmptySection({ text }: { text: string }) {
  return (
    <div className="px-4 py-8">
      <p className="rounded-md border border-dashed border-border/60 bg-background/30 px-3 py-3 text-sm leading-relaxed text-muted-foreground">
        {text}
      </p>
    </div>
  );
}

function signalDirection(
  signal: MonitorTechnicalSignal,
): ChartAnnotation["direction"] | null {
  const text = `${signal.title} ${signal.detail}`;
  if (/(突破|站回|金叉|上涨|多头|收回|修复)/.test(text)) return "bullish";
  if (/(跌破|死叉|下跌|空头|转弱|承压)/.test(text)) return "bearish";
  return null;
}

function buildTechnicalAnnotations(
  technical?: MonitorTechnicalMonitor,
): ChartAnnotation[] {
  if (!technical) return [];

  const annotations: ChartAnnotation[] = [];
  const levels = technical.key_levels ?? {};
  const levelAnnotations = [
    {
      key: "support_1",
      type: "support" as const,
      label: "S1",
      direction: "neutral" as const,
    },
    {
      key: "support_2",
      type: "support" as const,
      label: "S2",
      direction: "neutral" as const,
    },
    {
      key: "resistance_1",
      type: "resistance" as const,
      label: "R1",
      direction: "neutral" as const,
    },
    {
      key: "resistance_2",
      type: "resistance" as const,
      label: "R2",
      direction: "neutral" as const,
    },
  ];
  for (const item of levelAnnotations) {
    const price = levels[item.key];
    if (typeof price !== "number" || !Number.isFinite(price)) continue;
    annotations.push({
      type: item.type,
      price,
      label: item.label,
      direction: item.direction,
    });
  }

  const markerDate = technical.updated_at;
  if (markerDate) {
    for (const signal of technical.signals.slice(0, 4)) {
      const direction = signalDirection(signal);
      if (!direction) continue;
      annotations.push({
        type: "signal",
        date: markerDate,
        label: signal.title,
        direction,
      });
    }
  }

  return annotations;
}

function MonitorTradingChart({
  symbol,
  technical,
  height = 560,
}: {
  symbol: string;
  technical?: MonitorTechnicalMonitor;
  height?: number;
}) {
  const {
    data: technicalChartData,
    isLoading,
    isError,
  } = useTechnicalData(symbol, "daily", Boolean(symbol));
  const annotations = useMemo(
    () => buildTechnicalAnnotations(technical),
    [technical],
  );

  return (
    <section className="space-y-3">
      {isLoading ? (
        <div className="h-[420px] animate-pulse rounded-lg border border-border/30 bg-card/30 motion-reduce:animate-none md:h-[500px]" />
      ) : technicalChartData ? (
        <TechnicalChart
          data={technicalChartData}
          annotations={annotations}
          height={height}
        />
      ) : (
        <div className="flex h-[420px] items-center justify-center rounded-lg border border-border/30 bg-card/30">
          <p className="text-sm text-muted-foreground">
            {isError
              ? "完整技术图表加载失败，请稍后重试。"
              : "暂无完整技术图表数据。"}
          </p>
        </div>
      )}
    </section>
  );
}

function TechnicalTab({
  symbol,
  technical,
}: {
  symbol: string;
  technical?: MonitorTechnicalMonitor;
}) {
  return (
    <div className="min-w-0 space-y-4">
      <div className="min-w-0 space-y-3">
        <MonitorTradingChart
          symbol={symbol}
          technical={technical}
          height={560}
        />
        <MarketLevelStrip symbol={symbol} technical={technical} />
      </div>
      <TechnicalPanel technical={technical} />
    </div>
  );
}

function TechnicalDimensionCard({
  dimension,
}: {
  dimension?: MonitorTechnicalViewDimension;
}) {
  if (!dimension?.state && !dimension?.explanation) return null;

  return (
    <article className="min-w-0 rounded-md border border-border/50 bg-background/35 px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold">{dimension.label || "结构"}</h4>
        {dimension.state && (
          <span
            className={`shrink-0 rounded-md border px-2 py-1 text-xs ${technicalStateClass(dimension.state)}`}
          >
            {dimension.state}
          </span>
        )}
      </div>
      {dimension.explanation && (
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {dimension.explanation}
        </p>
      )}
    </article>
  );
}

function TechnicalPanel({
  technical,
}: {
  technical?: MonitorTechnicalMonitor;
}) {
  const signals = technical?.signals ?? [];
  const summary = technical?.summary?.trim();
  const view = technical?.technical_view;
  const dimensions = [
    view?.trend,
    view?.momentum,
    view?.location,
    view?.volatility,
  ].filter((dimension): dimension is MonitorTechnicalViewDimension =>
    Boolean(dimension?.state || dimension?.explanation),
  );
  const hasView = Boolean(view?.verdict) || dimensions.length > 0;
  const hasAnyData = hasView || Boolean(summary);

  return (
    <div className="space-y-4">
      <SectionShell title="技术结构" count={signals.length} icon={LineChart}>
        {!hasAnyData ? (
          <EmptySection text="暂无技术盯盘总结。完整图表仍会尝试读取个股技术数据；重新生成今日监控后，这里会显示趋势、动能、位置和波动摘要。" />
        ) : hasView ? (
          <div>
            <div className="px-4 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h4 className="text-sm font-semibold">技术面判断</h4>
                {technical?.updated_at && (
                  <span className="text-xs text-muted-foreground">
                    更新 {formatDate(technical.updated_at)}
                  </span>
                )}
              </div>
              <p className="mt-2 text-base leading-relaxed text-foreground">
                {view?.verdict || summary}
              </p>
            </div>
            {dimensions.length > 0 && (
              <div className="grid gap-3 border-t border-border/40 px-4 py-4 md:grid-cols-2 xl:grid-cols-4">
                {dimensions.map((dimension) => (
                  <TechnicalDimensionCard
                    key={`${dimension.label}-${dimension.state}`}
                    dimension={dimension}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-sm font-semibold">技术面判断</h4>
              {technical?.updated_at && (
                <span className="text-xs text-muted-foreground">
                  更新 {formatDate(technical.updated_at)}
                </span>
              )}
            </div>
            <p className="mt-2 text-base leading-relaxed text-foreground">
              {summary}
            </p>
          </div>
        )}
      </SectionShell>
    </div>
  );
}

function SignalCard({
  signal,
  sourceById,
}: {
  signal: MonitorSignal;
  sourceById: Map<string, MonitorSourceRef>;
}) {
  const linkedSources = signal.source_ref_ids
    .map((id) => sourceById.get(id))
    .filter((source): source is MonitorSourceRef => Boolean(source));

  return (
    <article className="px-4 py-4 transition-colors duration-200 hover:bg-muted/20 motion-reduce:transition-none">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background/35 px-2 py-1 text-xs ${signalTone(signal.type)}`}
        >
          <SignalTypeIcon type={signal.type} className="h-3.5 w-3.5" />
          {signalLabel[signal.type]}
        </span>
        {signal.observed_at && (
          <span className="text-xs text-muted-foreground">
            {formatTime(signal.observed_at)}
          </span>
        )}
      </div>
      <h4 className="mt-3 break-words text-base font-semibold leading-snug">
        {signal.title}
      </h4>
      <p className="mt-2 text-sm leading-relaxed text-foreground">
        {signal.summary}
      </p>
      {signal.why_it_matters && (
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {signal.why_it_matters}
        </p>
      )}
      {linkedSources.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {linkedSources.map((source) => (
            <SourceChip key={`${signal.title}-${source.id}`} source={source} />
          ))}
        </div>
      )}
    </article>
  );
}

function NewsPanel({
  summary,
  sources,
}: {
  summary: string;
  sources: MonitorSourceRef[];
}) {
  const trimmedSummary = summary.trim();

  return (
    <SectionShell title="新闻" count={sources.length} icon={Newspaper}>
      {sources.length === 0 ? (
        <EmptySection text="暂无新闻信号。下次接入后，这里展示今天最值得关注的公司新闻。" />
      ) : (
        <div>
          <div className="border-b border-border/50 bg-background/25 px-4 py-4">
            <div className="border-l border-primary/50 pl-4">
              <h4 className="font-editorial text-lg leading-snug text-foreground">
                新闻总结
              </h4>
              <p className="mt-2 text-sm leading-relaxed text-foreground">
                {trimmedSummary ||
                  "暂无新闻总结。重新生成今日监控后，这里会总结过去 24 小时英文新闻。"}
              </p>
            </div>
          </div>
          <div className="divide-y divide-border/40">
            {sources.map((source) => (
              <SourceRow key={source.id} source={source} compact />
            ))}
          </div>
        </div>
      )}
    </SectionShell>
  );
}

function FutureEventsPanel({
  signals,
  eventCandidates,
  watchpoints,
  sourceById,
}: {
  signals: MonitorSignal[];
  eventCandidates: MonitorEventCandidate[];
  watchpoints: MonitorWatchpoint[];
  sourceById: Map<string, MonitorSourceRef>;
}) {
  const datedCandidates = eventCandidates.filter(
    (candidate) => candidate.event_date && candidate.date_precision === "exact",
  );
  const openCandidates = eventCandidates.filter(
    (candidate) =>
      !candidate.event_date || candidate.date_precision !== "exact",
  );
  const totalCount =
    signals.length + eventCandidates.length + watchpoints.length;

  return (
    <SectionShell title="未来事件" count={totalCount} icon={CalendarDays}>
      <div className="divide-y divide-border/40">
        {datedCandidates.map((candidate, index) => (
          <EventCandidateCard
            key={`dated-event-${candidate.id || candidate.title}-${index}`}
            candidate={candidate}
            sourceById={sourceById}
          />
        ))}
        {openCandidates.map((candidate, index) => (
          <EventCandidateCard
            key={`open-event-${candidate.id || candidate.title}-${index}`}
            candidate={candidate}
            sourceById={sourceById}
          />
        ))}
        {signals.map((signal, index) => (
          <SignalCard
            key={`event-signal-${signal.title}-${index}`}
            signal={signal}
            sourceById={sourceById}
          />
        ))}
        {watchpoints.length > 0 ? (
          watchpoints.slice(0, 5).map((watchpoint, index) => {
            const linkedSources = watchpoint.source_ref_ids
              .map((id) => sourceById.get(id))
              .filter((source): source is MonitorSourceRef => Boolean(source));

            return (
              <article
                key={`${watchpoint.title}-${index}`}
                className="px-4 py-4 transition-colors duration-200 hover:bg-muted/20 motion-reduce:transition-none"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                    {formatDate(watchpoint.date)}
                  </span>
                </div>
                <h4 className="mt-3 break-words text-base font-semibold leading-snug">
                  {watchpoint.title}
                </h4>
                <p className="mt-2 text-sm leading-relaxed text-foreground">
                  {watchpoint.what_to_watch}
                </p>
                {watchpoint.why_it_matters && (
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {watchpoint.why_it_matters}
                  </p>
                )}
                {linkedSources.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {linkedSources.map((source) => (
                      <SourceChip
                        key={`${watchpoint.title}-${source.id}`}
                        source={source}
                      />
                    ))}
                  </div>
                )}
              </article>
            );
          })
        ) : totalCount === 0 ? (
          <EmptySection text="暂无未来事件。下次接入财报日历、宏观日历、产品发布和监管节点后在这里显示。" />
        ) : null}
      </div>
    </SectionShell>
  );
}

function EventCandidateCard({
  candidate,
  sourceById,
}: {
  candidate: MonitorEventCandidate;
  sourceById: Map<string, MonitorSourceRef>;
}) {
  const linkedSources = candidate.source_ref_ids
    .map((id) => sourceById.get(id))
    .filter((source): source is MonitorSourceRef => Boolean(source));
  const dateLabel =
    candidate.event_date && candidate.date_precision === "exact"
      ? formatDate(candidate.event_date)
      : "待确认";

  return (
    <article className="px-4 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
          {dateLabel}
        </span>
        <span className="rounded-md border border-border/60 px-2 py-1 text-xs text-muted-foreground">
          {eventTypeLabel[candidate.event_type] ?? "事件"}
        </span>
        <span className="rounded-md border border-border/60 px-2 py-1 text-xs text-muted-foreground">
          {eventStatusLabel[candidate.status] ?? candidate.status}
        </span>
        <span
          className={`rounded-md border px-2 py-1 text-xs ${confidenceClass(candidate.confidence)}`}
        >
          {confidenceLabel[candidate.confidence]}
        </span>
      </div>
      <h4 className="mt-3 text-sm font-semibold leading-snug">
        {candidate.title}
      </h4>
      {candidate.summary && (
        <p className="mt-2 text-sm leading-relaxed text-foreground">
          {candidate.summary}
        </p>
      )}
      {candidate.why_it_matters && (
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {candidate.why_it_matters}
        </p>
      )}
      {linkedSources.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {linkedSources.map((source) => (
            <SourceChip
              key={`${candidate.id || candidate.title}-${source.id}`}
              source={source}
            />
          ))}
        </div>
      )}
    </article>
  );
}

function EarningsPanel({
  signals,
  sources,
  sourceById,
}: {
  signals: MonitorSignal[];
  sources: MonitorSourceRef[];
  sourceById: Map<string, MonitorSourceRef>;
}) {
  return (
    <SectionShell
      title="财报"
      count={signals.length + sources.length}
      icon={CalendarDays}
    >
      {signals.length === 0 && sources.length === 0 ? (
        <EmptySection text="暂无财报信号。下次接入 EPS、收入、指引、利润率和管理层重点后在这里显示。" />
      ) : (
        <div className="divide-y divide-border/40">
          {signals.map((signal, index) => (
            <SignalCard
              key={`earnings-signal-${signal.title}-${index}`}
              signal={signal}
              sourceById={sourceById}
            />
          ))}
          {sources.map((source) => (
            <SourceRow key={source.id} source={source} compact />
          ))}
        </div>
      )}
    </SectionShell>
  );
}

function SourceChip({ source }: { source: MonitorSourceRef }) {
  const title = sourceDisplayTitle(source);
  const site = sourceSiteLabel(source);
  const content = (
    <>
      {site && <span className="shrink-0 text-muted-foreground">{site}</span>}
      {site && <span className="shrink-0 text-muted-foreground/70">/</span>}
      <span className="truncate">{title}</span>
      {source.url && <ExternalLink className="h-3 w-3" aria-hidden />}
    </>
  );

  if (source.url) {
    return (
      <a
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex max-w-full cursor-pointer items-center gap-1.5 rounded-md border border-border/60 bg-background/35 px-2 py-1 text-xs text-muted-foreground transition-colors duration-200 hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 motion-reduce:transition-none"
      >
        {content}
      </a>
    );
  }

  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border/60 px-2 py-1 text-xs text-muted-foreground">
      {content}
    </span>
  );
}

function SourceRow({
  source,
  compact = false,
}: {
  source: MonitorSourceRef;
  compact?: boolean;
}) {
  const title = sourceDisplayTitle(source) || "Untitled source";
  const site = sourceSiteLabel(source);
  const body = (
    <div className="flex min-w-0 items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md border border-border/60 px-2 py-0.5 text-xs text-muted-foreground">
            {sourceTypeLabel(source.type)}
          </span>
          {site && (
            <span className="rounded-md border border-primary/20 bg-primary/5 px-2 py-0.5 text-xs font-medium text-primary">
              {site}
            </span>
          )}
          {source.published_at && (
            <span className="text-xs text-muted-foreground">
              {formatDate(source.published_at)}
            </span>
          )}
        </div>
        <p
          className={`${compact ? "mt-1" : "mt-2"} line-clamp-2 break-words text-sm font-medium leading-relaxed`}
        >
          {title}
        </p>
      </div>
      {source.url && (
        <ExternalLink
          className="mt-1 h-4 w-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
      )}
    </div>
  );

  if (source.url) {
    return (
      <a
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block cursor-pointer px-4 py-3 transition-colors duration-200 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30 motion-reduce:transition-none"
      >
        {body}
      </a>
    );
  }

  return <div className="px-4 py-3">{body}</div>;
}

function MonitorSkeleton() {
  return (
    <main className="min-h-screen bg-background">
      <div className="border-b border-border/50">
        <div className="mx-auto w-full max-w-[1800px] px-4 py-8 md:py-10 lg:px-5">
          <div className="monitor-skeleton-block h-3 w-36 rounded-md bg-muted" />
          <div className="monitor-skeleton-block mt-4 h-10 w-52 rounded-md bg-muted" />
          <div className="monitor-skeleton-block mt-3 h-5 max-w-lg rounded-md bg-muted" />
        </div>
      </div>
      <div className="mx-auto grid w-full max-w-[1800px] gap-4 px-4 py-4 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)]">
        <div className="monitor-skeleton-block h-96 rounded-lg border border-border/50 bg-card/40" />
        <div className="space-y-4">
          <div className="monitor-skeleton-block h-[620px] rounded-lg border border-border/50 bg-card/40" />
          <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.35fr)_360px]">
            <div className="monitor-skeleton-block h-96 rounded-lg border border-border/50 bg-card/40" />
            <div className="monitor-skeleton-block h-96 rounded-lg border border-border/50 bg-card/40" />
          </div>
        </div>
      </div>
    </main>
  );
}

function EmptyState() {
  return (
    <div className="monitor-workbench-enter mx-auto flex min-h-[55vh] max-w-5xl flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="monitor-empty-icon flex h-12 w-12 items-center justify-center rounded-full border border-primary/30 bg-primary/10">
        <Bell className="h-6 w-6 text-primary" aria-hidden />
      </div>
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">还没有添加自选标的</h1>
        <p className="text-sm text-muted-foreground">
          添加股票代码后，监控台会展示新闻、技术面和未来观察点。
        </p>
      </div>
      <Link
        href="/for-you/watchlist"
        className="monitor-action-button inline-flex h-11 cursor-pointer items-center gap-2 rounded-md border border-primary/30 px-3 text-sm font-medium text-primary transition-colors duration-200 hover:border-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 motion-reduce:transition-none"
      >
        添加自选股
      </Link>
    </div>
  );
}
