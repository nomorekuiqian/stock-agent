---
name: review-changes
description: Review all git changes (staged, unstaged, untracked) with parallel multi-agent analysis. Not limited to current context window.
argument-hint: "[focus: security|performance|quality|all]"
allowed-tools: Bash(git:*), Read, Grep, Glob, Task
---

# Code Review: All Current Git Changes

Review all pending git changes comprehensively using parallel agents.

## Step 1: Collect Change Scope

Run these commands to understand the full scope:

```bash
echo "=== CHANGED FILES ==="
git diff --name-status
git diff --cached --name-status
git ls-files --others --exclude-standard

echo "=== DIFF STATS ==="
git diff --stat
git diff --cached --stat
```

## Step 2: Read CLAUDE.md

Read the project CLAUDE.md and any directory-level CLAUDE.md files relevant to the changed files. These contain project rules that the review must check against.

## Step 2.5: Automated Quality Checks

Run these checks in parallel. Failures here become **critical** issues in the review.

### Frontend checks (if any frontend files changed)

```bash
cd frontend && npm run lint 2>&1 | tail -20
cd frontend && npx tsc --noEmit 2>&1 | tail -20
cd frontend && npm run test 2>&1 | tail -20
```

### Backend checks (if any backend files changed)

```bash
cd backend && source venv/bin/activate && python -c "from app.main import app; print('OK')" 2>&1
cd backend && source venv/bin/activate && python -m pytest tests/test_*.py -x --tb=short -q --ignore=tests/e2e --ignore=tests/integration 2>&1 | tail -20
```

**If any check fails**: Include it as a **critical** issue in the final report with the exact error output.
**If all pass**: Note "Automated checks: all passed" in the summary section.

## Step 2.7: Documentation Drift Check

If any of these file patterns appear in the changed files:
- `backend/app/features/*/router.py` --> audit that feature's `.context.md` (endpoint section)
- `backend/app/core/config.py` --> audit CLAUDE.md env vars section
- `frontend/src/app/**/page.tsx` --> audit `frontend/docs/pages.md`
- `frontend/src/components/*.tsx` --> audit `frontend/docs/components.md`
- `backend/app/features/*/db.py` --> audit that feature's `.context.md` (data flow section)
- Any `.context.md` file itself --> skip (already being changed)

For each match:
1. Read the relevant `.context.md` (or reference doc) AND the changed source file
2. Check if the documentation accurately reflects the code changes
3. If drift is detected, include it as a **medium** severity issue in the final report under category `docs-drift`, with a specific suggestion for what to update

If no patterns match, skip this step.

## Step 3: Parallel Review

Launch parallel Task agents (subagent_type: general-purpose) for each changed file or logical group of files. Each agent should:

1. Read the full diff for its assigned file(s): `git diff -- <file>` and `git diff --cached -- <file>`
2. Read the full current file for context
3. Review for:
   - **Correctness**: Logic errors, edge cases, null/undefined handling, type mismatches
   - **CLAUDE.md compliance**: Does the code follow project rules?
   - **Security**: Injection, XSS, secrets exposure, auth gaps
   - **Performance**: O(n^2) patterns, unnecessary re-renders, missing caching
   - **Consistency**: Does it match existing project patterns and conventions?

Each agent returns a list of issues with:
- File path and line number
- Severity: critical / high / medium / low
- Category: correctness / security / performance / quality / claude-md
- Description and suggested fix

## Step 4: Aggregate and Filter

Collect results from all agents. Filter out:
- Issues below medium severity
- False positives (pre-existing issues, intentional changes)
- Style nitpicks that linters would catch

## Step 5: Report

Output a structured review:

### Summary
1-2 sentence overall assessment.

### Issues Found
For each issue (sorted by severity):
- **[severity] file:line** - description
- Suggested fix (code snippet if applicable)

### Strengths
Note 1-2 things done well.

## Focus Area

If $ARGUMENTS is provided, prioritize that dimension. Otherwise review all dimensions equally.

## Rules
- Every number/claim must be verifiable from the diff
- Do not flag style issues that a linter or formatter handles
- Do not flag pre-existing issues (only review the delta)
- Be specific: always include file path and line number
- Be constructive: explain why and suggest a fix
- Use Chinese for the review output
