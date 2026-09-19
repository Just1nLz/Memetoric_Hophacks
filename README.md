# Memetoric

Lineage observatory for a few tracked memes on the X firehose (395M rows, trailing month). Not a global tweet search — ancestor trees, timesteps, and engagement trajectories.

## Run the UI

```bash
python scripts/build_catalog.py   # DuckDB slice → web/public/catalog.json
cd web && npm install && npm run dev
```

Open http://localhost:5173/

Optional API (GrokBot chat): `XAI_API_KEY=… uvicorn backend.app:app --reload --app-dir . --port 8002` (serves `/api/catalog` and `/api/grok/explain`).
