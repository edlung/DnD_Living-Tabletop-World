import {
  accept,
  type CombatCommand,
  type Decision,
  type DecisionContext,
  type Dice,
} from '@ltw/domain';

import { dataSpellEvents } from './data-spell-effects.ts';
import { dataSpellPlan } from './data-spell-plan.ts';
import { suspendCast } from './reactions/suspend.ts';
import { combatPremises, refused } from './refusal.ts';

/**
 * `CastSpell` for any SRD spell outside the slice (docs/adr/0052-spells-as-data.md §5): planned and
 * resolved from its data; in a fight, a cast someone could counter waits in a reaction window
 * (ADR 0016) and resolves when it closes.
 */
type Cast = Extract<CombatCommand, { type: 'CastSpell' }>;

export function decideDataSpell(context: DecisionContext, command: Cast, dice: Dice): Decision {
  const { state } = context;
  const targetIds =
    command.targetIds ?? (command.targetId === undefined ? undefined : [command.targetId]);
  const plan = dataSpellPlan(state, command.combatantId, {
    spellId: command.spellId,
    ...(command.using === undefined ? {} : { using: command.using }),
    ...(targetIds === undefined ? {} : { targetIds }),
    ...(command.point === undefined ? {} : { point: command.point }),
    ...(command.metamagic === undefined ? {} : { metamagic: command.metamagic }),
  });
  if (!plan.legal) return refused(plan);
  // Subtle Spell: no components to see, so nothing to counter (docs/adr/0056-…md §4).
  const subtle = command.metamagic?.options.includes('subtle-spell') === true;
  const { economy } = plan.cast;
  if (
    plan.record &&
    (economy === 'action' || economy === 'bonus') &&
    plan.rules.components.length > 0 &&
    !subtle
  ) {
    const suspended = suspendCast(
      context,
      {
        casterId: command.combatantId,
        spellId: plan.spellId,
        components: plan.rules.components,
        economy,
        using:
          plan.cast.slotLevel === null
            ? plan.cast.free
              ? 'free'
              : null
            : { slotLevel: plan.cast.slotLevel },
        targetId: plan.targets[0]?.entityId ?? null,
        ...(plan.targets.length > 0 ? { targetIds: plan.targets.map((one) => one.entityId) } : {}),
        point: plan.point ? { ...plan.point } : null,
        ...(command.metamagic === undefined ? {} : { metamagic: command.metamagic }),
      },
      command.resolution?.ids ?? [],
    );
    if (suspended) return accept(combatPremises(state, command.combatantId), ...suspended);
  }
  return accept(...dataSpellEvents(state, command.combatantId, plan, dice));
}
