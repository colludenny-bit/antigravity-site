from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional
import yfinance as yf
import aiohttp
import asyncio
import logging
import os

logger = logging.getLogger(__name__)

class MarketDataProvider(ABC):
    """Abstract base class for market data providers"""
    
    @abstractmethod
    async def get_price(self, symbol: str) -> float:
        """Get current price for a single symbol"""
        pass

    @abstractmethod
    async def get_prices(self, symbols: List[str]) -> Dict[str, float]:
        """Get current prices for multiple symbols"""
        pass

    @abstractmethod
    async def get_historical_data(self, symbol: str, timeframe: str = "1d", limit: int = 100) -> List[Dict[str, Any]]:
        """Get historical OHLCV data"""
        pass

class YFinanceProvider(MarketDataProvider):
    """Fallback provider using Yahoo Finance (delayed/simulated real-time)"""
    
    async def get_price(self, symbol: str) -> float:
        try:
            ticker = yf.Ticker(symbol)
            # Fast fetch
            data = ticker.history(period="1d")
            if not data.empty:
                return data["Close"].iloc[-1]
            return 0.0
        except Exception as e:
            logger.error(f"YFinance error for {symbol}: {e}")
            return 0.0

    async def get_prices(self, symbols: List[str]) -> Dict[str, float]:
        results = {}
        # YFinance can be slow in loop, better to use bulk if possible or parallel
        # For simplicity in MVP, we iterate or use ThreadPoolExecutor if needed
        # but yf.download is blocking.
        # We'll use a simple loop for now as this is a fallback.
        try:
            data = yf.download(symbols, period="1d", progress=False)["Close"]
            if not data.empty:
                # Handle single row series or dataframe
                last_row = data.iloc[-1]
                for sym in symbols:
                    if sym in last_row:
                        results[sym] = float(last_row[sym])
                    else:
                        results[sym] = 0.0
            return results
        except Exception as e:
            logger.error(f"YFinance bulk error: {e}")
            return {s: 0.0 for s in symbols}

    async def get_historical_data(self, symbol: str, timeframe: str = "1d", limit: int = 100) -> List[Dict[str, Any]]:
        # Map common timeframes to yfinance intervals
        interval_map = {
            "1m": "1m", "5m": "5m", "15m": "15m", "1h": "1h", "1d": "1d", "1wk": "1wk"
        }
        interval = interval_map.get(timeframe, "1d")
        period = "1mo" if timeframe == "1d" else "5d" # Simplification
        
        try:
            ticker = yf.Ticker(symbol)
            df = ticker.history(interval=interval, period=period)
            data = []
            for index, row in df.iterrows():
                data.append({
                    "time": index.isoformat(),
                    "open": row["Open"],
                    "high": row["High"],
                    "low": row["Low"],
                    "close": row["Close"],
                    "volume": row["Volume"]
                })
            return data[-limit:]
        except Exception as e:
            logger.error(f"YFinance history error {symbol}: {e}")
            return []

class CapitalComProvider(MarketDataProvider):
    """Capital.com API Provider (Requires API KEY)"""
    
    def __init__(self, api_key: str, identifier: str):
        self.api_key = api_key
        self.identifier = identifier
        self.base_url = "https://api-capital.backend-capital.com/api/v1"
        self.session_token = None
        
    async def _ensure_session(self):
        # Implementation for session handling would go here
        if not self.api_key:
            raise ValueError("Capital.com API Key missing")
        pass

    async def get_price(self, symbol: str) -> float:
        if not self.api_key:
            # Fallback mock for structure
            return 0.0
        # Call API...
        return 0.0

    async def get_prices(self, symbols: List[str]) -> Dict[str, float]:
        if not self.api_key:
            return {s: 0.0 for s in symbols}
        # Call API...
        return {s: 0.0 for s in symbols}

    async def get_historical_data(self, symbol: str, timeframe: str = "1d", limit: int = 100) -> List[Dict[str, Any]]:
        if not self.api_key:
            return []
        return []

class OandaProvider(MarketDataProvider):
    """Oanda API Provider (Requires API KEY)"""
    
    def __init__(self, api_key: str, account_id: str):
        self.api_key = api_key
        self.account_id = account_id
        self.base_url = "https://api-fxtrade.oanda.com/v3"

    async def get_price(self, symbol: str) -> float:
        if not self.api_key:
            return 0.0
        # Call API...
        return 0.0

    async def get_prices(self, symbols: List[str]) -> Dict[str, float]:
        if not self.api_key:
            return {s: 0.0 for s in symbols}
        return {s: 0.0 for s in symbols}

    async def get_historical_data(self, symbol: str, timeframe: str = "1d", limit: int = 100) -> List[Dict[str, Any]]:
        return []

class MarketDataFactory:
    @staticmethod
    def get_provider() -> MarketDataProvider:
        # Check env vars to decide provider
        cap_key = os.environ.get("CAPITAL_COM_KEY")
        oanda_key = os.environ.get("OANDA_KEY")
        
        if cap_key:
            return CapitalComProvider(cap_key, os.environ.get("CAPITAL_COM_ID", ""))
        elif oanda_key:
            return OandaProvider(oanda_key, os.environ.get("OANDA_ACCOUNT_ID", ""))
        else:
            return YFinanceProvider()

# Global instance
market_provider = MarketDataFactory.get_provider()
