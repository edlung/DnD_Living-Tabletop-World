import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { CampaignRevision } from '../../packages/contracts/src/index.ts';
import { campaignCanonicalJson } from '../../apps/server/src/workshop/packages/content.ts';
import { loadCuratedSet } from '../../apps/server/src/images/curated-set.ts';
import { artOf, tokenSubjects, type ArtSource } from './campaign-art.ts';
import { castManifest } from './cast-cards.ts';

/** One authored series: where its campaigns live, how a source loads and how a package builds. */
export interface ArtSeries<S extends ArtSource = ArtSource> {
  root: URL;
  loadSource(slug: string): Promise<S>;
  buildPackage(s: S, size: number): unknown;
}

/**
 * Binds a reworked campaign's pictures to the entities of one confirmed campaign revision.
 * Only an unedited authored package qualifies: the revision must equal the package built for its
 * party size. Token pictures bind by SRD block at that size, since foe keys depend on it.
 */
export async function curatedArt<S extends ArtSource>(
  series: ArtSeries<S>,
  slug: string,
  revision: CampaignRevision,
) {
  const s = await series.loadSource(slug);
  const dir = new URL(`${slug}/`, series.root);
  const party = revision.content.party;
  const size = party.length;
  const expected = s.cast.heroes.slice(0, size).map((h) => h.key);
  if (
    party.join() !== expected.join() ||
    campaignCanonicalJson(revision.content) !== campaignCanonicalJson(series.buildPackage(s, size))
  )
    throw new Error(
      `This campaign does not match the authored ${slug} package. Review edits before mapping art.`,
    );
  const art = artOf(dir);
  const cast = castManifest(dir);
  if (art.size === 0 && cast.cards.length === 0) throw new Error(`${slug} has no pictures`);
  const directory = await mkdtemp(join(tmpdir(), `ltw-${slug}-art-`));
  try {
    const assets = [];
    for (const asset of art.values()) {
      if (!/^[a-z0-9-]+$/.test(asset.id) || asset.runtimeFile !== `runtime/${asset.id}.webp`)
        throw new Error('Invalid art path');
      const subjects =
        asset.kind === 'token' ? tokenSubjects(s, asset.srd ?? '', size) : asset.subjects;
      const entityIds = subjects.flatMap((key) => revision.identities.entities[key] ?? []);
      if (!entityIds.length) continue;
      const file = `${asset.id}.webp`;
      await copyFile(
        fileURLToPath(new URL(`assets/${asset.runtimeFile}`, dir)),
        join(directory, file),
      );
      // A hero's or NPC's tabletop figure stands derived from its portrait (`ArtPrompt.subject`).
      const standing = asset.kind === 'figure' && asset.subject;
      assets.push({
        file,
        entityIds,
        variant: standing ? 'derived' : 'reference',
        label: standing ? 'figure' : null,
        purpose: standing ? 'figure' : 'image',
        derivedFrom: standing ? `${asset.subject ?? ''}.webp` : null,
        mediaType: 'image/webp',
        sha256: asset.runtimeSha256,
        originalSha256: asset.sha256,
        generated: asset.generated,
        references: [],
        prompt: asset.prompt,
      });
    }
    for (const card of cast.cards) {
      if (!/^[a-z0-9-]+$/.test(card.id) || card.file !== `cards/${card.id}.webp`)
        throw new Error('Invalid card path');
      const entityIds = card.subjects.flatMap((key) => revision.identities.entities[key] ?? []);
      if (!entityIds.length) continue;
      const sheet = cast.sheets.find((entry) => entry.id === card.sheet);
      if (!sheet) throw new Error('Missing source sheet');
      const file = `${card.id}.webp`;
      await copyFile(new URL(`illustrations/${card.file}`, dir), join(directory, file));
      assets.push({
        file,
        entityIds,
        variant: 'reference',
        label: null,
        purpose: 'image',
        derivedFrom: null,
        mediaType: 'image/webp',
        sha256: card.sha256,
        originalSha256: sheet.originalSha256,
        generated: '2026-11-22',
        references: [],
        // Only this card's public description travels with its runtime reference. The full
        // contact-sheet prompt in the DM pack describes characters the party may never meet.
        prompt: `Illustrated campaign reference: ${card.title}.`,
      });
    }
    await writeFile(
      join(directory, 'manifest.json'),
      JSON.stringify({
        about: `Original artwork for ${s.world.title}.`,
        generator: 'codex-cli-imagegen',
        assets,
      }),
    );
    // The curated loader validates every encoded byte, hash, size and identity binding first.
    return await loadCuratedSet(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
