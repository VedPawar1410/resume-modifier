"""
Password gate for the deployed app (personal use).

When APP_PASSWORD is set, the browser trades the password for a signed token once
(POST /api/login) and sends it as `Authorization: Bearer <token>` on every call. The token
is "<expiry>.<HMAC of expiry>", so the server checks it without storing sessions; changing
AUTH_SECRET (or APP_PASSWORD, if AUTH_SECRET is unset) logs every device out.

A token in the browser rather than a cookie: the frontend (Vercel) and API (Azure) are on
different domains, and browsers increasingly block cookies sent across domains.
"""

import asyncio
import hashlib
import hmac
import time

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from utils.config import get_settings

router = APIRouter()

TOKEN_DAYS = 30
OPEN_PATHS = {"/api/health", "/api/login", "/api/session"}


class LoginRequest(BaseModel):
    password: str


def gate_enabled() -> bool:
    return bool(get_settings().app_password)


def _secret() -> bytes:
    s = get_settings()
    return (s.auth_secret or f"derived:{s.app_password}").encode()


def _sign(expiry: str) -> str:
    return hmac.new(_secret(), expiry.encode(), hashlib.sha256).hexdigest()


def make_token() -> tuple[str, int]:
    expiry = int(time.time()) + TOKEN_DAYS * 86400
    return f"{expiry}.{_sign(str(expiry))}", expiry


def token_valid(token: str | None) -> bool:
    if not token or "." not in token:
        return False
    expiry, signature = token.split(".", 1)
    if not expiry.isdigit() or int(expiry) < time.time():
        return False
    return hmac.compare_digest(signature, _sign(expiry))


def bearer(request: Request) -> str | None:
    header = request.headers.get("authorization", "")
    return header[7:] if header.lower().startswith("bearer ") else None


@router.post("/api/login")
async def login(req: LoginRequest):
    if not gate_enabled():
        return {"token": None, "expires_at": None}
    if not hmac.compare_digest(req.password.encode(), get_settings().app_password.encode()):
        await asyncio.sleep(1)  # slows down password guessing
        raise HTTPException(status_code=401, detail="Wrong password")
    token, expiry = make_token()
    return {"token": token, "expires_at": expiry}


@router.get("/api/session")
async def session(request: Request):
    """Lets the frontend decide whether to show the password screen."""
    return {"required": gate_enabled(), "valid": not gate_enabled() or token_valid(bearer(request))}
