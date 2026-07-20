# AI Tutor with Live Animations — Design Spec

**Date:** 2026-07-20
**Status:** Approved

## Summary

A local web app: a ChatGPT-style AI tutor that, alongside each explanation, generates a
small animation illustrating the concept. Focused on math and physics for v1. Powered by
Claude via the Claude Agent SDK using the user's existing Claude Code sign-in — no API key.

## Goals

- Working local prototype: chat with the tutor, see animations render inline.
- Animations are concept visualizations (3Blue1Brown-inspired): graphs being drawn,
  pendulums swinging, algorithms stepping — matched dynamically to the explanation.
- Feels instant: streamed text, animations render in under a second.

## Non-goals (v1)

- No user accounts, database, or persistence — conversation lives in browser memory.
- No deployment; runs on the user's machine only (Agent SDK auth requires local Claude Code login).
- No video rendering (Manim etc.); all animations are live Canvas in the browser.
- Subjects beyond math/physics may work but are not tuned for.

## Architecture

```
Browser (React + Vite)                    Node backend
┌───────────────────────────┐            ┌──────────────────────────┐
│ Chat UI (streamed text)   │◄──SSE──────│ /api/chat                │
│ Animation panel           │            │ Claude Agent SDK          │
│  └ sandboxed iframe        │            │  └ uses Claude Code login │
│     └ helper library       │──errors──► │ /api/fix (retry)          │
└───────────────────────────┘            └──────────────────────────┘
```

- **Frontend:** React + Vite SPA. Conversation column styled like ChatGPT; each assistant
  message may carry an animation rendered inline directly beneath its text.
- **Backend:** Small Node (Express) server. Uses `@anthropic-ai/claude-agent-sdk`, which
  authenticates through the local Claude Code installation. Streams responses to the
  frontend via SSE.
- **State:** Chat history kept client-side; sent with each request for context.

## Response flow

1. User sends a question.
2. Backend calls Claude with a tutor system prompt: explain clearly for a learner, then
   emit a fenced ```animation code block containing a script for the helper library.
3. Text streams to the UI as it arrives; the animation block is detected, stripped from
   the visible text, and executed once complete.
4. The animation runs in a **sandboxed iframe** (no network, no parent DOM access) with
   the helper library preloaded.

## Animation helper library

A single-file Canvas runtime, written once by us, that keeps Claude's generated scripts
short (~30–60 lines) and reliable. API surface:

- `createScene({width, height})` — canvas scene with coordinate transforms
- `axes(...)` / `grid(...)` — coordinate systems
- Shapes: `circle`, `rect`, `line`, `arrow`, `vector`, `polygon`, `curve(fn)`
- `label(text, pos)` — text labels with basic math notation (superscripts, Greek letters)
- `tween(target, props, duration, easing)` and `timeline([...])` — motion
- Every scene gets built-in **play / pause / replay / speed** controls automatically.

## Error handling

- Iframe wraps the generated script in try/catch and listens for runtime errors; errors
  are reported to the parent via `postMessage`.
- On error, the frontend calls `/api/fix` with the broken script + error message; Claude
  repairs it. **One retry maximum.**
- If the retry also fails: show the text explanation with a small "animation failed"
  notice. The chat never breaks.

## Testing

- Unit tests: helper library (tween interpolation, timeline sequencing, coordinate
  transforms) and the response parser (splitting explanation text from animation block,
  including mid-stream detection).
- Manual demo checklist — these five prompts must all produce working animations:
  1. "Explain what a sine wave is"
  2. "Why does a pendulum swing?"
  3. "How does bubble sort work?"
  4. "Show me projectile motion"
  5. "What is a derivative?"

## Key decisions & rationale

| Decision | Alternatives considered | Why |
|---|---|---|
| Claude-written Canvas scripts | Manim video; fixed JSON templates | Fully dynamic + instant; Manim too slow/heavy on Windows; templates too limiting |
| Claude Agent SDK (Claude Code login) | Paid API key; free Gemini tier; Ollama | Zero cost, best quality; acceptable that it's local-only |
| Sandboxed iframe execution | eval in page; server-side rendering | Safety of generated code; keeps page stable on errors |
| Helper library + thin scripts | Raw Canvas API from Claude | Shorter generated code = far fewer bugs |
