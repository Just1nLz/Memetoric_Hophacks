import type { LaidOut, TweetNode } from "./types";

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
  const dx = 248;
  const dy = 108;
  let y = 40;

  const layout = (node: TweetNode, depth: number): number => {
    if (node.children.length === 0) {
      const yy = y;
      y += dy;
      positions.set(node.id, { x: 120 + depth * dx, y: yy, node });
      return yy;
    }
    const ys = node.children.map((c) => layout(c, depth + 1));
    const yy = (Math.min(...ys) + Math.max(...ys)) / 2;
    positions.set(node.id, { x: 120 + depth * dx, y: yy, node });
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
  return Math.max(8, Math.min(28, 7 + Math.log10(1 + influence(node)) * 5.4));
}

const STOP = new Set([
  "the", "and", "for", "you", "that", "this", "with", "are", "was", "have",
  "just", "from", "they", "your", "what", "when", "will", "about", "like",
  "https", "http", "www", "com", "lol", "its", "not", "but", "all", "can",
]);

function tokens(body: string): string[] {
  return (body.toLowerCase().match(/[a-z0-9']+/g) ?? []).filter(
    (t) => t.length > 2 && !STOP.has(t),
  );
}

export type EdgeAnnotation = {
  label: string;
  detail: string;
};

/** Concise lineage labels: why connected, what’s shared, why a branch splits. */
export function edgeAnnotation(parent: TweetNode, child: TweetNode): EdgeAnnotation {
  if (child.edge_label) {
    return {
      label: child.edge_label,
      detail: child.edge_detail ?? "",
    };
  }

  const shared = tokens(parent.body).filter((t) => tokens(child.body).includes(t));
  const unique = tokens(child.body).filter((t) => !tokens(parent.body).includes(t));
  const siblings = parent.children.filter((c) => c.id !== child.id);
  const splitHint =
    siblings.length > 0
      ? `Split under gen ${parent.generation}: ${siblings.length + 1} branches`
      : "";

  if (child.edge === "reply") {
    return {
      label: "reply",
      detail: ["Direct reply in the thread", splitHint].filter(Boolean).join(" · "),
    };
  }
  if (child.edge === "quote") {
    return {
      label: "quote",
      detail: [
        shared.length ? `Keeps ${shared.slice(0, 3).join(" · ")}` : "Quotes the parent",
        splitHint,
      ]
        .filter(Boolean)
        .join(" · "),
    };
  }

  const shareLabel = shared.length
    ? `same: ${shared.slice(0, 2).join(" · ")}`
    : "loose kinship";
  const drift = unique.length ? `new: ${unique.slice(0, 2).join(" · ")}` : "rephrased";
  return {
    label: shareLabel,
    detail: [drift, splitHint].filter(Boolean).join(" · "),
  };
}

export function postUrl(node: TweetNode): string {
  return node.url || `https://x.com/i/web/status/${node.id}`;
}
