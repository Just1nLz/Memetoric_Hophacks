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
  const dx = 300;
  const dy = 132;
  let y = 56;

  const layout = (node: TweetNode, depth: number): number => {
    if (node.children.length === 0) {
      const yy = y;
      y += dy;
      positions.set(node.id, { x: 150 + depth * dx, y: yy, node });
      return yy;
    }
    const ys = node.children.map((c) => layout(c, depth + 1));
    const yy = (Math.min(...ys) + Math.max(...ys)) / 2;
    positions.set(node.id, { x: 150 + depth * dx, y: yy, node });
    return yy;
  };

  forest.forEach((root, i) => {
    if (i > 0) y += 56;
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

export function radius(node: TweetNode): number {
  return Math.max(12, Math.min(36, 10 + Math.log10(1 + influence(node)) * 6.2));
}

function cloneNode(node: TweetNode): TweetNode {
  return { ...node, children: node.children.map(cloneNode) };
}

function subtreeSize(node: TweetNode): number {
  return 1 + node.children.reduce((sum, child) => sum + subtreeSize(child), 0);
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

/** One concise tree per language: same-language edges stay; cross-language links become new roots. */
export function treesByLanguage(forest: TweetNode[]): LangTree[] {
  const nodes = flatten(forest);
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
    const unified = unifyForest(roots);
    trees.push({
      key,
      name: languageName(key),
      count: keep.size,
      likes: [...clones.values()].reduce((s, n) => s + (n.like_count || 0), 0),
      forest: unified,
    });
  }

  return trees.sort((a, b) => b.count - a.count || b.likes - a.likes);
}

/**
 * Collapse disconnected roots into one primary origin so the map reads as a single family.
 * The strongest tree (descendants × influence) stays origin; other seeds hang off it as mutations.
 */
export function unifyForest(forest: TweetNode[]): TweetNode[] {
  if (forest.length === 0) return [];
  if (forest.length === 1) {
    const only = cloneNode(forest[0]);
    only.edge = "origin";
    only.parent_id = null;
    retagGenerations(only, 0);
    return [only];
  }

  const ranked = forest
    .map((root) => ({
      root,
      score: subtreeSize(root) * 1_000 + influence(root),
    }))
    .sort((a, b) => b.score - a.score);

  const origin = cloneNode(ranked[0].root);
  origin.edge = "origin";
  origin.parent_id = null;

  for (const extra of ranked.slice(1)) {
    const branch = cloneNode(extra.root);
    branch.parent_id = origin.id;
    branch.edge = "mutation";
    branch.edge_label = "+side lineage";
    branch.edge_detail = "Separate seed folded under the primary origin (highest-influence tree).";
    origin.children.push(branch);
  }

  retagGenerations(origin, 0);
  return [origin];
}

export function postUrl(node: TweetNode): string {
  return node.url || `https://x.com/i/web/status/${node.id}`;
}
