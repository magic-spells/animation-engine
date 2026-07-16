/**
 * Easing functions. Each maps a linear progress `t` (0..1) to an eased value.
 *
 * Several presets (back-*, elastic-out) intentionally return values outside the
 * 0..1 range mid-curve — frame-engine extrapolates those into real overshoot,
 * giving a spring-like feel with a fixed, sequenceable duration (unlike a true
 * physics step, which has no duration at all).
 */

const BACK_S = 1.70158;
const BACK_S2 = BACK_S * 1.525;

/**
 * Build a cubic-bezier timing function, mirroring the CSS `cubic-bezier()`
 * timing curve. Uses Newton-Raphson to invert x(t), falling back to bisection
 * when the derivative is too small — the same strategy the CSS spec/WebKit use.
 * @param {number} x1
 * @param {number} y1
 * @param {number} x2
 * @param {number} y2
 * @returns {(t: number) => number}
 */
export function cubicBezier(x1, y1, x2, y2) {
  // Polynomial coefficients (first and last control points are (0,0) and (1,1)).
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;

  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  const sampleX = (t) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t) => ((ay * t + by) * t + cy) * t;
  const sampleDerivX = (t) => (3 * ax * t + 2 * bx) * t + cx;

  const solveX = (x) => {
    // Newton-Raphson: fast when it converges.
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = sampleX(t) - x;
      if (Math.abs(err) < 1e-6) return t;
      const d = sampleDerivX(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    // Bisection fallback: guaranteed to converge within the bracket.
    let lo = 0;
    let hi = 1;
    t = x;
    if (t < lo) return lo;
    if (t > hi) return hi;
    while (lo < hi) {
      const err = sampleX(t) - x;
      if (Math.abs(err) < 1e-6) return t;
      if (err > 0) hi = t;
      else lo = t;
      t = (lo + hi) / 2;
    }
    return t;
  };

  return (t) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return sampleY(solveX(t));
  };
}

/**
 * Named easing functions. CSS-flavoured names plus a few overshoot presets.
 * @type {Object<string, (t: number) => number>}
 */
export const easings = {
  linear: (t) => t,

  // CSS keyword curves, expressed as their canonical cubic-beziers.
  ease: cubicBezier(0.25, 0.1, 0.25, 1),
  'ease-in': cubicBezier(0.42, 0, 1, 1),
  'ease-out': cubicBezier(0, 0, 0.58, 1),
  'ease-in-out': cubicBezier(0.42, 0, 0.58, 1),

  // Back — anticipation / overshoot (crosses outside 0..1).
  'back-in': (t) => t * t * ((BACK_S + 1) * t - BACK_S),
  'back-out': (t) => {
    const p = t - 1;
    return p * p * ((BACK_S + 1) * p + BACK_S) + 1;
  },
  'back-in-out': (t) => {
    const u = t * 2;
    if (u < 1) return 0.5 * (u * u * ((BACK_S2 + 1) * u - BACK_S2));
    const v = u - 2;
    return 0.5 * (v * v * ((BACK_S2 + 1) * v + BACK_S2) + 2);
  },

  // Elastic — decaying oscillation, settles at exactly 1.
  'elastic-out': (t) => {
    if (t === 0) return 0;
    if (t === 1) return 1;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
  },

  // Bounce — piecewise parabolic decay, settles at exactly 1.
  'bounce-out': (t) => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) {
      const u = t - 1.5 / d1;
      return n1 * u * u + 0.75;
    }
    if (t < 2.5 / d1) {
      const u = t - 2.25 / d1;
      return n1 * u * u + 0.9375;
    }
    const u = t - 2.625 / d1;
    return n1 * u * u + 0.984375;
  },
};

const CUBIC_BEZIER_RE = /^cubic-bezier\(\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\)$/;
let _unknownEasingWarned = false;

/**
 * Resolve an easing option into a concrete `(t) => number` function.
 * Accepts a custom function (returned as-is), a `cubic-bezier(...)` string,
 * or a named easing. Unknown names fall back to `linear` with a one-time warn.
 * @param {string | ((t: number) => number)} easing
 * @returns {(t: number) => number}
 */
export function resolveEasing(easing) {
  if (typeof easing === 'function') return easing;

  if (typeof easing === 'string') {
    const cb = easing.match(CUBIC_BEZIER_RE);
    if (cb) {
      return cubicBezier(
        parseFloat(cb[1]),
        parseFloat(cb[2]),
        parseFloat(cb[3]),
        parseFloat(cb[4])
      );
    }
    if (easings[easing]) return easings[easing];
  }

  if (!_unknownEasingWarned) {
    _unknownEasingWarned = true;
    console.warn(`AnimationEngine: unknown easing "${easing}", falling back to linear.`);
  }
  return easings.linear;
}
