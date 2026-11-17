import { describe, expect, it } from 'vitest';

import { turnedLeft } from './facing.ts';

const at = (
  entityId: string,
  side: 'party' | 'hostile' | 'neutral',
  x: number,
  y: number,
  extra: { state?: 'up' | 'down' | 'dead'; size?: 'medium' | 'large' } = {},
) => ({
  entity: { entityId },
  side,
  position: { x, y },
  state: extra.state ?? 'up',
  ...(extra.size ? { size: extra.size } : {}),
});

describe('standing figures turn to the nearest opponent', () => {
  it('turns a figure left when its nearest opponent stands to its left', () => {
    const left = turnedLeft([at('hero', 'party', 2, 6), at('goblin', 'hostile', 8, 4)]);
    expect([...left]).toEqual(['goblin']);
  });

  it('takes the nearest opponent, and passes over the dead', () => {
    const fight = [
      at('hero', 'party', 6, 5),
      at('near', 'hostile', 4, 5),
      at('far', 'hostile', 12, 5),
      at('fallen', 'hostile', 7, 5, { state: 'dead' }),
    ];
    const left = turnedLeft(fight);
    expect(left.has('hero')).toBe(true);
    expect(turnedLeft(fight.filter((entry) => entry.entity.entityId !== 'near')).has('hero')).toBe(
      false,
    );
  });

  it('keeps a neutral, a lone figure and one with its opponent straight ahead facing right', () => {
    const left = turnedLeft([
      at('hero', 'party', 5, 5),
      at('ahead', 'hostile', 5, 2),
      at('stranger', 'neutral', 9, 9),
    ]);
    expect(left.size).toBe(0);
    expect(turnedLeft([at('alone', 'party', 5, 5)]).size).toBe(0);
  });

  it('measures from the middle of a large space', () => {
    // An ogre over squares 4–5 has its middle at 5; a hero in square 4 (middle 4.5) has it to
    // the right, though the ogre's space begins in the hero's own column.
    const left = turnedLeft([
      at('ogre', 'hostile', 4, 4, { size: 'large' }),
      at('hero', 'party', 4, 6),
    ]);
    expect(left.has('hero')).toBe(false);
    expect(left.has('ogre')).toBe(true);
  });
});
