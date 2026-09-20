import { useEffect, useMemo, useRef, useState } from "react";
import { compact, grokBotUrl, grokChatUrl, grokImagineUrl, when } from "../format";
import { highlightMeme } from "../highlight";
import { edgeAnnotation, influence, postUrl } from "../layout";
import { saturationForPost } from "../saturation";
import type { DayPoint, TweetNode } from "../types";
import { SaturationGauge } from "./SaturationGauge";

type Props = {
  node: TweetNode | null;
  parent?: TweetNode | null;
  memeName?: string;
  terms?: string[];
  series?: DayPoint[];
};

type ChatTurn = { role: "user" | "assistant"; content: string };

function postContext(memeName: string, node: TweetNode, parent: TweetNode | null) {
  const lines = [
    `Meme family: ${memeName}.`,
    parent ? `Earlier post: ${parent.body}` : "This is a root / origin post.",
    `This post (${node.edge === "mutation" ? "remix, not a reply" : node.edge}): ${node.body}`,
    `Posted ${node.created_at}. Likes ${node.like_count}. Language ${node.lang}.`,
  ];
  if (parent) {
    const ann = edgeAnnotation(parent, node);
    lines.push(`UI mutation tag: ${ann.label}. ${ann.detail}`);
  }
  return lines.join("\n");
}

function defaultAsk(node: TweetNode, parent: TweetNode | null) {
  if (parent) {
    const ann = edgeAnnotation(parent, node);
    return (
      `We tagged this step “${ann.label}”. In two short paragraphs: ` +
      `(1) why that mutation fits — what stayed vs what changed from the previous post, ` +
      `(2) what to watch next if we are tracking this meme on X.`
    );
  }
  if (node.edge === "origin") {
    return "In two short paragraphs: (1) what this origin post is doing with the meme, (2) what to watch next if we are tracking its spread on X.";
  }
  return "In two short paragraphs: (1) how this post continues the thread, (2) what to watch next if we are tracking its spread on X.";
}

export function Inspector({ node, parent = null, memeName = "", terms = [], series = [] }: Props) {
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [grokBusy, setGrokBusy] = useState(false);
  const [imagineUrl, setImagineUrl] = useState<string | null>(null);
  const [imagineDraft, setImagineDraft] = useState("");
  const threadRef = useRef<HTMLDivElement>(null);

  const starter = useMemo(() => (node ? defaultAsk(node, parent) : ""), [node, parent]);
  const context = useMemo(
    () => (node ? postContext(memeName, node, parent) : ""),
    [memeName, node, parent],
  );
  const imagineStarter = useMemo(
    () =>
      node
        ? `Internet meme still: "${memeName}". Inspired by this tweet, no logos: ${node.body.slice(0, 280)}`
        : "",
    [memeName, node],
  );

  useEffect(() => {
    setMessages([]);
    setDraft(starter);
    setImagineUrl(null);
    setImagineDraft(imagineStarter);
  }, [node?.id, starter, imagineStarter]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, grokBusy]);

  if (!node) {
    return (
      <aside className="inspector">
        <p className="kicker">Observation</p>
        <h2>Select a node</h2>
        <p className="muted">
          Click a node or an edge label. Labels name the mutation; this panel explains why. Ask GrokBot a follow-up.
        </p>
      </aside>
    );
  }

  const metrics = [
    ["likes", node.like_count],
    ["replies", node.reply_count],
    ["reposts", node.retweet_count],
    ["quotes", node.quote_count],
    ["views", node.views_count],
    ["saves", node.bookmarks_count],
  ] as const;
  const href = postUrl(node);
  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? draft;
  const inThread = messages.length > 0;

  const sendGrok = async () => {
    const text = draft.trim();
    if (!text || grokBusy) return;
    const next: ChatTurn[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setDraft("");
    setGrokBusy(true);
    try {
      const r = await fetch("/api/grok/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context, messages: next }),
      });
      const data = await r.json();
      const reply = data.text || data.error || "No reply — is the API running with XAI_API_KEY?";
      setMessages([...next, { role: "assistant", content: reply }]);
    } catch {
      setMessages([
        ...next,
        {
          role: "assistant",
          content: "Grok API isn’t running. Start the backend with XAI_API_KEY, or use the Grok / GrokBot links.",
        },
      ]);
    } finally {
      setGrokBusy(false);
    }
  };

  const imagineApi = async () => {
    const prompt = imagineDraft.trim() || imagineStarter;
    setGrokBusy(true);
    try {
      const r = await fetch("/api/grok/imagine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await r.json();
      if (data.image_url) setImagineUrl(data.image_url);
      else window.open(grokImagineUrl(prompt), "_blank", "noreferrer");
    } catch {
      window.open(grokImagineUrl(prompt), "_blank", "noreferrer");
    } finally {
      setGrokBusy(false);
    }
  };

  return (
    <aside className="inspector">
      <p className="kicker">Observation · gen {node.generation}</p>
      {(() => {
        const sat = saturationForPost(series, node);
        if (!sat) return null;
        return (
          <SaturationGauge point={sat} title="Saturation · when this post landed" />
        );
      })()}
      <h2>{node.edge === "origin" ? "Origin tweet" : `${cap(node.edge)} of the line`}</h2>
      <p className="tweet-body">{highlightMeme(node.body, terms)}</p>
      <p className="source-row">
        <a href={href} target="_blank" rel="noreferrer">
          Source post on X ↗
        </a>
      </p>
      <dl className="ids">
        <div>
          <dt>tweet</dt>
          <dd>{node.id}</dd>
        </div>
        <div>
          <dt>author</dt>
          <dd>{node.author_id}</dd>
        </div>
        <div>
          <dt>posted</dt>
          <dd>{when(node.created_at)}</dd>
        </div>
        <div>
          <dt>lang</dt>
          <dd>{node.lang}</dd>
        </div>
      </dl>
      <div className="metric-grid">
        {metrics.map(([k, v]) => (
          <div key={k} className="metric">
            <span>{k}</span>
            <strong>{compact(v)}</strong>
          </div>
        ))}
      </div>
      <div className="influence-note">
        <p className="kicker tight">Why this node is this size</p>
        <p>
          The tree scales a node by <strong>influence</strong> — how hard this post hit, not how many remixes it spawned.
          Score is likes + replies + 2×reposts + 3×quotes + views÷80. Quotes weigh most because they carry the bit onward.
        </p>
        <p className="influence-score">
          This post: <strong>{compact(influence(node))}</strong>
          <span>
            {compact(node.like_count)} likes · {compact(node.reply_count)} replies · {compact(node.retweet_count)}×2
            reposts · {compact(node.quote_count)}×3 quotes · {compact(node.views_count)}÷80 views
          </span>
        </p>
      </div>
      <p className="kicker tight">Ask GrokBot</p>

      {inThread && (
        <div className="grok-thread" ref={threadRef}>
          {messages.map((m, i) => (
            <div key={`${m.role}-${i}`} className={`grok-bubble ${m.role}`}>
              <span className="grok-who">{m.role === "user" ? "You" : "GrokBot"}</span>
              <p>{m.content}</p>
            </div>
          ))}
          {grokBusy && <p className="muted tiny grok-wait">GrokBot is thinking…</p>}
        </div>
      )}

      <label className="grok-prompt-label">
        {inThread ? "Follow-up" : "Prompt"}
        <textarea
          className="grok-prompt"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void sendGrok();
            }
          }}
          rows={inThread ? 3 : 6}
          placeholder={inThread ? "Ask a follow-up about this mutation…" : "What should GrokBot look at?"}
        />
      </label>
      <div className="grok-row">
        <button type="button" className="play grok-send" disabled={grokBusy || !draft.trim()} onClick={() => void sendGrok()}>
          {grokBusy ? "Sending…" : inThread ? "Send follow-up" : "Ask GrokBot"}
        </button>
        {inThread && (
          <button
            type="button"
            className="ghost-link"
            onClick={() => {
              setMessages([]);
              setDraft(starter);
            }}
          >
            Reset thread
          </button>
        )}
        <a className="ghost-link" href={grokChatUrl(lastUser)} target="_blank" rel="noreferrer">
          Open in Grok
        </a>
        <a className="ghost-link" href={grokBotUrl(`${lastUser}\n${href}`)} target="_blank" rel="noreferrer">
          GrokBot on X
        </a>
      </div>

      <label className="grok-prompt-label">
        Imagine prompt
        <textarea
          className="grok-prompt grok-prompt-sm"
          value={imagineDraft}
          onChange={(e) => setImagineDraft(e.target.value)}
          rows={3}
        />
      </label>
      <button type="button" className="play grok-imagine" disabled={grokBusy} onClick={() => void imagineApi()}>
        GrokImagine
      </button>
      {imagineUrl && <img className="imagine" src={imagineUrl} alt="Grok Imagine still" />}
    </aside>
  );
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

