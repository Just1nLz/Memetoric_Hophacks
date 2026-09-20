import type { LineagePath } from "../paths";

type Props = {
  enabled: boolean;
  path: LineagePath | null;
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onToggle: () => void;
};

export function PathRail({ enabled, path, index, total, onPrev, onNext, onToggle }: Props) {
  if (!enabled) {
    return (
      <div className="path-rail idle">
        <p className="path-rail-copy">
          <span className="kicker">Reading</span>
          Full family — every branch at once.
        </p>
        <button type="button" className="tool-btn on" onClick={onToggle}>
          Read one path
        </button>
      </div>
    );
  }

  return (
    <div className="path-rail">
      <div className="path-rail-copy">
        <span className="kicker">
          Path {total ? index + 1 : 0} / {total}
        </span>
        <strong>{path?.label ?? "Descent"}</strong>
        <span className="muted tiny">{path?.detail ?? "One origin → later take."}</span>
      </div>
      <div className="path-rail-actions">
        <button type="button" className="tool-btn icon" aria-label="Previous path" onClick={onPrev} disabled={total < 2}>
          ‹
        </button>
        <button type="button" className="tool-btn icon" aria-label="Next path" onClick={onNext} disabled={total < 2}>
          ›
        </button>
        <button type="button" className="tool-btn" onClick={onToggle}>
          Full family
        </button>
      </div>
    </div>
  );
}
