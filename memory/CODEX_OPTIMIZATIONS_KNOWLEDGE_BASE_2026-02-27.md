# Codex Optimizations Knowledge Base (From User Images)

Date: 2026-02-27  
Scope: Codex project only (do not apply to ProjectNoir until explicitly requested).

## 1) Operational Architecture (Historical + Current)

- Historical stack shown: Docker Compose with `nginx` (reverse proxy), `web` (Next.js/React), `gateway` (FastAPI + WebSocket), background workers.
- Current repo pattern includes:
  - FastAPI backend in `backend/server.py`
  - Vercel serverless API entry in `api/index.py`
  - React frontend in `frontend/`
- Legacy server automation and sync scripts are part of prior deployment workflow; Vercel deployment is now primary for web publish.

## 2) AI Integration Notes

- Gemini 1.5 Flash chosen for low latency and continuous chat response.
- Integration approach moved from unstable container SDK path to direct REST/API style orchestration.
- Agent memory behavior: keep recent conversation context (around last 20 messages) for coherent replies.
- Agent persona/tone configured per role.

## 3) Agent/Orchestration Model

- Mentioned operative agents: Nexus, Ghost, Pulse, Lock, Trace, Shadow, Noir.
- Hub-and-workers architecture:
  - Gateway/Hub routes requests to role-specific workers.
  - Workers execute prompts with system-role instructions.
  - Complex requests may be delegated to external orchestration path (n8n flow in prior setup).

## 4) UX/Mobile Stability Improvements

- Mobile scroll lock fixes:
  - `overflow-hidden` on main containers.
  - touch handlers to isolate scroll behavior in terminal/chat areas.
- Mobile layout refinements and tab/notification synchronization behavior were explicitly implemented and considered critical.

## 5) Data Persistence & Identity

- MongoDB Atlas is primary persistent storage.
- Demo/fallback mode exists for degraded backend conditions (local JSON fallback mentioned in docs).
- JWT-based authentication for session identity.
- Client-side preference persistence via `localStorage` for UI state.
- Cross-component synchronization (shared context for selected symbol/asset).

## 6) Storage and Limits Strategy

- Strategy persistence model uses quotas by user tier/level.
- Preference and UI state are lightweight and synchronized.
- Heavy historical datasets/logs are expected on VPS/disk storage, not in lightweight cloud-doc collections.

## 7) Quant/Analytics Engine Direction

- Backend is modular with data sources feeding a multi-source engine:
  - Technical/market module
  - Macro module
  - COT positioning module
  - Sentiment/news module
- Engine fuses multiple signals into directional cards and confidence outputs.

## 8) Forensics / Research Evolution

- “Forensics/Vector 2.0” concept captured:
  - Move beyond binary trade outcomes.
  - Track MFE/MAE, drawdown behavior, and time-decay windows.
  - Use context snapshots for retroactive evaluation and pattern scoring.

## 9) Infra & Cost Notes (Captured from images)

- Prior self-hosted cost profile: low-cost VPS + free/low-tier services.
- Current Codex web deployment target in this cycle: Vercel.

## 10) Important Context Guardrail

- Some image content contains legacy/parallel architecture terminology and historical stack references.
- Treat those notes as strategic context unless validated in current code paths.
- When conflict exists, current repository implementation is source of truth.
