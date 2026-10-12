import { describe, expect, it } from 'vitest';

/**
 * The integration project runs with the configured network trap (`vitest.config.ts`
 * `setupFiles`). Like `no-network.test.ts`, this file does not import the setup module.
 */
const TRAP = Symbol.for('ltw.tests.blockedFetch');

describe('the integration test environment', () => {
  it('has the global fetch replaced by the configured trap', () => {
    expect(typeof globalThis.fetch).toBe('function');
    expect(TRAP in globalThis.fetch).toBe(true);
  });
});
