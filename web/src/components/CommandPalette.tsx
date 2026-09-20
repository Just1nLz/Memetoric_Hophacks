import { useEffect, useMemo, useRef, useState } from "react";
import { when } from "../format";
import { flatten } from "../layout";
import type { Catalog, TweetNode } from "../types";

type Props = {
  open: boolean;
  catalog: Catalog;
  onClose: () => void;
  onFindMeme: (slug: string) => void;
  onFindNode: (slug: string, node: TweetNode) => void;
  onAskGrok: () => void;
  onOrigin: () => void;
  onFit: () => void;
  onAnalytics: () => void;
};

type Row =
  | { kind: "action"; id: string; label: string; hint: string; run: () => void }
  | { kind: "meme"; id: string; label: string; hint: string; run: () => void }
  | { kind: "node"; id: string; label: string; hint: string; run: () => void };

export function CommandPalette({
  open,
  catalog,
  onClose,
  onFindMeme,
  onFindNode,
  onAskGrok,
  onOrigin,
  onFit,
  onAnalytics,
}: Props) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const actions: Row[] = (
      [
        { kind: "action", id: "origin", label: "Jump to origin", hint: "Tree", run: onOrigin },
        { kind: "action", id: "fit", label: "Fit tree", hint: "Tree", run: onFit },
        { kind: "action", id: "grok", label: "Ask Grok", hint: "AI", run: onAskGrok },
        { kind: "action", id: "analytics", label: "Open analytics", hint: "Charts", run: onAnalytics },
      ] satisfies Row[]
    ).filter((a) => !needle || a.label.toLowerCase().includes(needle));

    const memes: Row[] = catalog.memes
      .filter((m) => !needle || m.name.toLowerCase().includes(needle) || m.query.toLowerCase().includes(needle))
      .slice(0, 8)
      .map((m) => ({
        kind: "meme" as const,
        id: `meme-${m.slug}`,
        label: m.name,
        hint: "Meme",
        run: () => onFindMeme(m.slug),
      }));

    const nodes: Row[] = [];
    if (needle.length >= 2) {
      for (const m of catalog.memes) {
        for (const node of flatten(m.forest)) {
          if (!node.body.toLowerCase().includes(needle)) continue;
          nodes.push({
            kind: "node",
            id: `node-${m.slug}-${node.id}`,
            label: node.body.replace(/\s+/g, " ").slice(0, 88),
            hint: `${m.name} · gen ${node.generation} · ${when(node.created_at)}`,
            run: () => onFindNode(m.slug, node),
          });
          if (nodes.length >= 10) break;
        }
        if (nodes.length >= 10) break;
      }
    }

    return [...actions, ...memes, ...nodes];
  }, [catalog, q, onAskGrok, onOrigin, onFit, onAnalytics, onFindMeme, onFindNode]);

  useEffect(() => {
    setActive(0);
  }, [q]);

  if (!open) return null;

  const run = (row: Row) => {
    row.run();
    onClose();
  };

  return (
    <div className="cmdk-scrim" onMouseDown={onClose}>
      <div
        className="cmdk"
        role="dialog"
        aria-label="Command palette"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Find meme, find node, ask Grok…"
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => Math.min(rows.length - 1, i + 1));
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(0, i - 1));
            }
            if (e.key === "Enter" && rows[active]) {
              e.preventDefault();
              run(rows[active]);
            }
            if (e.key === "Escape") onClose();
          }}
        />
        <ul>
          {rows.length === 0 && <li className="cmdk-empty">No matches.</li>}
          {rows.map((row, i) => (
            <li key={row.id}>
              <button type="button" className={i === active ? "on" : ""} onClick={() => run(row)}>
                <span>{row.label}</span>
                <em>{row.hint}</em>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
