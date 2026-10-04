# Authoring serialization, retry and restart retest

64 ordered races cover every pair of direct edit, explicit continuity option, commit and undo, on both a draft and a committed proposal. Half run through two HTTP application instances sharing an in-memory engine/store in one process. Half use **two actual child Node processes**, each with its own engine, application and PostgreSQL pools; every database-backed proposal starts from an AI trace. A third process checks persistence after both writers stop.

The first operation pauses after the real protected `latest()` read. The second starts while the first holds its section. PostgreSQL cases verify an actual ungranted advisory lock in `pg_locks` before releasing the first operation; memory cases observe the second remaining pending. The scheduler never invents or changes a stored revision or canonical event. Assertions compare ordered outcomes, latest versus committed revision, canonical content, exact undo restoration, replay and integrity. A commit followed by its undo may both succeed in that order; conflicting edits or stale confirmations cannot both succeed.

Two additional process-kill cases stop a writer before its canonical write or after success. The survivor must finish or return the original duplicate exactly once. Identical and conflicting revision/risk/warning retries are tested after restart and after undo; an undone commit must not resurrect. Changed warning keys use valid schema syntax so their rejection exercises command identity rather than request parsing.

Requires Node 24+, installed dependencies and PostgreSQL. Creates/removes **34 owned databases**; never resets the development database. All HTTP requests use authenticated Fastify handlers via `inject()`. No external AI call is made. The 15-second harness deadline detects hangs; it is not a production lock timeout.

Run from the repository root:

````sh
sed -n '/^```javascript$/,/^```$/p' reviews/evidence/gate-04/retest-1/AUTHORING_RACE_PROBES.md | sed '1d;$d' | node --conditions=@ltw/source --input-type=module
````

```javascript
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { createThrowawayDatabase } from './apps/server/src/testing/throwaway-database.ts';
import { PostgresEventStore } from './apps/server/src/world-engine/postgres-event-store.ts';
import { PostgresProposalStore } from './apps/server/src/authoring/postgres-proposal-store.ts';
import { InMemoryProposalStore } from './apps/server/src/authoring/proposal-store.ts';
import {
  ravenfordApp,
  seededEngine,
  testAiGateway,
  testAuthoring,
  TOKENS,
  post,
  get,
} from './apps/server/src/testing/ravenford-app.ts';
import {
  WorldEngine,
  SequentialIds,
  SteppingClock,
  replay,
  checkWorldIntegrity,
} from './packages/domain/src/index.ts';
import { createCombatEngine } from './packages/combat/src/engine.ts';
const require = createRequire(new URL('./apps/server/package.json', `file://${process.cwd()}/`));
const { Pool } = require('pg');
const base = '/campaigns/ravenford/authoring/proposals';
const npc = {
  type: 'CreateEntity',
  entityId: 'g04-r1-npc',
  kind: 'npc',
  name: 'Earlier name',
  existsSince: null,
  placement: { locationId: 'north-gate', since: null },
};
const commands = [npc, { type: 'UpdateEntityProfile', entityId: 'mira-vale', name: 'Retest Mira' }];
const output = { matrix: [], retries: [], recovery: [] };
const defer = () => {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
};
const deadline = (p, label) => {
  let timer;
  return Promise.race([
    p,
    new Promise(
      (_, reject) => (timer = setTimeout(() => reject(new Error(`timeout: ${label}`)), 15000)),
    ),
  ]).finally(() => clearTimeout(timer));
};
const worker = String.raw`
import { createRequire } from 'node:module';
import { PostgresAiTraceStore } from './apps/server/src/ai/postgres-trace-store.ts';
import { PostgresEventStore } from './apps/server/src/world-engine/postgres-event-store.ts';
import { PostgresProposalStore } from './apps/server/src/authoring/postgres-proposal-store.ts';
import { ravenfordApp, testAiGateway, testAuthoring, TOKENS, post, get } from './apps/server/src/testing/ravenford-app.ts';
import { WorldEngine, SequentialIds, SteppingClock } from './packages/domain/src/index.ts';
import { createCombatEngine } from './packages/combat/src/engine.ts';
const require = createRequire(new URL('./apps/server/package.json', 'file://' + process.cwd() + '/'));
const { Pool } = require('pg');
let pool, locks, app, armed = false, release;
process.on('message', async ({ id, type, ...data }) => {
 try {
  let value = null;
  if (type === 'init') {
   pool = new Pool({ connectionString: data.url });
   locks = new Pool({ connectionString: data.url, max: 4 });
   const real = new PostgresProposalStore(pool, locks);
   const proposals = {
    exclusive: (...args) => real.exclusive(...args),
    append: r => real.append(r),
    latest: async (...args) => {
     const revision = await real.latest(...args);
     if (armed) {
      armed = false;
      const wait = new Promise(r => release = r);
      process.send({ type: 'paused' });
      await wait;
     }
     return revision;
    }
   };
   const engine = new WorldEngine({ store: new PostgresEventStore(pool), ids: new SequentialIds(data.namespace), clock: new SteppingClock(), combat: createCombatEngine() });
   const ai = { ...testAiGateway({ id: 'scripted', generate: async () => ({ model: 'review-script', usage: null, output: { summary: 'Review serialization', commands: data.commands } }) }), traces: new PostgresAiTraceStore(pool) };
   app = await ravenfordApp(engine, ai, { ...testAuthoring(), proposals });
  } else if (type === 'arm') armed = true;
  else if (type === 'release') release();
  else if (type === 'request') {
   const response = data.method === 'get' ? await get(app, data.path, TOKENS.dm) : await post(app, data.path, data.body, TOKENS.dm);
   value = { http: response.statusCode, body: response.json() };
  } else if (type === 'close') {
   await app.close(); await Promise.all([pool.end(), locks.end()]);
  }
  process.send({ id, value });
  if (type === 'close') process.disconnect();
 } catch (error) { process.send({ id, error: error.stack }); }
});
`;
async function startWorker(url, namespace) {
  const child = spawn(
    process.execPath,
    ['--conditions=@ltw/source', '--input-type=module', '-e', worker],
    { cwd: process.cwd(), stdio: ['ignore', 'ignore', 'pipe', 'ipc'] },
  );
  const requests = new Map();
  let serial = 0,
    stderr = '',
    pause = defer();
  child.stderr.on('data', (d) => (stderr += d));
  child.on('message', (m) => {
    if (m.type === 'paused') pause.resolve();
    else {
      const request = requests.get(m.id);
      requests.delete(m.id);
      if (m.error) request?.reject(new Error(m.error));
      else request?.resolve(m.value);
    }
  });
  child.on('exit', (code, signal) => {
    for (const r of requests.values())
      r.reject(new Error(`worker exited ${code ?? signal}: ${stderr}`));
    requests.clear();
  });
  const rpc = (type, data = {}) =>
    deadline(
      new Promise((resolve, reject) => {
        const id = ++serial;
        requests.set(id, { resolve, reject });
        child.send({ id, type, ...data });
      }),
      type,
    );
  await rpc('init', { url, namespace, commands });
  return {
    rpc,
    pid: child.pid,
    paused: () => deadline(pause.promise, 'pause'),
    kill: () => child.kill('SIGKILL'),
    close: () => (child.connected ? rpc('close') : Promise.resolve()),
  };
}
function memoryClient(app, arm) {
  return {
    rpc: async (type, data = {}) => {
      if (type === 'arm') {
        arm.armed = true;
        return;
      }
      if (type === 'release') {
        arm.release.resolve();
        return;
      }
      const r =
        data.method === 'get'
          ? await get(app, data.path, TOKENS.dm)
          : await post(app, data.path, data.body, TOKENS.dm);
      return { http: r.statusCode, body: r.json() };
    },
    paused: () => deadline(arm.pause.promise, 'memory pause'),
  };
}
const request = (client, path, body) =>
  client.rpc('request', { path, body, method: body === undefined ? 'get' : 'post' });
const compact = (r) => ({
  http: r.http,
  status: r.body.status ?? r.body.proposal?.status ?? null,
  code: r.body.code ?? r.body.error?.code ?? null,
  revision: r.body.proposal?.revision ?? null,
});
async function waitForLock(pool) {
  const end = Date.now() + 10000;
  while (Date.now() < end) {
    const { rows } = await pool.query(
      "SELECT count(*)::int AS n FROM pg_locks WHERE locktype = 'advisory' AND NOT granted AND database = (SELECT oid FROM pg_database WHERE datname = current_database())",
    );
    if (rows[0].n > 0) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('no waiting advisory-lock contender');
}
function expected(op, state, revision) {
  if (op === 'edit' || op === 'option')
    return state === 'DRAFT' && revision === 1 ? [201, 'DRAFT', 2] : [409, state, revision];
  if (op === 'commit')
    return revision === 1
      ? [200, state === 'DRAFT' ? 'COMMITTED' : state, revision]
      : [409, state, revision];
  return state === 'DRAFT' ? [409, state, revision] : [200, 'UNDONE', revision];
}
for (const mode of ['memory-one-process', 'postgres-two-processes']) {
  for (const initial of ['DRAFT', 'COMMITTED'])
    for (const firstOp of ['edit', 'option', 'commit', 'undo'])
      for (const secondOp of ['edit', 'option', 'commit', 'undo']) {
        let db,
          pool,
          apps = [],
          children = [],
          clients,
          engine;
        try {
          if (mode === 'postgres-two-processes') {
            db = await createThrowawayDatabase({ migrate: true });
            pool = new Pool({ connectionString: db.url });
            engine = await seededEngine(new PostgresEventStore(pool));
            children = [await startWorker(db.url, 710), await startWorker(db.url, 720)];
            clients = children;
            assert.notEqual(clients[0].pid, clients[1].pid);
          } else {
            engine = await seededEngine();
            const real = new InMemoryProposalStore();
            clients = [];
            for (let i = 0; i < 2; i++) {
              const gate = { armed: false, pause: defer(), release: defer() };
              const proposals = {
                exclusive: (...a) => real.exclusive(...a),
                append: (r) => real.append(r),
                latest: async (...a) => {
                  const r = await real.latest(...a);
                  if (gate.armed) {
                    gate.armed = false;
                    gate.pause.resolve();
                    await gate.release.promise;
                  }
                  return r;
                },
              };
              const app = await ravenfordApp(engine, testAiGateway(), {
                ...testAuthoring(),
                proposals,
              });
              apps.push(app);
              clients.push(memoryClient(app, gate));
            }
          }
          const original = await engine.load('ravenford');
          let draftBody = { summary: 'Review serialization', commands };
          if (pool) {
            const intent = await request(clients[0], '/campaigns/ravenford/ai/intents', {
              text: 'Propose the review NPC and rename Mira.',
            });
            assert.equal(intent.body.status, 'PROPOSED');
            draftBody = { traceId: intent.body.traceId };
          }
          const draft = await request(clients[0], base, draftBody);
          assert.equal(draft.http, 201);
          const path = `${base}/${draft.body.proposal.proposalId}`;
          const option = draft.body.preview.warnings
            .flatMap((w) => w.options ?? [])
            .find((o) => o.kind === 'edit');
          assert.ok(option);
          const confirm = { revision: 1, confirmation: draft.body.preview.confirmation };
          const operation = (client, op) =>
            request(
              client,
              `${path}/${op === 'edit' || op === 'option' ? 'revisions' : op}`,
              op === 'edit'
                ? { basedOnRevision: 1, commands: [{ ...npc, name: 'Latest name' }, commands[1]] }
                : op === 'option'
                  ? { basedOnRevision: 1, optionId: option.optionId }
                  : op === 'commit'
                    ? confirm
                    : {},
            );
          if (initial === 'COMMITTED')
            assert.equal((await operation(clients[0], 'commit')).body.status, 'accepted');
          await clients[0].rpc('arm');
          const first = operation(clients[0], firstOp);
          await clients[0].paused();
          let secondSettled = false;
          const second = operation(clients[1], secondOp).then((r) => {
            secondSettled = true;
            return r;
          });
          if (pool) await waitForLock(pool);
          else await new Promise((r) => setTimeout(r, 10));
          assert.equal(secondSettled, false);
          await clients[0].rpc('release');
          const [one, two] = await Promise.all([first, second]);
          const e1 = expected(firstOp, initial, 1),
            e2 = expected(secondOp, e1[1], e1[2]);
          assert.equal(one.http, e1[0], JSON.stringify({ mode, initial, firstOp, secondOp, one }));
          assert.equal(two.http, e2[0], JSON.stringify({ mode, initial, firstOp, secondOp, two }));
          let reader = clients[0];
          if (pool) {
            await Promise.all(children.map((c) => c.close()));
            children = [await startWorker(db.url, 730)];
            reader = children[0];
            engine = new WorldEngine({
              store: new PostgresEventStore(pool),
              ids: new SequentialIds(740),
              clock: new SteppingClock(),
              combat: createCombatEngine(),
            });
          }
          const view = (await request(reader, path)).body.proposal;
          assert.deepEqual([view.status, view.revision], [e2[1], e2[2]]);
          assert.equal(view.source.kind, pool ? 'ai' : 'dm');
          if (pool)
            assert.equal(
              (await request(reader, `/campaigns/ravenford/ai/traces/${view.source.traceId}`)).http,
              200,
            );
          const snap = await engine.load('ravenford');
          assert.deepEqual(replay(snap.history), snap.state);
          assert.deepEqual(checkWorldIntegrity(snap.state), []);
          const entity = snap.state.entities.get(npc.entityId),
            mira = snap.state.entities.get('mira-vale');
          if (view.status === 'COMMITTED') {
            assert.equal(view.commit.revision, view.revision);
            assert.equal(entity.name, view.commands[0].name);
            const update = view.commands[1];
            if (update.name !== undefined) assert.equal(mira.name, update.name);
            if (update.description !== undefined)
              assert.equal(mira.description, update.description);
          } else {
            assert.equal(entity, undefined);
            assert.deepEqual(mira, original.state.entities.get('mira-vale'));
          }
          output.matrix.push({
            mode,
            source: view.source,
            initial,
            firstOp,
            secondOp,
            first: compact(one),
            second: compact(two),
            waited: true,
            restart: !!pool,
            latestRevision: view.revision,
            committedRevision: view.commit?.revision ?? null,
            status: view.status,
            canonicalName: entity?.name ?? null,
            replayEqual: true,
          });
        } finally {
          await Promise.all(apps.map((a) => a.close()));
          await Promise.all(children.map((c) => c.close()));
          if (pool) await pool.end();
          if (db) await db.drop();
        }
      }
  console.log(`matrix complete: ${mode}`);
}
// A response lost to a killed server must be recoverable from another process.
for (const phase of ['before-write', 'after-write']) {
  const db = await createThrowawayDatabase({ migrate: true });
  const pool = new Pool({ connectionString: db.url });
  let children = [];
  try {
    let engine = await seededEngine(new PostgresEventStore(pool));
    children = [await startWorker(db.url, 810), await startWorker(db.url, 820)];
    const draft = await request(children[0], base, {
      summary: 'Restart and retries',
      commands: [npc],
    });
    assert.equal(draft.http, 201);
    const path = `${base}/${draft.body.proposal.proposalId}`,
      confirm = { revision: 1, confirmation: draft.body.preview.confirmation };
    if (phase === 'before-write') {
      await children[0].rpc('arm');
      const killed = request(children[0], `${path}/commit`, confirm).catch((e) => e.message);
      await children[0].paused();
      const survivor = request(children[1], `${path}/commit`, confirm);
      await waitForLock(pool);
      children[0].kill();
      await killed;
      assert.equal((await survivor).body.status, 'accepted');
    } else {
      assert.equal((await request(children[0], `${path}/commit`, confirm)).body.status, 'accepted');
      children[0].kill();
    }
    const count = async () =>
      Number((await pool.query('SELECT count(*) AS n FROM ltw_events')).rows[0].n);
    const before = await count();
    const original = await request(children[1], `${path}/commit`, confirm);
    assert.equal(original.body.status, 'duplicate');
    await children[1].close();
    children = [await startWorker(db.url, 830)];
    for (const state of ['COMMITTED', 'UNDONE']) {
      if (state === 'UNDONE')
        assert.equal((await request(children[0], `${path}/undo`, {})).body.status, 'accepted');
      const events = await count();
      const retry = await request(children[0], `${path}/commit`, confirm);
      assert.deepEqual(retry.body, original.body);
      for (const body of [
        { ...confirm, revision: 2 },
        { ...confirm, confirmation: { ...confirm.confirmation, riskLevel: 'L3' } },
        {
          ...confirm,
          confirmation: { ...confirm.confirmation, acknowledgedWarnings: ['NAME_IN_USE@0'] },
        },
      ])
        assert.equal((await request(children[0], `${path}/commit`, body)).http, 409);
      if (state === 'UNDONE')
        assert.equal((await request(children[0], `${path}/undo`, {})).body.status, 'duplicate');
      assert.equal(await count(), events);
      await children[0].close();
      children = [await startWorker(db.url, state === 'COMMITTED' ? 840 : 850)];
      assert.deepEqual((await request(children[0], `${path}/commit`, confirm)).body, original.body);
      assert.equal(await count(), events);
      engine = new WorldEngine({
        store: new PostgresEventStore(pool),
        ids: new SequentialIds(860),
        clock: new SteppingClock(),
        combat: createCombatEngine(),
      });
      const snap = await engine.load('ravenford');
      assert.deepEqual(replay(snap.history), snap.state);
      assert.deepEqual(checkWorldIntegrity(snap.state), []);
      assert.equal(snap.state.entities.has(npc.entityId), state === 'COMMITTED');
      output.retries.push({
        phase,
        state,
        retry: compact(retry),
        changedRevision: 409,
        changedRisk: 409,
        changedWarnings: 409,
        restartDuplicate: true,
        eventCountUnchanged: true,
        noResurrection: state === 'UNDONE',
      });
    }
    output.recovery.push({
      phase,
      originalCommittedEventCount: before,
      acceptedExactlyOnce: true,
      survivorUnblocked: true,
    });
  } finally {
    await Promise.all(children.map((c) => c.close()));
    await pool.end();
    await db.drop();
  }
}
await writeFile(
  'reviews/evidence/gate-04/retest-1/authoring-race-results.json',
  JSON.stringify(output, null, 2) + '\n',
);
console.log(
  JSON.stringify({
    matrix: output.matrix.length,
    retries: output.retries.length,
    recovery: output.recovery.length,
    postgresDatabases: 34,
  }),
);
```
