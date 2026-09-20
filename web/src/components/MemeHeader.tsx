import { dayLabel } from "../format";
import type { DayPoint } from "../types";

type Props = {
  name: string;
  blurb: string;
  nodes: number;
  generations: number;
  language: string;
  firstSeen: string | null;
  series: DayPoint[];
  onOpenNav?: () => void;
  onOpenAnalytics: () => void;
};

export function MemeHeader({
  name,
  blurb,
  nodes,
  generations,
  language,
  firstSeen,
  series,
  onOpenNav,
  onOpenAnalytics,
}: Props) {
  return (
    <header className="meme-header">
      {onOpenNav && (
        <button type="button" className="icon-btn nav-toggle" aria-label="Open memes" onClick={onOpenNav}>
          ☰
        </button>
      )}
      <div className="meme-header-copy">
        <h1>{name}</h1>
        <p className="blurb">{blurb}</p>
        <p className="meta-line">
          {nodes} nodes · {generations} generations · {language}
          {firstSeen ? ` · First seen ${dayLabel(firstSeen)}` : ""}
          <Sparkline series={series} onClick={onOpenAnalytics} />
        </p>
      </div>
    </header>
  );
}

function Sparkline({ series, onClick }: { series: DayPoint[]; onClick: () => void }) {
  const live = series.filter((s) => s.coverage !== false);
  const max = Math.max(1, ...live.map((s) => s.tweets));
  const w = 72;
  const h = 20;
  const pts = live
    .map((s, i) => {
      const x = live.length < 2 ? w / 2 : (i / (live.length - 1)) * w;
      const y = h - (s.tweets / max) * (h - 3) - 1.5;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <button type="button" className="sparkline" onClick={onClick} title="Open analytics">
      <svg width={w} height={h} aria-hidden>
        <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    </button>
  );
}
