import { useEffect, useMemo, useRef, useState } from "react";
import type { EdgeKind, LaidOut, TweetNode } from "../types";
import { engagement, layoutForest, radius } from "../layout";
import { compact } from "../format";

const EDGE_COLOR: Record<EdgeKind, string> = {
  origin: "#d6ff4b",
  reply: "#8eb8ff",
  quote: "#ff8a5b",
  mutation: "#e8d27a",
};

type Props = {
  forest: TweetNode[];
  visible: Set<string>;
  selected: string | null;
  onSelect: (id: string) => void;
  edgeFilter: Set<EdgeKind>;
};

export function TreeCanvas({ forest, visible, selected, onSelect, edgeFilter }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<string | null>(null);
  const laid = useMemo(() => layoutForest(forest), [forest]);
  const nodes = [...laid.values()];
  const maxX = nodes.reduce((m, n) => Math.max(m, n.x), 400);
  const maxY = nodes.reduce((m, n) => Math.max(m, n.y), 300);
  const width = maxX + 280;
  const height = maxY + 120;

  const links: { from: LaidOut; to: LaidOut }[] = [];
  for (const item of nodes) {
    if (!item.node.parent_id) continue;
    const parent = laid.get(item.node.parent_id);
    if (parent) links.push({ from: parent, to: item });
  }

  useEffect(() => {
    const root = forest[0];
    if (root && wrap.current) {
      wrap.current.scrollTo({ left: 0, top: Math.max(0, (laid.get(root.id)?.y ?? 0) - 180) });
    }
  }, [forest, laid]);

  return (
    <div className="canvas" ref={wrap}>
      <svg width={width} height={height} className="tree">
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2.4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {links.map(({ from, to }) => {
          const alive = visible.has(to.node.id) && visible.has(from.node.id);
          const allowed = edgeFilter.has(to.node.edge);
          const d = cubic(from.x + 18, from.y, to.x - 18, to.y);
          return (
            <path
              key={`${from.node.id}-${to.node.id}`}
              d={d}
              className={`link ${to.node.edge} ${alive && allowed ? "on" : "off"}`}
              stroke={EDGE_COLOR[to.node.edge]}
            />
          );
        })}
        {nodes.map((item) => {
          const n = item.node;
          const alive = visible.has(n.id);
          const allowed = n.edge === "origin" || edgeFilter.has(n.edge);
          const r = radius(n);
          const active = selected === n.id || hover === n.id;
          const snippet = n.body.replace(/\s+/g, " ").slice(0, 42);
          return (
            <g
              key={n.id}
              transform={`translate(${item.x},${item.y})`}
              className={`node ${alive && allowed ? "on" : "off"} ${active ? "active" : ""}`}
              onMouseEnter={() => setHover(n.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onSelect(n.id)}
              style={{ cursor: "pointer" }}
            >
              <circle r={r + 6} className="halo" />
              <circle r={r} className={`dot ${n.edge}`} filter={active ? "url(#glow)" : undefined} />
              <text x={0} y={r + 14} textAnchor="middle" className="genmark">
                {n.generation}
              </text>
              {active && (
                <>
                  <text x={r + 12} y={-8} className="label">
                    {snippet}
                    {n.body.length > 42 ? "…" : ""}
                  </text>
                  <text x={r + 12} y={10} className="meta">
                    gen {n.generation} · {n.edge} · {compact(n.like_count)} likes · {n.lang}
                  </text>
                </>
              )}
            </g>
          );
        })}
      </svg>
      {nodes.length === 0 && <div className="empty">No lineage in this slice.</div>}
      <div className="hint">
        Node size tracks engagement (likes, quotes, views). Branches are replies, quotes, or inferred mutations.
      </div>
      {hover && laid.get(hover) && (
        <div
          className="float-card"
          style={{
            left: Math.min(laid.get(hover)!.x + 36, width - 280),
            top: laid.get(hover)!.y + 28,
          }}
        >
          <p>{laid.get(hover)!.node.body}</p>
          <small>
            {compact(engagement(laid.get(hover)!.node))} weighted engagement
          </small>
        </div>
      )}
    </div>
  );
}

function cubic(x1: number, y1: number, x2: number, y2: number): string {
  const mx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
}
