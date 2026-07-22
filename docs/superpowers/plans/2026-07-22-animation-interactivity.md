# Animation Interactivity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every Tutor3D animation two new capabilities: live-adjustable parameter sliders that retune a running animation without restarting it, and hover/click tooltips on scene objects — making animations feel like small explorable simulations instead of pre-recorded clips.

**Architecture:** Two new scene-API methods (`s.params()`, `s.interactive()`) are added to the existing `web/src/anim/tutor3d.js` engine, following its established imperative-helper pattern. A small pure `isClick()` helper (added to `web/src/anim/tutorAnim.js`, the engine's existing math/logic core) disambiguates a click from a camera-orbit drag. The system prompt (`server/prompts.js`) is updated to document and encourage the new primitives.

**Tech Stack:** Vanilla JS (no new dependencies), the already-vendored Three.js (`THREE.Raycaster` is already included), Vitest for the one new unit of pure logic.

## Global Constraints

- Parameters only drive properties already being tweened (position, rotation, scale, material color/opacity, curve progress) — they cannot rebuild geometry or resize/re-count objects. This is a deliberate scope boundary from the spec, not an oversight.
- Click/hover interaction has fixed built-in behavior only (highlight + tooltip + click-to-pin) — no custom `onClick` callback is exposed to generated animation code.
- The system prompt encourages, never mandates, use of the new primitives — animations without them remain valid.
- The animation code line cap (`TUTOR_SYSTEM_PROMPT` rule 3) rises from 60 to 80 lines.
- No new npm dependencies.
- No changes to `web/src/lib/buildAnimationSrcdoc.js` or `web/src/components/AnimationFrame.jsx`.
- No changes to `scripts/check-prompts.mjs`'s `PROMPTS` array (the existing 8 prompts remain sufficient; this plan does not add new acceptance prompts).

---

### Task 1: `isClick` — click-vs-drag pure logic (TDD)

**Files:**
- Modify: `web/src/anim/tutorAnim.js:38-43`
- Test: `web/src/anim/tutorAnim.test.js` (append after the existing "tweens" `describe` block, i.e. after the current line 76)

**Interfaces:**
- Consumes: nothing new.
- Produces: `isClick(downXY, upXY, thresholdPx = 5)` — a pure function taking two `{x, y}` points and an optional pixel threshold, returning `true` if the two points are within `thresholdPx` of each other. Exported via `globalThis.TutorAnim.isClick`, alongside the existing `easings`/`lerp`/`makeTransform`/`applyTweens`/`timelineDuration`. Task 3 consumes this exact signature.

- [ ] **Step 1: Write the failing tests**

Append this `describe` block to the end of `web/src/anim/tutorAnim.test.js` (after the closing `});` of the existing `"tweens"` block):

```js
describe("isClick", () => {
  it("treats a stationary pointer as a click", () => {
    expect(A.isClick({ x: 100, y: 100 }, { x: 100, y: 100 })).toBe(true);
  });
  it("treats a tiny wobble under the default threshold as a click", () => {
    expect(A.isClick({ x: 100, y: 100 }, { x: 102, y: 101 })).toBe(true);
  });
  it("treats a point exactly at the default 5px threshold as a click", () => {
    expect(A.isClick({ x: 0, y: 0 }, { x: 5, y: 0 })).toBe(true);
  });
  it("treats movement past the default threshold as a drag, not a click", () => {
    expect(A.isClick({ x: 0, y: 0 }, { x: 6, y: 0 })).toBe(false);
    expect(A.isClick({ x: 0, y: 0 }, { x: 50, y: 50 })).toBe(false);
  });
  it("respects a custom threshold", () => {
    expect(A.isClick({ x: 0, y: 0 }, { x: 20, y: 0 }, 25)).toBe(true);
    expect(A.isClick({ x: 0, y: 0 }, { x: 20, y: 0 }, 10)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run web/src/anim/tutorAnim.test.js`
Expected: FAIL — `TypeError: A.isClick is not a function` (or similar), since `isClick` doesn't exist yet.

- [ ] **Step 3: Implement `isClick` in `web/src/anim/tutorAnim.js`**

Replace lines 38-43 (the `timelineDuration` function through the closing `})();`):

```js
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run web/src/anim/tutorAnim.test.js`
Expected: PASS, all tests in the file (existing + 5 new) green.

- [ ] **Step 5: Run the full suite (regression check)**

Run: `npm test`
Expected: `Test Files 4 passed (4)`, `Tests 25 passed (25)` (20 existing + 5 new).

- [ ] **Step 6: Commit**

```bash
git add web/src/anim/tutorAnim.js web/src/anim/tutorAnim.test.js
git commit -m "feat: add isClick pure helper for click-vs-drag detection"
```

---

### Task 2: `s.params()` — live parameter sliders

**Files:**
- Modify: `web/src/anim/tutor3d.js:221-225`

**Interfaces:**
- Consumes: nothing from Task 1 (independent).
- Produces: `s.params(schema)` where `schema` is `{ key: { label, min, max, step, default } }`. Returns a plain object with one property per key, initialized to `default` and live-mutated whenever the viewer moves that key's slider. Task 4 documents this exact signature in `ANIM_API_DOCS`.

- [ ] **Step 1: Add the `params()` method to the scene API**

In `web/src/anim/tutor3d.js`, replace the `tween()` method and the `api` object's closing brace (current lines 221-225):

```js
      tween(target, props, duration, { delay = 0, easing = "easeInOut" } = {}) {
        tweens.push({ target, props, duration, delay, easing: easings[easing] || easings.easeInOut });
        return api;
      },
      params(schema = {}) {
        const values = {};
        let paramsBar = wrap.querySelector(".tutor3d-params");
        if (!paramsBar) {
          paramsBar = document.createElement("div");
          paramsBar.className = "tutor3d-params";
          paramsBar.style.cssText = "display:flex;flex-direction:column;gap:4px;margin-top:6px";
          wrap.appendChild(paramsBar);
        }
        for (const key in schema) {
          const { label = key, min = 0, max = 1, step = 0.1, default: def = min } = schema[key];
          values[key] = def;
          const row = document.createElement("div");
          row.style.cssText = "display:flex;align-items:center;gap:8px;font-size:12px;color:#94a3b8";
          const text = document.createElement("span");
          text.textContent = label;
          text.style.cssText = "min-width:120px";
          const input = document.createElement("input");
          input.type = "range";
          input.min = min;
          input.max = max;
          input.step = step;
          input.value = def;
          input.style.cssText = "flex:1";
          const valueLabel = document.createElement("span");
          valueLabel.textContent = def;
          valueLabel.style.cssText = "min-width:40px;text-align:right;color:#e2e8f0";
          input.oninput = () => {
            values[key] = Number(input.value);
            valueLabel.textContent = input.value;
          };
          row.append(text, input, valueLabel);
          paramsBar.appendChild(row);
        }
        return values;
      },
    };
```

- [ ] **Step 2: Run the full suite (regression check)**

Run: `npm test`
Expected: `Tests 25 passed (25)` — this task adds no new Vitest coverage (DOM/UI behavior, verified live per Step 3), matching the spec's testing section.

- [ ] **Step 3: Verify live in a browser**

With the dev server running (`npm run dev`), navigate to `http://localhost:5173/demo.html` — this page loads the vendored Three.js, `tutorAnim.js`, and `tutor3d.js` as globals and exposes `createScene3D` directly, so you can exercise the new API without going through the LLM.

Run this in the browser's JS console (or via a tool that can execute JS in the page):

```js
const s = createScene3D({ span: 4 });
const p = s.params({ length: { label: "Test length", min: 1, max: 5, step: 0.5, default: 2 } });
window.__testParams = p;
```

Verify:
- A new row with a "Test length" label, a range slider, and a value display ("2") appears below the existing play/pause/replay/speed controls bar.
- `document.querySelectorAll(".tutor3d-params input[type=range]").length` is `1`.
- Programmatically set the slider and dispatch an `input` event, then confirm the returned object updated:
  ```js
  const input = document.querySelector(".tutor3d-params input[type=range]");
  input.value = "4";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  window.__testParams.length === 4 // should be true
  ```
- The value display next to the slider now reads "4".

- [ ] **Step 4: Commit**

```bash
git add web/src/anim/tutor3d.js
git commit -m "feat: add s.params() live parameter sliders to Tutor3D"
```

---

### Task 3: `s.interactive()` — hover/click object tooltips

**Files:**
- Modify: `web/src/anim/tutor3d.js:4` (destructure), `web/src/anim/tutor3d.js:36` (state), and immediately after the `params()` method added in Task 2 (new method insertion).

**Interfaces:**
- Consumes: `isClick(downXY, upXY, thresholdPx)` from Task 1 (`globalThis.TutorAnim.isClick`).
- Produces: `s.interactive(mesh, { label })` — registers `mesh` for hover-highlight and click-to-pin tooltip behavior; returns `mesh`. Task 4 documents this exact signature in `ANIM_API_DOCS`.

- [ ] **Step 1: Add `isClick` to the top-of-file destructure**

In `web/src/anim/tutor3d.js`, change line 4:

```js
  const { easings, applyTweens, timelineDuration } = globalThis.TutorAnim;
```

to:

```js
  const { easings, applyTweens, timelineDuration, isClick } = globalThis.TutorAnim;
```

- [ ] **Step 2: Add `interactiveState` alongside the other per-scene state**

Change line 36 (`let lastNow = null;`) to add a new line immediately after it:

```js
    let lastNow = null;
    let interactiveState = null;
```

- [ ] **Step 3: Add the `interactive()` method to the scene API**

Insert this new method immediately after the `params()` method added in Task 2 (i.e., after its closing `},` and before the `api` object's final closing `};`):

```js
      interactive(mesh, { label = "" } = {}) {
        if (!interactiveState) {
          interactiveState = {
            objects: [],
            raycaster: new THREE.Raycaster(),
            pointer: new THREE.Vector2(),
            hovered: null,
            pinned: null,
            downXY: null,
          };
          wrap.style.position = "relative";
          const tooltip = document.createElement("div");
          tooltip.style.cssText = "position:absolute;display:none;pointer-events:none;background:#1e293b;color:#e2e8f0;border:1px solid #334155;border-radius:6px;padding:4px 8px;font:12px system-ui;max-width:200px;z-index:10";
          wrap.appendChild(tooltip);

          const setHighlight = (obj, on) => {
            if (!obj || !obj.material || !obj.material.emissive) return;
            if (on) {
              obj.userData._origEmissive = obj.material.emissive.getHex();
              obj.material.emissive.setHex(0x334155);
            } else if (obj.userData._origEmissive != null) {
              obj.material.emissive.setHex(obj.userData._origEmissive);
            }
          };
          const showTooltip = (obj, clientX, clientY) => {
            const rect = renderer.domElement.getBoundingClientRect();
            tooltip.textContent = obj.userData.tutorLabel || "";
            tooltip.style.left = `${clientX - rect.left + 12}px`;
            tooltip.style.top = `${clientY - rect.top + 12}px`;
            tooltip.style.display = "block";
          };
          const hideTooltip = () => { tooltip.style.display = "none"; };
          const pickObject = (clientX, clientY) => {
            const rect = renderer.domElement.getBoundingClientRect();
            interactiveState.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
            interactiveState.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
            interactiveState.raycaster.setFromCamera(interactiveState.pointer, camera);
            const hits = interactiveState.raycaster.intersectObjects(interactiveState.objects, false);
            return hits.length ? hits[0].object : null;
          };

          renderer.domElement.addEventListener("pointermove", (e) => {
            const obj = pickObject(e.clientX, e.clientY);
            if (obj !== interactiveState.hovered) {
              setHighlight(interactiveState.hovered, false);
              interactiveState.hovered = obj;
              setHighlight(obj, true);
            }
            if (interactiveState.pinned) {
              showTooltip(interactiveState.pinned, e.clientX, e.clientY);
            } else if (obj) {
              showTooltip(obj, e.clientX, e.clientY);
            } else {
              hideTooltip();
            }
          });
          renderer.domElement.addEventListener("pointerdown", (e) => {
            interactiveState.downXY = { x: e.clientX, y: e.clientY };
          });
          renderer.domElement.addEventListener("pointerup", (e) => {
            const upXY = { x: e.clientX, y: e.clientY };
            const wasClick = interactiveState.downXY && isClick(interactiveState.downXY, upXY);
            if (wasClick) {
              const obj = pickObject(e.clientX, e.clientY);
              if (obj && interactiveState.pinned === obj) {
                interactiveState.pinned = null;
                hideTooltip();
              } else if (obj) {
                interactiveState.pinned = obj;
                showTooltip(obj, e.clientX, e.clientY);
              } else if (interactiveState.pinned) {
                interactiveState.pinned = null;
                hideTooltip();
              }
            }
            interactiveState.downXY = null;
          });
        }
        mesh.userData.tutorLabel = label;
        interactiveState.objects.push(mesh);
        return mesh;
      },
```

- [ ] **Step 4: Run the full suite (regression check)**

Run: `npm test`
Expected: `Tests 25 passed (25)` — this task adds no new Vitest coverage (DOM/WebGL integration behavior, verified live per Step 5), matching the spec's testing section. `isClick` itself is already covered by Task 1's tests.

- [ ] **Step 5: Verify live in a browser**

With the dev server running, navigate to `http://localhost:5173/demo.html` (same technique as Task 2 — `createScene3D` is available as a global).

Run in the browser's JS console:

```js
const s2 = createScene3D({ span: 4 });
const mesh = s2.sphere({ r: 0.5, color: "#38bdf8" });
s2.interactive(mesh, { label: "Test sphere" });
```

Then compute the mesh's on-screen position and simulate pointer events at it:

```js
const rect = s2.renderer.domElement.getBoundingClientRect();
const ndc = mesh.position.clone().project(s2.camera);
const cx = rect.left + (ndc.x * 0.5 + 0.5) * rect.width;
const cy = rect.top + (1 - (ndc.y * 0.5 + 0.5)) * rect.height;
s2.renderer.domElement.dispatchEvent(new PointerEvent("pointermove", { clientX: cx, clientY: cy, bubbles: true }));
```

Verify:
- A tooltip reading "Test sphere" appears near the sphere.
- The sphere visibly gets a subtle highlight (its material's emissive color changes — inspect `mesh.material.emissive.getHexString()`, should no longer be `"000000"`).
- Simulate a click at the same spot (`pointerdown` then `pointerup` at the same `clientX`/`clientY`) and confirm the tooltip stays visible after moving the pointer away (`pointermove` to a point far from the sphere) — this proves the click pinned it.
- Click again at the same spot (or dispatch another click at the sphere's position) and confirm the tooltip disappears — this proves the click unpinned it.
- Move the pointer away from the sphere without clicking (no pin) and confirm the tooltip disappears and the highlight clears.

- [ ] **Step 6: Commit**

```bash
git add web/src/anim/tutor3d.js
git commit -m "feat: add s.interactive() hover/click tooltips to Tutor3D"
```

---

### Task 4: Prompt updates + full live verification

**Files:**
- Modify: `server/prompts.js:1-59` (the entire file)

**Interfaces:**
- Consumes: `s.params(schema)` (Task 2) and `s.interactive(mesh, { label })` (Task 3) — this task only documents their exact signatures, does not change engine code.
- Produces: nothing consumed by a later task — this is the final task in the plan.

- [ ] **Step 1: Update `TUTOR_SYSTEM_PROMPT` and `ANIM_API_DOCS` in `server/prompts.js`**

Replace the entire file (current lines 1-59, all three exports) with:

```js
export const ANIM_API_DOCS = `
The Tutor3D animation API (already loaded — call these globals directly, do NOT import anything).
The full Three.js library is also available as the global THREE, and helper methods return real
THREE objects (Mesh, Sprite) you may manipulate — but prefer the helpers for anything they cover.
Coordinates are y-up; the floor is the x/z plane.

createScene3D({span?})
  Creates an interactive 640×400 WebGL viewport (drag to orbit, auto-rotates until dragged),
  mounts it, and auto-plays. span (default 6) sets the visible world scale — content should
  fit roughly within [-span, span] on each axis. Returns a scene handle s.

Scene methods:
  s.axes()                                   — x (red), y (green), z (blue) axis arrows + labels
  s.grid()                                   — floor grid on the x/z plane
  s.sphere({x, y, z, r, color, opacity})     — returns a THREE.Mesh (tween its .position etc.)
  s.box({x, y, z, w, h, d, color, opacity})  — returns a THREE.Mesh
  s.arrow({from: [x,y,z], to: [x,y,z], color}) — returns {from:{x,y,z}, to:{x,y,z}}; tween the
    endpoint objects to animate the vector, e.g. s.tween(a.to, { y: [1, 3] }, 2)
  s.curve3d(fn, {t0, t1, color, progress})   — fn(t) => [x, y, z]; returns {progress} — tween
    progress 0→1 to draw the path over time
  s.surface(fn, {xmin, xmax, zmin, zmax, color, opacity}) — plots y = fn(x, z); returns a THREE.Mesh
  s.label("text", {x, y, z, size, color})    — billboard text; returns a THREE.Sprite
  s.tween(target, {prop: valueSpec}, durationSeconds, {delay?, easing?})
    target is ANY object with numeric props: mesh.position, mesh.rotation, mesh.scale,
    an arrow's .to, a curve3d handle, a material, ...
    valueSpec is [from, to] (interpolated) or (t) => value with t going 0..1 over the tween —
    use functions for orbits and oscillation, e.g. { x: (t) => 3 * Math.cos(t * 2 * Math.PI) }.
    easing: "linear" | "easeIn" | "easeOut" | "easeInOut" (default). Tweens + delays form the
    timeline; playback controls are automatic.
  s.params({ key: {label, min, max, step, default} })
    Declares one or more live sliders, rendered below the scene's transport controls. Returns a
    plain object with one property per key, live-updated the instant the viewer drags a slider —
    read it inside a tween's function-valued prop so the animation responds without restarting,
    e.g. const p = s.params({ length: { label: "Pendulum length", min: 0.5, max: 3, step: 0.1, default: 1.5 } });
    s.tween(bob.position, { y: (t) => -p.length * Math.cos(t * 6) }, 4).
    Only affects properties you tween — it cannot resize or rebuild geometry created earlier.
  s.interactive(mesh, {label})
    Makes a mesh respond to hover (highlight + tooltip showing label) and click (pins the tooltip
    open until clicked again). Built-in behavior only — there is no custom click handler.

Example — a moon orbiting a planet:
  const s = createScene3D({ span: 5 });
  s.grid();
  const planet = s.sphere({ r: 1, color: "#3b82f6" });
  const moon = s.sphere({ r: 0.25, color: "#94a3b8" });
  s.tween(moon.position, {
    x: (t) => 3 * Math.cos(t * 2 * Math.PI),
    z: (t) => 3 * Math.sin(t * 2 * Math.PI),
    y: (t) => 0.8 * Math.sin(t * 4 * Math.PI),
  }, 6, { easing: "linear" });
  s.label("moon's orbit", { x: 0, y: 2.6, z: 0 });
`;

export const TUTOR_SYSTEM_PROMPT = `You are a friendly, clear tutor for any academic subject.

Rules for every answer:
1. Explain the concept clearly for a learner, using short paragraphs and (where helpful) simple markdown. Keep the explanation under ~250 words.
2. Then output EXACTLY ONE interactive 3D animation illustrating the core idea, as a fenced code block tagged "animation":
\`\`\`animation
// JavaScript using the Tutor3D API below
\`\`\`
3. The animation code must be under 80 lines, create exactly one scene with createScene3D, and use only the documented API, the THREE global, and plain JavaScript (Math, loops, functions). Never use import/export, fetch, DOM APIs (document/window), setTimeout, or requestAnimationFrame — the library handles all timing via s.tween.
4. Animate over 3–8 seconds. Label the key elements. Make deliberate use of the third dimension — depth, height, orbits, surfaces — not just a flat drawing in 3D space.
5. When the concept naturally has an adjustable quantity (length, speed, frequency, angle, mass, and similar), add a live parameter with s.params() so the viewer can experiment; when a specific object benefits from a short explanation, make it hoverable with s.interactive(). Use both only when they add real understanding for this concept — don't bolt on a slider or tooltip that isn't meaningful.
6. Not every subject has an obvious spatial structure — invent one rather than skipping the animation. A history question can become a timeline laid out along one axis; a story's plot structure can become a rising and falling 3D arc; relationships between words, characters, or ideas can become a 3D network graph; a comparison can become bars or points positioned along an axis. Always find a spatial metaphor for the core idea.
7. If (and only if) the question is not about a concept that can be visualized (e.g. small talk), omit the animation block.
${ANIM_API_DOCS}`;

export const FIX_SYSTEM_PROMPT = `You repair broken Tutor3D animation scripts. The user gives you a script and the runtime error it produced. Respond with ONLY a single fenced code block containing the corrected script — no prose. Follow the same API rules.
${ANIM_API_DOCS}`;
```

The changes from the current version: two new `ANIM_API_DOCS` entries (`s.params`, `s.interactive`) inserted after `s.tween`'s entry; rule 3's line cap raised from 60 to 80; a new rule 5 (encouraging, not requiring, the new primitives) inserted before the old rule 5 (now rule 6, spatial-metaphor guidance, text unchanged) and old rule 6 (now rule 7, small-talk exemption, text unchanged). `FIX_SYSTEM_PROMPT` is unchanged except for inheriting the updated `ANIM_API_DOCS` interpolation.

- [ ] **Step 2: Run the full suite (regression check)**

Run: `npm test`
Expected: `Tests 25 passed (25)` — no test asserts on prompt text; this catches only an accidental template-string syntax error.

- [ ] **Step 3: Run the live acceptance script (regression check)**

With the dev server running (`npm run dev`, needs `GROQ_API_KEY` in `.env`):

Run: `npm run check`
Expected: `ALL PASS` for all 8 existing prompts — proves the line-cap increase and new rule/doc additions didn't break generation for prompts that don't happen to use the new primitives.

- [ ] **Step 4: Manual verification that the model actually uses the new primitives**

With the dev server running, ask the real chat UI a question with an obvious adjustable quantity and an obvious labelable object, e.g. **"Why does a pendulum swing?"**. After the response streams in:

1. Confirm the explanation still renders normally and a 3D animation still appears.
2. Look for a live parameter slider below the animation's play/pause/replay/speed controls (e.g. a "length" or "angle" slider) — drag it and confirm the pendulum's motion visibly retunes without the animation restarting.
3. Hover over the pendulum bob (or another labeled object in the scene) and confirm a tooltip appears; click it and confirm it stays pinned after moving the mouse away.

If the model's response for this one prompt happens not to include a parameter or interactive object (rule 5 encourages but doesn't mandate them — some model responses will vary), try one more time or try a second prompt with an obviously adjustable quantity (e.g. **"Show me projectile motion"** — launch angle/speed are natural parameters) before concluding the feature isn't working end-to-end. Record what you observed either way.

- [ ] **Step 5: Commit**

```bash
git add server/prompts.js
git commit -m "feat: document and encourage live params + interactive objects in the tutor prompt"
```
