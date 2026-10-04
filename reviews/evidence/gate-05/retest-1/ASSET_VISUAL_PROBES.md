# Asset isolation, historical scenes and external-work undo

Two isolated PostgreSQL worlds use real event/content/proposal stores and the production asset worker with a local placeholder generator. The first exercises candidate versus approved content, canonical references and derived variants, DM-only content, hidden and perceived-but-unknown entities, safe metadata, content headers, weather and indoor presentation, historical content access, and Day 1 reconstruction after Day 60. A greatsword-labelled image never grants equipment. Stored bytes, lineage and historical views agree after restart.

The second pauses generation after the worker records its start. Authoring undo must be refused. The DM cancels the job and undoes the authoring; the late image is retained as DISCARDED and cannot be approved or served to players. The job copy and lineage survive restart. Both worlds verify replay, structural integrity and re-decision of effective commands. Creates/removes two owned databases; only the worker acts as the trusted system persona.

Run from the repository root with Node 24+, installed workspace dependencies and PostgreSQL:

````sh
sed -n '/^```javascript$/,/^```$/p' reviews/evidence/gate-05/retest-1/ASSET_VISUAL_PROBES.md | sed '1d;$d' | node --conditions=@ltw/source --input-type=module
````

```javascript
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createPlaceholderImageGenerator } from './packages/ai/src/placeholder-images.ts';
import {
  seededEngine,
  ravenfordApp,
  plantNpcBoundary,
  testAiGateway,
  testAuthoring,
  TOKENS,
  post,
  get,
  withoutRequestId,
  ASHEN_CIRCLE_ID,
} from './apps/server/src/testing/ravenford-app.ts';
import { createThrowawayDatabase } from './apps/server/src/testing/throwaway-database.ts';
import { PostgresEventStore } from './apps/server/src/world-engine/postgres-event-store.ts';
import { PostgresAssetContentStore } from './apps/server/src/assets/postgres-content-store.ts';
import { PostgresProposalStore } from './apps/server/src/authoring/postgres-proposal-store.ts';
import { AssetWorker } from './apps/server/src/assets/worker.ts';
import { createLogger } from './apps/server/src/platform/logging/logger.ts';
import {
  WorldEngine,
  SequentialIds,
  SteppingClock,
  replay,
  checkWorldIntegrity,
  redecideEffective,
} from './packages/domain/src/index.ts';
import { createCombatEngine } from './packages/combat/src/engine.ts';
const require = createRequire(new URL('./apps/server/package.json', `file://${process.cwd()}/`));
const { Pool } = require('pg');
const base = '/campaigns/ravenford';
const out = {};
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
};
async function world(work) {
  const db = await createThrowawayDatabase({ migrate: true });
  const pool = new Pool({ connectionString: db.url });
  const locks = new Pool({ connectionString: db.url, max: 4 });
  let app;
  try {
    const store = new PostgresEventStore(pool),
      contents = new PostgresAssetContentStore(pool),
      proposals = new PostgresProposalStore(pool, locks);
    let engine = await seededEngine(store);
    await plantNpcBoundary(engine);
    let n = 0;
    const ai = testAiGateway();
    const open = () => ravenfordApp(engine, ai, { ...testAuthoring(), proposals }, contents);
    app = await open();
    const w = {
      snapshot: () => engine.load('ravenford'),
      read: (path, token = TOKENS.player) => get(app, base + path, token),
      request: (path, body, token = TOKENS.dm) => post(app, base + path, body, token),
      cmd: async (command, token = TOKENS.dm, expected = 200) => {
        const r = await post(
          app,
          base + '/commands',
          { commandId: `g05-assets-${++n}`, command },
          token,
        );
        assert.equal(r.statusCode, expected, r.body);
        return r.json();
      },
      run: (generator) =>
        new AssetWorker({
          engine,
          contents,
          generator: generator ?? createPlaceholderImageGenerator(),
          timeoutMs: 1000,
          logger: createLogger({ service: 'gate05-review', level: 'silent' }),
        }).runOnce('ravenford'),
      restart: async () => {
        await app.close();
        engine = new WorldEngine({
          store: new PostgresEventStore(pool),
          ids: new SequentialIds(990),
          clock: new SteppingClock(),
          combat: createCombatEngine(),
        });
        app = await open();
      },
      verify: async () => {
        const snap = await engine.load('ravenford');
        assert.deepEqual(replay(snap.history), snap.state);
        assert.deepEqual(checkWorldIntegrity(snap.state), []);
        assert.equal(
          redecideEffective(
            await store.loadCommands('ravenford'),
            snap,
            () => 0,
            createCombatEngine(),
          ),
          null,
        );
      },
    };
    await work(w);
  } finally {
    if (app) await app.close();
    await Promise.all([pool.end(), locks.end()]);
    await db.drop();
  }
}
await world(async (w) => {
  const asset = async (entityId, extra = {}) => {
    const requested = await w.cmd({
      type: 'RequestAsset',
      entityId,
      variant: 'reference',
      ...extra,
    });
    assert.equal(requested.status, 'accepted');
    await w.run();
    const assetId = `${requested.commandId}#0~asset`;
    const candidate = (await w.snapshot()).state.assets.assets.get(assetId);
    assert.equal(candidate.status, 'CANDIDATE');
    const pre = await w.read(`/assets/content/${candidate.contentHash}?perspective=PLAYER`);
    assert.equal(pre.statusCode, 404);
    const approved = await w.cmd({ type: 'ApproveAsset', assetId });
    assert.equal(approved.status, 'accepted');
    return (await w.snapshot()).state.assets.assets.get(assetId);
  };
  const watcher = await asset('nb-hooded-watcher');
  const mira = await asset('mira-vale');
  const hidden = await asset(ASHEN_CIRCLE_ID);
  const rain = await asset('mira-vale', {
    variant: 'derived',
    label: 'day-rain',
    note: 'G05_DM_ONLY_DIRECTION',
  });
  const dm = await asset('mira-vale', {
    variant: 'derived',
    label: 'day',
    audience: 'dm',
    note: 'G05_DM_ONLY_VARIANT',
  });
  const equipment = await asset('mira-vale', { variant: 'derived', label: 'greatsword' });
  assert.equal((await w.snapshot()).state.assets.canonical.get('mira-vale'), mira.assetId);
  const playerAssets = (await w.read('/entities/mira-vale/assets?perspective=PLAYER')).json();
  for (const a of playerAssets.assets)
    assert.deepEqual(Object.keys(a).sort(), ['contentHash', 'mediaType', 'variant', 'version']);
  assert.ok(!JSON.stringify(playerAssets).includes(dm.contentHash));
  assert.ok(!JSON.stringify(playerAssets).includes('G05_DM_ONLY'));
  for (const path of [
    `/entities/${ASHEN_CIRCLE_ID}/assets?perspective=PLAYER`,
    `/entities/nb-hooded-watcher/assets?perspective=PLAYER`,
  ])
    assert.deepEqual(
      withoutRequestId(await w.read(path)),
      withoutRequestId(await w.read('/entities/missing-thing/assets?perspective=PLAYER')),
    );
  for (const hash of [hidden.contentHash, dm.contentHash])
    assert.equal((await w.read(`/assets/content/${hash}?perspective=PLAYER`)).statusCode, 404);
  const image = await w.read(`/assets/content/${mira.contentHash}?perspective=PLAYER`);
  assert.equal(image.statusCode, 200);
  assert.equal(image.headers['x-content-type-options'], 'nosniff');
  assert.equal(image.headers['cache-control'], 'no-store');
  assert.ok(image.headers['content-security-policy'].includes('sandbox'));
  assert.ok(!image.body.includes('Mira'));
  const day1 = (await w.snapshot()).state.clock;
  await w.cmd({ type: 'SetWeather', locationId: 'ravenford', weather: 'clear' });
  const first = (
    await w.read(`/locations/market-square/scene?perspective=PLAYER&at=${day1}`)
  ).json();
  assert.equal(first.location.weather, 'clear');
  await w.cmd({ type: 'AdvanceWorldTime', by: 86400 });
  await w.cmd({ type: 'SetWeather', locationId: 'ravenford', weather: 'rain' });
  const day2 = (await w.snapshot()).state.clock;
  const second = (await w.read('/entities/mira-vale/presentation?perspective=PLAYER')).json();
  assert.equal(second.presentation.image.contentHash, rain.contentHash);
  assert.ok(!second.presentation.equipment.includes('greatsword'));
  await w.cmd({ type: 'AdvanceWorldTime', by: 3600 });
  const seen = (await w.snapshot()).state.clock;
  await w.cmd(
    { type: 'EnterLocation', characterId: 'elowen-starwhisper', locationId: 'orins-alchemy' },
    TOKENS.player,
  );
  const inRoom = (
    await w.read('/entities/nb-hooded-watcher/presentation?perspective=PLAYER')
  ).json();
  assert.equal(inRoom.presentation.weather, null);
  assert.equal(inRoom.presentation.image.contentHash, watcher.contentHash);
  assert.ok(!JSON.stringify(inRoom).includes('NBXHIDDENNAME'));
  await w.cmd({ type: 'AdvanceWorldTime', by: 3600 });
  await w.cmd(
    { type: 'EnterLocation', characterId: 'elowen-starwhisper', locationId: 'market-square' },
    TOKENS.player,
  );
  assert.equal(
    (await w.read('/entities/nb-hooded-watcher/presentation?perspective=PLAYER')).statusCode,
    404,
  );
  const past = await w.read(`/assets/content/${watcher.contentHash}?perspective=PLAYER&at=${seen}`);
  assert.equal(past.statusCode, 200);
  assert.equal(
    (await w.read(`/assets/content/${watcher.contentHash}?perspective=PLAYER&at=${day1}`))
      .statusCode,
    404,
  );
  await w.cmd({ type: 'AdvanceWorldTime', to: 59 * 86400 + 36000 });
  assert.deepEqual(
    (await w.read(`/locations/market-square/scene?perspective=PLAYER&at=${day1}`)).json(),
    first,
  );
  for (const [perspective, status, token] of [
    ['DM', 403, TOKENS.player],
    ['PLAYER', 404, TOKENS.outsider],
    ['no-such-scope', 400, TOKENS.player],
  ])
    assert.equal(
      (await w.read(`/entities/mira-vale/presentation?perspective=${perspective}`, token))
        .statusCode,
      status,
    );
  assert.equal(
    (await w.read('/entities/mira-vale/presentation?perspective=PLAYER&at=999999999')).statusCode,
    400,
  );
  assert.equal((await w.read('/assets', TOKENS.player)).statusCode, 403);
  await w.cmd({ type: 'StartAssetJob', requestId: 'missing#0' }, TOKENS.dm, 403);
  await w.cmd(
    { type: 'RequestAsset', entityId: 'mira-vale', variant: 'reference' },
    TOKENS.player,
    403,
  );
  const viewBefore = (await w.read('/assets', TOKENS.dm)).json();
  await w.restart();
  assert.deepEqual((await w.read('/assets', TOKENS.dm)).json(), viewBefore);
  assert.deepEqual(
    (await w.read(`/locations/market-square/scene?perspective=PLAYER&at=${day1}`)).json(),
    first,
  );
  assert.equal(
    (await w.read(`/assets/content/${mira.contentHash}?perspective=PLAYER`)).body,
    image.body,
  );
  await w.verify();
  out.visual = {
    day1,
    day2,
    seen,
    day60HistoryEqual: true,
    day2Presentation: second,
    unknownObserved: inRoom,
    safeMetadata: playerAssets,
    pastContentAvailableOnlyWhenSeen: true,
    restartEqual: true,
    permissionsAndHeaders: true,
  };
});
await world(async (w) => {
  const created = await w.request('/authoring/proposals', {
    summary: 'Temporary authoring NPC',
    commands: [
      {
        type: 'CreateEntity',
        entityId: 'g05-pending-npc',
        kind: 'npc',
        name: 'Temporary witness',
        existsSince: null,
        placement: { locationId: 'north-gate', since: null },
      },
    ],
  });
  assert.equal(created.statusCode, 201);
  const draft = created.json(),
    path = `/authoring/proposals/${draft.proposal.proposalId}`;
  const commit = await w.request(path + '/commit', {
    revision: 1,
    confirmation: draft.preview.confirmation,
  });
  assert.equal(commit.statusCode, 200);
  const requestId = `${commit.json().commandId}#0`;
  assert.ok((await w.snapshot()).state.assets.requests.has(requestId));
  const entered = deferred(),
    release = deferred(),
    real = createPlaceholderImageGenerator();
  const slow = {
    id: 'review-slow',
    generate: async (brief, signal) => {
      entered.resolve();
      await release.promise;
      return real.generate(brief, signal);
    },
  };
  const running = w.run(slow);
  await entered.promise;
  const blocked = await w.request(path + '/undo', {});
  assert.equal(blocked.statusCode, 422, blocked.body);
  assert.equal(blocked.json().code, 'UNDO_UNSAFE');
  const cancel = await w.cmd({ type: 'CancelAssetRequest', requestId });
  assert.equal(cancel.status, 'accepted');
  const undone = await w.request(path + '/undo', {});
  assert.equal(undone.statusCode, 200, undone.body);
  release.resolve();
  const settled = await running;
  const snap = await w.snapshot();
  assert.equal(snap.state.entities.has('g05-pending-npc'), false);
  const discarded = snap.state.assets.assets.get(requestId + '~asset');
  assert.equal(discarded.status, 'DISCARDED');
  await w.cmd({ type: 'ApproveAsset', assetId: discarded.assetId }, TOKENS.dm, 422);
  assert.equal(
    (await w.read(`/assets/content/${discarded.contentHash}?perspective=PLAYER`)).statusCode,
    404,
  );
  const lineage = (await w.read('/assets', TOKENS.dm)).json();
  assert.ok(lineage.requests.some((r) => r.requestId === requestId));
  await w.restart();
  assert.deepEqual((await w.read('/assets', TOKENS.dm)).json(), lineage);
  await w.verify();
  out.externalUndo = {
    requestId,
    blocked: blocked.json(),
    settled,
    discarded,
    entityRemoved: true,
    lineageSurvivesRestart: true,
    lateImageNotApprovable: true,
  };
});
await writeFile(
  'reviews/evidence/gate-05/retest-1/asset-visual-results.json',
  JSON.stringify(out, null, 2) + '\n',
);
console.log(JSON.stringify({ worlds: 2, allAssertionsPassed: true }));
```
