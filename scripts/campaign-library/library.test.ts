import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { campaignPackageSchema, type CampaignPackage } from '../../packages/contracts/src/index.ts';
import { createCombatEngine } from '../../packages/combat/src/index.ts';
import {
  SequentialIds,
  SteppingClock,
  WorldEngine,
  worldMapView,
} from '../../packages/domain/src/index.ts';
import { PublishedEventStore } from '../../apps/server/src/campaigns/published-event-store.ts';
import { loadCampaignLibrary } from '../../apps/server/src/campaigns/library.ts';
import { createLogger } from '../../apps/server/src/platform/logging/logger.ts';
import {
  acceptedActivation,
  activationMemoryFixture,
  activationRequest,
} from '../../apps/server/src/testing/activation-fixture.ts';
import { loadCampaignActivationReview } from '../../apps/server/src/workshop/activation/review.ts';
import { CampaignActivationWorker } from '../../apps/server/src/workshop/activation/worker.ts';
import { LIBRARY_ROOT, bookJson, libraryJson } from './build.ts';
import { LIBRARY, libraryCampaign } from './catalog.ts';

const library = await loadCampaignLibrary();

/** A package saved into a draft and activated in memory, the library's pictures wired in. */
async function activate(content: CampaignPackage) {
  const f = await activationMemoryFixture();
  const scope = { ownerId: f.scope.ownerId, draftId: randomUUID() };
  await f.deps.store.createDraft(
    scope.ownerId,
    { requestId: randomUUID(), title: content.world.name, language: 'ru' },
    scope.draftId,
    new Date(f.now()).toISOString(),
  );
  const saved = await f.revisions.append({
    ...scope,
    requestId: randomUUID(),
    basedOnRevision: 0,
    content,
    source: { kind: 'OWNER', actorId: f.ownerId },
    createdAt: new Date(f.now()).toISOString(),
  });
  if (saved.kind !== 'saved') throw new Error(`revision: ${saved.kind}`);
  const reviewed = await loadCampaignActivationReview(f.deps, scope, { textOnly: true });
  if (!reviewed?.frozen) throw new Error('activation review missing');
  const activation = await acceptedActivation(f.repository, {
    ...scope,
    authSessionId: f.authSessionId,
    request: activationRequest(reviewed.review),
    frozen: reviewed.frozen,
  });
  const worker = new CampaignActivationWorker({
    repository: f.repository,
    bootstrap: f.bootstrap,
    initialContent: f.content,
    contents: f.contents,
    draftImages: f.images,
    libraryPictures: {
      library,
      logger: createLogger({ service: 'library-test', level: 'silent' }),
    },
  });
  await worker.run({ ...scope, activationId: activation.activationId });
  await worker.shutdown();
  const engine = new WorldEngine({
    store: new PublishedEventStore(f.rawStore, f.publication),
    ids: new SequentialIds(0x9900),
    clock: new SteppingClock(),
    combat: createCombatEngine(),
    entropy: { next: () => 2 ** 31 },
  });
  const state = (await engine.load(activation.campaignId))?.state;
  if (!state?.campaign) throw new Error('campaign not published');
  return { state, revision: saved.revision };
}

describe('campaign library', () => {
  it('ships exactly what the campaigns build now', async () => {
    for (const source of LIBRARY) {
      const c = await libraryCampaign(source);
      const stored: unknown = JSON.parse(
        await readFile(new URL(`${source.id}/library.json`, LIBRARY_ROOT), 'utf8'),
      );
      expect(stored, source.id).toEqual(JSON.parse(JSON.stringify(libraryJson(c))));
      for (const variant of c.variants)
        expect(
          await readFile(new URL(`${source.id}/packages/${variant.id}.json`, LIBRARY_ROOT), 'utf8'),
          `${source.id}/${variant.id}`,
        ).toBe(JSON.stringify(variant.content));
      expect(
        await readFile(new URL(`${source.id}/book.json`, LIBRARY_ROOT), 'utf8'),
        `${source.id}/book`,
      ).toBe(bookJson(c));
    }
    expect(library.entries.map((e) => e.id)).toEqual(LIBRARY.map((s) => s.id));
    // Fifty-three campaigns, each built with every variant: seconds alone, more beside the suite.
  }, 120_000);

  it.each(LIBRARY.map((s) => s.id))(
    '%s: a started campaign gets its pictures, figures, battle maps and world map once',
    async (id) => {
      const entry = library.entries.find((e) => e.id === id);
      if (!entry) throw new Error(`${id}: not in the library`);
      const text = library.packageJson(id, entry.defaultVariant);
      if (!text) throw new Error(`${id}: no default package`);
      const content = campaignPackageSchema.parse(JSON.parse(text));
      const { state, revision } = await activate(content);
      const found = library.picturesFor(revision);
      if (!found) throw new Error(`${id}: the saved revision is not recognised`);
      const shown = [...state.assets.assets.values()].filter((a) => a.status !== 'DISCARDED');
      const bindings = found.set.entries.reduce((n, e) => n + e.entityIds.length, 0);
      expect(shown.filter((a) => a.generator.provider === 'curated')).toHaveLength(bindings);
      expect(shown.every((a) => a.status === 'CANONICAL' || a.status === 'APPROVED')).toBe(true);
      // Every place a prepared fight happens has its battle map; every foe its figure.
      const fightPlaces = new Set(
        content.encounters.flatMap((e) => revision.identities.entities[e.location] ?? []),
      );
      const mapped = new Set(
        shown.filter((a) => a.purpose === 'battle-map').map((a) => a.entityId),
      );
      expect(mapped).toEqual(fightPlaces);
      const foes = content.encounters.flatMap((e) =>
        e.combatants
          .filter((c) => c.side === 'hostile')
          .flatMap((c) => revision.identities.entities[c.entity] ?? []),
      );
      const figured = new Set(shown.filter((a) => a.purpose === 'figure').map((a) => a.entityId));
      for (const foe of foes) expect(figured.has(foe), `${id}: a foe without a figure`).toBe(true);
      const cast = content.entities.filter(
        (e) => e.kind === 'npc' || content.party.includes(e.key),
      );
      for (const { key: hero } of cast) {
        const entityId = revision.identities.entities[hero];
        expect(figured.has(entityId ?? ''), id + ': missing cast figure ' + hero).toBe(true);
        expect(
          shown.some(
            (a) => a.entityId === entityId && a.purpose === 'image' && a.variant === 'reference',
          ),
        ).toBe(true);
      }
      // The world map (ADR 0057 §10): the DM sees its picture with every place but the region
      // pinned on it, and routes that join every pinned place, each end pinned.
      const mapId = revision.identities.entities['world-map'] ?? '';
      expect(
        shown.some((a) => a.entityId === mapId && a.purpose === 'image'),
        `${id}: the map's picture`,
      ).toBe(true);
      const view = worldMapView(state, { kind: 'DM', label: 'DM', holderId: null, scopes: 'ALL' });
      expect(view.regions.map((r) => r.region.entityId)).toEqual([mapId]);
      const pinned = new Set(view.regions[0]?.pins.map((pin) => pin.place.entityId));
      const places = content.entities.filter(
        (e) => e.kind === 'location' && e.location?.parent !== null && e.key !== 'world-map',
      );
      for (const place of places)
        expect(pinned.has(revision.identities.entities[place.key] ?? ''), place.key).toBe(true);
      // Schematic plans have pins without measured overland travel.
      const source = LIBRARY.find((s) => s.id === id);
      const root = new URL(
        '../../campaigns/' + (source?.series ? source.series + '/' : '') + id + '/',
        import.meta.url,
      );
      const plan = JSON.parse(await readFile(new URL('source/world-map.json', root), 'utf8')) as {
        scale?: string;
      };
      if (id === 'hollow-choir' || plan.scale === 'schematic') {
        expect(view.routes).toEqual([]);
        return;
      }
      expect(view.routes.length, `${id}: routes`).toBeGreaterThan(0);
      const joined = new Set<string>();
      for (const route of view.routes) {
        expect(pinned.has(route.from.entityId) && pinned.has(route.to.entityId)).toBe(true);
        joined.add(route.from.entityId).add(route.to.entityId);
      }
      expect(joined, `${id}: a pinned place no route reaches`).toEqual(pinned);
    },
    120_000,
  );

  it('recognises only an unedited library package', async () => {
    const entry = library.entries[0];
    if (!entry) throw new Error('empty library');
    const content = campaignPackageSchema.parse(
      JSON.parse(library.packageJson(entry.id, entry.defaultVariant) ?? ''),
    );
    const edited = { ...content, world: { ...content.world, name: `${content.world.name}!` } };
    const { state, revision } = await activate(edited);
    expect(library.picturesFor(revision)).toBeNull();
    expect(
      [...state.assets.assets.values()].filter((a) => a.generator.provider === 'curated'),
    ).toHaveLength(0);
  }, 120_000);
});
