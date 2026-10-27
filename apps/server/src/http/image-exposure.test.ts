import { createPlaceholderImageGenerator } from '@ltw/ai';
import type {
  AssetLineageResponse,
  CommandResult,
  EntityAssetsResponse,
  EntityPresentationResponse,
  ScenePresentationResponse,
} from '@ltw/contracts';
import { worldTimeAt, type WorldEngine } from '@ltw/domain';
import type { FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';

import { InMemoryAssetContentStore } from '../assets/content-store.ts';
import { AssetWorker } from '../assets/worker.ts';
import { createLogger } from '../platform/logging/logger.ts';
import {
  TOKENS,
  get,
  post,
  ravenfordApp,
  seededEngine,
  testAiGateway,
  testAuthoring,
  withoutRequestId,
} from '../testing/ravenford-app.ts';

/**
 * Gate 06 image regressions over HTTP (ADR 0022 §5, ADR 0023 §3–4, amendments "Gate 06
 * remediation"). Elowen leaves the market square for Orin's Alchemy: she still knows Mira Vale but
 * no longer observes her.
 * - G06-images-01: a player is listed and served only the pictures presentation could choose for
 *   it (at `at`, or now): never a state picture of a state it does not see. Anything else is a 404
 *   identical to a hash that does not exist.
 * - G06-images-03: no player-facing view carries a version, which counted the DM's hidden pictures.
 * - Edges the review pinned: the party with `at`, a time before the entity existed, observed then
 *   but not now, a figure and a battle map of what is known but not observed, the DM previewing.
 */
const BASE = '/campaigns/ravenford';
const MIRA = 'mira-vale';
/** A place Elowen knows and does not see from the shop. */
const PLACE = 'north-gate';
const SHOP = 'orins-alchemy';
const NIGHT = worldTimeAt(1, 22);
const MORNING = worldTimeAt(2, 10);
const NOTHING = `sha256:${'0'.repeat(64)}`;
const ELOWEN_VIEW = 'CHARACTER:elowen-starwhisper';

let engine: WorldEngine;
let contents: InMemoryAssetContentStore;
let app: FastifyInstance;
let counter = 0;

const command = async (body: Record<string, unknown>, token: string = TOKENS.dm) => {
  counter += 1;
  const result = (
    await post(
      app,
      `${BASE}/commands`,
      { commandId: `exposure.${String(counter)}`, command: body },
      token,
    )
  ).json<CommandResult>();
  if (result.status !== 'accepted') throw new Error(`${String(body['type'])} not accepted`);
  return result.commandId;
};

/** Requests, one worker run and the approval of each; their content hashes, in order. */
async function approved(entityId: string, requests: readonly Record<string, unknown>[]) {
  const ids: string[] = [];
  for (const request of requests) {
    ids.push(`${await command({ type: 'RequestAsset', entityId, ...request })}#0~asset`);
  }
  await new AssetWorker({
    engine,
    contents,
    generator: createPlaceholderImageGenerator(),
    timeoutMs: 1_000,
    logger: createLogger({ service: 'exposure-test', level: 'silent' }),
  }).runOnce('ravenford');
  for (const assetId of ids) await command({ type: 'ApproveAsset', assetId });
  const lineage = (await get(app, `${BASE}/assets`, TOKENS.dm)).json<AssetLineageResponse>();
  return ids.map((id) => lineage.assets.find((asset) => asset.assetId === id)?.contentHash ?? '');
}

const query = (perspective: string, at?: number) =>
  `?perspective=${perspective}${at === undefined ? '' : `&at=${String(at)}`}`;
const listed = async (entityId: string, perspective = 'PLAYER', token: string = TOKENS.player) => {
  const response = await get(
    app,
    `${BASE}/entities/${entityId}/assets${query(perspective)}`,
    token,
  );
  expect(response.statusCode).toBe(200);
  return response.json<EntityAssetsResponse>().assets.map((asset) => asset.contentHash);
};
const content = (
  hash: string,
  at?: number,
  perspective = 'PLAYER',
  token: string = TOKENS.player,
) => get(app, `${BASE}/assets/content/${hash}${query(perspective, at)}`, token);
const presented = async (entityId: string, at?: number) =>
  (
    await get(app, `${BASE}/entities/${entityId}/presentation${query('PLAYER', at)}`, TOKENS.player)
  ).json<EntityPresentationResponse>().presentation;

/** A 404 exactly like the content of a hash that does not exist. */
async function expectNothing(hash: string, at?: number) {
  const missing = await content(NOTHING, at);
  expect(missing.statusCode).toBe(404);
  expect(withoutRequestId(await content(hash, at))).toEqual(withoutRequestId(missing));
}

beforeEach(async () => {
  engine = await seededEngine();
  contents = new InMemoryAssetContentStore();
  app = await ravenfordApp(engine, testAiGateway(), testAuthoring(), contents);
  await command(
    { type: 'EnterLocation', characterId: 'elowen-starwhisper', locationId: SHOP },
    TOKENS.player,
  );
});

describe('G06-images-01: a state picture of an entity a player does not observe in that state', () => {
  it('is neither listed nor served, while the DM lists and fetches it', async () => {
    const [reference = ''] = await approved(MIRA, [{ variant: 'reference' }]);
    const [dead = '', unconscious = ''] = await approved(MIRA, [
      { variant: 'derived', label: 'dead' },
      { variant: 'derived', label: 'unconscious' },
    ]);
    const mira = await presented(MIRA);
    expect(mira).toMatchObject({ observed: false, status: null });
    expect(mira.image?.contentHash).toBe(reference);

    expect(await listed(MIRA)).toEqual([reference]);
    expect(await listed(MIRA, 'PARTY')).toEqual([reference]);
    for (const hash of [dead, unconscious]) {
      await expectNothing(hash);
      await expectNothing(hash, worldTimeAt(1, 9));
    }
    expect((await content(reference)).statusCode).toBe(200);

    // The DM previewing Elowen follows her rules.
    expect(await listed(MIRA, ELOWEN_VIEW, TOKENS.dm)).toEqual([reference]);
    const previewed = await content(dead, undefined, ELOWEN_VIEW, TOKENS.dm);
    expect(previewed.statusCode).toBe(404);
    expect(await listed(MIRA, 'DM', TOKENS.dm)).toEqual([reference, dead, unconscious]);
    expect((await content(dead, undefined, 'DM', TOKENS.dm)).statusCode).toBe(200);
  });

  it('serves a variant while its state shows, and for a past time it showed, as presentation does', async () => {
    const [reference = ''] = await approved(SHOP, [{ variant: 'reference' }]);
    const [night = ''] = await approved(SHOP, [{ variant: 'derived', label: 'night' }]);
    // Day: only the reference.
    expect(await listed(SHOP)).toEqual([reference]);
    await expectNothing(night);

    await command({ type: 'AdvanceWorldTime', to: NIGHT });
    expect((await presented(SHOP)).image?.contentHash).toBe(night);
    expect(await listed(SHOP)).toEqual([reference, night]);
    expect((await content(night)).statusCode).toBe(200);

    await command({ type: 'AdvanceWorldTime', to: MORNING });
    expect(await listed(SHOP)).toEqual([reference]);
    await expectNothing(night);
    await expectNothing(night, MORNING);
    // A Chronicle page or a flashback of that night fetches the picture for that time.
    expect((await presented(SHOP, NIGHT)).image?.contentHash).toBe(night);
    expect((await content(night, NIGHT)).statusCode).toBe(200);
    const scene = (
      await get(app, `${BASE}/locations/${SHOP}/scene${query('PLAYER', NIGHT)}`, TOKENS.player)
    ).json<ScenePresentationResponse>();
    for (const entity of [scene.location, ...scene.present]) {
      for (const view of [entity.image, entity.figure, entity.battleMap]) {
        if (view) expect((await content(view.contentHash, NIGHT)).statusCode).toBe(200);
      }
    }
  });
});

describe('G06-images-03: what a player is shown of a picture', () => {
  it('carries no version, so the DM’s hidden pictures of the kind are not counted', async () => {
    await command({ type: 'AdvanceWorldTime', to: NIGHT });
    await command(
      { type: 'EnterLocation', characterId: 'elowen-starwhisper', locationId: 'market-square' },
      TOKENS.player,
    );
    await approved('market-square', [{ variant: 'reference' }]);
    const [first = ''] = await approved('market-square', [{ variant: 'derived', label: 'night' }]);
    // A DM-only night supersedes the players' night; then a new players' night.
    await approved('market-square', [{ variant: 'derived', label: 'night', audience: 'dm' }]);
    const [second = ''] = await approved('market-square', [{ variant: 'derived', label: 'night' }]);
    expect(second).not.toBe(first);

    const list = await get(
      app,
      `${BASE}/entities/market-square/assets${query('PLAYER')}`,
      TOKENS.player,
    );
    const presentation = await get(
      app,
      `${BASE}/entities/market-square/presentation${query('PLAYER')}`,
      TOKENS.player,
    );
    const scene = await get(
      app,
      `${BASE}/locations/market-square/scene${query('PLAYER')}`,
      TOKENS.player,
    );
    expect(list.json<EntityAssetsResponse>().assets.map((asset) => asset.contentHash)).toContain(
      second,
    );
    expect(presentation.json<EntityPresentationResponse>().presentation.image?.contentHash).toBe(
      second,
    );
    for (const response of [list, presentation, scene]) {
      expect(response.statusCode).toBe(200);
      expect(response.body).not.toContain('version');
    }
    // The DM's lineage keeps the versions.
    const lineage = (await get(app, `${BASE}/assets`, TOKENS.dm)).json<AssetLineageResponse>();
    expect(lineage.assets.find((asset) => asset.contentHash === second)?.version).toBe(3);
  });
});

describe('pinned edges of the rule (Gate 06 review)', () => {
  it('serves the party what it could see at a time, and nothing else then or now', async () => {
    await approved(SHOP, [{ variant: 'reference' }]);
    const [night = ''] = await approved(SHOP, [{ variant: 'derived', label: 'night' }]);
    await command({ type: 'AdvanceWorldTime', to: NIGHT });
    await command({ type: 'AdvanceWorldTime', to: MORNING });
    expect((await content(night, NIGHT, 'PARTY')).statusCode).toBe(200);
    for (const at of [MORNING, undefined]) {
      expect((await content(night, at, 'PARTY')).statusCode).toBe(404);
    }
  });

  it('serves what was observed then but is not now only for then, and nothing before it existed', async () => {
    await command({ type: 'AdvanceWorldTime', to: NIGHT });
    await command({
      type: 'CreateEntity',
      entityId: 'tomas-reed',
      kind: 'npc',
      name: 'Tomas Reed',
      existsSince: NIGHT,
      placement: { locationId: SHOP, since: NIGHT },
    });
    const [reference = ''] = await approved('tomas-reed', [{ variant: 'reference' }]);
    const [night = ''] = await approved('tomas-reed', [{ variant: 'derived', label: 'night' }]);
    expect((await presented('tomas-reed')).image?.contentHash).toBe(night);
    // Morning: Elowen goes back to the square; she never learned who stood in the shop.
    await command({ type: 'AdvanceWorldTime', to: MORNING });
    await command(
      { type: 'EnterLocation', characterId: 'elowen-starwhisper', locationId: 'market-square' },
      TOKENS.player,
    );
    const missingEntity = await get(
      app,
      `${BASE}/entities/no-such-entity/assets${query('PLAYER')}`,
      TOKENS.player,
    );
    const tomas = await get(
      app,
      `${BASE}/entities/tomas-reed/assets${query('PLAYER')}`,
      TOKENS.player,
    );
    expect(withoutRequestId(tomas)).toEqual(withoutRequestId(missingEntity));
    for (const hash of [reference, night]) {
      await expectNothing(hash);
      await expectNothing(hash, MORNING);
      // Before Tomas existed, Elowen stood in that same shop.
      await expectNothing(hash, worldTimeAt(1, 12));
    }
    expect((await presented('tomas-reed', NIGHT)).image?.contentHash).toBe(night);
    expect((await content(night, NIGHT)).statusCode).toBe(200);
    expect((await content(reference, NIGHT)).statusCode).toBe(200);
  });

  it('lists and serves the figure and the battle map of what a player knows but does not observe', async () => {
    await approved(MIRA, [{ variant: 'reference' }]);
    const [figure = ''] = await approved(MIRA, [
      { variant: 'derived', label: 'figure', purpose: 'figure' },
    ]);
    await approved(PLACE, [{ variant: 'reference' }]);
    const [map = ''] = await approved(PLACE, [
      { variant: 'derived', label: 'map', purpose: 'battle-map' },
    ]);
    const mira = await presented(MIRA);
    expect(mira.observed).toBe(false);
    expect(mira.figure?.contentHash).toBe(figure);
    const place = await presented(PLACE);
    expect(place.observed).toBe(false);
    expect(place.battleMap?.contentHash).toBe(map);
    expect(await listed(MIRA)).toContain(figure);
    expect(await listed(PLACE)).toContain(map);
    for (const hash of [figure, map]) expect((await content(hash)).statusCode).toBe(200);
  });
});
