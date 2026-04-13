"""Subscription feature models."""

from pydantic import BaseModel, Field
from typing import Dict, Optional, Any, List


class SubscribeRequest(BaseModel):
    """Request model for subscribing to a channel"""
    email: str = Field(..., description="Subscriber email address")
    first_name: Optional[str] = Field(None, description="Subscriber first name")
    # Channel-specific fields (for personal_digest)
    user_id: Optional[str] = Field(None, description="User ID for personal digest")

    class Config:
        json_schema_extra = {
            "examples": [
                {
                    "email": "user@example.com",
                    "first_name": "John"
                },
                {
                    "email": "user@example.com",
                    "first_name": "John",
                    "user_id": "12345678-1234-5678-90ab-cdef12345678"
                }
            ]
        }


class UnsubscribeRequest(BaseModel):
    """Request model for unsubscribing from a channel"""
    email: str = Field(..., description="Email address to unsubscribe")

    class Config:
        json_schema_extra = {
            "example": {
                "email": "user@example.com"
            }
        }


class SubscriptionUpdateRequest(BaseModel):
    """Request model for updating subscription metadata"""
    email: str = Field(..., description="Subscriber email address")
    first_name: Optional[str] = Field(None, description="Updated first name")

    class Config:
        json_schema_extra = {
            "example": {
                "email": "user@example.com",
                "first_name": "John"
            }
        }


class SyncUserRequest(BaseModel):
    """Request model for syncing website user with Resend subscriptions"""
    user_id: str = Field(..., description="Website user ID from Insforge auth")
    email: str = Field(..., description="User email address")
    first_name: Optional[str] = Field(None, description="User first name")

    class Config:
        json_schema_extra = {
            "example": {
                "user_id": "b530a7a8-25f5-45ee-95f1-79acddb048e5",
                "email": "user@example.com",
                "first_name": "John"
            }
        }


class SendEmailRequest(BaseModel):
    """Request model for sending test emails"""
    email: str  # Required: user's email address
    first_name: Optional[str] = None  # Optional: for personalized greeting
    report_id: Optional[str] = None  # Optional: specific report ID to send


class BroadcastTestRequest(BaseModel):
    """Request model for testing broadcast with existing report"""
    report_id: str  # ID of existing report to use for testing
    audience_id: Optional[str] = None  # Optional: specific audience ID (e.g., Test Broadcast)


class SubscriptionStatusResponse(BaseModel):
    """Response model for subscription status"""
    success: bool = Field(..., description="Whether the request succeeded")
    channel: str = Field(..., description="Subscription channel")
    subscribed: bool = Field(default=False, description="Whether email is subscribed")
    email: str = Field(..., description="Email address")
    metadata: Dict[str, Any] = Field(default={}, description="Subscription metadata")
    error: Optional[str] = Field(None, description="Error message if failed")


class SubscriptionResponse(BaseModel):
    """Response model for subscribe/unsubscribe operations"""
    success: bool = Field(..., description="Whether the operation succeeded")
    channel: str = Field(..., description="Subscription channel")
    email: str = Field(..., description="Email address")
    contact_id: Optional[str] = Field(None, description="Resend contact ID")
    metadata: Optional[Dict[str, Any]] = Field(None, description="Subscription metadata")
    has_account: Optional[bool] = Field(None, description="Whether email has an existing Insforge auth account")
    error: Optional[str] = Field(None, description="Error message if failed")


class BroadcastResponse(BaseModel):
    """Response model for broadcast operations"""
    success: bool = Field(..., description="Whether the broadcast succeeded")
    channel: str = Field(..., description="Broadcast channel")
    total: int = Field(default=0, description="Total subscribers")
    sent: int = Field(default=0, description="Successfully sent count")
    failed: int = Field(default=0, description="Failed count")
    errors: List[Dict[str, Any]] = Field(default=[], description="Error details")

    class Config:
        json_schema_extra = {
            "example": {
                "success": True,
                "channel": "personal_digest",
                "total": 10,
                "sent": 9,
                "failed": 1,
                "errors": [{"email": "failed@example.com", "error": "Invalid email"}]
            }
        }


class SubscriberInfo(BaseModel):
    """Subscriber information for listing"""
    email: str = Field(..., description="Subscriber email")
    metadata: Dict[str, Any] = Field(default={}, description="Subscriber metadata")


class SubscribersListResponse(BaseModel):
    """Response model for listing subscribers"""
    success: bool = Field(..., description="Whether the request succeeded")
    channel: str = Field(..., description="Subscription channel")
    subscribers: List[SubscriberInfo] = Field(default=[], description="List of subscribers")
    count: int = Field(default=0, description="Total subscriber count")
    error: Optional[str] = Field(None, description="Error message if failed")


class SyncedChannelInfo(BaseModel):
    """Information about a synced channel"""
    channel: str = Field(..., description="Channel name")
    subscribed: bool = Field(..., description="Whether user is subscribed")
    metadata: Dict[str, Any] = Field(default={}, description="Channel metadata")


class SyncUserResponse(BaseModel):
    """Response model for user sync operation"""
    success: bool = Field(..., description="Whether the sync succeeded")
    email: str = Field(..., description="User email")
    user_id: str = Field(..., description="User ID")
    synced_channels: List[SyncedChannelInfo] = Field(default=[], description="Channels that were synced")
    errors: List[str] = Field(default=[], description="Any errors encountered")


class EmailPreferences(BaseModel):
    """Email subscription preferences"""
    morning_report: bool = True
    daily_report: bool = True
    weekly_report: bool = True
    personal_digest: bool = True


class UpdatePreferencesRequest(BaseModel):
    """Request model for updating email preferences"""
    morning_report: Optional[bool] = None
    daily_report: Optional[bool] = None
    weekly_report: Optional[bool] = None
    personal_digest: Optional[bool] = None


class PreferencesResponse(BaseModel):
    """Response model for email preferences"""
    success: bool
    preferences: EmailPreferences


class NewsletterSection(BaseModel):
    """A section in the newsletter content"""
    title: str = Field(..., max_length=200, description="Section title")
    content: str = Field(..., max_length=5000, description="Section content, supports markdown bold")


class NewsletterOutput(BaseModel):
    """Structured output from the newsletter agent"""
    subject: str = Field(..., description="Email subject line")
    greeting: str = Field(..., description="Opening text (without Hi {name} part)")
    sections: List[NewsletterSection] = Field(..., description="Content sections, 2-4")
    closing: str = Field(..., description="Closing text with feedback invitation")
    sign_off_name: str = Field(default="Golden / 金黄", description="Sign-off name")
    sign_off_title: str = Field(default="独立开发者 / 十年美股散户", description="Sign-off title")


class NewsletterGenerateRequest(BaseModel):
    """Request model for generating newsletter content via AI"""
    intent: str = Field(..., description="What the newsletter should convey (bullet points or free text)")
    tone: str = Field(default="warm", description="Tone: warm, professional, casual")
    language: str = Field(default="zh", description="Language: zh, en")


class NewsletterSendRequest(BaseModel):
    """Request model for sending/previewing a newsletter"""
    email: str = Field(default="", max_length=320, description="Recipient email for test send")
    first_name: str = Field(default="", max_length=100, description="Recipient first name for personalization")
    subject: str = Field(..., max_length=200, description="Email subject line")
    greeting: str = Field(..., max_length=2000, description="Opening text")
    sections: List[NewsletterSection] = Field(..., description="Content sections")
    closing: str = Field(..., max_length=2000, description="Closing text")
    sign_off_name: str = Field(default="Golden / 金黄", max_length=100, description="Sign-off name")
    sign_off_title: str = Field(default="独立开发者 / 十年美股散户", max_length=200, description="Sign-off title")


class NewsletterBroadcastRequest(BaseModel):
    """Request model for broadcasting newsletter to all subscribers"""
    subject: str = Field(..., max_length=200, description="Email subject line")
    greeting: str = Field(..., max_length=2000, description="Opening text")
    sections: List[NewsletterSection] = Field(..., description="Content sections")
    closing: str = Field(..., max_length=2000, description="Closing text")
    sign_off_name: str = Field(default="Golden / 金黄", max_length=100, description="Sign-off name")
    sign_off_title: str = Field(default="独立开发者 / 十年美股散户", max_length=200, description="Sign-off title")
