# Chronicle undo and historical quest transitions

Four isolated PostgreSQL worlds, through authenticated HTTP. Two rename an entity whose name the DM chapter uses, generate the chapter, and undo the rename. They assert that the undo is incorrectly accepted and that the standing GenerateChronicle command diverges when re-decided. Ordinary replay and structural integrity still pass. A protected source-placement undo is refused; undoing the chapter recovers the oracle. Both character and location names are checked after restart.

Two further worlds examine Strange Symbol at the caravan site or in town, then move it at a later world time. They assert that the earlier quest milestone incorrectly disappears or appears while the original examination event is unchanged. Restart preserves the result; undoing only the later move restores the original quest view. Public/outsider controls remain isolated.

**Successful execution reproduces G05-H01 and G05-M01; it supports FAIL.** The script creates and removes four owned databases. It does not change production code or fabricate events.

Run from the repository root with Node 24+, installed workspace dependencies and PostgreSQL:

````sh
sed -n '/^```javascript$/,/^```$/p' reviews/evidence/gate-05/HISTORY_BOUNDARY_PROBES.md | sed '1d;$d' | node --conditions=@ltw/source --input-type=module
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
const require = createRequire(new URL('./apps/server/package.json', `file://${process.cwd()}/`));
const { Pool } = require('pg');
const base = '/campaigns/ravenford';
const results = { chronicle: [], quest: [] };
async function world(work) {
  const db = await createThrowawayDatabase({ migrate: true });
  const pool = new Pool({ connectionString: db.url });
  let app;
  try {
    const store = new PostgresEventStore(pool);
    let engine = await seededEngine(store);
    let serial = 0;
    const ai = { ...testAiGateway(), traces: new PostgresAiTraceStore(pool) };
    app = await ravenfordApp(engine, ai);
    const ctx = {
      store,
      snapshot: () => engine.load('ravenford'),
      read: async (path, token = TOKENS.player) => {
        const r = await get(app, base + path, token);
        return { http: r.statusCode, body: r.json() };
      },
      cmd: async (command, token = TOKENS.dm) => {
        const r = await post(
          app,
          base + '/commands',
          { commandId: `g05-history-${++serial}`, command },
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
          ids: new SequentialIds(950),
          clock: new SteppingClock(),
          combat: createCombatEngine(),
        });
        app = await ravenfordApp(engine, ai);
      },
    };
    await work(ctx);
  } finally {
    if (app) await app.close();
    await pool.end();
    await db.drop();
  }
}
for (const entityId of ['elowen-starwhisper', 'market-square'])
  await world(async (w) => {
    const before = await w.snapshot(),
      oldName = before.state.entities.get(entityId).name,
      name = 'G05 NAME THAT MUST NOT SURVIVE UNDO';
    const rename = await w.cmd({ type: 'UpdateEntityProfile', entityId, name });
    assert.equal(rename.status, 'accepted');
    const generated = await w.chapter('DM');
    const chapterId = generated.chronicleId;
    let snap = await w.snapshot();
    assert.equal(
      redecideEffective(
        await w.store.loadCommands('ravenford'),
        snap,
        () => 0,
        createCombatEngine(),
      ),
      null,
    );
    const stored = snap.state.chronicles.get(chapterId);
    assert.ok(JSON.stringify(stored.entries).includes(name));
    const placement = snap.history.find(
      (e) => e.type === 'EntityPlaced' && e.payload.entityId === 'elowen-starwhisper',
    );
    const protectedSource = await w.cmd({
      type: 'UndoCommand',
      targetCommandId: placement.causation.commandId,
    });
    assert.equal(protectedSource.code, 'UNDO_UNSAFE');
    const undo = await w.cmd({ type: 'UndoCommand', targetCommandId: rename.commandId });
    assert.equal(undo.status, 'accepted');
    snap = await w.snapshot();
    const divergence = redecideEffective(
      await w.store.loadCommands('ravenford'),
      snap,
      () => 0,
      createCombatEngine(),
    );
    assert.equal(divergence?.commandId, chapterId);
    assert.equal(snap.state.entities.get(entityId).name, oldName);
    assert.deepEqual(replay(snap.history), snap.state);
    assert.deepEqual(checkWorldIntegrity(snap.state), []);
    await w.restart();
    const view = await w.read('/chronicle?perspective=DM', TOKENS.dm);
    assert.equal(view.http, 200);
    const chapter = view.body.chapters.find((c) => c.chronicleId === chapterId);
    const offending = chapter.entries.find((e) => e.text.includes(name));
    assert.ok(offending);
    assert.ok(chapter.prose.paragraphs.some((p) => p.text.includes(name)));
    assert.equal((await w.read('/chronicle?perspective=DM')).http, 403);
    const recovery = await w.cmd({ type: 'UndoCommand', targetCommandId: chapterId });
    assert.equal(recovery.status, 'accepted');
    assert.equal(
      redecideEffective(
        await w.store.loadCommands('ravenford'),
        await w.snapshot(),
        () => 0,
        createCombatEngine(),
      ),
      null,
    );
    results.chronicle.push({
      entityId,
      rename,
      chapterId,
      traceId: generated.rendering.traceId,
      protectedSource,
      undo,
      canonicalName: oldName,
      persistedEntry: offending,
      persistedProse: chapter.prose.paragraphs,
      divergence,
      replayEqual: true,
      structuralIntegrity: [],
      restartPreservesMismatch: true,
      explicitChapterUndoRecovers: true,
    });
  });
for (const mode of ['move-away-after-site-examination', 'move-to-site-after-town-examination'])
  await world(async (w) => {
    const symbol = 'strange-symbol',
      site = 'abandoned-caravan-site';
    const act = (c) => w.cmd({ characterId: 'elowen-starwhisper', ...c }, TOKENS.player);
    if (mode.startsWith('move-away')) {
      assert.equal(
        (await act({ type: 'EnterLocation', locationId: 'old-trade-road' })).status,
        'accepted',
      );
      assert.equal((await act({ type: 'EnterLocation', locationId: site })).status, 'accepted');
    } else
      assert.equal(
        (await w.cmd({ type: 'PlaceEntity', entityId: symbol, locationId: 'market-square' }))
          .status,
        'accepted',
      );
    const examined = await act({ type: 'ExamineEntity', entityId: symbol, method: 'inspect' });
    assert.equal(examined.status, 'accepted');
    const before = await w.read('/quests?perspective=PARTY');
    assert.equal(before.http, 200);
    const stages = (r) => r.body.quests.flatMap((q) => q.transitions.map((t) => t.stage));
    const wasAtSite = mode.startsWith('move-away');
    assert.equal(stages(before).includes('evidence-examined'), wasAtSite);
    const snapshot = await w.snapshot();
    const eventBefore = snapshot.history.find(
      (e) => e.type === 'EvidenceExamined' && e.causation.commandId === examined.commandId,
    );
    await w.cmd({ type: 'AdvanceWorldTime', by: 3600 });
    const moved = await w.cmd({
      type: 'PlaceEntity',
      entityId: symbol,
      locationId: wasAtSite ? 'north-gate' : site,
    });
    assert.equal(moved.status, 'accepted', JSON.stringify(moved));
    const after = await w.read('/quests?perspective=PARTY');
    assert.equal(stages(after).includes('evidence-examined'), !wasAtSite);
    await w.restart();
    const restarted = await w.read('/quests?perspective=PARTY');
    assert.deepEqual(restarted, after);
    const snap = await w.snapshot();
    assert.deepEqual(
      snap.history.find((e) => e.eventId === eventBefore.eventId),
      eventBefore,
    );
    assert.deepEqual(replay(snap.history), snap.state);
    assert.deepEqual(checkWorldIntegrity(snap.state), []);
    const undo = await w.cmd({ type: 'UndoCommand', targetCommandId: moved.commandId });
    assert.equal(undo.status, 'accepted');
    assert.deepEqual(await w.read('/quests?perspective=PARTY'), before);
    assert.deepEqual((await w.read('/quests?perspective=PUBLIC')).body.quests, []);
    assert.equal((await w.read('/quests?perspective=PARTY', TOKENS.outsider)).http, 404);
    results.quest.push({
      mode,
      examined,
      moved,
      recordedExamination: eventBefore,
      before: before.body,
      after: after.body,
      examinationUnchanged: true,
      restartPreservesChangedPast: true,
      undoMoveRestoresQuest: true,
      replayEqual: true,
    });
  });
await writeFile(
  'reviews/evidence/gate-05/history-boundary-results.json',
  JSON.stringify(results, null, 2) + '\n',
);
console.log(
  JSON.stringify({
    chronicleCases: results.chronicle.length,
    questCases: results.quest.length,
    findingsReproduced: true,
  }),
);
```
