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
from typing import Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo

import pandas as pd
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
ASSET_PRICE_BOUNDS: Dict[str, Tuple[float, float]] = {
    "NAS100": (10000.0, 50000.0),
    "SP500": (3000.0, 10000.0),
    "XAUUSD": (2000.0, 7000.0),
    "EURUSD": (0.5, 2.0),
}
MAX_CANDLE_DEVIATION_PCT = 25.0


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
        if hasattr(value, "ndim") and getattr(value, "ndim", 1) > 1 and hasattr(value, "iloc"):
            value = value.iloc[:, 0]
        if hasattr(value, "iloc"):
            value = value.iloc[-1]
        if hasattr(value, "item"):
            try:
                value = value.item()
            except Exception:
                pass
        return float(value)
    except Exception:
        return None

def _normalize_ohlc_frame(df, ticker: Optional[str] = None):
    if df is None or df.empty:
        return df

    if isinstance(df.columns, pd.MultiIndex):
        if ticker and ticker in set(df.columns.get_level_values(-1)):
            try:
                df = df.xs(ticker, axis=1, level=-1)
            except Exception:
                pass
        elif ticker and ticker in set(df.columns.get_level_values(0)):
            try:
                df = df.xs(ticker, axis=1, level=0)
            except Exception:
                pass

        if isinstance(df.columns, pd.MultiIndex):
            flat = list(df.columns.to_flat_index())
            cols = [c[0] if isinstance(c, tuple) else c for c in flat]
            if not {"Open", "High", "Low", "Close"}.intersection(set(cols)):
                cols = [c[-1] if isinstance(c, tuple) else c for c in flat]
            df = df.copy()
            df.columns = cols
            df = df.loc[:, ~pd.Index(df.columns).duplicated(keep="first")]

    if "Close" not in df.columns and "Adj Close" in df.columns:
        df = df.rename(columns={"Adj Close": "Close"})

    return df


def _latest_5m_candle(ticker: str) -> Dict:
    # Small fetch window keeps runtime light.
    df = yf.download(
        tickers=ticker,
        period="2d",
        interval="5m",
        progress=False,
        auto_adjust=False,
        threads=False,
    )
    if df is None or df.empty:
        return {}
    df = _normalize_ohlc_frame(df, ticker=ticker)
    required_cols = {"Open", "High", "Low", "Close"}
    if not required_cols.issubset(df.columns):
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


def _is_ohlc_consistent(candle: Dict) -> bool:
    open_v = _safe_float(candle.get("open"))
    high_v = _safe_float(candle.get("high"))
    low_v = _safe_float(candle.get("low"))
    close_v = _safe_float(candle.get("close"))
    if None in (open_v, high_v, low_v, close_v):
        return False
    if high_v < max(open_v, close_v):
        return False
    if low_v > min(open_v, close_v):
        return False
    return high_v >= low_v


def _is_candle_coherent(asset: str, candle: Dict, anchor_price: Optional[float]) -> Tuple[bool, str]:
    if not candle:
        return False, "empty"
    close_v = _safe_float(candle.get("close"))
    if close_v is None or close_v <= 0:
        return False, "missing_close"

    bounds = ASSET_PRICE_BOUNDS.get(asset)
    if bounds:
        lower, upper = bounds
        if close_v < lower or close_v > upper:
            return False, f"close_out_of_bounds:{close_v:.5f}"

    if anchor_price and anchor_price > 0:
        deviation_pct = abs(close_v - anchor_price) / anchor_price * 100.0
        if deviation_pct > MAX_CANDLE_DEVIATION_PCT:
            return False, f"close_anchor_deviation:{deviation_pct:.2f}%"

    if not _is_ohlc_consistent(candle):
        return False, "ohlc_inconsistent"

    return True, "ok"


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
        anchor_price = _safe_float(normalized.get("price"))
        try:
            candle = await asyncio.to_thread(_latest_5m_candle, ticker)
        except Exception as exc:
            logger.warning("5m candle fetch failed for %s: %s", asset, exc)
            candle = {}
        is_valid, reason = _is_candle_coherent(asset, candle, anchor_price)
        if not is_valid:
            logger.warning(
                "Discarding incoherent 5m candle for %s (%s). ticker=%s anchor=%s candle=%s",
                asset,
                reason,
                ticker,
                anchor_price,
                candle,
            )
            candle = {}
        market_5m[asset] = candle

    signature_payload = {
        "synthetic_bias": synthetic_bias,
        "assets": summary_assets,
        "market_5m": market_5m,
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
    candles_df = _normalize_ohlc_frame(candles_df)
    highs = candles_df.get("High")
    lows = candles_df.get("Low")
    closes = candles_df.get("Close")
    if highs is None or lows is None or closes is None:
        return {"evaluated": False}
    if highs.empty or lows.empty or closes.empty:
        return {"evaluated": False}

    period_high = _safe_float(highs.max() if hasattr(highs, "max") else highs)
    period_low = _safe_float(lows.min() if hasattr(lows, "min") else lows)
    final_close = _safe_float(closes.iloc[-1] if hasattr(closes, "iloc") else closes)
    if None in (period_high, period_low, final_close):
        return {"evaluated": False}
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
    df = _normalize_ohlc_frame(df, ticker=ticker)
    required_cols = {"High", "Low", "Close"}
    if not required_cols.issubset(df.columns):
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
