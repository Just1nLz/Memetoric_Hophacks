import { useEffect, useMemo, useState } from "react";
import { Inspector } from "./components/Inspector";
import { Timeline } from "./components/Timeline";
import { TreeCanvas } from "./components/TreeCanvas";
import { Volume } from "./components/Charts";
import { compact, ts, when } from "./format";
import { flatten } from "./layout";
import type { Catalog, EdgeKind, TweetNode } from "./types";

export default function App() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [slug, setSlug] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [playing, setPlaying] = useState(false);
  const [step, setStep] = useState(0);
  const [edges, setEdges] = useState<Set<EdgeKind>>(new Set(["reply", "quote", "mutation"]));

  useEffect(() => {
    fetch("/catalog.json")
      .then((r) => {
        if (!r.ok) throw new Error("catalog missing");
        return r.json();
      })
      .then((data: Catalog) => {
        setCatalog(data);
        setSlug(data.memes[0]?.slug ?? null);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const meme = catalog?.memes.find((m) => m.slug === slug) ?? catalog?.memes[0] ?? null;
  const nodes = useMemo(() => (meme ? flatten(meme.forest) : []), [meme]);
  const stamps = useMemo(() => {
    const hours = nodes
      .map((n) => ts(n.created_at))
      .filter(Boolean)
      .map((t) => Math.floor(t / 3_600_000) * 3_600_000);
    return [...new Set(hours)].sort((a, b) => a - b);
  }, [nodes]);

  useEffect(() => {
    setStep(Math.max(0, stamps.length - 1));
    setSelected(meme?.forest[0]?.id ?? null);
    setPlaying(false);
  }, [meme?.slug, stamps.length]);

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
    const q = query.trim().toLowerCase();
    const ids = new Set<string>();
    for (const n of nodes) {
      if (Math.floor(ts(n.created_at) / 3_600_000) * 3_600_000 > cutoff) continue;
      if (q && !n.body.toLowerCase().includes(q) && n.edge !== "origin") continue;
      ids.add(n.id);
    }
    return ids;
  }, [nodes, cutoff, query]);

  const selectedNode: TweetNode | null =
    nodes.find((n) => n.id === selected) ?? nodes.find((n) => n.edge === "origin") ?? nodes[0] ?? null;
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const parent = selectedNode?.parent_id ? byId.get(selectedNode.parent_id) ?? null : null;

  const toggleEdge = (k: EdgeKind) => {
    setEdges((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  if (error) {
    return (
      <div className="boot">
        <h1>Memetoric</h1>
        <p>Couldn’t load the catalog. Run <code>python scripts/build_catalog.py</code> then refresh.</p>
      </div>
    );
  }

  if (!catalog || !meme) {
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
          </div>
          <dl className="stats">
            <Stat k="nodes" v={String(meme.stats.nodes)} />
            <Stat k="mutations" v={String(meme.stats.mutations)} />
            <Stat k="langs" v={String(meme.stats.languages.length)} />
            <Stat k="first seen" v={when(meme.first_seen)} />
          </dl>
        </div>
        <div className="toolbar">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter variants in this family"
          />
          <Volume series={meme.series} />
        </div>
        <TreeCanvas
          forest={meme.forest}
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

      <Inspector node={selectedNode} parent={parent} memeName={meme?.name ?? ""} />
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
