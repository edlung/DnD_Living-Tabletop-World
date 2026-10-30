import { createHash } from 'node:crypto';

import type { CampaignPackage } from '@ltw/contracts';

import { contentHashOf } from '../assets/content-store.ts';
import { loadCuratedSet, type CuratedEntry } from '../images/curated-set.ts';
import type { DraftImageRuntime } from '../images/draft-runtime-types.ts';
import { subjectGroup } from '../images/style.ts';
import { createLogger } from '../platform/logging/logger.ts';
import { DraftImageWorker } from '../workshop/images/worker.ts';
import { startDraftImageLoop } from '../workshop/images/worker-loop.ts';
import { MemoryDraftImageRepository } from './draft-image-store.ts';
import { ScriptedDraftImageRuntime } from './draft-image-runtime.ts';
import type { MemoryCampaignRevisionRepository } from './campaign-packages.ts';
import type { MemoryWorkshopStore } from './workshop-store.ts';
import { WORKSHOP_FIXTURES, workshopOwnerId, workshopDraftId } from './ui-workshop-links.ts';

export const WORKSHOP_IMAGE_FIXTURE_PROVIDER = 'browser-image-fixture';
export const WORKSHOP_IMAGE_FIXTURE_MODEL = 'curated-raster-fixture-1';
const PEOPLE = new Set([
  'elowen-starwhisper.webp',
  'mira-vale.webp',
  'orin-stonebeard.webp',
  'captain-thorne.webp',
  'goblin-raider.webp',
  'goblin-shaman.webp',
]);
const PLACES = new Set([
  'ravenford.webp',
  'market-square.webp',
  'golden-stag-inn.webp',
  'orins-alchemy.webp',
  'merchant-guild.webp',
  'north-gate.webp',
  'old-trade-road.webp',
  'abandoned-caravan-site.webp',
]);
const baseOf = (entry: CuratedEntry) => entry.derivedFrom ?? entry.file;
const groupOf = (entry: CuratedEntry) =>
  PEOPLE.has(baseOf(entry)) ? 'person' : PLACES.has(baseOf(entry)) ? 'place' : 'object';

/** Rich permitted briefs for browser coverage only; no production seed/fallback imports this. */
export function completePreviewVisualBriefs(content: CampaignPackage): void {
  const ru = content.world.language === 'ru';
  for (const entity of content.entities) {
    let image = content.visuals.find(
      (item) => item.entity === entity.key && item.purpose === 'image',
    );
    if (!image) {
      const group = subjectGroup(entity.kind);
      image = {
        entity: entity.key,
        purpose: 'image',
        description:
          group === 'person'
            ? ru
              ? 'Тёплая дорожная одежда, естественный портрет при зимнем свете.'
              : 'Warm travelling clothes, a natural portrait in winter light.'
            : group === 'place'
              ? ru
                ? 'Северное поселение, дерево, камень и мягкий зимний свет.'
                : 'A northern settlement, timber, stone and soft winter light.'
              : ru
                ? 'Предмет в северном поселении при мягком боковом свете.'
                : 'An object in a northern settlement under soft side light.',
        style: ru
          ? 'Единая живописная фэнтези-палитра.'
          : 'A consistent painterly fantasy palette.',
      };
      content.visuals.push(image);
    }
    if (
      ['character', 'npc', 'creature'].includes(entity.kind) &&
      !content.visuals.some((item) => item.entity === entity.key && item.purpose === 'figure')
    )
      content.visuals.push({ ...image, purpose: 'figure' });
  }
}

function pause(signal: AbortSignal, duration: number): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, duration);
    signal.addEventListener('abort', finish, { once: true });
  });
}

/** Explicit browser fixture port: existing curated raster files, no provider request or generated SVG. */
export async function seedWorkshopImages(
  store: MemoryWorkshopStore,
  revisions: MemoryCampaignRevisionRepository,
  seed: string,
) {
  const repository = new MemoryDraftImageRepository(store, revisions);
  const set = await loadCuratedSet();
  const first = set.entries[0];
  if (!first) throw new Error('BROWSER_IMAGE_FIXTURE_EMPTY');
  const script = new ScriptedDraftImageRuntime(repository, set.bytesOf(first.file));
  script.provider = WORKSHOP_IMAGE_FIXTURE_PROVIDER;
  script.model = WORKSHOP_IMAGE_FIXTURE_MODEL;
  const allowedNames = WORKSHOP_FIXTURES.filter(
    (name) => name.startsWith('preview-') && name !== 'preview-unavailable',
  );
  const owners = new Set(allowedNames.map((name) => workshopOwnerId(seed, name)));
  const drafts = new Set(allowedNames.map((name) => workshopDraftId(seed, name)));
  const slow = new Set(
    ['preview-images', 'preview-revoked'].map((name) =>
      workshopOwnerId(seed, name as 'preview-images' | 'preview-revoked'),
    ),
  );
  const used = new Set<string>();
  const sources = new Map<string, CuratedEntry>();
  script.beforeGate = (lease, call) => pause(call.signal, slow.has(lease.ownerId) ? 500 : 150);
  const runtime: DraftImageRuntime = {
    availability: (ownerId) =>
      owners.has(ownerId)
        ? script.availability(ownerId)
        : Promise.resolve({ available: false, provider: null, model: null, reason: 'NO_ROUTE' }),
    prepare: (input) =>
      drafts.has(input.revision.draftId)
        ? script.prepare(input)
        : Promise.resolve({ status: 'UNAVAILABLE', reason: 'NO_ROUTE' }),
    forJob: async (lease) => {
      if (!owners.has(lease.ownerId)) return null;
      const runner = await script.forJob(lease);
      if (!runner) return null;
      return {
        ...runner,
        run: async (call) => {
          const result = await runner.run(call);
          if (result.status !== 'GENERATED') return result;
          const group = subjectGroup(call.input.subject.kind);
          const pool = set.entries.filter(
            (entry) => entry.purpose === call.input.purpose && groupOf(entry) === group,
          );
          const reference = call.input.reference && sources.get(call.input.reference.contentHash);
          const preferred = reference
            ? pool.filter((entry) => baseOf(entry) === baseOf(reference))
            : pool;
          const hash = createHash('sha256')
            .update(`${lease.jobId}/${call.input.subject.localKey}`)
            .digest()
            .readUInt32BE(0);
          const choose = (entries: readonly CuratedEntry[]) =>
            entries
              .map((_, index) => entries[(hash + index) % entries.length])
              .find((entry) => entry && !used.has(entry.sha256));
          const entry = choose(preferred) ?? choose(pool);
          if (!entry) throw new Error('BROWSER_IMAGE_FIXTURE_POOL_EXHAUSTED');
          used.add(entry.sha256);
          const bytes = set.bytesOf(entry.file);
          sources.set(contentHashOf(bytes), entry);
          return { ...result, bytes, mediaType: 'image/webp' };
        },
      };
    },
  };
  const images = { repository, runtime };
  const worker = new DraftImageWorker(images);
  const stopImages = startDraftImageLoop(
    repository,
    worker,
    createLogger({ service: 'ui-workshop-images-fixture', level: 'silent' }),
  );
  return {
    images,
    cancelImage: (jobId: string) => {
      worker.cancel(jobId);
    },
    stopImages,
  };
}
