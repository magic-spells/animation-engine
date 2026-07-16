import assert from 'node:assert/strict';
import test from 'node:test';

import { scene } from '../src/animation-engine.js';
import ticker from '../src/ticker.js';

// ---- Fake-time helpers ------------------------------------------------------
// The ticker exposes no real rAF in Node, so we drive it by hand. `flush` lets
// the async scheduler's awaited promises resolve between ticks.

const flush = () => new Promise((r) => setTimeout(r, 0));

/** Advance fake time by `ms`, flushing microtasks after each 16ms frame. */
async function advance(ms, step = 16) {
  for (let t = 0; t < ms; t += step) {
    ticker.tick(step);
    await flush();
  }
}

/** A minimal element-like target. */
const el = (extra = {}) => ({ style: {}, isConnected: true, ...extra });

// ---- Sequencing -------------------------------------------------------------

test('steps run in order; a wait gates the following step', async () => {
  const log = [];
  const s = scene()
    .call(() => log.push('a'))
    .wait(100)
    .call(() => log.push('b'));

  const done = s.play();
  await flush();
  assert.deepEqual(log, ['a'], 'b has not run before the wait elapses');

  await advance(120);
  await done;
  assert.deepEqual(log, ['a', 'b']);
});

test('.set applies instantly and seeds the from-state for a later .to', async () => {
  const box = el();
  const s = scene().set(box, { opacity: 0 }).to(box, { opacity: 1 }, { duration: 100 });

  const done = s.play();
  await flush();
  // .set assigns the raw number, then the .to paints its 0% frame immediately
  // (pop-in guard), overwriting it with frame-engine's string '0'. Either way
  // the element must read as opacity 0 before the first tick.
  assert.equal(String(box.style.opacity), '0', 'from-state painted before first tick');

  await advance(120);
  await done;
  assert.equal(box.style.opacity, '1', '.to flowed from the seeded 0 to 1');
});

// ---- Parallel ---------------------------------------------------------------

test('parallel sub-steps overlap and complete when the slowest finishes', async () => {
  const a = el();
  const b = el();
  const s = scene().parallel((p) => {
    p.fromTo(a, { opacity: 0 }, { opacity: 1 }, { duration: 100 });
    p.fromTo(b, { opacity: 0 }, { opacity: 1 }, { duration: 300 });
  });

  const done = s.play();
  await flush();

  await advance(120);
  assert.equal(a.style.opacity, '1', 'fast track finished');
  const bMid = parseFloat(b.style.opacity);
  assert.ok(bMid > 0 && bMid < 1, 'slow track still mid-flight (overlap)');

  await advance(240);
  await done;
  assert.equal(b.style.opacity, '1', 'slow track finished last');
});

// ---- Stagger ----------------------------------------------------------------

test('stagger offsets each item by interval; later items start untouched', async () => {
  const els = [el(), el(), el()];
  const s = scene().stagger(
    els,
    { from: { opacity: 0 }, to: { opacity: 1 }, duration: 100 },
    { interval: 100 }
  );

  const done = s.play();
  await flush();

  await advance(48);
  assert.ok(parseFloat(els[0].style.opacity) > 0, 'item 0 started immediately');
  assert.equal(els[1].style.opacity, undefined, 'item 1 not started at 48ms');
  assert.equal(els[2].style.opacity, undefined, 'item 2 not started at 48ms');

  await advance(400);
  await done;
  for (const e of els) assert.equal(e.style.opacity, '1', 'all items completed');
});

test('stagger accepts a (el, i) => config function', async () => {
  const els = [el(), el()];
  const s = scene().stagger(
    els,
    (element, i) => ({ from: { opacity: 0 }, to: { opacity: (i + 1) / 2 }, duration: 100 }),
    { interval: 0 }
  );

  const done = s.play();
  await flush();
  await advance(140);
  await done;
  assert.equal(els[0].style.opacity, '0.5');
  assert.equal(els[1].style.opacity, '1');
});

// ---- Loop / alternate -------------------------------------------------------

test('loop count + alternate reverses order and swaps from/to', async () => {
  const a = el();
  const loops = [];
  let completes = 0;
  const s = scene({
    loop: 2,
    alternate: true,
    onLoop: (i) => loops.push(i),
    onComplete: () => completes++,
  }).fromTo(a, { opacity: 0 }, { opacity: 1 }, { duration: 100 });

  const done = s.play();
  await flush();
  await advance(320);
  await done;

  assert.deepEqual(loops, [1], 'onLoop fires once, between the two iterations');
  assert.equal(completes, 1, 'onComplete fires exactly once');
  assert.equal(a.style.opacity, '0', 'reversed 2nd iteration swaps to end at 0');
});

test('loop stops at a boundary when every target is disconnected', async () => {
  const a = { style: {}, isConnected: false };
  const s = scene({ loop: true }).fromTo(a, { opacity: 0 }, { opacity: 1 }, { duration: 50 });

  const done = s.play();
  await flush();
  await advance(80);
  await done; // resolves: after iter 0, the boundary check finds all targets gone
  assert.equal(a.style.opacity, '1', 'one iteration completed before stopping');
});

// ---- Stop / finish ----------------------------------------------------------

test('stop freezes in place, resolves the promise, and emits stop', async () => {
  const a = el();
  let stopped = false;
  const s = scene().fromTo(a, { opacity: 0 }, { opacity: 1 }, { duration: 1000 });
  s.on('stop', () => (stopped = true));

  const done = s.play();
  await flush();
  await advance(100);

  s.stop();
  await done;

  assert.ok(stopped, 'stop event emitted');
  const frozen = parseFloat(a.style.opacity);
  assert.ok(frozen > 0 && frozen < 1, 'frozen mid-animation');

  await advance(300);
  assert.equal(parseFloat(a.style.opacity), frozen, 'no further movement after stop');
});

test('finish jumps to the final end state, resolves, and emits complete', async () => {
  const a = el();
  let completed = false;
  const s = scene()
    .fromTo(a, { opacity: 0 }, { opacity: 1 }, { duration: 1000 })
    .fromTo(a, { opacity: 1 }, { opacity: 0.5 }, { duration: 1000 });
  s.on('complete', () => (completed = true));

  const done = s.play();
  await flush();
  await advance(100);

  s.finish();
  await done;

  assert.ok(completed, 'complete event emitted');
  assert.equal(a.style.opacity, '0.5', 'jumped to the last step end state');
});

// ---- Play semantics ---------------------------------------------------------

test('calling play() while playing returns the same in-flight promise', async () => {
  const a = el();
  const s = scene().fromTo(a, { opacity: 0 }, { opacity: 1 }, { duration: 500 });

  const p1 = s.play();
  const p2 = s.play();
  assert.equal(p1, p2, 'same promise returned while playing');

  s.stop();
  await p1;
});

test('calling play() after completion restarts with a fresh promise', async () => {
  const a = el();
  const s = scene().fromTo(a, { opacity: 0 }, { opacity: 1 }, { duration: 100 });

  const p1 = s.play();
  await flush();
  await advance(140);
  await p1;

  const p2 = s.play();
  assert.notEqual(p1, p2, 'restart yields a new promise');
  s.stop();
  await p2;
});

// ---- Physics (Node fallback) ------------------------------------------------

test('a physics step resolves and lands on its end state (Node no-rAF fallback)', async () => {
  const a = el();
  const s = scene().fromTo(
    a,
    { opacity: 0 },
    { opacity: 1 },
    { physics: { attraction: 0.1, friction: 0.3 } }
  );

  const done = s.play();
  await flush();
  await done;
  assert.equal(a.style.opacity, '1', 'physics step settled at its end value');
});

// ---- timeScale --------------------------------------------------------------

test('scene.timeScale is a getter/setter and speeds up waits', async () => {
  const log = [];
  const s = scene().wait(200).call(() => log.push('done'));
  assert.equal(s.timeScale(), 1);
  s.timeScale(4); // 200ms of scene time in ~50ms of real ticks
  assert.equal(s.timeScale(), 4);

  const done = s.play();
  await flush();
  await advance(64); // 64 * 4 = 256 scaled ms > 200
  await done;
  assert.deepEqual(log, ['done']);
});
