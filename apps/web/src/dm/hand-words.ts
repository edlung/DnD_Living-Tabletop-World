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
  blinded: 'Blinded',
  charmed: 'Charmed',
  deafened: 'Deafened',
  frightened: 'Frightened',
  grappled: 'Grappled',
  incapacitated: 'Incapacitated',
  invisible: 'Invisible',
  paralyzed: 'Paralyzed',
  petrified: 'Petrified',
  poisoned: 'Poisoned',
  prone: 'Prone',
  restrained: 'Restrained',
  slowed: 'Slowed',
  stunned: 'Stunned',
  unconscious: 'Unconscious',
};

const damageWord = (t: Translate, type: string | null) =>
  type !== null && type in DAMAGE_WORDS ? t(DAMAGE_WORDS[type as DamageType]) : '';
const conditionWord = (t: Translate, condition: string) =>
  condition in CONDITION_WORDS ? t(CONDITION_WORDS[condition as Condition]) : condition;

/** The change's line: who, what, and the hit points before and after. */
/** The fight's light as the DM's history says it was set (docs/adr/0050 §1). */
const LIGHT_WORDS = {
  bright: 'The light of the fight: bright',
  dim: 'The light of the fight: dim',
  dark: 'The light of the fight: darkness',
} as const;

export function describeHand(t: Translate, change: DmHandEntry['change']): string {
  switch (change.kind) {
    case 'hit-points': {
      const words = {
        name: change.target.name,
        amount: change.amount,
        before: change.hpBefore,
        after: change.hpAfter,
      };
      if (change.change === 'damage') {
        return t('{name}: {amount} damage ({type}), hit points {before} → {after}', {
          ...words,
          type: damageWord(t, change.damageType),
        });
      }
      if (change.change === 'healing') {
        return t('{name}: healed {amount}, hit points {before} → {after}', words);
      }
      // Temporary hit points and a lowered maximum (docs/adr/0048-hit-points.md §1, §2).
      return change.change === 'temporary'
        ? t('{name}: {amount} temporary hit points', words)
        : t('{name}: maximum lowered by {amount}, hit points {before} → {after}', words);
    }
    case 'condition': {
      const words = { name: change.target.name, condition: conditionWord(t, change.condition) };
      // A save made first that held it off (docs/adr/0050-the-world-around.md §9).
      if (change.resisted) return t('{name}: resisted being {condition}', words);
      return change.applied
        ? t('{name}: now {condition}', words)
        : t('{name}: no longer {condition}', words);
    }
    case 'hazard':
      return t(
        change.hazard === 'cold'
          ? 'Extreme cold for {hours} h: {failed} saves failed'
          : 'Extreme heat for {hours} h: {failed} saves failed',
        { hours: change.hours, failed: change.failed },
      );
    case 'exhaustion':
      return change.level === 0
        ? t('{name}: no longer exhausted', { name: change.target.name })
        : t('{name}: Exhaustion {level}', { name: change.target.name, level: change.level });
    case 'inspiration':
      return change.inspired
        ? t('{name}: Heroic Inspiration granted', { name: change.target.name })
        : t('{name}: Heroic Inspiration taken back', { name: change.target.name });
    case 'ruling':
      return t('Ruling: {summary}', { summary: change.summary });
    case 'light':
      return t(LIGHT_WORDS[change.ambient]);
    case 'fight': {
      const name = change.combatant.name;
      switch (change.change) {
        case 'joined':
          return t('{name} joined the fight', { name });
        case 'left':
          return t('{name} left the fight', { name });
        case 'delayed':
          return t('{name} delayed the turn', { name });
        case 'initiative':
          return t('{name}: initiative {total}', { name, total: change.total ?? '' });
      }
    }
  }
}
