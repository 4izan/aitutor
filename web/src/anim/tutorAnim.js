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
        const spec = tw.props[key];
        tw.target[key] = typeof spec === "function" ? spec(eased) : lerp(spec[0], spec[1], eased);
      }
    }
  }

  function timelineDuration(tweens) {
    return tweens.reduce((m, tw) => Math.max(m, tw.delay + tw.duration), 0);
  }

  function createScene({ width = 640, height = 340, xmin = -5, xmax = 5, ymin = -3, ymax = 3 } = {}) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.style.maxWidth = "100%";
    canvas.style.borderRadius = "8px";
    const ctx = canvas.getContext("2d");
    const T = makeTransform({ width, height, xmin, xmax, ymin, ymax });
    const shapes = [];
    const tweens = [];
    let time = 0;
    let speed = 1;
    let playing = true;
    let lastTs = null;

    function drawAxes(shape) {
      ctx.strokeStyle = shape.color || "#475569";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(T.toX(xmin), T.toY(0));
      ctx.lineTo(T.toX(xmax), T.toY(0));
      ctx.moveTo(T.toX(0), T.toY(ymin));
      ctx.lineTo(T.toX(0), T.toY(ymax));
      ctx.stroke();
      // integer tick marks
      ctx.fillStyle = "#64748b";
      ctx.font = "10px system-ui";
      for (let x = Math.ceil(xmin); x <= Math.floor(xmax); x++) {
        if (x !== 0) ctx.fillText(String(x), T.toX(x) - 4, T.toY(0) + 14);
      }
      for (let y = Math.ceil(ymin); y <= Math.floor(ymax); y++) {
        if (y !== 0) ctx.fillText(String(y), T.toX(0) + 6, T.toY(y) + 3);
      }
    }

    function drawGrid(shape) {
      ctx.strokeStyle = "rgba(100,116,139,0.15)";
      ctx.lineWidth = 1;
      const step = shape.step || 1;
      ctx.beginPath();
      for (let x = Math.ceil(xmin / step) * step; x <= xmax; x += step) {
        ctx.moveTo(T.toX(x), 0);
        ctx.lineTo(T.toX(x), height);
      }
      for (let y = Math.ceil(ymin / step) * step; y <= ymax; y += step) {
        ctx.moveTo(0, T.toY(y));
        ctx.lineTo(width, T.toY(y));
      }
      ctx.stroke();
    }

    function drawArrowHead(x1, y1, x2, y2, color) {
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const size = 9;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - size * Math.cos(angle - 0.4), y2 - size * Math.sin(angle - 0.4));
      ctx.lineTo(x2 - size * Math.cos(angle + 0.4), y2 - size * Math.sin(angle + 0.4));
      ctx.closePath();
      ctx.fill();
    }

    function drawShape(s) {
      if (s.hidden) return;
      ctx.globalAlpha = s.opacity == null ? 1 : Math.max(0, Math.min(1, s.opacity));
      switch (s.kind) {
        case "axes": drawAxes(s); break;
        case "grid": drawGrid(s); break;
        case "circle": {
          ctx.beginPath();
          ctx.arc(T.toX(s.x), T.toY(s.y), Math.abs(T.scaleX(s.r)), 0, Math.PI * 2);
          if (s.fill !== false) { ctx.fillStyle = s.color; ctx.fill(); }
          else { ctx.strokeStyle = s.color; ctx.lineWidth = 2; ctx.stroke(); }
          break;
        }
        case "rect": {
          ctx.fillStyle = s.color;
          ctx.fillRect(T.toX(s.x), T.toY(s.y + s.h), T.scaleX(s.w), T.scaleY(s.h));
          break;
        }
        case "line": {
          ctx.strokeStyle = s.color;
          ctx.lineWidth = s.width;
          ctx.beginPath();
          ctx.moveTo(T.toX(s.x1), T.toY(s.y1));
          ctx.lineTo(T.toX(s.x2), T.toY(s.y2));
          ctx.stroke();
          break;
        }
        case "arrow": {
          ctx.strokeStyle = s.color;
          ctx.lineWidth = s.width;
          ctx.beginPath();
          ctx.moveTo(T.toX(s.x1), T.toY(s.y1));
          ctx.lineTo(T.toX(s.x2), T.toY(s.y2));
          ctx.stroke();
          drawArrowHead(T.toX(s.x1), T.toY(s.y1), T.toX(s.x2), T.toY(s.y2), s.color);
          break;
        }
        case "curve": {
          ctx.strokeStyle = s.color;
          ctx.lineWidth = s.width;
          ctx.beginPath();
          const n = 200;
          const upto = xmin + (xmax - xmin) * Math.max(0, Math.min(1, s.progress));
          let started = false;
          for (let i = 0; i <= n; i++) {
            const x = xmin + ((upto - xmin) * i) / n;
            const y = s.fn(x);
            if (!Number.isFinite(y)) { started = false; continue; }
            if (!started) { ctx.moveTo(T.toX(x), T.toY(y)); started = true; }
            else ctx.lineTo(T.toX(x), T.toY(y));
          }
          ctx.stroke();
          break;
        }
        case "label": {
          ctx.fillStyle = s.color;
          ctx.font = `${s.size}px system-ui`;
          ctx.fillText(s.text, T.toX(s.x), T.toY(s.y));
          break;
        }
      }
      ctx.globalAlpha = 1;
    }

    function render() {
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(0, 0, width, height);
      applyTweens(tweens, time);
      for (const s of shapes) drawShape(s);
    }

    function tick(ts) {
      if (lastTs != null && playing) {
        time += ((ts - lastTs) / 1000) * speed;
        const total = timelineDuration(tweens);
        if (total > 0 && time >= total) {
          time = total;
          playing = false;
          playBtn.textContent = "▶";
        }
      }
      lastTs = ts;
      render();
      requestAnimationFrame(tick);
    }

    // --- controls ---
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:inline-block;font-family:system-ui";
    const bar = document.createElement("div");
    bar.style.cssText = "display:flex;gap:6px;align-items:center;margin-top:6px";
    const btnStyle = "background:#1e293b;color:#e2e8f0;border:1px solid #334155;border-radius:6px;padding:2px 10px;cursor:pointer";
    const playBtn = document.createElement("button");
    playBtn.textContent = "⏸";
    playBtn.style.cssText = btnStyle;
    playBtn.onclick = () => {
      const total = timelineDuration(tweens);
      if (!playing && total > 0 && time >= total) time = 0; // replay from end
      playing = !playing;
      playBtn.textContent = playing ? "⏸" : "▶";
    };
    const replayBtn = document.createElement("button");
    replayBtn.textContent = "↺";
    replayBtn.style.cssText = btnStyle;
    replayBtn.onclick = () => {
      time = 0;
      playing = true;
      playBtn.textContent = "⏸";
    };
    const speedSel = document.createElement("select");
    speedSel.style.cssText = btnStyle;
    for (const s of [0.5, 1, 2]) {
      const o = document.createElement("option");
      o.value = s;
      o.textContent = `${s}×`;
      if (s === 1) o.selected = true;
      speedSel.appendChild(o);
    }
    speedSel.onchange = () => { speed = Number(speedSel.value); };
    bar.append(playBtn, replayBtn, speedSel);
    wrap.append(canvas, bar);
    (document.getElementById("stage") || document.body).appendChild(wrap);

    requestAnimationFrame(tick);
    // First-frame fallback: rAF doesn't fire in hidden tabs, but the initial
    // state should still be painted once shapes are registered.
    setTimeout(render, 0);

    const scene = {
      canvas,
      add(shape) { shapes.push(shape); return shape; },
      axes(p = {}) { return scene.add({ kind: "axes", ...p }); },
      grid(p = {}) { return scene.add({ kind: "grid", step: 1, ...p }); },
      circle(p) { return scene.add({ kind: "circle", x: 0, y: 0, r: 0.25, color: "#38bdf8", ...p }); },
      rect(p) { return scene.add({ kind: "rect", x: 0, y: 0, w: 1, h: 1, color: "#38bdf8", ...p }); },
      line(p) { return scene.add({ kind: "line", color: "#94a3b8", width: 2, ...p }); },
      arrow(p) { return scene.add({ kind: "arrow", color: "#f59e0b", width: 2.5, ...p }); },
      curve(fn, p = {}) { return scene.add({ kind: "curve", fn, color: "#38bdf8", width: 2.5, progress: 1, ...p }); },
      label(text, p) { return scene.add({ kind: "label", text, color: "#e2e8f0", size: 15, ...p }); },
      tween(target, props, duration, { delay = 0, easing = "easeInOut" } = {}) {
        tweens.push({ target, props, duration, delay, easing: easings[easing] || easings.easeInOut });
        return scene;
      },
    };
    return scene;
  }

  globalThis.TutorAnim = { easings, lerp, makeTransform, applyTweens, timelineDuration, createScene };
  globalThis.createScene = createScene;
})();
