# Retest 2: cited empty inspections and uncited controls

Five owned PostgreSQL databases. The two original G05-H02 modes (repeated inspection after discovery, first inspection without clues) explicitly write no event-footprint facts and are cited by a new version 4 DM chapter. Undo must return 422 UNDO_UNSAFE naming that chapter as the only blocker, preserve the full snapshot and resolved source, and do so after a fresh engine/application reload. Two independent chapters must both be removed before undo of their shared occurrence succeeds. Replay, integrity and re-decision hold throughout; player/outsider DM reads remain refused.

Three independent controls keep uncited empty inspections undoable: the chapter's window starts later, the chapter is PARTY/memory-only, or the examination happened after the chapter. Their standing chapters remain unchanged after undo and reload. No source or fixture is modified; all owned databases are removed. Restart here means application/engine reload from PostgreSQL, not restarting the database process.

Run from the repository root with Node 24+, installed workspace dependencies and PostgreSQL:

````sh
sed -n '/^```javascript$/,/^```$/p' reviews/evidence/gate-05/retest-2/SOURCE_OCCURRENCE_PROBES.md | sed '1d;$d' | node --conditions=@ltw/source --input-type=module
````

```javascript
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { createThrowawayDatabase } from './apps/server/src/testing/throwaway-database.ts';
import { PostgresEventStore } from './apps/server/src/world-engine/postgres-event-store.ts';
import { PostgresAiTraceStore } from './apps/server/src/ai/postgres-trace-store.ts';
import {
  seededEngine,
  ravenfordApp,
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
  redecideEffective,
} from './packages/domain/src/index.ts';
import { footprintOf } from './packages/domain/src/kernel/facts.ts';
import { skillModifier } from './packages/rules/src/index.ts';
import { createCombatEngine } from './packages/combat/src/engine.ts';
const require = createRequire(new URL('./apps/server/package.json', `file://${process.cwd()}/`));
const { Pool } = require('pg');
const base = '/campaigns/ravenford';
const results = { chronicle: [], quest: [], membership: [] };
async function world(work) {
  const db = await createThrowawayDatabase({ migrate: true });
  const pool = new Pool({ connectionString: db.url });
  let app;
  try {
    const store = new PostgresEventStore(pool);
    let engine = await seededEngine(store);
    let serial = 0;
    let restartSerial = 950;
    const ai = { ...testAiGateway(), traces: new PostgresAiTraceStore(pool) };
    const authoring = testAuthoring();
    app = await ravenfordApp(engine, ai, authoring);
    const ctx = {
      store,
      engine: () => engine,
      snapshot: () => engine.load('ravenford'),
      read: async (path, token = TOKENS.player) => {
        const r = await get(app, base + path, token);
        return { http: r.statusCode, body: r.json() };
      },
      cmd: async (command, token = TOKENS.dm) => {
        const r = await post(
          app,
          base + '/commands',
          { commandId: `g05-r2-source-${++serial}`, command },
          token,
        );
        return { http: r.statusCode, ...r.json() };
      },
      chapter: async (perspective, window = {}) => {
        const r = await post(
          app,
          base + '/chronicle',
          { title: 'Gate 05 history probe', perspective, from: 0, ...window },
          TOKENS.dm,
        );
        assert.equal(r.statusCode, 200, r.body);
        return r.json();
      },
      restart: async () => {
        await app.close();
        engine = new WorldEngine({
          store: new PostgresEventStore(pool),
          ids: new SequentialIds(++restartSerial),
          clock: new SteppingClock(),
          combat: createCombatEngine(),
        });
        app = await ravenfordApp(engine, ai, authoring);
      },
    };
    await work(ctx);
  } finally {
    if (app) await app.close();
    await pool.end();
    await db.drop();
  }
}

const accepted = (r) => {
  assert.equal(r.status, 'accepted', JSON.stringify(r));
  return r;
};
const undo = (w, id) => w.cmd({ type: 'UndoCommand', targetCommandId: id });
const oracle = async (w) =>
  redecideEffective(
    await w.store.loadCommands('ravenford'),
    await w.snapshot(),
    skillModifier,
    createCombatEngine(),
  );
const audit = async (w) => {
  const s = await w.snapshot();
  assert.deepEqual(replay(s.history), s.state);
  assert.deepEqual(checkWorldIntegrity(s.state), []);
  assert.equal(await oracle(w), null);
};
const act = (w, c) => w.cmd({ characterId: 'elowen-starwhisper', ...c }, TOKENS.player);
const quest = (w) => w.read('/quests?perspective=PARTY');
const stages = (r) => r.body.quests.flatMap((q) => q.transitions.map((t) => t.stage));
const chapterBlock = (r, chapterId) => {
  assert.equal(r.http, 422, JSON.stringify(r));
  assert.equal(r.code, 'UNDO_UNSAFE');
  assert.ok(
    r.details.blockers.some(
      (b) => b.commandId === chapterId && b.commandType === 'GenerateChronicle',
    ),
  );
};
const caseResults = [];
for (const mode of ['repeat-after-discovery', 'first-inspection-no-clues'])
  await world(async (w) => {
    accepted(await act(w, { type: 'EnterLocation', locationId: 'old-trade-road' }));
    accepted(await act(w, { type: 'EnterLocation', locationId: 'abandoned-caravan-site' }));
    let entityId = 'strange-symbol';
    if (mode === 'repeat-after-discovery')
      accepted(await act(w, { type: 'ExamineEntity', entityId, method: 'inspect' }));
    else {
      entityId = 'r2-ordinary-token';
      accepted(
        await w.cmd({
          type: 'CreateEntity',
          entityId,
          kind: 'item',
          name: 'Ordinary token',
          existsSince: null,
          placement: { locationId: 'abandoned-caravan-site', since: null },
        }),
      );
    }
    const examined = accepted(await act(w, { type: 'ExamineEntity', entityId, method: 'inspect' }));
    assert.equal(examined.outcome.roll, null);
    assert.deepEqual(examined.outcome.discovered, []);
    const generated = await w.chapter('DM');
    accepted(generated.result);
    const id = generated.chronicleId;
    const before = await w.snapshot();
    const chapter = before.state.chronicles.get(id);
    const sourceEvents = before.history.filter((e) => e.causation.commandId === examined.commandId);
    assert.deepEqual(
      sourceEvents.flatMap((e) => footprintOf(e).writes),
      [],
    );
    const entry = chapter.entries.find(
      (e) => e.source.kind === 'event' && e.source.commandId === examined.commandId,
    );
    assert.ok(entry);
    assert.equal(entry.source.eventType, 'EvidenceExamined');
    assert.ok(chapter.rests.includes(`command:${examined.commandId}`));
    const chapterEvent = before.history.find(
      (e) => e.type === 'ChronicleGenerated' && e.payload.chronicleId === id,
    );
    assert.equal(chapterEvent.schemaVersion, 4);
    const viewBefore = await w.read('/chronicle?perspective=DM', TOKENS.dm);
    const beforeEntry = viewBefore.body.chapters
      .find((c) => c.chronicleId === id)
      .entries.find((e) => e.key === entry.key);
    assert.equal(beforeEntry.sources.length, 1);
    await audit(w);
    const refused = await undo(w, examined.commandId);
    chapterBlock(refused, id);
    assert.deepEqual(
      refused.details.blockers.map((b) => b.commandId),
      [id],
    );
    assert.deepEqual(await w.snapshot(), before);
    assert.deepEqual(await w.read('/chronicle?perspective=DM', TOKENS.dm), viewBefore);
    await audit(w);
    await w.restart();
    assert.deepEqual(await w.snapshot(), before);
    const refusedAfterRestart = await undo(w, examined.commandId);
    chapterBlock(refusedAfterRestart, id);
    assert.deepEqual(await w.snapshot(), before);
    assert.deepEqual(await w.read('/chronicle?perspective=DM', TOKENS.dm), viewBefore);
    await audit(w);
    assert.equal((await w.read('/chronicle?perspective=DM')).http, 403);
    assert.equal((await w.read('/chronicle?perspective=DM', TOKENS.outsider)).http, 404);
    // Two independent consumers must both release the occurrence before it can leave canon.
    const next = await w.chapter('DM');
    accepted(next.result);
    const nextId = next.chronicleId;
    const twoConsumers = await undo(w, examined.commandId);
    chapterBlock(twoConsumers, id);
    chapterBlock(twoConsumers, nextId);
    const recoverFirst = accepted(await undo(w, id));
    await audit(w);
    const stillProtected = await undo(w, examined.commandId);
    chapterBlock(stillProtected, nextId);
    assert.deepEqual(
      stillProtected.details.blockers.map((b) => b.commandId),
      [nextId],
    );
    const recoverSecond = accepted(await undo(w, nextId));
    const recoverSource = accepted(await undo(w, examined.commandId));
    await audit(w);
    const recovered = await w.snapshot();
    await w.restart();
    assert.deepEqual(await w.snapshot(), recovered);
    await audit(w);
    caseResults.push({
      mode,
      examined,
      sourceEvents,
      chapterEvent,
      beforeEntry,
      refused,
      refusedAfterRestart,
      twoConsumers,
      stillProtected,
      recoverFirst,
      recoverSecond,
      recoverSource,
      refusalAtomic: true,
      sourceResolved: true,
      restartEqual: true,
      redecisionEqual: true,
      allConsumersMustBeUndone: true,
    });
  });
const controls = [];
for (const mode of ['outside-window', 'memory-only-party', 'after-chapter'])
  await world(async (w) => {
    const entityId = 'r2-plain-token';
    accepted(
      await w.cmd({
        type: 'CreateEntity',
        entityId,
        kind: 'item',
        name: 'Plain token',
        existsSince: null,
        placement: { locationId: 'market-square', since: null },
      }),
    );
    const inspect = async () =>
      accepted(await act(w, { type: 'ExamineEntity', entityId, method: 'inspect' }));
    let examined, generated;
    if (mode === 'after-chapter') {
      generated = await w.chapter('DM');
      examined = await inspect();
    } else {
      examined = await inspect();
      if (mode === 'outside-window') {
        accepted(await w.cmd({ type: 'AdvanceWorldTime', by: 1 }));
        accepted(
          await w.cmd({
            type: 'CreateEntity',
            entityId: 'r2-window-witness',
            kind: 'npc',
            name: 'Window witness',
            existsSince: 36001,
          }),
        );
        generated = await w.chapter('DM', { from: 36001 });
      } else generated = await w.chapter('PARTY');
    }
    assert.equal(examined.outcome.roll, null);
    assert.deepEqual(examined.outcome.discovered, []);
    accepted(generated.result);
    const snap = await w.snapshot();
    const chapter = snap.state.chronicles.get(generated.chronicleId);
    assert.ok(
      !chapter.entries.some(
        (e) => e.source.kind === 'event' && e.source.commandId === examined.commandId,
      ),
    );
    assert.ok(!chapter.rests.includes(`command:${examined.commandId}`));
    const beforeView = await w.read('/chronicle?perspective=DM', TOKENS.dm);
    await audit(w);
    const undoUncited = accepted(await undo(w, examined.commandId));
    assert.deepEqual(await w.read('/chronicle?perspective=DM', TOKENS.dm), beforeView);
    await audit(w);
    await w.restart();
    assert.deepEqual(await w.read('/chronicle?perspective=DM', TOKENS.dm), beforeView);
    await audit(w);
    controls.push({
      mode,
      examined,
      chapter,
      undoUncited,
      chapterUnchanged: true,
      restartEqual: true,
      redecisionEqual: true,
    });
  });
await writeFile(
  'reviews/evidence/gate-05/retest-2/source-occurrence-results.json',
  JSON.stringify({ finding: 'G05-H02', outcome: 'CLOSED', cases: caseResults, controls }, null, 2) +
    '\n',
);
console.log(
  JSON.stringify({
    originalVariants: caseResults.length,
    uncitedControls: controls.length,
    allAssertionsPassed: true,
  }),
);
```
