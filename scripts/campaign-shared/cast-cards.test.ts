import { expect, it } from 'vitest';

import { buildPackage } from '../mixed-campaigns/package.ts';
import { loadSource } from '../mixed-campaigns/source.ts';
import { assessmentRevision } from '../mixed-campaigns/validate.ts';
import { curatedArt } from './curated-art.ts';
import { artworkCampaignOf } from './series.ts';

it('binds only cards present in the selected party variant and keeps the other portraits out of their metadata', async () => {
  const { series, slug } = artworkCampaignOf('mixed-ages-2026/rain-bureau');
  const source = await loadSource(slug);
  const revision = assessmentRevision(buildPackage(source, 3));
  const result = await curatedArt(series, slug, revision);
  const heroes = result.entries.filter((entry) =>
    source.cast.heroes.some((h) => entry.file === h.key + '.webp'),
  );
  expect(heroes).toHaveLength(3);
  for (const hero of source.cast.heroes.slice(0, 3)) {
    const id = revision.identities.entities[hero.key];
    expect(heroes.find((entry) => entry.file === hero.key + '.webp')?.entityIds).toEqual([id]);
  }
  const kit = result.entries.find((entry) => entry.file === 'travel-kit.webp');
  expect(kit?.entityIds).toHaveLength(3);
  for (const npc of source.cast.npcs)
    expect(heroes.every((entry) => !entry.prompt.includes(npc.name))).toBe(true);
});
