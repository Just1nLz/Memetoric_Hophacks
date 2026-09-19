from __future__ import annotations

import json
import os
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parent.parent
CATALOG = ROOT / "web" / "public" / "catalog.json"

app = FastAPI(title="Memetoric", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _key() -> str | None:
    return os.environ.get("XAI_API_KEY") or os.environ.get("GROK_API_KEY")


def _post(path: str, payload: dict) -> dict:
    key = _key()
    if not key:
        raise RuntimeError("missing_key")
    req = Request(
        f"https://api.x.ai/v1{path}",
        data=json.dumps(payload).encode(),
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode())


class ChatTurn(BaseModel):
    role: str
    content: str


class PromptIn(BaseModel):
    prompt: str | None = None
    context: str | None = None
    messages: list[ChatTurn] | None = None


@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "grok": bool(_key())}


@app.get("/api/catalog")
def catalog() -> dict:
    if not CATALOG.exists():
        return {"error": "catalog missing", "hint": "python scripts/build_catalog.py"}
    return json.loads(CATALOG.read_text())


@app.post("/api/grok/explain")
def grok_explain(body: PromptIn) -> dict:
    if not _key():
        return {"error": "Set XAI_API_KEY to run Grok in-app, or use the Grok / GrokBot links."}
    history = [m for m in (body.messages or []) if m.role in ("user", "assistant") and m.content.strip()]
    if not history and body.prompt:
        history = [ChatTurn(role="user", content=body.prompt)]
    if not history:
        return {"error": "Type a prompt first."}
    packed: list[dict] = [
        {
            "role": "system",
            "content": (
                "You are Grok in Memetoric, a meme lineage observatory. "
                "Answer the user's prompt directly. If they ask a follow-up, stay in the thread. "
                "Be concrete and brief. No hype."
            ),
        }
    ]
    if body.context and body.context.strip():
        packed.append({"role": "system", "content": "Post context (always use this):\n" + body.context.strip()})
    packed.extend({"role": m.role, "content": m.content} for m in history)
    try:
        data = _post(
            "/chat/completions",
            {
                "model": "grok-4",
                "messages": packed,
            },
        )
        text = data["choices"][0]["message"]["content"]
        return {"text": text, "model": data.get("model")}
    except (HTTPError, URLError, RuntimeError, KeyError, IndexError) as e:
        return {"error": str(e)}


@app.post("/api/grok/imagine")
def grok_imagine(body: PromptIn) -> dict:
    if not _key():
        return {"error": "missing_key"}
    try:
        data = _post(
            "/images/generations",
            {"model": "grok-imagine-image", "prompt": body.prompt},
        )
        url = (data.get("data") or [{}])[0].get("url")
        if not url:
            return {"error": "no_image", "raw": data}
        return {"image_url": url}
    except (HTTPError, URLError, RuntimeError, KeyError, IndexError) as e:
        return {"error": str(e)}


dist = ROOT / "web" / "dist"
if dist.exists():
    app.mount("/", StaticFiles(directory=dist, html=True), name="ui")
