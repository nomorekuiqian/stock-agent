# SEO isolated release — 2026-10-18

## Scope

Release branch: `codex/seo-production`, based on `8abadac`. Live backend Python/JSON/YAML source hashes exactly matched this baseline before deployment. Live frontend was `dpl_47YbcsJdeRQgN9VkdPTuSm5iVoYE`. No bulu-v2 commits or unrelated cleanup changes are included. The original working directory remains unchanged.

198 explicit SEO paths were selected, including source, tests, plan and evidence. Conflicting middleware/test hunks were resolved against production, preserving the original /for-you behavior; no /brief functionality ships. CSV line endings were normalized in the release copy.

## Release preparation

- 83 frontend tests pass on the isolated production baseline (the earlier 85-test count included two branch-specific /brief cases).
- 28 backend tests pass, including two added persistent-storage checks.
- Isolated production build, TypeScript and blocked-network backend route import passed. Local build uses synthetic API/auth configuration, not production credentials.
- Railway production volume mounted at `/seo-data`; `SEO_CONTENT_DB=/seo-data/content.sqlite`. Startup seeds only missing storage, preserves existing data and checks integrity. No source environment files are copied into the release.
- The shipped seed contains 70 company descriptions. Fixture document revision records were removed from the release seed.

## Deployment and live acceptance

Pending. Deployment IDs, exact commits and production acceptance evidence will be recorded here after completion.
