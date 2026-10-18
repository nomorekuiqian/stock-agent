# SEO isolated release — 2026-10-18

## Scope

Release branch: `codex/seo-production`, based on `8abadac`. Live backend Python/JSON/YAML source hashes exactly matched this baseline before deployment. Live frontend was `dpl_47YbcsJdeRQgN9VkdPTuSm5iVoYE`. No bulu-v2 commits or unrelated cleanup changes are included. The original working directory remains unchanged.

198 explicit SEO paths were initially selected; the final code release spans 200 changed paths, including source, tests, plan and evidence. Conflicting middleware/test hunks were resolved against production, preserving the original /for-you behavior; no /brief functionality ships. CSV line endings were normalized in the release copy.

## Release preparation

- 83 frontend tests pass on the isolated production baseline (the earlier 85-test count included two branch-specific /brief cases).
- 29 backend tests pass, including persistent-storage initialization and the production FMP date-range contract.
- Isolated production build, TypeScript and blocked-network backend route import passed. Local build uses synthetic API/auth configuration, not production credentials.
- Railway production volume mounted at `/seo-data`; `SEO_CONTENT_DB=/seo-data/content.sqlite`. Startup seeds only missing storage, preserves existing data and checks integrity. No source environment files are copied into the release.
- The shipped seed contains 70 company descriptions. Fixture document revision records were removed from the release seed.

## Deployment and live acceptance

- Backend: `195fdde3-bd77-423d-8a41-3a67fe303bd5`, commit `a20832312050bfd2b28326987e18e48170510984`, Railway SUCCESS. All deployed Python/JSON/YAML source hashes matched the isolated commit. Persistent storage `/seo-data/content.sqlite` has 70 company descriptions and passes SQLite integrity checks after redeployment.
- Frontend: `dpl_8L634SnnF4aHoXQ4HS8WMp6esGQc`, commit `2bc3a0bc9ef416220a2003874fd322f536f42f29` (includes `113dfa3` and `a208323`), Vercel READY and verified bound to `www.themarketbrew.com`. The final frontend commit does not change backend source.
- First live checks found a missing production-baseline earnings range adapter; included only that required dependency, without any researcher/brief product code, and verified the real stock endpoints returned 200.
- Initial production browser checks found an overflowing list of unrelated KOL profile links on NVDA mobile and a local-time/SSR timestamp mismatch on liquidity. Both were fixed; local verification against real public data passed for UTC and Asia/Shanghai browsers. Final production browser acceptance is rerun after release; the initial findings are retained in `production-browser-initial-findings.json`.
- First volume attachment caused backend unavailability during the initial image build. The backend recovered, and subsequent deployment retained the volume and its contents. No manual email broadcast or payment action was performed.

### Final evidence

- `production-http-acceptance.json`: 46 live page/route checks passed, including canonical, H1, JSON-LD, public teasers, redirects, invalid symbols and unknown-path 404s.
- `production-browser/results.json`: 18 anonymous desktop/mobile scenarios passed with one H1, no horizontal overflow, no JavaScript page errors and matching rendered content-quality denominators. Screenshots are retained alongside the result.
- `production-cross-route-checks.json`: 24 browser/crawler parity cases passed; visible FAQ/schema agreement, llms links and market-hours SSR passed.
- `production-backend-acceptance.json`: 12 live API and access-boundary checks passed, including locked morning excerpts and paused-product protection.
- `production-content-audit.json`: final production build audited 127 stocks; 8 meet sitemap eligibility (including 5 dated temporary exceptions). Others remain noindex under the content gate. This is not evidence of Google indexing.
- `production-sitemap-acceptance.json`: all 280 URLs across 6 shards passed HTTP 200, indexability, self-canonical, single H1 and prohibited-text checks. Final deployment identifiers and counts are recorded in `production-verification-summary.json`.
- A transient connection interruption caused timeouts/SSL EOF in the first final-run sitemap checks and interrupted browser/contracts checks. These failed attempts were not counted as passes; final runs were repeated after connectivity recovered.
- Build-period backend logs included upstream FMP 429 responses. Public stock/API checks passed afterwards; missing optional data remains subject to provider availability. No upstream quota increase is claimed.
- `release-scope.json` records exact release paths; original dirty-worktree file hashes were checked again and remain unchanged.

### Boundaries

Checks cover public anonymous pages and unauthorized API protection; no real Pro/Max account checkout or full authenticated workflow was executed. Content generation runs as the deployed production feature: a read-only observation showed one accepted publication and one candidate held for review. Rejected candidates remain unpublished. Required human content approvals and GSC/GEO indexing or ranking outcomes are separate from deployment acceptance.
