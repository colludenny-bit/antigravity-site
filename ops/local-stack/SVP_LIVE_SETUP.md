# SVP Live Setup (TradingView -> Backend)

Obiettivo: usare valori SVP reali (`VAH/VAL/POC`) nel motore screening, invece della sola stima proxy.

## 1) Imposta secret webhook

Nel file `backend/.env`:

```env
SVP_WEBHOOK_SECRET=metti_una_chiave_lunga_e_unica
```

Riavvia backend:

```bash
bash "/Users/denny/Documents/New project/ops/local-stack/stop.sh"
bash "/Users/denny/Documents/New project/ops/local-stack/start.sh"
```

## 2) Endpoint ingest live

`POST /api/market/svp/live`

Payload JSON minimo:

```json
{
  "asset": "XAUUSD",
  "va_low": 5328.5,
  "va_high": 5379.2,
  "poc": 5351.7,
  "rome_day": "2026-03-03",
  "timeframe": "5m",
  "is_closed": false,
  "source": "TRADINGVIEW_WEBHOOK",
  "secret": "metti_una_chiave_lunga_e_unica"
}
```

## 3) Verifica feed

Richiede login app:

- `GET /api/market/svp/live/status`
- `GET /api/market/svp/live/XAUUSD`

Nei dati di screening (`discretionaryContext.price_action`) troverai:

- `svp_source`
- `svp_source_quality`
- `svp_live_last_update_utc`

## 4) Note pratiche

- L’integrazione diretta con iframe TradingView non permette lettura interna indicatori per limiti cross-origin.
- La via robusta e stabile e`: alert/webhook TradingView con valori SVP numerici.
- Se manca feed live, il backend resta operativo con fallback proxy (`YF`).

## 5) Automazione screenshot TradingView ("occhi")

### 5.1 Bootstrap login una volta

```bash
TV_CHART_URL="https://www.tradingview.com/chart/tuo_link" \
bash "/Users/denny/Documents/New project/scripts/tv_bootstrap_login.sh"
```

Questo salva sessione/cookie in:
`/Users/denny/Documents/New project/.run/tv-storage-state.json`

### 5.2 Cattura + upload singolo

```bash
ASSET="XAUUSD" \
TV_CHART_URL="https://www.tradingview.com/chart/tuo_link" \
SVP_WEBHOOK_SECRET="metti_una_chiave_lunga_e_unica" \
bash "/Users/denny/Documents/New project/scripts/tv_capture_and_upload.sh"
```

### 5.3 Daemon continuo (es. ogni 15 min)

```bash
ASSET="XAUUSD" \
TV_CHART_URL="https://www.tradingview.com/chart/tuo_link" \
TV_INTERVAL_SEC="900" \
SVP_WEBHOOK_SECRET="metti_una_chiave_lunga_e_unica" \
bash "/Users/denny/Documents/New project/scripts/tv_capture_daemon.sh"
```

### 5.4 Endpoint screenshot

- `POST /api/market/svp/screenshot/upload` (secret opzionale se impostato in backend)
- `GET /api/market/svp/screenshot/status` (auth)
- `GET /api/market/svp/screenshot/latest/{asset}` (auth)
- `GET /api/market/svp/screenshot/feed?asset=XAUUSD&limit=20` (auth)
