import assert from "node:assert/strict";
import test from "node:test";

import PhysicsEngine from "@magic-spells/physics-engine";

import { registerPhysics, scene } from "../src/animation-engine.js";
import ticker from "../src/ticker.js";

registerPhysics(PhysicsEngine);

// An authored `none` end value is written as `none` by the completing write
// only; every earlier write is frame-engine's interpolated frame.

const flush = () => new Promise((r) => setTimeout(r, 0));

async function advance(ms, step = 16) {
  for (let t = 0; t < ms; t += step) {
    ticker.tick(step);
    await flush();
  }
}

/** An element-like target that logs every write to `prop`. */
function logged(prop = "transform") {
  const writes = [];
  const style = {};
  Object.defineProperty(style, prop, {
    get: () => writes[writes.length - 1],
    set: (v) => writes.push(v),
  });
  return { el: { style, isConnected: true }, writes };
}

const FROM = { transform: "translateY(14px)" };
const NONE = { transform: "none" };

test("a tween to none interpolates, then writes none once on completion", async () => {
  const { el, writes } = logged();
  const done = scene().fromTo(el, FROM, NONE, { duration: 100 }).play();
  assert.deepEqual(
    writes,
    ["translateY(14px)"],
    "the 0% frame painted at start() is interpolated",
  );

  await advance(120);
  await done;
  assert.equal(writes.at(-1), "none");
  assert.equal(
    writes.filter((w) => w === "none").length,
    1,
    "none is written exactly once",
  );
  assert.ok(writes.slice(0, -1).every((w) => w.startsWith("translateY(")));
});

test("overshoot easings stay interpolated past progress 1 until completion", async () => {
  const { el, writes } = logged();
  const done = scene()
    .fromTo(el, FROM, NONE, { duration: 200, easing: "back-out" })
    .play();
  await advance(220);
  await done;

  const mid = writes.slice(0, -1);
  assert.ok(
    mid.some((w) => parseFloat(w.slice(11)) < 0),
    "overshot past the identity",
  );
  assert.ok(mid.every((w) => w !== "none"));
  assert.equal(writes.at(-1), "none");
});

test("a spring writes interpolated frames, then none once it settles", async () => {
  let now = 0;
  globalThis.requestAnimationFrame = (cb) =>
    setTimeout(() => cb((now += 16.66)), 0);
  try {
    const { el, writes } = logged();
    await scene()
      .fromTo(el, FROM, NONE, { physics: { attraction: 0.05 } })
      .play();
    assert.ok(writes.length > 2, "painted intermediate frames");
    assert.equal(writes.at(-1), "none");
    assert.equal(writes.filter((w) => w === "none").length, 1);
  } finally {
    delete globalThis.requestAnimationFrame;
  }
});

test("stop() mid-flight keeps the interpolated value; finish() jumps to none", async () => {
  const a = logged();
  const s1 = scene().fromTo(a.el, FROM, NONE, { duration: 1000 });
  const d1 = s1.play();
  await advance(100);
  s1.stop();
  await d1;
  assert.match(a.el.style.transform, /^translateY\(/);
  assert.ok(!a.writes.includes("none"));

  const b = logged();
  const s2 = scene().fromTo(b.el, FROM, NONE, { duration: 1000 });
  const d2 = s2.play();
  await advance(100);
  s2.finish();
  await d2;
  assert.equal(b.el.style.transform, "none");
});

test("alternate playback ends on an authored none FROM value", async () => {
  const { el, writes } = logged();
  const done = scene({ loop: 2, alternate: true })
    .fromTo(el, NONE, FROM, { duration: 100 })
    .play();
  await advance(320);
  await done;
  assert.equal(writes.at(-1), "none");
  assert.equal(
    writes.filter((w) => w === "none").length,
    1,
    "iteration 1 starts interpolated",
  );
});

test("filter and backdrop-filter to none end on none too", async () => {
  const f = logged("filter");
  const b = logged("backdrop-filter");
  const done = scene()
    .fromTo(f.el, { filter: "blur(4px)" }, { filter: "none" }, { duration: 50 })
    .fromTo(
      b.el,
      { "backdrop-filter": "blur(4px)" },
      { "backdrop-filter": "none" },
      { duration: 50 },
    )
    .play();
  await advance(140);
  await done;
  assert.equal(f.writes.at(-1), "none");
  assert.equal(b.writes.at(-1), "none");
});

test("a later .to() derives its from-state from the recorded none, without warning", async () => {
  const warn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args);
  try {
    const { el, writes } = logged();
    const done = scene()
      .fromTo(el, FROM, NONE, { duration: 50 })
      .to(el, { transform: "translateY(10px)" }, { duration: 100 })
      .play();
    await advance(200);
    await done;

    const after = writes.slice(writes.indexOf("none") + 1);
    assert.equal(
      after[0],
      "translateY(0px)",
      "tweens from the identity, not a jump",
    );
    assert.equal(after.at(-1), "translateY(10px)");
    assert.deepEqual(warnings, []);
  } finally {
    console.warn = warn;
  }
});

test("sparse keyframes end on a none authored before the last key", async () => {
  const { el, writes } = logged();
  const done = scene()
    .frames(
      el,
      {
        0: { transform: "translateY(10px)", opacity: 0 },
        50: NONE,
        100: { opacity: 1 },
      },
      { duration: 100 },
    )
    .play();
  await advance(120);
  await done;
  assert.equal(writes.at(-1), "none");
  assert.ok(writes.slice(0, -1).every((w) => w.startsWith("translateY(")));
});

test("sparse keyframes start from a none authored after the first key", async () => {
  const { el, writes } = logged();
  const done = scene({ loop: 2, alternate: true })
    .frames(
      el,
      {
        0: { opacity: 0 },
        50: NONE,
        100: { transform: "translateY(10px)", opacity: 1 },
      },
      { duration: 100 },
    )
    .play();
  await advance(320);
  await done;
  assert.equal(
    writes.at(-1),
    "none",
    "the reversed pass ends on the authored none",
  );
  assert.equal(writes.filter((w) => w === "none").length, 1);
});
