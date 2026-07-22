# Frontend Revamp ("Energetic Physics") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the chat shell's flat, static dark-slate UI with a reactive "Energetic Physics" identity — an animated plasma-gradient background that responds to app state, choreographed message entrances, a live thinking indicator, and consistent micro-interactions.

**Architecture:** Pure CSS animations plus the existing `busy` React state already in `App.jsx` — no new dependencies, no new state variables. A fixed-position ambient background layer sits behind the whole app (`web/src/App.css` + `web/src/App.jsx`); message bubbles and the thinking indicator get CSS entrance/loop animations (`App.css` + `web/src/components/AssistantMessage.jsx`); the composer and message bubbles gain hover/focus/press micro-interactions (`App.css`).

**Tech Stack:** CSS animations/custom properties (existing stack — no new libraries).

## Global Constraints

- Scope covers all four levers from the spec: ambient background motion, message/response choreography, richer visual identity, and micro-interactions — not a subset.
- Mood is "Energetic Physics": a conic-gradient mesh cycling through `--accent-1: #7c3aed` (violet), `--accent-3: #2563eb` (blue), `--accent-2: #db2777` (pink). Not the rejected alternatives (starfield, grid-and-curve, light-mode paper).
- Intensity is "Contained energy": the ambient field stays dim/blurred and mostly at the edges; the message list (`.chat`) sits on a translucent dark backdrop so paragraph text stays readable. Full-bleed intensity behind message text was explicitly rejected.
- Reactivity: the ambient background must visibly change (faster rotation, brighter glow) while `busy === true` (a response is streaming) and settle back down when `busy` becomes `false`. This is driven by the existing `busy` state in `App.jsx` — no new state.
- Scope boundary: `web/src/components/AnimationFrame.jsx` and everything rendered inside its sandboxed iframe (the Tutor3D engine) are **not** touched.
- All decorative animations (ambient spin/pulse, message entrance, thinking-dot bounce, send-button ping) must be neutralized under `@media (prefers-reduced-motion: reduce)`.
- No new npm dependencies. No light-mode support.
- No new Vitest coverage — this is visual/CSS work with no new pure-logic modules, consistent with this project's existing testing philosophy. Verification is manual: run the dev server and check the result in a real browser.

---

### Task 1: Design tokens + reactive ambient background

**Files:**
- Modify: `web/src/App.css`
- Modify: `web/src/App.jsx`

**Interfaces:**
- Consumes: the existing `busy` boolean state in `App.jsx` (already used to disable the send button and gate the streaming indicator — no new state introduced).
- Produces: CSS custom properties `--accent-1`, `--accent-2`, `--accent-3` (used by Tasks 2 and 3 for the message gradient, thinking dots, and button styling) and the `.ambient` / `.ambient-mesh` / `.ambient-active` class names (not consumed elsewhere, but must not collide with names Tasks 2–3 introduce).

- [ ] **Step 1: Add color tokens and the ambient layer's CSS to web/src/App.css**

Add this block immediately after the existing `* { box-sizing: border-box; }` line (i.e., as the new second rule, before `body { ... }`):

```css
:root {
  --accent-1: #7c3aed;
  --accent-2: #db2777;
  --accent-3: #2563eb;
}

.ambient {
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
}
.ambient-mesh {
  position: absolute;
  inset: -30%;
  background: conic-gradient(from 0deg, var(--accent-1), var(--accent-3), var(--accent-2), var(--accent-1));
  filter: blur(70px);
  opacity: 0.18;
  animation: ambient-spin 40s linear infinite;
  transition: opacity 0.6s ease;
}
.ambient-active .ambient-mesh {
  opacity: 0.36;
  animation-duration: 12s;
}
@keyframes ambient-spin {
  to { transform: rotate(360deg); }
}
@media (prefers-reduced-motion: reduce) {
  .ambient-mesh { animation: none; transition: none; opacity: 0.14; }
}
```

- [ ] **Step 2: Put the app content above the ambient layer**

In `web/src/App.css`, change:

```css
.app { display: flex; flex-direction: column; height: 100vh; }
```

to:

```css
.app { display: flex; flex-direction: column; height: 100vh; position: relative; z-index: 1; }
```

- [ ] **Step 3: Dim the message area so text stays readable over the ambient field**

In `web/src/App.css`, change the existing `.chat` rule from:

```css
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
}
```

to:

```css
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

- [ ] **Step 4: Add the ambient markup to web/src/App.jsx**

In `web/src/App.jsx`, the component currently returns:

```jsx
  return (
    <div className="app">
      <header className="topbar">AI Tutor <span className="sub">math &amp; physics, animated</span></header>
```

Change it to add the ambient layer as the first element inside `.app`, with its `active` class driven by the existing `busy` state:

```jsx
  return (
    <div className="app">
      <div className={`ambient${busy ? " ambient-active" : ""}`} aria-hidden="true">
        <div className="ambient-mesh"></div>
      </div>
      <header className="topbar">AI Tutor <span className="sub">math &amp; physics, animated</span></header>
```

No other part of `App.jsx` changes in this task — `busy` is already declared via `useState` earlier in the file.

- [ ] **Step 5: Verify in a browser**

Run the dev server (`npm run dev`) and open `http://localhost:5173`. Confirm:
- At idle, a faint, slowly-rotating blurred violet/blue/pink gradient is visible around the edges of the page (most visible near the top bar and composer, since the message list has its own darker backdrop from Step 3).
- Send any message. While it's streaming (the send button shows "…"), the gradient visibly brightens and speeds up.
- Once the response finishes, the gradient settles back to its slow, dim idle state within about half a second (the `opacity`/`transition` in Step 1 handles the fade; the rotation speed itself changes abruptly when `animation-duration` changes — this is expected and matches the validated mockup, not a bug).
- Message text in the chat area remains easily readable against the dimmed backdrop.
- In your OS/browser's reduced-motion setting (or via DevTools' "Emulate CSS prefers-reduced-motion: reduce"), confirm the gradient stops animating and sits at a fixed low opacity.

- [ ] **Step 6: Commit**

```
git add web/src/App.css web/src/App.jsx
git commit -m "feat: reactive ambient background (Energetic Physics)"
```

---

### Task 2: Message choreography + thinking indicator

**Files:**
- Modify: `web/src/App.css`
- Modify: `web/src/components/AssistantMessage.jsx`

**Interfaces:**
- Consumes: `--accent-1`, `--accent-2`, `--accent-3` custom properties from Task 1.
- Produces: nothing new consumed by Task 3, but must not collide with Task 3's additions to the same `App.css` file (Task 3 only adds rules under `.composer` and a `.msg:hover` rule, both disjoint from this task's `.msg`/`.think` base rules).

- [ ] **Step 1: Add message entrance animation and update the user bubble's color, in web/src/App.css**

Change the existing:

```css
.msg { border-radius: 12px; padding: 10px 16px; line-height: 1.55; }
.msg.user { background: #1d4ed8; align-self: flex-end; max-width: 75%; white-space: pre-wrap; }
.msg.assistant { background: #16213b; align-self: stretch; }
```

to:

```css
.msg {
  border-radius: 12px;
  padding: 10px 16px;
  line-height: 1.55;
  animation: msg-rise 0.45s ease both;
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
@keyframes msg-rise {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
@media (prefers-reduced-motion: reduce) {
  .msg { animation: none; }
}
```

- [ ] **Step 2: Add the thinking-dots styles to web/src/App.css**

Add this block after the `.anim-note { ... }` rule (keep `.anim-note` itself — it's still used for the "Building animation…" message elsewhere in `AssistantMessage.jsx`):

```css
.think { display: inline-flex; gap: 5px; padding: 4px 0; }
.think span {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  animation: think-bounce 1.1s ease-in-out infinite;
}
.think span:nth-child(1) { background: var(--accent-2); box-shadow: 0 0 6px 1px rgba(219, 39, 119, 0.7); }
.think span:nth-child(2) { background: var(--accent-1); box-shadow: 0 0 6px 1px rgba(124, 58, 237, 0.7); animation-delay: 0.15s; }
.think span:nth-child(3) { background: var(--accent-3); box-shadow: 0 0 6px 1px rgba(37, 99, 235, 0.7); animation-delay: 0.3s; }
@keyframes think-bounce {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.5; }
  30% { transform: translateY(-6px); opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .think span { animation: none; opacity: 0.8; }
}
```

- [ ] **Step 3: Replace the static "Thinking…" text in web/src/components/AssistantMessage.jsx**

The file currently reads:

```jsx
import { marked } from "marked";
import { parseResponse } from "../lib/parseResponse.js";
import AnimationFrame from "./AnimationFrame.jsx";

export default function AssistantMessage({ content, streaming }) {
  const { visibleText, animationCode, pending } = parseResponse(content);
  return (
    <div className="msg assistant">
      <div
        className="msg-text"
        dangerouslySetInnerHTML={{ __html: marked.parse(visibleText || "") }}
      />
      {pending && <div className="anim-note">Building animation…</div>}
      {animationCode && !streaming && <AnimationFrame code={animationCode} />}
      {streaming && !visibleText && !pending && <div className="anim-note">Thinking…</div>}
    </div>
  );
}
```

Replace the final conditional line:

```jsx
      {streaming && !visibleText && !pending && <div className="anim-note">Thinking…</div>}
```

with:

```jsx
      {streaming && !visibleText && !pending && (
        <div className="think" aria-label="Thinking">
          <span></span>
          <span></span>
          <span></span>
        </div>
      )}
```

Everything else in the file is unchanged.

- [ ] **Step 4: Verify in a browser**

With the dev server running, send a message and observe:
- The user bubble now shows a violet-to-pink gradient instead of flat blue, and both the user and assistant bubbles fade+rise into place (the assistant bubble appears an instant after the user's).
- Before any text streams in, three small dots appear where "Thinking…" used to be, bouncing in sequence with a colored glow (pink, violet, blue).
- Once text starts streaming, the dots are replaced by the streaming text as before (this behavior is unchanged — `AssistantMessage.jsx`'s existing condition `streaming && !visibleText && !pending` already handles the switch).
- Send a second message in the same conversation and confirm the entrance animation plays again for the new messages, and that the previous messages don't re-animate.

- [ ] **Step 5: Commit**

```
git add web/src/App.css web/src/components/AssistantMessage.jsx
git commit -m "feat: message entrance choreography and animated thinking indicator"
```

---

### Task 3: Micro-interactions (composer + final verification pass)

**Files:**
- Modify: `web/src/App.css`

**Interfaces:**
- Consumes: `--accent-1`, `--accent-2` custom properties from Task 1.
- Produces: nothing consumed elsewhere — this is the final task.

- [ ] **Step 1: Add composer micro-interactions to web/src/App.css**

Change the existing:

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
}
.composer button {
  background: #1d4ed8;
  color: white;
  border: none;
  border-radius: 10px;
  padding: 0 22px;
  font: inherit;
  cursor: pointer;
}
.composer button:disabled { opacity: 0.5; cursor: default; }
```

to:

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
.composer textarea:focus {
  outline: none;
  border-color: var(--accent-1);
  box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.25);
}
.composer button {
  position: relative;
  background: linear-gradient(135deg, var(--accent-1), var(--accent-2));
  color: white;
  border: none;
  border-radius: 10px;
  padding: 0 22px;
  font: inherit;
  cursor: pointer;
  transition: transform 0.1s ease, box-shadow 0.2s ease;
}
.composer button:hover:not(:disabled) {
  box-shadow: 0 0 16px 2px rgba(219, 39, 119, 0.5);
}
.composer button:active:not(:disabled) {
  transform: scale(0.94);
}
.composer button:disabled { opacity: 0.5; cursor: default; }
.composer button:not(:disabled)::after {
  content: "";
  position: absolute;
  inset: -4px;
  border-radius: 13px;
  border: 1px solid var(--accent-2);
  opacity: 0;
  animation: btn-ping 2.2s ease-out infinite;
  pointer-events: none;
}
@keyframes btn-ping {
  0% { opacity: 0.6; transform: scale(0.92); }
  100% { opacity: 0; transform: scale(1.25); }
}
@media (prefers-reduced-motion: reduce) {
  .composer button::after { animation: none; opacity: 0; }
}
```

- [ ] **Step 2: Verify in a browser**

With the dev server running:
- Click into the composer textarea — confirm a violet glow/border appears on focus.
- With text typed in (button enabled), hover the send button — confirm a pink glow appears, and a faint pulsing ring animates outward around the button continuously.
- Click the send button — confirm it visibly scales down briefly on press.
- Clear the textarea (button disabled) — confirm the pulsing ring and hover glow no longer appear, matching the existing disabled-opacity behavior.
- Hover over a message bubble — confirm it lifts very slightly.

- [ ] **Step 3: Full manual verification pass (closes out the whole plan)**

With the dev server running, walk through the entire revamp end to end:
1. Load the app fresh — ambient field idle, dim, slow.
2. Ask a real question (e.g., "Why does a pendulum swing?") — user and assistant bubbles animate in, ambient field brightens/speeds up while streaming, thinking dots bounce before text appears, ambient field settles back down once the response (including its 3D animation) finishes rendering.
3. Confirm the 3D animation panel itself renders and behaves exactly as before — this plan does not touch `AnimationFrame.jsx` or the Tutor3D engine, so this is a regression check, not new behavior.
4. Toggle `prefers-reduced-motion: reduce` (via browser DevTools' rendering emulation panel) and reload — confirm the ambient field, message entrances, thinking dots, and send-button ring are all static/absent, while the app remains fully usable.
5. Run the existing automated test suite to confirm this purely-visual change didn't break anything: `npm test` — expect all 20 tests to still pass (this plan added no new tests, per the Global Constraints).

- [ ] **Step 4: Commit**

```
git add web/src/App.css
git commit -m "feat: composer and message micro-interactions"
```
