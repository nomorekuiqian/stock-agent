"""
Shared OTP utility — 6-digit numeric one-time passwords.

WeChat-agnostic: openid is optional. Keyed by email so future Web flows
can reuse this module without any WeChat-specific imports.

Storage: in-process dict (single-instance safe; swap for Redis setnx for multi-worker).
"""
import random
import time
from typing import Any, Optional

_NUMERIC_OTP_TTL = 300  # seconds (5 minutes)

_pending_otps: dict[str, dict[str, Any]] = {}
# key: email
# value: {"code": str, "action": str, "openid": str|None, "expires": float}


def generate_numeric_otp(
    email: str,
    action: str,
    openid: Optional[str] = None,
) -> str:
    code = f"{random.randint(0, 999_999):06d}"
    _pending_otps[email] = {
        "code": code,
        "action": action,
        "openid": openid,
        "expires": time.time() + _NUMERIC_OTP_TTL,
    }
    if len(_pending_otps) > 500:
        now = time.time()
        stale = [k for k, v in _pending_otps.items() if v["expires"] < now]
        for k in stale:
            del _pending_otps[k]
    return code


def verify_numeric_otp(email: str, code: str) -> dict[str, Any]:
    entry = _pending_otps.get(email)
    if not entry:
        return {"valid": False, "reason": "not_found"}
    if time.time() > entry["expires"]:
        del _pending_otps[email]
        return {"valid": False, "reason": "expired"}
    if entry["code"] != code:
        return {"valid": False, "reason": "invalid_code"}
    del _pending_otps[email]
    return {
        "valid": True,
        "email": email,
        "openid": entry["openid"],
        "action": entry["action"],
    }
