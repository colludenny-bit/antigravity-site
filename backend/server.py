from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, status, Body, Header, Form
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import json
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta, date
from zoneinfo import ZoneInfo
import jwt
import bcrypt
from PyPDF2 import PdfReader
import io
import random
import math
import yfinance as yf
import requests
import csv
from functools import lru_cache
import asyncio
import google.generativeai as genai
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.cron import CronTrigger
import local_vault_matrix
from collection_control import (
    can_collect_now,
    set_auto_pause_market_closed,
    set_manual_pause,
    status_payload as collection_status_payload,
)
from persistence_guard import archive_event, lake_status, run_maintenance
from svp_live_store import ingest_live_snapshot, get_live_svp_pair, get_live_svp_status
from tv_screenshot_store import save_screenshot, get_latest as get_latest_tv_screenshot, get_recent as get_recent_tv_screenshots, get_status as get_tv_screenshot_status

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Force strictly Mongo
DEMO_MODE = False
# Mode Check
if __name__ == "__main__":
    print("🚀 Initializing Karion Trading OS...")

# MongoDB connection placeholders
client = None
db = None

# Empty placeholders for production enforcement

# JWT Configuration
JWT_SECRET = os.environ.get('JWT_SECRET', '').strip()
if not JWT_SECRET:
    raise RuntimeError("JWT_SECRET is required. Set it in backend/.env or environment variables.")
if len(JWT_SECRET) < 32:
    raise RuntimeError("JWT_SECRET must be at least 32 characters.")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24

# Emergent LLM Key
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')

# Gemini API Key & Setup
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', '')
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
# Cost-control defaults:
# - use the cheapest fast model by default
# - map "pro" workflows to the same cheap model unless explicitly overridden
GEMINI_MODEL_CHEAP = os.environ.get('GEMINI_MODEL_CHEAP', 'gemini-1.5-flash')
GEMINI_MODEL_PRO = os.environ.get('GEMINI_MODEL_PRO', GEMINI_MODEL_CHEAP)

# Initialize models
gemini_flash = genai.GenerativeModel(GEMINI_MODEL_CHEAP) if GEMINI_API_KEY else None
gemini_pro = genai.GenerativeModel(GEMINI_MODEL_PRO) if GEMINI_API_KEY else None
SVP_WEBHOOK_SECRET = os.environ.get("SVP_WEBHOOK_SECRET", "").strip()

app = FastAPI(title="TradingOS API")
api_router = APIRouter(prefix="/api")
security = HTTPBearer()

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

DEFAULT_CORS_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://www.karion.it",
]


def resolve_cors_origins() -> List[str]:
    raw_origins = os.environ.get("CORS_ORIGINS", "").strip()
    if not raw_origins:
        return DEFAULT_CORS_ORIGINS
    resolved = []
    for item in raw_origins.split(","):
        origin = item.strip().rstrip("/")
        if origin.startswith(("http://", "https://")):
            resolved.append(origin)
    return resolved or DEFAULT_CORS_ORIGINS

# Scheduler Setup
scheduler = AsyncIOScheduler()

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

class ArchivedAssetCard(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    asset: str
    direction: str 
    probability: float 
    impulse: str 
    drivers: List[str]
    invalidation_level: str
    scores: Dict[str, float]
    price: Optional[float] = None
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    target_hit: Optional[bool] = None # Filled on later evaluation
    actual_correlation: Optional[float] = None # Filled on later evaluation

class MonteCarloParams(BaseModel):
    win_rate: float
    avg_win: float
    avg_loss: float
    num_trades: int = 10000
    initial_capital: float = 10000
    risk_per_trade: float = 0.01

class GlobalPulse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    status: str = "Active"
    volatility_regime: str
    correlation_spx_nas: float
    assets_analysis: Dict[str, Any] = {} # e.g. {"NAS100": {"direction": "UP", "prob": 70...}}
    synthetic_bias: str = "" # Gemini's final synthesis
    drivers: List[str] = []

class CollectionControlInput(BaseModel):
    paused: Optional[bool] = None
    reason: Optional[str] = None
    auto_pause_market_closed: Optional[bool] = None


class SVPLiveIngest(BaseModel):
    asset: Optional[str] = None
    symbol: Optional[str] = None
    ticker: Optional[str] = None
    va_low: Optional[float] = None
    va_high: Optional[float] = None
    vah: Optional[float] = None
    val: Optional[float] = None
    poc: Optional[float] = None
    vpoc: Optional[float] = None
    rome_day: Optional[str] = None
    timestamp_utc: Optional[str] = None
    timestamp: Optional[str] = None
    timeframe: Optional[str] = None
    resolution: Optional[str] = None
    session_name: Optional[str] = None
    session: Optional[str] = None
    is_closed: Optional[bool] = False
    source: Optional[str] = "TRADINGVIEW_WEBHOOK"
    secret: Optional[str] = None


class SessionRunInput(BaseModel):
    day: Optional[str] = None


class UserPreferencesInput(BaseModel):
    selected_asset: Optional[str] = None
    sync_enabled: Optional[bool] = None
    chart_line_color: Optional[str] = None
    theme: Optional[str] = None
    language: Optional[str] = None

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
    email_lower = credentials.email.lower()
    
    # Try finding in DB first (case-insensitive)
    user = await db.users.find_one({"email": {"$regex": f"^{credentials.email}$", "$options": "i"}})
    
    # Fallback to demo users if not found in live DB
    if not user and email_lower == "colludenny@gmail.com":
        user = demo_users.get("Colludenny@gmail.com")
        if user:
            # Optional: sync the demo user to MongoDB so it persists
            try:
                await db.users.update_one(
                    {"email": user["email"]}, 
                    {"$setOnInsert": user}, 
                    upsert=True
                )
            except Exception:
                pass
    
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
        return {"response": "AI in Demo Mode. Connect API Key to activate Karion."}
    
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


import urllib.parse as urllib_parse
import re
import json

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
            "thresholds": BREADTH_REGIME_THRESHOLDS,
        },
        "indices": {
            "SP500": sp_payload,
            "NAS100": nas_payload,
            **({"XAUUSD": xau_payload} if xau_payload else {}),
            **({"EURUSD": eur_payload} if eur_payload else {}),
        },
    }



@api_router.get("/market/breadth")
async def get_market_breadth():
    global _breadth_cache
    now = datetime.now(timezone.utc)

    def _ensure_breadth_thresholds(payload: Dict[str, Any]) -> Dict[str, Any]:
        if not isinstance(payload, dict):
            return payload
        source = payload.get("source")
        if not isinstance(source, dict):
            source = {}
            payload["source"] = source
        source.setdefault("thresholds", BREADTH_REGIME_THRESHOLDS)
        return payload

    if _breadth_cache["data"] and _breadth_cache["timestamp"]:
        age = (now - _breadth_cache["timestamp"]).total_seconds()
        if age < BREADTH_CACHE_TTL:
            return _ensure_breadth_thresholds(_breadth_cache["data"])

    try:
        payload = _fetch_market_breadth_payload()
        _breadth_cache = {"data": payload, "timestamp": now}
        return _ensure_breadth_thresholds(payload)
    except Exception as exc:
        if _breadth_cache["data"] and _breadth_cache["timestamp"]:
            stale_age = int((now - _breadth_cache["timestamp"]).total_seconds())
            return {
                **_ensure_breadth_thresholds(_breadth_cache["data"]),
                "cache_stale": True,
                "cache_age_seconds": stale_age,
                "warning": f"breadth refresh failed: {str(exc)}",
            }
        raise HTTPException(status_code=503, detail="Market breadth temporarily unavailable")


@api_router.post("/market/svp/live")
async def ingest_market_svp_live(payload: SVPLiveIngest, x_svp_secret: Optional[str] = Header(default=None)):
    token = (x_svp_secret or payload.secret or "").strip()
    if SVP_WEBHOOK_SECRET and token != SVP_WEBHOOK_SECRET:
        raise HTTPException(status_code=401, detail="Invalid SVP webhook secret")

    try:
        row = ingest_live_snapshot(payload.model_dump())
        global _price_action_cache
        _price_action_cache = {"data": None, "timestamp": None}
        archive_event("svp_live_ingest", {"status": "ok", "asset": row.get("asset"), "rome_day": row.get("rome_day")})
        return {"status": "ok", "saved": row}
    except ValueError as exc:
        archive_event("collection_errors", {"job": "svp_live_ingest", "error": str(exc)})
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        archive_event("collection_errors", {"job": "svp_live_ingest", "error": str(exc)})
        raise HTTPException(status_code=500, detail=str(exc))


@api_router.get("/market/svp/live/status")
async def market_svp_live_status(current_user: str = Depends(get_current_user)):
    return get_live_svp_status()


@api_router.get("/market/svp/live/{asset}")
async def market_svp_live_asset(asset: str, current_user: str = Depends(get_current_user)):
    pair = get_live_svp_pair(asset)
    if not pair:
        raise HTTPException(status_code=404, detail="SVP live snapshot not available")
    return {"status": "ok", "pair": pair}


@api_router.post("/market/svp/screenshot/upload")
async def upload_market_svp_screenshot(
    file: UploadFile = File(...),
    asset: str = Form(...),
    note: Optional[str] = Form(default=None),
    source: Optional[str] = Form(default="TV_AUTOMATION"),
    captured_at_utc: Optional[str] = Form(default=None),
    secret: Optional[str] = Form(default=None),
    x_svp_secret: Optional[str] = Header(default=None),
):
    token = (x_svp_secret or secret or "").strip()
    if SVP_WEBHOOK_SECRET and token != SVP_WEBHOOK_SECRET:
        raise HTTPException(status_code=401, detail="Invalid SVP webhook secret")

    try:
        content = await file.read()
        row = save_screenshot(
            asset=asset,
            content=content,
            filename=file.filename or "chart.png",
            source=source or "TV_AUTOMATION",
            note=note,
            captured_at_utc=captured_at_utc,
        )
        archive_event("tv_screenshots", {"status": "ok", "asset": row.get("asset"), "path": row.get("path")})
        return {"status": "ok", "saved": row}
    except ValueError as exc:
        archive_event("collection_errors", {"job": "tv_screenshot_upload", "error": str(exc)})
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        archive_event("collection_errors", {"job": "tv_screenshot_upload", "error": str(exc)})
        raise HTTPException(status_code=500, detail=str(exc))


@api_router.get("/market/svp/screenshot/status")
async def market_svp_screenshot_status(current_user: str = Depends(get_current_user)):
    return get_tv_screenshot_status()


@api_router.get("/market/svp/screenshot/latest/{asset}")
async def market_svp_screenshot_latest(asset: str, current_user: str = Depends(get_current_user)):
    row = get_latest_tv_screenshot(asset)
    if not row:
        raise HTTPException(status_code=404, detail="No screenshot for asset")
    return {"status": "ok", "latest": row}


@api_router.get("/market/svp/screenshot/feed")
async def market_svp_screenshot_feed(asset: Optional[str] = None, limit: int = 20, current_user: str = Depends(get_current_user)):
    rows = get_recent_tv_screenshots(asset=asset, limit=limit)
    return {"status": "ok", "rows": rows, "count": len(rows)}




# ==================== MARKET DATA ====================

# Cache for market data (refresh every 5 minutes)
_market_cache = {"data": None, "timestamp": None}
_vix_cache = {"data": None, "timestamp": None}
_cot_live_cache = {"data": None, "timestamp": None}
_options_flow_cache = {"data": None, "timestamp": None}
_session_discretionary_cache = {"data": None, "timestamp": None}
_price_action_cache = {"data": None, "timestamp": None}
ROME_TZ = ZoneInfo("Europe/Rome")
NEW_YORK_TZ = ZoneInfo("America/New_York")

OPTIONS_FLOW_CACHE_TTL_SECONDS = 60
OPTIONS_MIN_NOTIONAL_MILLION = 0.5

OPTIONS_PROXY_MAP = {
    "XAUUSD": "GLD",
    "NAS100": "QQQ",
    "SP500": "SPY",
    "EURUSD": "FXE",
    "BTCUSD": "IBIT",
}

OPTIONS_SPOT_REF_MAP = {
    "XAUUSD": "GC=F",
    "NAS100": "NQ=F",
    "SP500": "ES=F",
    "EURUSD": "EURUSD=X",
    "BTCUSD": "BTC-USD",
}


def _to_int(value: Any, default: int = 0) -> int:
    try:
        if value is None:
            return default
        if isinstance(value, str):
            value = value.replace(",", "").strip()
        return int(float(value))
    except Exception:
        return default


def _find_cot_row(rows: List[List[str]], predicate) -> Optional[List[str]]:
    for row in rows:
        if not row:
            continue
        name = str(row[0]).upper()
        if predicate(name):
            return row
    return None


def _median(values: List[float]) -> float:
    vals = [float(v) for v in values if isinstance(v, (int, float)) and math.isfinite(float(v))]
    if not vals:
        return 0.0
    vals.sort()
    mid = len(vals) // 2
    if len(vals) % 2 == 1:
        return vals[mid]
    return (vals[mid - 1] + vals[mid]) / 2.0


def _row_direction_sign(row: Dict[str, Any]) -> int:
    label = str(row.get("outcome_direction", "")).upper()
    if "LONG" in label:
        return 1
    if "SHORT" in label:
        return -1
    return 1 if _safe_float(row.get("outcome_pips"), 0.0) > 0 else (-1 if _safe_float(row.get("outcome_pips"), 0.0) < 0 else 0)


def _is_range_day(row: Dict[str, Any], median_range: float) -> bool:
    scenario = str(row.get("scenario", "")).upper()
    ny_range = _safe_float(row.get("ny_range_pips"), 0.0)
    if median_range <= 0:
        return scenario == "A"
    if scenario == "D":
        return False
    if scenario == "A":
        return True
    return ny_range <= (median_range * 0.88)


def _is_expansion_day(row: Dict[str, Any], median_range: float) -> bool:
    scenario = str(row.get("scenario", "")).upper()
    ny_range = _safe_float(row.get("ny_range_pips"), 0.0)
    if scenario == "B":
        return True
    if scenario == "D":
        if median_range <= 0:
            return True
        return ny_range >= (median_range * 1.05)
    if scenario == "C":
        if median_range <= 0:
            return False
        return ny_range >= (median_range * 1.02)
    if median_range <= 0:
        return False
    return ny_range >= (median_range * 1.16)


def _trading_week_key(rome_day: Any) -> Optional[str]:
    try:
        d = datetime.fromisoformat(str(rome_day)).date()
    except Exception:
        return None
    iso = d.isocalendar()
    return f"{iso.year:04d}-W{iso.week:02d}"


def _impact_direction_sign(value: Any) -> int:
    text = str(value or "").strip().upper()
    if not text:
        return 0
    if any(x in text for x in ("BULL", "UP", "LONG", "RISK_ON", "POSITIVE")):
        return 1
    if any(x in text for x in ("BEAR", "DOWN", "SHORT", "RISK_OFF", "NEGATIVE")):
        return -1
    return 0


def _direction_sign_from_label(value: Any) -> int:
    return _impact_direction_sign(value)


def _asset_regime_sign(asset: str, regime_text: Any, vix_value: float) -> int:
    regime = str(regime_text or "").strip().upper().replace("-", "_")
    is_risk_off = regime == "RISK_OFF" or (vix_value >= 23.0 and vix_value > 0)
    is_risk_on = regime == "RISK_ON" or (0 < vix_value <= 16.0)

    if asset in ("NAS100", "SP500"):
        return -1 if is_risk_off else (1 if is_risk_on else 0)
    if asset == "XAUUSD":
        return 1 if is_risk_off else (-1 if is_risk_on else 0)
    if asset == "EURUSD":
        return -1 if is_risk_off else (1 if is_risk_on else 0)
    return 0


def _breadth_direction_sign(breadth_row: Dict[str, Any]) -> int:
    if not isinstance(breadth_row, dict):
        return 0
    ma50 = _safe_float(((breadth_row.get("above_ma50") or {}) if isinstance(breadth_row.get("above_ma50"), dict) else {}).get("pct"), float("nan"))
    ma200 = _safe_float(((breadth_row.get("above_ma200") or {}) if isinstance(breadth_row.get("above_ma200"), dict) else {}).get("pct"), float("nan"))
    if math.isfinite(ma50) and math.isfinite(ma200):
        if (
            ma50 >= BREADTH_REGIME_THRESHOLDS["bullish_ma50_min"]
            and ma200 >= BREADTH_REGIME_THRESHOLDS["bullish_ma200_min"]
        ):
            return 1
        if (
            ma50 <= BREADTH_REGIME_THRESHOLDS["weak_ma50_max"]
            and ma200 <= BREADTH_REGIME_THRESHOLDS["weak_ma200_max"]
        ):
            return -1
    regime = str(breadth_row.get("breadth_regime", "")).lower()
    if regime == "broad-bullish":
        return 1
    if regime == "broad-weakness":
        return -1
    return 0


def _normalize_ohlc_frame(df, ticker: str):
    try:
        if hasattr(df, "columns") and hasattr(df.columns, "nlevels") and df.columns.nlevels > 1:
            try:
                level0 = set(df.columns.get_level_values(0))
                if ticker in level0:
                    df = df.xs(ticker, axis=1, level=0)
                else:
                    cols = [c[0] if isinstance(c, tuple) else c for c in df.columns.to_flat_index()]
                    df = df.copy()
                    df.columns = cols
            except Exception:
                pass
        if "Close" not in df.columns and "Adj Close" in df.columns:
            df = df.rename(columns={"Adj Close": "Close"})
    except Exception:
        return df
    return df


def _weighted_quantile(points: List[Dict[str, float]], q: float) -> Optional[float]:
    if not points:
        return None
    qv = max(0.0, min(1.0, _safe_float(q, 0.5)))
    ordered = sorted(
        [{"price": _safe_float(p.get("price"), 0.0), "weight": max(0.0, _safe_float(p.get("weight"), 0.0))} for p in points],
        key=lambda x: x["price"],
    )
    cleaned = [p for p in ordered if p["price"] > 0.0 and p["weight"] > 0.0]
    if not cleaned:
        return None
    total = sum(p["weight"] for p in cleaned)
    if total <= 0.0:
        return None
    target = total * qv
    acc = 0.0
    for p in cleaned:
        acc += p["weight"]
        if acc >= target:
            return p["price"]
    return cleaned[-1]["price"]


def _build_svp_value_area(candles: List[Dict[str, Any]]) -> Dict[str, Any]:
    points: List[Dict[str, float]] = []
    for c in candles:
        h = _safe_float(c.get("high"), 0.0)
        l = _safe_float(c.get("low"), 0.0)
        cl = _safe_float(c.get("close"), 0.0)
        if h <= 0.0 or l <= 0.0 or cl <= 0.0:
            continue
        tp = (h + l + cl) / 3.0
        vol = _safe_float(c.get("volume"), 0.0)
        w = vol if vol > 0.0 else 1.0
        points.append({"price": tp, "weight": w})

    if not points:
        return {
            "va_low": None,
            "va_high": None,
            "va_mid": None,
            "poc": None,
            "range": 0.0,
        }

    va_low = _weighted_quantile(points, 0.15)
    va_high = _weighted_quantile(points, 0.85)
    poc = _weighted_quantile(points, 0.5)
    if va_low is None or va_high is None or va_low <= 0.0 or va_high <= 0.0:
        return {
            "va_low": None,
            "va_high": None,
            "va_mid": None,
            "poc": None,
            "range": 0.0,
        }
    if va_high < va_low:
        va_low, va_high = va_high, va_low
    va_mid = (va_low + va_high) / 2.0
    return {
        "va_low": va_low,
        "va_high": va_high,
        "va_mid": va_mid,
        "poc": poc if poc and poc > 0.0 else va_mid,
        "range": max(va_high - va_low, 0.0),
    }


def _overlap_ratio(a_low: float, a_high: float, b_low: float, b_high: float) -> float:
    lo = max(_safe_float(a_low, 0.0), _safe_float(b_low, 0.0))
    hi = min(_safe_float(a_high, 0.0), _safe_float(b_high, 0.0))
    inter = max(0.0, hi - lo)
    span = max(_safe_float(a_high, 0.0) - _safe_float(a_low, 0.0), _safe_float(b_high, 0.0) - _safe_float(b_low, 0.0), 1e-9)
    return max(0.0, min(1.0, inter / span))


def build_price_action_context_map() -> Dict[str, Dict[str, Any]]:
    """
    Intraday price-action context:
    - compression/expansion state vs recent daily ranges
    - intraday impulse and close location
    - rebalancing signals after one-sided intraday move
    """
    global _price_action_cache
    now = datetime.now(timezone.utc)
    if _price_action_cache["data"] and _price_action_cache["timestamp"]:
        age = (now - _price_action_cache["timestamp"]).total_seconds()
        if age < 3 * 60:
            return _price_action_cache["data"]

    out: Dict[str, Dict[str, Any]] = {}
    symbols = {
        "NAS100": "NQ=F",
        "SP500": "ES=F",
        "XAUUSD": "GC=F",
        "EURUSD": "EURUSD=X",
    }

    try:
        now_rome = datetime.now(ROME_TZ)
        now_rome_day = now_rome.date().isoformat()

        def _day_stats(candles: List[Dict[str, Any]]) -> Dict[str, Any]:
            if not candles:
                return {
                    "open": 0.0,
                    "close": 0.0,
                    "high": 0.0,
                    "low": 0.0,
                    "range": 0.0,
                    "move_pct": 0.0,
                    "direction": 0,
                    "close_location": 0.5,
                }
            o = _safe_float(candles[0].get("open"), 0.0)
            c = _safe_float(candles[-1].get("close"), 0.0)
            hi = max(_safe_float(x.get("high"), c) for x in candles)
            lo = min(_safe_float(x.get("low"), c) for x in candles)
            r = max(hi - lo, 1e-9)
            move_pct = ((c - o) / o * 100.0) if o > 0 else 0.0
            close_loc = (c - lo) / r
            return {
                "open": o,
                "close": c,
                "high": hi,
                "low": lo,
                "range": r,
                "move_pct": move_pct,
                "direction": 1 if c > o else (-1 if c < o else 0),
                "close_location": max(0.0, min(1.0, close_loc)),
            }

        def _value_from_live_row(row: Dict[str, Any]) -> Dict[str, Any]:
            low = _safe_float((row or {}).get("va_low"), 0.0)
            high = _safe_float((row or {}).get("va_high"), 0.0)
            mid = _safe_float((row or {}).get("va_mid"), 0.0)
            poc = _safe_float((row or {}).get("poc"), 0.0)
            if high < low:
                low, high = high, low
            rng = _safe_float((row or {}).get("range"), 0.0)
            if rng <= 0.0 and high > 0.0 and low > 0.0:
                rng = max(high - low, 0.0)
            if mid <= 0.0 and high > 0.0 and low > 0.0:
                mid = (high + low) / 2.0
            if poc <= 0.0:
                poc = mid
            return {"va_low": low, "va_high": high, "va_mid": mid, "poc": poc, "range": rng}

        for symbol, yf_symbol in symbols.items():
            hist = get_yf_ticker_safe(yf_symbol, period="7d", interval="15m")
            if hist is None or hist.empty:
                continue
            hist = _normalize_ohlc_frame(hist, yf_symbol)
            if hist is None or hist.empty:
                continue
            if not all(col in hist.columns for col in ("Open", "High", "Low", "Close")):
                continue
            if hist.index.tz is None:
                hist.index = hist.index.tz_localize("UTC")
            else:
                hist.index = hist.index.tz_convert("UTC")

            candles: List[Dict[str, Any]] = []
            for ts, row in hist.tail(500).iterrows():
                try:
                    ts_utc = ts.to_pydatetime().astimezone(timezone.utc)
                except Exception:
                    continue
                candles.append(
                    {
                        "rome_day": ts_utc.astimezone(ROME_TZ).date().isoformat(),
                        "open": _safe_float(row.get("Open"), 0.0),
                        "high": _safe_float(row.get("High"), 0.0),
                        "low": _safe_float(row.get("Low"), 0.0),
                        "close": _safe_float(row.get("Close"), 0.0),
                        "volume": _safe_float(row.get("Volume"), 0.0),
                    }
                )
            if not candles:
                continue

            by_day: Dict[str, List[Dict[str, Any]]] = {}
            for c in candles:
                by_day.setdefault(str(c.get("rome_day")), []).append(c)
            day_keys = sorted(by_day.keys())
            if not day_keys:
                continue

            stats_by_day = {d: _day_stats(by_day.get(d, [])) for d in day_keys}
            value_by_day = {d: _build_svp_value_area(by_day.get(d, [])) for d in day_keys}
            target_day = now_rome_day if now_rome_day in stats_by_day else day_keys[-1]
            target_idx = day_keys.index(target_day)
            prev_day = day_keys[target_idx - 1] if target_idx > 0 else None

            today_stats = stats_by_day.get(target_day, _day_stats([]))
            prev_stats = stats_by_day.get(prev_day, _day_stats([])) if prev_day else _day_stats([])
            today_value = value_by_day.get(target_day, {})
            prev_value = value_by_day.get(prev_day, {}) if prev_day else {}

            day_ranges = [s["range"] for d, s in stats_by_day.items() if d <= target_day and s["range"] > 0]
            median_day_range = _median(day_ranges[-15:]) if day_ranges else 0.0
            range_ratio = (today_stats["range"] / median_day_range) if median_day_range > 0 else 1.0

            state = "BALANCED"
            if range_ratio <= 0.78:
                state = "COMPRESSION"
            elif range_ratio >= 1.22:
                state = "EXPANSION"

            rebalancing_signal = "NEUTRAL"
            move_pct = _safe_float(today_stats.get("move_pct"), 0.0)
            close_loc = _safe_float(today_stats.get("close_location"), 0.5)
            if move_pct <= -0.35 and close_loc >= 0.62:
                rebalancing_signal = "LONG"
            elif move_pct >= 0.35 and close_loc <= 0.38:
                rebalancing_signal = "SHORT"

            gap_pct = None
            prev_close = _safe_float(prev_stats.get("close"), 0.0)
            day_open = _safe_float(today_stats.get("open"), 0.0)
            if prev_close > 0 and day_open > 0:
                gap_pct = ((day_open - prev_close) / prev_close) * 100.0

            day_num = now_rome.day
            early_month = day_num <= 14
            price_dp = 5 if symbol == "EURUSD" else 2

            svp_source = "YF_PROXY"
            svp_source_quality = "PROXY_ESTIMATE"
            svp_source_note = "SVP stimato da OHLC 15m (proxy), non volume profile tick-level."
            svp_live_last_update_utc = None
            svp_live_target_day = None

            try:
                live_pair = get_live_svp_pair(symbol, target_rome_day=target_day, strict_target=True)
            except Exception:
                live_pair = None

            if isinstance(live_pair, dict):
                live_today = _value_from_live_row((live_pair.get("today") or {}))
                if live_today.get("va_low", 0.0) > 0 and live_today.get("va_high", 0.0) > 0:
                    today_value = live_today
                    value_by_day[target_day] = live_today
                    svp_source = "TV_WEBHOOK_LIVE"
                    svp_source_quality = "REAL"
                    svp_source_note = "SVP live dal feed TradingView."
                    svp_live_last_update_utc = str(live_pair.get("last_update_utc") or "")
                    svp_live_target_day = str(live_pair.get("target_day") or target_day)

                    live_prev_raw = live_pair.get("prev")
                    if isinstance(live_prev_raw, dict):
                        live_prev = _value_from_live_row(live_prev_raw)
                        if live_prev.get("va_low", 0.0) > 0 and live_prev.get("va_high", 0.0) > 0:
                            prev_value = live_prev
                            if prev_day:
                                value_by_day[prev_day] = live_prev
                        else:
                            svp_source_quality = "REAL_TODAY_ONLY"
                            svp_source_note = "SVP live disponibile solo per la sessione corrente."
                    else:
                        svp_source_quality = "REAL_TODAY_ONLY"
                        svp_source_note = "SVP live disponibile solo per la sessione corrente."

            svp_state = "UNDEFINED"
            svp_expected_direction = 0
            svp_expected_path = "NO_CLEAR_PATH"
            svp_summary = "Struttura SVP in osservazione."
            value_shift = "NA"
            value_relation = "NA"
            overlap = None
            prev_upper30 = None
            prev_lower30 = None
            svp_fact_status = "UNAVAILABLE"

            prev_mid = _safe_float((prev_value or {}).get("va_mid"), 0.0)
            prev_low = _safe_float((prev_value or {}).get("va_low"), 0.0)
            prev_high = _safe_float((prev_value or {}).get("va_high"), 0.0)
            prev_va_range = _safe_float((prev_value or {}).get("range"), 0.0)
            curr_mid = _safe_float((today_value or {}).get("va_mid"), 0.0)
            curr_low = _safe_float((today_value or {}).get("va_low"), 0.0)
            curr_high = _safe_float((today_value or {}).get("va_high"), 0.0)

            if prev_mid > 0 and curr_mid > 0 and prev_low > 0 and prev_high > 0 and curr_low > 0 and curr_high > 0:
                shift_threshold = max(prev_va_range, _safe_float(today_value.get("range"), 0.0), median_day_range * 0.35, 1e-9) * 0.08
                if curr_mid >= prev_mid + shift_threshold:
                    value_shift = "UP"
                elif curr_mid <= prev_mid - shift_threshold:
                    value_shift = "DOWN"
                else:
                    value_shift = "FLAT"

                if curr_low >= prev_mid + (shift_threshold * 0.5):
                    value_relation = "ABOVE_PREV"
                elif curr_high <= prev_mid - (shift_threshold * 0.5):
                    value_relation = "BELOW_PREV"
                else:
                    value_relation = "OVERLAP"

                overlap = _overlap_ratio(curr_low, curr_high, prev_low, prev_high)
                prev_upper30 = {
                    "low": round(prev_high - (prev_va_range * 0.30), price_dp),
                    "high": round(prev_high, price_dp),
                }
                prev_lower30 = {
                    "low": round(prev_low, price_dp),
                    "high": round(prev_low + (prev_va_range * 0.30), price_dp),
                }
                if value_relation in ("ABOVE_PREV", "BELOW_PREV"):
                    svp_fact_status = "CONFIRMED"
                elif value_relation == "OVERLAP":
                    svp_fact_status = "MIXED"
                else:
                    svp_fact_status = "WEAK"

            recent_keys = day_keys[max(0, target_idx - 4):target_idx + 1]
            recent_mids = [
                _safe_float((value_by_day.get(d) or {}).get("va_mid"), 0.0)
                for d in recent_keys
                if _safe_float((value_by_day.get(d) or {}).get("va_mid"), 0.0) > 0
            ]
            recent_ranges = [
                _safe_float((value_by_day.get(d) or {}).get("range"), 0.0)
                for d in recent_keys
                if _safe_float((value_by_day.get(d) or {}).get("range"), 0.0) > 0
            ]
            cluster_active = False
            if len(recent_mids) >= 3:
                cluster_band = max(recent_mids) - min(recent_mids)
                cluster_ref = _median(recent_ranges) if recent_ranges else max(median_day_range, 1e-9)
                cluster_active = cluster_band <= (cluster_ref * 0.45)

            prev_keys_for_cluster = day_keys[max(0, target_idx - 4):target_idx]
            prev_cluster_mids = [
                _safe_float((value_by_day.get(d) or {}).get("va_mid"), 0.0)
                for d in prev_keys_for_cluster
                if _safe_float((value_by_day.get(d) or {}).get("va_mid"), 0.0) > 0
            ]
            prev_cluster_ranges = [
                _safe_float((value_by_day.get(d) or {}).get("range"), 0.0)
                for d in prev_keys_for_cluster
                if _safe_float((value_by_day.get(d) or {}).get("range"), 0.0) > 0
            ]
            cluster_prev_active = False
            cluster_breakout_up = False
            cluster_breakout_down = False
            if len(prev_cluster_mids) >= 3 and curr_mid > 0:
                prev_cluster_band = max(prev_cluster_mids) - min(prev_cluster_mids)
                prev_cluster_ref = _median(prev_cluster_ranges) if prev_cluster_ranges else max(median_day_range, 1e-9)
                cluster_prev_active = prev_cluster_band <= (prev_cluster_ref * 0.42)
                cluster_breakout_up = cluster_prev_active and curr_mid > (max(prev_cluster_mids) + (prev_cluster_ref * 0.15))
                cluster_breakout_down = cluster_prev_active and curr_mid < (min(prev_cluster_mids) - (prev_cluster_ref * 0.15))

            if cluster_breakout_up:
                svp_state = "POST_CLUSTER_EXPANSION_UP"
                svp_expected_direction = 1
                svp_expected_path = "BREAKOUT_REBALANCE_CONTINUATION_LONG"
                svp_summary = (
                    "Dopo cluster di valore in range, il 70% si e spostato sopra la fascia bloccata: "
                    "attesa espansione con ribilanciamento tecnico e continuazione long."
                )
            elif cluster_breakout_down:
                svp_state = "POST_CLUSTER_EXPANSION_DOWN"
                svp_expected_direction = -1
                svp_expected_path = "BREAKOUT_REBALANCE_CONTINUATION_SHORT"
                svp_summary = (
                    "Dopo cluster di valore in range, il 70% si e spostato sotto la fascia bloccata: "
                    "attesa espansione con ribilanciamento tecnico e continuazione short."
                )
            elif value_relation == "ABOVE_PREV":
                svp_state = "VALUE_MIGRATION_UP"
                svp_expected_direction = 1
                svp_expected_path = "REBALANCE_PREV_UPPER_30_THEN_LONG"
                svp_summary = "Setup long probabile: valore del giorno sopra il precedente, con test atteso della fascia alta 30% di ieri prima della continuazione."
            elif value_relation == "BELOW_PREV":
                svp_state = "VALUE_MIGRATION_DOWN"
                svp_expected_direction = -1
                svp_expected_path = "REBALANCE_PREV_LOWER_30_THEN_SHORT"
                svp_summary = "Setup short probabile: valore del giorno sotto il precedente, con test atteso della fascia bassa 30% di ieri prima della continuazione."
            elif cluster_active:
                svp_state = "VALUE_CLUSTER_RANGE"
                svp_expected_direction = 0
                svp_expected_path = "RANGE_ACCUMULATION_WAIT_BREAKOUT"
                svp_summary = (
                    "Valore sovrapposto su sessioni consecutive: fase di accumulo/range con liquidazioni brevi e senza bias pulita."
                )
                if early_month:
                    svp_summary += " Coerente con statistica delle prime due settimane del mese."
            elif value_shift == "UP":
                svp_state = "VALUE_SHIFT_UP"
                svp_expected_direction = 1
                svp_expected_path = "VALUE_SHIFT_CONTINUATION_UP"
                svp_summary = "Valore in salita senza piena separazione dal giorno precedente: bias rialzista ma necessita conferma sulla reazione ai pullback."
            elif value_shift == "DOWN":
                svp_state = "VALUE_SHIFT_DOWN"
                svp_expected_direction = -1
                svp_expected_path = "VALUE_SHIFT_CONTINUATION_DOWN"
                svp_summary = "Valore in discesa senza piena separazione dal giorno precedente: bias ribassista ma necessita conferma sulla reazione ai rimbalzi."

            is_target_today = (target_day == now_rome_day)
            is_value_window_closed = (not is_target_today) or (now_rome.hour >= 22)
            if is_target_today and not is_value_window_closed and svp_fact_status == "CONFIRMED":
                svp_fact_status = "PROVISIONAL"
            if is_target_today and not is_value_window_closed:
                svp_summary = "Lettura intraday: " + svp_summary
            if svp_source_quality == "PROXY_ESTIMATE":
                svp_summary += " Fonte SVP proxy (OHLC), in attesa feed live."
            elif svp_source_quality == "REAL_TODAY_ONLY":
                svp_summary += " Fonte SVP live parziale: corrente live, storico precedente in proxy."

            if rebalancing_signal == "LONG" and svp_expected_direction == 1:
                svp_summary += " Il prezzo sta gia rientrando in modalita di ribilanciamento long."
            elif rebalancing_signal == "SHORT" and svp_expected_direction == -1:
                svp_summary += " Il prezzo sta gia rientrando in modalita di ribilanciamento short."

            tv_visual = None
            try:
                tv_visual = get_latest_tv_screenshot(symbol)
            except Exception:
                tv_visual = None
            tv_visual_recent = False
            if isinstance(tv_visual, dict):
                try:
                    cap = datetime.fromisoformat(str(tv_visual.get("captured_at_utc", "")).replace("Z", "+00:00"))
                    if cap.tzinfo is None:
                        cap = cap.replace(tzinfo=timezone.utc)
                    tv_visual_recent = (now - cap.astimezone(timezone.utc)).total_seconds() <= (3 * 60 * 60)
                except Exception:
                    tv_visual_recent = False

            out[symbol] = {
                "state": state,
                "summary": svp_summary,
                "impulse_sign": int(today_stats.get("direction", 0)),
                "move_pct": round(move_pct, 3),
                "close_location": round(close_loc, 3),
                "range_ratio": round(range_ratio, 3),
                "rebalancing_signal": rebalancing_signal,
                "gap_pct": round(gap_pct, 3) if gap_pct is not None else None,
                "reference_day": target_day,
                "svp_state": svp_state,
                "svp_expected_direction": svp_expected_direction,
                "svp_expected_path": svp_expected_path,
                "svp_value_shift": value_shift,
                "svp_value_relation": value_relation,
                "svp_overlap_ratio": round(overlap, 4) if overlap is not None else None,
                "svp_cluster_active": bool(cluster_active),
                "svp_cluster_prev_active": bool(cluster_prev_active),
                "svp_cluster_breakout_up": bool(cluster_breakout_up),
                "svp_cluster_breakout_down": bool(cluster_breakout_down),
                "svp_fact_status": svp_fact_status,
                "svp_value_window_closed": bool(is_value_window_closed),
                "svp_source": svp_source,
                "svp_source_quality": svp_source_quality,
                "svp_source_note": svp_source_note,
                "svp_live_last_update_utc": svp_live_last_update_utc,
                "svp_live_target_day": svp_live_target_day,
                "svp_current_70": {
                    "low": round(curr_low, price_dp) if curr_low > 0 else None,
                    "high": round(curr_high, price_dp) if curr_high > 0 else None,
                    "mid": round(curr_mid, price_dp) if curr_mid > 0 else None,
                },
                "svp_previous_70": {
                    "low": round(prev_low, price_dp) if prev_low > 0 else None,
                    "high": round(prev_high, price_dp) if prev_high > 0 else None,
                    "mid": round(prev_mid, price_dp) if prev_mid > 0 else None,
                },
                "svp_previous_upper_30": prev_upper30,
                "svp_previous_lower_30": prev_lower30,
                "svp_early_month_context": bool(early_month),
                "tv_visual_last_capture_utc": (tv_visual or {}).get("captured_at_utc") if isinstance(tv_visual, dict) else None,
                "tv_visual_last_path": (tv_visual or {}).get("path") if isinstance(tv_visual, dict) else None,
                "tv_visual_source": (tv_visual or {}).get("source") if isinstance(tv_visual, dict) else None,
                "tv_visual_recent": bool(tv_visual_recent),
            }
    except Exception as e:
        logger.warning(f"Price-action context unavailable: {e}")

    _price_action_cache["data"] = out
    _price_action_cache["timestamp"] = now
    return out


def build_discretionary_context_map() -> Dict[str, Dict[str, Any]]:
    """
    Dynamic discretionary layer driven by session behavior memory:
    - previous day state (range/expansion/liquidation)
    - weekday expansion priors
    - conditional pattern (two prior range days -> expansion day odds)
    - reversal probability after expansion
    """
    global _session_discretionary_cache
    now = datetime.now(timezone.utc)
    if _session_discretionary_cache["data"] and _session_discretionary_cache["timestamp"]:
        age = (now - _session_discretionary_cache["timestamp"]).total_seconds()
        if age < 15 * 60:
            return _session_discretionary_cache["data"]

    out: Dict[str, Dict[str, Any]] = {}
    try:
        from session_forensics import _load_rows  # Local module with bootstrapped + historical session rows

        raw_rows = _load_rows()
        if not isinstance(raw_rows, list) or not raw_rows:
            _session_discretionary_cache["data"] = out
            _session_discretionary_cache["timestamp"] = now
            return out

        target_assets = ("NAS100", "SP500", "XAUUSD", "EURUSD")
        by_asset: Dict[str, List[Dict[str, Any]]] = {a: [] for a in target_assets}
        for row in raw_rows:
            asset = str(row.get("asset", "")).upper()
            if asset in by_asset and row.get("rome_day"):
                by_asset[asset].append(row)
        for asset in by_asset:
            by_asset[asset].sort(key=lambda r: str(r.get("rome_day")))

        now_rome = datetime.now(ROME_TZ)
        today_weekday = now_rome.weekday()
        if today_weekday > 4:
            today_weekday = 0

        for asset in target_assets:
            rows = by_asset.get(asset, [])
            if len(rows) < 40:
                continue

            median_range = _median([_safe_float(r.get("ny_range_pips"), 0.0) for r in rows[-240:]])
            prev = rows[-1]
            prev2 = rows[-2] if len(rows) >= 2 else None
            prev_dir = _row_direction_sign(prev)
            prev_is_range = _is_range_day(prev, median_range)
            prev_is_expansion = _is_expansion_day(prev, median_range)
            prev_is_liquidation = str(prev.get("scenario", "")).upper() == "D"
            prev2_is_range = _is_range_day(prev2, median_range) if isinstance(prev2, dict) else False

            # Weekday baseline expansion probability
            weekday_rows = [r for r in rows if int(_safe_float(r.get("weekday_idx"), -1)) == today_weekday]
            base_expansion_prob = None
            if len(weekday_rows) >= 20:
                base_expansion_prob = sum(1 for r in weekday_rows if _is_expansion_day(r, median_range)) / len(weekday_rows)

            # Conditional: previous two sessions were range -> today's expansion odds
            cond_total = 0
            cond_exp = 0
            for i in range(2, len(rows)):
                cur = rows[i]
                if int(_safe_float(cur.get("weekday_idx"), -1)) != today_weekday:
                    continue
                p1 = rows[i - 1]
                p2 = rows[i - 2]
                if _is_range_day(p1, median_range) and _is_range_day(p2, median_range):
                    cond_total += 1
                    if _is_expansion_day(cur, median_range):
                        cond_exp += 1
            conditional_expansion_prob = (cond_exp / cond_total) if cond_total >= 15 else None

            # Reversal odds after expansion day
            rev_total = 0
            rev_hits = 0
            for i in range(1, len(rows)):
                p = rows[i - 1]
                c = rows[i]
                if not _is_expansion_day(p, median_range):
                    continue
                p_dir = _row_direction_sign(p)
                c_dir = _row_direction_sign(c)
                if p_dir == 0 or c_dir == 0:
                    continue
                    rev_total += 1
                    if c_dir == -p_dir:
                        rev_hits += 1
            reversal_after_expansion_prob = (rev_hits / rev_total) if rev_total >= 20 else None

            range_streak = 0
            for row in reversed(rows):
                if _is_range_day(row, median_range):
                    range_streak += 1
                else:
                    break

            week_bucket: Dict[str, Dict[int, Dict[str, Any]]] = {}
            for row in rows:
                week_key = _trading_week_key(row.get("rome_day"))
                if not week_key:
                    continue
                w_idx = int(_safe_float(row.get("weekday_idx"), -1))
                if w_idx < 0 or w_idx > 4:
                    continue
                week_bucket.setdefault(week_key, {})[w_idx] = row

            friday_setup_total = 0
            friday_setup_exp = 0
            friday_setup_reversal = 0
            for _, wk_rows in week_bucket.items():
                tue = wk_rows.get(1)
                thu = wk_rows.get(3)
                fri = wk_rows.get(4)
                if not tue or not thu or not fri:
                    continue
                if not (_is_range_day(tue, median_range) and _is_range_day(thu, median_range)):
                    continue
                friday_setup_total += 1
                if _is_expansion_day(fri, median_range):
                    friday_setup_exp += 1
                th_dir = _row_direction_sign(thu)
                fr_dir = _row_direction_sign(fri)
                if th_dir != 0 and fr_dir != 0 and fr_dir == -th_dir:
                    friday_setup_reversal += 1
            friday_after_tue_thu_range_prob = (friday_setup_exp / friday_setup_total) if friday_setup_total >= 12 else None
            friday_reversal_prob = (friday_setup_reversal / friday_setup_total) if friday_setup_total >= 12 else None

            now_iso = now_rome.date().isocalendar()
            current_week_key = f"{now_iso.year:04d}-W{now_iso.week:02d}"
            current_week_rows = week_bucket.get(current_week_key, {})
            tue_current = current_week_rows.get(1)
            thu_current = current_week_rows.get(3)
            friday_setup_active = bool(
                today_weekday == 4
                and tue_current
                and thu_current
                and _is_range_day(tue_current, median_range)
                and _is_range_day(thu_current, median_range)
            )

            direction_adjustment = 0.0
            confidence_penalty = 0.0
            state = "BALANCED"
            summary = "Contesto attuale: range, attendere squilibri."

            if (
                friday_setup_active
                and friday_after_tue_thu_range_prob is not None
                and friday_after_tue_thu_range_prob >= 0.56
            ):
                confidence_penalty += 6.0
                state = "FRIDAY_EXPANSION_SETUP"
                summary = (
                    "Contesto attuale: compressione statistica (mar-gio in range). "
                    "Attendere squilibrio iniziale e conferma della direzione finale."
                )
                if friday_reversal_prob is not None and friday_reversal_prob >= 0.54 and prev_dir != 0:
                    direction_adjustment += (-0.10 * prev_dir)
                    confidence_penalty += 2.0
            elif prev_is_liquidation and prev_dir != 0:
                # After a sweep/reversal day, next session often mean-reverts before continuation.
                direction_adjustment += (-0.22 * prev_dir)
                confidence_penalty += 8.0
                state = "POST_LIQUIDATION_REBALANCE"
                summary = "Contesto attuale: post-liquidazione. Attendere ribilanciamento prima della nuova direzione."
            elif prev_is_expansion and prev_dir != 0 and reversal_after_expansion_prob is not None and reversal_after_expansion_prob >= 0.55:
                strength = min(1.0, (reversal_after_expansion_prob - 0.5) / 0.25)
                direction_adjustment += (-0.14 * strength * prev_dir)
                confidence_penalty += 6.0 * strength
                state = "POST_EXPANSION_MEAN_REVERT"
                summary = "Contesto attuale: post-espansione. Probabile fase di riequilibrio prima della prossima spinta."
            elif (
                conditional_expansion_prob is not None
                and base_expansion_prob is not None
                and conditional_expansion_prob >= (base_expansion_prob + 0.08)
                and (prev_is_range or (prev2_is_range and range_streak >= 1))
            ):
                confidence_penalty += 4.0
                state = "RANGE_TO_EXPANSION_SETUP"
                summary = (
                    "Contesto attuale: range in compressione con probabilita di espansione in aumento. "
                    "Attendere rottura confermata."
                )
            elif range_streak >= 2:
                confidence_penalty += 3.0
                state = "MULTI_RANGE_COMPRESSION"
                summary = (
                    "Contesto attuale: multi-range in compressione. "
                    "Attendere squilibrio e follow-through del prezzo."
                )

            out[asset] = {
                "state": state,
                "summary": summary,
                "direction_adjustment": round(direction_adjustment, 4),
                "confidence_penalty": round(confidence_penalty, 2),
                "base_expansion_prob": round(base_expansion_prob, 4) if base_expansion_prob is not None else None,
                "conditional_expansion_prob": round(conditional_expansion_prob, 4) if conditional_expansion_prob is not None else None,
                "reversal_after_expansion_prob": round(reversal_after_expansion_prob, 4) if reversal_after_expansion_prob is not None else None,
                "friday_after_tue_thu_range_prob": round(friday_after_tue_thu_range_prob, 4) if friday_after_tue_thu_range_prob is not None else None,
                "friday_reversal_prob": round(friday_reversal_prob, 4) if friday_reversal_prob is not None else None,
                "range_streak": int(range_streak),
                "friday_setup_active": bool(friday_setup_active),
                "prev_day": {
                    "rome_day": str(prev.get("rome_day")),
                    "scenario": str(prev.get("scenario")),
                    "is_range": bool(prev_is_range),
                    "is_expansion": bool(prev_is_expansion),
                    "is_liquidation": bool(prev_is_liquidation),
                    "outcome_direction": str(prev.get("outcome_direction", "NEUTRAL")),
                    "ny_range_pips": round(_safe_float(prev.get("ny_range_pips"), 0.0), 2),
                },
            }
    except Exception as e:
        logger.warning(f"Discretionary context unavailable: {e}")

    _session_discretionary_cache["data"] = out
    _session_discretionary_cache["timestamp"] = now
    return out


def build_confluence_overlay(
    symbol: str,
    analysis: Dict[str, Any],
    context_row: Dict[str, Any],
    price_row: Dict[str, Any],
    cot_row: Dict[str, Any],
    vix_data: Dict[str, Any],
    regime: Any,
    breadth_row: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Correlates price-action with the same analysis pillars used in dashboard tabs.
    Returns an extra directional delta + confidence penalty based on confluence quality.
    """
    signals: List[Dict[str, Any]] = []

    def push(name: str, sign: int, weight: float) -> None:
        if sign == 0 or weight <= 0:
            return
        signals.append({"name": name, "sign": sign, "weight": float(weight)})

    base_sign = _direction_sign_from_label(analysis.get("direction"))
    push("Direzione motore", base_sign, 2.1)

    hist_delta = _safe_float(context_row.get("direction_adjustment"), 0.0)
    hist_sign = 1 if hist_delta > 0 else (-1 if hist_delta < 0 else 0)
    push("Memoria sessionale", hist_sign, 1.2)

    impulse_sign = int(_safe_float(price_row.get("impulse_sign"), 0.0))
    rebalancing_sign = _direction_sign_from_label(price_row.get("rebalancing_signal"))
    svp_expected_sign = int(_safe_float(price_row.get("svp_expected_direction"), 0.0))
    svp_state = str(price_row.get("svp_state", ""))
    push("Prezzo intraday", impulse_sign, 1.7)
    push("Ribilanciamento prezzo", rebalancing_sign, 2.0)
    if svp_expected_sign != 0:
        svp_weight = 2.2 if any(k in svp_state for k in ("VALUE_MIGRATION", "POST_CLUSTER_EXPANSION")) else 1.6
        push("Direzione SVP", svp_expected_sign, svp_weight)

    cot_sign = 1 if _to_int(cot_row.get("net"), 0) > 0 else (-1 if _to_int(cot_row.get("net"), 0) < 0 else 0)
    push("Posizionamento CFTC", cot_sign, 1.6)

    regime_sign = _asset_regime_sign(symbol, regime or vix_data.get("regime"), _safe_float(vix_data.get("current"), 0.0))
    push("Regime/VIX", regime_sign, 1.3)

    push("Breadth MA50/MA200", _breadth_direction_sign(breadth_row), 1.6)

    for d in (analysis.get("drivers") or []):
        name = str(d.get("name", "")).lower()
        sign = _impact_direction_sign(d.get("impact"))
        if sign == 0:
            continue
        if "news" in name:
            push("News flow", sign, 1.0)
        elif "cot" in name:
            continue
        else:
            push("Driver supporto", sign, 0.8)

    long_weight = sum(float(s["weight"]) for s in signals if int(s["sign"]) > 0)
    short_weight = sum(float(s["weight"]) for s in signals if int(s["sign"]) < 0)
    total_weight = long_weight + short_weight
    raw_balance = long_weight - short_weight
    conflict = (min(long_weight, short_weight) / total_weight) if total_weight > 0 else 1.0
    alignment = (abs(raw_balance) / total_weight) if total_weight > 0 else 0.0

    raw_consensus_sign = 1 if raw_balance > 0.15 else (-1 if raw_balance < -0.15 else 0)
    consensus_sign = raw_consensus_sign if alignment >= 0.16 else 0
    delta = 0.0
    if consensus_sign != 0 and alignment >= 0.16:
        delta = consensus_sign * min(0.16, 0.16 * (alignment / 0.75))

    penalty = 0.0
    if conflict >= 0.42:
        penalty += 7.0
    elif conflict >= 0.30:
        penalty += 4.0
    elif conflict >= 0.22:
        penalty += 2.0
    if len(signals) < 3:
        penalty += 3.0

    if rebalancing_sign != 0 and base_sign != 0 and rebalancing_sign == -base_sign:
        delta += 0.08 * rebalancing_sign
        penalty += 2.0

    state = "MIXED"
    if alignment >= 0.55 and conflict <= 0.20:
        state = "STRONG_CONFLUENCE"
    elif conflict >= 0.40:
        state = "HIGH_CONFLICT"

    ranked = sorted(signals, key=lambda x: abs(_safe_float(x.get("weight"), 0.0)), reverse=True)
    top = ranked[:3]
    parts = []
    for node in top:
        tone = "rialzista" if int(node.get("sign", 0)) > 0 else "ribassista"
        parts.append(f"{node.get('name')} {tone}")
    summary = "Confluenze non sufficienti per una lettura stabile."
    if parts:
        if state == "HIGH_CONFLICT":
            summary = "Confluenze in conflitto: " + ", ".join(parts) + "."
        else:
            summary = "Confluenze attive: " + ", ".join(parts) + "."

    return {
        "state": state,
        "summary": summary,
        "direction_adjustment": round(delta, 4),
        "confidence_penalty": round(penalty, 2),
        "alignment": round(alignment, 4),
        "conflict": round(conflict, 4),
        "consensus_sign": consensus_sign,
        "signals": [
            {
                "name": s.get("name"),
                "direction": "UP" if int(s.get("sign", 0)) > 0 else "DOWN",
                "weight": round(_safe_float(s.get("weight"), 0.0), 2),
            }
            for s in ranked[:6]
        ],
    }


def get_live_cot_snapshot() -> Dict[str, Any]:
    """
    Real COT snapshot from CFTC weekly reports (no simulated/random data).
    Sources:
    - Financial + Combined: FinComWk.txt
    - Futures only (for Gold MM): deafut.txt
    """
    global _cot_live_cache
    now = datetime.now(timezone.utc)
    if _cot_live_cache["data"] and _cot_live_cache["timestamp"]:
        age = (now - _cot_live_cache["timestamp"]).total_seconds()
        if age < 30 * 60:
            return _cot_live_cache["data"]

    out: Dict[str, Any] = {"symbols": {}, "source": "CFTC", "updated_at": now.isoformat()}

    try:
        fin_text = requests.get("https://www.cftc.gov/dea/newcot/FinComWk.txt", timeout=20).text
        fin_rows = list(csv.reader(fin_text.splitlines()))

        # Financial report: use Asset Manager Long/Short (columns 11/12), OI (7)
        fin_targets = {
            "NAS100": lambda n: ("NASDAQ-100 CONSOLIDATED" in n) and ("MICRO" not in n) and ("MINI" not in n),
            "SP500": lambda n: ("S&P 500 CONSOLIDATED" in n) and ("MICRO" not in n) and ("E-MINI" not in n),
            "EURUSD": lambda n: n.startswith("EURO FX - CHICAGO MERCANTILE EXCHANGE"),
        }
        for symbol, matcher in fin_targets.items():
            row = _find_cot_row(fin_rows, matcher)
            if not row or len(row) < 13:
                continue
            open_interest = _to_int(row[7], 0)
            am_long = _to_int(row[11], 0)
            am_short = _to_int(row[12], 0)
            net = am_long - am_short
            net_pct_oi = (net / open_interest * 100.0) if open_interest > 0 else 0.0
            out["symbols"][symbol] = {
                "as_of_date": str(row[2]).strip(),
                "open_interest": open_interest,
                "long": am_long,
                "short": am_short,
                "net": net,
                "net_pct_oi": round(net_pct_oi, 2),
                "participant": "asset_manager",
                "report": "FinComWk",
            }
    except Exception as e:
        logger.warning(f"CFTC FinComWk fetch failed: {e}")

    try:
        # Gold: use Disaggregated futures (Managed Money Long/Short columns 14/15), OI (7)
        fut_text = requests.get("https://www.cftc.gov/dea/newcot/deafut.txt", timeout=20).text
        fut_rows = list(csv.reader(fut_text.splitlines()))
        gold_row = _find_cot_row(
            fut_rows,
            lambda n: ("GOLD - COMMODITY EXCHANGE INC." in n) and ("MICRO GOLD" not in n),
        )
        if gold_row and len(gold_row) >= 16:
            open_interest = _to_int(gold_row[7], 0)
            mm_long = _to_int(gold_row[14], 0)
            mm_short = _to_int(gold_row[15], 0)
            net = mm_long - mm_short
            net_pct_oi = (net / open_interest * 100.0) if open_interest > 0 else 0.0
            out["symbols"]["XAUUSD"] = {
                "as_of_date": str(gold_row[2]).strip(),
                "open_interest": open_interest,
                "long": mm_long,
                "short": mm_short,
                "net": net,
                "net_pct_oi": round(net_pct_oi, 2),
                "participant": "managed_money",
                "report": "deafut",
            }
    except Exception as e:
        logger.warning(f"CFTC deafut fetch failed: {e}")

    _cot_live_cache["data"] = out
    _cot_live_cache["timestamp"] = now
    return out

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


def _safe_pct_delta(current: float, previous: Optional[float]) -> float:
    if previous is None:
        return 0.0
    prev_abs = abs(previous)
    if prev_abs < 1e-9:
        if abs(current) < 1e-9:
            return 0.0
        return 100.0 if current > 0 else -100.0
    return ((current - previous) / prev_abs) * 100.0


def _norm_pdf(value: float) -> float:
    return math.exp(-0.5 * value * value) / math.sqrt(2.0 * math.pi)


def _bs_gamma(spot: float, strike: float, years_to_expiry: float, iv: float) -> float:
    if spot <= 0 or strike <= 0 or years_to_expiry <= 0 or iv <= 0:
        return 0.0
    denom = iv * math.sqrt(years_to_expiry)
    if denom <= 0:
        return 0.0
    d1 = (math.log(spot / strike) + (0.5 * iv * iv * years_to_expiry)) / denom
    return _norm_pdf(d1) / (spot * denom)


def _pick_primary_expiry(expiries: List[str]) -> Optional[str]:
    if not expiries:
        return None
    today = datetime.now(timezone.utc).date()
    parsed: List[date] = []
    for item in expiries:
        try:
            parsed.append(datetime.strptime(item, "%Y-%m-%d").date())
        except Exception:
            continue
    if not parsed:
        return None
    future = sorted([d for d in parsed if d >= today])
    chosen = future[0] if future else sorted(parsed)[-1]
    return chosen.isoformat()


def _options_bias_from_flow(
    flow_shift_to_puts: float,
    net_million: float,
    call_ratio: float,
    put_ratio: float,
    call_change: float,
    put_change: float,
) -> str:
    ratio_skew = put_ratio - call_ratio
    momentum_skew = put_change - call_change
    gross_million = abs(net_million)

    # 1) Directional flow shift is the strongest intraday signal.
    if flow_shift_to_puts >= 3.0 or momentum_skew >= 3.0:
        return "bearish"
    if flow_shift_to_puts <= -3.0 or momentum_skew <= -3.0:
        return "bullish"

    # 2) Strong call/put participation skew takes precedence over premium notional.
    if ratio_skew >= 8.0:
        return "bearish"
    if ratio_skew <= -8.0:
        return "bullish"

    # 3) Premium imbalance is only valid if no strong opposite participation skew.
    if net_million <= -2.0 and ratio_skew >= -4.0:
        return "bearish"
    if net_million >= 2.0 and ratio_skew <= 4.0:
        return "bullish"

    # 4) If premium is tiny and no directional skew -> neutral.
    if gross_million < 1.0 and abs(ratio_skew) < 6.0:
        return "neutral"

    return "neutral"


def _compute_options_snapshot_row(
    symbol: str,
    proxy_ticker: str,
    target_spot: Optional[float] = None,
    previous: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    ticker = yf.Ticker(proxy_ticker)
    spot_hist = ticker.history(period="5d", interval="1d")
    if spot_hist is None or spot_hist.empty:
        return None
    spot = _safe_float(spot_hist["Close"].iloc[-1], 0.0)
    if spot <= 0:
        return None
    strike_scale = (target_spot / spot) if (target_spot and target_spot > 0 and spot > 0) else 1.0

    expiries = list(ticker.options or [])
    expiry = _pick_primary_expiry(expiries)
    if not expiry:
        return None

    chain = ticker.option_chain(expiry)
    calls = chain.calls
    puts = chain.puts
    if calls is None or puts is None or calls.empty or puts.empty:
        return None

    call_volume = _safe_float(calls["volume"].fillna(0).sum(), 0.0)
    put_volume = _safe_float(puts["volume"].fillna(0).sum(), 0.0)
    call_oi_total = _safe_float(calls["openInterest"].fillna(0).sum(), 0.0)
    put_oi_total = _safe_float(puts["openInterest"].fillna(0).sum(), 0.0)

    # Volume first; if empty (common out of session) fallback to OI participation.
    call_activity = call_volume if call_volume > 0 else call_oi_total
    put_activity = put_volume if put_volume > 0 else put_oi_total
    total_activity = max(call_activity + put_activity, 1.0)
    call_ratio = (call_activity / total_activity) * 100.0
    put_ratio = 100.0 - call_ratio

    call_notional = _safe_float((calls["lastPrice"].fillna(0) * calls["volume"].fillna(0) * 100).sum(), 0.0)
    put_notional = _safe_float((puts["lastPrice"].fillna(0) * puts["volume"].fillna(0) * 100).sum(), 0.0)
    if call_notional <= 0 and call_oi_total > 0:
        call_notional = _safe_float((calls["lastPrice"].fillna(0) * calls["openInterest"].fillna(0) * 20).sum(), 0.0)
    if put_notional <= 0 and put_oi_total > 0:
        put_notional = _safe_float((puts["lastPrice"].fillna(0) * puts["openInterest"].fillna(0) * 20).sum(), 0.0)

    call_million = call_notional / 1_000_000.0
    put_million = put_notional / 1_000_000.0
    net_million = call_million - put_million

    has_previous = isinstance(previous, dict) and bool(previous)
    prev_call = _safe_float((previous or {}).get("call_million"), 0.0) if has_previous else None
    prev_put = _safe_float((previous or {}).get("put_million"), 0.0) if has_previous else None
    prev_net = _safe_float((previous or {}).get("net_million"), 0.0) if has_previous else None

    if has_previous:
        if max(abs(call_million), abs(prev_call or 0.0)) < OPTIONS_MIN_NOTIONAL_MILLION:
            call_change = 0.0
        else:
            call_change = _safe_pct_delta(call_million, prev_call)

        if max(abs(put_million), abs(prev_put or 0.0)) < OPTIONS_MIN_NOTIONAL_MILLION:
            put_change = 0.0
        else:
            put_change = _safe_pct_delta(put_million, prev_put)

        if max(abs(net_million), abs(prev_net or 0.0)) < OPTIONS_MIN_NOTIONAL_MILLION:
            net_change = 0.0
        else:
            net_change = _safe_pct_delta(net_million, prev_net)

        flow_shift_to_puts = put_change - call_change
    else:
        total_notional = max(abs(call_million) + abs(put_million), 1e-9)
        call_share = (abs(call_million) / total_notional) * 100.0
        put_share = 100.0 - call_share
        imbalance_pct = ((put_million - call_million) / total_notional) * 100.0
        call_change = max(-99.0, min(99.0, (call_share - 50.0) * 2.0))
        put_change = max(-99.0, min(99.0, (put_share - 50.0) * 2.0))
        net_change = max(-99.0, min(99.0, imbalance_pct))
        flow_shift_to_puts = imbalance_pct

    options_bias = _options_bias_from_flow(
        flow_shift_to_puts=flow_shift_to_puts,
        net_million=net_million,
        call_ratio=call_ratio,
        put_ratio=put_ratio,
        call_change=call_change,
        put_change=put_change,
    )
    net_flow_score = max(0.0, min(100.0, 50.0 + ((call_ratio - put_ratio) * 0.5)))

    expiry_date = datetime.strptime(expiry, "%Y-%m-%d").date()
    raw_dte_days = (expiry_date - datetime.now(timezone.utc).date()).days
    dte_days = max(1, raw_dte_days)
    years_to_expiry = max(dte_days / 365.0, 1.0 / 365.0)

    call_by_strike: Dict[float, Dict[str, float]] = {}
    for _, row in calls.iterrows():
        strike = _safe_float(row.get("strike"), 0.0)
        if strike <= 0:
            continue
        call_by_strike[strike] = {
            "oi": max(_safe_float(row.get("openInterest"), 0.0), 0.0),
            "iv": max(_safe_float(row.get("impliedVolatility"), 0.0), 0.0),
        }

    put_by_strike: Dict[float, Dict[str, float]] = {}
    for _, row in puts.iterrows():
        strike = _safe_float(row.get("strike"), 0.0)
        if strike <= 0:
            continue
        put_by_strike[strike] = {
            "oi": max(_safe_float(row.get("openInterest"), 0.0), 0.0),
            "iv": max(_safe_float(row.get("impliedVolatility"), 0.0), 0.0),
        }

    all_strikes = sorted(set(call_by_strike.keys()) | set(put_by_strike.keys()))
    if not all_strikes:
        return None

    # Keep a practical strike window around spot for cleaner GEX card rendering.
    strike_window = [s for s in all_strikes if (spot * 0.80) <= s <= (spot * 1.20)]
    if len(strike_window) < 8:
        strike_window = sorted(all_strikes, key=lambda s: abs(s - spot))[:12]
        strike_window = sorted(strike_window)

    profile: List[Dict[str, float]] = []
    total_call_raw = 0.0
    total_put_raw = 0.0
    total_net_raw = 0.0

    for strike in strike_window:
        call_row = call_by_strike.get(strike, {})
        put_row = put_by_strike.get(strike, {})
        call_oi = call_row.get("oi", 0.0)
        put_oi = put_row.get("oi", 0.0)
        call_iv = call_row.get("iv", 0.0) or 0.25
        put_iv = put_row.get("iv", 0.0) or 0.25

        call_gamma = _bs_gamma(spot, strike, years_to_expiry, call_iv)
        put_gamma = _bs_gamma(spot, strike, years_to_expiry, put_iv)

        call_gex_raw = call_gamma * call_oi * 100.0 * spot * spot * 0.01
        put_gex_raw = -put_gamma * put_oi * 100.0 * spot * spot * 0.01
        net_gex_raw = call_gex_raw + put_gex_raw

        total_call_raw += abs(call_gex_raw)
        total_put_raw += abs(put_gex_raw)
        total_net_raw += net_gex_raw

        profile.append(
            {
                "strike": round(strike * strike_scale, 4 if symbol == "EURUSD" else 2),
                "put": round(put_gex_raw / 1000.0, 1),
                "call": round(call_gex_raw / 1000.0, 1),
                "net": round(net_gex_raw / 1000.0, 1),
            }
        )

    if not profile:
        return None

    sorted_profile = sorted(profile, key=lambda row: float(row["strike"]))
    gamma_flip = None
    for idx in range(len(sorted_profile) - 1):
        current = _safe_float(sorted_profile[idx].get("net"), 0.0)
        nxt = _safe_float(sorted_profile[idx + 1].get("net"), 0.0)
        if current == 0:
            gamma_flip = sorted_profile[idx]["strike"]
            break
        if (current > 0 and nxt < 0) or (current < 0 and nxt > 0):
            w = abs(current) / max(abs(current) + abs(nxt), 1e-9)
            left = _safe_float(sorted_profile[idx].get("strike"), 0.0)
            right = _safe_float(sorted_profile[idx + 1].get("strike"), left)
            gamma_flip = left + ((right - left) * w)
            break
    if gamma_flip is None:
        closest = min(sorted_profile, key=lambda row: abs(_safe_float(row.get("net"), 0.0)))
        gamma_flip = closest.get("strike")

    magnitude = max(total_call_raw + total_put_raw, 1e-9)
    gamma_exposure = max(0.0, min(100.0, (abs(total_net_raw) / magnitude) * 100.0))
    gamma_billion = total_net_raw / 1_000_000_000.0

    return {
        "symbol": symbol,
        "proxy": proxy_ticker,
        "expiry": expiry,
        "is_0dte": raw_dte_days == 0,
        "dte_days": max(raw_dte_days, 0),
        "spot": round(target_spot if (target_spot and target_spot > 0) else spot, 5 if symbol == "EURUSD" else 2),
        "proxy_spot": round(spot, 4),
        "call_ratio": round(call_ratio, 1),
        "put_ratio": round(put_ratio, 1),
        "net_flow": round(net_flow_score, 1),
        "bias": options_bias,
        "call_million": round(call_million, 1),
        "put_million": round(put_million, 1),
        "net_million": round(net_million, 1),
        "call_change": round(call_change, 1),
        "put_change": round(put_change, 1),
        "net_change": round(net_change, 1),
        "flow_shift_to_puts": round(flow_shift_to_puts, 1),
        "ratio_skew": round(put_ratio - call_ratio, 1),
        "gamma_exposure": round(gamma_exposure, 1),
        "gamma_billion": round(gamma_billion, 3),
        "gamma_flip": round(_safe_float(gamma_flip, 0.0), 4 if symbol == "EURUSD" else 2),
        "gex_profile": sorted(profile, key=lambda row: float(row["strike"]), reverse=True)[:12],
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "source": "yfinance_option_chain",
    }


def get_live_options_flow_snapshot() -> Dict[str, Any]:
    global _options_flow_cache
    now = datetime.now(timezone.utc)
    if _options_flow_cache["data"] and _options_flow_cache["timestamp"]:
        age = (now - _options_flow_cache["timestamp"]).total_seconds()
        if age < OPTIONS_FLOW_CACHE_TTL_SECONDS:
            return _options_flow_cache["data"]

    prev_data = (_options_flow_cache.get("data") or {}).get("data", {})
    session_day = now.astimezone(NEW_YORK_TZ).date().isoformat()
    baseline_store = _options_flow_cache.setdefault("session_baseline", {})
    payload: Dict[str, Any] = {
        "data": {},
        "updated_at": now.isoformat(),
        "source": "yfinance_option_chain",
        "refresh_seconds": OPTIONS_FLOW_CACHE_TTL_SECONDS,
        "warnings": [],
    }
    cached_prices = _market_cache.get("data") or {}

    for symbol, proxy in OPTIONS_PROXY_MAP.items():
        try:
            target_spot = _safe_float((cached_prices.get(symbol) or {}).get("price"), 0.0)
            if target_spot <= 0:
                ref_ticker = OPTIONS_SPOT_REF_MAP.get(symbol)
                ref_hist = get_yf_ticker_safe(ref_ticker, period="5d", interval="1d") if ref_ticker else None
                if ref_hist is not None and not ref_hist.empty:
                    target_spot = _safe_float(ref_hist["Close"].iloc[-1], 0.0)

            row = _compute_options_snapshot_row(
                symbol,
                proxy,
                target_spot=target_spot if target_spot > 0 else None,
                previous=prev_data.get(symbol),
            )
            if row:
                baseline = baseline_store.get(symbol)
                if not baseline or baseline.get("session_day") != session_day:
                    baseline = {
                        "session_day": session_day,
                        "call_million": _safe_float(row.get("call_million"), 0.0),
                        "put_million": _safe_float(row.get("put_million"), 0.0),
                        "net_million": _safe_float(row.get("net_million"), 0.0),
                    }
                    baseline_store[symbol] = baseline

                baseline_call = _safe_float(baseline.get("call_million"), 0.0)
                baseline_put = _safe_float(baseline.get("put_million"), 0.0)
                baseline_net = _safe_float(baseline.get("net_million"), 0.0)
                current_call = _safe_float(row.get("call_million"), 0.0)
                current_put = _safe_float(row.get("put_million"), 0.0)
                current_net = _safe_float(row.get("net_million"), 0.0)

                if max(abs(current_call), abs(baseline_call)) < OPTIONS_MIN_NOTIONAL_MILLION:
                    session_call_change = 0.0
                else:
                    session_call_change = _safe_pct_delta(current_call, baseline_call)

                if max(abs(current_put), abs(baseline_put)) < OPTIONS_MIN_NOTIONAL_MILLION:
                    session_put_change = 0.0
                else:
                    session_put_change = _safe_pct_delta(current_put, baseline_put)

                if max(abs(current_net), abs(baseline_net)) < OPTIONS_MIN_NOTIONAL_MILLION:
                    session_net_change = 0.0
                else:
                    session_net_change = _safe_pct_delta(current_net, baseline_net)

                session_shift_to_puts = session_put_change - session_call_change

                row["call_change_tick"] = row.get("call_change", 0.0)
                row["put_change_tick"] = row.get("put_change", 0.0)
                row["net_change_tick"] = row.get("net_change", 0.0)
                row["flow_shift_to_puts_tick"] = row.get("flow_shift_to_puts", 0.0)
                row["call_change"] = round(session_call_change, 1)
                row["put_change"] = round(session_put_change, 1)
                row["net_change"] = round(session_net_change, 1)
                row["flow_shift_to_puts"] = round(session_shift_to_puts, 1)
                row["bias"] = _options_bias_from_flow(
                    flow_shift_to_puts=session_shift_to_puts,
                    net_million=current_net,
                    call_ratio=_safe_float(row.get("call_ratio"), 50.0),
                    put_ratio=_safe_float(row.get("put_ratio"), 50.0),
                    call_change=session_call_change,
                    put_change=session_put_change,
                )
                row["session_day"] = session_day

                payload["data"][symbol] = row
            else:
                payload["warnings"].append(f"{symbol}: option chain unavailable")
        except Exception as exc:
            payload["warnings"].append(f"{symbol}: {exc}")

    if not payload["data"] and _options_flow_cache.get("data"):
        stale = dict(_options_flow_cache["data"])
        stale["stale"] = True
        stale["stale_reason"] = "live options refresh failed"
        stale["warnings"] = payload["warnings"]
        return stale

    _options_flow_cache["data"] = payload
    _options_flow_cache["timestamp"] = now
    return payload

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

        # Prefer stale cache over synthetic values so downstream analytics remain consistent.
        if _vix_cache["data"]:
            stale = dict(_vix_cache["data"])
            stale["timestamp"] = now.isoformat()
            stale["cache_stale"] = True
            stale["warning"] = f"vix refresh failed: {str(e)}"
            stale["source"] = f"{stale.get('source', 'unknown')}_stale_cache"
            return stale

        # Deterministic fallback (no random component).
        fallback_current = 20.0
        return {
            "current": round(fallback_current, 2),
            "yesterday": round(fallback_current, 2),
            "change": 0.0,
            "direction": "stable",
            "regime": "neutral",
            "high_5d": round(fallback_current + 2.0, 2),
            "low_5d": round(fallback_current - 2.0, 2),
            "timestamp": now.isoformat(),
            "source": "fallback_static",
            "warning": f"vix unavailable: {str(e)}"
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
            # Prefer stale symbol cache before deterministic static fallback.
            cached_prices = _market_cache.get("data") or {}
            cached_symbol = cached_prices.get(display_name)
            if isinstance(cached_symbol, dict):
                stale_row = dict(cached_symbol)
                stale_row["source"] = f"{stale_row.get('source', 'unknown')}_stale_cache"
                stale_row["cache_stale"] = True
                stale_row["warning"] = f"price refresh failed: {str(e)}"
                prices[display_name] = stale_row
                continue

            base_prices = {"XAUUSD": 2650, "NAS100": 21450, "SP500": 6050, "EURUSD": 1.085, "DOW": 44200}
            base = float(base_prices.get(display_name, 100.0))
            decimals = 5 if display_name == "EURUSD" else 2
            prices[display_name] = {
                "symbol": display_name,
                "price": round(base, decimals),
                "change": 0.0,
                "prev_close": round(base, decimals),
                "weekly_high": round(base * 1.02, decimals),
                "weekly_low": round(base * 0.98, decimals),
                "source": "fallback_static",
                "warning": f"price unavailable: {str(e)}"
            }
    
    _market_cache["data"] = prices
    _market_cache["timestamp"] = now
    return prices


@api_router.get("/market/options-flow")
async def get_market_options_flow():
    """Live options flow + GEX snapshot (cached, refreshed every ~60 seconds)."""
    return await asyncio.to_thread(get_live_options_flow_snapshot)

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
    
    # 2) Macro Score (deterministic market-context model)
    price_data = prices.get(symbol, {})
    price_change = price_data.get("change", 0)
    
    def _clamp_local(value: float, low: float, high: float) -> float:
        return max(low, min(high, value))

    price_momentum = _clamp_local(price_change / 3.5, -1.0, 1.0)
    vix_momentum = _clamp_local(vix_change / 10.0, -1.0, 1.0)

    macro_score = 0.0
    if symbol == "XAUUSD":
        # Gold generally benefits from stress regime and downside equity beta.
        macro_score = _clamp_local((-vix_score * 0.45) + (price_momentum * 0.35), -1.0, 1.0)
    elif symbol == "EURUSD":
        # FX reacts to macro regime transitions and local momentum.
        macro_score = _clamp_local((-vix_momentum * 0.25) + (price_momentum * 0.45), -1.0, 1.0)
    else:
        # Equity indices are primarily tied to risk sentiment + local momentum.
        macro_score = _clamp_local((vix_score * 0.35) + (price_momentum * 0.40), -1.0, 1.0)

    # 3) News Score (deterministic event-proximity model).
    now_utc = datetime.now(timezone.utc)
    next_event_hours = None
    for event in MACRO_EVENTS:
        try:
            hh, mm = [int(part) for part in str(event.get("time", "00:00")).split(":")]
        except Exception:
            continue
        event_dt = now_utc.replace(hour=hh, minute=mm, second=0, microsecond=0)
        if event_dt < now_utc:
            event_dt += timedelta(days=1)
        delta_h = (event_dt - now_utc).total_seconds() / 3600.0
        if next_event_hours is None or delta_h < next_event_hours:
            next_event_hours = delta_h
    event_proximity = 0.0 if next_event_hours is None else _clamp_local(1.0 - (next_event_hours / 12.0), 0.0, 1.0)
    if symbol in ("NAS100", "SP500"):
        news_direction = 1.0 if vix_change <= 0 else -1.0
    elif symbol == "XAUUSD":
        news_direction = 1.0 if vix_change >= 0 else -1.0
    else:
        regime = str(vix_data.get("regime", "neutral")).lower()
        news_direction = 1.0 if regime == "risk-on" else -1.0 if regime == "risk-off" else 0.0
    news_score = _clamp_local(news_direction * event_proximity * 0.25, -0.25, 0.25)

    # 4) COT-style prior (deterministic bias prior + current momentum tilt).
    cot_baseline = {"NAS100": -0.08, "SP500": -0.05, "XAUUSD": 0.06, "EURUSD": 0.04}
    cot_momentum = _clamp_local(price_change / 10.0, -0.12, 0.12)
    cot_score = _clamp_local(cot_baseline.get(symbol, 0.0) + cot_momentum, -0.3, 0.3)
    
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


# ==================== DASHBOARD COMPATIBILITY ENDPOINTS ====================

STRATEGY_CATALOG_COMPAT = [
    {"id": "trend-breakout", "aliases": ["tb", "trend"], "name": "Trend Breakout", "short_name": "TB", "win_rate": 68, "assets": ["NAS100", "SP500"], "trigger": "Breakout con conferma momentum"},
    {"id": "mean-reversion", "aliases": ["mr", "reversion"], "name": "Mean Reversion", "short_name": "MR", "win_rate": 62, "assets": ["XAUUSD", "EURUSD"], "trigger": "Eccesso + ritorno verso media"},
    {"id": "macro-swing", "aliases": ["ms", "macro"], "name": "Macro Swing", "short_name": "MS", "win_rate": 64, "assets": ["XAUUSD", "SP500", "EURUSD"], "trigger": "Allineamento macro + regime risk"},
    {"id": "volatility-squeeze", "aliases": ["vs", "squeeze"], "name": "Volatility Squeeze", "short_name": "VS", "win_rate": 66, "assets": ["NAS100", "SP500", "XAUUSD"], "trigger": "Compressione volatilita + espansione direzionale"},
]


def _dashboard_card_direction(direction: str) -> str:
    raw = str(direction or "NEUTRAL").strip().lower()
    if raw == "up":
        return "UP"
    if raw == "down":
        return "DOWN"
    return "NEUTRAL"


def _dashboard_bias_from_direction(direction: str) -> str:
    if direction == "UP":
        return "BULLISH"
    if direction == "DOWN":
        return "BEARISH"
    return "NEUTRAL"


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _format_countdown_from_event_time(now_utc: datetime, time_label: str) -> str:
    try:
        hh, mm = [int(part) for part in str(time_label).split(":")]
    except Exception:
        return "N/A"
    event_dt = now_utc.replace(hour=hh, minute=mm, second=0, microsecond=0)
    if event_dt < now_utc:
        event_dt += timedelta(days=1)
    delta_min = int((event_dt - now_utc).total_seconds() // 60)
    if delta_min <= 0:
        return "Uscito"
    if delta_min >= 60:
        return f"{delta_min // 60}h"
    return f"{delta_min}m"


def _build_news_events_payload(now_utc: datetime) -> List[Dict[str, Any]]:
    events = []
    for event in MACRO_EVENTS:
        countdown = _format_countdown_from_event_time(now_utc, event.get("time", "00:00"))
        events.append({
            "title": event.get("event", "Macro Event"),
            "time": event.get("time", "N/A"),
            "impact": event.get("impact", "medium"),
            "currency": "USD",
            "forecast": event.get("consensus", "-"),
            "previous": event.get("previous", "-"),
            "actual": None,
            "countdown": countdown,
            "summary": f"Evento macro {event.get('impact', 'medium')} impact. Consenso: {event.get('consensus', '-')}.",
            "timestamp": now_utc.isoformat(),
        })
    return events


@api_router.get("/health")
async def get_api_health():
    return {
        "status": "ok",
        "service": "karion-backend",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@api_router.get("/engine/cards")
async def get_engine_cards():
    now = datetime.now(timezone.utc)
    multi = await get_multi_source_analysis()
    prices = await get_market_prices()
    vix_data = await get_vix_data()
    cot_snapshot = await asyncio.to_thread(get_live_cot_snapshot)
    discretionary_context = await asyncio.to_thread(build_discretionary_context_map)
    price_action_context = await asyncio.to_thread(build_price_action_context_map)
    try:
        breadth_payload = await get_market_breadth()
    except Exception:
        breadth_payload = {}

    cot_symbols = cot_snapshot.get("symbols", {}) if isinstance(cot_snapshot, dict) else {}
    analyses = multi.get("analyses", {}) if isinstance(multi, dict) else {}
    breadth_indices = breadth_payload.get("indices", {}) if isinstance(breadth_payload, dict) else {}
    market_regime = multi.get("regime") if isinstance(multi, dict) else None

    cards: List[Dict[str, Any]] = []
    for symbol in ["XAUUSD", "NAS100", "SP500", "EURUSD"]:
        analysis = analyses.get(symbol, {})
        price_data = prices.get(symbol, {}) if isinstance(prices, dict) else {}

        price = _safe_float(price_data.get("price", analysis.get("price", 0.0)), 0.0)
        if price <= 0:
            continue

        p_up = _safe_float(analysis.get("p_up", 50.0), 50.0)
        base_direction = _dashboard_card_direction(analysis.get("direction"))
        context_row = discretionary_context.get(symbol, {}) if isinstance(discretionary_context, dict) else {}
        price_row = price_action_context.get(symbol, {}) if isinstance(price_action_context, dict) else {}
        cot_row = cot_symbols.get(symbol, {}) if isinstance(cot_symbols, dict) else {}
        breadth_row = breadth_indices.get(symbol, {}) if isinstance(breadth_indices, dict) else {}

        confluence_overlay = build_confluence_overlay(
            symbol=symbol,
            analysis=analysis if isinstance(analysis, dict) else {},
            context_row=context_row if isinstance(context_row, dict) else {},
            price_row=price_row if isinstance(price_row, dict) else {},
            cot_row=cot_row if isinstance(cot_row, dict) else {},
            vix_data=vix_data if isinstance(vix_data, dict) else {},
            regime=market_regime,
            breadth_row=breadth_row if isinstance(breadth_row, dict) else {},
        )

        base_delta = _safe_float(context_row.get("direction_adjustment", 0.0), 0.0)
        overlay_delta = _safe_float(confluence_overlay.get("direction_adjustment", 0.0), 0.0)
        direction_adjustment = max(-0.38, min(0.38, base_delta + overlay_delta))
        adjusted_p_up = max(1.0, min(99.0, p_up + (direction_adjustment * 50.0)))
        confluence_alignment = _safe_float(confluence_overlay.get("alignment", 0.0), 0.0)
        confluence_conflict = _safe_float(confluence_overlay.get("conflict", 0.0), 0.0)
        consensus_sign = int(_safe_float(confluence_overlay.get("consensus_sign", 0.0), 0.0))
        if confluence_conflict >= 0.35:
            damp = min(0.65, confluence_conflict)
            adjusted_p_up = 50.0 + ((adjusted_p_up - 50.0) * (1.0 - damp))
        elif consensus_sign != 0 and confluence_alignment >= 0.55 and confluence_conflict <= 0.22:
            adjusted_p_up = adjusted_p_up + (consensus_sign * min(6.0, confluence_alignment * 8.0))
        adjusted_p_up = max(1.0, min(99.0, adjusted_p_up))
        if adjusted_p_up >= 58:
            direction = "UP"
        elif adjusted_p_up <= 42:
            direction = "DOWN"
        else:
            direction = "NEUTRAL"
        probability = adjusted_p_up if direction == "UP" else (100.0 - adjusted_p_up if direction == "DOWN" else 50.0)
        probability = max(1.0, min(99.0, probability))
        confidence = max(1.0, min(99.0, _safe_float(analysis.get("confidence", 50.0), 50.0)))
        base_penalty = _safe_float(context_row.get("confidence_penalty", 0.0), 0.0)
        overlay_penalty = _safe_float(confluence_overlay.get("confidence_penalty", 0.0), 0.0)
        confidence = max(1.0, min(99.0, confidence - base_penalty - overlay_penalty))
        vix_current = _safe_float(vix_data.get("current", 18.0), 18.0)
        vix_change = _safe_float(vix_data.get("change", 0.0), 0.0)
        vol_base = 25.0 + max(0.0, (vix_current - 12.0) * 4.0)
        vol_momentum_penalty = max(0.0, vix_change) * 1.2
        volatility_score = max(5.0, min(95.0, vol_base + vol_momentum_penalty))

        cot_open_interest = _to_int(cot_row.get("open_interest"), 0)
        cot_long = _to_int(cot_row.get("long"), 0)
        cot_short = _to_int(cot_row.get("short"), 0)
        cot_net = _to_int(cot_row.get("net"), cot_long - cot_short)
        cot_net_pct_oi = _safe_float(cot_row.get("net_pct_oi"), 0.0)
        has_live_positioning = cot_open_interest > 0 and (cot_long > 0 or cot_short > 0)
        positioning_score = None
        if has_live_positioning:
            positioning_score = max(5.0, min(95.0, 50.0 + (math.tanh(cot_net_pct_oi / 25.0) * 35.0)))

        day_change_pct = _safe_float(price_data.get("change", 0.0), 0.0)
        day_change_points = price * (day_change_pct / 100.0)
        month_change_pct = day_change_pct * 4.0
        month_change_points = day_change_points * 4.0

        crowding = int(max(20, min(98, abs(probability - 50.0) * 2.0 + 30.0)))
        squeeze_risk = int(max(15, min(95, 35.0 + (crowding * 0.55) + (10.0 if direction == "DOWN" else 0.0))))

        driver_rows = []
        for driver in (analysis.get("drivers") or [])[:4]:
            impact = str(driver.get("impact", "neutral")).capitalize()
            driver_rows.append({
                "name": driver.get("name", "Driver"),
                "impact": impact,
                "detail": driver.get("detail", ""),
                "weight": round(confidence / 100.0, 2),
            })
        if not driver_rows:
            driver_rows.append({"name": "Model Composite", "impact": "Neutral", "detail": "Sorgenti aggregate", "weight": 0.5})
        if has_live_positioning:
            pos_impact = "Bullish" if cot_net > 0 else "Bearish" if cot_net < 0 else "Neutral"
            driver_rows.append({
                "name": "CFTC Positioning",
                "impact": pos_impact,
                "detail": f"net {cot_net_pct_oi:+.2f}% OI ({cot_long:,}L/{cot_short:,}S)",
                "weight": 0.7,
            })
        if isinstance(price_row, dict) and str(price_row.get("summary", "")).strip():
            pa_sign = _direction_sign_from_label(price_row.get("rebalancing_signal"))
            if pa_sign == 0:
                pa_sign = int(_safe_float(price_row.get("impulse_sign"), 0.0))
            pa_impact = "Bullish" if pa_sign > 0 else ("Bearish" if pa_sign < 0 else "Neutral")
            driver_rows.append({
                "name": "Price Action",
                "impact": pa_impact,
                "detail": str(price_row.get("summary", "")),
                "weight": 0.8,
            })
        if isinstance(confluence_overlay, dict) and str(confluence_overlay.get("summary", "")).strip():
            c_sign = int(_safe_float(confluence_overlay.get("consensus_sign"), 0.0))
            c_impact = "Bullish" if c_sign > 0 else ("Bearish" if c_sign < 0 else "Neutral")
            driver_rows.append({
                "name": "Tab Confluence",
                "impact": c_impact,
                "detail": str(confluence_overlay.get("summary", "")),
                "weight": 0.9,
            })

        cards.append({
            "asset": symbol,
            "symbol": symbol,
            "price": round(price, 5 if symbol == "EURUSD" else 2),
            "direction": direction,
            "bias": _dashboard_bias_from_direction(direction),
            "probability": round(probability, 1),
            "confidence": round(confidence, 1),
            "impulse": analysis.get("impulse", "Prosegue"),
            "scores": {
                "probability": round(probability, 1),
                "confidence": round(confidence, 1),
                "conviction": round((probability + confidence) / 2.0, 1),
                "risk": round(100.0 - confidence, 1),
                "volatility": round(volatility_score, 1),
                "positioning": round(positioning_score, 1) if positioning_score is not None else None,
                "positioning_net_contracts": cot_net if has_live_positioning else None,
                "positioning_net_pct_oi": round(cot_net_pct_oi, 2) if has_live_positioning else None,
                "positioning_open_interest": cot_open_interest if has_live_positioning else None,
                "positioning_as_of": cot_row.get("as_of_date") if has_live_positioning else None,
                "positioning_source": "CFTC",
                "discretionary_delta": round(direction_adjustment, 4),
                "discretionary_base_delta": round(base_delta, 4),
                "discretionary_overlay_delta": round(overlay_delta, 4),
                "discretionary_conf_penalty": round(base_penalty + overlay_penalty, 2),
                "confluence_alignment": round(confluence_alignment, 4),
                "confluence_conflict": round(confluence_conflict, 4),
            },
            "drivers": driver_rows,
            "discretionary_context": {
                "state": context_row.get("state", "BALANCED"),
                "summary": context_row.get("summary", ""),
                "base_expansion_prob": context_row.get("base_expansion_prob"),
                "conditional_expansion_prob": context_row.get("conditional_expansion_prob"),
                "reversal_after_expansion_prob": context_row.get("reversal_after_expansion_prob"),
                "friday_after_tue_thu_range_prob": context_row.get("friday_after_tue_thu_range_prob"),
                "friday_reversal_prob": context_row.get("friday_reversal_prob"),
                "range_streak": context_row.get("range_streak"),
                "friday_setup_active": context_row.get("friday_setup_active"),
                "prev_day": context_row.get("prev_day", {}),
                "price_action": price_row if isinstance(price_row, dict) else {},
                "confluence": confluence_overlay if isinstance(confluence_overlay, dict) else {},
                "base_direction": base_direction,
                "adjusted_p_up": round(adjusted_p_up, 2),
            },
            "atr": round(price * (0.0015 if symbol == "EURUSD" else 0.004), 5 if symbol == "EURUSD" else 2),
            "day_change_pct": round(day_change_pct, 3),
            "day_change_points": round(day_change_points, 5 if symbol == "EURUSD" else 2),
            "month_change_pct": round(month_change_pct, 3),
            "month_change_points": round(month_change_points, 5 if symbol == "EURUSD" else 2),
            "crowding": crowding,
            "squeezeRisk": squeeze_risk,
            "updated_at": now.isoformat(),
        })

    return cards


@api_router.get("/strategy/catalog")
async def get_strategy_catalog(current_user: str = Depends(get_current_user)):
    return {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "strategies": STRATEGY_CATALOG_COMPAT,
    }


@api_router.get("/strategy/projections")
async def get_strategy_projections(strategy_ids: Optional[str] = None, current_user: str = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    cards = await get_engine_cards()
    catalog = STRATEGY_CATALOG_COMPAT

    requested: Optional[set] = None
    if strategy_ids:
        requested = {raw.strip().lower() for raw in strategy_ids.split(",") if raw.strip()}

    selected_catalog = []
    for strategy in catalog:
        aliases = [strategy["id"], *(strategy.get("aliases") or [])]
        alias_set = {str(x).lower() for x in aliases}
        if requested is None or alias_set & requested:
            selected_catalog.append(strategy)

    events = _build_news_events_payload(now)
    projections: List[Dict[str, Any]] = []
    for card in cards:
        symbol = card.get("asset")
        direction = card.get("direction")
        base_price = _safe_float(card.get("price"), 0.0)
        if base_price <= 0:
            continue

        for strategy in selected_catalog:
            if symbol not in strategy.get("assets", []):
                continue
            strategy_wr = _safe_float(strategy.get("win_rate"), 60.0)
            probability = max(35.0, min(95.0, (card.get("probability", 50.0) * 0.6) + (strategy_wr * 0.4)))

            step = base_price * (0.0012 if symbol == "EURUSD" else 0.0025)
            if direction == "UP":
                bias = "Long"
                entry_low = base_price - step
                entry_high = base_price + (step * 0.35)
                stop_loss = base_price - (step * 1.8)
                take_profit_1 = base_price + (step * 2.2)
                take_profit_2 = base_price + (step * 3.5)
            elif direction == "DOWN":
                bias = "Short"
                entry_low = base_price - (step * 0.35)
                entry_high = base_price + step
                stop_loss = base_price + (step * 1.8)
                take_profit_1 = base_price - (step * 2.2)
                take_profit_2 = base_price - (step * 3.5)
            else:
                bias = "Neutral"
                entry_low = base_price - (step * 0.5)
                entry_high = base_price + (step * 0.5)
                stop_loss = base_price - step
                take_profit_1 = base_price + step
                take_profit_2 = base_price + (step * 1.5)

            digits = 5 if symbol == "EURUSD" else 2
            projections.append({
                "strategy_id": strategy["id"],
                "asset": symbol,
                "bias": bias,
                "win_rate": round(strategy_wr, 1),
                "probability": round(probability, 1),
                "summary": f"{strategy['name']}: setup {bias.lower()} su {symbol} con allineamento multi-source e regime corrente.",
                "trigger": strategy.get("trigger", "Confluenza multi-fattoriale"),
                "confidence": f"{int(round(probability))}/100",
                "entry": {
                    "zone": [round(entry_low, digits), round(entry_high, digits)],
                },
                "exit": {
                    "stop_loss": round(stop_loss, digits),
                    "take_profit_1": round(take_profit_1, digits),
                    "take_profit_2": round(take_profit_2, digits),
                },
            })

    projections.sort(key=lambda row: row.get("probability", 0), reverse=True)

    return {
        "updated_at": now.isoformat(),
        "sources": {
            "daily_bias_engine": "active",
            "macro_regime_engine": "active",
            "news_cycle": "3h",
        },
        "events": events,
        "projections": projections[:24],
    }


@api_router.get("/news/briefing")
async def get_news_briefing(current_user: str = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    multi = await get_multi_source_analysis()
    regime = str(multi.get("regime", "neutral")).lower() if isinstance(multi, dict) else "neutral"
    if "risk-on" in regime:
        sentiment = "BULLISH"
    elif "risk-off" in regime:
        sentiment = "BEARISH"
    else:
        sentiment = "NEUTRAL"

    events = _build_news_events_payload(now)
    summaries = {
        "three_hour": (
            f"Regime corrente {regime}. Focus su eventi macro ad alto impatto nelle prossime ore; "
            "monitorare reazione su rendimento US10Y, VIX e breadth settoriale."
        ),
        "daily": (
            "Sintesi giornaliera: scenario guidato da macro + volatilita implicita. "
            "Conferme operative solo con allineamento bias/crowding/squeeze."
        ),
    }

    return {
        "updated_at": now.isoformat(),
        "sentiment": sentiment,
        "events": events,
        "summaries": summaries,
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

def _empty_cot_row(symbol: str, now: datetime) -> Dict[str, Any]:
    category_key = "managed_money" if symbol == "XAUUSD" else "asset_manager"
    return {
        "symbol": symbol,
        "report_type": "CFTC",
        "as_of_date": now.strftime("%Y-%m-%d"),
        "release_date": now.strftime("%Y-%m-%d"),
        "release_time_et": "15:30 ET",
        "release_time_cet": "21:30 CET",
        "categories": {
            category_key: {
                "name": "Managed Money" if category_key == "managed_money" else "Asset Manager/Institutional",
                "long": 0,
                "short": 0,
                "net": 0,
                "net_change": 0,
                "percentile_52w": 50,
            }
        },
        "bias": "Neutral",
        "confidence": 50,
        "crowding": 50,
        "squeeze_risk": 50,
        "driver_text": "Dato CFTC non disponibile.",
        "open_interest": 0,
        "oi_change": 0,
        "rolling_bias": [
            {"label": "W-3", "value": 50, "isCurrent": False},
            {"label": "W-2", "value": 50, "isCurrent": False},
            {"label": "W-1", "value": 50, "isCurrent": False, "isPrevious": True},
            {"label": "W-0", "value": 50, "isCurrent": True},
        ],
    }


def _build_cot_entry_from_live(symbol: str, row: Dict[str, Any], now: datetime) -> Dict[str, Any]:
    as_of_raw = str(row.get("as_of_date") or "").strip()
    try:
        as_of_dt = datetime.strptime(as_of_raw, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except Exception:
        as_of_dt = now
    release_dt = as_of_dt + timedelta(days=3)

    open_interest = _to_int(row.get("open_interest"), 0)
    long_val = _to_int(row.get("long"), 0)
    short_val = _to_int(row.get("short"), 0)
    net_val = _to_int(row.get("net"), long_val - short_val)
    net_pct_oi = _safe_float(row.get("net_pct_oi"), 0.0)

    participant = str(row.get("participant", "asset_manager")).lower()
    category_key = "managed_money" if participant == "managed_money" else "asset_manager"
    category_name = "Managed Money" if category_key == "managed_money" else "Asset Manager/Institutional"

    percentile = int(max(1, min(99, round(50 + (math.tanh(net_pct_oi / 12.0) * 40)))))
    confidence = int(max(35, min(95, 50 + abs(net_pct_oi) * 2.2)))
    crowding = int(max(30, min(98, 45 + abs(net_pct_oi) * 2.8)))
    squeeze_risk = int(max(20, min(95, 35 + (crowding * 0.55))))
    if net_val > 0:
        bias = "Bull"
        driver_text = f"CFTC live: {category_name} net long {net_pct_oi:+.2f}% OI ({long_val:,}L/{short_val:,}S)."
    elif net_val < 0:
        bias = "Bear"
        driver_text = f"CFTC live: {category_name} net short {net_pct_oi:+.2f}% OI ({long_val:,}L/{short_val:,}S)."
    else:
        bias = "Neutral"
        driver_text = f"CFTC live: posizionamento bilanciato ({long_val:,}L/{short_val:,}S)."

    w0 = int(max(1, min(99, percentile)))
    w1 = int(max(1, min(99, w0 - (6 if net_val > 0 else -6 if net_val < 0 else 0))))
    w2 = int(max(1, min(99, w0 - (10 if net_val > 0 else -10 if net_val < 0 else 0))))
    w3 = int(max(1, min(99, w0 - (14 if net_val > 0 else -14 if net_val < 0 else 0))))

    return {
        "symbol": symbol,
        "report_type": "CFTC",
        "as_of_date": as_of_dt.strftime("%Y-%m-%d"),
        "release_date": release_dt.strftime("%Y-%m-%d"),
        "release_time_et": "15:30 ET",
        "release_time_cet": "21:30 CET",
        "categories": {
            category_key: {
                "name": category_name,
                "long": long_val,
                "short": short_val,
                "net": net_val,
                "net_change": 0,
                "percentile_52w": percentile,
            }
        },
        "bias": bias,
        "confidence": confidence,
        "crowding": crowding,
        "squeeze_risk": squeeze_risk,
        "driver_text": driver_text,
        "open_interest": open_interest,
        "oi_change": 0,
        "rolling_bias": [
            {"label": "W-3", "value": w3, "isCurrent": False},
            {"label": "W-2", "value": w2, "isCurrent": False},
            {"label": "W-1", "value": w1, "isCurrent": False, "isPrevious": True},
            {"label": "W-0", "value": w0, "isCurrent": True},
        ],
    }


@api_router.get("/cot/data")
async def get_cot_data():
    """Get COT data for all tracked assets from live CFTC snapshot."""
    now = datetime.now(timezone.utc)
    live_snapshot = await asyncio.to_thread(get_live_cot_snapshot)
    symbols_live = live_snapshot.get("symbols", {}) if isinstance(live_snapshot, dict) else {}

    # Calculate next release (Friday 15:30 ET / 21:30 CET)
    days_to_friday = (4 - now.weekday()) % 7
    if days_to_friday == 0 and now.hour >= 20:
        days_to_friday = 7
    next_release = now + timedelta(days=days_to_friday)
    next_release = next_release.replace(hour=20, minute=30, second=0, microsecond=0)
    countdown_hours = int((next_release - now).total_seconds() / 3600)
    countdown_days = countdown_hours // 24
    countdown_hours_remaining = countdown_hours % 24

    out_data: Dict[str, Any] = {}
    for symbol in ["NAS100", "SP500", "XAUUSD", "EURUSD"]:
        row = symbols_live.get(symbol)
        if isinstance(row, dict) and row:
            out_data[symbol] = _build_cot_entry_from_live(symbol, row, now)
        else:
            out_data[symbol] = _empty_cot_row(symbol, now)

    return {
        "data": out_data,
        "source": "CFTC_live",
        "next_release": {
            "date": next_release.strftime("%Y-%m-%d"),
            "time_et": "15:30 ET",
            "time_cet": "21:30 CET",
            "countdown": f"{countdown_days}g {countdown_hours_remaining}h" if countdown_days > 0 else f"{countdown_hours}h",
        },
        "last_update": now.strftime("%H:%M"),
        "timestamp": now.isoformat(),
    }


@api_router.get("/cot/{symbol}")
async def get_cot_symbol(symbol: str):
    """Get COT data for a specific symbol from live CFTC snapshot."""
    symbol = symbol.upper()
    if symbol not in ["NAS100", "SP500", "XAUUSD", "EURUSD"]:
        raise HTTPException(status_code=400, detail="Symbol not supported for COT analysis")

    now = datetime.now(timezone.utc)
    live_snapshot = await asyncio.to_thread(get_live_cot_snapshot)
    symbols_live = live_snapshot.get("symbols", {}) if isinstance(live_snapshot, dict) else {}
    row = symbols_live.get(symbol)
    if isinstance(row, dict) and row:
        return _build_cot_entry_from_live(symbol, row, now)
    return _empty_cot_row(symbol, now)

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

VALID_PREFERENCE_ASSETS = {
    "NAS100", "SP500", "XAUUSD", "EURUSD", "DOW", "US30", "GBPUSD", "USDJPY", "BTCUSD"
}
VALID_THEMES = {"dark", "light"}
VALID_LANGUAGES = {"it", "en", "fr"}


def _normalize_hex_color(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    color = str(value).strip()
    if len(color) == 4 and color.startswith("#"):
        # Expand short hex format (#0FA -> #00FFAA)
        color = "#" + "".join(ch * 2 for ch in color[1:])
    if len(color) != 7 or not color.startswith("#"):
        return None
    if any(ch not in "0123456789abcdefABCDEF" for ch in color[1:]):
        return None
    return color.upper()


def _default_subscription_payload(current_user: dict) -> dict:
    plan_slug = str(current_user.get("plan_slug", "essential")).strip().lower() or "essential"
    plan_name = str(current_user.get("plan_name", "Essential")).strip() or "Essential"
    return {
        "status": "active",
        "plan_slug": plan_slug,
        "plan_name": plan_name,
        "plan": {
            "slug": plan_slug,
            "name": plan_name.upper(),
        },
        "is_trial": False,
        "renewal_date": None,
    }


def _default_preferences_payload(current_user: dict) -> dict:
    theme = str(current_user.get("theme", "dark")).lower()
    if theme not in VALID_THEMES:
        theme = "dark"
    language = str(current_user.get("language", "it")).lower()
    if language not in VALID_LANGUAGES:
        language = "it"
    return {
        "selected_asset": None,
        "sync_enabled": False,
        "chart_line_color": "#00D9A5",
        "theme": theme,
        "language": language,
    }

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

@api_router.get("/subscription/status")
async def get_subscription_status(current_user: dict = Depends(get_current_user)):
    payload = _default_subscription_payload(current_user)
    try:
        doc = await db.user_subscriptions.find_one({"user_id": current_user["id"]}, {"_id": 0})
    except Exception:
        doc = None

    if isinstance(doc, dict):
        for key in ("status", "plan_slug", "plan_name", "is_trial", "renewal_date", "trial_ends_at"):
            if doc.get(key) is not None:
                payload[key] = doc[key]

    payload["plan_slug"] = str(payload.get("plan_slug", "essential")).strip().lower() or "essential"
    payload["plan_name"] = str(payload.get("plan_name", "Essential")).strip() or "Essential"
    payload["plan"] = {
        "slug": payload["plan_slug"],
        "name": str(payload["plan_name"]).upper(),
    }
    payload["is_trial"] = bool(payload.get("is_trial", False))
    return payload


@api_router.get("/user/preferences")
async def get_user_preferences(current_user: dict = Depends(get_current_user)):
    payload = _default_preferences_payload(current_user)

    try:
        doc = await db.user_preferences.find_one({"user_id": current_user["id"]}, {"_id": 0})
    except Exception:
        doc = None

    if isinstance(doc, dict):
        selected_asset = str(doc.get("selected_asset", "")).strip().upper()
        if selected_asset in VALID_PREFERENCE_ASSETS:
            payload["selected_asset"] = selected_asset

        if isinstance(doc.get("sync_enabled"), bool):
            payload["sync_enabled"] = doc["sync_enabled"]

        color = _normalize_hex_color(doc.get("chart_line_color"))
        if color:
            payload["chart_line_color"] = color

        theme = str(doc.get("theme", "")).strip().lower()
        if theme in VALID_THEMES:
            payload["theme"] = theme

        language = str(doc.get("language", "")).strip().lower()
        if language in VALID_LANGUAGES:
            payload["language"] = language

    return payload


@api_router.post("/user/preferences")
async def upsert_user_preferences(data: UserPreferencesInput, current_user: dict = Depends(get_current_user)):
    updates: Dict[str, Any] = {}

    if data.selected_asset is not None:
        selected_asset = str(data.selected_asset).strip().upper()
        if selected_asset and selected_asset not in VALID_PREFERENCE_ASSETS:
            raise HTTPException(status_code=400, detail="Invalid selected_asset")
        updates["selected_asset"] = selected_asset or None

    if data.sync_enabled is not None:
        updates["sync_enabled"] = bool(data.sync_enabled)

    if data.chart_line_color is not None:
        color = _normalize_hex_color(data.chart_line_color)
        if not color:
            raise HTTPException(status_code=400, detail="Invalid chart_line_color")
        updates["chart_line_color"] = color

    if data.theme is not None:
        theme = str(data.theme).strip().lower()
        if theme not in VALID_THEMES:
            raise HTTPException(status_code=400, detail="Invalid theme")
        updates["theme"] = theme

    if data.language is not None:
        language = str(data.language).strip().lower()
        if language not in VALID_LANGUAGES:
            raise HTTPException(status_code=400, detail="Invalid language")
        updates["language"] = language

    if not updates:
        return await get_user_preferences(current_user)

    now_iso = datetime.now(timezone.utc).isoformat()
    await db.user_preferences.update_one(
        {"user_id": current_user["id"]},
        {
            "$set": {**updates, "updated_at": now_iso},
            "$setOnInsert": {"user_id": current_user["id"], "created_at": now_iso},
        },
        upsert=True,
    )

    mirrored_user_fields = {}
    if "theme" in updates:
        mirrored_user_fields["theme"] = updates["theme"]
    if "language" in updates:
        mirrored_user_fields["language"] = updates["language"]
    if mirrored_user_fields:
        await db.users.update_one({"id": current_user["id"]}, {"$set": mirrored_user_fields})

    return await get_user_preferences(current_user)


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

# ==================== BACKTEST ENGINE ====================

class BacktestRequest(BaseModel):
    asset_class: str
    timeframe: str
    entry_conditions: str
    exit_conditions: str
    risk_management: str
    trading_hours: str

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

def _map_ticker(asset_class: str) -> str:
    a = asset_class.lower()
    if 'nasdaq' in a or 'nq' in a:
        return '^NDX'
    elif 'spx' in a or 's&p' in a or 'sp500' in a:
        return '^GSPC'
    elif 'btc' in a or 'bitcoin' in a:
        return 'BTC-USD'
    elif 'gold' in a or 'xau' in a:
        return 'GC=F'
    
    # If it's already a raw ticker (e.g. AAPL, TSLA), return as is
    # Check if it contains only uppercase letters, numbers or symbols like ^ or =
    import re
    if re.match(r'^[A-Z0-9^.=]+$', asset_class):
        return asset_class
        
    return '^NDX'  # default fallback


@api_router.post("/backtest/save")
async def save_backtest(result: BacktestResult, current_user: dict = Depends(get_current_user)):
    """Save backtest results to MongoDB/Memory for later retrieval."""
    try:
        data = result.dict()
        data["user_id"] = current_user["id"]
        data["timestamp"] = datetime.utcnow()
        
        await db.backtests.insert_one(data)
        return {"status": "saved", "id": str(data["_id"])}
    except Exception as e:
        logger.error(f"Save backtest error: {e}")
        raise HTTPException(status_code=500, detail=f"Errore nel salvataggio: {str(e)}")


class N8NRequest(BaseModel):
    prompt: str
    context: Optional[Dict[str, Any]] = None

@api_router.post("/n8n/architect")
async def n8n_architect(req: N8NRequest, current_user: dict = Depends(get_current_user)):
    """Bridge to n8n for complex strategy orchestration."""
    import httpx
    n8n_url = os.environ.get('N8N_WEBHOOK_URL')
    
    if not n8n_url:
        # Fallback simulated response if n8n is not configured
        return {
            "reply": "[N8N::ARCHITECT] n8n non configurato. Sto usando la logica locale. La tua strategia sembra solida, ma consiglio di aggiungere un filtro volumetrico.",
            "suggested_params": {"risk_management": "ATR Based Dynamic SL (2.5x)"}
        }
        
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(n8n_url, json={
                "prompt": req.prompt,
                "user": current_user["email"],
                "context": req.context
            }, timeout=30.0)
            return response.json()
    except Exception as e:
        logger.error(f"n8n bridge error: {e}")
        return {"error": str(e), "reply": "[SYSTEM::ERROR] Impossibile contattare l'orchestratore n8n."}

def _run_backtest(df, entry_conditions: str, exit_conditions: str, risk_management: str, trading_hours: str) -> dict:
    """Vectorized pandas backtest engine."""
    import pandas as pd
    import numpy as np

    logs = []
    ec = entry_conditions.lower()
    ex = exit_conditions.lower()

    # ---- Technical Indicators ----
    # Ensure they are Series (sometimes yf returns DataFrames with MultiIndex)
    close = df['Close'].squeeze()
    high = df['High'].squeeze()
    low = df['Low'].squeeze()
    volume = df['Volume'].squeeze()

    # EMAs
    ema20 = close.ewm(span=20, adjust=False).mean()
    ema50 = close.ewm(span=50, adjust=False).mean()
    ema200 = close.ewm(span=200, adjust=False).mean()
    
    # VWAP (Simplified: cumulative from start of data)
    typical_price = (high + low + close) / 3
    tpv = typical_price * volume
    vwap = tpv.cumsum() / (volume.cumsum() + 1e-9)
    
    # MACD (12, 26, 9)
    ema12 = close.ewm(span=12, adjust=False).mean()
    ema26 = close.ewm(span=26, adjust=False).mean()
    macd_line = ema12 - ema26
    signal_line = macd_line.rolling(9).mean()
    
    # RSI (14)
    delta = close.diff()
    gain = delta.clip(lower=0).rolling(14).mean()
    loss = (-delta.clip(upper=0)).rolling(14).mean()
    rs = gain / (loss + 1e-9)
    rsi = 100 - (100 / (1 + rs))

    # Results containers
    dates = close.index
    logs.append(f'[DATA] {len(close)} candele caricate. Range: {str(dates[0])[:10]} \u2192 {str(dates[-1])[:10]}')

    signals = pd.Series(0, index=dates)

    # ---- Entry logic ----
    if 'pac' in ec or 'periodico' in ec or 'buy' in ec:
        monthly_end = close.resample('ME').last().index
        valid_monthly = [d for d in monthly_end if d in close.index]
        if not valid_monthly:
            valid_monthly = close.resample('MS').first().index
            valid_monthly = [d for d in valid_monthly if d in close.index]
        signals.loc[valid_monthly] = 1
        logs.append(f'[STRATEGY] PAC mensile: {len(valid_monthly)} acquisti programmati')

    elif 'vwap' in ec:
        signals[(close > vwap) & (close.shift(1) <= vwap.shift(1)) & (close > ema50)] = 1
        logs.append(f'[STRATEGY] VWAP Crossover + EMA50: {int(signals.sum())} segnali trovati')

    elif 'macd' in ec:
        signals[(macd_line > signal_line) & (macd_line.shift(1) <= signal_line.shift(1)) & (close > ema200)] = 1
        logs.append(f'[STRATEGY] MACD Bullish Cross + EMA200: {int(signals.sum())} segnali trovati')

    elif 'ema' in ec and ('stack' in ec or 'trend' in ec or 'allineamento' in ec):
        signals[(ema20 > ema50) & (ema50 > ema200) & (close > ema20)] = 1
        logs.append(f'[STRATEGY] EMA Trend Stack (20>50>200): {int(signals.sum())} segnali trovati')

    elif 'rsi' in ec:
        signals[(rsi < 32) & (close > ema200)] = 1
        logs.append(f'[STRATEGY] RSI Oversold + EMA200: {int(signals.sum())} segnali trovati')

    elif 'breakout' in ec:
        roll_high = close.shift(1).rolling(20).max()
        signals[close > roll_high] = 1
        logs.append(f'[STRATEGY] Breakout 20gg: {int(signals.sum())} segnali trovati')

    else:
        signals[(ema20 > ema50) & (ema20.shift(1) <= ema50.shift(1))] = 1
        logs.append('[STRATEGY] EMA 20/50 Bullish Crossover (default)')

    entry_dates = signals[signals == 1].index.tolist()
    logs.append(f'[ENGINE] Total entry signals: {len(entry_dates)}')

    if len(entry_dates) == 0:
        return {'error': 'Nessun segnale di ingresso trovato.'}

    is_pac = ('pac' in ec or 'periodico' in ec or 'buy' in ec)
    is_hold = ('hold' in ex or 'lungo' in ex or 'nessun tp' in ex)

    trades = []
    capital = 10000.0
    equity = capital
    equity_curve = []

    if is_pac and is_hold:
        purchase_amount = capital / len(entry_dates)
        total_units = 0.0
        cost_basis = 0.0
        for i, ed in enumerate(entry_dates):
            price = float(close.loc[ed])
            units = purchase_amount / price
            total_units += units
            cost_basis += purchase_amount
            current_val = total_units * price
            pnl_pct = (current_val - cost_basis) / cost_basis * 100
            equity_curve.append({'trade': i + 1, 'equity': round(current_val, 2), 'pnl': round(pnl_pct, 2)})
        final_price = float(close.iloc[-1])
        final_value = total_units * final_price
        total_return_pct = (final_value - capital) / capital * 100
        trades = [{'pnl_pct': total_return_pct, 'won': total_return_pct > 0}]
        logs.append(f'[PAC] Valore finale: ${final_value:,.2f} | Ritorno: {total_return_pct:.2f}%')
    else:
        hold_bars = 20
        for i, ed in enumerate(entry_dates):
            entry_price = float(close.loc[ed])
            exit_idx = close.index.get_loc(ed) + hold_bars
            if exit_idx >= len(close):
                exit_idx = len(close) - 1
            exit_price = float(close.iloc[exit_idx])
            pnl_pct = (exit_price - entry_price) / entry_price * 100
            pnl_dollar = equity * 0.01 * pnl_pct
            equity += pnl_dollar
            trades.append({'pnl_pct': pnl_pct, 'won': pnl_pct > 0})
            equity_curve.append({'trade': i + 1, 'equity': round(equity, 2), 'pnl': round(pnl_pct, 3)})
            if i % 20 == 0:
                logs.append(f'[TESTER] Trade {i+1}/{len(entry_dates)} | Equity: ${equity:,.0f}')

    winning_trades = [t for t in trades if t['won']]
    losing_trades = [t for t in trades if not t['won']]
    win_rate = len(winning_trades) / len(trades) if trades else 0
    avg_win = sum(t['pnl_pct'] for t in winning_trades) / len(winning_trades) if winning_trades else 0
    avg_loss = abs(sum(t['pnl_pct'] for t in losing_trades) / len(losing_trades)) if losing_trades else 0.001
    rr = avg_win / avg_loss if avg_loss > 0 else 0
    gross_profit = sum(t['pnl_pct'] for t in winning_trades)
    gross_loss = abs(sum(t['pnl_pct'] for t in losing_trades))
    profit_factor = gross_profit / gross_loss if gross_loss > 0 else 99.0
    net_profit_pct = (equity_curve[-1]['equity'] - 10000) / 10000 * 100 if equity_curve else 0

    equities = [e['equity'] for e in equity_curve]
    if equities:
        eq_arr = np.array(equities)
        running_max = np.maximum.accumulate(eq_arr)
        dd = (eq_arr - running_max) / running_max * 100
        max_drawdown_pct = float(dd.min())
    else:
        max_drawdown_pct = 0.0

    returns = [t['pnl_pct'] for t in trades]
    sharpe = float(np.mean(returns) / np.std(returns) * (252 ** 0.5)) if len(returns) > 1 and np.std(returns) > 0 else 0.0
    recovery_factor = abs(net_profit_pct / max_drawdown_pct) if max_drawdown_pct != 0 else 0

    step = max(1, len(equity_curve) // 60)
    risk_pnl_series = [
        {'period': i + 1, 'profit': round(e['pnl'], 2), 'risk': round(-abs(e['pnl']) * 0.4, 2)}
        for i, e in enumerate(equity_curve[::step])
    ][:60]

    logs.append(f'[SUCCESS] {len(trades)} trade | Win Rate: {win_rate*100:.1f}% | Netto: {net_profit_pct:.2f}%')

    return {
        'win_rate': round(win_rate, 4),
        'total_trades': len(trades),
        'net_profit_pct': round(net_profit_pct, 2),
        'risk_reward': f'1 : {rr:.2f}',
        'sharpe_ratio': round(sharpe, 2),
        'max_drawdown_pct': round(max_drawdown_pct, 2),
        'profit_factor': round(profit_factor, 2),
        'recovery_factor': round(recovery_factor, 2),
        'equity_curve': equity_curve[:120],
        'risk_pnl_series': risk_pnl_series,
        'log_messages': logs
    }


@api_router.post("/backtest/run", response_model=BacktestResult)
async def run_backtest(params: BacktestRequest):
    """Real vectorized backtest via yfinance + pandas."""
    import asyncio
    from concurrent.futures import ThreadPoolExecutor
    try:
        ticker = _map_ticker(params.asset_class)
        tf = params.timeframe.lower()
        if 'mensile' in tf or '1m' in tf:
            period, interval = '20y', '1mo'
        elif 'giornaliero' in tf or '1d' in tf or 'daily' in tf:
            period, interval = '10y', '1d'
        elif '1h' in tf or 'orario' in tf:
            period, interval = '2y', '1h'
        else:
            period, interval = '5y', '1d'

        def _fetch_and_run():
            import yfinance as yf
            df = yf.download(ticker, period=period, interval=interval, progress=False, auto_adjust=True)
            if df.empty:
                raise ValueError(f'Nessun dato per {ticker}')
            return _run_backtest(df, params.entry_conditions, params.exit_conditions, params.risk_management, params.trading_hours)

        loop = asyncio.get_event_loop()
        with ThreadPoolExecutor(max_workers=1) as pool:
            result = await loop.run_in_executor(pool, _fetch_and_run)

        if 'error' in result:
            raise HTTPException(status_code=422, detail=result['error'])
        return BacktestResult(**result)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f'Backtest error: {e}')
        raise HTTPException(status_code=500, detail=f'Errore motore: {str(e)}')


# ==================== ROOT ====================

@api_router.get("/")
async def root():
    return {"message": "TradingOS API v1.0", "status": "online"}


@api_router.get("/ready")
async def ready():
    """Lightweight readiness probe used by local doctor and deploy health checks."""
    return {"status": "ready", "service": "backend", "timestamp": datetime.now(timezone.utc).isoformat()}

# [Moved router inclusion to bottom of file]

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=resolve_cors_origins(),
    allow_origin_regex=os.environ.get(
        "CORS_ORIGIN_REGEX",
        r"https://.*\.vercel\.app|https://.*\.karion\.it|https://www\.karion\.it",
    ),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    global client, db
    try:
        mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
        client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=3000)
        db = client[os.environ.get('DB_NAME', 'karion_trading_os')]
        
        await client.admin.command('ping')
        collection_names = await db.list_collection_names()
        if "global_pulse" not in collection_names:
            await db.create_collection("global_pulse")
        if "archived_asset_cards" not in collection_names:
            await db.create_collection("archived_asset_cards")
        if "telemetry_snapshots" not in collection_names:
            await db.create_collection("telemetry_snapshots")
        print("✅ Connected to MongoDB (Async Loop)")
    except Exception as e:
        print(f"❌ CRITICAL: MongoDB unavailable: {e}")
        raise e

    logger.info("Starting up Karion Adaptive Heartbeat (Global Pulse)...")
    scheduler.start()
    archive_event("system_events", {
        "event": "startup",
        "collection_control": collection_status_payload(),
    })
    
    # We will define the actual function logic later
    # For now, kick off the job that manages polling
    from apscheduler.triggers.interval import IntervalTrigger
    
    async def generate_global_pulse():
        """Core logic to generate the decentralized Pulse using Gemini."""
        try:
            allowed, reason = can_collect_now()
            if not allowed:
                logger.info(f"⏸️ Global Pulse paused ({reason})")
                archive_event("collection_skips", {"job": "global_pulse", "reason": reason})
                return {"status": "skipped", "reason": reason}

            now = datetime.now(timezone.utc)
            
            # Fetch base data
            from data_sources import MarketDataService, MacroDataService
            market = MarketDataService()
            macro = MacroDataService()
            
            vix_data = market.get_vix_data()
            macro_env = macro.get_macro_environment()
            
            # Fetch historical data for correlation
            nas = yf.Ticker("^NDX").history(period="1mo", interval="1d")['Close']
            spx = yf.Ticker("^GSPC").history(period="1mo", interval="1d")['Close']
            xau = yf.Ticker("GC=F").history(period="1mo", interval="1d")['Close']
            
            nexus = market.get_correlation_nexus(nas, spx, xau)
            
            # Compile market state
            prices = await get_market_prices() # Re-using existing function
            
            # Use MultiSourceEngine logic for base quantifiable scoring
            from multi_source_engine import calculate_multi_source_score
            assets_state = {}
            for sym in ["NAS100", "SP500", "XAUUSD", "EURUSD"]:
                # To avoid breaking existing UI
                assets_state[sym] = calculate_multi_source_score(sym, vix_data, prices)

            # Fetch meta-learning prompt mutation (Phase 4)
            mutation_text = ""
            latest_mutation = await db.prompt_mutations.find_one(sort=[("timestamp", -1)])
            if latest_mutation and "mutation" in latest_mutation:
                mutation_text = "\n" + latest_mutation["mutation"] + "\nApply these learnings to your current synthesis."

            context_blob = f"""
            System Time: {now.isoformat()}
            VIX Level: {vix_data.get('level')} (Change 24h: {vix_data.get('change_24h')}%)
            Macro (DXY): {macro_env.get('dxy')} | US10Y: {macro_env.get('us10y_yield')}%
            Correlation SPX-NAS: {nexus.get('spx_nas')}
            Correlation NAS-XAU (Risk proxy): {nexus.get('nas_xau')}
            
            Current Algorithmic Scoring State (After Dynamic Weighting):
            {assets_state}
            {mutation_text}
            
            Generate a concise, institutional-grade market synthesis. 
            Focus on the intersection of correlations, macro pressures, and volatility.
            Conclude with a specific directional bias for NAS100 and XAUUSD.
            Return ONLY the string text, max 3 paragraphs.
            """

            if gemini_pro:
                response = await asyncio.to_thread(gemini_pro.generate_content, context_blob)
                synthesis = response.text
            else:
                synthesis = (
                    "Quant-only Pulse: Gemini non configurato. "
                    f"Vol regime {vix_data.get('level')} | corr SPX/NAS {nexus.get('spx_nas')}."
                )
            
            pulse = GlobalPulse(
                volatility_regime="Risk-On" if vix_data.get('level', 20) < 18 else "Risk-Off",
                correlation_spx_nas=nexus.get("spx_nas", 0.0),
                assets_analysis=assets_state,
                synthetic_bias=synthesis,
                drivers=["VIX Trend", "Yield Curve", "Correlation Breakout" if nexus.get('spx_nas', 1) < 0.7 else "Index Synchrony"]
            )
            
            await db.global_pulse.insert_one(pulse.model_dump())
            
            # Extract and archive individual AssetCards for Phase 3 (Forensics)
            for sym, data in assets_state.items():
                archived_card = ArchivedAssetCard(
                    asset=sym,
                    direction=data.get("direction", "NEUTRAL"),
                    probability=data.get("confidence", 50.0), # Assuming MultiSourceEngine outputs confidence or probability
                    impulse=data.get("impulse", "UNKNOWN"),
                    drivers=[d.get("name", str(d)) if isinstance(d, dict) else str(d) for d in data.get("drivers", [])][:3], # Flatten drivers if dict
                    invalidation_level=str(data.get("invalidation", "N/A")),
                    scores=data.get("scores", {}),
                    price=data.get("price")
                )
                await db.archived_asset_cards.insert_one(archived_card.model_dump())
                archive_event("asset_cards", archived_card.model_dump(), metadata={"source": "global_pulse"})

            archive_event("global_pulse", pulse.model_dump())
            
            logger.info("✅ Global Pulse Generated and Saved. AssetCards Archived.")
            
            # --- Dynamic Frequency Scaling (Adaptive Heartbeat) ---
            # If VIX is high or correlation broken, analyze more frequently
            vol = vix_data.get('level', 20)
            correl = nexus.get("spx_nas", 1.0)
            
            next_interval_minutes = 60 # Default low volatility
            
            if vol > 25 or correl < 0.5:
                next_interval_minutes = 15
            elif vol > 18 or correl < 0.75:
                next_interval_minutes = 30
                
            scheduler.reschedule_job("global_pulse_manager", trigger=IntervalTrigger(minutes=next_interval_minutes))
            logger.info(f"⏱️ Adaptive Heartbeat adjusted to {next_interval_minutes} minutes.")

            return {"status": "ok", "assets": list(assets_state.keys())}
        except Exception as e:
            logger.error(f"Global Pulse Engine Error: {e}")
            archive_event("collection_errors", {"job": "global_pulse", "error": str(e)})

    async def global_pulse_manager():
        logger.info("❤️ [HEARTBEAT] Triggering Global Pulse generation...")
        await generate_global_pulse()
        
    # Run once on startup
    asyncio.get_event_loop().create_task(generate_global_pulse())
        
    scheduler.add_job(
        global_pulse_manager, 
        IntervalTrigger(minutes=60), # Base check every 60 minutes
        id="global_pulse_manager",
        replace_existing=True
    )

    from forensics import fetch_historical_candles_for_evaluation
    from institutional_scraper import run_institutional_ingestion
    from forensics_v2 import run_matrix_evaluations
    from summary_forensics import save_market_summary_snapshot, run_end_session_summary_analysis
    from session_forensics import run_daily_session_cycle, run_recent_session_backfill

    async def guarded_forensics_evaluator():
        allowed, reason = can_collect_now()
        if not allowed:
            archive_event("collection_skips", {"job": "forensics_evaluator", "reason": reason})
            return {"status": "skipped", "reason": reason}
        result = await fetch_historical_candles_for_evaluation()
        archive_event("forensics_evaluator", {"result": result})
        return result

    async def guarded_institutional_ingestion():
        allowed, reason = can_collect_now()
        if not allowed:
            archive_event("collection_skips", {"job": "institutional_ingestion", "reason": reason})
            return {"status": "skipped", "reason": reason}
        result = await run_institutional_ingestion()
        archive_event("institutional_ingestion", {"result": result})
        return result

    async def guarded_matrix_evaluations():
        allowed, reason = can_collect_now()
        if not allowed:
            archive_event("collection_skips", {"job": "forensics_matrix_daemon", "reason": reason})
            return {"status": "skipped", "reason": reason}
        result = await run_matrix_evaluations()
        archive_event("matrix_evaluations", {"result": result})
        return result

    async def guarded_summary_capture():
        allowed, reason = can_collect_now()
        if not allowed:
            archive_event("collection_skips", {"job": "summary_capture_5m", "reason": reason})
            return {"status": "skipped", "reason": reason}
        result = await save_market_summary_snapshot(db)
        archive_event("summary_capture", {"result": result})
        return result

    async def telemetry_snapshot_collector():
        allowed, reason = can_collect_now()
        if not allowed:
            archive_event("collection_skips", {"job": "telemetry_snapshot_5m", "reason": reason})
            return {"status": "skipped", "reason": reason}

        deep_report = {}
        try:
            from deep_research_30 import build_deep_research_report
            deep_report = build_deep_research_report()
        except Exception as exc:
            archive_event("collection_errors", {"job": "telemetry_snapshot_5m.deep_research", "error": str(exc)})

        payload = {
            "ts_utc": datetime.now(timezone.utc).isoformat(),
            "collection_status": collection_status_payload(),
            "market_prices": await get_market_prices(),
            "market_breadth": await get_market_breadth(),
            "risk_analysis": await get_risk_analysis(),
            "multi_source": await get_multi_source_analysis(),
            "deep_research": deep_report,
        }
        archive_event("telemetry_snapshots", payload)
        try:
            await db.telemetry_snapshots.insert_one(payload)
        except Exception as exc:
            archive_event("collection_errors", {"job": "telemetry_snapshot_5m.mongo", "error": str(exc)})
        return {"status": "ok"}

    async def data_lake_maintenance_job():
        try:
            result = await asyncio.to_thread(run_maintenance)
            archive_event("system_events", {"event": "data_lake_maintenance", "result": result})
            return result
        except Exception as exc:
            archive_event("collection_errors", {"job": "data_lake_maintenance", "error": str(exc)})
            return {"status": "error", "error": str(exc)}

    async def session_daily_cycle_job():
        try:
            result = await asyncio.to_thread(run_daily_session_cycle)
            archive_event("session_daily_cycle", {"result": result})
            return result
        except Exception as exc:
            archive_event("collection_errors", {"job": "session_daily_cycle", "error": str(exc)})
            return {"status": "error", "error": str(exc)}

    scheduler.add_job(
        guarded_forensics_evaluator,
        IntervalTrigger(hours=1), # Evaluate past predictions every hour
        id="forensics_evaluator",
        replace_existing=True
    )
    
    scheduler.add_job(
        guarded_institutional_ingestion,
        IntervalTrigger(hours=24), # Scrape Institutional PDFs Daily
        id="institutional_ingestion",
        replace_existing=True
    )

    scheduler.add_job(
        telemetry_snapshot_collector,
        IntervalTrigger(minutes=5),
        id="telemetry_snapshot_5m",
        replace_existing=True
    )

    # Kick matrix engine on startup so new snapshots begin evaluation immediately.
    asyncio.get_event_loop().create_task(guarded_matrix_evaluations())
    # Kick summary capture on startup so first snapshot is available immediately.
    asyncio.get_event_loop().create_task(guarded_summary_capture())
    # Kick telemetry collector once on startup.
    asyncio.get_event_loop().create_task(telemetry_snapshot_collector())
    # Kick sessions engine on startup with short backfill to recover missed days after downtime.
    asyncio.get_event_loop().create_task(asyncio.to_thread(run_recent_session_backfill, 3))
    scheduler.add_job(
        guarded_matrix_evaluations,
        IntervalTrigger(minutes=5), # Run Matrix daemon continuously (24/7)
        id="forensics_matrix_daemon",
        replace_existing=True
    )
    scheduler.add_job(
        guarded_summary_capture,
        IntervalTrigger(minutes=5), # Save summary + latest 5m candle every 5 minutes
        id="summary_capture_5m",
        replace_existing=True
    )
    scheduler.add_job(
        run_end_session_summary_analysis,
        CronTrigger(hour=23, minute=59, timezone="Europe/Rome"), # Analyze daily after session close (Italy time)
        id="summary_end_session_analysis",
        replace_existing=True
    )
    scheduler.add_job(
        data_lake_maintenance_job,
        IntervalTrigger(minutes=30),
        id="data_lake_maintenance",
        replace_existing=True
    )
    scheduler.add_job(
        session_daily_cycle_job,
        CronTrigger(hour=22, minute=10, timezone="Europe/Rome"),
        id="session_daily_cycle",
        replace_existing=True
    )

# --- SENTINEL MONITORING ---
@api_router.get("/system/status")
async def system_status(current_user: str = Depends(get_current_user)):
    jobs = []
    for job in scheduler.get_jobs():
        jobs.append({
            "id": job.id,
            "next_run_time": job.next_run_time.isoformat() if job.next_run_time else "Paused"
        })
    return {
        "scheduler_running": scheduler.running,
        "jobs": jobs,
        "collection_control": collection_status_payload(),
        "data_lake": lake_status(),
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

@api_router.get("/system/collection/status")
async def collection_status(current_user: str = Depends(get_current_user)):
    return collection_status_payload()

@api_router.post("/system/collection/pause")
async def collection_pause(payload: CollectionControlInput = Body(default=CollectionControlInput()), current_user: dict = Depends(get_current_user)):
    reason = payload.reason or "manual_pause_request"
    state = set_manual_pause(True, reason=reason)
    archive_event("system_events", {"event": "collection_pause", "reason": reason, "by": current_user.get("email")})
    return {"status": "ok", "collection_control": state}

@api_router.post("/system/collection/resume")
async def collection_resume(payload: CollectionControlInput = Body(default=CollectionControlInput()), current_user: dict = Depends(get_current_user)):
    state = set_manual_pause(False, reason="")
    if payload.auto_pause_market_closed is not None:
        state = set_auto_pause_market_closed(bool(payload.auto_pause_market_closed))
    archive_event("system_events", {"event": "collection_resume", "by": current_user.get("email")})
    return {"status": "ok", "collection_control": state}

@api_router.post("/system/collection/auto-market")
async def collection_auto_market(payload: CollectionControlInput, current_user: dict = Depends(get_current_user)):
    if payload.auto_pause_market_closed is None:
        raise HTTPException(status_code=400, detail="auto_pause_market_closed is required")
    state = set_auto_pause_market_closed(bool(payload.auto_pause_market_closed))
    archive_event("system_events", {
        "event": "collection_auto_market",
        "enabled": bool(payload.auto_pause_market_closed),
        "by": current_user.get("email"),
    })
    return {"status": "ok", "collection_control": state}

@api_router.get("/system/data-integrity")
async def system_data_integrity(current_user: str = Depends(get_current_user)):
    files = {
        "matrix_predictions": ROOT_DIR / "data_matrix" / "predictions_v2.json",
        "matrix_evaluations": ROOT_DIR / "data_matrix" / "evaluations_v2.json",
        "summaries_5m": ROOT_DIR / "data_summaries" / "summaries_5m.json",
        "vault_reports": ROOT_DIR / "data" / "vault.json",
        "vault_reports_history": ROOT_DIR / "data" / "vault_history.json",
        "session_daily_rows": ROOT_DIR / "data_sessions" / "session_daily_rows.json",
        "session_daily_reports": ROOT_DIR / "data_sessions" / "session_reports.json",
        "session_ksh_history": ROOT_DIR / "data_sessions" / "ksh_history.json",
        "svp_live_feed": ROOT_DIR / "data" / "svp_live_feed.json",
        "tv_screenshots_index": ROOT_DIR / "data" / "tv_screenshots_index.json",
    }
    file_stats = {}
    for name, path in files.items():
        row_count = 0
        exists = path.exists()
        modified = None
        size = 0
        if exists:
            try:
                payload = json.loads(path.read_text(encoding="utf-8"))
                if isinstance(payload, list):
                    row_count = len(payload)
            except Exception:
                row_count = -1
            st = path.stat()
            size = int(st.st_size)
            modified = datetime.fromtimestamp(st.st_mtime, timezone.utc).isoformat()
        file_stats[name] = {
            "exists": exists,
            "rows": row_count,
            "size_bytes": size,
            "modified_at_utc": modified,
        }

    mongo_stats = {}
    try:
        mongo_stats = {
            "global_pulse": await db.global_pulse.count_documents({}),
            "archived_asset_cards": await db.archived_asset_cards.count_documents({}),
            "telemetry_snapshots": await db.telemetry_snapshots.count_documents({}),
        }
    except Exception as exc:
        mongo_stats = {"error": str(exc)}

    return {
        "status": "ok",
        "collection_control": collection_status_payload(),
        "scheduler_running": scheduler.running,
        "jobs_count": len(scheduler.get_jobs()),
        "mongo": mongo_stats,
        "files": file_stats,
        "data_lake": lake_status(),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@api_router.post("/system/storage/maintenance")
async def trigger_storage_maintenance(current_user: dict = Depends(get_current_user)):
    result = await asyncio.to_thread(run_maintenance)
    archive_event("system_events", {"event": "manual_storage_maintenance", "by": current_user.get("email"), "result": result})
    return {
        "status": "ok",
        "maintenance": result,
        "data_lake": lake_status(),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

@api_router.post("/system/restart-heartbeat")
async def restart_heartbeat(current_user: str = Depends(get_current_user)):
    try:
        job = scheduler.get_job("global_pulse_manager")
        if job:
            job.modify(next_run_time=datetime.now(timezone.utc))
            return {"status": "success", "message": "Heartbeat (Double-Clutch) forced to run immediately."}
        else:
            raise HTTPException(status_code=404, detail="Heartbeat job not found. Scheduler might be dead.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- PULSE ENDPOINT ---
@api_router.get("/pulse/global", response_model=GlobalPulse)
async def get_global_pulse():
    """Returns the latest Global Pulse state for all frontend clients."""
    latest = await db.global_pulse.find_one(sort=[("timestamp", -1)])
    if not latest:
        raise HTTPException(status_code=404, detail="Pulse rarely starting up or not found")
        
    return latest

async def analyze_pdf_content(text: str, filename: str):
    """Core logic to analyze PDF text via Gemini 1.5 Pro."""
    if db is not None:
        latest_pulse = await db.global_pulse.find_one(sort=[("timestamp", -1)])
        if latest_pulse:
            pulse_data = f"Vol Regime: {latest_pulse.get('volatility_regime')}, Correl SPX/NAS: {latest_pulse.get('correlation_spx_nas')}, Bias: {latest_pulse.get('synthetic_bias')}"
        
    prompt = f"""
    You are an elite quantitative researcher for Karion Trading OS.
    Analyze the following institutional document (e.g., Fed Minutes, Bank Report).
    Extract the core macroeconomic bias, projected interest rate paths, and sentiment on risk assets.
    
    Current Karion Market Pulse state:
    {pulse_data}
    
    Document Text (Excerpt):
    {text[:50000]} # Limit to 50k chars for safety, though Gemini Pro handles 1M+ tokens
    
    Output a JSON object with strictly these keys:
    - "title": a generated short title
    - "summary": 2-3 sentences max
    - "bias": "BULLISH", "BEARISH", or "NEUTRAL"
    - "affected_assets": list of strings (e.g., ["NAS100", "XAUUSD"])
    - "cross_correlation": How this document aligns or conflicts with the current Karion Market Pulse.
    """
    
    response = await asyncio.to_thread(gemini_pro.generate_content, prompt)
    
    import json
    import re
    
    result_text = response.text
    json_match = re.search(r'```(?:json)?\s*(.*?)\s*```', result_text, re.DOTALL)
    if json_match:
        result_text = json_match.group(1)
        
    try:
        analysis = json.loads(result_text)
    except:
        analysis = {
            "title": f"Analysis of {filename}",
            "summary": result_text[:500] + "...",
            "bias": "UNKNOWN",
            "affected_assets": [],
            "cross_correlation": "Parse error. See summary."
        }
    return analysis

# --- PHASE 5: DEEP-DOC INGESTION ---
@api_router.post("/research/ingest")
async def ingest_institutional_document(file: UploadFile = File(...), current_user: str = Depends(get_current_user)):
    if not gemini_pro:
        raise HTTPException(status_code=500, detail="Gemini Pro is not configured.")
        
    try:
        contents = await file.read()
        
        # Parse PDF
        pdf_reader = PdfReader(io.BytesIO(contents))
        text = ""
        for page in pdf_reader.pages:
            text += page.extract_text() + "\n"
            
        if not text.strip():
            raise HTTPException(status_code=400, detail="Could not extract text from document.")
            
        # Call the new standalone analyzer
        analysis = await analyze_pdf_content(text, file.filename)
        
        # Save to Vault
        doc = {
            "filename": file.filename,
            "upload_timestamp": datetime.now(timezone.utc).isoformat(),
            "uploaded_by": current_user["email"],
            "analysis": analysis
        }

        await db.institutional_vault.insert_one(doc)

        return {"status": "success", "data": analysis}

    except Exception as e:
        logger.error(f"Error ingesting document: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/research/matrix-snapshot")
async def save_matrix_snapshot(payload: dict = Body(...), current_user: str = Depends(get_current_user)):
    """
    Forensics 2.0 (The Matrix):
    Saves a multidimensional context snapshot for time-decay and MFE/MAE analysis.
    """
    try:
        allowed, reason = can_collect_now()
        if not allowed:
            archive_event("collection_skips", {"job": "matrix_snapshot", "reason": reason, "asset": payload.get("asset")})
            return {"success": False, "status": "paused", "reason": reason}

        if not payload.get("asset") or not payload.get("context"):
            raise HTTPException(status_code=400, detail="Missing asset or context data")
            
        snapshot_id = local_vault_matrix.save_matrix_snapshot(payload)
        archive_event("matrix_snapshots", {"snapshot_id": snapshot_id, "payload": payload})
        return {"success": True, "snapshot_id": snapshot_id}
    except Exception as e:
        logger.error(f"Error saving matrix snapshot: {e}")
        archive_event("collection_errors", {"job": "matrix_snapshot", "error": str(e)})
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/research/matrix")
async def get_matrix_evaluations(current_user: str = Depends(get_current_user)):
    """Get the calculated MFE/MAE multi-dimensional matrix pipeline results."""
    import local_vault_matrix
    try:
        data = local_vault_matrix.get_matrix_results()
        return data
    except Exception as e:
        logger.error(f"Error fetching matrix results: {e}")
        return []

@api_router.get("/research/deep-research")
async def get_deep_research(current_user: str = Depends(get_current_user)):
    """Deep Research 3.0 statistical stack (signals, diversification, risk, temporal bias)."""
    try:
        from deep_research_30 import build_deep_research_report
        return build_deep_research_report()
    except Exception as e:
        logger.error(f"Error fetching Deep Research 3.0 payload: {e}")
        return {
            "status": "error",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "message": str(e),
            "signals": [],
            "diversification": [],
            "risk_exposure": {},
            "weekly_bias": [],
            "monthly_bias": [],
            "summary": [],
        }


def _research_smart_money_fallback(message: str) -> Dict[str, Any]:
    now_iso = datetime.now(timezone.utc).isoformat()
    return {
        "status": "error",
        "generated_at": now_iso,
        "summary": {
            "global_score": 0.0,
            "aggressive_score": 0.0,
            "conservative_score": 0.0,
            "barbell_score": 0.0,
            "state": "NO_CLEAR_CLUSTER",
            "top_theme": None,
            "top_theme_score": 0.0,
            "macro_regime": "MIXED",
            "active_cross_asset_flags": 0,
            "uoa_events": 0,
            "message": "Institutional Radar Positioning non disponibile.",
        },
        "macro_filter": {"regime": "MIXED", "growth_proxy": "NEUTRAL", "inflation_proxy": "NEUTRAL", "liquidity_tone": "TRANSITION"},
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
            "calendar_playbook": {"generated_at": now_iso, "today": [], "week": [], "month": [], "summary": {}},
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
        "data_coverage": {"history_period": "10y", "history_tickers_loaded": 0, "options_tickers_scanned": 0, "warnings": [message]},
        "methodology": {"layers": [], "composite_formula": "degraded", "thresholds": {}, "scope": "Narrative positioning map only. No execution signals."},
        "cache": {"hit": False, "age_seconds": 0, "ttl_seconds": 0},
    }


@api_router.get("/research/smart-money")
async def get_research_smart_money(current_user: str = Depends(get_current_user)):
    """Institutional Radar Positioning (UOA + sector rotation + cross-asset + macro filter)."""
    _ = current_user
    try:
        from smart_money_positioning import build_smart_money_positioning

        try:
            from deep_research_30 import build_deep_research_report

            deep_report = build_deep_research_report()
        except Exception as exc:
            logger.warning(f"Deep research context unavailable for smart-money: {exc}")
            deep_report = {"signals": [], "risk_exposure": {}}

        try:
            multi_snapshot = await get_multi_source_analysis()
        except Exception as exc:
            logger.warning(f"Multi-source snapshot unavailable for smart-money: {exc}")
            multi_snapshot = {}

        try:
            projections_payload = await get_strategy_projections(strategy_ids=None, current_user=current_user)
            projections = projections_payload.get("projections", []) if isinstance(projections_payload, dict) else []
        except Exception as exc:
            logger.warning(f"Strategy projections unavailable for smart-money: {exc}")
            projections = []

        return await asyncio.to_thread(
            build_smart_money_positioning,
            deep_report if isinstance(deep_report, dict) else {},
            multi_snapshot if isinstance(multi_snapshot, dict) else {},
            projections if isinstance(projections, list) else [],
        )
    except Exception as e:
        logger.error(f"Error fetching smart money payload: {e}")
        return _research_smart_money_fallback(str(e))


@api_router.get("/research/sessions")
async def get_research_sessions(current_user: str = Depends(get_current_user)):
    """SESSIONI payload for Research > Mappa Retroattiva sub-tab."""
    try:
        from session_forensics import get_latest_session_report
        return await asyncio.to_thread(get_latest_session_report)
    except Exception as e:
        logger.error(f"Error fetching SESSIONI payload: {e}")
        return {
            "status": "error",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "message": str(e),
            "daily_report": {"rows": [], "summary": {}},
            "auto_analysis": {"insights": [], "weight_updates": []},
            "correlation_matrix": {"primary": [], "extra": []},
            "matrices": {"scenario_weekday": {"days": [], "rows": []}, "bias_asset": {"assets": [], "rows": []}},
            "health_score": {"value": 0.0, "status": "error", "components": {}, "sparkline": []},
            "weights": {"weights": {}},
        }


@api_router.get("/research/sessions/history")
async def get_research_sessions_history(
    limit: int = 30,
    current_user: str = Depends(get_current_user),
):
    """Last SESSIONI reports, latest-first."""
    try:
        from session_forensics import get_session_report_history
        safe_limit = max(1, min(int(limit or 30), 365))
        rows = await asyncio.to_thread(get_session_report_history, safe_limit)
        return {"count": len(rows), "limit": safe_limit, "items": rows}
    except Exception as e:
        logger.error(f"Error fetching SESSIONI history: {e}")
        return {"count": 0, "limit": limit, "items": [], "status": "error", "message": str(e)}


@api_router.post("/research/sessions/run")
async def run_research_sessions_cycle(
    payload: SessionRunInput = Body(default=SessionRunInput()),
    current_user: str = Depends(get_current_user),
):
    """Manual trigger for SESSIONI daily cycle."""
    try:
        from session_forensics import run_daily_session_cycle
        target_day = payload.day.strip() if payload.day else None
        if target_day:
            # format validation
            datetime.fromisoformat(target_day)
        result = await asyncio.to_thread(run_daily_session_cycle, target_day)
        archive_event(
            "session_daily_cycle",
            {"trigger": "manual", "day": target_day, "by": current_user.get("email"), "status": result.get("status")},
        )
        return {"status": "ok", "result": result}
    except Exception as e:
        archive_event("collection_errors", {"job": "session_daily_cycle.manual", "error": str(e)})
        logger.error(f"Error running SESSIONI cycle: {e}")
        return {"status": "error", "message": str(e)}

@api_router.get("/research/vault")
async def get_institutional_vault(current_user: str = Depends(get_current_user)):
    """Get real scraped institutional reports from local storage."""
    import local_vault
    docs = local_vault.get_reports()
    if not docs:
        # Return empty list — frontend will show "no data" state
        return []
    return docs


@api_router.get("/research/vault/history")
async def get_institutional_vault_history(
    limit: int = 500,
    bank: Optional[str] = None,
    current_user: str = Depends(get_current_user),
):
    """Get historical institutional reports (latest-first, immutable archive)."""
    import local_vault

    safe_limit = max(1, min(int(limit or 500), 5000))
    items = local_vault.get_reports_history(limit=safe_limit, bank=bank)
    return {
        "count": len(items),
        "limit": safe_limit,
        "bank": bank,
        "items": items,
    }


def _bias_sign(value: str) -> int:
    v = str(value or "").upper()
    if "BULL" in v or "RISK_ON" in v or "DOVISH" in v:
        return 1
    if "BEAR" in v or "RISK_OFF" in v or "HAWKISH" in v:
        return -1
    return 0


def _iso_to_epoch(value: str) -> float:
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).timestamp()
    except Exception:
        return 0.0


def _normalize_asset(raw: str) -> str:
    value = str(raw or "").upper().strip()
    aliases = {
        "SPX": "SP500",
        "SPX500": "SP500",
        "S&P500": "SP500",
        "S&P 500": "SP500",
        "NQ": "NAS100",
        "NASDAQ": "NAS100",
        "NASDAQ100": "NAS100",
        "XAU": "XAUUSD",
        "GOLD": "XAUUSD",
        "EUR/USD": "EURUSD",
    }
    return aliases.get(value, value)


def _evaluation_direction_sign(row: Dict[str, Any]) -> int:
    direction = str(row.get("direction", "")).upper()
    if "UP" in direction or "LONG" in direction:
        return 1
    if "DOWN" in direction or "SHORT" in direction:
        return -1

    votes = 0
    ctx = row.get("context", {}) or {}
    for key in ("cot_bias", "options_bias", "macro_sentiment", "news_bias", "risk_bias", "technical_bias", "screening_bias"):
        votes += _bias_sign(ctx.get(key, ""))
    return 1 if votes > 0 else -1 if votes < 0 else 0


@api_router.get("/research/correlations/report-bias")
async def get_report_bias_correlations(
    window_hours: int = 72,
    history_limit: int = 500,
    current_user: str = Depends(get_current_user),
):
    """
    Quant check that validates correlations between institutional report bias
    and subsequent matrix outcomes over a configurable forward window.
    """
    import local_vault
    import local_vault_matrix

    safe_window_hours = max(1, min(int(window_hours or 72), 240))
    safe_history_limit = max(20, min(int(history_limit or 500), 5000))

    reports = local_vault.get_reports_history(limit=safe_history_limit)
    evaluations = local_vault_matrix.get_matrix_evaluations()
    if not reports or not evaluations:
        return {
            "status": "collecting",
            "window_hours": safe_window_hours,
            "reports_considered": len(reports),
            "evaluations_considered": len(evaluations),
            "matches": [],
            "global": {},
        }

    eval_by_asset: Dict[str, List[Dict[str, Any]]] = {}
    for row in evaluations:
        ts = _iso_to_epoch(row.get("evaluated_at"))
        asset = _normalize_asset(row.get("asset", ""))
        if ts <= 0 or not asset:
            continue
        hit = bool(row.get("hit", False))
        mfe = float(row.get("mfe_pips", 0.0) or 0.0)
        mae = float(row.get("mae_pips", 0.0) or 0.0)
        direction_sign = _evaluation_direction_sign(row)
        eval_by_asset.setdefault(asset, []).append(
            {
                "ts": ts,
                "hit": hit,
                "outcome": (mfe if hit else -mae),
                "direction_sign": direction_sign,
            }
        )

    for rows in eval_by_asset.values():
        rows.sort(key=lambda item: item["ts"])

    tracked_assets = ["NAS100", "SP500", "XAUUSD", "EURUSD"]
    matches = []
    global_samples = 0
    global_hits = 0
    global_align = 0
    global_outcome = 0.0

    for report in reports:
        report_ts = _iso_to_epoch(report.get("upload_timestamp"))
        if report_ts <= 0:
            continue
        bias = str((report.get("analysis") or {}).get("bias", "NEUTRAL")).upper()
        bias_sign = _bias_sign(bias)
        if bias_sign == 0:
            continue
        affected = (report.get("analysis") or {}).get("affected_assets") or []
        assets = [_normalize_asset(a) for a in affected if _normalize_asset(a) in tracked_assets]
        if not assets or "GENERAL MARKET" in [_normalize_asset(a) for a in affected]:
            assets = tracked_assets

        end_ts = report_ts + (safe_window_hours * 3600)
        sample = 0
        hits = 0
        aligned = 0
        outcome_sum = 0.0
        per_asset = {}

        for asset in assets:
            rows = eval_by_asset.get(asset, [])
            if not rows:
                continue
            local_n = 0
            local_hits = 0
            local_align = 0
            local_outcome = 0.0
            for item in rows:
                if item["ts"] < report_ts:
                    continue
                if item["ts"] > end_ts:
                    break
                local_n += 1
                local_hits += 1 if item["hit"] else 0
                local_outcome += float(item["outcome"])
                if item["direction_sign"] != 0 and item["direction_sign"] == bias_sign:
                    local_align += 1
            if local_n == 0:
                continue
            sample += local_n
            hits += local_hits
            aligned += local_align
            outcome_sum += local_outcome
            per_asset[asset] = {
                "samples": local_n,
                "hit_rate_pct": round((local_hits / local_n) * 100.0, 2),
                "alignment_rate_pct": round((local_align / local_n) * 100.0, 2),
                "avg_outcome": round(local_outcome / local_n, 4),
            }

        if sample == 0:
            continue

        global_samples += sample
        global_hits += hits
        global_align += aligned
        global_outcome += outcome_sum

        matches.append(
            {
                "bank": report.get("bank"),
                "title": report.get("title"),
                "report_id": report.get("report_id"),
                "bias": bias,
                "assets": assets,
                "report_ts": report.get("upload_timestamp"),
                "window_hours": safe_window_hours,
                "samples": sample,
                "hit_rate_pct": round((hits / sample) * 100.0, 2),
                "alignment_rate_pct": round((aligned / sample) * 100.0, 2),
                "avg_outcome": round(outcome_sum / sample, 4),
                "per_asset": per_asset,
            }
        )

    matches.sort(
        key=lambda row: (
            row.get("alignment_rate_pct", 0.0),
            row.get("hit_rate_pct", 0.0),
            row.get("samples", 0),
        ),
        reverse=True,
    )

    return {
        "status": "ok",
        "window_hours": safe_window_hours,
        "reports_considered": len(reports),
        "evaluations_considered": len(evaluations),
        "matched_reports": len(matches),
        "global": {
            "samples": global_samples,
            "hit_rate_pct": round((global_hits / global_samples) * 100.0, 2) if global_samples else 0.0,
            "alignment_rate_pct": round((global_align / global_samples) * 100.0, 2) if global_samples else 0.0,
            "avg_outcome": round((global_outcome / global_samples), 4) if global_samples else 0.0,
        },
        "matches": matches[:200],
    }

@api_router.get("/research/accuracy")
async def get_research_accuracy(current_user: str = Depends(get_current_user)):
    """Get computed accuracy heatmap from real evaluation data."""
    import local_vault
    return local_vault.compute_accuracy_heatmap()

@api_router.get("/research/stats")
async def get_research_stats(current_user: str = Depends(get_current_user)):
    """Get real win rate and statistics from evaluations."""
    import local_vault
    return local_vault.compute_stats()

@api_router.get("/research/sources")
async def get_research_sources(current_user: str = Depends(get_current_user)):
    """Get real-time status of all scraper sources."""
    from institutional_scraper import get_sources_status
    return get_sources_status()

@api_router.post("/research/trigger")
async def trigger_institutional_scraper(current_user: str = Depends(get_current_user)):
    """Manually trigger the institutional scraper pipeline."""
    from institutional_scraper import run_institutional_ingestion
    try:
        allowed, reason = can_collect_now()
        if not allowed:
            return {"status": "skipped", "reason": reason}
        result = await run_institutional_ingestion()
        archive_event("institutional_ingestion", {"result": result, "trigger": "manual"})
        return {"status": "ok", **result}
    except Exception as e:
        archive_event("collection_errors", {"job": "research_trigger_ingestion", "error": str(e)})
        return {"status": "error", "message": str(e)}

@api_router.post("/research/save-prediction")
async def save_current_prediction(current_user: str = Depends(get_current_user)):
    """Capture current predictions for later retroactive evaluation."""
    from forensics import save_current_predictions
    try:
        allowed, reason = can_collect_now()
        if not allowed:
            return {"status": "skipped", "reason": reason}
        await save_current_predictions()
        archive_event("predictions_capture", {"status": "ok", "trigger": "manual"})
        return {"status": "ok", "message": "Predictions saved for evaluation"}
    except Exception as e:
        archive_event("collection_errors", {"job": "save_current_prediction", "error": str(e)})
        return {"status": "error", "message": str(e)}


@app.on_event("shutdown")
async def shutdown_db_client():
    if client:
        client.close()
    scheduler.shutdown()

# ==================== FINAL REGISTRATION ====================
from crypto_service import crypto_router
api_router.include_router(crypto_router)
app.include_router(api_router)

if __name__ == "__main__":
    import uvicorn
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "8000"))
    print("🚀 Starting Karion Trading OS Backend...")
    print("📊 Mode: PRODUCTION (MongoDB)")
    print(f"🌐 Server running at http://{host}:{port}")
    uvicorn.run(app, host=host, port=port)
