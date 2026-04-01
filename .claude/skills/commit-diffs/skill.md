---
name: commit-diffs
description: Commit all pending git changes as separate, logically grouped commits. Each commit covers one coherent change.
argument-hint: "[optional: message hints or grouping preferences]"
allowed-tools: ["Bash(git:*)"]
---

# Commit Changes in Separate Diffs

Analyze all pending git changes and commit them as separate, logically grouped commits.

## Step 1: Collect All Changes

```bash
echo "=== STAGED ==="
git diff --cached --name-status

echo "=== UNSTAGED ==="
git diff --name-status

echo "=== UNTRACKED ==="
git ls-files --others --exclude-standard

echo "=== RECENT COMMITS (for message style) ==="
git log --oneline -5
```

## Step 2: Read Diffs

For each changed file, read its diff to understand the nature of the change:

```bash
git diff -- <file>
git diff --cached -- <file>
```

For deleted files, note them. For new untracked files, read a summary (first ~30 lines).

## Step 3: Group Changes

Analyze all changes and group them into logical commits. Grouping criteria (in priority order):

1. **By feature/purpose**: Files that serve the same goal go together
2. **By layer**: Separate docs, tests, config, frontend, backend when they are independent
3. **By risk**: Isolate risky changes (bug fixes, auth changes) into their own commits

Common grouping patterns:
- Bug fix in one module = 1 commit
- New API endpoint (router + db + models) = 1 commit
- Related frontend pages changes = 1 commit
- New test files = 1 commit (unless they test a specific feature being committed separately)
- Documentation updates = 1 commit
- Config/tooling changes = 1 commit
- Deleted unused files = 1 commit per logical group

## Step 4: Determine Commit Order

Order commits from most foundational to most dependent:
1. Renames / restructuring
2. Core/shared changes
3. Backend features
4. Frontend features
5. Bug fixes
6. Tests
7. Documentation
8. Config / chores

## Step 5: Execute Commits

For each group, stage only its files and commit:

```bash
git add <file1> <file2> ...
git commit -m "$(cat <<'EOF'
<type>: <concise description>

<optional body if needed>

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

**Commit message conventions**:
- `feat:` new feature or endpoint
- `fix:` bug fix
- `refactor:` code restructuring without behavior change
- `test:` adding or updating tests
- `docs:` documentation only
- `chore:` config, tooling, cleanup
- Keep the first line under 72 characters
- Use the body for "why", not "what"
- Avoid apostrophes and special characters in heredoc content (they break shell quoting)

After each commit, verify it succeeded before moving to the next.

## Step 6: Final Verification

```bash
git status
git log --oneline -<N>  # where N = number of commits created
```

Confirm working tree is clean and report a summary table:

```
| # | Commit | Type | Files | Description |
|---|--------|------|-------|-------------|
| 1 | abc1234 | feat | 3 | ... |
| 2 | def5678 | fix | 1 | ... |
```

## Rules

- Never combine unrelated changes in one commit
- Never use `git add -A` or `git add .` — always add specific files
- Never skip the Co-Authored-By line
- If a commit fails (e.g., pre-commit hook), fix the issue and create a NEW commit (do not amend)
- If $ARGUMENTS contains grouping hints, respect them
- Do not push to remote — only create local commits
- Report results in Chinese
