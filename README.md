# Memetoric

Lineage observatory for a few tracked memes on the X firehose (395M rows, trailing month). Not a global tweet search — ancestor trees, timesteps, and engagement trajectories.

**Try it:** https://just1nlz.github.io/Memetoric_Hophacks/

The live site is a static snapshot (`web/public/catalog.json`). Visitors do **not** need DuckDB, the firehose, or anything from your laptop. Ask Grok still needs the local API + `XAI_API_KEY`; everything else (tree, play, scores) runs in the browser.

## Run the UI

```bash
python scripts/build_catalog.py   # DuckDB slice → web/public/catalog.json
cd web && npm install && npm run dev
```

Open http://localhost:5173/

Optional API (GrokBot chat): `XAI_API_KEY=… uvicorn backend.app:app --reload --app-dir . --port 8002` (serves `/api/catalog` and `/api/grok/explain`).
