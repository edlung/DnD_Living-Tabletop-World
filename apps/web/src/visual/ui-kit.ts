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

/** A white alpha mask; render with `Glyph` (CSS `mask-image` tinted by `currentColor`). */
export const glyphUrl = (name: GlyphName): string => glyphs.get(name) ?? '';
export const textureUrl = (name: TextureName): string => textures.get(name) ?? '';
export const ornamentUrl = (name: OrnamentName): string => ornaments.get(name) ?? '';
export const boardUrl = (name: BoardName): string => board.get(name) ?? '';

/** Catalog art for a rules catalog ID (`fireball`, `longbow`), or null when there is none. */
export function catalogUrl(kind: CatalogKind, id: string): string | null {
  return (kind === 'spells' ? spells : weapons).get(id) ?? null;
}

/** Every loaded name per folder, for the completeness test. */
export const LOADED = { glyphs, textures, ornaments, board, spells, weapons } as const;
