# Hologram Animation Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Tutor3D helper-API animation engine with a raw self-contained-HTML-fragment "hologram" architecture (CSS-3D, glowing wireframe style), validated against this project's real Groq backend, including a pre-mount syntax check and a redraw/reset-view UI.

**Architecture:** A new delimiter-based response format (`<<<CONCEPT>>>`/`<<<EXPLANATION>>>`/`<<<ANIMATION>>>`/`<<<END>>>`) replaces the fenced-code-block format throughout the pipeline: the system prompt, `parseResponse.js`, `buildAnimationSrcdoc.js`, `AnimationFrame.jsx`, and `PinnedViewport.jsx`. The existing `/api/fix` retry endpoint is reused for both a new pre-mount syntax check and the existing runtime-error recovery, rather than building a second parallel system. Tutor3D and everything built on it is deleted.

**Tech Stack:** No new dependencies — plain JS/React, `new Function()` for syntax-only validation (never executes the checked code).

## Global Constraints

- CSS-3D only for the animation's 3D structure — no `<canvas>`, no hand-rolled projection math. The browser's `transform-style: preserve-3d` and `backface-visibility: hidden` handle depth ordering and back-face culling.
- Palette: near-black background, cyan/blue glow (`#4DEFFF`/`#5BC8FF`), optional violet accent (`#C77DFF`) — no opaque warm colors.
- `setPointerCapture` is required on drag; `isDragging` must gate `pointermove`; both `pointerup` and `pointercancel` must clear it.
- Never create/append DOM elements inside a repeating loop — create once, mutate in the loop.
- `window.sketchpadReducedMotion` gates only the release coast-down spin; dragging itself must always work.
- The `<<<ANIMATION>>>` section may be left empty (only) when the question isn't about a visualizable concept (e.g. small talk) — mirrors the existing small-talk exemption already present in this project's prompt history.
- No new npm dependencies.
- Tutor3D and everything built on it (`web/src/anim/`, the vendored Three.js bundle, `demo.html`, the Artifact-gallery build pipeline) is deleted, not left as dead code.

---

### Task 1: `parseResponse.js` rewrite (TDD)

**Files:**
- Modify: `web/src/lib/parseResponse.js` (entire file)
- Test: `web/src/lib/parseResponse.test.js` (entire file)

**Interfaces:**
- Consumes: nothing new.
- Produces: `parseResponse(text)` returns `{ concept: string, visibleText: string, animationHtml: string | null, pending: boolean }`. This exact shape is consumed by `App.jsx` (Task 5) and remains backward-compatible for `AssistantMessage.jsx`, which only reads `visibleText`/`pending` and needs no code change (verify this in Step 5 below).

- [ ] **Step 1: Write the failing tests**

Replace `web/src/lib/parseResponse.test.js` in full:

```js
import { describe, it, expect } from "vitest";
import { parseResponse } from "./parseResponse.js";

describe("parseResponse", () => {
  it("passes through plain text with no structure (e.g. small talk)", () => {
    const r = parseResponse("Just chatting, no diagram needed here.");
    expect(r).toEqual({ concept: "", visibleText: "Just chatting, no diagram needed here.", animationHtml: null, pending: false });
  });

  it("hides everything while only the concept marker has streamed in", () => {
    const r = parseResponse("<<<CONCEPT>>>\nBattery Ba");
    expect(r.concept).toBe("");
    expect(r.visibleText).toBe("");
    expect(r.animationHtml).toBe(null);
    expect(r.pending).toBe(true);
  });

  it("extracts the concept once the explanation marker arrives, streams explanation live", () => {
    const r = parseResponse("<<<CONCEPT>>>\nBattery Basics\n<<<EXPLANATION>>>\nA battery sto");
    expect(r.concept).toBe("Battery Basics");
    expect(r.visibleText).toBe("A battery sto");
    expect(r.animationHtml).toBe(null);
    expect(r.pending).toBe(true);
  });

  it("stops growing the explanation once the animation marker opens, still pending", () => {
    const r = parseResponse(
      "<<<CONCEPT>>>\nBattery Basics\n<<<EXPLANATION>>>\nA battery stores energy.\n<<<ANIMATION>>>\n<div>partial"
    );
    expect(r.visibleText).toBe("A battery stores energy.");
    expect(r.animationHtml).toBe(null);
    expect(r.pending).toBe(true);
  });

  it("extracts the complete animation fragment once <<<END>>> arrives", () => {
    const r = parseResponse(
      "<<<CONCEPT>>>\nBattery Basics\n<<<EXPLANATION>>>\nA battery stores energy.\n<<<ANIMATION>>>\n<div>hologram</div>\n<<<END>>>"
    );
    expect(r.concept).toBe("Battery Basics");
    expect(r.visibleText).toBe("A battery stores energy.");
    expect(r.animationHtml).toBe("<div>hologram</div>");
    expect(r.pending).toBe(false);
  });

  it("treats an empty animation section as no animation (small-talk exemption)", () => {
    const r = parseResponse(
      "<<<CONCEPT>>>\nJust Chatting\n<<<EXPLANATION>>>\nHaha, sure thing!\n<<<ANIMATION>>>\n\n<<<END>>>"
    );
    expect(r.animationHtml).toBe(null);
    expect(r.pending).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run web/src/lib/parseResponse.test.js`
Expected: FAIL — the old `parseResponse` returns `{ visibleText, animationCode, pending }`, not the new shape, so every assertion on `concept`/`animationHtml` fails.

- [ ] **Step 3: Replace `web/src/lib/parseResponse.js` in full**

```js
const CONCEPT_OPEN = "<<<CONCEPT>>>";
const EXPLANATION_OPEN = "<<<EXPLANATION>>>";
const ANIMATION_OPEN = "<<<ANIMATION>>>";
const END = "<<<END>>>";

export function parseResponse(text) {
  const conceptStart = text.indexOf(CONCEPT_OPEN);
  if (conceptStart === -1) {
    return { concept: "", visibleText: text, animationHtml: null, pending: false };
  }

  const explanationStart = text.indexOf(EXPLANATION_OPEN);
  if (explanationStart === -1) {
    return { concept: "", visibleText: "", animationHtml: null, pending: true };
  }
  const concept = text.slice(conceptStart + CONCEPT_OPEN.length, explanationStart).trim();

  const animationStart = text.indexOf(ANIMATION_OPEN);
  if (animationStart === -1) {
    const visibleText = text.slice(explanationStart + EXPLANATION_OPEN.length).trim();
    return { concept, visibleText, animationHtml: null, pending: true };
  }
  const visibleText = text.slice(explanationStart + EXPLANATION_OPEN.length, animationStart).trim();

  const rest = text.slice(animationStart + ANIMATION_OPEN.length);
  const endIdx = rest.indexOf(END);
  if (endIdx === -1) {
    return { concept, visibleText, animationHtml: null, pending: true };
  }
  const animationHtml = rest.slice(0, endIdx).trim();
  return { concept, visibleText, animationHtml: animationHtml || null, pending: false };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run web/src/lib/parseResponse.test.js`
Expected: PASS, all 6 tests green.

- [ ] **Step 5: Confirm `AssistantMessage.jsx` needs no code change**

Read `web/src/components/AssistantMessage.jsx`. It destructures `const { visibleText, pending } = parseResponse(content);` — both fields still exist in the new return shape (`concept`/`animationHtml` are simply unused by this component), so no edit is needed here. Confirm this by running the full suite in Step 6 rather than editing the file.

- [ ] **Step 6: Run the full suite (regression check)**

Run: `npm test`
Expected: `Tests 26 passed (26)`, `Test Files 4 passed (4)` — the pre-branch baseline is 25 tests across 4 files (`rateLimit.test.js`, `parseResponse.test.js`, `buildAnimationSrcdoc.test.js`, `tutorAnim.test.js`); `parseResponse.test.js` going from 5 to 6 tests nets +1. `tutorAnim.test.js` isn't touched until Task 6, so it's still present and passing here.

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/parseResponse.js web/src/lib/parseResponse.test.js
git commit -m "feat: rewrite parseResponse for the hologram delimiter format"
```

---

### Task 2: `checkAnimationSyntax.js` (new, TDD) + `buildAnimationSrcdoc.js` rewrite (TDD)

**Files:**
- Create: `web/src/lib/checkAnimationSyntax.js`
- Test: `web/src/lib/checkAnimationSyntax.test.js`
- Modify: `web/src/lib/buildAnimationSrcdoc.js` (entire file)
- Test: `web/src/lib/buildAnimationSrcdoc.test.js` (entire file)

**Interfaces:**
- Consumes: nothing new.
- Produces: `findScriptSyntaxError(animationHtml)` — returns `string | null` (the syntax error message, or `null` if every inline `<script>` block parses cleanly via `new Function()`, which parses without executing). `buildAnimationSrcdoc(userFragment)` — single-argument now (previously took `threeSource, engineSource, userCode`); returns the full iframe `srcdoc` HTML string. Both are consumed by `AnimationFrame.jsx` in Task 4.

- [ ] **Step 1: Write the failing tests for `checkAnimationSyntax.js`**

Create `web/src/lib/checkAnimationSyntax.test.js`:

```js
import { describe, it, expect } from "vitest";
import { findScriptSyntaxError } from "./checkAnimationSyntax.js";

describe("findScriptSyntaxError", () => {
  it("returns null for a fragment with no script tags", () => {
    expect(findScriptSyntaxError("<div>just markup</div>")).toBe(null);
  });

  it("returns null for valid script content", () => {
    const html = '<div id="x"></div><script>const x = 1; console.log(x);</script>';
    expect(findScriptSyntaxError(html)).toBe(null);
  });

  it("returns the error message for invalid script content", () => {
    const html = "<script>const x = ;</script>";
    const err = findScriptSyntaxError(html);
    expect(err).not.toBe(null);
    expect(typeof err).toBe("string");
  });

  it("checks multiple script blocks and catches an error in a later one", () => {
    const html = "<script>const a = 1;</script><div></div><script>const b = ;</script>";
    expect(findScriptSyntaxError(html)).not.toBe(null);
  });

  it("skips empty script blocks", () => {
    const html = "<script></script><script>   </script>";
    expect(findScriptSyntaxError(html)).toBe(null);
  });

  it("returns null for empty or null input", () => {
    expect(findScriptSyntaxError("")).toBe(null);
    expect(findScriptSyntaxError(null)).toBe(null);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run web/src/lib/checkAnimationSyntax.test.js`
Expected: FAIL — `Cannot find module './checkAnimationSyntax.js'`.

- [ ] **Step 3: Create `web/src/lib/checkAnimationSyntax.js`**

```js
export function findScriptSyntaxError(animationHtml) {
  if (!animationHtml) return null;
  const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = scriptRegex.exec(animationHtml)) !== null) {
    const code = match[1];
    if (!code || !code.trim()) continue;
    try {
      new Function(code);
    } catch (syntaxErr) {
      return syntaxErr.message;
    }
  }
  return null;
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run web/src/lib/checkAnimationSyntax.test.js`
Expected: PASS, all 6 tests green.

- [ ] **Step 5: Write the failing tests for `buildAnimationSrcdoc.js`**

Replace `web/src/lib/buildAnimationSrcdoc.test.js` in full:

```js
import { describe, it, expect } from "vitest";
import { buildAnimationSrcdoc } from "./buildAnimationSrcdoc.js";

describe("buildAnimationSrcdoc", () => {
  it("inlines the user fragment with CSP, error bridge, and reduced-motion flag", () => {
    const html = buildAnimationSrcdoc('<div id="thing"></div><script>console.log("hi");</script>');
    expect(html).toContain("Content-Security-Policy");
    expect(html).toContain("default-src 'none'");
    expect(html).toContain('<div id="thing"></div>');
    expect(html).toContain('console.log("hi");');
    expect(html).toContain("anim-error");
    expect(html).toContain("sketchpadReducedMotion");
  });

  it("neutralizes </script> inside the user fragment", () => {
    const html = buildAnimationSrcdoc('<script>const s = "</script>";</script>');
    expect(html).not.toContain('const s = "</script>";');
    expect(html).toContain('const s = "<\\/script>";');
  });
});
```

- [ ] **Step 6: Run to verify they fail**

Run: `npx vitest run web/src/lib/buildAnimationSrcdoc.test.js`
Expected: FAIL — the current `buildAnimationSrcdoc` takes three arguments and its output doesn't contain `sketchpadReducedMotion`.

- [ ] **Step 7: Replace `web/src/lib/buildAnimationSrcdoc.js` in full**

```js
function neutralize(code) {
  return code.replaceAll("</script", "<\\/script");
}

export function buildAnimationSrcdoc(userFragment) {
  return `<!doctype html>
<html>
<head>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'">
<style>
  html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #06080B; }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.001ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.001ms !important;
    }
  }
</style>
</head>
<body>
<script>
window.sketchpadReducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
window.onerror = function (msg, src, line) {
  parent.postMessage({ type: "anim-error", message: String(msg) + " (line " + line + ")" }, "*");
};
window.addEventListener("unhandledrejection", function (e) {
  parent.postMessage({ type: "anim-error", message: String((e.reason && e.reason.message) || e.reason || "unhandled promise rejection") }, "*");
});
</${"script"}>
${neutralize(userFragment)}
</body>
</html>`;
}
```

- [ ] **Step 8: Run to verify they pass**

Run: `npx vitest run web/src/lib/buildAnimationSrcdoc.test.js`
Expected: PASS, both tests green.

- [ ] **Step 9: Run the full suite (regression check)**

Run: `npm test`
Expected: `Tests 32 passed (32)`, `Test Files 5 passed (5)` — 26 from Task 1, plus this task's new `checkAnimationSyntax.test.js` (6 tests, 1 new file) and `buildAnimationSrcdoc.test.js` staying at 2 tests (same count, rewritten content): 26 + 6 = 32.

- [ ] **Step 10: Commit**

```bash
git add web/src/lib/checkAnimationSyntax.js web/src/lib/checkAnimationSyntax.test.js web/src/lib/buildAnimationSrcdoc.js web/src/lib/buildAnimationSrcdoc.test.js
git commit -m "feat: add syntax-check helper, rewrite srcdoc builder for hologram fragments"
```

---

### Task 3: `server/prompts.js` rewrite + `/api/fix` handler update

**Files:**
- Modify: `server/prompts.js` (entire file)
- Modify: `server/index.js:64-93` (the `extractCodeBlock` function and the `/api/fix` route handler)

**Interfaces:**
- Consumes: nothing new.
- Produces: `TUTOR_SYSTEM_PROMPT`, `FIX_SYSTEM_PROMPT` (same export names, new content — the delimiter format Task 1 already parses). No other task imports these directly beyond `server/index.js`, which already does.

- [ ] **Step 1: Replace `server/prompts.js` in full**

```js
const ANIMATION_RULES = `
## VISUAL STYLE — hologram, CSS-3D ONLY (do not use <canvas> or <svg> for the 3D shape)
Build the 3D shape entirely from CSS 3D transforms — a wrapper with perspective, an inner element with transform-style: preserve-3d, and 4-10 flat <div> "face" elements positioned in 3D space via translateZ/rotateX/rotateY/translateY etc. The browser's own 3D engine handles depth ordering and hiding back faces for you automatically — you do NOT need to compute depth sorting, perspective projection math, or which faces are hidden yourself. Just set backface-visibility: hidden on every face div and position them correctly in 3D space; the browser does the rest.
Each face div: border: 1px solid the glow color, background: the glow color at 8-18% opacity (e.g. rgba(77,239,255,0.12)), box-shadow: 0 0 12px the glow color for a soft glow. This is static CSS, not something you compute per frame.
Not every subject has an obvious physical shape — invent a spatial one rather than skipping the diagram. A history timeline can become faces laid out along one axis; a story's plot structure can become faces at rising and falling heights; relationships between words, characters, or ideas can become faces connected by thin glowing line divs; a comparison can become faces at different depths or sizes. Always find a 3D arrangement for the core idea.
Palette: deep transparent/near-black page background, primary glow in cyan/electric-blue (#4DEFFF or #5BC8FF), optional magenta/violet accent (#C77DFF). No solid opaque warm colors. Text labels in the same cool white/cyan family.

## INTERACTIVITY
Drag anywhere on the shape to rotate it (update the preserve-3d wrapper's rotateX/rotateY based on pointer movement). When the user releases, keep spinning briefly using the last drag speed, slowing down each frame (multiply velocity by 0.92-0.95 until it's near zero) — a simple requestAnimationFrame loop that only runs during this coast-down is fine.
Add exactly one more control relevant to the concept (a button or slider) that changes something about the diagram when used (e.g. toggles a highlighted part, steps through stages, adjusts a value).
Add small text labels (positioned absolutely or as its own face) directly on or near the diagram for key parts.

## SIZING
Root element: width:100%;height:100%;box-sizing:border-box. No fixed pixel width/height anywhere.

## CODE QUALITY — the most common real failures, follow exactly
(1) POINTER EVENTS, not mouse events: on pointerdown, set isDragging=true and call element.setPointerCapture(e.pointerId) — this is required, do not skip it. On pointermove, only rotate if isDragging is true. On BOTH pointerup and pointercancel, set isDragging=false.
(2) Exactly one state object for rotation, e.g. {x, y, vx, vy}. Update it directly; don't create new objects each event.
(3) Do NOT wrap your code in a try/catch that shows your own error message — the host already catches and recovers from uncaught errors. Let errors propagate.
(4) Never create or append new DOM/SVG elements inside a repeating loop (setInterval or a requestAnimationFrame loop) — create every element ONCE up front, then in the loop only change existing elements' style/transform properties. Creating new elements every frame will freeze the page.
(5) Attach every event listener directly to a real element reference right after that element is created. Double-check every id/class you use in JS actually matches one you wrote in the HTML.

## ACCESSIBILITY
The host exposes window.sketchpadReducedMotion (boolean). If true, skip the release-coast-down spin (just stop rotating when the pointer is released) — but dragging itself must still work either way, since the user is causing that motion. Add one short aria-label on your root element describing what the diagram shows.

## RESET VIEW
Listen for window.addEventListener("message", function(e){ if(e.data && e.data.type === "sketchpad-reset-view"){ /* snap rotation back to your starting angle here */ } });

## BUDGET
Aim for 40-90 lines in the ANIMATION section. A correct, smoothly-rotatable, well-lit, finished scene matters far more than raw complexity.
`;

export const TUTOR_SYSTEM_PROMPT = `You are a friendly, precise tutor for any academic subject.

## OUTPUT FORMAT
Respond in EXACTLY this plain-text format — these four markers on their own lines, nothing else around them, no markdown fences, no JSON, no escaping of any kind (write raw HTML/CSS/JS exactly as it should appear, including all its own quotes and newlines, completely unescaped):
<<<CONCEPT>>>
(a 3-6 word title for the idea being illustrated)
<<<EXPLANATION>>>
(2-4 short paragraphs, plain language, concrete analogies, no markdown headers. Keep it under ~250 words.)
<<<ANIMATION>>>
(the full self-contained HTML fragment described below, written raw/unescaped — or leave this section EMPTY, with nothing between the markers, if and only if the question is not about a concept that can be visualized at all, e.g. small talk)
<<<END>>>
${ANIMATION_RULES}`;

export const FIX_SYSTEM_PROMPT = `You repair broken hologram animation fragments (the raw HTML/CSS/JS content that goes between <<<ANIMATION>>> and <<<END>>>). The user gives you the fragment and the error it produced. Respond with ONLY the corrected fragment, raw and unescaped — no prose, no markdown fences, no <<<markers>>>. Follow the same rules as when generating one from scratch:
${ANIMATION_RULES}`;
```

- [ ] **Step 2: Replace `extractCodeBlock` and the `/api/fix` route in `server/index.js`**

Replace the current lines 64-93 (from `function extractCodeBlock(text) {` through the closing `);` of the `/api/fix` route) with:

```js
app.post(
  "/api/fix",
  rateLimitMiddleware(fixLimiter, (res) => {
    res.status(429).json({ code: null });
  }),
  async (req, res) => {
    const { code, error } = req.body ?? {};
    if (!code || !error) {
      return res.status(400).json({ error: "code and error required" });
    }
    let text = "";
    let failure = null;
    for await (const event of streamCompletion({
      systemPrompt: FIX_SYSTEM_PROMPT,
      input: `This animation fragment failed.\n\nFragment:\n${code}\n\nError:\n${error}\n\nReturn the corrected fragment.`,
    })) {
      if (event.type === "delta") text += event.text;
      else if (event.type === "error") failure = event.message;
    }
    if (failure) {
      console.error(failure);
      return res.status(500).json({ code: null, error: failure });
    }
    res.json({ code: text.trim() || null });
  }
);
```

`extractCodeBlock` is removed entirely — `FIX_SYSTEM_PROMPT` now instructs the model to respond with the raw fragment and nothing else, so no fenced-code-block extraction is needed; the trimmed response text is the fix.

- [ ] **Step 3: Run the full suite (regression check)**

Run: `npm test`
Expected: `Tests 32 passed (32)`, `Test Files 5 passed (5)` — unchanged from Task 2's count; no test covers `server/prompts.js`'s content or `server/index.js`'s `/api/fix` route directly, so this run only catches an accidental syntax error.

- [ ] **Step 4: Commit**

```bash
git add server/prompts.js server/index.js
git commit -m "feat: rewrite tutor prompts for the hologram architecture, simplify /api/fix"
```

---

### Task 4: `AnimationFrame.jsx` rewrite

**Files:**
- Modify: `web/src/components/AnimationFrame.jsx` (entire file)

**Interfaces:**
- Consumes: `buildAnimationSrcdoc(userFragment)` (Task 2), `findScriptSyntaxError(animationHtml)` (Task 2).
- Produces: `<AnimationFrame ref={...} html={string} />` — the `code` prop is renamed to `html`. Exposes an imperative handle via `ref` with one method: `resetView()` (posts `{type: "sketchpad-reset-view"}` into the iframe). Task 5's `PinnedViewport.jsx` consumes both the new prop name and the ref API.

- [ ] **Step 1: Replace `web/src/components/AnimationFrame.jsx` in full**

```jsx
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { buildAnimationSrcdoc } from "../lib/buildAnimationSrcdoc.js";
import { findScriptSyntaxError } from "../lib/checkAnimationSyntax.js";

const AnimationFrame = forwardRef(function AnimationFrame({ html }, ref) {
  const [currentHtml, setCurrentHtml] = useState(html);
  const [status, setStatus] = useState("checking"); // "checking" | "fixing" | "ok" | "failed"
  const triedFix = useRef(false);
  const iframeRef = useRef(null);

  useImperativeHandle(ref, () => ({
    resetView() {
      iframeRef.current?.contentWindow?.postMessage({ type: "sketchpad-reset-view" }, "*");
    },
  }));

  async function attemptFix(errorMessage) {
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
        body: JSON.stringify({ code: currentHtml, error: errorMessage }),
      });
      const data = await res.json();
      if (data.code) {
        setCurrentHtml(data.code);
        setStatus("checking");
      } else {
        setStatus("failed");
      }
    } catch {
      setStatus("failed");
    }
  }

  useEffect(() => {
    if (status !== "checking") return;
    const syntaxErr = findScriptSyntaxError(currentHtml);
    if (syntaxErr) {
      attemptFix(syntaxErr);
    } else {
      setStatus("ok");
    }
  }, [status, currentHtml]);

  useEffect(() => {
    function onMessage(e) {
      if (e.data?.type !== "anim-error") return;
      if (e.source !== iframeRef.current?.contentWindow) return;
      attemptFix(e.data.message);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [currentHtml]);

  const srcdoc = useMemo(() => buildAnimationSrcdoc(currentHtml), [currentHtml]);

  if (status === "failed") {
    return <div className="anim-note">⚠ Animation failed to render.</div>;
  }
  if (status !== "ok") {
    return <div className="anim-note">{status === "fixing" ? "Fixing animation…" : "Checking animation…"}</div>;
  }

  return (
    <div className="anim-wrap">
      <iframe
        ref={iframeRef}
        sandbox="allow-scripts"
        srcDoc={srcdoc}
        title="animation"
        style={{ width: "100%", height: 480, border: "none", borderRadius: 8 }}
      />
    </div>
  );
});

export default AnimationFrame;
```

Key behavior: on mount (and after any fix), status starts at `"checking"`; the first effect runs `findScriptSyntaxError` — if the fragment is already broken, it calls `attemptFix` (reusing the exact same `/api/fix` round-trip the runtime-error path already used) *before* the iframe ever mounts, so the user never sees a broken render. `triedFix` is shared between the pre-mount check and the runtime `postMessage` listener, so only one fix attempt ever happens total, matching the existing one-retry behavior.

- [ ] **Step 2: Run the full suite (regression check)**

Run: `npm test`
Expected: `Tests 32 passed (32)`, `Test Files 5 passed (5)` — unchanged; no test directly imports `AnimationFrame.jsx` (it's DOM/iframe integration behavior, verified live in Task 6).

- [ ] **Step 3: Commit**

```bash
git add web/src/components/AnimationFrame.jsx
git commit -m "feat: rewrite AnimationFrame for hologram fragments, add pre-mount syntax check and reset-view ref"
```

---

### Task 5: `PinnedViewport.jsx` + `App.jsx` + `App.css` — wiring, redraw, reset view

**Files:**
- Modify: `web/src/components/PinnedViewport.jsx` (entire file)
- Modify: `web/src/App.jsx` (entire file)
- Modify: `web/src/App.css` (append new rules)

**Interfaces:**
- Consumes: `parseResponse` (Task 1, new shape), `AnimationFrame` (Task 4, new `html` prop + ref API).
- Produces: nothing consumed by a later task — this is the last code task before cleanup.

- [ ] **Step 1: Replace `web/src/components/PinnedViewport.jsx` in full**

```jsx
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
```

`key={animationHtml}` is required: without it, React would keep the same `AnimationFrame` instance mounted across a redraw (new `animationHtml` prop on an existing instance), and its internal `currentHtml`/`status`/`triedFix` state — all initialized once via `useState` — would never re-sync to the new content. Keying by the content itself forces a clean remount whenever the animation actually changes.

- [ ] **Step 2: Replace `web/src/App.jsx` in full**

```jsx
import { useRef, useState } from "react";
import AssistantMessage from "./components/AssistantMessage.jsx";
import PinnedViewport from "./components/PinnedViewport.jsx";
import { parseResponse } from "./lib/parseResponse.js";

const EXAMPLE_QUESTIONS = [
  "Why does a pendulum swing?",
  "What caused the fall of the Berlin Wall?",
  "How does supply and demand set prices?",
  "What makes a sonnet different from free verse?",
  "How do plants convert sunlight into energy?",
];

export default function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [exampleQuestion] = useState(
    () => EXAMPLE_QUESTIONS[Math.floor(Math.random() * EXAMPLE_QUESTIONS.length)]
  );
  const listRef = useRef(null);

  async function streamChat(requestHistory, onDelta) {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: requestHistory }),
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
          onDelta(assistantText);
        } else if (data.type === "error") {
          assistantText += `\n\n> ⚠ ${data.message}`;
          onDelta(assistantText);
        }
      }
      listRef.current?.scrollTo(0, listRef.current.scrollHeight);
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setBusy(true);
    const history = [...messages, { role: "user", content: text }];
    setMessages([...history, { role: "assistant", content: "" }]);
    try {
      await streamChat(history, (assistantText) => {
        setMessages([...history, { role: "assistant", content: assistantText }]);
      });
    } catch (err) {
      setMessages([...history, { role: "assistant", content: `> ⚠ Request failed: ${err.message}` }]);
    } finally {
      setBusy(false);
    }
  }

  async function regenerate() {
    if (busy) return;
    const lastIdx = messages.length - 1;
    const prevIdx = lastIdx - 1;
    if (messages[lastIdx]?.role !== "assistant" || messages[prevIdx]?.role !== "user") return;
    setBusy(true);
    const requestHistory = [
      ...messages.slice(0, prevIdx),
      { role: "user", content: `${messages[prevIdx].content} (give a different visual approach this time)` },
    ];
    setMessages((prev) => prev.map((m, i) => (i === lastIdx ? { role: "assistant", content: "" } : m)));
    try {
      await streamChat(requestHistory, (assistantText) => {
        setMessages((prev) => prev.map((m, i) => (i === lastIdx ? { role: "assistant", content: assistantText } : m)));
      });
    } catch (err) {
      setMessages((prev) =>
        prev.map((m, i) => (i === lastIdx ? { role: "assistant", content: `> ⚠ Request failed: ${err.message}` } : m))
      );
    } finally {
      setBusy(false);
    }
  }

  const lastMessage = messages[messages.length - 1];
  const lastParsed =
    lastMessage?.role === "assistant"
      ? parseResponse(lastMessage.content)
      : { concept: "", animationHtml: null, pending: false };
  const viewportHtml = !busy && lastParsed.animationHtml ? lastParsed.animationHtml : null;
  const viewportPending = lastParsed.pending;
  const viewportConcept = lastParsed.concept;

  return (
    <div className="app">
      <div className={`ambient${busy ? " ambient-active" : ""}`} aria-hidden="true">
        <div className="ambient-mesh"></div>
      </div>
      <header className="topbar">AI Tutor <span className="sub">every subject, animated</span></header>
      <div className="layout">
        <div className="chat-col">
          <main className="chat" ref={listRef}>
            {messages.length === 0 && (
              <div className="empty">
                Ask me anything — try <em>“{exampleQuestion}”</em>
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
              placeholder="Ask about any subject…"
              rows={1}
            />
            <button onClick={send} disabled={busy || !input.trim()}>
              {busy ? "…" : "Send"}
            </button>
          </footer>
        </div>
        <div className="viewport-col">
          <PinnedViewport
            animationHtml={viewportHtml}
            pending={viewportPending}
            concept={viewportConcept}
            onRedraw={regenerate}
          />
        </div>
      </div>
    </div>
  );
}
```

`send()` and `regenerate()` now share the streaming/SSE-parsing logic via the new `streamChat(requestHistory, onDelta)` helper — `send()` appends a new message pair and calls `onDelta` to update the newly-appended assistant message; `regenerate()` replaces the *existing* last assistant message in place (keeping the original question bubble unchanged) using an amended request that appends "give a different visual approach this time" to the last user question, without ever displaying that amendment in the chat.

- [ ] **Step 3: Append new rules to `web/src/App.css`**

Add these rules directly after the existing `.pinned-viewport.ready { display: block; text-align: left; padding: 12px; }` line:

```css
.pinned-viewport-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}
.pinned-viewport-title {
  font-size: 13px;
  font-weight: 600;
  color: #e2e8f0;
}
.pinned-viewport-controls {
  display: flex;
  gap: 6px;
}
.pinned-viewport-controls button {
  font-size: 12px;
  color: #94a3b8;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 5px 10px;
  border-radius: 8px;
  cursor: pointer;
}
.pinned-viewport-controls button:hover { border-color: var(--accent-1); color: var(--accent-1); }
```

- [ ] **Step 4: Run the full suite (regression check)**

Run: `npm test`
Expected: `Tests 32 passed (32)`, `Test Files 5 passed (5)` — unchanged; this task's App.jsx/PinnedViewport.jsx/App.css changes have no dedicated unit tests (DOM/UI behavior, verified live in Task 6).

- [ ] **Step 5: Verify in a browser**

With the dev server running, ask a question and confirm: the panel shows the concept title, a working "reset view" button, and a working "redraw" button once the animation is ready; clicking redraw shows "Building animation…" then a *new* animation without adding a new question bubble to the chat; the original question bubble is unchanged.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/PinnedViewport.jsx web/src/App.jsx web/src/App.css
git commit -m "feat: wire hologram viewport with concept title, reset view, and redraw"
```

---

### Task 6: Delete Tutor3D, rewrite the acceptance script, update docs, final end-to-end verification

**Files:**
- Delete: `web/src/anim/tutorAnim.js`, `web/src/anim/tutorAnim.test.js`, `web/src/anim/tutor3d.js`, `web/src/vendor/three.iife.js`, `demo.html`, `scripts/build-three.mjs`, `scripts/generate-lessons.mjs`, `scripts/build-artifact.mjs`, `artifact/tutor-demo.html`, `artifact/lessons.json`, `artifact/template.html`
- Modify: `scripts/check-prompts.mjs` (entire file)
- Modify: `package.json` (remove dead scripts, remove the `three` dependency)
- Modify: `README.md` (the "How it works" and "Claude Artifact demo" sections)

**Interfaces:**
- Consumes: the full pipeline built in Tasks 1-5.
- Produces: nothing — this is the final task.

- [ ] **Step 1: Delete the Tutor3D engine and its tests**

```bash
git rm -r web/src/anim
```

- [ ] **Step 2: Delete the vendored Three.js bundle**

```bash
git rm web/src/vendor/three.iife.js
```

- [ ] **Step 3: Delete the standalone demo page**

```bash
git rm demo.html
```

- [ ] **Step 4: Delete the Artifact-gallery build pipeline and its output**

```bash
git rm scripts/build-three.mjs scripts/generate-lessons.mjs scripts/build-artifact.mjs
git rm -r artifact
```

- [ ] **Step 5: Remove the now-dead `package.json` scripts and the `three` dependency**

In `package.json`, remove these three lines from `"scripts"`:

```json
    "build:three": "node scripts/build-three.mjs",
    "build:lessons": "node scripts/generate-lessons.mjs",
    "build:artifact": "node scripts/build-artifact.mjs",
```

and remove this line from `"dependencies"`:

```json
    "three": "^0.185.1",
```

Then run `npm install` to update `package-lock.json` to match.

- [ ] **Step 6: Replace `scripts/check-prompts.mjs` in full**

```js
// Acceptance checker: hits /api/chat with a set of canonical prompts and
// validates each generated hologram animation fragment (present, valid
// syntax, no forbidden APIs). Requires the dev server (npm run dev).
const PROMPTS = [
  "Explain what a sine wave is",
  "Why does a pendulum swing?",
  "How does bubble sort work?",
  "Show me projectile motion",
  "What is a derivative?",
  "What caused the fall of the Berlin Wall?",
  "How does supply and demand set prices?",
  "What makes a sonnet different from free verse?",
];

const FORBIDDEN = /\b(fetch\s*\(|XMLHttpRequest|eval\s*\(|import\s|export\s)/;

function extractAnimation(text) {
  const start = text.indexOf("<<<ANIMATION>>>");
  const end = text.indexOf("<<<END>>>");
  if (start === -1 || end === -1) return null;
  const html = text.slice(start + "<<<ANIMATION>>>".length, end).trim();
  return html || null;
}

function findScriptSyntaxError(animationHtml) {
  const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = scriptRegex.exec(animationHtml)) !== null) {
    const code = match[1];
    if (!code || !code.trim()) continue;
    try {
      new Function(code);
    } catch (e) {
      return e.message;
    }
  }
  return null;
}

async function ask(prompt) {
  const res = await fetch("http://localhost:3001/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: prompt }] }),
  });
  const raw = await res.text();
  let full = "";
  for (const line of raw.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    const data = JSON.parse(line.slice(6));
    if (data.type === "delta") full += data.text;
    if (data.type === "error") throw new Error(data.message);
  }
  return full;
}

let failures = 0;
for (const prompt of PROMPTS) {
  process.stdout.write(`\n=== ${prompt}\n`);
  try {
    const full = await ask(prompt);
    const html = extractAnimation(full);
    if (!html) { console.log("FAIL: no animation fragment"); failures++; continue; }
    const forbidden = html.match(FORBIDDEN);
    if (forbidden) { console.log(`FAIL: forbidden API: ${forbidden[0]}`); failures++; continue; }
    const syntaxErr = findScriptSyntaxError(html);
    if (syntaxErr) { console.log(`FAIL: syntax error: ${syntaxErr}`); failures++; continue; }
    console.log(`PASS: ${html.split("\n").length} lines, preserve-3d=${/preserve-3d/.test(html)}, setPointerCapture=${/setPointerCapture/.test(html)}`);
  } catch (e) {
    console.log(`FAIL: request error: ${e.message}`);
    failures++;
  }
}
console.log(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURES"}`);
process.exit(failures === 0 ? 0 : 1);
```

The `FORBIDDEN` list drops `document.`, `window.`, `setTimeout`, `setInterval`, and `requestAnimationFrame` from the old Tutor3D-era list — all four are now legitimately required by the hologram architecture (the host's `window.sketchpadReducedMotion`/`window.addEventListener`, `document.getElementById`/`createElement` for one-time element setup, and one `requestAnimationFrame` loop for the coast-down spin). Only genuinely inappropriate APIs remain forbidden: network access, `eval`, and ES module syntax (the fragment is a plain inline script, not a module).

- [ ] **Step 7: Update `README.md`**

Replace the "How it works" section:

```markdown
## How it works

- `server/` — Express server; `/api/chat` streams tutor responses via Groq
  (`server/llm.js`); `/api/fix` repairs broken animation fragments (one retry,
  covers both a pre-render syntax check and runtime errors).
- Each response follows a `<<<CONCEPT>>>`/`<<<EXPLANATION>>>`/`<<<ANIMATION>>>`/`<<<END>>>`
  format (`web/src/lib/parseResponse.js`). The `<<<ANIMATION>>>` section is a
  self-contained "hologram" HTML/CSS/JS fragment — a draggable, glowing CSS-3D
  shape — executed in a sandboxed iframe (`web/src/components/AnimationFrame.jsx`,
  `web/src/lib/buildAnimationSrcdoc.js`).
- `npm run check` — acceptance script: sends a set of canonical prompts to
  `/api/chat` and validates each generated animation fragment (present, valid
  syntax, no forbidden APIs). Run this after any prompt or rendering change.
```

Remove the entire "## Claude Artifact demo" section (the gallery it describes no longer exists).

- [ ] **Step 8: Run the full suite (regression check)**

Run: `npm test`
Expected: `Tests 18 passed (18)`, `Test Files 4 passed (4)` — deleting `web/src/anim/tutorAnim.test.js` (Step 1, 14 tests, 1 file) drops the count from 32 to 18, across the remaining 4 files: `rateLimit.test.js`, `parseResponse.test.js`, `buildAnimationSrcdoc.test.js`, `checkAnimationSyntax.test.js`.

- [ ] **Step 9: Run the live acceptance script**

With the dev server running (`npm run dev`, needs `GROQ_API_KEY` in `.env` — be mindful of Groq's free-tier daily token limit hit during this plan's feasibility testing; if `npm run check` hits a rate limit, wait for the window to clear rather than retrying repeatedly):

Run: `npm run check`
Expected: `ALL PASS` for all 8 prompts.

- [ ] **Step 10: Full manual verification pass**

With the dev server running:
1. Load the app fresh — confirm no console errors (nothing tries to load the deleted `three.iife.js`/`tutorAnim.js`/`tutor3d.js`).
2. Ask a question (e.g. "Why does a pendulum swing?"). Confirm: explanation text streams in, the panel shows "Building animation…" then a real draggable glowing CSS-3D hologram — not a flat shape, not the old blue/slate Tutor3D look.
3. Drag the shape — confirm it rotates and coasts to a stop after release.
4. Click "reset view" — confirm it snaps back to the starting angle.
5. Click "redraw" — confirm a new animation appears in the panel without a new question bubble appearing in the chat.
6. Ask a second, unrelated question — confirm the panel switches to the new animation and the first question's chat bubble is now text-only (per the existing panel-only-latest design from the frontend-redesign sub-project, unaffected by this plan).
7. `npm run build` — confirm the production build succeeds with no references to deleted files.

- [ ] **Step 11: Commit**

```bash
git add scripts/check-prompts.mjs package.json package-lock.json README.md
git commit -m "chore: delete Tutor3D engine and Artifact gallery, update acceptance script and docs"
```
