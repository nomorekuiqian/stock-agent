'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Mail,
  MessageSquare,
  RefreshCw,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react';
import { getAccessTokenAsync, getAccessTokenSync } from '@/contexts/AuthContext';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api';

type EmailRating = 'satisfied' | 'neutral' | 'dissatisfied';
type ContactRating = 'helpful' | 'neutral' | 'not_helpful';
type RatingFilter<T extends string> = 'all' | T;

export interface DailyEmailStats {
  date: string;
  satisfied?: number;
  neutral?: number;
  dissatisfied?: number;
  total?: number;
}

export interface EmailFeedbackStats {
  total: number;
  breakdown: {
    satisfied?: number;
    neutral?: number;
    dissatisfied?: number;
  };
  satisfaction_rate: number;
  daily: DailyEmailStats[];
}

export interface EmailFeedbackRecord {
  email: string;
  rating: EmailRating;
  report_date: string;
  created_at?: string;
}

export interface EmailFeedbackList {
  data: EmailFeedbackRecord[];
  total_records: number;
  _error?: string | null;
}

export interface UserFeedbackItem {
  rating: ContactRating;
  email: string | null;
  message: string | null;
  created_at: string;
}

export interface UserFeedbackList {
  data: UserFeedbackItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface FeedbackDashboardData {
  date_range: {
    start_date: string;
    end_date: string;
  };
  stats: EmailFeedbackStats;
  userFeedback: UserFeedbackList;
  emailList: EmailFeedbackList;
}

interface FeedbackDashboardProps {
  initialData: FeedbackDashboardData | null;
  initialDays: number;
  initialError: string | null;
  pageSize: number;
}

const DAY_OPTIONS = [7, 14, 30, 90];

const EMAIL_RATING_META: Record<EmailRating, { label: string; text: string; bg: string }> = {
  satisfied: {
    label: '满意',
    text: 'text-emerald-600',
    bg: 'bg-emerald-500',
  },
  neutral: {
    label: '中性',
    text: 'text-amber-600',
    bg: 'bg-amber-500',
  },
  dissatisfied: {
    label: '不满意',
    text: 'text-red-500',
    bg: 'bg-red-500',
  },
};

const CONTACT_RATING_META: Record<ContactRating, { label: string; className: string }> = {
  helpful: {
    label: '很有帮助',
    className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600',
  },
  neutral: {
    label: '还行',
    className: 'border-amber-500/30 bg-amber-500/10 text-amber-600',
  },
  not_helpful: {
    label: '不太行',
    className: 'border-red-500/30 bg-red-500/10 text-red-500',
  },
};

function isoDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function buildDateRange(days: number): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - Math.max(days - 1, 0));
  return {
    startDate: isoDateOnly(start),
    endDate: isoDateOnly(end),
  };
}

function addUtcDays(date: string, days: number): string {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function countDaily(row: DailyEmailStats): number {
  return row.total ?? (row.satisfied ?? 0) + (row.neutral ?? 0) + (row.dissatisfied ?? 0);
}

function buildDailySeries(rows: DailyEmailStats[], startDate: string, endDate: string): DailyEmailStats[] {
  const byDate = new Map(rows.map((row) => [row.date, row]));
  const series: DailyEmailStats[] = [];
  let cursor = startDate;

  while (cursor <= endDate) {
    const row = byDate.get(cursor);
    series.push({
      date: cursor,
      satisfied: row?.satisfied ?? 0,
      neutral: row?.neutral ?? 0,
      dissatisfied: row?.dissatisfied ?? 0,
      total: row ? countDaily(row) : 0,
    });
    cursor = addUtcDays(cursor, 1);
  }

  return series;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}

function formatRate(rate: number): string {
  const pct = rate > 1 ? rate : rate * 100;
  return `${Math.round(pct)}%`;
}

function shortDate(date: string): string {
  if (!date) return '-';
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
  }).format(parsed);
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

function recordDate(record: EmailFeedbackRecord): string {
  return record.report_date || record.created_at?.slice(0, 10) || '';
}

function KpiCard({
  label,
  value,
  detail,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  detail: string;
  tone?: 'neutral' | 'good' | 'warn' | 'bad';
}) {
  const toneClass = {
    neutral: 'text-foreground',
    good: 'text-emerald-600',
    warn: 'text-amber-600',
    bad: 'text-red-500',
  }[tone];

  return (
    <section className="rounded-lg border border-border/40 bg-card/60 p-4">
      <div className="text-xs font-medium tracking-[0.15em] text-muted-foreground uppercase">
        {label}
      </div>
      <div className={`mt-3 font-data text-3xl font-semibold leading-tight ${toneClass}`}>
        {value}
      </div>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{detail}</p>
    </section>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border/50 bg-muted/20 p-6 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
    </div>
  );
}

function RatingChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
        active
          ? 'border-primary/50 bg-primary/10 text-primary'
          : 'border-border/50 text-muted-foreground hover:border-border hover:text-foreground'
      }`}
    >
      {label}
    </button>
  );
}

export function FeedbackDashboard({
  initialData,
  initialDays,
  initialError,
  pageSize,
}: FeedbackDashboardProps) {
  const [data, setData] = useState<FeedbackDashboardData | null>(initialData);
  const [days, setDays] = useState(initialDays);
  const [page, setPage] = useState(initialData?.userFeedback.page ?? 1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [emailRating, setEmailRating] = useState<RatingFilter<EmailRating>>('all');
  const [contactRating, setContactRating] = useState<RatingFilter<ContactRating>>('all');

  const load = useCallback(async (nextDays = days, nextPage = page) => {
    setLoading(true);
    setError(null);

    try {
      const token = getAccessTokenSync() ?? (await getAccessTokenAsync());
      if (!token) {
        setError('登录状态已过期，请重新登录后再打开反馈看板。');
        return;
      }

      const { startDate, endDate } = buildDateRange(nextDays);
      const params = new URLSearchParams({
        start_date: startDate,
        end_date: endDate,
        page: String(nextPage),
        page_size: String(pageSize),
      });

      const res = await fetch(`${API_BASE}/admin/feedback?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });

      if (!res.ok) {
        const text = await res.text();
        setError(`刷新失败: HTTP ${res.status} ${text.slice(0, 160)}`);
        return;
      }

      const next = (await res.json()) as FeedbackDashboardData;
      setData(next);
      setDays(nextDays);
      setPage(next.userFeedback.page);
      setSelectedDate(null);
    } catch (e) {
      setError(`刷新失败: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [days, page, pageSize]);

  const dailyRows = useMemo(() => {
    if (!data) return [];
    return buildDailySeries(
      data.stats.daily,
      data.date_range.start_date,
      data.date_range.end_date,
    );
  }, [data]);

  const emailRecords = data?.emailList.data ?? [];
  const selectedDateRecords = selectedDate
    ? emailRecords.filter((record) => recordDate(record) === selectedDate)
    : emailRecords;

  const filteredEmailRecords = selectedDateRecords.filter((record) => (
    emailRating === 'all' || record.rating === emailRating
  ));

  const filteredContactRows = (data?.userFeedback.data ?? []).filter((item) => (
    contactRating === 'all' || item.rating === contactRating
  ));

  const maxDailyTotal = Math.max(...dailyRows.map((row) => countDaily(row)), 1);
  const totalEmailFeedback = data?.stats.total ?? 0;
  const satisfied = data?.stats.breakdown.satisfied ?? 0;
  const neutral = data?.stats.breakdown.neutral ?? 0;
  const dissatisfied = data?.stats.breakdown.dissatisfied ?? 0;
  const contactTotal = data?.userFeedback.total ?? 0;
  const contactPageBreakdown = useMemo(() => {
    const rows = data?.userFeedback.data ?? [];
    return rows.reduce<Record<ContactRating, number>>(
      (acc, item) => {
        acc[item.rating] += 1;
        return acc;
      },
      { helpful: 0, neutral: 0, not_helpful: 0 },
    );
  }, [data]);

  const negativeEmailRecords = emailRecords.filter((record) => record.rating === 'dissatisfied');
  const negativeContactRows = (data?.userFeedback.data ?? []).filter((item) => item.rating === 'not_helpful');
  const actionableCount = negativeEmailRecords.length + negativeContactRows.length;
  const activeRange = data
    ? `${data.date_range.start_date} 至 ${data.date_range.end_date}`
    : `最近 ${days} 天`;

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-6">
        <header className="flex flex-col gap-5 border-b border-border/40 pb-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-3xl">
            <Link
              href="/admin"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-primary"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              管理后台
            </Link>
            <div className="mt-5 flex items-center gap-3">
              <div className="h-px w-12 bg-gradient-to-r from-primary to-transparent" />
              <span className="text-xs font-medium uppercase tracking-[0.18em] text-primary">
                Feedback Ops
              </span>
            </div>
            <h1 className="mt-3 font-editorial text-4xl leading-tight text-foreground md:text-5xl">
              用户反馈 dashboard
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
              汇总邮件内嵌反馈和 Contact 页面留言，快速判断哪些日报有效、哪些用户需要跟进。
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex rounded-lg border border-border/50 bg-card/50 p-1">
              {DAY_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    setDays(option);
                    setPage(1);
                    void load(option, 1);
                  }}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
                    days === option
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {option} 天
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => { void load(days, page); }}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-border/60 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/50 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
              刷新
            </button>
          </div>
        </header>

        {error && (
          <div className="mt-6 flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-500">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
            <div>
              <p className="font-medium">无法加载最新反馈数据</p>
              <p className="mt-1 break-words text-red-500/90">{error}</p>
            </div>
          </div>
        )}

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="邮件反馈"
            value={formatNumber(totalEmailFeedback)}
            detail={`${activeRange}，明细 ${formatNumber(data?.emailList.total_records ?? 0)} 条`}
            tone="neutral"
          />
          <KpiCard
            label="满意度"
            value={formatRate(data?.stats.satisfaction_rate ?? 0)}
            detail={`满意 ${formatNumber(satisfied)}，不满意 ${formatNumber(dissatisfied)}，中性 ${formatNumber(neutral)}`}
            tone={(data?.stats.satisfaction_rate ?? 0) >= 0.7 ? 'good' : 'warn'}
          />
          <KpiCard
            label="Contact 反馈"
            value={formatNumber(contactTotal)}
            detail={`当前页：有帮助 ${contactPageBreakdown.helpful}，不太行 ${contactPageBreakdown.not_helpful}`}
            tone="neutral"
          />
          <KpiCard
            label="待跟进信号"
            value={formatNumber(actionableCount)}
            detail="来自不满意邮件反馈和不太行留言，优先排查内容质量或交付问题。"
            tone={actionableCount > 0 ? 'bad' : 'good'}
          />
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
          <div className="rounded-lg border border-border/40 bg-card/50">
            <div className="flex flex-col gap-2 border-b border-border/40 px-5 py-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-foreground">邮件反馈趋势</h2>
                <p className="text-sm text-muted-foreground">点击某一天查看具体邮箱和评分。</p>
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                {(['satisfied', 'neutral', 'dissatisfied'] as EmailRating[]).map((rating) => (
                  <span key={rating} className="inline-flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-sm ${EMAIL_RATING_META[rating].bg}`} />
                    {EMAIL_RATING_META[rating].label}
                  </span>
                ))}
              </div>
            </div>

            <div className="p-5">
              {dailyRows.length === 0 ? (
                <EmptyState title="暂无邮件反馈" detail="当前时间范围内还没有邮件内嵌反馈。" />
              ) : (
                <div className="overflow-x-auto">
                  <div className="flex min-w-[720px] items-end gap-1">
                    {dailyRows.map((row) => {
                      const total = countDaily(row);
                      const height = total > 0 ? Math.max((total / maxDailyTotal) * 100, 5) : 0;
                      const satisfiedPct = total > 0 ? ((row.satisfied ?? 0) / total) * 100 : 0;
                      const neutralPct = total > 0 ? ((row.neutral ?? 0) / total) * 100 : 0;
                      const dissatisfiedPct = Math.max(0, 100 - satisfiedPct - neutralPct);
                      const active = selectedDate === row.date;

                      return (
                        <button
                          key={row.date}
                          type="button"
                          onClick={() => setSelectedDate(active ? null : row.date)}
                          title={`${row.date}: ${total} 条反馈`}
                          className={`group flex min-w-8 flex-1 flex-col items-center gap-2 rounded-md px-1 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
                            active ? 'bg-primary/10' : 'hover:bg-muted/50'
                          }`}
                        >
                          <div className="flex h-36 w-full items-end">
                            <div
                              className="flex w-full flex-col-reverse overflow-hidden rounded-sm bg-muted/40 transition-opacity group-hover:opacity-90"
                              style={{ height: `${height}%`, minHeight: total > 0 ? 6 : 0 }}
                            >
                              <div className="bg-emerald-500" style={{ height: `${satisfiedPct}%` }} />
                              <div className="bg-amber-500" style={{ height: `${neutralPct}%` }} />
                              <div className="bg-red-500" style={{ height: `${dissatisfiedPct}%` }} />
                            </div>
                          </div>
                          <span className="font-data text-xs text-muted-foreground">{total || ''}</span>
                          <span className={`text-xs ${active ? 'text-foreground' : 'text-muted-foreground'}`}>
                            {shortDate(row.date)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {selectedDate && (
                <div className="mt-5 rounded-lg border border-border/40 bg-background/40">
                  <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">{selectedDate} 明细</p>
                      <p className="text-xs text-muted-foreground">
                        {selectedDateRecords.length} 条邮件反馈
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedDate(null)}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                    >
                      清除选择
                    </button>
                  </div>
                  {selectedDateRecords.length === 0 ? (
                    <div className="p-4 text-sm text-muted-foreground">
                      统计里有该日期，但明细接口未返回邮箱记录。
                    </div>
                  ) : (
                    <div className="max-h-56 overflow-auto">
                      <table className="w-full text-sm">
                        <tbody>
                          {selectedDateRecords.map((record, index) => (
                            <tr key={`${record.email}-${record.report_date}-${index}`} className="border-b border-border/30 last:border-0">
                              <td className="px-4 py-2 font-data text-xs text-muted-foreground">{record.email}</td>
                              <td className="px-4 py-2 text-right">
                                <span className={`text-sm font-medium ${EMAIL_RATING_META[record.rating].text}`}>
                                  {EMAIL_RATING_META[record.rating].label}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <aside className="rounded-lg border border-border/40 bg-card/50">
            <div className="border-b border-border/40 px-5 py-4">
              <h2 className="text-lg font-semibold tracking-tight text-foreground">跟进队列</h2>
              <p className="text-sm text-muted-foreground">优先看负向反馈和带文字的留言。</p>
            </div>
            <div className="space-y-4 p-5">
              {actionableCount === 0 ? (
                <EmptyState title="没有明显负向信号" detail="当前范围内没有不满意邮件或不太行留言。" />
              ) : (
                <>
                  <div className="flex items-center justify-between rounded-lg border border-red-500/20 bg-red-500/10 p-4">
                    <div className="flex items-center gap-3">
                      <ThumbsDown className="h-4 w-4 text-red-500" aria-hidden="true" />
                      <div>
                        <p className="text-sm font-medium text-foreground">邮件不满意</p>
                        <p className="text-xs text-muted-foreground">当前范围内</p>
                      </div>
                    </div>
                    <span className="font-data text-2xl font-semibold text-red-500">
                      {negativeEmailRecords.length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-amber-500/20 bg-amber-500/10 p-4">
                    <div className="flex items-center gap-3">
                      <MessageSquare className="h-4 w-4 text-amber-600" aria-hidden="true" />
                      <div>
                        <p className="text-sm font-medium text-foreground">Contact 不太行</p>
                        <p className="text-xs text-muted-foreground">当前页</p>
                      </div>
                    </div>
                    <span className="font-data text-2xl font-semibold text-amber-600">
                      {negativeContactRows.length}
                    </span>
                  </div>
                </>
              )}

              <div className="rounded-lg border border-border/40 bg-background/30 p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <ThumbsUp className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                  正向反馈
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {formatNumber(satisfied)} 条满意邮件反馈，当前页 {formatNumber(contactPageBreakdown.helpful)} 条 Contact 正向反馈。
                </p>
              </div>
            </div>
          </aside>
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-2">
          <div className="rounded-lg border border-border/40 bg-card/50">
            <div className="flex flex-col gap-3 border-b border-border/40 px-5 py-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground">
                  <Mail className="h-4 w-4 text-primary" aria-hidden="true" />
                  邮件反馈明细
                </h2>
                <p className="text-sm text-muted-foreground">
                  {selectedDate ? `${selectedDate} · ` : ''}{filteredEmailRecords.length} 条记录
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <RatingChip active={emailRating === 'all'} label="全部" onClick={() => setEmailRating('all')} />
                {(['satisfied', 'neutral', 'dissatisfied'] as EmailRating[]).map((rating) => (
                  <RatingChip
                    key={rating}
                    active={emailRating === rating}
                    label={EMAIL_RATING_META[rating].label}
                    onClick={() => setEmailRating(rating)}
                  />
                ))}
              </div>
            </div>

            {data?.emailList._error && (
              <div className="border-b border-red-500/20 bg-red-500/10 px-5 py-3 text-sm text-red-500">
                邮件明细加载失败: {data.emailList._error}
              </div>
            )}

            {filteredEmailRecords.length === 0 ? (
              <div className="p-5">
                <EmptyState title="没有匹配的邮件反馈" detail="调整日期或评分筛选后再查看。" />
              </div>
            ) : (
              <div className="max-h-[520px] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card">
                    <tr className="border-b border-border/40 text-left text-xs font-medium text-muted-foreground">
                      <th className="px-5 py-3">邮箱</th>
                      <th className="px-5 py-3">评价</th>
                      <th className="px-5 py-3">日报日期</th>
                      <th className="px-5 py-3">提交时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEmailRecords.map((record, index) => (
                      <tr key={`${record.email}-${record.report_date}-${index}`} className="border-b border-border/30 last:border-0 hover:bg-muted/30">
                        <td className="px-5 py-3 font-data text-xs text-foreground">{record.email}</td>
                        <td className="px-5 py-3">
                          <span className={`font-medium ${EMAIL_RATING_META[record.rating].text}`}>
                            {EMAIL_RATING_META[record.rating].label}
                          </span>
                        </td>
                        <td className="px-5 py-3 font-data text-xs text-muted-foreground">{record.report_date}</td>
                        <td className="px-5 py-3 font-data text-xs text-muted-foreground">{formatDateTime(record.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border/40 bg-card/50">
            <div className="flex flex-col gap-3 border-b border-border/40 px-5 py-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground">
                  <MessageSquare className="h-4 w-4 text-primary" aria-hidden="true" />
                  Contact 反馈 inbox
                </h2>
                <p className="text-sm text-muted-foreground">
                  第 {data?.userFeedback.page ?? page} 页，共 {formatNumber(contactTotal)} 条
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <RatingChip active={contactRating === 'all'} label="全部" onClick={() => setContactRating('all')} />
                {(['helpful', 'neutral', 'not_helpful'] as ContactRating[]).map((rating) => (
                  <RatingChip
                    key={rating}
                    active={contactRating === rating}
                    label={CONTACT_RATING_META[rating].label}
                    onClick={() => setContactRating(rating)}
                  />
                ))}
              </div>
            </div>

            {filteredContactRows.length === 0 ? (
              <div className="p-5">
                <EmptyState title="没有匹配的 Contact 反馈" detail="当前页没有对应评分的留言。" />
              </div>
            ) : (
              <div className="divide-y divide-border/30">
                {filteredContactRows.map((item, index) => (
                  <article key={`${item.email}-${item.created_at}-${index}`} className="px-5 py-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-md border px-2 py-1 text-xs font-medium ${CONTACT_RATING_META[item.rating].className}`}>
                          {CONTACT_RATING_META[item.rating].label}
                        </span>
                        {item.email && (
                          <span className="font-data text-xs text-muted-foreground">{item.email}</span>
                        )}
                      </div>
                      <time className="font-data text-xs text-muted-foreground">
                        {formatDateTime(item.created_at)}
                      </time>
                    </div>
                    {item.message ? (
                      <p className="mt-3 text-sm leading-relaxed text-foreground">{item.message}</p>
                    ) : (
                      <p className="mt-3 text-sm text-muted-foreground">用户没有留下文字说明。</p>
                    )}
                  </article>
                ))}
              </div>
            )}

            {(data?.userFeedback.total_pages ?? 0) > 1 && (
              <div className="flex items-center justify-between border-t border-border/40 px-5 py-4">
                <button
                  type="button"
                  onClick={() => {
                    const next = Math.max(1, page - 1);
                    setPage(next);
                    void load(days, next);
                  }}
                  disabled={loading || page <= 1}
                  className="inline-flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  上一页
                </button>
                <span className="font-data text-xs text-muted-foreground">
                  {page} / {data?.userFeedback.total_pages ?? 1}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const next = Math.min(data?.userFeedback.total_pages ?? page, page + 1);
                    setPage(next);
                    void load(days, next);
                  }}
                  disabled={loading || page >= (data?.userFeedback.total_pages ?? 1)}
                  className="inline-flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                >
                  下一页
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
