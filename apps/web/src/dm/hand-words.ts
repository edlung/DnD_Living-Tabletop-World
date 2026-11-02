import type { Condition, DamageType, DmHandEntry } from '@ltw/contracts';
import type { Translate } from '@ltw/ui';

/**
 * Words for the DM's changes by hand (docs/adr/0043-dm-screen.md §1): damage types, conditions,
 * and one line for each change as the DM's history lists it.
 */
export const DAMAGE_WORDS: Readonly<Record<DamageType, string>> = {
  acid: 'Acid',
  bludgeoning: 'Bludgeoning',
  cold: 'Cold',
  fire: 'Fire',
  force: 'Force',
  lightning: 'Lightning',
  necrotic: 'Necrotic',
  piercing: 'Piercing',
  poison: 'Poison',
  psychic: 'Psychic',
  radiant: 'Radiant',
  slashing: 'Slashing',
  thunder: 'Thunder',
};

export const CONDITION_WORDS: Readonly<Record<Condition, string>> = {
  incapacitated: 'Incapacitated',
  prone: 'Prone',
  slowed: 'Slowed',
  unconscious: 'Unconscious',
};

const damageWord = (t: Translate, type: string | null) =>
  type !== null && type in DAMAGE_WORDS ? t(DAMAGE_WORDS[type as DamageType]) : '';
const conditionWord = (t: Translate, condition: string) =>
  condition in CONDITION_WORDS ? t(CONDITION_WORDS[condition as Condition]) : condition;

/** The change's line: who, what, and the hit points before and after. */
export function describeHand(t: Translate, change: DmHandEntry['change']): string {
  switch (change.kind) {
    case 'hit-points':
      return change.change === 'damage'
        ? t('{name}: {amount} damage ({type}), hit points {before} → {after}', {
            name: change.target.name,
            amount: change.amount,
            type: damageWord(t, change.damageType),
            before: change.hpBefore,
            after: change.hpAfter,
          })
        : t('{name}: healed {amount}, hit points {before} → {after}', {
            name: change.target.name,
            amount: change.amount,
            before: change.hpBefore,
            after: change.hpAfter,
          });
    case 'condition': {
      const words = { name: change.target.name, condition: conditionWord(t, change.condition) };
      return change.applied
        ? t('{name}: now {condition}', words)
        : t('{name}: no longer {condition}', words);
    }
    case 'inspiration':
      return change.inspired
        ? t('{name}: Heroic Inspiration granted', { name: change.target.name })
        : t('{name}: Heroic Inspiration taken back', { name: change.target.name });
    case 'ruling':
      return t('Ruling: {summary}', { summary: change.summary });
  }
}
