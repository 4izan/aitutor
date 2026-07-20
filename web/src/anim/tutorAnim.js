// TutorAnim — tiny canvas animation runtime for AI-generated tutor animations.
// Plain script (no import/export): the same file is inlined into the sandboxed
// iframe verbatim, so everything attaches to globalThis.
(() => {
  const easings = {
    linear: (t) => t,
    easeIn: (t) => t * t,
    easeOut: (t) => t * (2 - t),
    easeInOut: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  };

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function makeTransform({ width, height, xmin, xmax, ymin, ymax }) {
    const sx = width / (xmax - xmin);
    const sy = height / (ymax - ymin);
    return {
      toX: (x) => (x - xmin) * sx,
      toY: (y) => height - (y - ymin) * sy,
      scaleX: (len) => len * sx,
      scaleY: (len) => len * sy,
    };
  }

  function applyTweens(tweens, time) {
    for (const tw of tweens) {
      const raw = (time - tw.delay) / tw.duration;
      const t = Math.max(0, Math.min(1, raw));
      const eased = tw.easing(t);
      for (const key in tw.props) {
        const [from, to] = tw.props[key];
        tw.target[key] = lerp(from, to, eased);
      }
    }
  }

  function timelineDuration(tweens) {
    return tweens.reduce((m, tw) => Math.max(m, tw.delay + tw.duration), 0);
  }

  globalThis.TutorAnim = { easings, lerp, makeTransform, applyTweens, timelineDuration };
})();
