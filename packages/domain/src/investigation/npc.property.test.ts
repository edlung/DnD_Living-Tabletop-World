import type { CommandResult } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { checkWorldIntegrity } from '../kernel/projections/integrity.ts';
import { mulberry32 } from '../kernel/testing/random-commands.ts';
import { redecideEffective } from '../kernel/verification/redecide.ts';
import { CAMPAIGN, DM, ELOWEN, MODIFIERS, codeOf, investigationWorld } from './testing/world.ts';

/**
 * Randomized NPC interactions under undo (docs/adr/0020-npc-intelligence.md
 * §1, §2, §4). The DM changes attitudes, disclosures, and names; Elowen moves,
 * shows evidence, asks, and reads NPCs; the DM undoes random commands. After
 * every step a rejection changed nothing; after every accepted undo, and at
 * the end, the world is intact and every still-effective command re-decides
 * identically, so no premise of a disclosure, an Insight, or a quoted name is
 * missing.
 */
const NPCS = ['mira-vale', 'orin-stonebeard', 'captain-thorne'];
const PLACES = ['market-square', 'orins-alchemy', 'north-gate'];
const TOPICS = ['guild-caravan', 'strange-symbol', 'old-trade-road', 'captain-thorne'];
const EVIDENCE = ['party-symbol-evidence', 'party-road-evidence'];
const ATTITUDES = ['HOSTILE', 'WARY', 'NEUTRAL', 'FRIENDLY', 'TRUSTED'];
/** Who stands where in the seed. */
const NPC_AT: Readonly<Record<string, string>> = {
  'market-square': 'mira-vale',
  'orins-alchemy': 'orin-stonebeard',
  'north-gate': 'captain-thorne',
};

describe('NPC interactions under random undo', () => {
  it.each([1, 2, 3, 4, 5, 6])(
    'seed %i',
    async (seed) => {
      const rng = mulberry32(seed * 7_727);
      const pick = <T>(items: readonly T[]): T => items[Math.floor(rng() * items.length)] as T;
      const world = await investigationWorld();
      for (const [knowledgeId, subject] of [
        ['party-symbol-evidence', 'strange-symbol'],
        ['party-road-evidence', 'old-trade-road'],
      ] as const) {
        await world.submit(
          {
            type: 'AddKnowledge',
            knowledgeId,
            scope: { kind: 'PARTY' },
            knowledgeType: 'EVIDENCE',
            statement: `Evidence about ${subject}.`,
            subjects: [subject],
            knownSince: null,
          },
          DM,
        );
      }
      const npcRecords = [...(await world.state()).knowledge.values()]
        .filter((record) => record.scope.kind === 'NPC')
        .map((record) => record.knowledgeId);
      const accepted: string[] = [];
      const counts = { shared: 0, shown: 0, inferred: 0, undone: 0, blocked: 0 };

      const undoAndCheck = async () => {
        const snapshot = await world.engine.load(CAMPAIGN);
        if (!snapshot) throw new Error('missing campaign');
        expect(checkWorldIntegrity(snapshot.state)).toEqual([]);
        const log = await world.engine.commandLog(CAMPAIGN);
        return redecideEffective(log, snapshot, (_sheet, skill) => MODIFIERS[skill] ?? 0);
      };

      /** Mostly the NPC where Elowen stands, so conversations happen. */
      const someNpc = async () => {
        const here = (await world.state()).entities.get(ELOWEN)?.placement?.locationId ?? '';
        return rng() < 0.8 && NPC_AT[here] ? (NPC_AT[here] ?? pick(NPCS)) : pick(NPCS);
      };

      for (let step = 0; step < 80; step += 1) {
        const before = (await world.state()).version;
        const roll = rng();
        let result: CommandResult;
        let undo = false;
        if (roll < 0.12) {
          result = await world.submit(
            { type: 'SetRelationship', npcId: pick(NPCS), attitude: pick(ATTITUDES) },
            DM,
          );
        } else if (roll < 0.22) {
          result = await world.submit(
            {
              type: 'SetDisclosure',
              knowledgeId: pick(npcRecords),
              disclosure: pick(['WILLING', 'GUARDED']),
            },
            DM,
          );
        } else if (roll < 0.28) {
          result = await world.submit(
            {
              type: 'UpdateEntityProfile',
              entityId: pick([...NPCS, ...TOPICS]),
              name: `Name ${String(step)}`,
            },
            DM,
          );
        } else if (roll < 0.38) {
          result = await world.submit({
            type: 'EnterLocation',
            characterId: ELOWEN,
            locationId: pick(PLACES),
          });
        } else if (roll < 0.53) {
          result = await world.submit({
            type: 'AskAbout',
            characterId: ELOWEN,
            npcId: await someNpc(),
            topicId: pick(TOPICS),
          });
          if (result.status === 'accepted') counts.shared += 1;
        } else if (roll < 0.65) {
          result = await world.submit({
            type: 'ShowEvidence',
            characterId: ELOWEN,
            npcId: await someNpc(),
            knowledgeId: pick(EVIDENCE),
          });
          if (result.status === 'accepted') counts.shown += 1;
        } else if (roll < 0.74) {
          world.roll(1 + Math.floor(rng() * 20));
          result = await world.submit({
            type: 'InsightCheck',
            characterId: ELOWEN,
            npcId: await someNpc(),
            topicId: pick(TOPICS),
          });
          if (
            result.status === 'accepted' &&
            result.outcome?.kind === 'InsightCheck' &&
            result.outcome.inferred.length > 0
          ) {
            counts.inferred += 1;
          }
        } else {
          undo = true;
          const target = accepted.length > 0 ? pick(accepted) : 'none';
          result = await world.submit({ type: 'UndoCommand', targetCommandId: target }, DM);
          if (result.status === 'accepted') counts.undone += 1;
          if (codeOf(result) === 'UNDO_UNSAFE') counts.blocked += 1;
        }

        if (result.status === 'rejected') {
          expect((await world.state()).version, `step ${String(step)}: ${result.code}`).toBe(
            before,
          );
          continue;
        }
        accepted.push(result.commandId);
        if (undo) expect(await undoAndCheck(), `after undo at step ${String(step)}`).toBeNull();
      }

      expect(await undoAndCheck()).toBeNull();
      expect(counts.shared + counts.shown).toBeGreaterThan(0);
      expect(counts.undone + counts.blocked).toBeGreaterThan(0);
    },
    60_000,
  );
});
