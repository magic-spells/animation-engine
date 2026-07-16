import { test } from 'node:test';
import assert from 'node:assert/strict';

import FrameEngine from '@magic-spells/frame-engine';
import { fillSparseKeyframes } from '../src/keyframes.js';

// The snow-demo regression: an opacity-only keyframe must NOT anchor the
// transform track to identity at that position (frame-engine's raw behavior);
// the transform must keep interpolating straight through it (CSS semantics).
test('a property missing from a keyframe interpolates through it', () => {
  const filled = fillSparseKeyframes({
    0: { opacity: 0, transform: 'translateX(0px)' },
    50: { opacity: 1 },
    100: { opacity: 1, transform: 'translateX(100px)' },
  });

  const fe = new FrameEngine(filled);
  const mid = fe.getFrame(0.5);
  assert.match(mid.transform, /translateX\(50(\.0*)?px\)/, 'transform passes straight through the opacity-only key');
  assert.equal(Number(mid.opacity), 1);

  // And no reversal anywhere: X must be monotonically increasing.
  let prev = -Infinity;
  for (let p = 0; p <= 1.0001; p += 0.05) {
    const x = parseFloat(/translateX\((-?[\d.]+)px\)/.exec(fe.getFrame(p).transform)[1]);
    assert.ok(x >= prev - 1e-6, `monotonic at ${Math.round(p * 100)}%: ${prev} -> ${x}`);
    prev = x;
  }
});

test('dense keyframes are returned untouched (same reference)', () => {
  const dense = {
    0: { opacity: 0, transform: 'translateY(0px)' },
    100: { opacity: 1, transform: 'translateY(10px)' },
  };
  assert.equal(fillSparseKeyframes(dense), dense);
});

test('a property specified at a single key is constant everywhere', () => {
  const filled = fillSparseKeyframes({
    0: { transform: 'translateY(0px)' },
    50: { opacity: 0.5 },
    100: { transform: 'translateY(100px)' },
  });
  assert.equal(filled[0].opacity, 0.5);
  assert.equal(filled[100].opacity, 0.5);
});

test('positions outside a property’s specified range clamp to its edge values', () => {
  const filled = fillSparseKeyframes({
    0: { transform: 'translateY(0px)' },
    20: { opacity: 0 },
    80: { opacity: 1 },
    100: { transform: 'translateY(100px)' },
  });
  assert.equal(Number(filled[0].opacity), 0, 'before first specified key holds first value');
  assert.equal(Number(filled[100].opacity), 1, 'after last specified key holds last value');
});
