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
from datetime import datetime, timezone, timedelta

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
        "xp": 1500
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
        raise HTTPException(status_code=500, detail=str(e))

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

@app.get("/api/analysis/multi-source")
async def get_multi_source_analysis():
    # Survival endpoint to prevent 404
    return {
        "status": "success",
        "data": {
            "summary": "Analisi multi-source in fase di aggiornamento. Consultare i grafici per i dati live.",
            "sentiment": "Neutrale",
            "score": 50
        }
    }

@app.get("/api/cot/data")
async def get_cot_data():
    # Survival endpoint to prevent 404
    return {
        "status": "success",
        "data": {}
    }

@app.get("/api/engine/cards")
async def get_engine_cards():
    # Survival endpoint to prevent 404
    return []

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
            "level": "Novice", "xp": 0
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
            "level": "Novice", "xp": 0
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
