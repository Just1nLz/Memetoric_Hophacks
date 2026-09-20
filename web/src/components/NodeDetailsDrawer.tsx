import { useEffect, useState } from "react";
import { compact, when } from "../format";
import { highlightMeme } from "../highlight";
import { bandLabel, reportFor } from "../influence";
import { IndexMeter } from "./InfluenceMeter";
import { edgeAnnotation, postUrl } from "../layout";
import { satInfluenceLine, saturationForPost } from "../saturation";
import type { DayPoint, TweetNode } from "../types";
import { SaturationGauge } from "./SaturationGauge";

type Tab = "overview" | "evidence" | "scores" | "detail";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "evidence", label: "Evidence" },
  { id: "scores", label: "Scores" },
  { id: "detail", label: "Detail" },
];

type Props = {
  open: boolean;
  node: TweetNode | null;
  parent: TweetNode | null;
  terms: string[];
  family: TweetNode[];
  series: DayPoint[];
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
  family,
  series,
  focusOn,
  onClose,
  onFocusBranch,
  onClearFocus,
  onAskGrok,
}: Props) {
  const [tab, setTab] = useState<Tab>("overview");

  useEffect(() => {
    setTab("overview");
  }, [node?.id]);

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
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                className={tab === item.id ? "on" : ""}
                onClick={() => setTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="drawer-body">
            {tab === "overview" && (
              <Overview node={node} parent={parent} terms={terms} />
            )}
            {tab === "evidence" && <Evidence node={node} parent={parent} terms={terms} />}
            {tab === "scores" && (
              <NodeScores node={node} family={family} series={series} />
            )}
            {tab === "detail" && (
              <NodeDetail node={node} parent={parent} family={family} series={series} />
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

function NodeScores({
  node,
  family,
  series,
}: {
  node: TweetNode;
  family: TweetNode[];
  series: DayPoint[];
}) {
  const report = reportFor(node, family.length ? family : [node]);
  const sat = saturationForPost(series, node);
  return (
    <div className="drawer-section influence-panel">
      {sat && (
        <SaturationGauge point={sat} title="Saturation · when this post landed" showCopy={false} />
      )}
      <div className="influence-hero">
        <p className="kicker tight">Influence index</p>
        <p className="idx-value">
          <strong>{report.index}</strong>
          <span>
            {bandLabel(report.band)} · rank {report.rank} of {report.of}
          </span>
        </p>
        <IndexMeter report={report} />
      </div>
      <p className="muted small">
        Saturation is whether the meme was still funny that day. Influence is how hard this post hit. Open Detail
        for drivers and how the two scores are built.
      </p>
    </div>
  );
}

function NodeDetail({
  node,
  parent,
  family,
  series,
}: {
  node: TweetNode;
  parent: TweetNode | null;
  family: TweetNode[];
  series: DayPoint[];
}) {
  const report = reportFor(node, family.length ? family : [node]);
  const ann = parent && node.edge !== "origin" ? edgeAnnotation(parent, node) : null;
  const sat = saturationForPost(series, node);
  const relate = sat ? satInfluenceLine(sat.phase, report.index) : null;
  return (
    <div className="drawer-section influence-panel">
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
      {relate && <p className="why">{relate}</p>}
      <p className="why">{report.lead}</p>
      <div className="driver-list">
        <p className="kicker tight">What is carrying the score</p>
        {report.drivers.length === 0 ? (
          <p className="muted small">No engagement landed on this post in the sample.</p>
        ) : (
          report.drivers.map((d) => (
            <div key={d.key} className="driver-row">
              <span>{d.label}</span>
              <i>
                <b style={{ width: `${Math.max(3, Math.round(d.share * 100))}%` }} />
              </i>
              <em>{Math.round(d.share * 100)}%</em>
            </div>
          ))
        )}
      </div>
      <p className="muted small">
        Influence shares are of the weighted score, not raw counts. Quotes 4× · reposts 2.8× · replies 2.2× ·
        saves 1.6× · likes 1× · views as ln(1+V). 100 is the hardest-hitting post in this family. Saturation is
        monthly phrase volume, 0–100, independent of this post’s punch.
      </p>
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
