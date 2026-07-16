/**
 * DOM-facing helpers: target resolution and from-state derivation.
 *
 * Everything here is guarded so the engine runs in Node (tests). The only truly
 * DOM-dependent operations are `document.querySelectorAll` (selector targets)
 * and `getComputedStyle` (from-state fallback); both degrade gracefully.
 */

import { writtenStyles } from './state.js';

let _transformFallbackWarned = false;

/**
 * Is this a real DOM element (as opposed to a plain test object)?
 * @param {*} el
 * @returns {boolean}
 */
function isRealElement(el) {
  return typeof Element !== 'undefined' && el instanceof Element;
}

/**
 * Normalise any accepted target form into an array of element-like objects.
 * Accepts: a CSS selector string, a single Element (or plain {style} object),
 * an Element[]/NodeList, or null.
 * @param {string | object | ArrayLike<object> | null | undefined} target
 * @returns {object[]}
 */
export function resolveTargets(target) {
  if (target == null) return [];

  if (typeof target === 'string') {
    if (typeof document !== 'undefined' && document.querySelectorAll) {
      return Array.from(document.querySelectorAll(target));
    }
    return [];
  }

  if (Array.isArray(target)) return target;

  // NodeList / HTMLCollection: array-like, but not a style-bearing element.
  if (
    typeof target.length === 'number' &&
    typeof target !== 'function' &&
    target.style === undefined &&
    target.nodeType === undefined
  ) {
    return Array.from(target);
  }

  return [target];
}

/**
 * A sensible identity/default for a property when no prior state is known.
 * @param {string} prop
 * @returns {string}
 */
function defaultFor(prop) {
  if (prop === 'opacity') return '1';
  return '0';
}

/**
 * Derive the FROM state for `el` for exactly the properties present in
 * `toStyles`. Resolution order per property:
 *   1. The last styles the engine wrote to this element (the WeakMap).
 *   2. Computed style (real browser elements only).
 *   3. The element's inline style value, else a default.
 *
 * Caveat: computed `transform` serialises to a matrix, which cannot be
 * interpolated against transform functions. In that case (and in the no-prior-
 * state Node fallback) the transform is treated as a discrete jump: FROM is set
 * equal to the TO value so the property snaps rather than tweening from a
 * matrix. Use `.fromTo()` or seed with `.set()` for a real first transform tween.
 *
 * @param {object} el
 * @param {Object<string, string | number>} toStyles
 * @returns {Object<string, string | number>}
 */
export function resolveFromState(el, toStyles) {
  const written = writtenStyles.get(el);
  const from = {};

  for (const prop in toStyles) {
    if (written && prop in written) {
      from[prop] = written[prop];
      continue;
    }

    if (prop === 'transform') {
      // No tracked prior transform — jump instead of tweening from a matrix.
      if (!_transformFallbackWarned) {
        _transformFallbackWarned = true;
        console.warn(
          'AnimationEngine: no tracked prior transform; first .to({transform}) will jump. ' +
            'Use .fromTo() or seed with .set() for a smooth first transform tween.'
        );
      }
      from[prop] = toStyles[prop];
      continue;
    }

    if (isRealElement(el) && typeof getComputedStyle === 'function') {
      const cs = getComputedStyle(el);
      const val = cs[prop];
      from[prop] = val !== undefined && val !== '' ? val : defaultFor(prop);
      continue;
    }

    const inline = el.style ? el.style[prop] : undefined;
    from[prop] = inline !== undefined && inline !== '' ? inline : defaultFor(prop);
  }

  return from;
}
