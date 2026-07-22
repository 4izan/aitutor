# Frontend Revamp — "Energetic Physics" — Design Spec

**Date:** 2026-07-21
**Status:** Approved

## Summary

Revamp the chat shell's visual identity so the app feels alive, not just
functional. The current UI (`web/src/App.css`, `App.jsx`,
`AssistantMessage.jsx`) is a flat, static dark-slate chat interface with a
generic blue accent and no motion beyond the 3D animation panels themselves.
This work replaces that with a distinctive "Energetic Physics" identity: a
reactive, animated plasma-gradient background, choreographed message
entrances, a live "thinking" indicator, and consistent micro-interactions —
chosen and validated through a visual brainstorming session (mood
comparison, then a live two-intensity mockup of the actual chat UI).

## Decisions from discussion

- **Scope:** all four levers the user asked for — ambient background
  motion, message/response choreography, richer visual identity, and
  micro-interactions everywhere — not a subset.
- **Mood:** "Energetic Physics" — a slow-spinning, blurred conic-gradient
  mesh (violet → blue → pink), spark-style accents, more vivid/saturated
  than the current flat slate-and-blue look. Chosen over three alternatives
  (a calmer "Night Lab" starfield, a "Live Graph" grid-and-curve concept,
  and a light-mode "Warm Paper" direction) via a live, animated visual
  comparison — the user clicked "C — Energetic Physics" decisively (10
  repeated clicks on the same option, no exploration of the others).
- **Intensity: "Contained energy"**, not full immersion. Validated via a
  side-by-side live mockup of the actual chat UI at two intensities. The
  plasma field is dimmed and pushed toward the edges/composer; the message
  list sits on a translucent dark panel over it so paragraph-length
  explanations stay easy to read. Full-bleed intensity (field visible
  directly behind message text) was explicitly rejected.
- **Reactivity:** the background motion responds to app state — slower and
  dimmer while idle, faster and brighter while a response is streaming
  (`busy === true` in `App.jsx`), settling back down when it finishes. This
  is the core mechanism that makes the motion feel alive rather than merely
  decorative.
- **Scope boundary:** the 3D animation viewport (`AnimationFrame.jsx` and
  everything rendered inside its sandboxed iframe via the Tutor3D engine) is
  explicitly **not** part of this revamp — it's a separate, already-tested
  system generated dynamically per response. This work only touches the
  chat shell around it.

## Architecture

### Visual identity (`web/src/App.css`)

- New accent: a violet→pink gradient (`#7c3aed` → `#db2777`), replacing the
  flat blue (`#1d4ed8`) used for the user bubble and send button today.
- Base dark tone unified with the existing 3D viewport background
  (`#0f172a`, already used inside Tutor3D-rendered iframes) rather than
  introducing a third near-black shade — avoids a visible mismatch between
  the chat shell and the embedded animation panels.
- A fixed-position ambient background layer (a blurred, rotating
  `conic-gradient`) sits behind the whole app at low opacity via CSS
  `filter: blur(...)` and a `@keyframes spin` rotation.

### Reactive motion

- The ambient layer's rotation speed and glow intensity are controlled by a
  CSS custom property (e.g. `--spin-duration`) and an `active` class, both
  driven from `App.jsx`'s existing `busy` state — no new state variables
  needed, this is the same flag that already gates the send button and
  streaming indicator today.
- Idle: slow rotation, low opacity. Busy (response streaming): faster
  rotation, brighter glow. Transition back to idle when `busy` becomes
  `false`.

### Message & response choreography

- User and assistant message bubbles get a fade+rise entrance animation
  (CSS `@keyframes`, staggered so the user bubble appears slightly before
  the assistant one), matching the validated mockup.
- Because React reconciles the same DOM node across re-renders for a given
  array index (the assistant placeholder message is created once at the
  start of `send()`, then its `content` is updated in place as deltas
  arrive), a mount-triggered CSS animation naturally plays once per new
  message, not once per streamed token — no additional guard logic is
  needed to prevent re-triggering during streaming.
- The static `"Thinking…"` text in `AssistantMessage.jsx` is replaced with
  a three-dot bounce-and-glow indicator (each dot a different accent hue,
  staggered animation delay), matching the mockup.

### Micro-interactions (`web/src/App.css`)

- Send button: pulsing ring (`box-shadow`/`::after` ping animation), hover
  glow, `:active` press-down scale feedback.
- Composer textarea: a visible focus state (border/glow) consistent with
  the new accent.
- Message bubbles: subtle hover state.
- All interactive elements use a consistent transition timing, matching the
  lightweight style already present in the codebase.

### Accessibility

All new decorative animations (background spin/pulse, message entrance,
thinking-dot bounce, send-button ring) are wrapped so they are reduced or
disabled under `prefers-reduced-motion: reduce` — the reactive background
in particular should fall back to a static or near-static state for users
who've requested less motion.

## Files touched

- `web/src/App.css` — the bulk of the change: new color tokens, ambient
  background layer, message entrance keyframes, thinking-dot styles,
  micro-interaction styles, reduced-motion guards.
- `web/src/App.jsx` — add the ambient background element and wire its
  active/idle state to the existing `busy` flag.
- `web/src/components/AssistantMessage.jsx` — replace the static
  `"Thinking…"` text with the animated dot indicator markup.

No other files change. `AnimationFrame.jsx`, `server/`, and the Tutor3D
engine are untouched.

## Testing

This is pure CSS/JSX visual work — no new pure-logic modules are
introduced, so no new Vitest coverage is added (consistent with this
project's existing testing philosophy: Vitest covers deterministic logic,
not visual/animation behavior). Verification is manual: run the dev server
and check the result in a real browser — idle state, a live chat exchange
to observe the reactive background and message entrance animations, the
thinking indicator, and send-button interactions, plus a
`prefers-reduced-motion: reduce` check.

## Non-goals

- The 3D animation viewport's own styling/controls are not touched.
- No new npm dependencies — everything is CSS animations plus the existing
  `busy` React state, no canvas/WebGL/particle library.
- No light-mode support — "Warm Paper" (the one light-mode direction shown)
  was not chosen; the app remains dark-mode only.
- No new backend or API changes.
