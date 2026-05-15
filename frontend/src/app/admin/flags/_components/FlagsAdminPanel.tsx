'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { getAccessTokenAsync, getAccessTokenSync } from '@/contexts/AuthContext';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api';

export interface KnownFlag {
  key: string;
  description: string;
}

export interface FlagsAdminRow {
  user_id: string;
  email: string | null;
  name: string | null;
  plan: string | null;
  flags: { flag: string; created_at: string | null }[];
}

export interface FlagsAdminData {
  known_flags: KnownFlag[];
  assignments: FlagsAdminRow[];
}

interface Props {
  initialData: FlagsAdminData;
  accessToken: string;
}

export function FlagsAdminPanel({ initialData, accessToken: _initialToken }: Props) {
  const [data, setData] = useState<FlagsAdminData>(initialData);
  const [emailSearch, setEmailSearch] = useState('');
  const [flagFilter, setFlagFilter] = useState<string>('');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const knownFlags = data.known_flags;

  const refresh = useCallback(async (email: string, flag: string) => {
    const token = getAccessTokenSync() ?? (await getAccessTokenAsync());
    if (!token) return;
    const qs = new URLSearchParams();
    if (email.trim()) qs.set('email', email.trim());
    if (flag) qs.set('flag', flag);
    const res = await fetch(`${API_BASE}/admin/flags?${qs}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (res.ok) {
      const next = (await res.json()) as FlagsAdminData;
      setData(next);
      setError(null);
    } else {
      setError(`刷新失败: HTTP ${res.status}`);
    }
  }, []);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onEmailChange = useCallback((value: string) => {
    setEmailSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { void refresh(value, flagFilter); }, 300);
  }, [refresh, flagFilter]);

  const onFlagFilterChange = useCallback((value: string) => {
    setFlagFilter(value);
    void refresh(emailSearch, value);
  }, [emailSearch, refresh]);

  const grantFlag = useCallback(async (userId: string, flag: string) => {
    setBusyKey(`${userId}:${flag}:add`);
    setError(null);
    try {
      const token = getAccessTokenSync() ?? (await getAccessTokenAsync());
      if (!token) return;
      const res = await fetch(`${API_BASE}/admin/flags`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, flag }),
      });
      if (!res.ok) {
        const text = await res.text();
        setError(`添加失败: ${text}`);
        return;
      }
      setData((prev) => ({
        ...prev,
        assignments: prev.assignments.map((row) =>
          row.user_id === userId && !row.flags.some((f) => f.flag === flag)
            ? { ...row, flags: [...row.flags, { flag, created_at: new Date().toISOString() }] }
            : row,
        ),
      }));
      await refresh(emailSearch, flagFilter);
    } finally {
      setBusyKey(null);
    }
  }, [emailSearch, flagFilter, refresh]);

  const revokeFlag = useCallback(async (userId: string, flag: string) => {
    if (!window.confirm(`确认移除用户 ${userId.slice(0, 8)}… 的 "${flag}" 灰度？`)) return;
    setBusyKey(`${userId}:${flag}:del`);
    setError(null);
    try {
      const token = getAccessTokenSync() ?? (await getAccessTokenAsync());
      if (!token) return;
      const qs = new URLSearchParams({ user_id: userId, flag });
      const res = await fetch(`${API_BASE}/admin/flags?${qs}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setError(`移除失败: HTTP ${res.status}`);
        return;
      }
      setData((prev) => ({
        ...prev,
        assignments: prev.assignments.map((row) =>
          row.user_id === userId
            ? { ...row, flags: row.flags.filter((f) => f.flag !== flag) }
            : row,
        ),
      }));
      await refresh(emailSearch, flagFilter);
    } finally {
      setBusyKey(null);
    }
  }, [emailSearch, flagFilter, refresh]);

  const rows = data.assignments;
  const totalUsersWithFlag = useMemo(() => {
    if (!flagFilter) return rows.length;
    return rows.filter((r) => r.flags.some((f) => f.flag === flagFilter)).length;
  }, [rows, flagFilter]);

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link href="/admin" className="text-sm text-muted-foreground hover:text-primary">
              ← 返回 Admin
            </Link>
            <h1 className="mt-2 text-2xl md:text-3xl font-editorial text-foreground">灰度管理</h1>
            <p className="text-sm text-muted-foreground mt-1">
              共 {rows.length} 用户 · 命中筛选 {totalUsersWithFlag}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-4">
          <input
            type="search"
            placeholder="搜索邮箱（子串）"
            value={emailSearch}
            onChange={(e) => onEmailChange(e.target.value)}
            className="px-3 py-2 rounded-lg border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 min-w-[260px]"
          />
          <select
            value={flagFilter}
            onChange={(e) => onFlagFilterChange(e.target.value)}
            className="px-3 py-2 rounded-lg border border-border bg-card text-sm text-foreground"
          >
            <option value="">所有 flag</option>
            {knownFlags.map((f) => (
              <option key={f.key} value={f.key}>{f.key}</option>
            ))}
          </select>
        </div>

        {error && (
          <div className="mb-4 px-3 py-2 rounded-lg border border-red-500/30 bg-red-500/10 text-sm text-red-400">
            {error}
          </div>
        )}

        <div className="rounded-xl border border-border/60 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-card/40 text-muted-foreground text-xs uppercase tracking-wide">
              <tr>
                <th className="px-3 py-2 text-left">Email</th>
                <th className="px-3 py-2 text-left">姓名</th>
                <th className="px-3 py-2 text-left">Plan</th>
                <th className="px-3 py-2 text-left">已开通的 Flags</th>
                <th className="px-3 py-2 text-left">添加</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <FlagsRow
                  key={row.user_id}
                  row={row}
                  knownFlags={knownFlags}
                  busyKey={busyKey}
                  onGrant={grantFlag}
                  onRevoke={revokeFlag}
                />
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">无匹配用户</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}

interface RowProps {
  row: FlagsAdminRow;
  knownFlags: KnownFlag[];
  busyKey: string | null;
  onGrant: (userId: string, flag: string) => void;
  onRevoke: (userId: string, flag: string) => void;
}

function FlagsRow({ row, knownFlags, busyKey, onGrant, onRevoke }: RowProps) {
  const [draftFlag, setDraftFlag] = useState<string>('');
  const availableFlags = knownFlags.filter((f) => !row.flags.some((rf) => rf.flag === f.key));

  return (
    <tr className="border-t border-border/40">
      <td className="px-3 py-2 text-foreground">{row.email ?? '—'}</td>
      <td className="px-3 py-2 text-muted-foreground">{row.name ?? '—'}</td>
      <td className="px-3 py-2 text-muted-foreground">{row.plan ?? '—'}</td>
      <td className="px-3 py-2">
        {row.flags.length === 0 && <span className="text-muted-foreground text-xs">无</span>}
        <div className="flex flex-wrap gap-1.5">
          {row.flags.map((f) => {
            const key = `${row.user_id}:${f.flag}:del`;
            return (
              <button
                key={f.flag}
                type="button"
                onClick={() => onRevoke(row.user_id, f.flag)}
                disabled={busyKey === key}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-primary/30 bg-primary/10 text-xs text-primary hover:bg-primary/20 disabled:opacity-50"
                title="点击移除"
              >
                {f.flag}
                <span aria-hidden className="text-primary/70">×</span>
              </button>
            );
          })}
        </div>
      </td>
      <td className="px-3 py-2">
        {availableFlags.length === 0 ? (
          <span className="text-muted-foreground text-xs">全部已开通</span>
        ) : (
          <div className="flex items-center gap-2">
            <select
              value={draftFlag}
              onChange={(e) => setDraftFlag(e.target.value)}
              className="px-2 py-1 rounded-md border border-border bg-background text-xs"
            >
              <option value="">选择 flag…</option>
              {availableFlags.map((f) => (
                <option key={f.key} value={f.key}>{f.key}</option>
              ))}
            </select>
            <button
              type="button"
              disabled={!draftFlag || busyKey === `${row.user_id}:${draftFlag}:add`}
              onClick={() => { onGrant(row.user_id, draftFlag); setDraftFlag(''); }}
              className="px-2 py-1 rounded-md bg-primary text-primary-foreground text-xs disabled:opacity-50"
            >
              + 添加
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}
