import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import type { EdgeKind, LaidOut, TweetNode } from "../types";
import { edgeAnnotation, influence, layoutForest, radius } from "../layout";

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
  terms: string[];
  pulse?: string | null;
};

const SCALE_MAX = 2.2;
const CHIP_W = 136;
const CHIP_H = 36;

export function TreeCanvas({ forest, visible, selected, onSelect, edgeFilter, pulse = null }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [hoverEdge, setHoverEdge] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 16, y: 12 });
  const [viewSize, setViewSize] = useState({ w: 0, h: 0 });
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const view = useRef({ scale: 1, pan: { x: 16, y: 12 } });
  const userTweaked = useRef(false);
  const pointer = useRef<{ x: number; y: number; over: boolean }>({ x: 0, y: 0, over: false });

  const laid = useMemo(() => layoutForest(forest), [forest]);
  const nodes = [...laid.values()];
  const maxX = nodes.reduce((m, n) => Math.max(m, n.x), 400);
  const maxY = nodes.reduce((m, n) => Math.max(m, n.y), 300);
  const width = maxX + 96;
  const height = maxY + 88;
  const minScale = fitScale(viewSize.w || wrap.current?.clientWidth || 0, viewSize.h || wrap.current?.clientHeight || 0, width, height);

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
    const nextScale = Math.max(minScale, Math.min(SCALE_MAX, +nextScaleRaw.toFixed(2)));
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
    const next = fitScale(el.clientWidth, el.clientHeight, width, height);
    applyView(next, {
      x: Math.max(8, (el.clientWidth - width * next) / 2),
      y: Math.max(8, (el.clientHeight - height * next) / 2),
    });
  };

  const focusOrigin = () => {
    const el = wrap.current;
    const origin = nodes.find((n) => n.node.edge === "origin") ?? nodes[0];
    if (!el || !origin) return;
    const next = 1;
    applyView(next, {
      x: el.clientWidth * 0.5 - origin.x * next,
      y: Math.max(16, el.clientHeight * 0.12 - origin.y * next),
    });
  };

  useEffect(() => {
    userTweaked.current = false;
    const el = wrap.current;
    if (!el) return;
    const tryFit = () => {
      if (!el.clientWidth || !el.clientHeight) return;
      setViewSize({ w: el.clientWidth, h: el.clientHeight });
      fitToView();
    };
    const id = window.requestAnimationFrame(tryFit);
    const ro = new ResizeObserver(() => {
      setViewSize({ w: el.clientWidth, h: el.clientHeight });
      if (!userTweaked.current) tryFit();
    });
    ro.observe(el);
    return () => {
      window.cancelAnimationFrame(id);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forest, width, height]);

  useEffect(() => {
    if (view.current.scale + 0.001 < minScale) fitToView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minScale]);

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    trackPointer(e.clientX, e.clientY, true);
    const target = e.target as Element;
    if (
      target.closest(".node") ||
      target.closest(".edge-hit") ||
      target.closest(".edge-label") ||
      target.closest(".edge-chip") ||
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
    userTweaked.current = true;
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
    userTweaked.current = true;
    const delta = e.deltaY > 0 ? -0.06 : 0.06;
    zoomAt(view.current.scale + delta, e.clientX - rect.left, e.clientY - rect.top);
  };

  const onSliderZoom = (pct: number) => {
    userTweaked.current = true;
    const anchor = anchorForSlider();
    zoomAt(pct / 100, anchor.x, anchor.y);
  };

  const explainLink =
    (hoverEdge ? links.find((l) => l.key === hoverEdge) : null) ??
    links.find((l) => l.to.node.id === selected) ??
    null;
  const chips = placeChips({
    links,
    visible,
    edgeFilter,
    selected,
    hoverEdge,
    scale,
    pan,
    viewW: viewSize.w || wrap.current?.clientWidth || 0,
    viewH: viewSize.h || wrap.current?.clientHeight || 0,
  });
  const beadR = Math.min(8, Math.max(3.4, 5.2 / scale));

  return (
    <div className="canvas-shell">
      <div className="zoom-bar" title="Scale the evolution map so large trees stay readable">
        <label>
          <span>Zoom</span>
          <input
            type="range"
            min={Math.round(minScale * 100)}
            max={220}
            value={Math.max(Math.round(minScale * 100), Math.round(scale * 100))}
            onChange={(e) => onSliderZoom(Number(e.target.value))}
          />
          <em>{Math.round(scale * 100)}%</em>
        </label>
        <button
          type="button"
          onClick={() => {
            userTweaked.current = true;
            focusOrigin();
          }}
        >
          Focus origin
        </button>
        <button
          type="button"
          onClick={() => {
            userTweaked.current = false;
            fitToView();
          }}
        >
          Fit map
        </button>
        <button
          type="button"
          onClick={() => {
            userTweaked.current = true;
            applyView(Math.max(minScale, 1), { x: 16, y: 12 });
          }}
        >
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
              const d = cubic(from.x, from.y + 22, to.x, to.y - 22);
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
                    <circle
                      className={`edge-bead ${to.node.edge} ${hot ? "hot" : ""}`}
                      cx={to.x}
                      cy={to.y - radius(to.node) - 10}
                      r={beadR}
                      fill={EDGE_COLOR[to.node.edge]}
                    />
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
              return (
                <g
                  key={n.id}
                  transform={`translate(${item.x},${item.y})`}
                  className={`node ${alive && allowed ? "on" : "off"} ${active ? "active" : ""} ${pulse === n.id ? "pulse" : ""}`}
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
                </g>
              );
            })}
          </svg>
        </div>
        {explainLink && (() => {
          const ann = edgeAnnotation(explainLink.from.node, explainLink.to.node);
          return (
            <div className="float-card edge-card">
              <p className="edge-card-kicker">Mutation</p>
              <p className="edge-card-title">{ann.label}</p>
              <small>{ann.detail}</small>
            </div>
          );
        })()}
        {chips.map((chip) => (
          <div
            key={chip.key}
            className={`edge-chip ${chip.kind} ${chip.mode} ${chip.hot ? "hot" : ""}`}
            style={{ left: chip.x, top: chip.y }}
            onMouseEnter={() => setHoverEdge(chip.key)}
            onMouseLeave={() => setHoverEdge(null)}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(chip.toId);
            }}
          >
            <button type="button" aria-label={chip.label}>
              {chip.mode === "full" ? chip.label : ""}
            </button>
            <i className="edge-chip-stem" />
          </div>
        ))}
        {nodes.length === 0 && <div className="empty">No lineage in this slice.</div>}
      </div>
    </div>
  );
}

/** Smallest zoom: whole tree if it still fills the canvas; never below 25%. */
function fitScale(viewW: number, viewH: number, worldW: number, worldH: number): number {
  if (!viewW || !viewH || !worldW || !worldH) return 0.25;
  const pad = 24;
  const sx = (viewW - pad) / worldW;
  const sy = (viewH - pad) / worldH;
  return Math.min(1.15, Math.max(0.25, Math.min(sx, sy)));
}

function cubic(x1: number, y1: number, x2: number, y2: number): string {
  const my = (y1 + y2) / 2;
  return `M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`;
}

type Chip = {
  key: string;
  toId: string;
  kind: EdgeKind;
  label: string;
  detail: string;
  x: number;
  y: number;
  mode: "full" | "dot";
  hot: boolean;
};

function placeChips(args: {
  links: { from: LaidOut; to: LaidOut; key: string }[];
  visible: Set<string>;
  edgeFilter: Set<EdgeKind>;
  selected: string | null;
  hoverEdge: string | null;
  scale: number;
  pan: { x: number; y: number };
  viewW: number;
  viewH: number;
}): Chip[] {
  const { links, visible, edgeFilter, selected, hoverEdge, scale, pan, viewW, viewH } = args;
  if (!viewW || !viewH) return [];

  const candidates = links
    .filter(({ from, to }) => visible.has(from.node.id) && visible.has(to.node.id) && edgeFilter.has(to.node.edge))
    .map(({ from, to, key }) => {
      const ann = edgeAnnotation(from.node, to.node);
      const r = radius(to.node);
      const forced = selected === to.node.id || hoverEdge === key;
      return {
        key,
        toId: to.node.id,
        kind: to.node.edge,
        label: ann.label,
        detail: ann.detail,
        x: pan.x + to.x * scale,
        y: pan.y + (to.y - r - 12) * scale,
        mode: "full" as const,
        hot: forced,
        score:
          (forced ? 1_000_000 : 0) +
          influence(to.node) +
          (to.node.generation === 1 ? 400 : 0) -
          to.node.generation * 20,
      };
    })
    .sort((a, b) => b.score - a.score);

  const boxes: { x: number; y: number }[] = [];
  const out: Chip[] = [];

  for (const c of candidates) {
    let x = Math.max(CHIP_W / 2 + 6, Math.min(viewW - CHIP_W / 2 - 6, c.x));
    let y = Math.max(CHIP_H + 8, Math.min(viewH - 10, c.y));
    const overlaps =
      boxes.length >= 8 || boxes.some((b) => Math.abs(b.x - x) < CHIP_W && Math.abs(b.y - y) < CHIP_H);

    if (overlaps && !c.hot) {
      out.push({ ...c, x, y, mode: "dot" });
      continue;
    }
    if (overlaps && c.hot) {
      y = Math.max(CHIP_H + 8, y - CHIP_H);
    }
    boxes.push({ x, y });
    out.push({ ...c, x, y, mode: "full" });
  }

  return out;
}
