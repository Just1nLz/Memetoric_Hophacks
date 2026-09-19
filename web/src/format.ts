export function parseTime(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  let s = iso.trim().replace(" ", "T");
  s = s.replace(/([+-]\d{2})$/, "$1:00");
  s = s.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(n);
}

/** Corpus window dates are UTC calendar days — display timestamps in UTC to match. */
const UTC: Intl.DateTimeFormatOptions = { timeZone: "UTC" };

export function utcDay(iso: string | null | undefined): string | null {
  const d = parseTime(iso);
  if (!d) return iso ? iso.slice(0, 10) : null;
  return d.toISOString().slice(0, 10);
}

export function when(iso: string | null | undefined): string {
  const d = parseTime(iso);
  if (!d) return iso ? iso.slice(0, 16) : "—";
  return d.toLocaleString(undefined, {
    ...UTC,
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function dayLabel(iso: string): string {
  const d = parseTime(iso) ?? new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString(undefined, { ...UTC, month: "short", day: "numeric" });
}

export function ts(iso: string): number {
  return parseTime(iso)?.getTime() ?? 0;
}

/** Clamp a timestamp so its UTC calendar day is not before the corpus window start. */
export function clampToWindow(iso: string | null | undefined, windowStart: string): string | null {
  if (!iso) return null;
  const day = utcDay(iso);
  if (!day) return iso;
  if (day < windowStart) return `${windowStart}T00:00:00Z`;
  return iso;
}

export function grokChatUrl(prompt: string): string {
  return `https://grok.com/?q=${encodeURIComponent(prompt)}`;
}

export function grokImagineUrl(prompt: string): string {
  return `https://grok.com/imagine?prompt=${encodeURIComponent(prompt)}`;
}

export function grokBotUrl(prompt: string): string {
  return `https://x.com/intent/post?text=${encodeURIComponent(`@grok ${prompt}`)}`;
}

