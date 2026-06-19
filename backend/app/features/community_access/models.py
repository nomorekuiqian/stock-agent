"""Models for partner/community Agent access grants."""

from __future__ import annotations

from pydantic import BaseModel, Field


PARTNER_PANDA = "panda"
PANDA_PERSONA_USERNAME = "pandacircle"


class CommunityGrant(BaseModel):
    id: str | None = None
    partner_id: str = PARTNER_PANDA
    email: str
    email_normalized: str
    status: str = "active"
    grant_source: str | None = None
    granted_by: str | None = None
    granted_at: str | None = None
    revoked_at: str | None = None
    user_id: str | None = None
    first_seen_user_id: str | None = None
    notes: str | None = None
    created_at: str | None = None
    updated_at: str | None = None


class PandaAccessStatus(BaseModel):
    partner_id: str = PARTNER_PANDA
    persona_username: str = PANDA_PERSONA_USERNAME
    has_access: bool
    email: str | None = None
    grant: CommunityGrant | None = None


class GrantDryRunRequest(BaseModel):
    emails_text: str = Field(default="", max_length=200_000)
    emails: list[str] = Field(default_factory=list, max_length=5000)


class GrantApplyRequest(GrantDryRunRequest):
    notes: str | None = Field(default=None, max_length=1000)


class GrantDryRunResponse(BaseModel):
    partner_id: str = PARTNER_PANDA
    total_input: int
    valid_count: int
    invalid: list[str]
    duplicates: list[str]
    existing_active: list[str]
    existing_revoked: list[str]
    to_create: list[str]
    to_reactivate: list[str]


class GrantApplyResponse(BaseModel):
    ok: bool
    dry_run: GrantDryRunResponse
    created: int = 0
    reactivated: int = 0
    unchanged: int = 0

