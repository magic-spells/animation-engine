/**
 * @magic-spells/animation-engine — type declarations.
 */

/** Keyframe map: percent positions (0-100) → CSS style objects (camelCase props). */
export type Keyframes = Record<number, Record<string, StyleValue>>;

/** A style value may be a string, number, or a per-element lazy function producing one. */
export type StyleValue = string | number | ((el?: Element, i?: number) => string | number);

/** A style object whose values may be lazy. CSS custom-property (`--name`) keys are supported. */
export type Styles = Record<string, StyleValue>;

/** Anything accepted as an animation target. */
export type Target =
  | Element
  | Element[]
  | NodeList
  | ArrayLike<Element>
  | string
  | { style: Record<string, any>; isConnected?: boolean };

/** An easing: a named preset, a `cubic-bezier(...)` string, or a custom function. */
export type Easing =
  | 'linear'
  | 'ease'
  | 'ease-in'
  | 'ease-out'
  | 'ease-in-out'
  | 'back-in'
  | 'back-out'
  | 'back-in-out'
  | 'elastic-out'
  | 'bounce-out'
  | (string & {})
  | ((t: number) => number);

/** A value that may be provided lazily as a zero-arg function. */
export type Lazy<T> = T | (() => T);

/** Spring parameters for a physics step (0 < value < 1). */
export interface PhysicsConfig {
  attraction?: number;
  friction?: number;
}

/** Per-step options. `physics` replaces `duration` + `easing`. */
export interface StepOptions {
  duration?: Lazy<number>;
  easing?: Easing;
  delay?: Lazy<number>;
  physics?: PhysicsConfig;
  onUpdate?: (styles: Record<string, string>, progress: number, el: Element) => void;
}

/** Config for a stagger item (or the return of a `(el, i) => config` function). */
export interface StaggerItemConfig {
  from?: Styles;
  to?: Styles;
  keyframes?: Keyframes;
  duration?: Lazy<number>;
  easing?: Easing;
  delay?: Lazy<number>;
  physics?: PhysicsConfig;
  onUpdate?: (styles: Record<string, string>, progress: number, el: Element) => void;
}

/** Stagger sequencing options. */
export interface StaggerOptions {
  interval?: Lazy<number>;
  jitter?: number;
  from?: 'start' | 'end' | 'center' | 'edges' | 'random' | number;
}

/** Scene construction options. */
export interface SceneOptions {
  /** true = infinite; a number = total iterations. Default 1. */
  loop?: boolean | number;
  /** ms between iterations. Default 0. */
  loopDelay?: number;
  /** Reverse step order and swap from/to on odd iterations. Default false. */
  alternate?: boolean;
  /** Defaults inherited by steps. */
  defaults?: { duration?: Lazy<number>; easing?: Easing };
  /** Apply end states instantly under prefers-reduced-motion. Default true. */
  respectReducedMotion?: boolean;
  onBegin?: () => void;
  onComplete?: () => void;
  onLoop?: (iteration: number) => void;
}

/** A sub-builder passed to `.parallel()`, exposing the same step methods. */
export interface Builder {
  to(target: Target, styles: Styles, opts?: StepOptions): Builder;
  from(target: Target, styles: Styles, opts?: StepOptions): Builder;
  fromTo(target: Target, fromStyles: Styles, toStyles: Styles, opts?: StepOptions): Builder;
  set(target: Target, styles: Styles): Builder;
  frames(target: Target, keyframes: Keyframes, opts?: StepOptions): Builder;
  wait(ms: Lazy<number>): Builder;
  call(fn: () => void | Promise<unknown>): Builder;
  parallel(build: (b: Builder) => void): Builder;
  stagger(
    targets: Target,
    config: StaggerItemConfig | ((el: Element, i: number) => StaggerItemConfig),
    opts?: StaggerOptions
  ): Builder;
}

/**
 * A declarative animation sequence. Extends EventEmitter; emits
 * 'begin' | 'complete' | 'loop' | 'stop'.
 */
export class Scene {
  constructor(options?: SceneOptions);

  on(event: 'begin' | 'complete' | 'stop', listener: () => void): this;
  on(event: 'loop', listener: (iteration: number) => void): this;
  off(event: string, listener: (...args: any[]) => void): this;
  emit(event: string, ...args: any[]): boolean;
  removeAllListeners(event?: string): this;

  to(target: Target, styles: Styles, opts?: StepOptions): this;
  from(target: Target, styles: Styles, opts?: StepOptions): this;
  fromTo(target: Target, fromStyles: Styles, toStyles: Styles, opts?: StepOptions): this;
  set(target: Target, styles: Styles): this;
  frames(target: Target, keyframes: Keyframes, opts?: StepOptions): this;
  wait(ms: Lazy<number>): this;
  call(fn: () => void | Promise<unknown>): this;
  parallel(build: (b: Builder) => void): this;
  stagger(
    targets: Target,
    config: StaggerItemConfig | ((el: Element, i: number) => StaggerItemConfig),
    opts?: StaggerOptions
  ): this;

  /** Get (no arg) or set (with arg) the per-scene rate multiplier. */
  timeScale(): number;
  timeScale(n: number): this;

  /**
   * Play; resolves when the scene completes, is stopped, or is finished.
   * Rejects if a call callback, lazy value, or lifecycle callback throws or
   * returns a rejected promise; the scene can be played again afterwards.
   */
  play(): Promise<void>;
  /** Freeze in place; resolves the promise and emits 'stop'. */
  stop(): void;
  /** Apply every remaining end state; resolves the promise and emits 'complete'. */
  finish(): void;
}

/** The shared rAF loop driving all time-based tweens. */
export interface Ticker {
  timeScale: number;
  readonly hasRAF: boolean;
  subscribe(fn: (delta: number) => void): () => void;
  unsubscribe(fn: (delta: number) => void): void;
  tick(delta: number): void;
}

/** Create a new Scene. */
export function scene(options?: SceneOptions): Scene;

/** A lazy random in [min, max). With a unit, returns a `${value}${unit}` string. */
export function rand(min: number, max: number, unit: string): () => string;
export function rand(min: number, max: number): () => number;

/** A lazy picker returning a random element of `array` on each call. */
export function pick<T>(array: T[]): () => T;

/** The shared ticker singleton (has its own global timeScale). */
export const ticker: Ticker;

/** Named easing functions. */
export const easings: Record<string, (t: number) => number>;

/** Build a cubic-bezier timing function (CSS `cubic-bezier()` semantics). */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number;

/** Resolve an easing option (name | cubic-bezier string | function) to a function. */
export function resolveEasing(easing: Easing): (t: number) => number;

/**
 * Normalize sparse keyframes to CSS @keyframes semantics: a property missing
 * from a keyframe is interpolated between the nearest keyframes that specify
 * it. Applied automatically to every `.frames()` step; exported for direct use
 * with a raw FrameEngine.
 */
export function fillSparseKeyframes(
  keyframes: Record<number, Record<string, string | number>>
): Record<number, Record<string, string | number>>;
