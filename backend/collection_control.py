"""
collection_control.py

Centralized control for automated data collection.
- manual pause/resume
- market-hours automatic pause
- persistent state on disk
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, Tuple
from zoneinfo import ZoneInfo


BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)
STATE_FILE = DATA_DIR / "collection_control.json"

ROME_TZ = ZoneInfo("Europe/Rome")
SUNDAY_OPEN_MINUTES = 5          # 00:05
FRIDAY_CLOSE_HOUR = 23           # 23:00
FRIDAY_CLOSE_MINUTES = FRIDAY_CLOSE_HOUR * 60

DEFAULT_STATE = {
    "manual_pause": False,
    "manual_reason": "",
    "auto_pause_market_closed": True,
    "updated_at": datetime.now(timezone.utc).isoformat(),
}

_STATE = None


def _read_state() -> Dict:
    if not STATE_FILE.exists():
        return dict(DEFAULT_STATE)
    try:
        payload = json.loads(STATE_FILE.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            return dict(DEFAULT_STATE)
        state = dict(DEFAULT_STATE)
        state.update(payload)
        return state
    except Exception:
        return dict(DEFAULT_STATE)


def _write_state(state: Dict) -> None:
    state = dict(DEFAULT_STATE) | dict(state or {})
    state["updated_at"] = datetime.now(timezone.utc).isoformat()
    STATE_FILE.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def _state() -> Dict:
    global _STATE
    if _STATE is None:
        _STATE = _read_state()
    return _STATE


def _market_open_now(now_utc: datetime | None = None) -> bool:
    """
    Collection window:
    - Open from Sunday 00:05 Europe/Rome
    - Close on Friday at 23:00 Europe/Rome
    """
    now_utc = now_utc or datetime.now(timezone.utc)
    dt_rome = now_utc.astimezone(ROME_TZ)
    wd = dt_rome.weekday()  # Mon=0 .. Sun=6
    mins = dt_rome.hour * 60 + dt_rome.minute

    if wd <= 3:  # Mon..Thu
        return True
    if wd == 4:  # Fri
        return mins < FRIDAY_CLOSE_MINUTES
    if wd == 5:  # Sat
        return False
    # Sun
    return mins >= SUNDAY_OPEN_MINUTES


def _next_open_rome(now_utc: datetime | None = None) -> datetime:
    now_utc = now_utc or datetime.now(timezone.utc)
    dt_rome = now_utc.astimezone(ROME_TZ)
    day_start = dt_rome.replace(hour=0, minute=0, second=0, microsecond=0)
    if _market_open_now(now_utc):
        return dt_rome

    wd = dt_rome.weekday()  # Mon=0 .. Sun=6
    mins = dt_rome.hour * 60 + dt_rome.minute

    if wd == 5:  # Saturday -> Sunday 00:05
        return day_start + timedelta(days=1, minutes=SUNDAY_OPEN_MINUTES)
    if wd == 6 and mins < SUNDAY_OPEN_MINUTES:  # Sunday before open
        return day_start + timedelta(minutes=SUNDAY_OPEN_MINUTES)
    # Friday after close (or any safety fallback): next Sunday 00:05
    days_to_sunday = (6 - wd) % 7
    if days_to_sunday == 0:
        days_to_sunday = 7
    return day_start + timedelta(days=days_to_sunday, minutes=SUNDAY_OPEN_MINUTES)


def set_manual_pause(paused: bool, reason: str = "") -> Dict:
    state = _state()
    state["manual_pause"] = bool(paused)
    state["manual_reason"] = str(reason or "").strip()[:300]
    _write_state(state)
    return status_payload()


def set_auto_pause_market_closed(enabled: bool) -> Dict:
    state = _state()
    state["auto_pause_market_closed"] = bool(enabled)
    _write_state(state)
    return status_payload()


def can_collect_now() -> Tuple[bool, str]:
    state = _state()
    if state.get("manual_pause"):
        return False, "manual_pause"
    if state.get("auto_pause_market_closed", True) and not _market_open_now():
        return False, "market_closed"
    return True, "active"


def status_payload() -> Dict:
    state = _state()
    now_utc = datetime.now(timezone.utc)
    market_open = _market_open_now(now_utc)
    allowed, reason = can_collect_now()
    next_open_rome = _next_open_rome(now_utc)

    return {
        "collection_allowed": allowed,
        "reason": reason,
        "manual_pause": bool(state.get("manual_pause", False)),
        "manual_reason": state.get("manual_reason", ""),
        "auto_pause_market_closed": bool(state.get("auto_pause_market_closed", True)),
        "market_window_open": market_open,
        "timezone": "Europe/Rome",
        "now_rome": now_utc.astimezone(ROME_TZ).isoformat(),
        "next_open_rome": next_open_rome.isoformat(),
        "updated_at": state.get("updated_at"),
    }
