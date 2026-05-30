"""Subscription Service - Unified subscription management for multiple channels."""

import json
import time
from enum import Enum
from typing import Optional, Dict, Any

import resend

from app.core.config import (
    RESEND_API_KEY,
    RESEND_AUDIENCE_TWITTER_DIGEST,
    RESEND_SEGMENT_DAILY_FREE_CTA,
    RESEND_SEGMENT_DAILY_PAID_CTA,
    RESEND_SEGMENT_MORNING,
    RESEND_SEGMENT_EVENING,
    RESEND_SEGMENT_TWITTER_DIGEST,
    RESEND_SEGMENT_WEEKLY,
)
from app.core.logging import get_logger
from app.features.subscription.cta_tier import is_real_paid_sub

logger = get_logger(__name__)


# Rate limit handling for Resend API (2 requests/second)
_last_resend_call = 0.0
_RESEND_RATE_LIMIT_DELAY = 0.55  # 550ms between calls to stay under 2 req/sec


def _rate_limit_wait():
    """Wait if needed to avoid Resend rate limit."""
    global _last_resend_call
    now = time.time()
    elapsed = now - _last_resend_call
    if elapsed < _RESEND_RATE_LIMIT_DELAY:
        time.sleep(_RESEND_RATE_LIMIT_DELAY - elapsed)
    _last_resend_call = time.time()


class SubscriptionChannel(str, Enum):
    """Subscription channels available in the system."""

    DAILY_REPORT = "daily_report"
    WEEKLY_REPORT = "weekly_report"
    PERSONAL_DIGEST = "personal_digest"
    TWITTER_DIGEST = "twitter_digest"


# Channel configuration
CHANNEL_CONFIG: Dict[str, Dict[str, Any]] = {
    SubscriptionChannel.DAILY_REPORT: {
        "audience_name": "TheMarketBrew Daily",
        "metadata_fields": ["first_name"],
        "requires_auth": False,
    },
    SubscriptionChannel.WEEKLY_REPORT: {
        "audience_name": "TheMarketBrew Weekly",
        "metadata_fields": ["first_name"],
        "requires_auth": False,
    },
    SubscriptionChannel.PERSONAL_DIGEST: {
        "audience_name": "",  # No Resend Audience; uses entitlements
        "metadata_fields": ["first_name"],
        "requires_auth": True,
    },
    SubscriptionChannel.TWITTER_DIGEST: {
        # Dedicated Max-only segment (`RESEND_SEGMENT_TWITTER_DIGEST`,
        # currently "Twitter Digest" — id a1b0aa97). Contacts live in the
        # dedicated `RESEND_AUDIENCE_TWITTER_DIGEST` audience; delivery is
        # controlled by segment membership. Entitlement sync auto-adds users
        # unless app-side email preferences explicitly opt them out.
        #
        # Opt-out paths intentionally avoid Resend's team-wide
        # `unsubscribed=true` flag (which would silently kill every other
        # broadcast for the same contact). See `unsubscribe(TWITTER_DIGEST)`
        # below — it only removes from this segment.
        #
        # Public subscribe is blocked at the router — `requires_auth=True`
        # is enforced upstream — so anonymous/free signups never land here.
        "audience_name": "TheMarketBrew Twitter Digest",
        "metadata_fields": ["first_name"],
        "requires_auth": True,
    },
}


class SubscriptionService:
    """
    Unified subscription service for managing multiple broadcast channels.

    Each channel has its own Resend Audience with channel-specific metadata.
    Supports subscribe, unsubscribe, update, and listing operations.
    """

    def __init__(self):
        self.api_key = RESEND_API_KEY
        if self.api_key:
            resend.api_key = self.api_key
        # Cache for audience IDs
        self._audience_ids: Dict[str, str] = {}

    def _get_channel_config(self, channel: SubscriptionChannel) -> Dict[str, Any]:
        """Get configuration for a specific channel."""
        if channel not in CHANNEL_CONFIG:
            raise ValueError(f"Unknown channel: {channel}")
        return CHANNEL_CONFIG[channel]

    def _validate_api_key(self) -> None:
        """Validate that API key is configured."""
        if not self.api_key:
            raise ValueError("RESEND_API_KEY not configured")

    @staticmethod
    def _parse_contact_metadata(contact: Dict[str, Any]) -> Dict[str, Any]:
        """Parse first_name and JSON-encoded extra data from a Resend contact."""
        metadata: Dict[str, Any] = {"first_name": contact.get("first_name")}
        last_name = contact.get("last_name")
        if last_name:
            try:
                metadata.update(json.loads(last_name))
            except json.JSONDecodeError:
                pass
        return metadata

    # =========================================================================
    # Audience Management
    # =========================================================================

    # Channels that resolve their audience id from an explicit env var
    # instead of name-based lookup. Segment ids are still separate and should
    # only be used with ContactSegments/Broadcast segment routing.
    _AUDIENCE_ID_ENV = {
        SubscriptionChannel.TWITTER_DIGEST: RESEND_AUDIENCE_TWITTER_DIGEST,
    }

    def ensure_audience(self, channel: SubscriptionChannel) -> str:
        """
        Resolve the audience id for a channel.

        Channels listed in ``_AUDIENCE_ID_ENV`` come from env config — we
        never name-search or auto-create them, because creating an empty
        audience under the same name would silently break the unsubscribe
        path. Other channels fall back to name-based lookup with auto-create
        for the legacy free-tier flows.
        """
        self._validate_api_key()

        # Return cached ID if available
        if channel in self._audience_ids:
            return self._audience_ids[channel]

        env_audience_id = self._AUDIENCE_ID_ENV.get(channel)
        if channel in self._AUDIENCE_ID_ENV:
            if not env_audience_id:
                raise ValueError(
                    f"Audience id for {channel.value} requires "
                    f"RESEND_AUDIENCE_{channel.value.upper()} env var; "
                    "name-based lookup is disabled for this channel."
                )
            self._audience_ids[channel] = env_audience_id
            return env_audience_id

        config = self._get_channel_config(channel)
        audience_name = config["audience_name"]

        try:
            # Try to find existing audience
            _rate_limit_wait()
            audiences = resend.Audiences.list()
            for aud in audiences.get("data", []):
                if aud.get("name") == audience_name:
                    audience_id = aud["id"]
                    self._audience_ids[channel] = audience_id
                    logger.info("Found audience for %s: %s", channel, audience_id)
                    return audience_id

            # Create new audience if not found
            _rate_limit_wait()
            audience = resend.Audiences.create({"name": audience_name})
            audience_id = audience["id"]
            self._audience_ids[channel] = audience_id
            logger.info("Created audience for %s: %s", channel, audience_id)
            return audience_id

        except Exception as e:
            logger.error("Error ensuring audience for %s: %s", channel, e)
            raise

    # =========================================================================
    # Segment Management (email preferences)
    # =========================================================================

    # Segment IDs for email preference filtering
    SEGMENT_IDS = {
        "morning_report": RESEND_SEGMENT_MORNING,
        "daily_report": RESEND_SEGMENT_EVENING,
        "weekly_report": RESEND_SEGMENT_WEEKLY,
        "twitter_digest": RESEND_SEGMENT_TWITTER_DIGEST,
    }
    DAILY_CTA_SEGMENT_IDS = {
        "free": RESEND_SEGMENT_DAILY_FREE_CTA,
        "paid": RESEND_SEGMENT_DAILY_PAID_CTA,
    }

    def _sync_daily_cta_segments(
        self, email: str, daily_enabled: bool, is_paid: bool
    ) -> list:
        """Keep the daily free/paid CTA sending lists in the expected state.

        ``is_paid`` should be derived from the user's subscription record via
        ``cta_tier.is_real_paid_sub``. Callers without a sub record (e.g.
        anonymous email-only signups) should pass ``is_paid=False``.
        """
        free_seg_id = self.DAILY_CTA_SEGMENT_IDS.get("free")
        paid_seg_id = self.DAILY_CTA_SEGMENT_IDS.get("paid")
        actions = []

        if not free_seg_id and not paid_seg_id:
            return actions

        if not daily_enabled:
            for label, seg_id in (("free", free_seg_id), ("paid", paid_seg_id)):
                if not seg_id:
                    continue
                try:
                    _rate_limit_wait()
                    resend.ContactSegments.remove(
                        {"email": email, "segment_id": seg_id}
                    )
                    actions.append("removed from daily_%s_cta" % label)
                except Exception as e:
                    logger.warning(
                        "sync_daily_cta: remove %s from %s failed: %s",
                        email,
                        label,
                        e,
                    )
            return actions

        desired_label = "paid" if is_paid else "free"
        desired_seg_id = paid_seg_id if desired_label == "paid" else free_seg_id
        other_label = "free" if desired_label == "paid" else "paid"
        other_seg_id = free_seg_id if desired_label == "paid" else paid_seg_id

        if desired_seg_id:
            try:
                _rate_limit_wait()
                resend.ContactSegments.add(
                    {"email": email, "segment_id": desired_seg_id}
                )
                actions.append("added to daily_%s_cta" % desired_label)
            except Exception as e:
                logger.warning(
                    "sync_daily_cta: add %s to %s failed: %s",
                    email,
                    desired_label,
                    e,
                )

        if other_seg_id:
            try:
                _rate_limit_wait()
                resend.ContactSegments.remove(
                    {"email": email, "segment_id": other_seg_id}
                )
                actions.append("removed from daily_%s_cta" % other_label)
            except Exception as e:
                logger.warning(
                    "sync_daily_cta: remove %s from %s failed: %s",
                    email,
                    other_label,
                    e,
                )

        return actions

    def add_to_default_segments(
        self, email: str, sub: Optional[Dict[str, Any]] = None
    ) -> None:
        """Add a new contact to free-default delivery lists.

        Morning, weekly, and twitter_digest segments are entitlement-gated and
        managed by ``sync_resend_segments()`` via the Stripe entitlements
        webhook (plus the trial-creation and set-lifetime call sites). This
        function only seeds the free-default lists for anonymous/free signups.

        Default opt-in segments:
          - daily_report (evening) — always

        ``sub`` is the user's subscription record (from
        ``payment.db.get_subscription``). When omitted the user is treated as
        free — appropriate for anonymous email-only signups that have no
        ``subscriptions`` row yet.
        """
        for pref_key in ("daily_report",):
            seg_id = self.SEGMENT_IDS.get(pref_key)
            if not seg_id:
                logger.warning(
                    "%s segment not configured, skipping default add", pref_key,
                )
                continue
            try:
                _rate_limit_wait()
                resend.ContactSegments.add(
                    {"email": email, "segment_id": seg_id}
                )
                logger.info("Added %s to default %s segment", email, pref_key)
            except Exception as e:  # noqa: BLE001
                logger.warning(
                    "Failed to add %s to default %s segment: %s",
                    email, pref_key, e,
                )

        self._sync_daily_cta_segments(
            email,
            daily_enabled=True,
            is_paid=is_real_paid_sub(sub),
        )

    def sync_resend_segments(
        self,
        email: str,
        sub: Optional[Dict[str, Any]],
    ) -> list:
        """Reconcile Resend segment membership to match the subscription record.

        Idempotent. Only touches segments whose state differs from desired.
        This is the ONLY function that should write Resend segments going forward.

        ``sub`` is the user's subscription record. When ``None`` the user is
        treated as free (no entitlements, not paid).

        Returns list of actions taken (for logging/audit).
        """
        self._validate_api_key()

        sub_dict = sub or {}
        entitlements = set(sub_dict.get("entitlements") or [])
        # Lifetime users bypass the Stripe webhook that fills `entitlements`,
        # so the cached array may be missing Max features. Expand the set
        # below for consistency with `has_entitlement()`.
        if sub_dict.get("is_lifetime"):
            from app.features.payment.entitlements import MAX_FEATURES
            entitlements = entitlements | set(MAX_FEATURES)

        # Entitlement-controlled segments. daily_report (evening) is
        # user-preference only — don't override opt-outs. twitter_digest is
        # auto-added for entitled users unless app-side email preferences carry
        # an explicit false from /profile or the channel unsubscribe link.
        email_preferences = sub_dict.get("email_preferences") or {}
        desired = {
            "morning_report": "morning_report_email" in entitlements,
            "weekly_report": "weekly_report_email" in entitlements,
            "twitter_digest": (
                "twitter_digest" in entitlements
                and email_preferences.get("twitter_digest") is not False
            ),
        }

        current = self.get_email_preferences(email)
        actions = []

        for report_type, should_be in desired.items():
            is_in = current.get(report_type, False)
            seg_id = self.SEGMENT_IDS.get(report_type)
            if not seg_id:
                continue

            if should_be and not is_in:
                try:
                    _rate_limit_wait()
                    resend.ContactSegments.add({"email": email, "segment_id": seg_id})
                    actions.append("added to %s" % report_type)
                except Exception as e:
                    logger.warning("sync_resend: add %s to %s failed: %s", email, report_type, e)
            elif not should_be and is_in:
                try:
                    _rate_limit_wait()
                    resend.ContactSegments.remove({"email": email, "segment_id": seg_id})
                    actions.append("removed from %s" % report_type)
                except Exception as e:
                    logger.warning("sync_resend: remove %s from %s failed: %s", email, report_type, e)

        actions.extend(
            self._sync_daily_cta_segments(
                email,
                daily_enabled=current.get("daily_report", False),
                is_paid=is_real_paid_sub(sub),
            )
        )

        if actions:
            logger.info("sync_resend_segments: email=%s actions=%s", email, actions)

        return actions

    def get_email_preferences(self, email: str) -> Dict[str, bool]:
        """Get email preferences by checking which segments a contact belongs to.

        A contact whose Resend record carries ``unsubscribed=true`` is treated
        as opted out of every channel, even when their segment memberships
        still match. This keeps the /profile UI consistent with what Resend
        will actually deliver (broadcasts skip unsubscribed contacts).
        """
        self._validate_api_key()
        user_segment_ids: set = set()
        try:
            _rate_limit_wait()
            result = resend.ContactSegments.list({"email": email})
            for seg in result.get("data", []):
                user_segment_ids.add(seg.get("id", ""))
        except Exception as e:
            logger.warning("Failed to list segments for %s: %s", email, e)

        # Contact-level unsubscribed flag overrides segment membership.
        # `Contacts.get(email=...)` returns the global contact record; we
        # treat any failure (missing contact, transient error) as "not
        # unsubscribed" so segment state remains the source of truth.
        is_unsubscribed = False
        try:
            _rate_limit_wait()
            contact = resend.Contacts.get(email=email)
            contact_dict = (
                contact if isinstance(contact, dict)
                else getattr(contact, "__dict__", {}) or {}
            )
            is_unsubscribed = bool(contact_dict.get("unsubscribed", False))
        except Exception as e:
            logger.debug("Contacts.get unsubscribed lookup failed for %s: %s", email, e)

        prefs = {}
        for report_type, seg_id in self.SEGMENT_IDS.items():
            if not seg_id:
                # Free/default channels remain opt-in by historical behavior
                # when a segment is missing in local config. The Max-only
                # twitter digest must not appear enabled without its segment.
                prefs[report_type] = report_type != "twitter_digest"
            else:
                prefs[report_type] = (
                    seg_id in user_segment_ids and not is_unsubscribed
                )
        return prefs

    def update_email_preferences(
        self,
        email: str,
        preferences: Dict[str, bool],
        sub: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, bool]:
        """Update email preferences by adding/removing from segments.

        ``sub`` is the user's subscription record. When omitted the user is
        treated as free for daily CTA routing — appropriate when called from
        contexts without authentication.
        """
        self._validate_api_key()
        sub_dict = sub or {}
        entitlements = set(sub_dict.get("entitlements") or [])
        # Lifetime users bypass the Stripe webhook that fills `entitlements`,
        # so the cached array can be missing Max features they actually have.
        # Match has_entitlement()'s semantics: lifetime → has every Max feature.
        if sub_dict.get("is_lifetime"):
            from app.features.payment.entitlements import MAX_FEATURES
            entitlements = entitlements | set(MAX_FEATURES)
        for report_type, enabled in preferences.items():
            seg_id = self.SEGMENT_IDS.get(report_type)
            if not seg_id:
                continue
            if report_type == "twitter_digest":
                # Defense in depth: direct service callers cannot add non-Max
                # users to the Twitter digest sending segment.
                enabled = bool(enabled) and "twitter_digest" in entitlements
            try:
                _rate_limit_wait()
                if enabled:
                    resend.ContactSegments.add(
                        {
                            "email": email,
                            "segment_id": seg_id,
                        }
                    )
                else:
                    resend.ContactSegments.remove(
                        {
                            "email": email,
                            "segment_id": seg_id,
                        }
                    )
                logger.info(
                    "Updated preference %s=%s for %s",
                    report_type,
                    enabled,
                    email,
                )
            except Exception as e:
                logger.warning(
                    "Failed to update preference %s for %s: %s",
                    report_type,
                    email,
                    e,
                )
                continue

            # Note: Resend's `unsubscribed` flag is team-wide (one flag per
            # contact, applies to every broadcast). We never set it from the
            # twitter_digest path — that would silently kill daily/morning/
            # weekly delivery. The only thing that can flip `unsubscribed`
            # to true for our contacts is Resend's native list-unsubscribe
            # header / email client opt-out — which is intentionally a
            # "stop everything" action.

            if report_type == "daily_report":
                self._sync_daily_cta_segments(
                    email,
                    daily_enabled=enabled,
                    is_paid=is_real_paid_sub(sub),
                )
        return self.get_email_preferences(email)

    # =========================================================================
    # Subscriber Operations
    # =========================================================================

    def subscribe(
        self,
        channel: SubscriptionChannel,
        email: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Subscribe an email to a channel.

        Args:
            channel: The subscription channel
            email: Subscriber's email address
            metadata: Channel-specific metadata (first_name, user_id, etc.)

        Returns:
            dict with success status and contact info
        """
        self._validate_api_key()
        metadata = metadata or {}

        try:
            audience_id = self.ensure_audience(channel)

            # Build contact params
            params: resend.Contacts.CreateParams = {
                "audience_id": audience_id,
                "email": email,
                "unsubscribed": False,
            }

            # Add first_name if provided
            if "first_name" in metadata:
                params["first_name"] = metadata["first_name"]

            _rate_limit_wait()
            contact = resend.Contacts.create(params)
            logger.info("Subscribed %s to %s: %s", email, channel, contact.get("id"))

            if channel == SubscriptionChannel.DAILY_REPORT:
                self.add_to_default_segments(email)

            return {
                "success": True,
                "channel": channel.value,
                "contact_id": contact.get("id"),
                "email": email,
                "metadata": metadata,
            }

        except Exception as e:
            error_msg = str(e)
            # Handle duplicate contact
            if "already exists" in error_msg.lower():
                # Try to update instead
                return self.update(channel, email, metadata)
            logger.error("Error subscribing %s to %s: %s", email, channel, e)
            return {"success": False, "error": error_msg}

    def unsubscribe(self, channel: SubscriptionChannel, email: str) -> Dict[str, Any]:
        """
        Unsubscribe an email from a channel.

        TWITTER_DIGEST is a channel-scoped opt-out — the email footer
        explicitly says "只退订推特日报", so we MUST NOT touch the team-wide
        `unsubscribed` flag (which would silently kill every other broadcast
        for this contact). Instead we just remove them from the dedicated
        segment, leaving daily/morning/weekly delivery untouched.

        Other channels still set `unsubscribed=true`, matching the historical
        "unsubscribe means unsubscribe from everything" semantics of the
        daily report link.
        """
        self._validate_api_key()

        try:
            if channel == SubscriptionChannel.TWITTER_DIGEST:
                self.update_email_preferences(
                    email, {"twitter_digest": False}, sub=None
                )
                logger.info("Unsubscribed %s from %s (segment-only)", email, channel)
                return {
                    "success": True,
                    "channel": channel.value,
                    "email": email,
                }

            audience_id = self.ensure_audience(channel)
            update_params: resend.Contacts.UpdateParams = {
                "audience_id": audience_id,
                "email": email,
                "unsubscribed": True,
            }
            _rate_limit_wait()
            resend.Contacts.update(update_params)
            logger.info("Unsubscribed %s from %s", email, channel)
            if channel == SubscriptionChannel.DAILY_REPORT:
                # daily_enabled=False removes from both CTA segments regardless
                # of paid status, so is_paid is a no-op here.
                self._sync_daily_cta_segments(
                    email, daily_enabled=False, is_paid=False
                )
            return {
                "success": True,
                "channel": channel.value,
                "email": email,
            }

        except Exception as e:
            logger.error("Error unsubscribing %s from %s: %s", email, channel, e)
            return {"success": False, "error": str(e)}

    def update(
        self,
        channel: SubscriptionChannel,
        email: str,
        metadata: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Update subscriber metadata for a channel.

        Args:
            channel: The subscription channel
            email: Subscriber's email address
            metadata: Updated metadata

        Returns:
            dict with success status
        """
        self._validate_api_key()

        try:
            audience_id = self.ensure_audience(channel)

            update_params: resend.Contacts.UpdateParams = {
                "audience_id": audience_id,
                "email": email,
                "unsubscribed": False,  # Re-subscribe if previously unsubscribed
            }

            # Update first_name if provided
            if "first_name" in metadata:
                update_params["first_name"] = metadata["first_name"]

            _rate_limit_wait()
            resend.Contacts.update(update_params)
            logger.info("Updated %s in %s", email, channel)

            if channel == SubscriptionChannel.DAILY_REPORT:
                self.add_to_default_segments(email)

            return {
                "success": True,
                "channel": channel.value,
                "email": email,
                "metadata": metadata,
            }

        except Exception as e:
            logger.error("Error updating %s in %s: %s", email, channel, e)
            return {"success": False, "error": str(e)}

    def get_status(self, channel: SubscriptionChannel, email: str) -> Dict[str, Any]:
        """
        Get subscription status for an email in a channel.

        Args:
            channel: The subscription channel
            email: Subscriber's email address

        Returns:
            dict with subscription status and metadata
        """
        self._validate_api_key()

        try:
            audience_id = self.ensure_audience(channel)
            _rate_limit_wait()
            result = resend.Contacts.list(audience_id=audience_id)

            for contact in result.get("data", []):
                if contact.get("email", "").lower() == email.lower():
                    metadata = self._parse_contact_metadata(contact)
                    return {
                        "success": True,
                        "channel": channel.value,
                        "subscribed": not contact.get("unsubscribed", False),
                        "email": email,
                        "metadata": metadata,
                    }

            return {
                "success": True,
                "channel": channel.value,
                "subscribed": False,
                "email": email,
                "metadata": {},
            }

        except Exception as e:
            logger.error("Error getting status for %s in %s: %s", email, channel, e)
            return {"success": False, "error": str(e)}

    def list_subscribers(
        self,
        channel: SubscriptionChannel,
        limit: int = 100,
    ) -> Dict[str, Any]:
        """
        List all active subscribers for a channel.

        Args:
            channel: The subscription channel
            limit: Maximum number of subscribers to return

        Returns:
            dict with subscribers list and count
        """
        self._validate_api_key()

        try:
            audience_id = self.ensure_audience(channel)
            _rate_limit_wait()
            result = resend.Contacts.list(audience_id=audience_id)

            subscribers = []
            for contact in result.get("data", []):
                if contact.get("unsubscribed", False):
                    continue

                metadata = self._parse_contact_metadata(contact)
                subscribers.append(
                    {
                        "email": contact.get("email"),
                        "metadata": metadata,
                    }
                )

                if len(subscribers) >= limit:
                    break

            return {
                "success": True,
                "channel": channel.value,
                "subscribers": subscribers,
                "count": len(subscribers),
            }

        except Exception as e:
            logger.error("Error listing subscribers for %s: %s", channel, e)
            return {"success": False, "error": str(e)}

    def remove_subscriber(
        self, channel: SubscriptionChannel, email: str
    ) -> Dict[str, Any]:
        """
        Permanently remove a subscriber from a channel (hard delete).

        Args:
            channel: The subscription channel
            email: Subscriber's email address

        Returns:
            dict with success status
        """
        self._validate_api_key()

        try:
            audience_id = self.ensure_audience(channel)
            _rate_limit_wait()
            resend.Contacts.remove(audience_id=audience_id, email=email)
            logger.info("Removed %s from %s", email, channel)
            return {
                "success": True,
                "channel": channel.value,
                "email": email,
            }

        except Exception as e:
            logger.error("Error removing %s from %s: %s", email, channel, e)
            return {"success": False, "error": str(e)}

    # =========================================================================
    # User-Subscription Sync
    # =========================================================================

    def sync_user(
        self,
        user_id: str,
        email: str,
        first_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Sync a website user with their Resend subscriptions.

        This method checks all channels for the user's email and updates
        the user_id in the contact metadata, linking the website account
        with existing subscriptions.

        Args:
            user_id: The website user's ID (from Insforge auth)
            email: User's email address
            first_name: User's first name (optional)

        Returns:
            dict with sync results for each channel
        """
        self._validate_api_key()

        results = {
            "success": True,
            "email": email,
            "user_id": user_id,
            "synced_channels": [],
            "errors": [],
        }

        for channel in SubscriptionChannel:
            try:
                audience_id = self.ensure_audience(channel)
                _rate_limit_wait()
                contacts = resend.Contacts.list(audience_id=audience_id)

                for contact in contacts.get("data", []):
                    if contact.get("email", "").lower() == email.lower():
                        # Found existing subscription - update with user_id
                        is_unsubscribed = contact.get("unsubscribed", False)

                        # Parse existing metadata
                        existing_metadata = {}
                        last_name = contact.get("last_name")
                        if last_name:
                            try:
                                existing_metadata = json.loads(last_name)
                            except json.JSONDecodeError:
                                pass

                        # Update metadata with user_id
                        existing_metadata["user_id"] = user_id

                        update_params: resend.Contacts.UpdateParams = {
                            "audience_id": audience_id,
                            "email": email,
                            "last_name": json.dumps(existing_metadata),
                        }

                        # Update first_name if provided
                        if first_name:
                            update_params["first_name"] = first_name

                        _rate_limit_wait()
                        resend.Contacts.update(update_params)

                        results["synced_channels"].append(
                            {
                                "channel": channel.value,
                                "subscribed": not is_unsubscribed,
                                "metadata": existing_metadata,
                            }
                        )

                        logger.info("Synced user %s with %s", user_id, channel)
                        break

            except Exception as e:
                error_msg = f"Error syncing {channel}: {str(e)}"
                results["errors"].append(error_msg)
                logger.error("%s", error_msg)

        if results["errors"]:
            results["success"] = len(results["synced_channels"]) > 0

        return results

    def subscribe_with_welcome(
        self,
        channel: SubscriptionChannel,
        email: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Subscribe and determine if welcome email should be sent.

        Uses Contacts.create success/failure to determine if subscriber is new:
        - Success -> is_new=True -> caller should send welcome email
        - "already exists" error -> is_new=False -> no welcome email

        API calls: 2-3 (ensure_audience + Contacts.create/update)

        Args:
            channel: The subscription channel
            email: Subscriber's email address
            metadata: Channel-specific metadata (first_name, user_id, etc.)

        Returns:
            dict with:
                - success: bool
                - is_new: True if new subscriber (should send welcome email)
                - channel, email, contact_id, metadata
        """
        self._validate_api_key()
        metadata = metadata or {}

        try:
            audience_id = self.ensure_audience(channel)

            # Build contact params with welcome_sent=True pre-set
            params: resend.Contacts.CreateParams = {
                "audience_id": audience_id,
                "email": email,
                "unsubscribed": False,
            }

            # Add first_name if provided
            if "first_name" in metadata:
                params["first_name"] = metadata["first_name"]

            # Build last_name JSON for extra metadata
            extra_data = {}

            # Include user_id if provided
            if "user_id" in metadata:
                extra_data["user_id"] = metadata["user_id"]

            if extra_data:
                params["last_name"] = json.dumps(extra_data)

            _rate_limit_wait()
            contact = resend.Contacts.create(params)
            logger.info(
                "New subscription %s to %s: %s", email, channel, contact.get("id")
            )

            # Add new daily_report subscribers to all segments (all reports on by default)
            if channel == SubscriptionChannel.DAILY_REPORT:
                self.add_to_default_segments(email)

            return {
                "success": True,
                "is_new": True,  # New subscriber - should send welcome email
                "channel": channel.value,
                "contact_id": contact.get("id"),
                "email": email,
                "metadata": metadata,
            }

        except Exception as e:
            error_msg = str(e)

            # Handle duplicate contact - this is a re-subscribe
            if "already exists" in error_msg.lower():
                logger.info("%s already exists in %s, updating", email, channel)

                # Just re-enable subscription, don't send welcome again
                try:
                    update_params: resend.Contacts.UpdateParams = {
                        "audience_id": audience_id,
                        "email": email,
                        "unsubscribed": False,
                    }

                    # Update first_name if provided
                    if "first_name" in metadata:
                        update_params["first_name"] = metadata["first_name"]

                    _rate_limit_wait()
                    resend.Contacts.update(update_params)

                    if channel == SubscriptionChannel.DAILY_REPORT:
                        self.add_to_default_segments(email)

                    return {
                        "success": True,
                        "is_new": False,  # Existing subscriber - no welcome email
                        "channel": channel.value,
                        "email": email,
                        "metadata": metadata,
                    }
                except Exception as update_error:
                    logger.error("Error updating %s: %s", email, update_error)
                    return {
                        "success": False,
                        "is_new": False,
                        "error": str(update_error),
                    }

            logger.error("Error subscribing %s to %s: %s", email, channel, e)
            return {"success": False, "is_new": False, "error": error_msg}


# Singleton instance
_subscription_service: Optional[SubscriptionService] = None


def get_subscription_service() -> SubscriptionService:
    """Get or create the subscription service singleton."""
    global _subscription_service
    if _subscription_service is None:
        _subscription_service = SubscriptionService()
    return _subscription_service
