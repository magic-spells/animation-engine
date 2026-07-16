import e from "@magic-spells/event-emitter";
import t from "@magic-spells/frame-engine";
import n from "@magic-spells/physics-engine";
var r = new class {
	#e;
	#t;
	#n;
	#r;
	constructor() {
		this.#e = /* @__PURE__ */ new Set(), this.#t = !1, this.#n = 0, this.#r = null, this.timeScale = 1;
	}
	get hasRAF() {
		return typeof requestAnimationFrame == "function";
	}
	subscribe(e) {
		return this.#e.add(e), this.#t || this.#a(), () => this.unsubscribe(e);
	}
	unsubscribe(e) {
		this.#e.delete(e), this.#e.size === 0 && this.#o();
	}
	tick(e) {
		let t = e * this.timeScale;
		for (let e of [...this.#e]) e(t);
	}
	#i() {
		return typeof performance < "u" && performance.now ? performance.now() : Date.now();
	}
	#a() {
		this.#t = !0, this.#n = this.#i(), this.hasRAF && (this.#r = requestAnimationFrame(this.#s));
	}
	#o() {
		this.#t = !1, this.#r !== null && typeof cancelAnimationFrame == "function" && cancelAnimationFrame(this.#r), this.#r = null;
	}
	#s = (e) => {
		if (!this.#t) return;
		let t = Math.min(e - this.#n, 64);
		this.#n = e, this.tick(t), this.#t && this.hasRAF && (this.#r = requestAnimationFrame(this.#s));
	};
}(), i = 1.70158, a = i * 1.525;
function o(e, t, n, r) {
	let i = 3 * e, a = 3 * (n - e) - i, o = 1 - i - a, s = 3 * t, c = 3 * (r - t) - s, l = 1 - s - c, u = (e) => ((o * e + a) * e + i) * e, d = (e) => ((l * e + c) * e + s) * e, f = (e) => (3 * o * e + 2 * a) * e + i, p = (e) => {
		let t = e;
		for (let n = 0; n < 8; n++) {
			let n = u(t) - e;
			if (Math.abs(n) < 1e-6) return t;
			let r = f(t);
			if (Math.abs(r) < 1e-6) break;
			t -= n / r;
		}
		let n = 0, r = 1;
		if (t = e, t < n) return n;
		if (t > r) return r;
		for (; n < r;) {
			let i = u(t) - e;
			if (Math.abs(i) < 1e-6) return t;
			i > 0 ? r = t : n = t, t = (n + r) / 2;
		}
		return t;
	};
	return (e) => e <= 0 ? 0 : e >= 1 ? 1 : d(p(e));
}
var s = {
	linear: (e) => e,
	ease: o(.25, .1, .25, 1),
	"ease-in": o(.42, 0, 1, 1),
	"ease-out": o(0, 0, .58, 1),
	"ease-in-out": o(.42, 0, .58, 1),
	"back-in": (e) => e * e * (2.70158 * e - i),
	"back-out": (e) => {
		let t = e - 1;
		return t * t * (2.70158 * t + i) + 1;
	},
	"back-in-out": (e) => {
		let t = e * 2;
		if (t < 1) return .5 * (t * t * (3.5949095 * t - a));
		let n = t - 2;
		return .5 * (n * n * (3.5949095 * n + a) + 2);
	},
	"elastic-out": (e) => e === 0 ? 0 : e === 1 ? 1 : 2 ** (-10 * e) * Math.sin((e * 10 - .75) * (2 * Math.PI / 3)) + 1,
	"bounce-out": (e) => {
		let t = 7.5625, n = 2.75;
		if (e < 1 / n) return t * e * e;
		if (e < 2 / n) {
			let r = e - 1.5 / n;
			return t * r * r + .75;
		}
		if (e < 2.5 / n) {
			let r = e - 2.25 / n;
			return t * r * r + .9375;
		}
		let r = e - 2.625 / n;
		return t * r * r + .984375;
	}
}, c = /^cubic-bezier\(\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\)$/, l = !1;
function u(e) {
	if (typeof e == "function") return e;
	if (typeof e == "string") {
		let t = e.match(c);
		if (t) {
			let e = t.slice(1).map((e) => parseFloat(e)), [n, r, i, a] = e;
			if (e.every(Number.isFinite) && n >= 0 && n <= 1 && i >= 0 && i <= 1) return o(n, r, i, a);
		}
		if (s[e]) return s[e];
	}
	return l || (l = !0, console.warn(`AnimationEngine: unknown easing "${e}", falling back to linear.`)), s.linear;
}
//#endregion
//#region src/values.js
function d(e) {
	return Math.round(e * 100) / 100;
}
function f(e, t, n) {
	return () => {
		let r = e + Math.random() * (t - e);
		return n === void 0 ? r : `${d(r)}${n}`;
	};
}
function p(e) {
	return () => e[Math.floor(Math.random() * e.length)];
}
function m(e) {
	return typeof e == "function" ? e() : e;
}
function h(e) {
	let t = {};
	for (let n in e) t[n] = m(e[n]);
	return t;
}
function g(e) {
	let t = {};
	for (let n in e) t[n] = h(e[n]);
	return t;
}
//#endregion
//#region src/keyframes.js
function _(e) {
	let n = Object.keys(e).map(Number).sort((e, t) => e - t), r = /* @__PURE__ */ new Map();
	for (let t of n) for (let n in e[t]) r.has(n) || r.set(n, []), r.get(n).push(t);
	let i = !1;
	for (let e of r.values()) if (e.length !== n.length) {
		i = !0;
		break;
	}
	if (!i) return e;
	let a = {};
	for (let t of n) a[t] = { ...e[t] };
	for (let [i, o] of r) {
		if (o.length === n.length) continue;
		let r = o[0], s = o[o.length - 1], c;
		if (o.length === 1) {
			let t = e[r][i];
			c = () => t;
		} else {
			let n = {};
			for (let t of o) n[t] = { [i]: e[t][i] };
			let a = new t(n);
			c = (e) => a.getFrame(Math.min(Math.max(e, r), s) / 100)[i];
		}
		for (let e of n) a[e][i] === void 0 && (a[e][i] = c(e));
	}
	return a;
}
//#endregion
//#region src/state.js
var v = /* @__PURE__ */ new WeakMap(), y = /* @__PURE__ */ new WeakMap();
function b(e) {
	let t = y.get(e);
	t && t.cancel();
}
function x(e, t) {
	let n = v.get(e) || {};
	v.set(e, {
		...n,
		...t
	});
}
//#endregion
//#region src/dom.js
var S = !1;
function C(e) {
	return typeof Element < "u" && e instanceof Element;
}
function w(e) {
	return e == null ? [] : typeof e == "string" ? typeof document < "u" && document.querySelectorAll ? Array.from(document.querySelectorAll(e)) : [] : Array.isArray(e) ? e : typeof e.length == "number" && typeof e != "function" && e.style === void 0 && e.nodeType === void 0 ? Array.from(e) : [e];
}
function T(e) {
	return e === "opacity" ? "1" : "0";
}
function E(e, t) {
	let n = v.get(e), r = {};
	for (let i in t) {
		if (n && i in n) {
			r[i] = n[i];
			continue;
		}
		if (i === "transform") {
			let n = e.style ? e.style.transform : void 0;
			if (n && n !== "none" && !n.startsWith("matrix")) {
				r[i] = n;
				continue;
			}
			S || (S = !0, console.warn("AnimationEngine: no tracked prior transform; first .to({transform}) will jump. Use .fromTo() or seed with .set() for a smooth first transform tween.")), r[i] = t[i];
			continue;
		}
		if (C(e) && typeof getComputedStyle == "function") {
			let t = getComputedStyle(e)[i];
			r[i] = t !== void 0 && t !== "" ? t : T(i);
			continue;
		}
		let a = e.style ? e.style[i] : void 0;
		r[i] = a !== void 0 && a !== "" ? a : T(i);
	}
	return r;
}
//#endregion
//#region src/tween.js
var D = class {
	constructor({ el: e, frameEngine: t, endStyles: n, duration: r, easing: i, timeScale: a }) {
		this.el = e, this.fe = t, this.endStyles = n, this.duration = r, this.easing = i, this.timeScale = a, this.elapsed = 0, this._done = !1, this._onTick = null, this._lastStyles = null, this.promise = new Promise((e) => {
			this._resolve = e;
		});
	}
	start() {
		return y.get(this.el) !== this && b(this.el), y.set(this.el, this), this.duration <= 0 ? (this._lastStyles = this.endStyles, Object.assign(this.el.style, this.endStyles), this._finish(), this.promise) : (this._apply(0), this._onTick = (e) => this._tick(e), r.subscribe(this._onTick), this.promise);
	}
	_tick(e) {
		if (this._done) return;
		this.elapsed += e * this.timeScale();
		let t = this.elapsed / this.duration;
		if (t >= 1) {
			this._lastStyles = this.endStyles, Object.assign(this.el.style, this.endStyles), this._finish();
			return;
		}
		this._apply(t);
	}
	_apply(e) {
		let t = this.fe.getFrame(this.easing(e));
		this._lastStyles = t, Object.assign(this.el.style, t);
	}
	_cleanup() {
		this._done = !0, this._onTick && r.unsubscribe(this._onTick), y.get(this.el) === this && y.delete(this.el);
	}
	_finish() {
		this._done || (this._cleanup(), x(this.el, this.endStyles), this._resolve());
	}
	cancel() {
		this._done || (this._cleanup(), this._lastStyles && x(this.el, this._lastStyles), this._resolve());
	}
}, O = class {
	constructor({ el: e, frameEngine: t, endStyles: n, physics: r }) {
		this.el = e, this.fe = t, this.endStyles = n, this.physics = r || {}, this._done = !1, this.engine = null, this._onChange = null, this._lastStyles = null, this.promise = new Promise((e) => {
			this._resolve = e;
		});
	}
	start() {
		return y.get(this.el) !== this && b(this.el), y.set(this.el, this), typeof requestAnimationFrame == "function" ? (this.engine = new n(this.physics), this._onChange = ({ progress: e }) => {
			this._done || this._apply(e);
		}, this.engine.on("change", this._onChange), this._apply(0), this.engine.animateTo(0, 1, 0).then(() => {
			this._done || (this._lastStyles = this.endStyles, Object.assign(this.el.style, this.endStyles), this._finish());
		}), this.promise) : (this._lastStyles = this.endStyles, Object.assign(this.el.style, this.endStyles), this._finish(), this.promise);
	}
	_apply(e) {
		let t = this.fe.getFrame(e);
		this._lastStyles = t, Object.assign(this.el.style, t);
	}
	_cleanup() {
		this._done = !0, this.engine && this._onChange && this.engine.off("change", this._onChange), y.get(this.el) === this && y.delete(this.el);
	}
	_finish() {
		this._done || (this._cleanup(), x(this.el, this.endStyles), this._resolve());
	}
	cancel() {
		this._done || (this._cleanup(), this.engine && this.engine.stop(), this._lastStyles && x(this.el, this._lastStyles), this._resolve());
	}
}, k = 400, A = "ease";
function j() {
	return typeof matchMedia == "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}
function M(e) {
	let t = {
		to(n, r, i = {}) {
			return e.push({
				type: "to",
				target: n,
				styles: r,
				opts: i
			}), t;
		},
		from(n, r, i = {}) {
			return e.push({
				type: "from",
				target: n,
				styles: r,
				opts: i
			}), t;
		},
		fromTo(n, r, i, a = {}) {
			return e.push({
				type: "fromTo",
				target: n,
				fromStyles: r,
				toStyles: i,
				opts: a
			}), t;
		},
		set(n, r) {
			return e.push({
				type: "set",
				target: n,
				styles: r
			}), t;
		},
		frames(n, r, i = {}) {
			return e.push({
				type: "frames",
				target: n,
				keyframes: r,
				opts: i
			}), t;
		},
		wait(n) {
			return e.push({
				type: "wait",
				ms: n
			}), t;
		},
		call(n) {
			return e.push({
				type: "call",
				fn: n
			}), t;
		},
		parallel(n) {
			let r = [];
			return n(M(r)), e.push({
				type: "parallel",
				substeps: r
			}), t;
		},
		stagger(n, r, i = {}) {
			return e.push({
				type: "stagger",
				targets: n,
				config: r,
				staggerOpts: i
			}), t;
		}
	};
	return t;
}
function N(e, t) {
	let n = Array.from({ length: e }, (e, t) => t), r;
	if (t === void 0 || t === "start") r = n;
	else if (t === "end") r = n.map((t) => e - 1 - t);
	else if (t === "center") {
		let t = (e - 1) / 2;
		r = n.map((e) => Math.abs(e - t));
	} else if (t === "edges") {
		let t = (e - 1) / 2;
		r = n.map((e) => t - Math.abs(e - t));
	} else if (typeof t == "number") r = n.map((e) => Math.abs(e - t));
	else if (t === "random") {
		r = [...n];
		for (let e = r.length - 1; e > 0; e--) {
			let t = Math.floor(Math.random() * (e + 1));
			[r[e], r[t]] = [r[t], r[e]];
		}
	} else r = n;
	let i = Math.min(...r);
	return i > 0 ? r.map((e) => e - i) : r;
}
var P = class extends e {
	constructor(e = {}) {
		super(), this._steps = [], this._builder = M(this._steps), this._loop = e.loop ?? 1, this._loopDelay = e.loopDelay ?? 0, this._alternate = e.alternate ?? !1, this._defaults = e.defaults ?? {}, this._respectReducedMotion = e.respectReducedMotion ?? !0, this._onBegin = e.onBegin, this._onComplete = e.onComplete, this._onLoop = e.onLoop, this._timeScale = 1, this._playing = !1, this._current = null, this._playPromise = null;
	}
	to(e, t, n) {
		return this._builder.to(e, t, n), this;
	}
	from(e, t, n) {
		return this._builder.from(e, t, n), this;
	}
	fromTo(e, t, n, r) {
		return this._builder.fromTo(e, t, n, r), this;
	}
	set(e, t) {
		return this._builder.set(e, t), this;
	}
	frames(e, t, n) {
		return this._builder.frames(e, t, n), this;
	}
	wait(e) {
		return this._builder.wait(e), this;
	}
	call(e) {
		return this._builder.call(e), this;
	}
	parallel(e) {
		return this._builder.parallel(e), this;
	}
	stagger(e, t, n) {
		return this._builder.stagger(e, t, n), this;
	}
	timeScale(e) {
		return e === void 0 ? this._timeScale : (this._timeScale = e, this);
	}
	play() {
		if (this._current && !this._current.settled) return this._playPromise;
		let e = {
			stopped: !1,
			finished: !1,
			settled: !1,
			resolve: null,
			reject: null,
			active: /* @__PURE__ */ new Set()
		};
		return this._current = e, this._playing = !0, this._playPromise = new Promise((t, n) => {
			e.resolve = t, e.reject = n;
		}), this._start(e), this._playPromise;
	}
	stop() {
		let e = this._current;
		!e || e.settled || (e.stopped = !0, this._cancelActive(e), this._settle(e, "stop"));
	}
	finish() {
		let e = this._current;
		!e || e.settled || (e.finished = !0, this._cancelActive(e), this._applyEndStates(), this._settle(e, "complete"));
	}
	_start(e) {
		this._execute(e).then(() => this._settle(e, "complete"), (t) => this._fail(e, t));
	}
	async _execute(e) {
		if (this.emit("begin"), this._onBegin && this._onBegin(), this._respectReducedMotion && j()) {
			this._applyEndStates();
			return;
		}
		let t = this._loop === !0 ? Infinity : typeof this._loop == "number" ? this._loop : 1;
		for (let n = 0; n < t && !(e.stopped || e.finished); n++) {
			let r = this._alternate && n % 2 == 1, i = r ? [...this._steps].reverse() : this._steps;
			for (let t of i) if (e.stopped || e.finished || (await this._runStep(t, r, e), e.stopped || e.finished)) break;
			if (e.stopped || e.finished || n < t - 1 && (this._allTargetsDisconnected() || (this.emit("loop", n + 1), this._onLoop && this._onLoop(n + 1), this._loopDelay > 0 && (await this._scaledWait(this._loopDelay, e).promise, e.stopped || e.finished)) || (await new Promise((e) => setTimeout(e, 0)), e.stopped || e.finished))) break;
		}
	}
	async _runStep(e, t, n) {
		switch (e.type) {
			case "wait":
				await this._scaledWait(m(e.ms) || 0, n).promise;
				return;
			case "set":
				this._applySet(e);
				return;
			case "call": {
				let t = e.fn();
				t && typeof t.then == "function" && await t;
				return;
			}
			case "to":
			case "from":
			case "fromTo":
			case "frames":
				await this._runTween(e, t, n);
				return;
			case "parallel":
				await Promise.all(e.substeps.map((e) => this._runStep(e, t, n)));
				return;
			case "stagger":
				await this._runStagger(e, t, n);
				return;
		}
	}
	_applySet(e) {
		let t = h(e.styles);
		for (let n of w(e.target)) b(n), Object.assign(n.style, t), x(n, t);
	}
	async _runTween(e, t, n) {
		let r = w(e.target);
		if (r.length === 0) return;
		let i = e.opts || {}, a = !!i.physics, o = m(i.delay) || 0, s = a ? 0 : m(i.duration) ?? m(this._defaults.duration) ?? k, c = u(i.easing ?? this._defaults.easing ?? A), l = this._resolveStepValues(e);
		if (o > 0 && (await this._scaledWait(o, n).promise, n.stopped || n.finished)) return;
		let d = r.map((r) => {
			b(r);
			let { fe: o, endStyles: u } = this._buildFrameEngine(e, r, t, l), d = a ? new O({
				el: r,
				frameEngine: o,
				endStyles: u,
				physics: i.physics
			}) : new D({
				el: r,
				frameEngine: o,
				endStyles: u,
				duration: s,
				easing: c,
				timeScale: () => this._timeScale
			}), f = { cancel: () => d.cancel() };
			return n.active.add(f), d.start().then(() => n.active.delete(f));
		});
		await Promise.all(d);
	}
	async _runStagger(e, t, n) {
		let r = w(e.targets);
		if (r.length === 0) return;
		let i = e.staggerOpts || {}, a = m(i.interval) || 0, o = i.jitter || 0, s = N(r.length, i.from), c = r.map((r, i) => this._runStaggerItem(e, r, i, s[i], a, o, t, n));
		await Promise.all(c);
	}
	async _runStaggerItem(e, t, n, r, i, a, o, s) {
		let c = typeof e.config == "function" ? e.config(t, n) : { ...e.config }, l = r * i + (m(c.delay) || 0);
		if (a && (l += (Math.random() * 2 - 1) * a * i), l < 0 && (l = 0), l > 0 && (await this._scaledWait(l, s).promise, s.stopped || s.finished)) return;
		let d = !!c.physics, f = d ? 0 : m(c.duration) ?? m(this._defaults.duration) ?? k, p = u(c.easing ?? this._defaults.easing ?? A);
		b(t);
		let { fe: h, endStyles: g } = this._buildFrameEngineFromConfig(c, t, o), _ = d ? new O({
			el: t,
			frameEngine: h,
			endStyles: g,
			physics: c.physics
		}) : new D({
			el: t,
			frameEngine: h,
			endStyles: g,
			duration: f,
			easing: p,
			timeScale: () => this._timeScale
		}), v = { cancel: () => _.cancel() };
		s.active.add(v), await _.start(), s.active.delete(v);
	}
	_resolveStepValues(e) {
		switch (e.type) {
			case "to":
			case "from": return { styles: h(e.styles) };
			case "fromTo": return {
				fromStyles: h(e.fromStyles),
				toStyles: h(e.toStyles)
			};
			case "frames": return { keyframes: _(g(e.keyframes)) };
			default: return {};
		}
	}
	_buildFrameEngine(e, n, r, i) {
		let a;
		if (e.type === "frames") a = r ? F(i.keyframes) : i.keyframes;
		else {
			let t, o;
			e.type === "to" ? (o = i.styles, t = E(n, o)) : e.type === "from" ? (t = i.styles, o = E(n, t)) : (t = i.fromStyles, o = i.toStyles), r && ([t, o] = [o, t]), a = {
				0: t,
				100: o
			};
		}
		let o = new t(a);
		return {
			fe: o,
			endStyles: o.getFrame(1)
		};
	}
	_buildFrameEngineFromConfig(e, n, r) {
		let i;
		if (e.keyframes) {
			let t = _(g(e.keyframes));
			i = r ? F(t) : t;
		} else {
			let t = e.from ? h(e.from) : null, a = e.to ? h(e.to) : null;
			t && !a ? a = E(n, t) : !t && a ? t = E(n, a) : !t && !a && (t = {}, a = {}), r && ([t, a] = [a, t]), i = {
				0: t,
				100: a
			};
		}
		let a = new t(i);
		return {
			fe: a,
			endStyles: a.getFrame(1)
		};
	}
	_applyEndStates() {
		for (let e of this._steps) this._applyStepEnd(e);
	}
	_applyStepEnd(e) {
		switch (e.type) {
			case "set":
				this._applySet(e);
				return;
			case "to":
			case "from":
			case "fromTo":
			case "frames": {
				let t = this._resolveStepValues(e);
				for (let n of w(e.target)) {
					b(n);
					let { endStyles: r } = this._buildFrameEngine(e, n, !1, t);
					Object.assign(n.style, r), x(n, r);
				}
				return;
			}
			case "parallel":
				for (let t of e.substeps) this._applyStepEnd(t);
				return;
			case "stagger":
				w(e.targets).forEach((t, n) => {
					let r = typeof e.config == "function" ? e.config(t, n) : { ...e.config };
					b(t);
					let { endStyles: i } = this._buildFrameEngineFromConfig(r, t, !1);
					Object.assign(t.style, i), x(t, i);
				});
				return;
		}
	}
	_scaledWait(e, t) {
		let n = 0, i = !1, a, o = new Promise((e) => {
			a = e;
		}), s = () => {
			i || (i = !0, r.unsubscribe(c), t.active.delete(l), a());
		}, c = (t) => {
			i || (n += t * this._timeScale, n >= e && s());
		}, l = { cancel: s };
		return t.active.add(l), e <= 0 ? s() : r.subscribe(c), {
			promise: o,
			cancel: s
		};
	}
	_cancelActive(e) {
		let t = [...e.active];
		e.active.clear();
		for (let e of t) e.cancel();
	}
	_settle(e, t) {
		if (e.settled) return;
		e.settled = !0, this._current === e && (this._current = null, this._playing = !1);
		let n = e.resolve;
		try {
			t === "complete" ? (this.emit("complete"), this._onComplete && this._onComplete()) : t === "stop" && this.emit("stop");
		} finally {
			n();
		}
	}
	_fail(e, t) {
		if (e.settled) {
			console.error("AnimationEngine: error after scene settled:", t);
			return;
		}
		e.settled = !0, this._current === e && (this._current = null, this._playing = !1), this._cancelActive(e), e.reject(t);
	}
	_allTargetsDisconnected() {
		let e = this._collectElements().filter((e) => e && typeof e.isConnected == "boolean");
		return e.length !== 0 && e.every((e) => e.isConnected === !1);
	}
	_collectElements(e = this._steps, t = []) {
		for (let n of e) if (n.type === "parallel") this._collectElements(n.substeps, t);
		else if (n.type === "stagger") for (let e of w(n.targets)) t.push(e);
		else if (n.target !== void 0) for (let e of w(n.target)) t.push(e);
		return t;
	}
};
function F(e) {
	let t = {};
	for (let n in e) t[100 - Number(n)] = e[n];
	return t;
}
//#endregion
//#region src/animation-engine.js
function I(e) {
	return new P(e);
}
//#endregion
export { P as Scene, o as cubicBezier, s as easings, _ as fillSparseKeyframes, p as pick, f as rand, u as resolveEasing, I as scene, r as ticker };
