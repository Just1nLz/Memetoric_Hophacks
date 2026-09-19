"""Build a tracked-meme catalog + ancestor trees from local parquet slices."""

from __future__ import annotations

import json
import math
import re
from collections import defaultdict
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parent.parent
PARQUET = [
    str(ROOT / "twitter-firehose" / "tweets-00000*.parquet"),
    str(ROOT / "twitter-firehose" / "tweets-00004*.parquet"),
    str(ROOT / "twitter-firehose" / "tweets-00008*.parquet"),
]
OUT = ROOT / "web" / "public" / "catalog.json"

# Keep quality over noise: clear meme families with enough high-like hits in the slice.
MEMES = [
    {
        "slug": "aura-farming",
        "name": "Aura farming",
        "query": "aura farm",
        "blurb": "Performing coolness on purpose — the pose, the walk, the silence. Tracked as a mutation family, not a hashtag.",
        "pattern": r"aura\s*farm",
    },
    {
        "slug": "rickroll",
        "name": "Rickroll",
        "query": "rickroll / never gonna give you up",
        "blurb": "The bait-and-switch that never died. New wrappers, same payload.",
        "pattern": r"rick\s*roll|rickroll|never gonna give you up|rick astley",
    },
    {
        "slug": "skibidi",
        "name": "Skibidi",
        "query": "skibidi",
        "blurb": "Brainrot phoneme that jumped from toilet lore into everyday slang.",
        "pattern": r"skibidi",
    },
    {
        "slug": "sixty-seven",
        "name": "67 / Labubu",
        "query": "67 · labubu",
        "blurb": "Numeric chant colliding with the Labubu toy wave — a 2026 playground cipher.",
        "pattern": r"labubu|six\s*seven|67 labubu|labubu 67",
    },
    {
        "slug": "crashout",
        "name": "Crashout",
        "query": "crash out / crashout",
        "blurb": "Public meltdown as a verb — when someone finally loses it on timeline.",
        "pattern": r"\bcrash\s*out\b|\bcrashout\b|\bcrashing\s*out\b",
    },
    {
        "slug": "we-are-so-back",
        "name": "We are so back",
        "query": "we are so back",
        "blurb": "The rebound catchphrase opposite of 'it's so over' — revival energy as a meme.",
        "pattern": r"we are so back|we're so back",
    },
    {
        "slug": "npc",
        "name": "NPC",
        "query": "npc",
        "blurb": "Calling people scripted extras — main-character discourse as an insult template.",
        "pattern": r"\bnpc\b|\bnpcs\b",
    },
    {
        "slug": "italian-brainrot",
        "name": "Italian brainrot",
        "query": "tralalero · bombardiro · tung tung",
        "blurb": "Nonsense animal-sound lore (Tralalero, Bombardiro, Tung Tung) as a 2025–26 export.",
        "pattern": r"tralalero|bombardiro|tung\s*tung|italian\s*brainrot|ballerina\s*cappuccina",
    },
    {
        "slug": "mogging",
        "name": "Mogging",
        "query": "mog / mogging",
        "blurb": "Looksmax slang for outclassing someone on sight — hierarchy humor from the forums.",
        "pattern": r"\bmogg(ing|ed|s)?\b|\bmog\b",
    },
    {
        "slug": "delulu",
        "name": "Delulu",
        "query": "delulu",
        "blurb": "Delusional optimism as a compliment — stay delulu, keep the bit alive.",
        "pattern": r"\bdelulu\b|\bdelusional\b",
    },
]

STOP = {
    "the", "and", "for", "you", "that", "this", "with", "are", "was", "have",
    "just", "from", "they", "your", "what", "when", "will", "about", "like",
    "https", "http", "www", "com", "lol", "its", "not", "but", "all", "can",
    "she", "him", "her", "his", "our", "out", "who", "how", "why", "any",
}


def tokenize(text: str) -> set[str]:
    return {
        t
        for t in re.findall(r"[a-z0-9']+", (text or "").lower())
        if len(t) > 2 and t not in STOP
    }


def similarity(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / math.sqrt(len(a) * len(b))


def post_url(tweet_id: str) -> str:
    return f"https://x.com/i/web/status/{tweet_id}"


def annotate_edge(parent: dict, child: dict, sibling_count: int) -> tuple[str, str]:
    """Short label + detail: delta from previous node → this node."""
    parent_toks = parent.get("tokens", set())
    child_toks = child.get("tokens", set())
    kept = sorted(parent_toks & child_toks)
    added = sorted(child_toks - parent_toks)
    dropped = sorted(parent_toks - child_toks)
    split = f"{sibling_count + 1} branches off parent" if sibling_count > 0 else ""

    edge = child.get("edge")
    via = (
        "Replied to previous"
        if edge == "reply"
        else "Quoted previous"
        if edge == "quote"
        else "Mutated from previous"
    )

    if added:
        label = f"+{' · '.join(added[:2])}"
    elif edge == "reply":
        label = "reply"
    elif edge == "quote":
        label = "quote"
    else:
        label = "rephrased"

    parts = [
        via,
        f"added {', '.join(added[:4])}" if added else None,
        f"dropped {', '.join(dropped[:3])}" if dropped else None,
        f"kept {', '.join(kept[:3])}" if kept else "no shared tokens",
        split or None,
    ]
    detail = " · ".join(x for x in parts if x)
    return label, detail


def fetch_meme_rows(con: duckdb.DuckDBPyConnection, pattern_sql: str, limit: int = 220) -> list[dict]:
    sql = f"""
    WITH hits AS (
      SELECT
        id, author_id, body,
        CAST(created_at AS VARCHAR) AS created_at,
        like_count, reply_count, retweet_count, quote_count,
        views_count, bookmarks_count, lang,
        reply_to_status_id, conversation_id, quoting_id,
        CAST(version AS VARCHAR) AS version
      FROM read_parquet(?, union_by_name=true)
      WHERE regexp_matches(lower(body), ?)
        AND body NOT ILIKE 'RT @%'
    ),
    latest AS (
      SELECT *, row_number() OVER (PARTITION BY id ORDER BY version DESC) AS rn
      FROM hits
    )
    SELECT * EXCLUDE (rn) FROM latest
    WHERE rn = 1
    ORDER BY like_count DESC
    LIMIT {limit}
    """
    cols = [
        "id", "author_id", "body", "created_at", "like_count", "reply_count",
        "retweet_count", "quote_count", "views_count", "bookmarks_count", "lang",
        "reply_to_status_id", "conversation_id", "quoting_id", "version",
    ]
    rows = con.execute(sql, [PARQUET, pattern_sql]).fetchall()
    return [dict(zip(cols, r)) for r in rows]


def fetch_snapshots(con: duckdb.DuckDBPyConnection, ids: list[str]) -> dict[str, list[dict]]:
    if not ids:
        return {}
    sample_ids = ids[:48]
    placeholders = ",".join(["?"] * len(sample_ids))
    sql = f"""
    SELECT id, CAST(version AS VARCHAR) AS version,
           like_count, reply_count, retweet_count, quote_count,
           views_count, bookmarks_count
    FROM read_parquet(?, union_by_name=true)
    WHERE id IN ({placeholders})
    ORDER BY id, version
    """
    rows = con.execute(sql, [PARQUET, *sample_ids]).fetchall()
    out: dict[str, list[dict]] = defaultdict(list)
    seen = set()
    for r in rows:
        key = (r[0], r[1])
        if key in seen:
            continue
        seen.add(key)
        out[r[0]].append({
            "version": r[1],
            "like_count": r[2] or 0,
            "reply_count": r[3] or 0,
            "retweet_count": r[4] or 0,
            "quote_count": r[5] or 0,
            "views_count": r[6] or 0,
            "bookmarks_count": r[7] or 0,
        })
    return out


def ensure_snapshots(t: dict) -> list[dict]:
    snaps = t.get("snapshots") or []
    if len(snaps) >= 2:
        return snaps
    end = {
        "version": t.get("version") or t.get("created_at"),
        "like_count": t.get("like_count") or 0,
        "reply_count": t.get("reply_count") or 0,
        "retweet_count": t.get("retweet_count") or 0,
        "quote_count": t.get("quote_count") or 0,
        "views_count": t.get("views_count") or 0,
        "bookmarks_count": t.get("bookmarks_count") or 0,
    }
    start = {**end, "version": t.get("created_at"), "like_count": 0, "reply_count": 0,
             "retweet_count": 0, "quote_count": 0, "views_count": 0, "bookmarks_count": 0}
    if snaps:
        return [start, *snaps] if snaps[0]["version"] != start["version"] else snaps
    return [start, end]


def build_tree(tweets: list[dict], snapshots: dict[str, list[dict]]) -> tuple[list[dict], dict]:
    by_id = {t["id"]: t for t in tweets}
    for t in tweets:
        t["tokens"] = tokenize(t["body"] or "")
        t["snapshots"] = ensure_snapshots({**t, "snapshots": snapshots.get(t["id"], [])})
        t["parent_id"] = None
        t["edge"] = "origin"
        t["generation"] = 0
        t["url"] = post_url(t["id"])
        t["edge_label"] = None
        t["edge_detail"] = None

    chronological = sorted(tweets, key=lambda t: t["created_at"] or "")

    for t in chronological:
        pid = t.get("reply_to_status_id")
        qid = t.get("quoting_id")
        if pid and pid in by_id and pid != t["id"]:
            t["parent_id"] = pid
            t["edge"] = "reply"
        elif qid and qid in by_id and qid != t["id"]:
            t["parent_id"] = qid
            t["edge"] = "quote"

    placed = [t for t in chronological if t["parent_id"] is None]
    for t in chronological:
        if t["parent_id"] is not None:
            continue
        best = None
        best_score = 0.11
        for prev in placed:
            if prev["created_at"] >= t["created_at"] or prev["id"] == t["id"]:
                continue
            score = similarity(prev["tokens"], t["tokens"])
            if t.get("conversation_id") and t["conversation_id"] == prev.get("conversation_id"):
                score += 0.25
            if score > best_score:
                best_score = score
                best = prev
        if best is not None:
            t["parent_id"] = best["id"]
            t["edge"] = "mutation"
        else:
            placed.append(t)

    children: dict[str, list[str]] = defaultdict(list)
    for t in tweets:
        if t["parent_id"]:
            children[t["parent_id"]].append(t["id"])

    # Annotate edges after the full parent map exists (need sibling counts).
    for t in tweets:
        pid = t.get("parent_id")
        if not pid or pid not in by_id:
            continue
        parent = by_id[pid]
        sibs = [c for c in children.get(pid, []) if c != t["id"]]
        label, detail = annotate_edge(parent, t, len(sibs))
        t["edge_label"] = label
        t["edge_detail"] = detail

    def walk(nid: str, gen: int) -> None:
        node = by_id[nid]
        node["generation"] = gen
        for cid in children.get(nid, []):
            walk(cid, gen + 1)

    roots = [t for t in tweets if not t["parent_id"]]
    roots.sort(
        key=lambda t: len(children.get(t["id"], [])) * 100_000 + (t.get("like_count") or 0),
        reverse=True,
    )
    for r in roots:
        walk(r["id"], 0)

    def serialize(t: dict) -> dict:
        kids = sorted(children.get(t["id"], []), key=lambda cid: by_id[cid]["created_at"] or "")
        return {
            "id": t["id"],
            "author_id": t["author_id"],
            "body": t["body"],
            "created_at": t["created_at"],
            "like_count": t["like_count"] or 0,
            "reply_count": t["reply_count"] or 0,
            "retweet_count": t["retweet_count"] or 0,
            "quote_count": t["quote_count"] or 0,
            "views_count": t["views_count"] or 0,
            "bookmarks_count": t["bookmarks_count"] or 0,
            "lang": t["lang"] or "und",
            "reply_to_status_id": t["reply_to_status_id"],
            "quoting_id": t["quoting_id"],
            "conversation_id": t["conversation_id"],
            "version": t["version"],
            "parent_id": t["parent_id"],
            "edge": t["edge"],
            "generation": t["generation"],
            "url": t.get("url") or post_url(t["id"]),
            "edge_label": t.get("edge_label"),
            "edge_detail": t.get("edge_detail"),
            "snapshots": t["snapshots"],
            "children": [serialize(by_id[cid]) for cid in kids],
        }

    forest = [serialize(r) for r in roots[:6]]
    stats = {
        "nodes": len(tweets),
        "roots": len(roots),
        "replies": sum(1 for t in tweets if t["edge"] == "reply"),
        "quotes": sum(1 for t in tweets if t["edge"] == "quote"),
        "mutations": sum(1 for t in tweets if t["edge"] == "mutation"),
        "max_generation": max((t["generation"] for t in tweets), default=0),
        "likes": sum(t.get("like_count") or 0 for t in tweets),
        "views": sum(t.get("views_count") or 0 for t in tweets),
        "languages": sorted({t.get("lang") or "und" for t in tweets}),
    }
    return forest, stats


def utc_day(created_at: str | None) -> str | None:
    """Map firehose timestamps (often EDT) onto UTC calendar days to match the corpus window."""
    if not created_at:
        return None
    raw = created_at.strip().replace(" ", "T")
    raw = re.sub(r"([+-]\d{2})$", r"\1:00", raw)
    raw = re.sub(r"([+-]\d{2})(\d{2})$", r"\1:\2", raw)
    try:
        from datetime import datetime, timezone

        dt = datetime.fromisoformat(raw)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).date().isoformat()
    except ValueError:
        return created_at[:10]


def daily_series(tweets: list[dict], window_start: str) -> list[dict]:
    buckets: dict[str, dict] = {}
    for t in tweets:
        day = utc_day(t.get("created_at"))
        if not day:
            continue
        if day < window_start:
            day = window_start
        b = buckets.setdefault(day, {"t": day, "tweets": 0, "likes": 0, "views": 0, "quotes": 0})
        b["tweets"] += 1
        b["likes"] += t.get("like_count") or 0
        b["views"] += t.get("views_count") or 0
        b["quotes"] += t.get("quote_count") or 0
    return [buckets[k] for k in sorted(buckets)]


def main() -> None:
    con = duckdb.connect()
    con.execute("SET memory_limit = '5GB'")
    catalog = {
        "source": "twitter-firehose-last-month",
        "window": {"start": "2026-08-17", "end": "2026-09-17"},
        "corpus_rows": 395_352_258,
        "distinct_tweets": 363_500_000,
        "slice_note": "Trees built from a 30-file parquet slice of the 395M-row firehose.",
        "memes": [],
    }
    for meme in MEMES:
        print("extracting", meme["slug"], flush=True)
        tweets = fetch_meme_rows(con, meme["pattern"], 160)
        # Prefer high-like recent hits; keep a usable tree size.
        tweets = sorted(tweets, key=lambda t: t.get("like_count") or 0, reverse=True)[:72]
        ids = [t["id"] for t in tweets]
        snaps = fetch_snapshots(con, ids)
        forest, stats = build_tree(tweets, snaps)
        window_start = catalog["window"]["start"]
        first_days = [d for t in tweets if (d := utc_day(t.get("created_at")))]
        first_day = min(first_days) if first_days else None
        if first_day and first_day < window_start:
            first_day = window_start
        first = f"{first_day}T00:00:00Z" if first_day else None
        catalog["memes"].append({
            **{k: meme[k] for k in ("slug", "name", "query", "blurb")},
            "first_seen": first,
            "stats": stats,
            "series": daily_series(tweets, window_start),
            "forest": forest,
        })
        print("  nodes", stats["nodes"], "roots", stats["roots"], "mut", stats["mutations"], flush=True)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(catalog, indent=2))
    print("wrote", OUT)
    print("meme_count", len(catalog["memes"]))


if __name__ == "__main__":
    main()
