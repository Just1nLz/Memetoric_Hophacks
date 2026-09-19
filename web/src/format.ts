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

export function when(iso: string | null | undefined): string {
  const d = parseTime(iso);
  if (!d) return iso ? iso.slice(0, 16) : "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function dayLabel(iso: string): string {
  const d = parseTime(iso) ?? new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function ts(iso: string): number {
  return parseTime(iso)?.getTime() ?? 0;
}

