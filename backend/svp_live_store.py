from __future__ import annotations

import json
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo


ROOT_DIR = Path(__file__).parent
SVP_STORE_PATH = ROOT_DIR / "data" / "svp_live_feed.json"
SVP_STORE_PATH.parent.mkdir(parents=True, exist_ok=True)

ROME_TZ = ZoneInfo("Europe/Rome")
_LOCK = threading.Lock()
_MAX_ROWS_PER_ASSET = 220


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        if isinstance(value, str):
            value = value.replace(",", "").strip()
        out = float(value)
        return out if out == out else default
    except Exception:
        return default


def _now_utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalize_asset(raw: Any) -> Optional[str]:
    text = str(raw or "").strip().upper()
    if not text:
        return None
    normalized = (
        text.replace("/", "")
        .replace("-", "")
        .replace("_", "")
        .replace(" ", "")
        .replace("!", "")
    )

    mapping = {
        "NAS100": "NAS100",
        "US100": "NAS100",
        "NQ": "NAS100",
        "NQ1": "NAS100",
        "NQF": "NAS100",
        "NQ=F": "NAS100",
        "SP500": "SP500",
        "US500": "SP500",
        "SPX": "SP500",
        "ES": "SP500",
        "ES1": "SP500",
        "ESF": "SP500",
        "ES=F": "SP500",
        "XAUUSD": "XAUUSD",
        "XAU": "XAUUSD",
        "GOLD": "XAUUSD",
        "GC": "XAUUSD",
        "GC1": "XAUUSD",
        "GCF": "XAUUSD",
        "GC=F": "XAUUSD",
        "EURUSD": "EURUSD",
        "EURUSDX": "EURUSD",
        "EURUSD=X": "EURUSD",
    }
    return mapping.get(normalized)


def _parse_rome_day(raw_day: Any, raw_timestamp: Any) -> str:
    text = str(raw_day or "").strip()
    if len(text) == 10 and text[4] == "-" and text[7] == "-":
        return text

    ts_text = str(raw_timestamp or "").strip()
    if ts_text:
        try:
            ts = datetime.fromisoformat(ts_text.replace("Z", "+00:00"))
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            return ts.astimezone(ROME_TZ).date().isoformat()
        except Exception:
            pass
    return datetime.now(ROME_TZ).date().isoformat()


def _load_store() -> Dict[str, Any]:
    if not SVP_STORE_PATH.exists():
        return {"updated_at_utc": None, "assets": {}}
    try:
        payload = json.loads(SVP_STORE_PATH.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            return {"updated_at_utc": None, "assets": {}}
        assets = payload.get("assets")
        if not isinstance(assets, dict):
            payload["assets"] = {}
        return payload
    except Exception:
        return {"updated_at_utc": None, "assets": {}}


def _write_store(store: Dict[str, Any]) -> None:
    SVP_STORE_PATH.write_text(json.dumps(store, ensure_ascii=True, indent=2), encoding="utf-8")


def _to_value_record(payload: Dict[str, Any]) -> Dict[str, Any]:
    va_high = _safe_float(payload.get("va_high", payload.get("vah")), 0.0)
    va_low = _safe_float(payload.get("va_low", payload.get("val")), 0.0)
    poc = _safe_float(payload.get("poc", payload.get("vpoc")), 0.0)

    if va_high <= 0.0 or va_low <= 0.0:
        raise ValueError("va_low/va_high are required and must be > 0")
    if va_high < va_low:
        va_low, va_high = va_high, va_low
    if poc <= 0.0:
        poc = (va_low + va_high) / 2.0

    va_mid = (va_low + va_high) / 2.0
    va_range = max(va_high - va_low, 0.0)
    return {
        "va_low": va_low,
        "va_high": va_high,
        "va_mid": va_mid,
        "poc": poc,
        "range": va_range,
    }


def ingest_live_snapshot(payload: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError("payload must be a JSON object")

    asset = _normalize_asset(payload.get("asset") or payload.get("symbol") or payload.get("ticker"))
    if not asset:
        raise ValueError("asset/symbol not recognized")

    value = _to_value_record(payload)
    captured_at_utc = _now_utc_iso()
    rome_day = _parse_rome_day(payload.get("rome_day"), payload.get("timestamp_utc") or payload.get("timestamp"))

    source = str(payload.get("source") or "TRADINGVIEW_WEBHOOK").strip() or "TRADINGVIEW_WEBHOOK"
    record = {
        "asset": asset,
        "rome_day": rome_day,
        "va_low": value["va_low"],
        "va_high": value["va_high"],
        "va_mid": value["va_mid"],
        "poc": value["poc"],
        "range": value["range"],
        "session_name": str(payload.get("session_name") or payload.get("session") or "").strip() or None,
        "resolution": str(payload.get("resolution") or payload.get("timeframe") or "").strip() or None,
        "is_closed": bool(payload.get("is_closed", False)),
        "source": source,
        "timestamp_utc": str(payload.get("timestamp_utc") or payload.get("timestamp") or captured_at_utc),
        "captured_at_utc": captured_at_utc,
    }

    with _LOCK:
        store = _load_store()
        assets = store.setdefault("assets", {})
        rows = assets.setdefault(asset, [])
        if not isinstance(rows, list):
            rows = []
            assets[asset] = rows

        rows = [r for r in rows if str(r.get("rome_day")) != rome_day]
        rows.append(record)
        rows.sort(key=lambda r: str(r.get("rome_day")))
        assets[asset] = rows[-_MAX_ROWS_PER_ASSET:]
        store["updated_at_utc"] = captured_at_utc
        _write_store(store)

    return record


def _to_value_block(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "va_low": _safe_float(row.get("va_low"), 0.0),
        "va_high": _safe_float(row.get("va_high"), 0.0),
        "va_mid": _safe_float(row.get("va_mid"), 0.0),
        "poc": _safe_float(row.get("poc"), 0.0),
        "range": _safe_float(row.get("range"), 0.0),
    }


def get_live_svp_pair(asset: str, target_rome_day: Optional[str] = None, strict_target: bool = False) -> Optional[Dict[str, Any]]:
    normalized = _normalize_asset(asset)
    if not normalized:
        return None
    store = _load_store()
    rows = store.get("assets", {}).get(normalized, [])
    if not isinstance(rows, list) or not rows:
        return None

    rows = sorted(rows, key=lambda r: str(r.get("rome_day")))
    day_to_idx: Dict[str, int] = {}
    for idx, row in enumerate(rows):
        day = str(row.get("rome_day", ""))
        if day:
            day_to_idx[day] = idx

    if target_rome_day:
        idx = day_to_idx.get(str(target_rome_day))
        if idx is None and strict_target:
            return None
    else:
        idx = len(rows) - 1

    if idx is None:
        idx = len(rows) - 1
    if idx < 0 or idx >= len(rows):
        return None

    today_row = rows[idx]
    prev_row = rows[idx - 1] if idx > 0 else None

    return {
        "asset": normalized,
        "target_day": str(today_row.get("rome_day")),
        "today": _to_value_block(today_row),
        "prev": _to_value_block(prev_row) if isinstance(prev_row, dict) else None,
        "source": str(today_row.get("source") or "TRADINGVIEW_WEBHOOK"),
        "last_update_utc": str(today_row.get("captured_at_utc") or today_row.get("timestamp_utc") or ""),
        "record": today_row,
    }


def get_live_svp_status() -> Dict[str, Any]:
    store = _load_store()
    assets = store.get("assets", {})
    out_assets: Dict[str, Any] = {}
    if isinstance(assets, dict):
        for asset, rows in assets.items():
            if not isinstance(rows, list) or not rows:
                out_assets[asset] = {"rows": 0, "latest": None}
                continue
            latest = sorted(rows, key=lambda r: str(r.get("rome_day")))[-1]
            out_assets[asset] = {
                "rows": len(rows),
                "latest": {
                    "rome_day": latest.get("rome_day"),
                    "va_low": latest.get("va_low"),
                    "va_high": latest.get("va_high"),
                    "poc": latest.get("poc"),
                    "source": latest.get("source"),
                    "captured_at_utc": latest.get("captured_at_utc"),
                    "is_closed": bool(latest.get("is_closed", False)),
                },
            }
    return {
        "status": "ok",
        "path": str(SVP_STORE_PATH),
        "updated_at_utc": store.get("updated_at_utc"),
        "assets": out_assets,
    }
