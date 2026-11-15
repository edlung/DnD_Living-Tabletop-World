import { mkdir, rm, writeFile } from 'node:fs/promises';

import { LIBRARY, libraryCampaign, type LibraryCampaign } from './catalog.ts';

/**
 * Writes `fixtures/campaign-library/`: what the server ships and the workshop offers. Usage, from
 * the repository root: `node --conditions=@ltw/source scripts/campaign-library/build.ts`.
 * Every file is derived from `campaigns/`; never edit the fixture by hand.
 */
export const LIBRARY_ROOT = new URL('../../fixtures/campaign-library/', import.meta.url);

/** The library's index entry of one campaign, as `library.json` stores it. */
export function libraryJson(c: LibraryCampaign) {
  const main = c.variants.find((v) => v.id === c.defaultVariant) ?? c.variants[0];
  if (!main) throw new Error(`${c.source.id}: no variants`);
  return {
    id: c.source.id,
    title: main.content.world.name,
    genre: c.source.genre,
    audience: c.source.audience,
    pitch: main.content.brief.intent,
    tone: main.content.brief.tone,
    duration: main.content.brief.duration,
    cover: `${c.root.href.slice(new URL('../../', import.meta.url).href.length)}assets/runtime/cover.webp`,
    defaultVariant: c.defaultVariant,
    variants: c.variants.map((v) => ({
      id: v.id,
      players: v.players,
      label: v.label,
      file: `packages/${v.id}.json`,
      digest: v.digest,
    })),
    generator: 'codex-cli imagegen',
    pictures: c.pictures.map((picture) =>
      Object.fromEntries(Object.entries(picture).filter(([key]) => key !== 'bytes')),
    ),
  };
}

export async function buildLibrary(): Promise<string[]> {
  await rm(LIBRARY_ROOT, { recursive: true, force: true });
  await mkdir(LIBRARY_ROOT, { recursive: true });
  const ids: string[] = [];
  for (const source of LIBRARY) {
    const c = await libraryCampaign(source);
    const dir = new URL(`${source.id}/`, LIBRARY_ROOT);
    await mkdir(new URL('packages/', dir), { recursive: true });
    for (const v of c.variants)
      await writeFile(new URL(`packages/${v.id}.json`, dir), JSON.stringify(v.content));
    await writeFile(new URL('library.json', dir), `${JSON.stringify(libraryJson(c), null, 1)}\n`);
    ids.push(source.id);
  }
  await writeFile(
    new URL('index.json', LIBRARY_ROOT),
    `${JSON.stringify({ campaigns: ids }, null, 1)}\n`,
  );
  await writeFile(
    new URL('AGENTS.md', LIBRARY_ROOT),
    "# Campaign library (generated)\n\nWritten by `scripts/campaign-library/build.ts` from `campaigns/`; never edit by hand. Each folder\nholds one campaign the workshop offers: `library.json` (its variants, their package digests and\nits pictures bound by package key, read from the campaign's own `assets/`) and `packages/`. Read\n`library.json` by key.\n",
  );
  return ids;
}

if (import.meta.url === `file://${process.argv[1] ?? ''}`) {
  const ids = await buildLibrary();
  process.stdout.write(`campaign library: ${ids.join(', ')}\n`);
}
