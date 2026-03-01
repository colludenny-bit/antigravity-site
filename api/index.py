"""
Vercel Serverless Function Entry Point
Lightweight API handler for auth, profile, subscriptions, and Stripe payments.
Heavy operations (engine, AI, market data) run on the local/dedicated backend.
"""
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, UploadFile, File, Form
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import Optional, Dict, List, Any
import asyncio
import os
import sys
import uuid
import bcrypt
import jwt
import json
import hashlib
import random
import math
import re
import io
from urllib import parse as urllib_parse
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
import requests
try:
    from .market_intelligence import (
        STRATEGY_CATALOG,
        build_cot_snapshot,
        build_engine_cards,
        build_multi_source_snapshot,
        build_news_briefing,
        build_strategy_projections,
        canonical_strategy_id,
    )
except ImportError:
    from market_intelligence import (
        STRATEGY_CATALOG,
        build_cot_snapshot,
        build_engine_cards,
        build_multi_source_snapshot,
        build_news_briefing,
        build_strategy_projections,
        canonical_strategy_id,
    )

# Load env
from dotenv import load_dotenv
from pathlib import Path
if not os.environ.get("VERCEL"):
    load_dotenv(Path(__file__).parent.parent / 'backend' / '.env')

PROJECT_ROOT = Path(__file__).parent.parent
BACKEND_DIR = PROJECT_ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.append(str(BACKEND_DIR))

# ==================== CONFIG ====================
JWT_SECRET = os.environ.get('JWT_SECRET', '').strip()
if not JWT_SECRET:
    raise RuntimeError("JWT_SECRET is required in environment variables.")
if len(JWT_SECRET) < 32:
    raise RuntimeError("JWT_SECRET must be at least 32 characters.")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24

# Stripe Config
STRIPE_SECRET_KEY = os.environ.get('STRIPE_SECRET_KEY', '')
STRIPE_WEBHOOK_SECRET = os.environ.get('STRIPE_WEBHOOK_SECRET', '')
STRIPE_MODE = bool(STRIPE_SECRET_KEY)

# Verification / Delivery providers
RESEND_API_KEY = os.environ.get('RESEND_API_KEY', '')
RESEND_FROM_EMAIL = os.environ.get('RESEND_FROM_EMAIL', 'no-reply@karion.it')
TWILIO_ACCOUNT_SID = os.environ.get('TWILIO_ACCOUNT_SID', '')
TWILIO_AUTH_TOKEN = os.environ.get('TWILIO_AUTH_TOKEN', '')
TWILIO_FROM_NUMBER = os.environ.get('TWILIO_FROM_NUMBER', '')

if STRIPE_MODE:
    import stripe
    stripe.api_key = STRIPE_SECRET_KEY

# ==================== PLANS CONFIG ====================
PLANS = {
    'essential-monthly': {
        'name': 'Essential', 'period': 'monthly', 'price_eur': 14.99,
        'stripe_price_id': os.environ.get('STRIPE_PRICE_ESSENTIAL_MONTHLY', ''),
        'feature_flags': {
            'access_dashboard': True, 'market_screening': 2,
            'news_feed': True, 'charts': True, 'calculator': True,
            'journal': 50, 'statistics': True,
            'cot': False, 'options_flow': False, 'macro': False,
            'ai_copilot': False, 'monte_carlo': False, 'report': False,
        },
    },
    'essential-annual': {
        'name': 'Essential', 'period': 'annual', 'price_eur': 152.90,
        'stripe_price_id': os.environ.get('STRIPE_PRICE_ESSENTIAL_ANNUAL', ''),
        'feature_flags': {
            'access_dashboard': True, 'market_screening': 2,
            'news_feed': True, 'charts': True, 'calculator': True,
            'journal': 50, 'statistics': True,
            'cot': False, 'options_flow': False, 'macro': False,
            'ai_copilot': False, 'monte_carlo': False, 'report': False,
        },
    },
    'plus-monthly': {
        'name': 'Plus', 'period': 'monthly', 'price_eur': 29.99,
        'stripe_price_id': os.environ.get('STRIPE_PRICE_PLUS_MONTHLY', ''),
        'feature_flags': {
            'access_dashboard': True, 'market_screening': -1,
            'news_feed': True, 'charts': True, 'calculator': True,
            'journal': -1, 'statistics': True,
            'cot': True, 'options_flow': True, 'macro': True,
            'ai_copilot': 50, 'monte_carlo': False, 'report': False,
        },
    },
    'plus-annual': {
        'name': 'Plus', 'period': 'annual', 'price_eur': 287.90,
        'stripe_price_id': os.environ.get('STRIPE_PRICE_PLUS_ANNUAL', ''),
        'feature_flags': {
            'access_dashboard': True, 'market_screening': -1,
            'news_feed': True, 'charts': True, 'calculator': True,
            'journal': -1, 'statistics': True,
            'cot': True, 'options_flow': True, 'macro': True,
            'ai_copilot': 50, 'monte_carlo': False, 'report': False,
        },
    },
    'pro-monthly': {
        'name': 'Pro', 'period': 'monthly', 'price_eur': 49.99,
        'stripe_price_id': os.environ.get('STRIPE_PRICE_PRO_MONTHLY', ''),
        'feature_flags': {
            'access_dashboard': True, 'market_screening': -1,
            'news_feed': True, 'charts': True, 'calculator': True,
            'journal': -1, 'statistics': True,
            'cot': True, 'options_flow': True, 'macro': True,
            'ai_copilot': -1, 'monte_carlo': True, 'report': True,
        },
    },
    'pro-annual': {
        'name': 'Pro', 'period': 'annual', 'price_eur': 449.91,
        'stripe_price_id': os.environ.get('STRIPE_PRICE_PRO_ANNUAL', ''),
        'feature_flags': {
            'access_dashboard': True, 'market_screening': -1,
            'news_feed': True, 'charts': True, 'calculator': True,
            'journal': -1, 'statistics': True,
            'cot': True, 'options_flow': True, 'macro': True,
            'ai_copilot': -1, 'monte_carlo': True, 'report': True,
        },
    },
}

# Demo Mode
DEMO_MODE = False
demo_users = {}
demo_subscriptions = {}
demo_preferences = {}
demo_strategies = {}
demo_trades = {}
demo_journal_entries = {}
demo_community_posts = []
demo_backtests = {}

ROME_TZ = ZoneInfo("Europe/Rome")
COLLECTION_STATE_DOC_ID = "collection_control"
SUNDAY_OPEN_MINUTES = 5          # 00:05
FRIDAY_CLOSE_HOUR = 23           # 23:00
FRIDAY_CLOSE_MINUTES = FRIDAY_CLOSE_HOUR * 60

# MongoDB
try:
    mongo_url = os.environ.get('MONGO_URL', '')
    if not mongo_url:
        raise Exception("No MONGO_URL")
    client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=5000)
    db = client[os.environ.get('DB_NAME', 'karion_trading_os')]
except Exception as e:
    DEMO_MODE = True
    db = None
    demo_users["test@test.com"] = {
        "id": "demo-user-123",
        "email": "test@test.com",
        "name": "Demo Trader",
        "password": bcrypt.hashpw("password123".encode('utf-8'), bcrypt.gensalt()).decode('utf-8'),
        "created_at": "2024-01-01T00:00:00Z",
        "level": "Trader Intermedio",
        "xp": 1500,
        "auth_provider": "password",
        "linked_accounts": [{"provider": "password", "identifier": "test@test.com", "added_at": "2024-01-01T00:00:00Z"}],
        "email_verified": True,
        "phone_number": None,
        "phone_verified": False,
    }

# ==================== APP ====================
app = FastAPI(title="Karion API")


def resolve_cors_origins() -> List[str]:
    default_origins = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://www.karion.it",
    ]
    raw_origins = os.environ.get("CORS_ORIGINS", "").strip()
    if not raw_origins:
        return default_origins
    origins = []
    for item in raw_origins.split(","):
        origin = item.strip().rstrip("/")
        if origin.startswith(("http://", "https://")):
            origins.append(origin)
    return origins or default_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=resolve_cors_origins(),
    allow_origin_regex=os.environ.get(
        "CORS_ORIGIN_REGEX",
        r"https://.*\.vercel\.app|https://.*\.karion\.it|https://www\.karion\.it",
    ),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

COINGECKO_BASE_URL = "https://api.coingecko.com/api/v3"

# CoinGecko Proxy Cache for Serverless (Best effort)
_cg_cache = {
    "top30": {"data": None, "timestamp": None},
    "global": {"data": None, "timestamp": None},
    "trending": {"data": None, "timestamp": None},
    "coins": {},
    "charts": {}
}
CG_CACHE_TTL = 300 # 5 minutes

# Best-effort cache for serverless hot instances
_intelligence_cache = {
    "multi": {"data": None, "timestamp": None},
    "cot": {"data": None, "timestamp": None},
    "engine": {"data": None, "timestamp": None},
    "news": {"data": None, "timestamp": None},
    "projections": {"data": None, "timestamp": None},
}
INTELLIGENCE_CACHE_TTL = 45  # seconds
_breadth_cache = {"data": None, "timestamp": None}
ALLOWED_MARKET_HOSTS = {"www.barchart.com", "query1.finance.yahoo.com"}


def _validated_external_url(url: str, allowed_hosts: set) -> str:
    parsed = urllib_parse.urlparse(url)
    if parsed.scheme != "https" or parsed.hostname not in allowed_hosts:
        raise ValueError(f"Blocked outbound URL: {url}")
    return url

# Market Breadth pipeline config (single source of truth)
BREADTH_REFRESH_INTERVAL_HOURS = 4
BREADTH_REFRESH_INTERVAL_MINUTES = (BREADTH_REFRESH_INTERVAL_HOURS * 60) + 1
BREADTH_CACHE_TTL = BREADTH_REFRESH_INTERVAL_MINUTES * 60
BREADTH_TIMEFRAME = "4h"
BREADTH_INTRADAY_FETCH = {
    "range": "6mo",
    "interval": "1h",
}
BREADTH_INTRADAY_FALLBACK = {
    "range": "1y",
    "interval": "1d",
}
BREADTH_RESAMPLE_HOURS = 4
BREADTH_WINDOWS = {
    "ma_fast": 50,
    "ma_slow": 200,
}
BREADTH_PRICE_HISTORY_POINTS = 260
BREADTH_HISTORY_POINTS = 60
BREADTH_REGIME_THRESHOLDS = {
    "bullish_ma50_min": 70.0,
    "bullish_ma200_min": 60.0,
    "weak_ma50_max": 35.0,
    "weak_ma200_max": 40.0,
}
BREADTH_SYMBOL_MAP = {
    "SP500": {"kind": "index_indicator", "ma50": "$S5FI", "ma200": "$S5TH", "total_components": 503, "price_symbol": "^GSPC"},
    "NAS100": {"kind": "index_indicator", "ma50": "$NDFI", "ma200": "$NDTH", "total_components": 101, "price_symbol": "^NDX"},
    "XAUUSD": {"kind": "price_proxy", "total_components": 100, "price_symbol": "GC=F"},
    "EURUSD": {"kind": "price_proxy", "total_components": 100, "price_symbol": "EURUSD=X"},
}

_verification_cache = {}
VERIFICATION_TTL_MINUTES = 15

@app.get("/api/market/prices")
async def get_market_prices():
    try:
        url = f"{COINGECKO_BASE_URL}/simple/price"
        params = {
            "ids": "bitcoin,ethereum,solana,ripple,cardano",
            "vs_currencies": "usd",
            "include_24hr_change": "true",
            "include_24hr_vol": "true",
            "include_market_cap": "true"
        }
        import httpx
        async with httpx.AsyncClient() as client:
            response = await client.get(url, params=params)
            return response.json()
    except Exception as e:
        print(f"Market prices error: {e}")
        # Fallback data to prevent 500s
        return {
            "bitcoin": {"usd": 65000, "usd_24h_change": 1.5, "usd_24h_vol": 30000000000, "usd_market_cap": 1200000000000},
            "ethereum": {"usd": 3500, "usd_24h_change": -0.5, "usd_24h_vol": 15000000000, "usd_market_cap": 400000000000},
            "solana": {"usd": 150, "usd_24h_change": 2.1, "usd_24h_vol": 2000000000, "usd_market_cap": 70000000000},
            "ripple": {"usd": 0.60, "usd_24h_change": 0.1, "usd_24h_vol": 1000000000, "usd_market_cap": 30000000000},
            "cardano": {"usd": 0.45, "usd_24h_change": -1.2, "usd_24h_vol": 500000000, "usd_market_cap": 15000000000}
        }

@app.get("/api/market/trending")
async def get_trending():
    try:
        url = f"{COINGECKO_BASE_URL}/search/trending"
        import httpx
        async with httpx.AsyncClient() as client:
            response = await client.get(url)
            return response.json()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/market/coin/{id}")
async def get_coin_details(id: str):
    try:
        url = f"{COINGECKO_BASE_URL}/coins/{id}"
        params = {
            "localization": "false",
            "tickers": "false",
            "market_data": "true",
            "community_data": "true",
            "developer_data": "true",
            "sparkline": "true"
        }
        import httpx
        async with httpx.AsyncClient() as client:
            response = await client.get(url, params=params)
            return response.json()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/market/top30")
async def get_top30():
    global _cg_cache
    now = datetime.now(timezone.utc)
    
    # Best-effort cache for reused instances
    if _cg_cache["top30"]["data"] and _cg_cache["top30"]["timestamp"]:
        if (now - _cg_cache["top30"]["timestamp"]).total_seconds() < CG_CACHE_TTL:
            return _cg_cache["top30"]["data"]

    try:
        url = f"{COINGECKO_BASE_URL}/coins/markets"
        params = {
            "vs_currency": "usd",
            "order": "market_cap_desc",
            "per_page": 30,
            "page": 1,
            "sparkline": "true",
            "price_change_percentage": "1h,24h,7d"
        }
        import httpx
        async with httpx.AsyncClient() as client:
            response = await client.get(url, params=params)
            
            if response.status_code == 429:
                return _cg_cache["top30"]["data"] if _cg_cache["top30"]["data"] else []
                
            data = response.json()
            _cg_cache["top30"] = {"data": data, "timestamp": now}
            return data
    except Exception:
        return _cg_cache["top30"]["data"] if _cg_cache["top30"]["data"] else []

@app.get("/api/market/chart/{id}")
async def get_coin_chart(id: str, days: int = 7):
    global _cg_cache
    now = datetime.now(timezone.utc)
    cache_key = f"{id}_{days}"
    
    if cache_key in _cg_cache["charts"] and _cg_cache["charts"][cache_key]["timestamp"]:
        if (now - _cg_cache["charts"][cache_key]["timestamp"]).total_seconds() < CG_CACHE_TTL:
            return _cg_cache["charts"][cache_key]["data"]

    try:
        url = f"{COINGECKO_BASE_URL}/coins/{id}/market_chart"
        params = {
            "vs_currency": "usd",
            "days": days
        }
        import httpx
        async with httpx.AsyncClient() as client:
            response = await client.get(url, params=params)
            
            if response.status_code == 429:
                return _cg_cache["charts"].get(cache_key, {}).get("data", {"prices": []})
                
            data = response.json()
            _cg_cache["charts"][cache_key] = {"data": data, "timestamp": now}
            return data
    except Exception:
        return _cg_cache["charts"].get(cache_key, {}).get("data", {"prices": []})

@app.get("/api/market/global")
async def get_global_data():
    global _cg_cache
    now = datetime.now(timezone.utc)
    
    if _cg_cache["global"]["data"] and _cg_cache["global"]["timestamp"]:
        if (now - _cg_cache["global"]["timestamp"]).total_seconds() < CG_CACHE_TTL:
            return _cg_cache["global"]["data"]

    try:
        url = f"{COINGECKO_BASE_URL}/global"
        import httpx
        async with httpx.AsyncClient() as client:
            response = await client.get(url)
            
            if response.status_code == 429:
                return _cg_cache["global"]["data"]

            data = response.json()
            result = data.get("data")
            _cg_cache["global"] = {"data": result, "timestamp": now}
            return result
    except Exception:
        return _cg_cache["global"]["data"]

def _cache_get(key: str):
    slot = _intelligence_cache.get(key)
    if not slot or not slot["timestamp"]:
        return None
    if (datetime.now(timezone.utc) - slot["timestamp"]).total_seconds() > INTELLIGENCE_CACHE_TTL:
        return None
    return slot["data"]


def _cache_set(key: str, value):
    _intelligence_cache[key] = {"data": value, "timestamp": datetime.now(timezone.utc)}


def _parse_barchart_inline_payload(html: str):
    match = re.search(
        r'<script type="application/json" id="barchart-www-inline-data">(.*?)</script>',
        html,
        re.DOTALL
    )
    if not match:
        return None
    try:
        return json.loads(match.group(1))
    except Exception:
        return None


def _fetch_barchart_indicator_value(symbol: str):
    encoded_symbol = f"%24{symbol[1:]}" if symbol.startswith("$") else symbol
    url = _validated_external_url(
        f"https://www.barchart.com/stocks/quotes/{encoded_symbol}",
        ALLOWED_MARKET_HOSTS,
    )
    response = requests.get(
        url,
        headers={"User-Agent": "Mozilla/5.0 (compatible; Karion/1.0)"},
        timeout=15,
    )
    response.raise_for_status()
    html = response.text

    payload = _parse_barchart_inline_payload(html)
    if not payload:
        return None

    quote = payload.get(symbol, {}).get("quote", {})
    value = quote.get("previousClose")
    trade_time = quote.get("tradeTime")
    try:
        pct = float(value)
    except (TypeError, ValueError):
        return None
    return {"pct": pct, "trade_time": trade_time}


def _derive_breadth_regime(ma50_pct: float, ma200_pct: float) -> str:
    if (
        ma50_pct >= BREADTH_REGIME_THRESHOLDS["bullish_ma50_min"]
        and ma200_pct >= BREADTH_REGIME_THRESHOLDS["bullish_ma200_min"]
    ):
        return "broad-bullish"
    if (
        ma50_pct <= BREADTH_REGIME_THRESHOLDS["weak_ma50_max"]
        and ma200_pct <= BREADTH_REGIME_THRESHOLDS["weak_ma200_max"]
    ):
        return "broad-weakness"
    return "mixed"


def _clamp_pct(value: float) -> float:
    return max(0.0, min(100.0, value))


def _fetch_index_price_history(
    index_symbol: str,
    max_points: int = BREADTH_HISTORY_POINTS,
    range_param: str = BREADTH_INTRADAY_FETCH["range"]
):
    encoded_symbol = urllib_parse.quote(index_symbol, safe="")
    url = _validated_external_url(
        f"https://query1.finance.yahoo.com/v8/finance/chart/{encoded_symbol}"
        f"?range={range_param}&interval={BREADTH_INTRADAY_FETCH['interval']}",
        ALLOWED_MARKET_HOSTS,
    )

    try:
        response = requests.get(
            url,
            headers={"User-Agent": "Mozilla/5.0 (compatible; Karion/1.0)"},
            timeout=20,
        )
        response.raise_for_status()
        payload = response.json()
    except Exception:
        fallback_url = _validated_external_url(
            f"https://query1.finance.yahoo.com/v8/finance/chart/{encoded_symbol}"
            f"?range={BREADTH_INTRADAY_FALLBACK['range']}&interval={BREADTH_INTRADAY_FALLBACK['interval']}",
            ALLOWED_MARKET_HOSTS,
        )
        fallback_response = requests.get(
            fallback_url,
            headers={"User-Agent": "Mozilla/5.0 (compatible; Karion/1.0)"},
            timeout=20,
        )
        fallback_response.raise_for_status()
        payload = fallback_response.json()

    result = (payload or {}).get("chart", {}).get("result", [])
    if not result:
        return []
    row = result[0]
    timestamps = row.get("timestamp") or []
    closes = (((row.get("indicators") or {}).get("quote") or [{}])[0].get("close") or [])

    points = []
    for ts, close in zip(timestamps, closes):
        try:
            if close is None:
                continue
            close_val = float(close)
            dt = datetime.fromtimestamp(int(ts), tz=timezone.utc)
            points.append({"dt": dt, "price": close_val})
        except Exception:
            continue

    if not points:
        return []

    points.sort(key=lambda p: p["dt"])
    bucketed = {}
    for point in points:
        dt = point["dt"]
        bucket_hour = dt.hour - (dt.hour % BREADTH_RESAMPLE_HOURS)
        bucket = dt.replace(hour=bucket_hour, minute=0, second=0, microsecond=0)
        bucketed[bucket] = float(point["price"])

    resampled = []
    for bucket_dt in sorted(bucketed.keys()):
        resampled.append({
            "date": bucket_dt.strftime("%Y-%m-%d %H:%M"),
            "price": float(bucketed[bucket_dt])
        })

    if len(resampled) > max_points:
        resampled = resampled[-max_points:]
    return resampled


def _moving_average(values: List[float], window: int):
    if window <= 0:
        return [None for _ in values]
    out = [None for _ in values]
    rolling_sum = 0.0
    for idx, val in enumerate(values):
        rolling_sum += float(val)
        if idx >= window:
            rolling_sum -= float(values[idx - window])
        if idx >= window - 1:
            out[idx] = rolling_sum / float(window)
    return out


def _rolling_flag_pct(flags: List[Optional[int]], window: int):
    if window <= 0:
        return [None for _ in flags]
    out = [None for _ in flags]
    valid_sum = 0
    valid_count = 0
    queue: List[Optional[int]] = []

    for idx, flag in enumerate(flags):
        queue.append(flag)
        if flag is not None:
            valid_sum += int(flag)
            valid_count += 1

        if len(queue) > window:
            removed = queue.pop(0)
            if removed is not None:
                valid_sum -= int(removed)
                valid_count -= 1

        if len(queue) == window and valid_count > 0:
            out[idx] = (float(valid_sum) / float(valid_count)) * 100.0
    return out


def _build_price_proxy_history(price_history: List[Dict], max_points: int = BREADTH_HISTORY_POINTS):
    if not price_history:
        return []

    prices = []
    dates = []
    for point in price_history:
        price = point.get("price")
        date = point.get("date")
        if not isinstance(price, (int, float)) or not date:
            continue
        prices.append(float(price))
        dates.append(str(date))

    if len(prices) < BREADTH_WINDOWS["ma_slow"]:
        return []

    ma50 = _moving_average(prices, BREADTH_WINDOWS["ma_fast"])
    ma200 = _moving_average(prices, BREADTH_WINDOWS["ma_slow"])
    above50_flags = [None if ma50[idx] is None else (1 if prices[idx] > ma50[idx] else 0) for idx in range(len(prices))]
    above200_flags = [None if ma200[idx] is None else (1 if prices[idx] > ma200[idx] else 0) for idx in range(len(prices))]
    above50_pct_series = _rolling_flag_pct(above50_flags, BREADTH_WINDOWS["ma_fast"])
    above200_pct_series = _rolling_flag_pct(above200_flags, BREADTH_WINDOWS["ma_slow"])
    precision = 5 if (sum(prices) / len(prices)) < 10 else 2

    history = []
    for idx, price in enumerate(prices):
        ma50_pct = above50_pct_series[idx]
        ma200_pct = above200_pct_series[idx]
        if ma50_pct is None or ma200_pct is None or ma50[idx] is None or ma200[idx] is None:
            continue
        history.append({
            "date": dates[idx],
            "price": round(price, precision),
            "ma50_value": round(float(ma50[idx]), precision),
            "ma200_value": round(float(ma200[idx]), precision),
            "above_ma50_pct": round(float(ma50_pct), 2),
            "above_ma200_pct": round(float(ma200_pct), 2),
        })

    if len(history) > max_points:
        history = history[-max_points:]
    return history


def _build_modeled_breadth_history(current_ma50: float, current_ma200: float, price_history: List[Dict]):
    if not price_history:
        return []

    first_price = price_history[0].get("price")
    if not isinstance(first_price, (int, float)) or first_price <= 0:
        return []

    rel_moves = []
    for point in price_history:
        price = point.get("price")
        if not isinstance(price, (int, float)):
            rel_moves.append(0.0)
            continue
        rel_moves.append((float(price) - float(first_price)) / float(first_price))

    max_abs_move = max(max((abs(v) for v in rel_moves), default=0.0), 0.01)
    normalized_moves = [v / max_abs_move for v in rel_moves]

    ma50_series = []
    ma200_series = []
    for idx, move in enumerate(normalized_moves):
        wave = math.sin(idx / 4.5)
        ma50_val = _clamp_pct(current_ma50 + (move * 12.0) + (wave * 1.6))
        ma200_val = _clamp_pct(current_ma200 + (move * 8.0) + (wave * 1.1))
        ma50_series.append(ma50_val)
        ma200_series.append(ma200_val)

    # Anchor the last point to the live indicator snapshot.
    delta_50 = current_ma50 - ma50_series[-1]
    delta_200 = current_ma200 - ma200_series[-1]
    ma50_series = [_clamp_pct(v + delta_50) for v in ma50_series]
    ma200_series = [_clamp_pct(v + delta_200) for v in ma200_series]

    modeled = []
    for idx, point in enumerate(price_history):
        modeled.append({
            "date": point["date"],
            "price": point["price"],
            "above_ma50_pct": round(ma50_series[idx], 2),
            "above_ma200_pct": round(ma200_series[idx], 2),
        })
    return modeled


def _build_breadth_index_payload(index_key: str):
    config = BREADTH_SYMBOL_MAP[index_key]
    ma50_raw = _fetch_barchart_indicator_value(config["ma50"])
    ma200_raw = _fetch_barchart_indicator_value(config["ma200"])
    if not ma50_raw or not ma200_raw:
        return None

    ma50_pct = round(max(0.0, min(100.0, float(ma50_raw["pct"]))), 2)
    ma200_pct = round(max(0.0, min(100.0, float(ma200_raw["pct"]))), 2)
    total = int(config["total_components"])
    ma50_count = int(round((ma50_pct / 100.0) * total))
    ma200_count = int(round((ma200_pct / 100.0) * total))
    as_of_time = ma50_raw.get("trade_time") or ma200_raw.get("trade_time") or ""
    as_of_date = as_of_time[:10] if as_of_time else None
    price_history = []
    modeled_history = []
    latest_price = None

    try:
        price_history = _fetch_index_price_history(config["price_symbol"], max_points=BREADTH_HISTORY_POINTS)
    except Exception:
        price_history = []

    if price_history:
        modeled_history = _build_modeled_breadth_history(ma50_pct, ma200_pct, price_history)
        latest_price = price_history[-1]["price"]

    payload = {
        "total_components": total,
        "processed": total,
        "coverage_pct": 100.0,
        "as_of_date": as_of_date,
        "breadth_regime": _derive_breadth_regime(ma50_pct, ma200_pct),
        "above_ma50": {"count": ma50_count, "pct": ma50_pct},
        "above_ma200": {"count": ma200_count, "pct": ma200_pct},
        "missing_components": 0,
        "missing_examples": [],
        "latest_price": latest_price,
    }
    if modeled_history:
        payload["history"] = modeled_history
    return payload


def _build_price_proxy_breadth_payload(index_key: str):
    config = BREADTH_SYMBOL_MAP[index_key]
    total = int(config.get("total_components", 100))
    price_symbol = config.get("price_symbol")
    if not price_symbol:
        return None

    try:
        price_history = _fetch_index_price_history(
            price_symbol,
            max_points=BREADTH_PRICE_HISTORY_POINTS,
            range_param=BREADTH_INTRADAY_FALLBACK["range"]
        )
    except Exception:
        price_history = []

    history = _build_price_proxy_history(price_history, max_points=BREADTH_HISTORY_POINTS)
    if not history:
        return None

    latest = history[-1]
    ma50_pct = round(float(latest["above_ma50_pct"]), 2)
    ma200_pct = round(float(latest["above_ma200_pct"]), 2)
    ma50_count = int(round((ma50_pct / 100.0) * total))
    ma200_count = int(round((ma200_pct / 100.0) * total))

    payload = {
        "total_components": total,
        "processed": total,
        "coverage_pct": 100.0,
        "as_of_date": latest.get("date"),
        "breadth_regime": _derive_breadth_regime(ma50_pct, ma200_pct),
        "above_ma50": {"count": ma50_count, "pct": ma50_pct},
        "above_ma200": {"count": ma200_count, "pct": ma200_pct},
        "missing_components": 0,
        "missing_examples": [],
        "latest_ma50": latest.get("ma50_value"),
        "latest_ma200": latest.get("ma200_value"),
        "latest_price": latest.get("price"),
        "history": history,
    }
    return payload


def _fetch_market_breadth_payload():
    sp_payload = _build_breadth_index_payload("SP500")
    nas_payload = _build_breadth_index_payload("NAS100")
    if not sp_payload or not nas_payload:
        raise RuntimeError("Unable to fetch market breadth indicators")
    xau_payload = _build_price_proxy_breadth_payload("XAUUSD")
    eur_payload = _build_price_proxy_breadth_payload("EURUSD")

    symbols_meta = {}
    for key, cfg in BREADTH_SYMBOL_MAP.items():
        if cfg.get("ma50"):
            symbols_meta[f"{key}_ma50"] = cfg["ma50"]
        if cfg.get("ma200"):
            symbols_meta[f"{key}_ma200"] = cfg["ma200"]
        if cfg.get("price_symbol"):
            symbols_meta[f"{key}_price"] = cfg["price_symbol"]

    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "source": {
            "provider": "barchart",
            "symbols": symbols_meta,
            "method": "index_breadth_indicators_plus_price_proxy_ma50_ma200_history",
            "timeframe": BREADTH_TIMEFRAME,
            "refresh_interval_hours": BREADTH_REFRESH_INTERVAL_HOURS,
            "refresh_interval_minutes": BREADTH_REFRESH_INTERVAL_MINUTES,
            "tracked_tickers": list(BREADTH_SYMBOL_MAP.keys()),
        },
        "indices": {
            "SP500": sp_payload,
            "NAS100": nas_payload,
            **({"XAUUSD": xau_payload} if xau_payload else {}),
            **({"EURUSD": eur_payload} if eur_payload else {}),
        },
    }


def _build_intelligence_bundle():
    now = datetime.now(timezone.utc)
    multi = build_multi_source_snapshot(now)
    cot = build_cot_snapshot(multi["analyses"], now)
    briefing = build_news_briefing(now)
    engine_cards = build_engine_cards(multi["analyses"], cot["data"], now)
    projections = build_strategy_projections(multi["analyses"], cot["data"], briefing, now)
    return {
        "multi": multi,
        "cot": cot,
        "news": briefing,
        "engine": engine_cards,
        "projections": projections,
    }


def _get_intelligence_bundle():
    cached_multi = _cache_get("multi")
    cached_cot = _cache_get("cot")
    cached_news = _cache_get("news")
    cached_engine = _cache_get("engine")
    cached_proj = _cache_get("projections")
    if cached_multi and cached_cot and cached_news and cached_engine and cached_proj:
        return {
            "multi": cached_multi,
            "cot": cached_cot,
            "news": cached_news,
            "engine": cached_engine,
            "projections": cached_proj,
        }

    fresh = _build_intelligence_bundle()
    _cache_set("multi", fresh["multi"])
    _cache_set("cot", fresh["cot"])
    _cache_set("news", fresh["news"])
    _cache_set("engine", fresh["engine"])
    _cache_set("projections", fresh["projections"])
    return fresh


@app.get("/api/analysis/multi-source")
async def get_multi_source_analysis():
    return _get_intelligence_bundle()["multi"]


@app.get("/api/market/breadth")
async def get_market_breadth():
    global _breadth_cache
    now = datetime.now(timezone.utc)

    if _breadth_cache["data"] and _breadth_cache["timestamp"]:
        age = (now - _breadth_cache["timestamp"]).total_seconds()
        if age < BREADTH_CACHE_TTL:
            return _breadth_cache["data"]

    try:
        payload = _fetch_market_breadth_payload()
        _breadth_cache = {"data": payload, "timestamp": now}
        return payload
    except Exception as exc:
        if _breadth_cache["data"] and _breadth_cache["timestamp"]:
            stale_age = int((now - _breadth_cache["timestamp"]).total_seconds())
            return {
                **_breadth_cache["data"],
                "cache_stale": True,
                "cache_age_seconds": stale_age,
                "warning": f"breadth refresh failed: {str(exc)}",
            }
        raise HTTPException(status_code=503, detail="Market breadth temporarily unavailable")


@app.get("/api/cot/data")
async def get_cot_data():
    return _get_intelligence_bundle()["cot"]


@app.get("/api/engine/cards")
async def get_engine_cards():
    return _get_intelligence_bundle()["engine"]


@app.get("/api/news/briefing")
async def get_news_briefing():
    return _get_intelligence_bundle()["news"]


@app.get("/api/strategy/catalog")
async def get_strategy_catalog():
    return {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "strategies": [
            {
                "id": strategy["id"],
                "aliases": strategy["aliases"],
                "name": strategy["name"],
                "short_name": strategy["short_name"],
                "win_rate": strategy["win_rate"],
                "assets": strategy["assets"],
                "trigger": strategy["trigger"],
            }
            for strategy in STRATEGY_CATALOG
        ],
    }


@app.get("/api/strategy/projections")
async def get_strategy_projections(strategy_ids: Optional[str] = None):
    bundle = _get_intelligence_bundle()
    projections = bundle["projections"]
    if strategy_ids:
        requested = {canonical_strategy_id(raw_id.strip()) for raw_id in strategy_ids.split(",") if raw_id.strip()}
        projections = [
            projection
            for projection in projections
            if canonical_strategy_id(projection.get("strategy_id", "")) in requested
        ]
    return {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "sources": {
            "daily_bias_engine": "active",
            "crypto_bias_engine": "isolated",
            "news_cycle": "3h",
        },
        "summaries": bundle["news"]["summaries"],
        "projections": projections,
    }

api_router = APIRouter(prefix="/api")
security = HTTPBearer()

# ==================== MODELS ====================
class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    email: str
    name: str
    created_at: str
    level: str = "Novice"
    xp: int = 0

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

class CheckoutRequest(BaseModel):
    plan_slug: str
    coupon_code: Optional[str] = None

class CheckoutResponse(BaseModel):
    checkout_url: str
    session_id: str

class SubscriptionResponse(BaseModel):
    plan_slug: Optional[str] = None
    plan_name: Optional[str] = None
    status: str = "none"  # none | active | cancelled | expired
    feature_flags: dict = {}
    expires_at: Optional[str] = None
    cancel_at_period_end: bool = False


class PasswordCodeConfirmRequest(BaseModel):
    code: str
    new_password: str = Field(min_length=8, max_length=128)


class EmailChangeRequest(BaseModel):
    new_email: EmailStr


class EmailChangeConfirmRequest(BaseModel):
    new_email: EmailStr
    code: str


class PhoneCodeRequest(BaseModel):
    country_code: str = Field(min_length=2, max_length=5)
    phone_number: str = Field(min_length=6, max_length=20)
    channel: str = "sms"  # sms | email


class PhoneCodeConfirmRequest(BaseModel):
    country_code: str = Field(min_length=2, max_length=5)
    phone_number: str = Field(min_length=6, max_length=20)
    code: str


class CollectionControlInput(BaseModel):
    paused: Optional[bool] = None
    reason: str = ""
    auto_pause_market_closed: Optional[bool] = None


class AIMessage(BaseModel):
    role: str = "user"
    content: str = ""


class AIChatRequest(BaseModel):
    messages: List[AIMessage] = []
    context: str = "general"


class MonteCarloParams(BaseModel):
    win_rate: float = Field(default=0.55, ge=0.0, le=1.0)
    avg_win: float = Field(default=1.2, gt=0.0)
    avg_loss: float = Field(default=1.0, gt=0.0)
    num_trades: int = Field(default=100, ge=1, le=5000)
    initial_capital: float = Field(default=10000.0, gt=0.0)
    risk_per_trade: float = Field(default=0.01, ge=0.0, le=1.0)


class BacktestRequest(BaseModel):
    asset_class: str = ""
    timeframe: str = ""
    entry_conditions: str = ""
    exit_conditions: str = ""
    risk_management: str = ""
    trading_hours: str = ""


class BacktestResult(BaseModel):
    win_rate: float
    total_trades: int
    net_profit_pct: float
    risk_reward: str
    sharpe_ratio: float
    max_drawdown_pct: float
    profit_factor: float
    recovery_factor: float
    equity_curve: List[Dict[str, Any]]
    risk_pnl_series: List[Dict[str, Any]]
    log_messages: List[str]


class N8NRequest(BaseModel):
    prompt: str = ""
    context: Optional[Dict[str, Any]] = None


class UserPreferencesUpdate(BaseModel):
    selected_asset: Optional[str] = None
    sync_enabled: Optional[bool] = None
    chart_line_color: Optional[str] = None
    theme: Optional[str] = None

# ==================== AUTH HELPERS ====================
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        if DEMO_MODE:
            user = next((u for u in demo_users.values() if u["id"] == user_id), None)
            if user:
                return {k: v for k, v in user.items() if k != "password"}
        else:
            user = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0})
            if user:
                return user
        raise HTTPException(status_code=401, detail="User not found")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


def _public_user() -> Dict[str, Any]:
    return {
        "id": "public-user",
        "email": "public@karion.local",
        "name": "Karion Trader",
        "xp": 0,
        "level": "Novice",
    }


async def _get_optional_user(request: Request) -> Optional[Dict[str, Any]]:
    auth_header = (request.headers.get("authorization") or "").strip()
    if not auth_header.lower().startswith("bearer "):
        return None

    token = auth_header.split(" ", 1)[1].strip()
    if not token:
        return None

    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except Exception:
        return None

    user_id = payload.get("sub")
    if not user_id:
        return None

    if DEMO_MODE:
        user = next((u for u in demo_users.values() if u["id"] == user_id), None)
        if not user:
            return None
        return {k: v for k, v in user.items() if k != "password"}

    if db is None:
        return None

    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0})
    return user


def _user_id_or_public(user: Optional[Dict[str, Any]]) -> str:
    if user and user.get("id"):
        return str(user["id"])
    return "public-user"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalize_phone(country_code: str, phone_number: str) -> str:
    cc = country_code.strip()
    if not cc.startswith("+"):
        cc = f"+{cc}"
    phone = re.sub(r"[^0-9]", "", phone_number)
    return f"{cc}{phone}"


def _mask_email(email: str) -> str:
    if "@" not in email:
        return email
    local, domain = email.split("@", 1)
    if len(local) <= 2:
        local_masked = f"{local[0]}*" if local else "*"
    else:
        local_masked = f"{local[:2]}{'*' * max(2, len(local) - 2)}"
    return f"{local_masked}@{domain}"


def _mask_phone(phone: Optional[str]) -> Optional[str]:
    if not phone:
        return None
    if len(phone) <= 4:
        return "*" * len(phone)
    return f"{phone[:-4].replace(phone[:-4], '*' * len(phone[:-4]))}{phone[-4:]}"


def _generate_code() -> str:
    return f"{random.randint(0, 999999):06d}"


def _code_hash(user_id: str, purpose: str, target: str, code: str) -> str:
    payload = f"{user_id}|{purpose}|{target}|{code}|{JWT_SECRET}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


async def _send_email_code(email: str, code: str, purpose: str) -> str:
    if not RESEND_API_KEY:
        if DEMO_MODE:
            print(f"[DEV_EMAIL_CODE] {purpose} -> {email}: {code}")
            return "dev_log"
        return "unavailable"

    subject_map = {
        "password_change": "Codice verifica cambio password",
        "email_change": "Codice verifica cambio email",
        "phone_verify": "Codice verifica telefono",
    }
    subject = subject_map.get(purpose, "Codice verifica account")
    html = (
        f"<p>Ciao,</p><p>Il tuo codice di verifica e: <strong>{code}</strong>.</p>"
        "<p>Scade in 15 minuti.</p>"
    )
    try:
        import httpx

        async with httpx.AsyncClient(timeout=10.0) as client_http:
            response = await client_http.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {RESEND_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "from": RESEND_FROM_EMAIL,
                    "to": [email],
                    "subject": subject,
                    "html": html,
                },
            )
            if 200 <= response.status_code < 300:
                return "email"
            print(f"RESEND_ERROR {response.status_code}: {response.text}")
            return "failed"
    except Exception as exc:
        print(f"RESEND_EXCEPTION: {exc}")
        return "failed"


async def _send_sms_code(phone: str, code: str) -> str:
    if not (TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER):
        return "unavailable"
    try:
        import httpx

        url = f"https://api.twilio.com/2010-04-01/Accounts/{TWILIO_ACCOUNT_SID}/Messages.json"
        async with httpx.AsyncClient(timeout=10.0) as client_http:
            response = await client_http.post(
                url,
                auth=(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN),
                data={
                    "From": TWILIO_FROM_NUMBER,
                    "To": phone,
                    "Body": f"Karion code: {code} (15 min)",
                },
            )
            if 200 <= response.status_code < 300:
                return "sms"
            print(f"TWILIO_ERROR {response.status_code}: {response.text}")
            return "failed"
    except Exception as exc:
        print(f"TWILIO_EXCEPTION: {exc}")
        return "failed"


async def _store_verification_code(user_id: str, purpose: str, target: str, code: str):
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=VERIFICATION_TTL_MINUTES)
    code_hash = _code_hash(user_id, purpose, target, code)

    if DEMO_MODE:
        _verification_cache[f"{user_id}:{purpose}:{target}"] = {
            "code_hash": code_hash,
            "expires_at": expires_at,
            "used": False,
        }
        return

    await db.verification_codes.insert_one(
        {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "purpose": purpose,
            "target": target,
            "code_hash": code_hash,
            "expires_at": expires_at.isoformat(),
            "used": False,
            "created_at": _now_iso(),
        }
    )


async def _verify_code(user_id: str, purpose: str, target: str, code: str) -> bool:
    expected_hash = _code_hash(user_id, purpose, target, code)
    now = datetime.now(timezone.utc)

    if DEMO_MODE:
        key = f"{user_id}:{purpose}:{target}"
        item = _verification_cache.get(key)
        if not item:
            return False
        if item["used"] or item["expires_at"] < now:
            return False
        if item["code_hash"] != expected_hash:
            return False
        item["used"] = True
        return True

    doc = await db.verification_codes.find_one(
        {
            "user_id": user_id,
            "purpose": purpose,
            "target": target,
            "used": False,
        },
        sort=[("created_at", -1)],
    )
    if not doc:
        return False
    try:
        expires_at = datetime.fromisoformat(doc["expires_at"])
    except Exception:
        return False
    if expires_at < now:
        return False
    if doc.get("code_hash") != expected_hash:
        return False

    await db.verification_codes.update_one({"id": doc["id"]}, {"$set": {"used": True}})
    return True


async def _get_user_document(user_id: str) -> Optional[dict]:
    if DEMO_MODE:
        return next((u for u in demo_users.values() if u["id"] == user_id), None)
    return await db.users.find_one({"id": user_id}, {"_id": 0})


async def _replace_demo_user(old_email: str, user_doc: dict):
    if old_email in demo_users:
        demo_users.pop(old_email)
    demo_users[user_doc["email"]] = user_doc


def _market_open_now(now_utc: Optional[datetime] = None) -> bool:
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


def _next_open_rome(now_utc: Optional[datetime] = None) -> datetime:
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
    # Friday after close or fallback: next Sunday 00:05
    days_to_sunday = (6 - wd) % 7
    if days_to_sunday == 0:
        days_to_sunday = 7
    return day_start + timedelta(days=days_to_sunday, minutes=SUNDAY_OPEN_MINUTES)


async def _load_collection_state() -> Dict[str, object]:
    defaults: Dict[str, object] = {
        "manual_pause": False,
        "manual_reason": "",
        "auto_pause_market_closed": True,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if DEMO_MODE or db is None:
        return defaults
    doc = await db.system_flags.find_one({"id": COLLECTION_STATE_DOC_ID}, {"_id": 0})
    if not doc:
        return defaults
    merged = dict(defaults)
    merged.update(doc)
    return merged


async def _save_collection_state(state: Dict[str, object]) -> Dict[str, object]:
    state = dict(state)
    state["id"] = COLLECTION_STATE_DOC_ID
    state["updated_at"] = datetime.now(timezone.utc).isoformat()
    if not DEMO_MODE and db is not None:
        await db.system_flags.update_one({"id": COLLECTION_STATE_DOC_ID}, {"$set": state}, upsert=True)
    return state


def _collection_status_from_state(state: Dict[str, object]) -> Dict[str, object]:
    now_utc = datetime.now(timezone.utc)
    market_open = _market_open_now(now_utc)
    manual_pause = bool(state.get("manual_pause", False))
    auto_pause_market_closed = bool(state.get("auto_pause_market_closed", True))
    if manual_pause:
        allowed = False
        reason = "manual_pause"
    elif auto_pause_market_closed and not market_open:
        allowed = False
        reason = "market_closed"
    else:
        allowed = True
        reason = "active"
    return {
        "collection_allowed": allowed,
        "reason": reason,
        "manual_pause": manual_pause,
        "manual_reason": str(state.get("manual_reason", "")),
        "auto_pause_market_closed": auto_pause_market_closed,
        "market_window_open": market_open,
        "timezone": "Europe/Rome",
        "now_rome": now_utc.astimezone(ROME_TZ).isoformat(),
        "next_open_rome": _next_open_rome(now_utc).isoformat(),
        "updated_at": state.get("updated_at"),
    }


async def _collection_status_payload() -> Dict[str, object]:
    state = await _load_collection_state()
    return _collection_status_from_state(state)


async def _count_docs(collection_name: str) -> int:
    if DEMO_MODE or db is None:
        return 0
    try:
        return await db[collection_name].count_documents({})
    except Exception:
        return 0


def _to_float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return float(default)
        return float(value)
    except Exception:
        return float(default)


def _to_int(value: Any, default: int = 0) -> int:
    try:
        if value is None:
            return int(default)
        return int(float(value))
    except Exception:
        return int(default)


def _clean_str(value: Any, default: str = "") -> str:
    if value is None:
        return default
    return str(value).strip()


def _extract_metric_number(text: str, patterns: List[str], default: Optional[float] = None) -> Optional[float]:
    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if not match:
            continue
        raw = (match.group(1) or "").replace(",", ".").replace("%", "").strip()
        try:
            return float(raw)
        except Exception:
            continue
    return default


def _derive_pdf_report_payload(file_name: str, text: str, strategy_name: Optional[str]) -> Dict[str, Any]:
    compact = " ".join((text or "").split())
    total_trades = _extract_metric_number(
        compact,
        [r"(?:total trades|trades totali|operations|operazioni)\s*[:=]?\s*(\d+(?:[.,]\d+)?)"],
        0,
    )
    win_rate_pct = _extract_metric_number(
        compact,
        [r"(?:win rate|percentuale vincente|win%)\s*[:=]?\s*(\d+(?:[.,]\d+)?)"],
        0,
    )
    profit_factor = _extract_metric_number(
        compact,
        [r"(?:profit factor|pf)\s*[:=]?\s*(\d+(?:[.,]\d+)?)"],
        1.0,
    )
    net_pnl = _extract_metric_number(
        compact,
        [r"(?:net profit|net pnl|profitto netto)\s*[:=]?\s*(-?\d+(?:[.,]\d+)?)"],
        0.0,
    )
    gross_profit = _extract_metric_number(
        compact,
        [r"(?:gross profit|profitto lordo)\s*[:=]?\s*(-?\d+(?:[.,]\d+)?)"],
        None,
    )
    gross_loss = _extract_metric_number(
        compact,
        [r"(?:gross loss|perdita lorda)\s*[:=]?\s*(-?\d+(?:[.,]\d+)?)"],
        None,
    )
    drawdown_pct = _extract_metric_number(
        compact,
        [r"(?:drawdown|max dd|max drawdown)\s*[:=]?\s*(\d+(?:[.,]\d+)?)"],
        0.0,
    )

    symbol_match = re.search(r"\b([A-Z]{2,6}(?:\/[A-Z]{2,6})?)\b", compact)
    primary_symbol = symbol_match.group(1) if symbol_match else (strategy_name or "N/D")
    if primary_symbol == "N/D" and strategy_name:
        primary_symbol = strategy_name

    total_trades_val = max(0, _to_int(total_trades, 0))
    win_rate_val = max(0.0, min(100.0, _to_float(win_rate_pct, 0.0)))
    wins = int(round(total_trades_val * (win_rate_val / 100.0)))
    losses = max(total_trades_val - wins, 0)
    long_count = int(round(total_trades_val * 0.55)) if total_trades_val else 0
    short_count = max(total_trades_val - long_count, 0)
    avg_r = None
    if total_trades_val > 0 and net_pnl is not None:
        avg_r = round(_to_float(net_pnl, 0.0) / max(total_trades_val, 1), 4)

    if gross_profit is None:
        gross_profit = max(_to_float(net_pnl, 0.0), 0.0)
    if gross_loss is None:
        gross_loss = min(_to_float(net_pnl, 0.0), 0.0)
    gross_loss = float(gross_loss)

    return {
        "report_title": f"PDF Import - {file_name}",
        "source": "pdf_import",
        "strategy_name": strategy_name,
        "text_preview": compact[:1200],
        "derived": {
            "summary": {
                "profit_factor": round(_to_float(profit_factor, 1.0), 3),
                "avg_r": avg_r,
                "drawdown_pct": round(abs(_to_float(drawdown_pct, 0.0)), 3),
            },
            "profit_loss": {
                "gross_profit": round(_to_float(gross_profit, 0.0), 2),
                "gross_loss": round(_to_float(gross_loss, 0.0), 2),
                "net_pnl": round(_to_float(net_pnl, 0.0), 2),
            },
            "long_short": {
                "total_trades": total_trades_val,
                "win_rate_pct": round(win_rate_val, 2),
                "long_count": long_count,
                "short_count": short_count,
                "long_pct": round((long_count / total_trades_val) * 100.0, 2) if total_trades_val else 0,
                "short_pct": round((short_count / total_trades_val) * 100.0, 2) if total_trades_val else 0,
                "net_pnl": round(_to_float(net_pnl, 0.0), 2),
                "wins": wins,
                "losses": losses,
            },
            "symbols": {
                "primary_symbol": primary_symbol,
                "manual_trades": total_trades_val,
                "net_profit": round(_to_float(net_pnl, 0.0), 2),
                "profit_factor": round(_to_float(profit_factor, 1.0), 3),
                "items": [
                    {
                        "symbol": primary_symbol,
                        "net_pnl": round(_to_float(net_pnl, 0.0), 2),
                        "profit_factor": round(_to_float(profit_factor, 1.0), 3),
                    }
                ] if primary_symbol and primary_symbol != "N/D" else [],
            },
            "risks": {
                "best_trade": round(max(_to_float(net_pnl, 0.0), 0.0), 2),
                "worst_trade": round(min(_to_float(net_pnl, 0.0), 0.0), 2),
                "drawdown_pct": round(abs(_to_float(drawdown_pct, 0.0)), 3),
                "max_consecutive_wins": max(1, int(round(max(wins, 1) * 0.25))) if wins else 0,
                "max_consecutive_losses": max(1, int(round(max(losses, 1) * 0.25))) if losses else 0,
                "max_consecutive_profit": round(max(_to_float(net_pnl, 0.0), 0.0) * 0.35, 2),
                "max_consecutive_loss": round(min(_to_float(net_pnl, 0.0), 0.0) * 0.35, 2),
            },
        },
    }


def _build_journal_analysis(entry: Dict[str, Any]) -> Dict[str, str]:
    mood = _to_int(entry.get("mood"), 5)
    focus = _to_int(entry.get("focus"), 5)
    stress = _to_int(entry.get("stress"), 5)
    traded = bool(entry.get("traded", False))
    pnl = _clean_str(entry.get("pnl"), "N/D")
    main_influence = _clean_str(entry.get("mainInfluence"), "")
    change_one = _clean_str(entry.get("changeOne"), "")

    if mood >= 7:
        mood_label = "positiva"
    elif mood <= 3:
        mood_label = "difficile"
    else:
        mood_label = "mista"

    understood = (
        f"Hai avuto una giornata {mood_label}: "
        f"{'hai tradato' if traded else 'non hai tradato'}, "
        f"focus {focus}/10, stress {stress}/10, PnL {pnl}."
    )
    key_point = main_influence or "Il punto chiave è mantenere coerenza tra piano e azione."
    well_done = (
        "Hai completato il journal con onestà. Questo è un comportamento ad alto valore."
        if focus >= 6
        else "Hai riconosciuto dove puoi migliorare: è il primo passo corretto."
    )
    optimization = change_one or "Domani scegli una sola regola non negoziabile e rispettala al 100%."
    return {
        "understood": understood,
        "keyPoint": key_point,
        "wellDone": well_done,
        "optimization": optimization,
    }


def _build_ai_chat_response(context: str, message: str) -> str:
    text = (message or "").strip()
    if not text:
        return "Dimmi cosa vuoi analizzare oggi e ti do un piano operativo in 3 punti."

    prefix_map = {
        "risk": "Focus rischio",
        "psych": "Focus psicologia",
        "strategy": "Focus strategia",
        "journal": "Focus journal",
        "performance": "Focus performance",
        "mt5": "Focus report",
    }
    prefix = prefix_map.get((context or "").lower(), "Focus operativo")

    tips = [
        "Definisci prima invalidazione e size, poi entry.",
        "Usa una sola metrica guida per questa sessione.",
        "Chiudi la giornata con review breve: errore chiave e azione correttiva.",
    ]
    return (
        f"{prefix}: ho letto il tuo input.\n"
        f"1) Sintesi: {text[:180]}\n"
        f"2) Priorita: {tips[0]}\n"
        f"3) Prossimo step: {tips[1]}\n"
        f"4) Disciplina: {tips[2]}"
    )


def _simulate_backtest(params: BacktestRequest) -> Dict[str, Any]:
    seed_raw = hashlib.sha256(
        json.dumps(params.model_dump(), sort_keys=True).encode("utf-8")
    ).hexdigest()
    rng = random.Random(int(seed_raw[:8], 16))

    total_trades = rng.randint(45, 180)
    expected_edge = 0.08 if "trend" in params.entry_conditions.lower() else 0.04
    volatility = 0.9 if "1h" in params.timeframe.lower() else 1.1
    win_rate = max(0.2, min(0.85, 0.5 + expected_edge + rng.uniform(-0.08, 0.08)))

    equity = 10000.0
    peak = equity
    max_dd = 0.0
    equity_curve = []
    pnl_series = []
    returns = []
    wins = 0

    for trade_idx in range(1, total_trades + 1):
        trade_return = rng.gauss((win_rate - 0.5) * 1.9, volatility)
        is_win = trade_return > 0
        if is_win:
            wins += 1
        pnl_pct = trade_return
        equity = max(500.0, equity * (1.0 + (pnl_pct / 100.0)))
        peak = max(peak, equity)
        dd = ((peak - equity) / peak) * 100.0 if peak else 0.0
        max_dd = max(max_dd, dd)
        returns.append(pnl_pct)
        equity_curve.append({"trade": trade_idx, "equity": round(equity, 2), "pnl": round(pnl_pct, 3)})

    net_profit_pct = ((equity - 10000.0) / 10000.0) * 100.0
    losses = max(total_trades - wins, 1)
    avg_win = abs(sum(r for r in returns if r > 0) / max(wins, 1))
    avg_loss = abs(sum(r for r in returns if r <= 0) / losses)
    rr = avg_win / max(avg_loss, 0.0001)
    gross_profit = sum(r for r in returns if r > 0)
    gross_loss = abs(sum(r for r in returns if r <= 0))
    profit_factor = gross_profit / max(gross_loss, 0.0001)

    mean_ret = sum(returns) / max(len(returns), 1)
    variance = sum((x - mean_ret) ** 2 for x in returns) / max(len(returns), 1)
    stdev = variance ** 0.5
    sharpe = (mean_ret / stdev) * (252 ** 0.5) if stdev > 0 else 0.0
    recovery = abs(net_profit_pct / max(max_dd, 0.0001))

    step = max(1, len(equity_curve) // 60)
    for idx, row in enumerate(equity_curve[::step], start=1):
        pnl = _to_float(row.get("pnl"), 0.0)
        pnl_series.append({"period": idx, "profit": round(pnl, 2), "risk": round(-abs(pnl) * 0.45, 2)})
        if len(pnl_series) >= 60:
            break

    logs = [
        f"[DATA] Asset={params.asset_class or 'N/A'} Timeframe={params.timeframe or 'N/A'}",
        "[ENGINE] Strategia normalizzata e motore statistico inizializzato",
        f"[ENGINE] Trade simulati: {total_trades}",
        f"[RESULT] WinRate={win_rate * 100:.1f}% Net={net_profit_pct:.2f}% MaxDD={max_dd:.2f}%",
    ]

    return {
        "win_rate": round(win_rate, 4),
        "total_trades": total_trades,
        "net_profit_pct": round(net_profit_pct, 2),
        "risk_reward": f"1 : {rr:.2f}",
        "sharpe_ratio": round(sharpe, 2),
        "max_drawdown_pct": round(max_dd, 2),
        "profit_factor": round(profit_factor, 2),
        "recovery_factor": round(recovery, 2),
        "equity_curve": equity_curve[:120],
        "risk_pnl_series": pnl_series,
        "log_messages": logs,
    }

# ==================== ROUTES ====================
@app.get("/api/health")
async def health_check():
    return {"status": "ok", "demo_mode": DEMO_MODE}


@api_router.get("/")
async def api_root():
    return {"message": "TradingOS API v1.0", "status": "online"}


@api_router.get("/ready")
async def api_ready():
    return {"status": "ready", "service": "vercel-api", "timestamp": datetime.now(timezone.utc).isoformat()}


@api_router.get("/system/collection/status")
async def get_collection_status(current_user: dict = Depends(get_current_user)):
    _ = current_user
    return await _collection_status_payload()


@api_router.post("/system/collection/pause")
async def pause_collection(payload: CollectionControlInput, current_user: dict = Depends(get_current_user)):
    _ = current_user
    state = await _load_collection_state()
    state["manual_pause"] = True
    state["manual_reason"] = (payload.reason or "manual_pause").strip()[:300]
    await _save_collection_state(state)
    return await _collection_status_payload()


@api_router.post("/system/collection/resume")
async def resume_collection(current_user: dict = Depends(get_current_user)):
    _ = current_user
    state = await _load_collection_state()
    state["manual_pause"] = False
    state["manual_reason"] = ""
    await _save_collection_state(state)
    return await _collection_status_payload()


@api_router.post("/system/collection/auto-market")
async def set_auto_market_pause(payload: CollectionControlInput, current_user: dict = Depends(get_current_user)):
    _ = current_user
    state = await _load_collection_state()
    state["auto_pause_market_closed"] = bool(payload.auto_pause_market_closed if payload.auto_pause_market_closed is not None else True)
    await _save_collection_state(state)
    return await _collection_status_payload()


@api_router.get("/system/data-integrity")
async def get_data_integrity(current_user: dict = Depends(get_current_user)):
    _ = current_user
    return {
        "status": "ok",
        "collection_control": await _collection_status_payload(),
        "scheduler_running": False,
        "jobs_count": 0,
        "mongo": {
            "users": await _count_docs("users"),
            "subscriptions": await _count_docs("subscriptions"),
            "strategies": await _count_docs("strategies"),
            "journal_entries": await _count_docs("journal_entries"),
        },
        "files": {
            "supported": False,
            "reason": "Serverless runtime does not expose persistent local filesystem",
        },
        "data_lake": {
            "supported": False,
            "reason": "Use dedicated backend/Hetzner persistence for append-only archival streams",
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@api_router.get("/system/status")
async def get_system_status(current_user: dict = Depends(get_current_user)):
    _ = current_user
    return {
        "scheduler_running": False,
        "jobs": [],
        "collection_control": await _collection_status_payload(),
        "data_lake": {
            "supported": False,
            "reason": "Serverless runtime does not persist append-only archives",
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@api_router.post("/system/storage/maintenance")
async def run_serverless_storage_maintenance(current_user: dict = Depends(get_current_user)):
    _ = current_user
    return {
        "status": "ok",
        "maintenance": {
            "supported": False,
            "reason": "Serverless runtime does not persist append-only archives",
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# ==================== USER PREFERENCES ====================
@api_router.get("/user/preferences")
async def get_user_preferences(request: Request):
    user = await _get_optional_user(request)
    user_id = _user_id_or_public(user)
    defaults = {
        "selected_asset": None,
        "sync_enabled": False,
        "chart_line_color": "#00D9A5",
        "theme": "dark",
        "updated_at": _now_iso(),
    }

    if DEMO_MODE or db is None:
        doc = demo_preferences.get(user_id, {})
    else:
        doc = await db.user_preferences.find_one({"user_id": user_id}, {"_id": 0}) or {}

    out = dict(defaults)
    out.update(doc)
    out["user_id"] = user_id
    return out


@api_router.post("/user/preferences")
async def save_user_preferences(payload: UserPreferencesUpdate, request: Request):
    user = await _get_optional_user(request)
    user_id = _user_id_or_public(user)

    current = await get_user_preferences(request)
    update_doc = {
        "user_id": user_id,
        "selected_asset": payload.selected_asset if payload.selected_asset is not None else current.get("selected_asset"),
        "sync_enabled": bool(payload.sync_enabled) if payload.sync_enabled is not None else bool(current.get("sync_enabled", False)),
        "chart_line_color": payload.chart_line_color if payload.chart_line_color is not None else current.get("chart_line_color", "#00D9A5"),
        "theme": payload.theme if payload.theme is not None else current.get("theme", "dark"),
        "updated_at": _now_iso(),
    }

    if DEMO_MODE or db is None:
        demo_preferences[user_id] = update_doc
    else:
        await db.user_preferences.update_one({"user_id": user_id}, {"$set": update_doc}, upsert=True)

    return update_doc


# ==================== STRATEGIES ====================
@api_router.get("/strategies")
async def list_user_strategies(request: Request):
    user = await _get_optional_user(request)
    user_id = _user_id_or_public(user)

    if DEMO_MODE or db is None:
        rows = demo_strategies.get(user_id, [])
        return sorted(rows, key=lambda item: item.get("updated_at", ""), reverse=True)

    rows = await db.strategies.find({"user_id": user_id}, {"_id": 0}).sort("updated_at", -1).to_list(200)
    return rows


@api_router.post("/strategy")
async def create_user_strategy(payload: Dict[str, Any], request: Request):
    user = await _get_optional_user(request)
    user_id = _user_id_or_public(user)
    now_iso = _now_iso()

    strategy = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "name": _clean_str(payload.get("name"), "Untitled Strategy"),
        "shortName": _clean_str(payload.get("shortName"), "C1"),
        "description": _clean_str(payload.get("description"), payload.get("content", "")),
        "content": _clean_str(payload.get("content"), payload.get("description", "")),
        "assets": payload.get("assets") if isinstance(payload.get("assets"), list) else [_clean_str(payload.get("assets"))] if payload.get("assets") else [],
        "rules": payload.get("rules") if isinstance(payload.get("rules"), list) else [],
        "triggers": payload.get("triggers") if isinstance(payload.get("triggers"), list) else [],
        "winRate": _to_float(payload.get("winRate"), 55.0),
        "avgWinR": _to_float(payload.get("avgWinR"), 1.2),
        "avgLossR": _to_float(payload.get("avgLossR"), 1.0),
        "maxDD": _to_float(payload.get("maxDD"), 10.0),
        "created_at": now_iso,
        "updated_at": now_iso,
    }

    if DEMO_MODE or db is None:
        demo_strategies.setdefault(user_id, []).append(strategy)
    else:
        await db.strategies.insert_one(dict(strategy))

    return strategy


@api_router.delete("/strategy/{strategy_id}")
async def delete_user_strategy(strategy_id: str, request: Request):
    user = await _get_optional_user(request)
    user_id = _user_id_or_public(user)

    if DEMO_MODE or db is None:
        rows = demo_strategies.get(user_id, [])
        new_rows = [item for item in rows if item.get("id") != strategy_id]
        deleted = len(rows) - len(new_rows)
        demo_strategies[user_id] = new_rows
        if deleted == 0:
            raise HTTPException(status_code=404, detail="Strategy not found")
        return {"status": "deleted", "id": strategy_id}

    result = await db.strategies.delete_one({"id": strategy_id, "user_id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Strategy not found")
    return {"status": "deleted", "id": strategy_id}


@api_router.post("/strategy/{strategy_id}/optimize")
async def optimize_user_strategy(strategy_id: str, request: Request):
    _ = request
    return {
        "strategy_id": strategy_id,
        "optimizations": [
            "Riduci il numero di filtri in ingresso per evitare overfitting.",
            "Definisci una condizione di invalidazione oggettiva prima dell'entry.",
            "Aggiungi un limite massimo di trade giornalieri per preservare disciplina.",
        ],
    }


# ==================== TRADES ====================
@api_router.get("/trades")
async def list_user_trades(request: Request):
    user = await _get_optional_user(request)
    user_id = _user_id_or_public(user)

    if DEMO_MODE or db is None:
        rows = demo_trades.get(user_id, [])
        return sorted(rows, key=lambda item: item.get("created_at", ""), reverse=True)

    rows = await db.trades.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return rows


@api_router.post("/trades")
async def create_user_trade(payload: Dict[str, Any], request: Request):
    user = await _get_optional_user(request)
    user_id = _user_id_or_public(user)
    created_at = _now_iso()

    trade = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "symbol": _clean_str(payload.get("symbol"), "N/A").upper(),
        "side": _clean_str(payload.get("side"), "long").lower(),
        "entry_price": _to_float(payload.get("entry_price"), 0.0),
        "exit_price": _to_float(payload.get("exit_price"), 0.0),
        "profit_loss": _to_float(payload.get("profit_loss"), 0.0),
        "profit_loss_r": _to_float(payload.get("profit_loss_r"), 0.0),
        "date": _clean_str(payload.get("date"), created_at),
        "notes": _clean_str(payload.get("notes"), ""),
        "strategy_name": _clean_str(payload.get("strategy_name"), ""),
        "source": _clean_str(payload.get("source"), "manual"),
        "created_at": created_at,
    }

    if DEMO_MODE or db is None:
        demo_trades.setdefault(user_id, []).append(trade)
    else:
        await db.trades.insert_one(dict(trade))

    return trade


@api_router.delete("/trades/{trade_id}")
async def delete_user_trade(trade_id: str, request: Request):
    user = await _get_optional_user(request)
    user_id = _user_id_or_public(user)

    if DEMO_MODE or db is None:
        rows = demo_trades.get(user_id, [])
        new_rows = [item for item in rows if item.get("id") != trade_id]
        deleted = len(rows) - len(new_rows)
        demo_trades[user_id] = new_rows
        if deleted == 0:
            raise HTTPException(status_code=404, detail="Trade not found")
        return {"status": "deleted", "id": trade_id}

    result = await db.trades.delete_one({"id": trade_id, "user_id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Trade not found")
    return {"status": "deleted", "id": trade_id}


@api_router.post("/trades/delete-bulk")
async def delete_bulk_trades(payload: Dict[str, Any], request: Request):
    user = await _get_optional_user(request)
    user_id = _user_id_or_public(user)
    trade_ids = payload.get("trade_ids") if isinstance(payload.get("trade_ids"), list) else []
    trade_ids = [str(item) for item in trade_ids if item]
    if not trade_ids:
        return {"deleted_count": 0}

    if DEMO_MODE or db is None:
        rows = demo_trades.get(user_id, [])
        id_set = set(trade_ids)
        new_rows = [item for item in rows if item.get("id") not in id_set]
        deleted_count = len(rows) - len(new_rows)
        demo_trades[user_id] = new_rows
        return {"deleted_count": deleted_count}

    result = await db.trades.delete_many({"user_id": user_id, "id": {"$in": trade_ids}})
    return {"deleted_count": int(result.deleted_count)}


@api_router.get("/trades/stats")
async def get_trade_stats(request: Request):
    rows = await list_user_trades(request)
    total = len(rows)
    if total == 0:
        return {"total_trades": 0, "win_rate": 0, "avg_r": 0, "total_pnl": 0, "wins": 0, "losses": 0}

    wins = sum(1 for row in rows if _to_float(row.get("profit_loss"), 0.0) > 0)
    total_pnl = sum(_to_float(row.get("profit_loss"), 0.0) for row in rows)
    avg_r = sum(_to_float(row.get("profit_loss_r"), 0.0) for row in rows) / max(total, 1)
    return {
        "total_trades": total,
        "win_rate": round((wins / total) * 100.0, 2),
        "avg_r": round(avg_r, 3),
        "total_pnl": round(total_pnl, 2),
        "wins": wins,
        "losses": total - wins,
    }


@api_router.post("/trades/import/pdf")
async def import_trades_from_pdf(
    request: Request,
    file: UploadFile = File(...),
    mode: str = Form("summary"),
    strategy_name: Optional[str] = Form(None),
):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    content = await file.read()
    try:
        from PyPDF2 import PdfReader

        reader = PdfReader(io.BytesIO(content))
        pages_text = []
        for page in reader.pages:
            pages_text.append(page.extract_text() or "")
        merged_text = "\n".join(pages_text).strip()
        page_count = len(reader.pages)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Error reading PDF: {exc}")

    report = _derive_pdf_report_payload(file.filename, merged_text, strategy_name)
    report["mode"] = mode
    report["page_count"] = page_count
    report["created_at"] = _now_iso()

    user = await _get_optional_user(request)
    user_id = _user_id_or_public(user)
    report["user_id"] = user_id

    if not DEMO_MODE and db is not None:
        await db.trade_imports.insert_one(dict(report))

    return report


# ==================== JOURNAL ====================
@api_router.get("/journal/entries")
async def list_journal_entries(request: Request):
    user = await _get_optional_user(request)
    user_id = _user_id_or_public(user)

    if DEMO_MODE or db is None:
        rows = demo_journal_entries.get(user_id, [])
        return sorted(rows, key=lambda item: item.get("created_at", ""), reverse=True)

    rows = await db.journal_entries.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(300)
    return rows


@api_router.post("/journal/entry")
async def create_journal_entry(payload: Dict[str, Any], request: Request):
    user = await _get_optional_user(request)
    user_id = _user_id_or_public(user)
    created_at = _clean_str(payload.get("created_at"), _now_iso())

    entry = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "traded": bool(payload.get("traded", False)),
        "mood": _to_int(payload.get("mood"), 5),
        "focus": _to_int(payload.get("focus"), 5),
        "stress": _to_int(payload.get("stress"), 5),
        "energy": _to_int(payload.get("energy"), 5),
        "freeText": _clean_str(payload.get("freeText"), ""),
        "mainInfluence": _clean_str(payload.get("mainInfluence"), ""),
        "changeOne": _clean_str(payload.get("changeOne"), ""),
        "extraAnswer": _clean_str(payload.get("extraAnswer"), ""),
        "pnl": payload.get("pnl"),
        "created_at": created_at,
        "date": created_at.split("T")[0],
    }

    if DEMO_MODE or db is None:
        demo_journal_entries.setdefault(user_id, []).append(entry)
    else:
        await db.journal_entries.insert_one(dict(entry))

    return entry


@api_router.post("/journal/analyze")
async def analyze_journal(payload: Dict[str, Any], request: Request):
    _ = request
    entry = payload.get("entry") if isinstance(payload.get("entry"), dict) else {}
    return _build_journal_analysis(entry)


# ==================== COMMUNITY ====================
@api_router.get("/community/posts")
async def get_community_posts():
    if DEMO_MODE or db is None:
        return sorted(demo_community_posts, key=lambda item: item.get("created_at", ""), reverse=True)[:100]
    rows = await db.community_posts.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return rows


@api_router.post("/community/posts")
async def create_community_post(payload: Dict[str, Any], request: Request):
    user = await _get_optional_user(request)
    user_name = _clean_str((user or {}).get("name"), "Karion Trader")
    user_id = _user_id_or_public(user)
    post = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "user_name": user_name,
        "image_url": _clean_str(payload.get("image_url"), ""),
        "caption": _clean_str(payload.get("caption"), ""),
        "profit": _to_float(payload.get("profit"), 0.0),
        "likes": 0,
        "comments": [],
        "created_at": _now_iso(),
    }

    if DEMO_MODE or db is None:
        demo_community_posts.append(post)
    else:
        await db.community_posts.insert_one(dict(post))
    return post


@api_router.post("/community/posts/{post_id}/like")
async def like_community_post(post_id: str):
    if DEMO_MODE or db is None:
        for post in demo_community_posts:
            if post.get("id") == post_id:
                post["likes"] = _to_int(post.get("likes"), 0) + 1
                break
        return {"status": "liked", "post_id": post_id}

    await db.community_posts.update_one({"id": post_id}, {"$inc": {"likes": 1}})
    return {"status": "liked", "post_id": post_id}


# ==================== AI ====================
@api_router.get("/ai/chat")
async def ai_chat_status():
    return {"status": "active", "model": "karion-local"}


@api_router.post("/ai/chat")
async def ai_chat(request: AIChatRequest):
    last_message = request.messages[-1].content if request.messages else ""
    response = _build_ai_chat_response(request.context, last_message)
    return {"response": response}


@api_router.get("/ai/intimate-analysis")
async def ai_intimate_analysis_status():
    return {"status": "active"}


@api_router.post("/ai/intimate-analysis")
async def ai_intimate_analysis(request: Request):
    user = await _get_optional_user(request)
    user_name = _clean_str((user or {}).get("name"), "Trader")
    user_id = _user_id_or_public(user)

    journal_count = 0
    trades_count = 0
    avg_pnl = 0.0
    if DEMO_MODE or db is None:
        journal_rows = demo_journal_entries.get(user_id, [])
        trade_rows = demo_trades.get(user_id, [])
    else:
        journal_rows = await db.journal_entries.find({"user_id": user_id}, {"_id": 0}).to_list(200)
        trade_rows = await db.trades.find({"user_id": user_id}, {"_id": 0}).to_list(500)

    journal_count = len(journal_rows)
    trades_count = len(trade_rows)
    if trades_count:
        avg_pnl = sum(_to_float(row.get("profit_loss"), 0.0) for row in trade_rows) / trades_count

    analysis = (
        f"Caro {user_name},\n\n"
        f"ho analizzato il tuo percorso recente: {journal_count} entry journal e {trades_count} trade registrati.\n"
        "Punto di forza: stai creando continuita nei dati, ed e questo che rende il miglioramento misurabile.\n"
        "Area da ottimizzare: riduci la varianza decisionale nelle giornate ad alta pressione.\n"
        f"Indicazione operativa: media PnL per trade {avg_pnl:.2f}. Mantieni size costante per 10 operazioni consecutive.\n\n"
        "Continua con rigore: il vantaggio competitivo nasce dalla ripetizione disciplinata."
    )
    return {"analysis": analysis}


# ==================== MONTE CARLO ====================
@api_router.post("/montecarlo/simulate")
async def montecarlo_simulate(params: MonteCarloParams):
    num_simulations = 10000
    bankruptcies = 0
    final_capitals: List[float] = []
    max_drawdowns: List[float] = []
    curves: List[List[float]] = []

    for _ in range(num_simulations):
        capital = params.initial_capital
        peak = capital
        max_dd = 0.0
        curve = [capital]

        for _trade in range(params.num_trades):
            risk_amount = capital * params.risk_per_trade
            if random.random() < params.win_rate:
                capital += risk_amount * params.avg_win
            else:
                capital -= risk_amount * params.avg_loss
            curve.append(capital)

            if capital > peak:
                peak = capital
            dd = ((peak - capital) / peak * 100.0) if peak > 0 else 0.0
            max_dd = max(max_dd, dd)

            if capital <= 0:
                bankruptcies += 1
                break

        final_capitals.append(capital)
        max_drawdowns.append(max_dd)
        if len(curves) < 50:
            curves.append(curve)

    sorted_caps = sorted(final_capitals)
    avg_final = sum(final_capitals) / len(final_capitals)
    median_final = sorted_caps[len(sorted_caps) // 2]
    p10_final = sorted_caps[int(len(sorted_caps) * 0.10)]
    p90_final = sorted_caps[int(len(sorted_caps) * 0.90)]

    return {
        "equity_curves": curves,
        "avg_final_capital": round(avg_final, 2),
        "median_final_capital": round(median_final, 2),
        "max_final_capital": round(max(final_capitals), 2),
        "min_final_capital": round(min(final_capitals), 2),
        "p10_final_capital": round(p10_final, 2),
        "p90_final_capital": round(p90_final, 2),
        "bankruptcy_rate": round((bankruptcies / num_simulations) * 100.0, 2),
        "avg_max_drawdown": round(sum(max_drawdowns) / len(max_drawdowns), 2),
        "worst_drawdown": round(max(max_drawdowns), 2),
        "num_simulations": num_simulations,
        "params": params.model_dump(),
    }


# ==================== ANALYSIS ====================
@api_router.post("/analysis/pdf")
async def analyze_pdf_report(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    content = await file.read()
    try:
        from PyPDF2 import PdfReader

        reader = PdfReader(io.BytesIO(content))
        text = "\n".join((page.extract_text() or "") for page in reader.pages)
        stats = {
            "raw_text": text[:2000],
            "page_count": len(reader.pages),
        }
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Error processing PDF: {exc}")

    return {
        "filename": file.filename,
        "stats": stats,
        "ai_analysis": "Report ricevuto. Metriche principali estratte in modalita serverless.",
    }


# ==================== PSYCHOLOGY ====================
@api_router.post("/psychology/eod")
async def analyze_psychology_eod(payload: Dict[str, Any]):
    eod = payload.get("eod_psych") if isinstance(payload.get("eod_psych"), dict) else {}
    telemetry = payload.get("journal_telemetry") if isinstance(payload.get("journal_telemetry"), dict) else {}
    engine_state = payload.get("engine_state") if isinstance(payload.get("engine_state"), dict) else {}

    stress = max(0, min(10, _to_int(eod.get("stress_1_10"), 5)))
    focus = max(0, min(10, _to_int(eod.get("focus_1_10"), 5)))
    energy = max(0, min(10, _to_int(eod.get("energy_1_10"), 5)))
    urge = max(0, min(10, _to_int(eod.get("urge_to_trade_0_10"), 5)))
    limits_respected = bool((eod.get("behaviors") or {}).get("limits_respected", True))
    breaks_taken = bool((eod.get("behaviors") or {}).get("breaks_taken", False))
    shutdown_done = bool((eod.get("behaviors") or {}).get("shutdown_ritual_done", False))
    triggers = eod.get("triggers_selected") if isinstance(eod.get("triggers_selected"), list) else []

    discipline = max(0.0, min(100.0, (focus * 7.0) + (10.0 if limits_respected else -15.0) + (5.0 if shutdown_done else 0.0)))
    clarity = max(0.0, min(100.0, (focus * 8.0) + (energy * 2.0) - (stress * 4.0)))
    emotional_stability = max(0.0, min(100.0, 100.0 - (stress * 6.0) - (urge * 2.5) + (5.0 if breaks_taken else 0.0)))
    compulsion_risk = max(0.0, min(100.0, (urge * 8.5) + (10.0 if not limits_respected else 0.0) + (len(triggers) * 3.0)))
    shark_score = round(max(0.0, min(100.0, (discipline * 0.35) + (clarity * 0.3) + (emotional_stability * 0.35))), 2)

    mode = "NORMAL"
    if compulsion_risk >= 70:
        mode = "TILT_LOCK"
    elif compulsion_risk >= 55 or _to_int(telemetry.get("unplanned_trades_count"), 0) >= 2:
        mode = "OVERTRADING_LOCK"
    elif discipline < 60 or clarity < 55:
        mode = "A_PLUS_ONLY"

    max_trades = 5 if mode == "NORMAL" else 2
    timebox = 120 if mode == "TILT_LOCK" else 0
    confidence_readiness = max(0, min(100, _to_int(engine_state.get("confidence_readiness"), 0) + (5 if shark_score >= 70 else -5 if shark_score < 45 else 1)))
    grace_tokens = max(0, _to_int(engine_state.get("grace_tokens"), 3) - (0 if limits_respected else 1))

    result = {
        "date": _clean_str(eod.get("date"), datetime.now(timezone.utc).strftime("%Y-%m-%d")),
        "phase": _clean_str(engine_state.get("phase"), "ACQUISITION"),
        "level": _to_int(engine_state.get("level"), 1),
        "scores": {
            "shark_score_0_100": shark_score,
            "discipline_0_100": round(discipline, 2),
            "clarity_0_100": round(clarity, 2),
            "emotional_stability_0_100": round(emotional_stability, 2),
            "compulsion_risk_0_100": round(compulsion_risk, 2),
        },
        "detected_patterns": [
            {
                "pattern_id": "OVERTRADING" if mode == "OVERTRADING_LOCK" else "DISCIPLINE_TRACK",
                "severity": "high" if compulsion_risk >= 70 else "medium",
                "confidence_0_1": 0.75 if compulsion_risk >= 70 else 0.62,
            }
        ],
        "one_key_cause": "L'urge to trade sta guidando troppo il timing." if compulsion_risk >= 60 else "Serve maggiore costanza nelle pause e nel reset.",
        "one_thing_done_well": "Hai chiuso la giornata con il check-in EOD: ottimo ancoraggio di disciplina.",
        "tomorrow_protocol": {
            "mode": mode,
            "micro_rule_if_then": "IF urge > 6 THEN pausa 10 minuti e nessun nuovo ordine finche non torni sotto 5.",
            "constraints": {
                "max_trades": max_trades,
                "timebox_minutes": timebox,
                "allowed_setups": ["A_PLUS_ONLY"] if mode != "NORMAL" else ["A+", "B+"],
            },
            "reset_steps": [
                "Rivedi il piano prima dell'apertura.",
                "Imposta limite trade e timer di pausa.",
                "Scrivi 1 riga di review dopo ogni operazione.",
            ],
        },
        "readiness": {
            "confidence_readiness_0_100": confidence_readiness,
            "message_to_trader": "Conferma una routine minima ripetibile: questa settimana conta piu della perfezione.",
            "promotion": {
                "suggested": confidence_readiness >= 75,
                "eligible": confidence_readiness >= 75 and discipline >= 65,
                "next_phase": "MAINTENANCE",
                "prove_week_required": confidence_readiness >= 75,
                "why": ["Readiness e disciplina sopra soglia"] if confidence_readiness >= 75 else ["Accumula consistenza per alcuni giorni consecutivi"],
            },
        },
        "data_updates": {
            "grace_tokens_remaining": grace_tokens,
            "flags": ["TILT_LOCK_TRIGGERED"] if mode == "TILT_LOCK" else [],
        },
    }

    return result


# ==================== ASCENSION ====================
ASCENSION_LEVELS = [
    {"name": "Novice", "min_xp": 0, "icon": "seedling"},
    {"name": "Apprentice", "min_xp": 100, "icon": "leaf"},
    {"name": "Practitioner", "min_xp": 300, "icon": "tree"},
    {"name": "Expert", "min_xp": 600, "icon": "mountain"},
    {"name": "Master", "min_xp": 1000, "icon": "sun"},
    {"name": "Zen Master", "min_xp": 2000, "icon": "moon"},
    {"name": "Market God", "min_xp": 5000, "icon": "crown"},
]


@api_router.get("/ascension/status")
async def get_ascension_status(request: Request):
    user = await _get_optional_user(request)
    xp = _to_int((user or {}).get("xp"), 0)

    current_level = ASCENSION_LEVELS[0]
    next_level = ASCENSION_LEVELS[1] if len(ASCENSION_LEVELS) > 1 else None
    for idx, level in enumerate(ASCENSION_LEVELS):
        if xp >= level["min_xp"]:
            current_level = level
            next_level = ASCENSION_LEVELS[idx + 1] if idx + 1 < len(ASCENSION_LEVELS) else None

    if next_level:
        xp_span = max(next_level["min_xp"] - current_level["min_xp"], 1)
        progress = ((xp - current_level["min_xp"]) / xp_span) * 100.0
    else:
        progress = 100.0

    return {
        "xp": xp,
        "current_level": current_level,
        "next_level": next_level,
        "progress": round(max(0.0, min(100.0, progress)), 1),
        "all_levels": ASCENSION_LEVELS,
    }


# ==================== BACKTEST + N8N ====================
@api_router.post("/n8n/architect")
async def n8n_architect(req: N8NRequest, request: Request):
    user = await _get_optional_user(request)
    user_email = _clean_str((user or {}).get("email"), "anonymous@karion.local")
    n8n_url = _clean_str(os.environ.get("N8N_WEBHOOK_URL"), "")

    if not n8n_url:
        return {
            "reply": "[N8N::ARCHITECT] n8n non configurato. Uso logica locale con fallback operativo.",
            "suggested_params": {"risk_management": "ATR based stop con size fissa"},
        }

    try:
        import httpx

        async with httpx.AsyncClient(timeout=20.0) as client_http:
            response = await client_http.post(
                n8n_url,
                json={"prompt": req.prompt, "context": req.context or {}, "user": user_email},
            )
            if 200 <= response.status_code < 300:
                return response.json()
            return {
                "reply": "[N8N::ARCHITECT] endpoint raggiunto ma risposta non valida, fallback locale attivo.",
                "status_code": response.status_code,
            }
    except Exception as exc:
        return {"reply": f"[SYSTEM::ERROR] n8n non raggiungibile: {exc}"}


@api_router.post("/backtest/run", response_model=BacktestResult)
async def run_backtest_engine(params: BacktestRequest):
    result = _simulate_backtest(params)
    return BacktestResult(**result)


@api_router.post("/backtest/save")
async def save_backtest_result(payload: Dict[str, Any], request: Request):
    user = await _get_optional_user(request)
    user_id = _user_id_or_public(user)
    record = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "payload": payload,
        "created_at": _now_iso(),
    }

    if DEMO_MODE or db is None:
        demo_backtests.setdefault(user_id, []).append(record)
    else:
        await db.backtests.insert_one(dict(record))

    return {"status": "saved", "id": record["id"]}


def _research_deep_fallback(message: str) -> Dict[str, object]:
    return {
        "status": "error",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "message": message,
        "signals": [],
        "diversification": [],
        "risk_exposure": {},
        "weekly_bias": [],
        "monthly_bias": [],
        "summary": [],
    }


def _research_sessions_fallback(message: str) -> Dict[str, object]:
    now_iso = datetime.now(timezone.utc).isoformat()
    return {
        "status": "error",
        "generated_at": now_iso,
        "message": message,
        "daily_report": {"rows": [], "summary": {}},
        "auto_analysis": {"insights": [], "weight_updates": []},
        "correlation_matrix": {"primary": [], "extra": []},
        "matrices": {
            "scenario_weekday": {"days": [], "rows": []},
            "bias_asset": {"assets": [], "rows": []},
        },
        "health_score": {"value": 0.0, "status": "error", "components": {}, "sparkline": []},
        "weights": {"weights": {}},
        "historical_stats": {
            "generated_at": now_iso,
            "windows": {},
            "scenario_leaderboard": [],
            "asset_leaderboard": [],
            "daily_trend": [],
        },
        "operational_playbook": {
            "generated_at": now_iso,
            "today": [],
            "week": [],
            "month": [],
        },
    }


def _research_smart_money_fallback(message: str) -> Dict[str, object]:
    now_iso = datetime.now(timezone.utc).isoformat()
    return {
        "status": "error",
        "generated_at": now_iso,
        "message": message,
        "summary": {
            "global_score": 0.0,
            "state": "NO_CLEAR_CLUSTER",
            "top_theme": None,
            "macro_regime": "MIXED",
            "active_cross_asset_flags": 0,
            "uoa_events": 0,
            "message": "Institutional Radar Positioning engine non disponibile.",
        },
        "macro_filter": {
            "regime": "MIXED",
            "growth_proxy": "NEUTRAL",
            "inflation_proxy": "NEUTRAL",
            "liquidity_tone": "TRANSITION",
            "vix": {"current": None, "change": None},
            "scores": {
                "macro_filter_score": 0.0,
                "clarity_score": 0.0,
                "stress_score": 0.0,
            },
            "notes": [],
        },
        "theme_scores": [],
        "uoa_watchlist": [],
        "sector_rotation": [],
        "cross_asset_flags": [],
        "news_lag_model": {"status": "error", "average_estimated_lead_hours": 0.0, "by_theme": [], "notes": []},
        "data_quality": {},
        "explainability": {"top_themes": [], "global_layer_mix": {}},
        "regime_timeline": {"status": "error", "rows": [], "summary": {}},
        "alert_engine": {"generated_at": now_iso, "global_risk": "UNKNOWN", "triggered_count": 0, "alerts": []},
        "validation_lab": {"status": "error", "rows": []},
        "theme_drilldown": {"status": "error", "themes": []},
        "macro_event_overlay": {
            "status": "error",
            "as_of": now_iso,
            "risk_score": 0.0,
            "risk_level": "UNKNOWN",
            "calendar_estimated": True,
            "active_cross_flags": [],
            "upcoming_events": [],
        },
        "lead_lag_radar": {"status": "error", "generated_at": now_iso, "rows": []},
        "signal_decay_monitor": {"status": "error", "generated_at": now_iso, "rows": []},
        "regime_switch_detector": {"status": "error", "generated_at": now_iso, "recent_flips": []},
        "counterfactual_lab": {"status": "error", "generated_at": now_iso, "rows": []},
        "execution_risk_overlay": {"status": "error", "generated_at": now_iso, "rows": []},
        "narrative_saturation_meter": {"status": "error", "generated_at": now_iso, "rows": []},
        "historical_analysis_10y": {
            "status": "error",
            "generated_at": now_iso,
            "lookback_years": 10,
            "theme_rows": [],
            "cross_asset_correlation": [],
            "statistical_tests": [],
            "correlation_tests": [],
            "institutional_leaderboard": [],
            "calendar_playbook": {
                "generated_at": now_iso,
                "weekday_idx_utc": datetime.now(timezone.utc).weekday(),
                "effective_weekday_idx": 0,
                "effective_weekday": "MON",
                "month_idx_utc": datetime.now(timezone.utc).month,
                "month_name": "N/A",
                "weekend_proxy_mode": True,
                "today": [],
                "week": [],
                "month": [],
                "summary": {
                    "bullish_today_count": 0,
                    "bearish_today_count": 0,
                    "bullish_week_count": 0,
                    "bearish_week_count": 0,
                    "bullish_month_count": 0,
                    "bearish_month_count": 0,
                },
            },
            "coverage": {
                "themes_covered": 0,
                "min_samples_10y": 0,
                "max_samples_10y": 0,
                "statistical_tests_covered": 0,
                "correlation_pairs_covered": 0,
                "leaderboard_rows": 0,
                "playbook_rows": 0,
            },
            "summary": {
                "significant_theme_tests": 0,
                "strong_correlation_pairs": 0,
                "structural_break_pairs": 0,
                "regime_shift_pairs": 0,
                "max_corr_drift": 0.0,
            },
        },
        "active_projection_assets": [],
        "methodology": {},
    }


@api_router.get("/research/sources")
async def get_research_sources(current_user: dict = Depends(get_current_user)):
    _ = current_user
    try:
        from institutional_scraper import get_sources_status

        return get_sources_status()
    except Exception:
        return []


@api_router.get("/research/vault")
async def get_research_vault(current_user: dict = Depends(get_current_user)):
    _ = current_user
    try:
        import local_vault

        return local_vault.get_reports()
    except Exception:
        return []


@api_router.get("/research/accuracy")
async def get_research_accuracy(current_user: dict = Depends(get_current_user)):
    _ = current_user
    try:
        import local_vault

        return local_vault.compute_accuracy_heatmap()
    except Exception as exc:
        return {
            "status": "collecting",
            "message": f"Research accuracy unavailable: {exc}",
            "data": [],
        }


@api_router.get("/research/stats")
async def get_research_stats(current_user: dict = Depends(get_current_user)):
    _ = current_user
    try:
        import local_vault

        return local_vault.compute_stats()
    except Exception as exc:
        return {
            "win_rate": None,
            "total_predictions": 0,
            "hits": 0,
            "misses": 0,
            "status": "collecting",
            "message": f"Research stats unavailable: {exc}",
        }


@api_router.get("/research/matrix")
async def get_research_matrix(current_user: dict = Depends(get_current_user)):
    _ = current_user
    try:
        import local_vault_matrix

        return local_vault_matrix.get_matrix_results()
    except Exception:
        return {}


@api_router.get("/research/deep-research")
async def get_research_deep(current_user: dict = Depends(get_current_user)):
    _ = current_user
    try:
        from deep_research_30 import build_deep_research_report

        return build_deep_research_report()
    except Exception as exc:
        return _research_deep_fallback(str(exc))


@api_router.get("/research/smart-money")
async def get_research_smart_money(current_user: dict = Depends(get_current_user)):
    _ = current_user
    try:
        from smart_money_positioning import build_smart_money_positioning

        # Deep research can fail in read-only runtimes; smart-money should still run
        # using live market/cross-asset data with a safe fallback context.
        try:
            from deep_research_30 import build_deep_research_report
            deep_report = build_deep_research_report()
        except Exception:
            deep_report = {"signals": [], "risk_exposure": {}}

        intelligence = _get_intelligence_bundle()
        multi_snapshot = intelligence.get("multi", {})
        projections = intelligence.get("projections", [])

        return build_smart_money_positioning(
            deep_report=deep_report,
            multi_snapshot=multi_snapshot,
            projections=projections,
        )
    except Exception as exc:
        return _research_smart_money_fallback(str(exc))


@api_router.get("/research/sessions")
async def get_research_sessions(current_user: dict = Depends(get_current_user)):
    _ = current_user
    try:
        from session_forensics import get_latest_session_report

        return await asyncio.to_thread(get_latest_session_report)
    except Exception as exc:
        return _research_sessions_fallback(str(exc))


@api_router.get("/research/sessions/history")
async def get_research_sessions_history(limit: int = 30, current_user: dict = Depends(get_current_user)):
    _ = current_user
    try:
        from session_forensics import get_session_report_history

        safe_limit = max(1, min(int(limit or 30), 365))
        rows = await asyncio.to_thread(get_session_report_history, safe_limit)
        return {"count": len(rows), "limit": safe_limit, "items": rows}
    except Exception as exc:
        return {"count": 0, "limit": limit, "items": [], "status": "error", "message": str(exc)}


@api_router.post("/research/matrix-snapshot")
async def save_research_matrix_snapshot(payload: dict, current_user: dict = Depends(get_current_user)):
    _ = current_user
    try:
        if not payload.get("asset") or not payload.get("context"):
            raise HTTPException(status_code=400, detail="Missing asset or context data")
        import local_vault_matrix

        snapshot_id = local_vault_matrix.save_matrix_snapshot(payload)
        return {"success": True, "snapshot_id": snapshot_id}
    except HTTPException:
        raise
    except Exception as exc:
        return {"success": False, "status": "error", "message": str(exc)}


@api_router.post("/research/trigger")
async def trigger_research_ingestion(current_user: dict = Depends(get_current_user)):
    _ = current_user
    try:
        from institutional_scraper import run_institutional_ingestion

        result = await run_institutional_ingestion()
        return {"status": "ok", **result}
    except Exception as exc:
        return {"status": "error", "message": str(exc)}

@api_router.post("/auth/register", response_model=TokenResponse)
async def register(user_data: UserCreate):
    if DEMO_MODE:
        if user_data.email in demo_users:
            raise HTTPException(status_code=400, detail="Email already registered")
        user_id = str(uuid.uuid4())
        demo_users[user_data.email] = {
            "id": user_id, "email": user_data.email, "name": user_data.name,
            "password": hash_password(user_data.password),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "level": "Novice", "xp": 0,
            "auth_provider": "password",
            "linked_accounts": [{"provider": "password", "identifier": user_data.email, "added_at": _now_iso()}],
            "email_verified": True,
            "phone_number": None,
            "phone_verified": False,
        }
    else:
        existing = await db.users.find_one({"email": user_data.email})
        if existing:
            raise HTTPException(status_code=400, detail="Email already registered")
        user_id = str(uuid.uuid4())
        await db.users.insert_one({
            "id": user_id, "email": user_data.email, "name": user_data.name,
            "password": hash_password(user_data.password),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "level": "Novice", "xp": 0,
            "auth_provider": "password",
            "linked_accounts": [{"provider": "password", "identifier": user_data.email, "added_at": _now_iso()}],
            "email_verified": True,
            "phone_number": None,
            "phone_verified": False,
        })
    token = create_token(user_id, user_data.email)
    
    # Send Welcome Email
    try:
        from backend.notification_service import notification_service
        # Background task ideally, but for now synchronous/best-effort
        notification_service.send_welcome_email(user_data.email, user_data.name)
    except Exception as e:
        print(f"Failed to send welcome email: {e}")

    return TokenResponse(access_token=token, user=UserResponse(
        id=user_id, email=user_data.email, name=user_data.name,
        created_at=datetime.now(timezone.utc).isoformat(), level="Novice", xp=0
    ))

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(credentials: UserLogin):
    if DEMO_MODE:
        user = demo_users.get(credentials.email)
    else:
        user = await db.users.find_one({"email": credentials.email})
    if not user or not verify_password(credentials.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_token(user["id"], user["email"])
    return TokenResponse(access_token=token, user=UserResponse(
        id=user["id"], email=user["email"], name=user["name"],
        created_at=user["created_at"], level=user.get("level", "Novice"), xp=user.get("xp", 0)
    ))

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    return UserResponse(**current_user)

# ==================== ACCOUNT SECURITY ====================
@api_router.get("/account/security-state")
async def get_account_security_state(current_user: dict = Depends(get_current_user)):
    user_doc = await _get_user_document(current_user["id"])
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")

    linked_accounts = user_doc.get("linked_accounts") or [
        {
            "provider": user_doc.get("auth_provider", "password"),
            "identifier": user_doc.get("email"),
            "added_at": user_doc.get("created_at", _now_iso()),
        }
    ]

    return {
        "email": user_doc.get("email"),
        "email_masked": _mask_email(user_doc.get("email", "")),
        "email_verified": bool(user_doc.get("email_verified", True)),
        "phone_number": user_doc.get("phone_number"),
        "phone_masked": _mask_phone(user_doc.get("phone_number")),
        "phone_verified": bool(user_doc.get("phone_verified", False)),
        "current_provider": user_doc.get("auth_provider", "password"),
        "linked_accounts": linked_accounts,
    }


@api_router.post("/account/password/request-code")
async def request_password_change_code(current_user: dict = Depends(get_current_user)):
    user_doc = await _get_user_document(current_user["id"])
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")

    code = _generate_code()
    target_email = user_doc["email"]
    await _store_verification_code(user_doc["id"], "password_change", target_email, code)
    delivery = await _send_email_code(target_email, code, "password_change")
    if delivery in {"failed", "unavailable"}:
        raise HTTPException(
            status_code=503,
            detail="Provider email non configurato. Imposta RESEND_API_KEY e RESEND_FROM_EMAIL.",
        )

    payload = {"status": "code_sent", "channel": delivery, "target": _mask_email(target_email)}
    if DEMO_MODE:
        payload["debug_code"] = code
    return payload


@api_router.post("/account/password/confirm")
async def confirm_password_change(req: PasswordCodeConfirmRequest, current_user: dict = Depends(get_current_user)):
    user_doc = await _get_user_document(current_user["id"])
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")

    is_valid = await _verify_code(user_doc["id"], "password_change", user_doc["email"], req.code.strip())
    if not is_valid:
        raise HTTPException(status_code=400, detail="Invalid or expired verification code")

    new_hash = hash_password(req.new_password)
    if DEMO_MODE:
        old_email = user_doc["email"]
        user_doc["password"] = new_hash
        await _replace_demo_user(old_email, user_doc)
    else:
        await db.users.update_one({"id": user_doc["id"]}, {"$set": {"password": new_hash}})

    return {"status": "password_updated"}


@api_router.post("/account/email/request-code")
async def request_email_change_code(req: EmailChangeRequest, current_user: dict = Depends(get_current_user)):
    user_doc = await _get_user_document(current_user["id"])
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    new_email = req.new_email.lower().strip()
    if new_email == user_doc["email"].lower():
        raise HTTPException(status_code=400, detail="New email must be different")

    if DEMO_MODE:
        exists = new_email in demo_users
    else:
        exists = await db.users.find_one({"email": new_email})
    if exists:
        raise HTTPException(status_code=400, detail="Email already in use")

    code = _generate_code()
    await _store_verification_code(user_doc["id"], "email_change", new_email, code)
    delivery = await _send_email_code(new_email, code, "email_change")
    if delivery in {"failed", "unavailable"}:
        raise HTTPException(
            status_code=503,
            detail="Provider email non configurato. Imposta RESEND_API_KEY e RESEND_FROM_EMAIL.",
        )

    payload = {"status": "code_sent", "channel": delivery, "target": _mask_email(new_email)}
    if DEMO_MODE:
        payload["debug_code"] = code
    return payload


@api_router.post("/account/email/confirm")
async def confirm_email_change(req: EmailChangeConfirmRequest, current_user: dict = Depends(get_current_user)):
    user_doc = await _get_user_document(current_user["id"])
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")

    new_email = req.new_email.lower().strip()
    valid = await _verify_code(user_doc["id"], "email_change", new_email, req.code.strip())
    if not valid:
        raise HTTPException(status_code=400, detail="Invalid or expired verification code")

    linked_accounts = user_doc.get("linked_accounts", [])
    for account in linked_accounts:
        if account.get("provider") == "password":
            account["identifier"] = new_email

    if DEMO_MODE:
        old_email = user_doc["email"]
        user_doc["email"] = new_email
        user_doc["linked_accounts"] = linked_accounts
        await _replace_demo_user(old_email, user_doc)
    else:
        await db.users.update_one(
            {"id": user_doc["id"]},
            {"$set": {"email": new_email, "linked_accounts": linked_accounts}},
        )

    new_token = create_token(user_doc["id"], new_email)
    return {"status": "email_updated", "email": new_email, "access_token": new_token}


@api_router.post("/account/phone/request-code")
async def request_phone_verification_code(req: PhoneCodeRequest, current_user: dict = Depends(get_current_user)):
    user_doc = await _get_user_document(current_user["id"])
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")

    full_phone = _normalize_phone(req.country_code, req.phone_number)
    if not re.match(r"^\+\d{7,17}$", full_phone):
        raise HTTPException(status_code=400, detail="Invalid phone format")

    code = _generate_code()
    await _store_verification_code(user_doc["id"], "phone_verify", full_phone, code)

    requested_channel = req.channel.lower().strip()
    delivery = "failed"
    if requested_channel == "sms":
        delivery = await _send_sms_code(full_phone, code)
        if delivery in {"unavailable", "failed"}:
            delivery = await _send_email_code(user_doc["email"], code, "phone_verify")
            if delivery == "email":
                delivery = "email_fallback"
    else:
        delivery = await _send_email_code(user_doc["email"], code, "phone_verify")

    if delivery in {"failed", "unavailable"}:
        raise HTTPException(
            status_code=503,
            detail="Provider SMS non configurato. Imposta TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER (e opzionalmente RESEND fallback).",
        )

    payload = {"status": "code_sent", "channel": delivery, "target": _mask_phone(full_phone)}
    if DEMO_MODE:
        payload["debug_code"] = code
    return payload


@api_router.post("/account/phone/confirm")
async def confirm_phone_verification(req: PhoneCodeConfirmRequest, current_user: dict = Depends(get_current_user)):
    user_doc = await _get_user_document(current_user["id"])
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")

    full_phone = _normalize_phone(req.country_code, req.phone_number)
    valid = await _verify_code(user_doc["id"], "phone_verify", full_phone, req.code.strip())
    if not valid:
        raise HTTPException(status_code=400, detail="Invalid or expired verification code")

    if DEMO_MODE:
        old_email = user_doc["email"]
        user_doc["phone_number"] = full_phone
        user_doc["phone_verified"] = True
        await _replace_demo_user(old_email, user_doc)
    else:
        await db.users.update_one(
            {"id": user_doc["id"]},
            {"$set": {"phone_number": full_phone, "phone_verified": True}},
        )

    return {"status": "phone_verified", "phone_number": full_phone}


@api_router.get("/account/linked-accounts")
async def get_linked_accounts(current_user: dict = Depends(get_current_user)):
    user_doc = await _get_user_document(current_user["id"])
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")

    linked_accounts = user_doc.get("linked_accounts") or [
        {
            "provider": user_doc.get("auth_provider", "password"),
            "identifier": user_doc.get("email"),
            "added_at": user_doc.get("created_at", _now_iso()),
        }
    ]
    return {
        "current_provider": user_doc.get("auth_provider", "password"),
        "linked_accounts": linked_accounts,
    }


@api_router.delete("/account/linked-accounts/{provider}")
async def unlink_account(provider: str, current_user: dict = Depends(get_current_user)):
    user_doc = await _get_user_document(current_user["id"])
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")

    provider = provider.lower().strip()
    linked_accounts = user_doc.get("linked_accounts") or []
    if not linked_accounts:
        raise HTTPException(status_code=400, detail="No linked accounts")

    remaining = [account for account in linked_accounts if account.get("provider", "").lower() != provider]
    if len(remaining) == len(linked_accounts):
        raise HTTPException(status_code=404, detail="Provider not linked")

    current_provider = user_doc.get("auth_provider", "password")
    if current_provider == provider and not remaining:
        raise HTTPException(status_code=400, detail="Cannot remove the only authentication method")

    new_provider = remaining[0]["provider"] if current_provider == provider and remaining else current_provider
    force_logout = current_provider == provider

    if DEMO_MODE:
        old_email = user_doc["email"]
        user_doc["linked_accounts"] = remaining
        user_doc["auth_provider"] = new_provider
        await _replace_demo_user(old_email, user_doc)
    else:
        await db.users.update_one(
            {"id": user_doc["id"]},
            {"$set": {"linked_accounts": remaining, "auth_provider": new_provider}},
        )

    return {"status": "unlinked", "provider": provider, "force_logout": force_logout}

# ==================== STRIPE ROUTES ====================
@api_router.post("/create-checkout", response_model=CheckoutResponse)
async def create_checkout(req: CheckoutRequest, current_user: dict = Depends(get_current_user)):
    """Create a Stripe Checkout Session for the given plan."""
    plan = PLANS.get(req.plan_slug)
    if not plan:
        raise HTTPException(status_code=400, detail=f"Unknown plan: {req.plan_slug}")

    user_id = current_user["id"]
    user_email = current_user["email"]

    # Apply coupon if provided (for both demo and real mode logic)
    applied_coupon = req.coupon_code if req.coupon_code else None

    if not STRIPE_MODE:
        # Demo mode: simulate checkout
        fake_session_id = f"demo_session_{uuid.uuid4().hex[:12]}"
        
        # If it's a 100% discount code, we can acknowledge it in metadata or logs
        # For now, demo mode always "activates" immediately
        
        # Auto-activate subscription in demo mode
        sub_data = {
            "user_id": user_id,
            "plan_slug": req.plan_slug,
            "plan_name": plan["name"],
            "status": "active",
            "feature_flags": plan["feature_flags"],
            "stripe_customer_id": f"demo_cus_{uuid.uuid4().hex[:8]}",
            "stripe_subscription_id": f"demo_sub_{uuid.uuid4().hex[:8]}",
            "expires_at": (datetime.now(timezone.utc) + timedelta(days=30 if 'monthly' in req.plan_slug else 365)).isoformat(),
            "cancel_at_period_end": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "coupon_applied": applied_coupon
        }
        if DEMO_MODE:
            demo_subscriptions[user_id] = sub_data
        else:
            await db.subscriptions.update_one(
                {"user_id": user_id}, {"$set": sub_data}, upsert=True
            )
        return CheckoutResponse(
            checkout_url=f"/checkout/success?session_id={fake_session_id}&plan={req.plan_slug}&discount=100" if applied_coupon == 'KARION100' else f"/checkout/success?session_id={fake_session_id}&plan={req.plan_slug}",
            session_id=fake_session_id,
        )

    # Real Stripe mode
    try:
        # Get or create Stripe customer
        if not DEMO_MODE:
            user_doc = await db.users.find_one({"id": user_id})
            customer_id = user_doc.get("stripe_customer_id") if user_doc else None
        else:
            customer_id = None

        if not customer_id:
            customer = stripe.Customer.create(email=user_email, metadata={"karion_user_id": user_id})
            customer_id = customer.id
            if not DEMO_MODE:
                await db.users.update_one({"id": user_id}, {"$set": {"stripe_customer_id": customer_id}})

        # Build checkout session params
        checkout_params = {
            "customer": customer_id,
            "payment_method_types": ["card"],
            "line_items": [{"price": plan["stripe_price_id"], "quantity": 1}],
            "mode": "subscription",
            "success_url": os.environ.get("FRONTEND_URL", "http://localhost:3000") + "/checkout/success?session_id={CHECKOUT_SESSION_ID}&plan=" + req.plan_slug,
            "cancel_url": os.environ.get("FRONTEND_URL", "http://localhost:3000") + "/pricing",
            "metadata": {"karion_user_id": user_id, "plan_slug": req.plan_slug},
            "allow_promotion_codes": True, # Allow users to also enter codes in Stripe UI
        }

        # Apply specific coupon if provided directly from our UI
        if applied_coupon:
            checkout_params["discounts"] = [{"coupon": applied_coupon}]
            # Note: For Stripe, the 'coupon' ID must exist in Stripe dashboard.
            # If the user enters a 'promotion code', it's different in Stripe.
            # But the 'discounts' array expects a COUPON ID.

        session = stripe.checkout.Session.create(**checkout_params)
        return CheckoutResponse(checkout_url=session.url, session_id=session.id)

    except stripe.error.StripeError as e:
        raise HTTPException(status_code=400, detail=str(e))


@api_router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    """Handle Stripe webhook events."""
    payload = await request.body()

    if STRIPE_MODE and STRIPE_WEBHOOK_SECRET:
        sig_header = request.headers.get("stripe-signature", "")
        try:
            event = stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
        except (ValueError, stripe.error.SignatureVerificationError):
            raise HTTPException(status_code=400, detail="Invalid webhook signature")
    else:
        # Demo mode: parse JSON directly
        try:
            event = json.loads(payload)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid JSON payload")

    event_type = event.get("type", "")

    if event_type == "checkout.session.completed":
        session = event["data"]["object"]
        user_id = session.get("metadata", {}).get("karion_user_id")
        plan_slug = session.get("metadata", {}).get("plan_slug")
        if user_id and plan_slug:
            plan = PLANS.get(plan_slug, {})
            sub_data = {
                "user_id": user_id,
                "plan_slug": plan_slug,
                "plan_name": plan.get("name", plan_slug),
                "status": "active",
                "feature_flags": plan.get("feature_flags", {}),
                "stripe_customer_id": session.get("customer", ""),
                "stripe_subscription_id": session.get("subscription", ""),
                "expires_at": (datetime.now(timezone.utc) + timedelta(days=30 if 'monthly' in plan_slug else 365)).isoformat(),
                "cancel_at_period_end": False,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            if DEMO_MODE:
                demo_subscriptions[user_id] = sub_data
            else:
                await db.subscriptions.update_one(
                    {"user_id": user_id}, {"$set": sub_data}, upsert=True
                )

    elif event_type == "invoice.payment_succeeded":
        invoice = event["data"]["object"]
        customer_id = invoice.get("customer", "")
        if not DEMO_MODE and customer_id:
            user = await db.users.find_one({"stripe_customer_id": customer_id})
            if user:
                sub = await db.subscriptions.find_one({"user_id": user["id"]})
                if sub:
                    new_expiry = (datetime.now(timezone.utc) + timedelta(
                        days=30 if 'monthly' in sub.get('plan_slug', '') else 365
                    )).isoformat()
                    await db.subscriptions.update_one(
                        {"user_id": user["id"]},
                        {"$set": {"status": "active", "expires_at": new_expiry}}
                    )

    elif event_type == "customer.subscription.deleted":
        sub_obj = event["data"]["object"]
        customer_id = sub_obj.get("customer", "")
        if not DEMO_MODE and customer_id:
            user = await db.users.find_one({"stripe_customer_id": customer_id})
            if user:
                await db.subscriptions.update_one(
                    {"user_id": user["id"]},
                    {"$set": {"status": "expired", "feature_flags": {}}}
                )

    return JSONResponse(content={"received": True})


@api_router.get("/subscription/status", response_model=SubscriptionResponse)
async def subscription_status(current_user: dict = Depends(get_current_user)):
    """Get the current user's subscription status."""
    user_id = current_user["id"]

    if DEMO_MODE:
        sub = demo_subscriptions.get(user_id)
    else:
        sub = await db.subscriptions.find_one({"user_id": user_id}, {"_id": 0})

    if not sub:
        return SubscriptionResponse()

    return SubscriptionResponse(
        plan_slug=sub.get("plan_slug"),
        plan_name=sub.get("plan_name"),
        status=sub.get("status", "none"),
        feature_flags=sub.get("feature_flags", {}),
        expires_at=sub.get("expires_at"),
        cancel_at_period_end=sub.get("cancel_at_period_end", False),
    )


@api_router.post("/subscription/cancel")
async def cancel_subscription(current_user: dict = Depends(get_current_user)):
    """Cancel the current user's subscription at period end."""
    user_id = current_user["id"]

    if DEMO_MODE:
        sub = demo_subscriptions.get(user_id)
        if not sub:
            raise HTTPException(status_code=404, detail="No active subscription")
        sub["cancel_at_period_end"] = True
        sub["status"] = "cancelled"
        return {"message": "Subscription will cancel at period end", "expires_at": sub["expires_at"]}

    sub = await db.subscriptions.find_one({"user_id": user_id})
    if not sub:
        raise HTTPException(status_code=404, detail="No active subscription")

    if STRIPE_MODE and sub.get("stripe_subscription_id"):
        try:
            stripe.Subscription.modify(
                sub["stripe_subscription_id"],
                cancel_at_period_end=True
            )
        except stripe.error.StripeError as e:
            raise HTTPException(status_code=400, detail=str(e))

    await db.subscriptions.update_one(
        {"user_id": user_id},
        {"$set": {"cancel_at_period_end": True, "status": "cancelled"}}
    )
    return {"message": "Subscription will cancel at period end", "expires_at": sub.get("expires_at")}


@api_router.get("/plans")
async def get_plans():
    """Return available plans (without Stripe price IDs)."""
    return [
        {
            "slug": slug,
            "name": p["name"],
            "period": p["period"],
            "price_eur": p["price_eur"],
            "feature_flags": p["feature_flags"],
        }
        for slug, p in PLANS.items()
    ]


# Mount router
app.include_router(api_router)
