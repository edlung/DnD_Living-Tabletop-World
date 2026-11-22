import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

import { castManifest } from '../campaign-shared/cast-cards.ts';
import type { LibraryPicture, LibraryVariant } from './catalog.ts';

interface TablePicture {
  key: string;
  title: string;
  file: string;
  kind: 'place' | 'hero' | 'foe' | 'npc';
  subjects: string[];
  sha256: string;
  originalSha256: string;
  generated: string;
}
const repository = new URL('../../', import.meta.url);
const hash = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');

/** The crop sheet and its names are DM preparation. The game receives only the single bound
 * entity's reference or miniature, through the same checked import as the original shelf. */
export async function tablePictures(
  root: URL,
  variants: readonly LibraryVariant[],
): Promise<LibraryPicture[]> {
  const pictures: LibraryPicture[] = [];
  const keys = variants.map((v) => [v.id, new Set(v.content.entities.map((e) => e.key))] as const);
  const subjects = (all: readonly string[]) =>
    Object.fromEntries(keys.map(([v, known]) => [v, all.filter((k) => known.has(k))]));
  async function base(
    path: string,
    digest: string,
    original: string,
    title: string,
    all: readonly string[],
    generated: string,
  ) {
    const url = new URL(path, root);
    const bytes = await readFile(url);
    if (hash(bytes) !== digest) throw new Error('Changed table artwork: ' + path);
    return {
      source: url.href.slice(repository.href.length),
      bytes,
      sha256: digest,
      originalSha256: original,
      generated,
      prompt: 'Campaign illustration: ' + title,
      references: [],
      subjects: subjects(all),
    };
  }
  const cast = castManifest(root);
  for (const card of cast.cards) {
    const sheet = cast.sheets.find((s) => s.id === card.sheet);
    if (!sheet) throw new Error('Missing sheet: ' + card.id);
    pictures.push({
      ...(await base(
        'illustrations/' + card.file,
        card.sha256,
        sheet.originalSha256,
        card.title,
        card.subjects,
        '2026-11-22',
      )),
      file: card.id + '.webp',
      variant: 'reference',
      label: null,
      purpose: 'image',
      derivedFrom: null,
    });
  }
  const file = new URL('assets/table/manifest.json', root);
  if (existsSync(file)) {
    const { pictures: entries } = JSON.parse(readFileSync(file, 'utf8')) as {
      pictures: TablePicture[];
    };
    for (const e of entries) {
      const info = await base(
        'assets/table/' + e.file,
        e.sha256,
        e.originalSha256,
        e.title,
        e.subjects,
        e.generated,
      );
      const reference = e.key + '.webp';
      if (e.kind === 'place' || e.kind === 'foe')
        pictures.push({
          ...info,
          file: reference,
          variant: 'reference',
          label: null,
          purpose: 'image',
          derivedFrom: null,
        });
      if (e.kind !== 'place')
        pictures.push({
          ...info,
          file: e.key + '--figure.webp',
          variant: 'derived',
          label: 'figure',
          purpose: 'figure',
          derivedFrom: reference,
        });
    }
  }
  const opening = new URL('illustrations/manifest.json', root);
  if (existsSync(opening)) {
    const entry = JSON.parse(readFileSync(opening, 'utf8')) as {
      file: string;
      sha256: string;
      originalSha256: string;
      alt: string;
    };
    const region = variants[0]?.content.entities.find(
      (e) => e.kind === 'location' && e.location?.parent === null,
    );
    if (region)
      pictures.push({
        ...(await base(
          'illustrations/' + entry.file,
          entry.sha256,
          entry.originalSha256,
          entry.alt,
          [region.key],
          '2026-11-22',
        )),
        file: 'cover.webp',
        variant: 'reference',
        label: null,
        purpose: 'image',
        derivedFrom: null,
      });
  }
  return pictures;
}

/** A living train or ship has a location and an NPC identity. Its painting may be shared,
 * while the derived figure belongs to the NPC alone. Keep each reference's exact subject set. */
export function individualCastReferences(
  originals: readonly LibraryPicture[],
  additions: readonly LibraryPicture[],
  variants: readonly LibraryVariant[],
): LibraryPicture[] {
  const cast = new Set(
    variants.flatMap((v) => v.content.entities.filter((e) => e.kind === 'npc').map((e) => e.key)),
  );
  const newFigures = new Set(
    additions
      .filter((p) => p.purpose === 'figure')
      .flatMap((p) => Object.values(p.subjects).flat())
      .filter((k) => cast.has(k)),
  );
  return originals.flatMap((p) => {
    if (p.variant !== 'reference' || !Object.values(p.subjects).some((ids) => ids.length > 1))
      return [p];
    const split = [
      ...new Set(
        Object.values(p.subjects)
          .flat()
          .filter((k) => newFigures.has(k)),
      ),
    ];
    if (!split.length) return [p];
    const select = (keep: (key: string) => boolean) =>
      Object.fromEntries(
        Object.entries(p.subjects).map(([edition, keys]) => [edition, keys.filter(keep)]),
      );
    const common = { ...p, subjects: select((k) => !split.includes(k)) };
    return [
      ...(Object.values(common.subjects).some((keys) => keys.length) ? [common] : []),
      ...split.map((key) => ({
        ...p,
        file: key + '--portrait.webp',
        subjects: select((k) => k === key),
      })),
    ];
  });
}
