"""Build a tracked-meme catalog + ancestor trees from local parquet slices."""

from __future__ import annotations

import json
import math
import re
from collections import defaultdict
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "web" / "public" / "catalog.json"


def resolve_parquet() -> list[str]:
    candidates = [
        ROOT / "twitter-firehose",
        Path("/Users/lhh/Documents/Memetoric_Hophacks/twitter-firehose"),
    ]
    for d in candidates:
        if d.is_dir() and any(d.glob("tweets-*.parquet")):
            return [
                str(d / "tweets-00000*.parquet"),
                str(d / "tweets-00004*.parquet"),
                str(d / "tweets-00008*.parquet"),
            ]
    raise FileNotFoundError("twitter-firehose parquet not found next to the repo or in Documents")


PARQUET = resolve_parquet()

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
    {
        "slug": "locked-in",
        "name": "Locked in",
        "query": "locked in",
        "blurb": "Hyperfocus as a flex — no distractions, just the bit. Tracked as a mutation family.",
        "pattern": r"\blocked in\b",
    },
    {
        "slug": "ragebait",
        "name": "Ragebait",
        "query": "ragebait / rage bait",
        "blurb": "Posting just to make people mad — engagement as a combat sport.",
        "pattern": r"\brage\s*bait",
    },
    {
        "slug": "glazing",
        "name": "Glazing",
        "query": "glaze / glazing",
        "blurb": "Over-the-top praise as an insult — calling out the hype instead of the thing.",
        "pattern": r"\bglaz(e|ing|ed)\b",
    },
    {
        "slug": "yapping",
        "name": "Yapping",
        "query": "yapping / yap",
        "blurb": "Talking too much as the joke — shut up is the punchline.",
        "pattern": r"\byapping\b|\byap yap\b",
    },
    {
        "slug": "gooning",
        "name": "Gooning",
        "query": "gooning / gooner",
        "blurb": "Brainrot slang for getting too deep in the sauce — tracked as a family, not a hashtag.",
        "pattern": r"\bgooning\b|\bgooner\b",
    },
    {
        "slug": "rizz",
        "name": "Rizz",
        "query": "rizz / rizzler",
        "blurb": "Charisma as a stat — the pickup-line economy in one syllable.",
        "pattern": r"\brizz\b|\brizzler\b|\brizzed\b",
    },
    {
        "slug": "touch-grass",
        "name": "Touch grass",
        "query": "touch grass",
        "blurb": "Go outside as a dunk — the classic log-off insult, still mutating.",
        "pattern": r"touch grass",
    },
    {
        "slug": "cooked",
        "name": "We're cooked",
        "query": "we're cooked / I'm cooked",
        "blurb": "Doom as a group chat verdict — the timeline decided it's over for someone.",
        "pattern": r"\bwe'?re cooked\b|\bthey'?re cooked\b|\bi'?m cooked\b",
    },
    {
        "slug": "its-so-over",
        "name": "It's so over",
        "query": "it's so over / its so over",
        "blurb": "The crash counterpart to 'we are so back' — despair as a catchphrase.",
        "pattern": r"it'?s so over|its so over",
    },
    {
        "slug": "let-him-cook",
        "name": "Let him cook",
        "query": "let him cook / let them cook",
        "blurb": "Don't interrupt the bit — trust the process as a meme command.",
        "pattern": r"let him cook|let her cook|let them cook",
    },
    {
        "slug": "sigma",
        "name": "Sigma",
        "query": "sigma",
        "blurb": "Lone-wolf grindset parody — sigma as a personality template that keeps getting recast.",
        "pattern": r"\bsigma\b",
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


TWEET_COLS = [
    "id", "author_id", "body", "created_at", "like_count", "reply_count",
    "retweet_count", "quote_count", "views_count", "bookmarks_count", "lang",
    "reply_to_status_id", "conversation_id", "quoting_id", "version",
]

TWEET_SELECT = """
        id, author_id, body,
        CAST(created_at AS VARCHAR) AS created_at,
        like_count, reply_count, retweet_count, quote_count,
        views_count, bookmarks_count, lang,
        reply_to_status_id, conversation_id, quoting_id,
        CAST(version AS VARCHAR) AS version
"""


def _as_tweets(rows: list) -> list[dict]:
    return [dict(zip(TWEET_COLS, r)) for r in rows]


def fetch_meme_rows(con: duckdb.DuckDBPyConnection, pattern_sql: str, limit: int = 220) -> list[dict]:
    sql = f"""
    WITH hits AS (
      SELECT {TWEET_SELECT}
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
    return _as_tweets(con.execute(sql, [PARQUET, pattern_sql]).fetchall())


def fetch_by_ids(con: duckdb.DuckDBPyConnection, ids: list[str]) -> list[dict]:
    want = [i for i in dict.fromkeys(ids) if i]
    if not want:
        return []
    out: list[dict] = []
    for i in range(0, len(want), 64):
        chunk = want[i:i + 64]
        placeholders = ",".join(["?"] * len(chunk))
        sql = f"""
        WITH hits AS (
          SELECT {TWEET_SELECT}
          FROM read_parquet(?, union_by_name=true)
          WHERE id IN ({placeholders})
            AND body NOT ILIKE 'RT @%'
        ),
        latest AS (
          SELECT *, row_number() OVER (PARTITION BY id ORDER BY version DESC) AS rn
          FROM hits
        )
        SELECT * EXCLUDE (rn) FROM latest WHERE rn = 1
        """
        out.extend(_as_tweets(con.execute(sql, [PARQUET, *chunk]).fetchall()))
    return out


def fetch_referrers(con: duckdb.DuckDBPyConnection, ids: list[str], limit: int = 160) -> list[dict]:
    want = [i for i in dict.fromkeys(ids) if i]
    if not want:
        return []
    out: list[dict] = []
    for i in range(0, len(want), 48):
        chunk = want[i:i + 48]
        placeholders = ",".join(["?"] * len(chunk))
        sql = f"""
        WITH hits AS (
          SELECT {TWEET_SELECT}
          FROM read_parquet(?, union_by_name=true)
          WHERE (reply_to_status_id IN ({placeholders}) OR quoting_id IN ({placeholders}))
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
        out.extend(_as_tweets(con.execute(sql, [PARQUET, *chunk, *chunk]).fetchall()))
    by_id = {t["id"]: t for t in out}
    return list(by_id.values())


def assemble_family(con: duckdb.DuckDBPyConnection, pattern_sql: str) -> list[dict]:
    """Seed meme hits, then pull posts that reply to / quote them and the parents they point at."""
    seeds = fetch_meme_rows(con, pattern_sql, 200)[:80]
    by_id = {t["id"]: t for t in seeds}
    referrers = fetch_referrers(con, list(by_id), 180)
    for t in referrers:
        by_id.setdefault(t["id"], t)
    missing = []
    for t in list(by_id.values()):
        for ref in (t.get("reply_to_status_id"), t.get("quoting_id")):
            if ref and ref not in by_id:
                missing.append(ref)
    for t in fetch_by_ids(con, missing):
        by_id.setdefault(t["id"], t)
    return list(by_id.values())


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


def build_tree(tweets: list[dict], snapshots: dict[str, list[dict]], window_start: str) -> tuple[list[dict], dict]:
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

    # Only real references: reply, quote, or a comment whose thread root is in the sample.
    # The firehose has no per-author like / repost graph, so those cannot be edges.
    for t in chronological:
        pid = t.get("reply_to_status_id")
        qid = t.get("quoting_id")
        cid = t.get("conversation_id")
        if pid and pid in by_id and pid != t["id"]:
            t["parent_id"] = pid
            t["edge"] = "reply"
        elif qid and qid in by_id and qid != t["id"]:
            t["parent_id"] = qid
            t["edge"] = "quote"
        elif cid and cid in by_id and cid != t["id"] and pid:
            t["parent_id"] = cid
            t["edge"] = "reply"

    origin = pick_origin(tweets, window_start)
    origin["parent_id"] = None
    origin["edge"] = "origin"
    for t in tweets:
        if t["id"] == origin["id"] or t.get("parent_id"):
            continue
        t["parent_id"] = origin["id"]
        t["edge"] = "mutation"

    children: dict[str, list[str]] = defaultdict(list)
    for t in tweets:
        if t["parent_id"] and t["parent_id"] in by_id and t["parent_id"] != t["id"]:
            children[t["parent_id"]].append(t["id"])
        elif t["id"] != origin["id"]:
            t["parent_id"] = origin["id"]
            t["edge"] = "mutation"
            children[origin["id"]].append(t["id"])

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

    walk(origin["id"], 0)

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

    forest = [serialize(origin)]
    stats = {
        "nodes": len(tweets),
        "roots": 1,
        "replies": sum(1 for t in tweets if t["edge"] == "reply"),
        "quotes": sum(1 for t in tweets if t["edge"] == "quote"),
        "mutations": sum(1 for t in tweets if t["edge"] == "mutation"),
        "max_generation": max((t["generation"] for t in tweets), default=0),
        "likes": sum(t.get("like_count") or 0 for t in tweets),
        "views": sum(t.get("views_count") or 0 for t in tweets),
        "languages": sorted({t.get("lang") or "und" for t in tweets}),
    }
    return forest, stats


def utc_dt(created_at: str | None):
    """Parse firehose timestamps (often EDT) to UTC."""
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
        return dt.astimezone(timezone.utc)
    except ValueError:
        return None


def utc_day(created_at: str | None) -> str | None:
    dt = utc_dt(created_at)
    if dt:
        return dt.date().isoformat()
    return created_at[:10] if created_at else None


def pick_origin(tweets: list[dict], window_start: str) -> dict:
    """Sole origin: first two UTC hours of the window (inclusive), most likes + views."""
    from datetime import datetime, timedelta, timezone

    start = datetime.fromisoformat(window_start).replace(tzinfo=timezone.utc)
    end = start + timedelta(hours=2)

    def score(t: dict) -> int:
        return (t.get("like_count") or 0) + (t.get("views_count") or 0)

    def in_range(t: dict, a, b) -> bool:
        d = utc_dt(t.get("created_at"))
        return d is not None and a <= d <= b

    cands = [t for t in tweets if in_range(t, start, end)]
    if not cands:
        dts = [d for t in tweets if (d := utc_dt(t.get("created_at")))]
        if dts:
            first = min(dts).replace(hour=0, minute=0, second=0, microsecond=0)
            cands = [t for t in tweets if in_range(t, first, first + timedelta(hours=2))]
    if not cands:
        cands = [t for t in tweets if utc_day(t.get("created_at")) == window_start]
    if not cands:
        cands = tweets
    return max(cands, key=score)


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
        "slice_note": "Edges are reply or quote of another post in the family. No like/repost graph in the firehose.",
        "memes": [],
    }
    for meme in MEMES:
        print("extracting", meme["slug"], flush=True)
        tweets = assemble_family(con, meme["pattern"])
        ids = [t["id"] for t in tweets]
        snaps = fetch_snapshots(con, ids)
        window_start = catalog["window"]["start"]
        forest, stats = build_tree(tweets, snaps, window_start)
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
        print("  nodes", stats["nodes"], "roots", stats["roots"], "reply", stats["replies"], "quote", stats["quotes"], flush=True)
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps(catalog, indent=2))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(catalog, indent=2))
    print("wrote", OUT)
    print("meme_count", len(catalog["memes"]))


def trend_parquet() -> list[str]:
    for d in (ROOT / "twitter-firehose", Path("/Users/lhh/Documents/Memetoric_Hophacks/twitter-firehose")):
        if d.is_dir() and any(d.glob("tweets-*.parquet")):
            return [str(d / "tweets-*.parquet")]
    return PARQUET


def annotate_saturation(points: list[dict]) -> list[dict]:
    live = [p for p in points if p.get("coverage") and p.get("tweets")]
    if not live:
        for p in points:
            p.setdefault("phase", "unknown")
            p.setdefault("saturation", 0)
        return points
    peak = max(live, key=lambda p: p["tweets"])
    total = sum(p["tweets"] for p in live) or 1
    cum = 0
    peaked = False
    for p in points:
        if not p.get("coverage"):
            p["phase"] = "uncovered"
            p["saturation"] = None
            continue
        cum += p["tweets"]
        sat = round(cum / total, 3)
        p["saturation"] = sat
        if p["t"] == peak["t"]:
            p["phase"] = "peak"
            peaked = True
        elif not peaked:
            p["phase"] = "rising"
        elif sat >= 0.8 or p["tweets"] < max(1, peak["tweets"] * 0.25):
            p["phase"] = "saturated"
        else:
            p["phase"] = "decline"
    return points


def fill_window_series(by_day: dict[str, dict], start: str, end: str, coverage_end: str | None) -> list[dict]:
    from datetime import date, timedelta

    out = []
    day = date.fromisoformat(start)
    last = date.fromisoformat(end)
    cover_until = date.fromisoformat(coverage_end) if coverage_end else last
    while day <= last:
        key = day.isoformat()
        covered = day <= cover_until
        row = by_day.get(key, {"t": key, "tweets": 0, "likes": 0, "views": 0, "quotes": 0})
        out.append({
            "t": key,
            "tweets": row.get("tweets", 0) if covered else 0,
            "likes": row.get("likes", 0) if covered else 0,
            "views": row.get("views", 0) if covered else 0,
            "quotes": row.get("quotes", 0) if covered else 0,
            "coverage": covered,
        })
        day += timedelta(days=1)
    return annotate_saturation(out)


def refresh_month_trends(catalog: dict) -> dict:
    """Overwrite each meme's series with full-window firehose counts + saturation phases."""
    con = duckdb.connect()
    con.execute("SET memory_limit = '6GB'")
    con.execute("SET TimeZone = 'UTC'")
    files = trend_parquet()
    start = catalog["window"]["start"]
    end = catalog["window"]["end"]
    selects = []
    params: list = []
    for meme in MEMES:
        selects.append(
            f"sum(CASE WHEN regexp_matches(lower(body), ?) THEN 1 ELSE 0 END) AS \"{meme['slug']}_n\""
        )
        selects.append(
            f"sum(CASE WHEN regexp_matches(lower(body), ?) THEN coalesce(like_count, 0) ELSE 0 END) AS \"{meme['slug']}_l\""
        )
        params.extend([meme["pattern"], meme["pattern"]])
    params.append(files)
    sql = f"""
    SELECT CAST(created_at AS DATE) AS day,
           {", ".join(selects)}
    FROM read_parquet(?, union_by_name=true)
    WHERE body NOT ILIKE 'RT @%'
      AND CAST(created_at AS DATE) >= DATE '{start}'
      AND CAST(created_at AS DATE) <= DATE '{end}'
    GROUP BY 1
    ORDER BY 1
    """
    print("scanning monthly volume across", files, flush=True)
    result = con.execute(sql, params)
    cols = [c[0] for c in result.description]
    rows = result.fetchall()
    coverage_end = rows[-1][0].isoformat() if rows else None
    by_slug: dict[str, dict[str, dict]] = {m["slug"]: {} for m in MEMES}
    for row in rows:
        rec = dict(zip(cols, row))
        day = rec["day"].isoformat() if hasattr(rec["day"], "isoformat") else str(rec["day"])
        for meme in MEMES:
            by_slug[meme["slug"]][day] = {
                "t": day,
                "tweets": int(rec.get(f"{meme['slug']}_n") or 0),
                "likes": int(rec.get(f"{meme['slug']}_l") or 0),
                "views": 0,
                "quotes": 0,
            }
    slugs = {m["slug"] for m in MEMES}
    for meme in catalog.get("memes", []):
        if meme["slug"] not in slugs:
            continue
        meme["series"] = fill_window_series(by_slug[meme["slug"]], start, end, coverage_end)
        live = [p for p in meme["series"] if p.get("phase") == "peak"]
        meme["saturation"] = {
            "peak": live[0]["t"] if live else None,
            "coverage_end": coverage_end,
            "note": "Saturation is share of observed phrase volume used up by this day. After the peak, late use reads as dated — cringe to fluent readers.",
        }
        print("  trend", meme["slug"], "days", sum(1 for p in meme["series"] if p.get("coverage")), flush=True)
    catalog["slice_note"] = (
        f"Usage bars cover {start} → {end}. Local firehose files end {coverage_end}; later days are uncovered, not zero use."
    )
    return catalog


if __name__ == "__main__":
    import sys

    if "--trends" in sys.argv:
        catalog = json.loads(OUT.read_text())
        catalog = refresh_month_trends(catalog)
        OUT.write_text(json.dumps(catalog, indent=2))
        print("wrote", OUT)
    else:
        main()
