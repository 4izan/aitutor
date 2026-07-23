# Switch Backend LLM from Groq to Claude API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the AI Tutor's backend LLM provider (Groq / `llama-3.3-70b-versatile`) with the Anthropic Claude API (Sonnet tier), to fix unreliable hologram-animation generation, while preserving every existing interface so no client-side or route-handler code needs to change.

**Architecture:** `server/llm.js` is rewritten to call `@anthropic-ai/sdk` instead of `groq-sdk`, but keeps its exact existing exported shape — an async generator yielding `{type:"delta", text}` / `{type:"error", message}` — so `server/index.js`, `server/prompts.js`, and everything under `web/` require zero changes. Config/docs are updated to reference `ANTHROPIC_API_KEY` instead of `GROQ_API_KEY`, and Groq is removed entirely (dependency, env vars, docs).

**Tech Stack:** Node.js/Express backend, `@anthropic-ai/sdk` (replacing `groq-sdk`), Vite/React frontend (unchanged).

## Global Constraints

- `streamCompletion({ systemPrompt, input })` in `server/llm.js` must keep its exact existing signature and yield shape (`{type:"delta", text}` during streaming, `{type:"error", message}` on failure) — this is the sole interface `server/index.js` depends on, and it must not change.
- Model: `claude-sonnet-5`, overridable via `ANTHROPIC_MODEL` env var (same override pattern the old `GROQ_MODEL` used).
- `max_tokens: 4096` is required on every Anthropic API call (the API rejects requests without it).
- Groq is removed entirely — `groq-sdk` out of `package.json`, no `GROQ_API_KEY`/`GROQ_MODEL` left in `.env.example`, `render.yaml`, or `README.md`. No fallback-to-Groq behavior.
- No new automated "does this animation depict real motion" check — validated by manual read-through, per the spec.
- No new cost/spend cap beyond the existing per-IP rate limiter in `server/rateLimit.js` (unchanged).

---

### Task 1: Rewrite `server/llm.js` for Anthropic, update dependencies, config, and docs

**Files:**
- Modify: `server/llm.js` (entire file)
- Modify: `package.json` (dependency swap, via npm commands below — do not hand-edit version strings)
- Modify: `.env.example` (entire file)
- Modify: `render.yaml` (entire file)
- Modify: `README.md` (Requirements, Setup, How it works, Deploy to Render sections)

**Interfaces:**
- Consumes: nothing new from other tasks.
- Produces: `streamCompletion({ systemPrompt, input })` — unchanged async-generator signature and yield shape described in Global Constraints above. Task 2 (live verification) depends on this being correct.

- [ ] **Step 1: Swap the npm dependency**

Run:
```bash
npm uninstall groq-sdk
npm install @anthropic-ai/sdk
```
Expected: `package.json`'s `dependencies` now lists `@anthropic-ai/sdk` and no longer lists `groq-sdk`; `package-lock.json` is updated to match (npm does this automatically — do not hand-edit either file's version strings).

- [ ] **Step 2: Rewrite `server/llm.js`**

Replace the entire file with:

```js
import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
const MAX_TOKENS = 4096;

export async function* streamCompletion({ systemPrompt, input }) {
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const stream = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: "user", content: input }],
      stream: true,
    });
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
        yield { type: "delta", text: event.delta.text };
      }
    }
  } catch (err) {
    yield { type: "error", message: String(err?.message ?? err) };
  }
}
```

This uses the SDK's raw streaming event iteration (`client.messages.create({..., stream: true})` returns an async-iterable `Stream` of `MessageStreamEvent`s) rather than a convenience wrapper, since this is the most stable, documented part of the SDK's public surface. `content_block_delta` events with `delta.type === "text_delta"` carry the plain text chunks — the direct Anthropic equivalent of Groq's `chunk.choices[0]?.delta?.content`, translated into the same `{type:"delta", text}` shape `server/index.js` already expects.

- [ ] **Step 3: Replace `.env.example`**

Replace the entire file with:

```
ANTHROPIC_API_KEY=
# Optional — override the default model if it's renamed or deprecated
# ANTHROPIC_MODEL=claude-sonnet-5
```

- [ ] **Step 4: Replace `render.yaml`**

Replace the entire file with:

```yaml
services:
  - type: web
    name: ai-tutor
    runtime: node
    plan: free
    healthCheckPath: /api/health
    buildCommand: npm install && npm run build
    startCommand: npm start
    envVars:
      - key: ANTHROPIC_API_KEY
        sync: false
```

- [ ] **Step 5: Update `README.md`**

In the `## Requirements` section, change:
```
- A free Groq API key (no credit card required) — see Setup below
```
to:
```
- An Anthropic API key (paid — see https://console.anthropic.com for billing) — see Setup below
```

In the `## Setup` section, change:
```
1. Get a free API key from [Groq Console](https://console.groq.com).
2. Copy `.env.example` to `.env` and paste your key into `GROQ_API_KEY`.
3. `npm install`
```
to:
```
1. Get an API key from [Anthropic Console](https://console.anthropic.com).
2. Copy `.env.example` to `.env` and paste your key into `ANTHROPIC_API_KEY`.
3. `npm install`
```

In the `## How it works` section, change:
```
- `server/` — Express server; `/api/chat` streams tutor responses via Groq
  (`server/llm.js`); `/api/fix` repairs broken animation fragments (one retry,
  covers both a pre-render syntax check and runtime errors).
```
to:
```
- `server/` — Express server; `/api/chat` streams tutor responses via the
  Anthropic Claude API (`server/llm.js`); `/api/fix` repairs broken animation
  fragments (one retry, covers both a pre-render syntax check and runtime
  errors).
```

In the `## Deploy to Render` section, change:
```
3. When prompted, paste your `GROQ_API_KEY` as the environment variable
   value (it's marked `sync: false` in the blueprint, so Render always asks
   rather than expecting it in git).
```
to:
```
3. When prompted, paste your `ANTHROPIC_API_KEY` as the environment variable
   value (it's marked `sync: false` in the blueprint, so Render always asks
   rather than expecting it in git).
```

- [ ] **Step 6: Confirm no other Groq references remain**

Run:
```bash
grep -rn "groq\|Groq\|GROQ" --include="*.js" --include="*.jsx" --include="*.json" --include="*.yaml" --include="*.md" server/ web/src/ package.json render.yaml README.md .env.example
```
Expected: no output (or only unrelated false positives you inspect and confirm are unrelated — there should be none in this codebase).

- [ ] **Step 7: Run the existing test suite as a sanity check**

Run:
```bash
npm test -- --run
```
Expected: `Test Files 4 passed (4)`, `Tests 18 passed (18)` — identical to before this change, since no test in this suite touches `server/llm.js` (it has no prior test coverage — a thin API wrapper whose correctness is validated by the live acceptance script and manual verification in Task 2, not unit tests).

- [ ] **Step 8: Commit**

```bash
git add server/llm.js package.json package-lock.json .env.example render.yaml README.md
git commit -m "feat: switch backend LLM from Groq to Anthropic Claude API"
```

---

### Task 2: Live feasibility validation, acceptance run, and manual verification

**Files:** none modified by this task's guaranteed steps (verification only). If Step 2 reveals the animation-motion problem persists, that is a new finding to report back rather than a pre-scripted fix — do not improvise prompt changes without following `superpowers:systematic-debugging`.

**Interfaces:**
- Consumes: `streamCompletion` from Task 1, used indirectly via `/api/chat` and `npm run check`.
- Produces: nothing new for later tasks — this is the plan's final task.

**This task requires a real `ANTHROPIC_API_KEY`, which was not available when this plan was written.**

- [ ] **Step 1: Check the prerequisite before doing anything else**

Run:
```bash
grep -c "ANTHROPIC_API_KEY=." .env 2>/dev/null || echo "0"
```
If this prints `0` (no non-empty key present), **STOP**. Report this task as BLOCKED — waiting on the user to obtain an Anthropic API key and add it to `.env` — and do not attempt any of the steps below. Do not fabricate or skip verification.

If a key is present, continue.

- [ ] **Step 2: Start the dev server**

Run (from repo root, background this process):
```bash
npm run dev
```
Wait for both `server` and `web` to report ready, then confirm:
```bash
curl -s http://localhost:3001/api/health
```
Expected: `{"ok":true}`

- [ ] **Step 3: Live feasibility check — read full fragments by hand**

Write a one-off script (do not commit it) at `/tmp/probe-claude.mjs`:

```js
const PROMPTS = [
  "Why does a pendulum swing?",
  "Explain what a sine wave is",
  "How does bubble sort work?",
];

async function ask(prompt) {
  const res = await fetch("http://localhost:3001/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: prompt }] }),
  });
  const raw = await res.text();
  let full = "";
  for (const line of raw.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    const data = JSON.parse(line.slice(6));
    if (data.type === "delta") full += data.text;
    if (data.type === "error") throw new Error(data.message);
  }
  return full;
}

for (const p of PROMPTS) {
  const full = await ask(p);
  const start = full.indexOf("<<<ANIMATION>>>");
  const end = full.indexOf("<<<END>>>");
  const html = full.slice(start + "<<<ANIMATION>>>".length, end).trim();
  console.log(`\n=== ${p}`);
  console.log(`hasKeyframes=${/@keyframes/.test(html)} hasInfinite=${/infinite/.test(html)}`);
  console.log(html);
}
```

Run: `node /tmp/probe-claude.mjs`

For each of the 3 prompts, read the FULL printed fragment (not just the boolean flags) and confirm by eye:
1. Structural validity: `preserve-3d` present, `setPointerCapture` present, no `<canvas>`, no Three.js reference, cyan/blue glow colors present.
2. **The concept's own motion is genuinely animating** (e.g. the pendulum's weight+string actually swings via `@keyframes`, the sine wave actually propagates) — not just present as static geometry you can only orbit via drag.

If point 2 fails for any prompt, this is a new finding: stop, do not attempt a fresh prompt tweak inline, and report it — a repeat animation-motion failure after this switch would mean the root cause was NOT what this plan's spec assumed (model capability), and needs fresh `superpowers:systematic-debugging` investigation rather than another guess.

- [ ] **Step 4: Full acceptance run**

Run:
```bash
npm run check
```
Expected: `ALL PASS` for all 8 canonical prompts (same acceptance script used throughout this project — validates delimiter presence, forbidden-API scan, syntax check; it does not check for motion specifically, per the spec's decision not to automate that).

If this fails, apply this project's established diagnostic pattern before assuming a real regression: check `curl -s http://localhost:3001/api/health`, then a single direct `curl` POST to `/api/chat`, to distinguish a transient connection hiccup (rerun once) from a real failure (investigate, do not just retry).

- [ ] **Step 5: Manual browser verification**

Using the running dev app at `http://localhost:5173`:
1. Ask "Why does a pendulum swing?" (the exact concept that failed before this switch).
2. Confirm the explanation streams in.
3. Confirm the animation panel shows the pendulum genuinely swinging on its own, immediately on load, with no drag needed to see motion.
4. Drag the shape — confirm it still orbits/rotates independently of the intrinsic swing.
5. Confirm no console errors.

- [ ] **Step 6: Report results**

Document the full raw output of Steps 3-5 (all 3 fragments' motion-check results, the `npm run check` output, and the manual verification outcome) — this is the evidence that the actual bug this whole plan exists to fix is genuinely resolved, not just that the code compiles.
