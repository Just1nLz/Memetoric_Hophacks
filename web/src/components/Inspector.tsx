import { useEffect, useMemo, useRef, useState } from "react";
import { compact, grokBotUrl, grokChatUrl, grokImagineUrl, when } from "../format";
import { edgeAnnotation, influence, postUrl } from "../layout";
import type { TweetNode } from "../types";
import { Spark } from "./Charts";

type Props = {
  node: TweetNode | null;
  parent?: TweetNode | null;
  memeName?: string;
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
    lines.push(`UI mutation tag: ${ann.label}.`);
    lines.push(`One-line read: ${ann.detail}`);
    lines.push(ann.kept);
    for (const r of ann.reasons) lines.push(`Why “${r.tag}”: ${r.why}`);
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

export function Inspector({ node, parent = null, memeName = "" }: Props) {
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
  const delta = parent ? edgeAnnotation(parent, node) : null;
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
      <h2>{node.edge === "origin" ? "Origin tweet" : `${cap(node.edge)} of the line`}</h2>
      <p className="tweet-body">{node.body}</p>
      {delta && (
        <div className="lineage-delta">
          <p className="kicker tight">Why this mutation</p>
          <p className="delta-via">{delta.label}</p>
          <p className="delta-lead">{delta.detail}</p>
          <p className="delta-kept">{delta.kept}</p>
          <ol className="delta-reasons">
            {delta.reasons.map((r) => (
              <li key={r.tag}>
                <strong>Why “{r.tag}”</strong>
                <p>{r.why}</p>
              </li>
            ))}
          </ol>
          <div className="delta-compare">
            <div>
              <span>Previous post</span>
              <p>{delta.parentExcerpt}</p>
            </div>
            <div>
              <span>This post</span>
              <p>{delta.childExcerpt}</p>
            </div>
          </div>
          <p className="delta-via-note">{viaLine(node)}</p>
        </div>
      )}
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
        <div>
          <dt>influence</dt>
          <dd title="views/80 + likes + 2×reposts + 3×quotes + replies">{compact(influence(node))}</dd>
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
      <p className="kicker tight">Influence trajectory</p>
      <Spark snapshots={node.snapshots} />
      <p className="muted tiny">
        Key is <code>(id, version)</code>. The firehose re-observes the same tweet; the curve is not a new post.{" "}
        <a href={href} target="_blank" rel="noreferrer">
          Open source post
        </a>
      </p>

      <p className="kicker tight">Ask GrokBot</p>
      <p className="muted tiny">
        Built-in Grok chat. The selected post and mutation tags are attached. After a reply, type a follow-up about
        the explanation. Reset or pick another node to start over.
      </p>
      <p className="muted tiny grok-attached">
        Attached · {node.body.replace(/\s+/g, " ").slice(0, 90)}
        {node.body.length > 90 ? "…" : ""}
      </p>

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
      <button type="button" className="ghost-link" disabled={grokBusy} onClick={() => void imagineApi()}>
        GrokImagine
      </button>
      {imagineUrl && <img className="imagine" src={imagineUrl} alt="Grok Imagine still" />}
    </aside>
  );
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function viaLine(node: TweetNode): string {
  if (node.edge === "reply") {
    return "Link type: reply — a real thread, not just a lookalike.";
  }
  if (node.edge === "quote") {
    return "Link type: quote — the previous post is cited; the new caption is the mutation.";
  }
  return "Link type: mutation — inferred kinship (shared meme, later in time), not a reply or quote.";
}
