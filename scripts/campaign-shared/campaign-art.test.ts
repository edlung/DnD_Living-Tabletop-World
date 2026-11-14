import { describe, expect, it } from 'vitest';

import { createLogger } from '../../apps/server/src/platform/logging/logger.ts';
import { importCuratedSet } from '../../apps/server/src/images/curated-import.ts';
import { collectionPlayFixture } from '../campaign-collection/play-fixture.ts';
import type { Source } from '../campaign-collection/source.ts';
import { collectionPlayFixture as darkPlayFixture } from '../dark-fantasy/play-fixture.ts';
import { collectionPlayFixture as fantasyPlayFixture } from '../fantasy-campaigns/play-fixture.ts';
import { collectionPlayFixture as noirPlayFixture } from '../noir-campaigns/play-fixture.ts';
import { artOf, tokenSubjects } from './campaign-art.ts';
import { foeRoster } from './combat-kit.ts';
import { curatedArt } from './curated-art.ts';
import { SERIES, type Series } from './series.ts';

// Same fixture code in both series, typed by each series' own source.
const fixtures: Record<
  string,
  (s: never, size: number) => ReturnType<typeof collectionPlayFixture>
> = {
  'collection-2026': collectionPlayFixture,
  'fantasy-2026': fantasyPlayFixture,
  'dark-fantasy-2026': darkPlayFixture,
  'noir-2026': noirPlayFixture,
};
const illustrated: [string, Series, string][] = [];
for (const series of SERIES)
  for (const slug of series.slugs)
    if (artOf(new URL(`${slug}/`, series.root)).size > 0)
      illustrated.push([`${series.name}/${slug}`, series, slug]);

describe.each(illustrated)('%s pictures', (_id, series, slug) => {
  const loadSource = (key: string) => series.loadSource(key) as Promise<Source>;
  it('shows every place, person, item and foe, with spoilers held back', async () => {
    const s = await loadSource(slug);
    const art = artOf(new URL(`${slug}/`, series.root));
    for (const key of [
      ...s.world.locations.map((l) => l.key),
      ...s.cast.heroes.map((h) => h.key),
      ...s.cast.npcs.map((n) => n.key),
      ...s.items.map((i) => i.key),
    ])
      expect(art.has(key), key).toBe(true);
    for (let size = s.world.minPlayers; size <= s.world.maxPlayers; size++) {
      const foes = s.encounters.flatMap((e) =>
        foeRoster(e as Parameters<typeof foeRoster>[0], size),
      );
      const covered = [...art.values()]
        .filter((a) => a.kind === 'token')
        .flatMap((a) => tokenSubjects(s, a.srd ?? '', size));
      expect(new Set(covered)).toEqual(new Set(foes.map((f) => f.key)));
    }
    for (const asset of art.values()) {
      expect(asset.alpha).toBe(asset.kind === 'token');
      if (asset.kind === 'item') {
        const item = s.items.find((i) => i.key === asset.id);
        expect(asset.revealFromEvening).toBeGreaterThanOrEqual(item?.appears ?? 0);
      }
    }
  });

  it('binds to one exact campaign, imports once and hides people the party has not met', async () => {
    const s = await loadSource(slug);
    const f = await (fixtures[series.name] ?? collectionPlayFixture)(
      s as never,
      s.world.defaultPlayers,
    );
    try {
      const set = await curatedArt(series, slug, f.saved);
      const entries = set.entries.flatMap((e) => e.entityIds);
      expect(entries).toContain(f.id(s.cast.heroes[0]?.key ?? ''));
      const deps = {
        engine: f.engine,
        contents: f.contents,
        set,
        logger: createLogger({ service: 'collection-art-test', level: 'silent' }),
        reason: 'Original collection art',
      };
      expect(await importCuratedSet(deps, f.campaignId, f.dm)).toEqual({
        imported: entries.length,
        present: 0,
        skipped: 0,
      });
      expect(await importCuratedSet(deps, f.campaignId, f.dm)).toEqual({
        imported: 0,
        present: entries.length,
        skipped: 0,
      });
      // Someone the party has not met: an NPC away from the starting place.
      const unmet = s.cast.npcs.find((n) => n.location !== s.world.startLocation);
      const status = (key: string) =>
        f
          .send(
            `/entities/${f.id(key)}/assets?perspective=PLAYER`,
            undefined,
            'collection-test-player',
          )
          .then((r) => r.statusCode);
      expect(await status(s.cast.heroes[0]?.key ?? '')).toBe(200);
      expect(await status(unmet?.key ?? '')).toBe(404);
      const altered = structuredClone(f.saved);
      altered.content.world.name = 'Different campaign';
      await expect(curatedArt(series, slug, altered)).rejects.toThrow('does not match');
    } finally {
      await f.app.close();
    }
  }, 60_000);
});
