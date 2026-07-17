import assert from 'node:assert/strict';
import test from 'node:test';

import { rand, pick, resolveValue, resolveStyles, resolveKeyframes } from '../src/values.js';

test('rand returns a lazy function producing numbers in range', () => {
  const r = rand(0, 10);
  assert.equal(typeof r, 'function');
  for (let i = 0; i < 50; i++) {
    const v = r();
    assert.ok(v >= 0 && v < 10, 'value in [0, 10)');
  }
});

test('rand is re-evaluated on each call (laziness), not baked once', () => {
  const r = rand(0, 1000);
  const values = new Set();
  for (let i = 0; i < 20; i++) values.add(r());
  assert.ok(values.size > 1, 'multiple invocations yield different values');
});

test('rand with min === max is stable', () => {
  const r = rand(5, 5);
  assert.equal(r(), 5);
  assert.equal(r(), 5);
});

test('rand with a unit returns a string rounded to 2 decimals', () => {
  const r = rand(0, 100, '%');
  for (let i = 0; i < 20; i++) {
    const v = r();
    assert.equal(typeof v, 'string');
    assert.match(v, /%$/);
    const num = parseFloat(v);
    assert.ok(num >= 0 && num < 100);
    // No more than 2 decimal places.
    const decimals = v.replace('%', '').split('.')[1];
    if (decimals) assert.ok(decimals.length <= 2, `<=2 decimals in ${v}`);
  }
});

test('pick returns a lazy function selecting from the array', () => {
  const arr = ['a', 'b', 'c'];
  const p = pick(arr);
  assert.equal(typeof p, 'function');
  for (let i = 0; i < 30; i++) assert.ok(arr.includes(p()));
});

test('pick spreads across the array over many calls', () => {
  const arr = ['a', 'b', 'c', 'd'];
  const p = pick(arr);
  const seen = new Set();
  for (let i = 0; i < 50; i++) seen.add(p());
  assert.ok(seen.size > 1, 'more than one element gets picked');
});

test('resolveValue calls functions and passes through plain values', () => {
  assert.equal(resolveValue(5), 5);
  assert.equal(resolveValue('x'), 'x');
  assert.equal(resolveValue(() => 42), 42);
});

test('resolveStyles resolves each (possibly lazy) style value', () => {
  const out = resolveStyles({ opacity: 0, left: () => '10px', top: '2px' });
  assert.deepEqual(out, { opacity: 0, left: '10px', top: '2px' });
});

test('value resolvers forward the element and index to functions', () => {
  const element = {};
  const value = (receivedElement, receivedIndex) => {
    assert.equal(receivedElement, element);
    assert.equal(receivedIndex, 2);
    return '30px';
  };

  assert.equal(resolveValue(value, element, 2), '30px');
  assert.deepEqual(resolveStyles({ left: value }, element, 2), { left: '30px' });
  assert.deepEqual(resolveKeyframes({ 100: { left: value } }, element, 2), {
    100: { left: '30px' },
  });
});
