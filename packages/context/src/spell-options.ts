import {
  SUMMON_OPTIONS,
  type ContextAction,
  type ContextEntityRef,
  type ContextSpell,
  type Relevance,
  type SummonChoice,
} from '@ltw/contracts';
import { chooseUsing, dataSpellPlan, targetCount } from '@ltw/combat';
import { combatantOf } from '@ltw/domain';
import {
  abilityModifier,
  cantripTier,
  isSliceSpellId,
  metamagicFor,
  slotsRemaining,
  spellIn,
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
 * area sent from the caster; and on oneself, a spell of one's own. Outside a fight, those that name
 * a creature and harm no one: healing, temporary hit points and the spells that return the dead,
 * an hour's casting among them (docs/adr/0056-characters-from-the-srd.md §5). A summoning spell is
 * offered on oneself, in a fight and out of one: its creature appears beside the caster, the
 * option its player chooses judged again by the World Engine. A spell that returns the dead is
 * offered on the dead alone, every other on the living. Legality is the World Engine's
 * own plan; each option names its spell, how often the target is named, and the slots it could
 * spend. The command the client builds from it is the one judged here (`castRequest`).
 */
export interface CastRequest {
  readonly spellId: string;
  readonly using?: 'free' | { readonly slotLevel: number };
  readonly targetIds?: readonly string[];
  readonly point?: { readonly x: number; readonly y: number };
  /** A summoning spell's choice: judged with its first option (docs/adr/0056-…md §5). */
  readonly summon?: SummonChoice;
}

/** The command an option stands for, as the client builds it from the option alone. */
export function castRequest(
  spell: Pick<ContextSpell, 'spellId' | 'level' | 'times' | 'perSlot' | 'names' | 'aim' | 'summon'>,
  using: CastRequest['using'],
  target: {
    readonly entityId: string;
    /** Its square in the fight; none outside one. */
    readonly position: { readonly x: number; readonly y: number } | null;
  },
): CastRequest {
  const above = using === undefined || using === 'free' ? 0 : using.slotLevel - spell.level;
  const times = spell.times + (spell.perSlot ?? 0) * Math.max(0, above);
  return {
    spellId: spell.spellId,
    ...(using === undefined ? {} : { using }),
    ...(spell.names ? { targetIds: Array.from({ length: times }, () => target.entityId) } : {}),
    ...((spell.aim || spell.summon) && target.position
      ? { point: { x: target.position.x, y: target.position.y } }
      : {}),
    ...(spell.summon ? { summon: firstChoice(spell.summon) } : {}),
  };
}

/** A summoning spell's first choice: its first option, or one Medium object. */
export function firstChoice(summon: NonNullable<ContextSpell['summon']>): SummonChoice {
  const option = summon.options[0];
  return option === undefined ? { objects: { medium: 1, large: 0, huge: 0 } } : { option };
}

type Judge = (requires: 'present' | 'present-alive', verdict: () => Verdict) => Verdict;

export function spellOptions(
  frame: CombatFrame | null,
  inputs: ContextInputs,
  targetId: string,
  judge: Judge,
  refOf: (entityId: string) => ContextEntityRef,
): ContextAction[] {
  const sheet = inputs.sheet;
  const record = frame ? combatantOf(frame.encounter, targetId) : null;
  if (!sheet || (frame && !record)) return [];
  const target = { entityId: targetId, position: record ? record.position : null };
  const dead = inputs.state.entities.get(targetId)?.status === 'dead';
  // Its name as the campaign reads it (docs/adr/0055-rules-reference-and-toolbox.md §5).
  const language = inputs.state.campaign?.language === 'ru' ? 'ru' : 'en';
  const self = targetId === inputs.actor.entityId;
  const known = [...new Set(sheet.spellcasting.flatMap((source) => source.spells))].filter(
    (spellId) => !isSliceSpellId(spellId),
  );
  const options: ContextAction[] = [];
  for (const spellId of known) {
    const rules = spellRules(spellId);
    const spell = rules ? describe(rules, self, frame !== null, language) : null;
    if (!rules || !spell) continue;
    const using = rules.level === 0 ? undefined : chooseUsing(sheet, spellId);
    const mechanics = rules.mechanics;
    if (!mechanics) continue;
    const revive = mechanics.effect.kind === 'revive';
    if (revive !== dead) continue;
    const repeats = mechanics.effect.kind === 'attack' || mechanics.effect.kind === 'auto';
    const times = repeats ? targetCount(mechanics, 0, cantripTier(totalLevel(sheet))) : 1;
    // Magic Missile's darts and Scorching Ray's rays grow with the slot.
    const perSlot = repeats
      ? ((mechanics.effect.kind === 'auto' ? mechanics.upcast?.darts : mechanics.upcast?.targets) ??
        0)
      : 0;
    // A summoning spell's options, and the objects a caster's modifier animates (ADR 0056 §5).
    const summon =
      mechanics.effect.kind === 'summon'
        ? {
            creature: mechanics.effect.creature,
            options: [...SUMMON_OPTIONS[mechanics.effect.creature]],
            ...(mechanics.effect.creature === 'animated-object'
              ? { objects: { budget: Math.max(1, castingModifier(sheet, spellId)) } }
              : {}),
          }
        : null;
    const named: Omit<ContextSpell, 'slots'> = {
      ...spell,
      times,
      ...(perSlot > 0 ? { perSlot } : {}),
      ...(summon ? { summon } : {}),
    };
    const request = castRequest(named, using, target);
    const metamagic = metamagicFor(sheet, rules);
    const verdict = judge(spell.aim || revive ? 'present' : 'present-alive', () => {
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
      ((mechanics.effect.kind === 'heal' && wounded) || (revive && inputs.party.has(targetId))) &&
      verdict.legal
        ? 'high'
        : 'low';
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
 * spell of minutes or hours, nor a reaction; a spell of one's own only on oneself; outside a fight
 * only a spell that names a creature and harms no one.
 */
function describe(
  rules: SpellRules,
  self: boolean,
  fighting: boolean,
  language: 'en' | 'ru',
): Omit<ContextSpell, 'times' | 'slots'> | null {
  const mechanics = rules.mechanics;
  if (!mechanics || rules.castingTime === 'reaction') return null;
  if (fighting && rules.castingTime === 'long') return null;
  const { effect, area } = mechanics;
  // A summoning spell on oneself, in a fight or out of one: its creature appears beside the caster.
  if (effect.kind === 'summon')
    return self
      ? {
          spellId: rules.spellId,
          name: nameIn(rules.spellId, language),
          level: rules.level,
          names: false,
          ...(mechanics.complete ? {} : { forDm: 'rest' as const }),
        }
      : null;
  const helps = effect.kind === 'heal' || effect.kind === 'temp-hp' || effect.kind === 'revive';
  if (!fighting && (!helps || area !== null)) return null;
  const own = rules.range === 'self' && (area === null || area.shape === 'emanation');
  const caring = effect.kind === 'heal' || effect.kind === 'temp-hp';
  if (self ? !own && !caring : own) return null;
  const aim = area && !own ? (area.origin === 'point' ? 'point' : 'toward') : undefined;
  // It names the creature when it has no area, or heals those it chooses inside one.
  const names = effect.kind !== 'dm' && (area === null || caring);
  return {
    spellId: rules.spellId,
    name: nameIn(rules.spellId, language),
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

/** The modifier of the ability the character casts the spell with. */
function castingModifier(sheet: NonNullable<ContextInputs['sheet']>, spellId: string): number {
  const source = sheet.spellcasting.find((one) => one.spells.includes(spellId));
  return source ? abilityModifier(sheet.abilities[source.ability]) : 0;
}

function slotsFor(sheet: NonNullable<ContextInputs['sheet']>, level: number): number[] {
  if (level === 0) return [];
  const slots: number[] = [];
  for (let slot = level; slot <= 9; slot += 1)
    if (slotsRemaining(sheet, slot) > 0) slots.push(slot);
  return slots;
}

/** A spell's name in the campaign's language: its Russian once the translation holds it. */
function nameIn(spellId: string, language: 'en' | 'ru'): string {
  const english = srdSpell(spellId);
  return english ? spellIn(english, language).value.name : spellId;
}
