import assert from 'node:assert/strict';
import test from 'node:test';

import { easings, cubicBezier, resolveEasing } from '../src/easings.js';

const NAMES = [
  'linear',
  'ease',
  'ease-in',
  'ease-out',
  'ease-in-out',
  'back-in',
  'back-out',
  'back-in-out',
  'elastic-out',
  'bounce-out',
];

test('every named easing pins the endpoints 0->0 and 1->1', () => {
  for (const name of NAMES) {
    const fn = easings[name];
    assert.ok(Math.abs(fn(0) - 0) < 1e-9, `${name}(0) should be 0`);
    assert.ok(Math.abs(fn(1) - 1) < 1e-9, `${name}(1) should be 1`);
  }
});

test('linear is the identity', () => {
  assert.equal(easings.linear(0.5), 0.5);
  assert.equal(easings.linear(0.25), 0.25);
});

test('back-out overshoots past 1 mid-curve', () => {
  assert.ok(easings['back-out'](0.8) > 1, 'back-out(0.8) should exceed 1');
});

test('back-in dips below 0 mid-curve (anticipation)', () => {
  assert.ok(easings['back-in'](0.2) < 0, 'back-in(0.2) should be negative');
});

test('elastic-out oscillates past 1 before settling', () => {
  // Somewhere in the first oscillation it rises above 1.
  let exceeded = false;
  for (let t = 0.05; t < 0.6; t += 0.05) {
    if (easings['elastic-out'](t) > 1) exceeded = true;
  }
  assert.ok(exceeded, 'elastic-out should exceed 1 during its first swing');
});

test('ease-in starts slow, ease-out starts fast (known CSS behaviour)', () => {
  assert.ok(easings['ease-in'](0.25) < 0.25, 'ease-in lags at t=0.25');
  assert.ok(easings['ease-out'](0.25) > 0.25, 'ease-out leads at t=0.25');
});

test('cubic-bezier(0,0,1,1) matches the linear identity', () => {
  const linear = cubicBezier(0, 0, 1, 1);
  for (const t of [0.1, 0.25, 0.5, 0.75, 0.9]) {
    assert.ok(Math.abs(linear(t) - t) < 1e-3, `cubic-bezier linear at ${t}`);
  }
});

test('cubic-bezier solver is monotonic and bounded for the ease curve', () => {
  const ease = cubicBezier(0.25, 0.1, 0.25, 1);
  let prev = -Infinity;
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const y = ease(Math.min(t, 1));
    assert.ok(y >= prev - 1e-9, 'ease curve should be non-decreasing');
    assert.ok(y >= -1e-9 && y <= 1 + 1e-9, 'ease curve stays within 0..1');
    prev = y;
  }
});

test('resolveEasing handles names, cubic-bezier strings, and custom functions', () => {
  assert.equal(resolveEasing('ease'), easings.ease);

  const parsed = resolveEasing('cubic-bezier(0,0,1,1)');
  assert.ok(Math.abs(parsed(0.5) - 0.5) < 1e-3);

  const custom = (t) => t * t;
  assert.equal(resolveEasing(custom), custom);
});

test('resolveEasing falls back to linear for an unknown name', () => {
  const fn = resolveEasing('not-a-real-easing');
  assert.equal(fn(0.5), 0.5);
});

test('resolveEasing validates cubic-bezier coefficients before constructing a curve', () => {
  const invalid = resolveEasing('cubic-bezier(nope,0,1,1)');
  assert.equal(invalid(0.25), 0.25, 'invalid coefficients fall back to linear');

  const valid = resolveEasing('cubic-bezier(0.42,0,1,1)');
  assert.ok(valid(0.25) < 0.25, 'a valid ease-in cubic-bezier still curves');
});
