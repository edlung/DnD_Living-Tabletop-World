import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  ITEM_LOOKS,
  SRD_CREATURE_TYPES,
  SRD_SCHOOLS,
  srdCreatureTypeOf,
} from '../../packages/contracts/src/index.ts';
import { SRD_MONSTERS } from '../../packages/rules/src/index.ts';
import {
  creatureTypeArtUrl,
  itemPictureUrl,
  LOADED,
  schoolArtUrl,
} from '../../apps/web/src/visual/ui-kit.ts';
import {
  BOARD_NAMES,
  CATALOG_NAMES,
  KIND_NAMES,
  GLYPH_NAMES,
  ORNAMENT_NAMES,
  TEXTURE_NAMES,
} from '../../apps/web/src/visual/ui-kit-names.ts';

/**
 * Every shipped picture is GPT-made and has its provenance (docs/adr/0034-visual-language.md
 * §4): a file without a manifest entry, or an entry without its file, fails here.
 */
const assets = new URL('../../apps/web/src/assets/', import.meta.url).pathname;
const kit = join(assets, 'ui-kit');

interface Entry {
  readonly source: string;
  readonly prompt: string;
  readonly channel: string;
  readonly originalSha256: string;
  readonly generated: string;
  readonly recipe: string;
  readonly references: readonly string[];
}
const manifest = JSON.parse(readFileSync(join(assets, 'ui-kit.manifest.json'), 'utf8')) as {
  readonly assets: Readonly<Record<string, Entry>>;
};

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [relative(kit, path).split(sep).join('/')];
  });
}

const names = (folder: string) =>
  files(join(kit, folder))
    .map((path) => path.replace(/^.*\/([^/]+)\.(?:png|webp)$/, '$1'))
    .sort();

describe('the UI kit manifest', () => {
  const shipped = files(kit).sort();

  it('lists every picture under assets/ui-kit with a GPT provenance', () => {
    expect(shipped.length).toBeGreaterThan(100);
    for (const path of shipped) {
      const entry = manifest.assets[path];
      expect(entry, `${path} has no manifest entry`).toBeDefined();
      if (!entry) continue;
      expect(entry.channel, path).toMatch(/OpenAI image model/);
      expect(entry.originalSha256, path).toMatch(/^[0-9a-f]{64}$/);
      expect(entry.prompt.trim().length, path).toBeGreaterThan(0);
      expect(entry.recipe.trim().length, path).toBeGreaterThan(0);
      expect(entry.generated, path).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('has no entry without its file', () => {
    for (const path of Object.keys(manifest.assets)) {
      expect(existsSync(join(kit, path)), `${path} is listed but missing`).toBe(true);
    }
  });

  it('cites only reference concepts that exist', () => {
    const root = new URL('../../', import.meta.url).pathname;
    for (const [path, entry] of Object.entries(manifest.assets)) {
      for (const reference of entry.references) {
        // A later glyph sheet may cite an earlier sheet of the kit as its style reference.
        const sheet = /^ui-kit:(.+)$/.exec(reference)?.[1];
        const cited =
          sheet === undefined
            ? existsSync(join(root, reference))
            : Object.values(manifest.assets).some((other) => other.source === sheet);
        expect(cited, `${path} cites ${reference}`).toBe(true);
      }
    }
  });
});

describe('the UI kit in the client', () => {
  it('names exactly the files on disk', () => {
    expect([...GLYPH_NAMES].sort()).toEqual(names('glyphs'));
    expect([...TEXTURE_NAMES].sort()).toEqual(names('textures'));
    expect([...ORNAMENT_NAMES].sort()).toEqual(names('ornaments'));
    expect([...BOARD_NAMES].sort()).toEqual(names('board'));
    expect([...CATALOG_NAMES.spells].sort()).toEqual(names('catalog/spells'));
    expect([...CATALOG_NAMES.weapons].sort()).toEqual(names('catalog/weapons'));
    expect([...KIND_NAMES].sort()).toEqual(names('catalog/kinds'));
  });

  it('builds a URL for every named picture', () => {
    const loaded = (map: ReadonlyMap<string, string>) => [...map.keys()].sort();
    expect(loaded(LOADED.glyphs)).toEqual([...GLYPH_NAMES].sort());
    expect(loaded(LOADED.textures)).toEqual([...TEXTURE_NAMES].sort());
    expect(loaded(LOADED.ornaments)).toEqual([...ORNAMENT_NAMES].sort());
    expect(loaded(LOADED.board)).toEqual([...BOARD_NAMES].sort());
    expect(loaded(LOADED.spells)).toEqual([...CATALOG_NAMES.spells].sort());
    expect(loaded(LOADED.weapons)).toEqual([...CATALOG_NAMES.weapons].sort());
    expect(loaded(LOADED.kinds)).toEqual([...KIND_NAMES].sort());
    for (const url of LOADED.glyphs.values()) expect(url).toMatch(/\.png$/);
  });

  it('pictures every school, creature type and item look an SRD entry can have', () => {
    for (const school of SRD_SCHOOLS) expect(schoolArtUrl(school), school).not.toBeNull();
    for (const type of SRD_CREATURE_TYPES) expect(creatureTypeArtUrl(type), type).not.toBeNull();
    for (const look of ITEM_LOOKS)
      expect(itemPictureUrl({ itemId: 'srd-none', look }), look).not.toBeNull();
    // Every stat block has its type, a swarm its members' ("Swarm of Tiny Beasts").
    const untyped = SRD_MONSTERS.filter((monster) => srdCreatureTypeOf(monster.type) === null);
    expect(untyped.map((monster) => monster.name)).toEqual([]);
    expect(srdCreatureTypeOf('Swarm of Tiny Undead')).toBe('undead');
  });
});
