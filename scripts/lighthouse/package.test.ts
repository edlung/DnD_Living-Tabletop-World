import { describe, expect, it } from 'vitest';

import { cast, chapters, clues, handouts, HERO_KEYS, items } from './data.ts';
import { buildLighthousePackage } from './package.ts';
import { validateLighthouse } from './validate.ts';

describe('Маяк Между Ветрами authored adventure', () => {
  it('materializes all three-player encounters without playing future events', async () => {
    const content = buildLighthousePackage();
    const result = await validateLighthouse(content);
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
      const content = buildLighthousePackage(party);
      expect(content.entities.some((entity) => entity.key === omitted)).toBe(false);
      expect((await validateLighthouse(content)).assessment.readiness).toBe('READY');
    }
    const four = buildLighthousePackage(HERO_KEYS);
    expect((await validateLighthouse(four)).assessment.readiness).toBe('READY');
    expect(() => buildLighthousePackage(['finn', 'finn', 'asya'])).toThrow();
  });

  it('keeps secrets and later discoveries out of initial public and party records', () => {
    const content = buildLighthousePackage();
    const open = content.knowledge.filter((k) =>
      ['PUBLIC', 'PARTY', 'CHARACTER'].includes(k.scope.kind),
    );
    const text = JSON.stringify(open);
    for (const npc of cast.npcs) expect(text).not.toContain(npc.secret);
    expect(text).not.toContain('Северин');
    expect(text).not.toContain('Сохранённой минуты');
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
