'use client';

import { useCallback, useEffect, useState } from 'react';
import { getAccessTokenSync, getAccessTokenAsync } from '@/contexts/AuthContext';

// ---------------------------------------------------------------------------
// Types (mirror the backend job_monitor normalized shapes)
// ---------------------------------------------------------------------------

export interface JobSource {
  key: string;
  label: string;
}

type Tone = 'ok' | 'warn' | 'fail' | 'neutral';
type RunState = 'ok' | 'running' | 'warn' | 'fail';

interface StatChip {
  label: string;
  value: string;
  tone: Tone;
}

interface Overview {
  health: Tone;
  stats: StatChip[];
}

interface RunMetric {
  label: string;
  value: number;
}

interface JobRun {
  id: string;
  type: string | null;
  status: string;
  state: RunState;
  started_at: string | null;
  finished_at: string | null;
  duration_seconds: number | null;
  metrics: RunMetric[];
  error: string | null;
  detail?: {
    ledger?: Record<string, unknown> & { drop_reasons?: Record<string, number>; stage_indexed?: Record<string, number> };
    report?: Record<string, unknown>;
  };
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api';
const AUTO_REFRESH_MS = 30_000;

// ---------------------------------------------------------------------------
// Style helpers
// ---------------------------------------------------------------------------

const TONE_CLASS: Record<Tone, string> = {
  ok: 'bg-emerald-100 text-emerald-700',
  warn: 'bg-amber-100 text-amber-700',
  fail: 'bg-red-100 text-red-700',
  neutral: 'bg-muted text-muted-foreground',
};

const STATE_CLASS: Record<RunState, string> = {
  ok: 'bg-emerald-100 text-emerald-700',
  running: 'bg-blue-100 text-blue-700',
  warn: 'bg-amber-100 text-amber-700',
  fail: 'bg-red-100 text-red-700',
};

const STATE_DOT: Record<RunState, string> = {
  ok: 'bg-emerald-500',
  running: 'bg-blue-500 animate-pulse',
  warn: 'bg-amber-500',
  fail: 'bg-red-500',
};

function formatDateTime(iso: string | null): string {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString('zh-CN', {
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return '-';
  }
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return '-';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m${s ? ` ${s}s` : ''}`;
}

async function authedFetch(path: string): Promise<Response | null> {
  const token = getAccessTokenSync() ?? (await getAccessTokenAsync());
  if (!token) return null;
  return fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export function JobMonitorPanel({ sources }: { sources: JobSource[] }) {
  const [activeKey, setActiveKey] = useState(sources[0]?.key ?? '');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [runs, setRuns] = useState<JobRun[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const load = useCallback(async (key: string) => {
    if (!key) return;
    setIsLoading(true);
    setError('');
    try {
      const [ovRes, runsRes] = await Promise.all([
        authedFetch(`/admin/jobs/${key}/overview`),
        authedFetch(`/admin/jobs/${key}/runs?limit=50`),
      ]);
      if (!ovRes || !runsRes) {
        setError('登录状态已失效，请重新登录');
        return;
      }
      if (!ovRes.ok || !runsRes.ok) {
        setError('加载失败，请稍后重试');
        return;
      }
      setOverview(await ovRes.json());
      setRuns((await runsRes.json()).runs ?? []);
      setLastRefreshed(new Date());
    } catch {
      setError('加载失败，请稍后重试');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(activeKey);
  }, [activeKey, load]);

  // Light auto-refresh so a live crawl is visible without manual reloads.
  useEffect(() => {
    const t = setInterval(() => void load(activeKey), AUTO_REFRESH_MS);
    return () => clearInterval(t);
  }, [activeKey, load]);

  if (sources.length === 0) {
    return (
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-12 text-center text-muted-foreground">
        暂无可监控的后台任务。
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 py-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">后台任务监控</h1>
          <p className="text-sm text-muted-foreground mt-1">
            每次定时触发的运行结果、产出与健康状态。
          </p>
        </div>
        <div className="flex items-center gap-2">
          {lastRefreshed && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {formatDateTime(lastRefreshed.toISOString())} 刷新
            </span>
          )}
          <button
            onClick={() => void load(activeKey)}
            disabled={isLoading}
            className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-muted transition-colors disabled:opacity-50"
          >
            {isLoading ? '刷新中...' : '刷新'}
          </button>
        </div>
      </div>

      {/* Source tabs */}
      {sources.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          {sources.map((s) => (
            <button
              key={s.key}
              onClick={() => { setActiveKey(s.key); setExpandedId(null); }}
              className={`rounded-full px-3 py-1 text-xs font-medium border transition-all ${
                activeKey === s.key
                  ? 'border-foreground/20 bg-foreground text-background'
                  : 'border-border bg-background text-muted-foreground hover:text-foreground hover:border-foreground/20'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {overview && <OverviewHeader overview={overview} />}

      {/* Runs table */}
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b border-border text-left">
                <th className="px-3 py-2.5 font-medium text-muted-foreground">开始</th>
                <th className="px-3 py-2.5 font-medium text-muted-foreground">类型</th>
                <th className="px-3 py-2.5 font-medium text-muted-foreground">状态</th>
                <th className="px-3 py-2.5 font-medium text-muted-foreground">产出</th>
                <th className="px-3 py-2.5 font-medium text-muted-foreground">耗时</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {runs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    {isLoading ? '加载中...' : '暂无运行记录'}
                  </td>
                </tr>
              ) : (
                runs.map((run) => (
                  <RunRow
                    key={run.id}
                    run={run}
                    sourceKey={activeKey}
                    expanded={expandedId === run.id}
                    onToggle={() => setExpandedId(expandedId === run.id ? null : run.id)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview header
// ---------------------------------------------------------------------------

function OverviewHeader({ overview }: { overview: Overview }) {
  const healthLabel: Record<Tone, string> = {
    ok: '正常', warn: '注意', fail: '异常', neutral: '—',
  };
  return (
    <section className="rounded-lg border border-border bg-background p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONE_CLASS[overview.health]}`}>
          {healthLabel[overview.health]}
        </span>
        <span className="text-xs text-muted-foreground">整体健康</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {overview.stats.map((stat) => (
          <div key={stat.label} className="space-y-1">
            <div className="text-xs text-muted-foreground">{stat.label}</div>
            <div className={`inline-flex max-w-full truncate rounded px-1.5 py-0.5 text-sm font-medium ${TONE_CLASS[stat.tone]}`} title={stat.value}>
              {stat.value}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Run row + detail
// ---------------------------------------------------------------------------

function RunRow({
  run, sourceKey, expanded, onToggle,
}: {
  run: JobRun; sourceKey: string; expanded: boolean; onToggle: () => void;
}) {
  const [detail, setDetail] = useState<JobRun | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    if (!expanded || detail) return;
    let cancelled = false;
    setLoadingDetail(true);
    void (async () => {
      try {
        const res = await authedFetch(`/admin/jobs/${sourceKey}/runs/${run.id}`);
        if (!cancelled && res && res.ok) {
          setDetail((await res.json()).run ?? null);
        }
      } finally {
        if (!cancelled) setLoadingDetail(false);
      }
    })();
    return () => { cancelled = true; };
  }, [expanded, detail, run.id, sourceKey]);

  return (
    <>
      <tr onClick={onToggle} className={`cursor-pointer transition-colors ${expanded ? 'bg-muted/40' : 'hover:bg-muted/20'}`}>
        <td className="px-3 py-2.5 whitespace-nowrap">{formatDateTime(run.started_at)}</td>
        <td className="px-3 py-2.5 text-xs text-muted-foreground">{run.type ?? '-'}</td>
        <td className="px-3 py-2.5">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${STATE_CLASS[run.state]}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${STATE_DOT[run.state]}`} />
            {run.status}
          </span>
        </td>
        <td className="px-3 py-2.5">
          <div className="flex flex-wrap gap-2">
            {run.metrics.map((m) => (
              <span key={m.label} className="text-xs text-muted-foreground tabular-nums">
                {m.label}<span className="ml-0.5 font-medium text-foreground">{m.value}</span>
              </span>
            ))}
          </div>
        </td>
        <td className="px-3 py-2.5 text-xs text-muted-foreground tabular-nums">{formatDuration(run.duration_seconds)}</td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={5} className="bg-muted/20 px-4 py-4 border-t border-border/50">
            {run.error && (
              <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 font-mono break-all">
                {run.error}
              </div>
            )}
            {loadingDetail && <div className="text-xs text-muted-foreground">加载详情...</div>}
            {detail && <RunDetail run={detail} />}
            {!loadingDetail && !detail && <div className="text-xs text-muted-foreground">无详情</div>}
          </td>
        </tr>
      )}
    </>
  );
}

function ChipMap({ title, map }: { title: string; map: Record<string, number> | undefined }) {
  const entries = Object.entries(map ?? {}).sort(([, a], [, b]) => b - a);
  if (entries.length === 0) return null;
  return (
    <div>
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">{title}</h4>
      <div className="flex flex-wrap gap-1.5">
        {entries.map(([k, v]) => (
          <span key={k} className="rounded bg-muted px-2 py-0.5 text-xs font-mono text-muted-foreground">
            {k}: <span className="font-medium text-foreground">{v}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function RunDetail({ run }: { run: JobRun }) {
  const ledger = run.detail?.ledger ?? {};
  const report = run.detail?.report ?? {};
  const dropReasons = (ledger as { drop_reasons?: Record<string, number> }).drop_reasons;
  const stageIndexed = (ledger as { stage_indexed?: Record<string, number> }).stage_indexed;
  const topTickers = (report as { top_tickers?: Record<string, number> }).top_tickers;
  const contentType = (report as { content_type?: Record<string, number> }).content_type;

  const hasAny = dropReasons || stageIndexed || topTickers || contentType;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChipMap title="入库阶段" map={stageIndexed} />
        <ChipMap title="丢弃原因" map={dropReasons} />
        <ChipMap title="内容类型" map={contentType} />
        <ChipMap title="Top Tickers" map={topTickers} />
      </div>
      {!hasAny && <div className="text-xs text-muted-foreground">该次运行无逐项明细。</div>}
      <div className="text-xs text-muted-foreground font-mono break-all">run id: {run.id}</div>
    </div>
  );
}
