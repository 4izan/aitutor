# AI Tutor

A local ChatGPT-style tutor for math and physics that generates a live,
interactive 3D animation beneath each explanation.

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
- `web/src/anim/tutorAnim.js` — tween/math core shared by the 3D runtime.
  `web/src/anim/tutor3d.js` — the Tutor3D runtime built on Three.js (shapes,
  surfaces, camera orbit, playback controls). `demo.html` shows it standalone
  at http://localhost:5173/demo.html.
- `web/src/vendor/three.iife.js` — Three.js + OrbitControls vendored into a
  single self-contained script (both the sandboxed iframe and the Artifact
  page require inline JS with no external requests). Regenerate with
  `npm run build:three` after upgrading the `three` package.
- Each response may contain a fenced ```animation block; it is stripped from the
  visible text and executed in a sandboxed iframe with Three.js + Tutor3D
  preloaded.
- `npm run check` — acceptance script: sends five canonical prompts to
  `/api/chat` and validates each generated animation (present, valid syntax,
  no forbidden APIs). Run this after any prompt or engine change.

## Claude Artifact demo

A shareable, publicly-linkable gallery of six pre-generated 3D lessons
(projectile motion, planetary orbits, sine-as-circular-motion, pendulums,
3D surfaces, wave interference) — useful because Artifacts can't call Claude
live, so this bakes a fixed set of lessons into one self-contained page.

    npm run dev              # dev server must be running
    npm run build:lessons    # regenerate artifact/lessons.json via the real pipeline
    npm run build:artifact   # assemble artifact/tutor-demo.html

Then publish `artifact/tutor-demo.html` via the Artifact tool. Republishing
the same file path updates the same URL.

## Tests

    npm test
