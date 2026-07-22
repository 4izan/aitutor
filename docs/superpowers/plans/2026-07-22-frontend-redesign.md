# Frontend Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the chat shell into a two-column "Glassmorphic Layered" layout — chat on the left, a pinned 3D-viewport panel on the right that always shows the latest animation — with frosted-glass card styling, replacing today's single-column stack with inline per-message animations.

**Architecture:** A new `PinnedViewport` component and a `.layout`/`.chat-col`/`.viewport-col` CSS grid are introduced; `App.jsx` computes the latest assistant message's animation state (reusing the existing `parseResponse`) and feeds it to the panel; `AssistantMessage.jsx` is simplified to drop its own `AnimationFrame` rendering, since only the panel ever shows an animation now.

**Tech Stack:** React (existing), CSS only (`backdrop-filter`, flexbox) — no new npm dependencies.

## Global Constraints

- The pinned viewport always shows only the *latest* animation; once superseded, older messages become text-only — nothing else ever renders an animation (per spec's panel-only decision).
- Below a 900px viewport width, the panel reflows above the chat column instead of beside it.
- The existing violet/pink/blue ambient gradient (`--accent-1/2/3` in `web/src/App.css`) is unchanged — this redesign is layout and card treatment only.
- Glass card fills use a dark, cool-toned translucent color (not a light/white glass fill) to preserve text contrast against light message text, consistent with the app's dark-mode-only identity.
- No changes to `web/src/anim/` (Tutor3D engine), `server/prompts.js`, or `web/src/components/AnimationFrame.jsx`'s internals.
- No new npm dependencies. No new Vitest coverage — this is pure CSS/JSX layout work, verified manually in a browser, matching the project's existing testing philosophy.

---

### Task 1: `PinnedViewport` component + `App.jsx` layout wiring

**Files:**
- Create: `web/src/components/PinnedViewport.jsx`
- Modify: `web/src/App.jsx` (entire file — the changes are scattered across imports, component body, and JSX)

**Interfaces:**
- Consumes: `parseResponse(content)` (existing, unchanged — `web/src/lib/parseResponse.js`), `AnimationFrame` (existing, unchanged — `web/src/components/AnimationFrame.jsx`).
- Produces: `<PinnedViewport animationCode={string|null} pending={boolean} />` — a component with three render states (idle/building/ready). `App.jsx` computing and passing these two exact prop names is what Task 3's CSS work and any future consumer rely on.

- [ ] **Step 1: Create `web/src/components/PinnedViewport.jsx`**

```jsx
import AnimationFrame from "./AnimationFrame.jsx";

export default function PinnedViewport({ animationCode, pending }) {
  if (pending) {
    return <div className="pinned-viewport">Building animation…</div>;
  }
  if (animationCode) {
    return (
      <div className="pinned-viewport ready">
        <AnimationFrame code={animationCode} />
      </div>
    );
  }
  return <div className="pinned-viewport">Ask a question to see it animated here.</div>;
}
```

- [ ] **Step 2: Replace `web/src/App.jsx` in full**

```jsx
import { useRef, useState } from "react";
import AssistantMessage from "./components/AssistantMessage.jsx";
import PinnedViewport from "./components/PinnedViewport.jsx";
import { parseResponse } from "./lib/parseResponse.js";

const EXAMPLE_QUESTIONS = [
  "Why does a pendulum swing?",
  "What caused the fall of the Berlin Wall?",
  "How does supply and demand set prices?",
  "What makes a sonnet different from free verse?",
  "How do plants convert sunlight into energy?",
];

export default function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [exampleQuestion] = useState(
    () => EXAMPLE_QUESTIONS[Math.floor(Math.random() * EXAMPLE_QUESTIONS.length)]
  );
  const listRef = useRef(null);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setBusy(true);
    const history = [...messages, { role: "user", content: text }];
    setMessages([...history, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantText = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop(); // keep incomplete tail
        for (const ev of events) {
          const line = ev.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const data = JSON.parse(line.slice(6));
          if (data.type === "delta") {
            assistantText += data.text;
            setMessages([...history, { role: "assistant", content: assistantText }]);
          } else if (data.type === "error") {
            assistantText += `\n\n> ⚠ ${data.message}`;
            setMessages([...history, { role: "assistant", content: assistantText }]);
          }
        }
        listRef.current?.scrollTo(0, listRef.current.scrollHeight);
      }
    } catch (err) {
      setMessages([...history, { role: "assistant", content: `> ⚠ Request failed: ${err.message}` }]);
    } finally {
      setBusy(false);
    }
  }

  const lastMessage = messages[messages.length - 1];
  const lastParsed =
    lastMessage?.role === "assistant"
      ? parseResponse(lastMessage.content)
      : { animationCode: null, pending: false };
  const viewportCode = !busy && lastParsed.animationCode ? lastParsed.animationCode : null;
  const viewportPending = lastParsed.pending;

  return (
    <div className="app">
      <div className={`ambient${busy ? " ambient-active" : ""}`} aria-hidden="true">
        <div className="ambient-mesh"></div>
      </div>
      <header className="topbar">AI Tutor <span className="sub">every subject, animated</span></header>
      <div className="layout">
        <div className="chat-col">
          <main className="chat" ref={listRef}>
            {messages.length === 0 && (
              <div className="empty">
                Ask me anything — try <em>“{exampleQuestion}”</em>
              </div>
            )}
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="msg user">{m.content}</div>
              ) : (
                <AssistantMessage
                  key={i}
                  content={m.content}
                  streaming={busy && i === messages.length - 1}
                />
              )
            )}
          </main>
          <footer className="composer">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Ask about any subject…"
              rows={1}
            />
            <button onClick={send} disabled={busy || !input.trim()}>
              {busy ? "…" : "Send"}
            </button>
          </footer>
        </div>
        <div className="viewport-col">
          <PinnedViewport animationCode={viewportCode} pending={viewportPending} />
        </div>
      </div>
    </div>
  );
}
```

The only logic change from the current file: two new lines computing `lastParsed`/`viewportCode`/`viewportPending` from the last message (reusing `parseResponse`, imported from the existing `web/src/lib/parseResponse.js` — no changes to that file), and the JSX restructure wrapping `.chat`+`.composer` in a new `.chat-col`, sibling to a new `.viewport-col` rendering `<PinnedViewport>`, both inside a new `.layout` wrapper. `send()`, the `EXAMPLE_QUESTIONS` pool, and all existing state are untouched.

- [ ] **Step 3: Run the existing test suite (regression check)**

Run: `npm test`
Expected: `Test Files 4 passed (4)`, `Tests 25 passed (25)` — unchanged, since no test covers `App.jsx` or the new component directly (this is presentational/layout work per the Global Constraints).

- [ ] **Step 4: Verify in a browser**

With the dev server running (`npm run dev`), load the app and confirm:
- Before sending any message: the right-hand panel area shows "Ask a question to see it animated here." (the CSS for `.viewport-col`/`.pinned-viewport` doesn't exist yet — this step is just confirming the JSX/logic is wired correctly, unstyled layout is expected until Task 3).
- Ask a question (e.g. "Why does a pendulum swing?"). While the response streams, the panel shows "Building animation…" once the model starts the `` ```animation `` fence, then switches to a live 3D animation once the response finishes.
- Note: at this point in the plan, `AssistantMessage.jsx` still ALSO renders its own inline `AnimationFrame` for the same message (Task 2 removes that) — seeing the animation appear in both places is expected and correct for this step, not a bug.

- [ ] **Step 5: Commit**

```bash
git add web/src/App.jsx web/src/components/PinnedViewport.jsx
git commit -m "feat: add pinned viewport panel showing the latest animation"
```

---

### Task 2: Simplify `AssistantMessage.jsx`

**Files:**
- Modify: `web/src/components/AssistantMessage.jsx` (entire file)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed by a later task — `AssistantMessage` no longer touches `animationCode` or `AnimationFrame` at all after this task.

- [ ] **Step 1: Replace `web/src/components/AssistantMessage.jsx` in full**

```jsx
import { marked } from "marked";
import { parseResponse } from "../lib/parseResponse.js";

export default function AssistantMessage({ content, streaming }) {
  const { visibleText, pending } = parseResponse(content);
  return (
    <div className="msg assistant">
      <div
        className="msg-text"
        dangerouslySetInnerHTML={{ __html: marked.parse(visibleText || "") }}
      />
      {streaming && !visibleText && !pending && (
        <div className="think" role="status" aria-label="Thinking">
          <span></span>
          <span></span>
          <span></span>
        </div>
      )}
    </div>
  );
}
```

Removed from the current file: the `AnimationFrame` import, the `animationCode` destructure (only `visibleText`/`pending` are still needed — `pending` still gates the thinking-dot indicator, exactly as before), the `{pending && <div className="anim-note">Building animation…</div>}` line (that note now lives in `PinnedViewport`, from Task 1), and the `{animationCode && !streaming && <AnimationFrame code={animationCode} />}` line (animations only render in the pinned panel now). The thinking-dot indicator's condition (`streaming && !visibleText && !pending`) is byte-identical to before.

- [ ] **Step 2: Run the existing test suite (regression check)**

Run: `npm test`
Expected: `Tests 25 passed (25)`.

- [ ] **Step 3: Verify in a browser**

With the dev server running, ask a question. Confirm the animation now appears **only** in the right-hand panel (from Task 1), not inline inside the assistant's message bubble — this closes the temporary duplication noted in Task 1's Step 4. Confirm the thinking-dot indicator still appears while the explanation text is streaming in, exactly as before.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/AssistantMessage.jsx
git commit -m "refactor: remove inline animation rendering from AssistantMessage"
```

---

### Task 3: Layout CSS, glass styling, and full end-to-end verification

**Files:**
- Modify: `web/src/App.css`

**Interfaces:**
- Consumes: the `.layout`/`.chat-col`/`.viewport-col`/`.pinned-viewport` class names introduced in Task 1's JSX, and `.pinned-viewport.ready` (set when `PinnedViewport` renders the `AnimationFrame` state).
- Produces: nothing consumed by a later task — this is the final task in the plan.

- [ ] **Step 1: Replace the `.app`, `.topbar`, and `.chat` rules, and add the new layout rules**

In `web/src/App.css`, replace:

```css
.app { display: flex; flex-direction: column; height: 100vh; position: relative; z-index: 1; }
.topbar {
  padding: 14px 20px;
  font-weight: 600;
  border-bottom: 1px solid #1e293b;
}
.topbar .sub { font-weight: 400; color: #64748b; font-size: 0.85em; margin-left: 8px; }
.chat {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 860px;
  width: 100%;
  margin: 0 auto;
  background: rgba(10, 10, 20, 0.55);
  backdrop-filter: blur(6px);
}
```

with:

```css
.app { display: flex; flex-direction: column; height: 100vh; position: relative; z-index: 1; }
.topbar {
  padding: 14px 20px;
  font-weight: 600;
  border-bottom: 1px solid #1e293b;
}
.topbar .sub { font-weight: 400; color: #64748b; font-size: 0.85em; margin-left: 8px; }
.layout {
  flex: 1;
  display: flex;
  min-height: 0;
}
.chat-col {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.chat {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 860px;
  width: 100%;
  margin: 0 auto;
}
.viewport-col {
  width: 380px;
  flex-shrink: 0;
  padding: 20px 20px 20px 0;
  display: flex;
  align-items: flex-start;
}
.pinned-viewport {
  width: 100%;
  border-radius: 14px;
  background: rgba(15, 15, 30, 0.45);
  backdrop-filter: blur(14px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  padding: 16px;
  min-height: 220px;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: #94a3b8;
}
.pinned-viewport.ready { display: block; text-align: left; padding: 12px; }
@media (max-width: 900px) {
  .layout { flex-direction: column; }
  .viewport-col { width: 100%; flex-shrink: 0; padding: 20px 20px 0; order: -1; }
}
```

The `.chat` container drops its own `background`/`backdrop-filter` (removed here) — glass treatment moves onto individual `.msg` cards in Step 2, per the spec's per-card glassmorphism decision, rather than one blurred wrapper around the whole chat column. `max-width: 860px; margin: 0 auto;` stays on `.chat` for readability within its column.

- [ ] **Step 2: Apply glass treatment to message bubbles**

Replace:

```css
.msg {
  border-radius: 12px;
  padding: 10px 16px;
  line-height: 1.55;
  animation: msg-rise 0.45s ease backwards;
  transition: transform 0.15s ease;
}
.msg:hover { transform: translateY(-1px); }
.msg.user {
  background: linear-gradient(135deg, var(--accent-1), var(--accent-2));
  align-self: flex-end;
  max-width: 75%;
  white-space: pre-wrap;
}
.msg.assistant { background: #16213b; align-self: stretch; animation-delay: 0.12s; }
```

with:

```css
.msg {
  border-radius: 12px;
  padding: 10px 16px;
  line-height: 1.55;
  animation: msg-rise 0.45s ease backwards;
  transition: transform 0.15s ease;
  backdrop-filter: blur(14px);
  border: 1px solid rgba(255, 255, 255, 0.1);
}
.msg:hover { transform: translateY(-1px); }
.msg.user {
  background: linear-gradient(135deg, rgba(124, 58, 237, 0.55), rgba(219, 39, 119, 0.55));
  align-self: flex-end;
  max-width: 75%;
  white-space: pre-wrap;
}
.msg.assistant { background: rgba(15, 15, 30, 0.45); align-self: stretch; animation-delay: 0.12s; }
```

Only the `background` values change (from opaque to translucent `rgba`) and `backdrop-filter`/`border` are added to the shared `.msg` rule — `border-radius`, `padding`, `line-height`, the entrance animation, the hover transition, and `.msg:hover` itself are all byte-identical to before (this task does not touch or re-litigate the `animation-fill-mode`/`:hover` cascade behavior already fixed in an earlier phase).

- [ ] **Step 3: Apply glass treatment to the composer's text input**

Replace:

```css
.composer textarea {
  flex: 1;
  resize: none;
  background: #16213b;
  color: #e2e8f0;
  border: 1px solid #334155;
  border-radius: 10px;
  padding: 12px 14px;
  font: inherit;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
```

with:

```css
.composer textarea {
  flex: 1;
  resize: none;
  background: rgba(15, 15, 30, 0.45);
  backdrop-filter: blur(14px);
  color: #e2e8f0;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  padding: 12px 14px;
  font: inherit;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
```

Only `background` (opaque `#16213b` → translucent `rgba`) and the new `backdrop-filter`/`border` change — the focus-glow rule (`.composer textarea:focus`) and everything about `.composer button` (its gradient, hover glow, press-scale, pulsing ring) are untouched by this task; the button is a solid accent CTA, not part of the glass treatment.

- [ ] **Step 4: Run the existing test suite (regression check)**

Run: `npm test`
Expected: `Tests 25 passed (25)` — this task is CSS-only.

- [ ] **Step 5: Full manual verification pass (closes out the whole plan)**

With the dev server running, walk through the whole redesign end to end:
1. Load the app fresh at a desktop width (≥900px). Confirm the two-column layout: chat on the left (max-width 860px, centered in its column), the pinned viewport panel on the right showing the idle placeholder text, both over the unchanged violet/pink/blue ambient background.
2. Resize the browser below 900px width (or use responsive/device emulation). Confirm the panel moves above the chat column instead of beside it, and the chat remains usable (composer reachable, message list scrollable).
3. Ask a question (e.g. "Why does a pendulum swing?"). Confirm: the panel shows "Building animation…" while the fence is open, then the live 3D animation once the response completes — and that the animation appears **only** in the panel, nowhere inline in the chat.
4. Check message bubble readability: confirm text in both user and assistant bubbles is clearly legible against the blurred, translucent glass background (no washed-out or low-contrast text).
5. Ask a second question. Confirm the panel now shows the *second* animation, and scrolling up to the first assistant message shows only its text — no animation, per the panel-only history decision.
6. Toggle `prefers-reduced-motion: reduce` (via browser DevTools) and reload. Confirm the ambient field, message entrances, thinking dots, and send-button ring are still static/absent exactly as before (this task doesn't touch any of those rules) — this is a regression check, not new behavior.
7. Run `npm test` one final time: expect all 25 tests to still pass (this plan added no new tests, per the Global Constraints).

- [ ] **Step 6: Commit**

```bash
git add web/src/App.css
git commit -m "feat: two-column glassmorphic layout with pinned viewport panel"
```
