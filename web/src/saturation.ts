import { utcDay } from "./format";
import type { DayPoint, TweetNode } from "./types";

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
