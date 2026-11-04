import { describe, expect, it } from 'vitest';

import { carryingCapacityLb, deriveCharacter, loadSpeedFt } from '../character-derived.ts';
import { elowen } from '../testing/elowen.ts';
import { hitPointsAllowed, levelReady, startingAt } from './campaign-levels.ts';

/**
 * The campaign's options in the rules (docs/adr/0056-characters-from-the-srd.md §3): levels by
 * experience or milestone, a level's hit points, a character starting at the campaign's level,
 * and carrying enforced as SRD 5.2.1's Carrying Capacity says.
 */
describe('levels under the campaign options', () => {
  it('are ready by experience, or by milestone only once the DM granted one', () => {
    // At level 3, level 4 needs 2,700 XP.
    const third = [{ classId: 'wizard' as const, level: 3 }];
    const earned = elowen({ classes: third, experience: 2_700 });
    expect([levelReady(earned, 'experience'), levelReady(earned, 'milestone')]).toEqual([
      true,
      false,
    ]);
    const granted = elowen({ classes: third, experience: 0, pendingLevels: 1 });
    expect([levelReady(granted, 'experience'), levelReady(granted, 'milestone')]).toEqual([
      true,
      true,
    ]);
    expect(levelReady(elowen({ classes: [{ classId: 'wizard', level: 20 }] }), 'experience')).toBe(
      false,
    );
  });

  it('let a level’s hit points come as the player chooses or only the campaign’s way', () => {
    expect([hitPointsAllowed('choice', 'fixed'), hitPointsAllowed('choice', 'rolled')]).toEqual([
      true,
      true,
    ]);
    expect([hitPointsAllowed('fixed', 'rolled'), hitPointsAllowed('rolled', 'rolled')]).toEqual([
      false,
      true,
    ]);
  });

  it('start a new character with its level’s experience and the levels to take', () => {
    const made = elowen({ classes: [{ classId: 'wizard', level: 1 }], experience: 0 });
    expect(startingAt(made, 1)).toBe(made);
    // SRD 5.2.1: started at level 10, a character has 64,000 XP.
    expect(startingAt(made, 10)).toMatchObject({ experience: 64_000, pendingLevels: 9 });
  });
});

describe('carrying', () => {
  it('carries Strength × 15 lb at Small or Medium, half that Tiny and twice it Large', () => {
    const strong = elowen({ abilities: { ...elowen().abilities, str: 10 } });
    expect(carryingCapacityLb(strong)).toBe(150);
    expect(carryingCapacityLb({ ...strong, size: 'small' })).toBe(150);
    expect(carryingCapacityLb({ ...strong, size: 'tiny' })).toBe(75);
    expect(carryingCapacityLb({ ...strong, size: 'large' })).toBe(300);
  });

  it('drags a load past that at 5 ft, and cannot move one past twice it', () => {
    const strong = elowen({ abilities: { ...elowen().abilities, str: 10 } });
    expect([150, 151, 300, 301].map((load) => loadSpeedFt(strong, load))).toEqual([null, 5, 5, 0]);
    const slowed = deriveCharacter(strong, [], {}, 'en', 5);
    expect([slowed.speedFt, slowed.loadSpeedFt]).toEqual([5, 5]);
    expect(deriveCharacter(strong).loadSpeedFt).toBeUndefined();
  });
});
