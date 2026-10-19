"""Saves sign-ups and callbacks somewhere permanent before Ana says "saved".

With SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY set, each lead goes into the hola_leads table
(supabase/migrations/003_hola_leads.sql), one row per call: saving again updates that row.
Without them (testing on your PC), each save is added to leads.jsonl in this folder.

store_lead returns True only once the write has succeeded.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import aiohttp

logger = logging.getLogger("hola-teammate.leads")


def leads_file() -> Path:
    """Read when saving, so the setting in .env counts. A relative path means this folder."""
    p = Path(os.getenv("LEADS_FILE") or "leads.jsonl")
    return p if p.is_absolute() else Path(__file__).parent / p


def _supabase() -> tuple[str, str] | None:
    url, key = os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    return (url.rstrip("/"), key) if url and key else None


async def store_lead(record: dict[str, Any], tries: int = 3) -> bool:
    record = {**record, "updated_at": datetime.now(timezone.utc).isoformat()}
    sb = _supabase()
    if not sb:
        try:
            with leads_file().open("a", encoding="utf-8") as f:
                f.write(json.dumps(record, ensure_ascii=False) + "\n")
                f.flush()
                os.fsync(f.fileno())
            return True
        except OSError as e:
            logger.warning("lead not saved to file: %s", e)
            return False
    url, key = sb
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }
    for attempt in range(tries):
        try:
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=5)) as http:
                async with http.post(f"{url}/rest/v1/hola_leads?on_conflict=call_id",
                                     json=record, headers=headers) as r:
                    if r.status < 300:
                        return True
                    logger.warning("lead save failed: HTTP %s", r.status)
        except Exception as e:
            logger.warning("lead save failed: %s", type(e).__name__)
        await asyncio.sleep(0.5 * (attempt + 1))
    return False
