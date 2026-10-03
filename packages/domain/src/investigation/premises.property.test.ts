import type { RecordedEvent } from '../kernel/events.ts';
import { replay } from '../kernel/evolve.ts';
import { checkWorldIntegrity } from '../kernel/projections/integrity.ts';
import type { WorldState } from '../kernel/state.ts';
import { mulberry32 } from '../kernel/testing/random-commands.ts';
import { describe, expect, it } from 'vitest';

import { CAMPAIGN, DM, ELOWEN, investigationWorld } from './testing/world.ts';

/**
 * Randomized dependency check for player-command premises (Gate 02, G02-H02).
 * The DM discloses remote places through knowledge or memories, the player
 * enters them and forms hypotheses about them, and the DM undoes random
 * commands. After every step: no still-effective player command has lost a
 * premise, and a rejected undo changed nothing.
 */
function brokenPremises(state: WorldState, history: readonly RecordedEvent[]) {
  return history.flatMap((event) => {
    if (event.type !== 'PremisesRecorded') return [];
    if (state.commands.get(event.causation.commandId)?.undoneBy !== null) return [];
    const { characterId, premises } = event.payload;
    return premises.filter(
      (premise) =>
        (premise.kind === 'knowledge' && !state.knowledge.has(premise.knowledgeId)) ||
        (premise.kind === 'memory' && !state.memories.has(premise.memoryId)) ||
        ((premise.kind === 'party' || ('viaParty' in premise && premise.viaParty)) &&
          !state.roster.has(characterId)),
    );
  });
}

describe('player-command premises under random undo', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8])('seed %i', async (seed) => {
    const rng = mulberry32(seed * 7919);
    const pick = <T>(items: readonly T[]): T => items[Math.floor(rng() * items.length)] as T;
    const world = await investigationWorld();
    const places = ['far-a', 'far-b', 'far-c'];
    for (const id of places) {
      await world.submit(
        {
          type: 'CreateEntity',
          entityId: id,
          kind: 'location',
          name: id,
          existsSince: null,
          location: { type: 'site', parentId: null },
        },
        DM,
      );
    }
    const accepted: string[] = [];
    const counts = { blocked: 0, undone: 0, moves: 0 };

    for (let step = 0; step < 40; step += 1) {
      const place = pick(places);
      const roll = rng();
      let command: Record<string, unknown>;
      let actor = DM;
      if (roll < 0.25) {
        command =
          rng() < 0.5
            ? {
                type: 'AddKnowledge',
                scope: pick([
                  { kind: 'PARTY' },
                  { kind: 'PUBLIC' },
                  { kind: 'CHARACTER', characterId: ELOWEN },
                ]),
                knowledgeType: 'RUMOR',
                statement: `Word of ${place}.`,
                subjects: [place],
                knownSince: null,
              }
            : {
                type: 'RecordMemory',
                scope: pick([{ kind: 'PARTY' }, { kind: 'PUBLIC' }]),
                memoryKind: 'DECISION',
                summary: `We noted ${place}.`,
                occurredAt: 36000,
                locationId: place,
              };
      } else if (roll < 0.5) {
        actor = { actorId: 'player-elowen', kind: 'user' };
        command = {
          type: 'EnterLocation',
          characterId: ELOWEN,
          locationId: pick([...places, 'market-square']),
        };
      } else if (roll < 0.62) {
        actor = { actorId: 'player-elowen', kind: 'user' };
        command = {
          type: 'FormHypothesis',
          characterId: ELOWEN,
          scope: pick(['PARTY', 'CHARACTER'] as const),
          statement: `${place} matters.`,
          subjects: [place],
        };
      } else {
        command = {
          type: 'UndoCommand',
          targetCommandId: accepted.length > 0 ? pick(accepted) : 'none',
        };
      }
      const before = await world.state();
      const result = await world.submit(command, actor);
      const after = await world.state();
      if (result.status === 'rejected') {
        expect(after).toEqual(before);
        if (command['type'] === 'UndoCommand' && result.code === 'UNDO_UNSAFE') counts.blocked += 1;
      } else {
        accepted.push(result.commandId);
        if (command['type'] === 'UndoCommand') counts.undone += 1;
        if (command['type'] === 'EnterLocation') counts.moves += 1;
      }
      const snapshot = await world.engine.load(CAMPAIGN);
      expect(brokenPremises(after, snapshot?.history ?? []), `step ${String(step)}`).toEqual([]);
    }

    const snapshot = await world.engine.load(CAMPAIGN);
    if (!snapshot) throw new Error('missing campaign');
    expect(replay(snapshot.history)).toEqual(snapshot.state);
    expect(checkWorldIntegrity(snapshot.state)).toEqual([]);
    expect(counts.moves + counts.undone + counts.blocked).toBeGreaterThan(3);
  });
});
