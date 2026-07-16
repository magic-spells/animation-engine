/**
 * Module-level shared state, keyed weakly by element so it never leaks memory
 * and survives across scenes (cross-scene interrupts work).
 */

/**
 * Element -> the last styles this engine wrote to it. Seeded by `.set()`,
 * `.fromTo()`, and completed steps; read by `.to()` / `.from()` to know where
 * to animate FROM. Whole-object last-write-wins.
 * @type {WeakMap<object, Object<string, string | number>>}
 */
export const writtenStyles = new WeakMap();

/**
 * Element -> the tween currently animating it. Starting a new tween on a busy
 * element cancels the prior one (last-write-wins interrupt semantics).
 * @type {WeakMap<object, { cancel: () => void }>}
 */
export const activeElementTweens = new WeakMap();

/**
 * Merge `styles` into the recorded last-written styles for `el`.
 * @param {object} el
 * @param {Object<string, string | number>} styles
 */
export function recordStyles(el, styles) {
  const prev = writtenStyles.get(el) || {};
  writtenStyles.set(el, { ...prev, ...styles });
}
