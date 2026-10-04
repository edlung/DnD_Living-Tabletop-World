import type { CommandResult } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { MODIFIERS } from '../investigation/testing/world.ts';
import type { ResolvedProposable } from '../kernel/decision.ts';
import { SequentialIds, SteppingClock } from '../kernel/engine/deterministic-sources.ts';
import { WorldEngine } from '../kernel/engine/world-engine.ts';
import { parseRecordedEvent } from '../kernel/events.ts';
import { replay } from '../kernel/evolve.ts';
import { checkWorldIntegrity } from '../kernel/projections/integrity.ts';
import { mulberry32 } from '../kernel/testing/random-commands.ts';
import { redecideEffective } from '../kernel/verification/redecide.ts';
import {
  ASHEN_CIRCLE,
  CAMPAIGN,
  DEPARTURE,
  DM,
  ELOWEN,
  authoringWorld,
  codeOf,
  confirm,
  type AuthoringWorld,
} from './testing/world.ts';

/**
 * Randomized authoring under undo (docs/adr/0018-ai-authoring.md §4, §6, §7;
 * docs/adr/0019-continuity-engine.md: claims, attitudes, deaths, premises).
 * The DM commits random proposals — valid, illegal, unsupported, with exact,
 * missing, or stale confirmations — renames and moves NPCs directly, the
 * player meets NPCs and asks them things, time passes, and the DM undoes
 * random commands. After every step a rejection changed nothing; after every
 * accepted undo, and at the end, the world is intact and the re-decision
 * oracle accepts every still-effective command unchanged. That holds although
 * consent is not re-checked: what an undo changes about warnings never makes
 * a standing commit illegal, and every legality premise is footprinted.
 */
const NAMES = ['Tomas Reed', 'Ada Brook', 'Captain Thorne', 'Mira Vale', 'Wil Harrow'];
const LOCATIONS = ['north-gate', 'market-square', 'golden-stag-inn', 'ravenford', 'nowhere'];

async function oracle(world: AuthoringWorld) {
  const snapshot = await world.engine.load(CAMPAIGN);
  if (!snapshot) throw new Error('missing campaign');
  expect(checkWorldIntegrity(snapshot.state)).toEqual([]);
  const log = await world.engine.commandLog(CAMPAIGN);
  return redecideEffective(log, snapshot, (_sheet, skill) => MODIFIERS[skill] ?? 0);
}

describe('authoring commits under random undo', () => {
  it.each([1, 2, 3, 4, 5, 6])(
    'seed %i',
    async (seed) => {
      const rng = mulberry32(seed * 104_729);
      const pick = <T>(items: readonly T[]): T => items[Math.floor(rng() * items.length)] as T;
      const world = await authoringWorld();
      const accepted: string[] = [];
      const counts = { committed: 0, unconfirmed: 0, refused: 0, undone: 0, blocked: 0 };
      let direct = 0;

      const operation = (
        state: Awaited<ReturnType<AuthoringWorld['state']>>,
        step: number,
        slot: number,
        created: string[],
        records: string[],
      ): ResolvedProposable => {
        const npcs = [...state.entities.values()]
          .filter((e) => e.kind === 'npc')
          .map((e) => e.entityId);
        const holders = [...npcs, ...created];
        const roll = rng();
        if (roll < 0.3) {
          const id = rng() < 0.1 ? pick([...state.usedIds]) : `npc-${String(step)}-${String(slot)}`;
          created.push(id);
          const existsSince = pick([null, null, state.clock - 86_400, state.clock + 60]);
          return {
            type: 'CreateEntity',
            entityId: id,
            kind: rng() < 0.92 ? 'npc' : 'item',
            name: pick(NAMES),
            existsSince,
            ...(rng() < 0.8
              ? {
                  placement: {
                    locationId: pick(LOCATIONS),
                    since: pick([null, existsSince, DEPARTURE]),
                  },
                }
              : {}),
          };
        }
        if (roll < 0.6) {
          const holder = holders.length > 0 ? pick(holders) : 'ghost';
          const knowledgeType = pick([
            'TESTIMONY',
            'TESTIMONY',
            'RUMOR',
            'FACT',
            'EVIDENCE',
            'SECRET',
            'HYPOTHESIS',
          ] as const);
          const knowledgeId = `k-${String(step)}-${String(slot)}`;
          records.push(knowledgeId);
          return {
            type: 'AddKnowledge',
            knowledgeId,
            scope: rng() < 0.93 ? { kind: 'NPC', npcId: holder } : { kind: 'PUBLIC' },
            knowledgeType,
            statement: `Account ${String(step)}.`,
            subjects: [
              ...new Set([
                pick(['guild-caravan', 'north-gate', 'market-square', ASHEN_CIRCLE, ...created]),
                pick(LOCATIONS.slice(0, 4)),
              ]),
            ],
            ...(knowledgeType === 'TESTIMONY'
              ? { attributedTo: rng() < 0.8 ? holder : pick(holders) }
              : {}),
            knownSince: pick([null, DEPARTURE, state.clock, state.clock + 1]),
          };
        }
        if (roll < 0.72) {
          const existing = [...state.knowledge.values()]
            .filter((k) => k.scope.kind === 'NPC')
            .map((k) => k.knowledgeId);
          return {
            type: 'SetDisclosure',
            knowledgeId: pick([...records, ...existing, 'ghost-k']),
            disclosure: pick(['WILLING', 'GUARDED'] as const),
          };
        }
        if (roll < 0.78) {
          // ADR 0019: claims compared with every account (and world truth), and attitudes.
          const target = pick([...records, ...[...state.knowledge.keys()].slice(0, 40)]);
          return rng() < 0.5
            ? {
                type: 'SetClaim',
                target: { kind: 'knowledge', knowledgeId: target },
                claim: {
                  subjectId: pick(['guild-caravan', 'north-gate', ...created]),
                  aspect: pick(['departure-time', 'cargo']),
                  value: pick(['before-dawn', 'after-sunrise', 'grain']),
                },
              }
            : {
                type: 'SetRelationship',
                npcId: pick([...holders, 'north-gate']),
                attitude: pick(['HOSTILE', 'WARY', 'NEUTRAL', 'FRIENDLY', 'TRUSTED'] as const),
              };
        }
        if (roll < 0.86) {
          return {
            type: 'PlaceEntity',
            entityId: pick([...holders, 'guild-caravan']),
            locationId: pick(LOCATIONS),
          };
        }
        if (roll < 0.95) {
          return {
            type: 'UpdateEntityProfile',
            entityId: pick([...holders, 'north-gate']),
            name: pick(NAMES),
          };
        }
        return rng() < 0.5
          ? { type: 'ChangeEntityStatus', entityId: pick(holders), status: 'dead' }
          : { type: 'AdvanceWorldTime', by: 600 };
      };

      /** A plausible witness, as the DM would author one: often legal, sometimes warned about. */
      /**
       * A plausible witness, as the DM would author one: often legal, sometimes
       * warned about. Sometimes an existing NPC (its commit then records the
       * premise of its status), sometimes with a claim on the departure time.
       */
      const witness = (
        state: Awaited<ReturnType<AuthoringWorld['state']>>,
        step: number,
      ): ResolvedProposable[] => {
        const knowledgeId = `witness-${String(step)}-saw`;
        const existing = rng() < 0.35;
        const id = existing
          ? pick(['mira-vale', 'orin-stonebeard', 'captain-thorne'])
          : `witness-${String(step)}`;
        return [
          ...(existing
            ? []
            : [
                {
                  type: 'CreateEntity',
                  entityId: id,
                  kind: 'npc',
                  name: pick(NAMES),
                  existsSince: null,
                  placement: {
                    locationId: pick(LOCATIONS.slice(0, 4)),
                    since: pick([null, DEPARTURE, state.clock - 3_600]),
                  },
                } as const,
              ]),
          {
            type: 'AddKnowledge',
            knowledgeId,
            scope: { kind: 'NPC', npcId: id },
            knowledgeType: 'TESTIMONY',
            statement: `Witness ${String(step)} saw the caravan.`,
            subjects: ['guild-caravan', pick(LOCATIONS.slice(0, 4))],
            attributedTo: id,
            knownSince: pick([null, DEPARTURE, state.clock]),
          },
          ...(rng() < 0.6
            ? [{ type: 'SetDisclosure', knowledgeId, disclosure: 'WILLING' } as const]
            : []),
          ...(rng() < 0.5
            ? [
                {
                  type: 'SetClaim',
                  target: { kind: 'knowledge', knowledgeId },
                  claim: {
                    subjectId: 'guild-caravan',
                    aspect: 'departure-time',
                    value: pick(['before-dawn', 'after-sunrise']),
                  },
                } as const,
              ]
            : []),
        ];
      };

      for (let step = 0; step < 90; step += 1) {
        const state = await world.state();
        const before = state.version;
        const roll = rng();
        let result: CommandResult;
        if (roll < 0.35) {
          const created: string[] = [];
          const records: string[] = [];
          const commands =
            rng() < 0.55
              ? witness(state, step)
              : Array.from({ length: 1 + Math.floor(rng() * 4) }, (_, slot) =>
                  operation(state, step, slot, created, records),
                );
          const preview = await world.preview(commands);
          const style = rng();
          const confirmation =
            style < 0.6 && preview.confirmation
              ? preview.confirmation
              : style < 0.8
                ? confirm('L3')
                : confirm('L1');
          result = await world.commit(commands, { confirmation });
          if (result.status === 'accepted') counts.committed += 1;
          if (codeOf(result) === 'CONFIRMATION_REQUIRED') counts.unconfirmed += 1;
          if (codeOf(result).startsWith('AUTHORING_')) counts.refused += 1;
          // The preview agrees with the commit it was made for.
          if (style < 0.6) expect(result.status === 'accepted').toBe(preview.committable);
        } else if (roll < 0.5) {
          direct += 1;
          const npcs = [...state.entities.values()]
            .filter((e) => e.kind === 'npc')
            .map((e) => e.entityId);
          const command = pick([
            { type: 'UpdateEntityProfile', entityId: pick(npcs), name: pick(NAMES) },
            { type: 'PlaceEntity', entityId: pick(npcs), locationId: pick(LOCATIONS) },
            { type: 'AdvanceWorldTime', by: 1_800 },
            // Deaths and resurrections the death checks and their premises rest on.
            { type: 'ChangeEntityStatus', entityId: pick(npcs), status: pick(['dead', 'active']) },
            { type: 'ChangeEntityStatus', entityId: pick(npcs), status: pick(['dead', 'active']) },
            { type: 'SetRelationship', npcId: pick(npcs), attitude: pick(['HOSTILE', 'FRIENDLY']) },
          ]);
          result = await world.engine.execute({
            commandId: `direct.${String(direct)}`,
            campaignId: CAMPAIGN,
            actor: DM,
            command,
          });
        } else if (roll < 0.72) {
          const npcs = [...state.entities.values()]
            .filter((e) => e.kind === 'npc')
            .map((e) => e.entityId);
          result = await world.submit(
            rng() < 0.4
              ? {
                  type: 'EnterLocation',
                  characterId: ELOWEN,
                  locationId: pick(LOCATIONS.slice(0, 3)),
                }
              : {
                  type: 'AskAbout',
                  characterId: ELOWEN,
                  npcId: pick(npcs),
                  topicId: pick(['guild-caravan', 'north-gate']),
                },
          );
        } else {
          const target = accepted.length > 0 && rng() < 0.9 ? pick(accepted) : 'none';
          result = await world.submit({ type: 'UndoCommand', targetCommandId: target }, DM);
          if (result.status === 'accepted') counts.undone += 1;
          if (codeOf(result) === 'UNDO_UNSAFE') counts.blocked += 1;
        }

        if (result.status === 'rejected') {
          expect(await world.version(), `step ${String(step)}: ${result.code}`).toBe(before);
        } else {
          accepted.push(result.commandId);
          if (codeOf(result) === 'accepted' && roll >= 0.72) {
            expect(await oracle(world), `after undo at step ${String(step)}`).toBeNull();
          }
        }
      }

      expect(await oracle(world)).toBeNull();
      // Authoring histories replay, round-trip through storage, and reload identically.
      const { state, history } = (await world.engine.load(CAMPAIGN)) ?? {};
      if (!state || !history) throw new Error('missing campaign');
      expect(replay(history)).toEqual(state);
      const stored = JSON.parse(JSON.stringify(history)) as unknown[];
      expect(replay(stored.map(parseRecordedEvent))).toEqual(state);
      const fresh = new WorldEngine({
        store: world.store,
        ids: new SequentialIds(5),
        clock: new SteppingClock(),
      });
      expect((await fresh.load(CAMPAIGN))?.state).toEqual(state);
      expect(counts.committed).toBeGreaterThan(0);
      expect(counts.refused + counts.unconfirmed).toBeGreaterThan(0);
    },
    60_000,
  );
});
