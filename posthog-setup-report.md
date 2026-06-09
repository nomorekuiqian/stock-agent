<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into the TheMarketBrew FastAPI backend. A singleton `Posthog` client (with `enable_exception_autocapture=True`) is initialized in the app lifespan and flushed on shutdown. `POSTHOG_PROJECT_TOKEN` and `POSTHOG_HOST` are configured via environment variables in `backend/.env`. Twenty-four business-critical events are captured across nine route files, covering the full user lifecycle from WeChat login and onboarding through subscription conversion, core content engagement, AI feature usage, and churn.

**Newly added events (this session):**

| Event | Description | File |
|---|---|---|
| `wechat_login` | WeChat Mini Program login succeeded for a bound user | `backend/app/features/wechat/router.py` |
| `wechat_account_bound` | User bound WeChat to an email via OTP; `account_state` property | `backend/app/features/wechat/router.py` |
| `kol_research_chat_sent` | User sent a message to the KOL Research AI agent; `persona_username`, `is_stream` properties | `backend/app/features/kol_research/router.py` |
| `ai_content_feedback_submitted` | User submitted thumbs-up/down on AI content; `target_type`, `sentiment` properties | `backend/app/features/memory/router.py` |
| `daily_report_viewed` | Authenticated user fetched the latest daily market report | `backend/app/features/daily_report/router.py` |
| `morning_report_viewed` | User fetched today's morning briefing; `has_access` (paywall) property | `backend/app/features/morning_report/router.py` |
| `brew_digest_requested` | User triggered a personalized Brew digest; `symbol_count` property | `backend/app/features/brew/router.py` |
| `stock_analysis_requested` | Authenticated user requested AI analysis on a stock; `symbol` property | `backend/app/features/stock/router.py` |
| `access_requested` | User submitted the landing-page access request form | `backend/app/features/invites/router.py` |
| `qualify_questionnaire_submitted` | User submitted the qualify questionnaire; `background`, `trading_style` properties | `backend/app/features/invites/router.py` |

**Pre-existing events:**

| Event | File |
|---|---|
| `checkout_initiated` | `backend/app/features/payment/router.py` |
| `subscription_activated` | `backend/app/features/payment/router.py` |
| `subscription_canceled` | `backend/app/features/payment/router.py` |
| `email_subscribed` | `backend/app/features/subscription/router.py` |
| `email_unsubscribed` | `backend/app/features/subscription/router.py` |
| `onboarding_completed` | `backend/app/features/onboarding/router.py` |
| `email_feedback_submitted` | `backend/app/features/feedback/router.py` |
| `user_feedback_submitted` | `backend/app/features/feedback/router.py` |
| `watchlist_updated` | `backend/app/features/brew/router.py` |
| `digest_generated` | `backend/app/features/brew/router.py` |
| `holdings_import_completed` | `backend/app/features/holdings_sync/router.py` |
| `screener_filter_used` | `backend/app/features/screener/router.py` |
| `research_conversation_created` | `backend/app/features/screener/router.py` |
| `research_chat_sent` | `backend/app/features/screener/router.py` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- **Dashboard**: [Analytics basics (wizard)](https://us.posthog.com/project/458957/dashboard/1687098)
- **AI Feature Usage**: [KOL chat, screener chat, and stock analysis daily counts](https://us.posthog.com/project/458957/insights/sjIqfWxc)
- **Subscription Conversion Funnel**: [Checkout initiated → subscription activated](https://us.posthog.com/project/458957/insights/lOzs7NeV)
- **Core Content Engagement**: [Unique daily users of daily report, morning report, and Brew digest](https://us.posthog.com/project/458957/insights/0fiunvxw)
- **Subscription Health**: [Weekly activations vs cancellations — churn signal](https://us.posthog.com/project/458957/insights/rzdmaBM0)
- **Onboarding Completion Funnel**: [WeChat login → onboarding completed → subscription activated](https://us.posthog.com/project/458957/insights/frnOLVTz)

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
