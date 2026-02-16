"""
Vercel Serverless Function Entry Point
Lightweight API handler for auth, profile, subscriptions, and Stripe payments.
Heavy operations (engine, AI, market data) run on the local/dedicated backend.
"""
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import Optional, Dict, List
import os
import uuid
import bcrypt
import jwt
import json
import hashlib
import random
import re
from datetime import datetime, timezone, timedelta
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
load_dotenv(Path(__file__).parent.parent / 'backend' / '.env')

# ==================== CONFIG ====================
JWT_SECRET = os.environ.get('JWT_SECRET', 'tradingos-secret-key-2024')
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://0.0.0.0:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173"
    ],
    allow_origin_regex=r"https://.*\.vercel\.app|https://.*\.karion\.it|https://www\.karion\.it",
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
        print(f"[DEV_EMAIL_CODE] {purpose} -> {email}: {code}")
        return "dev_log"

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

# ==================== ROUTES ====================
@app.get("/api/health")
async def health_check():
    return {"status": "ok", "demo_mode": DEMO_MODE}

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
    if delivery == "failed":
        raise HTTPException(status_code=503, detail="Unable to send verification code")

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
    if delivery == "failed":
        raise HTTPException(status_code=503, detail="Unable to send verification code")

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

    if delivery == "failed":
        raise HTTPException(status_code=503, detail="Unable to send verification code")

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
