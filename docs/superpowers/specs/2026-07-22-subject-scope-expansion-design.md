# Subject-Scope Expansion — Design Spec

**Date:** 2026-07-22
**Status:** Approved

## Summary

AI Tutor is currently hard-scoped to math and physics: the system prompt
identifies the assistant as "a friendly, clear tutor for math and physics,"
and the UI copy (topbar subtitle, composer placeholder, empty-state hint)
echoes that scope. This is the first of three sub-projects (subject scope →
animation interactivity → frontend redesign) that together make the app
feel more alive and general-purpose. This sub-project removes the subject
restriction so the tutor answers and animates any academic subject, while
keeping the app's core identity — every substantive answer ships with one
interactive 3D animation — intact even for subjects that aren't naturally
spatial.

## Decisions from discussion

- **Scope:** generalize from "math and physics" to "any academic subject."
- **Handling non-spatial subjects:** rather than making the animation
  optional per subject (which would turn "every answer is animated" from a
  guarantee into a maybe), the model is instructed to always find a spatial
  metaphor — even for history, literature, languages, philosophy, etc. —
  rather than skip the animation. The existing exemption for genuinely
  non-conceptual questions (small talk) is unchanged.
- **Subject framing in the prompt:** generic ("any academic subject"), not
  an enumerated list. Simpler, future-proof, and avoids implying anything
  left off a list is out of scope.
- **Empty-state hint:** replace the single hardcoded math/physics example
  with a small pool of example questions spanning different subjects, one
  chosen at random per page load — signals the new breadth immediately to
  a new user.

## Architecture

### System prompt (`server/prompts.js`)

`TUTOR_SYSTEM_PROMPT`'s opening line changes from:

> "You are a friendly, clear tutor for math and physics."

to:

> "You are a friendly, clear tutor for any academic subject."

A new rule is added (after the existing numbered rules) instructing the
model: when a concept has no obvious spatial/quantitative structure, invent
one rather than skip the animation — a history timeline as a 3D track along
one axis, a story's plot structure as a rising/falling 3D arc, word or
character relationships as a 3D network graph, a comparison of ideas as
bars or points along an axis. This keeps the "exactly one animation per
answer" guarantee (rule 2) meaningful across all subjects instead of
silently degrading to text-only for humanities.

The existing exemption (rule 5: omit the animation only for questions that
aren't about a visualizable concept at all, e.g. small talk) is unchanged —
it already covers the one legitimate case for skipping animation, and nothing
about broadening subject scope requires touching it.

`ANIM_API_DOCS` and `FIX_SYSTEM_PROMPT` are untouched. What the animation
engine can *do* is sub-project 2's concern; this sub-project only changes
what subjects the tutor will *attempt* to animate.

### UI copy (`web/src/App.jsx`)

Three pieces of hardcoded math/physics copy are generalized:

- Topbar subtitle: `"math & physics, animated"` → a generic phrase
  reflecting all-subjects scope (e.g. `"every subject, animated"`).
- Composer placeholder: `"Ask a math or physics question…"` → a generic
  placeholder (e.g. `"Ask about any subject…"`).
- Empty-state hint: currently a single hardcoded example
  (`"Why does a pendulum swing?"`). Replaced with a small array of example
  questions spanning different subjects (e.g. one physics, one history, one
  economics, one literature question), with one selected at random when the
  component mounts (no rotation while the user sits on the empty state —
  just variety across visits/reloads).

### Documentation (`README.md`)

The project description on line 3 ("A local ChatGPT-style tutor for math
and physics...") is updated to reflect all-subjects scope.

### Acceptance script (`scripts/check-prompts.mjs`)

The existing 5-prompt acceptance list (all math/physics/CS) gains 2-3
non-STEM prompts — e.g. a history question, an economics question, a
literature question — so the script actually exercises and verifies the
"always animate, get creative" instruction outside STEM, not just asserts
it in the prompt text. Same pass criteria as the existing prompts: an
animation block present, valid syntax, no forbidden APIs.

## Testing

No new Vitest coverage — `server/prompts.js` is a template string with no
pure logic to unit test (confirmed no existing test asserts on its
content). Verification is the extended `scripts/check-prompts.mjs` run
against a live dev server, covering both STEM and non-STEM prompts, plus a
manual spot-check in the browser of the updated UI copy and empty-state
example rotation.

## Non-goals

- No new visualization system — every subject continues to use the
  existing Tutor3D 3D-scene engine (sub-project 2 improves what that engine
  can do; this sub-project doesn't touch it).
- No subject picker/dropdown or other UI for declaring a subject upfront —
  the model infers subject from the question itself, as it already does
  implicitly for math/physics today.
- No per-subject prompt branching or subject-specific system prompts — one
  generic system prompt handles all subjects via the model's own judgment.
- No changes to `ANIM_API_DOCS`, `FIX_SYSTEM_PROMPT`, or any file under
  `web/src/anim/` — animation engine capability is sub-project 2.
