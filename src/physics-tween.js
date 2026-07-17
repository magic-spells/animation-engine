/**
 * A physics-driven tween: same interface as Tween, but progress comes from a
 * PhysicsEngine spring instead of a clock. A spring has no duration — it
 * finishes when it settles — so this completes on the engine's settle promise.
 *
 * The spring's emitted `change.progress` is mapped straight into `getFrame`.
 * Progress overshoots past 1 mid-flight; that's desired — frame-engine
 * extrapolates it into real overshoot. Physics steps ignore timeScale (the
 * spring runs on its own internal clock).
 */

import PhysicsEngine from '@magic-spells/physics-engine';
import { writeStyles } from './dom.js';
import { activeElementTweens, claimElement, recordStyles } from './state.js';

export default class PhysicsTween {
  /**
   * @param {Object} config
   * @param {object} config.el
   * @param {import('./frame-engine.js').default} config.frameEngine
   * @param {Object<string, string>} config.endStyles
   * @param {{ attraction?: number, friction?: number }} config.physics
   * @param {(styles: Object<string, string>, progress: number, el: object) => void} [config.onUpdate]
   */
  constructor({ el, frameEngine, endStyles, physics, onUpdate }) {
    this.el = el;
    this.fe = frameEngine;
    this.endStyles = endStyles;
    this.physics = physics || {};
    this.onUpdate = onUpdate;

    this._done = false;
    this.engine = null;
    this._onChange = null;
    this._lastStyles = null;

    this.promise = new Promise((resolve) => {
      this._resolve = resolve;
    });
  }

  /**
   * Begin the spring. Cancels any tween already running on this element.
   * @returns {Promise<void>}
   */
  start() {
    if (activeElementTweens.get(this.el) !== this) claimElement(this.el);
    activeElementTweens.set(this.el, this);

    // No rAF (e.g. Node) — springs can't run; snap to the settled end state.
    if (typeof requestAnimationFrame !== 'function') {
      this._lastStyles = this.endStyles;
      writeStyles(this.el, this.endStyles);
      if (this.onUpdate) this.onUpdate(this.endStyles, 1, this.el);
      this._finish();
      return this.promise;
    }

    this.engine = new PhysicsEngine(this.physics);
    this._onChange = ({ progress }) => {
      if (this._done) return;
      this._apply(progress);
    };
    this.engine.on('change', this._onChange);

    // Paint the 0% frame immediately (the spring's first change event arrives a
    // frame later) — same pop-in guard as the time-based Tween.
    this._apply(0);

    // A superseded animateTo resolves without a 'complete' event, so we rely on
    // the promise, never the event, to know we're finished.
    this.engine.animateTo(0, 1, 0).then(() => {
      if (this._done) return;
      this._lastStyles = this.endStyles;
      writeStyles(this.el, this.endStyles);
      if (this.onUpdate) this.onUpdate(this.endStyles, 1, this.el);
      this._finish();
    });

    return this.promise;
  }

  _apply(progress) {
    const styles = this.fe.getFrame(progress);
    this._lastStyles = styles;
    writeStyles(this.el, styles);
    if (this.onUpdate) this.onUpdate(styles, progress, this.el);
  }

  _cleanup() {
    this._done = true;
    if (this.engine && this._onChange) this.engine.off('change', this._onChange);
    if (activeElementTweens.get(this.el) === this) activeElementTweens.delete(this.el);
  }

  _finish() {
    if (this._done) return;
    this._cleanup();
    recordStyles(this.el, this.endStyles);
    this._resolve();
  }

  /** Cancel the spring in place; the element keeps its last written styles. */
  cancel() {
    if (this._done) return;
    this._cleanup();
    if (this.engine) this.engine.stop();
    if (this._lastStyles) recordStyles(this.el, this._lastStyles);
    this._resolve();
  }
}
