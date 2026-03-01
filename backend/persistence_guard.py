"""
persistence_guard.py

Append-only data persistence guard:
- local JSONL archive for all critical events
- optional mirror to Hetzner-mounted directory
- retry queue for transient mirror failures
- data lake maintenance (gzip rotation + retention)
"""
from __future__ import annotations

import json
import os
import threading
import gzip
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict


BASE_DIR = Path(__file__).parent
DATA_LAKE_DIR = BASE_DIR / "data_lake"
DATA_LAKE_DIR.mkdir(exist_ok=True)

MIRROR_RETRY_QUEUE = DATA_LAKE_DIR / "_mirror_retry_queue.jsonl"
DEFAULT_COMPRESS_AFTER_DAYS = int(os.environ.get("DATA_LAKE_COMPRESS_AFTER_DAYS", "1"))
DEFAULT_RETENTION_DAYS = int(os.environ.get("DATA_LAKE_RETENTION_DAYS", "120"))

_LOCK = threading.Lock()


def _safe_json(payload: Any) -> Dict[str, Any]:
    if isinstance(payload, dict):
        return payload
    return {"value": payload}


def _stream_file(base_dir: Path, stream: str, dt_utc: datetime) -> Path:
    day = dt_utc.strftime("%Y-%m-%d")
    stream_dir = base_dir / stream
    stream_dir.mkdir(parents=True, exist_ok=True)
    return stream_dir / f"{day}.jsonl"


def _append_jsonl(path: Path, row: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    line = json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n"
    with path.open("a", encoding="utf-8") as f:
        f.write(line)
        f.flush()
        os.fsync(f.fileno())


def _mirror_dir() -> Path | None:
    mirror_dir_env = os.environ.get("HETZNER_ARCHIVE_PATH", "").strip()
    if not mirror_dir_env:
        return None
    return Path(mirror_dir_env)


def _queue_mirror_retry(envelope: Dict[str, Any], stream: str) -> None:
    row = {
        "queued_at_utc": datetime.now(timezone.utc).isoformat(),
        "stream": stream,
        "envelope": envelope,
    }
    _append_jsonl(MIRROR_RETRY_QUEUE, row)


def archive_event(stream: str, payload: Any, metadata: Dict[str, Any] | None = None) -> Dict[str, Any]:
    """
    Persist event to local data lake and optional mirror path.
    """
    now_utc = datetime.now(timezone.utc)
    safe_stream = "".join(ch for ch in str(stream or "generic").lower() if ch.isalnum() or ch in ("_", "-"))
    safe_stream = safe_stream or "generic"

    envelope = {
        "ts_utc": now_utc.isoformat(),
        "stream": safe_stream,
        "payload": _safe_json(payload),
    }
    if metadata:
        envelope["meta"] = _safe_json(metadata)

    local_path = _stream_file(DATA_LAKE_DIR, safe_stream, now_utc)
    mirror_path = None
    mirror = _mirror_dir()
    mirror_retry_queued = False

    with _LOCK:
        _append_jsonl(local_path, envelope)
        if mirror:
            try:
                mirror_path = _stream_file(mirror, safe_stream, now_utc)
                _append_jsonl(mirror_path, envelope)
            except Exception:
                mirror_path = None
                mirror_retry_queued = True
                _queue_mirror_retry(envelope, safe_stream)

    return {
        "status": "ok",
        "stream": safe_stream,
        "local_file": str(local_path),
        "mirror_file": str(mirror_path) if mirror_path else None,
        "mirror_retry_queued": mirror_retry_queued,
        "ts_utc": envelope["ts_utc"],
    }


def _compress_file(path: Path) -> bool:
    gz_path = path.with_suffix(path.suffix + ".gz")
    if gz_path.exists():
        return False
    with path.open("rb") as f_in, gzip.open(gz_path, "wb", compresslevel=6) as f_out:
        shutil.copyfileobj(f_in, f_out)
    path.unlink(missing_ok=True)
    return True


def _date_from_filename(path: Path) -> datetime | None:
    try:
        # expects YYYY-MM-DD(.jsonl|.jsonl.gz)
        day = path.name.split(".")[0]
        return datetime.strptime(day, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except Exception:
        return None


def flush_mirror_retry_queue(max_rows: int = 2000) -> Dict[str, Any]:
    """
    Replays queued mirror writes when Hetzner path becomes available.
    """
    mirror = _mirror_dir()
    if not MIRROR_RETRY_QUEUE.exists():
        return {"status": "ok", "queued": 0, "replayed": 0, "remaining": 0, "mirror_dir": str(mirror) if mirror else None}
    if mirror is None:
        queued_rows = 0
        with MIRROR_RETRY_QUEUE.open("r", encoding="utf-8") as f:
            queued_rows = sum(1 for _ in f)
        return {"status": "skipped", "reason": "mirror_not_configured", "queued": queued_rows, "replayed": 0, "remaining": queued_rows}

    replayed = 0
    remaining_rows = []
    queued_rows = 0

    with _LOCK:
        with MIRROR_RETRY_QUEUE.open("r", encoding="utf-8") as f:
            for idx, line in enumerate(f):
                if idx >= max_rows:
                    remaining_rows.append(line)
                    continue
                queued_rows += 1
                try:
                    row = json.loads(line)
                    stream = str(row.get("stream", "generic"))
                    envelope = row.get("envelope", {})
                    ts = envelope.get("ts_utc")
                    dt_utc = datetime.fromisoformat(ts) if ts else datetime.now(timezone.utc)
                    path = _stream_file(mirror, stream, dt_utc)
                    _append_jsonl(path, envelope)
                    replayed += 1
                except Exception:
                    remaining_rows.append(line)

        if remaining_rows:
            with MIRROR_RETRY_QUEUE.open("w", encoding="utf-8") as f:
                for line in remaining_rows:
                    f.write(line)
        else:
            MIRROR_RETRY_QUEUE.unlink(missing_ok=True)

    return {
        "status": "ok",
        "mirror_dir": str(mirror),
        "queued": queued_rows,
        "replayed": replayed,
        "remaining": len(remaining_rows),
    }


def run_maintenance(
    compress_after_days: int = DEFAULT_COMPRESS_AFTER_DAYS,
    retention_days: int = DEFAULT_RETENTION_DAYS,
) -> Dict[str, Any]:
    """
    Maintenance task:
    - gzip old jsonl files
    - remove old gzip archives beyond retention
    - flush mirror retry queue
    """
    now = datetime.now(timezone.utc)
    compressed = 0
    deleted = 0
    scanned = 0

    with _LOCK:
        for stream_dir in DATA_LAKE_DIR.iterdir():
            if not stream_dir.is_dir():
                continue
            for path in stream_dir.iterdir():
                if not path.is_file():
                    continue
                if path.name.startswith("."):
                    continue
                scanned += 1
                dt = _date_from_filename(path)
                if dt is None:
                    continue
                age_days = (now - dt).days
                if path.suffix == ".jsonl" and age_days >= max(0, compress_after_days):
                    try:
                        if _compress_file(path):
                            compressed += 1
                    except Exception:
                        continue
                elif path.suffix == ".gz" and age_days >= max(1, retention_days):
                    try:
                        path.unlink(missing_ok=True)
                        deleted += 1
                    except Exception:
                        continue

    mirror_retry = flush_mirror_retry_queue()
    return {
        "status": "ok",
        "scanned_files": scanned,
        "compressed_files": compressed,
        "deleted_files": deleted,
        "compress_after_days": compress_after_days,
        "retention_days": retention_days,
        "mirror_retry": mirror_retry,
    }


def count_stream_rows(stream: str) -> int:
    safe_stream = "".join(ch for ch in str(stream or "generic").lower() if ch.isalnum() or ch in ("_", "-"))
    stream_dir = DATA_LAKE_DIR / (safe_stream or "generic")
    if not stream_dir.exists():
        return 0
    total = 0
    for path in stream_dir.glob("*.jsonl"):
        try:
            with path.open("r", encoding="utf-8") as f:
                total += sum(1 for _ in f)
        except Exception:
            continue
    return total


def lake_status() -> Dict[str, Any]:
    streams = {}
    if DATA_LAKE_DIR.exists():
        for child in DATA_LAKE_DIR.iterdir():
            if child.is_dir():
                streams[child.name] = count_stream_rows(child.name)
    mirror = _mirror_dir()
    retry_queue_rows = 0
    if MIRROR_RETRY_QUEUE.exists():
        try:
            with MIRROR_RETRY_QUEUE.open("r", encoding="utf-8") as f:
                retry_queue_rows = sum(1 for _ in f)
        except Exception:
            retry_queue_rows = -1
    return {
        "data_lake_dir": str(DATA_LAKE_DIR),
        "mirror_dir": str(mirror) if mirror else None,
        "mirror_configured": bool(mirror),
        "mirror_retry_queue_rows": retry_queue_rows,
        "compress_after_days": DEFAULT_COMPRESS_AFTER_DAYS,
        "retention_days": DEFAULT_RETENTION_DAYS,
        "streams": streams,
    }
