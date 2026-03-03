# Integrazione SVP/TV - Standby

Data freeze: 2026-03-03 (Europe/Rome)
Stato: salvato in locale, pronto da integrare piu avanti.
Nota: nessun push/deploy eseguito.

## Componenti pronti

- Ingest live SVP da webhook:
  - `backend/svp_live_store.py`
  - endpoint in `backend/server.py`:
    - `POST /api/market/svp/live`
    - `GET /api/market/svp/live/status`
    - `GET /api/market/svp/live/{asset}`
- Upload screenshot TradingView:
  - `backend/tv_screenshot_store.py`
  - endpoint in `backend/server.py`:
    - `POST /api/market/svp/screenshot/upload`
    - `GET /api/market/svp/screenshot/status`
    - `GET /api/market/svp/screenshot/latest/{asset}`
    - `GET /api/market/svp/screenshot/feed`
- Integrazione nel contesto dashboard/card:
  - `backend/server.py` (price action context + integrity flags)
  - `frontend/src/components/pages/DashboardPage.jsx` (tail riassunto source/recency)

## Script operativi

- `scripts/tv_bootstrap_login.sh`
- `scripts/tv_capture_and_upload.sh`
- `scripts/tv_capture_daemon.sh`

## Documentazione

- `ops/local-stack/SVP_LIVE_SETUP.md`
- `ops/local-stack/PLAYBOOK.md`
- `ops/local-stack/tradingview-webhook-template.json`

## Test gia predisposti

- `backend/tests/test_svp_live_store.py`
- `backend/tests/test_tv_screenshot_store.py`

Comando rapido:

```bash
.venv/bin/python -m pytest -q backend/tests/test_svp_live_store.py backend/tests/test_tv_screenshot_store.py
```

## Ripartenza (quando richiesto)

1. Avvia stack locale (`ops/local-stack/start.sh`).
2. Verifica stato backend/frontend (`ops/local-stack/status.sh`).
3. Ripristina sessione TV login e cattura.
4. Verifica `GET /api/engine/cards` su asset target.
5. Rifinisci narrativa Screening e regole discrezionali SVP.
