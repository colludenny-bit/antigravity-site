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

    def _get_seasonality_data(self) -> dict:
        """Determines current week/day and loads rules."""
        now = datetime.now()
        day_name = now.strftime("%A")
        
        # Calculate Week of Month (1-4)
        dom = now.day
        week_num = (dom - 1) // 7 + 1
        if week_num > 4: week_num = 4 # Cap at 4
        
        try:
            import json
            import os
            path = os.path.join(os.path.dirname(__file__), "hidden_strategies/seasonality_rules.json")
            if os.path.exists(path):
                with open(path, "r") as f:
                    rules = json.load(f)
                    
                w_rule = rules["weeks"].get(str(week_num), {})
                d_rule = rules["days"].get(day_name, {})
                
                return {
                    "week": week_num,
                    "day": day_name,
                    "week_desc": w_rule.get("description", ""),
                    "week_mod": w_rule.get("score_modifier", 0),
                    "day_note": d_rule.get("note", "")
                }
        except Exception as e:
            print(f"⚠️ Seasonality Load Error: {e}")
            
        return {"week": 1, "day": day_name, "week_mod": 0, "day_note": "No Data"}

    def _load_statistical_bias(self):
        try:
            import json
            import os
            path = os.path.join(os.path.dirname(__file__), "statistical_bias.json")
            if os.path.exists(path):
                with open(path, "r") as f:
                    return json.load(f)
        except Exception as e:
            print(f"⚠️ Failed to load statistical bias: {e}")
        return {}

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
        atr = market_data.get("atr", price * 0.01) # Default to 1% if ATR missing
        
        # Fetch components
        cot = self.cot.get_cot_bias(asset)
        news = self.news.get_news_sentiment()
        stat_bias = self._load_statistical_bias().get(asset, {})
        
        # Calculate Base Score (-1 to 1)
        score_vix = 0
        score_macro = 0
        score_cot = 0
        score_tech = 0 
        score_stat = stat_bias.get("seasonal_score", 0.0)

        # Technical Score from TradingView TA
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
            
        # Weighted Sum
        # Default Weights + Stat Bias Weight
        w = self.weights.get(asset, {"vix":0.2, "macro":0.2, "news":0.1, "cot":0.1})
        w_stat = 0.15 # User Bias weight
        
        # Normalize weights
        current_sum = sum(w.values()) + w_stat
        if current_sum >= 1.0:
            factor = 0.9 / current_sum
            w = {k: v*factor for k,v in w.items()}
            w_stat *= factor
            
        w_tech = 1.0 - sum(w.values()) - w_stat
        
        # SEASONALITY AMPLIFIER
        # Week 1 (Range) -> Score Tech reduced
        # Week 4 (Trend) -> Score Tech amplified
        season = self._get_seasonality_data()
        seas_mod = season.get("week_mod", 0.0) # 0.0 to 0.8
        
        # If Week 1 (Low Vol), we dampen the technical trend score
        # If Week 4 (High Trend), we boost it
        # Base modifier is 1.0. 
        # Week 1: mod=0.0 -> multiplier = 0.8 (Dampen)
        # Week 4: mod=0.8 -> multiplier = 1.2 (Boost)
        seas_multiplier = 0.8 + (seas_mod * 0.5) 
        
        score_tech_adjusted = score_tech * seas_multiplier

        total_score = (score_vix * w.get("vix",0)) + \
                      (score_macro * w.get("macro",0)) + \
                      (score_cot * w.get("cot",0)) + \
                      (score_stat * w_stat) + \
                      (score_tech_adjusted * w_tech)
        
        # Convert to Direction & Probability
        direction = "NEUTRAL"
        prob = 50 + (total_score * 40) 
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
        # Add Seasonality Driver
        drivers.append(f"Seasonality: Week {season['week']} ({season['week_desc']})")
        if season['day_note']: drivers.append(f"Day Bias: {season['day_note']}")

        # Hourly Volatility Check
        hourly_vol = market_data.get("hourly_vol_avg", 0.0)
        if hourly_vol > 0:
            # Check if current range is exhausted? For now just report typical range
            pass
            
        if abs(score_stat) > 0.4: drivers.append(f"User Bias ({stat_bias.get('notes', 'Seasonal')})")
        if abs(score_vix) > 0.4: drivers.append("VIX Regime")
        if abs(score_macro) > 0.4: drivers.append("Macro Factors")
        if abs(score_cot) > 0.4: drivers.append("COT Positioning")
        if abs(score_tech) > 0.6: drivers.append("Technical Trend")
        
        # Invalidation Level using ATR + Hourly Vol
        # If hourly vol is high, maybe widen stop? 
        # For now, let's keep it simple: 1.5 ATR.
        multiplier = 1.5
        inv_level = price - (multiplier * atr) if direction == "UP" else price + (multiplier * atr)
        
        # Formatting for readability
        inv_fmt = f"{inv_level:.2f}"
        
        # Append Volatility Info to drivers for visibility
        if hourly_vol > 0:
            drivers.append(f"Hourly Vol (Avg): {hourly_vol:.2f}")

        return AssetCard(
            asset=asset,
            direction=direction,
            probability=round(prob, 1),
            impulse=impulse,
            drivers=drivers[:5],
            invalidation_level=inv_fmt,
            scores={
                "vix": round(score_vix, 2), 
                "macro": round(score_macro, 2), 
                "cot": round(score_cot, 2),
                "tech": round(score_tech, 2),
                "user_bias": round(score_stat, 2)
            },
            timestamp=datetime.now().isoformat()
        )
