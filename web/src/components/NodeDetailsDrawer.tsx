import { useState } from "react";
import { compact, when } from "../format";
import { highlightMeme } from "../highlight";
import { edgeAnnotation, postUrl } from "../layout";
import { phaseLabel, saturationCopy, saturationForPost } from "../saturation";
import type { DayPoint, TweetNode } from "../types";

type Tab = "overview" | "evidence" | "analytics";

type Props = {
  open: boolean;
  node: TweetNode | null;
  parent: TweetNode | null;
  terms: string[];
  series: DayPoint[];
  peakDay?: string | null;
  focusOn: boolean;
  onClose: () => void;
  onFocusBranch: () => void;
  onClearFocus: () => void;
  onAskGrok: () => void;
};

export function NodeDetailsDrawer({
  open,
  node,
  parent,
  terms,
  series,
  peakDay = null,
  focusOn,
  onClose,
  onFocusBranch,
  onClearFocus,
  onAskGrok,
}: Props) {
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <aside className={`drawer ${open && node ? "open" : ""}`} aria-hidden={!open || !node}>
      {open && node && (
        <>
          <header className="drawer-head">
            <div>
              <p className="kicker">Selected node</p>
              <h2>{node.edge === "origin" ? "Origin" : mutationTitle(node, parent)}</h2>
            </div>
            <button type="button" className="icon-btn" aria-label="Close details" onClick={onClose}>
              ×
            </button>
          </header>

          <p className="meta-line drawer-meta">
            Generation {node.generation}
            {node.created_at ? ` · First seen ${when(node.created_at)}` : ""}
          </p>

          <div className="drawer-tabs" role="tablist">
            {(["overview", "evidence", "analytics"] as const).map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                className={tab === id ? "on" : ""}
                onClick={() => setTab(id)}
              >
                {cap(id)}
              </button>
            ))}
          </div>

          <div className="drawer-body">
            {tab === "overview" && (
              <Overview node={node} parent={parent} terms={terms} />
            )}
            {tab === "evidence" && <Evidence node={node} parent={parent} terms={terms} />}
            {tab === "analytics" && (
              <NodeAnalytics node={node} parent={parent} series={series} peakDay={peakDay} />
            )}
          </div>

          <footer className="drawer-foot">
            {focusOn ? (
              <button type="button" className="tool-btn on" onClick={onClearFocus}>
                Return to full tree
              </button>
            ) : (
              <button type="button" className="tool-btn" onClick={onFocusBranch}>
                Focus branch
              </button>
            )}
            <button type="button" className="tool-btn" onClick={onAskGrok}>
              Ask Grok
            </button>
            <a className="ghost-link" href={postUrl(node)} target="_blank" rel="noreferrer">
              Open on X ↗
            </a>
          </footer>
        </>
      )}
    </aside>
  );
}

function Overview({
  node,
  parent,
  terms,
}: {
  node: TweetNode;
  parent: TweetNode | null;
  terms: string[];
}) {
  const why = whyDescendant(node, parent);
  const metrics = [
    ["likes", node.like_count],
    ["replies", node.reply_count],
    ["reposts", node.retweet_count],
    ["views", node.views_count],
  ] as const;

  return (
    <div className="drawer-section">
      <p className="why">{why}</p>
      <p className="tweet-body">{highlightMeme(node.body, terms)}</p>
      <div className="overview-links">
        <a className="tweet-link" href={postUrl(node)} target="_blank" rel="noreferrer">
          Open this post on X ↗
        </a>
        {parent && (
          <a className="tweet-link" href={postUrl(parent)} target="_blank" rel="noreferrer">
            Open parent on X ↗
          </a>
        )}
      </div>
      <div className="metric-grid compact">
        {metrics.map(([k, v]) => (
          <div key={k} className="metric">
            <span>{k}</span>
            <strong>{compact(v)}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function Evidence({
  node,
  parent,
  terms,
}: {
  node: TweetNode;
  parent: TweetNode | null;
  terms: string[];
}) {
  const kids = node.children.slice(0, 4);
  return (
    <div className="drawer-section evidence-list">
      {parent && (
        <article>
          <p className="kicker">Ancestor</p>
          <p className="tweet-body">{highlightMeme(parent.body, terms)}</p>
        </article>
      )}
      <article>
        <p className="kicker">This post</p>
        <p className="tweet-body">{highlightMeme(node.body, terms)}</p>
      </article>
      {kids.map((c) => (
        <article key={c.id}>
          <p className="kicker">Descendant · gen {c.generation}</p>
          <p className="tweet-body">{highlightMeme(c.body, terms)}</p>
        </article>
      ))}
      {!parent && kids.length === 0 && (
        <p className="muted small">No additional posts are attached to this step yet.</p>
      )}
    </div>
  );
}

function NodeAnalytics({
  node,
  parent,
  series,
  peakDay,
}: {
  node: TweetNode;
  parent: TweetNode | null;
  series: DayPoint[];
  peakDay: string | null;
}) {
  const sat = saturationForPost(series, node);
  const ann = parent && node.edge !== "origin" ? edgeAnnotation(parent, node) : null;
  return (
    <div className="drawer-section">
      <div className="mutation-explain">
        <p className="kicker tight">What this mutation is</p>
        {ann ? (
          <>
            <p>
              <strong>{ann.label}</strong> — {ann.detail}
            </p>
            <p className="muted small">{ann.kept}</p>
          </>
        ) : (
          <p>
            This is the seed post. Gold dashed children are inferred mutations: later posts that keep the
            meme but change the subject or the action, without a reply or quote link.
          </p>
        )}
      </div>
      {sat && (
        <div className={`sat-banner phase-${sat.phase ?? "unknown"}`}>
          <p className="kicker tight sat-banner-k">Saturation · {phaseLabel(sat.phase)}</p>
          {sat.saturation != null && (
            <div className="sat-meter sat-meter-inline">
              <div className="sat-meter-fill" style={{ width: `${Math.round(sat.saturation * 100)}%` }} />
            </div>
          )}
          <p>{saturationCopy(sat, peakDay)}</p>
        </div>
      )}
      <div className="metric-grid compact">
        {(
          [
            ["likes", node.like_count],
            ["replies", node.reply_count],
            ["reposts", node.retweet_count],
            ["quotes", node.quote_count],
            ["views", node.views_count],
            ["saves", node.bookmarks_count],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="metric">
            <span>{k}</span>
            <strong>{compact(v)}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function mutationTitle(node: TweetNode, parent: TweetNode | null): string {
  if (node.edge === "origin") return "Origin tweet";
  if (parent) return edgeAnnotation(parent, node).label;
  return node.edge_label || cap(node.edge);
}

function whyDescendant(node: TweetNode, parent: TweetNode | null): string {
  if (!parent) {
    return "This is the sampled origin for this language tree — later posts mutate from here.";
  }
  const ann = edgeAnnotation(parent, node);
  return ann.detail;
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
