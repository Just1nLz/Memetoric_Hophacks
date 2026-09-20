import type { TweetNode } from "./types";

export type MutationReason = {
  tag: string;
  why: string;
};

export type EdgeAnnotation = {
  label: string;
  detail: string;
  via: string;
  tags: string[];
  reasons: MutationReason[];
  kept: string;
  parentExcerpt: string;
  childExcerpt: string;
};

const LANG_NAME: Record<string, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  pt: "Portuguese",
  it: "Italian",
  de: "German",
  ar: "Arabic",
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese",
  ru: "Russian",
  hi: "Hindi",
  tr: "Turkish",
  nl: "Dutch",
  pl: "Polish",
  id: "Indonesian",
  th: "Thai",
  vi: "Vietnamese",
  eu: "Basque",
  ca: "Catalan",
  tl: "Tagalog",
  et: "Estonian",
  ht: "Haitian Creole",
  ta: "Tamil",
  fa: "Persian",
  und: "Unknown",
};

const STOP = new Set([
  "the", "and", "for", "you", "that", "this", "with", "are", "was", "have",
  "just", "from", "they", "your", "what", "when", "will", "about", "like",
  "https", "http", "www", "com", "lol", "its", "not", "but", "all", "can",
  "she", "him", "her", "his", "our", "out", "who", "how", "why", "any",
  "because", "guys", "guy", "now", "too", "really", "even", "still", "gonna",
  "gotta", "wanna", "dont", "don't", "im", "i'm", "ive", "we've", "we're",
  "ur", "dey", "lowk", "lowkey", "highkey", "fr", "ngl", "imo", "tbh",
  "been", "being", "them", "then", "than", "some", "most", "more", "very",
  "here", "there", "were", "their", "it's", "also", "into", "over", "after",
  "before", "while", "during", "only", "back", "down", "up", "off", "via",
]);

const SENTENCE_LEAD = new Set([
  "this", "that", "what", "where", "when", "why", "how", "who", "did", "does",
  "will", "would", "could", "should", "here", "there", "come", "went", "wait",
  "look", "see", "let", "get", "got", "make", "made", "take", "took",
  "where's", "wheres", "what's", "whats",
]);

const VERBS = new Set([
  "kill", "killed", "catch", "caught", "rob", "robs", "robbed", "pose", "posed",
  "dance", "danced", "wear", "wore", "leave", "left", "say", "said", "ask",
  "asked", "beg", "begged", "win", "won", "lose", "lost", "roast", "roasted",
  "hype", "hyped", "love", "loves", "loved", "help", "helps", "helped",
  "admit", "die", "died",
]);

const WEAK = new Set([
  ...STOP,
  ...SENTENCE_LEAD,
  ...VERBS,
  "today", "always", "both", "people", "someone", "everyone", "everybody",
  "everything", "anyone", "somebody", "nobody",
  "tried", "make", "made", "damn", "works", "screen", "trailer",
  "city", "american", "phrase", "learned", "hard", "type", "shit",
  "deadass", "post", "tweet", "look", "know", "think", "need", "want",
  "going", "doing", "done", "time", "wait", "used", "take", "takes",
  "he's", "shes", "she's", "yesterday", "tomorrow", "member", "members",
  "character", "terrifying", "reminder", "physically", "unable", "empty",
  "shell", "bright", "tragic", "moderation", "rather", "than", "because",
  "insane", "crazy", "wild", "real", "true", "history", "immediately",
  "secretly", "please", "maybe", "really",
  "he", "it", "we", "they", "me", "us",
  "pisses", "liked", "looked", "said",
  "isn't", "isnt", "ain't", "aint", "don't", "dont", "won't", "wont", "can't", "cant",
  "lmao", "lmfao", "rofl", "ikr", "smh", "wtf", "omg", "bruh", "nah", "yep",
]);

const GENERIC_ACT = new Set([
  "liked", "like", "die", "died", "said", "made", "looked", "going", "doing", "pisses",
]);

const CORE = new Set([
  "aura", "farm", "farming", "farmer", "farmed", "aurafarm", "aurafarming",
  "skibidi", "rickroll", "rick", "astley", "never", "gonna", "give",
  "labubu", "crashout", "crash", "npc", "npcs", "mog", "mogging", "mogged",
  "delulu", "delusional", "tralalero", "bombardiro", "tung", "brainrot",
  "locked", "ragebait", "ragebaiting", "glaze", "glazing", "glazed",
  "yapping", "yap", "gooning", "gooner", "rizz", "rizzler", "rizzed",
  "grass", "cooked", "sigma", "slop", "situationship", "backrooms",
  "ohio", "clanker", "clankers", "looksmaxx", "looksmaxxing", "gigachad",
  "tweaking", "tweakin", "ick", "nepo", "allegations",
]);

export function languageName(code: string | null | undefined): string {
  const key = (code || "und").toLowerCase().split("-")[0];
  return LANG_NAME[key] ?? key.toUpperCase();
}

export function languageKey(code: string | null | undefined): string {
  const key = (code || "und").toLowerCase().split("-")[0];
  return key || "und";
}

function stripUrls(body: string): string {
  return body
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\bt\.co\/\S+/gi, " ");
}

function tokens(body: string): string[] {
  return (stripUrls(body).toLowerCase().match(/[a-z0-9']+/g) ?? []).filter(
    (t) => t.length > 2 && !STOP.has(t) && !CORE.has(t) && !/^[a-z0-9]{8,}$/.test(t),
  );
}

function isVerbToken(t: string): boolean {
  const k = t.toLowerCase();
  return VERBS.has(k) || /(?:ing|ed)$/.test(k);
}

function plausibleName(s: string): boolean {
  const compact = s.replace(/\s+/g, "");
  if (compact.length < 2) return false;
  const key = s.toLowerCase();
  if (WEAK.has(key) || SENTENCE_LEAD.has(key) || CORE.has(key)) return false;
  if (/^(isn|don|won|can|ain)'t$/i.test(s)) return false;
  if (/\s/.test(s)) return s.split(/\s+/).some((w) => !WEAK.has(w.toLowerCase()));
  if (/[a-z][A-Z][a-z][A-Z]/.test(s)) return false;
  const uppers = s.match(/[A-Z]/g) ?? [];
  if (uppers.length >= 3 && /[a-z]/.test(s) && s.length > 6) return false;
  if (/[bcdfghjklmnpqrstvwxyz]{5,}/i.test(s)) return false;
  return true;
}

function titleWord(w: string): string {
  if (/\d/.test(w) || w.length <= 3) return w.toUpperCase();
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}

/** Shouty posts often name the object in all caps — keep that, drop the verb. */
function topicFromCaps(body: string): string | null {
  const text = stripUrls(body);
  const letters = text.replace(/[^A-Za-z]/g, "");
  if (letters.length < 6) return null;
  const capRatio = (text.match(/[A-Z]/g) ?? []).length / letters.length;
  if (capRatio < 0.65) return null;
  const words = (text.match(/\b[A-Z]{2,}\b/g) ?? []).map((w) => w.toLowerCase());
  const content = words.filter((w) => !STOP.has(w) && !WEAK.has(w) && !SENTENCE_LEAD.has(w) && !isVerbToken(w));
  if (content.length >= 2) return content.slice(-2).map(titleWord).join(" ");
  if (content.length === 1) return titleWord(content[0]);
  return null;
}

function coreHits(body: string): string[] {
  const raw = body.toLowerCase().match(/[a-z0-9']+/g) ?? [];
  return [...new Set(raw.filter((t) => CORE.has(t)))];
}

function namedSubjects(body: string): string[] {
  const text = stripUrls(body);
  const phrases = [
    ...(text.match(/\b(?:Dr|Mr|Ms|DJ)\.?\s+[A-Z][a-zA-Z]+\b/g) ?? []),
    ...(text.match(/\b[A-Z][a-z][a-zA-Z]*(?:\s+[A-Z][a-zA-Z]+)+\b/g) ?? []),
  ];
  const singles = (text.match(/\b[A-Z][a-zA-Z]{2,}\b/g) ?? []).filter((s) => {
    const k = s.toLowerCase();
    return !WEAK.has(k) && !CORE.has(k) && s !== "Http" && s !== "Https";
  });
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of [...phrases, ...singles]) {
    const k = s.replace(/\s+/g, " ").trim();
    const key = k.toLowerCase();
    if (!k || seen.has(key) || WEAK.has(key) || CORE.has(key) || isVerbToken(k)) continue;
    if (/^(he|she|it|they)'s$/i.test(k)) continue;
    const words = k.split(/\s+/);
    if (words.every((w) => CORE.has(w.toLowerCase()) || WEAK.has(w.toLowerCase()))) continue;
    if (words.some((w) => CORE.has(w.toLowerCase()))) continue;
    if (k === k.toUpperCase() && k.length > 4 && /(?:ED|ING)$/.test(k)) continue;
    if (SENTENCE_LEAD.has(key)) continue;
    const cleaned = k
      .split(/\s+/)
      .filter((w) => !(w === w.toUpperCase() && w.length > 5) && !SENTENCE_LEAD.has(w.toLowerCase()) && !isVerbToken(w))
      .join(" ");
    if (!cleaned || !plausibleName(cleaned) || seen.has(cleaned.toLowerCase())) continue;
    if (cleaned === cleaned.toUpperCase() && !/\d/.test(cleaned) && (cleaned.includes(" ") || cleaned.length > 4)) continue;
    seen.add(cleaned.toLowerCase());
    out.push(cleaned);
  }
  const handles = [
    ...[...text.matchAll(/#([a-z][a-z0-9]{1,10})/gi)].map((m) => m[1]),
    ...tokens(text).filter((t) => /[a-z]{2,}\d/i.test(t) && t.length <= 8),
  ];
  for (const h of handles) {
    const key = h.toLowerCase();
    if (seen.has(key) || CORE.has(key) || WEAK.has(key) || !plausibleName(h)) continue;
    seen.add(key);
    out.push(/\d/.test(h) ? h.toUpperCase() : pretty(h));
  }
  return out;
}

function displayName(s: string): string {
  if (/[A-Z]/.test(s.slice(1)) || /\s/.test(s)) return s;
  return pretty(s);
}

function shortName(s: string): string {
  const parts = s.replace(/\s+/g, " ").trim().split(" ");
  if (parts.length >= 3) return parts.slice(-2).join(" ");
  if (s.length > 16 && parts.length === 2) return parts[1];
  return s.length > 18 ? `${s.slice(0, 17)}…` : s;
}

function gist(body: string): string | null {
  const named = namedSubjects(body).find((s) => plausibleName(s));
  if (named) return displayName(named);
  const topic = topicFromCaps(body);
  if (topic) return topic;
  const tok = tokens(body).find(
    (t) => !WEAK.has(t) && !isVerbToken(t) && !/(?:ly)$/.test(t) && t.length > 3 && plausibleName(t),
  );
  return tok ? pretty(tok) : null;
}

function actions(body: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of tokens(body)) {
    if (CORE.has(t) || STOP.has(t) || SENTENCE_LEAD.has(t) || GENERIC_ACT.has(t)) continue;
    if (!isVerbToken(t)) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function memePhrase(parent: TweetNode, child: TweetNode): string {
  const cores = [...new Set([...coreHits(child.body), ...coreHits(parent.body)])];
  if (cores.includes("aura") || cores.some((c) => c.startsWith("farm"))) return "aura farming";
  if (cores.includes("rickroll") || cores.includes("rick")) return "rickroll";
  if (cores.includes("skibidi")) return "skibidi";
  if (cores.includes("labubu")) return "labubu";
  if (cores.includes("crashout") || cores.includes("crash")) return "crashout";
  if (cores.includes("npc") || cores.includes("npcs")) return "NPC";
  if (cores.includes("mog") || cores.includes("mogging") || cores.includes("mogged")) return "mogging";
  if (cores.includes("delulu") || cores.includes("delusional")) return "delulu";
  if (cores.some((c) => c === "tralalero" || c === "bombardiro" || c === "tung")) return "Italian brainrot";
  if (cores.includes("locked")) return "locked in";
  if (cores.includes("ragebait") || cores.includes("ragebaiting")) return "ragebait";
  if (cores.some((c) => c.startsWith("glaz"))) return "glazing";
  if (cores.includes("yapping") || cores.includes("yap")) return "yapping";
  if (cores.includes("gooning") || cores.includes("gooner")) return "gooning";
  if (cores.includes("rizz") || cores.includes("rizzler") || cores.includes("rizzed")) return "rizz";
  if (cores.includes("grass")) return "touch grass";
  if (cores.includes("cooked")) return "we're cooked";
  if (cores.includes("sigma")) return "sigma";
  if (cores.includes("slop")) return "AI slop";
  if (cores.includes("situationship")) return "situationship";
  if (cores.includes("backrooms")) return "backrooms";
  if (cores.includes("ohio")) return "Ohio";
  if (cores.includes("clanker") || cores.includes("clankers")) return "clanker";
  if (cores.includes("gigachad")) return "gigachad";
  const both = `${parent.body} ${child.body}`.toLowerCase();
  if (both.includes("so over")) return "it's so over";
  if (both.includes("so back")) return "we are so back";
  if (both.includes("let him cook") || both.includes("let her cook") || both.includes("let them cook")) {
    return "let him cook";
  }
  if (both.includes("main character")) return "main character";
  if (both.includes("skill issue")) return "skill issue";
  if (both.includes("down bad")) return "down bad";
  if (both.includes("it's giving") || both.includes("its giving")) return "it's giving";
  if (both.includes("the voices")) return "the voices";
  if (both.includes("talking stage")) return "talking stage";
  if (both.includes("roman empire")) return "roman empire";
  if (both.includes("the ick")) return "the ick";
  if (both.includes("pick me")) return "pick me";
  if (both.includes("no cap")) return "no cap";
  return cores[0] ? pretty(cores[0]) : "the meme";
}

function pretty(s: string): string {
  if (s.length <= 3) return s.toUpperCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function excerpt(body: string, max = 140): string {
  const clean = body.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function viaOf(child: TweetNode): string {
  return child.edge === "reply" ? "reply" : child.edge === "quote" ? "quote" : "mutation";
}

function sameName(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase() || a.toLowerCase().includes(b.toLowerCase()) || b.toLowerCase().includes(a.toLowerCase());
}

function keptWhy(parent: TweetNode, child: TweetNode): string {
  const shared = coreHits(parent.body).filter((t) => coreHits(child.body).includes(t));
  if (shared.length) {
    return `Both posts still carry “${shared.slice(0, 3).join(" / ")}”. The label is the change around that core — who it is about, or what they are doing.`;
  }
  return "This post still belongs to the same meme family. The label names what flipped from the parent: the subject or the action, not a genre guess.";
}

function deltaLabel(parentObj: string | null, childObj: string | null, parentAct: string | null, childAct: string | null, via: string, translated: boolean, childLang: string): string {
  if (translated) return `${languageName(childLang)}`;
  if (parentObj && childObj && !sameName(parentObj, childObj)) {
    return `${shortName(parentObj)} → ${shortName(childObj)}`;
  }
  if (childObj && !parentObj) return `onto ${shortName(childObj)}`;
  if (parentAct && childAct && parentAct !== childAct) {
    return `${pretty(parentAct)} → ${pretty(childAct)}`;
  }
  if (childAct && !parentAct) return pretty(childAct);
  if (via === "reply") return childObj ? `reply · ${shortName(childObj)}` : "reply add-on";
  if (via === "quote") return childObj ? `quote · ${shortName(childObj)}` : "quote add-on";
  if (childObj) return shortName(childObj);
  return "new take";
}

function deltaDetail(
  meme: string,
  parentObj: string | null,
  childObj: string | null,
  parentAct: string | null,
  childAct: string | null,
  via: string,
  parent: TweetNode,
  child: TweetNode,
): string {
  if (languageKey(parent.lang) !== languageKey(child.lang)) {
    return `The parent kept ${meme} in ${languageName(parent.lang)}. This post says it in ${languageName(child.lang)}.`;
  }
  if (parentObj && childObj && !sameName(parentObj, childObj)) {
    return `The parent post is about ${parentObj}. This descendant keeps ${meme} but aims it at ${childObj}.`;
  }
  if (childObj && !parentObj) {
    return `The parent does not name a subject. This descendant aims ${meme} at ${childObj}.`;
  }
  if (parentAct && childAct && parentAct !== childAct) {
    return `Same subject, new action: the parent is doing “${pretty(parentAct)}”; this descendant is doing “${pretty(childAct)}.”`;
  }
  if (via === "reply") {
    return `This reply keeps ${meme} and adds ${childObj ?? childAct ?? "a new take"} on top of the parent.`;
  }
  if (via === "quote") {
    return `This quote keeps ${meme} and layers ${childObj ?? childAct ?? "a new take"} onto the parent.`;
  }
  if (childObj) {
    return `This descendant keeps ${meme} but points it at ${childObj}, which the parent did not use.`;
  }
  return `This descendant keeps ${meme} and changes the wrapper — a later take on the same idea, not a reply or quote.`;
}

/** Short chip + a parent→child explanation of who/what changed. */
export function edgeAnnotation(parent: TweetNode, child: TweetNode): EdgeAnnotation {
  const via = viaOf(child);
  const parentObj = gist(parent.body);
  const childNames = namedSubjects(child.body);
  const parentNames = new Set(namedSubjects(parent.body).map((s) => s.toLowerCase()));
  const newName = childNames.find((s) => !parentNames.has(s.toLowerCase())) ?? null;
  const childObj = newName ? displayName(newName) : gist(child.body);
  const parentAct = actions(parent.body)[0] ?? null;
  const childAct = actions(child.body).find((a) => a !== parentAct) ?? actions(child.body)[0] ?? null;
  const translated = languageKey(parent.lang) !== languageKey(child.lang);
  const label = deltaLabel(parentObj, childObj, parentAct, childAct, via, translated, child.lang);
  const detail = deltaDetail(memePhrase(parent, child), parentObj, childObj, parentAct, childAct, via, parent, child);
  const tags = [via];
  if (translated) tags.push("translation");
  if (parentObj && childObj && !sameName(parentObj, childObj)) tags.push("subject-shift");
  if (parentAct && childAct && parentAct !== childAct) tags.push("action-shift");

  return {
    label,
    detail,
    via,
    tags,
    reasons: [{ tag: label, why: detail }],
    kept: keptWhy(parent, child),
    parentExcerpt: excerpt(parent.body),
    childExcerpt: excerpt(child.body),
  };
}
