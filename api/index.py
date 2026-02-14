"""
Vercel Serverless Function Entry Point
Lightweight API handler for auth, profile, and basic operations.
Heavy operations (engine, AI, market data) run on the local/dedicated backend.
"""
from fastapi import FastAPI, APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import Optional
import os
import uuid
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta

# Load env
from dotenv import load_dotenv
from pathlib import Path
load_dotenv(Path(__file__).parent.parent / 'backend' / '.env')

# ==================== CONFIG ====================
JWT_SECRET = os.environ.get('JWT_SECRET', 'tradingos-secret-key-2024')
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24

# Demo Mode
DEMO_MODE = False
demo_users = {}

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
    allow_origins=["http://localhost:3000"],
    allow_origin_regex=r"https://.*\.vercel\.app|https://.*\.karion\.it|https://www\.karion\.it",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

# Mount router
app.include_router(api_router)
