---
name: test
description: Run project tests and build verification. Unit tests, E2E tests, and production build checks.
argument-hint: "[optional: all | frontend | backend | lint | unit | e2e | build]"
allowed-tools: ["Bash"]
---

# Test Runner

Run project tests across a 2D matrix of scope (frontend/backend) and level (lint/unit/e2e/build).

## Test Matrix

|          | lint | unit | e2e | build |
|----------|------|------|-----|-------|
| **frontend** | ESLint + TSC | Vitest | Playwright | next build |
| **backend**  | Import check | pytest unit | pytest e2e + integration | startup check |

## Arguments

Single argument selects a row, column, or the entire matrix:

| Argument | What runs |
|----------|-----------|
| (none) or `all` | Entire matrix (all 8 steps) |
| `frontend` | Frontend row: ESLint, TSC, Vitest, Playwright, next build |
| `backend` | Backend row: Import check, unit tests, E2E, integration, startup check |
| `lint` | Lint column: Frontend ESLint + TSC, Backend import check |
| `unit` | Unit column: Frontend Vitest, Backend unit tests |
| `e2e` | E2E column: Backend E2E + integration, Frontend Playwright |
| `build` | Build column: Frontend next build, Backend startup check |

## Failure Handling

**Run all selected steps to completion, never stop early.** Collect pass/fail for each step, then report a single summary table at the end.

## Step Definitions

### Frontend ESLint (lint)

```bash
cd $CLAUDE_PROJECT_DIR/frontend && npm run lint 2>&1
```

### Frontend TSC (lint)

```bash
cd $CLAUDE_PROJECT_DIR/frontend && npx tsc --noEmit 2>&1
```

### Frontend Vitest (unit)

```bash
cd $CLAUDE_PROJECT_DIR/frontend && npm run test 2>&1
```

### Frontend Playwright (e2e)

```bash
cd $CLAUDE_PROJECT_DIR/frontend && npx playwright test --reporter=list 2>&1
```

Requires backend running at localhost:8000. If backend is not running, mark as `skip` with reason.

### Frontend next build (build)

```bash
cd $CLAUDE_PROJECT_DIR/frontend && npm run build 2>&1
```

### Backend import check (lint)

```bash
cd $CLAUDE_PROJECT_DIR/backend && source venv/bin/activate && python -c "from app.main import app; print('FastAPI app loaded OK')"
```

### Backend unit tests (unit)

```bash
cd $CLAUDE_PROJECT_DIR/backend && source venv/bin/activate && python -m pytest tests/test_*.py -v --ignore=tests/e2e --ignore=tests/integration 2>&1
```

Note: Do NOT use `-x` flag. Let all tests run so we can see the full picture.

### Backend E2E tests (e2e)

```bash
cd $CLAUDE_PROJECT_DIR/backend && source venv/bin/activate && python -m pytest tests/e2e/ -v --ignore=tests/e2e/test_generate_e2e.py 2>&1
```

Never run `test_generate_e2e.py` unless the user explicitly passes `generate` as argument.

### Backend integration tests (e2e)

```bash
cd $CLAUDE_PROJECT_DIR/backend && source venv/bin/activate && python -m pytest tests/integration/ -v 2>&1
```

### Backend startup check (build)

```bash
cd $CLAUDE_PROJECT_DIR/backend && source venv/bin/activate && python -c "
import uvicorn
from app.main import app
routes = [r.path for r in app.routes if hasattr(r, 'path')]
print(f'Routes registered: {len(routes)}')
print('Backend build OK')
"
```

## Execution Order

Run steps in this order. **Independent steps within the same level can run in parallel** (e.g., frontend ESLint and backend import check can run at the same time).

1. **Lint**: Frontend ESLint + TSC, Backend import check (parallel OK)
2. **Unit**: Frontend Vitest, Backend unit tests (parallel OK)
3. **E2E**: Backend E2E + integration, Frontend Playwright (parallel OK)
4. **Build**: Frontend next build, Backend startup check (parallel OK)

When running a scope argument (`frontend` or `backend`), run the levels in the order above (lint first, then unit, then e2e, then build) for that scope.

## Output Format

After ALL selected steps complete, provide a summary table:

```
| Scope | Level | Test | Result |
|-------|-------|------|--------|
| Frontend | lint | ESLint | pass/fail/skip |
| Frontend | lint | TSC | pass/fail/skip |
| Frontend | unit | Vitest (N tests) | pass/fail/skip |
| Frontend | e2e | Playwright (N specs) | pass/fail/skip |
| Frontend | build | next build | pass/fail/skip |
| Backend | lint | Import check | pass/fail/skip |
| Backend | unit | Unit tests (N tests) | pass/fail/skip |
| Backend | e2e | E2E tests (N tests) | pass/fail/skip |
| Backend | e2e | Integration tests | pass/fail/skip |
| Backend | build | Startup check | pass/fail/skip |
```

Only include rows for steps that were selected by the argument.

If all passed: "All tests passed. Safe to commit."
If any failed: List which tests failed and suggest what to investigate.

## Rules

- Never stop early on failure. Run all selected steps, then summarize.
- Never run `test_generate_e2e.py` unless `generate` is explicitly passed.
- Frontend Playwright requires backend at localhost:8000. If unavailable, mark `skip`.
- Report results in Chinese.
