"""
forensics_v2.py — The Matrix (Forensics 2.0 Engine)
Isolated Daemon for Multi-Dimensional Reversal and Time-Decay Analysis.
Evaluates 'snapshots' stored in local_vault_matrix.
Computes MFE (Max Favorable Excursion) and MAE (Max Adverse Excursion) 
over multiple micro and macro timeframes using 5m/15m Yahoo Finance data.
"""
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional
import pandas as pd
import local_vault_matrix

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("Matrix_Daemon")

# Yahoo Finance precise ticker map
TICKER_MAP = {
    "NAS100": "NQ=F",
    "SP500": "ES=F",
    "XAUUSD": "GC=F",
    "EURUSD": "EURUSD=X",
    "DOW": "YM=F"
}

# The timeframes we want to evaluate against the snapshot time
MFE_TIMEFRAMES = {
    "t_5m": timedelta(minutes=5),
    "t_15m": timedelta(minutes=15),
    "t_30m": timedelta(minutes=30),
    "t_1h": timedelta(hours=1),
    "t_2h": timedelta(hours=2),
    "t_4h": timedelta(hours=4),
    "t_24h": timedelta(hours=24),
    "t_5d": timedelta(days=5)
}
STALE_DATA_GRACE = timedelta(hours=48)

def _to_numeric_series(values) -> pd.Series:
    """Normalize scalar/Series/DataFrame values into a numeric pandas Series."""
    if values is None:
        return pd.Series(dtype="float64")

    if isinstance(values, pd.DataFrame):
        if values.empty or values.shape[1] == 0:
            return pd.Series(dtype="float64")
        values = values.iloc[:, 0]

    if isinstance(values, pd.Series):
        series = values
    else:
        series = pd.Series([values])

    return pd.to_numeric(series, errors="coerce").dropna()

def _normalize_ohlc_frame(df) -> pd.DataFrame:
    """
    Normalize yfinance output to single-level OHLC columns.
    yfinance may return a MultiIndex (Price, Ticker) even for a single ticker.
    """
    if df.empty:
        return df

    if isinstance(df.columns, pd.MultiIndex):
        df = df.copy()
        df.columns = [col[0] for col in df.columns.to_flat_index()]
        df = df.loc[:, ~pd.Index(df.columns).duplicated(keep="first")]

    if "Close" not in df.columns and "Adj Close" in df.columns:
        df = df.rename(columns={"Adj Close": "Close"})

    return df

def _parse_saved_at(value) -> Optional[datetime]:
    if value is None:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).astimezone(timezone.utc)
    except Exception:
        return None

def _normalize_direction(direction: str) -> str:
    normalized = str(direction or "").strip().upper()
    if normalized in {"UP", "LONG", "BUY", "BULL", "BULLISH"}:
        return "UP"
    if normalized in {"DOWN", "SHORT", "SELL", "BEAR", "BEARISH"}:
        return "DOWN"
    return "NEUTRAL"

def _due_timeframes(saved_at: datetime, flags: dict, now: datetime) -> List[str]:
    due = []
    for tf_key, duration in MFE_TIMEFRAMES.items():
        if flags.get(tf_key):
            continue
        if now >= (saved_at + duration):
            due.append(tf_key)
    return due

def _mark_stale_due_timeframes(snapshot_id: str, saved_at: datetime, due_tfs: List[str], now: datetime) -> int:
    """
    Mark due timeframes as evaluated when no market data is available long enough.
    This avoids endless retries on permanently unavailable feeds.
    """
    marked = 0
    for tf_key in due_tfs:
        tf_end = saved_at + MFE_TIMEFRAMES[tf_key]
        if now > (tf_end + STALE_DATA_GRACE):
            local_vault_matrix.mark_timeframe_evaluated(snapshot_id, tf_key)
            marked += 1
    return marked

def calculate_mfe_mae(start_price: float, direction: str, df_slice) -> tuple:
    """
    Calculates Max Favorable Excursion (Pips) and Max Adverse Excursion (Pips).
    Returns (mfe_pips, mae_pips, hit_status)
    """
    if df_slice.empty:
        return 0, 0, False
        
    high_series = _to_numeric_series(df_slice.get("High"))
    low_series = _to_numeric_series(df_slice.get("Low"))
    close_series = _to_numeric_series(df_slice.get("Close"))

    if high_series.empty or low_series.empty or close_series.empty:
        return 0, 0, False

    # Get highest high and lowest low of the period slice
    period_high = float(high_series.max())
    period_low = float(low_series.min())
    final_close = float(close_series.iloc[-1])
    
    if direction == "UP":
        mfe = period_high - start_price
        mae = start_price - period_low
        hit = final_close > start_price # Was it in profit at the very end of the timeframe?
    elif direction == "DOWN":
        mfe = start_price - period_low
        mae = period_high - start_price
        hit = final_close < start_price
    else:
        # Neutral bias
        mfe = 0
        mae = 0
        hit = False
        
    return mfe, mae, hit

def _run_matrix_evaluations_sync():
    """
    Core engine loop. Fetches unevaluated snapshots, 
    downloads high-resolution chart data, and slices it by timeframe.
    """
    logger.info("🔮 [MATRIX] Waking up. Scanning for raw Context Snapshots...")
    
    snapshots = local_vault_matrix.get_unevaluated_snapshots()
    if not snapshots:
        logger.info("✨ No pending Matrix snapshots to evaluate.")
        return {"evaluated": 0}
        
    logger.info(f"🔍 Found {len(snapshots)} multidimensional snapshots to process.")
    
    try:
        import yfinance as yf
    except ImportError:
        logger.error("yfinance not installed. Run: pip install yfinance")
        return {"error": "yfinance missing"}
        
    now = datetime.now(timezone.utc)
    evaluated_count = 0
    stale_marked = 0

    # Build only actionable tasks first: no download if no due timeframe.
    pending_by_asset: Dict[str, List[dict]] = {}
    skipped_not_due = 0
    skipped_invalid = 0

    for snp in snapshots:
        snapshot_id = snp.get("id")
        asset = snp.get("asset")
        flags = snp.get("evaluated_flags", {})
        context = snp.get("context", {})

        if not snapshot_id:
            skipped_invalid += 1
            continue

        saved_at = _parse_saved_at(snp.get("saved_at"))
        if not saved_at:
            skipped_invalid += 1
            continue

        due_tfs = _due_timeframes(saved_at, flags, now)
        if not due_tfs:
            skipped_not_due += 1
            continue

        ticker = TICKER_MAP.get(asset)
        if not ticker:
            stale_marked += _mark_stale_due_timeframes(snapshot_id, saved_at, due_tfs, now)
            skipped_invalid += 1
            continue

        entry_series = _to_numeric_series(snp.get("entry_price"))
        if entry_series.empty:
            stale_marked += _mark_stale_due_timeframes(snapshot_id, saved_at, due_tfs, now)
            skipped_invalid += 1
            continue

        direction = _normalize_direction(snp.get("direction"))
        if direction == "NEUTRAL":
            stale_marked += _mark_stale_due_timeframes(snapshot_id, saved_at, due_tfs, now)
            skipped_invalid += 1
            continue

        pending_by_asset.setdefault(asset, []).append({
            "snapshot_id": snapshot_id,
            "saved_at": saved_at,
            "due_tfs": due_tfs,
            "direction": direction,
            "entry_price": float(entry_series.iloc[-1]),
            "context": context,
        })

    if not pending_by_asset:
        logger.info(
            "📊 [MATRIX] Daemon sleep. No due timeframes. skipped_not_due=%s skipped_invalid=%s stale_marked=%s",
            skipped_not_due,
            skipped_invalid,
            stale_marked,
        )
        return {"evaluated": 0, "stale_marked": stale_marked}

    for asset, items in pending_by_asset.items():
        ticker = TICKER_MAP.get(asset)
        if not ticker:
            for item in items:
                stale_marked += _mark_stale_due_timeframes(item["snapshot_id"], item["saved_at"], item["due_tfs"], now)
            continue

        start_fetch = min(item["saved_at"] for item in items) - timedelta(hours=1)
        end_fetch = now + timedelta(hours=1)
        start_str = start_fetch.strftime("%Y-%m-%d")
        end_str = end_fetch.strftime("%Y-%m-%d")

        logger.info("Downloading YF data for %s from %s to %s (%s snapshots)", asset, start_str, end_str, len(items))

        try:
            df = yf.download(
                tickers=ticker,
                start=start_str,
                end=end_str,
                interval="5m",
                progress=False,
            )
        except Exception as e:
            logger.warning("Failed to download data for %s: %s", asset, e)
            for item in items:
                stale_marked += _mark_stale_due_timeframes(item["snapshot_id"], item["saved_at"], item["due_tfs"], now)
            continue

        if df.empty:
            logger.warning("No YF data returned for %s (%s -> %s)", asset, start_str, end_str)
            for item in items:
                stale_marked += _mark_stale_due_timeframes(item["snapshot_id"], item["saved_at"], item["due_tfs"], now)
            continue

        df = _normalize_ohlc_frame(df)
        required_cols = {"High", "Low", "Close"}
        if not required_cols.issubset(df.columns):
            logger.warning("Skipping %s: missing OHLC columns after normalization (%s)", asset, df.columns.tolist())
            for item in items:
                stale_marked += _mark_stale_due_timeframes(item["snapshot_id"], item["saved_at"], item["due_tfs"], now)
            continue

        # Convert index to UTC for safe comparison
        if df.index.tz is None:
            df.index = df.index.tz_localize("UTC")
        else:
            df.index = df.index.tz_convert("UTC")

        for item in items:
            snapshot_id = item["snapshot_id"]
            saved_at = item["saved_at"]
            direction = item["direction"]
            entry_price = item["entry_price"]
            context = item["context"]

            for tf_key in item["due_tfs"]:
                tf_end_time = saved_at + MFE_TIMEFRAMES[tf_key]
                mask = (df.index >= saved_at) & (df.index <= tf_end_time)
                df_slice = df.loc[mask]

                if df_slice.empty:
                    stale_marked += _mark_stale_due_timeframes(snapshot_id, saved_at, [tf_key], now)
                    continue

                mfe_raw, mae_raw, hit = calculate_mfe_mae(entry_price, direction, df_slice)

                # Format pips safely based on asset decimals
                multiplier = 10000 if "USD" in asset else 1
                mfe_pips = round(mfe_raw * multiplier, 1)
                mae_pips = round(mae_raw * multiplier, 1)

                # Save the metric mathematically
                eval_data = {
                    "prediction_id": snapshot_id,
                    "asset": asset,
                    "timeframe": tf_key,
                    "direction": direction,
                    "mfe_pips": mfe_pips,
                    "mae_pips": mae_pips,
                    "hit": hit,
                    "context": context,  # The secret sauce: copying the full multidimensional vector
                }

                local_vault_matrix.save_matrix_evaluation(eval_data)
                local_vault_matrix.mark_timeframe_evaluated(snapshot_id, tf_key)

                logger.info("✅ %s [%s] -> MFE: %s pips | MAE: %s pips | Final Hit: %s", asset, tf_key, mfe_pips, mae_pips, hit)
                evaluated_count += 1

    logger.info(
        "📊 [MATRIX] Daemon sleep. Evaluated %s slices. stale_marked=%s skipped_not_due=%s skipped_invalid=%s",
        evaluated_count,
        stale_marked,
        skipped_not_due,
        skipped_invalid,
    )
    return {
        "evaluated": evaluated_count,
        "stale_marked": stale_marked,
        "skipped_not_due": skipped_not_due,
        "skipped_invalid": skipped_invalid,
    }

async def run_matrix_evaluations():
    """
    Async wrapper to keep FastAPI event loop responsive while matrix I/O runs.
    """
    return await asyncio.to_thread(_run_matrix_evaluations_sync)

if __name__ == "__main__":
    asyncio.run(run_matrix_evaluations())
