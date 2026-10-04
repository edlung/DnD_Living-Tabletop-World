# G05-H02: a standing chapter loses an examination source

Two isolated PostgreSQL worlds reproduce G05-H02 through authenticated HTTP. One repeats a successful inspection after its clue was already revealed. The other inspects an ordinary item with no clue for the first time. Both inspections are accepted with no roll and no discoveries; both appear as sources in a newly generated version 3 DM chapter.

The script asserts that undo of each cited inspection is incorrectly accepted. The stored chapter and prose remain; the matching entry now has `sources: []`; re-decision rejects the standing GenerateChronicle as INVALID_CHRONICLE. The failure survives a fresh engine and HTTP app. Ordinary replay/integrity and permission controls still pass, and undo of a genuine source placement is correctly refused. Undo of the chapter recovers the oracle.

**Successful execution reproduces the finding and supports FAIL.** No fabricated event, direct database mutation of current history, or source fix is used.

Run from the repository root with Node 24+, installed workspace dependencies and PostgreSQL:

````sh
sed -n '/^```javascript$/,/^```$/p' reviews/evidence/gate-05/retest-1/SOURCE_OCCURRENCE_PROBES.md | sed '1d;$d' | node --conditions=@ltw/source --input-type=module
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
          { commandId: `g05-r1-history-${++serial}`, command },
          token,
        );
        return { http: r.statusCode, ...r.json() };
      },
      chapter: async (perspective) => {
        const r = await post(
          app,
          base + '/chronicle',
          { title: 'Gate 05 history probe', perspective, from: 0 },
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
const findings = [];
for (const mode of ['repeat-after-discovery', 'first-inspection-no-clues'])
  await world(async (w) => {
    accepted(await act(w, { type: 'EnterLocation', locationId: 'old-trade-road' }));
    accepted(await act(w, { type: 'EnterLocation', locationId: 'abandoned-caravan-site' }));
    let entityId = 'strange-symbol';
    if (mode === 'repeat-after-discovery')
      accepted(await act(w, { type: 'ExamineEntity', entityId, method: 'inspect' }));
    else {
      entityId = 'r1-ordinary-token';
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
    assert.deepEqual(examined.outcome.discovered, []);
    const generated = await w.chapter('DM');
    accepted(generated.result);
    const id = generated.chronicleId;
    const before = await w.snapshot();
    const chapter = before.state.chronicles.get(id);
    const sourceEvents = before.history.filter((e) => e.causation.commandId === examined.commandId);
    const entry = chapter.entries.find(
      (e) => e.source.kind === 'event' && e.source.commandId === examined.commandId,
    );
    assert.ok(entry);
    assert.equal(entry.source.eventType, 'EvidenceExamined');
    const chapterEvent = before.history.find(
      (e) => e.type === 'ChronicleGenerated' && e.payload.chronicleId === id,
    );
    assert.equal(chapterEvent.schemaVersion, 3);
    await audit(w);
    const viewBefore = await w.read('/chronicle?perspective=DM', TOKENS.dm);
    // Control: a standing chapter protects a cited placement that writes a fact.
    const sourcePlacement = before.history.find(
      (e) => e.type === 'EntityPlaced' && e.payload.entityId === 'elowen-starwhisper',
    );
    const protectedSource = await undo(w, sourcePlacement.causation.commandId);
    chapterBlock(protectedSource, id);
    const undone = accepted(await undo(w, examined.commandId));
    const after = await w.snapshot();
    assert.ok(after.state.commands.get(examined.commandId).undoneBy);
    assert.deepEqual(after.state.chronicles.get(id), chapter);
    assert.deepEqual(replay(after.history), after.state);
    assert.deepEqual(checkWorldIntegrity(after.state), []);
    const divergence = await oracle(w);
    assert.equal(divergence.commandId, id);
    const viewAfter = await w.read('/chronicle?perspective=DM', TOKENS.dm);
    const beforeEntry = viewBefore.body.chapters
      .find((c) => c.chronicleId === id)
      .entries.find((e) => e.key === entry.key);
    const afterEntry = viewAfter.body.chapters
      .find((c) => c.chronicleId === id)
      .entries.find((e) => e.key === entry.key);
    assert.equal(beforeEntry.sources.length, 1);
    assert.deepEqual(afterEntry.sources, []);
    assert.deepEqual({ ...afterEntry, sources: beforeEntry.sources }, beforeEntry);
    await w.restart();
    assert.deepEqual(await w.read('/chronicle?perspective=DM', TOKENS.dm), viewAfter);
    assert.deepEqual(await oracle(w), divergence);
    assert.deepEqual((await w.snapshot()).state, after.state);
    assert.equal((await w.read('/chronicle?perspective=DM')).http, 403);
    assert.equal((await w.read('/chronicle?perspective=DM', TOKENS.outsider)).http, 404);
    const recovery = accepted(await undo(w, id));
    await audit(w);
    findings.push({
      mode,
      examined,
      sourceEvents,
      chapterEvent,
      entry,
      protectedSource,
      undone,
      undoneSource: after.state.commands.get(examined.commandId),
      beforeEntry,
      afterEntry,
      viewAfter: viewAfter.body,
      divergence,
      storedChapterUnchanged: true,
      restartPreservesDivergence: true,
      replayEqual: true,
      structuralIntegrity: [],
      recovery,
      reverseRecovery: true,
    });
  });
await writeFile(
  'reviews/evidence/gate-05/retest-1/source-occurrence-results.json',
  JSON.stringify({ finding: 'G05-H02', cases: findings }, null, 2) + '\n',
);
console.log(JSON.stringify({ cases: findings.length, findingReproduced: 'G05-H02' }));
```
