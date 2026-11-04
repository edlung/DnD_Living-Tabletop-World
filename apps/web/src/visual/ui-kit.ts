import { ITEM_CATALOG, type WeaponId } from '@ltw/contracts';

import type {
  BoardName,
  CatalogKind,
  GlyphName,
  OrnamentName,
  TextureName,
} from './ui-kit-names.ts';

/*
 * URLs of the GPT-made UI kit (docs/adr/0034-visual-language.md §3–5). These pictures state
 * nothing about the world: a UI-kit picture never stands in for an approved world image, which
 * comes from the asset API (`approved-images.ts`). The bundler emits each file; the maps are
 * built once, eagerly.
 */

/** File base name (without folder or extension) → URL. */
function byName(files: Readonly<Record<string, string>>): ReadonlyMap<string, string> {
  return new Map(
    Object.entries(files).map(([path, url]) => [
      path.replace(/^.*\/([^/]+)\.(?:png|webp)$/, '$1'),
      url,
    ]),
  );
}

// The bundler reads each pattern and its options literally, so they are spelled out per call.
const glyphs = byName(
  import.meta.glob<string>('../assets/ui-kit/glyphs/*.png', {
    eager: true,
    query: '?url',
    import: 'default',
  }),
);
const textures = byName(
  import.meta.glob<string>('../assets/ui-kit/textures/*.webp', {
    eager: true,
    query: '?url',
    import: 'default',
  }),
);
const ornaments = byName(
  import.meta.glob<string>('../assets/ui-kit/ornaments/*.webp', {
    eager: true,
    query: '?url',
    import: 'default',
  }),
);
const board = byName(
  import.meta.glob<string>('../assets/ui-kit/board/*.webp', {
    eager: true,
    query: '?url',
    import: 'default',
  }),
);
const spells = byName(
  import.meta.glob<string>('../assets/ui-kit/catalog/spells/*.webp', {
    eager: true,
    query: '?url',
    import: 'default',
  }),
);
const weapons = byName(
  import.meta.glob<string>('../assets/ui-kit/catalog/weapons/*.webp', {
    eager: true,
    query: '?url',
    import: 'default',
  }),
);

// Item pictures (Stage 480): one per item catalog ID, generated later by the image model; an item
// without one shows the neutral glyph, never a stand-in picture of something else.
const items = byName(
  import.meta.glob<string>('../assets/ui-kit/catalog/items/*.webp', {
    eager: true,
    query: '?url',
    import: 'default',
  }),
);

// Pictures by kind (docs/adr/0055-rules-reference-and-toolbox.md §6): a school, a creature type, an
// item's look; an SRD entry shows its kind's until it has its own.
const kinds = byName(
  import.meta.glob<string>('../assets/ui-kit/catalog/kinds/*.webp', {
    eager: true,
    query: '?url',
    import: 'default',
  }),
);

/** A white alpha mask; render with `Glyph` (CSS `mask-image` tinted by `currentColor`). */
export const glyphUrl = (name: GlyphName): string => glyphs.get(name) ?? '';
export const textureUrl = (name: TextureName): string => textures.get(name) ?? '';
export const ornamentUrl = (name: OrnamentName): string => ornaments.get(name) ?? '';
export const boardUrl = (name: BoardName): string => board.get(name) ?? '';

/** Catalog art for a rules catalog ID (`fireball`, `longbow`), or null when there is none. */
export function catalogUrl(kind: CatalogKind, id: string): string | null {
  return (kind === 'spells' ? spells : weapons).get(id) ?? null;
}

/** The picture of an item catalog entry (`woodland-balm`), or null while it has none. */
export const itemArtUrl = (itemId: string): string | null => items.get(itemId) ?? null;

/**
 * A rules weapon's picture (Stage 520): the weapons catalog's own where there is one, else the
 * picture of the Ravenford weapon item that fights as it.
 */
export function weaponArtUrl(weaponId: WeaponId): string | null {
  const own = catalogUrl('weapons', weaponId);
  if (own) return own;
  const item = ITEM_CATALOG.find((entry) => entry.weapon === weaponId);
  return item ? itemArtUrl(item.itemId) : null;
}

/** A school of magic's picture (`evocation`), for an SRD spell without its own. */
export const schoolArtUrl = (school: string | undefined): string | null =>
  school === undefined ? null : (kinds.get(`school-${school}`) ?? null);

/** A creature type's picture (`dragon`), for an SRD stat block in the bestiary. */
export const creatureTypeArtUrl = (creatureType: string | null): string | null =>
  creatureType === null ? null : (kinds.get(`type-${creatureType}`) ?? null);

/** An item's picture: its own, else its look's (an SRD entry), else none. */
export const itemPictureUrl = (catalog: {
  readonly itemId: string;
  readonly look: string | null;
}): string | null =>
  itemArtUrl(catalog.itemId) ??
  (catalog.look === null ? null : (kinds.get(`kind-${catalog.look}`) ?? null));

/** Every loaded name per folder, for the completeness test. */
export const LOADED = { glyphs, textures, ornaments, board, spells, weapons, kinds } as const;
