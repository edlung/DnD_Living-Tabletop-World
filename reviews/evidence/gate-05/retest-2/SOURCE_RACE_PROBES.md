# Chronicle generation versus cited-source undo

Two schedules use two independent WorldEngine instances and HTTP applications over one owned PostgreSQL database per schedule. A controlled local narrative provider pauses after receiving the chapter inputs, making the ordering reproducible without production hooks. Both engines have loaded the same starting snapshot.

- Undo-first: the second engine removes the uncited empty inspection while rendering is paused. The first engine's stale GenerateChronicle must return 409 and record no chapter.
- Chapter-first: the chapter commits before the second engine attempts source undo. Despite its earlier cached snapshot, the second engine must refuse with 422 UNDO_UNSAFE naming the new chapter.

Each schedule writes exactly one new canonical event, leaves both engines in agreement, preserves resolved sources for standing chapters, and passes replay, integrity and re-decision. A fresh app/engine over PostgreSQL preserves each result. Both owned databases are removed. These schedules use separate engines in one Node process, not separate processes; the authoring-race recipe separately tests process isolation. Providers are local doubles; no live AI call or source change is made.

Run from the repository root with Node 24+, installed workspace dependencies and PostgreSQL:

````sh
sed -n '/^```javascript$/,/^```$/p' reviews/evidence/gate-05/retest-2/SOURCE_RACE_PROBES.md | sed '1d;$d' | node --conditions=@ltw/source --input-type=module
````

```javascript
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createThrowawayDatabase } from './apps/server/src/testing/throwaway-database.ts';
import { PostgresEventStore } from './apps/server/src/world-engine/postgres-event-store.ts';
import { PostgresAiTraceStore } from './apps/server/src/ai/postgres-trace-store.ts';
import {
  seededEngine,
  ravenfordApp,
  testAiGateway,
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
  redecideEffective,
} from './packages/domain/src/index.ts';
import { createCombatEngine } from './packages/combat/src/engine.ts';
import { skillModifier } from './packages/rules/src/index.ts';
const require = createRequire(new URL('./apps/server/package.json', `file://${process.cwd()}/`));
const { Pool } = require('pg');
const results = [];
const base = '/campaigns/ravenford';
for (const order of ['undo-first', 'chapter-first']) {
  const db = await createThrowawayDatabase({ migrate: true });
  const pool = new Pool({ connectionString: db.url });
  let a, b, release;
  let pending;
  try {
    let entered;
    const providerEntered = new Promise((resolve) => {
      entered = resolve;
    });
    const barrier = new Promise((resolve) => {
      release = resolve;
    });
    const requests = [];
    const provider = {
      id: 'r2-controlled-narrative',
      generate: async (request) => {
        const task = request.task;
        requests.push({ capability: request.capability, task });
        entered();
        await barrier;
        return {
          model: 'r2-source-race',
          usage: null,
          output: { paragraphs: task.prompt.template },
        };
      },
    };
    const store = new PostgresEventStore(pool);
    const engineA = await seededEngine(store);
    const engineB = new WorldEngine({
      store: new PostgresEventStore(pool),
      ids: new SequentialIds(0x2b0),
      clock: new SteppingClock(),
      combat: createCombatEngine(),
    });
    const ai = { ...testAiGateway(provider), traces: new PostgresAiTraceStore(pool) };
    a = await ravenfordApp(engineA, ai);
    b = await ravenfordApp(engineB);
    let serial = 0;
    const command = async (app, body, token = TOKENS.dm) => {
      const r = await post(
        app,
        base + '/commands',
        { commandId: `r2-source-race-${++serial}`, command: body },
        token,
      );
      return { http: r.statusCode, ...r.json() };
    };
    const created = await command(a, {
      type: 'CreateEntity',
      entityId: 'r2-race-token',
      kind: 'item',
      name: 'Race token',
      existsSince: null,
      placement: { locationId: 'market-square', since: null },
    });
    assert.equal(created.status, 'accepted');
    const examined = await command(
      a,
      {
        type: 'ExamineEntity',
        characterId: 'elowen-starwhisper',
        entityId: 'r2-race-token',
        method: 'inspect',
      },
      TOKENS.player,
    );
    assert.equal(examined.status, 'accepted');
    assert.deepEqual(examined.outcome.discovered, []);
    const before = await engineA.load('ravenford');
    assert.deepEqual(await engineB.load('ravenford'), before);
    pending = post(
      a,
      base + '/chronicle',
      { title: 'Concurrent source undo', perspective: 'DM', from: 0 },
      TOKENS.dm,
    );
    let timer;
    await Promise.race([
      providerEntered,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('provider barrier not reached')), 5000);
      }),
    ]).finally(() => clearTimeout(timer));
    let undoResponse, chapterResponse;
    if (order === 'undo-first') {
      undoResponse = await command(b, { type: 'UndoCommand', targetCommandId: examined.commandId });
      assert.equal(undoResponse.status, 'accepted');
      release();
      const r = await pending;
      chapterResponse = { http: r.statusCode, ...r.json() };
      assert.equal(chapterResponse.http, 409);
      assert.equal(chapterResponse.result.status, 'rejected');
      assert.equal(chapterResponse.chronicleId, null);
    } else {
      release();
      const r = await pending;
      chapterResponse = { http: r.statusCode, ...r.json() };
      assert.equal(chapterResponse.http, 200);
      assert.equal(chapterResponse.result.status, 'accepted');
      undoResponse = await command(b, { type: 'UndoCommand', targetCommandId: examined.commandId });
      assert.equal(undoResponse.http, 422);
      assert.equal(undoResponse.code, 'UNDO_UNSAFE');
      assert.ok(
        undoResponse.details.blockers.some((x) => x.commandId === chapterResponse.chronicleId),
      );
    }
    const after = await engineA.load('ravenford');
    assert.equal(after.state.version, before.state.version + 1);
    assert.deepEqual(await engineB.load('ravenford'), after);
    assert.deepEqual(replay(after.history), after.state);
    assert.deepEqual(checkWorldIntegrity(after.state), []);
    assert.equal(
      redecideEffective(
        await store.loadCommands('ravenford'),
        after,
        skillModifier,
        createCombatEngine(),
      ),
      null,
    );
    assert.equal(after.state.chronicles.size, order === 'undo-first' ? 0 : 1);
    const view = (await get(a, base + '/chronicle?perspective=DM', TOKENS.dm)).json();
    if (order === 'chapter-first') {
      const chapter = after.state.chronicles.get(chapterResponse.chronicleId);
      const entry = chapter.entries.find((e) => e.source.commandId === examined.commandId);
      assert.ok(entry);
      assert.equal(view.chapters[0].entries.find((e) => e.key === entry.key).sources.length, 1);
    }
    await a.close();
    a = null;
    await b.close();
    b = null;
    const fresh = new WorldEngine({
      store: new PostgresEventStore(pool),
      ids: new SequentialIds(0x2b1),
      clock: new SteppingClock(),
      combat: createCombatEngine(),
    });
    a = await ravenfordApp(fresh);
    assert.deepEqual(await fresh.load('ravenford'), after);
    assert.deepEqual((await get(a, base + '/chronicle?perspective=DM', TOKENS.dm)).json(), view);
    results.push({
      order,
      examined,
      undoResponse,
      chapterResponse,
      beforeVersion: before.state.version,
      afterVersion: after.state.version,
      requests,
      view,
      bothEnginesAgree: true,
      restartEqual: true,
      redecisionEqual: true,
    });
  } finally {
    release?.();
    if (pending) await pending.catch(() => {});
    if (a) await a.close();
    if (b) await b.close();
    await pool.end();
    await db.drop();
  }
}
await writeFile(
  'reviews/evidence/gate-05/retest-2/source-race-results.json',
  JSON.stringify({ cases: results }, null, 2) + '\n',
);
console.log(JSON.stringify({ schedules: results.length, allAssertionsPassed: true }));
```
