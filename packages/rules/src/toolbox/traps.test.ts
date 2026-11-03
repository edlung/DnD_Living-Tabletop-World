import { TRAP_IDS, type SrdBlock } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { srdRulesSection } from '../srd/reference.ts';
import { TRAPS } from './traps.ts';

/**
 * The traps the World Engine springs hold the SRD's numbers (docs/adr/0055-rules-reference-and-
 * toolbox.md §4): every save, DC, die and depth is written in the trap's own words or tier table.
 */
const wordsOf = (blocks: readonly SrdBlock[]): string =>
  blocks
    .map((block) =>
      block.kind === 'table'
        ? block.rows.map((row) => row.join(' ')).join(' ')
        : block.kind === 'names'
          ? block.names.join(' ')
          : block.text,
    )
    .join(' ');
const ABILITY = { dex: 'Dexterity', con: 'Constitution' } as const;

describe('the Toolbox’s traps', () => {
  it('are the SRD’s eight', () => {
    expect(TRAPS.map((trap) => trap.trapId)).toEqual([...TRAP_IDS]);
  });

  for (const trap of TRAPS) {
    it(`${trap.trapId}: every number from its words`, () => {
      const section = srdRulesSection(trap.trapId);
      expect(section).toBeDefined();
      const words = wordsOf(section?.blocks ?? []);
      for (const [index, tier] of trap.tiers.entries()) {
        const first = index === 0;
        if (tier.save) {
          const dc = String(tier.save.dc);
          if (first) {
            expect(words).toContain(`DC ${dc} ${ABILITY[tier.save.ability as 'dex' | 'con']}`);
          } else expect(words).toContain(dc);
        }
        for (const damage of tier.damage)
          expect(words, `${trap.trapId} tier ${String(index + 1)}`).toContain(
            `(${String(damage.count)}d${String(damage.sides)})`,
          );
        if (tier.fallFt !== undefined) {
          expect(words).toContain(
            first ? `${String(tier.fallFt)}-foot-deep` : `${String(tier.fallFt)} feet`,
          );
          expect(words).toContain(`(${String(tier.fallFt / 10)}d6)`);
        }
        if (tier.darts) expect(words).toContain('1d3 darts');
      }
      // Its levels begin where its subtitle says (the rolling stone's one tier spans two ranges).
      expect(section?.subtitle).toContain(`(Levels ${trap.tiers[0]?.levels.split('–')[0] ?? ''}–`);
      // How it is found on the board (ADR 0057 §6): a Search's Perception or a Study's
      // Investigation, at the DC its words give.
      const finding =
        trap.detect.action === 'search'
          ? `As a Search action, a creature can examine`
          : `As a Study action, a creature can examine`;
      expect(words).toContain(finding);
      expect(words).toContain(
        `DC ${String(trap.detect.dc)} ${
          trap.detect.action === 'search' ? 'Wisdom (Perception)' : 'Intelligence (Investigation)'
        } check`,
      );
      if (trap.resets === 'each-turn')
        expect(words).toContain('resets at the start of the next turn');
      if (trap.resets === 'thrice') expect(words).toContain('fewer than three times');
      if (trap.leaves === 'rubble') expect(words).toContain('into Difficult Terrain');
      if (trap.leaves === 'pit') expect(words).toContain('pit');
      if (trap.onTurnStart) expect(words).toContain('starts its turn there');
    });
  }
});
