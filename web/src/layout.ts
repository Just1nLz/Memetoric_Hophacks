import { ts, utcDay } from "./format";
import { bodyMentionsMeme } from "./highlight";
import { languageKey, languageName } from "./mutation";
import type { LaidOut, TweetNode } from "./types";

export { edgeAnnotation, languageKey, languageName } from "./mutation";
export type { EdgeAnnotation } from "./mutation";

export function flatten(forest: TweetNode[]): TweetNode[] {
  const out: TweetNode[] = [];
  const walk = (n: TweetNode) => {
    out.push(n);
    n.children.forEach(walk);
  };
  forest.forEach(walk);
  return out;
}

export const TREE_DX = 124;
export const TREE_DY = 132;
export const TREE_TOP = 72;

/** Pack each generation into a tight row so siblings stay visible together. */
export function layoutForest(forest: TweetNode[]): Map<string, LaidOut> {
  const positions = new Map<string, LaidOut>();
  let cursor = 0;

  forest.forEach((root, i) => {
    const local = layoutPackedTree(root);
    let minX = Infinity;
    let maxX = -Infinity;
    for (const p of local.values()) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
    }
    if (!Number.isFinite(minX)) return;
    const shift = cursor - minX + (i === 0 ? 140 : 96);
    for (const [id, p] of local) {
      positions.set(id, { ...p, x: p.x + shift });
    }
    cursor = shift + maxX + 80;
  });

  return positions;
}

function layoutPackedTree(root: TweetNode): Map<string, LaidOut> {
  const byGen = new Map<number, TweetNode[]>();
  const walk = (node: TweetNode) => {
    const g = node.generation || 0;
    const row = byGen.get(g) ?? [];
    row.push(node);
    byGen.set(g, row);
    node.children.forEach(walk);
  };
  walk(root);

  const maxN = Math.max(1, ...[...byGen.values()].map((row) => row.length));
  const contentW = (maxN - 1) * TREE_DX;
  const positions = new Map<string, LaidOut>();

  for (const [g, row] of byGen) {
    const rowW = Math.max(0, row.length - 1) * TREE_DX;
    const x0 = (contentW - rowW) / 2;
    row.forEach((node, i) => {
      positions.set(node.id, {
        x: x0 + i * TREE_DX,
        y: TREE_TOP + g * TREE_DY,
        node,
      });
    });
  }

  return positions;
}

/** Influence ≈ reach + interaction intensity (views diluted, quotes weighted highest). */
export function influence(node: TweetNode): number {
  return (
    node.like_count +
    node.retweet_count * 2 +
    node.quote_count * 3 +
    node.reply_count +
    node.views_count / 80
  );
}

/** @deprecated use influence — kept for any leftover imports */
export const engagement = influence;

/** Views stand in for clicks; reply/quote beat grafted islands. */
export function necessity(node: TweetNode): number {
  const attn = influence(node) + node.views_count / 40;
  const edge =
    node.edge === "reply" || node.edge === "quote" ? 1.35 : node.edge === "origin" ? 1.5 : 0.7;
  return attn * edge;
}

function addAncestors(keep: Set<string>, byId: Map<string, TweetNode>): void {
  for (const id of [...keep]) {
    let cur = byId.get(id);
    while (cur?.parent_id) {
      keep.add(cur.parent_id);
      cur = byId.get(cur.parent_id);
    }
  }
}

/**
 * Compact consumer tree: a month-long spine of mutations plus a few high-reach branches.
 * Never collapse later posts back onto the origin (that reads as only two generations).
 */
export function pruneConsumerForest(forest: TweetNode[], keepHighlights = 10, maxNodes = 40): TweetNode[] {
  if (forest.length === 0) return [];
  const raw = flatten(forest);
  const byId = new Map(raw.map((n) => [n.id, n]));
  const origin = forest[0];
  const rest = raw.filter((n) => n.id !== origin.id);
  const keep = new Set<string>([origin.id]);

  const timed = [...rest].sort((a, b) => ts(a.created_at) - ts(b.created_at));
  const times = timed.map((n) => ts(n.created_at)).filter((t) => t > 0);
  const t0 = times[0] ?? ts(origin.created_at);
  const t1 = times[times.length - 1] ?? t0;
  const span = Math.max(t1 - t0, 1);
  const bands = 12;
  const spine = new Set<string>([origin.id]);
  for (let i = 0; i < bands; i++) {
    const a = t0 + (span * i) / bands;
    const b = t0 + (span * (i + 1)) / bands + (i === bands - 1 ? 1 : 0);
    const inBand = timed.filter((n) => {
      const t = ts(n.created_at);
      return t >= a && t < b;
    });
    if (!inBand.length) continue;
    inBand.sort((a, b) => (b.generation || 0) - (a.generation || 0) || necessity(b) - necessity(a));
    spine.add(inBand[0].id);
    keep.add(inBand[0].id);
  }

  const ranked = [...rest].sort((a, b) => necessity(b) - necessity(a));
  for (const n of ranked.slice(0, keepHighlights)) keep.add(n.id);
  for (const n of [...raw].sort((a, b) => (b.generation || 0) - (a.generation || 0)).slice(0, 8)) {
    keep.add(n.id);
    spine.add(n.id);
  }
  addAncestors(keep, byId);
  addAncestors(spine, byId);

  if (keep.size > maxNodes) {
    const extras = ranked.filter((n) => keep.has(n.id) && !spine.has(n.id));
    for (let i = extras.length - 1; i >= 0 && keep.size > maxNodes; i--) {
      const id = extras[i].id;
      const kids = raw.filter((n) => n.parent_id === id && keep.has(n.id));
      if (kids.length === 0) keep.delete(id);
    }
    addAncestors(keep, byId);
  }

  const clones = new Map<string, TweetNode>();
  for (const n of raw) {
    if (!keep.has(n.id)) continue;
    clones.set(n.id, { ...n, children: [] });
  }
  const root = clones.get(origin.id);
  if (!root) return forest;
  root.parent_id = null;
  root.edge = "origin";
  for (const n of clones.values()) {
    if (n.id === root.id) continue;
    let pid = byId.get(n.id)?.parent_id ?? null;
    while (pid && !clones.has(pid)) pid = byId.get(pid)?.parent_id ?? null;
    if (!pid || !clones.has(pid)) {
      const earlier = [...clones.values()]
        .filter((c) => c.id !== n.id && ts(c.created_at) < ts(n.created_at))
        .sort((a, b) => ts(b.created_at) - ts(a.created_at));
      pid = earlier[0]?.id ?? root.id;
    }
    n.parent_id = pid;
    clones.get(pid)!.children.push(n);
  }
  for (const n of clones.values()) {
    n.children.sort((a, b) => ts(a.created_at) - ts(b.created_at));
  }
  retagGenerations(root, 0);
  return [root];
}

export function radius(node: TweetNode): number {
  const boost = node.edge === "origin" ? 6 : 0;
  return Math.max(16, Math.min(40, 14 + Math.log10(1 + influence(node)) * 7.2 + boost));
}

function cloneNode(node: TweetNode): TweetNode {
  return { ...node, children: node.children.map(cloneNode) };
}

function retagGenerations(node: TweetNode, generation: number): void {
  node.generation = generation;
  for (const child of node.children) retagGenerations(child, generation + 1);
}

export type LangTree = {
  key: string;
  name: string;
  count: number;
  likes: number;
  forest: TweetNode[];
};

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

function mentionsMeme(node: TweetNode, terms: string[], name = "", query = ""): boolean {
  if (name || query) return bodyMentionsMeme(node.body, name, query);
  if (!terms.length) return true;
  const body = (node.body || "").toLowerCase();
  return terms.some((t) => t.length >= 4 && body.includes(t.toLowerCase()));
}

/** Earliest-day first two hours (inclusive), then most likes + views. */
export function pickSoleOrigin(
  nodes: TweetNode[],
  windowStart: string,
  terms: string[] = [],
  name = "",
  query = "",
): TweetNode {
  const pool = nodes.filter((n) => mentionsMeme(n, terms, name, query));
  const src = pool.length ? pool : nodes;
  const start = Date.parse(`${windowStart}T00:00:00.000Z`);
  const inWindow = (n: TweetNode, from: number, to: number) => {
    const t = ts(n.created_at);
    return t > 0 && t >= from && t <= to;
  };
  let cands = Number.isFinite(start) ? src.filter((n) => inWindow(n, start, start + TWO_HOURS_MS)) : [];
  if (!cands.length) {
    const times = src.map((n) => ts(n.created_at)).filter(Boolean);
    if (times.length) {
      const earliest = new Date(Math.min(...times));
      const day0 = Date.UTC(earliest.getUTCFullYear(), earliest.getUTCMonth(), earliest.getUTCDate());
      cands = src.filter((n) => inWindow(n, day0, day0 + TWO_HOURS_MS));
    }
  }
  if (!cands.length) cands = src.filter((n) => utcDay(n.created_at) === windowStart);
  if (!cands.length) cands = src;
  return cands.reduce((best, n) => {
    const score = (n.like_count || 0) + (n.views_count || 0);
    const prev = (best.like_count || 0) + (best.views_count || 0);
    return score > prev ? n : best;
  });
}

/** One tree: chosen origin at the root; leftover islands hang off it. */
export function unifyForest(
  forest: TweetNode[],
  windowStart = "2026-08-17",
  terms: string[] = [],
  name = "",
  query = "",
): TweetNode[] {
  if (forest.length === 0) return [];
  const raw = flatten(forest);
  const clones = new Map<string, TweetNode>();
  for (const n of raw) clones.set(n.id, { ...n, children: [] });
  for (const n of raw) {
    const node = clones.get(n.id)!;
    if (n.parent_id && clones.has(n.parent_id) && n.parent_id !== n.id) {
      node.parent_id = n.parent_id;
      clones.get(n.parent_id)!.children.push(node);
    } else {
      node.parent_id = null;
    }
  }
  const origin = clones.get(pickSoleOrigin([...clones.values()], windowStart, terms, name, query).id)!;
  if (origin.parent_id) {
    const parent = clones.get(origin.parent_id);
    if (parent) parent.children = parent.children.filter((c) => c.id !== origin.id);
    origin.parent_id = null;
  }
  origin.edge = "origin";
  origin.edge_label = null;
  origin.edge_detail = null;
  const originMs = ts(origin.created_at);
  const detach = (n: TweetNode) => {
    if (!n.parent_id) return;
    const parent = clones.get(n.parent_id);
    if (parent) parent.children = parent.children.filter((c) => c.id !== n.id);
    n.parent_id = null;
    if (n.edge === "quote" || n.edge === "reply") n.edge = "mutation";
  };
  // Keep already-stacked chains. Break origin fans: a month of replies/quotes
  // hanging off day-0 is two generations, not a lineage.
  for (const n of clones.values()) {
    if (n.id === origin.id || n.parent_id !== origin.id) continue;
    const ageDays = originMs ? (ts(n.created_at) - originMs) / 86_400_000 : 0;
    if (n.edge === "reply" && ageDays <= 1.5) continue;
    detach(n);
  }
  const byParent = new Map<string, TweetNode[]>();
  for (const n of clones.values()) {
    if (!n.parent_id || n.parent_id === origin.id) continue;
    const list = byParent.get(n.parent_id) ?? [];
    list.push(n);
    byParent.set(n.parent_id, list);
  }
  for (const kids of byParent.values()) {
    const ranked = [...kids].sort((a, b) => influence(b) - influence(a));
    for (const extra of ranked.slice(5)) detach(extra);
  }
  graftMutationLineage(clones, origin);
  origin.children.sort((a, b) => ts(a.created_at) - ts(b.created_at));
  retagGenerations(origin, 0);
  return [origin];
}

const STOP = new Set([
  "the", "and", "for", "you", "that", "this", "with", "are", "was", "have",
  "just", "from", "they", "your", "what", "when", "will", "about", "like",
  "https", "http", "www", "com", "lol", "its", "not", "but", "all", "can",
]);

function bodyTokens(body: string): Set<string> {
  const out = new Set<string>();
  for (const t of (body || "").toLowerCase().match(/[a-z0-9']+/g) ?? []) {
    if (t.length > 2 && !STOP.has(t)) out.add(t);
  }
  return out;
}

function tokenSim(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  return inter / Math.sqrt(a.size * b.size);
}

/** Attach parentless posts to a similar earlier variant so the month stacks generations. */
function graftMutationLineage(clones: Map<string, TweetNode>, origin: TweetNode): void {
  const chronological = [...clones.values()].sort((a, b) => {
    const d = ts(a.created_at) - ts(b.created_at);
    return d !== 0 ? d : a.id.localeCompare(b.id);
  });
  const childCounts = new Map<string, number>();
  for (const n of chronological) {
    if (n.parent_id && clones.has(n.parent_id) && n.parent_id !== n.id) {
      childCounts.set(n.parent_id, (childCounts.get(n.parent_id) || 0) + 1);
    }
  }
  const toks = new Map<string, Set<string>>();
  for (const n of chronological) toks.set(n.id, bodyTokens(n.body));
  const placed: TweetNode[] = [];
  const maxChildren = 3;

  for (const n of chronological) {
    if (n.id === origin.id) {
      placed.push(n);
      continue;
    }
    const parentOk = Boolean(n.parent_id && clones.has(n.parent_id) && n.parent_id !== n.id);
    if (parentOk && n.parent_id !== origin.id) {
      placed.push(n);
      continue;
    }
    const originMs = ts(origin.created_at);
    const ageDays = originMs ? (ts(n.created_at) - originMs) / 86_400_000 : 0;
    if (parentOk && n.parent_id === origin.id && n.edge === "reply" && ageDays <= 1.5) {
      placed.push(n);
      continue;
    }

    const tTok = toks.get(n.id) ?? new Set<string>();
    const tMs = ts(n.created_at);
    const recent = placed.slice(-16);
    const stars = [...placed].sort((a, b) => influence(b) - influence(a)).slice(0, 8);
    const seen = new Set<string>();
    let best: TweetNode | null = null;
    let bestScore = 0;

    for (const cand of [...recent, ...stars]) {
      if (seen.has(cand.id) || cand.id === n.id) continue;
      seen.add(cand.id);
      const sim = tokenSim(tTok, toks.get(cand.id) ?? new Set());
      let recency = 0.35;
      const cMs = ts(cand.created_at);
      if (tMs && cMs) {
        const days = (tMs - cMs) / 86_400_000;
        if (days < 0) continue;
        recency = Math.exp(-days / 5);
      }
      let score = 0.3 * sim + 0.55 * recency + 0.15 * Math.log10(1 + influence(cand));
      if ((childCounts.get(cand.id) || 0) >= maxChildren) score *= 0.25;
      if (cand.id === origin.id) score *= 0.15;
      if (recent.length && cand.id === recent[recent.length - 1]?.id) score += 0.2;
      if (score > bestScore) {
        bestScore = score;
        best = cand;
      }
    }

    const parent = best ?? origin;
    n.parent_id = parent.id;
    if (n.edge === "origin") n.edge = "mutation";
    parent.children.push(n);
    childCounts.set(parent.id, (childCounts.get(parent.id) || 0) + 1);
    placed.push(n);
  }
}

function keepOnlyMemePosts(forest: TweetNode[], name: string, query: string): TweetNode[] {
  if (!name && !query) return forest;
  const raw = flatten(forest);
  const keep = new Set(raw.filter((n) => bodyMentionsMeme(n.body, name, query)).map((n) => n.id));
  if (!keep.size) return forest;
  const clones = new Map<string, TweetNode>();
  for (const n of raw) {
    if (!keep.has(n.id)) continue;
    let pid = n.parent_id;
    while (pid && !keep.has(pid)) {
      const prev = raw.find((x) => x.id === pid);
      pid = prev?.parent_id ?? null;
    }
    clones.set(n.id, { ...n, children: [], parent_id: pid && keep.has(pid) ? pid : null });
  }
  for (const n of clones.values()) {
    if (n.parent_id && clones.has(n.parent_id)) clones.get(n.parent_id)!.children.push(n);
  }
  return [...clones.values()].filter((n) => !n.parent_id);
}

/** One concise tree per language: same-language edges stay; one early high-reach origin. */
export function treesByLanguage(
  forest: TweetNode[],
  windowStart = "2026-08-17",
  terms: string[] = [],
  name = "",
  query = "",
): LangTree[] {
  const nodes = flatten(keepOnlyMemePosts(forest, name, query));
  const langs = [...new Set(nodes.map((n) => languageKey(n.lang)))];
  const trees: LangTree[] = [];

  for (const key of langs) {
    const keep = new Set(nodes.filter((n) => languageKey(n.lang) === key).map((n) => n.id));
    if (keep.size === 0) continue;
    const clones = new Map<string, TweetNode>();
    for (const n of nodes) {
      if (!keep.has(n.id)) continue;
      clones.set(n.id, { ...n, children: [], parent_id: null, edge: "origin", generation: 0 });
    }
    for (const n of nodes) {
      if (!keep.has(n.id)) continue;
      const node = clones.get(n.id)!;
      if (n.parent_id && keep.has(n.parent_id)) {
        const parent = clones.get(n.parent_id)!;
        node.parent_id = parent.id;
        node.edge = n.edge === "origin" ? "mutation" : n.edge;
        parent.children.push(node);
      }
    }
    const roots = [...clones.values()].filter((n) => !n.parent_id);
    const unified = unifyForest(roots, windowStart, terms, name, query);
    const shown = flatten(unified);
    trees.push({
      key,
      name: languageName(key),
      count: shown.length,
      likes: shown.reduce((s, n) => s + (n.like_count || 0), 0),
      forest: unified,
    });
  }

  const ranked = trees.sort((a, b) => b.count - a.count || b.likes - a.likes);
  const shown = ranked.filter((t) => t.count >= 3);
  return shown.length ? shown : ranked.slice(0, 1);
}

export function postUrl(node: TweetNode): string {
  return node.url || `https://x.com/i/web/status/${node.id}`;
}
