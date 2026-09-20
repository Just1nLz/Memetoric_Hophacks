import type { TweetNode } from "./types";

/**
 * Research prior for how hard a post hit the feed — not how many remixes it spawned.
 *
 *   R = 4Q + 2.8S + 2.2C + 1.6B + L + ln(1+V)
 *   I = 100 · ln(1+R) / ln(1+R_max)
 *
 * Quotes weigh most (they recast the bit). Reposts broadcast. Replies are argument.
 * Bookmarks are parked attention. Likes are cheap affirmation. Views stand in for
 * clicks / impressions and are log-diluted so reach alone cannot look like impact.
 * The index is 0–100 against the hardest-hitting post in this family.
 */
export const INFLUENCE_WEIGHTS = {
  quotes: 4,
  reposts: 2.8,
  replies: 2.2,
  bookmarks: 1.6,
  likes: 1,
} as const;

export type InfluenceDriver = {
  key: "quotes" | "reposts" | "replies" | "bookmarks" | "likes" | "views";
  label: string;
  share: number;
};

export type InfluenceBand = "trace" | "local" | "notable" | "breakout" | "apex";

export type InfluenceReport = {
  raw: number;
  index: number;
  rank: number;
  of: number;
  percentile: number;
  band: InfluenceBand;
  drivers: InfluenceDriver[];
  lead: string;
};

const DRIVER_LABEL: Record<InfluenceDriver["key"], string> = {
  quotes: "Quotes",
  reposts: "Reposts",
  replies: "Replies",
  bookmarks: "Saves",
  likes: "Likes",
  views: "Views",
};

export function influenceRaw(node: TweetNode): number {
  return (
    INFLUENCE_WEIGHTS.quotes * (node.quote_count || 0) +
    INFLUENCE_WEIGHTS.reposts * (node.retweet_count || 0) +
    INFLUENCE_WEIGHTS.replies * (node.reply_count || 0) +
    INFLUENCE_WEIGHTS.bookmarks * (node.bookmarks_count || 0) +
    INFLUENCE_WEIGHTS.likes * (node.like_count || 0) +
    Math.log1p(node.views_count || 0)
  );
}

function driverParts(node: TweetNode): { key: InfluenceDriver["key"]; part: number }[] {
  return [
    { key: "quotes", part: INFLUENCE_WEIGHTS.quotes * (node.quote_count || 0) },
    { key: "reposts", part: INFLUENCE_WEIGHTS.reposts * (node.retweet_count || 0) },
    { key: "replies", part: INFLUENCE_WEIGHTS.replies * (node.reply_count || 0) },
    { key: "bookmarks", part: INFLUENCE_WEIGHTS.bookmarks * (node.bookmarks_count || 0) },
    { key: "likes", part: INFLUENCE_WEIGHTS.likes * (node.like_count || 0) },
    { key: "views", part: Math.log1p(node.views_count || 0) },
  ];
}

export function influenceBand(index: number): InfluenceBand {
  if (index >= 81) return "apex";
  if (index >= 56) return "breakout";
  if (index >= 36) return "notable";
  if (index >= 16) return "local";
  return "trace";
}

function investigationLead(band: InfluenceBand, drivers: InfluenceDriver[]): string {
  const top = drivers[0]?.key;
  if (band === "trace") {
    return "Low impact in this family — useful as a missing-link check, not as a circulation hub.";
  }
  if (top === "quotes") {
    return "Quote-heavy. This post was recast — start with quote descendants; they are the mutation fuel.";
  }
  if (top === "reposts") {
    return "Broadcast-heavy. It spread by forwarding. Trace who amplified it, not who argued under it.";
  }
  if (top === "replies") {
    return "Conversation-heavy. The thread is the evidence trail — read replies before grafting more hops.";
  }
  if (top === "views") {
    return "High reach, thin reaction. Treat as a circulation node (seen, not taken up), not a meaning node.";
  }
  if (top === "bookmarks") {
    return "Saved more than discussed. People parked it — worth asking what they meant to reuse later.";
  }
  return "Affirmation-heavy. Popular in-place, weaker as a lineage driver unless later hops quote it.";
}

export function scoreFamily(nodes: TweetNode[]): Map<string, InfluenceReport> {
  const raws = nodes.map((n) => influenceRaw(n));
  const sorted = [...raws].sort((a, b) => a - b);
  const peak = Math.max(1, sorted[sorted.length - 1] ?? 0);
  const denom = Math.log1p(peak);
  const out = new Map<string, InfluenceReport>();

  const indexed = nodes.map((node, i) => {
    const raw = raws[i];
    const index = Math.max(0, Math.min(100, Math.round((100 * Math.log1p(raw)) / Math.max(denom, 1e-6))));
    const parts = driverParts(node);
    const total = parts.reduce((s, p) => s + p.part, 0) || 1;
    const drivers = parts
      .map((p) => ({
        key: p.key,
        label: DRIVER_LABEL[p.key],
        share: p.part / total,
      }))
      .filter((d) => d.share >= 0.04)
      .sort((a, b) => b.share - a.share);
    const below = sorted.filter((r) => r <= raw).length;
    return { node, raw, index, drivers, percentile: below / Math.max(1, nodes.length) };
  });

  const rankOrder = [...indexed].sort((a, b) => b.raw - a.raw || b.index - a.index);
  const rankOf = new Map<string, number>();
  rankOrder.forEach((row, i) => {
    const prev = rankOrder[i - 1];
    rankOf.set(row.node.id, prev && prev.raw === row.raw ? (rankOf.get(prev.node.id) ?? i + 1) : i + 1);
  });

  for (const row of indexed) {
    const band = influenceBand(row.index);
    out.set(row.node.id, {
      raw: row.raw,
      index: row.index,
      rank: rankOf.get(row.node.id) ?? nodes.length,
      of: nodes.length,
      percentile: row.percentile,
      band,
      drivers: row.drivers,
      lead: investigationLead(band, row.drivers),
    });
  }
  return out;
}

export function reportFor(node: TweetNode, family: TweetNode[]): InfluenceReport {
  return scoreFamily(family).get(node.id) ?? scoreFamily([node]).get(node.id)!;
}

export function bandLabel(band: InfluenceBand): string {
  if (band === "apex") return "Apex";
  if (band === "breakout") return "Breakout";
  if (band === "notable") return "Notable";
  if (band === "local") return "Local";
  return "Trace";
}

export function influenceBins(reports: InfluenceReport[], bins = 10): number[] {
  const counts = Array.from({ length: bins }, () => 0);
  for (const r of reports) {
    const i = Math.min(bins - 1, Math.max(0, Math.floor((r.index / 100) * bins)));
    counts[i] += 1;
  }
  return counts;
}
