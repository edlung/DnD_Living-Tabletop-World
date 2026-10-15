import { createHash } from 'node:crypto';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createPlaceholderImageGenerator } from '@ltw/ai';
import type { EntityPresentationResponse } from '@ltw/contracts';
import { holderPerspective, entityPresentationAt, type WorldEngine } from '@ltw/domain';
import { beforeAll, describe, expect, it } from 'vitest';

import { createLogger } from '../platform/logging/logger.ts';
import { seededEngine } from '../testing/ravenford-app.ts';
import { RAVENFORD_RU_FIXTURES_DIR } from '../world-engine/ravenford-seed.ts';
import { InMemoryAssetContentStore, contentHashOf } from '../assets/content-store.ts';
import { AssetWorker } from '../assets/worker.ts';
import { CURATED_REASON, CuratedImportError, importCuratedSet } from './curated-import.ts';
import {
  CURATED_SET_DIR,
  CuratedSetError,
  createCuratedImageGenerator,
  loadCuratedSet,
  type CuratedSet,
} from './curated-set.ts';

/**
 * The curated Ravenford set (docs/adr/0035-images.md §3): its manifest and files agree, the
 * `curated` generator serves exactly what it holds, and an import into a campaign goes through
 * real commands, approves every picture for players as the DM, and is idempotent.
 */
const DM = { actorId: 'dm-ravenford', kind: 'user' } as const;
const logger = createLogger({ service: 'curated-test', level: 'silent' });

let set: CuratedSet;
beforeAll(async () => {
  set = await loadCuratedSet();
});

const brief = (entityId: string, changes: Record<string, unknown> = {}) => ({
  seed: 'x#0',
  subject: { entityId, kind: 'npc', name: 'Name', description: null },
  variant: 'reference' as const,
  purpose: 'image' as const,
  label: null,
  note: null,
  basedOn: null,
  reference: null,
  ...changes,
});

/** Real images, seeds and imports: generous under a loaded machine (the unit default is 5 s). */
const SLOW_MS = 30_000;

describe('the curated set', { timeout: SLOW_MS }, () => {
  it('lists every committed picture with a matching hash, references first', async () => {
    const manifest = JSON.parse(await readFile(join(CURATED_SET_DIR, 'manifest.json'), 'utf8')) as {
      assets: { file: string; sha256: string }[];
    };
    expect(set.entries).toHaveLength(manifest.assets.length);
    for (const { file, sha256 } of manifest.assets) {
      const bytes = set.bytesOf(file);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(sha256);
    }
    const firstDerived = set.entries.findIndex((entry) => entry.variant === 'derived');
    expect(set.entries.slice(firstDerived).every((entry) => entry.variant === 'derived')).toBe(
      true,
    );
    expect(set.model).toBe('codex-cli/imagegen');
  });

  it('refuses a set whose file no longer matches its manifest', async () => {
    const copy = await mkdtemp(join(tmpdir(), 'ltw-curated-'));
    try {
      await cp(CURATED_SET_DIR, copy, { recursive: true });
      const target = join(copy, 'mira-vale.webp');
      const bytes = await readFile(target);
      bytes[bytes.length - 1] = (bytes[bytes.length - 1] ?? 0) ^ 0xff;
      await writeFile(target, bytes);
      await expect(loadCuratedSet(copy)).rejects.toBeInstanceOf(CuratedSetError);
    } finally {
      await rm(copy, { recursive: true, force: true });
    }
  });

  it('serves the picture for an entity, variant, label and purpose, and nothing else', async () => {
    const generator = createCuratedImageGenerator(set);
    expect(generator.id).toBe('curated');
    const mira = await generator.generate(brief('mira-vale'));
    expect(mira.mediaType).toBe('image/webp');
    expect(mira.model).toBe('codex-cli/imagegen');
    expect(mira.bytes).toEqual(set.bytesOf('mira-vale.webp'));
    const figure = await generator.generate(
      brief('goblin-raider-2', { variant: 'derived', label: 'figure', purpose: 'figure' }),
    );
    expect(figure.bytes).toEqual(set.bytesOf('goblin-raider--figure.webp'));
    const map = await generator.generate(
      brief('old-trade-road', { variant: 'derived', label: 'map', purpose: 'battle-map' }),
    );
    expect(map.bytes).toEqual(set.bytesOf('old-trade-road--map.webp'));
    for (const missing of [
      brief('tomas-reed'),
      brief('mira-vale', { variant: 'derived', label: 'night' }),
      brief('old-trade-road', { variant: 'derived', label: 'map' }),
      brief('mira-vale', { variant: 'derived', label: 'figure' }),
    ]) {
      await expect(generator.generate(missing)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    }
  });
});

describe('importing the curated set', { timeout: SLOW_MS }, () => {
  let engine: WorldEngine;
  let contents: InMemoryAssetContentStore;

  const run = () => importCuratedSet({ engine, contents, set, logger }, 'ravenford', DM);

  it('approves every picture through real commands, for players, and is idempotent', async () => {
    engine = await seededEngine(undefined, undefined, undefined, RAVENFORD_RU_FIXTURES_DIR);
    contents = new InMemoryAssetContentStore();
    const pictures = set.entries.reduce((sum, entry) => sum + entry.entityIds.length, 0);
    expect(await run()).toEqual({ imported: pictures, present: 0, skipped: 0 });

    const snapshot = await engine.load('ravenford');
    const assets = [...(snapshot?.state.assets.assets.values() ?? [])];
    expect(assets).toHaveLength(pictures);
    for (const asset of assets) {
      expect(asset.status).toBe(asset.variant === 'reference' ? 'CANONICAL' : 'APPROVED');
      expect(asset.audience).toBe('players');
      expect(asset.generator).toEqual({ provider: 'curated', model: 'codex-cli/imagegen' });
      const stored = await contents.get('ravenford', asset.contentHash);
      expect(stored && contentHashOf(stored.bytes)).toBe(asset.contentHash);
    }
    // Every variant derives from its entity's curated canonical reference.
    for (const asset of assets.filter((candidate) => candidate.variant === 'derived')) {
      expect(asset.derivedFrom).toBe(snapshot?.state.assets.canonical.get(asset.entityId));
    }
    // The DM requested and approved; only the asset worker reported the jobs.
    const log = await engine.commandLog('ravenford');
    const actors = new Map<string, Set<string>>();
    for (const stored of log.filter((entry) => entry.commandType.includes('Asset'))) {
      const seen = actors.get(stored.commandType) ?? new Set<string>();
      seen.add(stored.actor.actorId);
      actors.set(stored.commandType, seen);
    }
    expect(Object.fromEntries([...actors].map(([type, ids]) => [type, [...ids]]))).toEqual({
      RequestAsset: ['dm-ravenford'],
      StartAssetJob: ['asset-worker'],
      CompleteAssetJob: ['asset-worker'],
      ApproveAsset: ['dm-ravenford'],
    });

    const version = snapshot?.state.version;
    expect(await run()).toEqual({ imported: 0, present: pictures, skipped: 0 });
    expect((await engine.load('ravenford'))?.state.version).toBe(version);
  });

  it('shows players the pictures of what they know, with figures and the battle map', async () => {
    engine = await seededEngine(undefined, undefined, undefined, RAVENFORD_RU_FIXTURES_DIR);
    contents = new InMemoryAssetContentStore();
    await run();
    const snapshot = await engine.load('ravenford');
    if (!snapshot) throw new Error('missing campaign');
    const elowen = holderPerspective(snapshot.state, {
      kind: 'CHARACTER',
      characterId: 'elowen-starwhisper',
    });
    const present = (id: string): EntityPresentationResponse | null =>
      entityPresentationAt(snapshot, elowen, id, null);
    expect(present('elowen-starwhisper')?.presentation).toMatchObject({
      image: { variant: 'reference', purpose: 'image' },
      figure: { purpose: 'figure' },
      battleMap: null,
    });
    expect(present('old-trade-road')?.presentation).toMatchObject({
      image: { purpose: 'image' },
      battleMap: { purpose: 'battle-map' },
    });
    // The caravan site is unknown to her: nothing of it, its pictures included.
    expect(present('abandoned-caravan-site')).toBeNull();
  });

  it('skips the entities a campaign lacks, and stops on a job that produced no image', async () => {
    engine = await seededEngine(undefined, undefined, undefined, RAVENFORD_RU_FIXTURES_DIR);
    contents = new InMemoryAssetContentStore();
    const mira = set.entries.find((entry) => entry.file === 'mira-vale.webp');
    const orin = set.entries.find((entry) => entry.file === 'orin-stonebeard.webp');
    if (!mira || !orin) throw new Error('the set lost a portrait');
    const partial: CuratedSet = {
      ...set,
      entries: [mira, { ...mira, file: 'nobody.webp', entityIds: ['nobody-here'] }],
    };
    expect(
      await importCuratedSet({ engine, contents, set: partial, logger }, 'ravenford', DM),
    ).toEqual({ imported: 1, present: 0, skipped: 1 });
    // A picture whose bytes cannot be read: every attempt fails and the import stops.
    const broken: CuratedSet = {
      ...set,
      entries: [orin],
      bytesOf: () => {
        throw new CuratedSetError('gone');
      },
    };
    await expect(
      importCuratedSet({ engine, contents, set: broken, logger }, 'ravenford', DM),
    ).rejects.toBeInstanceOf(CuratedImportError);
    const jobs = (await engine.load('ravenford'))?.state.assets.jobs;
    const base = 'ravenford.curated.orin-stonebeard.orin-stonebeard';
    for (const commandId of [base, `${base}.attempt-2`, `${base}.attempt-3`]) {
      expect(jobs?.get(`${commandId}#0`)).toMatchObject({
        status: 'FAILED',
        failure: 'UNAVAILABLE',
      });
    }
    expect(jobs?.has(`${base}.attempt-4#0`)).toBe(false);
  });

  it('never approves a picture another generator made for one of its requests', async () => {
    engine = await seededEngine(undefined, undefined, undefined, RAVENFORD_RU_FIXTURES_DIR);
    contents = new InMemoryAssetContentStore();
    const mira = set.entries.find((entry) => entry.file === 'mira-vale.webp');
    if (!mira) throw new Error('the set lost a portrait');
    // A server's worker raced the import: it ran the import's own request with the placeholder.
    const base = 'ravenford.curated.mira-vale.mira-vale';
    const raced = await engine.execute({
      commandId: base,
      campaignId: 'ravenford',
      actor: DM,
      reason: CURATED_REASON,
      command: {
        type: 'RequestAsset',
        entityId: 'mira-vale',
        variant: 'reference',
        audience: 'players',
      },
    });
    expect(raced.status).toBe('accepted');
    await new AssetWorker({
      engine,
      contents,
      generator: createPlaceholderImageGenerator(),
      timeoutMs: 5_000,
      logger,
    }).runOnce('ravenford', new Set([`${base}#0`]));

    const single: CuratedSet = { ...set, entries: [mira] };
    expect(
      await importCuratedSet({ engine, contents, set: single, logger }, 'ravenford', DM),
    ).toEqual({ imported: 1, present: 0, skipped: 0 });
    const { assets, canonical } = (await engine.load('ravenford'))?.state.assets ?? {};
    expect(assets?.get(`${base}#0~asset`)).toMatchObject({
      status: 'CANDIDATE',
      generator: { provider: 'local' },
    });
    expect(canonical?.get('mira-vale')).toBe(`${base}.attempt-2#0~asset`);
    expect(assets?.get(`${base}.attempt-2#0~asset`)).toMatchObject({
      generator: { provider: 'curated' },
      contentHash: `sha256:${mira.sha256}`,
    });
  });

  it('retries a failed job under the next derived ID, and a rerun walks the same IDs', async () => {
    engine = await seededEngine(undefined, undefined, undefined, RAVENFORD_RU_FIXTURES_DIR);
    contents = new InMemoryAssetContentStore();
    const orin = set.entries.find((entry) => entry.file === 'orin-stonebeard.webp');
    if (!orin) throw new Error('the set lost a portrait');
    let reads = 0;
    // The first read fails, as a storage hiccup would; the second works.
    const flaky: CuratedSet = {
      ...set,
      entries: [orin],
      bytesOf: (file) => {
        reads += 1;
        if (reads === 1) throw new CuratedSetError('hiccup');
        return set.bytesOf(file);
      },
    };
    const run = () => importCuratedSet({ engine, contents, set: flaky, logger }, 'ravenford', DM);
    expect(await run()).toEqual({ imported: 1, present: 0, skipped: 0 });
    const base = 'ravenford.curated.orin-stonebeard.orin-stonebeard';
    const state = (await engine.load('ravenford'))?.state;
    expect(state?.assets.jobs.get(`${base}#0`)?.status).toBe('FAILED');
    expect(state?.assets.assets.get(`${base}.attempt-2#0~asset`)?.status).toBe('CANONICAL');
    const version = state?.version;
    expect(await run()).toEqual({ imported: 0, present: 1, skipped: 0 });
    expect((await engine.load('ravenford'))?.state.version).toBe(version);
  });
});
