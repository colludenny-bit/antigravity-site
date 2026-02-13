from datetime import datetime
from pydantic import BaseModel
from typing import List, Dict, Optional
import math
try:
    from .data_sources import MarketDataService, MacroDataService, NewsService, COTService
except ImportError:
    from data_sources import MarketDataService, MacroDataService, NewsService, COTService

class AssetCard(BaseModel):
    asset: str
    direction: str # UP, DOWN, NEUTRAL
    probability: float # 0-100
    impulse: str # PROSEGUE, DIMINUISCE, INVERTE
    drivers: List[str]
    invalidation_level: str
    scores: Dict[str, float] # Breakdown
    timestamp: str

class MultiSourceEngine:
    def __init__(self):
        self.market = MarketDataService()
        self.macro = MacroDataService()
        self.news = NewsService()
        self.cot = COTService()
        
        self.assets = ["NAS100", "SP500", "XAUUSD", "EURUSD"]
        
        # Weights (Configurable)
        self.weights = {
            "NAS100": {"vix": 0.4, "macro": 0.3, "news": 0.2, "cot": 0.1},
            "SP500":  {"vix": 0.4, "macro": 0.3, "news": 0.2, "cot": 0.1},
            "XAUUSD": {"vix": 0.1, "macro": 0.4, "news": 0.3, "cot": 0.2},
            "EURUSD": {"vix": 0.1, "macro": 0.5, "news": 0.2, "cot": 0.2}
        }

    async def run_analysis(self) -> List[AssetCard]:
        print(f"🚀 Running Multi-Source Analysis at {datetime.now()}")
        cards = []
        
        # 1. Get Global Context
        vix_data = self.market.get_vix_data()
        macro_env = self.macro.get_macro_environment()
        
        # Detect Regime (RiskOn/RiskOff)
        regime = self._detect_regime(vix_data, macro_env)
        print(f"🌍 Regime: {regime['status']} (Confidence: {regime['confidence']})")

        for asset in self.assets:
            card = await self._analyze_asset(asset, vix_data, macro_env, regime)
            cards.append(card)
        
        return cards

    def _detect_regime(self, vix: dict, macro: dict) -> dict:
        """Determine if we are Risk-On or Risk-Off."""
        score = 0
        confidence = 0
        
        # VIX Check
        vix_level = vix.get("level", 20)
        vix_change = vix.get("change_24h", 0)
        
        if vix_level < 15 and vix_change < 0:
            score += 1 # Risk On
        elif vix_level > 25 or vix_change > 1.5:
            score -= 1 # Risk Off
            
        # Macro Check
        dxy = macro.get("dxy", 100)
        if dxy < 102:
            score += 0.5
        elif dxy > 105:
            score -= 0.5
            
        status = "NEUTRAL"
        if score > 0.5: status = "RISK_ON"
        elif score < -0.5: status = "RISK_OFF"
        
        return {"status": status, "confidence": min(100, abs(score) * 40)}

    async def _analyze_asset(self, asset: str, vix: dict, macro: dict, regime: dict) -> AssetCard:
        # Fetch market data
        market_data = self.market.get_latest_data(asset)
        if not market_data:
            print(f"⚠️ No data for {asset}")
            return AssetCard(
                asset=asset, 
                direction="NEUTRAL", 
                probability=50.0, 
                impulse="UNKNOWN", 
                drivers=["Missing Data"], 
                invalidation_level="N/A", 
                scores={}, 
                timestamp=datetime.now().isoformat()
            )

        price = market_data["price"]
        
        # Fetch components
        cot = self.cot.get_cot_bias(asset)
        news = self.news.get_news_sentiment()
        
        # Calculate Base Score (-1 to 1)
        score_vix = 0
        score_macro = 0
        score_cot = 0
        score_tech = 0 # New technical score

        # Technical Score from TradingView TA
        # RECOMMENDATION can be "STRONG_BUY", "BUY", "NEUTRAL", "SELL", "STRONG_SELL"
        rec = market_data.get("recommendation", "NEUTRAL")
        if rec == "STRONG_BUY": score_tech = 1.0
        elif rec == "BUY": score_tech = 0.5
        elif rec == "SELL": score_tech = -0.5
        elif rec == "STRONG_SELL": score_tech = -1.0
        
        # RSI Check
        rsi = market_data.get("rsi", 50)
        if rsi > 70: score_tech -= 0.2 # Overbought
        elif rsi < 30: score_tech += 0.2 # Oversold

        # Logic for Equities
        if asset in ["NAS100", "SP500"]:
            # VIX negative correlation
            if regime["status"] == "RISK_OFF": score_vix = -0.8
            elif regime["status"] == "RISK_ON": score_vix = 0.5
            
            # COT
            if cot["net_position"] == "LONG": score_cot = 0.6
            elif cot["net_position"] == "SHORT": score_cot = -0.6
            
        # Logic for XAUUSD (Gold)
        elif asset == "XAUUSD":
            # Macro (Safe haven)
            if regime["status"] == "RISK_OFF": score_macro = 0.7 
            
            if cot["net_position"] == "LONG": score_cot = 0.7
            
        # Logic for EURUSD
        elif asset == "EURUSD":
            # Inverse DXY
            dxy = macro.get("dxy", 100)
            if dxy > 104: score_macro = -0.7
            elif dxy < 101: score_macro = 0.7
            # Tech score needs alignment (EURUSD long = weak DXY)
            
        # Weighted Sum
        w = self.weights.get(asset, {"vix":0.2, "macro":0.2, "news":0.1, "cot":0.1})
        # Add tech weight (implicitly 0.4 or remaining)
        w_tech = 1.0 - sum(w.values())
        
        total_score = (score_vix * w["vix"]) + (score_macro * w["macro"]) + (score_cot * w["cot"]) + (score_tech * w_tech)
        
        # Convert to Direction & Probability
        direction = "NEUTRAL"
        prob = 50 + (total_score * 40) # Scale roughly to 10-90%
        prob = max(10, min(90, prob))
        
        if prob > 55: direction = "UP"
        elif prob < 45: direction = "DOWN"
        
        # Impulse
        impulse = "LATERALIZZA"
        if direction == "UP":
            if score_tech > 0.5: impulse = "PROSEGUE (Strong)"
            elif score_tech > 0: impulse = "PROSEGUE"
            elif score_tech < 0: impulse = "DIMINUISCE (Divergence)"
        elif direction == "DOWN":
            if score_tech < -0.5: impulse = "PROSEGUE (Strong)"
            elif score_tech < 0: impulse = "PROSEGUE"
            elif score_tech > 0: impulse = "DIMINUISCE (Divergence)"

        drivers = []
        if abs(score_vix) > 0.4: drivers.append("VIX Regime")
        if abs(score_macro) > 0.4: drivers.append("Macro Factors")
        if abs(score_cot) > 0.4: drivers.append("COT Positioning")
        if abs(score_tech) > 0.6: drivers.append("Technical Trend")
        
        # Invalidation Level (Technical pivot or simple % for now)
        # Using simple ATR proxy or %
        inv_level = price * 0.99 if direction == "UP" else price * 1.01

        return AssetCard(
            asset=asset,
            direction=direction,
            probability=round(prob, 1),
            impulse=impulse,
            drivers=drivers[:3],
            invalidation_level=f"{inv_level:.2f}",
            scores={
                "vix": round(score_vix, 2), 
                "macro": round(score_macro, 2), 
                "cot": round(score_cot, 2),
                "tech": round(score_tech, 2)
            },
            timestamp=datetime.now().isoformat()
        )
