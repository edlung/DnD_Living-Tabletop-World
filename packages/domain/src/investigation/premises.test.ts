import type { CommandResult } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { replay } from '../kernel/evolve.ts';
import { checkWorldIntegrity } from '../kernel/projections/integrity.ts';
import {
  CAMPAIGN,
  DM,
  ELOWEN,
  codeOf,
  investigationWorld,
  type InvestigationWorld,
} from './testing/world.ts';

/**
 * Gate 02 regression G02-H02 (reviews/ASTRA_GATE_02_REPORT.md): a player
 * command depends on the premise that made it legal, such as the knowledge or
 * memory that made a target known. Undoing that premise while the action
 * stands must be UNDO_UNSAFE (ADR 0006 §8), naming the action as a blocker
 * and changing nothing. Undoing the action first must then allow it.
 */
function accepted(result: CommandResult): string {
  if (result.status === 'rejected') throw new Error(`${result.code}: ${result.message}`);
  return result.commandId;
}

const remote = (entityId: string) => ({
  type: 'CreateEntity',
  entityId,
  kind: 'location',
  name: `Remote ${entityId}`,
  existsSince: null,
  location: { type: 'site', parentId: null },
});
const enter = (locationId: string) => ({ type: 'EnterLocation', characterId: ELOWEN, locationId });
const undo = (targetCommandId: string) => ({ type: 'UndoCommand', targetCommandId });

const DISCLOSURES = {
  knowledge: (locationId: string) => ({
    type: 'AddKnowledge',
    knowledgeId: 'route-disclosure',
    scope: { kind: 'PARTY' },
    knowledgeType: 'FACT',
    statement: 'The remote place is known.',
    subjects: [locationId],
    knownSince: 36000,
  }),
  memory: (locationId: string) => ({
    type: 'RecordMemory',
    memoryId: 'route-memory',
    scope: { kind: 'PARTY' },
    memoryKind: 'DECISION',
    summary: 'We decided to remember the way.',
    occurredAt: 36000,
    locationId,
  }),
} as const;

async function blockers(world: InvestigationWorld, targetCommandId: string) {
  const before = await world.state();
  const result = await world.submit(undo(targetCommandId), DM);
  expect(codeOf(result)).toBe('UNDO_UNSAFE');
  expect(await world.state()).toEqual(before); // a rejected undo changes nothing
  const list =
    result.status === 'rejected' ? (result.details?.['blockers'] as { commandId: string }[]) : [];
  return list.map((blocker) => blocker.commandId);
}

describe('undo_sole_disclosure_is_blocked_after_enter_location', () => {
  it.each(Object.keys(DISCLOSURES) as (keyof typeof DISCLOSURES)[])('%s variant', async (kind) => {
    const world = await investigationWorld();
    accepted(await world.submit(remote('remote-place'), DM));
    expect(codeOf(await world.submit(enter('remote-place')))).toBe('ENTITY_NOT_FOUND');
    const disclosure = accepted(await world.submit(DISCLOSURES[kind]('remote-place'), DM));
    const move = accepted(await world.submit(enter('remote-place')));

    expect(await blockers(world, disclosure)).toEqual([move]);
    expect((await world.state()).entities.get(ELOWEN)?.placement?.locationId).toBe('remote-place');

    // Reverse order is safe: undo the move, then the disclosure.
    expect(codeOf(await world.submit(undo(move), DM))).toBe('accepted');
    expect(codeOf(await world.submit(undo(disclosure), DM))).toBe('accepted');
    const state = await world.state();
    expect(state.entities.get(ELOWEN)?.placement?.locationId).toBe('market-square');
    expect(checkWorldIntegrity(state)).toEqual([]);
    const snapshot = await world.engine.load(CAMPAIGN);
    expect(snapshot && replay(snapshot.history)).toEqual(state);
  });
});

describe('every player command records what made it legal', () => {
  it('AskAbout depends on the knowledge that made its topic known', async () => {
    const world = await investigationWorld();
    accepted(
      await world.submit(
        {
          type: 'CreateEntity',
          entityId: 'lost-ledger',
          kind: 'item',
          name: 'Lost Ledger',
          existsSince: null,
        },
        DM,
      ),
    );
    const topic = accepted(
      await world.submit(
        {
          type: 'AddKnowledge',
          knowledgeId: 'ledger-rumor',
          scope: { kind: 'PARTY' },
          knowledgeType: 'RUMOR',
          statement: 'A ledger is missing.',
          subjects: ['lost-ledger'],
          knownSince: null,
        },
        DM,
      ),
    );
    accepted(
      await world.submit(
        {
          type: 'AddKnowledge',
          knowledgeId: 'mira-ledger',
          scope: { kind: 'NPC', npcId: 'mira-vale' },
          knowledgeType: 'FACT',
          statement: 'Mira kept the ledger.',
          subjects: ['lost-ledger'],
          knownSince: null,
        },
        DM,
      ),
    );
    accepted(
      await world.submit(
        { type: 'SetDisclosure', knowledgeId: 'mira-ledger', disclosure: 'WILLING' },
        DM,
      ),
    );
    const asked = accepted(
      await world.submit({
        type: 'AskAbout',
        characterId: ELOWEN,
        npcId: 'mira-vale',
        topicId: 'lost-ledger',
      }),
    );
    expect(await blockers(world, topic)).toContain(asked);
  });

  it('FormHypothesis depends on the knowledge that made its subjects known', async () => {
    const world = await investigationWorld();
    accepted(
      await world.submit(
        {
          type: 'CreateEntity',
          entityId: 'odd-coin',
          kind: 'item',
          name: 'Odd Coin',
          existsSince: null,
        },
        DM,
      ),
    );
    const known = accepted(
      await world.submit(
        {
          type: 'AddKnowledge',
          knowledgeId: 'coin-seen',
          scope: { kind: 'PARTY' },
          knowledgeType: 'EVIDENCE',
          statement: 'An odd coin.',
          subjects: ['odd-coin'],
          knownSince: null,
        },
        DM,
      ),
    );
    const formed = accepted(
      await world.submit({
        type: 'FormHypothesis',
        characterId: ELOWEN,
        scope: 'CHARACTER',
        statement: 'The coin is foreign.',
        subjects: ['odd-coin'],
      }),
    );
    expect(await blockers(world, known)).toContain(formed);
  });

  it('AskAbout depends on the sheet that let the character speak', async () => {
    const world = await investigationWorld();
    const sheet = (await world.state()).characterSheets.get(ELOWEN);
    const set = accepted(
      await world.submit(
        { type: 'SetCharacterSheet', entityId: ELOWEN, sheet: { ...sheet, conditions: [] } },
        DM,
      ),
    );
    const asked = accepted(
      await world.submit({
        type: 'AskAbout',
        characterId: ELOWEN,
        npcId: 'mira-vale',
        topicId: 'guild-caravan',
      }),
    );
    expect(await blockers(world, set)).toContain(asked);
  });

  it('records the earliest premise only, so unrelated disclosures stay undoable', async () => {
    const world = await investigationWorld();
    // The Old Trade Road is already public knowledge: a later, redundant record is not the premise.
    const extra = accepted(
      await world.submit(
        {
          type: 'AddKnowledge',
          knowledgeId: 'road-extra',
          scope: { kind: 'PARTY' },
          knowledgeType: 'FACT',
          statement: 'The road is long.',
          subjects: ['old-trade-road'],
          knownSince: null,
        },
        DM,
      ),
    );
    accepted(await world.submit(enter('old-trade-road')));
    expect(codeOf(await world.submit(undo(extra), DM))).toBe('accepted');
  });

  it('prefers perception: what the character sees needs no disclosure', async () => {
    const world = await investigationWorld();
    accepted(await world.submit(enter('old-trade-road')));
    // The caravan site is perceived from the road; a later record about it is not the premise.
    const extra = accepted(
      await world.submit(
        {
          type: 'AddKnowledge',
          knowledgeId: 'site-extra',
          scope: { kind: 'PARTY' },
          knowledgeType: 'RUMOR',
          statement: 'A clearing by the road.',
          subjects: ['abandoned-caravan-site'],
          knownSince: null,
        },
        DM,
      ),
    );
    accepted(await world.submit(enter('abandoned-caravan-site')));
    expect(codeOf(await world.submit(undo(extra), DM))).toBe('accepted');
  });
});
