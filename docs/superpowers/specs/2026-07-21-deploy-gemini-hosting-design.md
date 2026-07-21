# Deploy AI Tutor to Public Hosting (Render + Groq) — Design Spec

**Date:** 2026-07-21
**Status:** Approved
**Builds on:** `2026-07-20-ai-tutor-animations-design.md`, `2026-07-20-3d-animations-artifact-design.md`

> **Amendment (2026-07-21):** This spec originally targeted Google's Gemini
> API as the free-tier LLM provider. Before implementation began, the user
> confirmed Google AI Studio's free tier is not available in their country.
> The provider was switched to **Groq** (confirmed accessible by the user),
> which is also free with no credit card. Everything else in this spec —
> architecture, hosting, rate limiting, non-goals — is unchanged; only the
> provider-specific details below (SDK, model, env var names) were updated.

## Summary

Make the AI tutor app runnable on a public hosting site so anyone can access it
via a URL, at zero cost to the developer. This requires replacing the LLM
backend — the current `@anthropic-ai/claude-agent-sdk` authenticates via the
developer's local Claude Code login, which does not work on a server with no
interactive session. The app switches to Groq's API (free tier, no credit
card) as the single LLM provider everywhere — local development and
production both use it, so there is one code path and no dev/prod drift.

## Decisions from discussion

- **Billing model:** the user does not want to pay per request. A free-tier
  LLM provider replaces Claude, rather than the user paying for API usage or
  requiring visitors to bring their own key.
- **Provider:** Groq, via the `groq-sdk` Node package. Verified via Groq's
  current docs (fetched 2026-07-21): package `groq-sdk`, client
  `new Groq({ apiKey })`, streaming via
  `client.chat.completions.create({ model, messages, stream: true })` with
  chunks read as `chunk.choices[0]?.delta?.content`. Default model
  `llama-3.3-70b-versatile` (free tier: 30 requests/minute, 1,000
  requests/day, confirmed no credit card required). Google's Gemini was the
  original choice but is not available in the user's country; Groq was
  confirmed directly accessible by the user before committing to it.
- **Dev/prod parity:** one provider everywhere, not "Claude locally, Groq
  when deployed." One code path to test and tune; what's tested locally is
  what ships.
- **Hosting platform:** Render free tier. Verified via Render's docs (fetched
  2026-07-21): free, no credit card, 750 free instance-hours/month, runs as a
  real persistent container (not a serverless function) so ongoing SSE
  responses complete normally once the server is awake. The only real
  tradeoff is a cold start: the service sleeps after 15 minutes of no
  inbound traffic, and the next request waits roughly a minute for it to wake.
  Alternatives considered: Vercel/Netlify (would require restructuring the
  single Express app into per-route serverless/edge functions — bigger
  refactor for no benefit at this scale); Fly.io (now requires a credit card
  even for its free allowance).

## Architecture

### LLM layer (`server/llm.js`, new)

A thin wrapper isolating the Groq SDK from the route handlers, so
`/api/chat` and `/api/fix` keep their existing shape (build a transcript,
stream deltas as SSE, handle done/error). Exposes:

```
async function* streamCompletion({ systemPrompt, input }) {
  // yields { type: "delta", text } for each streamed chunk
  // yields { type: "error", message } on failure (does not throw past this boundary)
}
```

Configuration:
- `GROQ_API_KEY` (required) — server-side secret, read via `process.env`.
- `GROQ_MODEL` (optional, default `"llama-3.3-70b-versatile"`) — lets the
  model be swapped via config if Groq renames or deprecates the default
  without a code change.

`server/prompts.js` is unchanged in content (still the Tutor3D API
cheat-sheet + rules) — it's provider-agnostic instruction text, passed as
the `system` role message in the `messages` array Groq's chat-completions
API expects.

### Single deployable server

- `vite build` (via a new `npm run build` script) produces static assets in
  `dist/`.
- `server/index.js` adds `express.static("dist")` plus a fallback that serves
  `dist/index.html` for any non-`/api` GET request (single-page app, no
  client-side router today, but this keeps direct URL loads working).
- A new `npm start` script (`node server/index.js`, no `--watch`) is the
  production entry point; `npm run dev` (existing) is unchanged for local
  development.
- This keeps frontend and backend as one origin, one deployment, no CORS
  configuration needed.

### Rate limiting (`server/rateLimit.js`, new)

One shared Groq key now serves every visitor, so a lightweight per-IP
limiter protects the free quota from being exhausted by one heavy user or
bot:

- In-memory sliding window keyed by request IP: 15 requests per 10-minute
  window (tunable constant, not user-configurable at runtime).
- Applied as Express middleware on `POST /api/chat` and `POST /api/fix`.
- On exceeding the limit, the middleware reuses each route's *existing*
  error-shape so the frontend requires no changes:
  - `/api/chat` (SSE): send `data: {"type":"error","message":"You're sending
    messages too quickly — please wait a few minutes and try again."}` then
    end the stream, same as any other mid-stream error today.
  - `/api/fix` (JSON): respond `429` with `{"code": null}`, which
    `AnimationFrame` already renders as "⚠ Animation failed to render."
- Not persisted across restarts/redeploys (acceptable — Render's free tier
  filesystem is ephemeral anyway, and the limiter's job is abuse mitigation,
  not precise accounting).
- This is deliberately looser than Groq's own global free-tier cap (30
  requests/minute across all visitors combined). A single active user alone
  can approach that ceiling; if it's hit, Groq's API returns an error that
  `streamCompletion` already surfaces through the normal error path — a
  friendly in-chat message, not a crash. No additional global-quota-tracking
  logic is added for this prototype-scale app.

### Config & deployment files

- `.env.example` — documents `GROQ_API_KEY=`, `GROQ_MODEL=` (commented,
  optional), `PORT=` (commented, optional — Render injects its own).
- `.gitignore` — add `.env`.
- `render.yaml` (Render "Blueprint") — `type: web`, `env: node`, build
  command `npm install && npm run build`, start command `npm start`,
  `envVars: [{ key: GROQ_API_KEY, sync: false }]` (marks it as a secret
  filled in via the Render dashboard, never committed).
- `package.json` — remove `@anthropic-ai/claude-agent-sdk` (fully replaced,
  not kept as a fallback path); add `groq-sdk`.

## Error handling

- Groq call failures (bad key, quota exceeded, model error, network) are
  caught inside `streamCompletion` and surfaced through the same
  `{type:"error", message}` SSE path the app already has — no new failure
  mode for the frontend to handle.
- Cold start on Render is a latency characteristic, not an error condition —
  no special handling needed; the first request after idle just takes longer
  to respond, which the existing "busy" state in the chat UI already covers.

## Testing

- `scripts/check-prompts.mjs` (the five canonical prompts) becomes the
  acceptance gate against the new provider — same bar, new backend. Must
  pass before this work is considered done.
- `server/rateLimit.js` gets unit tests: pure, deterministic logic (window
  math, per-key isolation) — no network or timers-as-wall-clock involved.
- Manual verification: local end-to-end chat with a real Groq key; after
  deployment, a smoke test against the live Render URL from a real browser —
  health check, one live chat exchange, animation renders, and (if
  reasonably triggerable) one rate-limited response.

## Non-goals

- No user accounts or authentication for visitors — conversations stay
  anonymous and ephemeral, matching the existing prototype scope.
- No persistent database or server-side conversation/log storage.
- No custom domain — Render's default `*.onrender.com` URL is the deliverable.
- No bring-your-own-key flow — explicitly rejected in favor of a shared
  free-tier key.
- The published Claude Artifact gallery is untouched by this work — it is
  already a separate, fully static page.

## Key decisions & rationale

| Decision | Alternatives considered | Why |
|---|---|---|
| Groq free tier, single shared key | Gemini (unavailable in user's country), Claude API (paid), BYOK, free local-only via tunnel | User explicitly ruled out paying per-request and BYOK; Gemini's free tier isn't accessible in their country; Groq was confirmed directly accessible before committing |
| Groq everywhere (dev + prod) | Claude locally / Groq in prod | Avoids two code paths and prompt-behavior drift between providers; what's tested locally is what ships |
| Render free tier | Vercel/Netlify, Fly.io | Matches the existing single-Express-app shape with minimal restructuring; genuinely free with no credit card, unlike Fly.io's current free tier |
| In-memory per-IP rate limit | No rate limit; a database-backed limiter; global-quota tracking | A shared free quota needs basic abuse protection; in-memory is sufficient given the app has no other persistent state; provider-side rate-limit errors already degrade gracefully through the existing error path |
