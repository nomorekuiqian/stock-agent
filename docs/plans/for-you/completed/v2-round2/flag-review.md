# Feature Flag Gating Review — V2 Round 2

**Context:** User asked whether all V2 round 2 changes (backend, frontend, agent) should be gated behind `for_you_v2`. Audit spec/plan/impl and propose.

---

## Findings

### 1. Spec / plan / impl did NOT include flag gating

I checked the three documents:

- **Spec** (`2026-04-25-for-you-v2-round2-design.md`) — no mention of `for_you_v2`, no gating requirement. Backward-compat language focuses on schema (old digests without `action_items` default to `[]`), not on gating vs. V1.
- **Plan** (`2026-04-25-for-you-v2-round2-plan.md`) — no mention of gating. Tasks 11/13 (frontend) don't consult `useFeatureFlags`.
- **Implementation** — all changes are unconditional:
  - Backend: `build_action_bar` always returns agent-driven output (no flag check)
  - Frontend: `ActionBar.tsx` always consumes `visibility` / `target`-based chips
  - `DigestInlineReport.tsx` always renames 总结 → 给你的复盘笔记 and reorders the section

### 2. Current V1/V2 split in the codebase

The `for_you_v2` flag splits two parent components:
- `ForYouContent.tsx` dispatches to `ForYouContentV1` (legacy) or `ForYouContentV2` (new)
- **Only `ForYouContentV2` renders `<ActionBar />`** (`ForYouContentV1` does NOT)
- **Both V1 and V2 render `<DigestInlineReport />`**

So the current landscape:

| Component | V1 | V2 |
|-----------|----|----|
| Action Bar | ❌ not rendered | ✅ rendered |
| Digest Inline Report | ✅ rendered | ✅ rendered |

### 3. Impact assessment per change

| Change | Already gated by V1/V2 split? | User-visible in V1? |
|--------|-------------------------------|---------------------|
| `ActionBar.tsx` refactor (target routing, visibility) | ✅ V1 doesn't render ActionBar at all | No — V1 users never see it |
| `/api/for-you/action-bar` endpoint rewrite | ⚠️ API still public, but V1 frontend never calls it | No (indirect) — V1 frontend doesn't call the hook |
| `build_action_bar` backend rewrite | ⚠️ Endpoint serves anyone who hits it | No (same reason) |
| `DigestInlineReport` rename 总结 → 给你的复盘笔记 + reorder | ❌ **Both V1 and V2 render this component** | **YES — V1 users see the new section title, new order** |
| Backend agent prompt `action_items` section | ❌ Agent always runs with the new prompt | No direct user-visible impact (output field ignored by V1 frontend, but the prompt change may subtly alter `summary` style since it's all one string) |
| Backend `action_items` schema in DigestResponse | ⚠️ Response shape has new field | No — V1 ignores it |

**Verdict:** The **only user-visible leak into V1** is `DigestInlineReport` — because both V1 and V2 render it.

---

## Risk Prioritization

### High — DigestInlineReport is shared

V1 users (anyone without `for_you_v2` flag set) will now see:
- 总结 renamed to 给你的复盘笔记 (with new subtitle)
- The section moved from bottom to position 3 (below 持仓概览, above 头条新闻)
- New anchor IDs on headlines/briefs/events (harmless — no visible change)

If V1 is considered a stable experience that should not change during rollout, these changes leaked.

### Low — backend API shape additions

`DigestResponse` gains `action_items` field (always array, default `[]`). V1 ignores it. No breakage.

### Low — action bar internals

V1 doesn't call `/api/for-you/action-bar`, so the rewrite is invisible to V1 users.

### Low — agent prompt

The new prompt section only tells the LLM how to produce `action_items`. The `summary` / `one_line_summary` / other fields are produced by the same call but their instructions are unchanged. Theoretical risk: LLM may devote a small amount of attention budget to action_items at the cost of summary quality. Not expected to show on real tests.

---

## Proposed Gating Strategy (if you want clean separation)

### Option A: Gate only DigestInlineReport at component level (minimal change)

**Where:** `frontend/src/components/for-you/DigestInlineReport.tsx`

**How:** Add a prop `variant: 'v1' | 'v2'` defaulting to `'v1'`. Only the V2 branch renders the new layout (rename, reorder, section anchors). V1 keeps the old 总结 section at the bottom.

Then:
- `ForYouContentV1.tsx`: calls `<DigestInlineReport digest={...} />` (defaults to v1)
- `ForYouContentV2.tsx`: calls `<DigestInlineReport digest={...} variant="v2" />`

**Cost:**
- Add one prop + a conditional render block in DigestInlineReport
- No changes to backend, ActionBar, agent, or validator
- Can ship today

**Downside:**
- Component has two branches — slight maintenance burden during rollout
- Cleanup (remove the prop) happens during the existing `for_you_v2` full-rollout TODO in `flags/.context.md`

### Option B: Full-stack gating (orthodox)

**Where:** Every layer.

**How:**
- Backend: `build_action_bar` checks user's `for_you_v2` flag. Off → legacy rule-engine path (we'd need to un-skip the old code and re-route). On → new agent-driven path.
- Agent prompt: conditional (based on some feature-flag signal sent with the digest generation request). This is hard because ADK's prompt is static.
- Frontend: DigestInlineReport V1/V2 split like Option A.

**Cost:**
- Reviving the deleted rule engine (Task 10 deleted template helpers)
- Flag context threaded through agent dispatch code
- Significant backend test rewrite
- About 1-2 days of work

**Downside:**
- Agent prompt gating is awkward — the prompt is one big string fed to the LLM runner. Doing it "right" means two prompt strings and choosing one at request time. Feasible but clunky.

### Option C: Ship as-is, scope V1 "legacy" as frozen UI only

**Rationale:** V1 has been deprecated in spirit ever since `for_you_v2` was introduced — the feature flag was designed to **ease the transition to V2, not preserve V1 indefinitely**. The V1 code in `ForYouContentV1.tsx` is slated for deletion per `flags/.context.md` cleanup TODO.

**Implication:**
- V1 users see the new DigestInlineReport layout today
- The section rename and reorder don't introduce regressions — they improve presentation equally in both experiences
- ActionBar differences don't affect V1 since V1 doesn't render it
- Agent backend changes are transparent to V1

**Risk:**
- If a V1 user is still in the "slow rollout" cohort and suddenly sees different presentation, they may be confused. Mitigation: the new presentation is strictly better (cleaner title, better section order), not worse.

---

## Recommendation

**Option A** (gate only `DigestInlineReport` via a prop).

**Status:** ✅ Implemented in commit `8d525be` (2026-04-25).

**Reasons:**
1. Addresses the one real leak (visible layout change in V1).
2. Minimal code change — one prop, one conditional render block. ~30 lines.
3. Keeps backend + ActionBar changes unconditional, which is safe because V1 doesn't render ActionBar or call the endpoint.
4. Aligns with the existing cleanup plan: when `for_you_v2` ships to 100%, we delete `ForYouContentV1`, drop the `variant` prop from `DigestInlineReport`, and the code collapses cleanly.

**What to skip:** Agent prompt / backend action_bar gating (Option B's hard parts). The user-visible impact on V1 is zero, and the plumbing cost is high.

---

## Suggested Option A Implementation (not executed yet)

Two small edits:

### 1. `frontend/src/components/for-you/DigestInlineReport.tsx`

```tsx
interface DigestInlineReportProps {
  digest: DigestResponse;
  variant?: 'v1' | 'v2';   // ← new
  // ...existing props unchanged
}

export default function DigestInlineReport({
  digest,
  variant = 'v1',           // ← defaults to legacy
  // ...existing
}: DigestInlineReportProps) {
  return (
    <div>
      {/* Report Header */}
      {/* Watchlist Overview */}

      {/* V2 only: 给你的复盘笔记 position + rename + subtitle */}
      {variant === 'v2' && digest.summary?.content && (
        <section id="section-notes" ...>
          <h3>给你的复盘笔记</h3>
          <p>综合你的持仓、关注列表与今日相关新闻</p>
          {/* paragraphs */}
        </section>
      )}

      {/* Headlines, Briefs, Events — with section anchors (these are harmless
          for V1; keep them even when variant === 'v1' since they don't
          change rendering) */}

      {/* V1 only: legacy 总结 at the bottom */}
      {variant !== 'v2' && digest.summary?.content && (
        <section className="terminal-card p-6">
          <h3>总结</h3>
          {/* paragraphs */}
        </section>
      )}

      {/* Disclaimer */}
    </div>
  );
}
```

### 2. Update callers

```tsx
// ForYouContentV2.tsx
<DigestInlineReport digest={...} variant="v2" />

// ForYouContentV1.tsx — no change needed (default is 'v1')
```

**Estimated diff:** ~60 lines (JSX duplication for the two summary blocks).

---

## Full-Rollout Migration Plan (when `for_you_v2` ships 100%)

The existing cleanup TODO in `backend/app/features/flags/.context.md` already covers V1→V2 removal. Here's how V2 round 2 fits in:

### Phase 1 — Verify V2 is stable

- Monitor action bar hit rate, chip click-through, complaint rate
- Monitor backend logs for `action_items` truncation warnings, validator rejections
- Monitor agent output quality (do LLMs produce sane action_items?)

### Phase 2 — Ramp `for_you_v2` to 100%

- In Insforge `feature_flags` table, set `for_you_v2` to apply to all users (`enabled_for_all_users = true` or equivalent column)
- Monitor for 1-2 days

### Phase 3 — Execute cleanup checklist

Follow the existing checklist in `flags/.context.md`, plus these round2-specific steps:

1. **DigestInlineReport** (if Option A implemented):
   - Remove `variant` prop
   - Keep only the "给你的复盘笔记" branch
   - Delete the legacy 总结-at-bottom block

2. **Backend for_you/service.py** (dead code cleanup):
   - Remove `compute_max_drag`, `_max_severity`, `_build_chip`, `SEVERITY_ORDER`, `OVERALL_THRESHOLDS`, `SINGLE_DRAG_THRESHOLD` — these were kept during Task 9 for safety
   - Remove `backend/app/features/for_you/templates.py::fallback_headline/fallback_chip_labels` if LLM rendering path is no longer planned

3. **Tests cleanup:**
   - Un-`pytest.skip` or delete the legacy test classes in `test_action_bar.py` (currently marked `"legacy rule-engine removed"`)
   - They weren't deleted intentionally to document the transition — now they're just clutter

4. **Schema:**
   - `DigestResponse.action_items` is no longer optional/empty by default → no change needed, still tolerant

5. **`.context.md` updates:**
   - Remove V1 fallback mentions
   - Update "No rule engine" note to be the single source of truth

### Phase 4 — Flag row deletion

As per `flags/.context.md`: `DELETE FROM feature_flags WHERE flag = 'for_you_v2';`

### Rollback

If post-100% rollout reveals an issue, `git revert` the cleanup commits and re-INSERT the flag row. This is why we should **not** delete the legacy code in the same commit as the cleanup — keep cleanups in separate commits.

---

## Summary

1. **Spec / plan / impl missed feature-flag gating entirely.** This was an oversight.
2. **Risk is low** because the only V1-visible leak is the `DigestInlineReport` layout change. Everything else is either not rendered in V1 (ActionBar) or transparent (backend API shape addition, agent prompt additions).
3. **Recommend Option A**: gate only `DigestInlineReport` via a `variant` prop. ~60 lines of code.
4. **Can also accept Option C** (ship as-is) if V1 is already considered "frozen, being phased out" — the new layout is strictly better in both experiences.
5. **Full rollout**: extends the existing `for_you_v2` cleanup TODO with 4-5 round2-specific steps. No new external-service actions. No Insforge schema changes.

**Decision needed from user:** Option A (gate DigestInlineReport) or Option C (ship as-is, trust V1 is effectively frozen)?
