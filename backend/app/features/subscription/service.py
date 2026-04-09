"""Subscription Service - Unified subscription management for multiple channels."""

import json
import time
from enum import Enum
from typing import Optional, Dict, Any

import resend

from app.core.config import (
    RESEND_API_KEY,
    RESEND_SEGMENT_MORNING,
    RESEND_SEGMENT_EVENING,
    RESEND_SEGMENT_WEEKLY,
)
from app.core.logging import get_logger

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
    PERSONAL_DIGEST = "personal_digest"
    WEEKLY_REPORT = "weekly_report"


# Channel configuration
CHANNEL_CONFIG: Dict[str, Dict[str, Any]] = {
    SubscriptionChannel.DAILY_REPORT: {
        "audience_name": "TheMarketBrew Daily",
        "metadata_fields": ["first_name"],
        "requires_auth": False,
    },
    SubscriptionChannel.PERSONAL_DIGEST: {
        "audience_name": "Personal Digest Daily",
        "metadata_fields": ["first_name", "user_id"],
        "requires_auth": True,
    },
    SubscriptionChannel.WEEKLY_REPORT: {
        "audience_name": "TheMarketBrew Weekly",
        "metadata_fields": ["first_name"],
        "requires_auth": False,
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

    def ensure_audience(self, channel: SubscriptionChannel) -> str:
        """
        Ensure the audience for a channel exists, create if not.

        Args:
            channel: The subscription channel

        Returns:
            Audience ID
        """
        self._validate_api_key()

        # Return cached ID if available
        if channel in self._audience_ids:
            return self._audience_ids[channel]

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
    }

    def add_to_default_segments(self, email: str) -> None:
        """Add a new contact to the free-tier default segment (evening daily report only).

        Morning and weekly segments are Pro-only and should NOT be populated
        on signup. They are added via `add_pro_segments()` when a user upgrades.
        """
        seg_id = self.SEGMENT_IDS.get("daily_report")
        if not seg_id:
            logger.warning("daily_report segment not configured, skipping default add")
            return
        try:
            _rate_limit_wait()
            resend.ContactSegments.add(
                {
                    "email": email,
                    "segment_id": seg_id,
                }
            )
            logger.info("Added %s to default (evening) segment", email)
        except Exception as e:
            logger.warning("Failed to add %s to default segment: %s", email, e)

    def add_pro_segments(self, email: str) -> None:
        """Add a contact to Pro-only segments (morning + weekly).

        Call when a user upgrades to Pro/Max so they start receiving the
        morning briefing and weekly macro report.
        """
        for report_type in ("morning_report", "weekly_report"):
            seg_id = self.SEGMENT_IDS.get(report_type)
            if not seg_id:
                continue
            try:
                _rate_limit_wait()
                resend.ContactSegments.add(
                    {
                        "email": email,
                        "segment_id": seg_id,
                    }
                )
                logger.info("Added %s to Pro segment %s", email, report_type)
            except Exception as e:
                logger.warning(
                    "Failed to add %s to Pro segment %s: %s", email, report_type, e
                )

    def remove_pro_segments(self, email: str) -> None:
        """Remove a contact from Pro-only segments (morning + weekly).

        Call when a user downgrades from Pro (subscription canceled, invite
        trial expired). The evening/daily segment is preserved — they continue
        to receive the free daily report.
        """
        for report_type in ("morning_report", "weekly_report"):
            seg_id = self.SEGMENT_IDS.get(report_type)
            if not seg_id:
                continue
            try:
                _rate_limit_wait()
                resend.ContactSegments.remove(
                    {
                        "email": email,
                        "segment_id": seg_id,
                    }
                )
                logger.info("Removed %s from Pro segment %s", email, report_type)
            except Exception as e:
                logger.warning(
                    "Failed to remove %s from Pro segment %s: %s",
                    email,
                    report_type,
                    e,
                )

    def get_email_preferences(self, email: str) -> Dict[str, bool]:
        """Get email preferences by checking which segments a contact belongs to."""
        self._validate_api_key()
        user_segment_ids: set = set()
        try:
            _rate_limit_wait()
            result = resend.ContactSegments.list({"email": email})
            for seg in result.get("data", []):
                user_segment_ids.add(seg.get("id", ""))
        except Exception as e:
            logger.warning("Failed to list segments for %s: %s", email, e)

        prefs = {}
        for report_type, seg_id in self.SEGMENT_IDS.items():
            if not seg_id:
                prefs[report_type] = True  # default on if segment not configured
            else:
                prefs[report_type] = seg_id in user_segment_ids
        return prefs

    def update_email_preferences(
        self, email: str, preferences: Dict[str, bool]
    ) -> Dict[str, bool]:
        """Update email preferences by adding/removing from segments."""
        self._validate_api_key()
        for report_type, enabled in preferences.items():
            seg_id = self.SEGMENT_IDS.get(report_type)
            if not seg_id:
                continue
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

            # For personal_digest, store user_id in contact data
            # Resend doesn't have custom fields, so we store in last_name field as JSON
            if channel == SubscriptionChannel.PERSONAL_DIGEST:
                extra_data = {}
                if "user_id" in metadata:
                    extra_data["user_id"] = metadata["user_id"]

                # Store extra data as JSON in last_name field (Resend workaround)
                if extra_data:
                    params["last_name"] = json.dumps(extra_data)

            _rate_limit_wait()
            contact = resend.Contacts.create(params)
            logger.info("Subscribed %s to %s: %s", email, channel, contact.get("id"))

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
        Unsubscribe an email from a channel (soft delete).

        Args:
            channel: The subscription channel
            email: Subscriber's email address

        Returns:
            dict with success status
        """
        self._validate_api_key()

        try:
            audience_id = self.ensure_audience(channel)
            update_params: resend.Contacts.UpdateParams = {
                "audience_id": audience_id,
                "email": email,
                "unsubscribed": True,
            }
            _rate_limit_wait()
            resend.Contacts.update(update_params)
            logger.info("Unsubscribed %s from %s", email, channel)
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

            # For personal_digest, update stored data
            if channel == SubscriptionChannel.PERSONAL_DIGEST:
                extra_data = {}
                if "user_id" in metadata:
                    extra_data["user_id"] = metadata["user_id"]
                if extra_data:
                    update_params["last_name"] = json.dumps(extra_data)

            _rate_limit_wait()
            resend.Contacts.update(update_params)
            logger.info("Updated %s in %s", email, channel)

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
