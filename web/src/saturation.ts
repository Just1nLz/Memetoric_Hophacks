import { utcDay } from "./format";
import type { DayPoint, TweetNode } from "./types";

export type DayMutations = {
  reply: number;
  quote: number;
  mutation: number;
  origin: number;
  total: number;
};

export const PHASE_COLOR: Record<string, string> = {
  rising: "#d6ff4b",
  peak: "#fff36a",
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

/** Consecutive phase runs for the lifecycle ribbon. */
export function phaseRuns(series: DayPoint[]): { phase: string; start: string; end: string; n: number }[] {
  const runs: { phase: string; start: string; end: string; n: number }[] = [];
  for (const s of series) {
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
  const live = series.filter((s) => s.coverage !== false);
  const peak = live.find((s) => s.phase === "peak") ?? null;
  const satFrom = live.find((s) => s.phase === "saturated") ?? null;
  const last = live.at(-1) ?? null;
  const afterPeak = peak ? live.filter((s) => s.t > peak.t) : [];
  const afterVol = afterPeak.reduce((n, s) => n + s.tweets, 0);
  const total = live.reduce((n, s) => n + s.tweets, 0) || 1;
  return {
    peakDay: peak?.t ?? null,
    peakTweets: peak?.tweets ?? 0,
    saturatedFrom: satFrom?.t ?? null,
    lastSat: last?.saturation ?? null,
    lastPhase: last?.phase ?? "unknown",
    spentAfterPeak: afterVol / total,
  };
}

export type SaturationPhase = "rising" | "peak" | "decline" | "saturated" | "uncovered" | "unknown";

export function phaseOf(series: DayPoint[], day: string | null | undefined): DayPoint | null {
  if (!day || !series.length) return null;
  return series.find((s) => s.t === day) ?? null;
}

export function saturationForPost(series: DayPoint[], node: TweetNode | null): DayPoint | null {
  if (!node) return null;
  return phaseOf(series, utcDay(node.created_at));
}

export function phaseLabel(phase: SaturationPhase | string | undefined): string {
  switch (phase) {
    case "rising":
      return "Rising";
    case "peak":
      return "Peak fluency";
    case "decline":
      return "Cooling off";
    case "saturated":
      return "Saturated / cringe risk";
    case "uncovered":
      return "No firehose coverage";
    default:
      return "Unknown";
  }
}

/** Late use after the joke is spent — fluent readers treat it as dated appropriation. */
export function saturationCopy(point: DayPoint | null, peakDay: string | null): string {
  if (!point || point.phase === "uncovered") {
    return "This day is outside the local firehose slice, so saturation cannot be scored.";
  }
  const sat = point.saturation != null ? `${Math.round(point.saturation * 100)}%` : "—";
  if (point.phase === "rising") {
    return `The phrase is still accumulating meaning. About ${sat} of observed monthly volume has landed by this day — early use, low cringe risk.`;
  }
  if (point.phase === "peak") {
    return `Peak day (${point.t}). Fluent users still treat the joke as current. Brands joining here look timely; joining later looks calculated.`;
  }
  if (point.phase === "decline") {
    return `Past the peak${peakDay ? ` (${peakDay})` : ""}. ${sat} of observed uses have already happened. The template is cooling — fluent readers start to hear it as tired.`;
  }
  if (point.phase === "saturated") {
    return `Saturated. ${sat} of the month’s uses are already spent${peakDay ? ` after the ${peakDay} peak` : ""}. Repeating the slang here often reads as cringe, not funny, or brand appropriation — joining a conversation that native users already left.`;
  }
  return `Saturation ${sat} on ${point.t}.`;
}
