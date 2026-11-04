import { CONTAGION_IDS } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { srdRulesSection } from '../srd/reference.ts';
import { CONTAGIONS } from './contagions.ts';

/** The contagions the World Engine follows hold the SRD's numbers (ADR 0055 §4). */
const wordsOf = (sectionId: string): string =>
  (srdRulesSection(sectionId)?.blocks ?? [])
    .map((block) => ('text' in block ? `${block.head ?? ''} ${block.text}` : ''))
    .join(' ');

describe('the Toolbox’s contagions', () => {
  it('are the SRD’s three', () => {
    expect(CONTAGIONS.map((one) => one.contagionId)).toEqual([...CONTAGION_IDS]);
  });

  for (const contagion of CONTAGIONS) {
    it(`${contagion.contagionId}: its saves from its words`, () => {
      const words = wordsOf(contagion.contagionId);
      if (contagion.infection)
        expect(words).toContain(`DC ${String(contagion.infection.dc)} Constitution saving throw`);
      if (contagion.atOnce) expect(words).toContain('Blinded condition until the contagion ends');
      if (contagion.fight) {
        expect(words).toMatch(new RegExp(`DC ${String(contagion.fight.dc)} Constitu(-\\s?)?tion`));
        expect(words).toContain(
          contagion.fight.when === 'long-rest' ? 'At the end of each Long Rest' : 'Daily at dawn',
        );
        if (contagion.fight.course === 'three-successes')
          expect(words).toContain('succeeds on three of these saves');
      }
    });
  }
});
