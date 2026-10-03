import type { CharacterSheet, ContextAction } from '@ltw/contracts';
import type { WorldState } from '@ltw/domain';
import { describe, expect, it } from 'vitest';

import { entityContext } from './entity-context.ts';
import { DM, ELOWEN, elowenView, perspective, seedRavenford } from './testing/ravenford.ts';

/** Legality comes from @ltw/rules on the canonical sheet (ADR 0012 "Legality"). */
async function world(
  change: (sheet: CharacterSheet) => CharacterSheet,
  ...extra: Record<string, unknown>[]
): Promise<WorldState> {
  const seeded = await seedRavenford();
  const sheet = seeded.state.characterSheets.get(ELOWEN);
  if (!sheet) throw new Error('missing sheet');
  return seeded.apply(
    { type: 'SetCharacterSheet', entityId: ELOWEN, sheet: change(sheet) },
    ...extra,
  );
}

function action(state: WorldState, entityId: string, id: string): ContextAction | undefined {
  const result = entityContext(state, elowenView(state), entityId);
  if (!result.ok) throw new Error(result.reason);
  return result.context.actions.find((candidate) => candidate.id === id);
}

const freeCastsUsed = (sheet: CharacterSheet): CharacterSheet => ({
  ...sheet,
  spellcasting: sheet.spellcasting.map((source) =>
    source.freeCasts
      ? { ...source, freeCasts: { ...source.freeCasts, used: source.freeCasts.perLongRest } }
      : source,
  ),
});
const noSlots = (sheet: CharacterSheet): CharacterSheet => ({
  ...sheet,
  spellSlots: { max: sheet.spellSlots.max, expended: [...sheet.spellSlots.max] },
});

describe('spell resources', () => {
  it('prefers a slot-free cast while one is left', async () => {
    const state = await world((sheet) => sheet);
    expect(action(state, 'mira-vale', 'healing_word')?.cost).toEqual({ kind: 'free' });
    expect(action(state, 'mira-vale', 'hunters_mark')?.cost).toEqual({ kind: 'free' });
  });

  it('falls back to the lowest available slot', async () => {
    const state = await world((sheet) => {
      const used = freeCastsUsed(sheet);
      return { ...used, spellSlots: { ...used.spellSlots, expended: [4, 0, 0, 0, 0, 0, 0, 0, 0] } };
    });
    expect(action(state, 'mira-vale', 'healing_word')).toMatchObject({
      legal: true,
      cost: { kind: 'slot', slotLevel: 2 },
    });
  });

  it('is illegal with NO_SLOT when nothing is left', async () => {
    const state = await world((sheet) => noSlots(freeCastsUsed(sheet)));
    expect(action(state, 'mira-vale', 'healing_word')).toEqual({
      id: 'healing_word',
      legal: false,
      reason: 'NO_SLOT',
      relevance: 'low',
    });
    expect(action(state, 'mira-vale', 'hunters_mark')?.reason).toBe('NO_SLOT');
  });

  it('reports NOT_KNOWN and NO_WEAPON from the rules', async () => {
    const state = await world((sheet) => ({
      ...sheet,
      weapons: [],
      spellcasting: sheet.spellcasting.filter((source) => source.source !== 'magic-initiate'),
    }));
    expect(action(state, 'mira-vale', 'healing_word')?.reason).toBe('NOT_KNOWN');
    expect(action(state, 'mira-vale', 'longbow_attack')?.reason).toBe('NO_WEAPON');
  });
});

describe('the actor’s condition', () => {
  it('blocks speech, checks, spells and attacks while Incapacitated, not looking', async () => {
    const state = await world((sheet) => ({ ...sheet, conditions: ['incapacitated'] }));
    for (const id of [
      'talk',
      'trade',
      'ask_about',
      'insight_check',
      'healing_word',
      'longbow_attack',
    ]) {
      expect(action(state, 'mira-vale', id)?.reason, id).toBe('INCAPACITATED');
    }
    expect(action(state, 'mira-vale', 'inspect')?.legal).toBe(true);
  });

  it('makes every action illegal when the acting character is dead', async () => {
    const state = await world((sheet) => sheet, {
      type: 'ChangeEntityStatus',
      entityId: ELOWEN,
      status: 'dead',
    });
    const result = entityContext(state, elowenView(state), 'mira-vale');
    if (!result.ok) throw new Error(result.reason);
    expect(new Set(result.context.actions.map((candidate) => candidate.reason))).toEqual(
      new Set(['ACTOR_DEAD']),
    );
  });

  it('needs a canonical sheet for spells and attacks', async () => {
    const seeded = await seedRavenford();
    const state = await seeded.apply({
      type: 'CreateEntity',
      entityId: 'bram-sheetless',
      kind: 'character',
      name: 'Bram',
      existsSince: null,
      placement: { locationId: 'market-square', since: null },
    });
    const bram = perspective(state, DM, { kind: 'CHARACTER', characterId: 'bram-sheetless' });
    const result = entityContext(state, bram, 'mira-vale');
    if (!result.ok) throw new Error(result.reason);
    const byId = new Map(result.context.actions.map((candidate) => [candidate.id, candidate]));
    expect(byId.get('healing_word')?.reason).toBe('NO_CHARACTER_SHEET');
    expect(byId.get('longbow_attack')?.reason).toBe('NO_CHARACTER_SHEET');
    expect(byId.get('talk')?.legal).toBe(true);
  });
});

describe('the target’s state', () => {
  it('shows a present corpse and refuses speech, healing and attacks on it', async () => {
    const state = await world((sheet) => sheet, {
      type: 'ChangeEntityStatus',
      entityId: 'mira-vale',
      status: 'dead',
    });
    const result = entityContext(state, elowenView(state), 'mira-vale');
    if (!result.ok) throw new Error(result.reason);
    expect(result.context.visibleState).toEqual({ present: true, status: 'dead' });
    for (const id of ['talk', 'trade', 'ask_about', 'healing_word', 'longbow_attack']) {
      expect(action(state, 'mira-vale', id)?.reason, id).toBe('TARGET_DEAD');
    }
    expect(action(state, 'mira-vale', 'inspect')?.legal).toBe(true);
    expect(action(state, 'mira-vale', 'talk')?.relevance).toBe('low');
  });

  it('reports NOT_PRESENT, never TARGET_DEAD, for an absent target', async () => {
    const state = await world((sheet) => sheet, {
      type: 'ChangeEntityStatus',
      entityId: 'orin-stonebeard',
      status: 'dead',
    });
    expect(action(state, 'orin-stonebeard', 'talk')?.reason).toBe('NOT_PRESENT');
  });
});
