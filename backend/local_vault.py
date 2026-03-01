"""
local_vault.py — File-based JSON storage for Research data.
Replaces MongoDB dependency so everything works in DEMO_MODE.
Files are persisted in backend/data/ directory.
"""
import os
import json
import logging
import threading
import hashlib
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

logger = logging.getLogger("local_vault")

DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)

_lock = threading.Lock()


def _read(filename: str) -> list:
    """Thread-safe read from a JSON file."""
    filepath = DATA_DIR / filename
    if not filepath.exists():
        return []
    try:
        with _lock:
            with open(filepath, "r") as f:
                return json.load(f)
    except (json.JSONDecodeError, IOError):
        logger.warning(f"Corrupted {filename}, resetting.")
        return []


def _write(filename: str, data: list):
    """Thread-safe write to a JSON file."""
    filepath = DATA_DIR / filename
    with _lock:
        with open(filepath, "w") as f:
            json.dump(data, f, indent=2, default=str)


def _safe_iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_iso(value: str) -> float:
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).timestamp()
    except Exception:
        return 0.0


def _doc_fingerprint(doc: dict) -> str:
    core = {
        "bank": doc.get("bank"),
        "title": doc.get("title"),
        "source_url": doc.get("source_url"),
        "analysis": {
            "bias": (doc.get("analysis") or {}).get("bias"),
            "summary": (doc.get("analysis") or {}).get("summary"),
            "affected_assets": (doc.get("analysis") or {}).get("affected_assets"),
            "bull_score": (doc.get("analysis") or {}).get("bull_score"),
            "bear_score": (doc.get("analysis") or {}).get("bear_score"),
        },
        "text_preview": (doc.get("text_preview") or "")[:800],
    }
    raw = json.dumps(core, ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


# ─── Institutional Vault (scraped reports) ───

def save_report(doc: dict):
    """
    Save report in two layers:
    - vault.json: latest snapshot per bank (fast UI)
    - vault_history.json: immutable chronological archive (new + old)
    """
    docs_latest = _read("vault.json")
    docs_history = _read("vault_history.json")

    # One-time bootstrap: if history file is empty, seed it from current latest vault snapshot.
    if not docs_history and docs_latest:
        seeded = []
        for row in docs_latest:
            item = dict(row or {})
            item.setdefault("upload_timestamp", _safe_iso_now())
            item.setdefault("saved_at", _safe_iso_now())
            item["content_hash"] = item.get("content_hash") or _doc_fingerprint(item)
            item.setdefault(
                "report_id",
                f"rep-bootstrap-{item.get('bank', 'unknown')}-{int(_parse_iso(item.get('upload_timestamp')))}",
            )
            seeded.append(item)
        seeded.sort(key=lambda row: _parse_iso(row.get("upload_timestamp")), reverse=True)
        docs_history = seeded[:10000]
        _write("vault_history.json", docs_history)

    saved_doc = dict(doc or {})
    saved_doc.setdefault("upload_timestamp", _safe_iso_now())
    saved_doc["saved_at"] = _safe_iso_now()
    saved_doc["content_hash"] = _doc_fingerprint(saved_doc)
    saved_doc.setdefault(
        "report_id",
        f"rep-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S%f')}",
    )

    bank = saved_doc.get("bank")

    replaced = False
    for i, existing in enumerate(docs_latest):
        if existing.get("bank") == bank:
            docs_latest[i] = saved_doc
            replaced = True
            break
    if not replaced:
        docs_latest.append(saved_doc)

    docs_latest.sort(key=lambda row: _parse_iso(row.get("upload_timestamp")), reverse=True)
    _write("vault.json", docs_latest)

    is_duplicate_history = any(
        (row.get("bank") == bank and row.get("content_hash") == saved_doc["content_hash"])
        for row in docs_history[:200]
    )
    if not is_duplicate_history:
        docs_history.insert(0, saved_doc)
        if len(docs_history) > 10000:
            docs_history = docs_history[:10000]
        _write("vault_history.json", docs_history)


def get_reports() -> list:
    """Get all institutional reports."""
    return _read("vault.json")


def get_reports_history(limit: int = 500, bank: Optional[str] = None) -> list:
    """Get historical institutional reports (latest-first)."""
    rows = _read("vault_history.json")
    if bank:
        bank_l = bank.strip().lower()
        rows = [r for r in rows if str(r.get("bank", "")).lower() == bank_l]
    rows.sort(key=lambda row: _parse_iso(row.get("upload_timestamp")), reverse=True)
    return rows[: max(1, min(int(limit or 500), 10000))]


# ─── Scraper Status (track last run per source) ───

def save_scraper_status(source_name: str, status: dict):
    """Save the scraping status for a source."""
    statuses = _read("scraper_status.json")
    for i, s in enumerate(statuses):
        if s.get("name") == source_name:
            # Replace row atomically to avoid stale keys (e.g. old "error" after recovery).
            statuses[i] = {"name": source_name, **(status or {})}
            _write("scraper_status.json", statuses)
            return
    statuses.append({"name": source_name, **(status or {})})
    _write("scraper_status.json", statuses)


def get_scraper_statuses() -> list:
    """Get scraping status for all sources."""
    return _read("scraper_status.json")


# ─── Predictions (saved from dashboard for retroactive analysis) ───

def save_prediction(prediction: dict):
    """Save a prediction for later evaluation."""
    preds = _read("predictions.json")
    prediction["id"] = f"pred-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}-{prediction.get('asset','UNK')}"
    prediction["saved_at"] = datetime.now(timezone.utc).isoformat()
    preds.append(prediction)
    # Keep max 500 predictions
    if len(preds) > 500:
        preds = preds[-500:]
    _write("predictions.json", preds)
    return prediction["id"]


def get_predictions(last_hours: int = 48) -> list:
    """Get predictions from the last N hours."""
    preds = _read("predictions.json")
    cutoff = datetime.now(timezone.utc).timestamp() - (last_hours * 3600)
    result = []
    for p in preds:
        try:
            ts = datetime.fromisoformat(p["saved_at"].replace("Z", "+00:00")).timestamp()
            if ts > cutoff:
                result.append(p)
        except (KeyError, ValueError):
            result.append(p)
    return result


def get_unevaluated_predictions() -> list:
    """Get predictions that haven't been evaluated yet."""
    preds = _read("predictions.json")
    return [p for p in preds if p.get("evaluated") is None]


def mark_prediction_evaluated(pred_id: str, hit: bool):
    """Mark a prediction as evaluated."""
    preds = _read("predictions.json")
    for p in preds:
        if p.get("id") == pred_id:
            p["evaluated"] = hit
            p["evaluated_at"] = datetime.now(timezone.utc).isoformat()
            break
    _write("predictions.json", preds)


# ─── Evaluations (accuracy results) ───

def save_evaluation(evaluation: dict):
    """Save an evaluation result."""
    evals = _read("evaluations.json")
    evaluation["timestamp"] = datetime.now(timezone.utc).isoformat()
    evals.append(evaluation)
    if len(evals) > 1000:
        evals = evals[-1000:]
    _write("evaluations.json", evals)


def get_evaluations(last_days: int = 7) -> list:
    """Get evaluation results from the last N days."""
    evals = _read("evaluations.json")
    cutoff = datetime.now(timezone.utc).timestamp() - (last_days * 86400)
    result = []
    for e in evals:
        try:
            ts = datetime.fromisoformat(e["timestamp"].replace("Z", "+00:00")).timestamp()
            if ts > cutoff:
                result.append(e)
        except (KeyError, ValueError):
            result.append(e)
    return result


def compute_accuracy_heatmap(last_days: int = 7) -> dict:
    """
    Compute accuracy heatmap from real evaluation data.
    Returns {hour: {asset: accuracy_pct}} for each hour-bucket.
    """
    evals = get_evaluations(last_days)
    if not evals:
        return {"status": "collecting", "message": "Raccolta dati in corso. Prima valutazione disponibile dopo 24h di operatività.", "data": []}

    # Group by hour bucket and asset
    buckets = {}   # {hour_str: {asset: [hit_bool, ...]}}
    hour_labels = ["08:00", "12:00", "15:30", "18:00"]

    for ev in evals:
        try:
            ts = datetime.fromisoformat(ev.get("prediction_time", ev["timestamp"]).replace("Z", "+00:00"))
            hour = ts.hour
            # Bucket into closest hour label
            if hour < 10:
                bucket = "08:00"
            elif hour < 14:
                bucket = "12:00"
            elif hour < 17:
                bucket = "15:30"
            else:
                bucket = "18:00"

            asset = ev.get("asset", "UNK")
            if bucket not in buckets:
                buckets[bucket] = {}
            if asset not in buckets[bucket]:
                buckets[bucket][asset] = []
            buckets[bucket][asset].append(ev.get("hit", False))
        except (KeyError, ValueError):
            continue

    # Compute percentages
    data = []
    for hour in hour_labels:
        row = {"hour": hour, "assets": {}}
        for asset in ["NAS100", "SP500", "XAUUSD", "EURUSD"]:
            hits = buckets.get(hour, {}).get(asset, [])
            if hits:
                row["assets"][asset] = round((sum(hits) / len(hits)) * 100)
            else:
                row["assets"][asset] = None  # No data yet
        data.append(row)

    return {"status": "active", "data": data}


def compute_stats(last_days: int = 7) -> dict:
    """Compute real win rate and stats from evaluations."""
    evals = get_evaluations(last_days)
    if not evals:
        return {
            "win_rate": None,
            "total_predictions": 0,
            "hits": 0,
            "misses": 0,
            "status": "collecting",
            "message": "Dati insufficienti. Il sistema raccoglie predizioni — prima analisi dopo 24h."
        }

    hits = sum(1 for e in evals if e.get("hit"))
    total = len(evals)
    wr = round((hits / total) * 100, 1) if total > 0 else 0

    # Per-asset breakdown
    asset_stats = {}
    for e in evals:
        a = e.get("asset", "UNK")
        if a not in asset_stats:
            asset_stats[a] = {"hits": 0, "total": 0}
        asset_stats[a]["total"] += 1
        if e.get("hit"):
            asset_stats[a]["hits"] += 1

    for a in asset_stats:
        s = asset_stats[a]
        s["win_rate"] = round((s["hits"] / s["total"]) * 100, 1) if s["total"] > 0 else 0

    return {
        "win_rate": wr,
        "total_predictions": total,
        "hits": hits,
        "misses": total - hits,
        "status": "active",
        "asset_breakdown": asset_stats,
        "period_days": last_days
    }
