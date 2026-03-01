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

def calculate_mfe_mae(start_price: float, direction: str, df_slice) -> tuple:
    """
    Calculates Max Favorable Excursion (Pips) and Max Adverse Excursion (Pips).
    Returns (mfe_pips, mae_pips, hit_status)
    """
    if df_slice.empty:
        return 0, 0, False
        
    # Get highest high and lowest low of the period slice
    period_high = float(df_slice['High'].max())
    period_low = float(df_slice['Low'].min())
    final_close = float(df_slice['Close'].iloc[-1])
    
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

async def run_matrix_evaluations():
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
    
    for snp in snapshots:
        snapshot_id = snp.get("id")
        asset = snp.get("asset")
        direction = snp.get("direction")
        entry_price = snp.get("entry_price")
        context = snp.get("context", {})
        
        try:
            saved_at = datetime.fromisoformat(snp["saved_at"].replace("Z", "+00:00"))
        except:
            continue
            
        # We need data from `saved_at` up to `saved_at + 5 days` ideally.
        # But if `now` is less than `saved_at + 5 days`, we can't evaluate the 5d timeframe yet.
        # We fetch up to `now`.
        
        start_fetch = saved_at - timedelta(hours=1)
        end_fetch = now + timedelta(hours=1)
        
        start_str = start_fetch.strftime('%Y-%m-%d')
        end_str = end_fetch.strftime('%Y-%m-%d')
        ticker = TICKER_MAP.get(asset)
        
        if not ticker:
            continue
            
        logger.info(f"Downloading YF data for {asset} from {start_str} to {end_str}")
        
        # Download 5-minute candles for absolute MFE/MAE precision
        try:
            df = await asyncio.to_thread(
                yf.download,
                tickers=ticker,
                start=start_str,
                end=end_str,
                interval="5m",
                progress=False
            )
        except Exception as e:
            logger.warning(f"Failed to download data for {asset}: {e}")
            continue
            
        if df.empty:
            continue
            
        # Convert index to UTC for safe comparison
        if df.index.tz is None:
             df.index = df.index.tz_localize('UTC')
        else:
             df.index = df.index.tz_convert('UTC')
             
        flags = snp.get("evaluated_flags", {})
        
        for tf_key, duration in MFE_TIMEFRAMES.items():
            if flags.get(tf_key):
                continue # Already evaluated this timeframe on a previous run
                
            tf_end_time = saved_at + duration
            
            # If the timeframe hasn't happened yet in the real world, skip it until next daemon run
            if now < tf_end_time:
                continue 
                
            # Slice the dataframe exactly for this timeframe window
            mask = (df.index >= saved_at) & (df.index <= tf_end_time)
            df_slice = df.loc[mask]
            
            if df_slice.empty:
                # Might be weekend or outside trading hours
                logger.debug(f"No market data for {asset} exactly between {saved_at} and {tf_end_time}. Skipping TF {tf_key}.")
                
                # If we are vastly past the timeframe (e.g. 24h passed) and still no data, mark it True to not loop forever
                if now > tf_end_time + timedelta(hours=48):
                     local_vault_matrix.mark_timeframe_evaluated(snapshot_id, tf_key)
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
                "context": context  # The secret sauce: copying the full multidimensional vector
            }
            
            local_vault_matrix.save_matrix_evaluation(eval_data)
            local_vault_matrix.mark_timeframe_evaluated(snapshot_id, tf_key)
            
            logger.info(f"✅ {asset} [{tf_key}] -> MFE: {mfe_pips} pips | MAE: {mae_pips} pips | Final Hit: {hit}")
            evaluated_count += 1

    logger.info(f"📊 [MATRIX] Daemon sleep. Evaluated {evaluated_count} multi-dimensional slices.")
    return {"evaluated": evaluated_count}

if __name__ == "__main__":
    asyncio.run(run_matrix_evaluations())
