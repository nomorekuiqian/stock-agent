<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into the TheMarketBrew FastAPI backend. A singleton `Posthog` client (with `enable_exception_autocapture=True`) is initialized in the app lifespan and flushed on shutdown. `POSTHOG_PROJECT_TOKEN` and `POSTHOG_HOST` are configured via environment variables in `backend/env`. Thirteen business-critical events are captured across seven route files, covering the full user lifecycle from onboarding through subscription, core feature usage, and churn.

| Event | Description | File |
|---|---|---|
| `checkout_initiated` | User started a Stripe checkout session to upgrade | `backend/app/features/payment/router.py` |
| `subscription_activated` | Stripe webhook confirmed checkout completion and plan is active | `backend/app/features/payment/router.py` |
| `subscription_canceled` | Subscription canceled via Stripe webhook (no active subs remain) | `backend/app/features/payment/router.py` |
| `email_subscribed` | User subscribed to an email channel (daily_report, morning_report, etc.) | `backend/app/features/subscription/router.py` |
| `email_unsubscribed` | User unsubscribed from an email channel | `backend/app/features/subscription/router.py` |
| `onboarding_completed` | User completed the in-app onboarding flow (fires once per user) | `backend/app/features/onboarding/router.py` |
| `email_feedback_submitted` | User clicked satisfied/dissatisfied on a daily report email | `backend/app/features/feedback/router.py` |
| `user_feedback_submitted` | User submitted general feedback via the contact/feedback form | `backend/app/features/feedback/router.py` |
| `watchlist_updated` | User saved an updated watchlist of stock symbols | `backend/app/features/brew/router.py` |
| `digest_generated` | User's personalized AI digest was freshly generated (not from cache) | `backend/app/features/brew/router.py` |
| `holdings_import_completed` | User committed an imported holdings portfolio (screenshot/CSV/paste/PDF) | `backend/app/features/holdings_sync/router.py` |
| `screener_filter_used` | User ran a stock screener filter strategy | `backend/app/features/screener/router.py` |
| `research_chat_sent` | User sent a message in the AI-guided stock research chat | `backend/app/features/screener/router.py` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- [Analytics basics (wizard) — Dashboard](https://us.posthog.com/project/458957/dashboard/1686722)
- [Subscription Activations](https://us.posthog.com/project/458957/insights/iVtDdWWV)
- [Subscription Churn](https://us.posthog.com/project/458957/insights/JTKnMvDs)
- [Checkout to Activation Funnel](https://us.posthog.com/project/458957/insights/CZKSdXjJ)
- [Feature Engagement (Digest, Screener, Research Chat)](https://us.posthog.com/project/458957/insights/eJO4B7V6)
- [Onboarding Completion](https://us.posthog.com/project/458957/insights/CwnuNJbM)

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
