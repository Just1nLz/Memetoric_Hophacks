import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import type { EdgeKind, LaidOut, TweetNode } from "../types";
import { edgeAnnotation, influence, layoutForest, postUrl, radius } from "../layout";
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

const SCALE_MIN = 0.4;
const SCALE_MAX = 2.2;

export function TreeCanvas({ forest, visible, selected, onSelect, edgeFilter }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [hoverEdge, setHoverEdge] = useState<string | null>(null);
  const [scale, setScale] = useState(0.72);
  const [pan, setPan] = useState({ x: 24, y: 16 });
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const view = useRef({ scale: 0.72, pan: { x: 24, y: 16 } });
  const pointer = useRef<{ x: number; y: number; over: boolean }>({ x: 0, y: 0, over: false });

  const laid = useMemo(() => layoutForest(forest), [forest]);
  const nodes = [...laid.values()];
  const maxX = nodes.reduce((m, n) => Math.max(m, n.x), 400);
  const maxY = nodes.reduce((m, n) => Math.max(m, n.y), 300);
  const width = maxX + 280;
  const height = maxY + 120;

  const links: { from: LaidOut; to: LaidOut; key: string }[] = [];
  for (const item of nodes) {
    if (!item.node.parent_id) continue;
    const parent = laid.get(item.node.parent_id);
    if (parent) links.push({ from: parent, to: item, key: `${parent.node.id}-${item.node.id}` });
  }

  const applyView = (nextScale: number, nextPan: { x: number; y: number }) => {
    view.current = { scale: nextScale, pan: nextPan };
    setScale(nextScale);
    setPan(nextPan);
  };

  /** Keep the world point under (anchorX, anchorY) fixed on screen while changing scale. */
  const zoomAt = (nextScaleRaw: number, anchorX: number, anchorY: number) => {
    const nextScale = Math.max(SCALE_MIN, Math.min(SCALE_MAX, +nextScaleRaw.toFixed(2)));
    const { scale: prevScale, pan: prevPan } = view.current;
    if (nextScale === prevScale) return;
    const worldX = (anchorX - prevPan.x) / prevScale;
    const worldY = (anchorY - prevPan.y) / prevScale;
    applyView(nextScale, {
      x: anchorX - worldX * nextScale,
      y: anchorY - worldY * nextScale,
    });
  };

  const anchorForSlider = () => {
    const el = wrap.current;
    if (!el) return { x: 0, y: 0 };
    if (pointer.current.over) return { x: pointer.current.x, y: pointer.current.y };
    return { x: el.clientWidth / 2, y: el.clientHeight / 2 };
  };

  const trackPointer = (clientX: number, clientY: number, over: boolean) => {
    const el = wrap.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    pointer.current = {
      x: clientX - rect.left,
      y: clientY - rect.top,
      over,
    };
  };

  const fitToView = () => {
    const el = wrap.current;
    if (!el || nodes.length === 0) return;
    const pad = 48;
    const sx = (el.clientWidth - pad) / width;
    const sy = (el.clientHeight - pad) / height;
    const next = Math.max(SCALE_MIN, Math.min(1.15, Math.min(sx, sy)));
    applyView(next, {
      x: Math.max(12, (el.clientWidth - width * next) / 2),
      y: Math.max(12, (el.clientHeight - height * next) / 2),
    });
  };

  const focusOrigin = () => {
    const el = wrap.current;
    const origin = nodes.find((n) => n.node.edge === "origin") ?? nodes[0];
    if (!el || !origin) return;
    const next = 1;
    applyView(next, {
      x: el.clientWidth * 0.2 - origin.x * next,
      y: el.clientHeight * 0.42 - origin.y * next,
    });
  };

  useEffect(() => {
    const id = window.requestAnimationFrame(focusOrigin);
    return () => window.cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forest]);

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    trackPointer(e.clientX, e.clientY, true);
    const target = e.target as Element;
    if (
      target.closest(".node") ||
      target.closest(".edge-hit") ||
      target.closest(".edge-label") ||
      target.closest("a")
    ) {
      return;
    }
    drag.current = { x: e.clientX, y: e.clientY, panX: view.current.pan.x, panY: view.current.pan.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    trackPointer(e.clientX, e.clientY, true);
    if (!drag.current) return;
    const nextPan = {
      x: drag.current.panX + (e.clientX - drag.current.x),
      y: drag.current.panY + (e.clientY - drag.current.y),
    };
    view.current = { ...view.current, pan: nextPan };
    setPan(nextPan);
  };

  const onPointerUp = () => {
    drag.current = null;
  };

  const onPointerLeave = () => {
    pointer.current = { ...pointer.current, over: false };
  };

  const onWheel = (e: ReactWheelEvent) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    e.preventDefault();
    const el = wrap.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const delta = e.deltaY > 0 ? -0.06 : 0.06;
    zoomAt(view.current.scale + delta, e.clientX - rect.left, e.clientY - rect.top);
  };

  const onSliderZoom = (pct: number) => {
    const anchor = anchorForSlider();
    zoomAt(pct / 100, anchor.x, anchor.y);
  };

  const hoverNode = hover ? laid.get(hover) : null;
  const activeEdge = hoverEdge ? links.find((l) => l.key === hoverEdge) : null;

  return (
    <div className="canvas-shell">
      <div className="zoom-bar" title="Scale the evolution map so large trees stay readable">
        <label>
          <span>Zoom</span>
          <input
            type="range"
            min={40}
            max={220}
            value={Math.round(scale * 100)}
            onChange={(e) => onSliderZoom(Number(e.target.value))}
          />
          <em>{Math.round(scale * 100)}%</em>
        </label>
        <button type="button" onClick={focusOrigin}>
          Focus origin
        </button>
        <button type="button" onClick={fitToView}>
          Fit map
        </button>
        <button type="button" onClick={() => applyView(1, { x: 24, y: 16 })}>
          100%
        </button>
        <span className="zoom-hint">Drag to pan · ⌘/Ctrl+scroll to zoom toward cursor</span>
      </div>

      <div
        className="canvas"
        ref={wrap}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerEnter={(e) => trackPointer(e.clientX, e.clientY, true)}
        onPointerLeave={onPointerLeave}
        onWheel={onWheel}
      >
        <div
          className="canvas-world"
          style={{
            width: width * scale,
            height: height * scale,
            transform: `translate(${pan.x}px, ${pan.y}px)`,
          }}
        >
          <svg
            width={width}
            height={height}
            className="tree"
            style={{ transform: `scale(${scale})`, transformOrigin: "0 0" }}
          >
            <defs>
              <filter id="glow">
                <feGaussianBlur stdDeviation="2.4" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            {links.map(({ from, to, key }) => {
              const alive = visible.has(to.node.id) && visible.has(from.node.id);
              const allowed = edgeFilter.has(to.node.edge);
              const show = alive && allowed;
              const d = cubic(from.x + 22, from.y, to.x - 22, to.y);
              const mid = midpoint(from.x + 22, from.y, to.x - 22, to.y);
              const ann = edgeAnnotation(from.node, to.node);
              const hot = hoverEdge === key || selected === to.node.id;
              return (
                <g key={key} className={`link-group ${show ? "on" : "off"}`}>
                  <path d={d} className={`link ${to.node.edge}`} stroke={EDGE_COLOR[to.node.edge]} />
                  <path
                    d={d}
                    className="edge-hit"
                    onMouseEnter={() => setHoverEdge(key)}
                    onMouseLeave={() => setHoverEdge(null)}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(to.node.id);
                    }}
                  />
                  {show && (
                    <g
                      transform={`translate(${mid.x},${mid.y})`}
                      className={`edge-label ${hot ? "hot" : ""}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect(to.node.id);
                      }}
                      style={{ cursor: "pointer" }}
                    >
                      <rect x={-56} y={-11} width={112} height={22} rx={6} />
                      <text textAnchor="middle" y={5}>
                        {trimLabel(ann.label)}
                      </text>
                      <title>Click to explain: {ann.detail}</title>
                    </g>
                  )}
                </g>
              );
            })}
            {nodes.map((item) => {
              const n = item.node;
              const alive = visible.has(n.id);
              const allowed = n.edge === "origin" || edgeFilter.has(n.edge);
              const r = radius(n);
              const active = selected === n.id || hover === n.id;
              const snippet = n.body.replace(/\s+/g, " ").slice(0, 42);
              const href = postUrl(n);
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
                  <circle r={r + 8} className="halo" />
                  <circle r={r} className={`dot ${n.edge}`} filter={active ? "url(#glow)" : undefined} />
                  {n.edge === "origin" && (
                    <text x={0} y={-r - 10} textAnchor="middle" className="origin-mark">
                      ORIGIN
                    </text>
                  )}
                  <text x={0} y={r + 16} textAnchor="middle" className="genmark">
                    gen {n.generation}
                  </text>
                  {(active || n.edge === "origin") && (
                    <>
                      <text x={r + 14} y={-10} className="label">
                        {snippet}
                        {n.body.length > 42 ? "…" : ""}
                      </text>
                      <text x={r + 14} y={6} className="meta">
                        gen {n.generation} · {n.edge} · influence {compact(influence(n))}
                      </text>
                      <a
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        className="node-link"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <text x={r + 14} y={24} className="link-text">
                          Open source post ↗
                        </text>
                      </a>
                    </>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
        {nodes.length === 0 && <div className="empty">No lineage in this slice.</div>}
        <div className="hint">
          Node size = <strong>influence</strong> (views/80 + likes + 2×reposts + 3×quotes + replies). Edge
          labels are 1–2 mutation keywords. Click a label to see why it fits this step.
        </div>
        {hoverNode && (
          <div
            className="float-card"
            style={{
              left: Math.min(pan.x + hoverNode.x * scale + 28, (wrap.current?.clientWidth ?? 400) - 280),
              top: Math.max(8, pan.y + hoverNode.y * scale + 20),
            }}
          >
            <p>{hoverNode.node.body}</p>
            <small title="Reach × interaction mix: views/80 + likes + 2×reposts + 3×quotes + replies">
              Influence {compact(influence(hoverNode.node))} · {hoverNode.node.edge}
            </small>
            <a href={postUrl(hoverNode.node)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
              Source post
            </a>
          </div>
        )}
        {activeEdge && !hoverNode && (() => {
          const ann = edgeAnnotation(activeEdge.from.node, activeEdge.to.node);
          return (
            <div className="float-card edge-card" style={{ left: 24, top: 24 }}>
              <p className="edge-card-kicker">Mutation · click label for full why</p>
              <p className="edge-card-title">{ann.label}</p>
              <small>{ann.detail}</small>
              {ann.reasons[0] && <small>{ann.reasons[0].why}</small>}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

function cubic(x1: number, y1: number, x2: number, y2: number): string {
  const mx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
}

function midpoint(x1: number, y1: number, x2: number, y2: number) {
  return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
}

function trimLabel(s: string): string {
  return s.length > 18 ? `${s.slice(0, 17)}…` : s;
}
