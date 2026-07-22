# Animation Interactivity — Design Spec

**Date:** 2026-07-22
**Status:** Approved

## Summary

The Tutor3D engine (`web/src/anim/tutor3d.js`, `web/src/anim/tutorAnim.js`)
already lets a viewer orbit the camera and control playback (play/pause/
replay/speed), but the animation content itself is a fixed, pre-baked tween
timeline — nothing the viewer does changes what the scene shows or how it
behaves. This is the second of three sub-projects generalizing AI Tutor
(after subject-scope expansion, before frontend redesign). It adds two new
capabilities to every animation the model can generate: **live parameter
controls** (sliders that retune the running animation without restarting
it) and **click/hover object interaction** (tooltips on scene objects),
making animations feel like small, explorable simulations rather than
pre-recorded clips.

## Decisions from discussion

- **Scope:** both live parameters and object interaction — not just one.
- **Parameter response:** live-patch without restart. Changing a slider
  flows the new value into the running animation on the next frame; the
  animation does not reset to t=0 or rebuild geometry. This works because
  the existing render loop already re-evaluates function-form tween value
  specs every frame rather than baking them once — a closure that reads a
  live parameter value picks up changes for free. The trade-off, accepted
  explicitly: parameters can only drive properties already being tweened
  (position, rotation, scale, material color/opacity, curve progress), not
  one-time construction values like a sphere's radius or an array's length.
- **Click/hover freedom:** built-in behavior only — a fixed hover-highlight
  and tooltip-with-click-to-pin behavior, no arbitrary `onClick` callback.
  The model only ever supplies a label string; nothing executable is
  attached to a click, keeping the new surface area easy for the model to
  use correctly and inherently safe.
- **Mandatory or optional:** encouraged, not mandated. The system prompt
  instructs the model to add a live parameter and/or an interactive label
  when the concept naturally has one, but does not require every animation
  to include either — avoiding forced sliders/tooltips on concepts where
  none would be meaningful.

## Architecture

### Live parameters (`s.params`)

A new scene method, used like the existing helpers:

```js
const p = s.params({
  length: { label: "Pendulum length", min: 0.5, max: 3, step: 0.1, default: 1.5 },
});
s.tween(bob.position, { y: (t) => -p.length * Math.cos(t * freq) }, 4);
```

`s.params()` returns a plain mutable object (one key per declared
parameter, each initialized to its `default`). No reactivity plumbing is
needed: `tutorAnim.js`'s `applyTweens` already calls a function-form value
spec fresh on every render frame (not once, upfront), so a tween closure
that reads `p.length` observes slider changes on the very next frame with
zero rebuild cost.

The frontend renders one labeled range `<input type="range">` per declared
parameter in a new row added to the existing controls bar (below play/
pause/replay/speed), using the same inline dark-theme styling already used
there. Moving a slider sets `p[key]` directly via the input's `oninput`
handler — no event system beyond that is needed.

### Click/hover interaction (`s.interactive`)

```js
const bob = s.sphere({ r: 0.3, color: "#38bdf8" });
s.interactive(bob, { label: "Bob: the pendulum's swinging mass" });
```

A single `THREE.Raycaster` is created once per scene (not per interactive
object) and attached to `pointermove`/`pointerdown`/`pointerup` listeners
on the renderer's canvas. On `pointermove`, the raycaster tests against all
registered interactive meshes; the nearest hit gets an emissive highlight
(a saved/restored `emissive` color swap on its material) and a floating
tooltip — a plain DOM `<div>` (not a Three.js sprite) positioned each frame
via the mesh's screen-projected coordinates (`Vector3.project(camera)` →
CSS `left`/`top`), showing the supplied `label` text. Clicking a hit object
toggles a "pinned" flag so the tooltip stays visible without continued
hovering (click again, or click empty space, to unpin).

**Click vs. camera-drag disambiguation:** `OrbitControls` already owns
drag-to-orbit on the same canvas. To avoid every orbit drag firing as a
"click" on whatever was under the cursor at `pointerdown`, a click is only
recognized if the cursor moved less than a small pixel threshold between
`pointerdown` and `pointerup`. This threshold check is implemented as a
pure function (`isClick(downXY, upXY, thresholdPx)`) in `tutorAnim.js`,
alongside the existing `lerp`/`easings` pure-math helpers — it's the one
piece of genuinely new *testable* logic this sub-project introduces.

### Prompt & constraint changes (`server/prompts.js`)

- `ANIM_API_DOCS` gains entries for `s.params()` and `s.interactive()`,
  matching the existing documentation style (signature, description, one
  example) already used for `sphere`/`box`/`arrow`/etc.
- A new rule is added near the existing "make deliberate use of the third
  dimension" rule, encouraging — not requiring — at least one live
  parameter and one interactive label when the concept naturally supports
  them.
- The animation code line cap (currently 60 lines, from rule 3) is raised
  to 80 lines, to give room for parameter/interactivity declarations
  without forcing the model to cram or omit the explanation-relevant parts
  of a scene. This is an explicit change to an existing numeric constraint
  from the subject-scope-expansion sub-project.
- Prompt guidance suggests practical limits — roughly up to 4 parameters
  and 6 interactive objects per scene — to keep the controls bar and scene
  legible. These are prompt-level suggestions, not hard sandbox-enforced
  limits (the existing `FORBIDDEN` regex / syntax checks in
  `scripts/check-prompts.mjs` don't count declarations; nothing in this
  sub-project adds a hard runtime cap either).

### Files touched

- `web/src/anim/tutor3d.js` — add `s.params()`, `s.interactive()`, the
  shared raycaster/pointer-event wiring, the DOM tooltip element, and the
  new params row in the controls bar.
- `web/src/anim/tutorAnim.js` — add the pure `isClick(downXY, upXY,
  thresholdPx)` helper alongside `lerp`/`easings`, exported via the
  existing `globalThis.TutorAnim` object.
- `web/src/anim/tutorAnim.test.js` — new test cases for `isClick`.
- `server/prompts.js` — `ANIM_API_DOCS` additions, the new encouragement
  rule, and the 60→80 line-cap change.

`web/src/lib/buildAnimationSrcdoc.js` and
`web/src/components/AnimationFrame.jsx` are untouched — they embed
`tutor3d.js`/`tutorAnim.js` verbatim into the sandboxed iframe already, and
nothing about that embedding mechanism changes (no new external resources;
the DOM tooltip and sliders are created via plain inline JS, consistent
with the iframe's existing `style-src 'unsafe-inline'` CSP).

## Testing

`isClick` gets direct Vitest coverage in `tutorAnim.test.js` (pure
function, easy to test: same-point counts as a click, a point past the
threshold doesn't). Everything else this sub-project adds — raycasting,
slider rendering, DOM tooltip positioning, the highlight material swap —
is DOM/WebGL-integration behavior verified live in a browser (drag a
slider and observe the animation retune without restarting; hover/click an
interactive object and observe the tooltip), matching this project's
existing testing philosophy of unit-testing pure logic and manually
verifying visual/animation behavior. The live acceptance script
(`scripts/check-prompts.mjs`) continues to validate that generated
animation code is syntactically valid and free of forbidden APIs; it is
not extended with new prompts by this sub-project (no scope changed that
would need new acceptance prompts — the existing 8 remain sufficient to
prove the API surface change didn't break code generation).

## Non-goals

- No arbitrary `onClick` callback — interaction behavior is fixed
  (highlight + tooltip + pin), not scriptable by the generated code.
- No support for parameters that rebuild geometry or change object counts
  (e.g., an array-size slider for a sorting visualization) — parameters
  are scoped to properties already driven by tweens.
- No hard runtime-enforced cap on parameter/interactive-object counts —
  the ~4/~6 figures are prompt guidance, not code that rejects excess
  declarations.
- No changes to `web/src/lib/buildAnimationSrcdoc.js`,
  `web/src/components/AnimationFrame.jsx`, or the sandboxed iframe's CSP.
- No changes to subject scope (already handled by sub-project 1) or to the
  chat shell's visual identity (that's sub-project 3).
- No new npm dependencies — everything uses the already-vendored
  `three.iife.js` (which already includes `THREE.Raycaster`).
