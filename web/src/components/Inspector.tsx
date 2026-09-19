import { compact, when } from "../format";
import { influence, postUrl } from "../layout";
import type { TweetNode } from "../types";
import { Spark } from "./Charts";

type Props = {
  node: TweetNode | null;
};

export function Inspector({ node }: Props) {
  if (!node) {
    return (
      <aside className="inspector">
        <p className="kicker">Observation</p>
        <h2>Select a node</h2>
        <p className="muted">
          Each node is a tweet. Influence scores how far a post traveled; snapshots show that score over time.
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

  return (
    <aside className="inspector">
      <p className="kicker">Observation · gen {node.generation}</p>
      <h2>{node.edge === "origin" ? "Origin tweet" : `${cap(node.edge)} of the line`}</h2>
      <p className="tweet-body">{node.body}</p>
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
    </aside>
  );
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
