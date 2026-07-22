import AnimationFrame from "./AnimationFrame.jsx";

export default function PinnedViewport({ animationCode, pending }) {
  if (pending) {
    return <div className="pinned-viewport">Building animation…</div>;
  }
  if (animationCode) {
    return (
      <div className="pinned-viewport ready">
        <AnimationFrame code={animationCode} />
      </div>
    );
  }
  return <div className="pinned-viewport">Ask a question to see it animated here.</div>;
}
