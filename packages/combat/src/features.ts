import type { KernelCommandOf, ResourceCost } from '@ltw/contracts';
import {
  accept,
  type CombatantRecord,
  type Decision,
  type DecisionContext,
  type Dice,
  type DraftEvent,
  type WorldState,
} from '@ltw/domain';
import { RESOURCE_RULES, resourceOf, spendResource } from '@ltw/rules';

import { combatantEvent, turnStateOf, withTurn } from './battlefield.ts';
import { featureEffect, type FeatureUse } from './feature-effects.ts';
import { living } from './hand.ts';
import type { CombatReason } from './legality.ts';
import { combatPremises, refused } from './refusal.ts';
import { incapacitated, vitalsEvent, type Vitals } from './vitals.ts';

/**
 * Class features in play (docs/adr/0056-characters-from-the-srd.md §4): a resource spent in a
 * fight with its turn's Bonus Action or action — or with none — or out of one, and what the engine
 * applies of it (`feature-effects.ts`); what it cannot apply goes to the history in the feature's
 * words for the DM. The player of the character or the DM uses it, in a fight or not.
 */
type Use = KernelCommandOf<'UseFeature'>;

const refuse = (reason: CombatReason): Decision => refused({ legal: false, reason });

/** What a use costs in a fight: its resource's own, or its option's. */
function costOf(command: Use): ResourceCost {
  switch (command.feature) {
    case 'end-rage':
    case 'inspiration-die':
      return 'none';
    case 'end-wild-shape':
      return 'bonus';
    case 'sorcery-points':
      // Font of Magic: a slot made with a Bonus Action; a slot turned into points, no action.
      return command.option === 'create-slot' ? 'bonus' : 'none';
    case 'action-surge':
      return 'none';
    default:
      return RESOURCE_RULES[command.feature].cost;
  }
}

/** The turn's economy in a fight: the record with its action or Bonus Action spent. */
function payFor(
  state: WorldState,
  command: Use,
  cost: ResourceCost,
): { readonly record: CombatantRecord | null } | CombatReason {
  const encounter = state.encounter;
  const record = encounter?.combatants.find((one) => one.entityId === command.characterId) ?? null;
  if (cost === 'out-of-fight') return record ? 'OUT_OF_FIGHT_ONLY' : { record: null };
  if (!encounter || !record || cost === 'none') return { record };
  const turn = turnStateOf(encounter, record);
  if (!turn.ownTurn) return 'NOT_YOUR_TURN';
  if (cost === 'bonus') {
    if (turn.bonusActionUsed) return 'NO_BONUS_ACTION';
    return { record: withTurn(record, { ...turn, bonusActionUsed: true }) };
  }
  if (turn.actionUsed) return 'NO_ACTION';
  // Channel Divinity is a Magic action, which Action Surge's action is not.
  if (record.turn.surged === true) return 'SURGE_NOT_MAGIC';
  return { record: withTurn(record, { ...turn, actionUsed: true }) };
}

export function decideUseFeature(context: DecisionContext, command: Use, dice: Dice): Decision {
  const { state } = context;
  const found = living(state, command.characterId);
  if (!found.ok) return found.decision;
  const vitals = found.vitals;
  if (vitals.kind !== 'character') return refuse('NOT_A_FEATURE');
  // Rolling a held die, ending a Rage or a Wild Shape spends no use of a resource.
  const free =
    command.feature === 'end-rage' ||
    command.feature === 'inspiration-die' ||
    command.feature === 'end-wild-shape';
  if (!free && incapacitated(vitals)) return refuse('INCAPACITATED');
  const paid = payFor(state, command, costOf(command));
  if (typeof paid === 'string') return refuse(paid);
  let spent: Vitals = vitals;
  if (!free) {
    const resource = command.feature as Exclude<
      Use['feature'],
      'end-rage' | 'inspiration-die' | 'end-wild-shape'
    >;
    const amount = pointsSpent(command);
    const sheet = spendResource(vitals.sheet, resource, amount);
    if (typeof sheet === 'string') return refuse(sheet);
    spent = { ...vitals, sheet };
  }
  const use: FeatureUse = { state, command, vitals: spent, record: paid.record, dice };
  const effect = featureEffect(use);
  if (typeof effect === 'string') return refuse(effect);
  const left = free
    ? undefined
    : resourceOf(effect.sheet, command.feature as Parameters<typeof resourceOf>[1])?.left;
  const events: DraftEvent[] = [
    combatPremises(state, command.characterId),
    {
      type: 'FeatureUsed',
      payload: {
        characterId: command.characterId,
        feature: command.feature,
        ...(command.targetId === undefined ? {} : { targetId: command.targetId }),
        ...(command.amount === undefined ? {} : { amount: command.amount }),
        ...(command.option === undefined ? {} : { option: command.option }),
        ...(command.slots === undefined ? {} : { slots: [...command.slots] }),
        rolls: [...effect.rolls],
        ...(left === undefined ? {} : { left }),
      },
    },
    ...effect.events,
    vitalsEvent({ ...spent, sheet: effect.sheet }),
  ];
  // The turn's record, where the use paid for it or the feature changed it.
  const record = effect.record ?? paid.record;
  const before = state.encounter?.combatants.find((one) => one.entityId === command.characterId);
  if (record && record !== before) events.push(combatantEvent(record));
  return accept(...events);
}

/** The points a use spends: Lay on Hands' hit points (5 to end Poisoned), Focus's or Sorcery's. */
function pointsSpent(command: Use): number {
  switch (command.feature) {
    case 'lay-on-hands':
      return command.option === 'cure-poison' ? 5 : (command.amount ?? 1);
    case 'focus':
      return command.amount ?? 1;
    case 'sorcery-points':
      // Font of Magic: a slot of 1st to 5th level costs 2, 3, 5, 6 or 7; a slot turned to points
      // gives them back (regained after the spend in its effect).
      return command.option === 'create-slot'
        ? (CREATE_SLOT_COST[(command.slots?.[0] ?? 1) - 1] ?? 99)
        : command.option === 'convert-slot'
          ? 0
          : (command.amount ?? 1);
    default:
      return 1;
  }
}

/** Font of Magic's Creating Spell Slots table (SRD 5.2.1): points by slot level. */
export const CREATE_SLOT_COST = [2, 3, 5, 6, 7] as const;
