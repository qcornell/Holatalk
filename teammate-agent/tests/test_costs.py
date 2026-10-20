import sys
from pathlib import Path
from types import SimpleNamespace as NS

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from costs import CostMeter  # noqa: E402


def realtime(audio_in, cached_audio, text_in, cached_text, audio_out, text_out):
    return NS(input_token_details=NS(audio_tokens=audio_in, text_tokens=text_in,
                                     cached_tokens=cached_audio + cached_text,
                                     cached_tokens_details=NS(audio_tokens=cached_audio, text_tokens=cached_text)),
              output_token_details=NS(audio_tokens=audio_out, text_tokens=text_out))


def test_voice_cost_uses_cached_and_uncached_prices():
    m = CostMeter(voice_model="gpt-realtime-2.1", transcribe_model="gpt-transcribe")
    # 1M audio in (half cached), 1M text in (all cached), 1M audio out, 1M text out
    m.add_realtime(realtime(1_000_000, 500_000, 1_000_000, 1_000_000, 1_000_000, 1_000_000))
    parts = m.breakdown(seconds=60)
    assert round(parts["voice"], 2) == round(0.5 * 32 + 0.5 * 0.40 + 1 * 0.40 + 64 + 24, 2)
    assert round(parts["transcription"], 4) == 0.0045


def test_judge_and_caption_costs_and_unknown_models():
    m = CostMeter(voice_model="gpt-realtime-2.1")
    usage = NS(prompt_tokens=2000, completion_tokens=100, prompt_tokens_details=NS(cached_tokens=1000))
    m.add_chat("price checks", "gpt-5.6-luna", usage)
    m.add_chat("captions", "some-new-model", usage)
    parts = m.breakdown(seconds=120)
    assert abs(parts["price checks"] - (1000 * 0.10 + 1000 * 0.01 + 100 * 0.50) / 1e6) < 1e-12
    assert "captions" not in parts and "some-new-model" in m.unknown
    assert "a minute" in m.summary(seconds=120)


def test_gpt_live_is_per_minute():
    m = CostMeter(voice_model="gpt-live-1")
    assert m.breakdown(seconds=120)["voice"] == 0.10
