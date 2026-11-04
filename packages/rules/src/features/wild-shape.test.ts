import type { CharacterSheet } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { checkCast } from '../casting.ts';
import { deriveCharacter } from '../character-derived.ts';
import { longRest } from '../rest.ts';
import { choicesFor } from '../testing/character-choices.ts';
import { buildCharacter } from '../builder/build.ts';
import { startTurn } from '../turn.ts';
import { formOf, takesForm, wildShapeForms } from './wild-shape.ts';

/**
 * Wild Shape's forms (SRD 5.2.1, the Druid's Beast Shapes; docs/adr/0056-characters-from-the-srd.md
 * §5): Challenge Rating 1/4 from level 2, 1/2 from level 4, 1 and flying from level 8; no spells in
 * a form, and a long rest ends it.
 */
const druid = (level: number): CharacterSheet => {
  const built = buildCharacter(choicesFor('druid'), () => 4);
  if (!built.ok) throw new Error(JSON.stringify(built.problems));
  return { ...built.sheet, classes: [{ classId: 'druid', level }] };
};

describe('the Beast Shapes table', () => {
  it('opens forms by the Druid’s level', () => {
    expect(wildShapeForms(druid(1), 'en')).toEqual([]);
    const second = wildShapeForms(druid(2), 'en');
    expect(second.map((form) => form.formId)).toEqual(
      expect.arrayContaining(['wolf', 'riding-horse', 'spider', 'rat']),
    );
    expect(second.every((form) => ['0', '1/8', '1/4'].includes(form.rating) && !form.flies)).toBe(
      true,
    );
    expect(takesForm(druid(2), 'brown-bear')).toBe(false);
    expect(takesForm(druid(8), 'brown-bear')).toBe(true);
    // A flyer from level 8 only.
    expect(takesForm(druid(4), 'giant-bat')).toBe(false);
    expect(takesForm(druid(8), 'giant-bat')).toBe(true);
    expect(
      wildShapeForms(druid(8), 'en').find((form) => form.formId === 'giant-bat'),
    ).toMatchObject({ size: 'large', flies: true, rating: '1/4' });
    // A Celestial is no Beast, whatever its wings.
    expect(takesForm(druid(8), 'giant-owl')).toBe(false);
  });

  it('names the forms in the campaign’s language', () => {
    const wolf = wildShapeForms(druid(2), 'ru').find((form) => form.formId === 'wolf');
    expect(wolf?.name).not.toBe('Wolf');
    const derived = deriveCharacter({ ...druid(2), shape: { formId: 'wolf' } }, [], {}, 'ru');
    expect(derived.wildShape?.current).toEqual({
      formId: 'wolf',
      name: wolf?.name,
      armorClass: 12,
      speedFt: 40,
    });
    expect(deriveCharacter(druid(1)).wildShape).toBeUndefined();
  });
});

describe('a Druid in a form', () => {
  it('wears the form’s stat block, casts no spell, and is itself after a long rest', () => {
    const shaped = { ...druid(4), shape: { formId: 'wolf' } };
    expect(formOf(shaped)).toMatchObject({ armorClass: 12, speedFt: 40 });
    const spell = shaped.spellcasting[0]?.spells[0];
    if (spell === undefined) throw new Error('no spell');
    const cast = checkCast(shaped, startTurn(true), { spellId: spell, using: { slotLevel: 1 } });
    expect('legal' in cast && !cast.legal ? cast.reason : 'legal').toBe('SHAPED');
    expect(longRest(shaped).shape).toBeUndefined();
  });
});
