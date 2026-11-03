/**
 * The UI kit (ADR 0034): which GPT original becomes which shipped file, and how. Every recipe is
 * mechanical; the picture itself is the image model's.
 */
export type Recipe =
  /** A 4x4 sheet's cells in reading order; null leaves a cell out (an icon the kit already has). */
  | { readonly kind: 'glyphs'; readonly names: readonly (string | null)[]; readonly size: number }
  | { readonly kind: 'unscreen'; readonly out: string; readonly width: number }
  | {
      readonly kind: 'flood';
      readonly out: string;
      readonly width: number;
      readonly seeds?: readonly [number, number][];
    }
  | { readonly kind: 'art'; readonly out: string; readonly width: number; readonly quality: number }
  | {
      readonly kind: 'tile';
      readonly out: string;
      readonly width: number;
      readonly quality: number;
    };

import { ITEM_CATALOG } from '../../packages/contracts/src/items/catalog.ts';

const ITEM_CATALOG_IDS = ITEM_CATALOG.map((entry) => entry.itemId);
const glyphs = (...names: (string | null)[]): Recipe => ({ kind: 'glyphs', names, size: 128 });

/** The pictures by kind (ADR 0055 §6); `apps/web/src/visual/ui-kit-names.ts` KIND_NAMES lists them. */
const KIND_PICTURES = [
  ...[
    'abjuration',
    'conjuration',
    'divination',
    'enchantment',
    'evocation',
    'illusion',
    'necromancy',
    'transmutation',
  ].map((one) => `school-${one}`),
  ...[
    'aberration',
    'beast',
    'celestial',
    'construct',
    'dragon',
    'elemental',
    'fey',
    'fiend',
    'giant',
    'humanoid',
    'monstrosity',
    'ooze',
    'plant',
    'undead',
  ].map((one) => `type-${one}`),
  ...[
    'melee-weapon',
    'ranged-weapon',
    'armor',
    'shield',
    'ammunition',
    'potion',
    'scroll',
    'wand',
    'staff',
    'rod',
    'ring',
    'wondrous',
    'tool',
    'gear',
    'pack',
    'coins',
    'focus',
    'food',
    'tack',
  ].map((one) => `kind-${one}`),
] as const;

export const RECIPES: Readonly<Record<string, Recipe>> = {
  'icons-world': glyphs(
    'talk',
    'ask',
    'inspect',
    'trade',
    'give',
    'recall',
    'thought',
    'travel',
    'map',
    'look',
    'journal',
    'chronicle',
    'party',
    'character',
    'place',
    'settings',
  ),
  'icons-combat': glyphs(
    'move',
    'melee',
    'ranged',
    'cast',
    'use-item',
    'hide',
    'dodge',
    'help',
    'ready',
    'end-turn',
    'reaction',
    'counterspell',
    'cover',
    'difficult',
    'target',
    'initiative',
  ),
  /*
   * Stage 640 (docs/adr/0045-conditions-and-actions.md): the conditions, then the actions and
   * reactions. Dodge, Help, Hide and Ready keep the Stage 320 kit's own icons.
   */
  'icons-conditions': glyphs(
    'blinded',
    'charmed',
    'deafened',
    'exhaustion',
    'frightened',
    'grappled',
    'invisible',
    'paralyzed',
    'petrified',
    'poisoned',
    'restrained',
    'stunned',
    'dash',
    'disengage',
    null,
    null,
  ),
  'icons-actions': glyphs(
    null,
    null,
    'search-area',
    'study',
    'utilize',
    'influence',
    'opportunity-attack',
    'shield-spell',
    'uncanny-dodge',
    'hellish-rebuke',
    'feather-fall',
    'grapple',
    'shove',
    'two-weapons',
    'temporary-hit-points',
    'falling',
  ),
  'icons-dm': glyphs(
    'game-master',
    'add-character',
    'encounter',
    'time',
    'weather',
    'history',
    'undo',
    'perform',
    'ai-assistant',
    'confirm',
    'cancel',
    'who-sees',
    'secret',
    'hit-points',
    'armor-class',
    'speed',
  ),
  'icons-status': glyphs(
    'fact',
    'rumor',
    'testimony',
    'hypothesis',
    'evidence',
    'memory',
    'live',
    'offline',
    'warning',
    'info',
    'roll',
    'concentration',
    'unconscious',
    'dead',
    'wounded',
    'blessing',
  ),
  'icons-ui': glyphs(
    'inference',
    'contradiction',
    'unknown',
    'close',
    'chevron-down',
    'chevron-right',
    'chevron-left',
    'more',
    'search',
    'zoom-in',
    'zoom-out',
    'tilt',
    'flat',
    'refresh',
    'leave',
    'language',
  ),
  'icons-sky': glyphs(
    'dawn',
    'day',
    'dusk',
    'night',
    'clear',
    'overcast',
    'rain',
    'storm',
    'fog',
    'snow',
    'chapter',
    'flashback',
    'picture',
    'generate',
    'approve',
    'discard',
  ),
  'icons-more': glyphs(
    'prone',
    'slowed',
    'incapacitated',
    'invitation',
    'link',
    'copy',
    'revoke',
    'key',
    'member',
    'candidate',
    'replace',
    'bookmark',
    'sign-in',
    'hidden',
    'day-counter',
    'next-day',
  ),
  'scene-fallback': { kind: 'art', out: 'textures/scene-fallback.webp', width: 1920, quality: 78 },
  'app-backdrop': { kind: 'art', out: 'textures/app-backdrop.webp', width: 1920, quality: 76 },
  'panel-texture': { kind: 'tile', out: 'textures/panel-grain.webp', width: 512, quality: 78 },
  parchment: { kind: 'tile', out: 'textures/parchment.webp', width: 1024, quality: 80 },
  'book-spread': { kind: 'art', out: 'textures/book-spread.webp', width: 2048, quality: 82 },
  'brand-keyart': { kind: 'art', out: 'textures/brand-keyart.webp', width: 1920, quality: 80 },
  'chronicle-desk': { kind: 'art', out: 'textures/chronicle-desk.webp', width: 1920, quality: 78 },
  // The dice's surfaces (Stage 510): the players' obsidian and the DM's ivory.
  'dice-obsidian': { kind: 'tile', out: 'textures/dice-obsidian.webp', width: 512, quality: 80 },
  'dice-ivory': { kind: 'tile', out: 'textures/dice-ivory.webp', width: 512, quality: 80 },
  'flashback-frame': { kind: 'unscreen', out: 'ornaments/flashback-frame.webp', width: 1200 },
  ribbon: { kind: 'flood', out: 'ornaments/ribbon.webp', width: 160 },
  emblem: { kind: 'flood', out: 'ornaments/emblem.webp', width: 512 },
  'compass-rose': { kind: 'flood', out: 'ornaments/compass-rose.webp', width: 384 },
  'portrait-ring': { kind: 'unscreen', out: 'ornaments/portrait-ring.webp', width: 256 },
  divider: { kind: 'unscreen', out: 'ornaments/divider.webp', width: 720 },
  corner: { kind: 'unscreen', out: 'ornaments/corner.webp', width: 192 },
  'd20-badge': { kind: 'flood', out: 'ornaments/d20.webp', width: 256 },
  ground: { kind: 'tile', out: 'board/ground.webp', width: 1024, quality: 80 },
  difficult: { kind: 'tile', out: 'board/difficult.webp', width: 512, quality: 80 },
  'cover-half': { kind: 'flood', out: 'board/cover-half.webp', width: 384 },
  'cover-three-quarters': { kind: 'flood', out: 'board/cover-three-quarters.webp', width: 384 },
  'cover-total': { kind: 'flood', out: 'board/cover-total.webp', width: 384 },
  'figure-silhouette': {
    kind: 'art',
    out: 'board/figure-silhouette.webp',
    width: 512,
    quality: 82,
  },
  ...Object.fromEntries(
    ['longbow', 'shortbow', 'scimitar', 'dagger'].map((id) => [
      `weapon-${id}`,
      { kind: 'art', out: `catalog/weapons/${id}.webp`, width: 512, quality: 82 } as const,
    ]),
  ),
  // Item catalog pictures (Stage 480, ADR 0039): originals are named item-<catalog id>.
  ...Object.fromEntries(
    ITEM_CATALOG_IDS.map((id) => [
      `item-${id}`,
      { kind: 'art', out: `catalog/items/${id}.webp`, width: 384, quality: 82 } as const,
    ]),
  ),
  ...Object.fromEntries(
    [
      'hunters-mark',
      'detect-magic',
      'healing-word',
      'misty-step',
      'fireball',
      'counterspell',
      'ashen-bolt',
      'binding-hex',
    ].map((id) => [
      `spell-${id}`,
      { kind: 'art', out: `catalog/spells/${id}.webp`, width: 384, quality: 82 } as const,
    ]),
  ),
  // Pictures by kind (Stage 650e, docs/adr/0055-rules-reference-and-toolbox.md §6): a school of
  // magic, a creature type, an item's look; originals are named as their files.
  ...Object.fromEntries(
    KIND_PICTURES.map((name) => [
      name,
      { kind: 'art', out: `catalog/kinds/${name}.webp`, width: 384, quality: 82 } as const,
    ]),
  ),
};

/** The owner's concepts used as style references, by the short names the prompts use. */
export const CONCEPTS: Readonly<Record<string, string>> = {
  overview: 'docs/design/stage-320/owner-concepts/01-overview.webp',
  quad: 'docs/design/stage-320/owner-concepts/02-four-screens.webp',
  items: 'docs/design/stage-320/owner-concepts/03-equipment.webp',
  'dm-flow': 'docs/design/stage-320/owner-concepts/04-dm-creates-a-place.webp',
  bridge: 'docs/design/stage-320/owner-concepts/05-combat-bridge.webp',
  combat: 'docs/design/stage-320/owner-concepts/06-combat-states.webp',
  views: 'docs/design/stage-320/owner-concepts/07-player-and-dm-view.webp',
};

export const CHANNEL =
  "OpenAI image model through Codex CLI image generation on the owner's ChatGPT subscription";
