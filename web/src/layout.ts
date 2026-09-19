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

export function layoutForest(forest: TweetNode[]): Map<string, LaidOut> {
  const positions = new Map<string, LaidOut>();
  const dx = 132;
  const dy = 172;
  let x = 88;

  const layout = (node: TweetNode, depth: number): number => {
    if (node.children.length === 0) {
      const xx = x;
      x += dx;
      positions.set(node.id, { x: xx, y: 64 + depth * dy, node });
      return xx;
    }
    const xs = node.children.map((c) => layout(c, depth + 1));
    const xx = (Math.min(...xs) + Math.max(...xs)) / 2;
    positions.set(node.id, { x: xx, y: 64 + depth * dy, node });
    return xx;
  };

  forest.forEach((root, i) => {
    if (i > 0) x += 56;
    layout(root, 0);
  });

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

/**
 * Compact consumer tree: origin + the highest-necessity posts and the path back to origin.
 * Researcher view should pass the forest through unchanged.
 */
export function pruneConsumerForest(forest: TweetNode[], keepHighlights = 8, maxNodes = 14): TweetNode[] {
  if (forest.length === 0) return [];
  const raw = flatten(forest);
  const byId = new Map(raw.map((n) => [n.id, n]));
  const origin = forest[0];
  const ranked = raw
    .filter((n) => n.id !== origin.id)
    .sort((a, b) => necessity(b) - necessity(a));
  const keep = new Set<string>([origin.id]);
  for (const n of ranked.slice(0, keepHighlights)) {
    let cur: TweetNode | undefined = n;
    while (cur && !keep.has(cur.id)) {
      keep.add(cur.id);
      cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
    }
  }
  if (keep.size > maxNodes) {
    const extras = ranked.filter((n) => keep.has(n.id) && n.id !== origin.id);
    for (let i = extras.length - 1; i >= 0 && keep.size > maxNodes; i--) {
      const id = extras[i].id;
      const kids = raw.filter((n) => n.parent_id === id && keep.has(n.id));
      if (kids.length === 0 && id !== origin.id) keep.delete(id);
    }
  }
  const clones = new Map<string, TweetNode>();
  for (const n of raw) {
    if (!keep.has(n.id)) continue;
    clones.set(n.id, { ...n, children: [], parent_id: n.parent_id && keep.has(n.parent_id) ? n.parent_id : null });
  }
  const root = clones.get(origin.id);
  if (!root) return forest;
  root.parent_id = null;
  root.edge = "origin";
  for (const n of clones.values()) {
    if (n.id === root.id) continue;
    const pid = n.parent_id && clones.has(n.parent_id) ? n.parent_id : root.id;
    n.parent_id = pid;
    clones.get(pid)!.children.push(n);
  }
  for (const n of clones.values()) {
    n.children.sort((a, b) => necessity(b) - necessity(a));
  }
  retagGenerations(root, 0);
  return [root];
}

export function radius(node: TweetNode): number {
  return Math.max(12, Math.min(36, 10 + Math.log10(1 + influence(node)) * 6.2));
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
  for (const n of clones.values()) {
    if (n.id === origin.id || n.parent_id) continue;
    n.parent_id = origin.id;
    if (n.edge === "origin") n.edge = "mutation";
    origin.children.push(n);
  }
  origin.children.sort((a, b) => ts(a.created_at) - ts(b.created_at));
  retagGenerations(origin, 0);
  return [origin];
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
