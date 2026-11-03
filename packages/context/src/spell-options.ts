import type { ContextAction, ContextEntityRef, ContextSpell, Relevance } from '@ltw/contracts';
import { chooseUsing, dataSpellPlan, targetCount } from '@ltw/combat';
import { combatantOf } from '@ltw/domain';
import {
  cantripTier,
  isSliceSpellId,
  metamagicFor,
  slotsRemaining,
  spellRules,
  srdSpell,
  totalLevel,
  type SpellRules,
} from '@ltw/rules';

import { fromRefusal, paused, PAUSED, type CombatFrame } from './combat.ts';
import type { ContextInputs } from './inputs.ts';
import type { Verdict } from './legality.ts';

/**
 * The spells a character casts from their data (docs/adr/0052-spells-as-data.md §5), offered on a
 * creature in the fight: at it; at its square, for an area centred on a point; toward it, for an
 * area sent from the caster; and on oneself, a spell of one's own. Legality is the World Engine's
 * own plan; each option names its spell, how often the target is named, and the slots it could
 * spend. The command the client builds from it is the one judged here (`castRequest`).
 */
export interface CastRequest {
  readonly spellId: string;
  readonly using?: 'free' | { readonly slotLevel: number };
  readonly targetIds?: readonly string[];
  readonly point?: { readonly x: number; readonly y: number };
}

/** The command an option stands for, as the client builds it from the option alone. */
export function castRequest(
  spell: Pick<ContextSpell, 'spellId' | 'level' | 'times' | 'perSlot' | 'names' | 'aim'>,
  using: CastRequest['using'],
  target: {
    readonly entityId: string;
    readonly position: { readonly x: number; readonly y: number };
  },
): CastRequest {
  const above = using === undefined || using === 'free' ? 0 : using.slotLevel - spell.level;
  const times = spell.times + (spell.perSlot ?? 0) * Math.max(0, above);
  return {
    spellId: spell.spellId,
    ...(using === undefined ? {} : { using }),
    ...(spell.names ? { targetIds: Array.from({ length: times }, () => target.entityId) } : {}),
    ...(spell.aim ? { point: { x: target.position.x, y: target.position.y } } : {}),
  };
}

type Judge = (requires: 'present' | 'present-alive', verdict: () => Verdict) => Verdict;

export function spellOptions(
  frame: CombatFrame,
  inputs: ContextInputs,
  targetId: string,
  judge: Judge,
  refOf: (entityId: string) => ContextEntityRef,
): ContextAction[] {
  const sheet = inputs.sheet;
  const target = combatantOf(frame.encounter, targetId);
  if (!sheet || !target) return [];
  const self = targetId === inputs.actor.entityId;
  const known = [...new Set(sheet.spellcasting.flatMap((source) => source.spells))].filter(
    (spellId) => !isSliceSpellId(spellId),
  );
  const options: ContextAction[] = [];
  for (const spellId of known) {
    const rules = spellRules(spellId);
    const spell = rules ? describe(rules, self) : null;
    if (!rules || !spell) continue;
    const using = rules.level === 0 ? undefined : chooseUsing(sheet, spellId);
    const mechanics = rules.mechanics;
    if (!mechanics) continue;
    const repeats = mechanics.effect.kind === 'attack' || mechanics.effect.kind === 'auto';
    const times = repeats ? targetCount(mechanics, 0, cantripTier(totalLevel(sheet))) : 1;
    // Magic Missile's darts and Scorching Ray's rays grow with the slot.
    const perSlot = repeats
      ? ((mechanics.effect.kind === 'auto' ? mechanics.upcast?.darts : mechanics.upcast?.targets) ??
        0)
      : 0;
    const named: Omit<ContextSpell, 'slots'> = {
      ...spell,
      times,
      ...(perSlot > 0 ? { perSlot } : {}),
    };
    const request = castRequest(named, using, target);
    const metamagic = metamagicFor(sheet, rules);
    const verdict = judge(spell.aim ? 'present' : 'present-alive', () => {
      if (paused(inputs)) return PAUSED;
      const plan = dataSpellPlan(inputs.state, inputs.actor.entityId, request);
      if (!plan.legal) return fromRefusal(plan);
      const affected = plan.area.filter((one) => inputs.perceived.has(one.entityId));
      const harmful = mechanics.effect.kind === 'save';
      const ally = harmful && affected.some((one) => inputs.party.has(one.entityId));
      return {
        legal: true,
        ...(using === undefined
          ? {}
          : {
              cost:
                using === 'free' ? { kind: 'free' as const } : { kind: 'slot' as const, ...using },
            }),
        ...(mechanics.area ? { area: affected.map((one) => refOf(one.entityId)) } : {}),
        ...(ally ? { hints: ['ALLY_IN_AREA' as const] } : {}),
      };
    });
    const wounded =
      inputs.party.has(targetId) &&
      (inputs.state.characterSheets.get(targetId)?.hitPoints.current ?? 1) <
        (inputs.state.characterSheets.get(targetId)?.hitPoints.max ?? 0);
    const relevance: Relevance =
      mechanics.effect.kind === 'heal' && wounded && verdict.legal ? 'high' : 'low';
    options.push({
      id: 'cast_spell',
      legal: verdict.legal,
      ...(verdict.reason ? { reason: verdict.reason } : {}),
      ...(verdict.resolution ? { resolution: verdict.resolution } : {}),
      relevance,
      ...(verdict.cost ? { cost: verdict.cost } : {}),
      ...(verdict.hints ? { hints: [...verdict.hints] } : {}),
      ...(verdict.area ? { area: { affected: verdict.area.map((ref) => ({ ...ref })) } } : {}),
      spell: {
        ...named,
        slots: slotsFor(sheet, rules.level),
        // The Metamagic it could take now (docs/adr/0056-characters-from-the-srd.md §4).
        ...(metamagic.length > 0 ? { metamagic } : {}),
      },
    });
  }
  return options;
}

/**
 * How the spell reaches a creature, or null where it is not offered: a fight's turn holds no
 * spell of minutes or hours, nor a reaction; a spell of one's own only on oneself.
 */
function describe(rules: SpellRules, self: boolean): Omit<ContextSpell, 'times' | 'slots'> | null {
  const mechanics = rules.mechanics;
  if (!mechanics || rules.castingTime === 'long' || rules.castingTime === 'reaction') return null;
  const { effect, area } = mechanics;
  const own = rules.range === 'self' && (area === null || area.shape === 'emanation');
  const caring = effect.kind === 'heal' || effect.kind === 'temp-hp';
  if (self ? !own && !caring : own) return null;
  const aim = area && !own ? (area.origin === 'point' ? 'point' : 'toward') : undefined;
  // It names the creature when it has no area, or heals those it chooses inside one.
  const names = effect.kind !== 'dm' && (area === null || caring);
  return {
    spellId: rules.spellId,
    name: srdSpell(rules.spellId)?.name ?? rules.spellId,
    level: rules.level,
    names,
    ...(aim ? { aim } : {}),
    ...(effect.kind === 'dm'
      ? { forDm: 'effect' as const }
      : mechanics.complete
        ? {}
        : { forDm: 'rest' as const }),
  };
}

function slotsFor(sheet: NonNullable<ContextInputs['sheet']>, level: number): number[] {
  if (level === 0) return [];
  const slots: number[] = [];
  for (let slot = level; slot <= 9; slot += 1)
    if (slotsRemaining(sheet, slot) > 0) slots.push(slot);
  return slots;
}
