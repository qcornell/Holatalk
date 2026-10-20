"""Checks the iPhone path without the iPhone: plays the phone app against the real Ana.

Run it while start-ana-for-iphone.bat is open. It gets a token from your LiveKit development token
server (LIVEKIT_TOKEN_SERVER_ID in .env), joins a room the way the app does, answers Ana's "hello"
with sample_playbook.json, and waits for her greeting. Costs a few cents.
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import time
import uuid
from pathlib import Path

import aiohttp
from dotenv import load_dotenv
from livekit import rtc

HERE = Path(__file__).parent
load_dotenv(HERE / ".env")
TOKEN_URL = "https://cloud-api.livekit.io/api/v2/sandbox/connection-details"
WAIT_SECONDS = 30


async def main() -> int:
    server_id = os.getenv("LIVEKIT_TOKEN_SERVER_ID", "").strip()
    if not server_id:
        print("Add LIVEKIT_TOKEN_SERVER_ID=... to .env (LiveKit Cloud > Settings > Development token server).")
        return 1
    playbook = json.loads((HERE / "sample_playbook.json").read_text(encoding="utf-8"))
    device = str(uuid.uuid4())
    identity, user_id = f"rep-{device}", f"device-{device}"
    body = {
        "room_name": f"hola-{device[:8]}-check",
        "participant_identity": identity,
        "participant_name": "Check",
        "room_config": {"agents": [{"agent_name": "hola-teammate",
                                    "metadata": json.dumps({"user_id": user_id, "rep_identity": identity})}]},
    }
    t0 = time.monotonic()
    stamp = lambda: f"{time.monotonic() - t0:4.1f}s"  # noqa: E731

    async with aiohttp.ClientSession(trust_env=True) as http:
        async with http.post(TOKEN_URL, json=body, headers={"X-Sandbox-ID": server_id}) as r:
            if r.status != 200:
                print(f"FAIL: the token server said HTTP {r.status}. Is the ID right and the token server on?")
                return 1
            data = await r.json()
    print(f"{stamp()}  1. got a token from the token server")

    room = rtc.Room()
    got: dict[str, asyncio.Event] = {k: asyncio.Event() for k in ("ana", "hello", "greeting")}

    @room.on("participant_connected")
    def _joined(p: rtc.RemoteParticipant) -> None:
        if p.kind == rtc.ParticipantKind.PARTICIPANT_KIND_AGENT:
            print(f"{stamp()}  3. Ana joined the call")
            got["ana"].set()

    @room.on("data_received")
    def _data(packet: rtc.DataPacket) -> None:
        if packet.topic != "hola":
            return
        msg = json.loads(packet.data.decode("utf-8"))
        kind = msg.get("type")
        if kind == "hello" and not got["hello"].is_set():
            print(f"{stamp()}  4. Ana asked for the playbook; sending it")
            got["hello"].set()
            asyncio.ensure_future(room.local_participant.publish_data(
                json.dumps({"type": "playbook", "playbook": playbook, "user_id": user_id}), reliable=True, topic="hola"))
        elif kind == "caption" and msg.get("who") == "hola" and not got["greeting"].is_set():
            print(f"{stamp()}  5. Ana spoke: \"{msg.get('text', '')}\"")
            got["greeting"].set()

    try:
        await asyncio.wait_for(room.connect(data["server_url"], data["participant_token"]), 25)
    except (asyncio.TimeoutError, rtc.ConnectError) as e:
        print(f"FAIL: couldn't join the LiveKit room ({type(e).__name__}). Check the internet connection.")
        return 1
    print(f"{stamp()}  2. joined room {room.name}")
    source = rtc.AudioSource(48000, 1)  # a silent mic, like a phone at a quiet door
    track = rtc.LocalAudioTrack.create_audio_track("mic", source)
    await room.local_participant.publish_track(track, rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_MICROPHONE))

    async def silence() -> None:
        frame = rtc.AudioFrame.create(48000, 1, 480)
        while True:
            await source.capture_frame(frame)

    mic = asyncio.create_task(silence())
    try:
        await asyncio.wait_for(got["greeting"].wait(), WAIT_SECONDS)
        print("\nPASS: the iPhone path works. Ana joins, gets your setup from the phone, and greets.")
        return 0
    except asyncio.TimeoutError:
        if not got["ana"].is_set():
            print("\nFAIL: Ana never joined. Is the start-ana-for-iphone window open and saying 'registered worker'?")
        elif not got["hello"].is_set():
            print("\nFAIL: Ana joined but never asked for the playbook. Send Claude the start-ana-for-iphone window.")
        else:
            print("\nFAIL: Ana got the playbook but didn't speak. Send Claude the start-ana-for-iphone window.")
        return 1
    finally:
        mic.cancel()
        await room.disconnect()


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
