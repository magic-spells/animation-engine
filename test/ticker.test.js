import assert from 'node:assert/strict';
import test from 'node:test';

import { Ticker } from '../src/ticker.js';

// ---- Fake-rAF harness -------------------------------------------------------
// The shared singleton is driven by hand elsewhere (`ticker.tick`); these tests
// exercise the private rAF loop itself, so they stub `requestAnimationFrame`
// and `performance.now` on a FRESH Ticker instance. The stub captures the loop
// callback so each "frame" is fired manually with an explicit timestamp.

function withFakeRAF(fn) {
  const originalRAF = globalThis.requestAnimationFrame;
  const originalNow = performance.now;
  let frameCallback = null;
  globalThis.requestAnimationFrame = (cb) => {
    frameCallback = cb;
    return 1;
  };
  try {
    return fn({
      /** Set what `performance.now()` reports at subscribe time. */
      setNow(value) {
        performance.now = () => value;
      },
      /** Fire the captured rAF callback as a frame at `time`. */
      frame(time) {
        frameCallback(time);
      },
    });
  } finally {
    globalThis.requestAnimationFrame = originalRAF;
    performance.now = originalNow;
  }
}

// ---- Delta clamping ---------------------------------------------------------

test('a first frame whose timestamp predates the subscribe seed delivers 0, not a negative delta', () => {
  withFakeRAF(({ setNow, frame }) => {
    const t = new Ticker();
    const deltas = [];
    // Subscribe at now()=1000; rAF hands us a frame timestamp from BEFORE the
    // subscribe call (idle/occluded pages do this — observed −5ms in headless
    // Chromium). The delta must clamp to 0 instead of going negative.
    setNow(1000);
    const unsubscribe = t.subscribe((d) => deltas.push(d));
    frame(995);
    assert.deepEqual(deltas, [0]);
    unsubscribe();
  });
});

test('normal frames deliver the elapsed delta; long gaps still clamp to 64', () => {
  withFakeRAF(({ setNow, frame }) => {
    const t = new Ticker();
    const deltas = [];
    setNow(1000);
    const unsubscribe = t.subscribe((d) => deltas.push(d));
    frame(995); // clamped first frame reseeds #lastTime to 995
    frame(1011); // ordinary 16ms frame
    frame(2011); // 1000ms gap (backgrounded tab) clamps to 64
    assert.deepEqual(deltas, [0, 16, 64]);
    unsubscribe();
  });
});
