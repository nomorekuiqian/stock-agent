## Module Documentation

Read the affected module context when changing behavior, interfaces, or data flow. Small edits with sufficient local context do not require loading unrelated module docs.

**Backend**:
- `backend/app/core/.context.md` -- Core infrastructure
- `backend/app/edge_functions/.context.md` -- Insforge Edge Functions
- `backend/app/frank_mcp/.context.md` -- Market Lens MCP server
- `backend/app/utils/.context.md` -- Backend time/date utilities
- `backend/app/shared/.context.md` -- Cross-module shared services
- `backend/app/shared/data_tools/.context.md` -- Data fetching tool layer
- `backend/app/shared/kol_persona/.context.md` -- KOL persona registry and tools
- `backend/app/features/admin/.context.md` -- Admin dashboard and CRM APIs
- `backend/app/features/agent_runtime/.context.md` -- Shared Agent runtime/session/context layer
- `backend/app/features/brew/.context.md` -- Personalized summary (Brew)
- `backend/app/features/daily_report/.context.md` -- Market daily report
- `backend/app/features/feedback/.context.md` -- User feedback
- `backend/app/features/flags/.context.md` -- Feature flags
- `backend/app/features/community_access/.context.md` -- Partner/community Agent access grants
- `backend/app/features/for_you/.context.md` -- For-You action bar aggregation
- `backend/app/features/holdings_sync/.context.md` -- Holdings statement sync
- `backend/app/features/invites/.context.md` -- Invite codes and trial access
- `backend/app/features/kol_research/.context.md` -- KOL persona research APIs
- `backend/app/features/morning_report/.context.md` -- Pre-market morning report
- `backend/app/features/macro/cache/.context.md` -- Macro data cache system
- `backend/app/features/macro/liquidity/.context.md` -- Liquidity monitoring
- `backend/app/features/macro/risk/.context.md` -- Macro risk assessment
- `backend/app/features/macro/weekly/.context.md` -- Macro weekly report
- `backend/app/features/memory/.context.md` -- User memory and feedback learning
- `backend/app/features/notification/.context.md` -- Email sending & broadcast
- `backend/app/features/onboarding/.context.md` -- User onboarding status
- `backend/app/features/okx_mcp/.context.md` -- OKX Context MCP adapter and x402 payment boundary
- `backend/app/features/payment/.context.md` -- Stripe payments
- `backend/app/features/portfolio/.context.md` -- Portfolio holdings/profile
- `backend/app/features/portfolio_health/.context.md` -- Portfolio health analysis
- `backend/app/features/quota/.context.md` -- Usage quota enforcement
- `backend/app/features/research_kb/.context.md` -- Research knowledge-base chat
- `backend/app/features/screener/.context.md` -- Stock Screener data layer
- `backend/app/features/stock/.context.md` -- Individual stock research
- `backend/app/features/stock/agent/.context.md` -- Stock AI analysis agents
- `backend/app/features/subscription/.context.md` -- Email subscription management
- `backend/app/features/twitter/.context.md` -- KOL tweet ingestion and methodology extraction
- `backend/app/features/twitter/methodologies/.context.md` -- KOL methodology distillation artifacts
- `backend/app/features/twitter/methodology_v3/.context.md` -- Persona methodology v3 offline scripts
- `backend/app/features/twitter_digest/.context.md` -- Twitter/KOL daily digest
- `backend/app/features/vector/.context.md` -- Generic vector indexing and retrieval
- `backend/app/features/webhooks/.context.md` -- Third-party webhook ingestion
- `backend/app/features/watchlist_monitor/.context.md` -- AI watchlist monitor ticker briefs
- `backend/app/features/wechat/.context.md` -- WeChat Mini Program auth

**Frontend**:
- `frontend/src/app/.context.md` -- App Router shell, root layout, home page
- `frontend/src/app/admin/.context.md` -- Admin dashboard pages
- `frontend/src/app/panda/.context.md` -- Panda private community Agent page
- `frontend/src/app/api/auth/.context.md` -- Server Proxy auth routes
- `frontend/src/app/api/mcp/.context.md` -- MCP authorization route handlers
- `frontend/src/app/auth/.context.md` -- OAuth callback route
- `frontend/src/app/contact/.context.md` -- Contact/feedback form
- `frontend/src/app/dev/.context.md` -- Local development helper pages
- `frontend/src/app/email-test/.context.md` -- Email preview/test page
- `frontend/src/app/feedback/.context.md` -- Email feedback landing page
- `frontend/src/app/forgot-password/.context.md` -- Password reset request page
- `frontend/src/app/frank-agent/.context.md` -- Frank legacy redirect page
- `frontend/src/app/qinbafrank/.context.md` -- Qinbafrank legacy redirect
- `frontend/src/app/today/.context.md` -- Market daily report page
- `frontend/src/app/morning/.context.md` -- Pre-market morning report page
- `frontend/src/app/for-you/.context.md` -- Personalized Brew page
- `frontend/src/app/kol/.context.md` -- KOL persona pages
- `frontend/src/app/login/.context.md` -- Login/register page
- `frontend/src/app/macro/.context.md` -- Macro dashboard page
- `frontend/src/app/mcp/.context.md` -- MCP browser authorization page
- `frontend/src/app/pricing/.context.md` -- Pricing and checkout success pages
- `frontend/src/app/profile/.context.md` -- User profile and subscription settings
- `frontend/src/app/request-access/.context.md` -- Invite/access request page
- `frontend/src/app/research/.context.md` -- Research Desk page
- `frontend/src/app/reset-password/.context.md` -- Password reset completion page
- `frontend/src/app/settings/.context.md` -- User settings page
- `frontend/src/app/stock/.context.md` -- Stock research page
- `frontend/src/app/twitter-digest/.context.md` -- Twitter/KOL digest pages
- `frontend/src/app/unsubscribe/.context.md` -- Email unsubscribe page
- `frontend/src/app/verify-email/.context.md` -- Email verification page
- `frontend/src/app/webview-check/.context.md` -- WebView session diagnostics
- `frontend/src/lib/.context.md` -- Shared utilities (api/auth/insforge)
- `frontend/src/components/.context.md` -- Shared component library
- `frontend/src/contexts/.context.md` -- React Context (Auth/Subscription)
- `frontend/src/hooks/.context.md` -- Custom Hooks (search/React Query)
- `frontend/src/test/.context.md` -- Test system (Vitest + Playwright)

**Other docs**:
- `docs/constraints/reliability.md` -- Engineering reliability
- `docs/constraints/auth.md` -- Auth flow
- `docs/reference/pages.md` -- Frontend page routes
- `docs/reference/components.md` -- Frontend components & libraries
- `docs/constraints/design-system.md` -- Design system spec
- `mcp/themarketbrew/.context.md` -- Market Lens MCP installable package

