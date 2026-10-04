# Stage 120 writer compatibility and current undo

Three groups: compare all 103 command-boundary states with the actual b7a1a92 reader in an isolated Git archive; try undo on all 102 effective undoable commands on separate forks; and exercise four historical dependency refusals plus reversal of all 12 scenario commands through authenticated HTTP/PostgreSQL with restart. For old-reader comparison only, omit the new empty investigation.shown, assets, weather and chronicles collections, which the old writer did not have; no events are changed. Requires Git history, frozen offline dependencies and PostgreSQL. Removes its owned archive and database; preserves every historical fixture.

Run from the repository root with Node 24+ and installed workspace dependencies:

````sh
sed -n '/^```javascript$/,/^```$/p' reviews/evidence/gate-05/regressions/HISTORY_PROBES.md | sed '1d;$d' | node --conditions=@ltw/source --input-type=module
````

```javascript
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
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
import { ravenfordApp, TOKENS, post } from './apps/server/src/testing/ravenford-app.ts';
const require = createRequire(new URL('./apps/server/package.json', `file://${process.cwd()}/`));
const { Pool } = require('pg');
const results = {};
const fixture = await loadHistory('b7a1a92-npc-memories');
const events = fixture.events.map(eventFromRow);
const digest = (state) => {
  const copy = structuredClone(state);
  delete copy.investigation.shown;
  for (const key of ['weather', 'chronicles']) {
    assert.equal(copy[key].size, 0);
    delete copy[key];
  }
  for (const collection of Object.values(copy.assets)) assert.equal(collection.size, 0);
  delete copy.assets;
  return createHash('sha256')
    .update(
      JSON.stringify(copy, (_k, v) =>
        v instanceof Map ? { map: [...v] } : v instanceof Set ? { set: [...v] } : v,
      ),
    )
    .digest('hex');
};
const directory = await mkdtemp(join(tmpdir(), 'ltw-g04-old-'));
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
  const worker = `import{readFile}from'node:fs/promises';import{createHash}from'node:crypto';import{replay,parseRecordedEvent}from'./packages/domain/src/index.ts';const f=JSON.parse(await readFile(process.env.LTW_G04_FIXTURE,'utf8'));const es=f.events.map(r=>parseRecordedEvent({campaignId:r.stream_id,sequence:r.sequence,eventId:r.event_id,schemaVersion:r.schema_version,worldTime:r.world_time,recordedAt:new Date(r.recorded_at).toISOString(),causation:{commandId:r.command_id,commandType:r.command_type,actor:r.actor},type:r.event_type,payload:r.payload}));const digest=s=>createHash('sha256').update(JSON.stringify(s,(_k,v)=>v instanceof Map?{map:[...v]}:v instanceof Set?{set:[...v]}:v)).digest('hex');console.log(JSON.stringify(f.commands.map(c=>({sequence:c.last_sequence,digest:digest(replay(es,{untilSequence:c.last_sequence}))}))));`;
  const run = spawnSync(process.execPath, ['--conditions=@ltw/source', '--input-type=module'], {
    cwd: directory,
    input: worker,
    env: { ...process.env, LTW_G04_FIXTURE: resolve('fixtures/history/b7a1a92-npc-memories.json') },
    encoding: 'utf8',
  });
  assert.equal(run.status, 0, run.stderr);
  const prefixes = JSON.parse(run.stdout);
  for (const p of prefixes) {
    const state = replay(events, { untilSequence: p.sequence });
    assert.equal(state.investigation.shown.size, 0);
    assert.equal(digest(state), p.digest);
    assert.deepEqual(checkWorldIntegrity(state), []);
  }
  results.prefixes = {
    writer: fixture.writer.revision,
    commands: prefixes.length,
    statesEqual: true,
    normalization: 'Current empty investigation.shown omitted; old writer had no such collection.',
  };
} finally {
  await rm(directory, { recursive: true, force: true });
}
const original = await historicalWorld(fixture);
const state = await original.state();
const effective = [...state.commands.values()].filter(
  (c) => c.undoneBy === null && c.commandType !== 'UndoCommand',
);
const old = new Set(
  events
    .filter((e) => writtenEarlier(e) && e.type !== 'CommandUndone')
    .map((e) => e.causation.commandId),
);
let tried = 0,
  blocked = 0,
  accepted = 0;
async function audit(w) {
  const s = await w.engine.load('ravenford');
  assert.deepEqual(replay(s.history), s.state);
  assert.deepEqual(checkWorldIntegrity(s.state), []);
  assert.deepEqual(undoneBeneathEarlierWriters(s.state, s.history), []);
  assert.equal(
    redecideEffective(await w.engine.commandLog('ravenford'), s, () => 0, createCombatEngine()),
    null,
  );
}
for (const target of effective.filter((c) => c.commandType !== 'CreateCampaign')) {
  const copy = await forkWorld(original, 301);
  const before = await copy.state();
  const r = await copy.dm({ type: 'UndoCommand', targetCommandId: target.commandId });
  tried++;
  const mandatory = effective
    .filter((c) => old.has(c.commandId) && c.firstSequence > target.lastSequence)
    .map((c) => c.commandId);
  if (mandatory.length) {
    assert.equal(r.code, 'UNDO_UNSAFE');
    for (const id of mandatory) assert.ok(r.details.blockers.some((b) => b.commandId === id));
  }
  if (r.status === 'rejected') {
    assert.equal(r.code, 'UNDO_UNSAFE');
    assert.deepEqual(await copy.state(), before);
    blocked++;
  } else {
    assert.equal(r.status, 'accepted');
    accepted++;
    await audit(copy);
  }
}
results.undoSweep = { tried, blocked, accepted, allStandingEarlierCommandsProtected: true };
const db = await createThrowawayDatabase({ migrate: true });
const pool = new Pool({ connectionString: db.url });
let app;
try {
  await insertHistory(pool, await loadHistoryRows('b7a1a92-npc-memories'));
  const make = () =>
    new WorldEngine({
      store: new PostgresEventStore(pool),
      ids: new SequentialIds(401),
      clock: new SteppingClock(),
      combat: createCombatEngine(),
    });
  let engine = make();
  app = await ravenfordApp(engine);
  let serial = 0;
  const command = async (c) => {
    const r = await post(
      app,
      '/campaigns/ravenford/commands',
      { commandId: `g04-history-${++serial}`, command: c },
      TOKENS.dm,
    );
    return { http: r.statusCode, ...r.json() };
  };
  const refusals = {};
  for (const label of ['rename-caravan', 'rename-weapon', 'mira-wagons-willing', 'ask-road']) {
    const before = await engine.load('ravenford');
    const r = await command({ type: 'UndoCommand', targetCommandId: fixture.labels[label] });
    assert.equal(r.http, 422);
    assert.equal(r.code, 'UNDO_UNSAFE');
    assert.deepEqual(await engine.load('ravenford'), before);
    refusals[label] = r;
  }
  const note = await command({
    type: 'AddKnowledge',
    scope: { kind: 'DM' },
    knowledgeType: 'SECRET',
    statement: 'Current independent note.',
    subjects: [],
    knownSince: null,
  });
  assert.equal(note.status, 'accepted');
  const labels = new Set(Object.values(fixture.labels));
  for (const c of [...effective].reverse().filter((c) => labels.has(c.commandId)))
    assert.equal(
      (await command({ type: 'UndoCommand', targetCommandId: c.commandId })).status,
      'accepted',
    );
  assert.equal((await engine.load('ravenford')).state.commands.get(note.commandId).undoneBy, null);
  await app.close();
  engine = make();
  app = await ravenfordApp(engine);
  const snap = await engine.load('ravenford');
  assert.deepEqual(replay(snap.history), snap.state);
  assert.deepEqual(undoneBeneathEarlierWriters(snap.state, snap.history), []);
  assert.deepEqual(checkWorldIntegrity(snap.state), []);
  results.postgres = {
    refusals,
    scenarioCommandsReversed: labels.size,
    laterCurrentNoteStillEffective: true,
    reloaded: true,
    replayEqual: true,
  };
} finally {
  if (app) await app.close();
  await pool.end();
  await db.drop();
}
await mkdir('reviews/evidence/gate-05/regressions', { recursive: true });
await writeFile(
  'reviews/evidence/gate-05/regressions/history-results.json',
  JSON.stringify(results, null, 2) + '\n',
);
console.log(
  JSON.stringify({
    groups: Object.keys(results).length,
    undoAttempts: tried,
    allAssertionsPassed: true,
  }),
);
```
