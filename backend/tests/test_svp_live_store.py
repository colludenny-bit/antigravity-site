from __future__ import annotations

import json
from pathlib import Path

from backend import svp_live_store as store


def _set_tmp_store(tmp_path: Path):
    store.SVP_STORE_PATH = tmp_path / "svp_live_feed.json"


def test_ingest_and_pair_for_target_day(tmp_path):
    _set_tmp_store(tmp_path)

    row_1 = store.ingest_live_snapshot(
        {
            "asset": "XAUUSD",
            "va_low": 5200.0,
            "va_high": 5250.0,
            "poc": 5228.0,
            "rome_day": "2026-03-02",
            "source": "TV",
        }
    )
    row_2 = store.ingest_live_snapshot(
        {
            "symbol": "GOLD",
            "val": 5260.0,
            "vah": 5310.0,
            "vpoc": 5289.0,
            "rome_day": "2026-03-03",
            "source": "TV",
        }
    )

    assert row_1["asset"] == "XAUUSD"
    assert row_2["asset"] == "XAUUSD"
    assert store.SVP_STORE_PATH.exists()

    payload = json.loads(store.SVP_STORE_PATH.read_text(encoding="utf-8"))
    assert "XAUUSD" in payload.get("assets", {})

    pair = store.get_live_svp_pair("XAUUSD", target_rome_day="2026-03-03", strict_target=True)
    assert pair is not None
    assert pair["target_day"] == "2026-03-03"
    assert pair["today"]["va_low"] == 5260.0
    assert pair["today"]["va_high"] == 5310.0
    assert pair["prev"]["va_low"] == 5200.0


def test_strict_target_requires_day(tmp_path):
    _set_tmp_store(tmp_path)

    store.ingest_live_snapshot(
        {
            "asset": "NAS100",
            "va_low": 24800.0,
            "va_high": 24980.0,
            "poc": 24910.0,
            "rome_day": "2026-03-01",
        }
    )

    strict_missing = store.get_live_svp_pair("NAS100", target_rome_day="2026-03-03", strict_target=True)
    relaxed = store.get_live_svp_pair("NAS100", target_rome_day="2026-03-03", strict_target=False)
    assert strict_missing is None
    assert relaxed is not None
    assert relaxed["target_day"] == "2026-03-01"


def test_unknown_symbol_rejected(tmp_path):
    _set_tmp_store(tmp_path)
    try:
        store.ingest_live_snapshot({"asset": "UNKNOWN", "va_low": 1, "va_high": 2})
    except ValueError as exc:
        assert "not recognized" in str(exc)
    else:
        raise AssertionError("Expected ValueError for unknown symbol")
