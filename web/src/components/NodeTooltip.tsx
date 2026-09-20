import { compact } from "../format";
import type { TweetNode } from "../types";

type Props = {
  node: TweetNode;
  label: string;
  x: number;
  y: number;
};

export function NodeTooltip({ node, label, x, y }: Props) {
  return (
    <div className="node-tooltip" style={{ left: x, top: y }}>
      <p className="node-tooltip-k">{label}</p>
      <p className="node-tooltip-body">{clip(node.body)}</p>
      <p className="node-tooltip-meta">
        {kindLabel(node.edge)} · gen {node.generation} · {compact(node.like_count)} likes
      </p>
    </div>
  );
}

function clip(body: string): string {
  const clean = body.replace(/\s+/g, " ").trim();
  return clean.length > 96 ? `${clean.slice(0, 95)}…` : clean;
}

function kindLabel(edge: string): string {
  if (edge === "origin") return "origin";
  if (edge === "reply") return "reply";
  if (edge === "quote") return "quote";
  return "mutation";
}
