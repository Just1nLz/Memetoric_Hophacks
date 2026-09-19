import { useEffect, useMemo, useRef, useState } from "react";
import { Inspector } from "./components/Inspector";
import { KeywordSearch, type SearchHit } from "./components/KeywordSearch";
import { Timeline } from "./components/Timeline";
import { TreeCanvas } from "./components/TreeCanvas";
import { Volume } from "./components/Charts";
import { clampToWindow, compact, ts, utcDay, when } from "./format";
import { flatten, languageKey, treesByLanguage } from "./layout";
import type { Catalog, EdgeKind, Meme, TweetNode } from "./types";

export default function App() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [slug, setSlug] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [playing, setPlaying] = useState(false);
  const [step, setStep] = useState(0);
  const [edges, setEdges] = useState<Set<EdgeKind>>(new Set(["reply", "quote", "mutation"]));
  const [langKey, setLangKey] = useState<string | null>(null);
  const pendingSelect = useRef<string | null>(null);

  useEffect(() => {
    fetch("/catalog.json")
      .then((r) => {
        if (!r.ok) throw new Error("catalog missing");
        return r.json();
      })
      .then((data: Catalog) => {
        const normalized = normalizeCatalog(data);
        setCatalog(normalized);
        setSlug(normalized.memes[0]?.slug ?? null);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const meme = catalog?.memes.find((m) => m.slug === slug) ?? catalog?.memes[0] ?? null;
  const langTrees = useMemo(() => (meme ? treesByLanguage(meme.forest) : []), [meme]);
  const activeTree = langTrees.find((t) => t.key === langKey) ?? langTrees[0] ?? null;
  const nodes = useMemo(() => (activeTree ? flatten(activeTree.forest) : []), [activeTree]);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const stamps = useMemo(() => {
    const hours = nodes
      .map((n) => ts(n.created_at))
      .filter(Boolean)
      .map((t) => Math.floor(t / 3_600_000) * 3_600_000);
    return [...new Set(hours)].sort((a, b) => a - b);
  }, [nodes]);

  useEffect(() => {
    setPlaying(false);
    const want = pendingSelect.current;
    if (want && nodes.some((n) => n.id === want)) {
      setSelected(want);
      const node = nodes.find((n) => n.id === want)!;
      const hitHour = Math.floor(ts(node.created_at) / 3_600_000) * 3_600_000;
      const idx = stamps.findIndex((t) => t >= hitHour);
      setStep(idx >= 0 ? idx : Math.max(0, stamps.length - 1));
      pendingSelect.current = null;
    } else {
      setSelected(activeTree?.forest[0]?.id ?? null);
      setStep(Math.max(0, stamps.length - 1));
    }
    // Re-seed when the meme family or language page changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meme?.slug, langKey, stamps.length]);

  useEffect(() => {
    if (!meme) return;
    const trees = treesByLanguage(meme.forest);
    const want = pendingSelect.current;
    if (want) {
      const hit = flatten(meme.forest).find((n) => n.id === want);
      if (hit) {
        setLangKey(languageKey(hit.lang));
        return;
      }
    }
    setLangKey(trees[0]?.key ?? null);
  }, [meme?.slug]);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setStep((s) => {
        if (s >= stamps.length - 1) {
          setPlaying(false);
          return s;
        }
        return s + 1;
      });
    }, 650);
    return () => window.clearInterval(id);
  }, [playing, stamps.length]);

  const cutoff = stamps[step] ?? Number.POSITIVE_INFINITY;
  const visible = useMemo(() => {
    const ids = new Set<string>();
    for (const n of nodes) {
      if (Math.floor(ts(n.created_at) / 3_600_000) * 3_600_000 > cutoff) continue;
      ids.add(n.id);
    }
    return ids;
  }, [nodes, cutoff]);

  const selectedNode: TweetNode | null =
    nodes.find((n) => n.id === selected) ?? nodes.find((n) => n.edge === "origin") ?? nodes[0] ?? null;
  const parentNode =
    selectedNode?.parent_id != null ? (byId.get(selectedNode.parent_id) ?? null) : null;

  const toggleEdge = (k: EdgeKind) => {
    setEdges((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const onPickHit = (hit: SearchHit) => {
    setPlaying(false);
    pendingSelect.current = hit.node.id;
    setLangKey(languageKey(hit.node.lang));
    if (hit.memeSlug === slug) {
      setSelected(hit.node.id);
      const hitHour = Math.floor(ts(hit.node.created_at) / 3_600_000) * 3_600_000;
      const idx = stamps.findIndex((t) => t >= hitHour);
      if (idx >= 0) setStep(idx);
      return;
    }
    setSlug(hit.memeSlug);
  };

  if (error) {
    return (
      <div className="boot">
        <h1>Memetoric</h1>
        <p>
          Couldn’t load the catalog. Run <code>python scripts/build_catalog.py</code> then refresh.
        </p>
      </div>
    );
  }

  if (!catalog || !meme || !activeTree) {
    return (
      <div className="boot">
        <p className="kicker">Memetoric</p>
        <h1>Reading the firehose…</h1>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="mark">M</span>
          <div>
            <strong>Memetoric</strong>
            <p>Lineage observatory · X firehose</p>
          </div>
        </div>
        <p className="corpus">
          {compact(catalog.corpus_rows)} rows · {compact(catalog.distinct_tweets)} tweets ·{" "}
          {catalog.window.start} → {catalog.window.end}
        </p>
      </header>

      <aside className="rail">
        <p className="kicker">Tracked memes</p>
        <p className="muted small">
          We don’t scrape the whole platform into one graph. Each card is a family we chose to follow.
        </p>
        <ul className="meme-list">
          {catalog.memes.map((m) => (
            <li key={m.slug}>
              <button className={m.slug === meme.slug ? "on" : ""} onClick={() => setSlug(m.slug)}>
                <span className="name">{m.name}</span>
                <span className="q">{m.query}</span>
                <span className="nums">
                  {m.stats.nodes} tweets · {m.stats.max_generation} gens · {compact(m.stats.likes)} likes
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="legend">
          <p className="kicker">Edge types</p>
          <label>
            <input type="checkbox" checked={edges.has("reply")} onChange={() => toggleEdge("reply")} />
            <i className="swatch reply" /> reply
          </label>
          <label>
            <input type="checkbox" checked={edges.has("quote")} onChange={() => toggleEdge("quote")} />
            <i className="swatch quote" /> quote
          </label>
          <label>
            <input type="checkbox" checked={edges.has("mutation")} onChange={() => toggleEdge("mutation")} />
            <i className="swatch mutation" /> mutation
          </label>
        </div>
      </aside>

      <main className="stage">
        <div className="stage-head">
          <div>
            <p className="kicker">Ancestor tree</p>
            <h1>{meme.name}</h1>
            <p className="blurb">{meme.blurb}</p>
            <p className="muted small origin-note">
              Lineages are split by language. Open a language to see that tree on its own page.
            </p>
          </div>
          <dl className="stats">
            <Stat k="this tree" v={String(activeTree.count)} />
            <Stat k="language" v={activeTree.name} />
            <Stat k="langs" v={String(langTrees.length)} />
            <Stat k="first seen" v={when(meme.first_seen)} />
          </dl>
        </div>
        <div className="tree-switch" role="tablist" aria-label="Language trees">
          {langTrees.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={t.key === activeTree.key}
              className={t.key === activeTree.key ? "on" : ""}
              onClick={() => {
                pendingSelect.current = null;
                setLangKey(t.key);
              }}
            >
              <span className="tree-lang">{t.name}</span>
              <span className="tree-count">
                {t.count} posts · {compact(t.likes)} likes
              </span>
            </button>
          ))}
        </div>
        <div className="toolbar">
          <KeywordSearch catalog={catalog} query={query} onQuery={setQuery} onPick={onPickHit} />
          <Volume
            series={meme.series}
            activeDay={stamps[step] ? utcDay(new Date(stamps[step]).toISOString()) : null}
            onSelectDay={(day) => {
              const target = Date.parse(`${day}T12:00:00.000Z`);
              if (!Number.isFinite(target) || stamps.length === 0) return;
              let best = 0;
              let bestDist = Number.POSITIVE_INFINITY;
              stamps.forEach((t, i) => {
                const dist = Math.abs(t - target);
                if (dist < bestDist) {
                  bestDist = dist;
                  best = i;
                }
              });
              setPlaying(false);
              setStep(best);
            }}
          />
        </div>
        <TreeCanvas
          forest={activeTree.forest}
          visible={visible}
          selected={selected}
          onSelect={setSelected}
          edgeFilter={edges}
        />
        <Timeline
          stamps={stamps}
          index={step}
          playing={playing}
          onIndex={setStep}
          onToggle={() => {
            if (!playing && step >= stamps.length - 1) setStep(0);
            setPlaying((p) => !p);
          }}
        />
      </main>

      <Inspector node={selectedNode} parent={parentNode} memeName={meme.name} />
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}

/** Align first-seen + daily series with the corpus UTC window (EDT evenings can look like the prior day). */
function normalizeCatalog(data: Catalog): Catalog {
  const start = data.window.start;
  return {
    ...data,
    memes: data.memes.map((m) => normalizeMeme(m, start)),
  };
}

function normalizeMeme(m: Meme, windowStart: string): Meme {
  const nodes = flatten(m.forest);
  const days = nodes
    .map((n) => utcDay(n.created_at))
    .filter((d): d is string => Boolean(d))
    .map((d) => (d < windowStart ? windowStart : d));
  const firstDay = days.length ? [...days].sort()[0] : windowStart;
  const first_seen = clampToWindow(m.first_seen, windowStart) ?? `${firstDay}T00:00:00Z`;

  const buckets = new Map<string, Meme["series"][number]>();
  for (const s of m.series) {
    const day = s.t < windowStart ? windowStart : s.t;
    const prev = buckets.get(day);
    if (!prev) {
      buckets.set(day, { ...s, t: day });
    } else {
      buckets.set(day, {
        t: day,
        tweets: prev.tweets + s.tweets,
        likes: prev.likes + s.likes,
        views: prev.views + s.views,
        quotes: prev.quotes + s.quotes,
      });
    }
  }

  return {
    ...m,
    first_seen,
    series: [...buckets.values()].sort((a, b) => a.t.localeCompare(b.t)),
  };
}
