import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { DayPoint, EdgeKind, LaidOut, TweetNode } from "../types";
import { utcDay } from "../format";
import { TREE_DX, TREE_DY, TREE_TOP, edgeAnnotation, influence, layoutForest, radius } from "../layout";
import { PHASE_COLOR, phaseOf } from "../saturation";
import { NodeTooltip } from "./NodeTooltip";

const EDGE_COLOR: Record<EdgeKind, string> = {
  origin: "#d6ff4b",
  reply: "#8eb8ff",
  quote: "#ff8a5b",
  mutation: "#e8d27a",
};

export type LineageCanvasHandle = {
  fit: () => void;
  origin: () => void;
  zoomBy: (delta: number) => void;
  focusNode: (id: string) => void;
  scalePct: () => number;
};

type Props = {
  forest: TweetNode[];
  visible: Set<string>;
  selected: string | null;
  related: Set<string> | null;
  searchHits: Set<string>;
  onSelect: (id: string) => void;
  onFocusSubtree?: (id: string) => void;
  onContextMenu?: (id: string, x: number, y: number) => void;
  edgeFilter: Set<EdgeKind>;
  terms?: string[];
  pulse?: string | null;
  series?: DayPoint[];
  onViewChange?: (pct: number) => void;
  hint?: string | null;
  focusBanner?: boolean;
  onClearFocus?: () => void;
};

const SCALE_MAX = 2.8;
const READABLE_SCALE = 1.18;
const OPENING_MAX_GEN = 5;
const CHIP_W = 188;
const CHIP_H = 38;

export const TreeCanvas = forwardRef<LineageCanvasHandle, Props>(function TreeCanvas(
  {
    forest,
    visible,
    selected,
    related,
    searchHits,
    onSelect,
    onFocusSubtree,
    onContextMenu,
    edgeFilter,
    pulse = null,
    series = [],
    onViewChange,
    hint = null,
    focusBanner = false,
    onClearFocus,
  },
  ref,
) {
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
  const onViewChangeRef = useRef(onViewChange);
  onViewChangeRef.current = onViewChange;

  const laid = useMemo(() => layoutForest(forest), [forest]);
  const nodes = [...laid.values()];
  const maxX = nodes.reduce((m, n) => Math.max(m, n.x), 400);
  const maxY = nodes.reduce((m, n) => Math.max(m, n.y), 300);
  const width = maxX + 140;
  const height = maxY + 120;
  const minScale = fitScale(
    viewSize.w || wrap.current?.clientWidth || 0,
    viewSize.h || wrap.current?.clientHeight || 0,
    width,
    height,
  );

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
    onViewChangeRef.current?.(Math.round(nextScale * 100));
  };

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

  const fitToView = () => {
    const el = wrap.current;
    if (!el || nodes.length === 0) return;
    const next = fitScale(el.clientWidth, el.clientHeight, width, height);
    applyView(next, {
      x: Math.max(8, (el.clientWidth - width * next) / 2),
      y: Math.max(8, (el.clientHeight - height * next) / 2),
    });
  };

  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  const focusOpening = () => {
    const el = wrap.current;
    const current = nodesRef.current;
    if (!el || current.length === 0) return false;
    const viewW = el.clientWidth || 1200;
    const viewH = el.clientHeight || 680;
    const framed = viewForGenerations(current, viewW, viewH, OPENING_MAX_GEN);
    applyView(framed.scale, framed.pan);
    if (el.clientWidth && el.clientHeight) setViewSize({ w: el.clientWidth, h: el.clientHeight });
    return true;
  };

  const focusNode = (id: string) => {
    const el = wrap.current;
    const item = laid.get(id);
    if (!el || !item) return;
    const next = Math.max(minScale, Math.min(SCALE_MAX, READABLE_SCALE));
    applyView(next, {
      x: el.clientWidth * 0.5 - item.x * next,
      y: el.clientHeight * 0.3 - item.y * next,
    });
  };

  useImperativeHandle(ref, () => ({
    fit: () => {
      userTweaked.current = false;
      fitToView();
    },
    origin: () => {
      userTweaked.current = false;
      focusOpening();
    },
    zoomBy: (delta: number) => {
      const el = wrap.current;
      if (!el) return;
      userTweaked.current = true;
      zoomAt(view.current.scale + delta, el.clientWidth / 2, el.clientHeight / 2);
    },
    focusNode: (id: string) => {
      userTweaked.current = true;
      focusNode(id);
    },
    scalePct: () => Math.round(view.current.scale * 100),
  }));

  useLayoutEffect(() => {
    userTweaked.current = false;
    const el = wrap.current;
    if (!el) return;
    focusOpening();
    const ro = new ResizeObserver(() => {
      setViewSize({ w: el.clientWidth, h: el.clientHeight });
      if (!userTweaked.current) focusOpening();
    });
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forest, width, height]);

  useEffect(() => {
    if (view.current.scale + 0.001 < minScale) fitToView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minScale]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      userTweaked.current = true;
      const delta = e.deltaY > 0 ? -0.08 : 0.08;
      zoomAt(view.current.scale + delta, e.clientX - rect.left, e.clientY - rect.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minScale]);

  const trackPointer = (clientX: number, clientY: number, over: boolean) => {
    const el = wrap.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    pointer.current = { x: clientX - rect.left, y: clientY - rect.top, over };
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    trackPointer(e.clientX, e.clientY, true);
    const target = e.target as Element;
    if (
      target.closest(".node") ||
      target.closest(".edge-hit") ||
      target.closest(".edge-chip") ||
      target.closest("a") ||
      target.closest("button")
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

  const chips = placeChips({
    links,
    visible,
    edgeFilter,
    selected,
    hoverEdge,
    hoverNode: hover,
    scale,
    pan,
    viewW: viewSize.w || wrap.current?.clientWidth || 0,
    viewH: viewSize.h || wrap.current?.clientHeight || 0,
  });
  const gens = [...new Set(nodes.map((n) => n.node.generation || 0))].sort((a, b) => a - b);
  const beadR = Math.min(9, Math.max(4.2, 6 / scale));
  const hoverItem = hover ? laid.get(hover) : null;
  const hoverLabel = hoverItem
    ? hoverItem.node.edge === "origin"
      ? "Origin"
      : `${kindTitle(hoverItem.node.edge)} · ${
          hoverItem.node.parent_id && laid.get(hoverItem.node.parent_id)
            ? edgeAnnotation(laid.get(hoverItem.node.parent_id)!.node, hoverItem.node).label
            : hoverItem.node.edge_label || hoverItem.node.edge
        }`
    : "";

  return (
    <div className="canvas-shell">
      <div
        className="canvas"
        ref={wrap}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerEnter={(e) => trackPointer(e.clientX, e.clientY, true)}
        onPointerLeave={() => {
          pointer.current = { ...pointer.current, over: false };
        }}
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
            {gens.map((g) => {
              const rowXs = nodes.filter((n) => (n.node.generation || 0) === g).map((n) => n.x);
              const x = (rowXs.length ? Math.min(...rowXs) : 120) - 72;
              return (
                <text
                  key={`gen-${g}`}
                  x={Math.max(16, x)}
                  y={TREE_TOP + g * TREE_DY + 4}
                  className="gen-band"
                >
                  GEN {g}
                </text>
              );
            })}
            {links.map(({ from, to, key }) => {
              const alive = visible.has(to.node.id) && visible.has(from.node.id);
              const allowed = edgeFilter.has(to.node.edge);
              const show = alive && allowed;
              const y1 = from.y + radius(from.node) + 4;
              const y2 = to.y - radius(to.node) - 6;
              const d = cubic(from.x, y1, to.x, y2);
              const hot = hoverEdge === key || selected === to.node.id;
              const dim =
                related != null && !related.has(from.node.id) && !related.has(to.node.id);
              const inferred = to.node.edge === "mutation";
              return (
                <g key={key} className={`link-group ${show ? "on" : "off"} ${dim ? "dim" : ""}`}>
                  <path
                    d={d}
                    className={`link ${to.node.edge} ${inferred ? "inferred" : "strong"}`}
                    stroke={EDGE_COLOR[to.node.edge]}
                  />
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
                      cy={to.y - radius(to.node) - 8}
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
              const sat = phaseOf(series, utcDay(n.created_at));
              const satPhase = sat?.phase ?? "unknown";
              const dim = related != null && !related.has(n.id);
              const kin = related != null && related.has(n.id);
              const hit = searchHits.has(n.id);
              const named =
                n.edge === "origin" ||
                active ||
                n.generation <= 1 ||
                (influence(n) > 4000 && (n.generation || 0) <= 4);
              return (
                <g
                  key={n.id}
                  transform={`translate(${item.x},${item.y})`}
                  className={`node sat-${satPhase} ${alive && allowed ? "on" : "off"} ${active ? "active" : ""} ${pulse === n.id ? "pulse" : ""} ${dim ? "dim" : ""} ${kin ? "kin" : ""} ${hit ? "search-hit" : ""}`}
                  onMouseEnter={() => setHover(n.id)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => onSelect(n.id)}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    onFocusSubtree?.(n.id);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onContextMenu?.(n.id, e.clientX, e.clientY);
                  }}
                  style={{ cursor: "pointer" }}
                >
                  <circle r={r + 12} className="halo sat-ring" stroke={PHASE_COLOR[satPhase] ?? PHASE_COLOR.unknown} />
                  <NodeMark kind={n.edge} r={r} active={active} />
                  {n.edge === "origin" && (
                    <>
                      <text
                        x={0}
                        y={1}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        className="origin-mark-in"
                        fontSize={Math.max(9, Math.min(15, r * 0.42))}
                      >
                        ORIGIN
                      </text>
                      <text x={0} y={r + 28} textAnchor="middle" className="origin-mark">
                        ORIGIN
                      </text>
                    </>
                  )}
                  {named && n.edge !== "origin" && (
                    <text x={0} y={r + 16} textAnchor="middle" className={`rel-mark ${n.edge}`}>
                      {kindTitle(n.edge)}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
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
        {hoverItem && visible.has(hoverItem.node.id) && (
          <NodeTooltip
            node={hoverItem.node}
            label={hoverLabel}
            x={pan.x + hoverItem.x * scale}
            y={pan.y + (hoverItem.y + radius(hoverItem.node) + 8) * scale}
          />
        )}
        {focusBanner && (
          <button type="button" className="focus-pill" onClick={onClearFocus}>
            Return to full tree
          </button>
        )}
        {hint && <p className="hint">{hint}</p>}
        {nodes.length === 0 && <div className="empty">No lineage in this slice.</div>}
        <RelationshipLegend />
      </div>
    </div>
  );
});

export { TreeCanvas as LineageCanvas };

function fitScale(viewW: number, viewH: number, worldW: number, worldH: number): number {
  if (!viewW || !viewH || !worldW || !worldH) return 0.4;
  const pad = 36;
  const sx = (viewW - pad) / worldW;
  const sy = (viewH - pad) / worldH;
  return Math.min(1.2, Math.max(0.4, Math.min(sx, sy)));
}

/** Frame generations 0..maxGen so they fill the canvas without the rest of the forest. */
function viewForGenerations(
  nodes: LaidOut[],
  viewW: number,
  viewH: number,
  maxGen: number,
): { scale: number; pan: { x: number; y: number } } {
  const slice = nodes.filter((n) => (n.node.generation || 0) <= maxGen);
  const items = slice.length ? slice : nodes;
  let minX = Infinity;
  let maxX = -Infinity;
  for (const item of items) {
    const r = radius(item.node);
    minX = Math.min(minX, item.x - r - 12);
    maxX = Math.max(maxX, item.x + r + 12);
  }
  minX -= 56;

  const minY = TREE_TOP - 40;
  const maxY = TREE_TOP + maxGen * TREE_DY + TREE_DY * 0.16;

  const padX = 48;
  const padTop = 28;
  const padBottom = 36;
  const worldW = Math.max(maxX - minX, TREE_DX * 2);
  const worldH = Math.max(maxY - minY, TREE_DY * 2);
  const sx = (viewW - padX * 2) / worldW;
  const sy = (viewH - padTop - padBottom) / worldH;
  const scale = Math.min(SCALE_MAX, Math.max(0.45, Math.min(sx, sy)));
  return {
    scale,
    pan: {
      x: viewW / 2 - ((minX + maxX) / 2) * scale,
      y: padTop - minY * scale,
    },
  };
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
  hoverNode: string | null;
  scale: number;
  pan: { x: number; y: number };
  viewW: number;
  viewH: number;
}): Chip[] {
  const { links, visible, edgeFilter, selected, hoverEdge, hoverNode, scale, pan, viewW, viewH } = args;
  if (!viewW || !viewH) return [];

  const candidates = links
    .filter(({ from, to }) => visible.has(from.node.id) && visible.has(to.node.id) && edgeFilter.has(to.node.edge))
    .map(({ from, to, key }) => {
      const ann = edgeAnnotation(from.node, to.node);
      const r = radius(to.node);
      const forced = selected === to.node.id || hoverEdge === key || hoverNode === to.node.id;
      return {
        key,
        toId: to.node.id,
        kind: to.node.edge,
        label: `${kindTitle(to.node.edge)} · ${ann.label}`,
        detail: ann.detail,
        x: pan.x + to.x * scale,
        y: pan.y + (to.y - r - 14) * scale,
        mode: "full" as const,
        hot: forced,
        score:
          (forced ? 1_000_000 : 0) +
          influence(to.node) +
          (to.node.generation === 1 ? 800 : 0) -
          to.node.generation * 18,
      };
    })
    .sort((a, b) => b.score - a.score);

  const boxes: { x: number; y: number }[] = [];
  const out: Chip[] = [];

  for (const c of candidates) {
    let x = Math.max(CHIP_W / 2 + 6, Math.min(viewW - CHIP_W / 2 - 6, c.x));
    let y = Math.max(CHIP_H + 8, Math.min(viewH - 10, c.y));
    const overlaps = boxes.length >= 12 || boxes.some((b) => Math.abs(b.x - x) < CHIP_W && Math.abs(b.y - y) < CHIP_H);
    if (overlaps && !c.hot) continue;
    if (overlaps && c.hot) y = Math.max(CHIP_H + 8, y - CHIP_H);
    boxes.push({ x, y });
    out.push({ ...c, x, y, mode: "full" });
  }

  return out;
}

function kindTitle(kind: EdgeKind): string {
  if (kind === "origin") return "Origin";
  if (kind === "reply") return "Reply";
  if (kind === "quote") return "Quote";
  return "Mutation";
}

function NodeMark({ kind, r, active }: { kind: EdgeKind; r: number; active: boolean }) {
  const filter = active ? "url(#glow)" : undefined;
  if (kind === "quote") {
    const s = r * 1.12;
    return (
      <polygon
        className="dot quote"
        filter={filter}
        points={`0,${-s} ${s},0 0,${s} ${-s},0`}
      />
    );
  }
  if (kind === "mutation") {
    const s = r * 0.92;
    return (
      <rect className="dot mutation" filter={filter} x={-s} y={-s} width={s * 2} height={s * 2} rx={5} />
    );
  }
  return <circle r={r} className={`dot ${kind}`} filter={filter} />;
}

function RelationshipLegend() {
  return (
    <ul className="rel-legend" aria-label="Relationship types">
      <li className="origin">
        <i className="rel-origin" /> Origin
      </li>
      <li className="reply">
        <i className="rel-reply" /> Reply <span>thread</span>
      </li>
      <li className="quote">
        <i className="rel-quote" /> Quote <span>solid</span>
      </li>
      <li className="mutation">
        <i className="rel-mutation" /> Mutation <span>inferred</span>
      </li>
    </ul>
  );
}

