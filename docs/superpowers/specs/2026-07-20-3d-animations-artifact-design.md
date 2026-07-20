# 3D Animations + Claude Artifact Demo — Design Spec

**Date:** 2026-07-20
**Status:** Approved
**Builds on:** `2026-07-20-ai-tutor-animations-design.md` (the shipped 2D prototype)

## Summary

Two changes to the AI tutor prototype:

1. **3D replaces 2D**: tutor animations are rendered with Three.js in an
   interactive 3D viewport (drag-to-orbit) instead of the 2D canvas engine.
2. **Claude Artifact demo**: a shareable page hosted on claude.ai containing
   ~6 pre-generated lessons (explanation + 3D animation), published as a
   private Artifact.

## Constraints discovered

- **Artifacts cannot call Claude.** Available runtime capabilities are only
  `downloads` and `mcp` (viewer's connectors); there is no LLM-completion API
  for a hosted page. Live chat therefore stays in the local app; the Artifact
  is a pre-generated gallery.
- **No external scripts anywhere.** Both the local sandboxed iframe (CSP
  `default-src 'none'`) and Artifacts (strict CSP, no external hosts) require
  all JS inline. Three.js must be vendored as a single classic-script bundle.
- Modern Three.js is ESM-only — no official UMD build. We create the classic
  bundle ourselves.

## Architecture

### Three.js vendored bundle

- `npm install three` + a one-time build script (`scripts/build-three.mjs`,
  using esbuild via Vite's dependency) bundles an entry that does
  `import * as THREE from "three"` + `OrbitControls` addon into
  `web/src/vendor/three.iife.js` (IIFE, minified, exposes `globalThis.THREE`
  with `THREE.OrbitControls` attached).
- The generated bundle is **checked into git** so no build step is needed at
  runtime and the same bytes ship to iframe and Artifact.

### Tutor3D helper (`web/src/anim/tutor3d.js`)

Plain script (no import/export), expects global `THREE`, attaches
`globalThis.createScene3D` and `globalThis.Tutor3D`. Reuses the tween math from
`tutorAnim.js` (which is slimmed back to core math only — the 2D scene layer is
deleted).

`createScene3D({span = 6})` creates a 640×400 WebGL renderer mounted to
`#stage` (or body), a perspective camera orbiting distance ~2.2×span,
ambient + directional lights, and returns a scene handle:

- `s.axes()` — RGB axis lines with X/Y/Z labels
- `s.grid()` — floor grid on the XZ plane
- `s.sphere({x, y, z, r, color})` → THREE.Mesh
- `s.box({x, y, z, w, h, d, color})` → THREE.Mesh
- `s.arrow({from: [x,y,z], to: [x,y,z], color})` → THREE.ArrowHelper wrapper
  with a settable `.to` for tweening direction/length
- `s.curve3d(fn, {t0, t1, color})` — fn(t) → [x,y,z]; polyline with `progress`
- `s.surface(fn, {xmin, xmax, zmin, zmax, color})` — y = fn(x, z) mesh
- `s.label(text, {x, y, z, size, color})` — billboard sprite
- `s.tween(target, props, duration, {delay, easing})` — same tween engine;
  `target` is any object with numeric props (`mesh.position`, `mesh.rotation`,
  `mesh.scale`, `material`, curve handle, etc.); props accept `[from, to]` or
  `(t) => value`
- Auto playback controls (play/pause/replay/speed) + drag-to-orbit +
  slow auto-rotate when idle. All raw THREE APIs remain available for
  generated code that needs more.

### Unchanged plumbing

- The ```` ```animation ```` fence, `parseResponse`, `AnimationFrame`
  error-postMessage bridge, and the one-shot `/api/fix` retry all stay.
- `buildAnimationSrcdoc(threeSource, tutor3dSource, userCode)` now takes three
  inline segments (signature change; tests updated).
- System prompt cheat sheet rewritten for the 3D API; the fix prompt shares it.
- `demo.html` becomes a 3D demo page.

### Artifact demo gallery

- `scripts/generate-lessons.mjs` POSTs ~6 curated prompts to the local
  `/api/chat`, parses each response into `{title, prompt, explanationMd,
  animationCode}`, and writes `artifact/lessons.json`. Requires the dev server
  and Claude Code login (runs on the developer machine only).
- `artifact/tutor-demo.html` — self-contained page: topic sidebar, rendered
  explanation, 3D animation viewport. Inlines `three.iife.js`, `tutor3d.js`,
  a tiny markdown renderer, and `lessons.json`. No React, no external
  requests, theme-aware per Artifact guidelines.
- Published via the Artifact tool (private by default). Republishing after
  regenerating lessons keeps the same URL.

**Curated lesson prompts (6):** projectile motion in 3D, planetary orbit,
sine wave as circular motion (helix), pendulum, saddle surface / paraboloid
(functions of two variables), wave interference.

## Error handling

- Local app: unchanged (error bridge → one fix retry → failure note).
- Artifact: lessons are pre-verified at generation time (the generator refuses
  to write a lesson whose code fails a syntax check or forbidden-API scan);
  at runtime a try/catch around each lesson's execution shows a fallback note
  instead of a broken page.

## Testing

- Existing tween-core and parser tests unchanged (2D scene tests for deleted
  APIs are removed with the layer).
- `buildAnimationSrcdoc` tests updated for the three-segment signature.
- Acceptance: the 5 canonical prompts re-run against `/api/chat` with the 3D
  prompt must produce valid animations (syntax + forbidden-API check), plus
  visual verification of demo.html, the app, and the published Artifact.

## Key decisions & rationale

| Decision | Alternatives considered | Why |
|---|---|---|
| Three.js inlined via vendored IIFE bundle | Custom lightweight 3D engine | User chose full 3D fidelity; vendoring satisfies both CSPs and keeps one code path |
| 3D fully replaces 2D | Tutor chooses 2D or 3D per question | User decision; simpler surface, one engine to maintain |
| Artifact = pre-generated gallery | Live-chat artifact | Not possible — no LLM capability in the Artifact runtime |
| Lessons generated through the real pipeline | Hand-written lessons | Exercises the same prompt/parser path the live app uses; keeps demo honest |
