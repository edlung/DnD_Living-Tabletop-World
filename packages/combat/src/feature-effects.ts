import type { CharacterSheet, ClassId, KernelCommandOf } from '@ltw/contracts';
import type { CombatantRecord, Dice, DraftEvent, WorldState } from '@ltw/domain';
import { classColumn, pactSlots, regainResource, regainSlots, srdClass } from '@ltw/rules';

import { gapBetween, isAlive, turnStateOf } from './battlefield.ts';
import { applyHealing } from './damage.ts';
import type { CombatReason } from './legality.ts';
import {
  ceilingOf,
  has,
  hitPoints,
  speedOf,
  vitalsEvent,
  vitalsOf,
  withConditions,
  withSheet,
  type Vitals,
} from './vitals.ts';

/**
 * What a class feature does (docs/adr/0056-characters-from-the-srd.md §4), after its use is paid
 * for: Second Wind's and Lay on Hands' hit points, Lay on Hands' end of Poisoned, a Rage begun or
 * ended, Action Surge's action, a Bardic Inspiration die given and rolled, Patient Defense's and
 * Step of the Wind's actions, Arcane Recovery's and Magical Cunning's slots, Font of Magic's slot
 * made or turned into points. The rest — Channel Divinity, Wild Shape, Flurry of Blows, Innate
 * Sorcery, Indomitable — is spent with its words for the DM.
 */
export interface FeatureUse {
  readonly state: WorldState;
  readonly command: KernelCommandOf<'UseFeature'>;
  /** The user, its resource spent. */
  readonly vitals: Extract<Vitals, { kind: 'character' }>;
  /** Its combatant record with the turn's cost paid; null out of a fight. */
  readonly record: CombatantRecord | null;
  readonly dice: Dice;
}

export interface FeatureEffect {
  /** The user's sheet after the feature. */
  readonly sheet: CharacterSheet;
  /** Records and other creatures' changes: healing, a condition ended, a die given. */
  readonly events: readonly DraftEvent[];
  readonly rolls: readonly number[];
  /** Its combatant record changed by the feature (Action Surge, Focus). */
  readonly record?: CombatantRecord;
}

const levelIn = (sheet: CharacterSheet, classId: ClassId): number =>
  sheet.classes.find((entry) => entry.classId === classId)?.level ?? 0;

/** Bardic Inspiration's die by Bard level: the features table's Bardic Die column. */
function bardicDie(sheet: CharacterSheet): 6 | 8 | 10 | 12 {
  const bard = srdClass('bard');
  const sides = bard ? classColumn(bard, 'Bardic Die', levelIn(sheet, 'bard')) : 6;
  return sides === 12 || sides === 10 || sides === 8 ? sides : 6;
}

/** Font of Magic: the lowest Sorcerer level that makes a slot of each level (SRD 5.2.1). */
const CREATE_SLOT_LEVEL = [2, 3, 5, 7, 9] as const;
/** A Bardic Inspiration die lasts an hour (SRD 5.2.1), in world seconds. */
const HOUR = 3600;

const done = (sheet: CharacterSheet, extra: Partial<FeatureEffect> = {}): FeatureEffect => ({
  sheet,
  events: [],
  rolls: [],
  ...extra,
});

/** The creature a feature reaches: the user, or one within `reachFt` of it in a fight. */
function reached(use: FeatureUse, targetId: string, reachFt: number): Vitals | CombatReason {
  if (targetId === use.command.characterId) return use.vitals;
  const target = vitalsOf(use.state, targetId);
  if (!target) return 'TARGET_REQUIRED';
  if (!isAlive(use.state, targetId)) return 'TARGET_DEAD';
  if (use.record) {
    const theirs = use.state.encounter?.combatants.find((one) => one.entityId === targetId);
    if (!theirs || gapBetween(use.state, use.record, theirs) > reachFt) return 'OUT_OF_RANGE';
  }
  return target;
}

/** Hit points given, to the user or another: the healing's records and the user's sheet. */
function heal(use: FeatureUse, target: Vitals, amount: number, rolls: number[]): FeatureEffect {
  if (target.entityId === use.vitals.entityId) {
    const healed = applyHealing(use.vitals, { sourceId: use.vitals.entityId, amount, rolls });
    const sheet = healed.vitals.kind === 'character' ? healed.vitals.sheet : use.vitals.sheet;
    // The user's own sheet is written once, after the feature.
    const events = healed.events.filter((event) => event.type !== 'CharacterSheetSet');
    return { sheet, events, rolls };
  }
  const healed = applyHealing(target, { sourceId: use.vitals.entityId, amount, rolls });
  return { sheet: use.vitals.sheet, events: healed.events, rolls };
}

export function featureEffect(use: FeatureUse): FeatureEffect | CombatReason {
  const { command, vitals, state } = use;
  const sheet = vitals.sheet;
  switch (command.feature) {
    case 'second-wind': {
      // 1d10 plus the Fighter level.
      if (hitPoints(vitals).current >= ceilingOf(vitals)) return 'NEEDS_NO_HEALING';
      const roll = use.dice.roll(10);
      return heal(use, vitals, roll + levelIn(sheet, 'fighter'), [roll]);
    }
    case 'lay-on-hands': {
      const target = reached(use, command.targetId ?? command.characterId, 5);
      if (typeof target === 'string') return target;
      if (command.option === 'cure-poison') {
        if (!has(target, 'poisoned')) return 'NOT_POISONED';
        const cured = withConditions(target, [], ['poisoned']);
        const ended: DraftEvent = {
          type: 'ConditionApplied',
          payload: {
            targetId: target.entityId,
            condition: 'poisoned',
            applied: false,
            cause: 'lay-on-hands',
          },
        };
        return cured.kind === 'character' && cured.entityId === vitals.entityId
          ? done(cured.sheet, { events: [ended] })
          : done(sheet, { events: [ended, vitalsEvent(cured)] });
      }
      if (hitPoints(target).current >= ceilingOf(target)) return 'NEEDS_NO_HEALING';
      return heal(use, target, command.amount ?? 1, []);
    }
    case 'rage': {
      if (sheet.raging) return 'ALREADY_RAGING';
      if (sheet.wornArmor?.weight === 'heavy') return 'HEAVY_ARMOR';
      return done({ ...sheet, raging: { since: state.clock } });
    }
    case 'end-rage': {
      if (!sheet.raging) return 'NOT_RAGING';
      const calm = { ...sheet };
      delete calm.raging;
      return done(calm);
    }
    case 'action-surge': {
      const encounter = state.encounter;
      const record = use.record;
      if (!encounter || !record) return 'NOT_IN_COMBAT';
      if (!turnStateOf(encounter, record).ownTurn) return 'NOT_YOUR_TURN';
      if (record.turn.surged === true) return 'ALREADY_SURGED';
      if (!record.turn.actionUsed) return 'ACTION_UNUSED';
      // Another action; the last action's attacks end with it.
      const turn = {
        ...record.turn,
        actionUsed: false,
        attacksRemaining: 0,
        surged: true as const,
      };
      return done(sheet, { record: { ...record, turn } });
    }
    case 'bardic-inspiration': {
      if (!command.targetId || command.targetId === command.characterId) return 'TARGET_REQUIRED';
      const target = reached(use, command.targetId, 60);
      if (typeof target === 'string') return target;
      if (target.kind !== 'character') return 'TARGET_REQUIRED';
      const held = target.sheet.inspirationDie;
      if (held && held.until >= state.clock) return 'ALREADY_INSPIRED';
      const die = { sides: bardicDie(sheet), fromId: vitals.entityId, until: state.clock + HOUR };
      const given = withSheet(target, (theirs) => ({ ...theirs, inspirationDie: die }));
      return done(sheet, { events: [vitalsEvent(given)] });
    }
    case 'inspiration-die': {
      const die = sheet.inspirationDie;
      if (!die || die.until < state.clock) return 'NO_INSPIRATION_DIE';
      const roll = use.dice.roll(die.sides);
      const spent = { ...sheet };
      delete spent.inspirationDie;
      return done(spent, { rolls: [roll] });
    }
    case 'focus':
      return focus(use);
    case 'arcane-recovery': {
      // Slots of up to half the Wizard level (rounded up) in all, none of 6th level or higher.
      const slots = command.slots ?? [];
      const limit = Math.ceil(levelIn(sheet, 'wizard') / 2);
      if (slots.length === 0) return 'NO_SLOT_EXPENDED';
      if (slots.some((level) => level >= 6) || slots.reduce((sum, level) => sum + level, 0) > limit)
        return 'TOO_MANY_SLOTS';
      let next = sheet;
      for (const level of slots) {
        if ((next.spellSlots.expended[level - 1] ?? 0) === 0) return 'NO_SLOT_EXPENDED';
        next = regainSlots(next, level, 1);
      }
      return done(next);
    }
    case 'magical-cunning': {
      // Pact Magic slots back, up to half the pact's (rounded up).
      const pact = pactSlots(sheet);
      if (!pact) return 'NOT_A_FEATURE';
      if ((sheet.spellSlots.expended[pact.level - 1] ?? 0) === 0) return 'NO_SLOT_EXPENDED';
      return done(regainSlots(sheet, pact.level, Math.ceil(pact.count / 2)));
    }
    case 'sorcery-points':
      return fontOfMagic(use);
    case 'channel-divinity':
    case 'wild-shape':
    case 'innate-sorcery':
    case 'indomitable':
      // Spent with its words; what it does is the DM's.
      return done(sheet);
  }
}

/** A Monk's Focus: Patient Defense (Disengage and Dodge) and Step of the Wind (Dash and Disengage). */
function focus(use: FeatureUse): FeatureEffect | CombatReason {
  const { record, vitals } = use;
  const sheet = vitals.sheet;
  if (!record) return done(sheet);
  switch (use.command.option) {
    case 'patient-defense':
      return done(sheet, {
        record: { ...record, turn: { ...record.turn, disengaged: true, dodging: true } },
      });
    case 'step-of-the-wind':
      return done(sheet, {
        record: {
          ...record,
          turn: {
            ...record.turn,
            disengaged: true,
            dashFt: (record.turn.dashFt ?? 0) + speedOf(vitals),
          },
        },
      });
    default:
      return done(sheet);
  }
}

/**
 * Font of Magic: a slot of 1st to 5th level made from points (the slot of that level the character
 * expended comes back), or a slot turned into as many points as its level.
 */
function fontOfMagic(use: FeatureUse): FeatureEffect | CombatReason {
  const { command } = use;
  const sheet = use.vitals.sheet;
  const level = command.slots?.[0];
  if (command.option === 'create-slot') {
    if (!level || level > 5) return 'SLOT_TOO_HIGH';
    if (levelIn(sheet, 'sorcerer') < (CREATE_SLOT_LEVEL[level - 1] ?? 21)) return 'SLOT_TOO_HIGH';
    if ((sheet.spellSlots.expended[level - 1] ?? 0) === 0) return 'NO_SLOT_EXPENDED';
    return done(regainSlots(sheet, level, 1));
  }
  if (command.option === 'convert-slot') {
    if (!level) return 'NO_SLOT';
    const max = sheet.spellSlots.max[level - 1] ?? 0;
    const used = sheet.spellSlots.expended[level - 1] ?? 0;
    if (used >= max) return 'NO_SLOT';
    if ((sheet.featureUses?.['sorcery-points'] ?? 0) === 0) return 'POINTS_FULL';
    const expended = sheet.spellSlots.expended.map((count, index) =>
      index === level - 1 ? count + 1 : count,
    );
    const turned = { ...sheet, spellSlots: { ...sheet.spellSlots, expended } };
    return done(regainResource(turned, 'sorcery-points', level));
  }
  return done(sheet);
}
