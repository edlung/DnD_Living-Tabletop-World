import { describe, expect, it } from 'vitest';

import { cast, chapters, clues, handouts, HERO_KEYS, items } from './data.ts';
import { buildPearlPackage } from './package.ts';
import { validatePearl } from './validate.ts';

describe('Тайна Лунной Жемчужины authored adventure', () => {
  it('materializes all three-player encounters without playing future events', async () => {
    const content = buildPearlPackage();
    const result = await validatePearl(content);
    expect(result.assessment.findings.filter((f) => f.severity === 'error')).toEqual([]);
    expect(result.assessment.readiness).toBe('READY');
    expect(content.party).toHaveLength(3);
    expect(result.snapshot?.state.roster.size).toBe(0);
    expect(result.snapshot?.state.encounter).toBeNull();
    expect(
      result.snapshot?.history.some((event) =>
        ['MemoryRecorded', 'CombatStarted', 'ClueDiscovered'].includes(event.type),
      ),
    ).toBe(false);
    expect(
      content.encounters.every((e) => e.combatants.filter((c) => c.side === 'party').length === 3),
    ).toBe(true);
  });

  it('supports every three-seat choice and an optional fourth without a phantom companion', async () => {
    for (const omitted of HERO_KEYS) {
      const party = HERO_KEYS.filter((hero) => hero !== omitted);
      const content = buildPearlPackage(party);
      expect(content.entities.some((entity) => entity.key === omitted)).toBe(false);
      expect((await validatePearl(content)).assessment.readiness).toBe('READY');
    }
    const four = buildPearlPackage(HERO_KEYS);
    expect((await validatePearl(four)).assessment.readiness).toBe('READY');
    expect(() => buildPearlPackage(['toren', 'toren', 'amalia'])).toThrow();
  });

  it('keeps secrets and later discoveries out of initial public and party records', () => {
    const content = buildPearlPackage();
    const open = content.knowledge.filter((k) =>
      ['PUBLIC', 'PARTY', 'CHARACTER'].includes(k.scope.kind),
    );
    const text = JSON.stringify(open);
    for (const npc of cast.npcs) expect(text).not.toContain(npc.secret);
    expect(text).not.toContain('Люсьен');
    expect(text).not.toContain('лот № 7');
    expect(content.clues.every((clue) => clue.method === 'inspect' && clue.dc === undefined)).toBe(
      true,
    );
  });

  it('has complete chapters, references and contingency routes through the ending', () => {
    expect(chapters.map((chapter) => chapter.number)).toEqual(
      Array.from({ length: 12 }, (_, i) => i + 1),
    );
    const props = new Set([
      ...handouts.map((card) => card.key),
      ...items.map((item) => `item-${item.key}`),
    ]);
    const clueKeys = new Set(clues.map((clue) => clue.key));
    for (const chapter of chapters) {
      expect(chapter.scenes).toHaveLength(3);
      for (const scene of chapter.scenes) {
        expect(scene.failForward.length).toBeGreaterThan(30);
        expect(scene.choices.length).toBeGreaterThanOrEqual(3);
      }
      for (const prop of chapter.props)
        expect(props.has(prop), `${chapter.key}: ${prop}`).toBe(true);
      for (const clue of chapter.clues) expect(clueKeys.has(clue)).toBe(true);
      expect(chapter.puzzle.hints).toHaveLength(3);
    }
    expect(chapters.find((chapter) => chapter.number === 11)?.consequences).toHaveLength(4);
  });
});
