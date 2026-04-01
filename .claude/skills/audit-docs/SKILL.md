---
name: audit-docs
description: Audit context/documentation files against actual code. Detect drift and auto-fix.
argument-hint: "[scope: auto | all | claude-md | backend | frontend | refs]"
allowed-tools: ["Bash", "Read", "Write", "Edit", "Glob", "Grep", "Task"]
---

# Documentation Audit: Code vs Docs Drift Detection

Scan documentation files against actual codebase state. Detect drift and auto-fix.

## Arguments

- (no argument / `auto`): **Only audit docs related to uncommitted changes** (default)
- `all`: Full audit of all ~30 documentation files
- `claude-md`: Only CLAUDE.md (env vars + module index + legacy imports)
- `backend`: Only backend .context.md files
- `frontend`: Only frontend .context.md files
- `refs`: Only reference docs (auth.md / pages.md / components.md)

## Step 0: Scope Resolution (auto mode only)

When scope is `auto` (default, no argument):

1. Get changed file paths (staged + unstaged + untracked):
```bash
git diff --name-only HEAD 2>/dev/null; git diff --name-only --cached 2>/dev/null; git ls-files --others --exclude-standard 2>/dev/null
```
This outputs only file paths, no content.

2. Map each changed file to audit targets using these rules:

| Changed file pattern | Audit target |
|----------------------|--------------|
| `backend/app/features/<module>/*.py` | that module's `.context.md` (Phase 2 checks) |
| `backend/app/core/config.py` | CLAUDE.md env vars (Phase 1a) |
| `backend/app/shared/**/*.py` | `shared/.context.md` or `shared/data_tools/.context.md` (Phase 2 checks) |
| `backend/app/features/*/router.py` | also `frontend/docs/auth.md` (Phase 4a) |
| `frontend/src/app/**/page.tsx` | that page's `.context.md` + `frontend/docs/pages.md` (Phase 4b) |
| `frontend/src/components/**/*.tsx` | `components/.context.md` + `frontend/docs/components.md` (Phase 4c) |
| `frontend/src/lib/*.ts` | `lib/.context.md` |
| `frontend/src/hooks/**/*.ts` | `hooks/.context.md` |
| `frontend/src/contexts/*.tsx` | `contexts/.context.md` |
| `frontend/src/test/**` or `**/__tests__/**` | `test/.context.md` |
| `*.context.md` | skip (already being changed manually) |
| No matches | print "No documentation-affecting changes detected." and exit |

3. Deduplicate the audit target list, then run only the matched phases/checks below.

If scope is `all`, `claude-md`, `backend`, `frontend`, or `refs` — skip Step 0, run the specified phases directly.

## Phase 1: CLAUDE.md Audit (sequential, 3 checks)

Run this phase when scope is `all` or `claude-md`, or when auto-mapped.

### 1a. Environment Variable Consistency

1. Read `backend/app/core/config.py`, extract all `os.getenv("XXX")` and `os.environ.get("XXX")` variable names
2. Read CLAUDE.md environment variables section (between `## 环境变量` and the next `##`)
3. Compare: variables in config.py but not mentioned in CLAUDE.md = drift
4. **Exclude** from drift: `GOOGLE_GENAI_API_KEY` (auto-derived), `LOG_LEVEL` (in reliability.md)
5. Auto-fix: append missing variables to the appropriate category in CLAUDE.md env section

### 1b. Module Index Consistency

1. `Glob` to find all `**/.context.md` files under `backend/` and `frontend/`
2. Read CLAUDE.md module docs section (between `## 模块文档` and the next `##`)
3. Compare:
   - Files that exist on disk but are NOT listed in CLAUDE.md = missing entry
   - Files listed in CLAUDE.md but do NOT exist on disk = stale entry
4. Auto-fix: add missing entries / remove stale entries, preserving the existing section structure (backend/frontend grouping)

### 1c. Legacy Code Import Check

1. `Grep` in `backend/app/features/` and `backend/app/shared/` for patterns:
   - `from app.services`
   - `from app.models`
   - `import app.services`
   - `import app.models`
2. Any hit = VIOLATION (do NOT auto-fix, report only -- needs human decision)

## Phase 2: Backend .context.md Audit

Run for each matched backend module. In `all`/`backend` scope, run for every module. Launch parallel Task agents when auditing 3+ modules.

For each target `.context.md` under `backend/app/`, perform:

### 2a. File Structure Consistency

1. `ls` the module directory to get actual `.py` file list
2. Read the .context.md "file structure" or directory listing section
3. Compare: new files not documented / documented files that no longer exist

### 2b. API Endpoint Consistency

1. Read `router.py` (if exists), extract all `@router.get/post/put/delete/patch` decorator paths + HTTP method + auth dependency (`verify_user_token` or `verify_cron_secret` or none)
2. Read the .context.md API endpoint table/section (if exists)
3. Compare: new endpoints / removed endpoints / auth changes

### 2c. Dependency Consistency

1. Read all `.py` files in the module, extract `from app.xxx import` and `from ...xxx import` statements
2. Read the .context.md dependency section (if exists)
3. Check for new cross-module dependencies not documented

### Auto-fix Rules

- Update .context.md sections that have drift, preserving original structure and style
- Only change the parts that are actually inconsistent
- Do NOT rewrite the entire file

Each agent returns a structured result:
```
module: <module name>
file_structure: OK | DRIFT (details)
endpoints: OK | DRIFT (details) | N/A
dependencies: OK | DRIFT (details)
fixed: true | false
```

## Phase 3: Frontend .context.md Audit

Run for each matched frontend module. In `all`/`frontend` scope, run for every module. Launch parallel Task agents when auditing 3+ modules.

For each target `.context.md` under `frontend/src/`, perform:

### 3a. File/Component List Consistency

1. `Glob` actual `.ts/.tsx` files in the directory
2. Read .context.md file/component listing section
3. Compare: new files not documented / documented files removed

### 3b. Test File List Consistency (only for test/.context.md)

1. `Glob` actual `__tests__/**` and `e2e/**` files
2. Read .context.md directory structure section
3. Compare: new test files / removed test files
4. If .context.md contains specific test counts (e.g. "(32 tests)"), remove them -- numbers go stale

### Auto-fix Rules

- Same as Phase 2: only change drifted parts, preserve structure
- Remove specific test/component counts from documentation (they always go stale)

Each agent returns:
```
module: <module name>
file_list: OK | DRIFT (details)
fixed: true | false
```

## Phase 4: Reference Docs Audit

Run for each matched ref doc. In `all`/`refs` scope, run all three.

### 4a. auth.md -- Authenticated Endpoint List

1. `Grep -r "verify_user_token" backend/app/features/*/router.py` to find all authenticated endpoints
2. Read `frontend/docs/auth.md` authenticated endpoint list
3. Compare: new authenticated endpoints / removed ones
4. Auto-fix: update the endpoint list in auth.md

### 4b. pages.md -- Route Table

1. `Glob` `frontend/src/app/**/page.tsx` to find all actual pages
2. Read `frontend/docs/pages.md` route table
3. Compare: new pages / removed pages
4. Auto-fix: update the route table

### 4c. components.md -- Component List

1. `Glob` `frontend/src/components/**/*.tsx` to find all components
2. Read `frontend/docs/components.md` component table
3. Compare: new components / removed components
4. Auto-fix: update the component list

## Output Format

After all phases complete, output the audit report in Chinese:

```
## Audit Report

### Scope
auto (基于 git diff: X 个变更文件 -> Y 个审计目标) | all | backend | ...

### CLAUDE.md (if audited)
| 检查项 | 状态 | 详情 |
|--------|------|------|
| 环境变量 | OK/DRIFT | ... |
| 模块索引 | OK/DRIFT | ... |
| 遗留导入 | OK/VIOLATION | ... |

### 后端 .context.md (if audited)
| 模块 | 文件结构 | 端点 | 依赖 | 已修复 |
|------|----------|------|------|--------|

### 前端 .context.md (if audited)
| 模块 | 文件列表 | 已修复 |
|------|----------|--------|

### 参考文档 (if audited)
| 文档 | 状态 | 详情 |
|------|------|------|

### 总计
- 审计: X 个文件
- Drift: Y 个
- 已修复: Z 个
- 需人工: W 个
```

## Rules

- Fix only the drifted parts, never rewrite an entire file
- Do NOT put specific counts in docs (test count, component count, etc.) -- they go stale
- Legacy import violations: report only, do NOT auto-fix
- Output the report in Chinese
- When auto-adding entries, match the existing formatting style of the document
- In auto mode: if only 1-2 modules need auditing, do it inline (no Task agents needed)
- In auto mode: if 3+ modules need auditing, use parallel Task agents
- In all/backend/frontend mode: always use parallel Task agents for efficiency
- Phase 1 runs sequentially (each check depends on reading CLAUDE.md)
- Phase 4 checks can run in parallel with each other
