import type { PerspectiveRequest } from '@ltw/contracts';

import boundary from '../../../../../fixtures/ravenford/knowledge-boundary.json' with { type: 'json' };
import kernelSeed from '../../../../../fixtures/ravenford/kernel-seed.json' with { type: 'json' };
import knowledgeSeed from '../../../../../fixtures/ravenford/knowledge-seed.json' with { type: 'json' };
import memorySeed from '../../../../../fixtures/ravenford/memory-seed.json' with { type: 'json' };
import tableSeed from '../../../../../fixtures/ravenford/table-seed.json' with { type: 'json' };
import type { Actor } from '../../kernel/actor.ts';
import { SequentialIds, SteppingClock } from '../../kernel/engine/deterministic-sources.ts';
import { InMemoryEventStore } from '../../kernel/engine/in-memory-event-store.ts';
import { submissionsFromScript } from '../../kernel/engine/script.ts';
import { WorldEngine } from '../../kernel/engine/world-engine.ts';
import type { WorldState } from '../../kernel/state.ts';
import { resolvePerspective, type ResolvedPerspective } from '../perspective.ts';

/** Test support: the seeded Ravenford world and its expected knowledge boundary. */
export const CAMPAIGN = 'ravenford';
export const DM: Actor = { actorId: 'dm-ravenford', kind: 'user' };
export const PLAYER: Actor = { actorId: 'player-elowen', kind: 'user' };
export const OUTSIDER: Actor = { actorId: 'outsider', kind: 'user' };
export const ASHEN_CIRCLE_ID = '3f9c2b7e-5a1d-4e8f-9b06-7c4d2e1a8f53';

export async function seedRavenford(): Promise<{ engine: WorldEngine; state: WorldState }> {
  const engine = new WorldEngine({
    store: new InMemoryEventStore(),
    ids: new SequentialIds(),
    clock: new SteppingClock(),
  });
  const submissions = [
    ...submissionsFromScript({ campaignId: CAMPAIGN, actor: DM, commands: kernelSeed.commands }),
    ...submissionsFromScript({
      campaignId: CAMPAIGN,
      actor: DM,
      commands: knowledgeSeed.commands,
      commandIdPrefix: `${CAMPAIGN}.knowledge`,
    }),
    ...submissionsFromScript({
      campaignId: CAMPAIGN,
      actor: DM,
      commands: memorySeed.commands,
      commandIdPrefix: `${CAMPAIGN}.memory`,
    }),
    // Elowen's companions, known to the party (Stage 605); self-contained after the kernel seed.
    ...submissionsFromScript({
      campaignId: CAMPAIGN,
      actor: DM,
      commands: tableSeed.commands,
      commandIdPrefix: `${CAMPAIGN}.table`,
    }),
  ];
  for (const submission of submissions) {
    const result = await engine.execute(submission);
    if (result.status === 'rejected') {
      throw new Error(`seed rejected: ${result.code} ${result.message}`);
    }
  }
  const snapshot = await engine.load(CAMPAIGN);
  if (!snapshot) throw new Error('seed produced no campaign');
  return { engine, state: snapshot.state };
}

export function perspective(
  state: WorldState,
  actor: Actor,
  request: PerspectiveRequest,
): ResolvedPerspective {
  const access = resolvePerspective(state, actor, request);
  if (!access.ok) throw new Error(`perspective denied: ${access.reason}`);
  return access.perspective;
}

/** Every knowledge record ID in the fixture, in seed order. */
export const ALL_KNOWLEDGE_IDS: readonly string[] = [
  ...knowledgeSeed.commands,
  ...tableSeed.commands,
].flatMap((command) =>
  'knowledgeId' in command && typeof command.knowledgeId === 'string' ? [command.knowledgeId] : [],
);

/** The shared Gate 01 specification: exact visible records per perspective. */
export const EXPECTED_VISIBLE: Readonly<Record<string, readonly string[]>> = boundary.visible;

/** Text that must never appear in any output for the perspective. */
export const FORBIDDEN_MARKERS: Readonly<Record<string, readonly string[]>> =
  boundary.forbiddenMarkers;

/** Every marker of every secret: none may appear for an unauthorized or failed request. */
export const ALL_SECRET_MARKERS = [...new Set(Object.values(FORBIDDEN_MARKERS).flat())];
