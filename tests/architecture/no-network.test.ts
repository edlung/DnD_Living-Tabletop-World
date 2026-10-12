import { describe, expect, it } from 'vitest';

/**
 * The unit project runs with the network trap installed by `vitest.config.ts` `setupFiles`
 * (`tests/setup/no-network.ts`; ADR 0032, checkpoint C). This file deliberately does not import
 * the setup module, which would install the trap itself: it only recognizes the trap on the global
 * by its registry symbol, so it fails if the configuration stops installing it. The integration
 * project has the same check (`no-network.integration.test.ts`).
 */
const TRAP = Symbol.for('ltw.tests.blockedFetch');

describe('the unit test environment', () => {
  it('has the global fetch replaced by the configured trap', () => {
    expect(typeof globalThis.fetch).toBe('function');
    expect(TRAP in globalThis.fetch).toBe(true);
  });
});
