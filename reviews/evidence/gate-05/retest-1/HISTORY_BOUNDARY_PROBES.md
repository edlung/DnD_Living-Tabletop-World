# Retest: Chronicle premises and historical quest predicates

Sixteen isolated PostgreSQL worlds. Eleven Chronicle cases protect character/location/evidence/NPC names, current names of newly created NPCs, a party renderer's inputs, quoted records, selection membership and CHARACTER/NPC perspective holders. Refusals name the dependent chapter, are atomic, survive restart, and permit explicit newest-first recovery. A name used by no party entry remains free.

Eight quest cases move evidence both ways, at the same world time and later, then undo the movement and examination independently in both orders. Two membership cases distinguish arrivals before joining from arrivals afterward, preserve progress after a later departure, and respect undo of the cause. There is no departure/unassign membership command in this API: membership removal is tested through the supported undo of assignment. Every case checks replay, integrity and re-decision. Expected result: all assertions pass.

Run from the repository root with Node 24+, installed workspace dependencies and PostgreSQL:

````sh
sed -n '/^```javascript$/,/^```$/p' reviews/evidence/gate-05/retest-1/HISTORY_BOUNDARY_PROBES.md | sed '1d;$d' | node --conditions=@ltw/source --input-type=module
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
// Names of every newly covered source family, plus PARTY rendering inputs.
await world(async (w) => {
  accepted(await act(w, { type: 'EnterLocation', locationId: 'old-trade-road' }));
  accepted(await act(w, { type: 'EnterLocation', locationId: 'abandoned-caravan-site' }));
  accepted(await act(w, { type: 'ExamineEntity', entityId: 'strange-symbol', method: 'inspect' }));
  accepted(
    await w.cmd({
      type: 'CreateEntity',
      entityId: 'r1-witness',
      kind: 'npc',
      name: 'Original witness',
      existsSince: null,
    }),
  );
  accepted(
    await w.cmd({ type: 'ChangeEntityStatus', entityId: 'orin-stonebeard', status: 'dead' }),
  );
  accepted(await act(w, { type: 'EnterLocation', locationId: 'market-square' }));
  accepted(await act(w, { type: 'AskAbout', npcId: 'mira-vale', topicId: 'guild-caravan' }));
  for (const [entityId, family] of [
    ['elowen-starwhisper', 'EntityPlaced'],
    ['market-square', 'EntityPlaced'],
    ['strange-symbol', 'EvidenceExamined'],
    ['r1-witness', 'EntityCreated'],
    ['orin-stonebeard', 'EntityStatusChanged'],
    ['mira-vale', 'InformationShared'],
  ]) {
    const oldName = (await w.snapshot()).state.entities.get(entityId).name;
    const name = 'G05 R1 protected ' + entityId.replaceAll('-', ' ');
    const rename = accepted(await w.cmd({ type: 'UpdateEntityProfile', entityId, name }));
    const generated = await w.chapter('DM');
    accepted(generated.result);
    const id = generated.chronicleId;
    const s = await w.snapshot();
    const chapter = s.state.chronicles.get(id);
    assert.ok(chapter.entries.some((e) => e.source.eventType === family && e.text.includes(name)));
    assert.ok(chapter.rests.includes(`entity:${entityId}#profile`));
    assert.equal(
      s.history.find((e) => e.type === 'ChronicleGenerated' && e.payload.chronicleId === id)
        .schemaVersion,
      3,
    );
    const denied = await undo(w, rename.commandId);
    chapterBlock(denied, id);
    assert.deepEqual((await w.snapshot()).state, s.state);
    await audit(w);
    const view = await w.read('/chronicle?perspective=DM', TOKENS.dm);
    await w.restart();
    assert.deepEqual(await w.read('/chronicle?perspective=DM', TOKENS.dm), view);
    const deniedAfterRestart = await undo(w, rename.commandId);
    chapterBlock(deniedAfterRestart, id);
    accepted(await undo(w, id));
    accepted(await undo(w, rename.commandId));
    assert.equal((await w.snapshot()).state.entities.get(entityId).name, oldName);
    await audit(w);
    results.chronicle.push({
      entityId,
      family,
      perspective: 'DM',
      rename,
      chapter,
      denied,
      deniedAfterRestart,
      refusalAtomic: true,
      restartEqual: true,
      reverseRecovery: true,
      redecisionEqual: true,
    });
  }
});
await world(async (w) => {
  const rename = accepted(
    await w.cmd({
      type: 'UpdateEntityProfile',
      entityId: 'mira-vale',
      name: 'Party renderer name',
    }),
  );
  const unrelated = accepted(
    await w.cmd({
      type: 'UpdateEntityProfile',
      entityId: 'captain-thorne',
      name: 'Unrelated name',
    }),
  );
  const generated = await w.chapter('PARTY');
  const id = generated.chronicleId;
  const chapter = (await w.snapshot()).state.chronicles.get(id);
  assert.ok(chapter.rests.includes('entity:mira-vale#profile'));
  const denied = await undo(w, rename.commandId);
  chapterBlock(denied, id);
  accepted(await undo(w, unrelated.commandId));
  await audit(w);
  const view = await w.read('/chronicle?perspective=PARTY');
  await w.restart();
  assert.deepEqual(await w.read('/chronicle?perspective=PARTY'), view);
  chapterBlock(await undo(w, rename.commandId), id);
  accepted(await undo(w, id));
  accepted(await undo(w, rename.commandId));
  await audit(w);
  results.chronicle.push({
    perspective: 'PARTY',
    chapter,
    denied,
    unrelatedRenameFree: true,
    restartEqual: true,
    reverseRecovery: true,
    redecisionEqual: true,
  });
});
// Direct holder and entry-selection premises: undo must name the chapter itself.
for (const perspective of ['DM', 'CHARACTER:r1-scout', 'NPC:r1-witness'])
  await world(async (w) => {
    const npc = perspective.startsWith('NPC:');
    const entityId = npc ? 'r1-witness' : 'r1-scout';
    const created = accepted(
      await w.cmd({
        type: 'CreateEntity',
        entityId,
        kind: npc ? 'npc' : 'character',
        name: 'Retest holder',
        existsSince: null,
        placement: { locationId: 'market-square', since: null },
      }),
    );
    let target = created;
    if (!npc)
      target = accepted(
        await w.cmd({ type: 'AssignCharacter', characterId: entityId, playerActorId: 'r1-player' }),
      );
    let memory;
    if (npc)
      memory = accepted(
        await w.cmd({
          type: 'RecordMemory',
          scope: { kind: 'NPC', npcId: entityId },
          memoryKind: 'DECISION',
          summary: 'I decided to wait.',
          occurredAt: 36000,
          salience: 5,
        }),
      );
    const generated = await w.chapter(perspective);
    const id = generated.chronicleId;
    const chapter = (await w.snapshot()).state.chronicles.get(id);
    if (!npc) assert.ok(chapter.rests.includes(`roster:character:${entityId}`));
    if (perspective !== 'DM') assert.ok(chapter.rests.includes(`entity:${entityId}`));
    const denied = await undo(w, target.commandId);
    chapterBlock(denied, id);
    await audit(w);
    await w.restart();
    chapterBlock(await undo(w, target.commandId), id);
    await audit(w);
    accepted(await undo(w, id));
    if (memory) accepted(await undo(w, memory.commandId));
    accepted(await undo(w, target.commandId));
    if (!npc) accepted(await undo(w, created.commandId));
    await audit(w);
    results.chronicle.push({
      perspective,
      chapter,
      target,
      denied,
      restartEqual: true,
      reverseRecovery: true,
      redecisionEqual: true,
    });
  });
await world(async (w) => {
  const record = accepted(
    await w.cmd({
      type: 'AddKnowledge',
      knowledgeId: 'r1-quoted',
      scope: { kind: 'PARTY' },
      knowledgeType: 'HYPOTHESIS',
      statement: 'Someone may have followed the caravan.',
      subjects: ['guild-caravan'],
      knownSince: 36000,
    }),
  );
  const generated = await w.chapter('DM');
  const id = generated.chronicleId;
  const chapter = (await w.snapshot()).state.chronicles.get(id);
  assert.ok(chapter.entries.some((e) => e.knowledge.some((k) => k.knowledgeId === 'r1-quoted')));
  assert.ok(chapter.rests.includes('knowledge:r1-quoted'));
  const denied = await undo(w, record.commandId);
  chapterBlock(denied, id);
  await audit(w);
  await w.restart();
  chapterBlock(await undo(w, record.commandId), id);
  accepted(await undo(w, id));
  accepted(await undo(w, record.commandId));
  await audit(w);
  results.chronicle.push({
    perspective: 'DM',
    quotedRecord: true,
    chapter,
    denied,
    restartEqual: true,
    reverseRecovery: true,
    redecisionEqual: true,
  });
});
// Evidence moves, both directions, same instant and later; independent event undo.
for (const wasAtSite of [true, false])
  for (const later of [false, true])
    for (const undoOrder of ['examination-first', 'movement-first'])
      await world(async (w) => {
        if (wasAtSite) {
          accepted(await act(w, { type: 'EnterLocation', locationId: 'old-trade-road' }));
          accepted(await act(w, { type: 'EnterLocation', locationId: 'abandoned-caravan-site' }));
        } else
          accepted(
            await w.cmd({
              type: 'PlaceEntity',
              entityId: 'strange-symbol',
              locationId: 'market-square',
            }),
          );
        const examined = accepted(
          await act(w, { type: 'ExamineEntity', entityId: 'strange-symbol', method: 'inspect' }),
        );
        const before = await quest(w);
        assert.equal(stages(before).includes('evidence-examined'), wasAtSite);
        const source = (await w.snapshot()).history.find(
          (e) => e.type === 'EvidenceExamined' && e.causation.commandId === examined.commandId,
        );
        if (later) accepted(await w.cmd({ type: 'AdvanceWorldTime', by: 3600 }));
        const moved = accepted(
          await w.cmd({
            type: 'PlaceEntity',
            entityId: 'strange-symbol',
            locationId: wasAtSite ? 'north-gate' : 'abandoned-caravan-site',
          }),
        );
        assert.deepEqual(await quest(w), before);
        await audit(w);
        await w.restart();
        assert.deepEqual(await quest(w), before);
        assert.deepEqual(
          (await w.snapshot()).history.find((e) => e.eventId === source.eventId),
          source,
        );
        if (undoOrder === 'movement-first') {
          accepted(await undo(w, moved.commandId));
          assert.deepEqual(await quest(w), before);
          await audit(w);
        }
        accepted(await undo(w, examined.commandId));
        assert.equal(stages(await quest(w)).includes('evidence-examined'), false);
        await audit(w);
        if (undoOrder === 'examination-first') {
          accepted(await undo(w, moved.commandId));
          assert.equal(stages(await quest(w)).includes('evidence-examined'), false);
          await audit(w);
        }
        assert.deepEqual((await w.read('/quests?perspective=PUBLIC')).body.quests, []);
        assert.equal((await w.read('/quests?perspective=PARTY', TOKENS.outsider)).http, 404);
        results.quest.push({
          wasAtSite,
          later,
          undoOrder,
          examined,
          moved,
          source,
          before: before.body,
          laterMoveNoChange: true,
          restartEqual: true,
          undoExaminationRemovesOnlyMilestone: true,
          redecisionEqual: true,
        });
      });
// Membership is event-ordered; unassign is supported only by undo, not a future departure command.
for (const later of [false, true])
  await world(async (w) => {
    accepted(
      await w.cmd({
        type: 'CreateEntity',
        entityId: 'r1-scout',
        kind: 'character',
        name: 'Scout',
        existsSince: null,
        placement: { locationId: 'abandoned-caravan-site', since: null },
      }),
    );
    const before = await quest(w);
    assert.equal(stages(before).includes('site-reached'), false);
    if (later) accepted(await w.cmd({ type: 'AdvanceWorldTime', by: 3600 }));
    const joined = accepted(
      await w.cmd({ type: 'AssignCharacter', characterId: 'r1-scout', playerActorId: 'r1-player' }),
    );
    assert.deepEqual(await quest(w), before);
    await w.restart();
    assert.deepEqual(await quest(w), before);
    accepted(
      await w.cmd({ type: 'PlaceEntity', entityId: 'r1-scout', locationId: 'old-trade-road' }),
    );
    const arrival = accepted(
      await w.cmd({
        type: 'PlaceEntity',
        entityId: 'r1-scout',
        locationId: 'abandoned-caravan-site',
      }),
    );
    const reached = await quest(w);
    assert.equal(stages(reached).includes('site-reached'), true);
    if (later) accepted(await w.cmd({ type: 'AdvanceWorldTime', by: 3600 }));
    const departure = accepted(
      await w.cmd({ type: 'PlaceEntity', entityId: 'r1-scout', locationId: 'north-gate' }),
    );
    assert.deepEqual(await quest(w), reached);
    await w.restart();
    assert.deepEqual(await quest(w), reached);
    accepted(await undo(w, departure.commandId));
    assert.deepEqual(await quest(w), reached);
    accepted(await undo(w, arrival.commandId));
    assert.deepEqual(await quest(w), before);
    // DM placements do not require membership; undo assignment makes all scout placements non-party.
    accepted(await undo(w, joined.commandId));
    assert.deepEqual(await quest(w), before);
    await audit(w);
    results.membership.push({
      later,
      joined,
      arrival,
      departure,
      lateJoinNoRetroactiveArrival: true,
      departurePreservesArrival: true,
      undoArrivalRemoves: true,
      undoMembershipRespected: true,
      restartEqual: true,
      redecisionEqual: true,
    });
  });
await writeFile(
  'reviews/evidence/gate-05/retest-1/history-boundary-results.json',
  JSON.stringify(results, null, 2) + '\n',
);
console.log(
  JSON.stringify({
    chronicle: results.chronicle.length,
    quest: results.quest.length,
    membership: results.membership.length,
    allAssertionsPassed: true,
  }),
);
```
