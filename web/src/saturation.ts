import { utcDay } from "./format";
import type { DayPoint, TweetNode } from "./types";

export type DayMutations = {
  reply: number;
  quote: number;
  mutation: number;
  origin: number;
  total: number;
};

/** Sweet spot: enough exposure, still funny. */
export const SAT_SWEET = 50;
/** Past this, native users hear the joke as spent. */
export const SAT_OVER = 80;

export type SaturationPhase =
  | "emerging"
  | "building"
  | "trending"
  | "cooling"
  | "oversaturated"
  | "uncovered"
  | "unknown";

export const PHASE_COLOR: Record<string, string> = {
  emerging: "#5c6a38",
  building: "#9bb84a",
  trending: "#d6ff4b",
  cooling: "#e8d27a",
  oversaturated: "#ff8a5b",
  rising: "#9bb84a",
  peak: "#d6ff4b",
  decline: "#e8d27a",
  saturated: "#ff8a5b",
  uncovered: "#4a4a46",
  unknown: "#9a988c",
};

export function mutationsByDay(nodes: TweetNode[]): Map<string, DayMutations> {
  const out = new Map<string, DayMutations>();
  for (const n of nodes) {
    const day = utcDay(n.created_at);
    if (!day) continue;
    const row = out.get(day) ?? { reply: 0, quote: 0, mutation: 0, origin: 0, total: 0 };
    if (n.edge === "reply" || n.edge === "quote" || n.edge === "mutation" || n.edge === "origin") {
      row[n.edge] += 1;
      row.total += 1;
    }
    out.set(day, row);
  }
  return out;
}

export function emptyMutations(): DayMutations {
  return { reply: 0, quote: 0, mutation: 0, origin: 0, total: 0 };
}

/** Cumulative share of the month as 0–100. */
export function saturationPct(sat: number | null | undefined): number | null {
  if (sat == null || Number.isNaN(sat)) return null;
  const n = sat <= 1.5 ? sat * 100 : sat;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function phaseFromScore(sat: number | null | undefined, coverage?: boolean): SaturationPhase {
  if (coverage === false) return "uncovered";
  const pct = saturationPct(sat);
  if (pct == null) return "unknown";
  if (pct < 25) return "emerging";
  if (pct < 40) return "building";
  if (pct < 65) return "trending";
  if (pct < SAT_OVER) return "cooling";
  return "oversaturated";
}

function migratePhase(raw?: string): SaturationPhase | null {
  switch (raw) {
    case "rising":
      return "emerging";
    case "peak":
      return "trending";
    case "decline":
      return "cooling";
    case "saturated":
      return "oversaturated";
    case "emerging":
    case "building":
    case "trending":
    case "cooling":
    case "oversaturated":
    case "uncovered":
    case "unknown":
      return raw;
    default:
      return null;
  }
}

export function interpretDay(point: DayPoint | null | undefined): DayPoint | null {
  if (!point) return null;
  const phase =
    point.coverage === false
      ? "uncovered"
      : point.saturation != null
        ? phaseFromScore(point.saturation, true)
        : (migratePhase(point.phase) ?? "unknown");
  return { ...point, phase };
}

export function interpretedSeries(series: DayPoint[]): DayPoint[] {
  return series.map((s) => interpretDay(s) ?? s);
}

/** Consecutive phase runs for the lifecycle ribbon. */
export function phaseRuns(series: DayPoint[]): { phase: string; start: string; end: string; n: number }[] {
  const runs: { phase: string; start: string; end: string; n: number }[] = [];
  for (const s of interpretedSeries(series)) {
    const phase = s.phase ?? "unknown";
    const last = runs.at(-1);
    if (last && last.phase === phase) {
      last.end = s.t;
      last.n += 1;
    } else {
      runs.push({ phase, start: s.t, end: s.t, n: 1 });
    }
  }
  return runs;
}

export function lifecycleSummary(series: DayPoint[]) {
  const live = interpretedSeries(series).filter((s) => s.coverage !== false);
  const trending = live.filter((s) => s.phase === "trending");
  const over = live.find((s) => s.phase === "oversaturated") ?? null;
  const last = live.at(-1) ?? null;
  const loudest = live.reduce((best, s) => (!best || s.tweets > best.tweets ? s : best), live[0] ?? null);
  return {
    peakDay: loudest?.t ?? null,
    peakTweets: loudest?.tweets ?? 0,
    saturatedFrom: over?.t ?? null,
    oversaturatedFrom: over?.t ?? null,
    trendingFrom: trending[0]?.t ?? null,
    lastSat: last?.saturation ?? null,
    lastPhase: last?.phase ?? "unknown",
    now: last,
  };
}

export function phaseOf(series: DayPoint[], day: string | null | undefined): DayPoint | null {
  if (!day || !series.length) return null;
  return interpretDay(series.find((s) => s.t === day) ?? null);
}

export function saturationForPost(series: DayPoint[], node: TweetNode | null): DayPoint | null {
  if (!node) return null;
  return phaseOf(series, utcDay(node.created_at));
}

export function latestCovered(series: DayPoint[]): DayPoint | null {
  for (let i = series.length - 1; i >= 0; i--) {
    const day = interpretDay(series[i]);
    if (day && day.coverage !== false) return day;
  }
  return null;
}

export function phaseLabel(phase: SaturationPhase | string | undefined): string {
  switch (phase) {
    case "emerging":
    case "rising":
      return "Under-exposed";
    case "building":
      return "Building";
    case "trending":
    case "peak":
      return "Trending";
    case "cooling":
    case "decline":
      return "Cooling";
    case "oversaturated":
    case "saturated":
      return "Oversaturated";
    case "uncovered":
      return "No firehose coverage";
    default:
      return "Unknown";
  }
}

export function saturationCopy(point: DayPoint | null): string {
  const day = interpretDay(point);
  if (!day || day.phase === "uncovered") {
    return "This day is outside the local firehose slice, so we cannot tell if the meme is popular yet.";
  }
  const pct = saturationPct(day.saturation);
  const n = pct != null ? `${pct}` : "—";
  if (day.phase === "emerging") {
    return `Saturation ${n}. Too few people have seen this. It is not popular enough to land as a shared joke — most of the internet will miss the reference.`;
  }
  if (day.phase === "building") {
    return `Saturation ${n}. Exposure is growing, but it is still below the sweet spot. Some people will get it; it is not the internet’s default joke yet.`;
  }
  if (day.phase === "trending") {
    return `Saturation ${n} — around the mean. Enough people know it, and they still like using it. This is when the meme is actually popular.`;
  }
  if (day.phase === "cooling") {
    return `Saturation ${n}. Past the sweet spot. Most of the month has already used it. Still recognizable, less funny.`;
  }
  if (day.phase === "oversaturated") {
    return `Saturation ${n}. Oversaturated. Using it now reads as cringe. A brand pairing a product with this meme here usually gets the opposite of cool — people no longer find it funny.`;
  }
  return `Saturation ${n} on ${day.t}.`;
}

/** One line so influence and saturation read as a pair. */
export function satInfluenceLine(phase: SaturationPhase | string | undefined, index: number): string | null {
  const loud = index >= 70;
  const quiet = index < 30;
  const p = migratePhase(phase) ?? phase;
  if (p === "trending" && loud) return "Hit hard while people still wanted the joke.";
  if (p === "trending" && quiet) return "In the pocket, but this post itself stayed quiet.";
  if (p === "oversaturated" && loud) {
    return "Loud after the joke had worn out — the kind of hit that now reads as cringe.";
  }
  if (p === "oversaturated" && quiet) return "Late and quiet. The cycle had already moved on.";
  if ((p === "emerging" || p === "building") && loud) return "A loud post before the meme was public currency.";
  if ((p === "emerging" || p === "building") && quiet) {
    return "Not enough people had seen it yet, and this post did not change that.";
  }
  if (p === "cooling" && loud) return "Still recognizable, but past the sweet spot — a late hit.";
  return null;
}
