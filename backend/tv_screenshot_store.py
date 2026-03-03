from __future__ import annotations

import json
import re
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo


ROOT_DIR = Path(__file__).parent
INDEX_PATH = ROOT_DIR / "data" / "tv_screenshots_index.json"
SCREENSHOTS_DIR = ROOT_DIR / "data_summaries" / "tv_screenshots"
INDEX_PATH.parent.mkdir(parents=True, exist_ok=True)
SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)

ROME_TZ = ZoneInfo("Europe/Rome")
LOCK = threading.Lock()
MAX_ROWS = 1500


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


def _safe_name(raw: str) -> str:
    text = str(raw or "").strip().lower()
    if not text:
        return "snap"
    text = re.sub(r"[^a-z0-9._-]+", "-", text)
    text = text.strip("-.")
    return text or "snap"


def _extension_from_name(name: str) -> str:
    candidate = Path(name or "").suffix.lower().strip()
    if candidate in {".png", ".jpg", ".jpeg", ".webp"}:
        return candidate
    return ".png"


def _load_index() -> Dict[str, Any]:
    if not INDEX_PATH.exists():
        return {"updated_at_utc": None, "rows": []}
    try:
        payload = json.loads(INDEX_PATH.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            return {"updated_at_utc": None, "rows": []}
        rows = payload.get("rows")
        if not isinstance(rows, list):
            payload["rows"] = []
        return payload
    except Exception:
        return {"updated_at_utc": None, "rows": []}


def _write_index(payload: Dict[str, Any]) -> None:
    INDEX_PATH.write_text(json.dumps(payload, ensure_ascii=True, indent=2), encoding="utf-8")


def _rome_day_from_ts(ts_utc_iso: str) -> str:
    try:
        dt = datetime.fromisoformat(str(ts_utc_iso).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(ROME_TZ).date().isoformat()
    except Exception:
        return datetime.now(ROME_TZ).date().isoformat()


def save_screenshot(
    *,
    asset: str,
    content: bytes,
    filename: str,
    source: str = "TV_AUTOMATION",
    note: Optional[str] = None,
    captured_at_utc: Optional[str] = None,
) -> Dict[str, Any]:
    normalized_asset = _normalize_asset(asset)
    if not normalized_asset:
        raise ValueError("asset not recognized")
    if not isinstance(content, (bytes, bytearray)) or len(content) == 0:
        raise ValueError("empty file content")

    ts_utc = str(captured_at_utc or _now_utc_iso())
    rome_day = _rome_day_from_ts(ts_utc)
    ext = _extension_from_name(filename)
    base = _safe_name(Path(filename or "chart").stem)
    ts_compact = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    row_id = f"tv-{normalized_asset.lower()}-{ts_compact}-{uuid.uuid4().hex[:8]}"

    rel_dir = Path("data_summaries") / "tv_screenshots" / normalized_asset / rome_day
    abs_dir = ROOT_DIR / rel_dir
    abs_dir.mkdir(parents=True, exist_ok=True)
    rel_path = rel_dir / f"{base}-{ts_compact}-{uuid.uuid4().hex[:6]}{ext}"
    abs_path = ROOT_DIR / rel_path
    abs_path.write_bytes(bytes(content))

    mime = "image/png"
    if ext in {".jpg", ".jpeg"}:
        mime = "image/jpeg"
    elif ext == ".webp":
        mime = "image/webp"

    row = {
        "id": row_id,
        "asset": normalized_asset,
        "path": str(rel_path),
        "abs_path": str(abs_path),
        "filename": Path(rel_path).name,
        "mime_type": mime,
        "size_bytes": len(content),
        "rome_day": rome_day,
        "captured_at_utc": ts_utc,
        "source": str(source or "TV_AUTOMATION").strip() or "TV_AUTOMATION",
        "note": str(note or "").strip() or None,
    }

    with LOCK:
        idx = _load_index()
        rows = idx.setdefault("rows", [])
        rows.append(row)
        rows.sort(key=lambda x: str(x.get("captured_at_utc", "")))
        idx["rows"] = rows[-MAX_ROWS:]
        idx["updated_at_utc"] = _now_utc_iso()
        _write_index(idx)

    return row


def get_recent(asset: Optional[str] = None, limit: int = 20) -> List[Dict[str, Any]]:
    idx = _load_index()
    rows = idx.get("rows", [])
    if not isinstance(rows, list):
        return []
    normalized = _normalize_asset(asset) if asset else None
    filtered = []
    for row in rows:
        if normalized and str(row.get("asset")) != normalized:
            continue
        filtered.append(row)
    filtered.sort(key=lambda x: str(x.get("captured_at_utc", "")), reverse=True)
    return filtered[: max(1, min(int(limit or 20), 200))]


def get_latest(asset: str) -> Optional[Dict[str, Any]]:
    rows = get_recent(asset=asset, limit=1)
    return rows[0] if rows else None


def get_status() -> Dict[str, Any]:
    idx = _load_index()
    rows = idx.get("rows", [])
    if not isinstance(rows, list):
        rows = []
    counts: Dict[str, int] = {}
    latest: Dict[str, Dict[str, Any]] = {}
    for row in rows:
        asset = str(row.get("asset") or "UNKNOWN")
        counts[asset] = counts.get(asset, 0) + 1
        prev = latest.get(asset)
        if not prev or str(row.get("captured_at_utc", "")) > str(prev.get("captured_at_utc", "")):
            latest[asset] = {
                "captured_at_utc": row.get("captured_at_utc"),
                "rome_day": row.get("rome_day"),
                "path": row.get("path"),
                "source": row.get("source"),
            }
    return {
        "status": "ok",
        "index_path": str(INDEX_PATH),
        "updated_at_utc": idx.get("updated_at_utc"),
        "total_rows": len(rows),
        "assets": {k: {"rows": counts.get(k, 0), "latest": latest.get(k)} for k in sorted(counts.keys())},
    }
