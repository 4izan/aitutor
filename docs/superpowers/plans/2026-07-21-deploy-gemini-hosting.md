# Deploy AI Tutor to Public Hosting (Render + Gemini) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Claude Agent SDK (local-login-only) with Google's free-tier Gemini API so the app can run on a public host, then deploy it to Render's free tier as a single server.

**Architecture:** A new `server/llm.js` wraps `@google/genai` behind a small streaming interface so route handlers barely change. `server/index.js` switches both `/api/chat` and `/api/fix` to that wrapper, adds static-file serving of the built frontend for a single-deployment shape, and gains a per-IP rate limiter (`server/rateLimit.js`) to protect the one shared free API key. Render's free tier hosts the result.

**Tech Stack:** `@google/genai` (new), Express (existing), Vite build output, Render free tier, Vitest (existing).

## Global Constraints

- LLM provider is Google Gemini via `@google/genai`, used identically in local dev and production — one code path, no dev/prod drift, no BYOK.
- Model: `gemini-3.5-flash` by default, overridable via `GEMINI_MODEL` env var.
- API key lives in `GEMINI_API_KEY`, read server-side only via `process.env`, never sent to the browser, never committed (`.env` is git-ignored).
- Hosting is Render's free tier: one Node process serves both the built static frontend and the `/api/*` routes; the server must bind to `process.env.PORT` (Render assigns this), falling back to `3001` for local dev.
- Rate limiting is in-memory, per-IP, sliding window, 15 requests / 10 minutes, applied to `POST /api/chat` and `POST /api/fix`. On limit, each route reuses its own existing error response shape — the frontend requires no changes.
- No new test-mocking infrastructure: LLM-dependent code is verified via live smoke tests and the existing `npm run check` acceptance script, matching this codebase's existing testing philosophy (Vitest covers pure, deterministic logic only).
- Out of scope: user accounts, persistent server-side storage, custom domain, BYOK.

---

### Task 1: Gemini API key, env config, and the LLM wrapper

**Files:**
- Create: `.env.example`
- Modify: `.gitignore`
- Modify: `package.json` (add `@google/genai` dependency)
- Create: `server/llm.js`

**Interfaces:**
- Consumes: `@google/genai` (`GoogleGenAI` client), `process.env.GEMINI_API_KEY`, `process.env.GEMINI_MODEL`.
- Produces: `export async function* streamCompletion({ systemPrompt, input })` — an async generator yielding `{ type: "delta", text }` for each streamed chunk and `{ type: "error", message }` on failure (never throws past this boundary; a caller that only reads `for await` sees a clean end after an error event).

- [ ] **Step 1: Get a free Gemini API key**

Go to https://aistudio.google.com/apikey (Google AI Studio), sign in, and click "Create API key". No credit card is required for the free tier. Copy the key somewhere safe — you'll paste it into `.env` in the next step.

- [ ] **Step 2: Create .env.example and .env**

Create `C:\Users\fa050\ai-tutor\.env.example`:

```
GEMINI_API_KEY=
# Optional — override the default model if it's renamed or deprecated
# GEMINI_MODEL=gemini-3.5-flash
```

Then copy it to a real `.env` and fill in the key you just created:

```
Copy-Item .env.example .env
```

Edit `.env` and set `GEMINI_API_KEY=<your key>`.

- [ ] **Step 3: Git-ignore .env**

Add a line to `C:\Users\fa050\ai-tutor\.gitignore`:

```
.env
```

- [ ] **Step 4: Install @google/genai**

Run: `npm install @google/genai`
Expected: exit 0, `package.json` gains it under `dependencies`.

- [ ] **Step 5: Smoke-test the raw Gemini streaming shape**

Before wiring anything into the app, confirm the exact event shape the SDK sends. Create a temporary file `scripts/.smoke-gemini.mjs`:

```js
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const stream = await ai.interactions.create({
  model: process.env.GEMINI_MODEL || "gemini-3.5-flash",
  input: "Say hello in exactly five words.",
  system_instruction: "You are terse.",
  stream: true,
});

for await (const event of stream) {
  console.log(JSON.stringify(event));
}
```

Run: `node --env-file=.env scripts/.smoke-gemini.mjs`
Expected: several JSON lines print, at least one of them shaped like
`{"event_type":"step.delta","delta":{"type":"text","text":"..."}}` (the exact
surrounding fields may vary — what matters is that `event_type` is
`"step.delta"` and `delta.type` is `"text"` with a `delta.text` string).

If the real shape differs from this, note exactly what you see — the
`streamCompletion` implementation in Step 6 must match the real shape, not
the assumed one. Adjust the `event.event_type` / `event.delta.type` checks in
Step 6 accordingly before moving on.

Delete the temporary file when done: `Remove-Item scripts/.smoke-gemini.mjs`

- [ ] **Step 6: Create server/llm.js**

```js
import { GoogleGenAI } from "@google/genai";

const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";

export async function* streamCompletion({ systemPrompt, input }) {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const stream = await ai.interactions.create({
      model: MODEL,
      input,
      system_instruction: systemPrompt,
      stream: true,
    });
    for await (const event of stream) {
      if (event.event_type === "step.delta" && event.delta?.type === "text") {
        yield { type: "delta", text: event.delta.text };
      }
    }
  } catch (err) {
    yield { type: "error", message: String(err?.message ?? err) };
  }
}
```

(If Step 5's smoke test showed a different shape, edit the `if` condition and
`event.delta.text` access to match what you actually observed before
continuing.)

- [ ] **Step 7: Verify streamCompletion end-to-end**

Create a temporary file `scripts/.smoke-llm.mjs`:

```js
import { streamCompletion } from "../server/llm.js";

for await (const event of streamCompletion({
  systemPrompt: "You are terse.",
  input: "Say hello in exactly five words.",
})) {
  console.log(event);
}
```

Run: `node --env-file=.env scripts/.smoke-llm.mjs`
Expected: a sequence of `{ type: 'delta', text: '...' }` objects that
concatenate into a five-word greeting, no `{ type: 'error', ... }` object.

Delete the temporary file: `Remove-Item scripts/.smoke-llm.mjs`

- [ ] **Step 8: Commit**

```
git add .env.example .gitignore package.json package-lock.json server/llm.js
git commit -m "feat: Gemini streaming wrapper (server/llm.js) with verified event shape"
```

---

### Task 2: Wire /api/chat and /api/fix to the Gemini wrapper

**Files:**
- Modify: `server/index.js`

**Interfaces:**
- Consumes: `streamCompletion({ systemPrompt, input })` (Task 1), `buildTranscript(messages)` (existing, unchanged), `TUTOR_SYSTEM_PROMPT` / `FIX_SYSTEM_PROMPT` (existing, unchanged), `extractCodeBlock(text)` (existing, unchanged).
- Produces: `/api/chat` and `/api/fix` behave identically from the frontend's point of view — same SSE event shapes, same JSON response shape — just backed by Gemini instead of the Agent SDK.

- [ ] **Step 1: Replace the import**

In `server/index.js`, replace:

```js
import { query } from "@anthropic-ai/claude-agent-sdk";
```

with:

```js
import { streamCompletion } from "./llm.js";
```

- [ ] **Step 2: Rewrite the /api/chat handler**

Replace the existing `app.post("/api/chat", ...)` handler body with:

```js
app.post("/api/chat", async (req, res) => {
  const { messages } = req.body ?? {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages array required" });
  }
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.flushHeaders();
  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
  let hadError = false;
  for await (const event of streamCompletion({
    systemPrompt: TUTOR_SYSTEM_PROMPT,
    input: buildTranscript(messages),
  })) {
    send(event);
    if (event.type === "error") hadError = true;
  }
  if (!hadError) send({ type: "done" });
  res.end();
});
```

- [ ] **Step 3: Rewrite the /api/fix handler**

Replace the existing `app.post("/api/fix", ...)` handler body with:

```js
app.post("/api/fix", async (req, res) => {
  const { code, error } = req.body ?? {};
  if (!code || !error) {
    return res.status(400).json({ error: "code and error required" });
  }
  let text = "";
  let failure = null;
  for await (const event of streamCompletion({
    systemPrompt: FIX_SYSTEM_PROMPT,
    input: `This animation script failed.\n\nScript:\n\`\`\`\n${code}\n\`\`\`\n\nRuntime error:\n${error}\n\nReturn the corrected script.`,
  })) {
    if (event.type === "delta") text += event.text;
    else if (event.type === "error") failure = event.message;
  }
  if (failure) {
    console.error(failure);
    return res.status(500).json({ code: null, error: failure });
  }
  res.json({ code: extractCodeBlock(text) });
});
```

`extractCodeBlock` and the rest of the file (health check, `buildTranscript`,
`PORT`/`app.listen`) stay as they are for now — `PORT` is addressed in Task 3.

- [ ] **Step 4: Manual verification — /api/chat**

With `.env` set up from Task 1, run: `node --env-file=.env --watch server/index.js`
in one terminal. In another:

```
curl.exe -s -N -X POST http://localhost:3001/api/chat -H "Content-Type: application/json" -d "{\"messages\":[{\"role\":\"user\",\"content\":\"Explain what a sine wave is\"}]}"
```

Expected: a stream of `data: {"type":"delta",...}` lines forming an
explanation and a ```` ```animation ```` block, ending with
`data: {"type":"done"}` — same shape as before, now via Gemini.

- [ ] **Step 5: Manual verification — /api/fix**

```
curl.exe -s -X POST http://localhost:3001/api/fix -H "Content-Type: application/json" -d "{\"code\":\"const s = createScene3D(); s.spher({x:0,y:0,z:0});\",\"error\":\"TypeError: s.spher is not a function\"}"
```

Expected: JSON `{"code": "..."}` where the corrected code calls `s.sphere(...)`.

- [ ] **Step 6: Run the acceptance script against Gemini**

Stop the manual server from Step 4 (or leave it running — `npm run dev`
starts its own instance on the same port and will conflict; use one or the
other). With the server running and `.env` loaded:

```
node --env-file=.env scripts/check-prompts.mjs
```

Expected: `ALL PASS` for all five canonical prompts, same acceptance bar as
the Claude-backed version.

- [ ] **Step 7: Commit**

```
git add server/index.js
git commit -m "feat: switch /api/chat and /api/fix to the Gemini wrapper"
```

---

### Task 3: Single-server production build (static frontend + PORT handling)

**Files:**
- Modify: `server/index.js`
- Modify: `package.json` (add `build` and `start` scripts; update `dev:server`)

**Interfaces:**
- Consumes: Vite's default build output directory (`dist/`, unchanged from `vite.config.js`).
- Produces: `npm run build` (builds the frontend), `npm start` (production entry point — no `--watch`, no `--env-file`), `npm run dev:server` now loads `.env` for local development.

- [ ] **Step 1: Add static serving and SPA fallback to server/index.js**

At the top of `server/index.js`, add:

```js
import path from "path";
import { fileURLToPath } from "url";
```

Near the bottom of the file, **before** `const PORT = ...` / `app.listen(...)`,
add (after the `/api/fix` route, so API routes are registered first):

```js
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, "..", "dist");

app.use(express.static(distDir));
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(distDir, "index.html"));
});
```

- [ ] **Step 2: Make the port configurable**

Replace:

```js
const PORT = 3001;
```

with:

```js
const PORT = process.env.PORT || 3001;
```

- [ ] **Step 3: Add build/start scripts and load .env in dev**

In `package.json`, under `"scripts"`:

- Change `"dev:server"` from `"node --watch server/index.js"` to
  `"node --watch --env-file=.env server/index.js"`.
- Add `"build": "vite build"`.
- Add `"start": "node server/index.js"` (no `--watch`, no `--env-file` —
  production environments like Render inject real env vars directly).

- [ ] **Step 4: Verify the production build serves correctly**

Run:

```
npm run build
```

Expected: a `dist/` directory appears containing `index.html` and an `assets/` folder.

Then load `.env` into the current shell and start the production server:

```powershell
Get-Content .env | ForEach-Object { if ($_ -match '^([^=]+)=(.*)$') { [System.Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process') } }
npm start
```

Expected: `AI Tutor server listening on http://localhost:3001` (or whatever
`PORT` resolves to). Open `http://localhost:3001` in the browser pane —
the built chat UI loads (no Vite dev server involved this time), and a
`POST /api/chat` request in it streams a real response.

Stop the server (Ctrl+C) when done.

- [ ] **Step 5: Commit**

```
git add server/index.js package.json
git commit -m "feat: single-server production build (static frontend + configurable PORT)"
```

---

### Task 4: Rate limiting

**Files:**
- Create: `server/rateLimit.js`
- Test: `server/rateLimit.test.js`
- Modify: `server/index.js`

**Interfaces:**
- Consumes: nothing external.
- Produces:
  - `export function createLimiter({ windowMs, max })` → `{ check(key, now) }`, where `check` returns `true` if the request at time `now` is allowed for `key` (and records it), `false` if `key` is already at `max` hits within the trailing `windowMs`.
  - `export function rateLimitMiddleware(limiter, onLimited)` → an Express middleware `(req, res, next)`. Calls `limiter.check(req.ip, Date.now())`; if `false`, calls `onLimited(res)` and stops (no `next()`); if `true`, calls `next()`.

- [ ] **Step 1: Write the failing tests**

`server/rateLimit.test.js`:

```js
import { describe, it, expect } from "vitest";
import { createLimiter } from "./rateLimit.js";

describe("createLimiter", () => {
  it("allows requests under the limit", () => {
    const limiter = createLimiter({ windowMs: 10_000, max: 3 });
    expect(limiter.check("a", 0)).toBe(true);
    expect(limiter.check("a", 1)).toBe(true);
    expect(limiter.check("a", 2)).toBe(true);
  });

  it("blocks requests over the limit within the window", () => {
    const limiter = createLimiter({ windowMs: 10_000, max: 3 });
    limiter.check("a", 0);
    limiter.check("a", 1);
    limiter.check("a", 2);
    expect(limiter.check("a", 3)).toBe(false);
  });

  it("resets once the window has elapsed", () => {
    const limiter = createLimiter({ windowMs: 10_000, max: 2 });
    limiter.check("a", 0);
    limiter.check("a", 1);
    expect(limiter.check("a", 2)).toBe(false);
    expect(limiter.check("a", 10_001)).toBe(true);
  });

  it("tracks separate keys independently", () => {
    const limiter = createLimiter({ windowMs: 10_000, max: 1 });
    expect(limiter.check("a", 0)).toBe(true);
    expect(limiter.check("b", 0)).toBe(true);
    expect(limiter.check("a", 1)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/rateLimit.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement server/rateLimit.js**

```js
export function createLimiter({ windowMs, max }) {
  const hits = new Map(); // key -> timestamps within the trailing window

  function check(key, now) {
    const cutoff = now - windowMs;
    const recent = (hits.get(key) ?? []).filter((t) => t > cutoff);
    if (recent.length >= max) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now);
    hits.set(key, recent);
    return true;
  }

  return { check };
}

export function rateLimitMiddleware(limiter, onLimited) {
  return (req, res, next) => {
    if (!limiter.check(req.ip, Date.now())) {
      onLimited(res);
      return;
    }
    next();
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run server/rateLimit.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Wire the limiter into both routes**

In `server/index.js`, add the import:

```js
import { createLimiter, rateLimitMiddleware } from "./rateLimit.js";
```

Near the top (after `app.use(express.json(...))`), create two limiter
instances — one per route, so traffic on one doesn't consume the other's
budget:

```js
const TEN_MINUTES = 10 * 60 * 1000;
const chatLimiter = createLimiter({ windowMs: TEN_MINUTES, max: 15 });
const fixLimiter = createLimiter({ windowMs: TEN_MINUTES, max: 15 });
```

Change the `/api/chat` route registration from
`app.post("/api/chat", async (req, res) => {` to insert the middleware:

```js
app.post(
  "/api/chat",
  rateLimitMiddleware(chatLimiter, (res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.write(
      `data: ${JSON.stringify({
        type: "error",
        message: "You're sending messages too quickly — please wait a few minutes and try again.",
      })}\n\n`
    );
    res.end();
  }),
  async (req, res) => {
    // ...existing handler body, unchanged...
  }
);
```

Change the `/api/fix` route registration similarly:

```js
app.post(
  "/api/fix",
  rateLimitMiddleware(fixLimiter, (res) => {
    res.status(429).json({ code: null });
  }),
  async (req, res) => {
    // ...existing handler body, unchanged...
  }
);
```

- [ ] **Step 6: Manual verification**

With the server running (`.env` loaded, per Task 2 Step 4), send 16 rapid
requests:

```powershell
1..16 | ForEach-Object {
  curl.exe -s -X POST http://localhost:3001/api/fix -H "Content-Type: application/json" -d "{\"code\":\"x\",\"error\":\"y\"}"
  Write-Host ""
}
```

Expected: the first 15 responses are normal `/api/fix` results (real Gemini
calls — `{"code": ...}` or a Gemini-side error), and the 16th is
`{"code":null}` with HTTP status 429.

- [ ] **Step 7: Run the full test suite**

Run: `npm test`
Expected: PASS — all prior tests plus the 4 new rate limiter tests (20 total).

- [ ] **Step 8: Commit**

```
git add server/rateLimit.js server/rateLimit.test.js server/index.js
git commit -m "feat: per-IP rate limiting on /api/chat and /api/fix"
```

---

### Task 5: Deployment config, cleanup, and docs

**Files:**
- Create: `render.yaml`
- Modify: `package.json` (remove `@anthropic-ai/claude-agent-sdk`)
- Modify: `README.md`

**Interfaces:**
- Consumes: nothing new.
- Produces: a ready-to-deploy Render blueprint; an accurate README.

- [ ] **Step 1: Create render.yaml**

```yaml
services:
  - type: web
    name: ai-tutor
    env: node
    buildCommand: npm install && npm run build
    startCommand: npm start
    envVars:
      - key: GEMINI_API_KEY
        sync: false
```

- [ ] **Step 2: Remove the now-unused Claude Agent SDK dependency**

Run: `npm uninstall @anthropic-ai/claude-agent-sdk`
Expected: exit 0; `package.json`'s `dependencies` no longer lists it.

- [ ] **Step 3: Update README.md**

Replace the `## Requirements` section:

```markdown
## Requirements

- Node 20.6+ (for `--env-file` support used in local dev)
- A free Google Gemini API key (no credit card required) — see Setup below
```

Replace the `## Run` section with a `## Setup` + `## Run` pair:

```markdown
## Setup

1. Get a free API key from [Google AI Studio](https://aistudio.google.com/apikey).
2. Copy `.env.example` to `.env` and paste your key into `GEMINI_API_KEY`.
3. `npm install`

## Run

    npm run dev

Open http://localhost:5173 and ask something like "Why does a pendulum swing?".
```

Add a new section after `## Tests`:

```markdown
## Deploy to Render

1. Push this repo to GitHub.
2. In the [Render dashboard](https://dashboard.render.com), choose
   "New > Blueprint" and point it at the repo — it reads `render.yaml`
   automatically.
3. When prompted, paste your `GEMINI_API_KEY` as the environment variable
   value (it's marked `sync: false` in the blueprint, so Render always asks
   rather than expecting it in git).
4. Deploy. The free tier spins down after 15 minutes of inactivity — the
   first request after a quiet period takes about a minute to wake the
   server back up; after that it behaves normally.
```

- [ ] **Step 4: Final verification**

Run: `npm test`
Expected: PASS (20 tests).

Run (with `.env` loaded):

```
node --env-file=.env scripts/check-prompts.mjs
```

Expected: `ALL PASS`.

- [ ] **Step 5: Commit**

```
git add render.yaml package.json package-lock.json README.md
git commit -m "feat: Render deployment config, drop unused Agent SDK dependency, update docs"
```
