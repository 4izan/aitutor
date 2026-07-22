# Subject-Scope Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generalize AI Tutor from math/physics-only to any academic subject, while keeping the "every answer ships with one 3D animation" guarantee intact by teaching the model to invent spatial metaphors for non-spatial subjects.

**Architecture:** Three small, independently-testable changes: (1) the system prompt in `server/prompts.js` drops the math/physics restriction and gains a rule about inventing spatial metaphors, (2) hardcoded math/physics UI copy in `web/src/App.jsx` becomes generic/varied, (3) the README and the live acceptance script (`scripts/check-prompts.mjs`) are updated to reflect and verify the new scope.

**Tech Stack:** No new dependencies. Plain JS template strings (prompts), React (App.jsx), Node acceptance script (unchanged tooling).

## Global Constraints

- The model must still produce exactly one 3D animation per substantive answer (existing rule 2 in `TUTOR_SYSTEM_PROMPT`) — this plan does not weaken that guarantee for any subject.
- The animation is skipped only for genuinely non-visualizable questions (small talk) — this exemption is unchanged, not broadened.
- Subject framing in the system prompt is generic ("any academic subject"), not an enumerated list.
- No new Vitest coverage — verification is via the extended `scripts/check-prompts.mjs` (live acceptance script) plus manual browser checks, matching the spec's testing section.
- No new npm dependencies.
- `ANIM_API_DOCS` and `FIX_SYSTEM_PROMPT` in `server/prompts.js` are untouched by this plan — animation engine capability is a separate, later sub-project.

---

### Task 1: Generalize the system prompt

**Files:**
- Modify: `server/prompts.js:44-55`

**Interfaces:**
- Consumes: nothing new.
- Produces: `TUTOR_SYSTEM_PROMPT` (same export name and type — a string — consumed unchanged by `server/index.js:50`). No signature change, only content change.

- [ ] **Step 1: Replace `TUTOR_SYSTEM_PROMPT` in `server/prompts.js`**

Replace the existing `export const TUTOR_SYSTEM_PROMPT = ...` block (lines 44-55) with:

```js
export const TUTOR_SYSTEM_PROMPT = `You are a friendly, clear tutor for any academic subject.

Rules for every answer:
1. Explain the concept clearly for a learner, using short paragraphs and (where helpful) simple markdown. Keep the explanation under ~250 words.
2. Then output EXACTLY ONE interactive 3D animation illustrating the core idea, as a fenced code block tagged "animation":
\`\`\`animation
// JavaScript using the Tutor3D API below
\`\`\`
3. The animation code must be under 60 lines, create exactly one scene with createScene3D, and use only the documented API, the THREE global, and plain JavaScript (Math, loops, functions). Never use import/export, fetch, DOM APIs (document/window), setTimeout, or requestAnimationFrame — the library handles all timing via s.tween.
4. Animate over 3–8 seconds. Label the key elements. Make deliberate use of the third dimension — depth, height, orbits, surfaces — not just a flat drawing in 3D space.
5. Not every subject has an obvious spatial structure — invent one rather than skipping the animation. A history question can become a timeline laid out along one axis; a story's plot structure can become a rising and falling 3D arc; relationships between words, characters, or ideas can become a 3D network graph; a comparison can become bars or points positioned along an axis. Always find a spatial metaphor for the core idea.
6. If (and only if) the question is not about a concept that can be visualized (e.g. small talk), omit the animation block.
${ANIM_API_DOCS}`;
```

The only content changes from the current version: the opening sentence ("math and physics" → "any academic subject"), a new rule 5 (spatial-metaphor guidance), and the old rule 5 renumbered to 6 — its wording is otherwise byte-identical to the current text, per the spec's "unchanged" instruction for this exemption. `ANIM_API_DOCS` interpolation and `FIX_SYSTEM_PROMPT` below it are unchanged.

- [ ] **Step 2: Run the existing test suite**

Run: `npm test`
Expected: `Test Files 4 passed (4)`, `Tests 20 passed (20)` — unchanged from before this edit, since no test asserts on `TUTOR_SYSTEM_PROMPT`'s content. This step exists to catch any accidental syntax error introduced while editing the template string (an unescaped backtick or `${}` would break the module load).

- [ ] **Step 3: Commit**

```bash
git add server/prompts.js
git commit -m "feat: expand tutor system prompt to all academic subjects"
```

---

### Task 2: Generalize UI copy and empty-state examples

**Files:**
- Modify: `web/src/App.jsx:1-98`

**Interfaces:**
- Consumes: nothing from Task 1 (this task is independent — it only changes hardcoded strings and adds a module-level constant array plus one `useState`).
- Produces: nothing consumed by later tasks or files.

- [ ] **Step 1: Add the example-questions pool and update imports**

At the top of `web/src/App.jsx`, change:

```jsx
import { useRef, useState } from "react";
import AssistantMessage from "./components/AssistantMessage.jsx";
```

to:

```jsx
import { useRef, useState } from "react";
import AssistantMessage from "./components/AssistantMessage.jsx";

const EXAMPLE_QUESTIONS = [
  "Why does a pendulum swing?",
  "What caused the fall of the Berlin Wall?",
  "How does supply and demand set prices?",
  "What makes a sonnet different from free verse?",
  "How do plants convert sunlight into energy?",
];
```

(`useRef, useState` import line itself is unchanged — `EXAMPLE_QUESTIONS` is just inserted below it, at module scope, outside the component.)

- [ ] **Step 2: Pick one example per mount inside the component**

Inside `export default function App() {`, change:

```jsx
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef(null);
```

to:

```jsx
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [exampleQuestion] = useState(
    () => EXAMPLE_QUESTIONS[Math.floor(Math.random() * EXAMPLE_QUESTIONS.length)]
  );
  const listRef = useRef(null);
```

The lazy-initializer form (`useState(() => ...)`) picks the random example exactly once per mount — it will not change while the user types or as other state updates trigger re-renders.

- [ ] **Step 3: Update the topbar subtitle**

Change:

```jsx
      <header className="topbar">AI Tutor <span className="sub">math &amp; physics, animated</span></header>
```

to:

```jsx
      <header className="topbar">AI Tutor <span className="sub">every subject, animated</span></header>
```

- [ ] **Step 4: Update the empty-state hint to use the picked example**

Change:

```jsx
        {messages.length === 0 && (
          <div className="empty">
            Ask me anything — try <em>“Why does a pendulum swing?”</em>
          </div>
        )}
```

to:

```jsx
        {messages.length === 0 && (
          <div className="empty">
            Ask me anything — try <em>“{exampleQuestion}”</em>
          </div>
        )}
```

- [ ] **Step 5: Update the composer placeholder**

Change:

```jsx
          placeholder="Ask a math or physics question…"
```

to:

```jsx
          placeholder="Ask about any subject…"
```

- [ ] **Step 6: Verify in a browser**

With the dev server running (`npm run dev`, or reuse an already-running instance):
- Reload the page 4-5 times; confirm the empty-state example text changes across reloads and is always one of the 5 strings in `EXAMPLE_QUESTIONS`.
- Confirm the topbar reads "AI Tutor every subject, animated".
- Confirm the composer placeholder reads "Ask about any subject…".
- Type a few characters into the composer; confirm the empty-state example text does NOT change while typing (still showing the same example picked on mount).

- [ ] **Step 7: Run the existing test suite**

Run: `npm test`
Expected: `Test Files 4 passed (4)`, `Tests 20 passed (20)` — this task touches no logic under test, only JSX/copy.

- [ ] **Step 8: Commit**

```bash
git add web/src/App.jsx
git commit -m "feat: generalize UI copy and empty-state examples to all subjects"
```

---

### Task 3: Update README and extend the acceptance script

**Files:**
- Modify: `README.md:3-4`
- Modify: `scripts/check-prompts.mjs:4-10`

**Interfaces:**
- Consumes: `TUTOR_SYSTEM_PROMPT` from Task 1 (indirectly — the acceptance script calls the live `/api/chat` endpoint, which uses the updated prompt from the running dev server).
- Produces: nothing consumed by later tasks — this is the last task in the sub-project.

- [ ] **Step 1: Update the README description**

Change:

```markdown
A local ChatGPT-style tutor for math and physics that generates a live,
interactive 3D animation beneath each explanation.
```

to:

```markdown
A local ChatGPT-style tutor for any academic subject that generates a live,
interactive 3D animation beneath each explanation.
```

- [ ] **Step 2: Add non-STEM prompts to the acceptance script**

In `scripts/check-prompts.mjs`, change the `PROMPTS` array:

```js
const PROMPTS = [
  "Explain what a sine wave is",
  "Why does a pendulum swing?",
  "How does bubble sort work?",
  "Show me projectile motion",
  "What is a derivative?",
];
```

to:

```js
const PROMPTS = [
  "Explain what a sine wave is",
  "Why does a pendulum swing?",
  "How does bubble sort work?",
  "Show me projectile motion",
  "What is a derivative?",
  "What caused the fall of the Berlin Wall?",
  "How does supply and demand set prices?",
  "What makes a sonnet different from free verse?",
];
```

No other change to the script — the existing validation logic (animation block present, no forbidden APIs, valid syntax) applies identically to the new prompts.

- [ ] **Step 3: Run the acceptance script against a live dev server**

Ensure the dev server is running (`npm run dev`, needs `GROQ_API_KEY` set in `.env`), then run:

Run: `npm run check`
Expected: `ALL PASS` — all 8 prompts (5 original + 3 new) produce a `PASS` line showing an animation block was present, syntactically valid, and free of forbidden APIs. If any of the 3 new prompts fails, read its failure reason (no animation block vs. forbidden API vs. syntax error) — a failure here means Task 1's rule 5 wording needs to be strengthened, since the point of this step is to prove the "always animate, get creative" instruction actually works live, not just read correctly in the prompt text.

- [ ] **Step 4: Manual final verification in the browser**

With the dev server running:
1. Reload the app fresh — confirm the topbar, placeholder, and empty-state example all reflect the all-subjects copy from Task 2.
2. Ask a STEM question (e.g. "Why does a pendulum swing?") — confirm it still explains and animates exactly as before this plan.
3. Ask a non-STEM question (e.g. "What caused the fall of the Berlin Wall?") — confirm the response explains the concept and renders a 3D animation (not a text-only answer), demonstrating the spatial-metaphor rule from Task 1 in the actual product, not just the acceptance script.

- [ ] **Step 5: Commit**

```bash
git add README.md scripts/check-prompts.mjs
git commit -m "docs: update README and acceptance script for all-subjects scope"
```
