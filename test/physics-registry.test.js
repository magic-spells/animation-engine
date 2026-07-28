import assert from 'node:assert/strict';
import test from 'node:test';

import { scene } from '../src/animation-engine.js';

const MESSAGE =
  'Physics step requires registerPhysics(PhysicsEngine) — install @magic-spells/physics-engine and register it once.';

test('a physics step throws when no spring engine is registered', async () => {
  const target = { style: {}, isConnected: true };
  const done = scene()
    .fromTo(target, { opacity: 0 }, { opacity: 1 }, { physics: { attraction: 0.1 } })
    .play();

  await assert.rejects(done, { message: MESSAGE });
});
