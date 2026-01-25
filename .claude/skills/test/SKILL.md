---
name: test
description: Run all project tests - unit tests first, then E2E tests. Validates that production email and report flows won't break.
argument-hint: "[optional: unit | e2e | all (default)]"
allowed-tools: ["Bash"]
---

# Test Runner

Run project tests in two phases: fast unit tests first, then E2E integration tests.

## Arguments

- No argument or `all`: Run both unit and E2E tests
- `unit`: Run only unit tests (fast, no side effects)
- `e2e`: Run only E2E tests (sends real test emails)

## Phase 1: Unit Tests (fast, safe, no side effects)

Run these sequentially. Stop immediately if any step fails.

### Step 1.1 — Frontend TypeScript compilation check

```bash
cd $CLAUDE_PROJECT_DIR/frontend && npx tsc --noEmit
```

If this fails, report the TypeScript errors and stop.

### Step 1.2 — Backend import verification

```bash
cd $CLAUDE_PROJECT_DIR/backend && source venv/bin/activate && python -c "from app.main import app; print('FastAPI app loaded OK')"
```

If this fails, it means a module import is broken. Report the error and stop.

### Step 1.3 — Backend unit tests

```bash
cd $CLAUDE_PROJECT_DIR/backend && source venv/bin/activate && python -m pytest tests/test_data_cleaning.py tests/test_fmp_news.py -x -v
```

If this fails, report which tests failed and stop.

## Phase 2: E2E Tests (sends real emails to test channel)

Only proceed to Phase 2 if all Phase 1 steps passed. If `$ARGUMENTS` is `unit`, skip Phase 2.

Before starting Phase 2, inform the user:
> Phase 1 passed. Starting E2E tests - this will send real test emails to the test broadcast channel.

### Step 2.1 — E2E broadcast tests

```bash
cd $CLAUDE_PROJECT_DIR/backend && source venv/bin/activate && python -m pytest tests/e2e/test_broadcast_e2e.py -v
```

### Step 2.2 — E2E database integration tests

```bash
cd $CLAUDE_PROJECT_DIR/backend && source venv/bin/activate && python -m pytest tests/integration/test_database_operations.py -v
```

## Output Format

After all tests complete, provide a summary table:

```
| Phase | Test | Result |
|-------|------|--------|
| Unit  | Frontend TSC | pass/fail |
| Unit  | Backend Import | pass/fail |
| Unit  | Data Cleaning | pass/fail |
| Unit  | FMP News | pass/fail |
| E2E   | Daily Report Broadcast | pass/fail |
| E2E   | Personal Digest Broadcast | pass/fail |
| E2E   | Database Operations | pass/fail |
```

If all passed, conclude with: "All tests passed. Safe to commit."
If any failed, conclude with which tests failed and suggest what to investigate.

## Rules

- Always run Phase 1 before Phase 2
- Stop immediately on first failure within a phase (use `-x` flag)
- Never run `test_generate_e2e.py` (AI generation tests) unless the user explicitly passes `generate` as argument
- Report results in Chinese
