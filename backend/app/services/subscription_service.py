"""
Subscription Service - Unified subscription management for multiple channels.
Supports daily_report and personal_digest channels using Resend Audiences API.
"""

import os
import json
from datetime import datetime, timezone
from enum import Enum
from typing import Optional, List, Dict, Any

import resend


class SubscriptionChannel(str, Enum):
    """Subscription channels available in the system."""

    DAILY_REPORT = "daily_report"
    PERSONAL_DIGEST = "personal_digest"


# Channel configuration
CHANNEL_CONFIG: Dict[str, Dict[str, Any]] = {
    SubscriptionChannel.DAILY_REPORT: {
        "audience_name": "MarketBrew Daily",
        "metadata_fields": ["first_name"],
        "requires_auth": False,
    },
    SubscriptionChannel.PERSONAL_DIGEST: {
        "audience_name": "Personal Digest Daily",
        "metadata_fields": ["first_name", "user_id", "symbols"],
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
        self.api_key = os.getenv("RESEND_API_KEY")
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
            audiences = resend.Audiences.list()
            for aud in audiences.get("data", []):
                if aud.get("name") == audience_name:
                    audience_id = aud["id"]
                    self._audience_ids[channel] = audience_id
                    print(
                        f"[SubscriptionService] Found audience for {channel}: {audience_id}"
                    )
                    return audience_id

            # Create new audience if not found
            audience = resend.Audiences.create({"name": audience_name})
            audience_id = audience["id"]
            self._audience_ids[channel] = audience_id
            print(
                f"[SubscriptionService] Created audience for {channel}: {audience_id}"
            )
            return audience_id

        except Exception as e:
            print(f"[SubscriptionService] Error ensuring audience for {channel}: {e}")
            raise

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
            metadata: Channel-specific metadata (first_name, user_id, symbols, etc.)

        Returns:
            dict with success status and contact info
        """
        self._validate_api_key()
        metadata = metadata or {}

        try:
            audience_id = self.ensure_audience(channel)
            config = self._get_channel_config(channel)

            # Build contact params
            params: resend.Contacts.CreateParams = {
                "audience_id": audience_id,
                "email": email,
                "unsubscribed": False,
            }

            # Add first_name if provided
            if "first_name" in metadata:
                params["first_name"] = metadata["first_name"]

            # For personal_digest, store user_id and symbols in contact data
            # Resend doesn't have custom fields, so we store in first_name field as JSON
            if channel == SubscriptionChannel.PERSONAL_DIGEST:
                # Create a structured data string for the contact
                extra_data = {}
                if "user_id" in metadata:
                    extra_data["user_id"] = metadata["user_id"]
                if "symbols" in metadata:
                    extra_data["symbols"] = metadata["symbols"]

                # Store extra data as JSON in last_name field (Resend workaround)
                if extra_data:
                    params["last_name"] = json.dumps(extra_data)

            contact = resend.Contacts.create(params)
            print(
                f"[SubscriptionService] Subscribed {email} to {channel}: {contact.get('id')}"
            )

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
            print(f"[SubscriptionService] Error subscribing {email} to {channel}: {e}")
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
            resend.Contacts.update(update_params)
            print(f"[SubscriptionService] Unsubscribed {email} from {channel}")
            return {
                "success": True,
                "channel": channel.value,
                "email": email,
            }

        except Exception as e:
            print(
                f"[SubscriptionService] Error unsubscribing {email} from {channel}: {e}"
            )
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
                if "symbols" in metadata:
                    extra_data["symbols"] = metadata["symbols"]
                if extra_data:
                    update_params["last_name"] = json.dumps(extra_data)

            resend.Contacts.update(update_params)
            print(f"[SubscriptionService] Updated {email} in {channel}")

            return {
                "success": True,
                "channel": channel.value,
                "email": email,
                "metadata": metadata,
            }

        except Exception as e:
            print(f"[SubscriptionService] Error updating {email} in {channel}: {e}")
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
            result = resend.Contacts.list(audience_id=audience_id)

            for contact in result.get("data", []):
                if contact.get("email", "").lower() == email.lower():
                    # Parse stored metadata
                    metadata = {"first_name": contact.get("first_name")}

                    # Parse extra data from last_name field
                    last_name = contact.get("last_name")
                    if last_name:
                        try:
                            extra_data = json.loads(last_name)
                            metadata.update(extra_data)
                        except json.JSONDecodeError:
                            pass

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
            print(
                f"[SubscriptionService] Error getting status for {email} in {channel}: {e}"
            )
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
            result = resend.Contacts.list(audience_id=audience_id)

            subscribers = []
            for contact in result.get("data", []):
                if contact.get("unsubscribed", False):
                    continue

                # Parse metadata
                metadata = {"first_name": contact.get("first_name")}

                # Parse extra data from last_name field
                last_name = contact.get("last_name")
                if last_name:
                    try:
                        extra_data = json.loads(last_name)
                        metadata.update(extra_data)
                    except json.JSONDecodeError:
                        pass

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
            print(f"[SubscriptionService] Error listing subscribers for {channel}: {e}")
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
            resend.Contacts.remove(audience_id=audience_id, email=email)
            print(f"[SubscriptionService] Removed {email} from {channel}")
            return {
                "success": True,
                "channel": channel.value,
                "email": email,
            }

        except Exception as e:
            print(f"[SubscriptionService] Error removing {email} from {channel}: {e}")
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
                        if (
                            "symbols" not in existing_metadata
                            and channel == SubscriptionChannel.PERSONAL_DIGEST
                        ):
                            existing_metadata["symbols"] = []

                        update_params: resend.Contacts.UpdateParams = {
                            "audience_id": audience_id,
                            "email": email,
                            "last_name": json.dumps(existing_metadata),
                        }

                        # Update first_name if provided
                        if first_name:
                            update_params["first_name"] = first_name

                        resend.Contacts.update(update_params)

                        results["synced_channels"].append(
                            {
                                "channel": channel.value,
                                "subscribed": not is_unsubscribed,
                                "metadata": existing_metadata,
                            }
                        )

                        print(
                            f"[SubscriptionService] Synced user {user_id} with {channel}"
                        )
                        break

            except Exception as e:
                error_msg = f"Error syncing {channel}: {str(e)}"
                results["errors"].append(error_msg)
                print(f"[SubscriptionService] {error_msg}")

        if results["errors"]:
            results["success"] = len(results["synced_channels"]) > 0

        return results

    # =========================================================================
    # Welcome Email Tracking
    # =========================================================================

    def check_welcome_sent(self, channel: SubscriptionChannel, email: str) -> bool:
        """
        Check if welcome email has been sent to this subscriber.

        Args:
            channel: The subscription channel
            email: Subscriber's email address

        Returns:
            True if welcome email was already sent, False otherwise
        """
        self._validate_api_key()

        try:
            audience_id = self.ensure_audience(channel)
            contacts = resend.Contacts.list(audience_id=audience_id)

            for contact in contacts.get("data", []):
                if contact.get("email", "").lower() == email.lower():
                    last_name = contact.get("last_name", "")
                    if last_name:
                        try:
                            extra_data = json.loads(last_name)
                            return extra_data.get("welcome_sent", False)
                        except json.JSONDecodeError:
                            pass
                    return False

            return False

        except Exception as e:
            print(f"[SubscriptionService] Error checking welcome_sent for {email}: {e}")
            return False

    def mark_welcome_sent(self, channel: SubscriptionChannel, email: str) -> bool:
        """
        Mark welcome email as sent for subscriber.

        Updates the contact's metadata to include welcome_sent=True
        and welcome_sent_at timestamp.

        Args:
            channel: The subscription channel
            email: Subscriber's email address

        Returns:
            True if successfully marked, False otherwise
        """
        self._validate_api_key()

        try:
            audience_id = self.ensure_audience(channel)

            # Get existing metadata
            existing_data = {}
            contacts = resend.Contacts.list(audience_id=audience_id)

            for contact in contacts.get("data", []):
                if contact.get("email", "").lower() == email.lower():
                    last_name = contact.get("last_name", "")
                    if last_name:
                        try:
                            existing_data = json.loads(last_name)
                        except json.JSONDecodeError:
                            pass
                    break

            # Update welcome_sent flag
            existing_data["welcome_sent"] = True
            existing_data["welcome_sent_at"] = datetime.now(timezone.utc).isoformat()

            update_params: resend.Contacts.UpdateParams = {
                "audience_id": audience_id,
                "email": email,
                "last_name": json.dumps(existing_data),
            }
            resend.Contacts.update(update_params)

            print(f"[SubscriptionService] Marked welcome_sent for {email} in {channel}")
            return True

        except Exception as e:
            print(f"[SubscriptionService] Error marking welcome_sent for {email}: {e}")
            return False


# Singleton instance
_subscription_service: Optional[SubscriptionService] = None


def get_subscription_service() -> SubscriptionService:
    """Get or create the subscription service singleton."""
    global _subscription_service
    if _subscription_service is None:
        _subscription_service = SubscriptionService()
    return _subscription_service
