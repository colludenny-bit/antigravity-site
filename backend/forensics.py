"""
forensics.py — Retroactive prediction evaluation engine.
Compares saved predictions against real price data from yfinance.
Works fully file-based via local_vault.py (no MongoDB dependency).
"""
import asyncio
import logging
from datetime import datetime, timezone, timedelta
import local_vault

logger = logging.getLogger("forensics")

# Yahoo Finance ticker map
TICKER_MAP = {
    "NAS100": "^NDX",
    "SP500": "^GSPC",
    "XAUUSD": "GC=F",
    "EURUSD": "EURUSD=X",
}


async def fetch_historical_candles_for_evaluation():
    """
    Back-tests predictions made 24+ hours ago against actual price data.
    Uses yfinance for real market data.
    """
    logger.info("🔬 [FORENSICS] Scanning for unevaluated predictions...")

    preds = local_vault.get_unevaluated_predictions()
    if not preds:
        logger.info("✨ No pending predictions to evaluate.")
        return {"evaluated": 0, "message": "No pending predictions"}

    # Only evaluate predictions older than 24h (gives time for price to develop)
    now = datetime.now(timezone.utc)
    eligible = []
    for p in preds:
        try:
            saved = datetime.fromisoformat(p["saved_at"].replace("Z", "+00:00"))
            if (now - saved).total_seconds() > 24 * 3600:
                eligible.append(p)
        except (KeyError, ValueError):
            continue

    if not eligible:
        logger.info("⏳ Predictions exist but are less than 24h old. Waiting...")
        return {"evaluated": 0, "message": "Predictions too recent for evaluation"}

    logger.info(f"🔍 Found {len(eligible)} predictions to evaluate.")

    # Try importing yfinance
    try:
        import yfinance as yf
    except ImportError:
        logger.error("yfinance not installed. Run: pip install yfinance")
        return {"evaluated": 0, "error": "yfinance not installed"}

    evaluated_count = 0
    for pred in eligible:
        try:
            asset = pred.get("asset")
            direction = pred.get("direction", "").upper()
            entry_price = pred.get("price")
            pred_id = pred.get("id")

            if not all([asset, direction, entry_price, pred_id]):
                local_vault.mark_prediction_evaluated(pred_id, False)
                continue

            yf_ticker = TICKER_MAP.get(asset)
            if not yf_ticker:
                local_vault.mark_prediction_evaluated(pred_id, False)
                continue

            # Fetch 1h candles for 24h after the prediction
            pred_time = datetime.fromisoformat(pred["saved_at"].replace("Z", "+00:00"))
            start_date = pred_time.strftime('%Y-%m-%d')
            end_date = (pred_time + timedelta(days=2)).strftime('%Y-%m-%d')

            df = await asyncio.to_thread(
                yf.download,
                tickers=yf_ticker,
                start=start_date,
                end=end_date,
                interval="1h",
                progress=False
            )

            if df.empty:
                logger.warning(f"No data for {asset} at {start_date}")
                continue

            # Simple evaluation: did price move 0.5% in predicted direction within 24h?
            target_pct = 0.005  # 0.5%
            hit = False

            for _, row in df.iterrows():
                try:
                    high = float(row['High'].iloc[0]) if hasattr(row['High'], 'iloc') else float(row['High'])
                    low = float(row['Low'].iloc[0]) if hasattr(row['Low'], 'iloc') else float(row['Low'])
                except (TypeError, IndexError):
                    high = float(row['High'])
                    low = float(row['Low'])

                if direction == "UP":
                    if high >= entry_price * (1 + target_pct):
                        hit = True
                        break
                    if low <= entry_price * (1 - target_pct):
                        break  # Stopped out first
                elif direction == "DOWN":
                    if low <= entry_price * (1 - target_pct):
                        hit = True
                        break
                    if high >= entry_price * (1 + target_pct):
                        break

            # Save evaluation
            local_vault.mark_prediction_evaluated(pred_id, hit)
            local_vault.save_evaluation({
                "prediction_id": pred_id,
                "asset": asset,
                "direction": direction,
                "entry_price": entry_price,
                "prediction_time": pred["saved_at"],
                "hit": hit,
            })

            evaluated_count += 1
            logger.info(f"{'✅' if hit else '❌'} {asset} ({direction}): {'HIT' if hit else 'MISS'}")

        except Exception as e:
            logger.error(f"Error evaluating {pred.get('id')}: {e}")

    logger.info(f"📊 Evaluation complete: {evaluated_count} predictions evaluated.")
    return {"evaluated": evaluated_count}


async def save_current_predictions():
    """
    Capture current dashboard predictions and save them for later evaluation.
    Called by APScheduler every 4 hours.
    """
    logger.info("💾 [PREDICTION CAPTURE] Saving current predictions...")

    try:
        # Import the prediction engine from server
        # We need to get the current bias/direction for each asset
        import yfinance as yf

        for asset, ticker in TICKER_MAP.items():
            try:
                data = await asyncio.to_thread(
                    yf.download, tickers=ticker, period="1d", interval="5m", progress=False
                )
                if data.empty:
                    continue

                # Get current price
                last_close = float(data['Close'].iloc[-1])
                if hasattr(last_close, 'iloc'):
                    last_close = float(last_close.iloc[0])

                # Simple direction: compare last price to moving average
                closes = data['Close'].values[-20:]  # Last 20 5-min candles
                if hasattr(closes[0], 'iloc'):
                    closes = [float(c.iloc[0]) for c in closes]
                else:
                    closes = [float(c) for c in closes]
                avg = sum(closes) / len(closes) if closes else last_close
                direction = "UP" if last_close > avg else "DOWN"

                pred_id = local_vault.save_prediction({
                    "asset": asset,
                    "price": last_close,
                    "direction": direction,
                    "source": "auto_capture",
                })
                logger.info(f"📌 Saved {asset}: {direction} @ {last_close}")

            except Exception as e:
                logger.error(f"Error saving prediction for {asset}: {e}")

    except ImportError:
        logger.error("yfinance not installed for prediction capture")


if __name__ == "__main__":
    asyncio.run(fetch_historical_candles_for_evaluation())
