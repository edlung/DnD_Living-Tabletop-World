import type { ChronicleTraceView } from '@ltw/contracts';
import {
  SequentialIds,
  SteppingClock,
  chronicleEntries,
  holderPerspective,
  templateProse,
  type ChronicleEntry,
  type WorldState,
} from '@ltw/domain';
import { beforeAll, describe, expect, it } from 'vitest';

import { renderChronicle, validateChronicle, TEMPLATE_MODEL } from './chronicle.ts';
import { createLocalProvider } from './local-provider.ts';
import { ProviderError, type RoutedProvider } from './providers.ts';
import { CapabilityRouter } from './router.ts';
import { scripted, steppingMs } from './testing/providers.ts';
import {
  CAMPAIGN,
  DM,
  FORBIDDEN_MARKERS,
  NPC_BOUNDARY,
  seedRavenford,
} from './testing/ravenford.ts';
import { InMemoryAiTraceStore } from './traces.ts';

/**
 * Chronicle prose (docs/adr/0024-chronicle.md §3; owner decision): written
 * from a chapter's entries only, cited, accounts labelled, never an ID; any
 * failure falls back to the deterministic template. Traced.
 */
let state: WorldState;
let entries: ChronicleEntry[];

beforeAll(async () => {
  ({ state } = await seedRavenford({ dialogue: true }));
  const party = holderPerspective(state, { kind: 'PARTY' });
  entries = chronicleEntries(state, [], party, 0, state.clock).entries;
});

function deps(...providers: RoutedProvider[]) {
  const clock = new SteppingClock();
  return {
    router: new CapabilityRouter({ narrative: providers }),
    traces: new InMemoryAiTraceStore(),
    ids: new SequentialIds(0xc1),
    clock: { now: () => clock.now(), nowMs: steppingMs() },
  };
}

const input = () => ({
  campaignId: CAMPAIGN,
  actor: DM,
  state,
  perspective: 'PARTY',
  title: 'Chapter I — Shadows on the Trade Road',
  entries,
});

const GOOD = {
  paragraphs: [
    {
      text: 'In the square, Mira told us the caravan left before dawn, or so she said.',
      cites: ['e1'],
    },
    { text: 'We chose the Old Trade Road and bought supplies for it.', cites: ['e2', 'e3'] },
  ],
};

describe('validating chronicle prose', () => {
  it('accepts cited prose that labels accounts', () => {
    expect(validateChronicle(GOOD, entries)).toEqual({ ok: true, value: GOOD.paragraphs });
  });

  it('refuses uncited, foreign, unhedged, or ID-bearing prose', () => {
    const issues = (output: unknown) => {
      const check = validateChronicle(output, entries);
      return check.ok ? [] : check.issues;
    };
    expect(issues({ paragraphs: [{ text: 'We rode.', cites: [] }] })).not.toEqual([]);
    expect(issues({ paragraphs: [{ text: 'We rode.', cites: ['a1'] }] })).not.toEqual([]);
    expect(issues({ paragraphs: [{ text: 'We rode.', cites: ['e40'] }] })).toEqual([
      'paragraphs.0.cites: "e40" is no entry of this chapter',
    ]);
    expect(
      issues({ paragraphs: [{ text: 'The caravan left before dawn.', cites: ['e1'] }] }),
    ).toEqual([expect.stringContaining('account or a guess as fact')]);
    expect(
      issues({ paragraphs: [{ text: 'We met mira-vale, she said so.', cites: ['e1'] }] }),
    ).toEqual(['paragraphs.0.text: contains an ID']);
    expect(issues({ paragraphs: [], extra: 1 })).not.toEqual([]);
  });
});

describe('rendering a chapter', () => {
  it('uses valid AI prose and traces it', async () => {
    const provider = scripted('anthropic', GOOD);
    const d = deps(provider);
    const rendered = await renderChronicle(d, input());
    expect(rendered).toMatchObject({
      status: 'RENDERED',
      prose: { provider: 'anthropic', model: 'anthropic-model', paragraphs: GOOD.paragraphs },
    });
    const trace = (await d.traces.get(CAMPAIGN, rendered.traceId)) as ChronicleTraceView | null;
    expect(trace).toMatchObject({
      purpose: 'chronicle',
      capability: 'narrative',
      scope: 'PARTY',
      status: 'RENDERED',
      canonicalEvents: [],
      entries: [
        { key: 'e1', source: 'memory:mem-party-talk-mira' },
        { key: 'e2', source: 'memory:mem-party-decide-road' },
        { key: 'e3', source: 'memory:mem-party-supplies' },
      ],
    });
  });

  it('repairs once, then falls back to the template', async () => {
    const asFact = { paragraphs: [{ text: 'The caravan left before dawn.', cites: ['e1'] }] };
    const provider = scripted('anthropic', asFact, asFact);
    const rendered = await renderChronicle(deps(provider), input());
    expect(provider.requests.map((request) => request.task.kind)).toEqual([
      'chronicle',
      'chronicle',
    ]);
    expect(rendered).toMatchObject({
      status: 'INVALID_OUTPUT',
      prose: { provider: 'template', model: TEMPLATE_MODEL, paragraphs: templateProse(entries) },
    });
  });

  it('falls back to the template without a provider, and the local one writes it too', async () => {
    expect(await renderChronicle(deps(), input())).toMatchObject({
      status: 'AI_UNAVAILABLE',
      prose: { provider: 'template' },
    });
    expect(
      await renderChronicle(
        deps(
          scripted('anthropic', new ProviderError('UNAVAILABLE', 'down')),
          createLocalProvider(),
        ),
        input(),
      ),
    ).toMatchObject({
      status: 'RENDERED',
      prose: { provider: 'local', paragraphs: templateProse(entries) },
    });
  });

  it('sends only the entries: no ID, no secret, nothing another holder knows', async () => {
    const provider = scripted('anthropic', GOOD);
    await renderChronicle(deps(provider), input());
    const sent = JSON.stringify({
      system: provider.requests[0]?.system,
      prompt: provider.requests[0]?.prompt,
    });
    expect(sent).toContain('Mira Vale says the caravan left before dawn.');
    for (const id of [
      'mem-party-talk-mira',
      'party-mira-departure',
      'mira-vale',
      'market-square',
    ]) {
      expect(sent).not.toContain(id);
    }
    // The party's forbidden text (Gate 01), and the planted secrets no party sees (Gate 04).
    const planted = NPC_BOUNDARY.neverSaid['*'].filter(
      (marker) => marker.startsWith('NBX') && marker !== 'NBXPARTY',
    );
    for (const marker of [...(FORBIDDEN_MARKERS['PARTY'] ?? []), ...planted]) {
      expect(sent).not.toContain(marker);
    }
  });
});
