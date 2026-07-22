// TutorAnim — tween/math core shared by the 3D runtime.
// Plain script (no import/export): inlined into the sandboxed iframe verbatim.
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
        const spec = tw.props[key];
        tw.target[key] = typeof spec === "function" ? spec(eased) : lerp(spec[0], spec[1], eased);
      }
    }
  }

  function timelineDuration(tweens) {
    return tweens.reduce((m, tw) => Math.max(m, tw.delay + tw.duration), 0);
  }

  function isClick(downXY, upXY, thresholdPx = 5) {
    const dx = upXY.x - downXY.x;
    const dy = upXY.y - downXY.y;
    return Math.sqrt(dx * dx + dy * dy) <= thresholdPx;
  }

  globalThis.TutorAnim = { easings, lerp, makeTransform, applyTweens, timelineDuration, isClick };
})();
