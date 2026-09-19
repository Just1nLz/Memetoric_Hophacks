import { compact, when } from "../format";
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
          Each node is a tweet. Repeat firehose snapshots turn likes, views, and quotes into a trajectory.
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

  return (
    <aside className="inspector">
      <p className="kicker">Observation · gen {node.generation}</p>
      <h2>{node.edge === "origin" ? "Origin tweet" : `${cap(node.edge)} of the line`}</h2>
      <p className="tweet-body">{node.body}</p>
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
      <p className="kicker tight">Engagement trajectory</p>
      <Spark snapshots={node.snapshots} />
      <p className="muted tiny">
        Key is <code>(id, version)</code>. The firehose re-observes the same tweet; the curve is not a new post.{" "}
        <a href={`https://x.com/i/web/status/${node.id}`} target="_blank" rel="noreferrer">
          Open on X
        </a>
      </p>
    </aside>
  );
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
