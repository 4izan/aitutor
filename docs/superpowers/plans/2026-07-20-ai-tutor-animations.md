# AI Tutor with Live Animations — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local ChatGPT-style AI tutor (math & physics) that streams explanations and renders a Claude-generated Canvas animation beneath each answer.

**Architecture:** Single npm package. A small Express server exposes `/api/chat` (SSE streaming) and `/api/fix`, both powered by `@anthropic-ai/claude-agent-sdk` `query()` which authenticates through the user's local Claude Code login — no API key. A React + Vite frontend renders the chat; each assistant response may contain a fenced ```` ```animation ```` block, which is stripped from the visible text and executed inside a sandboxed iframe preloaded with our `TutorAnim` helper library.

**Tech Stack:** Node 20+ (ESM), Express, `@anthropic-ai/claude-agent-sdk`, React 18, Vite, Vitest, `marked`, `concurrently`. No database; no TypeScript (plain JS/JSX for prototype speed).

## Global Constraints

- No API key anywhere: the Agent SDK spawns the Claude Code binary and uses the existing subscription login. Never add `ANTHROPIC_API_KEY` handling.
- Generated animation code runs ONLY inside `<iframe sandbox="allow-scripts">` with a CSP of `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'`. Never `eval` it in the page.
- Exactly one automatic fix retry per animation; after that show the text with an "Animation failed" note. The chat must never break.
- Conversation state lives only in browser memory (React state). No persistence.
- Frontend dev server: Vite on port 5173, proxying `/api` → `http://localhost:3001`. Backend: Express on port 3001.
- The whole project is one `package.json` at the repo root (`"type": "module"`).
- Platform is Windows; all commands below run in PowerShell (they are cross-platform as written).

---

### Task 1: Project scaffolding

**Files:**
- Create: `package.json`
- Create: `vite.config.js`
- Create: `index.html`
- Create: `web/src/main.jsx`
- Create: `web/src/App.jsx`
- Create: `web/src/App.css`
- Create: `server/index.js`
- Create: `.gitignore`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: `GET /api/health` → `{ ok: true }`; a running Vite app that renders `<App />`; npm scripts `dev`, `dev:web`, `dev:server`, `test`.

- [ ] **Step 1: Create package.json**

```json
{
  "name": "ai-tutor",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "concurrently -n server,web \"npm run dev:server\" \"npm run dev:web\"",
    "dev:server": "node server/index.js",
    "dev:web": "vite",
    "test": "vitest run"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run:
```
npm install express @anthropic-ai/claude-agent-sdk react react-dom marked
npm install -D vite @vitejs/plugin-react vitest concurrently
```
Expected: both commands exit 0; `package.json` gains `dependencies` and `devDependencies`.

- [ ] **Step 3: Create .gitignore**

```
node_modules/
dist/
```

- [ ] **Step 4: Create vite.config.js**

```js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
});
```

- [ ] **Step 5: Create index.html**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AI Tutor</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/web/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Create web/src/main.jsx**

```jsx
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./App.css";

createRoot(document.getElementById("root")).render(<App />);
```

- [ ] **Step 7: Create placeholder web/src/App.jsx**

```jsx
export default function App() {
  return <h1>AI Tutor</h1>;
}
```

- [ ] **Step 8: Create web/src/App.css** (minimal for now; Task 7 expands it)

```css
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  background: #0b1120;
  color: #e2e8f0;
}
```

- [ ] **Step 9: Create server/index.js with health endpoint only**

```js
import express from "express";

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`AI Tutor server listening on http://localhost:${PORT}`);
});
```

- [ ] **Step 10: Verify**

Run: `npm run dev` in the background, then `curl http://localhost:5173/api/health` (or `Invoke-RestMethod http://localhost:5173/api/health`).
Expected: `{"ok":true}` (proves the Vite proxy → Express path works). Loading `http://localhost:5173` shows "AI Tutor". Stop the dev servers.

- [ ] **Step 11: Commit**

```
git add -A
git commit -m "feat: scaffold Vite/React frontend and Express server"
```

---

### Task 2: TutorAnim core math (pure, TDD)

The helper library is one plain-script file (no `import`/`export` statements) so the same file can be inlined into the sandboxed iframe verbatim. It attaches everything to `globalThis`. Vitest loads it via a side-effect import and reads `globalThis.TutorAnim`.

**Files:**
- Create: `web/src/anim/tutorAnim.js`
- Test: `web/src/anim/tutorAnim.test.js`

**Interfaces:**
- Consumes: nothing
- Produces (on `globalThis.TutorAnim`):
  - `lerp(a: number, b: number, t: number): number`
  - `easings: { linear, easeIn, easeOut, easeInOut }` — each `(t: number) => number`
  - `makeTransform({width, height, xmin, xmax, ymin, ymax})` → `{ toX(x), toY(y), scaleX(len), scaleY(len) }` (world → pixel; y axis flipped)
  - `applyTweens(tweens, time)` — mutates each tween's `target`; tween shape: `{ target, props: {key: [from, to]}, delay, duration, easing: fn }`
  - `timelineDuration(tweens): number`

- [ ] **Step 1: Write the failing tests**

`web/src/anim/tutorAnim.test.js`:

```js
import { describe, it, expect, beforeAll } from "vitest";
import "./tutorAnim.js";

const A = globalThis.TutorAnim;

describe("lerp and easings", () => {
  it("lerps linearly", () => {
    expect(A.lerp(0, 10, 0.5)).toBe(5);
    expect(A.lerp(2, 4, 0)).toBe(2);
    expect(A.lerp(2, 4, 1)).toBe(4);
  });
  it("easings map 0->0 and 1->1", () => {
    for (const name of ["linear", "easeIn", "easeOut", "easeInOut"]) {
      expect(A.easings[name](0)).toBeCloseTo(0);
      expect(A.easings[name](1)).toBeCloseTo(1);
    }
  });
});

describe("makeTransform", () => {
  const T = A.makeTransform({ width: 200, height: 100, xmin: -1, xmax: 1, ymin: 0, ymax: 2 });
  it("maps world x to pixels", () => {
    expect(T.toX(-1)).toBe(0);
    expect(T.toX(1)).toBe(200);
    expect(T.toX(0)).toBe(100);
  });
  it("maps world y to pixels with flipped axis", () => {
    expect(T.toY(0)).toBe(100);
    expect(T.toY(2)).toBe(0);
  });
  it("scales lengths", () => {
    expect(T.scaleX(1)).toBe(100);
    expect(T.scaleY(1)).toBe(50);
  });
});

describe("tweens", () => {
  it("interpolates target props over time with delay", () => {
    const ball = { x: 0, y: 5 };
    const tweens = [
      { target: ball, props: { x: [0, 10] }, delay: 0, duration: 2, easing: A.easings.linear },
      { target: ball, props: { y: [5, 0] }, delay: 1, duration: 1, easing: A.easings.linear },
    ];
    A.applyTweens(tweens, 1);
    expect(ball.x).toBeCloseTo(5);
    expect(ball.y).toBeCloseTo(5); // second tween just starting
    A.applyTweens(tweens, 2);
    expect(ball.x).toBeCloseTo(10);
    expect(ball.y).toBeCloseTo(0);
  });
  it("clamps before delay and after end", () => {
    const p = { v: -1 };
    const tweens = [{ target: p, props: { v: [0, 1] }, delay: 1, duration: 1, easing: A.easings.linear }];
    A.applyTweens(tweens, 0);
    expect(p.v).toBe(0);
    A.applyTweens(tweens, 99);
    expect(p.v).toBe(1);
  });
  it("computes timeline duration", () => {
    expect(A.timelineDuration([
      { delay: 0, duration: 2 },
      { delay: 1.5, duration: 1 },
    ])).toBe(2.5);
    expect(A.timelineDuration([])).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run web/src/anim`
Expected: FAIL — `tutorAnim.js` does not exist / `TutorAnim` undefined.

- [ ] **Step 3: Write the core of web/src/anim/tutorAnim.js**

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run web/src/anim`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```
git add web/src/anim
git commit -m "feat: TutorAnim core math (transforms, easings, tweens)"
```

---

### Task 3: TutorAnim scene, drawing, and playback controls

Extends `tutorAnim.js` with the canvas layer. This is DOM/canvas code, verified visually via a demo page (the pure math stays covered by Task 2's tests).

**Files:**
- Modify: `web/src/anim/tutorAnim.js`
- Create: `demo.html` (repo root, served by Vite at `/demo.html`)

**Interfaces:**
- Consumes: `TutorAnim` internals from Task 2.
- Produces global `createScene(opts?)` (also on `TutorAnim.createScene`). `opts`: `{ width=640, height=340, xmin=-5, xmax=5, ymin=-3, ymax=3 }`. Returned scene object:
  - `scene.axes()` / `scene.grid()` — coordinate scaffolding
  - `scene.circle({x, y, r, color, fill})`, `scene.rect({x, y, w, h, color})` (x,y = lower-left corner), `scene.line({x1, y1, x2, y2, color, width})`, `scene.arrow({x1, y1, x2, y2, color, width})`, `scene.curve(fn, {color, width, progress})` (fn: x→y; `progress` 0..1 draws partially), `scene.label(text, {x, y, color, size})` — every method returns the shape object (a plain mutable object) so it can be tweened
  - `scene.tween(shape, {prop: [from, to]}, durationSeconds, {delay=0, easing="easeInOut"})`
  - Playback: auto-mounts to `#stage` (or `document.body`), auto-plays, and renders play/pause/replay/speed controls under the canvas. No API needed from generated code.

- [ ] **Step 1: Append the scene layer to tutorAnim.js** (inside the same IIFE, before the `globalThis.TutorAnim` assignment; add `createScene` to the exported object and also `globalThis.createScene = createScene`)

```js
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
    let rafId = null;
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
          for (let i = 0; i <= n; i++) {
            const x = xmin + ((upto - xmin) * i) / n;
            const y = s.fn(x);
            if (!Number.isFinite(y)) continue;
            if (i === 0) ctx.moveTo(T.toX(x), T.toY(y));
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
      rafId = requestAnimationFrame(tick);
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

    rafId = requestAnimationFrame(tick);

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
```

And change the export line at the bottom of the IIFE to:

```js
  globalThis.TutorAnim = { easings, lerp, makeTransform, applyTweens, timelineDuration, createScene };
  globalThis.createScene = createScene;
```

- [ ] **Step 2: Run the Task 2 tests to confirm nothing broke**

Run: `npx vitest run web/src/anim`
Expected: PASS. (The file references `document` only inside `createScene`, which the tests never call.)

- [ ] **Step 3: Create demo.html at the repo root**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>TutorAnim demo</title>
    <style>body { margin: 24px; background: #0b1120; }</style>
  </head>
  <body>
    <div id="stage"></div>
    <script type="module">
      import "/web/src/anim/tutorAnim.js";
      const scene = createScene({ xmin: -6.5, xmax: 6.5, ymin: -1.6, ymax: 1.6 });
      scene.grid();
      scene.axes();
      const wave = scene.curve((x) => Math.sin(x), { progress: 0 });
      const dot = scene.circle({ x: -6.5, y: Math.sin(-6.5), r: 0.12, color: "#f59e0b" });
      scene.tween(wave, { progress: [0, 1] }, 4, { easing: "linear" });
      scene.tween(dot, { x: [-6.5, 6.5] }, 4, { easing: "linear" });
      scene.label("y = sin(x)", { x: 3.5, y: 1.3, color: "#38bdf8" });
    </script>
  </body>
</html>
```

- [ ] **Step 4: Verify visually**

Run: `npm run dev:web` and open `http://localhost:5173/demo.html` in the preview browser.
Expected: a sine curve draws itself over 4 seconds while an orange dot rides it; axes with tick numbers; pause/replay/speed controls work.

- [ ] **Step 5: Commit**

```
git add web/src/anim/tutorAnim.js demo.html
git commit -m "feat: TutorAnim scene layer with shapes and playback controls"
```

---

### Task 4: Response parser (TDD)

Splits an assistant response (possibly mid-stream) into visible text and animation code.

**Files:**
- Create: `web/src/lib/parseResponse.js`
- Test: `web/src/lib/parseResponse.test.js`

**Interfaces:**
- Consumes: nothing
- Produces: `parseResponse(text: string)` → `{ visibleText: string, animationCode: string | null, pending: boolean }`. `pending` is true when an opening ```` ```animation ```` fence exists but its closing fence hasn't streamed in yet (visible text excludes the partial block).

- [ ] **Step 1: Write the failing tests**

`web/src/lib/parseResponse.test.js`:

```js
import { describe, it, expect } from "vitest";
import { parseResponse } from "./parseResponse.js";

describe("parseResponse", () => {
  it("passes through plain text", () => {
    const r = parseResponse("Just an explanation.");
    expect(r).toEqual({ visibleText: "Just an explanation.", animationCode: null, pending: false });
  });

  it("extracts a complete animation block", () => {
    const r = parseResponse("Intro text.\n\n```animation\nconst s = createScene();\n```\n\nOutro.");
    expect(r.visibleText).toBe("Intro text.\n\nOutro.");
    expect(r.animationCode).toBe("const s = createScene();");
    expect(r.pending).toBe(false);
  });

  it("hides a partial block while streaming", () => {
    const r = parseResponse("Intro.\n\n```animation\nconst s = crea");
    expect(r.visibleText).toBe("Intro.");
    expect(r.animationCode).toBe(null);
    expect(r.pending).toBe(true);
  });

  it("hides the bare opening fence itself", () => {
    const r = parseResponse("Intro.\n\n```animation");
    expect(r.visibleText).toBe("Intro.");
    expect(r.pending).toBe(true);
  });

  it("ignores other fenced blocks", () => {
    const text = "Look:\n```python\nprint(1)\n```\ndone";
    const r = parseResponse(text);
    expect(r.visibleText).toBe(text);
    expect(r.animationCode).toBe(null);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run web/src/lib`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement web/src/lib/parseResponse.js**

```js
const OPEN = "```animation";

export function parseResponse(text) {
  const start = text.indexOf(OPEN);
  if (start === -1) {
    return { visibleText: text, animationCode: null, pending: false };
  }
  const before = text.slice(0, start).trimEnd();
  const afterOpen = text.indexOf("\n", start);
  if (afterOpen === -1) {
    // fence line itself still streaming
    return { visibleText: before, animationCode: null, pending: true };
  }
  const rest = text.slice(afterOpen + 1);
  const close = rest.indexOf("```");
  if (close === -1) {
    return { visibleText: before, animationCode: null, pending: true };
  }
  const animationCode = rest.slice(0, close).trim();
  const after = rest.slice(close + 3).replace(/^[ \t]*\n?/, "");
  const visibleText = after ? `${before}\n\n${after.trimEnd()}` : before;
  return { visibleText, animationCode, pending: false };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run web/src/lib`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```
git add web/src/lib
git commit -m "feat: response parser splitting text from animation blocks"
```

---

### Task 5: Sandboxed animation frame

**Files:**
- Create: `web/src/lib/buildAnimationSrcdoc.js`
- Test: `web/src/lib/buildAnimationSrcdoc.test.js`
- Create: `web/src/components/AnimationFrame.jsx`

**Interfaces:**
- Consumes: `tutorAnim.js` source text (via Vite `?raw` import).
- Produces:
  - `buildAnimationSrcdoc(libSource: string, userCode: string): string` — full HTML doc: locked-down CSP meta tag, error forwarding via `parent.postMessage({type:"anim-error", message}, "*")`, `<div id="stage">`, inlined lib, then user code in try/catch.
  - `<AnimationFrame code={string} />` — renders `<iframe sandbox="allow-scripts">`. On the first `anim-error` message from its own iframe it calls `POST /api/fix` with `{code, error}` and swaps in the fixed code (once). On second failure shows "⚠ Animation failed to render." while keeping the chat intact.

- [ ] **Step 1: Write the failing tests for the srcdoc builder**

`web/src/lib/buildAnimationSrcdoc.test.js`:

```js
import { describe, it, expect } from "vitest";
import { buildAnimationSrcdoc } from "./buildAnimationSrcdoc.js";

describe("buildAnimationSrcdoc", () => {
  it("inlines library and user code with CSP and error bridge", () => {
    const html = buildAnimationSrcdoc("/*LIB*/", "createScene();");
    expect(html).toContain("Content-Security-Policy");
    expect(html).toContain("default-src 'none'");
    expect(html).toContain("/*LIB*/");
    expect(html).toContain("createScene();");
    expect(html).toContain("anim-error");
    expect(html).toContain('<div id="stage">');
  });

  it("neutralizes </script> inside user code", () => {
    const html = buildAnimationSrcdoc("/*LIB*/", 'const s = "</script>";');
    // the raw closing tag must not appear inside the injected code
    expect(html).not.toContain('const s = "</script>";');
    expect(html).toContain('const s = "<\\/script>";');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run web/src/lib/buildAnimationSrcdoc.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement web/src/lib/buildAnimationSrcdoc.js**

```js
function neutralize(code) {
  return code.replaceAll("</script", "<\\/script");
}

export function buildAnimationSrcdoc(libSource, userCode) {
  return `<!doctype html>
<html>
<head>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'">
<style>
  body { margin: 0; background: #0f172a; display: flex; justify-content: center; padding: 8px 0; }
</style>
</head>
<body>
<div id="stage"></div>
<script>
window.onerror = function (msg, src, line) {
  parent.postMessage({ type: "anim-error", message: String(msg) + " (line " + line + ")" }, "*");
};
</${"script"}>
<script>
${neutralize(libSource)}
</${"script"}>
<script>
try {
${neutralize(userCode)}
} catch (err) {
  parent.postMessage({ type: "anim-error", message: String((err && err.stack) || err) }, "*");
}
</${"script"}>
</body>
</html>`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run web/src/lib/buildAnimationSrcdoc.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Implement web/src/components/AnimationFrame.jsx**

```jsx
import { useEffect, useMemo, useRef, useState } from "react";
import libSource from "../anim/tutorAnim.js?raw";
import { buildAnimationSrcdoc } from "../lib/buildAnimationSrcdoc.js";

export default function AnimationFrame({ code }) {
  const [currentCode, setCurrentCode] = useState(code);
  const [status, setStatus] = useState("ok"); // "ok" | "fixing" | "failed"
  const triedFix = useRef(false);
  const iframeRef = useRef(null);

  useEffect(() => {
    async function onMessage(e) {
      if (e.data?.type !== "anim-error") return;
      if (e.source !== iframeRef.current?.contentWindow) return;
      if (triedFix.current) {
        setStatus("failed");
        return;
      }
      triedFix.current = true;
      setStatus("fixing");
      try {
        const res = await fetch("/api/fix", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: currentCode, error: e.data.message }),
        });
        const data = await res.json();
        if (data.code) {
          setCurrentCode(data.code);
          setStatus("ok");
        } else {
          setStatus("failed");
        }
      } catch {
        setStatus("failed");
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [currentCode]);

  const srcdoc = useMemo(
    () => buildAnimationSrcdoc(libSource, currentCode),
    [currentCode]
  );

  if (status === "failed") {
    return <div className="anim-note">⚠ Animation failed to render.</div>;
  }

  return (
    <div className="anim-wrap">
      {status === "fixing" && <div className="anim-note">Fixing animation…</div>}
      <iframe
        ref={iframeRef}
        sandbox="allow-scripts"
        srcDoc={srcdoc}
        title="animation"
        style={{ width: "100%", height: 420, border: "none", borderRadius: 8 }}
      />
    </div>
  );
}
```

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: PASS (all tests from Tasks 2, 4, 5).

- [ ] **Step 7: Commit**

```
git add web/src
git commit -m "feat: sandboxed animation iframe with error bridge and one-shot fix hook"
```

---

### Task 6: Server chat endpoint (Claude Agent SDK, SSE)

**Files:**
- Create: `server/prompts.js`
- Modify: `server/index.js`

**Interfaces:**
- Consumes: `@anthropic-ai/claude-agent-sdk` `query()` — authenticates via the local Claude Code login automatically.
- Produces:
  - `POST /api/chat` body `{ messages: [{role: "user"|"assistant", content: string}, ...] }` → SSE stream of `data: {"type":"delta","text":"..."}` events, then `data: {"type":"done"}` (or `data: {"type":"error","message":"..."}`).
  - `buildTranscript(messages)` exported from `server/index.js` for testing.
  - `TUTOR_SYSTEM_PROMPT` and `FIX_SYSTEM_PROMPT` exported from `server/prompts.js`.

- [ ] **Step 1: Create server/prompts.js**

```js
export const ANIM_API_DOCS = `
The TutorAnim animation API (already loaded — call these globals directly, do NOT import anything):

createScene({width?, height?, xmin?, xmax?, ymin?, ymax?})
  Creates a canvas (default 640×340, world coords x:[-5,5] y:[-3,3]), mounts it,
  and auto-plays. Returns a scene. Pick xmin/xmax/ymin/ymax to fit your content.

Scene methods (each shape method returns a mutable shape object you can tween):
  scene.axes()                         — x/y axes with tick numbers
  scene.grid()                         — light background grid
  scene.circle({x, y, r, color})       — filled circle (r in world units)
  scene.rect({x, y, w, h, color})      — filled rect, (x,y) = lower-left corner
  scene.line({x1, y1, x2, y2, color, width})
  scene.arrow({x1, y1, x2, y2, color, width})   — line with arrowhead at (x2,y2)
  scene.curve(fn, {color, progress})   — plots y = fn(x); progress 0..1 draws it partially
  scene.label("text", {x, y, color, size})
  scene.tween(shape, {prop: [from, to]}, durationSeconds, {delay?, easing?})
    easing: "linear" | "easeIn" | "easeOut" | "easeInOut" (default "easeInOut")
    Multiple tweens (with delays) form the timeline. Playback controls are automatic.
  All shapes support an "opacity" property (0..1), useful for fade-ins via tween.

Example — a ball falling under gravity:
  const scene = createScene({ xmin: 0, xmax: 10, ymin: 0, ymax: 6 });
  scene.axes();
  const ball = scene.circle({ x: 2, y: 5, r: 0.3, color: "#f59e0b" });
  scene.tween(ball, { y: [5, 0.3] }, 1.5, { easing: "easeIn" });
  scene.label("gravity accelerates the ball", { x: 3.5, y: 5.5 });
`;

export const TUTOR_SYSTEM_PROMPT = `You are a friendly, clear tutor for math and physics.

Rules for every answer:
1. Explain the concept clearly for a learner, using short paragraphs and (where helpful) simple markdown. Keep the explanation under ~250 words.
2. Then output EXACTLY ONE animation illustrating the core idea, as a fenced code block tagged "animation":
\`\`\`animation
// JavaScript using ONLY the TutorAnim API below
\`\`\`
3. The animation code must be under 60 lines, use only the documented API plus plain JavaScript (Math, loops, functions), create exactly one scene, and never use import/export, fetch, DOM APIs, setTimeout, or requestAnimationFrame — the library handles all timing via scene.tween.
4. Animate over 3–6 seconds. Label the key elements. Choose world coordinates that frame the content nicely.
5. If (and only if) the question is not about a concept that can be visualized (e.g. small talk), omit the animation block.
${ANIM_API_DOCS}`;

export const FIX_SYSTEM_PROMPT = `You repair broken TutorAnim animation scripts. The user gives you a script and the runtime error it produced. Respond with ONLY a single fenced code block containing the corrected script — no prose. Follow the same API rules.
${ANIM_API_DOCS}`;
```

- [ ] **Step 2: Add buildTranscript and /api/chat to server/index.js**

```js
import express from "express";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { TUTOR_SYSTEM_PROMPT } from "./prompts.js";

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

export function buildTranscript(messages) {
  return messages
    .map((m) => `${m.role === "user" ? "Student" : "Tutor"}: ${m.content}`)
    .join("\n\n");
}

app.post("/api/chat", async (req, res) => {
  const { messages } = req.body ?? {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages array required" });
  }
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.flushHeaders();
  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
  try {
    const q = query({
      prompt: buildTranscript(messages),
      options: {
        systemPrompt: TUTOR_SYSTEM_PROMPT,
        tools: [],
        maxTurns: 1,
        includePartialMessages: true,
      },
    });
    for await (const message of q) {
      if (
        message.type === "stream_event" &&
        message.event?.type === "content_block_delta" &&
        message.event.delta?.type === "text_delta"
      ) {
        send({ type: "delta", text: message.event.delta.text });
      }
    }
    send({ type: "done" });
  } catch (err) {
    console.error(err);
    send({ type: "error", message: String(err?.message ?? err) });
  } finally {
    res.end();
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`AI Tutor server listening on http://localhost:${PORT}`);
});
```

- [ ] **Step 3: Manual verification (requires the Claude Code login on this machine)**

Run: `npm run dev:server` in the background, then:

```
curl -N -X POST http://localhost:3001/api/chat -H "Content-Type: application/json" -d "{\"messages\":[{\"role\":\"user\",\"content\":\"Explain what a sine wave is\"}]}"
```

Expected: a stream of `data: {"type":"delta",...}` lines forming an explanation followed by a ```` ```animation ```` block, ending with `data: {"type":"done"}`. First response may take 10–30 s (SDK spawns the Claude Code binary). If it errors with an auth message, the machine's Claude Code login needs refreshing — surface that to the user rather than adding an API key.

- [ ] **Step 4: Commit**

```
git add server
git commit -m "feat: /api/chat streaming endpoint via Claude Agent SDK"
```

---

### Task 7: Chat UI

**Files:**
- Modify: `web/src/App.jsx` (replace placeholder)
- Create: `web/src/components/AssistantMessage.jsx`
- Modify: `web/src/App.css`

**Interfaces:**
- Consumes: `POST /api/chat` SSE (Task 6), `parseResponse` (Task 4), `AnimationFrame` (Task 5).
- Produces: the working chat app. `App` keeps `messages` state (`{role, content}` — same shape `/api/chat` consumes) plus a `streaming` flag; `AssistantMessage` takes `{ content, streaming }`.

- [ ] **Step 1: Create web/src/components/AssistantMessage.jsx**

```jsx
import { marked } from "marked";
import { parseResponse } from "../lib/parseResponse.js";
import AnimationFrame from "./AnimationFrame.jsx";

export default function AssistantMessage({ content, streaming }) {
  const { visibleText, animationCode, pending } = parseResponse(content);
  return (
    <div className="msg assistant">
      <div
        className="msg-text"
        dangerouslySetInnerHTML={{ __html: marked.parse(visibleText || "") }}
      />
      {pending && <div className="anim-note">Building animation…</div>}
      {animationCode && !streaming && <AnimationFrame code={animationCode} />}
      {streaming && !visibleText && !pending && <div className="anim-note">Thinking…</div>}
    </div>
  );
}
```

(The animation mounts only once streaming finishes, so the iframe isn't rebuilt on every delta.)

- [ ] **Step 2: Replace web/src/App.jsx**

```jsx
import { useRef, useState } from "react";
import AssistantMessage from "./components/AssistantMessage.jsx";

export default function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef(null);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setBusy(true);
    const history = [...messages, { role: "user", content: text }];
    setMessages([...history, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantText = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop(); // keep incomplete tail
        for (const ev of events) {
          const line = ev.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const data = JSON.parse(line.slice(6));
          if (data.type === "delta") {
            assistantText += data.text;
            setMessages([...history, { role: "assistant", content: assistantText }]);
          } else if (data.type === "error") {
            assistantText += `\n\n> ⚠ ${data.message}`;
            setMessages([...history, { role: "assistant", content: assistantText }]);
          }
        }
        listRef.current?.scrollTo(0, listRef.current.scrollHeight);
      }
    } catch (err) {
      setMessages([...history, { role: "assistant", content: `> ⚠ Request failed: ${err.message}` }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <header className="topbar">AI Tutor <span className="sub">math &amp; physics, animated</span></header>
      <main className="chat" ref={listRef}>
        {messages.length === 0 && (
          <div className="empty">
            Ask me anything — try <em>“Why does a pendulum swing?”</em>
          </div>
        )}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="msg user">{m.content}</div>
          ) : (
            <AssistantMessage
              key={i}
              content={m.content}
              streaming={busy && i === messages.length - 1}
            />
          )
        )}
      </main>
      <footer className="composer">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Ask a math or physics question…"
          rows={1}
        />
        <button onClick={send} disabled={busy || !input.trim()}>
          {busy ? "…" : "Send"}
        </button>
      </footer>
    </div>
  );
}
```

- [ ] **Step 3: Replace web/src/App.css**

```css
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  background: #0b1120;
  color: #e2e8f0;
}
.app { display: flex; flex-direction: column; height: 100vh; }
.topbar {
  padding: 14px 20px;
  font-weight: 600;
  border-bottom: 1px solid #1e293b;
}
.topbar .sub { font-weight: 400; color: #64748b; font-size: 0.85em; margin-left: 8px; }
.chat {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 860px;
  width: 100%;
  margin: 0 auto;
}
.empty { color: #64748b; text-align: center; margin-top: 15vh; }
.msg { border-radius: 12px; padding: 10px 16px; line-height: 1.55; }
.msg.user { background: #1d4ed8; align-self: flex-end; max-width: 75%; white-space: pre-wrap; }
.msg.assistant { background: #16213b; align-self: stretch; }
.msg-text p:first-child { margin-top: 4px; }
.msg-text code { background: #0f172a; padding: 1px 5px; border-radius: 4px; }
.anim-note { color: #94a3b8; font-size: 0.9em; padding: 6px 0; }
.anim-wrap { margin-top: 8px; }
.composer {
  display: flex;
  gap: 10px;
  padding: 14px 20px 20px;
  max-width: 860px;
  width: 100%;
  margin: 0 auto;
}
.composer textarea {
  flex: 1;
  resize: none;
  background: #16213b;
  color: #e2e8f0;
  border: 1px solid #334155;
  border-radius: 10px;
  padding: 12px 14px;
  font: inherit;
}
.composer button {
  background: #1d4ed8;
  color: white;
  border: none;
  border-radius: 10px;
  padding: 0 22px;
  font: inherit;
  cursor: pointer;
}
.composer button:disabled { opacity: 0.5; cursor: default; }
```

- [ ] **Step 4: Verify end-to-end**

Run: `npm run dev` in the background; open `http://localhost:5173` in the preview browser. Ask "Explain what a sine wave is".
Expected: the explanation streams in like ChatGPT; while the animation block streams, a "Building animation…" note shows; when the response finishes, the animation renders and plays beneath the text with controls.

- [ ] **Step 5: Commit**

```
git add web/src index.html
git commit -m "feat: streaming chat UI with inline animations"
```

---

### Task 8: Fix-retry endpoint

**Files:**
- Modify: `server/index.js`

**Interfaces:**
- Consumes: `FIX_SYSTEM_PROMPT` (Task 6); called by `AnimationFrame` (Task 5, already wired).
- Produces: `POST /api/fix` body `{ code: string, error: string }` → `{ code: string | null }` (null when no code block could be extracted).

- [ ] **Step 1: Add /api/fix to server/index.js**

Add `FIX_SYSTEM_PROMPT` to the existing import from `./prompts.js`, then:

```js
function extractCodeBlock(text) {
  const m = text.match(/```(?:animation|javascript|js)?\s*\n([\s\S]*?)```/);
  return m ? m[1].trim() : null;
}

app.post("/api/fix", async (req, res) => {
  const { code, error } = req.body ?? {};
  if (!code || !error) {
    return res.status(400).json({ error: "code and error required" });
  }
  try {
    const q = query({
      prompt: `This animation script failed.\n\nScript:\n\`\`\`\n${code}\n\`\`\`\n\nRuntime error:\n${error}\n\nReturn the corrected script.`,
      options: {
        systemPrompt: FIX_SYSTEM_PROMPT,
        tools: [],
        maxTurns: 1,
      },
    });
    let text = "";
    for await (const message of q) {
      if (message.type === "assistant") {
        for (const block of message.message.content) {
          if (block.type === "text") text += block.text;
        }
      }
    }
    res.json({ code: extractCodeBlock(text) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: null, error: String(err?.message ?? err) });
  }
});
```

- [ ] **Step 2: Manual verification**

Run with the dev server up:

```
curl -X POST http://localhost:3001/api/fix -H "Content-Type: application/json" -d "{\"code\":\"const s = createScene(); s.circl({x:0,y:0});\",\"error\":\"TypeError: s.circl is not a function (line 1)\"}"
```

Expected: JSON `{ "code": "..." }` where the code calls `s.circle(...)`.

- [ ] **Step 3: End-to-end retry check**

In the app, this path is hard to trigger on demand; verify the wiring by temporarily changing `AnimationFrame`'s srcdoc build to inject a broken script — or simply confirm during Task 9 that no animation ever leaves a blank iframe (errors either get fixed or show the failure note). No code changes committed for this step.

- [ ] **Step 4: Commit**

```
git add server/index.js
git commit -m "feat: /api/fix one-shot animation repair endpoint"
```

---

### Task 9: Demo checklist and polish

**Files:**
- Create: `README.md`
- Modify: (only if fixes are needed) `server/prompts.js`, `web/src/anim/tutorAnim.js`

**Interfaces:**
- Consumes: the full app.
- Produces: a verified prototype and a README.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 2: Run the five canonical prompts**

With `npm run dev` running and the app open, ask each of these in a fresh page load (refresh between prompts so each starts a clean conversation):

1. "Explain what a sine wave is"
2. "Why does a pendulum swing?"
3. "How does bubble sort work?"
4. "Show me projectile motion"
5. "What is a derivative?"

Expected for each: streamed explanation + a working animation (auto-plays, controls work). If an animation misbehaves (wrong framing, no motion, error note), tune `ANIM_API_DOCS` / rules in `server/prompts.js` (better docs → better generated code) rather than special-casing the library, then retry that prompt. Commit any prompt tuning with message `fix: tune animation prompt for <prompt>`.

- [ ] **Step 3: Ask a follow-up in the same conversation**

After prompt 1, ask "Now show me what changing the frequency does." Expected: the tutor references the earlier exchange (transcript context works) and produces a new animation.

- [ ] **Step 4: Write README.md**

```markdown
# AI Tutor

A local ChatGPT-style tutor for math and physics that generates a live animation
beneath each explanation.

## Requirements

- Node 20+
- A logged-in Claude Code installation (the backend authenticates through it —
  no API key needed)

## Run

    npm install
    npm run dev

Open http://localhost:5173 and ask something like "Why does a pendulum swing?".

## How it works

- `server/` — Express server; `/api/chat` streams tutor responses from Claude via
  the Claude Agent SDK; `/api/fix` repairs broken animation scripts (one retry).
- `web/src/anim/tutorAnim.js` — the TutorAnim canvas runtime (shapes, tweens,
  playback controls). `demo.html` shows it standalone.
- Each response may contain a fenced ```animation block; it is stripped from the
  visible text and executed in a sandboxed iframe with TutorAnim preloaded.

## Tests

    npm test
```

- [ ] **Step 5: Final commit**

```
git add -A
git commit -m "docs: README and demo checklist verification"
```
