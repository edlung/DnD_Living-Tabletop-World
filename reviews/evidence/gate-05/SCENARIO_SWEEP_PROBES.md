# Integrated Ravenford and an independent undo sweep

Plays the supplied Ravenford scenario driver against the real HTTP application and PostgreSQL stores, independently asserts the forbidden-marker scan, canonical replay/integrity/re-decision, and compares five player views after a fresh engine/application reload.

Then copies the recorded command batches through the public in-memory EventStore port, separately for every effective undoable command, and attempts each undo independently. Every resulting history is replayed, checked structurally and re-decided with the real rules modifier and combat port. The output lists all 164 attempts (40 accepted, 124 refused); the verified run has no divergence. These are current integrated-story cases, distinct from the deliberately adversarial Chronicle rename schedules in HISTORY_BOUNDARY_PROBES.md.

Creates/removes one owned PostgreSQL database. Reuses the repository's scenario driver as input; assertions and the full command-by-command undo sweep are reviewer-owned. All writes in the sweep use WorldEngine.execute; no stored event is edited.

Run from the repository root with Node 24+, installed workspace dependencies and PostgreSQL:

````sh
sed -n '/^```javascript$/,/^```$/p' reviews/evidence/gate-05/SCENARIO_SWEEP_PROBES.md | sed '1d;$d' | node --conditions=@ltw/source --input-type=module
````

```javascript
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { RavenfordSession } from './apps/server/src/testing/scenario/session.ts';
import { playDayOne } from './apps/server/src/testing/scenario/play-day-one.ts';
import { playRoad } from './apps/server/src/testing/scenario/play-road.ts';
import { NEVER_FOR_PLAYERS } from './apps/server/src/testing/scenario/secrets.ts';
import { createThrowawayDatabase } from './apps/server/src/testing/throwaway-database.ts';
import { PostgresEventStore } from './apps/server/src/world-engine/postgres-event-store.ts';
import { PostgresAssetContentStore } from './apps/server/src/assets/postgres-content-store.ts';
import {
  WorldEngine,
  InMemoryEventStore,
  SequentialIds,
  SteppingClock,
  checkWorldIntegrity,
  replay,
  redecideEffective,
} from './packages/domain/src/index.ts';
import { createCombatEngine } from './packages/combat/src/engine.ts';
import { skillModifier } from './packages/rules/src/index.ts';
import {
  ravenfordApp,
  testAiGateway,
  testAuthoring,
  TOKENS,
  get,
  MIDDLE_ENTROPY,
} from './apps/server/src/testing/ravenford-app.ts';
const require = createRequire(new URL('./apps/server/package.json', `file://${process.cwd()}/`));
const { Pool } = require('pg');
const db = await createThrowawayDatabase({ migrate: true });
const pool = new Pool({ connectionString: db.url });
let session, app;
const out = { sweep: [] };
try {
  const store = new PostgresEventStore(pool),
    contents = new PostgresAssetContentStore(pool);
  session = await RavenfordSession.open({ store, contents });
  await playDayOne(session);
  const road = await playRoad(session);
  assert.equal(road.chapter.result.status, 'accepted');
  for (const body of session.seenBy('player'))
    for (const marker of NEVER_FOR_PLAYERS) assert.ok(!body.includes(marker), marker);
  const snap = await session.snapshot(),
    log = await store.loadCommands('ravenford');
  assert.deepEqual(replay(snap.history), snap.state);
  assert.deepEqual(checkWorldIntegrity(snap.state), []);
  assert.equal(redecideEffective(log, snap, skillModifier, createCombatEngine()), null);
  const paths = [
    '/quests?perspective=PARTY',
    '/chronicle?perspective=PARTY',
    '/knowledge?perspective=PARTY',
    '/locations/market-square/scene?perspective=PLAYER&at=40000',
    '/entities/tomas-reed/presentation?perspective=PLAYER',
  ];
  const before = [];
  for (const path of paths)
    before.push((await session.get('player', '/campaigns/ravenford' + path)).json());
  await session.close();
  session = null;
  const engine = new WorldEngine({
    store: new PostgresEventStore(pool),
    ids: new SequentialIds(980),
    clock: new SteppingClock(),
    combat: createCombatEngine(),
    entropy: MIDDLE_ENTROPY,
  });
  app = await ravenfordApp(engine, testAiGateway(), testAuthoring(), contents);
  for (let i = 0; i < paths.length; i++)
    assert.deepEqual(
      (await get(app, '/campaigns/ravenford' + paths[i], TOKENS.player)).json(),
      before[i],
    );
  assert.deepEqual((await engine.load('ravenford')).state, snap.state);
  const finalTypes = new Set([
    'CreateCampaign',
    'UndoCommand',
    'StartAssetJob',
    'CompleteAssetJob',
    'FailAssetJob',
    'CancelAssetRequest',
    'RetractAsset',
  ]);
  let namespace = 1000;
  for (const target of log) {
    if (
      finalTypes.has(target.commandType) ||
      snap.state.commands.get(target.commandId).undoneBy !== null
    )
      continue;
    const copy = new InMemoryEventStore();
    for (const c of log)
      await copy.append({
        campaignId: 'ravenford',
        expectedVersion: c.firstSequence - 1,
        command: c,
        events: snap.history.slice(c.firstSequence - 1, c.lastSequence),
      });
    const fork = new WorldEngine({
      store: copy,
      ids: new SequentialIds(++namespace),
      clock: new SteppingClock(),
      combat: createCombatEngine(),
      entropy: MIDDLE_ENTROPY,
    });
    const result = await fork.execute({
      campaignId: 'ravenford',
      commandId: `g05-sweep-${namespace}`,
      actor: { kind: 'user', actorId: 'dm-ravenford' },
      command: { type: 'UndoCommand', targetCommandId: target.commandId },
    });
    const after = await fork.load('ravenford');
    assert.deepEqual(replay(after.history), after.state);
    const integrity = checkWorldIntegrity(after.state);
    const divergence = redecideEffective(
      await copy.loadCommands('ravenford'),
      after,
      skillModifier,
      createCombatEngine(),
    );
    out.sweep.push({
      commandId: target.commandId,
      type: target.commandType,
      status: result.status,
      code: result.code ?? null,
      integrity,
      divergence,
    });
  }
  out.integration = {
    commands: log.length,
    events: snap.history.length,
    readParity: paths,
    leakScanPassed: true,
    replayEqual: true,
    integrity: [],
    baselineOracle: null,
  };
  out.summary = {
    attempts: out.sweep.length,
    accepted: out.sweep.filter((x) => x.status === 'accepted').length,
    rejected: out.sweep.filter((x) => x.status === 'rejected').length,
    unsafe: out.sweep.filter((x) => x.integrity.length || x.divergence),
  };
  await writeFile(
    'reviews/evidence/gate-05/scenario-sweep-results.json',
    JSON.stringify(out, null, 2) + '\n',
  );
  console.log(JSON.stringify(out.summary));
} finally {
  if (session) await session.close();
  if (app) await app.close();
  await pool.end();
  await db.drop();
}
```
