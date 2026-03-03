import asyncio
import os

import pytest
from dotenv import load_dotenv

try:
    import google.generativeai as genai
except Exception:  # pragma: no cover - optional dependency at runtime
    genai = None


load_dotenv("backend/.env")


def _resolve_api_key() -> str:
    return (
        os.environ.get("GOOGLE_API_KEY", "").strip()
        or os.environ.get("GEMINI_API_KEY", "").strip()
        or os.environ.get("EMERGENT_LLM_KEY", "").strip()
    )


async def _probe_gemini_async(api_key: str) -> str:
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel("gemini-1.5-flash")
    response = await model.generate_content_async("Reply with one word: ok")
    return str(getattr(response, "text", "")).strip()


def test_api() -> None:
    if genai is None:
        pytest.skip("google-generativeai dependency not installed")

    api_key = _resolve_api_key()
    if not api_key:
        pytest.skip("No API key configured (GOOGLE_API_KEY/GEMINI_API_KEY/EMERGENT_LLM_KEY)")

    text = asyncio.run(_probe_gemini_async(api_key))
    assert isinstance(text, str)
    assert len(text) > 0


if __name__ == "__main__":
    key = _resolve_api_key()
    print(f"API Key present: {bool(key)}")
    if not key:
        print("No API key found. Set GOOGLE_API_KEY, GEMINI_API_KEY, or EMERGENT_LLM_KEY.")
        raise SystemExit(0)

    if genai is None:
        print("google-generativeai module not installed.")
        raise SystemExit(1)

    try:
        answer = asyncio.run(_probe_gemini_async(key))
        print(f"Success! Response: {answer}")
        raise SystemExit(0)
    except Exception as exc:
        print(f"Error: {exc}")
        raise SystemExit(1)
