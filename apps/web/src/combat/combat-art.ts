import type { Condition, ContextAction, ContextActionId, SpellId, WeaponId } from '@ltw/contracts';
import { readableLabel, type Translate } from '@ltw/ui';

import { catalogUrl, weaponArtUrl } from '../visual/ui-kit.ts';
import type { CatalogKind, GlyphName } from '../visual/ui-kit-names.ts';

/**
 * Which GPT picture and words stand beside a combat option (docs/STAGE_320_DESIGN.md §4–5.5).
 * Catalog art is keyed by the rules catalog ID the option's command uses, so it shows the
 * catalog entry (the longbow, Fireball), never a particular world object. Everything here is
 * decoration beside the option's own words; nothing decides what may be done.
 */
export interface CatalogArt {
  readonly kind: CatalogKind;
  readonly id: WeaponId | SpellId;
}

const ART: Partial<Record<ContextActionId, CatalogArt>> = {
  longbow_attack: { kind: 'weapons', id: 'longbow' },
  fireball: { kind: 'spells', id: 'fireball' },
  counterspell: { kind: 'spells', id: 'counterspell' },
  healing_word: { kind: 'spells', id: 'healing-word' },
  hunters_mark: { kind: 'spells', id: 'hunters-mark' },
  detect_magic: { kind: 'spells', id: 'detect-magic' },
};

/** The catalog entry a server-listed combat option uses, or null when it uses none. */
export const catalogArtOf = (action: ContextActionId): CatalogArt | null => ART[action] ?? null;

/**
 * A suggested creature turn's catalog entry (the DM's suggestion: an attack or a spell of the
 * stat block). Only an ID the rules catalog draws has a picture; any other shows none.
 */
export function suggestionArt(command: {
  readonly type: string;
  readonly attackId?: string;
  readonly spellId?: string;
}): { readonly kind: CatalogKind; readonly id: string } | null {
  if (command.type === 'Attack' && command.attackId)
    return { kind: 'weapons', id: command.attackId };
  if (command.type === 'CastSpell' && command.spellId)
    return { kind: 'spells', id: command.spellId };
  return null;
}

/** The server-listed options the battlefield offers against a combatant, in this order. */
export const COMBAT_ACTIONS: readonly ContextActionId[] = [
  'longbow_attack',
  'cleave_attack',
  'offhand_attack',
  'weapon_attack',
  'unarmed_strike',
  'fireball',
  'counterspell',
  'healing_word',
  'hunters_mark',
  'cast_spell',
];

/** The actions beside Attack and Magic (docs/adr/0045-conditions-and-actions.md §5), by glyph. */
export const TURN_ACTIONS: readonly ContextActionId[] = [
  'dodge',
  'dash',
  'disengage',
  'hide',
  'search',
  'study',
  'utilize',
  'help',
  'ready',
  'influence',
  'escape',
  'release',
  'first-aid',
  'mount',
  'dismount',
];

/**
 * What each of those actions does, in one line (SRD 5.2.1; ADR 0045 §5): English keys the client
 * dictionary translates. The rules are the server's; these words only tell the player.
 */
const ACTION_EFFECTS: Partial<Record<ContextActionId, string>> = {
  dodge:
    'Until your next turn, attacks against you have Disadvantage and your Dexterity saves Advantage.',
  dash: 'Move as far again as your Speed this turn.',
  disengage: 'Your movement provokes no Opportunity Attacks this turn.',
  hide: 'From cover, a DC 15 Stealth check: on a success you are Invisible until you attack or are found.',
  search:
    'A Wisdom check to notice what is not obvious: Perception, Insight, Medicine or Survival.',
  study:
    'An Intelligence check to recall or work out: Arcana, History, Investigation, Nature or Religion.',
  utilize: 'Use an object that takes your action.',
  help: 'An ally’s next attack on this foe before your next turn has Advantage.',
  ready: 'Hold an attack for a moment you name; when it comes, you make it with your Reaction.',
  influence: 'A Charisma or Animal Handling check to sway this creature.',
  escape: 'Athletics or Acrobatics against the grapple’s DC: on a success you are free.',
  release: 'Let go of the creature you hold. It takes no action.',
  'first-aid': 'A DC 10 Medicine check: one dying becomes stable, one knocked out comes round.',
  mount:
    'Climb onto a willing creature a size larger beside you, for half your Speed: you share its space and go where it goes.',
  dismount: 'Get down beside your mount, for half your Speed.',
  unarmed_strike:
    'A punch, a grapple or a shove, or a blow with an object at hand: you choose before it lands.',
};

/** What an action beside Attack and Magic does, in the viewer's words; null for any other option. */
export const actionEffect = (t: Translate, action: ContextActionId): string | null => {
  const effect = ACTION_EFFECTS[action];
  return effect === undefined ? null : t(effect);
};

const LABELS: Partial<Record<ContextActionId, (t: Translate, target: string) => string>> = {
  longbow_attack: (t, target) => t('Attack {target} with longbow', { target }),
  dodge: (t) => t('Dodge'),
  dash: (t) => t('Dash'),
  disengage: (t) => t('Disengage'),
  hide: (t) => t('Hide'),
  search: (t) => t('Search'),
  study: (t) => t('Study'),
  utilize: (t) => t('Utilize: use an object'),
  help: (t, target) => t('Help an ally against {target}', { target }),
  ready: (t, target) => t('Ready an action against {target}', { target }),
  influence: (t, target) => t('Influence {target}', { target }),
  unarmed_strike: (t, target) => t('Unarmed Strike at {target}', { target }),
  escape: (t) => t('Escape a grapple'),
  release: (t) => t('Let go'),
  'first-aid': (t, target) => t('First aid for {target}', { target }),
  mount: (t, target) => t('Mount {target}', { target }),
  dismount: (t) => t('Dismount'),
  fireball: (t, target) => t('Cast Fireball at {target}', { target }),
  counterspell: (t) => t('Cast Counterspell'),
  healing_word: (t, target) => t('Cast Healing Word on {target}', { target }),
  hunters_mark: (t, target) => t('Cast Hunter’s Mark on {target}', { target }),
};

/** An option's full words: what it does to whom (its control's accessible name). */
export const optionLabel = (t: Translate, action: ContextActionId, target: string): string =>
  (LABELS[action] ?? ((tr: Translate) => tr(action.replaceAll('_', ' '))))(t, target);

/** The short words under an option's picture in the turn tray; the full label is its name. */
const SHORT: Partial<Record<ContextActionId, string>> = {
  longbow_attack: 'Attack',
  fireball: 'Fireball',
  counterspell: 'Counterspell',
  healing_word: 'Healing Word',
  hunters_mark: 'Hunter’s Mark',
  detect_magic: 'Detect Magic',
  dodge: 'Dodge',
  dash: 'Dash',
  disengage: 'Disengage',
  hide: 'Hide',
  search: 'Search',
  study: 'Study',
  utilize: 'Utilize',
  help: 'Help',
  ready: 'Ready an action',
  influence: 'Influence',
  unarmed_strike: 'Unarmed Strike',
  escape: 'Escape a grapple',
  release: 'Let go',
  'first-aid': 'First aid',
  mount: 'Mount',
  dismount: 'Dismount',
};

/** The tray's short words for an option (a translation key), contained in its full label. */
export const shortLabelOf = (action: ContextActionId): string =>
  SHORT[action] ?? action.replaceAll('_', ' ');

/**
 * The glyph of a condition pip: each slice condition has its own GPT glyph (commit `f5d869a`);
 * the condition's word always accompanies it (the square's name, the cards).
 */
const CONDITIONS: Readonly<Record<Condition, GlyphName>> = {
  blinded: 'blinded',
  charmed: 'charmed',
  deafened: 'deafened',
  frightened: 'frightened',
  grappled: 'grappled',
  incapacitated: 'incapacitated',
  invisible: 'invisible',
  paralyzed: 'paralyzed',
  petrified: 'petrified',
  poisoned: 'poisoned',
  prone: 'prone',
  restrained: 'restrained',
  slowed: 'slowed',
  stunned: 'stunned',
  unconscious: 'unconscious',
};

export const conditionGlyph = (condition: Condition): GlyphName => CONDITIONS[condition];

/** A weapon's words (the rules weapon ID read as a name: "Shortsword"), a translation key. */
export const weaponWords = (t: Translate, weaponId: WeaponId): string => readableLabel(weaponId, t);

/** The options that strike with a weapon they name (Stage 520; docs/adr/0047-weapons.md). */
const WEAPON_OPTIONS: ReadonlySet<ContextActionId> = new Set([
  'weapon_attack',
  'offhand_attack',
  'cleave_attack',
]);

/** An option's picture: its weapon's for a weapon attack (Stage 520), else its catalog entry's. */
export function optionArtUrl(action: ContextAction): string | null {
  if (WEAPON_OPTIONS.has(action.id)) return action.weapon ? weaponArtUrl(action.weapon) : null;
  if (action.id === 'cast_spell')
    return action.spell ? catalogUrl('spells', action.spell.spellId) : null;
  const art = catalogArtOf(action.id);
  return art ? catalogUrl(art.kind, art.id) : null;
}

/** An option's full words, naming its weapon; each holds the tray's short words. */
export function optionLabelFor(t: Translate, action: ContextAction, target: string): string {
  // Any other SRD spell (docs/adr/0052-spells-as-data.md §5): at the creature, or its square.
  if (action.id === 'cast_spell' && action.spell) {
    const spell = t(action.spell.name);
    return action.spell.aim
      ? t('Cast {spell} at {target}’s square', { spell, target })
      : t('Cast {spell} at {target}', { spell, target });
  }
  if (action.weapon && WEAPON_OPTIONS.has(action.id)) {
    const weapon = weaponWords(t, action.weapon);
    if (action.id === 'offhand_attack')
      return t('Other hand: {weapon} at {target}', { weapon, target });
    if (action.id === 'cleave_attack') return t('Cleave: {weapon} at {target}', { weapon, target });
    return t('Attack {target} with {weapon}', { target, weapon });
  }
  return optionLabel(t, action.id, target);
}

/** The tray's short words for an option: a weapon attack shows the weapon. */
export function shortLabelFor(t: Translate, action: ContextAction): string {
  if (action.id === 'cast_spell' && action.spell) return t(action.spell.name);
  if (!action.weapon || !WEAPON_OPTIONS.has(action.id)) return t(shortLabelOf(action.id));
  const weapon = weaponWords(t, action.weapon);
  if (action.id === 'offhand_attack') return t('Other hand: {weapon}', { weapon });
  if (action.id === 'cleave_attack') return t('Cleave: {weapon}', { weapon });
  return weapon;
}
