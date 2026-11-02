import type { ContextActionId, DayPhase, EntityKind, KnowledgeType, Weather } from '@ltw/contracts';

import type { GlyphName } from './ui-kit-names.ts';

/**
 * Which GPT glyph sits beside which word (docs/STAGE_320_DESIGN.md §1.4, §3). A glyph is
 * decorative: the word beside it always carries the meaning, so a mapping never decides or
 * hides anything. Where the kit has no picture of its own for a state, the nearest general
 * glyph stands in until the image model supplies one.
 */
const ACTIONS: Readonly<Record<ContextActionId, GlyphName>> = {
  talk: 'talk',
  trade: 'trade',
  ask_about: 'ask',
  show_evidence: 'evidence',
  inspect: 'inspect',
  recall: 'recall',
  take_item: 'give',
  insight_check: 'thought',
  investigation_check: 'search',
  perception_check: 'look',
  healing_word: 'cast',
  hunters_mark: 'target',
  detect_magic: 'cast',
  longbow_attack: 'ranged',
  weapon_attack: 'melee',
  offhand_attack: 'melee',
  cleave_attack: 'melee',
  unarmed_strike: 'melee',
  escape: 'grappled',
  release: 'grappled',
  enter_location: 'travel',
  fireball: 'cast',
  counterspell: 'counterspell',
  dash: 'dash',
  disengage: 'disengage',
  dodge: 'dodge',
  help: 'help',
  hide: 'hide',
  influence: 'influence',
  ready: 'ready',
  search: 'search-area',
  study: 'study',
  utilize: 'utilize',
};

/** The glyph of a server-listed action. */
export const actionGlyph = (id: ContextActionId): GlyphName => ACTIONS[id];

const KNOWLEDGE: Readonly<Record<KnowledgeType, GlyphName>> = {
  FACT: 'fact',
  EVIDENCE: 'evidence',
  TESTIMONY: 'testimony',
  RUMOR: 'rumor',
  INFERENCE: 'inference',
  HYPOTHESIS: 'hypothesis',
  CONTRADICTION: 'contradiction',
  UNKNOWN: 'unknown',
  SECRET: 'secret',
};

/** The glyph of an epistemic type; the type's word is always shown beside it. */
export const knowledgeGlyph = (type: KnowledgeType): GlyphName => KNOWLEDGE[type];

/** The hue modifier of an epistemic type (`--k-<tone>` in tokens.css); never shown alone. */
export const knowledgeTone = (type: KnowledgeType): Lowercase<KnowledgeType> =>
  type.toLowerCase() as Lowercase<KnowledgeType>;

/** Each day phase has its own glyph: the rising sun, the sun, the setting sun, the moon. */
const PHASES: Readonly<Record<DayPhase, GlyphName>> = {
  night: 'night',
  dawn: 'dawn',
  day: 'day',
  dusk: 'dusk',
};

export const phaseGlyph = (phase: DayPhase): GlyphName => PHASES[phase];

/** Each weather has its own glyph. */
const WEATHER: Readonly<Record<Weather, GlyphName>> = {
  clear: 'clear',
  overcast: 'overcast',
  rain: 'rain',
  storm: 'storm',
  fog: 'fog',
  snow: 'snow',
};

export const weatherGlyph = (weather: Weather): GlyphName => WEATHER[weather];

const KINDS: Readonly<Record<EntityKind, GlyphName>> = {
  location: 'place',
  character: 'party',
  npc: 'character',
  creature: 'melee',
  item: 'use-item',
  feature: 'search',
  faction: 'help',
};

/** The glyph of an entity kind, for lists and for medallions of things without a figure. */
export const kindGlyph = (kind: EntityKind): GlyphName => KINDS[kind];

/** People and creatures are shown as a figure: an approved portrait, else the silhouette. */
export const isFigure = (kind: EntityKind): boolean =>
  kind === 'character' || kind === 'npc' || kind === 'creature';
