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
import { api,
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

const MAX_PASTE_CHARS = 8000; // mirror backend hard cap

// Stage 2 = paste + CSV active. Switch to false to leave them as
// "即将上线" tiles even though the backend code-path exists.
const PASTE_TILE_LIVE = true;
const CSV_TILE_LIVE = true;

export default function HoldingsSyncDialog({ trigger }: Props) {
  const { user } = useAuth();
  const userId = user?.id;
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<HoldingsSyncSource | null>(null);
  // tiles | paste-input | csv-mapping | review (review = `draft && !needs_mapping`)
  const [view, setView] = useState<'tiles' | 'paste-input' | 'csv-mapping'>('tiles');
  const [draft, setDraft] = useState<HoldingsSyncExtractDraft | null>(null);
  const [edits, setEdits] = useState<RowEdit[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});

  const extractMut = useHoldingsSyncExtract();
  const commitMut = useHoldingsSyncCommit(userId);

  // ---- reset on close so re-opening starts clean -------------------------
  const reset = useCallback(() => {
    setMode(null);
    setView('tiles');
    setDraft(null);
    setEdits([]);
    setErrorMsg(null);
    setPasteText('');
    setCsvFile(null);
    setMapping({});
  }, []);

  const onOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) reset();
  }, [reset]);

  // Common: handle an ExtractDraft response — switch into review or mapping.
  const ingest = useCallback((d: HoldingsSyncExtractDraft) => {
    setDraft(d);
    // CSV `needs_mapping` arrives as empty rows + columns set + dropped_note
    // — keep the mapping step in `csv-mapping` view; everything else goes
    // straight to the review table.
    const isMappingStep =
      d.source === 'csv' && d.rows.length === 0 && (d.columns?.length ?? 0) > 0;
    setView(isMappingStep ? 'csv-mapping' : 'tiles');
    if (!isMappingStep) {
      setEdits(d.rows.map(initialEdit));
    }
  }, []);

  // ---- screenshot extract ------------------------------------------------
  const onScreenshotPicked = useCallback(async (file: File) => {
    setErrorMsg(null);
    setMode('screenshot');
    try {
      ingest(await extractMut.mutateAsync({ mode: 'screenshot', file }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'AI 识别失败，请稍后重试';
      setErrorMsg(msg);
    }
  }, [extractMut, ingest]);

  // ---- paste extract -----------------------------------------------------
  const onPasteSubmit = useCallback(async () => {
    const text = pasteText.trim();
    if (!text) {
      setErrorMsg('请粘贴持仓内容');
      return;
    }
    if (text.length > MAX_PASTE_CHARS) {
      setErrorMsg(`粘贴文本过长（>${MAX_PASTE_CHARS} 字符）`);
      return;
    }
    setErrorMsg(null);
    setMode('paste');
    try {
      ingest(await api.holdingsSync.extractPaste(text));
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'AI 识别失败，请稍后重试');
    }
  }, [pasteText, ingest]);

  // ---- CSV extract -------------------------------------------------------
  const onCsvPicked = useCallback(async (file: File) => {
    setErrorMsg(null);
    setMode('csv');
    setCsvFile(file);
    try {
      ingest(await extractMut.mutateAsync({ mode: 'csv', file }));
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'CSV 解析失败，请稍后重试');
    }
  }, [extractMut, ingest]);

  // ---- CSV mapping resubmit ---------------------------------------------
  const onMappingSubmit = useCallback(async () => {
    if (!csvFile) {
      setErrorMsg('请重新选择 CSV 文件');
      return;
    }
    if (!mapping.symbol) {
      setErrorMsg('至少需要选择「代码」列');
      return;
    }
    setErrorMsg(null);
    try {
      ingest(await api.holdingsSync.extractCsv(csvFile, mapping));
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'CSV 解析失败，请稍后重试');
    }
  }, [csvFile, mapping, ingest]);

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

        {/* ---- step 1a: tiles -------------------------------------- */}
        {view === 'tiles' && !draft && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <ScreenshotTile
              onPick={onScreenshotPicked}
              loading={extractMut.isPending}
            />
            {PASTE_TILE_LIVE ? (
              <PasteTile onClick={() => { setMode('paste'); setView('paste-input'); }} />
            ) : (
              <DisabledTile title="粘贴持仓" subtitle="即将上线" />
            )}
            {CSV_TILE_LIVE ? (
              <CsvTile onPick={onCsvPicked} loading={extractMut.isPending} />
            ) : (
              <DisabledTile title="CSV 导入" subtitle="即将上线" />
            )}
          </div>
        )}

        {/* ---- step 1b: paste input (textarea + counter) -------------- */}
        {view === 'paste-input' && (
          <div className="space-y-2">
            <p className="text-sm text-slate-600">
              粘贴券商导出的持仓文本（CSV、表格、自然语言均可）。AI 识别可能有误，
              请核对数量与代码后再提交。
            </p>
            <textarea
              className="h-40 w-full rounded border border-slate-200 p-2 text-sm font-mono"
              placeholder="AAPL 10\nMSFT 5 cost=300\n现金 1234.56\n…"
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              maxLength={MAX_PASTE_CHARS}
              autoFocus
            />
            <div className="flex items-center justify-between text-xs">
              <span className={pasteText.length > MAX_PASTE_CHARS * 0.9
                ? 'text-amber-700' : 'text-slate-400'}>
                {pasteText.length} / {MAX_PASTE_CHARS}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm"
                  onClick={() => { setView('tiles'); setPasteText(''); }}>
                  返回
                </Button>
                <Button size="sm"
                  onClick={onPasteSubmit}
                  disabled={extractMut.isPending || !pasteText.trim()}>
                  {extractMut.isPending ? '识别中…' : 'AI 识别'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ---- step 1c: CSV column mapping picker ------------------ */}
        {view === 'csv-mapping' && draft?.columns && (
          <CsvMappingPicker
            columns={draft.columns}
            note={draft.dropped_note ?? null}
            mapping={mapping}
            onChange={setMapping}
            onSubmit={onMappingSubmit}
            onBack={() => { setView('tiles'); setDraft(null); setMapping({}); }}
            loading={extractMut.isPending}
          />
        )}

        {/* ---- step 2: review ------------------------------------- */}
        {draft && view === 'tiles' && (
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

        <DialogFooter className="sticky bottom-0 bg-white">
          {draft && view === 'tiles' && (
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

function PasteTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-2 rounded border-2 border-dashed border-emerald-300 bg-emerald-50/40 px-4 py-6 text-center hover:bg-emerald-50"
    >
      <span className="text-sm font-medium text-emerald-700">粘贴持仓</span>
      <span className="text-xs text-slate-500">CSV / 表格 / 自然语言均可</span>
    </button>
  );
}

function CsvTile({
  onPick,
  loading,
}: {
  onPick: (f: File) => void;
  loading: boolean;
}) {
  return (
    <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded border-2 border-dashed border-emerald-300 bg-emerald-50/40 px-4 py-6 text-center hover:bg-emerald-50">
      <span className="text-sm font-medium text-emerald-700">上传 CSV</span>
      <span className="text-xs text-slate-500">券商导出 .csv / .txt，≤2MB</span>
      <input
        type="file"
        accept=".csv,.txt,text/csv,text/plain"
        className="hidden"
        disabled={loading}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.currentTarget.value = '';
        }}
      />
    </label>
  );
}

const _MAPPABLE_FIELDS: Array<{ key: string; label: string; hint?: string }> = [
  { key: 'symbol', label: '代码 / Symbol', hint: '必选' },
  { key: 'shares', label: '数量 / Shares' },
  { key: 'cost_basis', label: '成本 / Cost' },
  { key: 'entry_price', label: '买入均价 / Avg Price' },
  { key: 'weight_pct', label: '权重 % / Weight' },
];

function CsvMappingPicker({
  columns,
  note,
  mapping,
  onChange,
  onSubmit,
  onBack,
  loading,
}: {
  columns: string[];
  note: string | null;
  mapping: Record<string, string>;
  onChange: (m: Record<string, string>) => void;
  onSubmit: () => void;
  onBack: () => void;
  loading: boolean;
}) {
  return (
    <div className="space-y-3">
      {note && <p className="text-sm text-amber-700">{note}</p>}
      <p className="text-sm text-slate-600">
        请为持仓字段指定对应的列：
      </p>
      <div className="space-y-2">
        {_MAPPABLE_FIELDS.map((f) => (
          <div key={f.key} className="flex items-center gap-3">
            <label className="w-32 shrink-0 text-sm text-slate-700">
              {f.label}
              {f.hint && <span className="ml-1 text-xs text-amber-700">({f.hint})</span>}
            </label>
            <select
              className="flex-1 rounded border border-slate-200 bg-white px-2 py-1 text-sm"
              value={mapping[f.key] ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                const next = { ...mapping };
                if (v) next[f.key] = v;
                else delete next[f.key];
                onChange(next);
              }}
            >
              <option value="">— 不映射 —</option>
              {columns.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-end gap-2 text-xs">
        <Button variant="outline" size="sm" onClick={onBack}>返回</Button>
        <Button size="sm"
          onClick={onSubmit}
          disabled={loading || !mapping.symbol}>
          {loading ? '解析中…' : '解析'}
        </Button>
      </div>
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
