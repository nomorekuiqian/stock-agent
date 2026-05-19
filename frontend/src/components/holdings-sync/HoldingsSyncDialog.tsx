'use client';

/**
 * HoldingsSyncDialog — Track M v1 (Stage 1: screenshot).
 *
 * Single Radix Dialog with three tiles (screenshot enabled; paste/CSV/PDF
 * "即将上线" disabled — backend stage gate would 400 anyway). Once a draft
 * is returned, renders a Review table with per-row status chips, candidate
 * chips for needs_review, and a manual symbol search fallback. Submission
 * sends the COMPLETE accepted set as the source target (replace-by-source
 * contract).
 *
 * Currency / multi-account / dup_of / class-share confirmations are
 * surfaced via the row's `notices` and `candidates` (design §1 + §7bis).
 * The full §1bis polish (sticky bar, mobile single-column, optimistic
 * undo) lands in a follow-up — this is the functional MVP.
 */

import { useCallback, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  HoldingsSyncCandidate,
  HoldingsSyncExtractDraft,
  HoldingsSyncExtractedRow,
  HoldingsSyncNormalized,
  HoldingsSyncRowStatus,
  HoldingsSyncSource,
} from '@/lib/api';
import {
  useHoldingsSyncCommit,
  useHoldingsSyncExtract,
} from '@/hooks/queries/use-holdings-sync';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

// ----- props ----------------------------------------------------------------

interface Props {
  trigger: React.ReactNode;            // entry card / button
}

// ----- per-row editing state ------------------------------------------------

interface RowEdit {
  symbol: string | null;               // editable: candidate pick / manual
  shares: number | null;
  cost_basis: number | null;
  weight_pct: number | null;
  accepted: boolean;                   // default: ok→true, others→false
}

// Defaults derived from the resolver's output.
function initialEdit(r: HoldingsSyncExtractedRow): RowEdit {
  return {
    symbol: r.symbol ?? null,
    shares: r.shares ?? null,
    cost_basis: r.cost_basis ?? null,
    weight_pct: r.weight_pct ?? null,
    accepted: r.status === 'ok' && !!r.symbol,
  };
}

// ----- status chip ----------------------------------------------------------

const STATUS_LABEL: Record<HoldingsSyncRowStatus, { label: string; cls: string }> = {
  ok:                 { label: '已匹配',     cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  needs_review:       { label: '待确认',     cls: 'bg-amber-50 text-amber-700 ring-amber-200' },
  unresolved:         { label: '未识别',     cls: 'bg-red-50 text-red-700 ring-red-200' },
  needs_mapping:      { label: '需要映射',   cls: 'bg-sky-50 text-sky-700 ring-sky-200' },
  pending_review:     { label: '识别中',     cls: 'bg-slate-50 text-slate-700 ring-slate-200' },
  no_quote:           { label: '无报价',     cls: 'bg-red-50 text-red-700 ring-red-200' },
  budget_exhausted:   { label: '请手动确认', cls: 'bg-amber-50 text-amber-700 ring-amber-200' },
};

function StatusChip({ status }: { status: HoldingsSyncRowStatus }) {
  const meta = STATUS_LABEL[status] ?? STATUS_LABEL.unresolved;
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs ring-1 ring-inset ${meta.cls}`}>
      {meta.label}
    </span>
  );
}

// ----- main dialog ----------------------------------------------------------

export default function HoldingsSyncDialog({ trigger }: Props) {
  const { user } = useAuth();
  const userId = user?.id;
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<HoldingsSyncSource | null>(null);
  const [draft, setDraft] = useState<HoldingsSyncExtractDraft | null>(null);
  const [edits, setEdits] = useState<RowEdit[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const extractMut = useHoldingsSyncExtract();
  const commitMut = useHoldingsSyncCommit(userId);

  // ---- reset on close so re-opening starts clean -------------------------
  const reset = useCallback(() => {
    setMode(null);
    setDraft(null);
    setEdits([]);
    setErrorMsg(null);
  }, []);

  const onOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) reset();
  }, [reset]);

  // ---- screenshot extract ------------------------------------------------
  const onScreenshotPicked = useCallback(async (file: File) => {
    setErrorMsg(null);
    setMode('screenshot');
    try {
      const d = await extractMut.mutateAsync({ mode: 'screenshot', file });
      setDraft(d);
      setEdits(d.rows.map(initialEdit));
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'AI 识别失败，请稍后重试';
      setErrorMsg(msg);
    }
  }, [extractMut]);

  // ---- per-row helpers ---------------------------------------------------
  const setEdit = useCallback((i: number, patch: Partial<RowEdit>) => {
    setEdits((cur) => cur.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  }, []);

  // ---- build commit payload (replace-by-source COMPLETE set) -------------
  const acceptedRows = useMemo<HoldingsSyncNormalized[]>(() => {
    if (!draft) return [];
    const out: HoldingsSyncNormalized[] = [];
    for (const e of edits) {
      if (!e.accepted) continue;
      const sym = (e.symbol || '').trim().toUpperCase();
      if (!sym) continue;
      out.push({
        symbol: sym,
        shares: e.shares ?? null,
        cost_basis: e.cost_basis ?? null,
        weight_pct: e.weight_pct ?? null,
      });
    }
    return out;
  }, [draft, edits]);

  const summary = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of draft?.rows ?? []) {
      counts[r.status] = (counts[r.status] ?? 0) + 1;
    }
    return counts;
  }, [draft]);

  const onCommit = useCallback(async () => {
    if (!draft) return;
    if (acceptedRows.length === 0) {
      setErrorMsg('没有可提交的行 — 请至少确认一条持仓');
      return;
    }
    setErrorMsg(null);
    try {
      await commitMut.mutateAsync({
        source: draft.source,
        draft_id: draft.draft_id,
        rows: acceptedRows,
      });
      onOpenChange(false);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : '提交失败，请稍后重试');
    }
  }, [draft, acceptedRows, commitMut, onOpenChange]);

  // ---- render ------------------------------------------------------------
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>同步持仓</DialogTitle>
          <DialogDescription>
            上传券商截图自动识别持仓；AI 识别可能有误，请核对数量与代码后再提交。
          </DialogDescription>
        </DialogHeader>

        {/* ---- step 1: tiles (no draft yet) -------------------------- */}
        {!draft && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <ScreenshotTile
              onPick={onScreenshotPicked}
              loading={extractMut.isPending}
            />
            <DisabledTile title="粘贴持仓" subtitle="即将上线" />
            <DisabledTile title="CSV / PDF" subtitle="即将上线" />
          </div>
        )}

        {/* ---- step 2: review ------------------------------------- */}
        {draft && (
          <div className="space-y-3">
            <SummaryBar counts={summary} total={draft.rows.length}
                        accepted={acceptedRows.length} />
            {draft.dropped_note && (
              <p className="text-sm text-slate-600">{draft.dropped_note}</p>
            )}
            <div className="max-h-[420px] overflow-y-auto rounded border border-slate-200">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500">
                  <tr>
                    <th className="w-8 px-2 py-2"></th>
                    <th className="px-2 py-2">代码 / 名称</th>
                    <th className="px-2 py-2 text-right">数量</th>
                    <th className="px-2 py-2 text-right">成本</th>
                    <th className="px-2 py-2 text-right">权重 %</th>
                    <th className="px-2 py-2">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {draft.rows.map((r, i) => (
                    <RowView
                      key={i}
                      row={r}
                      edit={edits[i]}
                      onChange={(patch) => setEdit(i, patch)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {errorMsg && (
          <p className="text-sm text-red-600">{errorMsg}</p>
        )}

        <DialogFooter>
          {draft && (
            <>
              <Button variant="outline" onClick={() => reset()}>
                重新开始
              </Button>
              <Button
                onClick={onCommit}
                disabled={commitMut.isPending || acceptedRows.length === 0}
              >
                {commitMut.isPending
                  ? '提交中…'
                  : `提交 ${acceptedRows.length} 项已接受`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ----- subcomponents --------------------------------------------------------

function SummaryBar({
  counts,
  total,
  accepted,
}: {
  counts: Record<string, number>;
  total: number;
  accepted: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
      <span className="font-medium">识别 {total} 项</span>
      {counts.ok ? <span>✓ 已匹配 {counts.ok}</span> : null}
      {counts.needs_review ? <span>? 待确认 {counts.needs_review}</span> : null}
      {counts.no_quote ? <span>⚠ 无报价 {counts.no_quote}</span> : null}
      {counts.unresolved ? <span>⚠ 未识别 {counts.unresolved}</span> : null}
      <span className="ml-auto font-medium text-emerald-700">
        已接受 {accepted} / {total}
      </span>
    </div>
  );
}

function ScreenshotTile({
  onPick,
  loading,
}: {
  onPick: (f: File) => void;
  loading: boolean;
}) {
  return (
    <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded border-2 border-dashed border-emerald-300 bg-emerald-50/40 px-4 py-6 text-center hover:bg-emerald-50">
      <span className="text-sm font-medium text-emerald-700">上传截图</span>
      <span className="text-xs text-slate-500">PNG / JPEG / WEBP，≤6MB</span>
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        disabled={loading}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.currentTarget.value = '';
        }}
      />
      {loading && (
        <span className="text-xs text-slate-500">AI 识别中…</span>
      )}
    </label>
  );
}

function DisabledTile({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded border-2 border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center opacity-60">
      <span className="text-sm font-medium text-slate-500">{title}</span>
      <span className="text-xs text-slate-400">{subtitle}</span>
    </div>
  );
}

function RowView({
  row,
  edit,
  onChange,
}: {
  row: HoldingsSyncExtractedRow;
  edit: RowEdit;
  onChange: (patch: Partial<RowEdit>) => void;
}) {
  return (
    <tr className="border-t border-slate-100 align-top">
      {/* accept toggle */}
      <td className="px-2 py-2">
        <input
          type="checkbox"
          checked={edit.accepted}
          onChange={(e) => onChange({ accepted: e.target.checked })}
          disabled={!edit.symbol}
          aria-label="接受这一行"
        />
      </td>
      {/* symbol column */}
      <td className="px-2 py-2">
        <div className="font-mono text-sm">
          {edit.symbol || <span className="text-slate-400">未识别</span>}
          {row.resolved_name && (
            <span className="ml-1 text-xs text-slate-500">
              — {row.resolved_name}
              {row.exchange ? ` (${row.exchange})` : ''}
            </span>
          )}
        </div>
        <div className="text-xs text-slate-400">原文：{row.raw}</div>
        {row.candidates.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {row.candidates.map((c: HoldingsSyncCandidate) => (
              <button
                key={c.symbol}
                type="button"
                onClick={() =>
                  onChange({ symbol: c.symbol, accepted: true })
                }
                className={`rounded border px-1.5 py-0.5 text-xs ${
                  edit.symbol === c.symbol
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {c.symbol} <span className="text-slate-400">({c.exchange})</span>
              </button>
            ))}
          </div>
        )}
        {row.notices.map((n, idx) => (
          <div key={idx} className="text-xs text-amber-700">ⓘ {n}</div>
        ))}
      </td>
      {/* numeric columns */}
      <NumericCell
        value={edit.shares}
        onChange={(v) => onChange({ shares: v })}
      />
      <NumericCell
        value={edit.cost_basis}
        onChange={(v) => onChange({ cost_basis: v })}
      />
      <NumericCell
        value={edit.weight_pct}
        onChange={(v) => onChange({ weight_pct: v })}
      />
      <td className="px-2 py-2">
        <StatusChip status={row.status} />
      </td>
    </tr>
  );
}

function NumericCell({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <td className="px-2 py-2 text-right">
      <input
        type="number"
        inputMode="decimal"
        step="any"
        className="w-20 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-right text-sm tabular-nums"
        value={value ?? ''}
        onChange={(e) => {
          const s = e.target.value.trim();
          onChange(s === '' ? null : Number(s));
        }}
      />
    </td>
  );
}
