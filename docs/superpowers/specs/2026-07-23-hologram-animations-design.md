# Hologram Animation Architecture — Design Spec

**Date:** 2026-07-23
**Status:** Approved

## Summary

Replace AI Tutor's Tutor3D helper-API animation engine (`createScene3D()`,
`sphere()`, `box()`, `tween()`, etc.) with a raw self-contained-HTML-fragment
generation architecture, adapted from a reference implementation the user
shared (`sketchpad_tutor.html`). Instead of calling a constrained scene-graph
API, the model writes a complete, self-contained HTML/CSS/JS fragment per
answer — inline `<style>`, markup, and a `<script>` at the end — styled as a
"hologram": glowing cyan/blue wireframe-and-glass 3D shapes built from CSS 3D
transforms, draggable with inertia. This is a from-scratch architecture
replacement, not an incremental change: it touches the system prompt, the
response parser, the srcdoc builder, and the error-recovery pipeline.

## Decisions from discussion

- **Replace, don't add alongside.** Tutor3D is fully removed rather than
  kept as a second code path — one animation pipeline, not two.
- **CSS-3D only, not the reference file's hand-rolled canvas option.**
  Feasibility-tested directly against this project's Groq backend
  (`llama-3.3-70b-versatile`) before finalizing this spec — see
  "Feasibility validation" below. The original reference prompt (which
  permits either CSS 3D or a hand-rolled canvas 3D projection with manual
  depth-sorting, backface-culling, and a specific perspective-projection
  formula) produced syntactically valid but substantially broken output
  from this model: no hologram styling, wrong color palette, missing
  `setPointerCapture`, and — in one of two samples — a severe bug where a
  new SVG element was created and appended to the DOM on every animation
  frame, an unbounded leak that would freeze the tab within minutes.
  Scaling the prompt back to CSS-3D-only (the browser's own 3D engine
  handles depth-ordering and back-face culling via `transform-style:
  preserve-3d` and `backface-visibility: hidden`, for free) and dropping
  the hardest-to-hit requirements (object-emitted lighting, scanline
  sweep/flicker, the canvas performance rules that no longer apply once
  canvas isn't required) produced two working, bug-free samples out of two
  in a follow-up test.
- **Tutor3D cleanup: delete everything.** The engine, its tests, the
  vendored Three.js bundle, `demo.html`, and the entire Artifact-gallery
  build pipeline (`scripts/build-three.mjs`, `scripts/generate-lessons.mjs`,
  `artifact/`) are removed rather than left as dead code.
- **Error recovery reuses existing infrastructure**, rather than building a
  second parallel retry system alongside it (see Architecture, "Error
  recovery").
- **A "redraw" button (regenerate with a different visual approach) is
  included** as part of faithfully porting the reference architecture, in
  addition to the required "reset view" button.

## Feasibility validation

Before finalizing this design, the exact reference-file system prompt was
sent to this project's real Groq backend for two test questions ("How does
a battery work?", "What is a stack data structure?"). Both parsed
correctly and passed a syntax check, but both substantially ignored the
prompt's detailed requirements: neither used canvas (both defaulted to CSS
3D, a permitted alternative, but with flat coplanar divs — no real 3D
structure), neither included the hologram glow palette, lighting, `aria-label`,
reduced-motion handling, or the reset-view listener. One sample was missing
`setPointerCapture` (an explicit must-have) and had a rotation bug (updated
on any pointer movement, not just while dragging). The other had a severe
runtime bug: a `requestAnimationFrame` loop that created and appended a new
SVG element every frame forever, an unbounded DOM/memory leak.

A scaled-back version of the prompt (below, mirrored in Architecture) —
CSS-3D-only, no canvas/hand-rolled projection math, no object-emitted
lighting, no scanline/flicker — was then tested against three questions
(one hit the Groq free tier's daily token limit before returning). The two
completed samples were read in full, not just automated-checked: real CSS
3D structure with faces at distinct `translateZ` depths, correct glow
styling, correct `setPointerCapture`/`isDragging` handling, correct
reduced-motion gating (drag still works, only the coast-down spin is
skipped), `aria-label` present, and one working concept-relevant extra
control each (a highlight toggle; working Push/Pop buttons that add/remove
DOM elements from a "stack" visualization). One sample was missing the
reset-view listener; the other had all required elements present with no
defects found. This decisively favors the scaled-back CSS-3D-only prompt
over the original.

## Architecture

### System prompt (`server/prompts.js`)

`TUTOR_SYSTEM_PROMPT` is replaced with the scaled-back hologram prompt,
validated above:

- **Output format:** `<<<CONCEPT>>>` / `<<<EXPLANATION>>>` / `<<<ANIMATION>>>`
  / `<<<END>>>` plain-text delimiters — chosen (per the reference file's own
  reasoning, carried over) specifically to avoid JSON-escaping corruption on
  a large HTML/CSS/JS blob, which fenced-code-block or JSON encoding risks.
- **Visual style:** CSS-3D only — a `perspective` wrapper, an inner
  `transform-style: preserve-3d` element, and 4–10 flat "face" divs
  positioned via `translateZ`/`rotateX`/`rotateY`, each styled with a
  translucent cyan/blue (`#4DEFFF`/`#5BC8FF`) fill, border, and
  `box-shadow` glow, `backface-visibility: hidden`. No canvas, no SVG for
  the 3D shape, no hand-rolled projection math — the browser's 3D
  compositor handles depth ordering and back-face hiding.
- **Interactivity:** drag anywhere on the shape to rotate (pointer events,
  `setPointerCapture` required); release-and-coast inertia (decay velocity
  ~0.92–0.95/frame); exactly one additional concept-relevant control
  (button or slider).
- **Sizing:** `width:100%;height:100%;box-sizing:border-box`, no fixed
  pixel dimensions — CSS percentage layout reflows without needing the
  reference file's explicit canvas-resize event machinery.
- **Code quality:** pointer events not mouse events; one rotation state
  object; no blanket try/catch (the host's own error handler recovers);
  never create/append DOM elements inside a repeating loop — create once,
  mutate in the loop.
- **Accessibility:** `window.sketchpadReducedMotion` (host-provided
  boolean) skips the coast-down spin only, dragging still works; one
  `aria-label` on the root element.
- **Reset view:** `window.addEventListener("message", ...)` listening for
  `{type: "sketchpad-reset-view"}`.
- Target length: 40–90 lines for the animation fragment (down from the
  reference's 70–160, reflecting the reduced complexity).

`FIX_SYSTEM_PROMPT` is rewritten with the same rule set, framed as
"repair this broken fragment given its error," mirroring the current
file's existing pattern of sharing rules between the two prompts.

### Response parsing (`web/src/lib/parseResponse.js`)

Complete rewrite. Parses the four delimiters instead of a fenced
` ```animation ` block. New return shape:

```
{ concept: string, visibleText: string, animationHtml: string | null, pending: boolean }
```

`pending` retains its current meaning — `true` while the `<<<ANIMATION>>>`
section has opened but `<<<END>>>` (or a closing boundary) hasn't arrived
yet, matching today's "fence still streaming" semantics so the existing
`AssistantMessage`/`PinnedViewport` state machine (idle → building → ready)
needs no conceptual change, only field-name updates.

### Rendering pipeline

- **`buildAnimationSrcdoc.js`**: no longer injects the vendored Three.js
  bundle or the Tutor3D engine scripts (nothing to inject — the fragment is
  fully self-contained). Injects: the existing `window.onerror`/
  `unhandledrejection` → `postMessage({type:"anim-error"})` handler
  (reused as-is, already present today), plus a new
  `window.sketchpadReducedMotion` flag and a `prefers-reduced-motion`
  CSS block pausing any pure-CSS animation/transition automatically. No
  resize/DPR-fitting event machinery — that exists in the reference file
  to solve a canvas-pixel-buffer sizing problem this design doesn't have.
- **`PinnedViewport.jsx`**: gains a small header row (new) showing the
  `concept` title, a **reset view** button (posts
  `{type: "sketchpad-reset-view"}` into the iframe), and a **redraw**
  button (re-asks the same question with "give a different visual approach
  this time" appended, mirroring the reference file's `regenerate()`).
  The existing idle/building/ready state logic is otherwise unchanged.
- **`AssistantMessage.jsx`**: updated for the new `parseResponse` field
  names (`visibleText`, `pending`) — no structural change.

### Error recovery — reuses existing infrastructure

Two distinct triggers, both funneled through the **existing** `/api/fix`
endpoint and its existing client-side wiring (`AnimationFrame.jsx`'s
`postMessage` listener) rather than building parallel machinery:

1. **Pre-mount syntax check.** Right before first mounting the iframe (the
   same moment rendering currently begins once streaming ends), run
   `new Function(code)` against each inline `<script>` block in the
   fragment (parses without executing — catches syntax errors only). If
   any fails, call `/api/fix` once with the broken fragment and the syntax
   error, exactly as if it were a runtime error, before ever showing the
   user a broken iframe.
2. **Runtime error** (existing, unchanged): the iframe's own
   `window.onerror`/`unhandledrejection` handlers already post
   `{type: "anim-error"}` to the parent, which already triggers one
   `/api/fix` call. No change to this path except updating `/api/fix`'s
   own prompt/extraction logic for the new fragment format (the endpoint
   itself, its one-retry-then-give-up behavior, and the rate limiting are
   unchanged).

### Files touched

**Rewritten:**
- `server/prompts.js` — new `TUTOR_SYSTEM_PROMPT`/`FIX_SYSTEM_PROMPT`
- `web/src/lib/parseResponse.js` — new delimiter-based parser
- `web/src/lib/buildAnimationSrcdoc.js` — new host scaffolding, no engine injection
- `web/src/components/AnimationFrame.jsx` — pre-mount syntax check added
- `web/src/components/PinnedViewport.jsx` — header with concept/reset/redraw
- `web/src/components/AssistantMessage.jsx` — new field names
- `server/index.js` — `/api/fix` handler's prompt/extraction updated
- `scripts/check-prompts.mjs` — validates the new format instead of Tutor3D calls

**Deleted:**
- `web/src/anim/` (`tutorAnim.js`, `tutor3d.js`, and their tests)
- `web/src/vendor/three.iife.js`
- `demo.html`
- `scripts/build-three.mjs`, `scripts/generate-lessons.mjs`
- `artifact/` and its generation script
- Now-dead `package.json` scripts: `build:three`, `build:lessons`, `build:artifact`

**Untouched:** subject-scope prompt rules (rule 5/6/7 numbering and text
from the subject-scope-expansion sub-project), the glassmorphic two-column
layout and all CSS from the frontend-redesign sub-project, `App.jsx`'s
chat/streaming/`send()` logic.

## Testing

`parseResponse.js`'s rewrite is fully TDD-worthy pure logic — complete
rewrite of `parseResponse.test.js` for the new delimiter format (complete
response, partial/streaming response, missing sections, empty animation).
The pre-mount syntax-check function (`new Function()` wrapper) is also pure
and testable. Everything else — the srcdoc scaffolding, the CSS-3D visual
result, the error-recovery round-trip — is DOM/iframe integration behavior,
verified manually in a browser, matching this project's existing testing
philosophy. `scripts/check-prompts.mjs` continues as the live acceptance
script, updated to validate the new format (parses correctly, animation
fragment non-empty, inline scripts syntactically valid) rather than
Tutor3D-specific checks (`createScene3D`, `.tween()`).

## Non-goals

- No dual-pipeline support — Tutor3D is fully removed, not kept as a
  fallback or alternative style.
- No canvas-based or hand-rolled 3D projection math — CSS 3D only, per the
  feasibility validation above.
- No object-emitted lighting, scanline sweep, or flicker effects — cut
  from the reference prompt as sources of unreliable output for this
  weaker model, not carried over even as optional extras.
- No changes to subject scope, the chat shell's layout/glassmorphism, or
  the streaming `/api/chat` architecture itself.
- No new npm dependencies.
