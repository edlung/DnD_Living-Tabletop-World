# Retest 2: genuine version 3 Chronicle histories

Independently compare both immutable `a488de4` histories with that revision's own reader in an isolated Git archive. Every event prefix is compared without normalization: exact state digest and exact Chronicle views. The damaged history must retain its orphan, with integrity naming the real chapter and command and the earlier-writer audit naming the historical undo even after recovery.

Each history also receives an exhaustive independent undo sweep, followed by authenticated HTTP checks on PostgreSQL. The database runs in this recipe's own container on an automatically assigned loopback port. Two actual PostgreSQL process restarts per history replace the pool, engine, and app; differing `pg_postmaster_start_time()` values prove this is more than an application reload. Sources remain protected, later uncited inspections remain undoable, chapter-first recovery clears active integrity damage, and new version 4 chapters protect occurrences that write no facts. All fixture hashes remain unchanged. Owned archives, databases, containers, and anonymous volumes are removed.

Observed on `a85b6f8`: 235 exact original-reader event-prefix state/view pairs; 195 independent undo attempts (191 refused, four accepted); four actual database-process restarts. The intact history has no integrity or earlier-writer warning. The damaged history names entry `e8` of `chronicle.00000000-00a2-4000-8000-000000000001`, its undone source `http:player-elowen:legacy-repeat-inspection`, and historical undo `http:dm-ravenford:legacy-undo-repeat-inspection`. Chapter-first recovery clears current integrity; that historical audit warning correctly remains. Version 4 continuation and recovery pass on both histories.

The oracle folds earlier-writer chapters as recorded; its success alone cannot diagnose the damaged history. These probes therefore assert both the active integrity diagnosis and the permanent historical audit result.

Requires Node 24+, Git, installed workspace dependencies, an offline dependency cache, Docker, and the cached `postgres:18-alpine` image. Run from the repository root:

````sh
sed -n '/^```javascript$/,/^```$/p' reviews/evidence/gate-05/retest-2/VERSION3_HISTORY_PROBES.md | sed '1d;$d' | node --conditions=@ltw/source --input-type=module
````

```javascript
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
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
  footprintOf,
  WorldEngine,
  SequentialIds,
  SteppingClock,
} from './packages/domain/src/index.ts';
import { createThrowawayDatabase } from './apps/server/src/testing/throwaway-database.ts';
import { insertHistory, loadHistoryRows } from './apps/server/src/testing/history-rows.ts';
import { PostgresEventStore } from './apps/server/src/world-engine/postgres-event-store.ts';
import {
  ravenfordApp,
  testAuthoring,
  TOKENS,
  post,
  get,
} from './apps/server/src/testing/ravenford-app.ts';
const require = createRequire(new URL('./apps/server/package.json', `file://${process.cwd()}/`));
const { Pool } = require('pg');
const DM = { label: 'DM', kind: 'DM', holderId: null, scopes: 'ALL' };
const digest = (value) =>
  createHash('sha256')
    .update(
      JSON.stringify(value, (_k, v) =>
        v instanceof Map ? { map: [...v] } : v instanceof Set ? { set: [...v] } : v,
      ),
    )
    .digest('hex');
const fileDigest = async (path) =>
  createHash('sha256')
    .update(await readFile(path))
    .digest('hex');
const names = ['a488de4-cited-examinations', 'a488de4-cited-examination-undone'];
const fixtures = await Promise.all(names.map(loadHistory));
const hashes = await Promise.all(names.map((name) => fileDigest(`fixtures/history/${name}.json`)));
const results = {
  reviewedCode: 'a85b6f87f1dbd5ed8287e294acc6d18b191e5904',
  head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  histories: [],
};
const originals = [];
const directory = await mkdtemp(join(tmpdir(), 'ltw-g05-r2-v3-'));
try {
  assert.equal(fixtures[0].writer.revision, fixtures[1].writer.revision);
  execFileSync('tar', ['-x', '-C', directory], {
    input: execFileSync('git', ['archive', '--format=tar', fixtures[0].writer.revision], {
      maxBuffer: 32 * 1024 * 1024,
    }),
  });
  execFileSync('pnpm', ['install', '--offline', '--frozen-lockfile', '--ignore-scripts'], {
    cwd: directory,
    stdio: 'pipe',
  });
  const worker = `import{readFile}from'node:fs/promises';import{createHash}from'node:crypto';import{replay,parseRecordedEvent,chronicleChapters}from'./packages/domain/src/index.ts';const f=JSON.parse(await readFile(process.env.LTW_G05_FIXTURE,'utf8'));const es=f.events.map(r=>parseRecordedEvent({campaignId:r.stream_id,sequence:r.sequence,eventId:r.event_id,schemaVersion:r.schema_version,worldTime:r.world_time,recordedAt:new Date(r.recorded_at).toISOString(),causation:{commandId:r.command_id,commandType:r.command_type,actor:r.actor},type:r.event_type,payload:r.payload}));const digest=s=>createHash('sha256').update(JSON.stringify(s,(_k,v)=>v instanceof Map?{map:[...v]}:v instanceof Set?{set:[...v]}:v)).digest('hex');const dm={label:'DM',kind:'DM',holderId:null,scopes:'ALL'};console.log(JSON.stringify({prefixes:es.map(e=>{const history=es.slice(0,e.sequence),state=replay(history);return{sequence:e.sequence,state:digest(state),chapters:chronicleChapters({state,history},dm)}}),chapters:chronicleChapters({state:replay(es),history:es},dm)}));`;
  for (const name of names) {
    const run = spawnSync(process.execPath, ['--conditions=@ltw/source', '--input-type=module'], {
      cwd: directory,
      input: worker,
      env: { ...process.env, LTW_G05_FIXTURE: resolve(`fixtures/history/${name}.json`) },
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    });
    assert.equal(run.status, 0, run.stderr);
    originals.push(JSON.parse(run.stdout));
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}

for (const [index, fixture] of fixtures.entries()) {
  const name = names[index];
  const damaged = index === 1;
  const events = fixture.events.map(eventFromRow);
  const labels = fixture.labels;
  const chapterId = labels['dm-chapter'];
  const chapter = events.find((e) => e.type === 'ChronicleGenerated');
  assert.equal(chapter.schemaVersion, 3);
  assert.equal(writtenEarlier(chapter), true);
  assert.deepEqual(
    chapter.payload,
    fixture.events.find((e) => e.event_type === 'ChronicleGenerated').payload,
  );
  const pastUndo = damaged ? [labels['undo-repeat-inspection']] : [];
  const violation = `chronicle ${chapterId} tells undone command ${labels['repeat-inspection']}`;
  const expectedIntegrity = (state) =>
    damaged && state.chronicles.has(chapterId) ? [violation] : [];
  const old = originals[index];
  for (const prefix of old.prefixes) {
    const history = events.slice(0, prefix.sequence);
    const state = replay(history);
    assert.equal(digest(state), prefix.state);
    assert.deepEqual(chronicleChapters({ state, history }, DM), prefix.chapters);
    assert.deepEqual(
      checkWorldIntegrity(state),
      damaged && prefix.sequence === 118 ? [violation] : [],
    );
    assert.deepEqual(
      undoneBeneathEarlierWriters(state, history),
      damaged && prefix.sequence === 118 ? pastUndo : [],
    );
  }
  const original = await historicalWorld(fixture);
  const audit = async (engine) => {
    const snapshot = await engine.load('ravenford');
    assert.deepEqual(replay(snapshot.history), snapshot.state);
    assert.deepEqual(checkWorldIntegrity(snapshot.state), expectedIntegrity(snapshot.state));
    assert.deepEqual(undoneBeneathEarlierWriters(snapshot.state, snapshot.history), pastUndo);
    assert.equal(
      redecideEffective(
        await engine.commandLog('ravenford'),
        snapshot,
        () => 0,
        createCombatEngine(),
      ),
      null,
    );
    return snapshot;
  };
  const initial = await audit(original.engine);
  assert.deepEqual(chronicleChapters(initial, DM), old.chapters);
  const orphanEntry = chapter.payload.entries.find(
    (e) => e.source.commandId === labels['repeat-inspection'],
  );
  const seenOrphan = old.chapters[0].entries.find((e) => e.key === orphanEntry.key);
  assert.equal(seenOrphan.sources.length, damaged ? 0 : 1);
  const sweep = [];
  for (const target of [...initial.state.commands.values()].filter(
    (c) => !['CreateCampaign', 'UndoCommand'].includes(c.commandType) && c.undoneBy === null,
  )) {
    const fork = await forkWorld(original, 1702);
    const before = await fork.engine.load('ravenford');
    const response = await fork.dm({ type: 'UndoCommand', targetCommandId: target.commandId });
    if (target.lastSequence < chapter.sequence) {
      assert.equal(response.code, 'UNDO_UNSAFE', target.commandId);
      assert.ok(response.details.blockers.some((b) => b.commandId === chapterId));
      assert.deepEqual(await fork.engine.load('ravenford'), before);
    } else {
      assert.equal(response.status, 'accepted', target.commandId);
    }
    await audit(fork.engine);
    sweep.push({ target: target.commandId, status: response.status, code: response.code ?? null });
  }
  const item = {
    fixture: name,
    writer: fixture.writer.revision,
    originalChapterVersion: chapter.schemaVersion,
    originalReader: {
      eventPrefixes: old.prefixes.length,
      commands: fixture.commands.length,
      exactStates: true,
      exactChapterViews: true,
      normalization: 'None',
      chapters: old.chapters,
    },
    damaged,
    historicalOrphan: damaged
      ? {
          entryKey: orphanEntry.key,
          sourceCommand: labels['repeat-inspection'],
          chapterId,
          integrity: [violation],
          earlierWriterAudit: pastUndo,
          viewSources: seenOrphan.sources,
        }
      : null,
    sweep: {
      attempts: sweep.length,
      accepted: sweep.filter((r) => r.status === 'accepted').length,
      refused: sweep.filter((r) => r.status === 'rejected').length,
      all: sweep,
    },
    databaseRestarts: [],
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
  let db, pool, app;
  try {
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
    await ready();
    db = await createThrowawayDatabase({ migrate: true });
    pool = new Pool({ connectionString: db.url });
    await insertHistory(pool, await loadHistoryRows(name));
    let restartId = 1800 + index * 100;
    const make = () =>
      new WorldEngine({
        store: new PostgresEventStore(pool),
        ids: new SequentialIds(++restartId),
        clock: new SteppingClock(),
        combat: createCombatEngine(),
      });
    let engine = make();
    const makeApp = () =>
      ravenfordApp(engine, undefined, { ...testAuthoring(), ids: new SequentialIds(++restartId) });
    app = await makeApp();
    const restart = async () => {
      await app.close();
      const before = (await pool.query('select pg_postmaster_start_time()::text as started'))
        .rows[0].started;
      await pool.end();
      execFileSync('docker', ['restart', '--time', '5', container], { stdio: 'pipe' });
      const port = JSON.parse(
        execFileSync('docker', ['inspect', container], { encoding: 'utf8' }),
      )[0].NetworkSettings.Ports['5432/tcp'][0].HostPort;
      process.env.DATABASE_URL = `postgres://ltw:ltw_dev_password@127.0.0.1:${port}/ltw`;
      const after = await ready();
      assert.notEqual(before, after);
      const url = new URL(process.env.DATABASE_URL);
      url.pathname = `/${db.name}`;
      pool = new Pool({ connectionString: url.toString() });
      engine = make();
      app = await makeApp();
      item.databaseRestarts.push({ before, after, changed: true });
    };
    let serial = 0;
    const cmd = async (command) => {
      const response = await post(
        app,
        '/campaigns/ravenford/commands',
        { commandId: `r2-v3-${index}-${++serial}`, command },
        TOKENS.dm,
      );
      return { http: response.statusCode, ...response.json() };
    };
    const undo = (target) => cmd({ type: 'UndoCommand', targetCommandId: target });
    const view = async () => {
      const response = await get(app, '/campaigns/ravenford/chronicle?perspective=DM', TOKENS.dm);
      assert.equal(response.statusCode, 200);
      return response.json();
    };
    const counts = async () =>
      (
        await pool.query(
          'select (select count(*) from ltw_events)::int as events, (select count(*) from ltw_commands)::int as commands',
        )
      ).rows[0];
    const refuse = async (target, blocker) => {
      const before = await engine.load('ravenford');
      const beforeLog = await engine.commandLog('ravenford');
      const beforeCounts = await counts();
      const response = await undo(target);
      assert.equal(response.http, 422);
      assert.equal(response.code, 'UNDO_UNSAFE');
      assert.ok(response.details.blockers.some((b) => b.commandId === blocker));
      assert.deepEqual(await engine.load('ravenford'), before);
      assert.deepEqual(await engine.commandLog('ravenford'), beforeLog);
      assert.deepEqual(await counts(), beforeCounts);
      return response;
    };
    assert.deepEqual((await view()).chapters, old.chapters);
    await audit(engine);
    const databaseInitial = await engine.load('ravenford');
    const initialView = await view();
    const blocked = [];
    for (const afterRestart of [false, true]) {
      if (afterRestart) {
        await restart();
        assert.deepEqual(await engine.load('ravenford'), databaseInitial);
        assert.deepEqual(await view(), initialView);
      }
      for (const label of [
        'first-inspection',
        'token-inspection',
        ...(!damaged ? ['repeat-inspection'] : []),
      ]) {
        blocked.push({ afterRestart, label, response: await refuse(labels[label], chapterId) });
      }
      await audit(engine);
    }
    const later = await undo(labels['later-inspection']);
    assert.equal(later.status, 'accepted');
    assert.deepEqual(await view(), initialView);
    await audit(engine);
    const recovery = [];
    for (const label of [
      'dm-chapter',
      'token-inspection',
      ...(!damaged ? ['repeat-inspection'] : []),
    ]) {
      const response = await undo(labels[label]);
      assert.equal(response.status, 'accepted', JSON.stringify(response));
      recovery.push({ label, response });
      await audit(engine);
    }
    assert.deepEqual((await view()).chapters, []);
    const fresh = await cmd({
      type: 'ExamineEntity',
      characterId: 'elowen-starwhisper',
      entityId: 'ordinary-token',
      method: 'inspect',
    });
    assert.equal(fresh.status, 'accepted');
    const newSource = (await engine.load('ravenford')).history.filter(
      (e) => e.causation.commandId === fresh.commandId,
    );
    assert.deepEqual(
      newSource.map((e) => e.type),
      ['PremisesRecorded', 'EvidenceExamined'],
    );
    assert.deepEqual(
      newSource.flatMap((e) => footprintOf(e).writes),
      [],
    );
    const generatedResponse = await post(
      app,
      '/campaigns/ravenford/chronicle',
      { title: `Recovered version 3 history ${index}`, perspective: 'DM', from: 0 },
      TOKENS.dm,
    );
    assert.equal(generatedResponse.statusCode, 200, generatedResponse.body);
    const generated = generatedResponse.json();
    const continuation = await audit(engine);
    const newChapter = continuation.history.find(
      (e) => e.type === 'ChronicleGenerated' && e.payload.chronicleId === generated.chronicleId,
    );
    assert.equal(newChapter.schemaVersion, 4);
    assert.equal(writtenEarlier(newChapter), false);
    assert.ok(newChapter.payload.rests.includes(`command:${fresh.commandId}`));
    const continuedView = await view();
    const newEntry = newChapter.payload.entries.find((e) => e.source.commandId === fresh.commandId);
    assert.ok(newEntry);
    assert.equal(
      continuedView.chapters[0].entries.find((e) => e.key === newEntry.key).sources.length,
      1,
    );
    const currentBlocked = [await refuse(fresh.commandId, generated.chronicleId)];
    await restart();
    assert.deepEqual(await engine.load('ravenford'), continuation);
    assert.deepEqual(await view(), continuedView);
    currentBlocked.push(await refuse(fresh.commandId, generated.chronicleId));
    await audit(engine);
    assert.equal((await undo(generated.chronicleId)).status, 'accepted');
    assert.equal((await undo(fresh.commandId)).status, 'accepted');
    const recovered = await audit(engine);
    assert.deepEqual(checkWorldIntegrity(recovered.state), []);
    assert.deepEqual(undoneBeneathEarlierWriters(recovered.state, recovered.history), pastUndo);
    item.postgres = {
      originalViewsEqual: true,
      restartStatesAndViewsEqual: true,
      blocked,
      atomicity:
        'State, history, command log, and PostgreSQL event/command row counts unchanged on every refusal',
      laterUncitedUndo: later,
      recovery,
      currentChapterVersion: newChapter.schemaVersion,
      currentSourceFactWrites: [],
      currentBlocked,
      currentChapterFirstRecovery: true,
      finalIntegrity: [],
      historicalAuditAfterRecovery: pastUndo,
      replayAndRedecisionEqual: true,
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
  assert.equal(await fileDigest(`fixtures/history/${name}.json`), hashes[index]);
  item.fixtureSha256 = hashes[index];
  item.fixtureUnchanged = true;
  results.histories.push(item);
}
results.summary = {
  exactOriginalReaderEventPrefixes: results.histories.reduce(
    (n, h) => n + h.originalReader.eventPrefixes,
    0,
  ),
  independentUndoAttempts: results.histories.reduce((n, h) => n + h.sweep.attempts, 0),
  independentUndoRefusals: results.histories.reduce((n, h) => n + h.sweep.refused, 0),
  independentUndoAcceptances: results.histories.reduce((n, h) => n + h.sweep.accepted, 0),
  actualDatabaseRestarts: results.histories.reduce((n, h) => n + h.databaseRestarts.length, 0),
  allAssertionsPassed: true,
};
await writeFile(
  'reviews/evidence/gate-05/retest-2/version3-history-results.json',
  JSON.stringify(results, null, 2) + '\n',
);
console.log(JSON.stringify(results.summary));
```
