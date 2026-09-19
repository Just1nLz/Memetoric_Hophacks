import { useEffect, useId, useMemo, useRef, useState } from "react";
import { when } from "../format";
import type { Catalog, TweetNode } from "../types";
import { flatten, languageName } from "../layout";

export type SearchHit = {
  memeSlug: string;
  memeName: string;
  node: TweetNode;
};

type Props = {
  catalog: Catalog;
  query: string;
  onQuery: (q: string) => void;
  onPick: (hit: SearchHit) => void;
};

export function KeywordSearch({ catalog, query, onQuery, onPick }: Props) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const listId = useId();

  const hits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const out: SearchHit[] = [];
    for (const m of catalog.memes) {
      for (const node of flatten(m.forest)) {
        if (!node.body.toLowerCase().includes(q)) continue;
        out.push({ memeSlug: m.slug, memeName: m.name, node });
        if (out.length >= 28) return out;
      }
    }
    return out;
  }, [catalog, query]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const showMenu = open && query.trim().length >= 2;

  return (
    <div className="keyword-search" ref={wrap}>
      <label className="keyword-label" htmlFor="meme-keyword">
        Keyword search
      </label>
      <input
        id="meme-keyword"
        role="combobox"
        aria-expanded={showMenu}
        aria-controls={listId}
        aria-autocomplete="list"
        value={query}
        onChange={(e) => {
          onQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          if (e.key === "Enter" && hits[0]) {
            e.preventDefault();
            onPick(hits[0]);
            setOpen(false);
          }
        }}
        placeholder="Search posts across tracked memes…"
        autoComplete="off"
      />
      {showMenu && (
        <div className="search-menu" id={listId} role="listbox">
          {hits.length === 0 ? (
            <p className="search-empty">No posts mention “{query.trim()}”.</p>
          ) : (
            <>
              <p className="search-count">
                {hits.length}
                {hits.length >= 28 ? "+" : ""} matching posts
              </p>
              <ul>
                {hits.map((hit) => (
                  <li key={`${hit.memeSlug}-${hit.node.id}`}>
                    <button
                      type="button"
                      role="option"
                      onClick={() => {
                        onPick(hit);
                        setOpen(false);
                      }}
                    >
                      <span className="search-meme">{hit.memeName}</span>
                      <span className="search-body">{snippet(hit.node.body, query)}</span>
                      <span className="search-meta">
                        {languageName(hit.node.lang)} · gen {hit.node.generation} · {when(hit.node.created_at)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function snippet(body: string, query: string): string {
  const clean = body.replace(/\s+/g, " ").trim();
  const q = query.trim().toLowerCase();
  const idx = clean.toLowerCase().indexOf(q);
  if (idx < 0) return clean.length > 110 ? `${clean.slice(0, 109)}…` : clean;
  const start = Math.max(0, idx - 28);
  const end = Math.min(clean.length, idx + q.length + 72);
  const slice = clean.slice(start, end);
  return `${start > 0 ? "…" : ""}${slice}${end < clean.length ? "…" : ""}`;
}
