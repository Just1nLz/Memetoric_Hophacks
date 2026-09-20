import type { TweetNode } from "../types";

type Props = {
  x: number;
  y: number;
  node: TweetNode;
  onClose: () => void;
  onFocus: () => void;
  onAsk: () => void;
  onOpen: () => void;
};

export function NodeContextMenu({ x, y, node, onClose, onFocus, onAsk, onOpen }: Props) {
  return (
    <div className="ctx-scrim" onMouseDown={onClose}>
      <div
        className="ctx-menu"
        style={{ left: x, top: y }}
        onMouseDown={(e) => e.stopPropagation()}
        role="menu"
      >
        <p className="kicker">gen {node.generation}</p>
        <button type="button" role="menuitem" onClick={onFocus}>
          Focus branch
        </button>
        <button type="button" role="menuitem" onClick={onAsk}>
          Ask Grok
        </button>
        <button type="button" role="menuitem" onClick={onOpen}>
          Open on X
        </button>
      </div>
    </div>
  );
}
