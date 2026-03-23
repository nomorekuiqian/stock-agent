'use client';

import { useEffect, useState, useCallback } from 'react';
import { notFound } from 'next/navigation';

// dev-only page: returns 404 in production
const IS_DEV = process.env.NODE_ENV === 'development';

interface DailyEmailStats {
  date: string;
  satisfied: number;
  dissatisfied: number;
}

interface EmailFeedbackStats {
  total: number;
  breakdown: { satisfied: number; dissatisfied: number };
  satisfaction_rate: number;
  daily: DailyEmailStats[];
}

interface EmailFeedbackRecord {
  email: string;
  rating: 'satisfied' | 'dissatisfied';
  report_date: string;
  created_at?: string;
}

interface EmailFeedbackList {
  data: EmailFeedbackRecord[];
  total_records: number;
  _error?: string | null;
}

interface UserFeedbackItem {
  rating: 'helpful' | 'neutral' | 'not_helpful';
  email: string | null;
  message: string | null;
  created_at: string;
}

interface UserFeedbackList {
  data: UserFeedbackItem[];
  total: number;
  page: number;
  total_pages: number;
}

interface FeedbackData {
  stats: EmailFeedbackStats;
  userFeedback: UserFeedbackList;
  emailList: EmailFeedbackList;
}

const RATING_LABELS: Record<string, { label: string; color: string }> = {
  helpful: { label: '很有帮助', color: 'bg-primary/20 text-primary border-primary/30' },
  neutral: { label: '还行', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  not_helpful: { label: '不太行', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
};

function SatisfactionGauge({ rate }: { rate: number }) {
  const pct = Math.round(rate * 100);
  const color = pct >= 70 ? 'text-emerald-400' : pct >= 40 ? 'text-amber-400' : 'text-red-400';
  const barColor = pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end gap-2">
        <span className={`text-5xl font-mono font-bold ${color}`}>{pct}%</span>
        <span className="text-muted-foreground text-sm mb-2">满意度</span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted/40">
        <div className={`h-2 rounded-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function DailyBar({
  day,
  maxTotal,
  isSelected,
  onClick,
}: {
  day: DailyEmailStats;
  maxTotal: number;
  isSelected: boolean;
  onClick: () => void;
}) {
  const total = day.satisfied + day.dissatisfied;
  const heightPct = maxTotal > 0 ? (total / maxTotal) * 100 : 0;
  const satisfiedPct = total > 0 ? (day.satisfied / total) * 100 : 0;

  return (
    <button
      onClick={total > 0 ? onClick : undefined}
      className={`flex flex-col items-center gap-1 flex-1 min-w-0 group rounded transition-all ${
        total > 0 ? 'cursor-pointer' : 'cursor-default'
      } ${isSelected ? 'bg-muted/30' : ''}`}
    >
      <div className="w-full flex flex-col justify-end px-0.5" style={{ height: 80 }}>
        <div
          className={`w-full rounded-sm overflow-hidden transition-opacity ${
            total > 0 && !isSelected ? 'group-hover:opacity-80' : ''
          }`}
          style={{ height: `${heightPct}%`, minHeight: total > 0 ? 4 : 0 }}
        >
          <div className="bg-red-500/70" style={{ height: `${100 - satisfiedPct}%` }} />
          <div className="bg-emerald-500/70" style={{ height: `${satisfiedPct}%` }} />
        </div>
      </div>
      {total > 0 && <span className="text-xs text-muted-foreground font-mono">{total}</span>}
      <span className={`text-xs truncate w-full text-center ${isSelected ? 'text-foreground' : 'text-muted-foreground/60'}`}>
        {day.date.slice(5)}
      </span>
    </button>
  );
}

function EmailDetailPanel({
  records,
  date,
  onClose,
}: {
  records: EmailFeedbackRecord[];
  date: string;
  onClose: () => void;
}) {
  const satisfied = records.filter((r) => r.rating === 'satisfied');
  const dissatisfied = records.filter((r) => r.rating === 'dissatisfied');

  return (
    <div className="border border-border/60 rounded-lg bg-card/80 p-4 mt-2">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-foreground">{date} 的反馈明细</span>
        <button
          onClick={onClose}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          关闭
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Satisfied */}
        <div>
          <div className="text-xs text-emerald-400 font-mono mb-2">
            满意 ({satisfied.length})
          </div>
          {satisfied.length === 0 ? (
            <div className="text-xs text-muted-foreground/50">无</div>
          ) : (
            <div className="flex flex-col gap-1">
              {satisfied.map((r, i) => (
                <div key={i} className="text-xs text-foreground/80 font-mono bg-emerald-500/5 border border-emerald-500/10 rounded px-2 py-1">
                  {r.email}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Dissatisfied */}
        <div>
          <div className="text-xs text-red-400 font-mono mb-2">
            不满意 ({dissatisfied.length})
          </div>
          {dissatisfied.length === 0 ? (
            <div className="text-xs text-muted-foreground/50">无</div>
          ) : (
            <div className="flex flex-col gap-1">
              {dissatisfied.map((r, i) => (
                <div key={i} className="text-xs text-foreground/80 font-mono bg-red-500/5 border border-red-500/10 rounded px-2 py-1">
                  {r.email}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function FeedbackDashboard() {
  if (!IS_DEV) notFound();

  const [data, setData] = useState<FeedbackData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [days, setDays] = useState(14);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSelectedDate(null);
    try {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - days);
      const fmt = (d: Date) => d.toISOString().slice(0, 10);

      const res = await fetch(
        `/api/dev/feedback?start_date=${fmt(start)}&end_date=${fmt(end)}&page=${page}&page_size=20`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [page, days]);

  useEffect(() => { load(); }, [load]);

  const maxTotal = data
    ? Math.max(...data.stats.daily.map((d) => d.satisfied + d.dissatisfied), 1)
    : 1;

  // Group email list records by report_date
  const emailsByDate = data?.emailList?.data?.reduce<Record<string, EmailFeedbackRecord[]>>((acc, r) => {
    const key = r.report_date ?? r.created_at?.slice(0, 10) ?? 'unknown';
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {}) ?? {};

  const selectedRecords = selectedDate ? (emailsByDate[selectedDate] ?? []) : [];

  return (
    <div className="min-h-screen bg-background p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono text-amber-400 border border-amber-400/30 rounded px-1.5 py-0.5">
              DEV ONLY
            </span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">用户反馈看板</h1>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={days}
            onChange={(e) => { setDays(Number(e.target.value)); setPage(1); }}
            className="text-sm bg-muted border border-border rounded px-2 py-1 text-foreground"
          >
            <option value={7}>最近 7 天</option>
            <option value={14}>最近 14 天</option>
            <option value={30}>最近 30 天</option>
          </select>
          <button
            onClick={load}
            className="text-sm border border-border rounded px-3 py-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            刷新
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 border border-red-500/30 rounded bg-red-500/10 text-red-400 text-sm font-mono">
          {error} — 确保后端在运行且 CRON_SECRET 已设置
        </div>
      )}

      {loading && !data && (
        <div className="text-muted-foreground text-sm">加载中...</div>
      )}

      {data && (
        <>
          {/* Email Feedback Section */}
          <section className="mb-8">
            <h2 className="text-sm font-mono text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-primary inline-block" />
              邮件反馈（日报用户）
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              {/* Satisfaction gauge */}
              <div className="border border-border/40 rounded-lg p-4 bg-card/50">
                <SatisfactionGauge rate={data.stats.satisfaction_rate} />
                <div className="mt-3 text-xs text-muted-foreground">
                  共 {data.stats.total} 条反馈
                </div>
              </div>

              {/* Breakdown */}
              <div className="border border-border/40 rounded-lg p-4 bg-card/50 flex flex-col justify-center gap-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-emerald-400">满意</span>
                  <span className="font-mono text-lg font-bold text-foreground">
                    {data.stats.breakdown.satisfied}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-red-400">不满意</span>
                  <span className="font-mono text-lg font-bold text-foreground">
                    {data.stats.breakdown.dissatisfied}
                  </span>
                </div>
              </div>

              {/* Stats summary */}
              <div className="border border-border/40 rounded-lg p-4 bg-card/50 flex flex-col justify-center gap-1">
                <div className="text-xs text-muted-foreground mb-1">过去 {days} 天</div>
                {data.stats.daily.length > 0 && (
                  <>
                    <div className="text-xs text-muted-foreground">
                      日均 {(data.stats.total / Math.max(data.stats.daily.filter(d => d.satisfied + d.dissatisfied > 0).length, 1)).toFixed(1)} 条
                    </div>
                    <div className="text-xs text-muted-foreground">
                      最高单日 {Math.max(...data.stats.daily.map(d => d.satisfied + d.dissatisfied))} 条
                    </div>
                  </>
                )}
                {data.emailList?._error ? (
                  <div className="text-xs text-red-400 mt-1 font-mono break-all">
                    明细加载失败: {data.emailList._error}
                  </div>
                ) : data.emailList?.total_records > 0 ? (
                  <div className="text-xs text-muted-foreground/60 mt-1">
                    点击柱子查看明细
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground/40 mt-1">
                    明细: {data.emailList?.total_records ?? '?'} 条（共 {data.stats.total} 条统计）
                  </div>
                )}
              </div>
            </div>

            {/* Daily chart — clickable */}
            {data.stats.daily.length > 0 && (
              <div className="border border-border/40 rounded-lg p-4 bg-card/50">
                <div className="text-xs text-muted-foreground mb-3">
                  每日分布（绿=满意 红=不满意）
                  {data.emailList?.total_records > 0 && (
                    <span className="ml-2 opacity-60">· 点击柱子查看是谁</span>
                  )}
                </div>
                <div className="flex gap-1 items-end">
                  {data.stats.daily.map((day) => (
                    <DailyBar
                      key={day.date}
                      day={day}
                      maxTotal={maxTotal}
                      isSelected={selectedDate === day.date}
                      onClick={() => setSelectedDate(selectedDate === day.date ? null : day.date)}
                    />
                  ))}
                </div>

                {/* Detail panel */}
                {selectedDate && (
                  <EmailDetailPanel
                    records={selectedRecords}
                    date={selectedDate}
                    onClose={() => setSelectedDate(null)}
                  />
                )}
              </div>
            )}

            {/* Full email list (all records, sorted by date desc) */}
            {data.emailList?.data?.length > 0 && (
              <details className="mt-3">
                <summary className="text-xs text-muted-foreground/60 cursor-pointer hover:text-muted-foreground transition-colors select-none">
                  查看全部 {data.emailList.total_records} 条明细记录
                </summary>
                <div className="mt-2 border border-border/30 rounded-lg overflow-hidden">
                  <table className="w-full text-xs font-mono">
                    <thead>
                      <tr className="border-b border-border/30 bg-muted/20">
                        <th className="text-left p-2 text-muted-foreground font-normal">邮件</th>
                        <th className="text-left p-2 text-muted-foreground font-normal">评价</th>
                        <th className="text-left p-2 text-muted-foreground font-normal">日报日期</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.emailList.data.map((r, i) => (
                        <tr key={i} className="border-b border-border/20 last:border-0 hover:bg-muted/10">
                          <td className="p-2 text-foreground/80">{r.email}</td>
                          <td className="p-2">
                            <span className={r.rating === 'satisfied' ? 'text-emerald-400' : 'text-red-400'}>
                              {r.rating === 'satisfied' ? '满意' : '不满意'}
                            </span>
                          </td>
                          <td className="p-2 text-muted-foreground">{r.report_date}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </section>

          {/* User / Contact Feedback Section */}
          <section>
            <h2 className="text-sm font-mono text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
              用户反馈（Contact 页面）
              <span className="text-muted-foreground/50 font-normal normal-case tracking-normal">
                共 {data.userFeedback.total} 条
              </span>
            </h2>

            {data.userFeedback.data.length === 0 ? (
              <div className="text-muted-foreground text-sm p-4 border border-border/40 rounded-lg">
                暂无数据
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {data.userFeedback.data.map((item, i) => {
                  const ratingInfo = RATING_LABELS[item.rating] ?? {
                    label: item.rating,
                    color: 'bg-muted/40 text-muted-foreground border-border',
                  };
                  return (
                    <div key={i} className="border border-border/40 rounded-lg p-4 bg-card/50">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs border rounded-full px-2 py-0.5 font-medium ${ratingInfo.color}`}>
                            {ratingInfo.label}
                          </span>
                          {item.email && (
                            <span className="text-xs text-muted-foreground font-mono">{item.email}</span>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground/60 whitespace-nowrap font-mono">
                          {formatDate(item.created_at)}
                        </span>
                      </div>
                      {item.message && (
                        <p className="mt-2 text-sm text-foreground/90 leading-relaxed">{item.message}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pagination */}
            {data.userFeedback.total_pages > 1 && (
              <div className="flex items-center justify-center gap-3 mt-4">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="text-sm border border-border rounded px-3 py-1 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                >
                  上一页
                </button>
                <span className="text-xs text-muted-foreground font-mono">
                  {page} / {data.userFeedback.total_pages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(data.userFeedback.total_pages, p + 1))}
                  disabled={page >= data.userFeedback.total_pages}
                  className="text-sm border border-border rounded px-3 py-1 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                >
                  下一页
                </button>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
