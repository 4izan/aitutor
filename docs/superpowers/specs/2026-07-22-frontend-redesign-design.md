# Frontend Redesign — "Glassmorphic Layered" — Design Spec

**Date:** 2026-07-22
**Status:** Approved

## Summary

The third and final sub-project generalizing AI Tutor: a genuine visual and
structural redesign of the chat shell, using the newly-installed
`ui-ux-pro-max` design-intelligence plugin to ground the direction in real
design-system data rather than ad-hoc taste. The current app (`web/src/App.jsx`,
`App.css`) is a single vertical stack — topbar, scrolling chat, composer —
with animations rendered inline inside whichever assistant message produced
them. This redesign restructures it into a two-column layout (chat + a
pinned 3D-viewport panel) with frosted-glass card treatment, chosen from
three data-backed mockup directions presented via the visual brainstorming
companion.

## Decisions from discussion

- **Direction: "Glassmorphic Layered,"** chosen over two alternatives shown
  side-by-side as live mockups — "AI-Native Minimal" (dark OLED, indigo
  accent, sidebar nav — the closest database match for "AI/Chatbot
  Platform") and "Bento Grid Dashboard" (modular Apple-style tiles, the most
  dramatic layout departure). The user selected B decisively in the visual
  companion.
- **Palette: unchanged.** The existing violet/pink/blue "Energetic Physics"
  ambient gradient stays exactly as shipped from the earlier revamp
  sub-project — this redesign is about layout and card treatment, not
  re-picking colors.
- **Layout: two-column split**, chat on the left, a pinned 3D-viewport panel
  on the right, both inside glass-styled panels over the unchanged ambient
  background. Below a 900px breakpoint, the panel moves above the chat
  (column reflow) rather than beside it.
- **Animation history: panel-only.** The pinned viewport always shows only
  the *latest* animation; once a newer question is asked, older messages in
  the chat history become text-only — nothing else ever renders an
  animation. Chosen over a "click an old message to reload it" alternative
  for simplicity, and because it fixes a pre-existing side effect of the
  current design: today's app never disposes old animation iframes as new
  ones arrive, so a long conversation accumulates multiple simultaneous
  WebGL contexts. Panel-only rendering means only one is ever alive.
- **Empty state: idle placeholder.** Before the first animation exists (or
  during a text-only answer), the panel shows a calm placeholder rather than
  being collapsed/absent or jarringly empty.

## Architecture

### Layout (`web/src/App.jsx`, `web/src/App.css`)

`.app`'s structure changes from a flat vertical stack to:

```
.app
  .ambient            (unchanged — fixed full-viewport background layer)
  .topbar             (unchanged — full width, spans both columns below it)
  .layout             (new — flex row; flex-direction: column below 900px)
    .chat-col         (new wrapper — contains the existing .chat + .composer)
    .viewport-col     (new — hosts <PinnedViewport>)
```

`.chat` and `.composer` are not removed or restyled structurally — they move
from being direct children of `.app` to children of the new `.chat-col`
wrapper, preserving their existing scroll/input behavior unchanged.

### Data flow: lifting animation state out of individual messages

Today, `AssistantMessage.jsx` independently calls `parseResponse(content)`
per message and renders its own `AnimationFrame` inline
(`animationCode && !streaming && <AnimationFrame code={animationCode} />`),
plus a `"Building animation…"` note while `pending`. Under panel-only
rendering, `App.jsx` computes these itself from the *latest* assistant
message (using the same existing `parseResponse` — no changes to that pure
function) and passes `animationCode`/`pending` down to one new top-level
`PinnedViewport` component. `AssistantMessage.jsx` is simplified to render
only explanation text and the thinking-dot indicator — it no longer touches
`animationCode`, `pending`, or `AnimationFrame` at all.

### `PinnedViewport` component (new: `web/src/components/PinnedViewport.jsx`)

Three states, matching what `AssistantMessage.jsx` used to render inline,
plus a new one:

1. **Idle** (no `animationCode`, not `pending`): a calm placeholder —
   e.g. "Ask a question to see it animated here."
2. **Building** (`pending`): the same `"Building animation…"` note that
   exists today, relocated here.
3. **Ready** (`animationCode` present, not streaming): renders
   `<AnimationFrame code={animationCode} />`, exactly as today — no changes
   to `AnimationFrame.jsx` itself.

### Visual style: per-card glassmorphism

Frosted-glass treatment (`backdrop-filter: blur(...)`, a translucent fill,
a subtle light border) replaces today's flat-color message bubbles and
composer, and is also applied to the new viewport panel — each card gets
its own glass treatment rather than one blurred wrapper around the whole
chat area (which is `.chat`'s current approach: a single
`background: rgba(10,10,20,0.55); backdrop-filter: blur(6px)` on the
container). The fill uses a **dark, cool-toned translucent color** (not the
generic light/white glass example from the design database), consistent
with the app's existing dark-mode-only identity and keeping light message
text readable against the vibrant ambient gradient (targeting the existing
≥4.5:1 contrast standard already upheld elsewhere in the app).

### Untouched

`web/src/anim/` (Tutor3D engine, `s.params()`/`s.interactive()`),
`server/prompts.js` (subject scope, animation API docs), `AnimationFrame.jsx`
internals, and the existing ambient-background reactivity
(`busy`-driven brightness/speed) and message-entrance/thinking-dot
animations from the earlier revamp sub-project — all carry over unchanged.
`.ambient` remains a fixed, full-viewport layer behind everything; it's now
visible through two glass columns instead of one glass chat panel, but its
own CSS is not modified by this redesign.

## Testing

Pure CSS/JSX/layout work — no new testable pure logic (the "latest
animation" computation reuses the already-tested `parseResponse`). No new
Vitest coverage, consistent with this project's established testing
philosophy: verification is manual, in a real browser — checking the
desktop split layout, the sub-900px stacked reflow, all three viewport
states (idle/building/ready), and that older messages correctly stop
showing an animation once a newer one supersedes them in the panel.

## Non-goals

- No change to subject scope, the Tutor3D engine, or the animation system
  prompt (`server/prompts.js`) — those are sub-projects 1 and 2, already
  shipped.
- No light-mode support — the app remains dark-mode only.
- No new npm dependencies — this is CSS-only (backdrop-filter, gradients,
  flexbox), no new libraries.
- No "click an old message to reload its animation" affordance — panel-only,
  latest-only rendering, per the decision above.
- No changes to `AnimationFrame.jsx`'s sandboxing, CSP, or the srcdoc-build
  pipeline.
