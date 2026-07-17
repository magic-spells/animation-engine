/**
 * Lazy value helpers.
 *
 * The engine treats a function anywhere a value is expected as a "lazy value",
 * re-evaluated for each element at the start of each step every iteration. That
 * is what makes looping snow respawn at a fresh random spot each loop: the random
 * is resolved at step start, never baked in at build time.
 */

/**
 * Round to at most 2 decimal places, dropping trailing zeros.
 * @param {number} n
 * @returns {number}
 */
function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * A lazy random number in [min, max). With no unit, returns a raw number
 * (ideal for durations/delays). With a unit, returns a `${value}${unit}` string
 * rounded to 2 decimals (ideal for style values like `'42.31%'`).
 * @param {number} min
 * @param {number} max
 * @param {string} [unit] - Optional CSS unit; when present the result is a string.
 * @returns {() => number | string}
 */
export function rand(min, max, unit) {
  return () => {
    const v = min + Math.random() * (max - min);
    if (unit === undefined) return v;
    return `${round2(v)}${unit}`;
  };
}

/**
 * A lazy picker returning a random element of `array` on each call.
 * @template T
 * @param {T[]} array
 * @returns {() => T}
 */
export function pick(array) {
  return () => array[Math.floor(Math.random() * array.length)];
}

/**
 * Resolve a possibly-lazy value: call it if it's a function, otherwise return
 * it unchanged.
 * @template T
 * @param {T | ((el?: object, i?: number) => T)} value
 * @param {object} [el]
 * @param {number} [i]
 * @returns {T}
 */
export function resolveValue(value, el, i) {
  return typeof value === 'function' ? value(el, i) : value;
}

/**
 * Resolve every value in a style object (each may be lazy).
 * @param {Object<string, *>} styles
 * @param {object} [el]
 * @param {number} [i]
 * @returns {Object<string, string | number>}
 */
export function resolveStyles(styles, el, i) {
  const out = {};
  for (const key in styles) out[key] = resolveValue(styles[key], el, i);
  return out;
}

/**
 * Resolve a raw frame-engine keyframe map ({0: {...}, 100: {...}}), resolving
 * any lazy values inside each keyframe's style object.
 * @param {Object<number, Object<string, *>>} keyframes
 * @param {object} [el]
 * @param {number} [i]
 * @returns {Object<number, Object<string, string | number>>}
 */
export function resolveKeyframes(keyframes, el, i) {
  const out = {};
  for (const pct in keyframes) out[pct] = resolveStyles(keyframes[pct], el, i);
  return out;
}
