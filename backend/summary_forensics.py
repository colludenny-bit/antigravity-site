"""
summary_forensics.py

Lightweight 5m summary capture + midnight (Europe/Rome) analysis.

Flow:
1) Every 5 minutes save a "summary snapshot" (signals + latest 5m market candle).
2) At midnight Europe/Rome analyze all snapshots from the previous Rome day.
   This guarantees the summary is emitted first and evaluated only after price action happens.
"""
import asyncio
import hashlib
import json
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, List, Optional
from zoneinfo import ZoneInfo

import yfinance as yf

logger = logging.getLogger("summary_forensics")

DATA_DIR = Path(__file__).parent / "data_summaries"
SNAPSHOTS_FILE = DATA_DIR / "summaries_5m.json"
REPORTS_DIR = DATA_DIR / "daily_reports"

ROME_TZ = ZoneInfo("Europe/Rome")
ASSET_TO_TICKER = {
    "NAS100": "NQ=F",
    "SP500": "ES=F",
    "XAUUSD": "GC=F",
    "EURUSD": "EURUSD=X",
}


def _ensure_paths() -> None:
    DATA_DIR.mkdir(exist_ok=True)
    REPORTS_DIR.mkdir(exist_ok=True)
    if not SNAPSHOTS_FILE.exists():
        SNAPSHOTS_FILE.write_text("[]", encoding="utf-8")


def _read_json_list(path: Path) -> List[Dict]:
    if not path.exists():
        return []
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        logger.warning("Corrupted JSON file %s, resetting.", path)
        return []


def _write_json_list(path: Path, payload: List[Dict]) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _to_utc_iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


def _safe_float(value) -> Optional[float]:
    try:
        if value is None:
            return None
        if hasattr(value, "iloc"):
            return float(value.iloc[0])
        return float(value)
    except Exception:
        return None


def _latest_5m_candle(ticker: str) -> Dict:
    # Small fetch window keeps runtime light.
    df = yf.download(tickers=ticker, period="2d", interval="5m", progress=False, auto_adjust=False)
    if df is None or df.empty:
        return {}
    if df.index.tz is None:
        df.index = df.index.tz_localize("UTC")
    else:
        df.index = df.index.tz_convert("UTC")
    last = df.iloc[-1]
    ts = df.index[-1].to_pydatetime()
    return {
        "ts_utc": ts.isoformat(),
        "open": _safe_float(last.get("Open")),
        "high": _safe_float(last.get("High")),
        "low": _safe_float(last.get("Low")),
        "close": _safe_float(last.get("Close")),
        "volume": _safe_float(last.get("Volume")),
    }


def _normalize_summary_asset(asset: str, data: Dict) -> Dict:
    drivers = data.get("drivers") or []
    if isinstance(drivers, list):
        clean_drivers = [str(d.get("name", d)) if isinstance(d, dict) else str(d) for d in drivers][:3]
    else:
        clean_drivers = []
    return {
        "asset": asset,
        "direction": str(data.get("direction", "NEUTRAL")).upper(),
        "confidence": _safe_float(data.get("confidence")) or 50.0,
        "impulse": str(data.get("impulse", "UNKNOWN")),
        "drivers": clean_drivers,
        "price": _safe_float(data.get("price")),
    }


async def save_market_summary_snapshot(db) -> Dict:
    """
    Save one lightweight summary snapshot with:
    - global pulse bias/asset signals
    - latest 5m candle for each tracked asset
    """
    _ensure_paths()
    now_utc = datetime.now(timezone.utc)
    now_rome = now_utc.astimezone(ROME_TZ)

    latest_pulse = await db.global_pulse.find_one(sort=[("timestamp", -1)])
    assets_analysis = (latest_pulse or {}).get("assets_analysis", {}) or {}
    synthetic_bias = str((latest_pulse or {}).get("synthetic_bias", ""))[:1200]

    summary_assets: List[Dict] = []
    market_5m: Dict[str, Dict] = {}
    for asset, ticker in ASSET_TO_TICKER.items():
        normalized = _normalize_summary_asset(asset, assets_analysis.get(asset, {}))
        summary_assets.append(normalized)
        try:
            candle = await asyncio.to_thread(_latest_5m_candle, ticker)
        except Exception as exc:
            logger.warning("5m candle fetch failed for %s: %s", asset, exc)
            candle = {}
        market_5m[asset] = candle

    signature_payload = {
        "synthetic_bias": synthetic_bias,
        "assets": summary_assets,
    }
    signature = hashlib.sha256(
        json.dumps(signature_payload, ensure_ascii=False, sort_keys=True).encode("utf-8")
    ).hexdigest()

    entry = {
        "id": f"sum-{now_utc.strftime('%Y%m%d%H%M%S')}",
        "ts_utc": now_utc.isoformat(),
        "ts_rome": now_rome.isoformat(),
        "rome_day": now_rome.date().isoformat(),
        "rome_slot": now_rome.strftime("%H:%M"),
        "synthetic_bias": synthetic_bias,
        "assets": summary_assets,
        "market_5m": market_5m,
        "summary_signature": signature,
    }

    rows = _read_json_list(SNAPSHOTS_FILE)
    if rows and rows[-1].get("summary_signature") == signature:
        return {"status": "skipped", "reason": "unchanged_summary", "rome_slot": entry["rome_slot"]}
    rows.append(entry)
    # Keep only recent history to reduce storage.
    if len(rows) > 12000:
        rows = rows[-12000:]
    _write_json_list(SNAPSHOTS_FILE, rows)
    return {"status": "ok", "saved_id": entry["id"], "rome_slot": entry["rome_slot"]}


def _eval_after_summary(direction: str, start_price: Optional[float], candles_df) -> Dict:
    if not start_price or candles_df is None or candles_df.empty:
        return {"evaluated": False}
    highs = candles_df["High"]
    lows = candles_df["Low"]
    closes = candles_df["Close"]
    if highs.empty or lows.empty or closes.empty:
        return {"evaluated": False}

    period_high = float(highs.max())
    period_low = float(lows.min())
    final_close = float(closes.iloc[-1])
    delta = final_close - float(start_price)
    direction = (direction or "NEUTRAL").upper()
    hit = False
    if direction == "UP":
        hit = final_close > float(start_price)
        mfe = period_high - float(start_price)
        mae = float(start_price) - period_low
    elif direction == "DOWN":
        hit = final_close < float(start_price)
        mfe = float(start_price) - period_low
        mae = period_high - float(start_price)
    else:
        mfe = 0.0
        mae = 0.0

    return {
        "evaluated": True,
        "hit": bool(hit),
        "start_price": round(float(start_price), 5),
        "final_close": round(final_close, 5),
        "delta": round(delta, 5),
        "mfe_points": round(float(mfe), 5),
        "mae_points": round(float(mae), 5),
    }


def _fetch_5m_window(ticker: str, start_utc: datetime, end_utc: datetime):
    # Fetch a compact window and slice locally for stability across yfinance versions.
    df = yf.download(
        tickers=ticker,
        period="7d",
        interval="5m",
        progress=False,
        auto_adjust=False,
    )
    if df is None or df.empty:
        return None
    if df.index.tz is None:
        df.index = df.index.tz_localize("UTC")
    else:
        df.index = df.index.tz_convert("UTC")
    mask = (df.index >= start_utc) & (df.index <= end_utc)
    return df.loc[mask]


def run_end_session_summary_analysis(target_rome_day: Optional[str] = None) -> Dict:
    """
    Analyze all summaries for one Rome day.
    Default behavior (called at end of session): analyze current Rome day.
    """
    _ensure_paths()
    now_rome = datetime.now(ROME_TZ)
    if target_rome_day:
        day = datetime.fromisoformat(target_rome_day).date()
    else:
        day = now_rome.date()

    day_start_rome = datetime(day.year, day.month, day.day, 0, 0, 0, tzinfo=ROME_TZ)
    day_end_rome = day_start_rome + timedelta(days=1) - timedelta(seconds=1)
    day_start_utc = day_start_rome.astimezone(timezone.utc)
    day_end_utc = day_end_rome.astimezone(timezone.utc)

    rows = _read_json_list(SNAPSHOTS_FILE)
    day_rows = [r for r in rows if r.get("rome_day") == day.isoformat()]
    if not day_rows:
        report = {
            "rome_day": day.isoformat(),
            "status": "no_data",
            "created_at_utc": datetime.now(timezone.utc).isoformat(),
            "snapshots_count": 0,
            "assets": {},
        }
        (REPORTS_DIR / f"{day.isoformat()}.json").write_text(
            json.dumps(report, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        return report

    stats: Dict[str, Dict] = {a: {"count": 0, "hits": 0, "sum_delta": 0.0, "sum_mfe": 0.0, "sum_mae": 0.0} for a in ASSET_TO_TICKER}
    detailed = []

    for row in day_rows:
        try:
            summary_ts = datetime.fromisoformat(row["ts_utc"]).astimezone(timezone.utc)
        except Exception:
            continue
        for asset, ticker in ASSET_TO_TICKER.items():
            asset_summary = next((x for x in row.get("assets", []) if x.get("asset") == asset), {})
            direction = asset_summary.get("direction", "NEUTRAL")
            start_price = _safe_float((row.get("market_5m", {}).get(asset, {}) or {}).get("close"))
            if start_price is None:
                start_price = _safe_float(asset_summary.get("price"))
            try:
                df = _fetch_5m_window(ticker, summary_ts, day_end_utc)
            except Exception as exc:
                logger.warning("Window fetch failed %s: %s", asset, exc)
                df = None
            eval_out = _eval_after_summary(direction, start_price, df)
            if not eval_out.get("evaluated"):
                continue

            stats[asset]["count"] += 1
            stats[asset]["hits"] += 1 if eval_out["hit"] else 0
            stats[asset]["sum_delta"] += float(eval_out["delta"])
            stats[asset]["sum_mfe"] += float(eval_out["mfe_points"])
            stats[asset]["sum_mae"] += float(eval_out["mae_points"])
            detailed.append(
                {
                    "summary_id": row.get("id"),
                    "ts_utc": row.get("ts_utc"),
                    "asset": asset,
                    "direction": direction,
                    **eval_out,
                }
            )

    summary = {}
    for asset, st in stats.items():
        n = st["count"]
        if n == 0:
            summary[asset] = {"count": 0}
            continue
        summary[asset] = {
            "count": n,
            "hit_rate_pct": round((st["hits"] / n) * 100.0, 2),
            "avg_delta": round(st["sum_delta"] / n, 5),
            "avg_mfe_points": round(st["sum_mfe"] / n, 5),
            "avg_mae_points": round(st["sum_mae"] / n, 5),
        }

    report = {
        "rome_day": day.isoformat(),
        "analyzed_window_utc": {"start": _to_utc_iso(day_start_rome), "end": _to_utc_iso(day_end_rome)},
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "snapshots_count": len(day_rows),
        "evaluations_count": len(detailed),
        "assets": summary,
        "details": detailed[-2000:],
    }
    (REPORTS_DIR / f"{day.isoformat()}.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return report


def run_midnight_summary_analysis(target_rome_day: Optional[str] = None) -> Dict:
    """Backward compatible alias."""
    if target_rome_day is None:
        target_rome_day = (datetime.now(ROME_TZ) - timedelta(days=1)).date().isoformat()
    return run_end_session_summary_analysis(target_rome_day=target_rome_day)
