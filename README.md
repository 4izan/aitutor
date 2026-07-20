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
  playback controls). `demo.html` shows it standalone at
  http://localhost:5173/demo.html.
- Each response may contain a fenced ```animation block; it is stripped from the
  visible text and executed in a sandboxed iframe with TutorAnim preloaded.

## Tests

    npm test
