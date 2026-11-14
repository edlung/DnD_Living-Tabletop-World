import { mkdtemp, readFile, copyFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { CampaignRevision } from '../../packages/contracts/src/index.ts';
import { campaignCanonicalJson } from '../../apps/server/src/workshop/packages/content.ts';
import { loadCuratedSet } from '../../apps/server/src/images/curated-set.ts';
import type { HeroKey } from './data.ts';
import { HERO_KEYS } from './data.ts';
import { buildLighthousePackage } from './package.ts';
import { packRoot } from './render-common.ts';
import manifest from '../../campaigns/lighthouse/assets/manifest.json' with { type: 'json' };

/** Resolve local art keys only against the confirmed, exact campaign revision. */
export async function lighthouseArt(revision: CampaignRevision) {
  const party = revision.content.party;
  if (
    party.some((key) => !HERO_KEYS.includes(key as HeroKey)) ||
    campaignCanonicalJson(revision.content) !==
      campaignCanonicalJson(buildLighthousePackage(party as HeroKey[]))
  )
    throw new Error(
      'This campaign does not match the authored Lighthouse package. Review edits before mapping art.',
    );
  const directory = await mkdtemp(join(tmpdir(), 'ltw-lighthouse-art-'));
  try {
    const assets = [];
    for (const asset of manifest.assets) {
      if (!/^[a-z0-9-]+$/.test(asset.id) || asset.runtimeFile !== `runtime/${asset.id}.webp`)
        throw new Error('Invalid art path');
      const entityIds = asset.subjects.flatMap((key) => revision.identities.entities[key] ?? []);
      if (!entityIds.length) continue;
      const file = `${asset.id}.webp`;
      await copyFile(
        fileURLToPath(new URL(`assets/${asset.runtimeFile}`, packRoot)),
        join(directory, file),
      );
      assets.push({
        file,
        entityIds,
        variant: 'reference',
        label: null,
        purpose: 'image',
        derivedFrom: null,
        mediaType: 'image/webp',
        sha256: asset.runtimeSha256,
        originalSha256: asset.sha256,
        generated: asset.generated,
        references: [],
        prompt: asset.prompt,
      });
    }
    await writeFile(
      join(directory, 'manifest.json'),
      JSON.stringify({ about: manifest.about, generator: manifest.generator, assets }),
    );
    // Existing curated loader validates every encoded byte, hash, size and identity binding first.
    return await loadCuratedSet(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function readNativePackage() {
  return JSON.parse(await readFile(new URL('package.json', packRoot), 'utf8')) as unknown;
}
