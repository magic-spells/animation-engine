/**
 * @magic-spells/animation-engine
 *
 * Declarative animation sequencing engine — chainable scenes with easing,
 * physics, staggers, loops and randomness for the magic-spells ecosystem.
 *
 * It composes the ecosystem's two interpolation primitives:
 *   - @magic-spells/frame-engine  — pure getFrame(pos) → interpolated CSS.
 *   - @magic-spells/physics-engine — a spring that produces progress over time.
 * animation-engine owns everything neither has: time, easing, sequencing,
 * repetition, randomness and lifecycle.
 */

import Scene from './scene.js';
import ticker from './ticker.js';
import { rand, pick } from './values.js';
import { easings, cubicBezier, resolveEasing } from './easings.js';
import { fillSparseKeyframes } from './keyframes.js';

/**
 * Create a new Scene. See the Scene constructor for the options shape.
 * @param {object} [options]
 * @returns {Scene}
 */
function scene(options) {
  return new Scene(options);
}

export { scene, Scene, rand, pick, ticker, easings, cubicBezier, resolveEasing, fillSparseKeyframes };
