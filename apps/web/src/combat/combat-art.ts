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
  'weapon_attack',
  'fireball',
  'counterspell',
  'healing_word',
  'hunters_mark',
];

const LABELS: Partial<Record<ContextActionId, (t: Translate, target: string) => string>> = {
  longbow_attack: (t, target) => t('Attack {target} with longbow', { target }),
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

/** An option's picture: a weapon's for `weapon_attack` (Stage 520), else its catalog entry's. */
export function optionArtUrl(action: ContextAction): string | null {
  if (action.id === 'weapon_attack') return action.weapon ? weaponArtUrl(action.weapon) : null;
  const art = catalogArtOf(action.id);
  return art ? catalogUrl(art.kind, art.id) : null;
}

/** An option's full words, naming the weapon of `weapon_attack`. */
export function optionLabelFor(t: Translate, action: ContextAction, target: string): string {
  if (action.id === 'weapon_attack' && action.weapon) {
    return t('Attack {target} with {weapon}', { target, weapon: weaponWords(t, action.weapon) });
  }
  return optionLabel(t, action.id, target);
}

/** The tray's short words for an option: a weapon attack shows the weapon. */
export const shortLabelFor = (t: Translate, action: ContextAction): string =>
  action.id === 'weapon_attack' && action.weapon
    ? weaponWords(t, action.weapon)
    : t(shortLabelOf(action.id));
