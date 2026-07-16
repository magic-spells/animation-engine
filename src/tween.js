/**
 * A time-based tween: the atomic unit of animation for one element.
 *
 * It owns a FrameEngine instance (whole-style-object interpolation), a duration,
 * and an easing. Each shared-ticker frame it advances `elapsed`, converts it to
 * eased progress, and writes `getFrame(progress)` onto the element's style.
 * Eased progress is fed to frame-engine directly — overshoot easings extrapolate
 * for free.
 */

import ticker from './ticker.js';
import { activeElementTweens, claimElement, recordStyles } from './state.js';

export default class Tween {
  /**
   * @param {Object} config
   * @param {object} config.el - Element (or {style} test object) to animate.
   * @param {import('./frame-engine.js').default} config.frameEngine - Prebuilt FrameEngine.
   * @param {Object<string, string>} config.endStyles - getFrame(1), for recording + finish.
   * @param {number} config.duration - Duration in ms (<= 0 completes instantly).
   * @param {(t: number) => number} config.easing - Eased progress function.
   * @param {() => number} config.timeScale - Reads the owning scene's rate multiplier.
   */
  constructor({ el, frameEngine, endStyles, duration, easing, timeScale }) {
    this.el = el;
    this.fe = frameEngine;
    this.endStyles = endStyles;
    this.duration = duration;
    this.easing = easing;
    this.timeScale = timeScale;

    this.elapsed = 0;
    this._done = false;
    this._onTick = null;
    this._lastStyles = null;

    this.promise = new Promise((resolve) => {
      this._resolve = resolve;
    });
  }

  /**
   * Begin animating. Cancels any tween already running on this element
   * (last-write-wins). Resolves `this.promise` on completion or cancel.
   * @returns {Promise<void>}
   */
  start() {
    if (activeElementTweens.get(this.el) !== this) claimElement(this.el);
    activeElementTweens.set(this.el, this);

    if (this.duration <= 0) {
      this._lastStyles = this.endStyles;
      Object.assign(this.el.style, this.endStyles);
      this._finish();
      return this.promise;
    }

    // Paint the 0% frame immediately: without this, the first painted frame is
    // already one tick into the animation, which reads as a pop-in on looping
    // fade-ins (the element appears mid-fade instead of at its start state).
    this._apply(0);

    this._onTick = (delta) => this._tick(delta);
    ticker.subscribe(this._onTick);
    return this.promise;
  }

  _tick(delta) {
    if (this._done) return;
    this.elapsed += delta * this.timeScale();
    const t = this.elapsed / this.duration;
    if (t >= 1) {
      this._lastStyles = this.endStyles;
      Object.assign(this.el.style, this.endStyles);
      this._finish();
      return;
    }
    this._apply(t);
  }

  _apply(t) {
    const styles = this.fe.getFrame(this.easing(t));
    this._lastStyles = styles;
    Object.assign(this.el.style, styles);
  }

  _cleanup() {
    this._done = true;
    if (this._onTick) ticker.unsubscribe(this._onTick);
    if (activeElementTweens.get(this.el) === this) activeElementTweens.delete(this.el);
  }

  _finish() {
    if (this._done) return;
    this._cleanup();
    recordStyles(this.el, this.endStyles);
    this._resolve();
  }

  /**
   * Cancel the tween in place. The element keeps whatever was last written; the
   * step ends early and its scene proceeds to the next step.
   */
  cancel() {
    if (this._done) return;
    this._cleanup();
    if (this._lastStyles) recordStyles(this.el, this._lastStyles);
    this._resolve();
  }
}
