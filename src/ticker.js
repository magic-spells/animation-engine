/**
 * A single shared requestAnimationFrame loop that drives every time-based tween
 * in the process. Per-tween rAF loops are deliberately avoided — one loop fans
 * a delta out to all subscribers, which keeps timing coherent and cheap.
 *
 * The loop auto-starts when the first subscriber is added and auto-stops when
 * the last one leaves. In non-browser environments (no requestAnimationFrame)
 * the loop never schedules itself; callers drive it manually via `tick()`, which
 * is exactly how the test-suite injects deterministic time.
 */
class Ticker {
  #subscribers;
  #running;
  #lastTime;
  #rafId;

  constructor() {
    this.#subscribers = new Set();
    this.#running = false;
    this.#lastTime = 0;
    this.#rafId = null;

    /**
     * Global rate multiplier applied to every delta before it reaches
     * subscribers. Scenes layer their own `timeScale()` on top of this.
     * @type {number}
     */
    this.timeScale = 1;
  }

  /**
   * Whether a real requestAnimationFrame is available in this environment.
   * @returns {boolean}
   */
  get hasRAF() {
    return typeof requestAnimationFrame === 'function';
  }

  /**
   * Subscribe a callback to the shared loop. It receives the scaled delta in
   * milliseconds on every frame.
   * @param {(delta: number) => void} fn
   * @returns {() => void} An unsubscribe function.
   */
  subscribe(fn) {
    this.#subscribers.add(fn);
    if (!this.#running) this.#start();
    return () => this.unsubscribe(fn);
  }

  /**
   * Remove a previously subscribed callback. The loop stops once none remain.
   * @param {(delta: number) => void} fn
   */
  unsubscribe(fn) {
    this.#subscribers.delete(fn);
    if (this.#subscribers.size === 0) this.#stop();
  }

  /**
   * Fan a delta (ms) out to every subscriber, applying the global timeScale.
   * Called by the internal rAF loop, and directly by tests for fake time.
   * @param {number} delta - Raw delta in milliseconds.
   */
  tick(delta) {
    const scaled = delta * this.timeScale;
    // Snapshot so a subscriber that unsubscribes mid-tick can't corrupt iteration.
    for (const fn of [...this.#subscribers]) fn(scaled);
  }

  #now() {
    if (typeof performance !== 'undefined' && performance.now) return performance.now();
    return Date.now();
  }

  #start() {
    this.#running = true;
    this.#lastTime = this.#now();
    if (this.hasRAF) this.#rafId = requestAnimationFrame(this.#loop);
  }

  #stop() {
    this.#running = false;
    if (this.#rafId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.#rafId);
    }
    this.#rafId = null;
  }

  #loop = (time) => {
    if (!this.#running) return;
    // Clamp to 64ms so a backgrounded tab pauses rather than teleporting on return.
    const delta = Math.min(time - this.#lastTime, 64);
    this.#lastTime = time;
    this.tick(delta);
    if (this.#running && this.hasRAF) this.#rafId = requestAnimationFrame(this.#loop);
  };
}

/** The process-wide shared ticker singleton. */
const ticker = new Ticker();

export default ticker;
export { Ticker };
