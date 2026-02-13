# KARION - Trading Dashboard PRD

## Overview
Karion è un dashboard di trading AI-powered che fornisce analisi multi-sorgente, gestione del rischio basata su VIX, analisi COT e simulazioni Monte Carlo.

## Core Requirements

### 1. UI/UX
- ✅ Theme dark minimalista nero/verde con gradiente primary
- ✅ Branding "KARION" in tutto il sito (login, header, sidebar)
- ✅ **NEW** Logo SVG "KARION" nel header con sfumatura oro/grigio e ombra grigio fumé
- ✅ Sidebar di navigazione con tutte le pagine
- ✅ Tab fisse che non si espandono con i prezzi
- ✅ Responsive design per desktop e mobile

### 2. Pages Implemented

#### Home (Dashboard)
- ✅ Motore multi-sorgente AI con aggiornamento orario
- ✅ 4 card per XAUUSD, NAS100, SP500, EURUSD
- ✅ Direzione, P(up), Confidence, Impulso per ogni asset
- ✅ Barra VIX/Regime in tempo reale
- ✅ Tab interattive con modal dettagli al click
- ✅ Quick links a altre sezioni

#### Risk Assessment
- ✅ Risk Score (0-100) basato su 4 componenti:
  - VIX Level
  - VIX Momentum  
  - Event Risk
  - Market Stretch
- ✅ Dati VIX REALI da Yahoo Finance
- ✅ Asset tilts per regime

#### COT (Commitment of Traders)
- ✅ Analisi posizionamento "mani forti"
- ✅ Report TFF per indici/forex, Disaggregated per Gold
- ✅ Metriche: Bias, Confidence, Crowding, Squeeze Risk
- ✅ Dettaglio categorie (Asset Manager, Leveraged, Managed Money, etc.)
- ✅ Countdown al prossimo release CFTC

#### Report/Strategy
- ✅ Segnali giornalieri (max 2 per asset)
- ✅ Segnali persistenti per la giornata
- ✅ Aggiornamento prezzi senza rimuovere segnali
- ✅ Entry, Stop, TP con motivazioni

#### Monte Carlo
- ✅ Simulazione 10.000 scenari
- ✅ Input manuale percentuali (0.01% - 10%)
- ✅ Animazione dadi durante caricamento
- ✅ Metriche: Media, Mediana, Max DD, Expectancy, Profit Factor, Kelly
- ✅ Equity curve visualization

#### Karion AI (AI Central)
- ✅ Branding Karion AI con logo
- ✅ Chat AI con GPT-5.2 via Emergent LLM Key
- ✅ Quick actions: Coach, Risk, Psicologia, Strategia, Journal, Stats
- ✅ Tasto "Analisi Intima" per feedback personalizzato
- ✅ Testo senza link e font consistente

#### News
- ✅ Widget TradingView Economic Calendar

#### Statistics
- ✅ Upload PDF MT5
- ✅ Analisi AI dei report

#### Psychology EOD (Shark Mind Engine) - UPDATED 2026-01-23
- ✅ **NEW** Shark Mind Engine - Sistema di progressione psicologica
- ✅ Form EOD con metriche psico-fisiche (Stress, Focus, Energia, Tensione Fisica)
- ✅ Urge to Trade tracking (0-10)
- ✅ Comportamenti: Shutdown Ritual, Limiti, Pause, Reset Mindful
- ✅ Trigger Attivi: FOMO, REVENGE, CHASING, BOREDOM, OVERCONFIDENCE, FEAR, AVOIDANCE
- ✅ Scoring System: Shark Score, Discipline, Clarity, Emotional Stability, Compulsion Risk
- ✅ Pattern Detection: Tilt Risk, Overtrading, FOMO Loop, Self Deception, Avoidance
- ✅ Tomorrow Protocol con Micro-Rules IF/THEN
- ✅ Guardrails: TILT_LOCK, OVERTRADING_LOCK, A_PLUS_ONLY, NORMAL modes
- ✅ Progression Engine: ACQUISITION → MAINTENANCE → MAINTENANCE_PLUS
- ✅ Grace Tokens per fase permissiva
- ✅ Readiness tracking per promozione automatica

#### Journal
- ✅ Check-in giornaliero
- ✅ Tracking confidence/stress/sleep
- ✅ Journal entries

### 3. Backend APIs

| Endpoint | Descrizione | Stato |
|----------|-------------|-------|
| `/api/auth/*` | Autenticazione | ✅ Working |
| `/api/market/vix` | Dati VIX reali | ✅ Yahoo Finance |
| `/api/market/prices` | Prezzi mercato | ✅ Yahoo Finance |
| `/api/analysis/multi-source` | Analisi multi-sorgente | ✅ Working |
| `/api/cot/data` | Dati COT | ✅ Simulated |
| `/api/risk/analysis` | Risk assessment | ✅ Working |
| `/api/montecarlo/simulate` | Simulazione MC | ✅ 10k scenarios |
| `/api/ai/chat` | Chat Karion AI | ✅ GPT-5.2 |
| `/api/ai/intimate-analysis` | Analisi intima | ✅ Working |

### 4. Integrations
- ✅ Yahoo Finance (yfinance) - VIX e prezzi reali
- ✅ Emergent LLM Key - GPT-5.2 per AI features
- ✅ TradingView Widget - Economic Calendar
- ✅ MongoDB - Database

## Data Sources
- **VIX**: REAL - Yahoo Finance (^VIX)
- **Market Prices**: REAL - Yahoo Finance (GC=F, NQ=F, ES=F, EURUSD=X)
- **COT Data**: SIMULATED - Struttura realistica ma non da CFTC
- **Multi-Source Drivers**: PARTIALLY SIMULATED - VIX reale, altri simulati

## Test Credentials
- Email: test@test.com
- Password: password123

## Technology Stack
- **Frontend**: React, TailwindCSS, Shadcn/UI, Framer Motion, Recharts
- **Backend**: FastAPI (Python)
- **Database**: MongoDB
- **AI**: Emergent LLM Key (GPT-5.2)
- **Market Data**: yfinance

## Upcoming Tasks
1. P1: Pagina Options Flow
2. P1: Integrazione TradingView account personale
3. P2: Community Page (feed social)
4. P2: Gamification (Ascension Tracker)
5. P3: Dati COT reali dalla CFTC API

## Last Updated
January 23, 2026
