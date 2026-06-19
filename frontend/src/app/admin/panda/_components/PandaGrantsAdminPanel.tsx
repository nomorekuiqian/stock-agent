'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { api, type CommunityAccessGrant, type PandaGrantDryRunResponse } from '@/lib/api';

interface Props {
  initialGrants: CommunityAccessGrant[];
}

function CountBadge({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs text-muted-foreground">
      {label}
      <strong className="font-data text-foreground">{value}</strong>
    </span>
  );
}

export function PandaGrantsAdminPanel({ initialGrants }: Props) {
  const [grants, setGrants] = useState(initialGrants);
  const [emailsText, setEmailsText] = useState('');
  const [notes, setNotes] = useState('');
  const [dryRun, setDryRun] = useState<PandaGrantDryRunResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const activeCount = useMemo(
    () => grants.filter((grant) => grant.status === 'active').length,
    [grants],
  );

  const refresh = useCallback(async () => {
    const result = await api.adminPandaGrants.list({ email: search.trim() || undefined, limit: 500 });
    setGrants(result.grants);
  }, [search]);

  const runDryRun = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.adminPandaGrants.dryRun({ emails_text: emailsText });
      setDryRun(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dry-run failed');
    } finally {
      setBusy(false);
    }
  }, [emailsText]);

  const apply = useCallback(async () => {
    if (!dryRun) return;
    const totalNew = dryRun.to_create.length + dryRun.to_reactivate.length;
    if (totalNew === 0) return;
    if (!window.confirm(`确认开通 ${totalNew} 个 Panda Agent access？`)) return;

    setBusy(true);
    setError(null);
    try {
      const result = await api.adminPandaGrants.apply({
        emails_text: emailsText,
        notes: notes.trim() || null,
      });
      setDryRun(result.dry_run);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Apply failed');
    } finally {
      setBusy(false);
    }
  }, [dryRun, emailsText, notes, refresh]);

  const revoke = useCallback(async (grant: CommunityAccessGrant) => {
    if (!window.confirm(`确认撤销 ${grant.email_normalized} 的 Panda Agent access？`)) return;
    setBusy(true);
    setError(null);
    try {
      await api.adminPandaGrants.revoke(grant.id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Revoke failed');
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-6">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link href="/admin" className="text-sm text-muted-foreground hover:text-primary">
              返回 Admin
            </Link>
            <h1 className="mt-2 text-2xl font-editorial text-foreground md:text-3xl">
              Panda 授权
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              从知识星球报名评论复制 email，批量开通 Panda Agent access。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <CountBadge label="总授权" value={grants.length} />
            <CountBadge label="Active" value={activeCount} />
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-lg border border-border bg-card p-4">
            <label className="text-sm font-medium text-foreground" htmlFor="panda-emails">
              粘贴 email
            </label>
            <textarea
              id="panda-emails"
              value={emailsText}
              onChange={(event) => {
                setEmailsText(event.target.value);
                setDryRun(null);
              }}
              placeholder="member1@example.com&#10;member2@example.com"
              className="mt-2 h-52 w-full resize-y rounded-md border border-border bg-background p-3 font-mono text-sm text-foreground outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
            />
            <label className="mt-4 block text-sm font-medium text-foreground" htmlFor="panda-notes">
              备注
            </label>
            <input
              id="panda-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="例如：2026-06 知识星球报名帖"
              className="mt-2 h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
            />
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={runDryRun}
                disabled={busy || !emailsText.trim()}
                className="h-10 rounded-md border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                Dry-run
              </button>
              <button
                type="button"
                onClick={apply}
                disabled={busy || !dryRun || dryRun.to_create.length + dryRun.to_reactivate.length === 0}
                className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                确认开通
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-medium text-foreground">Dry-run 结果</h2>
            {!dryRun ? (
              <p className="mt-3 text-sm text-muted-foreground">先运行 dry-run。</p>
            ) : (
              <div className="mt-3 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <CountBadge label="有效" value={dryRun.valid_count} />
                  <CountBadge label="新增" value={dryRun.to_create.length} />
                  <CountBadge label="恢复" value={dryRun.to_reactivate.length} />
                  <CountBadge label="已开通" value={dryRun.existing_active.length} />
                  <CountBadge label="重复" value={dryRun.duplicates.length} />
                  <CountBadge label="无效" value={dryRun.invalid.length} />
                </div>
                {dryRun.invalid.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-destructive">无效 email</div>
                    <div className="mt-1 max-h-24 overflow-auto rounded-md bg-muted p-2 font-mono text-xs text-muted-foreground">
                      {dryRun.invalid.join('\n')}
                    </div>
                  </div>
                )}
                {dryRun.to_create.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-foreground">将新增</div>
                    <div className="mt-1 max-h-28 overflow-auto rounded-md bg-muted p-2 font-mono text-xs text-muted-foreground">
                      {dryRun.to_create.join('\n')}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        <section className="mt-6 rounded-lg border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
            <div>
              <h2 className="text-sm font-medium text-foreground">授权名单</h2>
              <p className="text-xs text-muted-foreground">只展示当前筛选下的最近授权。</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜索 email"
                className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary/40"
              />
              <button
                type="button"
                onClick={() => void refresh()}
                disabled={busy}
                className="h-9 rounded-md border border-border px-3 text-sm text-foreground transition-colors hover:bg-muted disabled:opacity-50"
              >
                刷新
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Email</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">最近登录用户</th>
                  <th className="px-3 py-2 text-left">Granted</th>
                  <th className="px-3 py-2 text-left">操作</th>
                </tr>
              </thead>
              <tbody>
                {grants.map((grant) => (
                  <tr key={grant.id} className="border-t border-border/50">
                    <td className="px-3 py-2 font-mono text-xs text-foreground">{grant.email_normalized}</td>
                    <td className="px-3 py-2 text-muted-foreground">{grant.status}</td>
                    <td className="px-3 py-2 text-muted-foreground">{grant.user_id || grant.first_seen_user_id || '—'}</td>
                    <td className="px-3 py-2 text-muted-foreground">{grant.granted_at || '—'}</td>
                    <td className="px-3 py-2">
                      {grant.status === 'active' ? (
                        <button
                          type="button"
                          onClick={() => void revoke(grant)}
                          disabled={busy}
                          className="rounded-md border border-destructive/30 px-2 py-1 text-xs text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
                        >
                          撤销
                        </button>
                      ) : (
                        <span className="text-xs text-muted-foreground">已撤销</span>
                      )}
                    </td>
                  </tr>
                ))}
                {grants.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                      暂无授权
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

