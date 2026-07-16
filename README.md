# @magic-spells/animation-engine

Declarative animation sequencing engine — chainable scenes with easing, physics, staggers, loops and randomness for the magic-spells ecosystem.

It composes the ecosystem's two interpolation primitives and fills the gap between them:

- [`@magic-spells/frame-engine`](https://www.npmjs.com/package/@magic-spells/frame-engine) — pure `getFrame(pos)` → interpolated CSS. No clock, no easing, no lifecycle. Extrapolates outside 0–1, so spring overshoot styles itself for free.
- [`@magic-spells/physics-engine`](https://www.npmjs.com/package/@magic-spells/physics-engine) — a spring that _produces_ progress over time.

animation-engine owns everything neither has: **time, easing, sequencing, repetition, randomness, lifecycle.** Per frame it does `elapsed → eased progress → getFrame(progress) → Object.assign(el.style, styles)`.

A Scene is an **async chain** (run step → await completion → next), not a fixed timeline with a playhead. That is because physics steps have no duration — a spring finishes when it settles. It is also the honest reason there is no seek/scrub/reverse in v1.

[**Live Demo**](https://magic-spells.github.io/animation-engine/demo/)

## Install

```bash
npm install @magic-spells/animation-engine
```

## Quick start

```js
import { scene, rand } from '@magic-spells/animation-engine';

const box = document.querySelector('#box');

const intro = scene({ defaults: { easing: 'ease-in-out' } })
  .set(box, { opacity: 0, transform: 'translateY(20px) scale(0.9)' })
  .to(box, { opacity: 1, transform: 'translateY(0px) scale(1)' }, { duration: 500, easing: 'back-out' })
  .wait(200)
  .to(box, { opacity: 0 }, { duration: 400 });

await intro.play();
```

## Concepts

### Targets

Everywhere a target is accepted it may be an `Element`, an `Element[]`, a `NodeList`, or a CSS selector string. Passing multiple elements to `.to()` / `.frames()` applies the same animation to all of them.

### From-state tracking

The engine keeps a module-level `WeakMap` of _element → the last styles it wrote_. A `.to()` step animates FROM that recorded state, so chained steps flow naturally from wherever the previous step ended. `.set()`, `.fromTo()`, and completed steps all seed it. If an element has never been touched, the from-state falls back to computed style for exactly the animated properties (see the transform caveat below).

### Lazy values

Any value that follows can be a **zero-arg function**, re-evaluated at the start of each step every iteration: style values, `duration`, `delay`, `.wait()` ms, and stagger `interval`. This is what makes looping snow respawn at a fresh random spot each loop — the random is resolved at step start, never baked in at build time.

```js
import { rand, pick } from '@magic-spells/animation-engine';

rand(0, 100, '%'); // () => e.g. "42.31%"  (with a unit → string, rounded to 2dp)
rand(2000, 6000);  // () => e.g. 3814.6    (no unit → number, good for durations)
pick(['#f00', '#0f0', '#00f']); // () => a random element each call
```

## API

### `scene(options?) → Scene`

`Scene` extends `EventEmitter`.

| option | type | default | meaning |
| --- | --- | --- | --- |
| `loop` | `boolean \| number` | `1` | `true` = infinite; a number = total iterations |
| `loopDelay` | `number` | `0` | ms between iterations |
| `alternate` | `boolean` | `false` | even iterations run the step list forward; odd iterations run it reversed, with each step's from/to swapped |
| `defaults` | `{ duration, easing }` | — | inherited by steps that don't specify their own |
| `respectReducedMotion` | `boolean` | `true` | under `prefers-reduced-motion`, apply end states instantly (one iteration, no loops) |
| `onBegin` | `() => void` | — | called when playback starts |
| `onComplete` | `() => void` | — | called when the scene completes |
| `onLoop` | `(iteration) => void` | — | called at each loop boundary |

### Builder methods

All return `this` and just push into an internal step array (data-first internally).

| method | description |
| --- | --- |
| `.to(target, styles, opts?)` | animate TO `styles`; FROM comes from tracked state (or computed-style fallback) |
| `.from(target, styles, opts?)` | inverse of `.to` — animate FROM `styles` to the current/last-written state |
| `.fromTo(target, fromStyles, toStyles, opts?)` | explicit both ends |
| `.set(target, styles)` | instant apply, zero duration; seeds the from-state map |
| `.frames(target, keyframes, opts?)` | frame-engine keyframes (`{0:…, 100:…}`) with CSS-style sparse semantics (see below) |
| `.wait(ms)` | pause; `ms` may be a lazy function |
| `.call(fn)` | invoke `fn`; if it returns a promise, await it (hooks **and** scene nesting via `.call(() => other.play())`) |
| `.parallel(build => …)` | sub-builder with the same methods; all sub-steps start together, the step completes when all complete |
| `.stagger(targets, config, opts?)` | fan a config across many targets with a per-item offset (see below) |

### Sparse keyframes fill like CSS

A property missing from a keyframe is interpolated straight through it, per property —
the same semantics as CSS `@keyframes`:

```js
.frames(el, {
  0:   { opacity: 0, transform: 'translateY(0px)' },
  50:  { opacity: 1 },                                // ← transform is NOT disturbed here
  100: { opacity: 1, transform: 'translateY(400px)' },
})
```

At 50% the transform is `translateY(200px)`, mid-flight between its own keys. (Raw
frame-engine would instead anchor the missing `transform` to identity at 50%, bending the
motion back toward the origin — animation-engine normalizes keyframes via
`fillSparseKeyframes()`, also exported, before they reach frame-engine.) A property
specified at a single key is constant; positions outside a property's specified range
clamp to its first/last value.

### Step options

```js
{
  duration: 400,          // ms, or a lazy () => ms  (default: from `defaults`, else 400)
  easing: 'ease',         // name | 'cubic-bezier(…)' | (t) => t   (default 'ease')
  delay: 0,               // ms before this step's tween starts; lazy ok
  physics: { attraction, friction } // replaces duration + easing (see below)
}
```

### Physics steps

Pass `physics` instead of `duration`/`easing` and the step's progress is driven by a `PhysicsEngine` spring: its emitted `change.progress` is mapped straight into `getFrame` (overshoot past 1 is desired and extrapolates), and the step completes on the spring's settle promise.

```js
scene().fromTo(el, { transform: 'translateX(0px)' }, { transform: 'translateX(300px)' }, {
  physics: { attraction: 0.05, friction: 0.2 },
});
```

Note: physics steps ignore `timeScale` (the spring runs on its own internal clock) and, being duration-less, cannot be given a fixed length. For a springy _but sequenceable and time-boxed_ feel, use an overshoot easing (`'back-out'`, `'elastic-out'`) on a normal timed step instead.

### Easings

Named: `'linear'`, `'ease'`, `'ease-in'`, `'ease-out'`, `'ease-in-out'`, `'back-in'`, `'back-out'`, `'back-in-out'`, `'elastic-out'`, `'bounce-out'`. Plus a `'cubic-bezier(x1,y1,x2,y2)'` string (parsed with a Newton-Raphson + bisection solver, like the CSS spec) or a custom `t => t` function. The `back-*` and `elastic-out` presets intentionally exceed 1 mid-curve — frame-engine extrapolates them into real overshoot.

```js
import { easings, cubicBezier } from '@magic-spells/animation-engine';
easings['back-out'];            // the raw function
cubicBezier(0.68, -0.55, 0.27, 1.55); // build your own
```

### Staggers

```js
scene().stagger(targets, config, opts);
```

- **targets** — `Element[]` / `NodeList` / selector string.
- **config** — a step-config object, or a `(el, i) => config` function. Config keys: `from`, `to`, `keyframes`, `duration`, `easing`, `physics`, `delay`.
- **opts** — `{ interval, jitter, from }`:
  - `interval` — ms between item starts (lazy ok). Item `i` starts at `rank(i) * interval`.
  - `jitter` — `0–1`, random ± fraction of `interval` applied per item.
  - `from` — start order: `'start'` (default), `'end'`, `'center'`, `'edges'`, `'random'`, or a numeric index. The step completes when all items complete.

### Playback

| control | behaviour |
| --- | --- |
| `.play()` | returns a promise resolving when the scene completes, is stopped, or is finished. It rejects if a `.call()` callback, lazy value, or lifecycle callback throws or returns a rejected promise; the scene remains replayable. Calling while playing returns the in-flight promise; calling after completion restarts. |
| `.stop()` | freeze in place, resolve the promise, emit `'stop'`. Remaining steps do not run. |
| `.finish()` | synchronously apply every step's end state, resolve, emit `'complete'`. (Applies visual end states only — `.call()` hooks are not invoked.) |
| `.timeScale(n)` | get (no arg) or set (with arg) the per-scene rate multiplier. Affects durations, waits and stagger intervals. **Physics steps are unaffected.** |

Events emitted: `'begin'`, `'complete'`, `'loop'`, `'stop'` — plus the `onBegin` / `onComplete` / `onLoop` option callbacks.

```js
myScene.on('complete', () => console.log('done'));
```

### Ticker

One shared `requestAnimationFrame` loop drives every time-based tween (no per-tween rAF). Subscribers receive a delta in ms, clamped to 64ms max so a backgrounded tab pauses rather than teleporting on return. The loop auto-starts on the first subscriber and stops when none remain.

```js
import { ticker } from '@magic-spells/animation-engine';
ticker.timeScale = 0.25; // global slow-mo for debugging
```

## Examples

### Drifting leaves (different frequencies)

```js
import { scene, rand } from '@magic-spells/animation-engine';

document.querySelectorAll('.leaf').forEach((leaf) => {
  scene({ loop: true, alternate: true, defaults: { easing: 'ease-in-out' } })
    .fromTo(
      leaf,
      { transform: 'translateX(-8px) rotate(-4deg)' },
      { transform: 'translateX(8px) rotate(4deg)' },
      { duration: rand(2600, 4200) } // each leaf drifts at its own frequency
    )
    .play();
});
```

### Looping snow (respawns at a new random spot each loop)

```js
import { scene, rand } from '@magic-spells/animation-engine';

document.querySelectorAll('.flake').forEach((flake) => {
  scene({ loop: true, defaults: { easing: 'linear' } })
    // lazy values re-resolve every iteration → a new column and speed each fall
    .set(flake, { left: rand(0, 100, '%'), top: '-20px', opacity: 0 })
    .to(flake, { opacity: 0.9 }, { duration: 600 })
    .fromTo(flake, { top: '-20px' }, { top: '110%' }, { duration: rand(5000, 9000), easing: 'linear' })
    .to(flake, { opacity: 0 }, { duration: 400 })
    .play();
});
```

### Staggered word intro

```js
import { scene } from '@magic-spells/animation-engine';

// tiny helper — split text into per-character spans (candidate future package)
function splitChars(el) {
  const chars = [...el.textContent];
  el.textContent = '';
  return chars.map((ch) => {
    const span = document.createElement('span');
    span.textContent = ch;
    span.style.display = 'inline-block';
    el.appendChild(span);
    return span;
  });
}

const letters = splitChars(document.querySelector('.headline'));

scene()
  .stagger(
    letters,
    { from: { opacity: 0, transform: 'translateY(0.6em)' }, to: { opacity: 1, transform: 'translateY(0em)' }, duration: 500, easing: 'back-out' },
    { interval: 40, jitter: 0.3 }
  )
  .play();
```

## Edge-case notes

- **Transform clobbering (concurrent tracks).** frame-engine returns whole `transform` strings, so two steps writing `transform` on the same element (e.g. fall + sway) clobber each other. v1 answer: put them on **separate wrapper elements** (fall on an outer element, sway on an inner one) or express both in one multi-stop `.frames()` keyframe set. True transform composition is a v2 idea.
- **Physics can't pause or be time-scaled.** A spring has no duration and runs on its own clock; `timeScale` and a fixed length don't apply. Use an overshoot easing for a springy feel you can still sequence and box in time.
- **First `.to()` on a transform.** A usable inline functional transform is used as the from-state. Otherwise, with no tracked prior state, the engine would have to read computed style — and computed `transform` serialises to a `matrix(...)`, which cannot be interpolated against transform functions. In that case the transform is treated as a discrete jump (it snaps to the target). Seed the first transform with `.set()` or use `.fromTo()` for a smooth first transform tween.
- **Interrupts (last write wins).** Starting a new tween or applying `.set()`/an immediate end-state on an element cancels any tween already running on it. The cancelled tween records its visible state before the new owner reads or writes the element; its scene then proceeds. Tracked across scenes via a module-level `WeakMap`.
- **Detached nodes.** At each loop boundary, if every element target is `isConnected === false`, the scene stops — preventing leaked forever-loops on removed nodes.
- **Reduced motion.** With `respectReducedMotion` (default `true`), `prefers-reduced-motion: reduce` makes `.play()` apply each step's end state instantly for a single iteration, then resolve.

## Commands

- `npm run build` — Vite library build (ESM + UMD min + `.d.ts`) → `dist/`
- `npm run dev` — Vite dev server on **port 3060** (opens `demo/index.html`)
- `npm run prod` — production build in watch mode
- `npm test` — `node --test`

## License

MIT © Cory Schulz

---

<p align="center">
  Made by <a href="https://github.com/coryschulz">Cory Schulz</a>
</p>
