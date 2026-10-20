"""What each call actually costs, from the token counts OpenAI reports back.

Prices are OpenAI's list prices, checked Oct 20, 2026 on developers.openai.com/api/docs/pricing
(gpt-4o-mini wasn't on that page; its price here is its older list price). Update them here if
OpenAI changes them. A model with no price here is counted as unknown, never guessed.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

# USD per 1M tokens
REALTIME_PRICES = {
    "gpt-realtime-2.1": {"audio_in": 32.00, "audio_cached": 0.40, "audio_out": 64.00,
                         "text_in": 4.00, "text_cached": 0.40, "text_out": 24.00},
}
# (input, cached input, output) USD per 1M tokens
CHAT_PRICES = {
    "gpt-5.6-luna": (0.10, 0.01, 0.50),
    "gpt-4o-mini": (0.15, 0.075, 0.60),
}
# USD per minute of audio
TRANSCRIBE_PER_MIN = {"gpt-transcribe": 0.0045, "gpt-live-transcribe": 0.017}
LIVE_PER_MIN = {"gpt-live-1": 0.05}


def _get(obj: Any, name: str, default: Any = 0) -> Any:
    if obj is None:
        return default
    if isinstance(obj, dict):
        return obj.get(name, default)
    return getattr(obj, name, default)


@dataclass
class CostMeter:
    voice_model: str
    transcribe_model: str = ""
    tokens: dict[str, int] = field(default_factory=lambda: {k: 0 for k in
                                   ("audio_in", "audio_cached", "audio_out", "text_in", "text_cached", "text_out")})
    chat_usd: dict[str, float] = field(default_factory=dict)  # "price checks", "captions"
    unknown: set[str] = field(default_factory=set)

    def add_realtime(self, m: Any) -> None:
        """One RealtimeModelMetrics from LiveKit (one response from the voice model)."""
        inp, out = _get(m, "input_token_details", None), _get(m, "output_token_details", None)
        cached_total = _get(inp, "cached_tokens")
        details = _get(inp, "cached_tokens_details", None)
        cached_audio = _get(details, "audio_tokens") if details is not None else 0
        cached_text = _get(details, "text_tokens") if details is not None else cached_total
        self.tokens["audio_cached"] += cached_audio
        self.tokens["text_cached"] += cached_text
        self.tokens["audio_in"] += max(0, _get(inp, "audio_tokens") - cached_audio)
        self.tokens["text_in"] += max(0, _get(inp, "text_tokens") - cached_text)
        self.tokens["audio_out"] += _get(out, "audio_tokens")
        self.tokens["text_out"] += _get(out, "text_tokens")

    def add_chat(self, label: str, model: str, usage: Any) -> None:
        """A chat-completions usage object, from the offer judge or the captions."""
        price = CHAT_PRICES.get(model)
        if price is None:
            self.unknown.add(model)
            return
        prompt = _get(usage, "prompt_tokens")
        cached = _get(_get(usage, "prompt_tokens_details", None), "cached_tokens")
        completion = _get(usage, "completion_tokens")
        usd = ((prompt - cached) * price[0] + cached * price[1] + completion * price[2]) / 1e6
        self.chat_usd[label] = self.chat_usd.get(label, 0.0) + usd

    def breakdown(self, seconds: float) -> dict[str, float | None]:
        minutes = max(seconds, 1) / 60
        parts: dict[str, float | None] = {}
        if self.voice_model in LIVE_PER_MIN:
            parts["voice"] = LIVE_PER_MIN[self.voice_model] * minutes  # plus its backend model, not counted here
        elif self.voice_model in REALTIME_PRICES:
            p = REALTIME_PRICES[self.voice_model]
            parts["voice"] = sum(self.tokens[k] * p[k] for k in p) / 1e6
        else:
            parts["voice"] = None
            self.unknown.add(self.voice_model)
        if self.transcribe_model:
            rate = TRANSCRIBE_PER_MIN.get(self.transcribe_model)
            parts["transcription"] = rate * minutes if rate is not None else None
        parts.update(self.chat_usd)
        return parts

    def summary(self, seconds: float) -> str:
        parts = self.breakdown(seconds)
        known = sum(v for v in parts.values() if v is not None)
        minutes = max(seconds, 1) / 60
        each = ", ".join(f"{k} ${v:.3f}" if v is not None else f"{k} price unknown" for k, v in parts.items())
        return f"{minutes:.1f} min, ${known:.2f} total, ${known / minutes:.3f} a minute ({each})"
