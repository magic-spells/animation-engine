/**
 * Scene: a declarative, chainable builder that collects a plain list of steps,
 * then plays them as an async chain (run step → await completion → next).
 *
 * It is an async chain rather than a fixed timeline because physics steps have
 * no duration — a spring finishes when it settles. That is the honest reason
 * there is no seek/scrub/reverse in v1.
 */

import EventEmitter from '@magic-spells/event-emitter';
import FrameEngine from '@magic-spells/frame-engine';

import ticker from './ticker.js';
import { resolveEasing } from './easings.js';
import { resolveValue, resolveStyles, resolveKeyframes } from './values.js';
import { fillSparseKeyframes } from './keyframes.js';
import { resolveTargets, resolveFromState, writeStyles } from './dom.js';
import { claimElement, recordStyles } from './state.js';
import Tween from './tween.js';
import PhysicsTween from './physics-tween.js';

const DEFAULT_DURATION = 400;
const DEFAULT_EASING = 'ease';

/**
 * Whether the user prefers reduced motion (guarded for non-browser).
 * @returns {boolean}
 */
function prefersReducedMotion() {
  return (
    typeof matchMedia === 'function' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Build a plain-object step builder that pushes into `steps`. Shared by the
 * Scene itself and by `.parallel()` sub-builders so the API is identical.
 * @param {object[]} steps
 * @returns {object}
 */
function makeBuilder(steps) {
  const b = {
    to(target, styles, opts = {}) {
      steps.push({ type: 'to', target, styles, opts });
      return b;
    },
    from(target, styles, opts = {}) {
      steps.push({ type: 'from', target, styles, opts });
      return b;
    },
    fromTo(target, fromStyles, toStyles, opts = {}) {
      steps.push({ type: 'fromTo', target, fromStyles, toStyles, opts });
      return b;
    },
    set(target, styles) {
      steps.push({ type: 'set', target, styles });
      return b;
    },
    frames(target, keyframes, opts = {}) {
      steps.push({ type: 'frames', target, keyframes, opts });
      return b;
    },
    wait(ms) {
      steps.push({ type: 'wait', ms });
      return b;
    },
    call(fn) {
      steps.push({ type: 'call', fn });
      return b;
    },
    parallel(builderFn) {
      const substeps = [];
      builderFn(makeBuilder(substeps));
      steps.push({ type: 'parallel', substeps });
      return b;
    },
    stagger(targets, config, opts = {}) {
      steps.push({ type: 'stagger', targets, config, staggerOpts: opts });
      return b;
    },
  };
  return b;
}

/**
 * Compute the per-index ordering rank for a stagger `from` mode. The rank is
 * multiplied by the interval to get each item's start offset.
 * @param {number} n
 * @param {string | number | undefined} from
 * @returns {number[]}
 */
function staggerOrder(n, from) {
  const idx = Array.from({ length: n }, (_, i) => i);
  let ranks;

  if (from === undefined || from === 'start') {
    ranks = idx;
  } else if (from === 'end') {
    ranks = idx.map((i) => n - 1 - i);
  } else if (from === 'center') {
    const center = (n - 1) / 2;
    ranks = idx.map((i) => Math.abs(i - center));
  } else if (from === 'edges') {
    const center = (n - 1) / 2;
    ranks = idx.map((i) => center - Math.abs(i - center));
  } else if (typeof from === 'number') {
    ranks = idx.map((i) => Math.abs(i - from));
  } else if (from === 'random') {
    ranks = [...idx];
    for (let i = ranks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ranks[i], ranks[j]] = [ranks[j], ranks[i]];
    }
  } else {
    ranks = idx;
  }

  const min = Math.min(...ranks);
  return min > 0 ? ranks.map((rank) => rank - min) : ranks;
}

export default class Scene extends EventEmitter {
  /**
   * @param {Object} [options]
   * @param {boolean | number} [options.loop=1] - true = infinite, number = iterations.
   * @param {number} [options.loopDelay=0] - ms between iterations.
   * @param {boolean} [options.alternate=false] - reverse step order + swap from/to on odd iterations.
   * @param {{ duration?: number|Function, easing?: string|Function }} [options.defaults]
   * @param {boolean} [options.respectReducedMotion=true]
   * @param {Function} [options.onBegin]
   * @param {Function} [options.onComplete]
   * @param {(iteration: number) => void} [options.onLoop]
   */
  constructor(options = {}) {
    super();

    this._steps = [];
    this._builder = makeBuilder(this._steps);

    this._loop = options.loop ?? 1;
    this._loopDelay = options.loopDelay ?? 0;
    this._alternate = options.alternate ?? false;
    this._defaults = options.defaults ?? {};
    this._respectReducedMotion = options.respectReducedMotion ?? true;

    this._onBegin = options.onBegin;
    this._onComplete = options.onComplete;
    this._onLoop = options.onLoop;

    this._timeScale = 1;

    // Playback state.
    this._playing = false;
    this._current = null;
    this._playPromise = null;
  }

  // ---- Builder methods (delegate, return this for chaining) ----

  /** @returns {this} */
  to(target, styles, opts) {
    this._builder.to(target, styles, opts);
    return this;
  }
  /** @returns {this} */
  from(target, styles, opts) {
    this._builder.from(target, styles, opts);
    return this;
  }
  /** @returns {this} */
  fromTo(target, fromStyles, toStyles, opts) {
    this._builder.fromTo(target, fromStyles, toStyles, opts);
    return this;
  }
  /** @returns {this} */
  set(target, styles) {
    this._builder.set(target, styles);
    return this;
  }
  /** @returns {this} */
  frames(target, keyframes, opts) {
    this._builder.frames(target, keyframes, opts);
    return this;
  }
  /** @returns {this} */
  wait(ms) {
    this._builder.wait(ms);
    return this;
  }
  /** @returns {this} */
  call(fn) {
    this._builder.call(fn);
    return this;
  }
  /** @returns {this} */
  parallel(builderFn) {
    this._builder.parallel(builderFn);
    return this;
  }
  /** @returns {this} */
  stagger(targets, config, opts) {
    this._builder.stagger(targets, config, opts);
    return this;
  }

  // ---- Controls ----

  /**
   * Get or set the per-scene rate multiplier. Affects durations, waits and
   * stagger intervals; physics steps are unaffected (they run on their own clock).
   * @param {number} [n]
   * @returns {number | this}
   */
  timeScale(n) {
    if (n === undefined) return this._timeScale;
    this._timeScale = n;
    return this;
  }

  /**
   * Play the scene. Returns a promise resolving when it completes, is stopped,
   * or is finished. Calling while playing returns the in-flight promise; calling
   * after completion restarts from the beginning. Rejects if a `.call()` callback,
   * lazy value, or lifecycle callback throws (or returns a rejected promise); the
   * scene is safe to play again afterwards.
   * @returns {Promise<void>}
   */
  play() {
    if (this._current && !this._current.settled) return this._playPromise;

    const run = {
      stopped: false,
      finished: false,
      settled: false,
      resolve: null,
      reject: null,
      active: new Set(),
    };
    this._current = run;
    this._playing = true;
    this._playPromise = new Promise((resolve, reject) => {
      run.resolve = resolve;
      run.reject = reject;
    });

    this._start(run);

    return this._playPromise;
  }

  /**
   * Freeze in place: cancel running tweens where they are, resolve the promise,
   * emit 'stop'. Remaining steps do not run.
   */
  stop() {
    const run = this._current;
    if (!run || run.settled) return;
    run.stopped = true;
    this._cancelActive(run);
    this._settle(run, 'stop');
  }

  /**
   * Jump to the end: synchronously apply every step's end state, resolve the
   * promise, emit 'complete'. `.call()` hooks are not invoked (this applies
   * visual end states only).
   */
  finish() {
    const run = this._current;
    if (!run || run.settled) return;
    run.finished = true;
    this._cancelActive(run);
    this._applyEndStates();
    this._settle(run, 'complete');
  }

  // ---- Scheduler ----

  _start(run) {
    this._execute(run).then(
      () => this._settle(run, 'complete'),
      (err) => this._fail(run, err)
    );
  }

  async _execute(run) {
    this.emit('begin');
    if (this._onBegin) this._onBegin();

    if (this._respectReducedMotion && prefersReducedMotion()) {
      this._applyEndStates();
      return;
    }

    const total = this._loop === true ? Infinity : typeof this._loop === 'number' ? this._loop : 1;

    for (let i = 0; i < total; i++) {
      if (run.stopped || run.finished) break;

      const reversed = this._alternate && i % 2 === 1;
      const steps = reversed ? [...this._steps].reverse() : this._steps;

      for (const step of steps) {
        if (run.stopped || run.finished) break;
        await this._runStep(step, reversed, run);
        if (run.stopped || run.finished) break;
      }

      if (run.stopped || run.finished) break;

      const hasMore = i < total - 1;
      if (hasMore) {
        // Stop leaked infinite loops on detached nodes.
        if (this._allTargetsDisconnected()) break;

        this.emit('loop', i + 1);
        if (this._onLoop) this._onLoop(i + 1);

        if (this._loopDelay > 0) {
          await this._scaledWait(this._loopDelay, run).promise;
          if (run.stopped || run.finished) break;
        }

        // Yield a real task each iteration so zero-cost infinite loops can't
        // starve the event loop (empty scenes, selectors matching nothing).
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (run.stopped || run.finished) break;
      }
    }
  }

  /**
   * Run a single step to completion.
   * @param {object} step
   * @param {boolean} reversed
   * @param {object} run
   * @returns {Promise<void>}
   */
  async _runStep(step, reversed, run) {
    switch (step.type) {
      case 'wait':
        await this._scaledWait(resolveValue(step.ms) || 0, run).promise;
        return;

      case 'set':
        this._applySet(step);
        return;

      case 'call': {
        const r = step.fn();
        if (r && typeof r.then === 'function') await r;
        return;
      }

      case 'to':
      case 'from':
      case 'fromTo':
      case 'frames':
        await this._runTween(step, reversed, run);
        return;

      case 'parallel':
        await Promise.all(step.substeps.map((s) => this._runStep(s, reversed, run)));
        return;

      case 'stagger':
        await this._runStagger(step, reversed, run);
        return;
    }
  }

  _applySet(step) {
    resolveTargets(step.target).forEach((el, i) => {
      const styles = resolveStyles(step.styles, el, i);
      claimElement(el);
      writeStyles(el, styles);
      recordStyles(el, styles);
    });
  }

  async _runTween(step, reversed, run) {
    const els = resolveTargets(step.target);
    if (els.length === 0) return;

    const opts = step.opts || {};
    const isPhysics = !!opts.physics;
    const delay = resolveValue(opts.delay) || 0;
    const duration = isPhysics
      ? 0
      : resolveValue(opts.duration) ?? resolveValue(this._defaults.duration) ?? DEFAULT_DURATION;
    const easing = resolveEasing(opts.easing ?? this._defaults.easing ?? DEFAULT_EASING);

    if (delay > 0) {
      await this._scaledWait(delay, run).promise;
      if (run.stopped || run.finished) return;
    }

    const proms = els.map((el, i) => {
      const resolved = this._resolveStepValues(step, el, i);
      claimElement(el);
      const { fe, endStyles } = this._buildFrameEngine(step, el, reversed, resolved);
      const tween = isPhysics
        ? new PhysicsTween({
            el,
            frameEngine: fe,
            endStyles,
            physics: opts.physics,
            onUpdate: opts.onUpdate,
          })
        : new Tween({
            el,
            frameEngine: fe,
            endStyles,
            duration,
            easing,
            timeScale: () => this._timeScale,
            onUpdate: opts.onUpdate,
          });
      const handle = { cancel: () => tween.cancel() };
      run.active.add(handle);
      return tween.start().then(() => run.active.delete(handle));
    });

    await Promise.all(proms);
  }

  async _runStagger(step, reversed, run) {
    const els = resolveTargets(step.targets);
    if (els.length === 0) return;

    const so = step.staggerOpts || {};
    const interval = resolveValue(so.interval) || 0;
    const jitter = so.jitter || 0;
    const order = staggerOrder(els.length, so.from);

    const proms = els.map((el, i) =>
      this._runStaggerItem(step, el, i, order[i], interval, jitter, reversed, run)
    );
    await Promise.all(proms);
  }

  async _runStaggerItem(step, el, i, orderRank, interval, jitter, reversed, run) {
    const cfg = typeof step.config === 'function' ? step.config(el, i) : { ...step.config };

    let delay = orderRank * interval + (resolveValue(cfg.delay) || 0);
    if (jitter) delay += (Math.random() * 2 - 1) * jitter * interval;
    if (delay < 0) delay = 0;

    if (delay > 0) {
      await this._scaledWait(delay, run).promise;
      if (run.stopped || run.finished) return;
    }

    const isPhysics = !!cfg.physics;
    const duration = isPhysics
      ? 0
      : resolveValue(cfg.duration) ?? resolveValue(this._defaults.duration) ?? DEFAULT_DURATION;
    const easing = resolveEasing(cfg.easing ?? this._defaults.easing ?? DEFAULT_EASING);

    claimElement(el);
    const { fe, endStyles } = this._buildFrameEngineFromConfig(cfg, el, reversed, i);
    const tween = isPhysics
      ? new PhysicsTween({
          el,
          frameEngine: fe,
          endStyles,
          physics: cfg.physics,
          onUpdate: cfg.onUpdate,
        })
      : new Tween({
          el,
          frameEngine: fe,
          endStyles,
          duration,
          easing,
          timeScale: () => this._timeScale,
          onUpdate: cfg.onUpdate,
        });

    const handle = { cancel: () => tween.cancel() };
    run.active.add(handle);
    await tween.start();
    run.active.delete(handle);
  }

  // ---- FrameEngine construction ----

  /**
   * Resolve the lazy style/keyframe values for one element at step start.
   * @param {object} step
   * @param {object} el
   * @param {number} i
   * @returns {object}
   */
  _resolveStepValues(step, el, i) {
    switch (step.type) {
      case 'to':
      case 'from':
        return { styles: resolveStyles(step.styles, el, i) };
      case 'fromTo':
        return {
          fromStyles: resolveStyles(step.fromStyles, el, i),
          toStyles: resolveStyles(step.toStyles, el, i),
        };
      case 'frames':
        return { keyframes: fillSparseKeyframes(resolveKeyframes(step.keyframes, el, i)) };
      default:
        return {};
    }
  }

  /**
   * Build a FrameEngine (+ its end styles) for one element of a tween step.
   * @returns {{ fe: FrameEngine, endStyles: Object<string, string> }}
   */
  _buildFrameEngine(step, el, reversed, resolved) {
    let keyframes;

    if (step.type === 'frames') {
      keyframes = reversed ? reverseKeyframes(resolved.keyframes) : resolved.keyframes;
    } else {
      let fromStyles;
      let toStyles;

      if (step.type === 'to') {
        toStyles = resolved.styles;
        fromStyles = resolveFromState(el, toStyles);
      } else if (step.type === 'from') {
        fromStyles = resolved.styles;
        toStyles = resolveFromState(el, fromStyles);
      } else {
        // fromTo
        fromStyles = resolved.fromStyles;
        toStyles = resolved.toStyles;
      }

      if (reversed) [fromStyles, toStyles] = [toStyles, fromStyles];
      keyframes = { 0: fromStyles, 100: toStyles };
    }

    const fe = new FrameEngine(keyframes);
    return { fe, endStyles: fe.getFrame(1) };
  }

  /**
   * Build a FrameEngine from a stagger item config.
   * @returns {{ fe: FrameEngine, endStyles: Object<string, string> }}
   */
  _buildFrameEngineFromConfig(cfg, el, reversed, i) {
    let keyframes;

    if (cfg.keyframes) {
      const kf = fillSparseKeyframes(resolveKeyframes(cfg.keyframes, el, i));
      keyframes = reversed ? reverseKeyframes(kf) : kf;
    } else {
      let fromStyles = cfg.from ? resolveStyles(cfg.from, el, i) : null;
      let toStyles = cfg.to ? resolveStyles(cfg.to, el, i) : null;

      if (fromStyles && !toStyles) toStyles = resolveFromState(el, fromStyles);
      else if (!fromStyles && toStyles) fromStyles = resolveFromState(el, toStyles);
      else if (!fromStyles && !toStyles) {
        fromStyles = {};
        toStyles = {};
      }

      if (reversed) [fromStyles, toStyles] = [toStyles, fromStyles];
      keyframes = { 0: fromStyles, 100: toStyles };
    }

    const fe = new FrameEngine(keyframes);
    return { fe, endStyles: fe.getFrame(1) };
  }

  // ---- Finish / reduced-motion end states ----

  _applyEndStates() {
    for (const step of this._steps) this._applyStepEnd(step);
  }

  _applyStepEnd(step) {
    switch (step.type) {
      case 'set':
        this._applySet(step);
        return;

      case 'to':
      case 'from':
      case 'fromTo':
      case 'frames': {
        resolveTargets(step.target).forEach((el, i) => {
          const resolved = this._resolveStepValues(step, el, i);
          claimElement(el);
          const { endStyles } = this._buildFrameEngine(step, el, false, resolved);
          writeStyles(el, endStyles);
          recordStyles(el, endStyles);
          if (step.opts.onUpdate) step.opts.onUpdate(endStyles, 1, el);
        });
        return;
      }

      case 'parallel':
        for (const s of step.substeps) this._applyStepEnd(s);
        return;

      case 'stagger': {
        const els = resolveTargets(step.targets);
        els.forEach((el, i) => {
          const cfg = typeof step.config === 'function' ? step.config(el, i) : { ...step.config };
          claimElement(el);
          const { endStyles } = this._buildFrameEngineFromConfig(cfg, el, false, i);
          writeStyles(el, endStyles);
          recordStyles(el, endStyles);
          if (cfg.onUpdate) cfg.onUpdate(endStyles, 1, el);
        });
        return;
      }

      // 'wait' and 'call' have no visual end state.
    }
  }

  // ---- Waits / lifecycle plumbing ----

  /**
   * A cancelable, scene-timeScale-aware wait driven by the shared ticker.
   * @param {number} ms
   * @param {object} run
   * @returns {{ promise: Promise<void>, cancel: () => void }}
   */
  _scaledWait(ms, run) {
    let acc = 0;
    let done = false;
    let resolveFn;
    const promise = new Promise((resolve) => {
      resolveFn = resolve;
    });

    const finish = () => {
      if (done) return;
      done = true;
      ticker.unsubscribe(onTick);
      run.active.delete(handle);
      resolveFn();
    };

    const onTick = (delta) => {
      if (done) return;
      acc += delta * this._timeScale;
      if (acc >= ms) finish();
    };

    const handle = { cancel: finish };
    run.active.add(handle);

    if (ms <= 0) {
      finish();
    } else {
      ticker.subscribe(onTick);
    }

    return { promise, cancel: finish };
  }

  _cancelActive(run) {
    const handles = [...run.active];
    run.active.clear();
    for (const h of handles) h.cancel();
  }

  _settle(run, kind) {
    if (run.settled) return;
    run.settled = true;
    if (this._current === run) {
      this._current = null;
      this._playing = false;
    }
    const resolve = run.resolve;
    try {
      if (kind === 'complete') {
        this.emit('complete');
        if (this._onComplete) this._onComplete();
      } else if (kind === 'stop') {
        this.emit('stop');
      }
    } finally {
      resolve();
    }
  }

  _fail(run, err) {
    if (run.settled) {
      console.error('AnimationEngine: error after scene settled:', err);
      return;
    }
    run.settled = true;
    if (this._current === run) {
      this._current = null;
      this._playing = false;
    }
    this._cancelActive(run);
    run.reject(err);
  }

  /**
   * True if every element target across all steps is disconnected from the DOM.
   * Non-element targets (plain objects without isConnected) are skipped.
   * @returns {boolean}
   */
  _allTargetsDisconnected() {
    const els = this._collectElements();
    const checkable = els.filter((e) => e && typeof e.isConnected === 'boolean');
    if (checkable.length === 0) return false;
    return checkable.every((e) => e.isConnected === false);
  }

  _collectElements(steps = this._steps, out = []) {
    for (const step of steps) {
      if (step.type === 'parallel') {
        this._collectElements(step.substeps, out);
      } else if (step.type === 'stagger') {
        for (const el of resolveTargets(step.targets)) out.push(el);
      } else if (step.target !== undefined) {
        for (const el of resolveTargets(step.target)) out.push(el);
      }
    }
    return out;
  }
}

/**
 * Reverse a keyframe map's percent positions (100 - p), for alternate playback.
 * @param {Object<number, object>} keyframes
 * @returns {Object<number, object>}
 */
function reverseKeyframes(keyframes) {
  const out = {};
  for (const pct in keyframes) out[100 - Number(pct)] = keyframes[pct];
  return out;
}
