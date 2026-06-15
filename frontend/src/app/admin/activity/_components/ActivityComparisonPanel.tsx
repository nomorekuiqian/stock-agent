'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { getAccessTokenAsync, getAccessTokenSync } from '@/contexts/AuthContext';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api';

export interface ActivityDailyRow {
  day: string;
  active_users: number;
  event_count: number;
  api_calls: number;
}

export interface ActivityData {
  days: number;
  daily: ActivityDailyRow[];
  summary: {
    today: number;
    yesterday: number;
    avg_7d: number;
    avg_30d: number;
    max_30d: number;
    events_30d: number;
    api_calls_30d: number;
  };
  growth_metrics?: GrowthMetricsData;
  email_metrics?: EmailMetricsData;
}

export interface GrowthMetricPeriod {
  value: number | null;
  numerator: number;
  denominator: number;
}

export interface GrowthMetricRow {
  key: string;
  category: string;
  priority: string;
  label: string;
  format: 'percent' | 'decimal' | string;
  description: string;
  current: GrowthMetricPeriod;
  previous: GrowthMetricPeriod;
}

export interface GrowthMetricsData {
  days: number;
  current: {
    start_date?: string | null;
    end_date?: string | null;
  };
  previous: {
    start_date?: string | null;
    end_date?: string | null;
  };
  metrics: GrowthMetricRow[];
}

export interface EmailMetricsRow {
  day: string;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
  failed: number;
  open_rate: number;
  click_rate: number;
}

export interface EmailChannelMetrics {
  channel: string;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
  failed: number;
  open_rate: number;
  click_rate: number;
}

export interface EmailMetricsData {
  days: number;
  start_date?: string | null;
  end_date?: string | null;
  daily: EmailMetricsRow[];
  by_channel: EmailChannelMetrics[];
  summary: {
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
    complained: number;
    failed: number;
    open_rate: number;
    click_rate: number;
  };
}

interface PeriodStats {
  label: string;
  days: number;
  avgDau: number;
  totalEvents: number;
  totalApiCalls: number;
  maxDau: number;
  startDay: string;
  endDay: string;
}

interface Comparison {
  title: string;
  current: PeriodStats;
  previous: PeriodStats;
}

interface MetricDef {
  key: 'avgDau' | 'totalEvents' | 'totalApiCalls' | 'maxDau';
  label: string;
  format: (value: number) => string;
}

const METRICS: MetricDef[] = [
  { key: 'avgDau', label: '平均日活', format: formatDecimal },
  { key: 'totalEvents', label: '事件数', format: formatNumber },
  { key: 'totalApiCalls', label: 'API 调用', format: formatNumber },
  { key: 'maxDau', label: '峰值日活', format: formatNumber },
];

const HIDDEN_GROWTH_METRIC_KEYS = new Set([
  'correction_rate',
  'first_useful_insight_rate',
  'useful_answer_rate',
  'thumbs_down_rate',
  'regeneration_rate',
  'share_export_rate',
]);

const GROWTH_CATEGORY_LABELS: Record<string, string> = {
  Activation: '激活',
  Retention: '留存',
  Depth: '使用深度',
  'Quality / Trust': '质量 / 信任',
  Growth: '增长',
};

const GROWTH_METRIC_COPY: Record<string, { label: string; description: string }> = {
  portfolio_watchlist_setup_rate: {
    label: '持仓/自选设置率',
    description: '已完成持仓或自选设置的用户数，占截至周期末注册用户数的比例。',
  },
  first_insight_generation_rate: {
    label: '首次洞察生成率',
    description: '获得首次个性化洞察或助手回答的用户数，占截至周期末注册用户数的比例。',
  },
  weekly_return_rate: {
    label: '周回访率',
    description: '上一 7 天窗口内活跃、并在最近 7 天窗口再次活跃的用户比例。',
  },
  follow_up_question_rate: {
    label: '追问率',
    description: '至少包含两条用户消息的会话数，占有用户消息会话数的比例。',
  },
  questions_per_session: {
    label: '单会话问题数',
    description: '用户消息总数除以聊天会话数。',
  },
  saved_insight_rate: {
    label: '洞察保存率',
    description: '至少保存一条洞察的用户数，占获得过洞察用户数的比例。',
  },
};

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}

function formatDecimal(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value);
}

function formatPct(value: number | null): string {
  if (value === null) return '暂无';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

function formatRate(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatMetricValue(value: number | null, format: string): string {
  if (value === null) return '暂无';
  if (format === 'percent') return formatRate(value);
  if (format === 'decimal') return formatDecimal(value);
  return formatNumber(value);
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

function shortDate(day: string): string {
  if (!day) return '暂无';
  const dateOnly = day.slice(0, 10);
  const date = new Date(`${dateOnly}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return day;
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function isoDateOnly(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : '';
}

function buildStats(label: string, rows: ActivityDailyRow[]): PeriodStats {
  const totalEvents = rows.reduce((sum, row) => sum + row.event_count, 0);
  const totalApiCalls = rows.reduce((sum, row) => sum + row.api_calls, 0);
  const totalDau = rows.reduce((sum, row) => sum + row.active_users, 0);
  const maxDau = rows.reduce((max, row) => Math.max(max, row.active_users), 0);

  return {
    label,
    days: rows.length,
    avgDau: rows.length ? totalDau / rows.length : 0,
    totalEvents,
    totalApiCalls,
    maxDau,
    startDay: rows[0]?.day ?? '',
    endDay: rows.at(-1)?.day ?? '',
  };
}

function compareRows(rows: ActivityDailyRow[], days: number, title: string): Comparison {
  const sorted = [...rows].sort((a, b) => a.day.localeCompare(b.day));
  const currentRows = sorted.slice(-days);
  const previousRows = sorted.slice(-(days * 2), -days);
  return {
    title,
    current: buildStats(`最近 ${days} 天`, currentRows),
    previous: buildStats(`前 ${days} 天`, previousRows),
  };
}

function comparisonTone(value: number | null): string {
  if (value === null) return 'text-muted-foreground';
  if (value > 0) return 'text-emerald-600';
  if (value < 0) return 'text-red-500';
  return 'text-muted-foreground';
}

function metricDelta(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null;
  return current - previous;
}

export function ActivityComparisonPanel({ initialData }: { initialData: ActivityData }) {
  const rows = useMemo(() => initialData.daily ?? [], [initialData.daily]);
  const emailMetrics = initialData.email_metrics;
  const growthMetrics = initialData.growth_metrics;
  const comparisons = useMemo(
    () => [
      compareRows(rows, 7, '周环比'),
      compareRows(rows, 30, '月环比'),
    ],
    [rows],
  );

  const maxDau = Math.max(...rows.map((row) => row.active_users), 1);
  const latestDay = rows.at(-1)?.day ?? '暂无';

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-8 space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link href="/admin" className="text-sm text-muted-foreground hover:text-primary">
              ← 返回 Admin
            </Link>
            <h1 className="mt-2 text-2xl md:text-3xl font-editorial text-foreground">
              活跃趋势对比
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              基于 user_activities 的日活、事件数和 API 调用。当前窗口 {initialData.days} 天，最新日期 {latestDay}。
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-right">
            <HeaderMetric label="今日" value={formatNumber(initialData.summary.today)} />
            <HeaderMetric label="7 天均值" value={formatDecimal(initialData.summary.avg_7d)} />
            <HeaderMetric label="30 天均值" value={formatDecimal(initialData.summary.avg_30d)} />
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-2">
          {comparisons.map((comparison) => (
            <ComparisonCard key={comparison.title} comparison={comparison} />
          ))}
        </section>

        <GrowthMetricsSection metrics={growthMetrics} />

        <EmailMetricsSection metrics={emailMetrics} />

        <section className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-base font-semibold text-foreground">每日活跃用户</h2>
            <span className="text-xs text-muted-foreground">{rows.length} 天</span>
          </div>
          {rows.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              当前周期暂无活跃数据。
            </div>
          ) : (
            <div className="flex h-40 items-end gap-1">
              {rows.map((row) => {
                const height = Math.max(4, (row.active_users / maxDau) * 100);
                return (
                  <div key={row.day} className="group relative flex h-full flex-1 items-end min-w-0">
                    <div
                      className="w-full rounded-t bg-emerald-500/70 transition-colors group-hover:bg-emerald-500"
                      style={{ height: `${height}%` }}
                    />
                    <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-sm group-hover:block">
                      {shortDate(row.day)} · {row.active_users} 日活 · {row.api_calls} 次 API
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function GrowthMetricsSection({ metrics }: { metrics?: GrowthMetricsData }) {
  const rows = (metrics?.metrics ?? []).filter(
    (row) => !HIDDEN_GROWTH_METRIC_KEYS.has(row.key),
  );
  const p0Rows = rows.filter((row) => row.priority === 'P0');
  const p1Rows = rows.filter((row) => row.priority !== 'P0');
  const currentRange = metrics?.current?.start_date && metrics?.current?.end_date
    ? `${shortDate(metrics.current.start_date)}-${shortDate(metrics.current.end_date)}`
    : '当前周期';
  const previousRange = metrics?.previous?.start_date && metrics?.previous?.end_date
    ? `${shortDate(metrics.previous.start_date)}-${shortDate(metrics.previous.end_date)}`
    : '上一周期';

  return (
    <section className="rounded-lg border border-border bg-card p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">MVP 增长指标</h2>
          <p className="text-xs text-muted-foreground mt-1">
            基于原始事件和 agent 会话统计激活、留存与使用深度。
          </p>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <div>{currentRange}</div>
          <div>对比 {previousRange}</div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
          暂无增长指标数据。请先运行 admin_growth_metrics migration。
        </div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {p0Rows.map((row) => (
              <GrowthMetricCard key={row.key} metric={row} />
            ))}
          </div>
          {p1Rows.length > 0 ? (
            <div>
              <h3 className="mb-2 text-sm font-medium text-foreground">P1 辅助指标</h3>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                {p1Rows.map((row) => (
                  <GrowthMetricCard key={row.key} metric={row} compact />
                ))}
              </div>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function GrowthMetricCard({
  metric,
  compact = false,
}: {
  metric: GrowthMetricRow;
  compact?: boolean;
}) {
  const copy = GROWTH_METRIC_COPY[metric.key];
  const label = copy?.label ?? metric.label;
  const category = GROWTH_CATEGORY_LABELS[metric.category] ?? metric.category;
  const description = copy?.description ?? metric.description;
  const delta = metricDelta(metric.current.value, metric.previous.value);
  const value = formatMetricValue(metric.current.value, metric.format);
  const previous = formatMetricValue(metric.previous.value, metric.format);
  const denominatorLabel = metric.current.denominator > 0
    ? `${formatNumber(metric.current.numerator)} / ${formatNumber(metric.current.denominator)}`
    : '暂无分母';

  return (
    <div className="rounded-md border border-border/70 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{category} · {metric.priority}</div>
          <div className="mt-1 text-sm font-medium leading-snug text-foreground">{label}</div>
        </div>
        <div className={`text-sm font-semibold tabular-nums ${comparisonTone(delta)}`}>
          {delta === null ? '暂无' : `${delta > 0 ? '+' : ''}${formatMetricValue(delta, metric.format)}`}
        </div>
      </div>
      <div className={compact ? 'mt-2' : 'mt-3'}>
        <div className={`${compact ? 'text-xl' : 'text-2xl'} font-semibold tabular-nums text-foreground`}>
          {value}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {denominatorLabel} · 上期 {previous}
        </div>
      </div>
      {!compact ? (
        <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
    </div>
  );
}

function channelLabel(channel: string): string {
  const labels: Record<string, string> = {
    daily_report: '日报',
    morning_report: '早报',
    personal_digest: '个人摘要',
    weekly_report: '周报',
    twitter_digest: 'Twitter 摘要',
    welcome_email: '欢迎邮件',
    access_welcome: '访问欢迎邮件',
    onboarding_drip: '新手引导',
    verification_email: '验证邮件',
    newsletter: '订阅邮件',
    lifecycle_email: '生命周期邮件',
    unknown: '未知',
  };
  return labels[channel] ?? channel;
}

function EmailMetricsSection({ metrics }: { metrics?: EmailMetricsData }) {
  const [view, setView] = useState<'channel' | 'date'>('channel');
  const [data, setData] = useState<EmailMetricsData | undefined>(metrics);
  const fallbackStart = data?.daily[0]?.day ?? '';
  const fallbackEnd = data?.daily.at(-1)?.day ?? '';
  const [startDate, setStartDate] = useState(
    isoDateOnly(data?.start_date) || fallbackStart,
  );
  const [endDate, setEndDate] = useState(
    isoDateOnly(data?.end_date) || fallbackEnd,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const summary = data?.summary;
  const daily = data?.daily ?? [];
  const byChannel = data?.by_channel ?? [];
  const hasAnyEmailEvents = Boolean(
    summary
    && (
      summary.delivered
      + summary.opened
      + summary.clicked
      + summary.bounced
      + summary.complained
      + summary.failed
    ) > 0,
  );
  const maxDelivered = Math.max(...daily.map((row) => row.delivered), 1);
  const intervalLabel = startDate && endDate
    ? `${shortDate(startDate)}-${shortDate(endDate)}`
    : `${data?.days ?? 0} 天`;

  async function reloadEmailMetrics() {
    if (!startDate || !endDate) {
      setError('请选择开始和结束日期');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rangeStart = startDate <= endDate ? startDate : endDate;
      const rangeEnd = startDate <= endDate ? endDate : startDate;
      const token = getAccessTokenSync() ?? (await getAccessTokenAsync());
      if (!token) {
        setError('未登录');
        return;
      }
      const params = new URLSearchParams({
        days: String(data?.days ?? metrics?.days ?? 60),
        email_start: rangeStart,
        email_end: rangeEnd,
      });
      const res = await fetch(`${API_BASE}/admin/activity?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (!res.ok) {
        setError(`刷新失败: HTTP ${res.status}`);
        return;
      }
      const next = (await res.json()) as ActivityData;
      setData(next.email_metrics);
      setStartDate(rangeStart);
      setEndDate(rangeEnd);
    } catch (e) {
      setError(`刷新失败: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">邮件互动指标</h2>
          <p className="text-xs text-muted-foreground mt-1">
            基于 Resend webhook 事件统计。打开率以已送达邮件为分母。
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <input
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
          />
          <span className="text-xs text-muted-foreground">至</span>
          <input
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
            className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
          />
          <button
            type="button"
            onClick={() => void reloadEmailMetrics()}
            disabled={loading}
            className="h-8 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:border-primary disabled:opacity-50"
          >
            {loading ? '加载中' : '应用'}
          </button>
          <div className="inline-flex h-8 items-center rounded-md border border-border bg-muted/40 p-0.5">
            <button
              type="button"
              aria-pressed={view === 'channel'}
              onClick={() => setView('channel')}
              className={`h-7 px-3 text-xs font-medium transition-colors ${
                view === 'channel'
                  ? 'rounded bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              按渠道
            </button>
            <button
              type="button"
              aria-pressed={view === 'date'}
              onClick={() => setView('date')}
              className={`h-7 px-3 text-xs font-medium transition-colors ${
                view === 'date'
                  ? 'rounded bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              按日期
            </button>
          </div>
          <span className="text-xs text-muted-foreground">
            {intervalLabel}
          </span>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <EmailMetricCard label="已送达" value={formatNumber(summary?.delivered ?? 0)} />
        <EmailMetricCard label="已打开" value={formatNumber(summary?.opened ?? 0)} />
        <EmailMetricCard label="打开率" value={formatRate(summary?.open_rate ?? 0)} />
        <EmailMetricCard label="已点击" value={formatNumber(summary?.clicked ?? 0)} />
        <EmailMetricCard label="点击率" value={formatRate(summary?.click_rate ?? 0)} />
        <EmailMetricCard label="退信/失败" value={formatNumber((summary?.bounced ?? 0) + (summary?.failed ?? 0))} />
      </div>

      {daily.length === 0 || !hasAnyEmailEvents ? (
        <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
          暂无 Resend webhook 指标。
        </div>
      ) : view === 'channel' ? (
        <EmailChannelView rows={byChannel} />
      ) : (
        <EmailDateView rows={daily} maxDelivered={maxDelivered} />
      )}
    </section>
  );
}

function EmailChannelView({ rows }: { rows: EmailChannelMetrics[] }) {
  if (rows.length === 0) {
    return <div className="text-sm text-muted-foreground">暂无渠道数据。</div>;
  }

  return (
    <div>
      <h3 className="mb-2 text-sm font-medium text-foreground">按渠道</h3>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => (
          <div key={row.channel} className="rounded-md border border-border/70 px-3 py-2">
            <div className="flex items-baseline justify-between gap-3">
              <div className="text-sm font-medium text-foreground">{channelLabel(row.channel)}</div>
              <div className="text-sm tabular-nums text-foreground">{formatRate(row.open_rate)}</div>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {formatNumber(row.delivered)} 已送达 · {formatNumber(row.opened)} 已打开 · {formatNumber(row.clicked)} 已点击
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmailDateView({ rows, maxDelivered }: { rows: EmailMetricsRow[]; maxDelivered: number }) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-foreground">按日期</h3>
        <span className="text-sm text-muted-foreground">悬停柱状图查看详情</span>
      </div>
      <div className="flex h-36 items-end gap-1">
        {rows.map((row) => {
          const deliveredHeight = Math.max(4, (row.delivered / maxDelivered) * 100);
          const openedHeight = row.delivered > 0
            ? Math.max(0, Math.min(100, (row.opened / row.delivered) * deliveredHeight))
            : 0;
          return (
            <div key={row.day} className="group relative flex h-full flex-1 items-end min-w-0">
              <div
                className="relative w-full rounded-t bg-sky-500/30 transition-colors group-hover:bg-sky-500/40"
                style={{ height: `${deliveredHeight}%` }}
              >
                <div
                  className="absolute bottom-0 left-0 right-0 rounded-t bg-emerald-500/70"
                  style={{ height: `${openedHeight}%` }}
                />
              </div>
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-sm group-hover:block">
                {shortDate(row.day)} · {row.delivered} 已送达 · {row.opened} 已打开 · {formatRate(row.open_rate)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EmailMetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/70 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums text-foreground">{value}</div>
    </div>
  );
}

function HeaderMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold tabular-nums text-foreground">{value}</div>
    </div>
  );
}

function ComparisonCard({ comparison }: { comparison: Comparison }) {
  const range = `${shortDate(comparison.current.startDay)}-${shortDate(comparison.current.endDay)}`;
  const previousRange = `${shortDate(comparison.previous.startDay)}-${shortDate(comparison.previous.endDay)}`;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-foreground">{comparison.title}</h2>
        <p className="text-xs text-muted-foreground mt-1">
          {comparison.current.label}: {range} · {comparison.previous.label}: {previousRange}
        </p>
      </div>
      <div className="space-y-3">
        {METRICS.map((metric) => {
          const current = comparison.current[metric.key];
          const previous = comparison.previous[metric.key];
          const delta = pctChange(current, previous);
          return (
            <div key={metric.key} className="grid grid-cols-[1fr_auto_auto] items-baseline gap-4">
              <div className="text-sm text-muted-foreground">{metric.label}</div>
              <div className="text-sm tabular-nums text-foreground">
                {metric.format(current)}
                <span className="ml-2 text-xs text-muted-foreground">
                  对比 {metric.format(previous)}
                </span>
              </div>
              <div className={`text-sm font-medium tabular-nums ${comparisonTone(delta)}`}>
                {formatPct(delta)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
