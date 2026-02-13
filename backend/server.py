from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import jwt
import bcrypt
from PyPDF2 import PdfReader
import io
import random
import math
import yfinance as yf
from functools import lru_cache
import asyncio

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
    asyncio.get_event_loop().run_until_complete(test_mongo())
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

app = FastAPI(title="TradingOS API")
api_router = APIRouter(prefix="/api")
security = HTTPBearer()

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

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
    entry_price: float
    exit_price: float
    profit_loss: float
    profit_loss_r: float
    date: str
    notes: str = ""
    rules_followed: List[str] = []
    rules_violated: List[str] = []
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class TradeRecordCreate(BaseModel):
    symbol: str
    entry_price: float
    exit_price: float
    profit_loss: float
    profit_loss_r: float
    date: str
    notes: str = ""
    rules_followed: List[str] = []
    rules_violated: List[str] = []

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
    if DEMO_MODE:
        if user_data.email in demo_users:
            raise HTTPException(status_code=400, detail="Email already registered")
        user_id = str(uuid.uuid4())
        demo_users[user_data.email] = {
            "id": user_id,
            "email": user_data.email,
            "name": user_data.name,
            "password": hash_password(user_data.password),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "level": "Novice",
            "xp": 0
        }
    else:
        existing = await db.users.find_one({"email": user_data.email})
        if existing:
            raise HTTPException(status_code=400, detail="Email already registered")
        user_id = str(uuid.uuid4())
        user_doc = {
            "id": user_id,
            "email": user_data.email,
            "name": user_data.name,
            "password": hash_password(user_data.password),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "level": "Novice",
            "xp": 0
        }
        await db.users.insert_one(user_doc)
    
    token = create_token(user_id, user_data.email)
    user_response = UserResponse(
        id=user_id,
        email=user_data.email,
        name=user_data.name,
        created_at=datetime.now(timezone.utc).isoformat(),
        level="Novice",
        xp=0
    )
    return TokenResponse(access_token=token, user=user_response)

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(credentials: UserLogin):
    if DEMO_MODE:
        user = demo_users.get(credentials.email)
    else:
        user = await db.users.find_one({"email": credentials.email})
    
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
    checkins = await db.psychology_checkins.find(
        {"user_id": current_user["id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return checkins

@api_router.get("/psychology/stats")
async def get_psychology_stats(current_user: dict = Depends(get_current_user)):
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

@api_router.post("/trades", response_model=TradeRecord)
async def create_trade(data: TradeRecordCreate, current_user: dict = Depends(get_current_user)):
    trade = TradeRecord(user_id=current_user["id"], **data.model_dump())
    await db.trades.insert_one(trade.model_dump())
    await db.users.update_one({"id": current_user["id"]}, {"$inc": {"xp": 5}})
    return trade

@api_router.get("/trades", response_model=List[TradeRecord])
async def get_trades(current_user: dict = Depends(get_current_user)):
    trades = await db.trades.find(
        {"user_id": current_user["id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    return trades

@api_router.get("/trades/stats")
async def get_trade_stats(current_user: dict = Depends(get_current_user)):
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
    """Get real market prices from Yahoo Finance"""
    global _market_cache
    now = datetime.now(timezone.utc)
    
    # Use cache if less than 2 minutes old
    if _market_cache["data"] and _market_cache["timestamp"]:
        age = (now - _market_cache["timestamp"]).total_seconds()
        if age < 120:
            return _market_cache["data"]
    
    # Yahoo Finance symbols mapping
    symbols = {
        "XAUUSD": "GC=F",      # Gold Futures
        "NAS100": "NQ=F",      # Nasdaq Futures
        "SP500": "ES=F",       # S&P 500 Futures
        "EURUSD": "EURUSD=X",  # EUR/USD
        "DOW": "YM=F"          # Dow Futures
    }
    
    prices = {}
    
    for display_name, yf_symbol in symbols.items():
        try:
            hist = get_yf_ticker_safe(yf_symbol, period="5d", interval="1d")
            
            if hist is not None and len(hist) >= 2:
                current = float(hist['Close'].iloc[-1])
                prev_close = float(hist['Close'].iloc[-2])
                change_pct = ((current - prev_close) / prev_close) * 100
                
                # Calculate weekly high/low
                weekly_high = float(hist['High'].max())
                weekly_low = float(hist['Low'].min())
                
                prices[display_name] = {
                    "symbol": display_name,
                    "price": round(current, 2 if display_name != "EURUSD" else 5),
                    "change": round(change_pct, 2),
                    "prev_close": round(prev_close, 2 if display_name != "EURUSD" else 5),
                    "weekly_high": round(weekly_high, 2 if display_name != "EURUSD" else 5),
                    "weekly_low": round(weekly_low, 2 if display_name != "EURUSD" else 5),
                    "source": "yahoo_finance"
                }
            else:
                raise Exception(f"No data for {yf_symbol}")
                
        except Exception as e:
            logger.warning(f"Price fetch error for {display_name}: {e}")
            # Fallback prices
            base_prices = {"XAUUSD": 2650, "NAS100": 21450, "SP500": 6050, "EURUSD": 1.085, "DOW": 44200}
            base = base_prices.get(display_name, 100)
            change = (random.random() - 0.5) * 2
            prices[display_name] = {
                "symbol": display_name,
                "price": round(base * (1 + change/100), 2 if display_name != "EURUSD" else 5),
                "change": round(change, 2),
                "prev_close": round(base, 2 if display_name != "EURUSD" else 5),
                "weekly_high": round(base * 1.02, 2 if display_name != "EURUSD" else 5),
                "weekly_low": round(base * 0.98, 2 if display_name != "EURUSD" else 5),
                "source": "simulated"
            }
    
    _market_cache["data"] = prices
    _market_cache["timestamp"] = now
    return prices

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

# ==================== ROOT ====================

@api_router.get("/")
async def root():
    return {"message": "TradingOS API v1.0", "status": "online"}

# Include router and middleware
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    if not DEMO_MODE:
        client.close()

if __name__ == "__main__":
    import uvicorn
    print("🚀 Starting Karion Trading OS Backend...")
    print(f"📊 Mode: {'DEMO (in-memory)' if DEMO_MODE else 'PRODUCTION (MongoDB)'}")
    print("🌐 Server running at http://localhost:8000")
    uvicorn.run(app, host="0.0.0.0", port=8000)
