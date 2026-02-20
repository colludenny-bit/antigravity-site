from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Form, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional, Dict, Any, Tuple
import uuid
from datetime import datetime, timezone, timedelta
import jwt
import bcrypt
from PyPDF2 import PdfReader
import io
import random
import math
import re
import yfinance as yf
from functools import lru_cache
import asyncio
import stripe
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from market_data import market_provider

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Demo Mode - In-memory storage when MongoDB unavailable
DEMO_MODE = False
demo_users = {}  # In-memory user storage for demo
demo_data = {
    "psychology_checkins": [],
    "psychology_eod": [],
    "journal_entries": [],
    "strategies": [],
    "trades": [],
    "community_posts": []
}

# MongoDB connection with fallback to demo mode
try:
    mongo_url = os.environ.get('MONGO_URL', '')
    if not mongo_url:
        raise Exception("No MONGO_URL")
    client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=3000)
    # Test connection
    import asyncio
    async def test_mongo():
        await client.admin.command('ping')
    # asyncio.get_event_loop().run_until_complete(test_mongo())
    db = client[os.environ.get('DB_NAME', 'karion_trading_os')]
    print("✅ Connected to MongoDB")
except Exception as e:
    print(f"⚠️ MongoDB unavailable: {e}")
    print("🎮 Running in DEMO MODE with in-memory storage")
    DEMO_MODE = True
    db = None
    # Pre-populate demo user
    demo_users["test@test.com"] = {
        "id": "demo-user-123",
        "email": "test@test.com",
        "name": "Demo Trader",
        "password": "$2b$12$QUndHtYfA4s8ni5Y27PTA.8MyHLw3TTiI54gQIRcGFmS5Pu7MxIRu",  # password123
        "created_at": "2024-01-01T00:00:00Z",
        "level": "Trader Intermedio",
        "xp": 1500
    }

# JWT Configuration
JWT_SECRET = os.environ.get('JWT_SECRET', 'tradingos-secret-key-2024')
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24

# Emergent LLM Key
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')

# Gemini API Key
import google.generativeai as genai
GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY")
if GOOGLE_API_KEY:
    genai.configure(api_key=GOOGLE_API_KEY)

app = FastAPI(title="TradingOS API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Explicit local
    allow_origin_regex="https://.*\.vercel\.app",  # All Vercel deployments
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
async def health_check():
    return {"status": "ok", "message": "Karion Backend operational"}

@app.get("/api/ready")
async def readiness_check():
    """Readiness probe for local/cloud diagnostics"""
    return {
        "status": "ready",
        "demo_mode": DEMO_MODE,
        "db_connected": db is not None,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

api_router = APIRouter(prefix="/api")
security = HTTPBearer()

# Initialize Scheduler
from apscheduler.schedulers.asyncio import AsyncIOScheduler
scheduler = AsyncIOScheduler()

# Initialize Multi-Source Engine
try:
    from backend.multi_source_engine import MultiSourceEngine
except ImportError:
    try:
        from multi_source_engine import MultiSourceEngine
    except ImportError:
        MultiSourceEngine = None

multi_source_engine = MultiSourceEngine() if MultiSourceEngine else None
latest_engine_cards = []

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Stripe configuration
STRIPE_SECRET_KEY = os.environ.get('STRIPE_SECRET_KEY', '').strip()
STRIPE_WEBHOOK_SECRET = os.environ.get('STRIPE_WEBHOOK_SECRET', '').strip()
FRONTEND_URL = os.environ.get('FRONTEND_URL', 'http://localhost:3000').rstrip('/')
STRIPE_SUCCESS_URL = os.environ.get('STRIPE_SUCCESS_URL', f'{FRONTEND_URL}/pricing?checkout=success').strip()
STRIPE_CANCEL_URL = os.environ.get('STRIPE_CANCEL_URL', f'{FRONTEND_URL}/pricing?checkout=cancel').strip()
STRIPE_SESSION_MODE = os.environ.get('STRIPE_SESSION_MODE', 'subscription').lower()
if STRIPE_SECRET_KEY:
    stripe.api_key = STRIPE_SECRET_KEY
    stripe.max_network_retries = 1
else:
    logger.warning("Stripe secret key missing; checkout endpoint will respond with 503.")

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

class CheckoutSessionCreate(BaseModel):
    price_id: str
    quantity: int = Field(default=1, ge=1)
    mode: str = Field(default="subscription")
    success_url: Optional[str] = None
    cancel_url: Optional[str] = None
    customer_email: Optional[EmailStr] = None
    metadata: Optional[Dict[str, str]] = None

class CheckoutSessionResponse(BaseModel):
    session_id: str
    url: str

class PsychologyCheckin(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    date: str
    confidence: int  # 1-10
    discipline: int  # 1-10
    emotional_state: str
    sleep_hours: float
    sleep_quality: int  # 1-10
    notes: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class PsychologyCheckinCreate(BaseModel):
    confidence: int
    discipline: int
    emotional_state: str
    sleep_hours: float
    sleep_quality: int
    notes: str = ""

class JournalEntry(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    date: str
    plan_respected: bool
    emotions: str
    lucid_state: bool
    optimization_notes: str
    errors_today: str
    lessons_learned: str
    ai_suggestions: List[str] = []
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class JournalEntryCreate(BaseModel):
    plan_respected: bool
    emotions: str
    lucid_state: bool
    optimization_notes: str
    errors_today: str
    lessons_learned: str

class Strategy(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    name: str
    content: str
    ai_optimizations: List[str] = []
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class StrategyCreate(BaseModel):
    name: str
    content: str

class TradeRecord(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    symbol: str
    side: Optional[str] = None
    entry_price: float
    exit_price: float
    profit_loss: float
    profit_loss_r: float
    date: str
    strategy_name: Optional[str] = None
    source: Optional[str] = None
    notes: str = ""
    rules_followed: List[str] = []
    rules_violated: List[str] = []
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class TradeRecordCreate(BaseModel):
    symbol: str
    side: Optional[str] = None
    entry_price: float
    exit_price: float
    profit_loss: float
    profit_loss_r: float
    date: str
    strategy_name: Optional[str] = None
    source: Optional[str] = None
    notes: str = ""
    rules_followed: List[str] = []
    rules_violated: List[str] = []


class TradeBulkDeleteRequest(BaseModel):
    trade_ids: List[str]

class DisciplineRule(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    rule: str
    active: bool = True
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class DisciplineRuleCreate(BaseModel):
    rule: str

class CommunityPost(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    user_name: str
    image_url: str = ""
    caption: str
    profit: float = 0
    likes: int = 0
    comments: List[Dict[str, Any]] = []
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class CommunityPostCreate(BaseModel):
    image_url: str = ""
    caption: str
    profit: float = 0

class AIMessage(BaseModel):
    role: str
    content: str

class AIChatRequest(BaseModel):
    messages: List[AIMessage]
    context: str = "general"

class MonteCarloParams(BaseModel):
    win_rate: float
    avg_win: float
    avg_loss: float
    num_trades: int = 10000
    initial_capital: float = 10000
    risk_per_trade: float = 0.01

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
            # Find user in demo storage
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

# ==================== AUTH ROUTES ====================

@api_router.post("/auth/register", response_model=TokenResponse)
async def register(user_data: UserCreate):
    email = user_data.email.strip().lower()
    if DEMO_MODE:
        if email in demo_users:
            raise HTTPException(status_code=400, detail="Email already registered")
        user_id = str(uuid.uuid4())
        demo_users[email] = {
            "id": user_id,
            "email": email,
            "name": user_data.name,
            "password": hash_password(user_data.password),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "level": "Novice",
            "xp": 0
        }
    else:
        existing = await db.users.find_one({"email": email})
        if existing:
            raise HTTPException(status_code=400, detail="Email already registered")
        user_id = str(uuid.uuid4())
        user_doc = {
            "id": user_id,
            "email": email,
            "name": user_data.name,
            "password": hash_password(user_data.password),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "level": "Novice",
            "xp": 0
        }
        await db.users.insert_one(user_doc)
    
    token = create_token(user_id, email)
    user_response = UserResponse(
        id=user_id,
        email=email,
        name=user_data.name,
        created_at=datetime.now(timezone.utc).isoformat(),
        level="Novice",
        xp=0
    )
    return TokenResponse(access_token=token, user=user_response)

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(credentials: UserLogin):
    email = credentials.email.strip().lower()
    if DEMO_MODE:
        user = demo_users.get(email)
    else:
        user = await db.users.find_one({"email": email})
    
    if not user or not verify_password(credentials.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    token = create_token(user["id"], user["email"])
    user_response = UserResponse(
        id=user["id"],
        email=user["email"],
        name=user["name"],
        created_at=user["created_at"],
        level=user.get("level", "Novice"),
        xp=user.get("xp", 0)
    )
    return TokenResponse(access_token=token, user=user_response)

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    return UserResponse(**current_user)

# ==================== PSYCHOLOGY ROUTES ====================

@api_router.post("/psychology/checkin", response_model=PsychologyCheckin)
async def create_checkin(data: PsychologyCheckinCreate, current_user: dict = Depends(get_current_user)):
    checkin = PsychologyCheckin(
        user_id=current_user["id"],
        date=datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        **data.model_dump()
    )
    await db.psychology_checkins.insert_one(checkin.model_dump())
    
    # Update user XP
    await db.users.update_one({"id": current_user["id"]}, {"$inc": {"xp": 10}})
    return checkin

@api_router.get("/psychology/checkins", response_model=List[PsychologyCheckin])
async def get_checkins(current_user: dict = Depends(get_current_user)):
    if DEMO_MODE:
        return demo_data.get("psychology_checkins", [])
    
    checkins = await db.psychology_checkins.find(
        {"user_id": current_user["id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return checkins

@api_router.get("/psychology/stats")
async def get_psychology_stats(current_user: dict = Depends(get_current_user)):
    if DEMO_MODE:
        checkins = demo_data.get("psychology_checkins", [])
    else:
        checkins = await db.psychology_checkins.find(
            {"user_id": current_user["id"]}, {"_id": 0}
        ).to_list(1000)
    
    if not checkins:
        return {
            "avg_confidence": 0,
            "avg_discipline": 0,
            "avg_sleep_hours": 0,
            "avg_sleep_quality": 0,
            "total_entries": 0,
            "trend": []
        }
    
    total = len(checkins)
    avg_confidence = sum(c.get("confidence", 0) for c in checkins) / total
    avg_discipline = sum(c.get("discipline", 0) for c in checkins) / total
    avg_sleep_hours = sum(c.get("sleep_hours", 0) for c in checkins) / total
    avg_sleep_quality = sum(c.get("sleep_quality", 0) for c in checkins) / total
    
    # Get last 30 entries for trend
    trend = sorted(checkins, key=lambda x: x.get("date", ""), reverse=True)[:30]
    trend_data = [{"date": c.get("date"), "confidence": c.get("confidence"), "discipline": c.get("discipline")} for c in trend]
    
    return {
        "avg_confidence": round(avg_confidence, 1),
        "avg_discipline": round(avg_discipline, 1),
        "avg_sleep_hours": round(avg_sleep_hours, 1),
        "avg_sleep_quality": round(avg_sleep_quality, 1),
        "total_entries": total,
        "trend": trend_data
    }

# ==================== SHARK MIND ENGINE (Psychology EOD) ====================

class EODPsychInput(BaseModel):
    date: str
    stress_1_10: int
    focus_1_10: int
    energy_1_10: int
    physical_tension_1_10: int
    urge_to_trade_0_10: int
    dominant_state_one_word: str = ""
    temptation_one_sentence: str = ""
    behaviors: Dict[str, bool] = {}
    triggers_selected: List[str] = []
    free_note_optional: str = ""

class JournalTelemetryInput(BaseModel):
    session_type: str = "trade_day"
    pnl: float = 0
    trades_count: int = 0
    planned_trades_count: int = 0
    unplanned_trades_count: int = 0
    rule_violations: List[Dict[str, Any]] = []
    overtrading_detected: bool = False

class EngineStateInput(BaseModel):
    phase: str = "ACQUISITION"
    level: int = 1
    confidence_readiness: int = 0
    grace_tokens: int = 3

class SharkMindRequest(BaseModel):
    eod_psych: EODPsychInput
    journal_telemetry: Optional[JournalTelemetryInput] = None
    engine_state: Optional[EngineStateInput] = None

def calculate_shark_scores(eod: EODPsychInput, telemetry: Optional[JournalTelemetryInput], phase: str):
    """Calculate Shark Mind Engine scores based on inputs"""
    
    # Feature extraction
    emotional_load = (eod.stress_1_10 + eod.physical_tension_1_10) / 2 + eod.urge_to_trade_0_10 / 2
    clarity_index = max(0, min(100, (eod.focus_1_10 - eod.stress_1_10 + 10) * 10))
    stability_proxy = max(0, min(100, 100 - abs(eod.stress_1_10 - eod.focus_1_10) * 8))
    
    behaviors = eod.behaviors
    limits_broken = not behaviors.get('limits_respected', True)
    shutdown_missing = not behaviors.get('shutdown_ritual_done', False)
    
    # Calculate discipline score
    discipline_base = 50
    if behaviors.get('limits_respected', True):
        discipline_base += 20
    if behaviors.get('shutdown_ritual_done', False):
        discipline_base += 15
    if behaviors.get('breaks_taken', False):
        discipline_base += 10
    if limits_broken:
        discipline_base -= 30
    
    # Adjust for telemetry
    if telemetry:
        if telemetry.unplanned_trades_count > 0:
            discipline_base -= telemetry.unplanned_trades_count * 10
        if telemetry.overtrading_detected:
            discipline_base -= 20
    
    discipline_score = max(0, min(100, discipline_base))
    
    # Emotional stability
    emotional_stability = max(0, min(100, 100 - emotional_load * 5))
    
    # Compulsion risk
    compulsion_risk = 0
    if eod.urge_to_trade_0_10 > 7:
        compulsion_risk += 30
    if 'FOMO' in eod.triggers_selected:
        compulsion_risk += 20
    if 'REVENGE' in eod.triggers_selected or 'CHASING' in eod.triggers_selected:
        compulsion_risk += 25
    if telemetry and telemetry.unplanned_trades_count > 0:
        compulsion_risk += 15
    compulsion_risk = min(100, compulsion_risk)
    
    # Phase-specific weighting for Shark Score
    if phase == "ACQUISITION":
        # Permissive: focus on habits
        shark_score = int(
            discipline_score * 0.35 +
            clarity_index * 0.25 +
            emotional_stability * 0.25 +
            (100 - compulsion_risk) * 0.15
        )
    elif phase == "MAINTENANCE":
        # Strict: focus on limits and control
        shark_score = int(
            discipline_score * 0.40 +
            clarity_index * 0.20 +
            emotional_stability * 0.20 +
            (100 - compulsion_risk) * 0.20
        )
    else:  # MAINTENANCE_PLUS
        # Killer mode: highest standards
        shark_score = int(
            discipline_score * 0.35 +
            clarity_index * 0.25 +
            emotional_stability * 0.25 +
            (100 - compulsion_risk) * 0.15
        )
        # Additional penalty for any imperfection
        if discipline_score < 80:
            shark_score -= 10
    
    return {
        "shark_score_0_100": max(0, min(100, shark_score)),
        "discipline_0_100": int(discipline_score),
        "clarity_0_100": int(clarity_index),
        "emotional_stability_0_100": int(emotional_stability),
        "compulsion_risk_0_100": int(compulsion_risk)
    }

def detect_patterns(eod: EODPsychInput, telemetry: Optional[JournalTelemetryInput]):
    """Detect behavioral patterns from EOD data"""
    patterns = []
    
    # Tilt Risk
    if ('REVENGE' in eod.triggers_selected or 'CHASING' in eod.triggers_selected) and eod.stress_1_10 > 6:
        patterns.append({
            "pattern_id": "TILT_RISK",
            "evidence": [f"eod:stress_{eod.stress_1_10}", f"triggers:{','.join(eod.triggers_selected)}"],
            "severity": "high" if not eod.behaviors.get('limits_respected', True) else "medium",
            "confidence_0_1": 0.85
        })
    
    # Overtrading
    if telemetry and (telemetry.overtrading_detected or telemetry.unplanned_trades_count > 1):
        patterns.append({
            "pattern_id": "OVERTRADING",
            "evidence": [f"journal:unplanned_trades_{telemetry.unplanned_trades_count}"],
            "severity": "high" if telemetry.unplanned_trades_count > 2 else "medium",
            "confidence_0_1": 0.9
        })
    
    # FOMO Loop
    if 'FOMO' in eod.triggers_selected and eod.urge_to_trade_0_10 > 7:
        patterns.append({
            "pattern_id": "FOMO_LOOP",
            "evidence": [f"eod:urge_{eod.urge_to_trade_0_10}", "trigger:FOMO"],
            "severity": "medium",
            "confidence_0_1": 0.75
        })
    
    # Self Deception
    if eod.stress_1_10 > 6 and not eod.behaviors.get('limits_respected', True) and eod.dominant_state_one_word.lower() in ['bene', 'ok', 'tranquillo', 'calm']:
        patterns.append({
            "pattern_id": "SELF_DECEPTION",
            "evidence": [f"eod:stress_{eod.stress_1_10}", "behavior:limits_broken", f"state:{eod.dominant_state_one_word}"],
            "severity": "high",
            "confidence_0_1": 0.8
        })
    
    # Avoidance
    if 'AVOIDANCE' in eod.triggers_selected or 'FEAR' in eod.triggers_selected:
        patterns.append({
            "pattern_id": "AVOIDANCE",
            "evidence": [f"triggers:{','.join(eod.triggers_selected)}"],
            "severity": "low",
            "confidence_0_1": 0.6
        })
    
    return patterns

def generate_tomorrow_protocol(scores: dict, patterns: list, eod: EODPsychInput, telemetry: Optional[JournalTelemetryInput]):
    """Generate tomorrow's trading protocol based on analysis"""
    
    # Determine mode
    mode = "NORMAL"
    tilt_pattern = next((p for p in patterns if p["pattern_id"] == "TILT_RISK" and p["severity"] == "high"), None)
    overtrading_pattern = next((p for p in patterns if p["pattern_id"] == "OVERTRADING"), None)
    
    if tilt_pattern:
        mode = "TILT_LOCK"
    elif overtrading_pattern or scores["compulsion_risk_0_100"] > 60:
        mode = "OVERTRADING_LOCK"
    elif scores["discipline_0_100"] < 60 or scores["clarity_0_100"] < 50:
        mode = "A_PLUS_ONLY"
    
    # Generate micro rule
    if mode == "TILT_LOCK":
        micro_rule = "IF senti urgenza di 'recuperare' THEN chiudi la piattaforma e fai 10 respiri profondi. Nessun trade per 30 minuti."
    elif mode == "OVERTRADING_LOCK":
        micro_rule = "IF hai già fatto 2 trade THEN stop. Nessuna eccezione. Chiudi la piattaforma."
    elif 'FOMO' in eod.triggers_selected:
        micro_rule = "IF vedi un setup 'imperdibile' che non era nel piano THEN scrivi sul journal perché vuoi entrare. Aspetta 15 minuti. Se ancora lo vuoi, è un no."
    elif eod.urge_to_trade_0_10 > 6:
        micro_rule = "IF l'urge to trade supera 6 THEN fai una pausa di 10 minuti e rivedi il piano. Solo setup A+."
    else:
        micro_rule = "IF completi il pre-market routine THEN puoi tradare. Altrimenti, no trade."
    
    # Constraints
    constraints = {
        "max_trades": 2 if mode in ["TILT_LOCK", "OVERTRADING_LOCK"] else 5,
        "timebox_minutes": 120 if mode == "TILT_LOCK" else 0,
        "allowed_setups": ["A_PLUS_ONLY"] if mode != "NORMAL" else ["A+", "B+"]
    }
    
    # Reset steps
    reset_steps = []
    if mode == "TILT_LOCK":
        reset_steps = [
            "Chiudi la piattaforma immediatamente dopo 1 loss",
            "Fai 5 minuti di respirazione o camminata",
            "Scrivi sul journal cosa è successo prima di rientrare"
        ]
    elif mode == "OVERTRADING_LOCK":
        reset_steps = [
            "Dopo ogni trade, pausa di 15 minuti",
            "Rivedi il trade appena chiuso sul journal",
            "Conferma che il prossimo trade è nel piano"
        ]
    else:
        reset_steps = [
            "Pre-market routine completata",
            "Piano di trading definito",
            "Livelli chiave identificati"
        ]
    
    return {
        "mode": mode,
        "micro_rule_if_then": micro_rule,
        "constraints": constraints,
        "reset_steps": reset_steps
    }

@api_router.post("/psychology/eod")
async def analyze_eod(data: SharkMindRequest, current_user: dict = Depends(get_current_user)):
    """Shark Mind Engine - EOD Analysis Endpoint"""
    
    eod = data.eod_psych
    telemetry = data.journal_telemetry
    engine_state = data.engine_state or EngineStateInput()
    phase = engine_state.phase
    
    # Calculate scores
    scores = calculate_shark_scores(eod, telemetry, phase)
    
    # Detect patterns
    patterns = detect_patterns(eod, telemetry)
    
    # Generate tomorrow protocol
    tomorrow_protocol = generate_tomorrow_protocol(scores, patterns, eod, telemetry)
    
    # Determine key cause and well done
    one_key_cause = "Hai mantenuto il controllo oggi."
    one_thing_done_well = "Hai completato il check-in EOD - questo è già disciplina."
    
    if scores["compulsion_risk_0_100"] > 50:
        one_key_cause = f"L'urge to trade ({eod.urge_to_trade_0_10}/10) sta influenzando le tue decisioni."
    elif not eod.behaviors.get('limits_respected', True):
        one_key_cause = "Hai superato i limiti che ti eri dato. Questo è il punto su cui lavorare."
    elif eod.stress_1_10 > 7:
        one_key_cause = f"Lo stress elevato ({eod.stress_1_10}/10) sta impattando la tua chiarezza."
    elif len(eod.triggers_selected) > 2:
        one_key_cause = f"Troppi trigger attivi: {', '.join(eod.triggers_selected[:3])}. Semplifica domani."
    
    if eod.behaviors.get('shutdown_ritual_done', False):
        one_thing_done_well = "Hai completato il ritual di shutdown - ottimo per chiudere mentalmente la giornata."
    elif eod.behaviors.get('limits_respected', True) and scores["discipline_0_100"] > 70:
        one_thing_done_well = "Hai rispettato i limiti. Questa è disciplina vera, replicala domani."
    elif eod.behaviors.get('breaks_taken', False):
        one_thing_done_well = "Hai fatto pause durante la sessione - questo protegge il tuo capitale psicologico."
    
    # Calculate readiness
    confidence_readiness = engine_state.confidence_readiness
    if scores["shark_score_0_100"] > 70:
        confidence_readiness = min(100, confidence_readiness + 5)
    elif scores["shark_score_0_100"] < 40:
        confidence_readiness = max(0, confidence_readiness - 10)
    
    # Check promotion eligibility
    promotion_eligible = confidence_readiness >= 75 and scores["discipline_0_100"] >= 70
    promotion_suggested = promotion_eligible and phase != "MAINTENANCE_PLUS"
    
    # Grace tokens logic
    grace_tokens = engine_state.grace_tokens
    if phase == "ACQUISITION" and not eod.behaviors.get('limits_respected', True):
        grace_tokens = max(0, grace_tokens - 1)
    
    # Readiness message
    if scores["shark_score_0_100"] >= 75:
        message = f"Oggi hai dimostrato solidità. Shark Score {scores['shark_score_0_100']}. Continua così e la promozione arriverà naturalmente."
    elif scores["shark_score_0_100"] >= 50:
        message = f"Giornata nella media. Focus su {one_key_cause.split('.')[0].lower()}. Una cosa alla volta."
    else:
        message = f"Giornata impegnativa. Nessun giudizio. Domani riparto dalla micro-regola: una sola cosa da fare bene."
    
    # Build response (matching Shark Mind Engine output format)
    result = {
        "date": eod.date,
        "phase": phase,
        "level": engine_state.level,
        "scores": scores,
        "detected_patterns": patterns,
        "one_key_cause": one_key_cause,
        "one_thing_done_well": one_thing_done_well,
        "tomorrow_protocol": tomorrow_protocol,
        "readiness": {
            "confidence_readiness_0_100": confidence_readiness,
            "message_to_trader": message,
            "promotion": {
                "suggested": promotion_suggested,
                "eligible": promotion_eligible,
                "next_phase": "MAINTENANCE" if phase == "ACQUISITION" else "MAINTENANCE_PLUS",
                "prove_week_required": promotion_suggested,
                "why": ["Consistenza dimostrata", "Limiti rispettati"] if promotion_eligible else ["Continua a costruire abitudini"]
            }
        },
        "data_updates": {
            "grace_tokens_remaining": grace_tokens,
            "flags": []
        }
    }
    
    # Add flags
    if tomorrow_protocol["mode"] == "TILT_LOCK":
        result["data_updates"]["flags"].append("TILT_LOCK_TRIGGERED")
    if tomorrow_protocol["mode"] == "OVERTRADING_LOCK":
        result["data_updates"]["flags"].append("OVERTRADING_FLAG")
    
    # Save to DB
    await db.psychology_eod.insert_one({
        "user_id": current_user["id"],
        "date": eod.date,
        "input": data.model_dump(),
        "result": result,
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    # Update user XP
    await db.users.update_one({"id": current_user["id"]}, {"$inc": {"xp": 20}})
    
    return result

# ==================== JOURNAL ROUTES ====================

@api_router.post("/journal/entry", response_model=JournalEntry)
async def create_journal_entry(data: JournalEntryCreate, current_user: dict = Depends(get_current_user)):
    # Generate AI suggestions based on errors
    ai_suggestions = []
    if EMERGENT_LLM_KEY and data.errors_today:
        try:
            from emergentintegrations.llm.chat import LlmChat, UserMessage
            chat = LlmChat(
                api_key=EMERGENT_LLM_KEY,
                session_id=f"journal-{current_user['id']}-{datetime.now().isoformat()}",
                system_message="Sei un coach di trading esperto. Analizza gli errori del trader e dai 3 consigli pratici brevi in italiano."
            ).with_model("openai", "gpt-5.2")
            
            msg = UserMessage(text=f"Errori di oggi: {data.errors_today}\nLezioni apprese: {data.lessons_learned}")
            response = await chat.send_message(msg)
            ai_suggestions = [s.strip() for s in response.split('\n') if s.strip()][:3]
        except Exception as e:
            logger.error(f"AI suggestion error: {e}")
            ai_suggestions = ["Rivedi il tuo piano di trading", "Mantieni la disciplina", "Gestisci le emozioni"]
    
    entry = JournalEntry(
        user_id=current_user["id"],
        date=datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        ai_suggestions=ai_suggestions,
        **data.model_dump()
    )
    await db.journal_entries.insert_one(entry.model_dump())
    await db.users.update_one({"id": current_user["id"]}, {"$inc": {"xp": 15}})
    return entry

@api_router.get("/journal/entries", response_model=List[JournalEntry])
async def get_journal_entries(current_user: dict = Depends(get_current_user)):
    entries = await db.journal_entries.find(
        {"user_id": current_user["id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return entries

@api_router.post("/journal/analyze")
async def analyze_journal_entry(data: dict, current_user: dict = Depends(get_current_user)):
    """Analyze journal entry and provide coach-friend feedback"""
    entry = data.get("entry", {})
    
    # Generate AI response in coach-friend style
    if EMERGENT_LLM_KEY:
        try:
            from emergentintegrations.llm.chat import LlmChat, UserMessage
            
            system_message = """Sei Karion, il coach-amico del trader. Il tuo compito è aiutare, non interrogare.
            
Rispondi in 4 blocchi brevi:
1. "Ti ho capito così" - 1-2 frasi che rispecchiano il suo testo (empatia)
2. "Il punto chiave di oggi" - 1 causa principale (non 5)
3. "Cosa hai fatto bene" - 1 cosa replicabile
4. "Ottimizzazione per domani" - 1 azione singola, specifica e testabile

Stile: caldo, diretto, senza giudicare. Se c'è un errore, trattalo come informazione utile.
Rispondi in JSON con chiavi: understood, keyPoint, wellDone, optimization"""
            
            chat = LlmChat(
                api_key=EMERGENT_LLM_KEY,
                session_id=f"journal-analyze-{current_user['id']}-{datetime.now().timestamp()}",
                system_message=system_message
            ).with_model("openai", "gpt-5.2")
            
            prompt = f"""Analizza questa entry del trader:
- Traded: {entry.get('traded', 'N/A')}
- Mood: {entry.get('mood', 5)}/10, Focus: {entry.get('focus', 5)}/10
- Stress: {entry.get('stress', 5)}/10, Energy: {entry.get('energy', 5)}/10
- Testo: {entry.get('freeText', '')}
- Influenza principale: {entry.get('mainInfluence', '')}
- Cosa cambierebbe: {entry.get('changeOne', '')}
- PnL: {entry.get('pnl', 'N/A')}"""

            msg = UserMessage(text=prompt)
            response = await chat.send_message(msg)
            
            # Try to parse JSON response
            try:
                import json
                return json.loads(response)
            except:
                # Fallback parsing
                return {
                    "understood": response[:200] if len(response) > 200 else response,
                    "keyPoint": "Hai mostrato consapevolezza nel riconoscere le tue emozioni.",
                    "wellDone": "Hai completato il journal, questo è già un grande passo.",
                    "optimization": entry.get('changeOne', 'Domani, concentrati su una sola cosa: seguire il piano.')
                }
                
        except Exception as e:
            logger.error(f"Journal analyze error: {e}")
    
    # Fallback response
    mood = entry.get('mood', 5)
    traded = entry.get('traded', False)
    
    return {
        "understood": f"Hai avuto una giornata {'positiva' if mood > 6 else 'impegnativa' if mood < 4 else 'nella norma'}. {'Hai tradato' if traded else 'Non hai tradato'} e il tuo focus era a {entry.get('focus', 5)}/10.",
        "keyPoint": entry.get('mainInfluence', 'Hai mantenuto la disciplina.'),
        "wellDone": "Hai completato il journal - questo è già disciplina." if mood > 4 else "Hai riconosciuto i tuoi limiti oggi.",
        "optimization": entry.get('changeOne', 'Domani, una sola priorità: seguire il piano senza eccezioni.')
    }

# ==================== STRATEGY ROUTES ====================

@api_router.post("/strategy", response_model=Strategy)
async def create_strategy(data: StrategyCreate, current_user: dict = Depends(get_current_user)):
    strategy = Strategy(user_id=current_user["id"], **data.model_dump())
    await db.strategies.insert_one(strategy.model_dump())
    return strategy

@api_router.get("/strategies", response_model=List[Strategy])
async def get_strategies(current_user: dict = Depends(get_current_user)):
    strategies = await db.strategies.find(
        {"user_id": current_user["id"]}, {"_id": 0}
    ).sort("updated_at", -1).to_list(50)
    return strategies

@api_router.post("/strategy/{strategy_id}/optimize")
async def optimize_strategy(strategy_id: str, current_user: dict = Depends(get_current_user)):
    strategy = await db.strategies.find_one({"id": strategy_id, "user_id": current_user["id"]}, {"_id": 0})
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")
    
    optimizations = []
    if EMERGENT_LLM_KEY:
        try:
            from emergentintegrations.llm.chat import LlmChat, UserMessage
            chat = LlmChat(
                api_key=EMERGENT_LLM_KEY,
                session_id=f"strategy-{strategy_id}",
                system_message="Sei un esperto di trading. Analizza questa strategia e suggerisci 3-5 ottimizzazioni concrete in italiano."
            ).with_model("openai", "gpt-5.2")
            
            msg = UserMessage(text=f"Strategia: {strategy['content']}")
            response = await chat.send_message(msg)
            optimizations = [s.strip() for s in response.split('\n') if s.strip()][:5]
        except Exception as e:
            logger.error(f"Strategy optimization error: {e}")
            optimizations = ["Definisci chiaramente entry e exit", "Imposta stop loss", "Testa su dati storici"]
    
    await db.strategies.update_one(
        {"id": strategy_id},
        {"$set": {"ai_optimizations": optimizations, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"optimizations": optimizations}

# ==================== TRADES ROUTES ====================

MT5_DATE_PATTERN = re.compile(r"\b(\d{4}[./-]\d{2}[./-]\d{2})\b")
MT5_TIME_PATTERN = re.compile(r"\b(\d{2}:\d{2}(?::\d{2})?)\b")
MT5_SYMBOL_PATTERN = re.compile(r"^[A-Z][A-Z0-9._-]{2,14}$")


def _parse_number_token(token: str) -> Optional[float]:
    raw = token.strip().replace(" ", "")
    if not raw:
        return None

    if "," in raw and "." in raw:
        if raw.rfind(",") > raw.rfind("."):
            normalized = raw.replace(".", "").replace(",", ".")
        else:
            normalized = raw.replace(",", "")
    elif "," in raw:
        normalized = raw.replace(",", ".")
    else:
        normalized = raw

    try:
        return float(normalized)
    except ValueError:
        return None


def _normalize_trade_datetime(date_raw: str, time_raw: Optional[str]) -> str:
    normalized_date = date_raw.replace(".", "-").replace("/", "-")
    if not time_raw:
        return f"{normalized_date}T00:00:00"

    if len(time_raw) == 5:
        return f"{normalized_date}T{time_raw}:00"
    return f"{normalized_date}T{time_raw}"


def _find_symbol_token(tokens: List[str], side_index: int) -> Optional[Tuple[int, str]]:
    blacklist = {"buy", "sell", "balance", "credit", "commission", "swap", "tax"}
    preferred_indices = [side_index + 2, side_index + 1, side_index + 3, side_index - 1, side_index - 2]

    for idx in preferred_indices:
        if idx < 0 or idx >= len(tokens):
            continue
        token = re.sub(r"[^A-Za-z0-9._-]", "", tokens[idx]).upper()
        if not token or token.lower() in blacklist:
            continue
        if MT5_SYMBOL_PATTERN.match(token):
            return idx, token
    return None


def _parse_mt5_trade_line(line: str) -> Optional[Dict[str, Any]]:
    lowered = line.lower()
    side_match = re.search(r"\b(buy|sell)\b", lowered)
    date_match = MT5_DATE_PATTERN.search(line)
    if not side_match or not date_match:
        return None

    tokens = [t for t in re.split(r"\s+", line.strip()) if t]
    side_token = side_match.group(1)
    try:
        side_index = next(i for i, token in enumerate(tokens) if token.lower() == side_token)
    except StopIteration:
        return None

    symbol_data = _find_symbol_token(tokens, side_index)
    if not symbol_data:
        return None
    symbol_index, symbol = symbol_data

    numeric_tokens: List[Tuple[int, str, float]] = []
    for i, token in enumerate(tokens):
        cleaned = token.strip().replace("%", "")
        if not re.fullmatch(r"[-+]?\d+(?:[.,]\d+)?", cleaned):
            continue
        parsed = _parse_number_token(cleaned)
        if parsed is None:
            continue
        numeric_tokens.append((i, cleaned, parsed))

    if len(numeric_tokens) < 2:
        return None

    profit_token_index, _, profit_value = numeric_tokens[-1]
    price_candidates = [
        parsed
        for idx, raw, parsed in numeric_tokens
        if idx > symbol_index and idx < profit_token_index and ('.' in raw or ',' in raw)
    ]
    positive_prices = [p for p in price_candidates if p > 0]

    if not positive_prices:
        return None

    entry_price = positive_prices[0]
    exit_price = positive_prices[-1] if len(positive_prices) > 1 else positive_prices[0]
    date_value = date_match.group(1)
    time_match = MT5_TIME_PATTERN.search(line)
    iso_date = _normalize_trade_datetime(date_value, time_match.group(1) if time_match else None)

    note = f"Import MT5 ({side_token.upper()})"
    return {
        "symbol": symbol,
        "side": "long" if side_token.lower() == "buy" else "short",
        "entry_price": round(entry_price, 6),
        "exit_price": round(exit_price, 6),
        "profit_loss": round(profit_value, 2),
        "profit_loss_r": 0.0,
        "date": iso_date,
        "notes": note,
    }


def _extract_mt5_trades_from_text(text: str) -> List[Dict[str, Any]]:
    trades: List[Dict[str, Any]] = []
    seen = set()

    for raw_line in text.splitlines():
        line = " ".join(raw_line.split())
        if not line:
            continue
        parsed = _parse_mt5_trade_line(line)
        if not parsed:
            continue
        key = (
            parsed["symbol"],
            parsed["entry_price"],
            parsed["exit_price"],
            parsed["profit_loss"],
            parsed["date"],
        )
        if key in seen:
            continue
        seen.add(key)
        trades.append(parsed)
    return trades


MT5_REPORT_SECTION_PATTERNS = {
    "summary": re.compile(r"\b1\.\s*Summary\b", re.IGNORECASE),
    "profit_loss": re.compile(r"\b2\.\s*Profit\s*&\s*Loss\b", re.IGNORECASE),
    "long_short": re.compile(r"\b3\.\s*Long\s*&\s*Short\b", re.IGNORECASE),
    "symbols": re.compile(r"\b4\.\s*Symbols\b", re.IGNORECASE),
    "risks": re.compile(r"\b5\.\s*Risks\b", re.IGNORECASE),
}

MT5_REPORT_SECTIONS = {
    "summary": {
        "title": "Summary",
        "metrics": [
            {"label": "Growth", "patterns": [r"Growth"], "orders": ["before", "after"], "require_percent": True, "window": 24},
            {"label": "Drawdown", "patterns": [r"Drawdown", r"Max\.?\s*Drawdown"], "orders": ["before", "after"], "require_percent": True, "window": 26},
            {"label": "Profit Factor", "patterns": [r"Profit\s*Factor"], "orders": ["after", "before"], "require_percent": False, "window": 52},
            {"label": "Recovery Factor", "patterns": [r"Recovery\s*Factor"], "orders": ["after", "before"], "require_percent": False, "window": 52},
            {"label": "Sharp Ratio", "patterns": [r"Sharp\s*Ratio", r"Sharpe\s*Ratio"], "orders": ["after", "before"], "require_percent": False, "window": 52},
            {"label": "Trades per Week", "patterns": [r"Trades\s*per\s*Week"], "orders": ["after", "before"], "window": 36},
            {"label": "Gross Profit", "patterns": [r"Gross\s*Profit"], "orders": ["before", "after"], "require_percent": False, "window": 28},
            {"label": "Gross Loss", "patterns": [r"Gross\s*Loss"], "orders": ["before", "after"], "require_percent": False, "window": 28},
        ],
    },
    "profit_loss": {
        "title": "Profit & Loss",
        "metrics": [
            {"label": "Profit", "patterns": [r"\bProfit\b"], "orders": ["before", "after"], "require_percent": False, "window": 24},
            {"label": "Loss", "patterns": [r"\bLoss\b"], "orders": ["before", "after"], "require_percent": False, "window": 24},
            {"label": "Gross Profit", "patterns": [r"Gross\s*Profit"], "orders": ["before", "after"], "require_percent": False, "window": 28},
            {"label": "Gross Loss", "patterns": [r"Gross\s*Loss"], "orders": ["before", "after"], "require_percent": False, "window": 28},
            {"label": "Commissions", "patterns": [r"Commissions"], "orders": ["after", "before"], "window": 24},
            {"label": "Swaps", "patterns": [r"Swaps"], "orders": ["after", "before"], "window": 24},
            {"label": "Dividends", "patterns": [r"Dividends"], "orders": ["after", "before"], "window": 24},
        ],
    },
    "long_short": {
        "title": "Long & Short",
        "metrics": [
            {"label": "Long", "patterns": [r"\bLong\b"], "orders": ["before", "after"], "window": 24},
            {"label": "Short", "patterns": [r"\bShort\b"], "orders": ["before", "after"], "window": 24},
            {"label": "Netto P/L", "patterns": [r"Netto\s*P\/L", r"Net\s*P\/L"], "orders": ["after", "before"], "window": 28},
            {"label": "Average P/L", "patterns": [r"Average\s*P\/L"], "orders": ["after", "before"], "require_percent": False, "window": 26},
            {"label": "Trades", "patterns": [r"\bTrades\b"], "orders": ["after", "before"], "window": 22},
            {"label": "Win Trades", "patterns": [r"Win\s*Trades"], "orders": ["after", "before"], "window": 24},
            {"label": "Win Rate", "patterns": [r"Win\s*Trades"], "orders": ["after", "before"], "require_percent": True, "window": 32},
        ],
    },
    "symbols": {
        "title": "Symbols",
        "metrics": [
            {"label": "Netto Profit", "patterns": [r"Netto\s*Profit", r"Net\s*Profit"], "orders": ["before", "after"], "window": 26},
            {"label": "Profit Factor by Symbols", "patterns": [r"Profit\s*Factor\s*by\s*Symbols"], "orders": ["after", "before"], "require_percent": False, "window": 52},
            {"label": "Fees by Symbols", "patterns": [r"Fees\s*by\s*Symbols"], "orders": ["after", "before"], "window": 22},
            {"label": "Manual Trading", "patterns": [r"Manual\s*Trading"], "orders": ["before", "after"], "window": 20},
            {"label": "Trading Signals", "patterns": [r"Trading\s*Signals"], "orders": ["before", "after"], "window": 20},
        ],
    },
    "risks": {
        "title": "Risks",
        "metrics": [
            {"label": "Balance", "patterns": [r"Balance"], "orders": ["before", "after"], "require_percent": False, "window": 26},
            {"label": "Drawdown", "patterns": [r"Drawdown"], "orders": ["after", "before"], "require_percent": True, "window": 18},
            {"label": "Deposit Load", "patterns": [r"Deposit\s*Load"], "orders": ["after", "before"], "require_percent": True, "window": 18},
            {"label": "Best trade", "patterns": [r"Best\s*trade"], "orders": ["after", "before"], "require_percent": False, "window": 24},
            {"label": "Worst trade", "patterns": [r"Worst\s*trade"], "orders": ["after", "before"], "require_percent": False, "window": 24},
            {"label": "Max. consecutive wins", "patterns": [r"Max\.?\s*consecutive\s*wins"], "orders": ["after", "before"], "window": 18},
            {"label": "Max. consecutive losses", "patterns": [r"Max\.?\s*consecutive\s*losses"], "orders": ["after", "before"], "window": 18},
            {"label": "Max. consecutive profit", "patterns": [r"Max\.?\s*consecutive\s*profit"], "orders": ["after", "before"], "window": 24},
            {"label": "Max. consecutive loss", "patterns": [r"Max\.?\s*consecutive\s*loss"], "orders": ["after", "before"], "window": 24},
        ],
    },
}

MT5_METRIC_VALUE_PATTERN = r"([+-]?\d[\d\s.,]*%?(?:\s*\(\s*\d[\d\s.,]*%?\s*\))?)"
MT5_METRIC_TOKEN_RE = re.compile(
    r"[-+]?\d[\d\s.,]*(?:%|k|m)?(?:\s*\(\s*[-+]?\d[\d\s.,]*%?\s*\))?",
    re.IGNORECASE,
)


def _compress_spaces(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "")).strip()


def _normalize_metric_token(token: str) -> str:
    cleaned = _compress_spaces(token)
    return cleaned.rstrip(",:;")


def _extract_tokens(fragment: str) -> List[str]:
    tokens = [_normalize_metric_token(match.group(0)) for match in MT5_METRIC_TOKEN_RE.finditer(fragment)]
    return [token for token in tokens if token]


def _extract_metric_value(text: str, metric_cfg: Dict[str, Any]) -> Optional[str]:
    compact = _compress_spaces(text)
    if not compact:
        return None

    patterns = metric_cfg.get("patterns", [])
    orders = metric_cfg.get("orders", ["after", "before"])
    window = int(metric_cfg.get("window", 40))
    require_percent = metric_cfg.get("require_percent", None)

    for label_pattern in patterns:
        label_re = re.compile(label_pattern, re.IGNORECASE)
        for label_match in label_re.finditer(compact):
            for order in orders:
                if order == "after":
                    fragment = compact[label_match.end(): label_match.end() + window]
                    tokens = _extract_tokens(fragment)
                else:
                    fragment = compact[max(0, label_match.start() - window): label_match.start()]
                    tokens = list(reversed(_extract_tokens(fragment)))

                if not tokens:
                    continue

                for token in tokens:
                    has_percent = "%" in token
                    if require_percent is True and not has_percent:
                        continue
                    if require_percent is False and has_percent:
                        continue
                    return token

    return None


def _metric_to_float(raw_value: Optional[str]) -> Optional[float]:
    if not raw_value:
        return None
    match = re.search(r"[-+]?\d[\d\s.,]*", raw_value)
    if not match:
        return None
    return _parse_number_token(match.group(0))


def _metric_to_percent(raw_value: Optional[str]) -> Optional[float]:
    if not raw_value:
        return None

    bracket_percent = re.search(r"\(\s*([-+]?\d[\d\s.,]*)\s*%\s*\)", raw_value)
    if bracket_percent:
        return _parse_number_token(bracket_percent.group(1))

    plain_percent = re.search(r"([-+]?\d[\d\s.,]*)\s*%", raw_value)
    if plain_percent:
        return _parse_number_token(plain_percent.group(1))
    return None


def _extract_primary_symbol(text: str) -> Optional[str]:
    tokens = re.findall(r"\b[A-Z]{2,8}\d{0,3}\b", text)
    if not tokens:
        return None

    blacklist = {
        "DEMO", "USD", "MTWTFSS", "CFD", "YEAR", "TOTAL",
        "NETTO", "PROFIT", "SYMBOLS", "RISKS", "LONG", "SHORT",
        "GAIN", "LOSS", "BALANCE", "EQUITY",
    }
    for token in tokens:
        if token in blacklist:
            continue
        return token
    return None


def _extract_report_period(report_title: str) -> Dict[str, Optional[str]]:
    match = re.search(r"\[(\d{2}\.\d{2}\.\d{4})\s*[–-]\s*(\d{2}\.\d{2}\.\d{4})\]", report_title)
    if not match:
        return {"start": None, "end": None}

    def _to_iso(raw: str) -> str:
        day, month, year = raw.split(".")
        return f"{year}-{month}-{day}"

    return {"start": _to_iso(match.group(1)), "end": _to_iso(match.group(2))}


def _build_pdf_trade_visuals(
    parsed_trades: List[Dict[str, Any]],
    start_balance: Optional[float],
    end_balance: Optional[float],
    period_start: Optional[str],
    period_end: Optional[str],
) -> Dict[str, Any]:
    if not parsed_trades:
        if start_balance is None:
            return {"equity_curve": [], "weekday_distribution": []}
        default_end = period_end or period_start or datetime.now(timezone.utc).date().isoformat()
        start_date = period_start or default_end
        end_date = period_end or default_end
        if start_date != end_date:
            try:
                dt_start = datetime.fromisoformat(start_date)
                dt_end = datetime.fromisoformat(end_date)
                days = max((dt_end - dt_start).days, 1)
                steps = min(max(days // 30, 2), 8)
                curve = []
                for i in range(steps + 1):
                    ratio = i / steps
                    current_dt = dt_start + timedelta(days=int(days * ratio))
                    curve_value = start_balance if end_balance is None else (start_balance + ((end_balance - start_balance) * ratio))
                    curve.append({"date": current_dt.date().isoformat(), "value": round(curve_value, 2)})
                return {
                    "equity_curve": curve,
                    "weekday_distribution": [],
                }
            except Exception:
                pass
        return {
            "equity_curve": [
                {"date": start_date, "value": round(start_balance, 2)},
                {"date": default_end, "value": round(end_balance if end_balance is not None else start_balance, 2)},
            ],
            "weekday_distribution": [],
        }

    sorted_trades = sorted(
        parsed_trades,
        key=lambda t: datetime.fromisoformat((t.get("date") or "").replace("Z", "+00:00"))
        if t.get("date") else datetime.now(timezone.utc),
    )
    equity_curve: List[Dict[str, Any]] = []
    weekday_counts = {k: 0 for k in ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]}

    running_value = start_balance if start_balance is not None else 0.0
    for trade in sorted_trades:
        trade_dt = datetime.fromisoformat((trade.get("date") or "").replace("Z", "+00:00")) if trade.get("date") else datetime.now(timezone.utc)
        pnl = float(trade.get("profit_loss", 0.0))
        running_value += pnl
        equity_curve.append({
            "date": trade_dt.date().isoformat(),
            "value": round(running_value, 2),
        })
        weekday_counts[trade_dt.strftime("%a")] += 1

    weekday_distribution = [{"day": day, "count": count} for day, count in weekday_counts.items()]
    return {
        "equity_curve": equity_curve,
        "weekday_distribution": weekday_distribution,
    }


def _derive_report_metrics(
    sections: Dict[str, Any],
    report_title: str,
    parsed_trades: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    summary_text = sections.get("summary", {}).get("raw_text") or sections.get("summary", {}).get("excerpt", "")
    pnl_text = sections.get("profit_loss", {}).get("raw_text") or sections.get("profit_loss", {}).get("excerpt", "")
    ls_text = sections.get("long_short", {}).get("raw_text") or sections.get("long_short", {}).get("excerpt", "")
    symbols_text = sections.get("symbols", {}).get("raw_text") or sections.get("symbols", {}).get("excerpt", "")
    risks_text = sections.get("risks", {}).get("raw_text") or sections.get("risks", {}).get("excerpt", "")
    report_period = _extract_report_period(report_title or "")

    def _find_number(text: str, patterns: List[str]) -> Optional[float]:
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                value = _parse_number_token(match.group(1))
                if value is not None:
                    return value
        return None

    def _find_int(text: str, patterns: List[str]) -> Optional[int]:
        value = _find_number(text, patterns)
        if value is None:
            return None
        return int(round(value))

    growth_pct = _find_number(summary_text, [r"([+-]?\d[\d\s.,]*)%Growth"])
    summary_drawdown_pct = _find_number(summary_text, [r"([+-]?\d[\d\s.,]*)%Drawdown"])
    summary_cluster_match = re.search(
        r"Total0?5(?P<sharp>\d+\.\d{2})0?5(?P<pf>\d+\.\d{2})0?10(?P<recovery>\d+\.\d{2})0%100%(?P<maxdd>\d+\.\d+)%0%100%(?P<deposit>\d+\.\d+)%011(?P<tradesw>\d)0s1d(?P<holdm>\d+)m",
        summary_text,
        re.IGNORECASE,
    )

    gross_profit = _find_number(pnl_text, [r"([+-]?\d[\d\s.,]*)\s*Gross\s*Profit", r"([+-]?\d[\d\s.,]*)\s*Profit"])
    gross_loss = _find_number(pnl_text, [r"([+-]?\d[\d\s.,]*)\s*Gross\s*Loss", r"([+-]?\d[\d\s.,]*)\s*Loss"])
    if gross_profit is None:
        gross_profit = _find_number(summary_text, [r"([+-]?\d[\d\s.,]*)\s*Gross\s*Profit"])
    if gross_loss is None:
        gross_loss = _find_number(summary_text, [r"([+-]?\d[\d\s.,]*)\s*Gross\s*Loss"])

    net_pnl = _find_number(ls_text, [r"Netto\s*P\/L:\s*([+-]?\d[\d\s.,]*)"])
    if net_pnl is None and (gross_profit is not None or gross_loss is not None):
        net_pnl = (gross_profit or 0.0) + (gross_loss or 0.0)

    long_pair = re.search(r"(\d+)\s*\(([\d.,]+)%\)\s*Long", ls_text, re.IGNORECASE)
    short_pair = re.search(r"(\d+)\s*\(([\d.,]+)%\)\s*Short", ls_text, re.IGNORECASE)
    long_count = int(long_pair.group(1)) if long_pair else None
    long_pct = _parse_number_token(long_pair.group(2)) if long_pair else None
    short_count = int(short_pair.group(1)) if short_pair else None
    short_pct = _parse_number_token(short_pair.group(2)) if short_pair else None

    total_trades = _find_int(ls_text, [r"Trades:\s*(\d+)"])
    if total_trades is None and long_count is not None and short_count is not None:
        total_trades = long_count + short_count

    win_rate_pct = _find_number(ls_text, [r"Win\s*Trades:\s*([+-]?\d[\d.,]*)%"])
    win_trades = _find_int(ls_text, [r"Win\s*Trades:\s*(\d+)"])

    avg_pl = None
    avg_pl_matches = re.findall(r"Average\s*P\/L:\s*([+-]?\d[\d\s.,]*%?)", ls_text, re.IGNORECASE)
    for match in avg_pl_matches:
        if "%" in match:
            continue
        parsed = _parse_number_token(match)
        if parsed is not None:
            avg_pl = parsed
            break

    symbol_head_match = re.search(r"4\.\s*Symbols\s*([+-]?\d[\d\s.,]*)\s*([A-Z][A-Z0-9]{2,10})", symbols_text, re.IGNORECASE)
    primary_symbol = symbol_head_match.group(2) if symbol_head_match else _extract_primary_symbol(symbols_text)
    symbol_net = _parse_number_token(symbol_head_match.group(1)) if symbol_head_match else None

    pf_segment_match = re.search(r"Profit\s*Factor\s*by\s*Symbols(.*?)Netto\s*Profit\s*by\s*Symbols", symbols_text, re.IGNORECASE)
    symbol_pf = None
    if pf_segment_match:
        pf_segment = pf_segment_match.group(1)
        if primary_symbol:
            pf_segment = pf_segment.replace(primary_symbol, " ")
        pf_candidates = re.findall(r"([+-]?\d{1,2}\.\d{1,4})", pf_segment)
        if pf_candidates:
            parsed_pf = _parse_number_token(pf_candidates[-1])
            if parsed_pf is not None:
                symbol_pf = parsed_pf

    manual_trades = _find_int(symbols_text, [r"(\d+)\s*Manual\s*Trading"])
    signals = _find_int(symbols_text, [r"(\d+)\s*Trading\s*Signals"])

    risk_balance = _find_number(risks_text, [r"Risks\s*([+-]?\d[\d\s.,]*)\s*Balance"])
    risk_drawdown_pct = _find_number(risks_text, [r"Balance\s*([+-]?\d[\d\s.,]*)%Drawdown"])
    risk_deposit_load_pct = _find_number(risks_text, [r"Balance\s*([+-]?\d[\d\s.,]*)%Deposit\s*Load"])
    best_trade = _find_number(risks_text, [r"Best\s*trade:\s*([+-]?\d[\d\s.,]*)"])
    worst_trade = _find_number(risks_text, [r"Worst\s*trade:\s*([+-]?\d[\d\s.,]*)"])
    max_consecutive_wins = _find_int(risks_text, [r"Max\.?\s*consecutive\s*wins:\s*([+-]?\d[\d\s.,]*)"])
    max_consecutive_losses = _find_int(risks_text, [r"Max\.?\s*consecutive\s*losses:\s*([+-]?\d[\d\s.,]*)"])
    max_consecutive_profit = _find_number(risks_text, [r"Max\.?\s*consecutive\s*profit:\s*([+-]?\d[\d\s.,]*)"])
    max_consecutive_loss = _find_number(risks_text, [r"Max\.?\s*consecutive\s*loss:\s*([+-]?\d[\d\s.,]*)"])

    profit_factor = None
    if gross_profit is not None and gross_loss not in (None, 0):
        profit_factor = abs(gross_profit / gross_loss)
    elif symbol_pf is not None:
        profit_factor = symbol_pf
    if summary_cluster_match:
        profit_factor = _parse_number_token(summary_cluster_match.group("pf")) or profit_factor

    sharp_ratio = _parse_number_token(summary_cluster_match.group("sharp")) if summary_cluster_match else None
    recovery_factor = _parse_number_token(summary_cluster_match.group("recovery")) if summary_cluster_match else None
    cluster_max_drawdown_pct = _parse_number_token(summary_cluster_match.group("maxdd")) if summary_cluster_match else None
    max_deposit_load_pct = _parse_number_token(summary_cluster_match.group("deposit")) if summary_cluster_match else None
    trades_per_week = _parse_number_token(summary_cluster_match.group("tradesw")) if summary_cluster_match else None
    avg_hold_minutes = _parse_number_token(summary_cluster_match.group("holdm")) if summary_cluster_match else None

    start_balance = None
    if isinstance(risk_balance, (int, float)) and isinstance(net_pnl, (int, float)):
        start_balance = risk_balance - net_pnl

    if recovery_factor is None and isinstance(net_pnl, (int, float)):
        dd_pct = cluster_max_drawdown_pct if cluster_max_drawdown_pct is not None else summary_drawdown_pct
        if isinstance(start_balance, (int, float)) and isinstance(dd_pct, (int, float)) and dd_pct > 0:
            dd_abs = start_balance * (dd_pct / 100.0)
            if dd_abs > 0:
                recovery_factor = net_pnl / dd_abs

    if trades_per_week is None:
        total_for_week = total_trades if isinstance(total_trades, (int, float)) else None
        if total_for_week and report_period.get("start") and report_period.get("end"):
            try:
                dt_start = datetime.fromisoformat(report_period["start"])
                dt_end = datetime.fromisoformat(report_period["end"])
                total_weeks = max((dt_end - dt_start).days / 7.0, 1 / 7)
                trades_per_week = total_for_week / total_weeks
            except Exception:
                pass

    visuals = _build_pdf_trade_visuals(
        parsed_trades or [],
        start_balance,
        risk_balance,
        report_period.get("start"),
        report_period.get("end"),
    )

    return {
        "report_period": report_period,
        "summary": {
            "growth_pct": growth_pct,
            "drawdown_pct": summary_drawdown_pct if summary_drawdown_pct is not None else risk_drawdown_pct,
            "profit_factor": round(profit_factor, 4) if isinstance(profit_factor, (int, float)) else None,
            "avg_r": None,
            "start_balance": round(start_balance, 2) if isinstance(start_balance, (int, float)) else None,
            "final_balance": round(risk_balance, 2) if isinstance(risk_balance, (int, float)) else None,
            "sharp_ratio": round(sharp_ratio, 4) if isinstance(sharp_ratio, (int, float)) else None,
            "recovery_factor": round(recovery_factor, 4) if isinstance(recovery_factor, (int, float)) else None,
            "max_drawdown_pct": cluster_max_drawdown_pct if isinstance(cluster_max_drawdown_pct, (int, float)) else (summary_drawdown_pct if summary_drawdown_pct is not None else risk_drawdown_pct),
            "max_deposit_load_pct": max_deposit_load_pct,
            "trades_per_week": round(trades_per_week, 3) if isinstance(trades_per_week, (int, float)) else None,
            "avg_hold_minutes": avg_hold_minutes,
        },
        "profit_loss": {
            "gross_profit": round(gross_profit, 2) if isinstance(gross_profit, (int, float)) else None,
            "gross_loss": round(gross_loss, 2) if isinstance(gross_loss, (int, float)) else None,
            "net_pnl": round(net_pnl, 2) if isinstance(net_pnl, (int, float)) else None,
            "commissions": _find_number(pnl_text, [r"([+-]?\d[\d\s.,]*)\s*Commissions"]),
            "swaps": _find_number(pnl_text, [r"([+-]?\d[\d\s.,]*)\s*Swaps"]),
            "dividends": _find_number(pnl_text, [r"([+-]?\d[\d\s.,]*)\s*Dividends"]),
        },
        "long_short": {
            "long_count": long_count,
            "long_pct": long_pct,
            "short_count": short_count,
            "short_pct": short_pct,
            "total_trades": total_trades,
            "win_rate_pct": round(win_rate_pct, 2) if isinstance(win_rate_pct, (int, float)) else None,
            "win_trades": win_trades,
            "net_pnl": net_pnl,
            "avg_pl": avg_pl,
        },
        "symbols": {
            "primary_symbol": primary_symbol,
            "net_profit": symbol_net if symbol_net is not None else _find_number(symbols_text, [r"([+-]?\d[\d\s.,]*)\s*Netto\s*Profit"]),
            "profit_factor": symbol_pf,
            "manual_trades": manual_trades,
            "signals": signals,
            "items": ([{
                "symbol": primary_symbol,
                "net_pnl": symbol_net if symbol_net is not None else None,
                "profit_factor": symbol_pf,
            }] if primary_symbol else []),
        },
        "risks": {
            "balance": risk_balance,
            "drawdown_pct": risk_drawdown_pct,
            "deposit_load_pct": risk_deposit_load_pct,
            "best_trade": best_trade,
            "worst_trade": worst_trade,
            "max_consecutive_wins": max_consecutive_wins,
            "max_consecutive_losses": max_consecutive_losses,
            "max_consecutive_profit": max_consecutive_profit,
            "max_consecutive_loss": max_consecutive_loss,
        },
        "visuals": visuals,
    }


def _extract_report_title(pdf_reader: PdfReader, pages_text: List[str]) -> str:
    metadata = pdf_reader.metadata or {}
    raw_title = (metadata.get("/Title") or "").strip()
    if raw_title:
        return raw_title

    if pages_text:
        first_page_lines = [line.strip() for line in pages_text[0].splitlines() if line.strip()]
        if first_page_lines:
            return first_page_lines[0][:180]
    return "Trade Report MT5"


def _extract_report_sections(pages_text: List[str]) -> Dict[str, Any]:
    section_texts: Dict[str, str] = {key: "" for key in MT5_REPORT_SECTIONS.keys()}
    ordered_keys = list(MT5_REPORT_SECTIONS.keys())

    for idx, raw_text in enumerate(pages_text):
        compact = _compress_spaces(raw_text)
        if not compact:
            continue

        detected_key = None
        for key, pattern in MT5_REPORT_SECTION_PATTERNS.items():
            if pattern.search(compact):
                detected_key = key
                break

        if not detected_key and idx < len(ordered_keys):
            detected_key = ordered_keys[idx]

        if detected_key:
            if section_texts[detected_key]:
                section_texts[detected_key] = f"{section_texts[detected_key]} {compact}"
            else:
                section_texts[detected_key] = compact

    output: Dict[str, Any] = {}
    for key, cfg in MT5_REPORT_SECTIONS.items():
        section_text = section_texts.get(key, "")
        metrics: Dict[str, str] = {}
        for metric_cfg in cfg["metrics"]:
            metric_label = metric_cfg.get("label")
            metric_value = _extract_metric_value(section_text, metric_cfg)
            if metric_value:
                metrics[metric_label] = metric_value

        output[key] = {
            "title": cfg["title"],
            "metrics": metrics,
            "excerpt": section_text[:700],
            "raw_text": section_text,
        }

    return output

@api_router.post("/trades", response_model=TradeRecord)
async def create_trade(data: TradeRecordCreate, current_user: dict = Depends(get_current_user)):
    trade = TradeRecord(user_id=current_user["id"], **data.model_dump())
    if DEMO_MODE or db is None:
        demo_data.setdefault("trades", []).append(trade.model_dump())
        for user in demo_users.values():
            if user.get("id") == current_user["id"]:
                user["xp"] = user.get("xp", 0) + 5
                break
    else:
        await db.trades.insert_one(trade.model_dump())
        await db.users.update_one({"id": current_user["id"]}, {"$inc": {"xp": 5}})
    return trade


@api_router.post("/trades/import/pdf")
async def import_trades_from_pdf(
    file: UploadFile = File(...),
    mode: str = Form(default="summary"),
    strategy_name: Optional[str] = Form(default=None),
    current_user: dict = Depends(get_current_user),
):
    normalized_mode = (mode or "summary").strip().lower()
    if normalized_mode not in {"summary", "trades"}:
        raise HTTPException(status_code=400, detail="Mode non valido. Usa 'summary' o 'trades'")

    filename = (file.filename or "").lower()
    if not filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    try:
        content = await file.read()
        pdf_reader = PdfReader(io.BytesIO(content))
        pages_text = [(page.extract_text() or "") for page in pdf_reader.pages]
        text = "\n".join(pages_text)
    except Exception as e:
        logger.error(f"PDF trade import read error: {e}")
        raise HTTPException(status_code=400, detail="Invalid or unreadable PDF")

    cleaned_strategy = strategy_name.strip() if strategy_name else None

    if normalized_mode == "summary":
        sections = _extract_report_sections(pages_text)
        report_title = _extract_report_title(pdf_reader, pages_text)
        parsed_trades = _extract_mt5_trades_from_text(text)
        return {
            "filename": file.filename,
            "mode": "summary",
            "report_title": report_title,
            "page_count": len(pdf_reader.pages),
            "strategy_name": cleaned_strategy,
            "imported_count": 0,
            "sections": sections,
            "derived": _derive_report_metrics(sections, report_title, parsed_trades),
        }

    parsed_trades = _extract_mt5_trades_from_text(text)
    if not parsed_trades:
        raise HTTPException(
            status_code=422,
            detail="Nessuna operazione trovata nel PDF. Carica un report dettagliato MT5/MT4 con storico trade chiusi."
        )

    trade_docs: List[Dict[str, Any]] = []
    for parsed in parsed_trades:
        trade = TradeRecord(
            user_id=current_user["id"],
            strategy_name=cleaned_strategy,
            source="pdf_import",
            **parsed,
        )
        trade_docs.append(trade.model_dump())

    if DEMO_MODE or db is None:
        demo_data.setdefault("trades", []).extend(trade_docs)
        xp_gain = min(len(trade_docs) * 2, 150)
        for user in demo_users.values():
            if user.get("id") == current_user["id"]:
                user["xp"] = user.get("xp", 0) + xp_gain
                break
    else:
        await db.trades.insert_many(trade_docs)
        await db.users.update_one(
            {"id": current_user["id"]},
            {"$inc": {"xp": min(len(trade_docs) * 2, 150)}}
        )

    return {
        "filename": file.filename,
        "imported_count": len(trade_docs),
        "page_count": len(pdf_reader.pages),
        "strategy_name": cleaned_strategy,
        "trades": trade_docs[:30],
    }


@api_router.delete("/trades/{trade_id}")
async def delete_trade(trade_id: str, current_user: dict = Depends(get_current_user)):
    if DEMO_MODE or db is None:
        trades = demo_data.setdefault("trades", [])
        initial_len = len(trades)
        demo_data["trades"] = [
            t for t in trades if not (t.get("id") == trade_id and t.get("user_id") == current_user["id"])
        ]
        deleted_count = initial_len - len(demo_data["trades"])
        if deleted_count == 0:
            raise HTTPException(status_code=404, detail="Trade not found")
        return {"status": "deleted", "deleted_count": deleted_count}

    result = await db.trades.delete_one({"id": trade_id, "user_id": current_user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Trade not found")
    return {"status": "deleted", "deleted_count": 1}


@api_router.post("/trades/delete-bulk")
async def delete_trades_bulk(data: TradeBulkDeleteRequest, current_user: dict = Depends(get_current_user)):
    unique_ids = [tid for tid in dict.fromkeys(data.trade_ids) if tid]
    if not unique_ids:
        raise HTTPException(status_code=400, detail="No trade IDs provided")

    if DEMO_MODE or db is None:
        trades = demo_data.setdefault("trades", [])
        initial_len = len(trades)
        id_set = set(unique_ids)
        demo_data["trades"] = [
            t for t in trades if not (t.get("id") in id_set and t.get("user_id") == current_user["id"])
        ]
        deleted_count = initial_len - len(demo_data["trades"])
        return {
            "status": "deleted",
            "requested_count": len(unique_ids),
            "deleted_count": deleted_count
        }

    result = await db.trades.delete_many({
        "id": {"$in": unique_ids},
        "user_id": current_user["id"]
    })

    return {
        "status": "deleted",
        "requested_count": len(unique_ids),
        "deleted_count": result.deleted_count
    }

@api_router.get("/trades", response_model=List[TradeRecord])
async def get_trades(current_user: dict = Depends(get_current_user)):
    if DEMO_MODE or db is None:
        trades = [
            t for t in demo_data.get("trades", [])
            if t.get("user_id") == current_user["id"]
        ]
        trades.sort(key=lambda t: t.get("created_at", ""), reverse=True)
        return trades[:500]

    trades = await db.trades.find(
        {"user_id": current_user["id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    return trades

@api_router.get("/trades/stats")
async def get_trade_stats(current_user: dict = Depends(get_current_user)):
    if DEMO_MODE or db is None:
        trades = [
            t for t in demo_data.get("trades", [])
            if t.get("user_id") == current_user["id"]
        ][:1000]
    else:
        trades = await db.trades.find({"user_id": current_user["id"]}, {"_id": 0}).to_list(1000)
    
    if not trades:
        return {"total_trades": 0, "win_rate": 0, "avg_r": 0, "total_pnl": 0, "max_dd": 0}
    
    wins = sum(1 for t in trades if t.get("profit_loss", 0) > 0)
    total = len(trades)
    total_pnl = sum(t.get("profit_loss", 0) for t in trades)
    avg_r = sum(t.get("profit_loss_r", 0) for t in trades) / total if total > 0 else 0
    
    return {
        "total_trades": total,
        "win_rate": round((wins / total) * 100, 1) if total > 0 else 0,
        "avg_r": round(avg_r, 2),
        "total_pnl": round(total_pnl, 2),
        "wins": wins,
        "losses": total - wins
    }

# ==================== DISCIPLINE RULES ====================

@api_router.post("/rules", response_model=DisciplineRule)
async def create_rule(data: DisciplineRuleCreate, current_user: dict = Depends(get_current_user)):
    rule = DisciplineRule(user_id=current_user["id"], **data.model_dump())
    await db.discipline_rules.insert_one(rule.model_dump())
    return rule

@api_router.get("/rules", response_model=List[DisciplineRule])
async def get_rules(current_user: dict = Depends(get_current_user)):
    rules = await db.discipline_rules.find(
        {"user_id": current_user["id"]}, {"_id": 0}
    ).to_list(50)
    return rules

@api_router.delete("/rules/{rule_id}")
async def delete_rule(rule_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.discipline_rules.delete_one({"id": rule_id, "user_id": current_user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Rule not found")
    return {"status": "deleted"}

# ==================== COMMUNITY ====================

@api_router.post("/community/posts", response_model=CommunityPost)
async def create_post(data: CommunityPostCreate, current_user: dict = Depends(get_current_user)):
    post = CommunityPost(
        user_id=current_user["id"],
        user_name=current_user["name"],
        **data.model_dump()
    )
    await db.community_posts.insert_one(post.model_dump())
    return post

@api_router.get("/community/posts", response_model=List[CommunityPost])
async def get_posts():
    posts = await db.community_posts.find({}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return posts

@api_router.post("/community/posts/{post_id}/like")
async def like_post(post_id: str, current_user: dict = Depends(get_current_user)):
    await db.community_posts.update_one({"id": post_id}, {"$inc": {"likes": 1}})
    return {"status": "liked"}

# ==================== AI CHAT ====================

@api_router.post("/ai/chat")
async def ai_chat(request: AIChatRequest, current_user: dict = Depends(get_current_user)):
    if not EMERGENT_LLM_KEY:
        return {"response": "AI non configurata. Contatta l'amministratore."}
    
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        
        system_prompts = {
            "general": "Sei Karion, un AI coach di trading personale. Parla in modo amichevole, professionale e intimo. Rispondi sempre in italiano senza link o formattazione markdown complessa. Sii conciso ma empatico.",
            "coach": "Sei Karion, coach di trading personale. Dai consigli pratici e motivazionali. Sii empatico e professionale.",
            "risk": "Sei Karion esperto di risk management. Calcola position size e rischi. Sii preciso e chiaro.",
            "psych": "Sei Karion psicologo del trading. Aiuta il trader a gestire stress ed emozioni. Sii comprensivo e supportivo.",
            "strategy": "Sei Karion analista di strategie. Valuta setup e pattern con occhio critico ma costruttivo.",
            "journal": "Sei Karion che rivede il journal del trader. Trova pattern comportamentali e suggerisci miglioramenti.",
            "performance": "Sei Karion coach di performance. Analizza statistiche e indica aree di miglioramento."
        }
        
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"karion-{current_user['id']}-{datetime.now().timestamp()}",
            system_message=system_prompts.get(request.context, system_prompts["general"])
        ).with_model("openai", "gpt-5.2")
        
        last_message = request.messages[-1].content if request.messages else ""
        msg = UserMessage(text=last_message)
        response = await chat.send_message(msg)
        
        return {"response": response}
    except Exception as e:
        logger.error(f"AI chat error: {e}")
        return {"response": f"Errore AI: {str(e)}"}

@api_router.post("/ai/intimate-analysis")
async def ai_intimate_analysis(current_user: dict = Depends(get_current_user)):
    """Generate a deep, personal analysis of the trader's journey"""
    if not EMERGENT_LLM_KEY:
        return {"analysis": "AI non configurata."}
    
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        
        # Fetch user's data from various sources
        user_id = current_user['id']
        
        # Get psychology stats
        psych_entries = await db.psychology_entries.find({"user_id": user_id}).sort("date", -1).limit(30).to_list(30)
        
        # Get journal entries
        journal_entries = await db.journal_entries.find({"user_id": user_id}).sort("created_at", -1).limit(20).to_list(20)
        
        # Build context
        context_parts = []
        
        if psych_entries:
            avg_confidence = sum(e.get('confidence', 5) for e in psych_entries) / len(psych_entries)
            avg_stress = sum(e.get('stress', 5) for e in psych_entries) / len(psych_entries)
            avg_sleep = sum(e.get('sleep_hours', 7) for e in psych_entries) / len(psych_entries)
            context_parts.append(f"Ultimi 30 giorni: Confidence media {avg_confidence:.1f}/10, Stress medio {avg_stress:.1f}/10, Sonno medio {avg_sleep:.1f}h")
        
        if journal_entries:
            context_parts.append(f"Ha scritto {len(journal_entries)} entry nel journal recentemente")
        
        context = "\n".join(context_parts) if context_parts else "Dati limitati disponibili"
        
        system_message = """Sei Karion, l'AI coach intimo di questo trader. Scrivi un'analisi personale profonda e sincera.

Il tuo tono deve essere:
- Amichevole ma professionale
- Empatico e comprensivo
- Onesto ma mai duro
- Motivazionale e costruttivo
- Come un mentore che conosce bene il trader

Struttura l'analisi in:
1. Riconoscimento del percorso fatto
2. Punti di forza osservati
3. Aree di miglioramento (con delicatezza)
4. Consiglio personale per il futuro
5. Una frase di chiusura motivazionale

Non usare emoji, link o formattazione markdown complessa. Scrivi in modo naturale e umano."""

        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"intimate-{user_id}-{datetime.now().timestamp()}",
            system_message=system_message
        ).with_model("openai", "gpt-5.2")
        
        prompt = f"""Analizza questo trader in modo intimo e personale.

Dati disponibili:
{context}

Scrivi un'analisi personale come se lo conoscessi da tempo. Sii sincero, empatico e costruttivo."""

        msg = UserMessage(text=prompt)
        response = await chat.send_message(msg)
        
        return {"analysis": response}
    except Exception as e:
        logger.error(f"Intimate analysis error: {e}")
        # Return a thoughtful fallback
        return {"analysis": """Caro trader,

Anche se non ho tutti i tuoi dati a disposizione, voglio dirti una cosa importante.

Il fatto che tu sia qui, che tu stia cercando di migliorare, che tu abbia la curiosità di esplorare nuovi strumenti - questo già dice molto di te.

Il trading è un percorso solitario, spesso incompreso. Ma ricorda: ogni grande trader è passato per momenti di dubbio. La differenza sta nella persistenza, nella capacità di imparare dai propri errori, e nella disciplina di tornare ogni giorno un po' più preparati di prima.

Io sono qui per accompagnarti in questo viaggio. Non come un giudice, ma come un alleato silenzioso che vede il tuo impegno e ci crede.

Continua così. Un passo alla volta.

Con rispetto,
Karion"""}

# ==================== MONTE CARLO ====================

@api_router.post("/montecarlo/simulate")
async def monte_carlo_simulation(params: MonteCarloParams, current_user: dict = Depends(get_current_user)):
    results = []
    bankruptcies = 0
    final_capitals = []
    max_drawdowns = []
    
    num_simulations = 10000  # Run 10000 simulations
    
    for _ in range(num_simulations):
        capital = params.initial_capital
        equity_curve = [capital]
        peak = capital
        max_dd = 0
        
        for _ in range(params.num_trades):
            risk_amount = capital * params.risk_per_trade
            if random.random() < params.win_rate:
                capital += risk_amount * params.avg_win
            else:
                capital -= risk_amount * params.avg_loss
            
            equity_curve.append(capital)
            
            # Track drawdown
            if capital > peak:
                peak = capital
            dd = ((peak - capital) / peak * 100) if peak > 0 else 0
            if dd > max_dd:
                max_dd = dd
            
            if capital <= 0:
                bankruptcies += 1
                break
        
        final_capitals.append(capital)
        max_drawdowns.append(max_dd)
        if len(results) < 100:  # Store first 100 curves for visualization
            results.append(equity_curve)
    
    # Sort final capitals for percentile calculation
    sorted_capitals = sorted(final_capitals)
    
    avg_final = sum(final_capitals) / len(final_capitals)
    median_final = sorted_capitals[len(sorted_capitals) // 2]
    max_final = max(final_capitals)
    min_final = min(final_capitals)
    bankruptcy_rate = (bankruptcies / num_simulations) * 100
    avg_max_dd = sum(max_drawdowns) / len(max_drawdowns)
    worst_dd = max(max_drawdowns)
    
    # Calculate percentiles
    p10_final = sorted_capitals[int(len(sorted_capitals) * 0.1)]
    p90_final = sorted_capitals[int(len(sorted_capitals) * 0.9)]
    
    return {
        "equity_curves": results[:50],  # Send 50 for visualization
        "avg_final_capital": round(avg_final, 2),
        "median_final_capital": round(median_final, 2),
        "max_final_capital": round(max_final, 2),
        "min_final_capital": round(min_final, 2),
        "p10_final_capital": round(p10_final, 2),
        "p90_final_capital": round(p90_final, 2),
        "bankruptcy_rate": round(bankruptcy_rate, 2),
        "avg_max_drawdown": round(avg_max_dd, 2),
        "worst_drawdown": round(worst_dd, 2),
        "num_simulations": num_simulations,
        "params": params.model_dump()
    }

# ==================== PDF ANALYSIS ====================

@api_router.post("/analysis/pdf")
async def analyze_pdf(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")
    
    try:
        content = await file.read()
        pdf_reader = PdfReader(io.BytesIO(content))
        text = ""
        for page in pdf_reader.pages:
            text += page.extract_text() or ""
        
        # Extract basic stats (simplified)
        stats = {
            "raw_text": text[:2000],  # First 2000 chars
            "page_count": len(pdf_reader.pages)
        }
        
        # AI Analysis
        ai_analysis = ""
        if EMERGENT_LLM_KEY and text:
            try:
                from emergentintegrations.llm.chat import LlmChat, UserMessage
                chat = LlmChat(
                    api_key=EMERGENT_LLM_KEY,
                    session_id=f"pdf-{current_user['id']}-{datetime.now().timestamp()}",
                    system_message="Sei un esperto di analisi report MT5. Analizza questo report e identifica: Win Rate, Drawdown, Profit Factor, numero trade. Dai consigli di miglioramento in italiano."
                ).with_model("openai", "gpt-5.2")
                
                msg = UserMessage(text=f"Analizza questo report MT5:\n{text[:3000]}")
                ai_analysis = await chat.send_message(msg)
            except Exception as e:
                logger.error(f"PDF AI analysis error: {e}")
                ai_analysis = "Analisi AI non disponibile"
        
        return {
            "filename": file.filename,
            "stats": stats,
            "ai_analysis": ai_analysis
        }
    except Exception as e:
        logger.error(f"PDF processing error: {e}")
        raise HTTPException(status_code=500, detail=f"Error processing PDF: {str(e)}")

# ==================== MARKET DATA ====================

# Cache for market data (refresh every 5 minutes)
_market_cache = {"data": None, "timestamp": None}
_vix_cache = {"data": None, "timestamp": None}
_market_fetch_locks: Dict[int, asyncio.Lock] = {}
MARKET_CACHE_HOT_TTL = 8  # seconds
_capital_session_locks: Dict[int, asyncio.Lock] = {}
_capital_session = {
    "cst": None,
    "security_token": None,
    "expires_at": None,
    "base_url": None
}

# Capital.com epic candidates to align CFD feeds with dashboard symbols.
CAPITAL_EPIC_CANDIDATES = {
    "NAS100": ["US100", "US100USD"],
    "SP500": ["US500", "US500USD"],
    "DOW": ["US30", "US30USD"],
    "XAUUSD": ["GOLD", "XAUUSD"],
    "EURUSD": ["EURUSD"]
}

# CoinGecko Proxy Cache
_cg_cache = {
    "top30": {"data": None, "timestamp": None},
    "global": {"data": None, "timestamp": None},
    "trending": {"data": None, "timestamp": None},
    "coins": {}, # cache by coin id
    "charts": {} # cache by coin id
}
CG_CACHE_TTL = 300 # 5 minutes

def get_loop_bound_lock(lock_pool: Dict[int, asyncio.Lock]) -> asyncio.Lock:
    """
    Return one asyncio.Lock per running loop.
    Prevents "Future attached to a different loop" when scheduler and requests
    touch the same async critical section from different event loops.
    """
    loop = asyncio.get_running_loop()
    loop_id = id(loop)
    lock = lock_pool.get(loop_id)
    if lock is None:
        lock = asyncio.Lock()
        lock_pool[loop_id] = lock
    return lock

def get_yf_ticker_safe(symbol: str, period: str = "5d", interval: str = "1d"):
    """Safely fetch data from yfinance with error handling"""
    try:
        ticker = yf.Ticker(symbol)
        hist = ticker.history(period=period, interval=interval)
        if hist.empty:
            return None
        return hist
    except Exception as e:
        logger.error(f"yfinance error for {symbol}: {e}")
        return None

def get_capital_credentials():
    api_key = os.environ.get("CAPITAL_COM_KEY") or os.environ.get("CAPITAL_COM_API_KEY")
    identifier = os.environ.get("CAPITAL_COM_ID") or os.environ.get("CAPITAL_COM_IDENTIFIER")
    password = os.environ.get("CAPITAL_COM_PASSWORD")
    if not api_key or not identifier or not password:
        return None

    raw_demo = (os.environ.get("CAPITAL_COM_DEMO", "true") or "true").strip().lower()
    is_demo = raw_demo not in {"0", "false", "no"}
    default_base = "https://demo-api-capital.backend-capital.com/api/v1" if is_demo else "https://api-capital.backend-capital.com/api/v1"
    base_url = (os.environ.get("CAPITAL_COM_BASE_URL") or default_base).rstrip("/")

    return {
        "api_key": api_key,
        "identifier": identifier,
        "password": password,
        "base_url": base_url
    }

def extract_capital_mid_price(price_block: Optional[Dict[str, Any]]) -> Optional[float]:
    if not isinstance(price_block, dict):
        return None
    bid = price_block.get("bid")
    ask = price_block.get("ask")
    if bid is not None and ask is not None:
        return (float(bid) + float(ask)) / 2.0
    if bid is not None:
        return float(bid)
    if ask is not None:
        return float(ask)
    last_traded = price_block.get("lastTraded")
    if last_traded is not None:
        return float(last_traded)
    return None

def parse_capital_prices_payload(payload: Dict[str, Any]) -> Optional[Dict[str, float]]:
    rows = payload.get("prices")
    if not isinstance(rows, list) or len(rows) == 0:
        return None

    # Ensure deterministic order and pick the latest snapshots.
    def sort_key(row: Dict[str, Any]):
        return row.get("snapshotTimeUTC") or row.get("snapshotTime") or ""

    ordered = sorted((r for r in rows if isinstance(r, dict)), key=sort_key)
    if not ordered:
        return None

    current = extract_capital_mid_price(ordered[-1].get("closePrice"))
    if current is None:
        return None

    prev = None
    if len(ordered) > 1:
        prev = extract_capital_mid_price(ordered[-2].get("closePrice"))
    if prev is None:
        prev = extract_capital_mid_price(ordered[-1].get("openPrice"))

    change = 0.0
    if prev is not None and prev != 0:
        change = ((current - prev) / prev) * 100.0

    return {"price": current, "change": change}

async def ensure_capital_session(force_refresh: bool = False) -> bool:
    creds = get_capital_credentials()
    if not creds:
        return False

    now = datetime.now(timezone.utc)
    if (
        not force_refresh
        and _capital_session["cst"]
        and _capital_session["security_token"]
        and _capital_session["base_url"] == creds["base_url"]
        and _capital_session["expires_at"]
        and _capital_session["expires_at"] > now + timedelta(seconds=30)
    ):
        return True

    capital_session_lock = get_loop_bound_lock(_capital_session_locks)

    async with capital_session_lock:
        now = datetime.now(timezone.utc)
        if (
            not force_refresh
            and _capital_session["cst"]
            and _capital_session["security_token"]
            and _capital_session["base_url"] == creds["base_url"]
            and _capital_session["expires_at"]
            and _capital_session["expires_at"] > now + timedelta(seconds=30)
        ):
            return True

        try:
            import httpx
            headers = {
                "X-CAP-API-KEY": creds["api_key"],
                "Content-Type": "application/json",
                "Accept": "application/json",
            }
            body = {
                "identifier": creds["identifier"],
                "password": creds["password"],
            }
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(f"{creds['base_url']}/session", headers=headers, json=body)
        except Exception as exc:
            logger.warning(f"Capital.com session error: {exc}")
            return False

        if response.status_code >= 400:
            logger.warning(f"Capital.com session rejected ({response.status_code})")
            return False

        cst = response.headers.get("CST")
        security_token = response.headers.get("X-SECURITY-TOKEN")
        if not cst or not security_token:
            logger.warning("Capital.com session missing auth headers")
            return False

        _capital_session["cst"] = cst
        _capital_session["security_token"] = security_token
        _capital_session["base_url"] = creds["base_url"]
        _capital_session["expires_at"] = now + timedelta(minutes=20)
        return True

async def fetch_capital_market_prices(provider_symbols: Dict[str, str]) -> Dict[str, Dict[str, Any]]:
    creds = get_capital_credentials()
    if not creds:
        return {}
    if not await ensure_capital_session():
        return {}

    import httpx
    prices: Dict[str, Dict[str, Any]] = {}

    async with httpx.AsyncClient(timeout=10.0) as client:
        for symbol, epic_candidates in CAPITAL_EPIC_CANDIDATES.items():
            for epic in epic_candidates:
                auth_headers = {
                    "X-CAP-API-KEY": creds["api_key"],
                    "CST": _capital_session["cst"],
                    "X-SECURITY-TOKEN": _capital_session["security_token"],
                    "Accept": "application/json",
                }
                endpoint = f"{creds['base_url']}/prices/{epic}"

                try:
                    response = await client.get(endpoint, headers=auth_headers, params={"resolution": "MINUTE", "max": 2})
                except Exception as exc:
                    logger.warning(f"Capital.com fetch error for {symbol}/{epic}: {exc}")
                    continue

                if response.status_code in (401, 403):
                    # Session likely expired; refresh once and retry this epic.
                    if await ensure_capital_session(force_refresh=True):
                        auth_headers["CST"] = _capital_session["cst"]
                        auth_headers["X-SECURITY-TOKEN"] = _capital_session["security_token"]
                        try:
                            response = await client.get(endpoint, headers=auth_headers, params={"resolution": "MINUTE", "max": 2})
                        except Exception as exc:
                            logger.warning(f"Capital.com retry failed for {symbol}/{epic}: {exc}")
                            continue

                if response.status_code >= 400:
                    continue

                try:
                    payload = response.json()
                except Exception:
                    continue

                parsed = parse_capital_prices_payload(payload)
                if not parsed:
                    continue

                prices[symbol] = {
                    "symbol": symbol,
                    "provider_symbol": provider_symbols.get(symbol, f"CAPITALCOM:{epic}"),
                    "price": round(parsed["price"], 2 if symbol != "EURUSD" else 5),
                    "change": round(parsed["change"], 2),
                    "source": "capitalcom_api",
                }
                break

    return prices

@api_router.get("/market/vix")
async def get_vix_data():
    """Get real VIX data from Yahoo Finance"""
    global _vix_cache
    now = datetime.now(timezone.utc)
    
    # Use cache if less than 5 minutes old
    if _vix_cache["data"] and _vix_cache["timestamp"]:
        age = (now - _vix_cache["timestamp"]).total_seconds()
        if age < 300:  # 5 minutes
            return _vix_cache["data"]
    
    try:
        # Fetch VIX data
        vix_hist = get_yf_ticker_safe("^VIX", period="5d", interval="1d")
        
        if vix_hist is not None and len(vix_hist) >= 2:
            current = float(vix_hist['Close'].iloc[-1])
            yesterday = float(vix_hist['Close'].iloc[-2])
            change = ((current - yesterday) / yesterday) * 100
            
            # Determine direction
            direction = "stable"
            if change > 2:
                direction = "rising"
            elif change < -2:
                direction = "falling"
            
            # Determine regime
            regime = "neutral"
            if current < 18:
                regime = "risk-on"
            elif current > 25:
                regime = "risk-off"
            
            result = {
                "current": round(current, 2),
                "yesterday": round(yesterday, 2),
                "change": round(change, 2),
                "direction": direction,
                "regime": regime,
                "high_5d": round(float(vix_hist['High'].max()), 2),
                "low_5d": round(float(vix_hist['Low'].min()), 2),
                "timestamp": now.isoformat(),
                "source": "yahoo_finance"
            }
            
            _vix_cache["data"] = result
            _vix_cache["timestamp"] = now
            return result
        else:
            raise Exception("No VIX data available")
            
    except Exception as e:
        logger.error(f"VIX fetch error: {e}")
        # Fallback to simulated data
        vix_base = 18 + random.random() * 6
        return {
            "current": round(vix_base, 2),
            "yesterday": round(vix_base + (random.random() - 0.5) * 2, 2),
            "change": round((random.random() - 0.5) * 4, 2),
            "direction": random.choice(["rising", "falling", "stable"]),
            "regime": "neutral",
            "high_5d": round(vix_base + 3, 2),
            "low_5d": round(vix_base - 3, 2),
            "timestamp": now.isoformat(),
            "source": "simulated"
        }

@api_router.get("/market/prices")
async def get_market_prices():
    """Get market prices with non-blocking refresh and stale-cache fallback."""
    global _market_cache
    now = datetime.now(timezone.utc)

    # Serve hot cache quickly for UI smoothness.
    if _market_cache["data"] and _market_cache["timestamp"]:
        age = (now - _market_cache["timestamp"]).total_seconds()
        if age < MARKET_CACHE_HOT_TTL:
            return _market_cache["data"]

    # CFD naming in output; internal feed uses cash indices to align better with CFD quotes
    yf_map = {
        # Yahoo does not provide XAUUSD spot directly; use gold feed fallback
        "XAUUSD": "GC=F",
        "NAS100": "^NDX",
        "SP500": "^GSPC",
        "EURUSD": "EURUSD=X",
        "DOW": "^DJI",
        "VIX": "^VIX",
        "DXY": "DX-Y.NYB"
    }
    provider_symbols = {
        "XAUUSD": "FOREXCOM:XAUUSD",
        "NAS100": "CAPITALCOM:US100",
        "SP500": "CAPITALCOM:US500",
        "EURUSD": "FX:EURUSD",
        "DOW": "CAPITALCOM:US30",
        "VIX": "CBOE:VIX",
        "DXY": "ICEUS:DXY"
    }

    def fetch_yahoo_prices_sync(symbols_to_fetch: Optional[List[str]] = None):
        prices = {}
        symbols = symbols_to_fetch or list(yf_map.keys())
        for key in symbols:
            yf_symbol = yf_map.get(key)
            if not yf_symbol:
                continue
            try:
                ticker = yf.Ticker(yf_symbol)
                price = None
                change = 0.0

                fast_info = getattr(ticker, "fast_info", None)
                if fast_info and getattr(fast_info, "last_price", None):
                    price = float(fast_info.last_price)
                    prev = getattr(fast_info, "previous_close", None)
                    if prev:
                        change = ((price - float(prev)) / float(prev)) * 100
                else:
                    # Daily fallback is far lighter than 1m history.
                    hist = ticker.history(period="2d", interval="1d")
                    if not hist.empty:
                        price = float(hist["Close"].iloc[-1])
                        prev = float(hist["Close"].iloc[-2]) if len(hist) > 1 else float(hist["Open"].iloc[0])
                        if prev:
                            change = ((price - prev) / prev) * 100

                if price is not None:
                    prices[key] = {
                        "symbol": key,
                        "provider_symbol": provider_symbols.get(key, key),
                        "price": round(price, 2 if key != "EURUSD" else 5),
                        "change": round(change, 2),
                        "source": "yahoo_realtime"
                    }
            except Exception as e:
                logger.warning(f"Yahoo fetch failed for {key}: {e}")
        return prices

    # Ensure only one refresh runs; others reuse stale cache.
    market_fetch_lock = get_loop_bound_lock(_market_fetch_locks)

    if market_fetch_lock.locked() and _market_cache["data"]:
        return _market_cache["data"]

    async with market_fetch_lock:
        # Re-check cache in case another waiter already refreshed.
        now = datetime.now(timezone.utc)
        if _market_cache["data"] and _market_cache["timestamp"]:
            age = (now - _market_cache["timestamp"]).total_seconds()
            if age < MARKET_CACHE_HOT_TTL:
                return _market_cache["data"]

        try:
            capital_prices: Dict[str, Dict[str, Any]] = {}
            try:
                capital_prices = await asyncio.wait_for(fetch_capital_market_prices(provider_symbols), timeout=6.0)
            except asyncio.TimeoutError:
                logger.warning("Capital.com fetch timed out, using fallback feeds")

            missing_symbols = [symbol for symbol in yf_map.keys() if symbol not in capital_prices]
            yahoo_prices: Dict[str, Dict[str, Any]] = {}
            if missing_symbols:
                yahoo_prices = await asyncio.wait_for(
                    asyncio.to_thread(fetch_yahoo_prices_sync, missing_symbols),
                    timeout=8.0
                )

            # Prefer Capital.com for supported CFD symbols, fallback to Yahoo for the rest.
            prices = {**yahoo_prices, **capital_prices}
            if not prices and _market_cache["data"]:
                return _market_cache["data"]
            _market_cache["data"] = prices
            _market_cache["timestamp"] = now
            return prices
        except asyncio.TimeoutError:
            logger.warning("Market prices refresh timed out, serving stale cache")
            if _market_cache["data"]:
                return _market_cache["data"]
            return {}

# ==================== MULTI-SOURCE ENGINE (Hourly Analysis) ====================

class AssetAnalysis(BaseModel):
    symbol: str
    direction: str  # Up/Down/Neutral
    p_up: int  # 0-100
    confidence: int  # 0-100
    impulse: str  # Prosegue/Diminuisce/Inverte
    drivers: List[Dict[str, str]]
    invalidation: str
    regime: str  # Risk-On/Risk-Off/Mixed
    next_event: Optional[Dict[str, Any]]
    trade_ready: bool
    last_update: str

# Store for multi-source scores (in-memory cache)
_multi_source_cache = {}

def calculate_multi_source_score(symbol: str, vix_data: dict, prices: dict):
    """
    Multi-source engine combining:
    1. VIX/Regime (35%)
    2. Macro (30%)
    3. News Flow (20%)
    4. COT Positioning (15%)
    """
    vix = vix_data.get("current", 18)
    vix_change = vix_data.get("change", 0)
    vix_direction = vix_data.get("direction", "stable")
    
    # Asset-specific weights
    weights = {
        "XAUUSD": {"vix": 0.20, "macro": 0.35, "news": 0.25, "cot": 0.20},
        "NAS100": {"vix": 0.35, "macro": 0.30, "news": 0.20, "cot": 0.15},
        "SP500": {"vix": 0.35, "macro": 0.30, "news": 0.20, "cot": 0.15},
        "EURUSD": {"vix": 0.15, "macro": 0.35, "news": 0.30, "cot": 0.20}
    }
    w = weights.get(symbol, weights["SP500"])
    
    # 1) VIX/Regime Score (-1 to 1)
    vix_score = 0
    if vix < 14:
        vix_score = 0.8
    elif vix < 18:
        vix_score = 0.5
    elif vix < 22:
        vix_score = 0.1
    elif vix < 28:
        vix_score = -0.4
    else:
        vix_score = -0.8
    
    # Momentum adjustment
    if vix_change > 8:
        vix_score -= 0.4
    elif vix_change > 4:
        vix_score -= 0.2
    elif vix_change < -4:
        vix_score += 0.2
    elif vix_change < -8:
        vix_score += 0.4
    
    # 2) Macro Score (simulated with market context)
    price_data = prices.get(symbol, {})
    price_change = price_data.get("change", 0)
    
    macro_score = 0
    if symbol == "XAUUSD":
        # Gold benefits from risk-off
        macro_score = -vix_score * 0.5 + (random.random() * 0.2 - 0.1)
    elif symbol == "EURUSD":
        # EUR/USD sensitive to rate differentials
        macro_score = (random.random() * 0.4 - 0.2)
    else:
        # Indices follow risk sentiment
        macro_score = vix_score * 0.3 + (random.random() * 0.2 - 0.1)
    
    # 3) News Score (decay applied, simulated)
    news_score = (random.random() * 0.3 - 0.15)
    
    # 4) COT Score (weekly bias, simulated)
    cot_score = (random.random() * 0.4 - 0.2)
    
    # Combined Score
    total_score = (
        w["vix"] * vix_score +
        w["macro"] * macro_score +
        w["news"] * news_score +
        w["cot"] * cot_score
    )
    
    # Convert to probability (logistic)
    p_up = int(100 / (1 + math.exp(-total_score * 4)))
    
    # Confidence based on score magnitude and VIX stability
    confidence = min(95, int(50 + abs(total_score) * 45))
    if abs(vix_change) > 5:
        confidence = max(30, confidence - 15)
    
    # Direction
    direction = "Neutral"
    if p_up >= 58:
        direction = "Up"
    elif p_up <= 42:
        direction = "Down"
    
    # Impulse calculation
    prev_key = f"{symbol}_prev_score"
    prev_score = _multi_source_cache.get(prev_key, total_score)
    
    impulse = "Prosegue"
    score_change = total_score - prev_score
    if abs(score_change) < 0.03:
        impulse = "Prosegue"
    elif (total_score > 0 and score_change < -0.05) or (total_score < 0 and score_change > 0.05):
        impulse = "Diminuisce"
    elif abs(score_change) > 0.1 and (total_score * prev_score < 0):
        impulse = "Inverte"
    
    _multi_source_cache[prev_key] = total_score
    
    # Drivers
    drivers = []
    if abs(w["vix"] * vix_score) > 0.08:
        drivers.append({
            "name": "VIX/Regime",
            "impact": "bullish" if vix_score > 0 else "bearish",
            "detail": f"VIX {vix:.1f} ({vix_direction})"
        })
    if abs(w["macro"] * macro_score) > 0.05:
        drivers.append({
            "name": "Macro",
            "impact": "bullish" if macro_score > 0 else "bearish",
            "detail": "Tassi/Yield"
        })
    if abs(w["news"] * news_score) > 0.03:
        drivers.append({
            "name": "News Flow",
            "impact": "bullish" if news_score > 0 else "bearish",
            "detail": "Sentiment recente"
        })
    if len(drivers) < 2:
        drivers.append({
            "name": "COT Positioning",
            "impact": "bullish" if cot_score > 0 else "bearish",
            "detail": "Bias settimanale"
        })
    
    # Regime
    regime = "Mixed"
    if vix < 18 and vix_change < 2:
        regime = "Risk-On"
    elif vix > 22 or vix_change > 5:
        regime = "Risk-Off"
    
    # Trade ready (high conviction only)
    trade_ready = (p_up >= 60 or p_up <= 40) and confidence >= 65 and impulse != "Inverte"
    
    # Invalidation level
    price = price_data.get("price", 0)
    if direction == "Up":
        invalidation = f"Sotto {price * 0.995:.2f}" if symbol != "EURUSD" else f"Sotto {price * 0.995:.5f}"
    elif direction == "Down":
        invalidation = f"Sopra {price * 1.005:.2f}" if symbol != "EURUSD" else f"Sopra {price * 1.005:.5f}"
    else:
        invalidation = "Attendere breakout direzionale"
    
    return {
        "symbol": symbol,
        "direction": direction,
        "p_up": p_up,
        "confidence": confidence,
        "impulse": impulse,
        "drivers": drivers[:3],
        "invalidation": invalidation,
        "regime": regime,
        "trade_ready": trade_ready,
        "total_score": round(total_score, 4)
    }

@api_router.get("/analysis/multi-source")
async def get_multi_source_analysis():
    """Get hourly multi-source analysis for all assets"""
    now = datetime.now(timezone.utc)
    
    # Get VIX and prices
    vix_data = await get_vix_data()
    prices = await get_market_prices()
    
    analyses = {}
    for symbol in ["XAUUSD", "NAS100", "SP500", "EURUSD"]:
        analysis = calculate_multi_source_score(symbol, vix_data, prices)
        analysis["last_update"] = now.strftime("%H:%M")
        analysis["price"] = prices.get(symbol, {}).get("price", 0)
        analysis["change"] = prices.get(symbol, {}).get("change", 0)
        analyses[symbol] = analysis
    
    # Next macro event
    current_hour = now.hour
    next_event = None
    for event in MACRO_EVENTS:
        event_hour = int(event["time"].split(":")[0])
        if event_hour > current_hour:
            next_event = {**event, "countdown": f"{event_hour - current_hour}h"}
            break
    
    return {
        "analyses": analyses,
        "vix": vix_data,
        "regime": vix_data.get("regime", "neutral"),
        "next_event": next_event,
        "timestamp": now.isoformat(),
        "last_update": now.strftime("%H:%M")
    }

# ==================== COT (Commitment of Traders) ====================

class COTData(BaseModel):
    symbol: str
    report_type: str  # TFF or Disaggregated
    as_of_date: str
    release_date: str
    categories: Dict[str, Any]
    bias: str  # Bull/Bear/Neutral
    confidence: int
    crowding: int
    squeeze_risk: int
    driver_text: str

# Simulated COT data (in production, fetch from CFTC)
def generate_cot_data(symbol: str):
    """Generate simulated COT data based on symbol type"""
    now = datetime.now(timezone.utc)
    # COT is "as of Tuesday", released Friday
    as_of = now - timedelta(days=(now.weekday() - 1) % 7)
    release = as_of + timedelta(days=3)
    
    if symbol in ["NAS100", "SP500", "EURUSD"]:
        # TFF Report
        report_type = "TFF"
        
        # Generate category data
        asset_manager_net = random.randint(-50000, 80000)
        leveraged_net = random.randint(-40000, 40000)
        dealer_net = random.randint(-30000, 30000)
        other_net = random.randint(-20000, 20000)
        
        # Calculate percentiles (simulated)
        am_percentile = random.randint(10, 90)
        lev_percentile = random.randint(10, 90)
        
        categories = {
            "asset_manager": {
                "name": "Asset Manager/Institutional",
                "long": max(0, asset_manager_net + random.randint(10000, 30000)),
                "short": max(0, -asset_manager_net + random.randint(5000, 20000)) if asset_manager_net < 0 else random.randint(5000, 20000),
                "net": asset_manager_net,
                "net_change": random.randint(-5000, 5000),
                "percentile_52w": am_percentile
            },
            "leveraged": {
                "name": "Leveraged Funds",
                "long": max(0, leveraged_net + random.randint(5000, 20000)),
                "short": max(0, -leveraged_net + random.randint(5000, 15000)) if leveraged_net < 0 else random.randint(5000, 15000),
                "net": leveraged_net,
                "net_change": random.randint(-3000, 3000),
                "percentile_52w": lev_percentile
            },
            "dealer": {
                "name": "Dealer/Intermediary",
                "long": max(0, dealer_net + random.randint(10000, 25000)),
                "short": max(0, -dealer_net + random.randint(10000, 25000)) if dealer_net < 0 else random.randint(10000, 25000),
                "net": dealer_net,
                "net_change": random.randint(-2000, 2000),
                "percentile_52w": random.randint(20, 80)
            },
            "other": {
                "name": "Other Reportables",
                "net": other_net,
                "net_change": random.randint(-1000, 1000),
                "percentile_52w": random.randint(20, 80)
            }
        }
        
        # Bias based on Asset Manager
        if am_percentile > 70:
            bias = "Bull"
            driver_text = f"Asset Manager netti long al {am_percentile}° percentile 52w. Istituzionali accumulano."
        elif am_percentile < 30:
            bias = "Bear"
            driver_text = f"Asset Manager netti short/ridotti al {am_percentile}° percentile. Istituzionali scaricano."
        else:
            bias = "Neutral"
            driver_text = f"Asset Manager in zona neutra ({am_percentile}° percentile). Nessun bias forte."
        
        # Crowding from Leveraged
        crowding = min(100, max(0, abs(lev_percentile - 50) * 2))
        
        # Squeeze risk
        squeeze_risk = 0
        if lev_percentile > 85 or lev_percentile < 15:
            squeeze_risk = 75 + random.randint(0, 20)
            driver_text += f" Attenzione: Leveraged Funds al {lev_percentile}° percentile, rischio squeeze elevato."
        elif lev_percentile > 70 or lev_percentile < 30:
            squeeze_risk = 40 + random.randint(0, 20)
        else:
            squeeze_risk = random.randint(10, 30)
        
        confidence = min(90, 50 + abs(am_percentile - 50))
        
        # Rolling bias (last 4 weeks)
        rolling_bias = [
            {"label": "W-3", "value": random.randint(30, 60), "isCurrent": False},
            {"label": "W-2", "value": random.randint(40, 70), "isCurrent": False},
            {"label": "W-1", "value": random.randint(50, 85), "isCurrent": False, "isPrevious": True},
            {"label": "W-0", "value": am_percentile, "isCurrent": True}
        ]
        
    else:  # XAU - Disaggregated
        report_type = "Disaggregated"
        
        managed_money_net = random.randint(-20000, 60000)
        swap_dealer_net = random.randint(-30000, 30000)
        producer_net = random.randint(-50000, -10000)  # Usually net short
        
        mm_percentile = random.randint(15, 85)
        
        categories = {
            "managed_money": {
                "name": "Managed Money",
                "long": max(0, managed_money_net + random.randint(20000, 50000)),
                "short": random.randint(10000, 30000),
                "net": managed_money_net,
                "net_change": random.randint(-4000, 4000),
                "percentile_52w": mm_percentile,
                "spreading": random.randint(5000, 15000)
            },
            "swap_dealers": {
                "name": "Swap Dealers",
                "long": max(0, swap_dealer_net + random.randint(15000, 35000)),
                "short": max(0, -swap_dealer_net + random.randint(15000, 35000)),
                "net": swap_dealer_net,
                "net_change": random.randint(-2000, 2000),
                "percentile_52w": random.randint(25, 75)
            },
            "producer": {
                "name": "Producer/Merchant",
                "long": random.randint(5000, 15000),
                "short": abs(producer_net) + random.randint(5000, 15000),
                "net": producer_net,
                "net_change": random.randint(-1500, 1500),
                "percentile_52w": random.randint(30, 70)
            }
        }
        
        # Bias based on Managed Money
        if mm_percentile > 70:
            bias = "Bull"
            driver_text = f"Managed Money netti long al {mm_percentile}° percentile. Speculatori bullish su Gold."
        elif mm_percentile < 30:
            bias = "Bear"
            driver_text = f"Managed Money ridotti al {mm_percentile}° percentile. Interesse speculativo in calo."
        else:
            bias = "Neutral"
            driver_text = f"Managed Money in zona neutra ({mm_percentile}° percentile)."
        
        crowding = min(100, max(0, abs(mm_percentile - 50) * 2))
        
        if mm_percentile > 80 or mm_percentile < 20:
            squeeze_risk = 70 + random.randint(0, 25)
            driver_text += f" Overcrowding rilevato, rischio reversal."
        else:
            squeeze_risk = random.randint(15, 40)
        
        confidence = min(85, 45 + abs(mm_percentile - 50))

        # Rolling bias (last 4 weeks)
        rolling_bias = [
            {"label": "W-3", "value": random.randint(40, 70), "isCurrent": False},
            {"label": "W-2", "value": random.randint(50, 80), "isCurrent": False},
            {"label": "W-1", "value": random.randint(60, 90), "isCurrent": False, "isPrevious": True},
            {"label": "W-0", "value": mm_percentile, "isCurrent": True}
        ]
    
    return {
        "symbol": symbol,
        "report_type": report_type,
        "as_of_date": as_of.strftime("%Y-%m-%d"),
        "release_date": release.strftime("%Y-%m-%d"),
        "release_time_et": "15:30 ET",
        "release_time_cet": "21:30 CET",
        "categories": categories,
        "bias": bias,
        "confidence": confidence,
        "crowding": crowding,
        "squeeze_risk": squeeze_risk,
        "driver_text": driver_text,
        "open_interest": random.randint(200000, 500000),
        "oi_change": random.randint(-5000, 5000),
        "rolling_bias": rolling_bias
    }

@api_router.get("/cot/data")
async def get_cot_data():
    """Get COT data for all tracked assets"""
    now = datetime.now(timezone.utc)
    
    # Calculate next release
    days_to_friday = (4 - now.weekday()) % 7
    if days_to_friday == 0 and now.hour >= 20:  # After 15:30 ET (20:30 UTC)
        days_to_friday = 7
    next_release = now + timedelta(days=days_to_friday)
    next_release = next_release.replace(hour=20, minute=30, second=0, microsecond=0)
    
    countdown_hours = int((next_release - now).total_seconds() / 3600)
    countdown_days = countdown_hours // 24
    countdown_hours_remaining = countdown_hours % 24
    
    cot_data = {}
    for symbol in ["NAS100", "SP500", "XAUUSD", "EURUSD"]:
        cot_data[symbol] = generate_cot_data(symbol)
    
    return {
        "data": cot_data,
        "next_release": {
            "date": next_release.strftime("%Y-%m-%d"),
            "time_et": "15:30 ET",
            "time_cet": "21:30 CET",
            "countdown": f"{countdown_days}g {countdown_hours_remaining}h" if countdown_days > 0 else f"{countdown_hours}h"
        },
        "last_update": now.strftime("%H:%M"),
        "timestamp": now.isoformat()
    }

@api_router.get("/cot/{symbol}")
async def get_cot_symbol(symbol: str):
    """Get COT data for a specific symbol"""
    symbol = symbol.upper()
    if symbol not in ["NAS100", "SP500", "XAUUSD", "EURUSD"]:
        raise HTTPException(status_code=400, detail="Symbol not supported for COT analysis")
    
    return generate_cot_data(symbol)

# ==================== RISK ANALYSIS ====================

class RiskAnalysisResponse(BaseModel):
    risk_score: int
    risk_category: str
    vix: Dict[str, Any]
    components: Dict[str, int]
    reasons: List[Dict[str, Any]]
    assets: Dict[str, Any]
    expected_move: Dict[str, float]
    next_event: Optional[Dict[str, Any]]
    asset_tilts: Dict[str, Any]
    last_update: str
    timestamp: str

# Simulated macro events (in production, fetch from economic calendar API)
MACRO_EVENTS = [
    {"time": "14:30", "event": "US Core CPI m/m", "impact": "high", "consensus": "0.3%", "previous": "0.3%"},
    {"time": "15:00", "event": "ECB President Lagarde Speech", "impact": "medium", "consensus": "-", "previous": "-"},
    {"time": "20:00", "event": "FOMC Member Speech", "impact": "high", "consensus": "-", "previous": "-"},
    {"time": "22:00", "event": "US Crude Oil Inventories", "impact": "medium", "consensus": "-1.2M", "previous": "-2.5M"},
]

@api_router.get("/risk/analysis")
async def get_risk_analysis():
    """
    Comprehensive risk analysis based on:
    1. VIX Level (0-25 points)
    2. VIX Momentum (0-25 points)
    3. Event Risk - distance to high-impact events (0-25 points)
    4. Market Stretch - distance to 2-week extremes (0-25 points)
    
    Total Risk Score: 0-100
    Categories: SAFE (0-33), MEDIUM (34-66), HIGH (67-100)
    """
    now = datetime.now(timezone.utc)
    
    # 1. Get VIX data
    vix_data = await get_vix_data()
    vix_current = vix_data.get("current", 18)
    vix_change = vix_data.get("change", 0)
    
    # 2. Get market prices
    prices = await get_market_prices()
    
    # 3. Calculate Component 1: VIX Level (0-25)
    if vix_current >= 30:
        comp1 = 25
    elif vix_current >= 25:
        comp1 = 22
    elif vix_current >= 22:
        comp1 = 18
    elif vix_current >= 18:
        comp1 = 12
    elif vix_current >= 14:
        comp1 = 6
    else:
        comp1 = 3
    
    # 4. Calculate Component 2: VIX Momentum (0-25)
    if vix_change > 10:
        comp2 = 25
    elif vix_change > 6:
        comp2 = 22
    elif vix_change > 3:
        comp2 = 16
    elif vix_change >= -3:
        comp2 = 8
    elif vix_change >= -6:
        comp2 = 4
    else:
        comp2 = 2
    
    # 5. Calculate Component 3: Event Risk (0-25)
    # Simulate hours to next high-impact event
    current_hour = now.hour
    hours_to_event = 24  # Default: no imminent event
    next_event = None
    
    for event in MACRO_EVENTS:
        event_hour = int(event["time"].split(":")[0])
        if event["impact"] == "high" and event_hour > current_hour:
            hours_to_event = event_hour - current_hour
            next_event = {**event, "hours_away": hours_to_event}
            break
    
    if hours_to_event <= 1:
        comp3 = 25
    elif hours_to_event <= 2:
        comp3 = 22
    elif hours_to_event <= 4:
        comp3 = 16
    elif hours_to_event <= 8:
        comp3 = 10
    elif hours_to_event <= 12:
        comp3 = 6
    else:
        comp3 = 3
    
    # 6. Calculate Component 4: Market Stretch (0-25)
    # Calculate distance to 2-week extremes for each asset
    assets_analysis = {}
    min_distance = 100
    
    for symbol, data in prices.items():
        if symbol in ["XAUUSD", "NAS100", "SP500", "EURUSD"]:
            price = data.get("price", 0)
            weekly_high = data.get("weekly_high", price * 1.02)
            weekly_low = data.get("weekly_low", price * 0.98)
            
            # Simulate 2-week range (slightly wider than weekly)
            two_week_high = weekly_high * 1.005
            two_week_low = weekly_low * 0.995
            
            dist_to_high = abs((two_week_high - price) / two_week_high * 100)
            dist_to_low = abs((price - two_week_low) / two_week_low * 100)
            nearest_extreme = "high" if dist_to_high < dist_to_low else "low"
            distance_to_extreme = min(dist_to_high, dist_to_low)
            
            if distance_to_extreme < min_distance:
                min_distance = distance_to_extreme
            
            assets_analysis[symbol] = {
                "current": price,
                "weekly_high": weekly_high,
                "weekly_low": weekly_low,
                "two_week_high": round(two_week_high, 2 if symbol != "EURUSD" else 5),
                "two_week_low": round(two_week_low, 2 if symbol != "EURUSD" else 5),
                "nearest_extreme": nearest_extreme,
                "distance_to_extreme": round(distance_to_extreme, 2),
                "change": data.get("change", 0)
            }
    
    if min_distance <= 0.25:
        comp4 = 25
    elif min_distance <= 0.5:
        comp4 = 20
    elif min_distance <= 0.75:
        comp4 = 15
    elif min_distance <= 1.0:
        comp4 = 10
    elif min_distance <= 1.5:
        comp4 = 6
    else:
        comp4 = 3
    
    # 7. Calculate total Risk Score
    risk_score = comp1 + comp2 + comp3 + comp4
    
    # 8. Determine category
    if risk_score >= 67:
        risk_category = "HIGH"
    elif risk_score >= 34:
        risk_category = "MEDIUM"
    else:
        risk_category = "SAFE"
    
    # 9. Determine main reasons
    components_ranked = sorted([
        {"name": "VIX Level", "value": comp1, "desc": f"VIX a {vix_current}"},
        {"name": "VIX Momentum", "value": comp2, "desc": f"VIX {'+' if vix_change > 0 else ''}{vix_change:.1f}%"},
        {"name": "Event Risk", "value": comp3, "desc": f"Evento high-impact tra {hours_to_event}h" if hours_to_event <= 12 else "No eventi imminenti"},
        {"name": "Market Stretch", "value": comp4, "desc": f"Asset a {min_distance:.2f}% da estremo 2W"}
    ], key=lambda x: x["value"], reverse=True)
    
    reasons = [components_ranked[0]]
    if components_ranked[1]["value"] >= 12:
        reasons.append(components_ranked[1])
    
    # 10. Calculate Expected Move (based on VIX)
    sp500_price = prices.get("SP500", {}).get("price", 6000)
    daily_vol = vix_current / (252 ** 0.5)
    expected_move = {
        "percent": round(daily_vol, 2),
        "sp500_points": round(sp500_price * daily_vol / 100, 1)
    }
    
    # 11. Calculate Asset Tilts based on VIX regime
    asset_tilts = {}
    vix_rising = vix_change > 2
    
    for symbol in ["NAS100", "SP500", "XAUUSD", "EURUSD"]:
        if symbol in ["NAS100", "SP500"]:
            if vix_rising:
                asset_tilts[symbol] = {
                    "tilt": "breakout-risk",
                    "text": f"VIX in salita aumenta rischio flush/breakout. Ridurre aggressività contrarian.",
                    "color": "red"
                }
            else:
                asset_tilts[symbol] = {
                    "tilt": "mean-reversion",
                    "text": "VIX in calo favorisce rotazione verso centro intraday.",
                    "color": "green"
                }
        elif symbol == "XAUUSD":
            if vix_rising:
                asset_tilts[symbol] = {
                    "tilt": "safe-haven",
                    "text": "Risk-off può sostenere Gold come bene rifugio.",
                    "color": "yellow"
                }
            else:
                asset_tilts[symbol] = {
                    "tilt": "range",
                    "text": "Contesto risk-on limita upside Gold. Range-bound più probabile.",
                    "color": "green"
                }
        elif symbol == "EURUSD":
            if vix_rising:
                asset_tilts[symbol] = {
                    "tilt": "bearish-bias",
                    "text": "VIX in salita = stress. Long EURUSD più rischiosi, USD potrebbe rafforzarsi.",
                    "color": "red"
                }
            else:
                asset_tilts[symbol] = {
                    "tilt": "bounce-possible",
                    "text": "VIX in calo = risk-on. Rimbalzi EURUSD più plausibili.",
                    "color": "green"
                }
    
    return {
        "risk_score": risk_score,
        "risk_category": risk_category,
        "vix": vix_data,
        "components": {
            "vix_level": comp1,
            "vix_momentum": comp2,
            "event_risk": comp3,
            "market_stretch": comp4
        },
        "reasons": reasons,
        "assets": assets_analysis,
        "expected_move": expected_move,
        "next_event": next_event,
        "asset_tilts": asset_tilts,
        "macro_events": MACRO_EVENTS,
        "last_update": now.strftime("%H:%M"),
        "timestamp": now.isoformat()
    }

# ==================== PHILOSOPHY ====================

PHILOSOPHY_QUOTES = [
    {"author": "Marco Aurelio", "quote": "Non è la morte che l'uomo deve temere, ma non aver mai iniziato a vivere."},
    {"author": "Seneca", "quote": "La fortuna non esiste: esiste il momento in cui il talento incontra l'opportunità."},
    {"author": "Sun Tzu", "quote": "Conosci il nemico e conosci te stesso: in cento battaglie non sarai mai in pericolo."},
    {"author": "Aristotele", "quote": "Siamo ciò che facciamo ripetutamente. L'eccellenza non è un atto, ma un'abitudine."},
    {"author": "Epitteto", "quote": "Non sono i fatti che turbano l'uomo, ma il giudizio che l'uomo dà dei fatti."},
    {"author": "Lao Tzu", "quote": "Un viaggio di mille miglia inizia con un singolo passo."},
    {"author": "Musashi", "quote": "Percepisci ciò che non vedi con gli occhi."},
    {"author": "Buddha", "quote": "La mente è tutto. Ciò che pensi, diventi."},
    {"author": "Confucio", "quote": "La nostra gloria non sta nel non cadere mai, ma nel rialzarci ogni volta che cadiamo."},
    {"author": "Platone", "quote": "Il coraggio è sapere cosa non temere."}
]

@api_router.get("/philosophy/quote")
async def get_philosophy_quote():
    return random.choice(PHILOSOPHY_QUOTES)

# ==================== ASCENSION TRACKER ====================

LEVELS = [
    {"name": "Novice", "min_xp": 0, "icon": "seedling"},
    {"name": "Apprentice", "min_xp": 100, "icon": "leaf"},
    {"name": "Practitioner", "min_xp": 300, "icon": "tree"},
    {"name": "Expert", "min_xp": 600, "icon": "mountain"},
    {"name": "Master", "min_xp": 1000, "icon": "sun"},
    {"name": "Zen Master", "min_xp": 2000, "icon": "moon"},
    {"name": "Market God", "min_xp": 5000, "icon": "crown"}
]

@api_router.get("/ascension/status")
async def get_ascension_status(current_user: dict = Depends(get_current_user)):
    xp = current_user.get("xp", 0)
    current_level = LEVELS[0]
    next_level = LEVELS[1] if len(LEVELS) > 1 else None
    
    for i, level in enumerate(LEVELS):
        if xp >= level["min_xp"]:
            current_level = level
            next_level = LEVELS[i + 1] if i + 1 < len(LEVELS) else None
    
    progress = 0
    if next_level:
        range_xp = next_level["min_xp"] - current_level["min_xp"]
        current_xp = xp - current_level["min_xp"]
        progress = (current_xp / range_xp) * 100 if range_xp > 0 else 100
    
    return {
        "xp": xp,
        "current_level": current_level,
        "next_level": next_level,
        "progress": round(progress, 1),
        "all_levels": LEVELS
    }

# ==================== SETTINGS ====================

@api_router.put("/settings/theme")
async def update_theme(theme: str, current_user: dict = Depends(get_current_user)):
    if theme not in ["dark", "light"]:
        raise HTTPException(status_code=400, detail="Invalid theme")
    await db.users.update_one({"id": current_user["id"]}, {"$set": {"theme": theme}})
    return {"status": "updated", "theme": theme}

@api_router.put("/settings/language")
async def update_language(language: str, current_user: dict = Depends(get_current_user)):
    if language not in ["it", "en", "fr"]:
        raise HTTPException(status_code=400, detail="Invalid language")
    await db.users.update_one({"id": current_user["id"]}, {"$set": {"language": language}})
    return {"status": "updated", "language": language}

# ==================== MARKET ANALYSIS ====================

@api_router.get("/market/analysis")
async def get_latest_market_analysis():
    """Get the latest AI market analysis"""
    if DEMO_MODE:
        # Check in-memory demo data
        if demo_data.get("market_analysis"):
             latest = demo_data["market_analysis"][-1]
             return {"content": latest["content"], "timestamp": latest["timestamp"]}
        # If no data yet, trigger and return placeholder
        asyncio.create_task(auto_market_analysis_job())
        return {"content": "Analysis generating (Demo)...", "timestamp": datetime.now(timezone.utc).isoformat()}
    
    analysis = await db.market_analysis.find_one({}, sort=[("timestamp", -1)])
    if not analysis:
        # Trigger one if missing
        asyncio.create_task(auto_market_analysis_job())
        return {"content": "Analysis generating...", "timestamp": datetime.now(timezone.utc).isoformat()}
    
    return {"content": analysis["content"], "timestamp": analysis["timestamp"]}

@api_router.post("/market/analyze")
async def trigger_market_analysis(current_user: dict = Depends(get_current_user)):
    """Manually trigger AI market analysis"""
    # Allow any user to trigger for now, or restrict to admin
    asyncio.create_task(auto_market_analysis_job())
    return {"status": "Analysis started"}

# ==================== BACKGROUND JOBS ====================

async def auto_market_analysis_job():
    """Background job to analyze market every 3 hours"""
    logger.info("🔄 Running 3-hour Auto Market Analysis...")
    try:
        # 1. Ensure fresh data
        prices = await get_market_prices()
        
        # 2. Generate AI Analysis
        content = "Analisi non disponibile (API Key mancante)"
        
        if GOOGLE_API_KEY:
            try:
                # Suppress deprecation warnings for this specific call if needed
                import warnings
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore")
                    model = genai.GenerativeModel("gemini-flash-latest")
                    prompt = f"Analizza sinteticamente questi prezzi di mercato per un trader intraday: {prices}. Focus su trend, livelli chiave anomalie. Rispondi in italiano, max 100 parole."
                    response = await model.generate_content_async(prompt)
                    content = response.text
            except Exception as e:
                logger.error(f"Generate Content Error: {e}")
                content = f"Errore generazione analisi: {str(e)}"
        
        # 3. Save to DB or Demo Storage
        analysis_doc = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "content": content,
            "prices_snapshot": prices
        }
        
        if not DEMO_MODE and db is not None:
            await db.market_analysis.insert_one(analysis_doc)
            logger.info("✅ Auto-Analysis Saved to DB")
        else:
            # Save to in-memory demo data
            if "market_analysis" not in demo_data:
                demo_data["market_analysis"] = []
            demo_data["market_analysis"].append(analysis_doc)
            logger.info(f"✅ Auto-Analysis Saved to Demo Memory: {content[:50]}...")
            
    except Exception as e:
        logger.error(f"❌ Auto-Analysis Failed: {e}")

# ==================== MULTI-SOURCE ENGINE ROUTES ====================

@api_router.get("/engine/cards")
async def get_engine_cards(current_user: dict = Depends(get_current_user)):
    """Get the latest Multi-Source Engine cards."""
    global latest_engine_cards
    
    if not multi_source_engine:
        return []
        
    if not latest_engine_cards:
        # If no cards, try to run once (async)
        # Note: In production, we rely on scheduler
        latest_engine_cards = await multi_source_engine.run_analysis()
    return latest_engine_cards

@api_router.post("/engine/run")
async def run_engine_manual(current_user: dict = Depends(get_current_user)):
    """Force run the engine."""
    global latest_engine_cards
    if not multi_source_engine:
        raise HTTPException(status_code=503, detail="Engine not available")
        
    latest_engine_cards = await multi_source_engine.run_analysis()
    return {"status": "success", "cards_generated": len(latest_engine_cards)}

# Scheduled Job for Multi-Source Engine
@scheduler.scheduled_job('cron', hour='7,10,13,16,19', minute=0) 
async def scheduled_engine_run():
    logger.info("⏰ Running Scheduled Multi-Source Engine...")
    global latest_engine_cards
    if multi_source_engine:
        latest_engine_cards = await multi_source_engine.run_analysis()

# ==================== STRIPE PAYMENTS ====================

@api_router.post("/create-checkout", response_model=CheckoutSessionResponse)
async def create_checkout_session(payload: CheckoutSessionCreate):
    if not STRIPE_SECRET_KEY:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Stripe non è configurato")

    mode = payload.mode.lower()
    if mode not in {"subscription", "payment"}:
        raise HTTPException(status_code=400, detail="Modalità Stripe non supportata")

    success_url = payload.success_url or STRIPE_SUCCESS_URL
    cancel_url = payload.cancel_url or STRIPE_CANCEL_URL
    if not success_url or not cancel_url:
        raise HTTPException(status_code=400, detail="URL di reindirizzamento mancanti")

    try:
        session = stripe.checkout.Session.create(
            success_url=success_url,
            cancel_url=cancel_url,
            payment_method_types=["card"],
            mode=mode,
            metadata=payload.metadata or {},
            customer_email=payload.customer_email,
            line_items=[
                {
                    "price": payload.price_id,
                    "quantity": max(payload.quantity, 1),
                }
            ],
            allow_promotion_codes=True,
            locale="it",
        )
    except stripe.error.StripeError as exc:
        logger.error("Errore Stripe create checkout: %s", exc)
        raise HTTPException(status_code=502, detail="Impossibile avviare il pagamento")

    if not getattr(session, "url", None):
        raise HTTPException(status_code=502, detail="Sessione Stripe non completa")

    return CheckoutSessionResponse(session_id=session.id, url=session.url)


@api_router.post("/stripe/webhook")
async def stripe_webhook(request: Request):
    if not STRIPE_WEBHOOK_SECRET:
        raise HTTPException(status_code=404, detail="Webhook Stripe non configurato")

    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")
    if not sig_header:
        raise HTTPException(status_code=400, detail="Intestazione stripe-signature mancante")

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
    except ValueError as exc:
        logger.warning("Payload Stripe non valido: %s", exc)
        raise HTTPException(status_code=400, detail="Payload Stripe non valido")
    except stripe.error.SignatureVerificationError as exc:
        logger.warning("Firma Stripe non valida: %s", exc)
        raise HTTPException(status_code=400, detail="Firma Stripe non valida")

    logger.info("Webhook Stripe ricevuto: %s", event["type"])
    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        logger.debug("Checkout completato %s (%s)", session.get("id"), session.get("customer_email") or session.get("customer"))

    return {"received": True}

# ==================== ROOT ====================

@api_router.get("/")
async def root():
    return {"message": "TradingOS API v1.0", "status": "online"}

# --- CRYPTO PROXIES (matching api/index.py) ---
COINGECKO_BASE_URL = "https://api.coingecko.com/api/v3"

@api_router.get("/market/trending")
async def get_trending():
    try:
        import httpx
        url = f"{COINGECKO_BASE_URL}/search/trending"
        async with httpx.AsyncClient() as client:
            response = await client.get(url)
            return response.json()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/market/coin/{id}")
async def get_coin_details(id: str):
    global _cg_cache
    now = datetime.now(timezone.utc)
    
    if id in _cg_cache["coins"] and _cg_cache["coins"][id]["timestamp"]:
        age = (now - _cg_cache["coins"][id]["timestamp"]).total_seconds()
        if age < CG_CACHE_TTL:
            return _cg_cache["coins"][id]["data"]

    try:
        import httpx
        url = f"{COINGECKO_BASE_URL}/coins/{id}"
        params = {
            "localization": "false",
            "tickers": "false",
            "market_data": "true",
            "community_data": "true",
            "developer_data": "true",
            "sparkline": "true"
        }
        async with httpx.AsyncClient() as client:
            response = await client.get(url, params=params)
            
            if response.status_code == 429:
                logger.warning(f"CoinGecko Rate Limit reached (coin/{id}).")
                if id in _cg_cache["coins"]:
                    return _cg_cache["coins"][id]["data"]
                return None
                
            data = response.json()
            _cg_cache["coins"][id] = {"data": data, "timestamp": now}
            return data
    except Exception as e:
        logger.error(f"Coin Details Fetch Error ({id}): {e}")
        if id in _cg_cache["coins"]:
            return _cg_cache["coins"][id]["data"]
        return None

@api_router.get("/market/top30")
async def get_top30():
    global _cg_cache
    now = datetime.now(timezone.utc)
    
    # Check cache
    if _cg_cache["top30"]["data"] and _cg_cache["top30"]["timestamp"]:
        age = (now - _cg_cache["top30"]["timestamp"]).total_seconds()
        if age < CG_CACHE_TTL:
            return _cg_cache["top30"]["data"]

    try:
        import httpx
        url = f"{COINGECKO_BASE_URL}/coins/markets"
        params = {
            "vs_currency": "usd",
            "order": "market_cap_desc",
            "per_page": 30,
            "page": 1,
            "sparkline": "true",
            "price_change_percentage": "1h,24h,7d"
        }
        async with httpx.AsyncClient() as client:
            response = await client.get(url, params=params)
            
            if response.status_code == 429:
                logger.warning("CoinGecko Rate Limit reached (top30). Using stale cache or empty list.")
                if _cg_cache["top30"]["data"]:
                    return _cg_cache["top30"]["data"]
                return []
                
            data = response.json()
            _cg_cache["top30"]["data"] = data
            _cg_cache["top30"]["timestamp"] = now
            return data
    except Exception as e:
        logger.error(f"Top30 Fetch Error: {e}")
        if _cg_cache["top30"]["data"]:
            return _cg_cache["top30"]["data"]
        return []

@api_router.get("/market/chart/{id}")
async def get_coin_chart(id: str, days: int = 7):
    global _cg_cache
    now = datetime.now(timezone.utc)
    cache_key = f"{id}_{days}"
    
    if cache_key in _cg_cache["charts"] and _cg_cache["charts"][cache_key]["timestamp"]:
        age = (now - _cg_cache["charts"][cache_key]["timestamp"]).total_seconds()
        if age < CG_CACHE_TTL:
            return _cg_cache["charts"][cache_key]["data"]

    try:
        import httpx
        url = f"{COINGECKO_BASE_URL}/coins/{id}/market_chart"
        params = {
            "vs_currency": "usd",
            "days": days
        }
        async with httpx.AsyncClient() as client:
            response = await client.get(url, params=params)
            
            if response.status_code == 429:
                logger.warning(f"CoinGecko Rate Limit reached (chart/{id}).")
                if cache_key in _cg_cache["charts"]:
                    return _cg_cache["charts"][cache_key]["data"]
                return {"prices": [], "market_caps": [], "total_volumes": []}
                
            data = response.json()
            _cg_cache["charts"][cache_key] = {"data": data, "timestamp": now}
            return data
    except Exception as e:
        logger.error(f"Chart Fetch Error ({id}): {e}")
        if cache_key in _cg_cache["charts"]:
            return _cg_cache["charts"][cache_key]["data"]
        return {"prices": [], "market_caps": [], "total_volumes": []}

@api_router.get("/market/global")
async def get_global_data():
    global _cg_cache
    now = datetime.now(timezone.utc)
    
    if _cg_cache["global"]["data"] and _cg_cache["global"]["timestamp"]:
        age = (now - _cg_cache["global"]["timestamp"]).total_seconds()
        if age < CG_CACHE_TTL:
            return _cg_cache["global"]["data"]

    try:
        import httpx
        url = f"{COINGECKO_BASE_URL}/global"
        async with httpx.AsyncClient() as client:
            response = await client.get(url)
            
            if response.status_code == 429:
                logger.warning("CoinGecko Rate Limit reached (global).")
                return _cg_cache["global"]["data"]

            data = response.json()
            result = data.get("data")
            _cg_cache["global"]["data"] = result
            _cg_cache["global"]["timestamp"] = now
            return result
    except Exception as e:
        logger.error(f"Global Data Fetch Error: {e}")
        return _cg_cache["global"]["data"]

# Include router and middleware
app.include_router(api_router)

# Startup Event
@app.on_event("startup")
async def startup_event():
    # Start scheduler
    if not scheduler.running:
        scheduler.add_job(auto_market_analysis_job, 'interval', hours=3, id='market_analysis_3h')
        scheduler.start()
        logger.info("🕒 Background Scheduler started: Auto-Analysis every 3 hours")
    
    # Check if we need an initial analysis (if none in last 3 hours)
    if not DEMO_MODE and db is not None:
        last = await db.market_analysis.find_one({}, sort=[("timestamp", -1)])
        if not last or (datetime.now(timezone.utc) - datetime.fromisoformat(last["timestamp"])).total_seconds() > 3600 * 3:
            logger.info("🚀 Triggering initial market analysis on startup...")
            asyncio.create_task(auto_market_analysis_job())
    elif DEMO_MODE:
        # In demo mode, always trigger one on startup
        logger.info("🚀 Triggering demo market analysis on startup...")
        asyncio.create_task(auto_market_analysis_job())

@app.on_event("shutdown")
async def shutdown_db_client():
    if scheduler.running:
        scheduler.shutdown()
    if not DEMO_MODE and client:
        client.close()

if __name__ == "__main__":
    import uvicorn
    # Suppress specific warnings
    import warnings
    warnings.filterwarnings("ignore", category=FutureWarning, module="google.generativeai")
    warnings.filterwarnings("ignore", category=FutureWarning, module="google.api_core")
    
    print("🚀 Starting Karion Trading OS Backend...")
    print(f"📊 Mode: {'DEMO (in-memory)' if DEMO_MODE else 'PRODUCTION (MongoDB)'}")
    print("🌐 Server running at http://localhost:8000")
    uvicorn.run(app, host="0.0.0.0", port=8000)
