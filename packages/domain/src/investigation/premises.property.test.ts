import { describe, expect, it } from 'vitest';

import type { Actor } from '../kernel/actor.ts';
import { SequentialIds, SteppingClock } from '../kernel/engine/deterministic-sources.ts';
import { InMemoryEventStore } from '../kernel/engine/in-memory-event-store.ts';
import { WorldEngine } from '../kernel/engine/world-engine.ts';
import type { RecordedEvent } from '../kernel/events.ts';
import { replay } from '../kernel/evolve.ts';
import { checkWorldIntegrity } from '../kernel/projections/integrity.ts';
import type { WorldState } from '../kernel/state.ts';
import { mulberry32 } from '../kernel/testing/random-commands.ts';
import { redecideEffective } from '../kernel/verification/redecide.ts';
import {
  CAMPAIGN,
  DM,
  ELOWEN,
  MODIFIERS,
  investigationWorld,
  type InvestigationWorld,
} from './testing/world.ts';

/**
 * Randomized dependency check for player commands under undo (Gate 02,
 * G02-H02, G02-H03, G02-M01). The DM discloses remote places through
 * knowledge or memories and assigns a second character to a second player;
 * players (and sometimes the DM) move, inspect, and form hypotheses; the DM
 * undoes random commands, including assignments. After every step a rejected
 * command changed nothing and no recorded premise of a still-effective player
 * command is gone. After every accepted undo, and at the end, the independent
 * re-decision oracle must accept every still-effective command unchanged, so
 * an omitted premise is caught even though nothing recorded it.
 */
const GUEST = 'guest-character';
const ELOWEN_PLAYER: Actor = { actorId: 'player-elowen', kind: 'user' };
const GUEST_PLAYER: Actor = { actorId: 'outsider', kind: 'user' };

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

async function oracle(world: InvestigationWorld) {
  const snapshot = await world.engine.load(CAMPAIGN);
  if (!snapshot) throw new Error('missing campaign');
  const log = await world.engine.commandLog(CAMPAIGN);
  return redecideEffective(log, snapshot, (_sheet, skill) => MODIFIERS[skill] ?? 0);
}

/**
 * Systematic undo (Gate 03 remediation): on a copy of the world, try undoing
 * each of the latest accepted commands, including ones beneath later ones.
 * Whatever undo accepts must leave every effective command re-deciding
 * identically, including results that found nothing.
 */
async function whatIfUndo(world: InvestigationWorld, targets: readonly string[]) {
  for (const target of targets) {
    const store = new InMemoryEventStore();
    const events = (await world.store.loadStream(CAMPAIGN))?.events ?? [];
    for (const command of await world.store.loadCommands(CAMPAIGN)) {
      await store.append({
        campaignId: CAMPAIGN,
        expectedVersion: command.firstSequence - 1,
        command,
        events: events.slice(command.firstSequence - 1, command.lastSequence),
      });
    }
    const copy = new WorldEngine({ store, ids: new SequentialIds(9), clock: new SteppingClock() });
    const undone = await copy.execute({
      commandId: `what-if.${target}`,
      campaignId: CAMPAIGN,
      actor: DM,
      command: { type: 'UndoCommand', targetCommandId: target },
    });
    if (undone.status !== 'accepted') continue;
    const snapshot = await copy.load(CAMPAIGN);
    if (!snapshot) throw new Error('missing campaign');
    const log = await copy.commandLog(CAMPAIGN);
    const divergence = redecideEffective(log, snapshot, (_sheet, skill) => MODIFIERS[skill] ?? 0);
    expect(divergence, `what-if undo of ${target}`).toBeNull();
  }
}

describe('player-command dependencies under random undo', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8])(
    'seed %i',
    async (seed) => {
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
        // Something to find, so repeated inspections pass over what was found.
        await world.submit(
          { type: 'AddClue', entityId: id, method: 'inspect', statement: `Marks at ${id}.` },
          DM,
        );
      }
      await world.submit(
        {
          type: 'CreateEntity',
          entityId: GUEST,
          kind: 'character',
          name: 'Guest',
          existsSince: null,
          placement: { locationId: 'north-gate', since: null },
        },
        DM,
      );
      const accepted: string[] = [];
      const counts = { blocked: 0, undone: 0, actions: 0 };

      for (let step = 0; step < 70; step += 1) {
        const place = pick(places);
        const [character, player] = rng() < 0.5 ? [ELOWEN, ELOWEN_PLAYER] : [GUEST, GUEST_PLAYER];
        const actor = rng() < 0.85 ? player : DM;
        const roll = rng();
        let command: Record<string, unknown>;
        let by: Actor = DM;
        if (roll < 0.18) {
          command =
            rng() < 0.5
              ? {
                  type: 'AddKnowledge',
                  scope: pick([
                    { kind: 'PARTY' },
                    { kind: 'PUBLIC' },
                    { kind: 'CHARACTER', characterId: character },
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
        } else if (roll < 0.26) {
          command = { type: 'AssignCharacter', characterId: GUEST, playerActorId: 'outsider' };
        } else if (roll < 0.46) {
          by = actor;
          command = {
            type: 'EnterLocation',
            characterId: character,
            locationId: pick([...places, 'market-square', 'ravenford', 'north-gate']),
          };
        } else if (roll < 0.6) {
          by = actor;
          // Mostly where the character stands, so inspections repeat and pass over finds.
          const here = (await world.state()).entities.get(character)?.placement?.locationId;
          command = {
            type: 'ExamineEntity',
            characterId: character,
            entityId:
              here !== undefined && rng() < 0.7
                ? here
                : pick([...places, 'market-square', 'north-gate']),
            method: 'inspect',
          };
        } else if (roll < 0.68) {
          by = actor;
          command = {
            type: 'FormHypothesis',
            characterId: character,
            scope: pick(['PARTY', 'CHARACTER'] as const),
            statement: `${place} matters.`,
            subjects: rng() < 0.6 ? [place] : [],
          };
        } else {
          command = {
            type: 'UndoCommand',
            targetCommandId: accepted.length > 0 ? pick(accepted) : 'none',
          };
        }
        const before = await world.state();
        const result = await world.submit(command, by);
        const after = await world.state();
        if (result.status === 'rejected') {
          expect(after, `step ${String(step)}`).toEqual(before);
          if (command['type'] === 'UndoCommand' && result.code === 'UNDO_UNSAFE')
            counts.blocked += 1;
        } else {
          accepted.push(result.commandId);
          if (command['type'] === 'UndoCommand') {
            counts.undone += 1;
            expect(await oracle(world), `after undo at step ${String(step)}`).toBeNull();
          } else if (by !== DM) counts.actions += 1;
        }
        const snapshot = await world.engine.load(CAMPAIGN);
        expect(brokenPremises(after, snapshot?.history ?? []), `step ${String(step)}`).toEqual([]);
        if (step % 7 === 6) await whatIfUndo(world, accepted.slice(-4));
      }

      const snapshot = await world.engine.load(CAMPAIGN);
      if (!snapshot) throw new Error('missing campaign');
      expect(replay(snapshot.history)).toEqual(snapshot.state);
      expect(checkWorldIntegrity(snapshot.state)).toEqual([]);
      expect(await oracle(world)).toBeNull();
      expect(counts.actions).toBeGreaterThan(3);
      expect(counts.undone + counts.blocked).toBeGreaterThan(3);
    },
    30_000,
  );
});
