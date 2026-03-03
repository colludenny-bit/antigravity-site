# Playbook: Apri Portale in Localhost

Percorso ufficiale da seguire quando chiedi:
`apri il portale in localhost`

## 1) Avvio stack
```bash
bash "/Users/denny/Documents/New project/ops/local-stack/start.sh"
```

## 2) Verifica stato
```bash
bash "/Users/denny/Documents/New project/ops/local-stack/status.sh"
```

Esito atteso:
- Frontend `UP` su `http://localhost:3000`
- Backend `UP` su `http://localhost:8000/api/ready` (HTTP 200)
- Screen sessions `kairon_frontend` e `kairon_backend` `OK`

## 3) Accesso portale
- URL: `http://localhost:3000`

## 4) Stop servizi (quando richiesto)
```bash
bash "/Users/denny/Documents/New project/ops/local-stack/stop.sh"
```

## 5) Verifica sicurezza pre-push/redeploy
```bash
bash "/Users/denny/Documents/New project/scripts/security-audit.sh"
```

## 6) Check completo pre-push/redeploy
```bash
bash "/Users/denny/Documents/New project/scripts/prepush-checks.sh"
```

## 7) Setup SVP live + automazione screenshot
Documento operativo:
`/Users/denny/Documents/New project/ops/local-stack/SVP_LIVE_SETUP.md`
