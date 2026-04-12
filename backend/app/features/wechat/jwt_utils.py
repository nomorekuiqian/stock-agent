"""
WeChat JWT utilities — sign/decode account JWTs + stateless OTP token generation.

JWT token types:
  wechat_unbound    sub=openid,           exp=1d  → unbound guest
  wechat_email_only sub=wechat_users.id,  exp=7d  → OTP-verified, no Insforge account
                    openid=<actual openid> (explicit claim)
  wechat_bound      sub=insforge_user_id, exp=7d  → fully bound account
                    openid=<actual openid> (explicit claim)

OTP token:
  URLSafeTimedSerializer({email, openid, action}, max_age=300s)
  Replay prevention: _used_otp_tokens in-process dict (same pattern as _token_cache in deps.py)
  ⚠️ SINGLE-INSTANCE ONLY: dict is not shared across multiple uvicorn workers or containers.
     Risk is low (ops are idempotent, window is 5 min). For multi-worker deploy, swap for Redis setnx.
"""

import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

import os

import jwt as pyjwt
from itsdangerous import URLSafeTimedSerializer, SignatureExpired, BadSignature

from app.core.logging import get_logger

logger = get_logger(__name__)


def _get_secret() -> str:
    """Read WECHAT_JWT_SECRET lazily so tests can set os.environ before the call."""
    secret = os.environ.get("WECHAT_JWT_SECRET", "")
    if not secret:
        # Fall back to config module value (production path)
        from app.core.config import WECHAT_JWT_SECRET as _cfg_secret
        secret = _cfg_secret
    return secret


_ALGORITHM = "HS256"
_OTP_SALT = "wechat-otp-v1"
_OTP_MAX_AGE = 300  # seconds (5 minutes)

WECHAT_TOKEN_TYPES = {"wechat_unbound", "wechat_email_only", "wechat_bound"}

# Replay guard: token_string → timestamp_used
_used_otp_tokens: dict[str, float] = {}


# ---------------------------------------------------------------------------
# JWT helpers
# ---------------------------------------------------------------------------

def sign_wechat_jwt(
    sub: str,
    typ: str,
    exp_days: int,
    openid: Optional[str] = None,
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
    secret = _get_secret()
    if not secret:
        raise RuntimeError("WECHAT_JWT_SECRET is not configured")
    if typ not in WECHAT_TOKEN_TYPES:
        raise ValueError("Invalid typ: %s" % typ)

    now = datetime.now(tz=timezone.utc)
    payload: Dict[str, Any] = {
        "sub": sub,
        "typ": typ,
        "iat": now,
        "exp": now + timedelta(days=exp_days),
    }
    if openid:
        payload["openid"] = openid
    return pyjwt.encode(payload, secret, algorithm=_ALGORITHM)


def decode_wechat_jwt(token: str) -> Dict[str, Any]:
    """
    Decode and verify a WeChat JWT.

    Raises:
        jwt.ExpiredSignatureError, jwt.InvalidTokenError, RuntimeError
    """
    secret = _get_secret()
    if not secret:
        raise RuntimeError("WECHAT_JWT_SECRET is not configured")
    return pyjwt.decode(token, secret, algorithms=[_ALGORITHM])


def extract_openid_from_jwt(payload: Dict[str, Any]) -> str:
    """
    Extract the actual wechat openid from a decoded JWT payload.
    - wechat_unbound: sub IS the openid
    - wechat_email_only / wechat_bound: openid is an explicit claim (sub is an internal UUID)
    """
    return payload.get("openid") or payload["sub"]


# ---------------------------------------------------------------------------
# OTP helpers
# ---------------------------------------------------------------------------

def _get_signer() -> URLSafeTimedSerializer:
    secret = _get_secret()
    if not secret:
        raise RuntimeError("WECHAT_JWT_SECRET is not configured")
    return URLSafeTimedSerializer(secret, salt=_OTP_SALT)


def generate_otp_token(email: str, openid: str, action: str) -> str:
    """
    Generate a stateless OTP token embedding {email, openid, action}.
    The token is URL-safe and carries a timestamp (verified server-side).
    """
    return _get_signer().dumps({"email": email, "openid": openid, "action": action})


def verify_otp_token(token: str) -> Dict[str, Any]:
    """
    Verify an OTP token.

    Returns:
        {"valid": True,  "email": ..., "openid": ..., "action": ...}
        {"valid": False, "reason": "expired" | "invalid" | "already_used"}
    """
    # Replay check first (cheap)
    if token in _used_otp_tokens:
        return {"valid": False, "reason": "already_used"}

    import sys
    _self = sys.modules[__name__]
    max_age = _self._OTP_MAX_AGE
    try:
        data = _get_signer().loads(token, max_age=max_age if max_age > 0 else -1)
    except SignatureExpired:
        return {"valid": False, "reason": "expired"}
    except BadSignature:
        return {"valid": False, "reason": "invalid"}

    return {
        "valid": True,
        "email": data["email"],
        "openid": data["openid"],
        "action": data["action"],
    }


def mark_otp_used(token: str) -> None:
    """Mark an OTP token as consumed. Call immediately after successful verify."""
    _used_otp_tokens[token] = time.time()
    # Evict tokens older than OTP TTL (can't be replayed anyway after expiry)
    if len(_used_otp_tokens) > 500:
        cutoff = time.time() - _OTP_MAX_AGE
        expired = [k for k, t in _used_otp_tokens.items() if t < cutoff]
        for k in expired:
            del _used_otp_tokens[k]
