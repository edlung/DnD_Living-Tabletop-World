# Adjacent source and selection probes — Gate 05 retest 2

Result: **PASS for these probes; no finding.** This is supporting evidence, not the formal gate decision.

Reviewed code `a85b6f87f1dbd5ed8287e294acc6d18b191e5904`, checkout `ede93739c62cd3dbe48ea0aaf57023bd258b5a07`.

The executable recipe below drives accepted current commands through authenticated HTTP. It uses the public seed helper to construct Ravenford, independently assembles the attacks, and never modifies source, tests, fixtures, prior evidence, or stored event rows. All undo refusals must name the standing chapter and leave the entire canonical snapshot and accepted-command log unchanged.

Coverage:

- Every other salient DM event family: `EntityCreated`, `EntityStatusChanged`, `EntityPlaced`, `WorldTimeAdvanced`, `KnowledgeAssigned` (hypothesis), `InformationShared`, `ContradictionDetected`, `CombatStarted`, `CombatEnded`, and `ReactionUsed`. Each source command is refused beneath the chapter, then accepted after undoing the chapter.
- Every resolved source of each DM chapter is independently mapped to the effective event and attacked, including the extra knowledge source. Compound commands exercise event indexes 0, 1, 2, and 8; the Thorne command emits nine events and contributes several told entries without index confusion.
- PUBLIC, PARTY, CHARACTER, and NPC chapters each resolve a memory plus its separate knowledge source. Both origins are protected. The CHARACTER chapter also reads through the player's `PLAYER` alias. Permitted player reads keep the same source event IDs but omit DM sequences and trace IDs. Hypotheses remain hypotheses.
- A real PostgreSQL database receives 43 same-time, empty examinations, submitted in reverse lexical command-ID order. The chapter selects exactly the first 40 by the current deterministic tie-break. All 40 selected occurrences refuse undo; all three discarded occurrences accept undo. The chapter and source IDs remain unchanged. A new pool, event store, engine, and HTTP app reproduce the persisted state and refusal. Undoing the chapter then permits every retained occurrence to be undone.
- Exact replay, integrity, and the effective-command re-decision oracle pass before and after explicit recovery. The PostgreSQL database is owned by this recipe and dropped in `finally`.

Limits: the salience and perspective sweep uses in-memory stores; the selection boundary and restart probe uses real PostgreSQL. AI prose and randomness are deterministic local providers. No live external AI or image provider is exercised. This recipe does not cover historical writer fixtures or the two original H02 cases, which have separate retest evidence.

Run from the repository root with Node 24+, installed workspace dependencies, and the configured PostgreSQL service:

````sh
sed -n '/^```javascript$/,/^```$/p' reviews/evidence/gate-05/retest-2/ADJACENT_SOURCE_PROBES.md | sed '1d;$d' | node --conditions=@ltw/source --input-type=module
````

A successful run writes `adjacent-source-results.json` beside this recipe and prints the case counts. Assertions fail immediately on any deviation.

```javascript
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { createThrowawayDatabase } from './apps/server/src/testing/throwaway-database.ts';
import { PostgresEventStore } from './apps/server/src/world-engine/postgres-event-store.ts';
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
  InMemoryEventStore,
  WorldEngine,
  SequentialIds,
  SteppingClock,
  replay,
  checkWorldIntegrity,
  redecideEffective,
} from './packages/domain/src/index.ts';
import { skillModifier, scriptedDice, skillCheckPort } from './packages/rules/src/index.ts';
import { createCombatEngine } from './packages/combat/src/engine.ts';
const require = createRequire(new URL('./apps/server/package.json', `file://${process.cwd()}/`));
const { Pool } = require('pg');
const ambush = JSON.parse(await readFile('./fixtures/ravenford/road-ambush.json', 'utf8'));
const base = '/campaigns/ravenford';
const results = {
  codeRevision: 'a85b6f87f1dbd5ed8287e294acc6d18b191e5904',
  checkoutRevision: 'ede93739c62cd3dbe48ea0aaf57023bd258b5a07',
  salience: [],
  perspectives: [],
  selection: [],
  findings: [],
  limits: [
    'Deterministic local AI and dice; no live external provider.',
    'Salience and perspective sweeps use in-memory stores; selection cap uses an owned real PostgreSQL database and fresh pool/engine/app restart.',
  ],
};
const accepted = (r) => {
  assert.equal(r.status, 'accepted', JSON.stringify(r));
  return r;
};
async function world(storage, work) {
  let db, pool, app;
  try {
    if (storage === 'postgres') {
      db = await createThrowawayDatabase({ migrate: true });
      pool = new Pool({ connectionString: db.url });
    }
    let store = pool ? new PostgresEventStore(pool) : new InMemoryEventStore();
    let engine = await seededEngine(store, scriptedDice(Array(80).fill(15)));
    let serial = 0;
    const ai = testAiGateway();
    const authoring = testAuthoring();
    app = await ravenfordApp(engine, ai, authoring);
    const w = {
      storage,
      database: db?.name ?? null,
      snapshot: () => engine.load('ravenford'),
      log: () => store.loadCommands('ravenford'),
      read: async (path, token = TOKENS.dm) => {
        const r = await get(app, base + path, token);
        assert.equal(r.statusCode, 200, r.body);
        return r.json();
      },
      cmd: async (command, token = TOKENS.dm, commandId) => {
        const r = await post(
          app,
          base + '/commands',
          { commandId: commandId ?? `adj.${String(++serial).padStart(3, '0')}`, command },
          token,
        );
        return { http: r.statusCode, ...r.json() };
      },
      act: (command) => w.cmd({ characterId: 'elowen-starwhisper', ...command }, TOKENS.player),
      chapter: async (perspective, from, to) => {
        const r = await post(
          app,
          base + '/chronicle',
          {
            title: 'Independent adjacent source probe',
            perspective,
            from,
            ...(to === undefined ? {} : { to }),
          },
          TOKENS.dm,
        );
        assert.equal(r.statusCode, 200, r.body);
        const body = r.json();
        accepted(body.result);
        return body.chronicleId;
      },
      restart: async () => {
        assert.ok(pool && db);
        await app.close();
        await pool.end();
        pool = new Pool({ connectionString: db.url });
        store = new PostgresEventStore(pool);
        engine = new WorldEngine({
          store,
          ids: new SequentialIds(0x900),
          clock: new SteppingClock(),
          checks: skillCheckPort(scriptedDice(Array(80).fill(15))),
          combat: createCombatEngine(),
          entropy: { next: () => 2 ** 31 },
        });
        app = await ravenfordApp(engine, ai, authoring);
      },
    };
    accepted(await w.cmd({ type: 'AdvanceWorldTime', by: 1 }));
    await work(w);
  } finally {
    if (app) await app.close();
    if (pool) await pool.end();
    if (db) await db.drop();
  }
}
const undo = (w, targetCommandId) => w.cmd({ type: 'UndoCommand', targetCommandId });
async function audit(w) {
  const s = await w.snapshot();
  assert.deepEqual(replay(s.history), s.state);
  assert.deepEqual(checkWorldIntegrity(s.state), []);
  assert.equal(redecideEffective(await w.log(), s, skillModifier, createCombatEngine()), null);
}
async function block(w, commandId, chapterId) {
  const before = await w.snapshot(),
    logBefore = await w.log();
  const r = await undo(w, commandId);
  assert.equal(r.http, 422, JSON.stringify(r));
  assert.equal(r.code, 'UNDO_UNSAFE');
  assert.ok(
    r.details.blockers.some(
      (b) => b.commandId === chapterId && b.commandType === 'GenerateChronicle',
    ),
    JSON.stringify(r),
  );
  assert.deepEqual(await w.snapshot(), before);
  assert.deepEqual(await w.log(), logBefore);
  return r.details.blockers.map((b) => b.commandId);
}
async function view(w, chapterId, perspective = 'DM', token = TOKENS.dm) {
  const chapters = (
    await w.read(`/chronicle?perspective=${encodeURIComponent(perspective)}`, token)
  ).chapters;
  const found = chapters.find((c) => c.chronicleId === chapterId);
  assert.ok(found);
  return found;
}
async function exactSources(w, chapterId) {
  const s = await w.snapshot(),
    record = s.state.chronicles.get(chapterId),
    shown = await view(w, chapterId);
  const event = s.history.find(
    (e) => e.type === 'ChronicleGenerated' && e.payload.chronicleId === chapterId,
  );
  assert.equal(event.schemaVersion, 4);
  const effective = s.history.filter(
    (e) =>
      e.type !== 'CommandUndone' && s.state.commands.get(e.causation.commandId)?.undoneBy === null,
  );
  for (const entry of record.entries) {
    const row = shown.entries.find((e) => e.key === entry.key);
    let expected;
    if (entry.source.kind === 'event') {
      expected = effective.filter((e) => e.causation.commandId === entry.source.commandId)[
        entry.source.index
      ];
      assert.ok(expected);
      assert.equal(expected.type, entry.source.eventType);
    } else
      expected = effective.find(
        (e) => e.type === 'MemoryRecorded' && e.payload.memoryId === entry.source.memoryId,
      );
    assert.ok(expected);
    assert.ok(row.sources.some((s) => s.eventId === expected.eventId));
    for (const known of entry.knowledge) {
      const origin = effective.find(
        (e) => e.type === 'KnowledgeAssigned' && e.payload.knowledgeId === known.knowledgeId,
      );
      assert.ok(origin);
      assert.ok(row.sources.some((s) => s.eventId === origin.eventId));
    }
  }
  return shown;
}
async function protect(w, target, type, from) {
  accepted(target);
  const id = await w.chapter('DM', from);
  const s = await w.snapshot(),
    record = s.state.chronicles.get(id);
  const entries = record.entries.filter(
    (e) =>
      e.source.kind === 'event' &&
      e.source.commandId === target.commandId &&
      e.source.eventType === type,
  );
  assert.ok(entries.length > 0, `${type} target not told`);
  const before = await exactSources(w, id);
  const blockers = await block(w, target.commandId, id);
  const sourceIds = new Set(
    before.entries.flatMap((entry) => entry.sources.map((source) => source.eventId)),
  );
  const sourceCommands = [
    ...new Set(
      s.history
        .filter((event) => sourceIds.has(event.eventId))
        .map((event) => event.causation.commandId),
    ),
  ];
  for (const commandId of sourceCommands) await block(w, commandId, id);
  assert.deepEqual(await view(w, id), before);
  await audit(w);
  accepted(await undo(w, id));
  accepted(await undo(w, target.commandId));
  await audit(w);
  results.salience.push({
    eventType: type,
    commandId: target.commandId,
    commandEvents: s.history
      .filter((e) => e.causation.commandId === target.commandId)
      .map((e, index) => ({ index, type: e.type })),
    entryIndexes: entries.map((e) => e.source.index),
    everyResolvedSourceCommandProtected: true,
    protectedSourceCommands: sourceCommands.length,
    blockerIncludesChapter: blockers.includes(id),
    refusedAtomically: true,
    chapterFirstRecovery: true,
    replayIntegrityRedecision: 'pass',
  });
}
const simpleCases = [
  [
    'EntityCreated',
    {
      type: 'CreateEntity',
      entityId: 'adj-new-npc',
      kind: 'npc',
      name: 'Cerys',
      existsSince: null,
    },
  ],
  ['EntityStatusChanged', { type: 'ChangeEntityStatus', entityId: 'mira-vale', status: 'dead' }],
  [
    'EntityPlaced',
    { type: 'PlaceEntity', entityId: 'elowen-starwhisper', locationId: 'north-gate' },
  ],
  ['WorldTimeAdvanced', { type: 'AdvanceWorldTime', by: 86400 }],
  [
    'KnowledgeAssigned',
    {
      type: 'AddKnowledge',
      knowledgeId: 'adj-hypothesis',
      scope: { kind: 'PARTY' },
      knowledgeType: 'HYPOTHESIS',
      statement: 'Perhaps the caravan used the northern road.',
      knownSince: null,
    },
  ],
];
for (const [type, command] of simpleCases)
  await world('memory', async (w) => {
    const from = (await w.snapshot()).state.clock;
    await protect(w, await w.cmd(command), type, from);
  });
for (const type of ['InformationShared', 'ContradictionDetected'])
  await world('memory', async (w) => {
    const from = (await w.snapshot()).state.clock;
    let target = accepted(
      await w.act({ type: 'AskAbout', npcId: 'mira-vale', topicId: 'guild-caravan' }),
    );
    if (type === 'ContradictionDetected') {
      accepted(await w.act({ type: 'EnterLocation', locationId: 'north-gate' }));
      target = await w.act({ type: 'AskAbout', npcId: 'captain-thorne', topicId: 'guild-caravan' });
    }
    await protect(w, target, type, from);
  });
async function startCombat(w) {
  for (const place of ambush.place) accepted(await w.cmd(place));
  return accepted(await w.cmd(ambush.startCombat));
}
for (const type of ['CombatStarted', 'CombatEnded', 'ReactionUsed'])
  await world('memory', async (w) => {
    const from = (await w.snapshot()).state.clock;
    let target = await startCombat(w);
    if (type === 'CombatEnded') {
      const encounterId = (await w.read('/encounter?perspective=DM')).encounter.encounterId;
      target = await w.cmd({ type: 'EndCombat', encounterId });
    }
    if (type === 'ReactionUsed') {
      accepted(await w.cmd({ type: 'EndTurn', combatantId: 'elowen-starwhisper' }, TOKENS.player));
      for (const combatantId of ['goblin-raider-1', 'goblin-raider-2', 'goblin-raider-3'])
        accepted(await w.cmd({ type: 'EndTurn', combatantId }));
      accepted(
        await w.cmd({
          type: 'CastSpell',
          combatantId: 'goblin-shaman',
          spellId: 'binding-hex',
          targetId: 'elowen-starwhisper',
        }),
      );
      const windowId = (await w.read('/encounter?perspective=DM')).encounter.reactionWindow
        .windowId;
      target = await w.cmd(
        {
          type: 'UseReaction',
          combatantId: 'elowen-starwhisper',
          windowId,
          reaction: 'counterspell',
        },
        TOKENS.player,
      );
    }
    await protect(w, target, type, from);
  });
for (const [perspective, scope] of [
  ['PUBLIC', { kind: 'PUBLIC' }],
  ['PARTY', { kind: 'PARTY' }],
  ['CHARACTER:elowen-starwhisper', { kind: 'CHARACTER', characterId: 'elowen-starwhisper' }],
  ['NPC:mira-vale', { kind: 'NPC', npcId: 'mira-vale' }],
])
  await world('memory', async (w) => {
    const from = (await w.snapshot()).state.clock;
    const knowledge = accepted(
      await w.cmd({
        type: 'AddKnowledge',
        knowledgeId: 'adj-scope-knowledge',
        scope,
        knowledgeType: 'HYPOTHESIS',
        statement: 'Perhaps we should look east.',
        knownSince: from,
      }),
    );
    const memory = accepted(
      await w.cmd({
        type: 'RecordMemory',
        memoryId: 'adj-scope-memory',
        scope,
        memoryKind: 'DECISION',
        summary: 'We considered looking east.',
        occurredAt: from,
        relatedKnowledge: ['adj-scope-knowledge'],
        salience: 5,
      }),
    );
    const chapterId = await w.chapter(perspective, from);
    const shown = await exactSources(w, chapterId);
    assert.equal(shown.entries.length, 1);
    assert.deepEqual(shown.entries[0].sources.map((s) => s.eventType).sort(), [
      'KnowledgeAssigned',
      'MemoryRecorded',
    ]);
    assert.equal(shown.entries[0].knowledge[0].knowledgeType, 'HYPOTHESIS');
    for (const target of [memory, knowledge]) await block(w, target.commandId, chapterId);
    let playerAlias = 'not applicable';
    if (!perspective.startsWith('NPC:')) {
      const label = perspective.startsWith('CHARACTER:') ? 'PLAYER' : perspective;
      const player = await view(w, chapterId, label, TOKENS.player);
      assert.deepEqual(
        player.entries[0].sources.map((s) => s.eventId),
        shown.entries[0].sources.map((s) => s.eventId),
      );
      assert.ok(player.entries[0].sources.every((s) => !('sequence' in s)));
      assert.equal(player.prose.traceId, null);
      playerAlias = label;
    }
    await audit(w);
    accepted(await undo(w, chapterId));
    accepted(await undo(w, memory.commandId));
    accepted(await undo(w, knowledge.commandId));
    await audit(w);
    results.perspectives.push({
      perspective,
      sources: ['MemoryRecorded', 'KnowledgeAssigned'],
      playerReadLabel: playerAlias,
      refusedAtomically: true,
      chapterFirstRecovery: true,
      replayIntegrityRedecision: 'pass',
    });
  });
await world('postgres', async (w) => {
  accepted(await w.act({ type: 'EnterLocation', locationId: 'old-trade-road' }));
  accepted(await w.act({ type: 'EnterLocation', locationId: 'abandoned-caravan-site' }));
  accepted(
    await w.cmd({
      type: 'CreateEntity',
      entityId: 'adj-plain-token',
      kind: 'item',
      name: 'Plain copper token',
      existsSince: null,
      placement: { locationId: 'abandoned-caravan-site', since: null },
    }),
  );
  accepted(await w.cmd({ type: 'AdvanceWorldTime', by: 1 }));
  const from = (await w.snapshot()).state.clock;
  const commands = [];
  // Reverse lexical submission order exposes any confusion between selection order and event index.
  for (let i = 42; i >= 0; i--) {
    const commandId = `cap.${String(i).padStart(3, '0')}`;
    const occurrence = accepted(
      await w.cmd(
        {
          type: 'ExamineEntity',
          characterId: 'elowen-starwhisper',
          entityId: 'adj-plain-token',
          method: 'inspect',
        },
        TOKENS.player,
        commandId,
      ),
    );
    commands.push(occurrence.commandId);
  }
  const id = await w.chapter('DM', from, from);
  const s = await w.snapshot(),
    record = s.state.chronicles.get(id);
  assert.equal(record.entries.length, 40);
  const selected = record.entries.map((e) => e.source.commandId),
    discarded = commands.filter((c) => !selected.includes(c));
  assert.deepEqual(selected, [...commands].sort().slice(0, 40));
  assert.equal(discarded.length, 3);
  assert.ok(record.entries.every((e) => e.source.index === 1));
  const before = await exactSources(w, id);
  for (const commandId of selected) await block(w, commandId, id);
  for (const commandId of discarded) accepted(await undo(w, commandId));
  assert.deepEqual(await view(w, id), before);
  await audit(w);
  const persisted = await w.snapshot();
  await w.restart();
  assert.deepEqual(await w.snapshot(), persisted);
  assert.deepEqual(await exactSources(w, id), before);
  await block(w, selected[0], id);
  await audit(w);
  accepted(await undo(w, id));
  for (const commandId of [...selected].reverse()) accepted(await undo(w, commandId));
  await audit(w);
  results.selection.push({
    storage: w.storage,
    database: w.database,
    generatedOccurrences: 43,
    kept: 40,
    discarded: 3,
    reverseLexicalSubmission: true,
    selectedIndex: 1,
    allSelectedRefusedAtomically: true,
    allDiscardedUndoAccepted: true,
    chapterSourcesUnchanged: true,
    freshPoolEngineAppRestart: true,
    chapterFirstRecovery: true,
    replayIntegrityRedecision: 'pass',
    databaseDropped: true,
  });
});
results.status = 'PASS';
await writeFile(
  'reviews/evidence/gate-05/retest-2/adjacent-source-results.json',
  JSON.stringify(results, null, 2) + '\n',
);
console.log(
  JSON.stringify({
    status: results.status,
    salientTypes: results.salience.length,
    perspectives: results.perspectives.length,
    postgresSelections: results.selection.length,
    findings: results.findings,
  }),
);
```
