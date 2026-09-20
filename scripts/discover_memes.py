"""Scan sampled firehose files for popular untracked meme families."""

from __future__ import annotations

import re
from pathlib import Path

import duckdb

from build_catalog import firehose_dir

# Distinctive 2024–26 slang / formats not already in MEMES.
CANDIDATES = [
    ("gyatt", r"\bgyatt\b|\bgyat\b"),
    ("fanum-tax", r"fanum\s*tax"),
    ("mewing", r"\bmewing\b"),
    ("looksmaxxing", r"looksmaxx"),
    ("in-ohio", r"\bin ohio\b|\bonly in ohio\b"),
    ("brainrot", r"\bbrain\s*rot\b"),
    ("sybau", r"\bsybau\b"),
    ("ts-pmo", r"\bts pmo\b|\bpmo icl\b|\bicl ts\b"),
    ("chat-is-this-real", r"chat is this real"),
    ("skill-issue", r"skill issue"),
    ("not-beating-allegations", r"beating the allegations"),
    ("its-giving", r"it'?s giving"),
    ("left-no-crumbs", r"left no crumbs"),
    ("understood-the-assignment", r"understood the assignment"),
    ("main-character", r"main character"),
    ("im-just-a-girl", r"i'?m just a girl"),
    ("girl-dinner", r"girl dinner"),
    ("winter-arc", r"winter arc"),
    ("performative-male", r"performative male"),
    ("ai-slop", r"\bai slop\b"),
    ("clanker", r"\bclanker"),
    ("dead-internet", r"dead internet"),
    ("hawk-tuah", r"hawk tuah"),
    ("very-demure", r"very demure|very mindful"),
    ("big-back", r"\bbig back\b"),
    ("fine-shyt", r"fine shyt"),
    ("tweaking", r"\btweakin['g]?\b"),
    ("unhinged", r"\bunhinged\b"),
    ("chronically-online", r"chronically online|terminally online"),
    ("gigachad", r"\bgigachad\b|\bgiga chad\b"),
    ("edging", r"\bedging\b"),
    ("caught-in-4k", r"caught in 4k"),
    ("the-ick", r"the ick"),
    ("situationship", r"situationship"),
    ("talking-stage", r"talking stage"),
    ("nepo-baby", r"nepo baby"),
    ("sephora-kid", r"sephora kid"),
    ("dubai-chocolate", r"dubai chocolate"),
    ("what-the-sigma", r"what the sigma"),
    ("backrooms", r"\bbackrooms\b"),
    ("roman-empire", r"roman empire"),
    ("girl-math", r"girl math"),
    ("bed-rotting", r"bed\s*rott"),
    ("womp-womp", r"womp womp"),
    ("down-bad", r"down bad"),
    ("do-numbers", r"do numbers"),
    ("l-take", r"\bl take\b"),
    ("w-take", r"\bw take\b"),
    ("unalive", r"\bunalive"),
    ("caught-lacking", r"caught lacking"),
    ("hot-girl-summer", r"hot girl summer|hot girl walk"),
    ("clean-girl", r"clean girl"),
    ("office-siren", r"office siren"),
    ("coquette", r"\bcoquette\b"),
    ("rawdogging", r"raw\s*dog"),
    ("not-like-us", r"they not like us|not like us"),
    ("schizoposting", r"schizo\s*post"),
    ("the-voices", r"the voices"),
    ("lil-bro", r"lil bro"),
    ("musty", r"\bmusty\b"),
    ("fax-no-printer", r"fax no printer"),
    ("no-cap", r"\bno cap\b"),
    ("be-so-for-real", r"be so for real"),
    ("alpha-male", r"alpha male"),
    ("blackpill", r"black\s*pill"),
    ("pretty-privilege", r"pretty privilege"),
    ("villain-era", r"villain era"),
    ("im-so-normal", r"i'?m so normal"),
    ("going-feral", r"going feral"),
    ("pick-me", r"\bpick me\b"),
    ("ratio", r"\bratioed\b|\bratio \+"),
    ("community-notes", r"community notes?"),
    ("ghibli", r"\bghibli\b"),
    ("slop", r"\bslop\b"),
    ("plus-aura", r"[+\-]\s*\d+\s*aura|\bplus aura\b|\bnegative aura\b"),
    ("tung-tung-sahur", r"tung tung tung|sahur"),
    ("chimpanzini", r"chimpanzini|bananini|lirili|cappuccino assassin"),
    ("41", r"\b41\b"),  # noisy numeric; keep for comparison
]


def sample_files(n: int = 48) -> list[str]:
    files = sorted(firehose_dir().glob("tweets-*.parquet"))
    if len(files) <= n:
        return [str(f) for f in files]
    idxs = {round(i * (len(files) - 1) / (n - 1)) for i in range(n)}
    return [str(files[i]) for i in sorted(idxs)]


def main() -> None:
    files = sample_files(48)
    print("scanning", len(files), "of", len(list(firehose_dir().glob("tweets-*.parquet"))), "files", flush=True)
    con = duckdb.connect()
    con.execute("SET memory_limit = '6GB'")
    selects = []
    params: list = []
    for slug, pat in CANDIDATES:
        selects.append(
            f"sum(CASE WHEN regexp_matches(lower(body), ?) THEN 1 ELSE 0 END) AS \"{slug}_n\""
        )
        selects.append(
            f"sum(CASE WHEN regexp_matches(lower(body), ?) THEN coalesce(like_count, 0) ELSE 0 END) AS \"{slug}_l\""
        )
        params.extend([pat, pat])
    params.append(files)
    sql = f"""
    SELECT {", ".join(selects)}
    FROM read_parquet(?, union_by_name=true)
    WHERE body NOT ILIKE 'RT @%'
    """
    result = con.execute(sql, params)
    rec = dict(zip([c[0] for c in result.description], result.fetchone()))
    rows = []
    for slug, _pat in CANDIDATES:
        n = int(rec.get(f"{slug}_n") or 0)
        likes = int(rec.get(f"{slug}_l") or 0)
        rows.append((n, likes, slug))
    rows.sort(reverse=True)
    print(f"{'slug':28} {'hits':>10} {'likes':>14}")
    for n, likes, slug in rows:
        mark = " **" if n >= 400 and likes >= 20_000 else (" *" if n >= 150 else "")
        print(f"{slug:28} {n:10} {likes:14}{mark}")


if __name__ == "__main__":
    main()
