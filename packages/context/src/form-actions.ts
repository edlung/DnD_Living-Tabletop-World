import type { ContextAction, ContextActionId, Relevance } from '@ltw/contracts';
import { formOf } from '@ltw/rules';

import { combatAttackVerdict, type CombatFrame } from './combat.ts';
import type { ContextInputs } from './inputs.ts';
import type { Verdict } from './legality.ts';

/**
 * A Druid in Wild Shape's form (docs/adr/0056-characters-from-the-srd.md §5): no weapon in its
 * hands and no spell on its lips — its form's attacks instead, at a creature or an object in the
 * fight, as the World Engine judges them.
 */
const NOT_IN_FORM: ReadonlySet<ContextActionId> = new Set([
  'longbow_attack',
  'weapon_attack',
  'offhand_attack',
  'cleave_attack',
  'unarmed_strike',
  'fireball',
  'counterspell',
  'healing_word',
  'hunters_mark',
  'detect_magic',
  'cast_spell',
]);

type Judge = (requires: 'present' | 'present-alive', verdict: () => Verdict) => Verdict;

export function inForm(
  actions: readonly ContextAction[],
  frame: CombatFrame | null,
  inputs: ContextInputs,
  target: { readonly entityId: string; readonly struck: boolean },
  judge: Judge,
): ContextAction[] {
  const form = inputs.sheet ? formOf(inputs.sheet) : null;
  if (!form) return [...actions];
  const kept = actions.filter((action) => !NOT_IN_FORM.has(action.id));
  if (!frame || !target.struck || target.entityId === inputs.actor.entityId) return kept;
  const relevance: Relevance = 'medium';
  const attacks = form.attacks.map((attack): ContextAction => {
    const verdict = judge('present-alive', () =>
      combatAttackVerdict(frame, inputs, target.entityId, attack.attackId),
    );
    return {
      id: 'form_attack',
      formAttack: { attackId: attack.attackId, name: attack.name },
      legal: verdict.legal,
      ...(verdict.reason ? { reason: verdict.reason } : {}),
      ...(verdict.resolution ? { resolution: verdict.resolution } : {}),
      relevance,
      ...(verdict.hints ? { hints: [...verdict.hints] } : {}),
    };
  });
  return [...attacks, ...kept];
}
