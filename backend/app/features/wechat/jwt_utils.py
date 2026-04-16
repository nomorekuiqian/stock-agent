"""
WeChat JWT utilities — sign/decode account JWTs.

JWT token types:
  wechat_unbound    sub=openid,           exp=7d  → unbound guest
  wechat_email_only sub=wechat_users.id,  exp=7d  → OTP-verified, no Insforge account
                    openid=<actual openid> (explicit claim)
  wechat_bound      sub=insforge_user_id, exp=7d  → fully bound account
                    openid=<actual openid> (explicit claim)

OTP: 6-digit numeric codes live in shared/otp_utils.py (WeChat-agnostic).
"""

import os
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt as pyjwt

from app.core.logging import get_logger

logger = get_logger(__name__)


def _get_secret() -> str:
    """Read WECHAT_JWT_SECRET lazily so tests can set os.environ before the call."""
    secret = os.environ.get("WECHAT_JWT_SECRET", "")
    if not secret:
        raise RuntimeError("WECHAT_JWT_SECRET is not configured")
    return secret


_ALGORITHM = "HS256"

WECHAT_TOKEN_TYPES = {"wechat_unbound", "wechat_email_only", "wechat_bound"}


# ---------------------------------------------------------------------------
# JWT helpers
# ---------------------------------------------------------------------------

def sign_wechat_jwt(
    sub: str,
    typ: str,
    exp_days: int,
    openid: str | None = None,
) -> str:
    """
    Sign a WeChat JWT.

    Args:
        sub: subject — openid for unbound; wechat_users.id for email_only; insforge_user_id for bound
        typ: one of WECHAT_TOKEN_TYPES
        exp_days: lifetime in days
        openid: explicit openid claim for email_only/bound tokens

    Returns:
        Signed JWT string
    """
    if typ not in WECHAT_TOKEN_TYPES:
        raise ValueError("Invalid typ: %s" % typ)
    if exp_days <= 0:
        raise ValueError("exp_days must be a positive integer, got: %s" % exp_days)

    secret = _get_secret()
    now = datetime.now(tz=timezone.utc)
    payload: dict[str, Any] = {
        "sub": sub,
        "typ": typ,
        "iat": now,
        "exp": now + timedelta(days=exp_days),
    }
    if openid:
        payload["openid"] = openid
    return pyjwt.encode(payload, secret, algorithm=_ALGORITHM)


def decode_wechat_jwt(token: str) -> dict[str, Any]:
    """
    Decode and verify a WeChat JWT.

    Raises:
        jwt.ExpiredSignatureError, jwt.InvalidTokenError, RuntimeError
    """
    secret = _get_secret()
    return pyjwt.decode(token, secret, algorithms=[_ALGORITHM])


def extract_openid_from_jwt(payload: dict[str, Any]) -> str:
    """
    Extract the actual wechat openid from a decoded JWT payload.
    - wechat_unbound: sub IS the openid
    - wechat_email_only / wechat_bound: openid is an explicit claim (sub is an internal UUID)
    """
    return payload.get("openid") or payload["sub"]
