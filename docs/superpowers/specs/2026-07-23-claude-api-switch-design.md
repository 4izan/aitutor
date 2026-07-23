# Switch Backend LLM from Groq to Claude API — Design

## Summary

Replace the AI Tutor's backend LLM provider — Groq (`llama-3.3-70b-versatile`) — with the Anthropic Claude API (Sonnet tier), to fix unreliable hologram-animation generation. Live testing after the hologram-animations feature shipped found that the Groq model consistently produced static, camera-orbitable diagrams instead of actually animating the concept's own motion (e.g. "why does a pendulum swing?" rendered a motionless weight-on-a-string you could only rotate the camera around, with no swinging). Root-cause investigation (via `superpowers:systematic-debugging`) found the system prompt was structurally sound but the model wasn't reliably following a newly-added `## MOTION` instruction requiring continuous CSS `@keyframes` animation — a classic weaker-model instruction-following gap, not a prompt-wording defect. This is the same class of concern flagged (but not fully load-bearing) during this feature's original design: the reference file this hologram architecture is modeled on was written for and validated against Claude Sonnet, not a 70B open-weight model.

## Decisions from discussion

- **Full replacement, not a second call.** Claude generates the entire response (concept + explanation + animation) in the same single streamed call as today — not a two-provider split where Groq handles text and Claude handles just the animation. Simplest, preserves the existing streaming UX (explanation streams live while animation "cooks"), and fixes the root cause everywhere at once rather than only in one section.
- **Model tier: Claude Sonnet** (`claude-sonnet-5`). Balanced cost/quality; the same tier the original reference file used and was validated against. Haiku carries real risk of the same instruction-following gap being replaced; Opus is overkill for a meticulous-instruction-following task that isn't hard reasoning.
- **Groq removed entirely**, not kept as a fallback. `groq-sdk` dropped from `package.json`, `server/llm.js` rewritten to only know about Anthropic, `GROQ_API_KEY`/`GROQ_MODEL` removed from `.env`/`.env.example`/`render.yaml`/README. Matches this project's established pattern (Tutor3D was fully deleted, not left dead, when replaced earlier this session).
- **The already-drafted `## MOTION` rule stays.** A rule requiring continuous `@keyframes … infinite` motion for inherently-dynamic concepts was added to `server/prompts.js`'s `ANIMATION_RULES` during the debugging session that led to this switch (uncommitted at the time this spec was written). It is kept as part of this change — this switch is what actually tests whether it works, since Sonnet should follow nuanced instructions far more reliably than the 70B Groq model did.
- **No new cost cap beyond the existing rate limiter.** Claude Sonnet is meaningfully more expensive per token than Groq's free tier. The existing app-level rate limiter (15 requests / 10 minutes / IP, in `server/rateLimit.js`) is provider-agnostic and continues to apply unchanged; no new spend cap is being added in this change.
- **Feasibility validation deferred.** The user does not have an Anthropic API key yet. Design and implementation plan are written now; live feasibility testing (and the implementation task that actually calls the real API) waits until a key is available. This is a real, acknowledged gap versus this project's usual practice of validating the prompt against the real backend before finalizing — flagged explicitly rather than skipped silently.

## Architecture

`server/llm.js` is rewritten to use `@anthropic-ai/sdk` in place of `groq-sdk`, but keeps its exact existing exported interface:

```js
export async function* streamCompletion({ systemPrompt, input }) { ... }
```

This remains an async generator yielding `{ type: "delta", text }` events during streaming and a single `{ type: "error", message }` event on failure — identical to today's contract. Because `server/index.js` (both `/api/chat` and `/api/fix`), `server/prompts.js`, and everything under `web/` only ever interact with this function's yielded event shape, **none of them require any code change**. This switch is fully contained to `server/llm.js` plus configuration and documentation.

Internals:
- Construct `new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })`.
- Call `client.messages.stream({ model, max_tokens: 4096, system: systemPrompt, messages: [{ role: "user", content: input }] })`.
- Iterate the stream's text deltas (the SDK's `MessageStream` exposes a `.textStream` async iterable of plain text chunks), yielding `{ type: "delta", text }` for each chunk — a direct translation of Groq's `chunk.choices[0]?.delta?.content` into Anthropic's equivalent.
- Wrap the whole call in try/catch; on any thrown error (network failure, auth failure, rate limit, Anthropic's typed `APIError` subclasses), yield `{ type: "error", message: String(err?.message ?? err) }` — matching today's Groq error handling exactly.
- Model comes from `process.env.ANTHROPIC_MODEL || "claude-sonnet-5"` — same override pattern the old `GROQ_MODEL` used, for future model changes without a code edit.

`max_tokens: 4096` is required (Anthropic's API rejects requests without it, unlike Groq/OpenAI-style APIs where it's optional) and is generous headroom above the prompt's existing budget rules (≤250-word explanation, 40-90 line animation, 3-6 word concept title) — not expected to be hit in normal operation, just a safety ceiling.

## Config / secrets

- New required env var: `ANTHROPIC_API_KEY`.
- `.env.example`: replace `GROQ_API_KEY=` / `# GROQ_MODEL=...` with `ANTHROPIC_API_KEY=` / `# ANTHROPIC_MODEL=claude-sonnet-5`.
- `render.yaml`: replace the `GROQ_API_KEY` (`sync: false`) entry with `ANTHROPIC_API_KEY` (`sync: false`) — deploying this change requires the user to paste their key into the Render dashboard manually, same as the original Groq setup required.
- `README.md` Setup section: replace the Groq Console link/instructions with the Anthropic Console equivalent (`https://console.anthropic.com`).

## Files touched

**Rewritten:**
- `server/llm.js` — Groq client → Anthropic client, same exported interface.
- `.env.example`, `render.yaml`, `README.md` — env var and doc updates described above.
- `package.json` — remove `groq-sdk`, add `@anthropic-ai/sdk`.

**Untouched:**
- `server/index.js`, `server/prompts.js` (aside from the already-applied `## MOTION` rule, which predates and is independent of this switch), `server/rateLimit.js`.
- Everything under `web/` — no client-side change, since the SSE event shape the frontend consumes is unchanged.
- `scripts/check-prompts.mjs` — stays structurally the same (delimiter presence, forbidden-API scan, syntax check). No new automated "does this depict real motion" heuristic is being added; that's inherently subjective per-concept and better served by the manual read-through this project has used throughout.

## Testing

- Existing unit tests (`web/src/lib/*.test.js`) are unaffected — none of them touch `server/llm.js`.
- No new unit tests are needed for `server/llm.js` itself; it has no pre-existing test coverage (Groq's version wasn't unit-tested either — it's a thin API wrapper, and its correctness is validated via the live acceptance script and manual verification, same pattern continuing here).
- **Live feasibility check (deferred until an API key is available):** 2-3 real prompts against the actual Anthropic API, including "why does a pendulum swing?" specifically — the exact concept that failed under Groq — reading the full generated fragment by hand to confirm both structural validity (as before: `preserve-3d`, `setPointerCapture`, no canvas/three) AND, critically, that the concept's own motion now genuinely animates via `@keyframes` rather than only being camera-orbitable.
- **Full acceptance run (deferred until an API key is available):** `npm run check` against all 8 canonical prompts, same as every prior change to the prompt/backend this session.
- **Manual browser verification (deferred until an API key is available):** ask a real question in the running app, confirm the response streams and the animation panel shows genuine, unprompted motion on load — not just structural presence of the required mechanics.

## Non-goals

- No change to the sandboxed-iframe rendering pipeline, error-recovery (`/api/fix`) flow, or any client-side component — this is purely a backend-provider swap.
- No new cost/spend cap beyond the existing per-IP rate limiter.
- No automated content-quality check for "does this animation depict real motion" — validated manually, as established practice.
- No fallback-to-Groq behavior if Anthropic is unavailable — Groq is fully removed per the user's explicit choice.
