import { ts } from "./format";
import { flatten } from "./layout";
import type { TweetNode } from "./types";

export function hourFloor(t: number): number {
  if (!t) return 0;
  return Math.floor(t / 3_600_000) * 3_600_000;
}

/** Lineage clock starts at the origin. Earlier folded-in seeds appear with it, not before it. */
export function appearHour(node: TweetNode, originHour: number): number {
  const h = hourFloor(ts(node.created_at));
  if (!h) return originHour;
  return originHour && h < originHour ? originHour : h;
}

export function relatedIds(node: TweetNode): Set<string> {
  const ids = new Set<string>([node.id]);
  if (node.parent_id) ids.add(node.parent_id);
  for (const child of node.children) ids.add(child.id);
  return ids;
}

export function lineageBundle(forest: TweetNode[], id: string): Set<string> {
  const all = flatten(forest);
  const byId = new Map(all.map((n) => [n.id, n]));
  const node = byId.get(id);
  const keep = new Set<string>();
  if (!node) return keep;
  let cur: TweetNode | undefined = node;
  while (cur) {
    keep.add(cur.id);
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  const walk = (n: TweetNode) => {
    keep.add(n.id);
    n.children.forEach(walk);
  };
  walk(node);
  return keep;
}

export function pruneToIds(forest: TweetNode[], keep: Set<string>): TweetNode[] {
  const clip = (n: TweetNode): TweetNode | null => {
    if (!keep.has(n.id)) return null;
    const children = n.children.map(clip).filter((c): c is TweetNode => c !== null);
    return { ...n, children };
  };
  return forest.map(clip).filter((n): n is TweetNode => n !== null);
}

export type Confidence = "all" | "direct" | "inferred";

export type LineageFilters = {
  minLikes: number;
  minGen: number;
  maxGen: number;
  fromDay: string | null;
  confidence: Confidence;
};

export const DEFAULT_FILTERS: LineageFilters = {
  minLikes: 0,
  minGen: 0,
  maxGen: 99,
  fromDay: null,
  confidence: "all",
};

export function nodePassesFilters(
  n: TweetNode,
  f: LineageFilters,
  originId: string | undefined,
): boolean {
  if (n.id === originId) return true;
  if (n.like_count < f.minLikes) return false;
  const g = n.generation || 0;
  if (g < f.minGen || g > f.maxGen) return false;
  if (f.fromDay) {
    const day = n.created_at.slice(0, 10);
    if (day && day < f.fromDay) return false;
  }
  if (f.confidence === "direct" && n.edge === "mutation") return false;
  if (f.confidence === "inferred" && (n.edge === "reply" || n.edge === "quote")) return false;
  return true;
}
