# Karion Trading OS

## 🚀 Local Runbook (Hardened)

### 1. Start Environment
**Terminal 1 (Backend):**
```bash
source .venv/bin/activate
# Install deps if needed: pip install -r backend/requirements.txt
python backend/server.py
```

**Terminal 2 (Frontend):**
```bash
cd frontend
# Install deps if needed: npm install
npm start
```

### 2. Verify Health
Run the local doctor script to check ports and processes:
```bash
cd frontend
npm run doctor:local
```

### 3. Smoke Test
Verify authentication flow (Register -> Login -> Verify Token):
```bash
cd frontend
npm run smoke:local
```

## 🛠 Diagnostics
- **Backend Port**: 8000
- **Frontend Port**: 3000
- **Readiness Endpoint**: `http://localhost:8000/api/ready`
