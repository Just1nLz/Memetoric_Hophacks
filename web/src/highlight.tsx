import type { ReactNode } from "react";

const TINY = new Set(["the", "and", "for", "you", "are", "so", "we", "up", "a", "of", "to", "in", "or", "never", "gonna", "give"]);

const STEMS: Record<string, string[]> = {
  farm: ["farm", "farming", "farmer"],
  farming: ["farm", "farming", "farmer"],
  aura: ["aura"],
  mog: ["mog", "mogging", "mogged"],
  mogging: ["mog", "mogging", "mogged"],
  crash: ["crash", "crashout"],
  crashout: ["crash", "crashout", "crash out"],
  rickroll: ["rickroll"],
  npc: ["npc", "npcs"],
  delulu: ["delulu", "delusional"],
  skibidi: ["skibidi"],
  labubu: ["labubu"],
  locked: ["locked", "locked in"],
  glaze: ["glaze", "glazing", "glazed"],
  glazing: ["glaze", "glazing", "glazed"],
  yap: ["yap", "yapping"],
  yapping: ["yap", "yapping"],
  goon: ["gooning", "gooner"],
  gooning: ["gooning", "gooner"],
  rizz: ["rizz", "rizzler", "rizzed"],
  cooked: ["cooked"],
  grass: ["grass", "touch grass"],
  ragebait: ["ragebait", "rage bait", "ragebaiting"],
  sigma: ["sigma"],
};

export function memeTerms(name: string, query: string): string[] {
  const phrases = [name, ...query.split(/[/·|,]+/)]
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const bag = new Set<string>();
  for (const p of phrases) {
    bag.add(p.toLowerCase());
    for (const w of p.split(/\s+/)) {
      const t = w.toLowerCase();
      if (t.length >= 3 && !TINY.has(t)) bag.add(t);
      if (/^\d{2}$/.test(t)) bag.add(t);
    }
  }
  for (const t of [...bag]) {
    for (const extra of STEMS[t] ?? []) bag.add(extra);
  }
  return [...bag].sort((a, b) => b.length - a.length);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** True only if the post actually uses the tracked phrase — not a quote-parent that never says it. */
export function bodyMentionsMeme(body: string, name: string, query: string): boolean {
  const text = (body || "").toLowerCase();
  if (!text) return false;
  const phrases = [name, ...query.split(/[/·|,]+/)]
    .map((s) => s.replace(/\s+/g, " ").trim().toLowerCase())
    .filter(Boolean);
  for (const p of phrases) {
    const words = p.split(/\s+/).filter((w) => w.length >= 2 && !TINY.has(w));
    if (words.length >= 2) {
      const flex = words.map((w) => escapeRe(w)).join("\\s+");
      if (new RegExp(flex, "i").test(text)) return true;
      const extras = words.flatMap((w) => STEMS[w] ?? [w]);
      if (words.every((w) => extras.some((e) => text.includes(e)))) return true;
    } else if (p.length >= 4 && text.includes(p)) {
      return true;
    } else if (p.length >= 2 && new RegExp(`\\b${escapeRe(p)}\\b`, "i").test(text)) {
      return true;
    }
  }
  return false;
}

function splitHits(text: string, terms: string[]): { text: string; hit: boolean }[] {
  if (!text || !terms.length) return [{ text, hit: false }];
  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(${escaped.join("|")})`, "gi");
  const out: { text: string; hit: boolean }[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), hit: false });
    out.push({ text: m[0], hit: true });
    last = m.index + m[0].length;
    if (m[0].length === 0) re.lastIndex += 1;
  }
  if (last < text.length) out.push({ text: text.slice(last), hit: false });
  return out.length ? out : [{ text, hit: false }];
}

export function highlightMeme(text: string, terms: string[]): ReactNode {
  return splitHits(text, terms).map((p, i) =>
    p.hit ? (
      <strong key={i} className="meme-hit">
        {p.text}
      </strong>
    ) : (
      p.text
    ),
  );
}

export function highlightMemeTspans(text: string, terms: string[]): ReactNode {
  return splitHits(text, terms).map((p, i) => (
    <tspan key={i} className={p.hit ? "meme-hit" : undefined} fontWeight={p.hit ? 700 : 400}>
      {p.text}
    </tspan>
  ));
}

export function clipBody(body: string, max = 36): string {
  const clean = body.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export function firstMemeHit(body: string, terms: string[]): string | null {
  const hit = splitHits(body, terms).find((p) => p.hit);
  return hit?.text ?? null;
}
