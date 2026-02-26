---
name: cover-changes
description: Examine all current git changes and generate unit tests and E2E tests to cover them. Use when asked to "cover changes", "add tests for changes", "test coverage for diff", or similar.
argument-hint: "[optional: unit | e2e | all (default)]"
allowed-tools: ["Bash", "Read", "Write", "Edit", "Glob", "Grep", "Task"]
---

# Cover Changes - Automated Test Generation for Git Diff

Analyze all current git changes (staged, unstaged, untracked) and generate appropriate tests for both backend AND frontend code.

## Arguments

- No argument or `all`: Generate both unit and E2E tests
- `unit`: Generate only unit tests
- `e2e`: Generate only E2E tests

## Workflow

### Phase 0: Discover Changes

Run these commands to understand the full scope of changes:

```bash
cd $CLAUDE_PROJECT_DIR && git diff --name-only HEAD
cd $CLAUDE_PROJECT_DIR && git diff --cached --name-only
cd $CLAUDE_PROJECT_DIR && git status --short
```

Collect all changed/added/deleted files. Categorize them:

| Category | File Patterns | Test Type |
|----------|--------------|-----------|
| Backend service logic | `backend/app/features/*/service.py` | Unit + E2E |
| Backend routers | `backend/app/features/*/router.py` | E2E |
| Backend models | `backend/app/features/*/models.py` | Unit |
| Backend DB layer | `backend/app/features/*/db.py` | Unit (mocked) |
| Backend shared | `backend/app/shared/*.py` | Unit |
| Frontend hooks | `frontend/src/hooks/*.ts` | Vitest (renderHook) |
| Frontend lib/utils | `frontend/src/lib/*.ts` | Vitest (pure function) |
| Frontend contexts | `frontend/src/contexts/*.tsx` | Vitest (render + context) |
| Frontend components | `frontend/src/components/*.tsx` | Vitest (render + fireEvent) |
| Frontend pages | `frontend/src/app/**/*.tsx` | Skip (page-level, use Playwright) |
| Frontend config/styles | `frontend/*.config.*`, `frontend/**/*.css` | Skip (no testable logic) |

### Phase 1: Analyze Each Changed File

For each changed file, read the **full diff** to understand:

```bash
cd $CLAUDE_PROJECT_DIR && git diff HEAD -- <file_path>
```

For each changed file, identify:
1. **New functions/methods** added (need new test cases)
2. **Modified functions** (existing tests may need updating, or new edge cases)
3. **New imports or dependencies** (may need new mocks)
4. **New API endpoints** (need E2E tests)
5. **Bug fixes** (need regression tests for the fixed behavior)

### Phase 2: Check Existing Test Coverage

Before writing tests, check what tests already exist:

```bash
# Backend tests
ls $CLAUDE_PROJECT_DIR/backend/tests/test_*.py
ls $CLAUDE_PROJECT_DIR/backend/tests/e2e/test_*.py

# Frontend tests
ls $CLAUDE_PROJECT_DIR/frontend/src/hooks/__tests__/*.test.*
ls $CLAUDE_PROJECT_DIR/frontend/src/lib/__tests__/*.test.*
ls $CLAUDE_PROJECT_DIR/frontend/src/contexts/__tests__/*.test.*
ls $CLAUDE_PROJECT_DIR/frontend/src/components/__tests__/*.test.*
```

Read existing test files for the changed modules. Note:
- Which functions already have tests
- Which functions are newly added and lack tests
- The test patterns used (fixtures, assertions, class structure)

### Phase 3: Generate Backend Unit Tests

**Only if argument is `unit` or `all` (default). Only for backend changes.**

For each changed service/model/utility file, generate unit tests following these rules:

#### Naming Convention
- File: `tests/test_<feature>_unit.py` (append to existing if file exists)
- Class: `Test<FunctionName>` or `Test<ClassName>`
- Method: `test_<scenario>_<expected_behavior>`

#### Structure Template

```python
"""
<Feature> Unit Tests -- generated from git diff

Tests for: <list of functions being tested>
No network access, no database. All data constructed in fixtures.

Usage:
    cd backend
    source venv/bin/activate
    pytest tests/test_<name>_unit.py -v
"""

import pytest
from unittest.mock import patch, AsyncMock

from app.features.<feature>.<module> import (
    <functions_to_test>,
)


class Test<FunctionName>:
    """Tests for <function_name>."""

    @pytest.fixture
    def <fixture_name>(self):
        """<Description of test data>."""
        return { ... }

    def test_<normal_case>(self, <fixture>):
        """<What this tests>."""
        result = <function_call>
        assert <expected>

    def test_<edge_case>(self):
        """<What this tests>."""
        ...

    def test_<none_handling>(self):
        """None/missing input returns safe default."""
        ...
```

#### Key Principles
- **No network, no database** - mock all external calls
- **Test pure logic** - scoring functions, headline generators, data transforms, cache logic
- **Test edge cases** - None values, empty inputs, boundary values
- **Test error paths** - exception handling, fallback behavior
- For async functions, use `@pytest.mark.asyncio` and mock I/O with `AsyncMock`

### Phase 3.5: Generate Frontend Unit Tests

**Only if argument is `unit` or `all` (default). Only for frontend changes.**

For each changed hook/lib/context/component file, generate Vitest tests using the appropriate template below.

#### Hook Template (for `hooks/*.ts`)

Output: `hooks/__tests__/<hookName>.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useXxx } from '../useXxx';

// Mock dependencies
const mockFn = vi.fn();
vi.mock('@/lib/api', () => ({
  api: {
    someMethod: (...args: unknown[]) => mockFn(...args),
  },
}));

describe('useXxx', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns initial state', () => {
    const { result } = renderHook(() => useXxx());
    expect(result.current.someValue).toBe(initialValue);
  });

  it('updates state on action', async () => {
    const { result } = renderHook(() => useXxx());
    await act(async () => {
      result.current.someAction();
    });
    expect(result.current.someValue).toBe(expectedValue);
  });
});
```

#### Component Template (for `components/*.tsx`)

Output: `components/__tests__/<ComponentName>.test.tsx`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ComponentName } from '../ComponentName';

// Mock next/navigation if needed
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/',
}));

describe('ComponentName', () => {
  it('renders without crashing', () => {
    render(<ComponentName />);
    expect(screen.getByText('expected text')).toBeInTheDocument();
  });

  it('handles user interaction', () => {
    const handler = vi.fn();
    render(<ComponentName onClick={handler} />);
    fireEvent.click(screen.getByRole('button'));
    expect(handler).toHaveBeenCalled();
  });
});
```

#### Util/Lib Template (for `lib/*.ts`)

Output: `lib/__tests__/<name>.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { utilFunction } from '../utilFile';

describe('utilFunction', () => {
  it('handles normal input', () => {
    expect(utilFunction(normalInput)).toBe(expectedOutput);
  });

  it('handles edge case', () => {
    expect(utilFunction(null)).toBe(defaultValue);
  });

  it('handles empty input', () => {
    expect(utilFunction('')).toBe(defaultValue);
  });
});
```

#### Context Template (for `contexts/*.tsx`)

Output: `contexts/__tests__/<ContextName>.test.tsx`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ContextProvider, useContextHook } from '../ContextName';

function TestConsumer() {
  const value = useContextHook();
  return <div data-testid="value">{JSON.stringify(value)}</div>;
}

describe('ContextName', () => {
  it('provides default values', () => {
    render(
      <ContextProvider>
        <TestConsumer />
      </ContextProvider>
    );
    expect(screen.getByTestId('value')).toBeInTheDocument();
  });
});
```

#### Frontend Test Conventions
- Use `vi.mock()` for module mocking, `vi.fn()` for function mocks
- Use `@testing-library/react` for rendering (`render`, `screen`, `fireEvent`)
- Use `renderHook` + `act` for hooks
- Import from `vitest` not `jest` (`describe`, `it`, `expect`, `vi`)
- Follow existing project patterns -- read `useStockSearch.test.ts` as reference for hooks
- Place test files in `__tests__/` subdirectory adjacent to source

### Phase 4: Generate E2E Tests (Backend)

**Only if argument is `e2e` or `all` (default).**

For each changed/new router endpoint, generate E2E tests following these rules:

#### Naming Convention
- File: `tests/e2e/test_<feature>_e2e.py` (append to existing if file exists)
- Class: `Test<EndpointName>`
- Method: `test_<endpoint>_<scenario>`

#### Structure Template

```python
"""
E2E Tests for <Feature> API Endpoints -- generated from git diff

Tests via httpx.AsyncClient + ASGITransport.

Usage:
    cd backend
    source venv/bin/activate
    pytest tests/e2e/test_<name>_e2e.py -v
"""

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

from app.main import app


@pytest.fixture
def transport():
    return ASGITransport(app=app)


@pytest_asyncio.fixture
async def client(transport):
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.mark.e2e
class Test<EndpointName>:
    """Tests for <METHOD> <path>."""

    @pytest.mark.asyncio
    async def test_<endpoint>_success(self, client):
        """Endpoint returns 200 with success=True."""
        resp = await client.get("<path>", timeout=60)
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True

    @pytest.mark.asyncio
    async def test_<endpoint>_structure(self, client):
        """Response contains expected fields."""
        resp = await client.get("<path>", timeout=60)
        assert resp.status_code == 200
        data = resp.json()
        # Assert structure...

    @pytest.mark.asyncio
    async def test_<endpoint>_validation(self, client):
        """Invalid params return 400/422."""
        resp = await client.get("<path>", params={"bad": "value"}, timeout=10)
        assert resp.status_code in (400, 422)
```

#### Key Principles
- **Use httpx.AsyncClient with ASGITransport** - no actual HTTP server needed
- **Test response shape** - status code, success flag, required fields
- **Test score/value ranges** - scores within expected bounds (0-10, 0-100, etc.)
- **Test validation** - invalid params, missing params, out-of-range values
- **Set generous timeouts** - real external APIs may be slow (timeout=60 for data endpoints)
- **Mark with `@pytest.mark.e2e`** - enables filtering

### Phase 5: Update conftest.py If Needed

If new database write functions were added in the changes, add them to `DB_WRITE_FUNCTIONS` in `tests/conftest.py`:

```python
DB_WRITE_FUNCTIONS = [
    # ... existing entries ...
    # NEW: added by cover-changes
    ("app.features.<feature>.db", "<new_write_function>"),
]
```

### Phase 6: Verify Generated Tests

Run the generated tests to make sure they pass:

```bash
cd $CLAUDE_PROJECT_DIR/backend && source venv/bin/activate

# Run backend unit tests
python -m pytest tests/test_<new_file>_unit.py -v -x

# Run backend e2e tests
python -m pytest tests/e2e/test_<new_file>_e2e.py -v -x
```

```bash
cd $CLAUDE_PROJECT_DIR/frontend

# Run frontend vitest tests
npx vitest run src/<path>/__tests__/<new_file>.test.ts
```

If tests fail:
1. Read the error output
2. Fix the test code (not the source code)
3. Re-run until all pass

### Phase 7: Update Test Skill

If new test files were created, update the existing `/test` skill at `$CLAUDE_PROJECT_DIR/.claude/skills/test/SKILL.md` to include the new test files in the appropriate phase.

## Output Format

After completion, provide a summary:

```
| Category | File | Tests Added | Status |
|----------|------|-------------|--------|
| Backend Unit | test_<x>_unit.py | <n> new tests | pass/fail |
| Backend E2E  | test_<x>_e2e.py  | <n> new tests | pass/fail |
| Frontend Unit | <x>.test.ts(x) | <n> new tests | pass/fail |
```

List of changes covered:
- <file>: <function> - covered by <test_name>
- <file>: <function> - covered by <test_name>
- ...

List of changes NOT covered (and why):
- <file>: <reason> (e.g., page component, no testable logic, config change, etc.)

## Rules

- Never modify source code to make tests pass. Fix the tests instead.
- Append to existing test files when appropriate (don't duplicate fixtures/classes).
- Follow the project's existing test patterns and conventions exactly.
- Use Chinese for test docstrings only when testing Chinese-specific output (headlines, labels).
- Report all results in Chinese.
- If a change is trivial (import reorder, comment change, etc.), skip it with a note.
- When adding to existing files, read the full file first to avoid duplicating classes/fixtures.
- Frontend page components (`app/**/*.tsx`) are skipped -- use Playwright for page-level testing.
- Frontend config/style files are skipped -- no testable logic.
