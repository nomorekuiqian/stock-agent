---
name: plan
description: Create or update an engineering plan for a feature. Use when user says "plan", "how to implement", "engineering design", or when starting a new feature that needs design before coding. Also use AFTER Plan Mode to save the generated plan to docs/plans/.
argument-hint: "[feature name or description]"
allowed-tools: ["Read", "Write", "Edit", "Glob", "Grep", "Bash", "Agent"]
---

# Engineering Plan Creator

Create structured engineering plans in `docs/plans/`, grounded in current codebase state and product vision.

## Trigger Conditions

Auto-invoke this skill when:
- User says "plan", "plan a feature", "engineering plan", "implementation plan"
- User says "how should I implement X", "design X", "architect X"
- User says "I want to build X, let's plan first"
- Starting a new feature that clearly needs design before coding
- **After Plan Mode completes**: When Plan Mode generates a plan and user approves it, save the plan content to `docs/plans/` before starting implementation

## Step 1: Understand the Target

Parse the user's request to identify:
- **Feature name**: Short English name for the file (e.g., `morning-report`, `stock-picker-agent`, `brew-judgment-upgrade`)
- **Feature type**: `new` (doesn't exist yet) or `iteration` (upgrading existing feature)
- **Related modules**: Which existing backend features / frontend pages are involved

If unclear, ask the user to clarify before proceeding.

## Step 2: Gather Context (parallel reads)

Read these files in parallel based on feature type:

### For ALL plans:
1. `docs/plans/_template.md` — Plan template structure

### For iterations on existing features:
2. The target feature's `.context.md` — Current implementation state + product vision
3. The corresponding section in Obsidian `产品/产品策略.md` — Product direction
   - Path: `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/TheMarketBrew增长/产品/产品策略.md`
   - Read the "现有模块演进" section for the relevant subpage
   - Read the "产品模块规划" section if it maps to a future module

### For new features:
2. Related existing `.context.md` files — Understand adjacent modules
3. Obsidian `产品/产品策略.md` — Check if this feature aligns with product direction
4. `docs/product/roadmap.md` — Check technical readiness and dependencies

## Step 3: Create the Plan

Create file at `docs/plans/{feature-name}.md` using the template structure:

```markdown
# {Feature Name} Engineering Plan

> Status: Planning
> Related: {list of related .context.md files}
> Vision: 产品策略.md > {corresponding section}

## Goal

{One sentence: what are we building and why}

## Current State

{For iterations: summarize from .context.md what exists today}
{For new features: summarize what adjacent modules provide}

## Design

{Architecture decisions, data flow, API design}
{Include diagrams using code blocks if helpful}

### Data Flow
{How data moves through the system}

### API Changes
{New or modified endpoints, request/response shapes}

### Database Changes
{New tables, schema changes, edge functions}

### Frontend Changes
{New pages, components, state management}

## Implementation Steps

1. [ ] Step 1 description
2. [ ] Step 2 description
...

## Dependencies

{What needs to exist before this can be built}
{Cross-module dependencies}

## Open Questions

{Things that need to be decided before or during implementation}
```

### Content Guidelines:
- **Goal**: Reference the product vision from .context.md or 产品策略.md
- **Current State**: Be specific — cite actual file paths, API endpoints, data structures
- **Design**: Include enough detail that Claude Code can implement without re-reading all source files
- **Steps**: Each step should be independently completable and testable
- **Dependencies**: Flag anything that blocks this work

## Step 4: Present to User

After creating the plan file, present a summary to the user:

1. Plan file location
2. Goal (one sentence)
3. Number of implementation steps
4. Key design decisions that need user input
5. Open questions that need answers before starting

Ask: "Plan created. Want to review and adjust anything before we start?"

## Step 5: Link Back

After plan is approved:
- If this is an iteration and the .context.md doesn't have a "产品愿景" section yet, add one
- If the plan reveals a gap in product strategy, note it for the user to discuss with Obsidian Claude

## Rules

- Plan files use English kebab-case filenames: `morning-report.md`, not `早报.md`
- Plan CONTENT is in Chinese (matching the rest of the project docs)
- Always read existing context before writing — never create a plan from assumptions
- If a plan file already exists for this feature, read it first and ask user whether to update or create new
- Do NOT start implementing during planning — planning and coding are separate steps
- Keep plans actionable: every implementation step should map to concrete code changes
