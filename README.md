# AI Tutor

A local ChatGPT-style tutor for any academic subject that generates a live,
interactive 3D animation beneath each explanation.

## Requirements

- Node 20.6+ (for `--env-file` support used in local dev)
- An Anthropic API key (paid — see https://console.anthropic.com for billing) — see Setup below

## Setup

1. Get an API key from [Anthropic Console](https://console.anthropic.com).
2. Copy `.env.example` to `.env` and paste your key into `ANTHROPIC_API_KEY`.
3. `npm install`

## Run

    npm run dev

Open http://localhost:5173 and ask something like "Why does a pendulum swing?".

## How it works

- `server/` — Express server; `/api/chat` streams tutor responses via the
  Anthropic Claude API (`server/llm.js`); `/api/fix` repairs broken animation
  fragments (one retry, covers both a pre-render syntax check and runtime
  errors).
- Each response follows a `<<<CONCEPT>>>`/`<<<EXPLANATION>>>`/`<<<ANIMATION>>>`/`<<<END>>>`
  format (`web/src/lib/parseResponse.js`). The `<<<ANIMATION>>>` section is a
  self-contained Three.js scene — a glowing wireframe "hologram" you can orbit
  by dragging — executed in a sandboxed iframe
  (`web/src/components/AnimationFrame.jsx`, `web/src/lib/buildAnimationSrcdoc.js`).
- That iframe has an opaque origin and a `default-src 'none'` CSP, so it cannot
  fetch anything at all. Three.js is therefore inlined into each frame from the
  vendored bundle at `web/src/vendor/three.iife.js`, and the generated scenes
  cannot use textures, fonts, or any `three/examples` addon (no `OrbitControls`,
  no `TextGeometry`) — camera orbit is hand-rolled and labels are HTML overlays.
- `npm run check` — acceptance script: sends a set of canonical prompts to
  `/api/chat` and validates each generated animation fragment (present, valid
  syntax, no forbidden APIs). Run this after any prompt or rendering change.

## Tests

    npm test

## Deploy to Render

1. Push this repo to GitHub.
2. In the [Render dashboard](https://dashboard.render.com), choose
   "New > Blueprint" and point it at the repo — it reads `render.yaml`
   automatically.
3. When prompted, paste your `ANTHROPIC_API_KEY` as the environment variable
   value (it's marked `sync: false` in the blueprint, so Render always asks
   rather than expecting it in git).
4. Deploy. The free tier spins down after 15 minutes of inactivity — the
   first request after a quiet period takes about a minute to wake the
   server back up; after that it behaves normally.
