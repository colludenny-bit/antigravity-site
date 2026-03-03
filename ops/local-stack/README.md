# Local Stack Launcher

Percorso unico da usare:

```bash
bash "/Users/denny/Documents/New project/ops/local-stack/start.sh"
```

Comandi utili:

```bash
# stato servizi
bash "/Users/denny/Documents/New project/ops/local-stack/status.sh"

# stop servizi
bash "/Users/denny/Documents/New project/ops/local-stack/stop.sh"
```

Servizi gestiti:
- Frontend: `http://localhost:3000`
- Backend: `http://localhost:8000` (`/api/ready`)

Log runtime:
- `./.run/local-stack/frontend.log`
- `./.run/local-stack/backend.log`

Nota tecnica (errore risolto):
- In ambienti con shell gestita, processi lanciati in background classico possono venire chiusi quando termina il comando padre.
- Gli script usano sessioni `screen` detached (`kairon_frontend`, `kairon_backend`) per mantenere i servizi vivi in modo persistente.
