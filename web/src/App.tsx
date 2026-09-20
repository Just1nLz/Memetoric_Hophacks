import { useEffect, useMemo, useRef, useState } from "react";
import { AnalyticsPanel } from "./components/AnalyticsPanel";
import { AppShell } from "./components/AppShell";
import { CommandPalette } from "./components/CommandPalette";
import { GrokAssistant, GrokFab } from "./components/GrokAssistant";
import { LineageToolbar } from "./components/LineageToolbar";
import { MemeHeader } from "./components/MemeHeader";
import { MemeSidebar } from "./components/MemeSidebar";
import { NodeContextMenu } from "./components/NodeContextMenu";
import { NodeDetailsDrawer } from "./components/NodeDetailsDrawer";
import { TimelinePlayer } from "./components/TimelinePlayer";
import { TreeCanvas, type LineageCanvasHandle } from "./components/TreeCanvas";
import { clampToWindow, ts, utcDay } from "./format";
import { memeTerms } from "./highlight";
import { flatten, languageKey, postUrl, pruneConsumerForest, treesByLanguage } from "./layout";
import {
  DEFAULT_FILTERS,
  appearHour,
  hourFloor,
  lineageBundle,
  nodePassesFilters,
  pruneToIds,
  relatedIds,
  type LineageFilters,
} from "./lineage";
import { mutationsByDay } from "./saturation";
import type { Catalog, EdgeKind, Meme, TweetNode } from "./types";

export default function App() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [slug, setSlug] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [step, setStep] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [edges, setEdges] = useState<Set<EdgeKind>>(new Set(["reply", "quote", "mutation"]));
  const [langKey, setLangKey] = useState<string | null>(null);
  const [treeMode, setTreeMode] = useState<"consumer" | "researcher">("consumer");
  const [filters, setFilters] = useState<LineageFilters>(DEFAULT_FILTERS);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [grokOpen, setGrokOpen] = useState(false);
  const [grokMode, setGrokMode] = useState<"ask" | "create">("ask");
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [focusBranch, setFocusBranch] = useState(false);
  const [inspected, setInspected] = useState(false);
  const [scalePct, setScalePct] = useState(100);
  const [ctx, setCtx] = useState<{ id: string; x: number; y: number } | null>(null);
  const canvasRef = useRef<LineageCanvasHandle>(null);
  const pendingSelect = useRef<string | null>(null);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}catalog.json`)
      .then((r) => {
        if (!r.ok) throw new Error("catalog missing");
        return r.json() as Promise<Catalog>;
      })
      .then((data) => {
        const normalized = normalizeCatalog(data);
        setCatalog(normalized);
        setSlug(normalized.memes[0]?.slug ?? null);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const meme = catalog?.memes.find((m) => m.slug === slug) ?? catalog?.memes[0] ?? null;
  const terms = useMemo(() => (meme ? memeTerms(meme.name, meme.query) : []), [meme]);
  const langTrees = useMemo(
    () =>
      meme && catalog
        ? treesByLanguage(meme.forest, catalog.window.start, terms, meme.name, meme.query)
        : [],
    [meme, catalog, terms],
  );
  const activeTree = langTrees.find((t) => t.key === langKey) ?? langTrees[0] ?? null;
  const displayForest = useMemo(() => {
    if (!activeTree) return [];
    const base = treeMode === "consumer" ? pruneConsumerForest(activeTree.forest) : activeTree.forest;
    if (!focusBranch || !selected) return base;
    return pruneToIds(base, lineageBundle(base, selected));
  }, [activeTree, treeMode, focusBranch, selected]);
  const lineageNodes = useMemo(() => (activeTree ? flatten(activeTree.forest) : []), [activeTree]);
  const mutByDay = useMemo(() => mutationsByDay(lineageNodes), [lineageNodes]);
  const nodes = useMemo(() => flatten(displayForest), [displayForest]);
  const origin = activeTree?.forest[0] ?? nodes.find((n) => n.edge === "origin") ?? null;
  const originHour = origin ? hourFloor(ts(origin.created_at)) : 0;
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const genCap = Math.max(0, ...nodes.map((n) => n.generation || 0), 1);
  const stamps = useMemo(() => {
    const hours = nodes.map((n) => appearHour(n, originHour)).filter(Boolean);
    return [...new Set(hours)].sort((a, b) => a - b);
  }, [nodes, originHour]);

  useEffect(() => {
    setPlaying(false);
    setDrawerOpen(false);
    setFocusBranch(false);
    setInspected(false);
    setSearchOpen(false);
    setSearchQuery("");
    setFilters(DEFAULT_FILTERS);
    setTreeMode("consumer");
    setGrokOpen(false);
    setAnalyticsOpen(false);
    setFiltersOpen(false);
    setMoreOpen(false);
    const want = pendingSelect.current;
    if (want) return;
    setSelected(null);
    setStep(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meme?.slug, langKey]);

  useEffect(() => {
    const want = pendingSelect.current;
    if (!want || !nodes.some((n) => n.id === want)) return;
    setSelected(want);
    setDrawerOpen(true);
    setInspected(true);
    const node = nodes.find((n) => n.id === want)!;
    const hitHour = Math.floor(ts(node.created_at) / 3_600_000) * 3_600_000;
    const idx = stamps.findIndex((t) => t >= hitHour);
    setStep(idx >= 0 ? idx : Math.max(0, stamps.length - 1));
    pendingSelect.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meme?.slug, langKey, nodes]);

  useEffect(() => {
    if (!meme || !catalog) return;
    const trees = treesByLanguage(
      meme.forest,
      catalog.window.start,
      memeTerms(meme.name, meme.query),
      meme.name,
      meme.query,
    );
    const want = pendingSelect.current;
    if (want) {
      const hit = flatten(meme.forest).find((n) => n.id === want);
      if (hit) {
        const key = languageKey(hit.lang);
        if (trees.some((t) => t.key === key)) {
          setLangKey(key);
          return;
        }
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
    }, Math.max(180, Math.round(650 / speed)));
    return () => window.clearInterval(id);
  }, [playing, stamps.length, speed]);

  const cutoff = stamps[step] ?? Number.POSITIVE_INFINITY;
  const arrivingIds = useMemo(() => {
    const stamp = stamps[step];
    const ids = new Set<string>();
    if (!Number.isFinite(stamp)) return ids;
    for (const n of nodes) {
      if (appearHour(n, originHour) === stamp) ids.add(n.id);
    }
    return ids;
  }, [nodes, stamps, step, originHour]);
  const visible = useMemo(() => {
    const ids = new Set<string>();
    if (origin) ids.add(origin.id);
    if (step === 0 && !playing) return ids;
    for (const n of nodes) {
      if (appearHour(n, originHour) > cutoff) continue;
      if (!nodePassesFilters(n, filters, origin?.id)) continue;
      ids.add(n.id);
    }
    return ids;
  }, [nodes, cutoff, origin, originHour, filters, step, playing]);

  useEffect(() => {
    if (!selected) return;
    if (!nodes.some((n) => n.id === selected)) {
      setSelected(null);
      setDrawerOpen(false);
      setFocusBranch(false);
    }
  }, [treeMode, nodes, selected]);

  useEffect(() => {
    if (stamps.length === 0) return;
    if (step > stamps.length - 1) setStep(stamps.length - 1);
  }, [stamps.length, step]);

  const selectedNode: TweetNode | null = selected ? (byId.get(selected) ?? null) : null;
  const parentNode =
    selectedNode?.parent_id != null ? (byId.get(selectedNode.parent_id) ?? null) : null;
  const related = selectedNode ? relatedIds(selectedNode) : null;

  const searchHits = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    return nodes
      .filter(
        (n) =>
          n.body.toLowerCase().includes(q) ||
          (n.edge_label ?? "").toLowerCase().includes(q) ||
          n.edge.includes(q),
      )
      .slice(0, 16);
  }, [nodes, searchQuery]);
  const searchHitIds = useMemo(() => new Set(searchHits.map((n) => n.id)), [searchHits]);

  const inspect = (id: string) => {
    setSelected(id);
    setDrawerOpen(true);
    setInspected(true);
    setCtx(null);
  };

  const pickNode = (node: TweetNode, memeSlug?: string) => {
    setPlaying(false);
    pendingSelect.current = node.id;
    if (memeSlug && memeSlug !== slug) {
      setSlug(memeSlug);
      return;
    }
    inspect(node.id);
    const hitHour = Math.floor(ts(node.created_at) / 3_600_000) * 3_600_000;
    const idx = stamps.findIndex((t) => t >= hitHour);
    if (idx >= 0) setStep(idx);
    canvasRef.current?.focusNode(node.id);
    setSearchOpen(false);
  };

  const toggleEdge = (k: EdgeKind) => {
    setEdges((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const jumpOrigin = () => {
    setPlaying(false);
    setSelected(origin?.id ?? null);
    canvasRef.current?.origin();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen(true);
        return;
      }
      if (e.key !== "Escape") return;
      if (commandOpen) {
        setCommandOpen(false);
        return;
      }
      if (ctx) {
        setCtx(null);
        return;
      }
      if (grokOpen) {
        setGrokOpen(false);
        return;
      }
      if (analyticsOpen) {
        setAnalyticsOpen(false);
        return;
      }
      if (filtersOpen || moreOpen) {
        setFiltersOpen(false);
        setMoreOpen(false);
        return;
      }
      if (searchOpen) {
        setSearchOpen(false);
        return;
      }
      if (drawerOpen) {
        setDrawerOpen(false);
        return;
      }
      if (selected) {
        setSelected(null);
        setFocusBranch(false);
        return;
      }
      if (navOpen) setNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commandOpen, ctx, grokOpen, analyticsOpen, filtersOpen, moreOpen, searchOpen, drawerOpen, selected, navOpen]);

  const genNow = Math.max(0, ...nodes.filter((n) => visible.has(n.id)).map((n) => n.generation || 0));
  const genMax = Math.max(0, ...nodes.map((n) => n.generation || 0));
  const familyGens = Math.max(0, ...lineageNodes.map((n) => n.generation || 0));

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
    <AppShell
      sidebarCollapsed={sidebarCollapsed}
      navOpen={navOpen}
      drawerOpen={drawerOpen}
      sidebar={
        <MemeSidebar
          memes={catalog.memes}
          slug={meme.slug}
          collapsed={sidebarCollapsed}
          mobileOpen={navOpen}
          onToggleCollapsed={() => setSidebarCollapsed((c) => !c)}
          onCloseMobile={() => setNavOpen(false)}
          onSelect={setSlug}
        />
      }
      workspace={
        <>
          <MemeHeader
            name={meme.name}
            blurb={meme.blurb}
            nodes={lineageNodes.length}
            generations={familyGens}
            language={activeTree.name}
            firstSeen={meme.first_seen}
            series={meme.series}
            onOpenNav={() => setNavOpen(true)}
            onOpenAnalytics={() => {
              setGrokOpen(false);
              setAnalyticsOpen(true);
            }}
          />
          <LineageToolbar
            scalePct={scalePct}
            searchOpen={searchOpen}
            searchQuery={searchQuery}
            searchHits={searchHits}
            filtersOpen={filtersOpen}
            moreOpen={moreOpen}
            filters={filters}
            genCap={genCap}
            edges={edges}
            langTrees={langTrees}
            langKey={activeTree.key}
            treeMode={treeMode}
            onOrigin={jumpOrigin}
            onFit={() => canvasRef.current?.fit()}
            onZoom={(d) => canvasRef.current?.zoomBy(d)}
            onToggleSearch={() => {
              setSearchOpen((o) => !o);
              setFiltersOpen(false);
              setMoreOpen(false);
            }}
            onSearchQuery={setSearchQuery}
            onPickHit={(node) => pickNode(node)}
            onToggleFilters={() => {
              setFiltersOpen((o) => !o);
              setMoreOpen(false);
              setSearchOpen(false);
            }}
            onToggleMore={() => {
              setMoreOpen((o) => !o);
              setFiltersOpen(false);
            }}
            onFilters={setFilters}
            onToggleEdge={toggleEdge}
            onLang={(key) => {
              pendingSelect.current = null;
              setLangKey(key);
            }}
            onTreeMode={setTreeMode}
            onOpenAnalytics={() => {
              setGrokOpen(false);
              setAnalyticsOpen(true);
              setMoreOpen(false);
            }}
            onAskGrok={() => {
              setAnalyticsOpen(false);
              setGrokOpen(true);
              setGrokMode("ask");
              setMoreOpen(false);
            }}
          />
          <div className="graph-stage">
            <TreeCanvas
              ref={canvasRef}
              key={`${meme.slug}-${activeTree.key}-${treeMode}-${focusBranch ? selected : "full"}`}
              forest={displayForest}
              visible={visible}
              selected={selected}
              related={related}
              searchHits={searchHitIds}
              onSelect={inspect}
              onFocusSubtree={(id) => {
                inspect(id);
                setFocusBranch(true);
                canvasRef.current?.focusNode(id);
              }}
              onContextMenu={(id, x, y) => {
                setSelected(id);
                setCtx({ id, x, y });
              }}
              edgeFilter={new Set<EdgeKind>([...edges, "origin"])}
              terms={terms}
              pulse={playing ? arrivingIds : step === 0 ? origin?.id ?? null : null}
              playing={playing}
              series={meme.series}
              onViewChange={setScalePct}
              hint={inspected ? null : "Lime origin · blue reply · orange quote · gold dashed mutation. Scroll to zoom."}
              focusBanner={focusBranch}
              onClearFocus={() => setFocusBranch(false)}
            />
            <GrokFab
              onClick={() => {
                setAnalyticsOpen(false);
                setGrokOpen(true);
                setGrokMode("ask");
              }}
            />
            <AnalyticsPanel
              open={analyticsOpen}
              nodes={lineageNodes}
              series={meme.series}
              peakDay={meme.saturation?.peak}
              mutations={mutByDay}
              activeDay={stamps[step] ? utcDay(new Date(stamps[step]).toISOString()) : null}
              selectedId={selected}
              onInspect={(id) => {
                const node = lineageNodes.find((n) => n.id === id);
                if (node) pickNode(node);
              }}
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
              onClose={() => setAnalyticsOpen(false)}
            />
            {grokOpen && (
              <GrokAssistant
                open
                mode={grokMode}
                memeName={meme.name}
                memeBlurb={meme.blurb}
                node={selectedNode}
                parent={parentNode}
                onClose={() => setGrokOpen(false)}
                onMode={setGrokMode}
              />
            )}
          </div>
          <TimelinePlayer
            stamps={stamps}
            index={step}
            playing={playing}
            speed={speed}
            generation={genNow}
            generationMax={genMax}
            onIndex={(i) => {
              setPlaying(false);
              setStep(i);
            }}
            onToggle={() => {
              if (!playing && step >= stamps.length - 1) {
                setStep(0);
              }
              setPlaying((p) => !p);
            }}
            onSpeed={setSpeed}
          />
        </>
      }
      drawer={
        <NodeDetailsDrawer
          open={drawerOpen}
          node={selectedNode}
          parent={parentNode}
          terms={terms}
          family={lineageNodes}
          series={meme.series}
          focusOn={focusBranch}
          onClose={() => setDrawerOpen(false)}
          onFocusBranch={() => {
            if (selected) {
              setFocusBranch(true);
              canvasRef.current?.focusNode(selected);
            }
          }}
          onClearFocus={() => setFocusBranch(false)}
          onAskGrok={() => {
            setAnalyticsOpen(false);
            setGrokOpen(true);
            setGrokMode("ask");
          }}
        />
      }
      overlays={
        <>
          <CommandPalette
            open={commandOpen}
            catalog={catalog}
            onClose={() => setCommandOpen(false)}
            onFindMeme={setSlug}
            onFindNode={(s, node) => pickNode(node, s)}
            onAskGrok={() => {
              setAnalyticsOpen(false);
              setGrokOpen(true);
              setGrokMode("ask");
            }}
            onOrigin={jumpOrigin}
            onFit={() => canvasRef.current?.fit()}
            onAnalytics={() => {
              setGrokOpen(false);
              setAnalyticsOpen(true);
            }}
          />
          {ctx && selectedNode && (
            <NodeContextMenu
              x={ctx.x}
              y={ctx.y}
              node={selectedNode}
              onClose={() => setCtx(null)}
              onFocus={() => {
                inspect(ctx.id);
                setFocusBranch(true);
                canvasRef.current?.focusNode(ctx.id);
                setCtx(null);
              }}
              onAsk={() => {
                inspect(ctx.id);
                setGrokOpen(true);
                setGrokMode("ask");
                setCtx(null);
              }}
              onOpen={() => {
                window.open(postUrl(selectedNode), "_blank", "noreferrer");
                setCtx(null);
              }}
            />
          )}
        </>
      }
    />
  );
}

function nodeCount(m: Meme): number {
  return m.stats?.nodes ?? flatten(m.forest).length;
}

function normalizeCatalog(data: Catalog): Catalog {
  const start = data.window.start;
  return {
    ...data,
    memes: data.memes
      .map((m) => normalizeMeme(m, start))
      .sort((a, b) => nodeCount(b) - nodeCount(a) || a.name.localeCompare(b.name)),
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
        ...prev,
        ...s,
        t: day,
        tweets: prev.tweets + s.tweets,
        likes: prev.likes + s.likes,
        views: (prev.views || 0) + (s.views || 0),
        quotes: (prev.quotes || 0) + (s.quotes || 0),
      });
    }
  }

  return {
    ...m,
    first_seen,
    series: [...buckets.values()].sort((a, b) => a.t.localeCompare(b.t)),
  };
}
