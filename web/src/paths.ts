import { influenceRaw } from "./influence";
import { flatten } from "./layout";
import { edgeAnnotation } from "./mutation";
import type { TweetNode } from "./types";

const MAX_PATHS = 8;
const MAX_PATH_NODES = 10;
const OVERLAP = 0.58;

export type LineagePath = {
  id: string;
  nodes: TweetNode[];
  ids: Set<string>;
  label: string;
  detail: string;
  mutations: number;
  generation: number;
};

/** Distinct origin→leaf descents, ranked so a first-time reader can follow one take at a time. */
export function lineagePaths(forest: TweetNode[]): LineagePath[] {
  const origin = forest[0];
  if (!origin) return [];
  const all = flatten(forest);
  const byId = new Map(all.map((n) => [n.id, n]));
  const leaves = all.filter((n) => n.children.length === 0 && n.id !== origin.id);
  const unique = new Map<string, LineagePath>();
  for (const leaf of leaves) {
    const path = makePath(chainTo(leaf, byId));
    if (path) unique.set(path.id, path);
  }
  const candidates = [...unique.values()].sort((a, b) => pathScore(b) - pathScore(a));

  const picked: LineagePath[] = [];
  for (const path of candidates) {
    if (picked.length >= MAX_PATHS) break;
    if (picked.some((q) => jaccard(path.ids, q.ids) > OVERLAP)) continue;
    if (path.mutations === 0 && path.generation < 3 && path.nodes.length < 4) continue;
    picked.push(path);
  }

  if (!picked.length && candidates[0]) picked.push(candidates[0]);

  return picked;
}

export function pathIndexForNode(paths: LineagePath[], id: string): number {
  const hit = paths.findIndex((p) => p.ids.has(id));
  if (hit >= 0) return hit;
  let best = 0;
  let bestN = -1;
  paths.forEach((p, i) => {
    // Prefer a path that shares the selected node’s generation neighborhood.
    const n = p.nodes.filter((node) => node.id === id).length;
    if (n > bestN) {
      bestN = n;
      best = i;
    }
  });
  return best;
}

function chainTo(node: TweetNode, byId: Map<string, TweetNode>): TweetNode[] {
  const acc: TweetNode[] = [];
  let cur: TweetNode | undefined = node;
  while (cur) {
    acc.push(cur);
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  return acc.reverse();
}

function makePath(nodes: TweetNode[]): LineagePath | null {
  const chain = nodes.slice(0, MAX_PATH_NODES);
  if (chain.length < 2) return null;
  const leaf = chain[chain.length - 1];
  const mutations = chain.filter((n) => n.edge === "mutation").length;
  const quotes = chain.filter((n) => n.edge === "quote").length;
  const generation = leaf.generation || chain.length - 1;
  return {
    id: leaf.id,
    nodes: chain,
    ids: new Set(chain.map((n) => n.id)),
    label: pathLabel(chain),
    detail: `${chain.length} posts · ${mutations} mutation${mutations === 1 ? "" : "s"}${
      quotes ? ` · ${quotes} quote${quotes === 1 ? "" : "s"}` : ""
    } · gen 0–${generation}`,
    mutations,
    generation,
  };
}

function pathLabel(nodes: TweetNode[]): string {
  const marks: string[] = [];
  for (let i = 1; i < nodes.length; i++) {
    const ann = edgeAnnotation(nodes[i - 1], nodes[i]);
    const shifted =
      ann.tags.includes("subject-shift") ||
      ann.tags.includes("action-shift") ||
      nodes[i].edge === "mutation";
    if (!shifted) continue;
    const parts = ann.label.split("→").map((s) => s.trim()).filter(Boolean);
    const bit = parts[1] ?? parts[0];
    if (!bit || bit === "new take") continue;
    if (marks[marks.length - 1]?.toLowerCase() === bit.toLowerCase()) continue;
    marks.push(bit);
  }
  if (marks.length >= 2) return `${marks[0]} → ${marks[marks.length - 1]}`;
  if (marks.length === 1) return marks[0];
  return `Gen ${nodes[nodes.length - 1].generation} descent`;
}

function pathScore(path: LineagePath): number {
  const peak = Math.max(0, ...path.nodes.map((n) => influenceRaw(n)));
  let shifts = 0;
  for (let i = 1; i < path.nodes.length; i++) {
    const tags = edgeAnnotation(path.nodes[i - 1], path.nodes[i]).tags;
    if (tags.includes("subject-shift") || tags.includes("action-shift")) shifts += 1;
  }
  const quotes = path.nodes.filter((n) => n.edge === "quote").length;
  const len = path.nodes.length;
  const lengthFit = Math.exp(-((len - 8) ** 2) / 18) * 220;
  return (
    lengthFit +
    Math.min(path.mutations, 8) * 22 +
    quotes * 10 +
    shifts * 42 +
    Math.log1p(peak) * 10
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const id of a) if (b.has(id)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}
