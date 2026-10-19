"""Records how long each Teammate session ran, so minutes can be counted per rep.

If SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set, a row goes into the hola_usage
table (see supabase/migrations/002_hola_usage.sql). Otherwise it is only logged.
"""

from __future__ import annotations

import logging
import os

import aiohttp

logger = logging.getLogger("hola-teammate.usage")


async def log_session(*, user_id: str, room: str, seconds: int, model: str, lead_saved: bool) -> None:
    row = {"user_id": user_id, "room": room, "seconds": seconds, "model": model, "lead_saved": lead_saved}
    logger.info("session ended: %s", row)
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        return
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    try:
        async with aiohttp.ClientSession() as http:
            async with http.post(f"{url.rstrip('/')}/rest/v1/hola_usage", json=row, headers=headers) as r:
                if r.status >= 300:
                    logger.warning("usage log failed: %s %s", r.status, await r.text())
    except Exception as e:
        logger.warning("usage log failed: %s", e)
