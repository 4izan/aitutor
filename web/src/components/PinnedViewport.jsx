import { useRef } from "react";
import AnimationFrame from "./AnimationFrame.jsx";

export default function PinnedViewport({ animationHtml, pending, concept, onRedraw }) {
  const frameRef = useRef(null);

  if (pending) {
    return <div className="pinned-viewport">Building animation…</div>;
  }
  if (animationHtml) {
    return (
      <div className="pinned-viewport ready">
        <div className="pinned-viewport-head">
          <span className="pinned-viewport-title">{concept}</span>
          <div className="pinned-viewport-controls">
            <button type="button" onClick={() => frameRef.current?.resetView()}>reset view ⟲</button>
            <button type="button" onClick={onRedraw}>redraw ↻</button>
          </div>
        </div>
        <AnimationFrame ref={frameRef} html={animationHtml} key={animationHtml} />
      </div>
    );
  }
  return <div className="pinned-viewport">Ask a question to see it animated here.</div>;
}
