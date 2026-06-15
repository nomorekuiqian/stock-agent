'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { getAccessTokenAsync, getAccessTokenSync } from '@/contexts/AuthContext';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api';

export interface LlmUsageRow {
  day: string;
  feature: string;
  model: string | null;
  calls: number;
  prompt_tokens: number;
  output_tokens: number;
  total_tokens: number;
  est_usd: number;
}

export interface LlmFeatureBreakdown {
  feature: string;
  calls: number;
  prompt_tokens: number;
  output_tokens: number;
  total_tokens: number;
  est_usd: number;
}

export interface LlmUsageData {
  days: number;
  rows: LlmUsageRow[];
  feature_breakdown: LlmFeatureBreakdown[];
  day_totals: { day: string; est_usd: number }[];
  all_days: string[];
  all_features: string[];
  total_usd: number;
}

interface Props {
  initialData: LlmUsageData;
  initialDays: number;
}

const DAY_OPTIONS = [7, 14, 30];

const PALETTE = [
  '#059669', '#0ea5e9', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
  '#a855f7', '#06b6d4', '#eab308', '#dc2626', '#10b981',
  '#3b82f6', '#d946ef', '#65a30d', '#f43f5e', '#0891b2',
];

function colorFor(feature: string, allFeatures: string[]): string {
  const idx = allFeatures.indexOf(feature);
  return PALETTE[idx % PALETTE.length];
}

function formatUsd(v: number): string {
  if (v >= 1) return `$${v.toFixed(2)}`;
  if (v >= 0.01) return `$${v.toFixed(3)}`;
  return `$${v.toFixed(4)}`;
}

function formatTokens(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(v);
}

export function LlmUsagePanel({ initialData, initialDays }: Props) {
  const [data, setData] = useState<LlmUsageData>(initialData);
  const [days, setDays] = useState<number>(initialDays);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async (nextDays: number) => {
    setLoading(true);
    setError(null);
    try {
      const token = getAccessTokenSync() ?? (await getAccessTokenAsync());
      if (!token) {
        setError('未登录');
        return;
      }
      const res = await fetch(`${API_BASE}/admin/llm-usage?days=${nextDays}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (!res.ok) {
        setError(`刷新失败: HTTP ${res.status}`);
        return;
      }
      const next = (await res.json()) as LlmUsageData;
      setData(next);
      setDays(nextDays);
    } catch (e) {
      setError(`刷新失败: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  // Build chart data: one row per day, with one numeric key per feature
  const chartData = useMemo(() => {
    const byDay = new Map<string, Record<string, number | string>>();
    for (const day of data.all_days) {
      byDay.set(day, { day });
    }
    for (const row of data.rows) {
      const entry = byDay.get(row.day);
      if (!entry) continue;
      const prev = (entry[row.feature] as number | undefined) ?? 0;
      entry[row.feature] = prev + row.est_usd;
    }
    return Array.from(byDay.values()).sort((a, b) =>
      String(a.day).localeCompare(String(b.day)),
    );
  }, [data]);

  // Sort features by est_usd descending so big ones render at bottom of stack
  const orderedFeatures = useMemo(
    () => data.feature_breakdown.map((f) => f.feature),
    [data],
  );

  const todayUsd = useMemo(() => {
    if (data.day_totals.length === 0) return 0;
    return data.day_totals[data.day_totals.length - 1]?.est_usd ?? 0;
  }, [data]);

  const avgDailyUsd = useMemo(() => {
    if (data.day_totals.length === 0) return 0;
    return data.total_usd / data.day_totals.length;
  }, [data]);

  const monthlyEstimate = avgDailyUsd * 30;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 space-y-6">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <Link
            href="/admin"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← 返回 Admin
          </Link>
          <h1 className="text-2xl font-semibold mt-1">LLM 用量看板</h1>
          <p className="text-sm text-muted-foreground mt-1">
            按 feature 切分的每日 token 消耗与估算费用。价格按 Google 官方公开价粗算，仅供参考。
          </p>
        </div>
        <div className="flex items-center gap-2">
          {DAY_OPTIONS.map((opt) => (
            <button
              key={opt}
              onClick={() => void reload(opt)}
              disabled={loading || opt === days}
              className={`px-3 py-1.5 text-sm rounded-md border transition ${
                opt === days
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-background text-foreground border-border hover:border-emerald-500'
              } disabled:opacity-50`}
            >
              {opt} 天
            </button>
          ))}
          <button
            onClick={() => void reload(days)}
            disabled={loading}
            className="px-3 py-1.5 text-sm rounded-md border border-border hover:border-emerald-500 disabled:opacity-50"
          >
            {loading ? '刷新中…' : '刷新'}
          </button>
        </div>
      </header>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 text-red-800 px-4 py-2 text-sm">
          {error}
        </div>
      ) : null}

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard label="今日费用" value={formatUsd(todayUsd)} hint={data.day_totals.at(-1)?.day ?? '—'} />
        <SummaryCard label={`${days} 天合计`} value={formatUsd(data.total_usd)} hint={`${data.day_totals.length} 天有数据`} />
        <SummaryCard label="日均费用" value={formatUsd(avgDailyUsd)} hint="按有数据的天平均" />
        <SummaryCard label="月度估算" value={formatUsd(monthlyEstimate)} hint="日均 × 30" />
      </section>

      <section className="rounded-lg border border-border bg-background p-4">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-base font-medium">每日费用堆叠</h2>
          <span className="text-xs text-muted-foreground">单位 USD，按 feature 分层</span>
        </div>
        {chartData.length === 0 ? (
          <div className="h-80 flex items-center justify-center text-muted-foreground/70 text-sm">
            最近 {days} 天没有数据
          </div>
        ) : (
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis
                  tickFormatter={(v: number) => `$${v.toFixed(2)}`}
                  tick={{ fontSize: 11 }}
                  width={60}
                />
                <Tooltip
                  formatter={(value, name) => [formatUsd(Number(value ?? 0)), String(name)]}
                  labelFormatter={(label) => `日期: ${String(label)}`}
                  contentStyle={{ fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                {orderedFeatures.map((feature) => (
                  <Bar
                    key={feature}
                    dataKey={feature}
                    stackId="usd"
                    fill={colorFor(feature, orderedFeatures)}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-border bg-background p-4">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-base font-medium">Feature 排行（{days} 天合计）</h2>
          <span className="text-xs text-muted-foreground">按估算费用降序</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b border-border">
                <th className="py-2 pr-4 font-medium">Feature</th>
                <th className="py-2 pr-4 font-medium text-right">调用</th>
                <th className="py-2 pr-4 font-medium text-right">输入 tokens</th>
                <th className="py-2 pr-4 font-medium text-right">输出 tokens</th>
                <th className="py-2 pr-4 font-medium text-right">估算 USD</th>
                <th className="py-2 pr-4 font-medium text-right">占比</th>
              </tr>
            </thead>
            <tbody>
              {data.feature_breakdown.map((row) => {
                const pct = data.total_usd > 0 ? (row.est_usd / data.total_usd) * 100 : 0;
                return (
                  <tr key={row.feature} className="border-b border-neutral-100">
                    <td className="py-2 pr-4">
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-sm mr-2 align-middle"
                        style={{ backgroundColor: colorFor(row.feature, orderedFeatures) }}
                      />
                      <span className="font-mono text-xs">{row.feature}</span>
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">{row.calls.toLocaleString()}</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">{formatTokens(row.prompt_tokens)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">{formatTokens(row.output_tokens)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums font-medium">{formatUsd(row.est_usd)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">{pct.toFixed(1)}%</td>
                  </tr>
                );
              })}
              {data.feature_breakdown.length === 0 ? (
                <tr><td colSpan={6} className="py-6 text-center text-muted-foreground/70">无数据</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function SummaryCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-lg border border-border bg-background px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold mt-1 tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground/70 mt-1">{hint}</div>
    </div>
  );
}
