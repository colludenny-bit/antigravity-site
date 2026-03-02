import asyncio
import sys
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import server


def test_calculate_multi_source_score_is_deterministic():
    symbol = "NAS100"
    vix_data = {"current": 17.8, "change": -1.2, "direction": "falling", "regime": "risk-on"}
    prices = {
        "NAS100": {"price": 21450.0, "change": 0.65},
        "SP500": {"price": 6050.0, "change": 0.42},
        "XAUUSD": {"price": 2650.0, "change": -0.18},
        "EURUSD": {"price": 1.085, "change": 0.11},
    }

    # Clear local cache key so each run starts with identical state.
    server._multi_source_cache.pop(f"{symbol}_prev_score", None)
    baseline = server.calculate_multi_source_score(symbol, vix_data, prices)

    for _ in range(3):
        server._multi_source_cache.pop(f"{symbol}_prev_score", None)
        candidate = server.calculate_multi_source_score(symbol, vix_data, prices)
        assert candidate == baseline


def test_market_fallbacks_are_not_simulated(monkeypatch):
    def _no_data(*args, **kwargs):
        return None

    monkeypatch.setattr(server, "get_yf_ticker_safe", _no_data)
    server._vix_cache["data"] = None
    server._vix_cache["timestamp"] = None
    server._market_cache["data"] = None
    server._market_cache["timestamp"] = None

    vix_payload = asyncio.run(server.get_vix_data())
    assert vix_payload.get("source") == "fallback_static"
    assert vix_payload.get("change") == 0.0

    prices_payload = asyncio.run(server.get_market_prices())
    assert isinstance(prices_payload, dict) and prices_payload
    for row in prices_payload.values():
        assert row.get("source") == "fallback_static"
        assert row.get("change") == 0.0
