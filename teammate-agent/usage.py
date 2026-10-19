"""Records how long each Teammate call has run, so minutes can be counted per rep.

If SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set, each call keeps one row in the hola_usage
table (supabase/migrations/002_hola_usage.sql and 003_hola_leads.sql). The agent updates it every
minute and once more at the end, so a crash loses at most a minute. Otherwise nothing is sent.
"""

from __future__ import annotations

import logging
import os

import aiohttp

logger = logging.getLogger("hola-teammate.usage")


async def log_session(*, user_id: str, room: str, seconds: int, model: str, lead_saved: bool, tries: int = 2) -> bool:
    """Create or update this call's usage row (keyed by room). True when it was written."""
    row = {"user_id": user_id, "room": room, "seconds": seconds, "model": model, "lead_saved": lead_saved}
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        return False
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }
    for _ in range(tries):
        try:
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=5)) as http:
                async with http.post(f"{url.rstrip('/')}/rest/v1/hola_usage?on_conflict=room",
                                     json=row, headers=headers) as r:
                    if r.status < 300:
                        return True
                    logger.warning("usage log failed: HTTP %s", r.status)
        except Exception as e:
            logger.warning("usage log failed: %s", type(e).__name__)
    return False
