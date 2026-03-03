# Diagnostica Avvio Locale

## Errore osservato
Frontend/backend risultavano avviati subito dopo `start.sh`, ma pochi secondi dopo erano spenti.

## Causa tecnica
In shell gestite alcuni processi in background classico (`nohup ... &`) vengono terminati quando il comando padre termina.

## Correzione applicata
- Avvio servizi in sessioni `screen` detached:
  - `kairon_frontend`
  - `kairon_backend`
- Check robusti su:
  - porta frontend `3000`
  - porta backend `8000`
  - readiness backend `GET /api/ready`
- Script `status.sh` aggiornato con check sessioni `screen`.

## Comando unico consigliato
```bash
bash "/Users/denny/Documents/New project/ops/local-stack/start.sh"
```

## Verifica immediata
```bash
bash "/Users/denny/Documents/New project/ops/local-stack/status.sh"
```
