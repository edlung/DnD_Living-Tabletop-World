import type { WorldState } from '@ltw/domain';
import { describe, expect, it } from 'vitest';

import ambush from '../../../fixtures/ravenford/road-ambush.json' with { type: 'json' };
import { entityContext } from './entity-context.ts';
import {
  DM,
  ELOWEN,
  ELOWEN_FORBIDDEN_MARKERS,
  elowenView,
  perspective,
  seedRavenford,
} from './testing/ravenford.ts';

/**
 * Gate 02 coverage (docs/GATE_COVERAGE.md, Stages 50–60): entity context
 * must not expose secrets through actions, reasons, topics, or relevance.
 */
const PROBE_IDS = ['no-such-entity', 'ashen-circle', '3f9c2b7e-5a1d-4e8f-9b06-7c4d2e1a8f54'];

function everyContext(state: WorldState): string {
  const views = [
    elowenView(state),
    perspective(state, DM, { kind: 'CHARACTER', characterId: ELOWEN }),
  ];
  const ids = [...state.entities.keys(), ...PROBE_IDS].sort();
  return JSON.stringify(
    // Results only: the requested IDs themselves are not output.
    views.map((view) => ids.map((entityId) => entityContext(state, view, entityId))),
  );
}

describe('secret markers', () => {
  it('never appear in any context Elowen can request in Market Square', async () => {
    const { state } = await seedRavenford();
    const output = everyContext(state);
    for (const marker of ELOWEN_FORBIDDEN_MARKERS) expect(output, marker).not.toContain(marker);
  });

  it('stay hidden at the caravan site, where evidence is perceived but not understood', async () => {
    const seeded = await seedRavenford();
    const state = await seeded.apply({
      type: 'PlaceEntity',
      entityId: ELOWEN,
      locationId: 'abandoned-caravan-site',
    });
    const perceivedIds = [...state.entities.keys()].map((entityId) => `"${entityId}"`);
    const output = everyContext(state);
    // Perceived entities are identified by ID and kind; their names and every secret stay hidden.
    for (const marker of ELOWEN_FORBIDDEN_MARKERS.filter((m) => !perceivedIds.includes(m))) {
      expect(output, marker).not.toContain(marker);
    }
    const symbol = entityContext(state, elowenView(state), 'strange-symbol');
    expect(symbol.ok && symbol.context.entity).toEqual({
      entityId: 'strange-symbol',
      kind: 'feature',
      name: null,
    });
  });
});

describe('noninterference', () => {
  it('hidden changes leave every context Elowen can request unchanged', async () => {
    const baseline = await seedRavenford();
    const changed = await seedRavenford();
    const hidden = await changed.apply(
      {
        type: 'AddKnowledge',
        scope: { kind: 'WORLD_TRUTH' },
        knowledgeType: 'SECRET',
        statement: 'Mira secretly sold the caravan route.',
        subjects: ['mira-vale', 'guild-caravan', 'market-square'],
        knownSince: null,
      },
      {
        type: 'AddKnowledge',
        scope: { kind: 'NPC', npcId: 'mira-vale' },
        knowledgeType: 'UNKNOWN',
        statement: 'Who is Orin really working for?',
        subjects: ['orin-stonebeard', 'ravenford'],
        knownSince: null,
      },
      {
        type: 'AddKnowledge',
        scope: { kind: 'DM' },
        knowledgeType: 'SECRET',
        statement: 'Thorne will betray the party.',
        subjects: ['captain-thorne', 'mira-vale'],
        knownSince: null,
      },
      {
        type: 'RecordMemory',
        scope: { kind: 'NPC', npcId: 'orin-stonebeard' },
        memoryKind: 'DECISION',
        summary: 'Orin decided to watch Mira closely.',
        occurredAt: 35000,
        participants: ['orin-stonebeard', 'mira-vale'],
      },
      { type: 'ChangeEntityStatus', entityId: 'orin-stonebeard', status: 'dead' },
      { type: 'PlaceEntity', entityId: 'captain-thorne', locationId: 'golden-stag-inn' },
      {
        type: 'SetCharacterSheet',
        entityId: 'mira-vale',
        sheet: changed.state.characterSheets.get(ELOWEN),
      },
      {
        type: 'CreateEntity',
        entityId: 'hidden-assassin',
        kind: 'npc',
        name: 'Hidden Assassin',
        existsSince: null,
        placement: { locationId: 'north-gate', since: null },
      },
    );
    const ids = [...hidden.entities.keys()].sort();
    const contexts = (state: WorldState) =>
      ids.map((entityId) => entityContext(state, elowenView(state), entityId));
    expect(contexts(hidden)).toEqual(contexts(baseline.state));
  });

  it('clues, DCs and disclosure policy never change any context (ADR 0013 §2–3)', async () => {
    const baseline = await seedRavenford();
    const changed = await seedRavenford();
    for (const world of [baseline, changed]) {
      await world.submit({
        type: 'EnterLocation',
        characterId: ELOWEN,
        locationId: 'old-trade-road',
      });
      await world.submit({
        type: 'EnterLocation',
        characterId: ELOWEN,
        locationId: 'abandoned-caravan-site',
      });
    }
    await changed.apply(
      {
        type: 'AddClue',
        entityId: 'goblin-weapon',
        method: 'perception',
        dc: 30,
        statement: 'Hidden.',
      },
      { type: 'AddClue', entityId: 'wagon-tracks', method: 'inspect', statement: 'More tracks.' },
      { type: 'AddClue', entityId: 'mira-vale', method: 'inspect', statement: 'Mira looks tired.' },
      { type: 'SetDisclosure', knowledgeId: 'thorne-missing-patrol', disclosure: 'WILLING' },
      { type: 'SetDisclosure', knowledgeId: 'mira-cargo-logistics', disclosure: 'GUARDED' },
    );
    const contexts = async (world: typeof baseline) => {
      const state = await world.current();
      return [...state.entities.keys()]
        .sort()
        .map((entityId) => entityContext(state, elowenView(state), entityId));
    };
    expect(await contexts(changed)).toEqual(await contexts(baseline));
  });

  it('an NPC’s attitude, and what another holder showed it, never change any context (ADR 0020)', async () => {
    const baseline = await seedRavenford();
    const changed = await seedRavenford();
    for (const world of [baseline, changed]) {
      await world.apply(
        {
          type: 'CreateEntity',
          entityId: 'bram-tull',
          kind: 'character',
          name: 'Bram Tull',
          existsSince: null,
          placement: { locationId: 'orins-alchemy', since: null },
        },
        {
          type: 'AddKnowledge',
          knowledgeId: 'bram-symbol-evidence',
          scope: { kind: 'CHARACTER', characterId: 'bram-tull' },
          knowledgeType: 'EVIDENCE',
          statement: 'Bram found the symbol too.',
          subjects: ['strange-symbol'],
          knownSince: null,
        },
      );
      await world.submit({
        type: 'EnterLocation',
        characterId: ELOWEN,
        locationId: 'orins-alchemy',
      });
    }
    await changed.apply(
      { type: 'SetRelationship', npcId: 'orin-stonebeard', attitude: 'HOSTILE' },
      {
        type: 'ShowEvidence',
        characterId: 'bram-tull',
        npcId: 'orin-stonebeard',
        knowledgeId: 'bram-symbol-evidence',
      },
      { type: 'SetDisclosure', knowledgeId: 'orin-prior-incident', disclosure: 'WILLING' },
    );
    const contexts = async (world: typeof baseline) => {
      const state = await world.current();
      return [...state.entities.keys()]
        .sort()
        .map((entityId) => entityContext(state, elowenView(state), entityId));
    };
    expect(await contexts(changed)).toEqual(await contexts(baseline));
  });

  it('a goblin’s hidden statistics never change any context in combat (ADR 0015 §6)', async () => {
    const baseline = await seedRavenford();
    const changed = await seedRavenford();
    const block = changed.state.statBlocks.get('goblin-raider-1');
    if (!block) throw new Error('no stat block');
    await changed.apply({
      type: 'SetStatBlock',
      entityId: 'goblin-raider-1',
      statBlock: {
        ...block,
        armorClass: 21,
        hitPoints: { max: 60, current: 7 },
        savingThrows: { ...block.savingThrows, dex: 9 },
      },
    });
    const contexts = async (world: typeof baseline) => {
      const state = await world.apply(...ambush.place, ambush.startCombat);
      const output = everyContext(state);
      // As at the caravan site: perceived entities appear by ID, never by name or secret.
      const ids = [...state.entities.keys()].map((entityId) => `"${entityId}"`);
      for (const marker of ELOWEN_FORBIDDEN_MARKERS.filter((m) => !ids.includes(m))) {
        expect(output, marker).not.toContain(marker);
      }
      return output;
    };
    expect(await contexts(changed)).toBe(await contexts(baseline));
  });

  it('the spell a reaction window suspends never changes any context (ADR 0016 §4)', async () => {
    const contexts = async (spellId: string) => {
      const world = await seedRavenford();
      await world.apply(...ambush.place, ambush.startCombat);
      for (const id of [ELOWEN, 'goblin-raider-1', 'goblin-raider-2', 'goblin-raider-3']) {
        await world.apply({ type: 'EndTurn', combatantId: id });
      }
      const state = await world.apply({
        type: 'CastSpell',
        combatantId: 'goblin-shaman',
        spellId,
        targetId: ELOWEN,
      });
      expect(state.reactionWindows.size).toBe(1);
      return everyContext(state);
    };
    const bolt = await contexts('ashen-bolt');
    expect(bolt).toBe(await contexts('binding-hex'));
    expect(bolt).not.toMatch(/ashen|binding|Ashen|Binding/);
  });

  it('is deterministic across independent replays', async () => {
    const first = await seedRavenford();
    const second = await seedRavenford();
    expect(everyContext(first.state)).toBe(everyContext(second.state));
  });
});
