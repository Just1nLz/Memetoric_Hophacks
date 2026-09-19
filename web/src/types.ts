export type Snapshot = {
  version: string;
  like_count: number;
  reply_count: number;
  retweet_count: number;
  quote_count: number;
  views_count: number;
  bookmarks_count: number;
};

export type EdgeKind = "origin" | "reply" | "quote" | "mutation";

export type TweetNode = {
  id: string;
  author_id: string;
  body: string;
  created_at: string;
  like_count: number;
  reply_count: number;
  retweet_count: number;
  quote_count: number;
  views_count: number;
  bookmarks_count: number;
  lang: string;
  reply_to_status_id: string | null;
  quoting_id: string | null;
  conversation_id: string | null;
  version: string;
  parent_id: string | null;
  edge: EdgeKind;
  generation: number;
  /** Source post URL for mutation reliability */
  url?: string;
  /** Short lineage label on the edge into this node */
  edge_label?: string;
  /** Hover detail: shared terms / why this branch split */
  edge_detail?: string;
  snapshots: Snapshot[];
  children: TweetNode[];
};

export type Meme = {
  slug: string;
  name: string;
  query: string;
  blurb: string;
  first_seen: string | null;
  stats: {
    nodes: number;
    roots: number;
    replies: number;
    quotes: number;
    mutations: number;
    max_generation: number;
    likes: number;
    views: number;
    languages: string[];
  };
  series: { t: string; tweets: number; likes: number; views: number; quotes: number }[];
  forest: TweetNode[];
};

export type Catalog = {
  source: string;
  window: { start: string; end: string };
  corpus_rows: number;
  distinct_tweets: number;
  slice_note?: string;
  memes: Meme[];
};

export type LaidOut = {
  x: number;
  y: number;
  node: TweetNode;
};
