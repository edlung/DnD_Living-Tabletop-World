import { CapabilityRouter, createLocalProvider, InMemoryAiTraceStore } from '@ltw/ai';
import { SequentialIds, SteppingClock } from '@ltw/domain';

import dmTools from '../../../../tests/e2e/fixtures/dm-tool-campaigns.json' with { type: 'json' };
import { InMemoryAssetContentStore } from '../assets/content-store.ts';
import { ravenfordApp, testAuthoring } from './ravenford-app.ts';
import { uiCampaigns } from './ui-campaigns.ts';
import { startUiImageWorker } from './ui-image-journeys.ts';

/**
 * Browser-test composition: real authorization, queries, and World Engine;
 * ephemeral deterministic storage, with no configured AI provider. The curated pictures of some
 * campaigns are imported at start (`ui-image-campaigns.ts`); the asset worker runs, with the
 * placeholder generator, only for the image journeys that request pictures
 * (`ui-image-journeys.ts`). Localhost only; never used by the production server entry point.
 */
const clock = new SteppingClock();
let elapsed = 0;
const traces = new InMemoryAiTraceStore();
const contents = new InMemoryAssetContentStore();
const engine = await uiCampaigns(contents);
const app = await ravenfordApp(
  engine,
  {
    router: new CapabilityRouter({
      // The deterministic offline interpreter (ADR 0017 §2); no external provider runs.
      reasoning: [createLocalProvider()],
      'npc-dialogue': [],
      narrative: [],
      'fast-context': [],
    }),
    // One campaign never gets a durable request start (ADR 0032, B2/C): its AI answers are the
    // no-start responses with a null trace ID, for the honest client feedback journeys.
    traces: {
      start: (start) =>
        start.campaignId === dmTools.aiNoStart ? Promise.resolve(false) : traces.start(start),
      finalize: (outcome) => traces.finalize(outcome),
      get: (campaignId, traceId) => traces.get(campaignId, traceId),
      npcReplies: (...query) => traces.npcReplies(...query),
    },
    ids: new SequentialIds(0xe2e),
    clock: { now: () => clock.now(), nowMs: () => (elapsed += 5) },
    requestTimeoutMs: 60_000,
    relevanceBudgetMs: 100,
  },
  testAuthoring(),
  contents,
);

await app.listen({ host: '127.0.0.1', port: 4311 });
const stopImages = startUiImageWorker(engine, contents);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void stopImages()
      .then(() => app.close())
      .then(() => process.exit(0));
  });
}
