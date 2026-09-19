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

export function engagement(node: TweetNode): number {
  return (
    node.like_count +
    node.retweet_count * 2 +
    node.quote_count * 3 +
    node.reply_count +
    node.views_count / 80
  );
}

export function radius(node: TweetNode): number {
  return Math.max(8, Math.min(28, 7 + Math.log10(1 + engagement(node)) * 5.4));
}
