import yfinance as yf
from tradingview_ta import TA_Handler, Interval, Exchange
import pandas as pd
import logging
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

class MarketDataService:
    def __init__(self):
        # Symbol Map: (Symbol, Screener, Exchange) for TradingView
        self.tv_map = {
            "NAS100": [("NAS100", "cfd", "FOREXCOM"), ("NDX", "america", "NASDAQ")],
            "SP500": [("SPX500", "cfd", "FOREXCOM"), ("SPX", "america", "CBOE")],
            "XAUUSD": [("XAUUSD", "cfd", "FOREXCOM"), ("GOLD", "cfd", "TVC")],
            "EURUSD": [("EURUSD", "forex", "FXCM"), ("EURUSD", "forex", "OANDA")],
            "VIX": [("VIX", "cfd", "TVC"), ("VIX", "america", "CBOE")]
        }
        # YFinance Map for reliable price
        self.yf_map = {
            "NAS100": "NQ=F",  # Nasdaq Futures
            "SP500": "ES=F",   # S&P Futures
            "XAUUSD": "GC=F",  # Gold Futures
            "EURUSD": "EURUSD=X",
            "VIX": "^VIX"
        }

    def get_latest_data(self, symbol: str) -> dict:
        """Get hybrid data: Price from YF, Technicals from TV."""
        # 1. Fetch Price from YFinance (Fast & Reliable)
        yf_ticker = self.yf_map.get(symbol)
        price_data = self._fetch_yf_price(yf_ticker)
        
        if not price_data:
            logger.warning(f"YFinance failed for {symbol}, trying TV fallback...")
        
        # 2. Fetch Technicals from TradingView (Rich data, but rate limited)
        tv_data = self._fetch_tv_technicals(symbol)
        
        # Merge Data
        if price_data and tv_data:
            # Prefer YF price (realtime) but TV signals
            return {**tv_data, **price_data}
        elif price_data:
            # Only price available -> Calculate basic technicals or return neutral
            return {
                **price_data,
                "rsi": 50, "macd": 0, "recommendation": "NEUTRAL",
                "buy_votes": 0, "sell_votes": 0
            }
        elif tv_data:
            # Only TV available
            return tv_data
            
        logger.error(f"All sources failed for {symbol}")
        return None

    def _fetch_yf_price(self, ticker: str) -> dict:
        if not ticker: return None
        try:
            dat = yf.Ticker(ticker)
            
            # 1. Try FastInfo (price + prev close)
            fast_price = None
            fast_prev = None
            if hasattr(dat, 'fast_info'):
                try:
                    fast_price = dat.fast_info.last_price
                    fast_prev = dat.fast_info.previous_close
                except:
                    pass
            
            # 2. History Loop (Need enough data for ATR)
            # We need at least 15 candles for 14-period ATR
            for interval in ["1h", "1d"]:
                try:
                    p = "5d" if interval=="1h" else "1mo"
                    hist = dat.history(period=p, interval=interval)
                    
                    if not hist.empty:
                        hist_price = float(hist["Close"].iloc[-1])
                        price = float(fast_price) if fast_price else hist_price
                        prev = float(fast_prev) if fast_prev else float(hist["Open"].iloc[0])
                        change = ((price - prev) / prev) * 100 if prev else 0.0

                        # Day open/MTD open for range & seasonality calcs (only reliable on 1d interval)
                        day_open = None
                        day_change_points = None
                        day_change_pct = None
                        month_open = None
                        month_change_points = None
                        month_change_pct = None
                        if interval == "1d" and len(hist) >= 2:
                            day_open = float(hist["Open"].iloc[-1])
                            day_change_points = float(price - day_open)
                            day_change_pct = float((price - day_open) / day_open * 100) if day_open else 0.0
                            month_open = float(hist["Open"].iloc[0])
                            month_change_points = float(price - month_open)
                            month_change_pct = float((price - month_open) / month_open * 100) if month_open else 0.0
                        
                        # Calculate ATR (14)
                        high = hist["High"]
                        low = hist["Low"]
                        close = hist["Close"]
                        
                        # True Range
                        tr1 = high - low
                        tr2 = (high - close.shift()).abs()
                        tr3 = (low - close.shift()).abs()
                        tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
                        atr = tr.rolling(window=14).mean().iloc[-1]
                        
                        # If ATR is NaN (not enough data), fallback to %
                        if pd.isna(atr): atr = price * 0.01

                        # Hourly Volatility (Mataf Proxy)
                        # Calculate avg range for the current hour over the fetched period
                        current_hour = datetime.now().hour
                        # Filter by current hour
                        hist['hour'] = hist.index.hour
                        hourly_data = hist[hist['hour'] == current_hour]
                        
                        hourly_vol = 0.0
                        if not hourly_data.empty:
                            # Avg High - Low for this hour
                            hourly_ranges = (hourly_data["High"] - hourly_data["Low"])
                            hourly_vol = hourly_ranges.mean()

                        return {
                            "price": float(price),
                            "change": float(change),
                            "atr": float(atr),
                            "hourly_vol_avg": float(hourly_vol) if not pd.isna(hourly_vol) else 0.0,
                            "day_open": day_open,
                            "day_change_points": day_change_points,
                            "day_change_pct": day_change_pct,
                            "month_open": month_open,
                            "month_change_points": month_change_points,
                            "month_change_pct": month_change_pct
                        }
                except:
                    continue
                    
            # If history failed but fast price exists, fall back to fast info only
            if fast_price:
                change = 0.0
                if fast_prev:
                    change = ((fast_price - fast_prev) / fast_prev) * 100
                return {"price": float(fast_price), "change": float(change)}

        except Exception as e:
            logger.warning(f"YF Fetch error {ticker}: {e}")
        
        return None

    def _fetch_tv_technicals(self, symbol: str) -> dict:
        candidates = self.tv_map.get(symbol, [])
        for ticker, screener, exchange in candidates:
            try:
                # Random sleep to mitigate 429s
                time.sleep(random.uniform(0.5, 2.0))
                
                handler = TA_Handler(
                    symbol=ticker,
                    screener=screener,
                    exchange=exchange,
                    interval=Interval.INTERVAL_1_HOUR
                )
                analysis = handler.get_analysis()
                if analysis:
                    return {
                        # If YF failed, we might use this price, but usually we overwrite it
                        "tv_price": analysis.indicators["close"],
                        "rsi": analysis.indicators.get("RSI", 50),
                        "macd": analysis.indicators.get("MACD.macd", 0),
                        "stoch_k": analysis.indicators.get("Stoch.K", 50),
                        "recommendation": analysis.summary.get("RECOMMENDATION"),
                        "buy_votes": analysis.summary.get("BUY"),
                        "sell_votes": analysis.summary.get("SELL")
                    }
            except Exception:
                continue
        return None

    def get_vix_data(self) -> dict:
        """Get VIX data from YFinance."""
        try:
            # unique case for VIX, YF is ^VIX
            tick = self._fetch_yf_price("^VIX")
            if tick:
                # Get history for changes
                dat = yf.Ticker("^VIX")
                hist = dat.history(period="5d", interval="1d")
                
                change_1h = tick.get("change", 0) # Realtime change
                
                # Daily change
                current = tick.get("price", 20)
                prev_close = hist["Close"].iloc[-2] if len(hist) > 1 else current
                change_24h = ((current - prev_close) / prev_close) * 100
                
                return {
                    "level": current,
                    "change_1h": change_1h,
                    "change_24h": change_24h
                }
        except Exception as e:
            logger.error(f"VIX fetch error: {e}")
            
        return {"level": 20.0, "change_1h": 0.0, "change_24h": 0.0}

class MacroDataService:
    def get_macro_environment(self) -> dict:
        """Fetch basic macro data via yfinance."""
        try:
            tickers = ["^TNX", "DX-Y.NYB"]
            data = yf.download(tickers, period="1d", interval="1h", progress=False)
            
            # yfinance returns MultiIndex dataframe, handling it safely
            if isinstance(data.columns, pd.MultiIndex):
                # Flatten or access safely
                try:
                    tnx = data['Close']['^TNX'].iloc[-1]
                except:
                    tnx = 0
                try:
                    dxy = data['Close']['DX-Y.NYB'].iloc[-1]
                except:
                    dxy = 0
            else:
                # If single ticker or different format
                tnx = data['Close'].iloc[-1] if '^TNX' in data.columns else 0
                dxy = 0 # Fallback
            
            return {
                "us10y_yield": float(tnx),
                "dxy": float(dxy),
                "macro_pressure_usd": "HIGH" if dxy > 105 else "NEUTRAL" if dxy > 100 else "LOW",
                "macro_pressure_rates": "HIGH" if tnx > 4.5 else "NEUTRAL"
            }
        except Exception as e:
            logger.error(f"Error fetching macro data: {e}")
            return {"us10y_yield": 4.0, "dxy": 102.0, "error": str(e)}

class NewsService:
    def get_news_sentiment(self) -> dict:
        return {
            "sentiment_score": 0.1, 
            "top_theme": "Mixed",
            "risk_event": False
        }

class COTService:
    def get_cot_bias(self, asset: str) -> dict:
        # Mock biases for now
        biases = {
            "XAUUSD": {"net_position": "LONG", "percentile": 85},
            "EURUSD": {"net_position": "SHORT", "percentile": 30},
            "NAS100": {"net_position": "LONG", "percentile": 70},
            "SP500": {"net_position": "LONG", "percentile": 75}
        }
        return biases.get(asset, {"net_position": "NEUTRAL", "percentile": 50})
