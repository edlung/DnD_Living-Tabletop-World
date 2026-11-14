import { expect, it } from 'vitest';
import { createLogger } from '../../apps/server/src/platform/logging/logger.ts';
import { importCuratedSet } from '../../apps/server/src/images/curated-import.ts';
import { pearlArt } from './curated-art.ts';
import { pearlPlayFixture } from './play-fixture.ts';

it('binds genuine local art to opaque campaign identities and imports exact bytes once', async () => {
  const f = await pearlPlayFixture();
  try {
    const set = await pearlArt(f.saved);
    const entries = set.entries.flatMap((e) => e.entityIds);
    expect(entries).toContain(f.id('toren'));
    expect(entries).not.toContain('toren');
    expect(set.entries.some((e) => e.file === 'emil.webp')).toBe(false);
    const deps = {
      engine: f.engine,
      contents: f.contents,
      set,
      logger: createLogger({ service: 'pearl-art-test', level: 'silent' }),
      reason: 'Original Pearl built-in imagegen art',
    };
    const imported = await importCuratedSet(deps, f.campaignId, f.dm);
    expect(imported).toEqual({ imported: entries.length, present: 0, skipped: 0 });
    const after = await f.engine.load(f.campaignId);
    expect(after?.state.assets.assets.size).toBe(entries.length);
    const hidden = set.entries.find((entry) => entry.file === 'lucien.webp');
    expect(hidden).toBeDefined();
    expect(
      (
        await f.send(
          `/entities/${f.id('lucien')}/assets?perspective=PLAYER`,
          undefined,
          'pearl-test-player',
        )
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await f.send(
          `/assets/content/sha256:${hidden?.sha256}?perspective=PLAYER`,
          undefined,
          'pearl-test-player',
        )
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await f.send(
          `/entities/${f.id('toren')}/assets?perspective=PLAYER`,
          undefined,
          'pearl-test-player',
        )
      ).statusCode,
    ).toBe(200);
    const again = await importCuratedSet(deps, f.campaignId, f.dm);
    expect(again).toEqual({ imported: 0, present: entries.length, skipped: 0 });
    expect((await f.engine.load(f.campaignId))?.state.version).toBe(after?.state.version);
    const altered = structuredClone(f.saved);
    altered.content.world.name = 'Different campaign';
    await expect(pearlArt(altered)).rejects.toThrow('does not match');
  } finally {
    await f.app.close();
  }
}, 30_000);
