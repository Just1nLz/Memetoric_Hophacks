import { useEffect, useId, useRef } from "react";
import type { EdgeKind, TweetNode } from "../types";
import type { LineageFilters } from "../lineage";

type LangTree = { key: string; name: string; count: number };

type Props = {
  scalePct: number;
  searchOpen: boolean;
  searchQuery: string;
  searchHits: TweetNode[];
  filtersOpen: boolean;
  moreOpen: boolean;
  filters: LineageFilters;
  genCap: number;
  edges: Set<EdgeKind>;
  langTrees: LangTree[];
  langKey: string | null;
  treeMode: "consumer" | "researcher";
  onOrigin: () => void;
  onFit: () => void;
  onZoom: (delta: number) => void;
  onToggleSearch: () => void;
  onSearchQuery: (q: string) => void;
  onPickHit: (node: TweetNode) => void;
  onToggleFilters: () => void;
  onToggleMore: () => void;
  onFilters: (next: LineageFilters) => void;
  onToggleEdge: (k: EdgeKind) => void;
  onLang: (key: string) => void;
  onTreeMode: (mode: "consumer" | "researcher") => void;
  onOpenAnalytics: () => void;
  onAskGrok: () => void;
};

export function LineageToolbar({
  scalePct,
  searchOpen,
  searchQuery,
  searchHits,
  filtersOpen,
  moreOpen,
  filters,
  genCap,
  edges,
  langTrees,
  langKey,
  treeMode,
  onOrigin,
  onFit,
  onZoom,
  onToggleSearch,
  onSearchQuery,
  onPickHit,
  onToggleFilters,
  onToggleMore,
  onFilters,
  onToggleEdge,
  onLang,
  onTreeMode,
  onOpenAnalytics,
  onAskGrok,
}: Props) {
  const searchRef = useRef<HTMLInputElement>(null);
  const searchWrap = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    if (!filtersOpen && !moreOpen && !searchOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      if (filtersOpen) onToggleFilters();
      if (moreOpen) onToggleMore();
      if (searchOpen) onToggleSearch();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [filtersOpen, moreOpen, searchOpen, onToggleFilters, onToggleMore, onToggleSearch]);

  const showMenu = searchOpen && searchQuery.trim().length >= 2;

  return (
    <div className="lineage-toolbar" ref={rootRef}>
      <button type="button" className="tool-btn" onClick={onOrigin}>
        Origin
      </button>
      <button type="button" className="tool-btn" onClick={onFit}>
        Fit
      </button>
      <div className="zoom-cluster">
        <button type="button" className="tool-btn icon" aria-label="Zoom out" onClick={() => onZoom(-0.12)}>
          −
        </button>
        <span className="zoom-pct">{scalePct}%</span>
        <button type="button" className="tool-btn icon" aria-label="Zoom in" onClick={() => onZoom(0.12)}>
          +
        </button>
      </div>

      <div className={`tool-search ${searchOpen ? "open" : ""}`} ref={searchWrap}>
        {searchOpen ? (
          <>
            <input
              ref={searchRef}
              role="combobox"
              aria-expanded={showMenu}
              aria-controls={listId}
              aria-autocomplete="list"
              value={searchQuery}
              onChange={(e) => onSearchQuery(e.target.value)}
              placeholder="Search tweets, mutations, branches…"
              autoComplete="off"
              onKeyDown={(e) => {
                if (e.key === "Escape") onToggleSearch();
                if (e.key === "Enter" && searchHits[0]) {
                  e.preventDefault();
                  onPickHit(searchHits[0]);
                }
              }}
            />
            {showMenu && (
              <div className="search-menu toolbar-search-menu" id={listId} role="listbox">
                {searchHits.length === 0 ? (
                  <p className="search-empty">No nodes match “{searchQuery.trim()}”.</p>
                ) : (
                  <ul>
                    {searchHits.map((node) => (
                      <li key={node.id}>
                        <button type="button" role="option" onClick={() => onPickHit(node)}>
                          <span className="search-meme">
                            gen {node.generation} · {node.edge}
                          </span>
                          <span className="search-body">{snippet(node.body, searchQuery)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        ) : (
          <button type="button" className="tool-btn" onClick={onToggleSearch}>
            Search nodes
          </button>
        )}
      </div>

      <div className="tool-pop-wrap">
        <button type="button" className={`tool-btn ${filtersOpen ? "on" : ""}`} onClick={onToggleFilters}>
          Filters
        </button>
        {filtersOpen && (
          <div className="tool-pop">
            <p className="kicker">Language</p>
            <div className="chip-row">
              {langTrees.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  className={t.key === langKey ? "on" : ""}
                  onClick={() => onLang(t.key)}
                >
                  {t.name}
                </button>
              ))}
            </div>
            <p className="kicker tight">Mutation type</p>
            {(["reply", "quote", "mutation"] as const).map((k) => (
              <label key={k} className="check-row">
                <input type="checkbox" checked={edges.has(k)} onChange={() => onToggleEdge(k)} />
                {k}
              </label>
            ))}
            <p className="kicker tight">Minimum likes</p>
            <input
              type="range"
              min={0}
              max={5000}
              step={50}
              value={filters.minLikes}
              onChange={(e) => onFilters({ ...filters, minLikes: Number(e.target.value) })}
            />
            <span className="filter-readout">{filters.minLikes}</span>
            <p className="kicker tight">Generation</p>
            <div className="gen-range">
              <input
                type="number"
                min={0}
                max={genCap}
                value={filters.minGen}
                onChange={(e) => onFilters({ ...filters, minGen: Number(e.target.value) })}
              />
              <span>to</span>
              <input
                type="number"
                min={0}
                max={genCap}
                value={Math.min(filters.maxGen, genCap)}
                onChange={(e) => onFilters({ ...filters, maxGen: Number(e.target.value) })}
              />
            </div>
            <p className="kicker tight">From date</p>
            <input
              type="date"
              value={filters.fromDay ?? ""}
              onChange={(e) => onFilters({ ...filters, fromDay: e.target.value || null })}
            />
            <p className="kicker tight">Confidence</p>
            <div className="chip-row">
              {(["all", "direct", "inferred"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  className={filters.confidence === c ? "on" : ""}
                  onClick={() => onFilters({ ...filters, confidence: c })}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="tool-pop-wrap">
        <button type="button" className={`tool-btn icon ${moreOpen ? "on" : ""}`} aria-label="More" onClick={onToggleMore}>
          •••
        </button>
        {moreOpen && (
          <div className="tool-pop more-pop">
            <p className="kicker">Tree density</p>
            <div className="chip-row">
              <button type="button" className={treeMode === "consumer" ? "on" : ""} onClick={() => onTreeMode("consumer")}>
                Spine
              </button>
              <button
                type="button"
                className={treeMode === "researcher" ? "on" : ""}
                onClick={() => onTreeMode("researcher")}
              >
                Full forest
              </button>
            </div>
            <button type="button" className="menu-item" onClick={onOpenAnalytics}>
              Open analytics
            </button>
            <button type="button" className="menu-item" onClick={onAskGrok}>
              Ask Grok
            </button>
            <p className="muted tiny">⌘/Ctrl+K command palette</p>
          </div>
        )}
      </div>
    </div>
  );
}

function snippet(body: string, query: string): string {
  const clean = body.replace(/\s+/g, " ").trim();
  const q = query.trim().toLowerCase();
  const idx = clean.toLowerCase().indexOf(q);
  if (idx < 0) return clean.length > 90 ? `${clean.slice(0, 89)}…` : clean;
  const start = Math.max(0, idx - 20);
  const end = Math.min(clean.length, idx + q.length + 56);
  return `${start > 0 ? "…" : ""}${clean.slice(start, end)}${end < clean.length ? "…" : ""}`;
}
