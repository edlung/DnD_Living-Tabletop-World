import {
  InMemoryEventStore,
  SequentialIds,
  SteppingClock,
  WorldEngine,
  submissionsFromScript,
  type Actor,
  type WorldState,
} from '@ltw/domain';

import kernelSeed from '../../../../fixtures/ravenford/kernel-seed.json' with { type: 'json' };
import knowledgeSeed from '../../../../fixtures/ravenford/knowledge-seed.json' with { type: 'json' };
import memorySeed from '../../../../fixtures/ravenford/memory-seed.json' with { type: 'json' };
import boundary from '../../../../fixtures/ravenford/knowledge-boundary.json' with { type: 'json' };

/**
 * Test support: Ravenford's kernel, knowledge, and memory seed. Seeding goes
 * through the World Engine, which @ltw/ai source may not import; only tests
 * and this folder may (workspace-boundaries.json `forbiddenNames`).
 */
export const CAMPAIGN = 'ravenford';
export const DM: Actor = { actorId: 'dm-ravenford', kind: 'user' };
export const PLAYER: Actor = { actorId: 'player-elowen', kind: 'user' };
export const OUTSIDER: Actor = { actorId: 'someone-else', kind: 'user' };
export const ASHEN_CIRCLE_ID = '3f9c2b7e-5a1d-4e8f-9b06-7c4d2e1a8f53';

/** Gate 01 fixture: text each perspective must never see, keyed `PUBLIC`, `NPC:mira-vale`, … */
export const FORBIDDEN_MARKERS: Readonly<Record<string, readonly string[]>> =
  boundary.forbiddenMarkers;

export interface SeededWorld {
  readonly engine: WorldEngine;
  readonly state: WorldState;
  /** The campaign's stream version now. */
  readonly version: () => Promise<number>;
}

export async function seedRavenford(): Promise<SeededWorld> {
  const engine = new WorldEngine({
    store: new InMemoryEventStore(),
    ids: new SequentialIds(),
    clock: new SteppingClock(),
  });
  const scripts = [
    [kernelSeed.commands, 'seed'],
    [knowledgeSeed.commands, 'knowledge'],
    [memorySeed.commands, 'memory'],
  ] as const;
  for (const [commands, prefix] of scripts) {
    const submissions = submissionsFromScript({
      campaignId: CAMPAIGN,
      actor: DM,
      commands,
      commandIdPrefix: `${CAMPAIGN}.${prefix}`,
    });
    for (const submission of submissions) {
      const result = await engine.execute(submission);
      if (result.status === 'rejected') {
        throw new Error(`rejected: ${result.code} ${result.message}`);
      }
    }
  }
  const load = async () => {
    const snapshot = await engine.load(CAMPAIGN);
    if (!snapshot) throw new Error('seed produced no campaign');
    return snapshot.state;
  };
  return { engine, state: await load(), version: async () => (await load()).version };
}
