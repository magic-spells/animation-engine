# @magic-spells/animation-engine

## Purpose

Declarative animation sequencing engine. Builds chainable "scenes" — sequences of tweens,
waits, parallel groups and staggers on DOM elements — with easing or spring physics,
loops, and lazy randomness. Composes the ecosystem's two interpolation primitives:
`@magic-spells/frame-engine` (progress → interpolated CSS styles) and
`@magic-spells/physics-engine` (a spring producing progress over time). This package owns
everything neither has: time, easing, sequencing, repetition, randomness, lifecycle.

## Architecture

**Scenes are async chains, NOT scrubable timelines.** A scene runs step → await
completion → next step. This is deliberate: physics steps have no duration (a spring
finishes when it settles), so there is no playhead, seek, pause, or GSAP-style position
syntax. Playback surface is `play()` (promise), `stop()` (freeze), `finish()` (jump to end
states), `timeScale(n)`.

**One shared ticker.** A single rAF loop (`src/ticker.js`) drives every time-based tween.
Delta is clamped to 64ms so backgrounded tabs pause rather than teleport. In Node (no rAF)
the loop never self-schedules; tests drive it manually via `ticker.tick(ms)`.

**Per-tick pipeline**: elapsed → eased progress → `frameEngine.getFrame(progress)` →
`Object.assign(el.style, styles)`. Overshoot easings (back/elastic) exceed 1 and rely on
frame-engine's extrapolation — that's a feature.

**Tweens paint their 0% frame synchronously at `start()`** (both Tween and PhysicsTween).
Without this the first painted frame is one tick into the animation — a visible pop-in on
looping fade-ins. Don't remove it.

**Sparse keyframes are normalized before reaching frame-engine**
(`src/keyframes.js:fillSparseKeyframes`). Raw frame-engine anchors a property that's
missing from a keyframe to its default at that position (an opacity-only key silently pins
`transform` to identity, bending motion back to the origin — this bug shipped in the first
snow demo). The fill gives CSS `@keyframes` semantics: missing properties interpolate
straight through, per property, sampled via mini single-property FrameEngine instances.

**Lazy values**: any style value, duration, delay, wait, or stagger interval may be a
zero-arg function, re-resolved at step start each loop iteration (`rand()`/`pick()` return
these). This is what makes looping particles respawn differently every iteration — never
resolve them at build time.

**From-state tracking**: a module-level WeakMap (`src/state.js`) records the last styles
the engine wrote per element; `.to()` derives its FROM state from it, falling back to
computed style. Computed `transform` is a matrix and can't interpolate against transform
functions, so an untracked first `.to({transform})` jumps (warned once) — seed with
`.set()` or use `.fromTo()`/`.frames()`.

**Interrupts are last-write-wins**: starting a tween on an element cancels the one already
running on it (its step ends early; that scene proceeds). Infinite loops stop at iteration
boundaries when every element target is disconnected from the DOM.

## Key files

- `src/scene.js` — builder + async scheduler (loop/alternate, parallel, stagger, waits)
- `src/tween.js` / `src/physics-tween.js` — atomic per-element tweens (same interface)
- `src/ticker.js` — shared rAF singleton, manual `tick()` for tests
- `src/easings.js` — named easings + cubic-bezier solver (Newton-Raphson + bisection)
- `src/keyframes.js` — sparse-keyframe fill (CSS semantics)
- `src/values.js` — `rand`, `pick`, lazy resolution
- `src/dom.js` — target resolution, from-state derivation
- `src/state.js` — WeakMaps: written styles + active element tweens
- `src/animation-engine.d.ts` — public TypeScript declarations (keep in sync)
- `demo/index.html` — showcase page (port 3060)

## Commands

- `npm run dev` — Vite dev server at localhost:3060 (opens demo/index.html)
- `npm test` — Node built-in test runner over `test/*.test.js` (all deterministic; fake
  time via `ticker.tick`)
- `npm run build` — TWO Vite passes keyed off `BUILD_FORMAT`: `es` (externalizes
  `@magic-spells/*` deps — consumers get them via npm) then `umd` (self-contained
  `dist/animation-engine.min.js`, global `AnimationEngine`). Keep the split; bundling deps
  into the ESM duplicates frame-engine for projects that already use it.

## Physics-engine integration gotchas

- A superseded `animateTo` resolves its promise but emits NO `complete` event — always
  rely on the promise.
- `animateTo(x, x, 0)` completes synchronously; the scheduler must tolerate sync
  completion.
- The spring self-ticks its own rAF (can't be driven by the shared ticker) and ignores
  `timeScale`; scenes can't pause mid-spring (velocity isn't exposed), only stop.

## Conventions

- Plain JS + JSDoc, `.d.ts` maintained by hand — no TypeScript sources.
- Dependencies stay published npm versions, never `file:` links.
- Demo code asides must show the REAL code driving each section — update them when
  changing demo scenes.
