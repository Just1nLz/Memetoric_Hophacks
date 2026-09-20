import { useEffect, useMemo, useRef, useState } from "react";
import { grokBotUrl, grokChatUrl, grokImagineUrl } from "../format";
import { edgeAnnotation, postUrl } from "../layout";
import type { TweetNode } from "../types";

type ChatTurn = { role: "user" | "assistant"; content: string };
type Mode = "ask" | "create";

type Props = {
  open: boolean;
  mode: Mode;
  memeName: string;
  memeBlurb: string;
  node: TweetNode | null;
  parent: TweetNode | null;
  onClose: () => void;
  onMode: (m: Mode) => void;
};

const SUGGEST = [
  "Explain this branch",
  "Why did this mutation spread?",
  "Compare these two branches",
  "What should I watch next?",
  "Summarize this meme's evolution",
];

export function GrokAssistant({ open, mode, memeName, memeBlurb, node, parent, onClose, onMode }: Props) {
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [imagineUrl, setImagineUrl] = useState<string | null>(null);
  const [imagineDraft, setImagineDraft] = useState("");
  const threadRef = useRef<HTMLDivElement>(null);

  const context = useMemo(() => buildContext(memeName, memeBlurb, node, parent), [memeName, memeBlurb, node, parent]);
  const imagineStarter = useMemo(
    () =>
      `Internet meme still: "${memeName}". Inspired by this tweet, no logos: ${
        node ? node.body.slice(0, 280) : memeBlurb
      }`,
    [memeName, memeBlurb, node],
  );

  useEffect(() => {
    setMessages([]);
    setDraft("");
    setImagineUrl(null);
    setImagineDraft(imagineStarter);
  }, [node?.id, memeName, imagineStarter]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const send = async (text: string) => {
    const prompt = text.trim();
    if (!prompt || busy) return;
    const next: ChatTurn[] = [...messages, { role: "user", content: prompt }];
    setMessages(next);
    setDraft("");
    setBusy(true);
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
      setBusy(false);
    }
  };

  const imagine = async () => {
    const prompt = imagineDraft.trim() || imagineStarter;
    setBusy(true);
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
      setBusy(false);
    }
  };

  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? draft;
  const href = node ? postUrl(node) : "";

  return (
    <div className={`grok-panel ${open ? "open" : ""}`} role="dialog" aria-label="Ask Grok" aria-hidden={!open}>
      <header className="grok-panel-head">
        <div>
          <p className="kicker">Grok</p>
          <h2>{mode === "create" ? "Create" : "Ask Grok"}</h2>
          {node && <p className="muted tiny">Context: gen {node.generation} · {node.edge}</p>}
        </div>
        <button type="button" className="icon-btn" aria-label="Close Grok" onClick={onClose}>
          ×
        </button>
      </header>
      <div className="drawer-tabs">
        <button type="button" className={mode === "ask" ? "on" : ""} onClick={() => onMode("ask")}>
          Ask
        </button>
        <button type="button" className={mode === "create" ? "on" : ""} onClick={() => onMode("create")}>
          Create
        </button>
      </div>

      {mode === "ask" ? (
        <div className="grok-panel-body">
          <div className="suggest-row">
            {SUGGEST.map((s) => (
              <button key={s} type="button" className="chip" onClick={() => void send(s)}>
                {s}
              </button>
            ))}
          </div>
          {messages.length > 0 && (
            <div className="grok-thread" ref={threadRef}>
              {messages.map((m, i) => (
                <div key={`${m.role}-${i}`} className={`grok-bubble ${m.role}`}>
                  <span className="grok-who">{m.role === "user" ? "You" : "Grok"}</span>
                  <p>{m.content}</p>
                </div>
              ))}
              {busy && <p className="muted tiny grok-wait">Grok is thinking…</p>}
            </div>
          )}
          <label className="grok-prompt-label">
            Prompt
            <textarea
              className="grok-prompt"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void send(draft);
                }
              }}
              rows={4}
              placeholder={node ? "Ask about this mutation…" : "Ask about this meme’s evolution…"}
            />
          </label>
          <div className="grok-row">
            <button type="button" className="play grok-send" disabled={busy || !draft.trim()} onClick={() => void send(draft)}>
              {busy ? "Sending…" : "Ask Grok"}
            </button>
            <a className="ghost-link" href={grokChatUrl(lastUser || SUGGEST[0])} target="_blank" rel="noreferrer">
              Open in Grok
            </a>
            {href && (
              <a className="ghost-link" href={grokBotUrl(`${lastUser}\n${href}`)} target="_blank" rel="noreferrer">
                GrokBot on X
              </a>
            )}
          </div>
        </div>
      ) : (
        <div className="grok-panel-body">
          <label className="grok-prompt-label">
            Imagine prompt
            <textarea
              className="grok-prompt grok-prompt-sm"
              value={imagineDraft}
              onChange={(e) => setImagineDraft(e.target.value)}
              rows={4}
            />
          </label>
          <button type="button" className="play grok-imagine" disabled={busy} onClick={() => void imagine()}>
            Generate still
          </button>
          {imagineUrl && <img className="imagine" src={imagineUrl} alt="Grok Imagine still" />}
        </div>
      )}
    </div>
  );
}

export function GrokFab({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="grok-fab" onClick={onClick}>
      Ask Grok
    </button>
  );
}

function buildContext(memeName: string, memeBlurb: string, node: TweetNode | null, parent: TweetNode | null) {
  const lines = [`Meme family: ${memeName}.`, `Blurb: ${memeBlurb}`];
  if (!node) {
    lines.push("No node selected — speak to the family as a whole.");
    return lines.join("\n");
  }
  lines.push(parent ? `Earlier post: ${parent.body}` : "This is a root / origin post.");
  lines.push(`This post (${node.edge === "mutation" ? "remix, not a reply" : node.edge}): ${node.body}`);
  lines.push(`Posted ${node.created_at}. Likes ${node.like_count}. Language ${node.lang}.`);
  if (parent) {
    const ann = edgeAnnotation(parent, node);
    lines.push(`UI mutation tag: ${ann.label}. ${ann.detail}`);
  }
  return lines.join("\n");
}
