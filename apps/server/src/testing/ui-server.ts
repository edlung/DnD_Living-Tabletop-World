import { CapabilityRouter, createLocalProvider, InMemoryAiTraceStore } from '@ltw/ai';
import { SequentialIds, SteppingClock } from '@ltw/domain';

import { ravenfordApp } from './ravenford-app.ts';
import { uiCampaigns } from './ui-campaigns.ts';

/**
 * Browser-test composition: real authorization, queries, and World Engine;
 * ephemeral deterministic storage, with no configured AI provider or worker.
 * Localhost only; never used by the production server entry point.
 */
const clock = new SteppingClock();
let elapsed = 0;
const app = await ravenfordApp(await uiCampaigns(), {
  router: new CapabilityRouter({
    // The deterministic offline interpreter (ADR 0017 §2); no external provider runs.
    reasoning: [createLocalProvider()],
    'npc-dialogue': [],
    narrative: [],
    'fast-context': [],
  }),
  traces: new InMemoryAiTraceStore(),
  ids: new SequentialIds(0xe2e),
  clock: { now: () => clock.now(), nowMs: () => (elapsed += 5) },
  requestTimeoutMs: 60_000,
  relevanceBudgetMs: 100,
});

await app.listen({ host: '127.0.0.1', port: 4311 });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app.close().then(() => process.exit(0));
  });
}
