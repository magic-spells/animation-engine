/**
 * Sparse keyframe normalization.
 *
 * CSS @keyframes semantics: a property missing from a keyframe is interpolated
 * between the nearest keyframes that DO specify it. frame-engine instead
 * anchors a missing property to its parsed default at that key (e.g. a
 * `{ opacity: 0.9 }` keyframe silently pins `transform` to identity there),
 * which distorts every other track. So before keyframes reach frame-engine,
 * missing properties are filled in with their CSS-correct interpolated values.
 *
 * The fill uses frame-engine's own math: for each sparsely-specified property,
 * a mini single-property FrameEngine is built over only the keys that specify
 * it, then sampled at every other key position. Positions outside the
 * property's specified range hold its first/last authored value verbatim, so
 * an authored `none` end value survives to the completing write.
 */

import FrameEngine from '@magic-spells/frame-engine';

/**
 * Fill missing properties at each keyframe with per-property interpolated
 * values. Dense keyframe maps are returned untouched.
 * @param {Object<number, Object<string, string | number>>} keyframes
 * @returns {Object<number, Object<string, string | number>>}
 */
export function fillSparseKeyframes(keyframes) {
  const pcts = Object.keys(keyframes)
    .map(Number)
    .sort((a, b) => a - b);

  // Which keys specify each property?
  const specifiedAt = new Map();
  for (const pct of pcts) {
    for (const prop in keyframes[pct]) {
      if (!specifiedAt.has(prop)) specifiedAt.set(prop, []);
      specifiedAt.get(prop).push(pct);
    }
  }

  let sparse = false;
  for (const keys of specifiedAt.values()) {
    if (keys.length !== pcts.length) {
      sparse = true;
      break;
    }
  }
  if (!sparse) return keyframes;

  const out = {};
  for (const pct of pcts) out[pct] = { ...keyframes[pct] };

  for (const [prop, keys] of specifiedAt) {
    if (keys.length === pcts.length) continue;

    const lo = keys[0];
    const hi = keys[keys.length - 1];
    const mini = {};
    for (const p of keys) mini[p] = { [prop]: keyframes[p][prop] };
    const fe = new FrameEngine(mini);

    for (const pct of pcts) {
      if (out[pct][prop] !== undefined) continue;
      out[pct][prop] =
        pct < lo ? keyframes[lo][prop] : pct > hi ? keyframes[hi][prop] : fe.getFrame(pct / 100)[prop];
    }
  }

  return out;
}
