# Retest 2: genuine version 2 Chronicle history

Loads the immutable e9c05ad history (105 events, 96 commands), and compares every command-boundary state plus both chapter views with the actual original reader in an isolated Git archive. No normalization is needed. Both old chapters remain version 2 and display exactly as stored.

Ninety-five independent undo attempts protect every earlier command while either old chapter stands (94 refusals, only the last chapter removable). One PostgreSQL world repeats source/older-chapter refusals before and after restart, unwinds both chapters and the three renames newest first, then records a version 4 chapter and verifies its own protection, restart and recovery. Replay, integrity and re-decision hold throughout; the fixture hash stays unchanged. Creates/removes its owned Docker container (including its anonymous volume), database, and old-reader archive. Both restarts below stop and start the isolated PostgreSQL process and replace the pool, engine, and app; postmaster start times prove the database process changed. Requires Git history and cached dependencies for a frozen offline install in that archive only.

Observed on `a85b6f8`: 96 exact original-reader command-boundary states; 95 independent undo attempts (94 refused, one accepted); two actual database-process restarts; version 4 continuation and recovery passed. The original fixture SHA-256 remains `75d1c64c4fcd28d81b72586ef42d64d25dd8fd9bbcfc50bba2dbbde58c2db612`. The oracle folds earlier-writer chapters as recorded, so its success is used alongside original-reader equality, integrity, and the earlier-writer audit.

Run from the repository root with Node 24+, installed workspace dependencies, Docker, and a cached `postgres:18-alpine` image:

````sh
sed -n '/^```javascript$/,/^```$/p' reviews/evidence/gate-05/retest-2/EARLIER_CHAPTERS_PROBES.md | sed '1d;$d' | node --conditions=@ltw/source --input-type=module
````

```javascript
import assert from 'node:assert/strict';
import { readFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import {
  loadHistory,
  historicalWorld,
  eventFromRow,
} from './packages/combat/src/testing/history.ts';
import { forkWorld } from './packages/combat/src/testing/fork.ts';
import { createCombatEngine } from './packages/combat/src/engine.ts';
import {
  replay,
  chronicleChapters,
  checkWorldIntegrity,
  redecideEffective,
  undoneBeneathEarlierWriters,
  writtenEarlier,
  WorldEngine,
  SequentialIds,
  SteppingClock,
} from './packages/domain/src/index.ts';
import { createThrowawayDatabase } from './apps/server/src/testing/throwaway-database.ts';
import { insertHistory, loadHistoryRows } from './apps/server/src/testing/history-rows.ts';
import { PostgresEventStore } from './apps/server/src/world-engine/postgres-event-store.ts';
import { ravenfordApp, TOKENS, post, get } from './apps/server/src/testing/ravenford-app.ts';
const require = createRequire(new URL('./apps/server/package.json', `file://${process.cwd()}/`));
const { Pool } = require('pg');
const results = { reviewedCode: 'a85b6f87f1dbd5ed8287e294acc6d18b191e5904', databaseRestarts: [] };
const fixture = await loadHistory('e9c05ad-chronicle-names');
const events = fixture.events.map(eventFromRow);
const digest = (state) => {
  const copy = structuredClone(state);
  return createHash('sha256')
    .update(
      JSON.stringify(copy, (_k, v) =>
        v instanceof Map ? { map: [...v] } : v instanceof Set ? { set: [...v] } : v,
      ),
    )
    .digest('hex');
};
const directory = await mkdtemp(join(tmpdir(), 'ltw-g05-r2-old-'));
try {
  execFileSync('tar', ['-x', '-C', directory], {
    input: execFileSync('git', ['archive', '--format=tar', fixture.writer.revision], {
      maxBuffer: 32 * 1024 * 1024,
    }),
  });
  execFileSync('pnpm', ['install', '--offline', '--frozen-lockfile', '--ignore-scripts'], {
    cwd: directory,
    stdio: 'pipe',
  });
  const worker = `import{readFile}from'node:fs/promises';import{createHash}from'node:crypto';import{replay,parseRecordedEvent,chronicleChapters}from'./packages/domain/src/index.ts';const f=JSON.parse(await readFile(process.env.LTW_G04_FIXTURE,'utf8'));const es=f.events.map(r=>parseRecordedEvent({campaignId:r.stream_id,sequence:r.sequence,eventId:r.event_id,schemaVersion:r.schema_version,worldTime:r.world_time,recordedAt:new Date(r.recorded_at).toISOString(),causation:{commandId:r.command_id,commandType:r.command_type,actor:r.actor},type:r.event_type,payload:r.payload}));const digest=s=>createHash('sha256').update(JSON.stringify(s,(_k,v)=>v instanceof Map?{map:[...v]}:v instanceof Set?{set:[...v]}:v)).digest('hex');console.log(JSON.stringify({prefixes:f.commands.map(c=>({sequence:c.last_sequence,digest:digest(replay(es,{untilSequence:c.last_sequence}))})),chapters:chronicleChapters({state:replay(es),history:es},{label:'DM',kind:'DM',holderId:null,scopes:'ALL'})}));`;
  const run = spawnSync(process.execPath, ['--conditions=@ltw/source', '--input-type=module'], {
    cwd: directory,
    input: worker,
    env: {
      ...process.env,
      LTW_G04_FIXTURE: resolve('fixtures/history/e9c05ad-chronicle-names.json'),
    },
    encoding: 'utf8',
  });
  assert.equal(run.status, 0, run.stderr);
  const old = JSON.parse(run.stdout);
  const prefixes = old.prefixes;
  assert.deepEqual(
    chronicleChapters(
      { state: replay(events), history: events },
      { label: 'DM', kind: 'DM', holderId: null, scopes: 'ALL' },
    ),
    old.chapters,
  );
  results.oldReaderChapters = old.chapters;
  for (const p of prefixes) {
    const state = replay(events, { untilSequence: p.sequence });
    assert.equal(digest(state), p.digest);
    assert.deepEqual(checkWorldIntegrity(state), []);
  }
  results.prefixes = {
    writer: fixture.writer.revision,
    commands: prefixes.length,
    statesEqual: true,
    normalization: 'None: exact state and chapter-view equality with the original writer reader.',
  };
} finally {
  await rm(directory, { recursive: true, force: true });
}

const fixturePath = 'fixtures/history/e9c05ad-chronicle-names.json';
const fixtureDigest = createHash('sha256')
  .update(await readFile(fixturePath))
  .digest('hex');
const oldChapters = events.filter((e) => e.type === 'ChronicleGenerated');
assert.equal(oldChapters.length, 2);
assert.ok(oldChapters.every((e) => e.schemaVersion === 2 && writtenEarlier(e)));
const original = await historicalWorld(fixture);
const audit = async (engine) => {
  const s = await engine.load('ravenford');
  assert.deepEqual(replay(s.history), s.state);
  assert.deepEqual(checkWorldIntegrity(s.state), []);
  assert.deepEqual(undoneBeneathEarlierWriters(s.state, s.history), []);
  assert.equal(
    redecideEffective(await engine.commandLog('ravenford'), s, () => 0, createCombatEngine()),
    null,
  );
};
const sweep = [];
for (const target of [...(await original.state()).commands.values()].filter(
  (c) => c.commandType !== 'CreateCampaign' && c.undoneBy === null,
)) {
  const copy = await forkWorld(original, 702);
  const before = await copy.state();
  const r = await copy.dm({ type: 'UndoCommand', targetCommandId: target.commandId });
  const expectedBlockers = oldChapters
    .filter((e) => e.sequence > target.lastSequence)
    .map((e) => e.causation.commandId);
  if (expectedBlockers.length) {
    assert.equal(r.code, 'UNDO_UNSAFE');
    for (const id of expectedBlockers)
      assert.ok(r.details.blockers.some((b) => b.commandId === id));
    assert.deepEqual(await copy.state(), before);
  } else assert.equal(r.status, 'accepted');
  await audit(copy.engine);
  sweep.push({
    target: target.commandId,
    result: r.status,
    code: r.code ?? null,
    expectedBlockers,
  });
}
results.sweep = {
  attempts: sweep.length,
  accepted: sweep.filter((s) => s.result === 'accepted').length,
  refused: sweep.filter((s) => s.result === 'rejected').length,
  all: sweep,
};
const container = execFileSync(
  'docker',
  [
    'run',
    '-d',
    '--pull=never',
    '-e',
    'POSTGRES_USER=ltw',
    '-e',
    'POSTGRES_PASSWORD=ltw_dev_password',
    '-e',
    'POSTGRES_DB=ltw',
    '-p',
    '127.0.0.1::5432',
    'postgres:18-alpine',
  ],
  { encoding: 'utf8' },
).trim();
const port = JSON.parse(execFileSync('docker', ['inspect', container], { encoding: 'utf8' }))[0]
  .NetworkSettings.Ports['5432/tcp'][0].HostPort;
process.env.DATABASE_URL = `postgres://ltw:ltw_dev_password@127.0.0.1:${port}/ltw`;
const ready = async () => {
  for (let attempt = 0; attempt < 120; attempt++) {
    const probe = new Pool({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 500,
    });
    try {
      return (await probe.query('select pg_postmaster_start_time()::text as started')).rows[0]
        .started;
    } catch (error) {
      if (attempt === 119) throw error;
      await new Promise((r) => setTimeout(r, 250));
    } finally {
      await probe.end();
    }
  }
};
let db, pool, app;
try {
  await ready();
  db = await createThrowawayDatabase({ migrate: true });
  pool = new Pool({ connectionString: db.url });
  const restartDatabase = async () => {
    const before = (await pool.query('select pg_postmaster_start_time()::text as started')).rows[0]
      .started;
    await pool.end();
    execFileSync('docker', ['restart', '--time', '5', container], { stdio: 'pipe' });
    const port = JSON.parse(execFileSync('docker', ['inspect', container], { encoding: 'utf8' }))[0]
      .NetworkSettings.Ports['5432/tcp'][0].HostPort;
    process.env.DATABASE_URL = `postgres://ltw:ltw_dev_password@127.0.0.1:${port}/ltw`;
    const after = await ready();
    assert.notEqual(after, before);
    const url = new URL(process.env.DATABASE_URL);
    url.pathname = `/${db.name}`;
    pool = new Pool({ connectionString: url.toString() });
    results.databaseRestarts.push({ before, after, changed: true });
  };

  await insertHistory(pool, await loadHistoryRows('e9c05ad-chronicle-names'));
  let restartId = 801;
  const make = () =>
    new WorldEngine({
      store: new PostgresEventStore(pool),
      ids: new SequentialIds(++restartId),
      clock: new SteppingClock(),
      combat: createCombatEngine(),
    });
  let engine = make();
  app = await ravenfordApp(engine);
  let serial = 0;
  const cmd = async (command) => {
    const r = await post(
      app,
      '/campaigns/ravenford/commands',
      { commandId: `r2-older-${++serial}`, command },
      TOKENS.dm,
    );
    return { http: r.statusCode, ...r.json() };
  };
  const undo = async (target) => cmd({ type: 'UndoCommand', targetCommandId: target });
  const view = async () => {
    const r = await get(app, '/campaigns/ravenford/chronicle?perspective=DM', TOKENS.dm);
    assert.equal(r.statusCode, 200);
    return r.json();
  };
  const initial = await view();
  assert.deepEqual(initial.chapters, results.oldReaderChapters);
  await audit(engine);
  const blocked = [];
  for (const restart of [false, true]) {
    if (restart) {
      await app.close();
      await restartDatabase();
      engine = make();
      app = await ravenfordApp(engine);
      assert.deepEqual(await view(), initial);
    }
    for (const label of ['rename-elowen', 'rename-square', 'rename-mira', 'dm-chapter']) {
      const r = await undo(fixture.labels[label]);
      assert.equal(r.http, 422);
      assert.equal(r.code, 'UNDO_UNSAFE');
      assert.ok(r.details.blockers.some((b) => b.commandId === fixture.labels['party-chapter']));
      blocked.push({ restart, label, result: r });
    }
    await audit(engine);
  }
  const recovery = [];
  for (const label of [
    'party-chapter',
    'dm-chapter',
    'rename-mira',
    'rename-square',
    'rename-elowen',
  ]) {
    const r = await undo(fixture.labels[label]);
    assert.equal(r.status, 'accepted', JSON.stringify(r));
    recovery.push({ label, result: r });
    await audit(engine);
  }
  assert.equal(
    (await engine.load('ravenford')).state.entities.get('elowen-starwhisper').name,
    'Elowen Starwhisper',
  );
  const rename = await cmd({
    type: 'UpdateEntityProfile',
    entityId: 'elowen-starwhisper',
    name: 'New writer protected name',
  });
  assert.equal(rename.status, 'accepted');
  // Fresh authoring IDs cannot collide with the two earlier chapters' identifiers.
  const { testAuthoring } = await import('./apps/server/src/testing/ravenford-app.ts');
  await app.close();
  app = await ravenfordApp(engine, undefined, { ...testAuthoring(), ids: new SequentialIds(901) });
  const response = await post(
    app,
    '/campaigns/ravenford/chronicle',
    { title: 'Continued after earlier chapters', perspective: 'DM', from: 0 },
    TOKENS.dm,
  );
  assert.equal(response.statusCode, 200, response.body);
  const generated = response.json();
  const snapshot = await engine.load('ravenford');
  const next = snapshot.history.find(
    (e) => e.type === 'ChronicleGenerated' && e.payload.chronicleId === generated.chronicleId,
  );
  assert.equal(next.schemaVersion, 4);
  assert.ok(next.payload.rests.includes('entity:elowen-starwhisper#profile'));
  const protectedRename = await undo(rename.commandId);
  assert.equal(protectedRename.code, 'UNDO_UNSAFE');
  assert.ok(protectedRename.details.blockers.some((b) => b.commandId === generated.chronicleId));
  await audit(engine);
  const continuedView = await view();
  await app.close();
  await restartDatabase();
  engine = make();
  app = await ravenfordApp(engine);
  assert.deepEqual(await view(), continuedView);
  await audit(engine);
  assert.equal((await undo(generated.chronicleId)).status, 'accepted');
  assert.equal((await undo(rename.commandId)).status, 'accepted');
  await audit(engine);
  results.postgres = {
    oldViewsEqual: true,
    blocked,
    recovery,
    currentChapterVersion: next.schemaVersion,
    protectedRename,
    restartEqual: true,
    reverseRecovery: true,
    redecisionEqual: true,
  };
} finally {
  try {
    if (app) await app.close();
    if (pool && !pool.ended) await pool.end();
    if (db) await db.drop();
  } finally {
    execFileSync('docker', ['rm', '-fv', container], { stdio: 'pipe' });
  }
}
assert.equal(
  createHash('sha256')
    .update(await readFile(fixturePath))
    .digest('hex'),
  fixtureDigest,
);
results.fixture = { path: fixturePath, sha256: fixtureDigest, unchanged: true };
await writeFile(
  'reviews/evidence/gate-05/retest-2/earlier-chapters-results.json',
  JSON.stringify(results, null, 2) + '\n',
);
console.log(
  JSON.stringify({
    prefixes: results.prefixes.commands,
    undoAttempts: results.sweep.attempts,
    accepted: results.sweep.accepted,
    refused: results.sweep.refused,
    allAssertionsPassed: true,
  }),
);
```
