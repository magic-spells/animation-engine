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
const el = (extra = {}) => ({
  style: {
    setProperty(key, value) {
      this[key] = value;
    },
  },
  isConnected: true,
  ...extra,
});

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

test('CSS custom properties are written by .set() and tween end states', async () => {
  const setTarget = el();
  await scene().set(setTarget, { '--accent': 42 }).play();
  assert.equal(setTarget.style['--accent'], '42');

  const fallbackTarget = { style: {}, isConnected: true };
  await scene().set(fallbackTarget, { '--accent': 'blue' }).play();
  assert.equal(fallbackTarget.style['--accent'], 'blue', 'plain style objects use assignment');

  const tweenTarget = el();
  const done = scene()
    .fromTo(tweenTarget, { '--progress': 0 }, { '--progress': 100 }, {
      duration: 32,
      easing: 'linear',
    })
    .play();

  await flush();
  await advance(32);
  await done;
  assert.equal(tweenTarget.style['--progress'], '100');
});

test('style value functions resolve per element with the element and index', async () => {
  const els = [el(), el(), el()];
  for (const element of els) element.style.left = '0px';
  const calls = [];
  const value = (element, i) => {
    calls.push([element, i]);
    return `${(i + 1) * 10}px`;
  };

  const done = scene().to(els, { left: value }, { duration: 32, easing: 'linear' }).play();
  await flush();
  await advance(32);
  await done;

  assert.deepEqual(calls, els.map((element, i) => [element, i]));
  assert.deepEqual(els.map((element) => element.style.left), ['10px', '20px', '30px']);
});

test('onUpdate runs after each write with increasing progress and a final 1', async () => {
  const box = el();
  const updates = [];
  const done = scene()
    .fromTo(box, { opacity: 0 }, { opacity: 1 }, {
      duration: 100,
      easing: 'linear',
      onUpdate(styles, progress, element) {
        updates.push({ progress, style: styles.opacity, written: element.style.opacity, element });
      },
    })
    .play();

  await flush();
  await advance(100, 25);
  await done;

  assert.deepEqual(updates.map(({ progress }) => progress), [0, 0.25, 0.5, 0.75, 1]);
  assert.ok(updates.every(({ style, written }) => style === written), 'styles are written first');
  assert.ok(updates.every(({ element }) => element === box));
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

test('stagger item onUpdate receives each element final state', async () => {
  const els = [el(), el()];
  const updates = [];
  await scene()
    .stagger(
      els,
      {
        from: { opacity: 0 },
        to: { opacity: 1 },
        duration: 0,
        onUpdate: (styles, progress, element) => updates.push([styles.opacity, progress, element]),
      },
      { interval: 0 }
    )
    .play();

  assert.deepEqual(updates, [
    ['1', 1, els[0]],
    ['1', 1, els[1]],
  ]);
});

test('stagger center ranks are normalized for an even element count', async () => {
  const els = [el(), el(), el(), el()];
  const s = scene().stagger(
    els,
    { from: { opacity: 0 }, to: { opacity: 1 }, duration: 100 },
    { from: 'center', interval: 100 }
  );

  const done = s.play();
  await flush();
  await advance(16);

  assert.notEqual(els[1].style.opacity, undefined, 'first middle item started immediately');
  assert.notEqual(els[2].style.opacity, undefined, 'second middle item started immediately');
  assert.equal(els[0].style.opacity, undefined, 'first outer item is still delayed');
  assert.equal(els[3].style.opacity, undefined, 'second outer item is still delayed');

  await advance(100);
  assert.notEqual(els[0].style.opacity, undefined, 'first outer item started by ~116ms');
  assert.notEqual(els[3].style.opacity, undefined, 'second outer item started by ~116ms');

  await advance(140);
  await done;
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

test('an empty infinite scene yields so it can be stopped', async () => {
  const s = scene({ loop: true });
  const done = s.play();

  assert.ok(done instanceof Promise, 'play returned instead of entering a synchronous loop');
  await flush();
  s.stop();
  await done;
});

test('a zero-target infinite scene does not starve timers', async () => {
  const s = scene({ loop: true }).to('.nothing', { opacity: 0 });
  const done = s.play();
  let timerFired = false;

  await new Promise((resolve) => {
    setTimeout(() => {
      timerFired = true;
      resolve();
    }, 10);
  });

  assert.equal(timerFired, true, 'a real timer ran while the scene was looping');
  s.stop();
  await done;
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

test('stop followed by immediate replay isolates the two runs', async () => {
  const a = el();
  const log = [];
  const s = scene()
    .to(a, { opacity: 0 }, { duration: 100 })
    .call(() => log.push('called'));

  const first = s.play();
  await flush();
  await advance(32);

  s.stop();
  let replayResolved = false;
  const replay = s.play();
  replay.then(() => {
    replayResolved = true;
  });

  await flush();
  assert.deepEqual(log, [], 'the stopped runner did not leak into the replay');
  assert.equal(replayResolved, false, 'the replay is still animating');

  await advance(140);
  await replay;
  await first;
  assert.deepEqual(log, ['called'], 'the replay ran the callback exactly once');
});

test('an onComplete replay preserves both play promises', async () => {
  const a = el();
  let completions = 0;
  let replay;
  const s = scene({
    onComplete: () => {
      completions++;
      if (completions === 1) replay = s.play();
    },
  }).fromTo(a, { opacity: 0 }, { opacity: 1 }, { duration: 100 });

  const first = s.play();
  await flush();
  await advance(120);
  await first;
  assert.ok(replay instanceof Promise, 'onComplete started a replay');

  await advance(120);
  await replay;
  assert.equal(completions, 2, 'both runs completed independently');
});

test('throwing and rejecting .call() steps reject without bricking playback', async () => {
  const throwing = scene().call(() => {
    throw new Error('boom');
  });

  await assert.rejects(throwing.play(), /boom/);
  assert.equal(throwing._playing, false, 'the scene is not left playing after rejection');

  const benign = scene().call(() => {});
  await benign.play();
  assert.equal(benign._playing, false, 'a subsequent benign scene resolves normally');

  const rejecting = scene().call(() => Promise.reject(new Error('async boom')));
  await assert.rejects(rejecting.play(), /async boom/);
  assert.equal(rejecting._playing, false, 'an async rejection also resets playback state');
});

test('an interrupting tween derives its from-state from the visible frame', async () => {
  const a = el();
  const firstScene = scene().fromTo(a, { opacity: 0 }, { opacity: 1 }, { duration: 100 });
  const firstDone = firstScene.play();
  await flush();
  await advance(48);
  const frozen = parseFloat(a.style.opacity);

  const secondScene = scene().to(a, { opacity: 0 }, { duration: 100 });
  const secondDone = secondScene.play();
  await flush();

  assert.ok(
    Math.abs(parseFloat(a.style.opacity) - frozen) <= 0.05,
    'the interrupt starts from the frame visible when ownership changed'
  );

  secondScene.stop();
  await Promise.all([firstDone, secondDone]);
});

test('.set() takes ownership from a running tween', async () => {
  const a = el();
  const firstScene = scene().fromTo(a, { opacity: 0 }, { opacity: 1 }, { duration: 1000 });
  const firstDone = firstScene.play();
  await flush();
  await advance(64);

  await scene().set(a, { opacity: 0.25 }).play();
  await advance(64);

  assert.equal(String(a.style.opacity), '0.25', 'the cancelled tween cannot overwrite the set');
  await firstDone;
});

test('a custom easing that ends below one still lands exactly on the target', async () => {
  const a = el();
  const s = scene().fromTo(
    a,
    { opacity: 0 },
    { opacity: 1 },
    { duration: 100, easing: (t) => t * 0.5 }
  );

  const done = s.play();
  await flush();
  await advance(120);
  await done;
  assert.equal(a.style.opacity, '1');
});

test('an inline functional transform is used as the first .to() from-state', async () => {
  const a = el();
  a.style.transform = 'translateX(0px)';
  const s = scene().to(a, { transform: 'translateX(100px)' }, { duration: 100 });

  const done = s.play();
  await flush();
  assert.equal(a.style.transform, 'translateX(0px)', 'the first paint preserves the inline transform');

  s.stop();
  await done;
});

// ---- Physics (Node fallback) ------------------------------------------------

test('a physics step resolves and lands on its end state (Node no-rAF fallback)', async () => {
  const a = el();
  const updates = [];
  const s = scene().fromTo(
    a,
    { opacity: 0 },
    { opacity: 1 },
    {
      physics: { attraction: 0.1, friction: 0.3 },
      onUpdate: (styles, progress, element) => updates.push([styles.opacity, progress, element]),
    }
  );

  const done = s.play();
  await flush();
  await done;
  assert.equal(a.style.opacity, '1', 'physics step settled at its end value');
  assert.deepEqual(updates, [['1', 1, a]], 'the snapped end-state invokes onUpdate');
});

test('a physics step animates through intermediate progress on the rAF path', async () => {
  let fakeNow = 0;
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb((fakeNow += 16.66)), 0);
  try {
    const a = el();
    const seen = [];
    const s = scene().fromTo(
      a,
      { opacity: 0 },
      { opacity: 1 },
      { physics: { attraction: 0.026, friction: 0.28 } }
    );

    const done = s.play();
    const poll = setInterval(() => seen.push(parseFloat(a.style.opacity)), 0);
    await done;
    clearInterval(poll);

    assert.equal(a.style.opacity, '1', 'settled at end value');
    assert.ok(
      seen.some((value) => value > 0 && value < 1),
      'intermediate frames were painted on the real spring path'
    );
  } finally {
    delete globalThis.requestAnimationFrame;
  }
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
