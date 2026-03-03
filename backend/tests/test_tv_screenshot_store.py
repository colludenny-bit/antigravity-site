from __future__ import annotations

from pathlib import Path

from backend import tv_screenshot_store as store


def _set_tmp_paths(tmp_path: Path):
    store.INDEX_PATH = tmp_path / "tv_screenshots_index.json"
    store.SCREENSHOTS_DIR = tmp_path / "tv_screenshots"
    store.ROOT_DIR = tmp_path
    store.SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)


def test_save_and_get_latest(tmp_path):
    _set_tmp_paths(tmp_path)
    row = store.save_screenshot(
        asset="XAUUSD",
        content=b"fake-png",
        filename="xau.png",
        source="TEST",
        note="unit",
        captured_at_utc="2026-03-03T10:00:00+00:00",
    )
    assert row["asset"] == "XAUUSD"
    assert (tmp_path / row["path"]).exists()

    latest = store.get_latest("XAUUSD")
    assert latest is not None
    assert latest["id"] == row["id"]
    assert latest["source"] == "TEST"


def test_feed_filter_by_asset(tmp_path):
    _set_tmp_paths(tmp_path)
    store.save_screenshot(asset="XAUUSD", content=b"1", filename="a.png", source="A")
    store.save_screenshot(asset="NAS100", content=b"2", filename="b.png", source="B")
    rows_xau = store.get_recent(asset="XAUUSD", limit=10)
    rows_nq = store.get_recent(asset="NAS100", limit=10)
    assert len(rows_xau) == 1
    assert rows_xau[0]["asset"] == "XAUUSD"
    assert len(rows_nq) == 1
    assert rows_nq[0]["asset"] == "NAS100"


def test_invalid_asset_raises(tmp_path):
    _set_tmp_paths(tmp_path)
    try:
        store.save_screenshot(asset="UNKNOWN", content=b"x", filename="x.png")
    except ValueError as exc:
        assert "not recognized" in str(exc)
    else:
        raise AssertionError("Expected ValueError")
