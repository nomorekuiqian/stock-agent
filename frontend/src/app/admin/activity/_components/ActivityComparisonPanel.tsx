'use client';

import Link from 'next/link';
import { useMemo } from 'react';

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
  email_metrics?: EmailMetricsData;
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
  { key: 'avgDau', label: 'Avg DAU', format: formatDecimal },
  { key: 'totalEvents', label: 'Events', format: formatNumber },
  { key: 'totalApiCalls', label: 'API calls', format: formatNumber },
  { key: 'maxDau', label: 'Peak DAU', format: formatNumber },
];

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}

function formatDecimal(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value);
}

function formatPct(value: number | null): string {
  if (value === null) return 'n/a';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

function formatRate(value: number): string {
  return `${value.toFixed(1)}%`;
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

function shortDate(day: string): string {
  if (!day) return 'n/a';
  const date = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return day;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
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
    current: buildStats(`Latest ${days}D`, currentRows),
    previous: buildStats(`Previous ${days}D`, previousRows),
  };
}

function comparisonTone(value: number | null): string {
  if (value === null) return 'text-muted-foreground';
  if (value > 0) return 'text-emerald-600';
  if (value < 0) return 'text-red-500';
  return 'text-muted-foreground';
}

export function ActivityComparisonPanel({ initialData }: { initialData: ActivityData }) {
  const rows = useMemo(() => initialData.daily ?? [], [initialData.daily]);
  const emailMetrics = initialData.email_metrics;
  const comparisons = useMemo(
    () => [
      compareRows(rows, 7, 'Week over week'),
      compareRows(rows, 30, 'Month over month'),
    ],
    [rows],
  );

  const maxDau = Math.max(...rows.map((row) => row.active_users), 1);
  const latestDay = rows.at(-1)?.day ?? 'n/a';

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
              基于 user_activities 的日活、事件数和 API calls。当前窗口 {initialData.days} 天，最新日期 {latestDay}。
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-right">
            <HeaderMetric label="Today" value={formatNumber(initialData.summary.today)} />
            <HeaderMetric label="7D avg" value={formatDecimal(initialData.summary.avg_7d)} />
            <HeaderMetric label="30D avg" value={formatDecimal(initialData.summary.avg_30d)} />
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-2">
          {comparisons.map((comparison) => (
            <ComparisonCard key={comparison.title} comparison={comparison} />
          ))}
        </section>

        <EmailMetricsSection metrics={emailMetrics} />

        <section className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-base font-semibold text-foreground">Daily DAU</h2>
            <span className="text-xs text-muted-foreground">{rows.length} days</span>
          </div>
          {rows.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              No activity data for this period.
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
                      {shortDate(row.day)} · {row.active_users} DAU · {row.api_calls} API
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

function channelLabel(channel: string): string {
  const labels: Record<string, string> = {
    daily_report: 'Daily',
    morning_report: 'Morning',
    personal_digest: 'Personal',
    weekly_report: 'Weekly',
    twitter_digest: 'Twitter',
    welcome_email: 'Welcome',
    access_welcome: 'Access welcome',
    onboarding_drip: 'Onboarding',
    verification_email: 'Verification',
    newsletter: 'Newsletter',
    lifecycle_email: 'Lifecycle',
    unknown: 'Unknown',
  };
  return labels[channel] ?? channel;
}

function EmailMetricsSection({ metrics }: { metrics?: EmailMetricsData }) {
  const summary = metrics?.summary;
  const daily = metrics?.daily ?? [];
  const byChannel = metrics?.by_channel ?? [];
  const maxDelivered = Math.max(...daily.map((row) => row.delivered), 1);

  return (
    <section className="rounded-lg border border-border bg-card p-4 space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Email engagement</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Resend webhook events. Open rate uses unique opens / delivered.
          </p>
        </div>
        <span className="text-xs text-muted-foreground">
          {metrics?.days ?? 0} days
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <EmailMetricCard label="Delivered" value={formatNumber(summary?.delivered ?? 0)} />
        <EmailMetricCard label="Opened" value={formatNumber(summary?.opened ?? 0)} />
        <EmailMetricCard label="Open rate" value={formatRate(summary?.open_rate ?? 0)} />
        <EmailMetricCard label="Clicked" value={formatNumber(summary?.clicked ?? 0)} />
        <EmailMetricCard label="Click rate" value={formatRate(summary?.click_rate ?? 0)} />
        <EmailMetricCard label="Bounced/Failed" value={formatNumber((summary?.bounced ?? 0) + (summary?.failed ?? 0))} />
      </div>

      {daily.length === 0 || (summary?.delivered ?? 0) === 0 ? (
        <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
          No Resend webhook metrics yet.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="text-sm font-medium text-foreground">Daily delivered / opened</h3>
              <span className="text-xs text-muted-foreground">hover bars for details</span>
            </div>
            <div className="flex h-36 items-end gap-1">
              {daily.map((row) => {
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
                      {shortDate(row.day)} · {row.delivered} delivered · {row.opened} opened · {formatRate(row.open_rate)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-medium text-foreground">By channel</h3>
            <div className="space-y-2">
              {byChannel.length === 0 ? (
                <div className="text-sm text-muted-foreground">No channel data.</div>
              ) : byChannel.map((row) => (
                <div key={row.channel} className="rounded-md border border-border/70 px-3 py-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="text-sm font-medium text-foreground">{channelLabel(row.channel)}</div>
                    <div className="text-sm tabular-nums text-foreground">{formatRate(row.open_rate)}</div>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {formatNumber(row.delivered)} delivered · {formatNumber(row.opened)} opened · {formatNumber(row.clicked)} clicked
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
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
                  vs {metric.format(previous)}
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
