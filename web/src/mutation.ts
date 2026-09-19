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

const WEAK = new Set([
  ...STOP,
  "today", "always", "both", "people", "someone", "everyone", "everything",
  "killed", "tried", "make", "made", "damn", "works", "screen", "trailer",
  "city", "farmed", "american", "phrase", "learned", "hard", "type", "shit",
  "deadass", "post", "tweet", "look", "know", "think", "need", "want",
  "going", "doing", "done", "time", "wait", "used", "take", "takes",
  "he's", "shes", "she's", "yesterday", "today", "tomorrow",
]);

const TAGS = new Set([
  "translation", "roast", "praise", "fandom", "crossover", "challenge",
  "sports", "howto", "clip", "format", "nature", "news", "quote", "reply",
  "politics", "reskin",
]);

/** Shared meme payload — not a mutation by itself. */
const CORE = new Set([
  "aura", "farm", "farming", "farmer", "skibidi", "rickroll", "rick", "astley",
  "never", "gonna", "give", "labubu", "crashout", "crash", "npc", "npcs",
  "mog", "mogging", "mogged", "delulu", "delusional", "tralalero", "bombardiro",
  "tung", "brainrot", "locked", "ragebait", "ragebaiting", "glaze", "glazing",
  "glazed", "yapping", "yap", "gooning", "gooner", "rizz", "rizzler", "rizzed",
  "grass", "cooked", "sigma",
]);

type Frame = { tag: string; words: string[]; meaning: string };

const FRAMES: Frame[] = [
  { tag: "challenge", words: ["tournament", "torneo", "competition", "challenge", "opponent", "opponents", "contrincante", "versus", "vs"], meaning: "a contest or who-does-it-better frame" },
  { tag: "sports", words: ["lucha", "wrestling", "wrestle", "soccer", "football", "nba", "nfl", "finals", "gym", "heel", "ring", "blizzcon"], meaning: "a sports or arena scene" },
  { tag: "clip", words: ["tiktok", "youtube", "clip", "video", "watch", "footage"], meaning: "a new video or clip wrapper" },
  { tag: "howto", words: ["nurture", "tutorial", "guide", "lesson", "forget", "remember"], meaning: "advice or how-to voice" },
  { tag: "news", words: ["accused", "news", "coverage", "headline", "pastor", "announcer"], meaning: "news, scandal, or broadcast framing" },
  { tag: "nature", words: ["reptile", "reptiles", "animal", "animals", "rain", "wildlife"], meaning: "animals or nature as the performer" },
  { tag: "anime", words: ["anime", "manga", "mangaka", "ichigo", "kubo", "jo1", "waifu"], meaning: "anime / idol fandom" },
  { tag: "format", words: ["when"], meaning: "a 'when X' joke template" },
  { tag: "praise", words: ["cool", "cinematic", "fire", "auraaa", "goated"], meaning: "praise of the pose" },
  { tag: "roast", words: ["egregious", "mid", "cringe", "dull", "retire"], meaning: "a roast of whoever is performing it" },
  { tag: "politics", words: ["trump", "biden", "campaign", "election", "president"], meaning: "political recasting" },
];

export function languageName(code: string | null | undefined): string {
  const key = (code || "und").toLowerCase().split("-")[0];
  return LANG_NAME[key] ?? key.toUpperCase();
}

export function languageKey(code: string | null | undefined): string {
  const key = (code || "und").toLowerCase().split("-")[0];
  return key || "und";
}

function tokens(body: string): string[] {
  return (body.toLowerCase().match(/[a-z0-9']+/g) ?? []).filter(
    (t) => t.length > 2 && !STOP.has(t) && !CORE.has(t) && !/^[a-z0-9]{8,}$/.test(t),
  );
}

function coreHits(body: string): string[] {
  const raw = (body.toLowerCase().match(/[a-z0-9']+/g) ?? []);
  return [...new Set(raw.filter((t) => CORE.has(t)))];
}

/** Keep original casing for names like Dr Doom / John Cena. */
function namedSubjects(body: string): string[] {
  const phrases = [
    ...(body.match(/\b(?:Dr|Mr|Ms|DJ)\.?\s+[A-Z][a-zA-Z]+\b/g) ?? []),
    ...(body.match(/\b[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)+\b/g) ?? []),
  ];
  const singles = (body.match(/\b[A-Z][a-zA-Z]{2,}\b/g) ?? []).filter((s) => {
    const k = s.toLowerCase();
    return !WEAK.has(k) && !CORE.has(k) && s !== "Http" && s !== "Https";
  });
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of [...phrases, ...singles]) {
    const k = s.replace(/\s+/g, " ").trim();
    const key = k.toLowerCase();
    if (!k || seen.has(key) || WEAK.has(key) || CORE.has(key)) continue;
    if (/^(he|she|it|they)'s$/i.test(k)) continue;
    const words = k.split(/\s+/);
    if (words.every((w) => CORE.has(w.toLowerCase()) || WEAK.has(w.toLowerCase()))) continue;
    if (words.some((w) => CORE.has(w.toLowerCase()))) continue;
    seen.add(key);
    out.push(k);
  }
  return out;
}

function displayName(s: string): string {
  if (/[A-Z]/.test(s.slice(1)) || /\s/.test(s)) return s;
  return pretty(s);
}

function gist(body: string): string | null {
  const named = namedSubjects(body)[0];
  if (named) return displayName(named);
  const tok = tokens(body).find((t) => !WEAK.has(t) && t.length > 3);
  return tok ? pretty(tok) : null;
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
  const both = `${parent.body} ${child.body}`.toLowerCase();
  if (both.includes("so over")) return "it's so over";
  if (both.includes("let him cook") || both.includes("let her cook") || both.includes("let them cook")) {
    return "let him cook";
  }
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

function frameHits(body: string): { tag: string; words: string[]; meaning: string }[] {
  const lower = body.toLowerCase();
  const toks = new Set(tokens(body));
  const hits: { tag: string; words: string[]; meaning: string }[] = [];
  for (const frame of FRAMES) {
    const words = frame.words.filter((w) => toks.has(w) || lower.includes(w));
    if (words.length) hits.push({ tag: frame.tag, words, meaning: frame.meaning });
  }
  return hits;
}

function keptWhy(parent: TweetNode, child: TweetNode): string {
  const shared = coreHits(parent.body).filter((t) => coreHits(child.body).includes(t));
  if (shared.length) {
    return `The meme payload is still here: both posts keep “${shared.slice(0, 3).join(" / ")}”. The annotation is not about those words. It names what changed around that core.`;
  }
  return "The later post still belongs to the same meme family, even if the exact catchphrase is rewritten. The annotation names the twist, not the shared joke.";
}

/** One sentence: how the last post became this one. */
function pairWhy(
  a: string,
  b: string | undefined,
  parent: TweetNode,
  child: TweetNode,
  subject: string | null,
  newFrames: { tag: string; words: string[]; meaning: string }[],
): string {
  const meme = memePhrase(parent, child);
  const from = gist(parent.body);
  const onto =
    subject && !TAGS.has(subject.toLowerCase())
      ? displayName(subject)
      : namedSubjects(child.body)[0] ?? (b && !TAGS.has(b.toLowerCase()) ? displayName(b) : null);
  const evidence = newFrames[0]?.words[0];
  const left = a.toLowerCase();

  if (left === "translation") {
    return `The last post kept ${meme} in ${languageName(parent.lang)}; this one says it in ${languageName(child.lang)}.`;
  }
  if (left === "roast") {
    return from && onto
      ? `The last post played ${meme} straight with ${from}; this one roasts ${onto} for the same pose.`
      : `The last post presented ${meme}; this one dunks on ${onto ?? "the performer"} instead.`;
  }
  if (left === "praise") {
    return onto
      ? `The last post ${from ? `was about ${from}` : `showed ${meme}`}; this one hypes ${onto} as peak execution.`
      : `The last post showed ${meme}; this one turns the same pose into praise.`;
  }
  if (left === "fandom" || left === "crossover") {
    if (from && onto && from.toLowerCase() !== onto.toLowerCase()) {
      return `The last post put ${meme} on ${from}; this one moves the same pose onto ${onto}.`;
    }
    if (onto) {
      return `The last post had no named face; this one puts ${meme} on ${onto}.`;
    }
    return `The last post ${from ? `centered ${from}` : `used ${meme}`}; this one recasts it into another fandom.`;
  }
  if (left === "challenge") {
    return onto
      ? `The last post showed ${from ?? meme}; this one turns it into a contest starring ${onto}.`
      : `The last post showed ${from ?? meme}; this one makes it a who-does-it-better contest.`;
  }
  if (left === "sports") {
    const sport = onto ?? (evidence ? pretty(evidence) : null);
    return from
      ? `The last post was about ${from}; this one applies ${meme} to ${sport ?? "an athletic beat"}.`
      : `The last post was a pose take; this one applies ${meme} to ${sport ?? "a sports moment"}.`;
  }
  if (left === "howto") {
    return `The last post showed ${from ?? meme}; this one tells you how to keep doing it${onto ? ` like ${onto}` : ""}.`;
  }
  if (left === "clip") {
    return `The last post was ${from ? `about ${from}` : "text-first"}; this one carries ${meme} with ${evidence ? `a ${evidence}` : "a clip"}${onto ? ` of ${onto}` : ""}.`;
  }
  if (left === "format") {
    return `The last post stated ${meme} outright${from ? ` via ${from}` : ""}; this one drops it into a “when ${onto ?? "X"}…” setup.`;
  }
  if (left === "nature") {
    return `The last post used ${from ?? "people"}; this one projects ${meme} onto ${onto ?? evidence ?? "a non-human performer"}.`;
  }
  if (left === "news") {
    return `The last post was a casual ${meme} take${from ? ` about ${from}` : ""}; this one uses it to narrate ${onto ?? "a news beat"}.`;
  }
  if (left === "quote" || left === "reply") {
    return `This ${left} keeps ${meme} and adds ${onto ?? "a new take"} on top of ${from ?? "the last post"}.`;
  }
  const landing = onto ?? gist(child.body);
  if (from && landing && from.toLowerCase() !== landing.toLowerCase()) {
    return `The last post centered ${from}; this one moves ${meme} onto ${landing}.`;
  }
  if (landing) {
    return `This post keeps ${meme} but aims it at ${landing}, which the last post did not use.`;
  }
  return `This post keeps ${meme} and changes the wrapper from ${from ?? "the last take"} to ${pretty(left)}.`;
}

/** 1–2 keywords plus a click-through explanation of why they mark this mutation. */
export function edgeAnnotation(parent: TweetNode, child: TweetNode): EdgeAnnotation {
  const via = viaOf(child);
  const tags: string[] = [];

  if (languageKey(parent.lang) !== languageKey(child.lang)) tags.push("translation");
  if (child.edge === "quote") tags.push("quote");
  if (child.edge === "reply") tags.push("reply");

  const parentFrameTags = new Set(frameHits(parent.body).map((f) => f.tag));
  const newFrames = frameHits(child.body).filter((f) => !parentFrameTags.has(f.tag));
  for (const f of newFrames) tags.push(f.tag);

  const parentNames = new Set(namedSubjects(parent.body).map((s) => s.toLowerCase()));
  const newNames = namedSubjects(child.body).filter((s) => !parentNames.has(s.toLowerCase()));
  const subject = newNames[0] ?? null;

  if (
    subject &&
    !tags.includes("translation") &&
    !tags.includes("challenge") &&
    !subject.split(/\s+/).every((w) => CORE.has(w.toLowerCase()))
  ) {
    tags.push(FRAMES.some((f) => f.tag === "anime" && f.words.includes(subject.toLowerCase())) ? "crossover" : "fandom");
  }

  const unique = [...new Set(tags)];
  const labelParts: string[] = [];
  if (unique.includes("translation")) {
    labelParts.push("translation", languageName(child.lang));
  } else {
    for (const t of unique) {
      if (labelParts.length >= 2) break;
      labelParts.push(t);
    }
    if (labelParts.length < 2 && subject && !labelParts.includes(subject)) {
      labelParts.push(displayName(subject));
    }
  }
  if (labelParts.length === 0) labelParts.push(via === "quote" ? "quote" : via === "reply" ? "reply" : "reskin");

  const shown = labelParts.slice(0, 2);
  const detail = pairWhy(shown[0], shown[1], parent, child, subject, newFrames);

  return {
    label: shown.join(" · "),
    detail,
    via,
    tags: unique,
    reasons: [{ tag: shown.join(" · "), why: detail }],
    kept: keptWhy(parent, child),
    parentExcerpt: excerpt(parent.body),
    childExcerpt: excerpt(child.body),
  };
}

