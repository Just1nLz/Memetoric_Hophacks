import { useState } from "react";
import type { Meme } from "../types";

type Props = {
  memes: Meme[];
  slug: string;
  collapsed: boolean;
  mobileOpen: boolean;
  onToggleCollapsed: () => void;
  onCloseMobile: () => void;
  onSelect: (slug: string) => void;
};

export function MemeSidebar({
  memes,
  slug,
  collapsed,
  mobileOpen,
  onToggleCollapsed,
  onCloseMobile,
  onSelect,
}: Props) {
  const [q, setQ] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const needle = q.trim().toLowerCase();
  const shown = needle
    ? memes.filter(
        (m) =>
          m.name.toLowerCase().includes(needle) ||
          m.query.toLowerCase().includes(needle) ||
          m.slug.includes(needle),
      )
    : memes;

  return (
    <>
      {mobileOpen && <button type="button" className="nav-scrim" aria-label="Close navigation" onClick={onCloseMobile} />}
      <aside className={`sidebar ${collapsed ? "collapsed" : ""} ${mobileOpen ? "mobile-open" : ""}`}>
        <div className="sidebar-brand">
          <span className="mark">M</span>
          <div className="brand-text">
            <strong>Memetoric</strong>
            <p>Lineage Observatory</p>
            <p>X Firehose</p>
          </div>
          <button
            type="button"
            className="icon-btn collapse-btn"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={onToggleCollapsed}
          >
            {collapsed ? "›" : "‹"}
          </button>
        </div>

        <div className="sidebar-search">
          {collapsed && !searchOpen ? (
            <button
              type="button"
              className="icon-btn"
              aria-label="Search memes"
              onClick={() => {
                onToggleCollapsed();
                setSearchOpen(true);
              }}
            >
              ⌕
            </button>
          ) : (
            <label className="sidebar-search-field">
              <span aria-hidden>⌕</span>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Find a meme"
                autoComplete="off"
              />
            </label>
          )}
        </div>

        <p className="kicker sidebar-kicker">Tracked memes</p>
        <p className="sidebar-count">{memes.length} families</p>
        <ul className="meme-list">
          {shown.map((m) => (
            <li key={m.slug}>
              <button
                type="button"
                className={m.slug === slug ? "on" : ""}
                title={m.name}
                onClick={() => {
                  onSelect(m.slug);
                  onCloseMobile();
                }}
              >
                <span className="meme-glyph" aria-hidden>
                  {m.name.slice(0, 1)}
                </span>
                <span className="name">{m.name}</span>
                <span className="q">{m.query}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
    </>
  );
}
