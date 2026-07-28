/**
 * The sequencer owns the small spring contract that PhysicsTween consumes;
 * physics-engine is only one possible implementation. Keeping the registered
 * constructor in core inverts that dependency, so consumers opt into a spring
 * implementation without making it a runtime dependency of animation-engine.
 *
 * @type {(new (config?: { attraction?: number, friction?: number }) => object) | null}
 */
let PhysicsEngine = null;

/**
 * Register the spring implementation used by physics steps. Registration is
 * explicit because the sequencing layer defines the contract and should not
 * hard-import whichever package happens to implement it.
 *
 * @param {new (config?: { attraction?: number, friction?: number }) => object} EngineClass
 * @returns {void}
 */
export function registerPhysics(EngineClass) {
  PhysicsEngine = EngineClass;
}

/**
 * Return the registered spring constructor for the internal PhysicsTween
 * adapter. This stays out of the public entry point: consumers choose an
 * implementation through registerPhysics, while core owns its use.
 *
 * @returns {(new (config?: { attraction?: number, friction?: number }) => object) | null}
 */
export function getPhysicsEngine() {
  return PhysicsEngine;
}
