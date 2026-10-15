import { afterEach } from 'vitest';

/**
 * Every Vitest project (unit and integration) runs with this setup file (`vitest.config.ts`):
 * the global `fetch` is a trap that never reaches the network. Provider adapters resolve the
 * global per call (`apps/server/src/ai/raw-provider.ts`), so a test that forgot to inject a fake
 * transport cannot send a paid request, even with keys, a stored approval and the verified Sonnet
 * 5.5 catalog entry (docs/adr/0032-live-ai.md, checkpoint C). A swallowed attempt (an adapter
 * classifying the rejection as provider failure) still fails the test that made it, here.
 * Tests inject `fetch` (`apps/server/src/testing/fake-fetch.ts`); PostgreSQL uses sockets, not
 * `fetch`, and is unaffected.
 */
// Recognized by the architecture tests through the symbol registry, without importing this file.
const TRAP = Symbol.for('ltw.tests.blockedFetch');
let attempted = 0;

const blockedFetch = Object.defineProperty(
  (): Promise<Response> => {
    attempted += 1;
    return Promise.reject(new Error('outbound network is disabled in tests'));
  },
  TRAP,
  { value: true },
);

globalThis.fetch = blockedFetch;

afterEach(() => {
  const calls = attempted;
  attempted = 0;
  if (calls > 0) {
    throw new Error(`a test attempted ${String(calls)} outbound fetch call(s); inject a fake`);
  }
});
