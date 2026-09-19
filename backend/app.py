from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

ROOT = Path(__file__).resolve().parent.parent
CATALOG = ROOT / "web" / "public" / "catalog.json"

app = FastAPI(title="Memetoric", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict:
    return {"ok": True}


@app.get("/api/catalog")
def catalog() -> dict:
    if not CATALOG.exists():
        return {"error": "catalog missing", "hint": "python scripts/build_catalog.py"}
    import json

    return json.loads(CATALOG.read_text())


dist = ROOT / "web" / "dist"
if dist.exists():
    app.mount("/", StaticFiles(directory=dist, html=True), name="ui")
