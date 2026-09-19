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

/** Shared meme payload — not a mutation by itself. */
const CORE = new Set([
  "aura", "farm", "farming", "farmer", "skibidi", "rickroll", "rick", "astley",
  "never", "gonna", "give", "labubu", "crashout", "crash", "npc", "npcs",
  "mog", "mogging", "mogged", "delulu", "delusional", "tralalero", "bombardiro",
  "tung", "brainrot",
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

/** Distinctive subjects: names, franchises, places — not filler. */
function subjects(body: string): string[] {
  const caps = (body.match(/\b[A-Z][a-zA-Z]{2,}\b/g) ?? [])
    .map((s) => s.toLowerCase())
    .filter((s) => !STOP.has(s) && !CORE.has(s) && s !== "http" && s !== "https");
  const rest = tokens(body).filter((t) => t.length > 3);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of [...caps, ...rest]) {
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
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

function reasonForTag(
  tag: string,
  parent: TweetNode,
  child: TweetNode,
  subject: string | null,
  newFrames: { tag: string; words: string[]; meaning: string }[],
): string {
  const who = subject ? pretty(subject) : null;
  const frame = newFrames.find((f) => f.tag === tag);
  const evidence = frame?.words.slice(0, 3).join(", ");

  switch (tag) {
    case "translation":
      return `The last post is in ${languageName(parent.lang)}; this one is in ${languageName(child.lang)}. Same meme, new language — that is a transmission mutation, not a new joke.`;
    case "fandom":
    case "crossover":
      return who
        ? `The last post did not center on ${who}. This one recasts the meme onto ${who} — a new performer of the same bit. That is why the chip reads as fandom / crossover instead of listing random leftover words.`
        : "This post attaches the meme to a celebrity, character, or franchise that the previous post did not use.";
    case "challenge":
      return evidence
        ? `The previous post was a scene. This one turns the meme into a contest (it introduces “${evidence}”) — who can perform it harder.`
        : "This post frames the meme as a competition rather than a single pose.";
    case "sports":
      return evidence
        ? `Sports / arena language (“${evidence}”) shows up here and not in the last post. The mutation is applying the pose to an athletic moment.`
        : "The meme is now being used to describe a sports moment.";
    case "nature":
      return "The last post was about people. This one projects the same pose onto animals or nature — the subject mutated, the joke did not.";
    case "howto":
      return evidence
        ? `The voice shifted to advice (“${evidence}”). The last post showed the meme; this one tells you how to keep or do it.`
        : "The post turned the meme into a tip or how-to.";
    case "news":
      return "This caption uses the meme to narrate a news, scandal, or broadcast clip — a journalistic wrapper the previous post did not have.";
    case "format":
      return "The later post uses a 'when X…' setup. That is a template mutation: same punchline, new situational wrapper.";
    case "clip":
      return evidence
        ? `A media wrapper appears here (“${evidence}”) that was not the point of the last post. The caption stays the meme; the clip is the new vehicle.`
        : "A new clip or video is doing the carrying; the text is just the meme tag.";
    case "quote":
      return "Because this is a quote-tweet, the mutation is the added commentary sitting on top of the previous post.";
    case "reply":
      return "Because this is a reply, the mutation is the new speaker’s take inside the same thread.";
    case "roast":
      return evidence
        ? `The stance flipped to mockery (“${evidence}”). The last post presented the meme; this one dunks on whoever is performing it.`
        : "The mutation is tone: this post roasts the performance instead of celebrating it.";
    case "praise":
      return "The stance is admiration. The mutation is treating the pose as peak execution of the meme.";
    case "anime":
      return "The meme jumped into anime / idol fandom — a scene swap, not a new catchphrase.";
    case "politics":
      return "The meme was recast onto a political figure or campaign moment.";
    case "reskin":
      return "No big frame change (language, contest, fandom) stood out. The later post is a reskin: same joke, different wrapper or wording.";
    default:
      return who
        ? `“${pretty(tag)}” marks a new subject (${who}) that the previous post did not use.`
        : `“${pretty(tag)}” is the shortest label for how this post twists the previous one.`;
  }
}

function sentence(tags: string[], subject: string | null, child: TweetNode): string {
  const who = subject ? pretty(subject) : null;
  if (tags.includes("translation")) {
    return who
      ? `The joke crossed into ${languageName(child.lang)} and recast onto ${who}.`
      : `The joke crossed into ${languageName(child.lang)} — same meme, new scene.`;
  }
  if (tags.includes("challenge")) return "The meme became a contest: who can perform it harder.";
  if (tags.includes("sports")) {
    return who ? `The pose was applied to a sports moment (${who}).` : "The pose was applied to a sports moment.";
  }
  if (tags.includes("crossover") || tags.includes("fandom")) {
    return who ? `Same meme, new subject: ${who}.` : "The meme was recast onto another celebrity or franchise.";
  }
  if (who) return `Same meme, new subject: ${who}.`;
  return "A reskin of the previous post — same joke, different wrapper.";
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

  const parentSubs = new Set(subjects(parent.body));
  const newSubs = subjects(child.body).filter((s) => !parentSubs.has(s));
  const subject = newSubs[0] ?? null;

  const childLooksNamed = Boolean(subject && /^[a-z]/.test(subject) && subject.length > 3);
  if (childLooksNamed && !tags.includes("translation") && !tags.includes("challenge")) {
    tags.push(subject && FRAMES.some((f) => f.tag === "anime" && f.words.includes(subject)) ? "crossover" : "fandom");
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
      labelParts.push(pretty(subject));
    }
  }
  if (labelParts.length === 0) labelParts.push(via === "quote" ? "quote" : via === "reply" ? "reply" : "reskin");

  const shown = labelParts.slice(0, 2);
  const reasons: MutationReason[] = [];
  const seen = new Set<string>();
  for (const tag of [...shown, ...unique, via === "mutation" ? "reskin" : via]) {
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    if (reasons.length >= 4) break;
    // Skip language-name second chip; it is explained under translation.
    if (unique.includes("translation") && tag === languageName(child.lang)) continue;
    if (tag === "reskin" && unique.length > 0) continue;
    seen.add(key);
    reasons.push({
      tag,
      why: reasonForTag(key, parent, child, subject, newFrames),
    });
  }
  if (reasons.length === 0) {
    reasons.push({ tag: shown[0] ?? "reskin", why: reasonForTag("reskin", parent, child, subject, newFrames) });
  }

  return {
    label: shown.join(" · "),
    detail: sentence(unique, subject, child),
    via,
    tags: unique,
    reasons,
    kept: keptWhy(parent, child),
    parentExcerpt: excerpt(parent.body),
    childExcerpt: excerpt(child.body),
  };
}

