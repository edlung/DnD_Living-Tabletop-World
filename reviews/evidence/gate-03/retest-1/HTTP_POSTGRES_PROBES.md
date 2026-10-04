# Gate 03, Retest 1 — HTTP/PostgreSQL retest

Seven isolated throwaway databases, created and dropped by this recipe. Requires the configured PostgreSQL server. Runs real authenticated Fastify handlers through `inject()`, not a separately listening server, and reloads new engines before/after the relevant undos and reads.

Run from the repository root with installed dependencies and a Node version supporting TypeScript stripping:

````sh
sed -n '/^```javascript$/,/^```$/p' reviews/evidence/gate-03/retest-1/HTTP_POSTGRES_PROBES.md | sed '1d;$d' | node --conditions=@ltw/source --input-type=module
````

The original-finding assertions require safe behavior. Assertions labelled **H04** deliberately confirm the remaining defect at `88d8137401451dd6a6d6703217bf53e273a2ede4`. A successful recipe run means the evidence is reproduced, not that Gate 03 passes. Scripts write only their result JSON under this retest directory; they do not change implementation or existing tests. Scripted timestamps are fixture data. Format regenerated JSON with Prettier before committing.

```javascript
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { ravenfordApp, seededEngine, TOKENS } from './apps/server/src/testing/ravenford-app.ts';
import { createThrowawayDatabase } from './apps/server/src/testing/throwaway-database.ts';
import { PostgresEventStore } from './apps/server/src/world-engine/postgres-event-store.ts';
import {
  SequentialIds,
  SteppingClock,
  WorldEngine,
  redecideEffective,
  replay,
  checkWorldIntegrity,
} from './packages/domain/src/index.ts';
import { createCombatEngine } from './packages/combat/src/engine.ts';
import { reactionWindowViolations } from './packages/combat/src/reactions/invariants.ts';
import { ScriptedEntropy, ELOWEN, SHAMAN } from './packages/combat/src/testing/road.ts';
import ambush from './fixtures/ravenford/road-ambush.json' with { type: 'json' };
const require = createRequire(new URL('./apps/server/package.json', `file://${process.cwd()}/`));
const { Pool } = require('pg');
const results = {};
const ok = (r) => {
  assert.equal(r.http, 200, JSON.stringify(r));
  assert.equal(r.body.status, 'accepted', JSON.stringify(r));
  return r;
};
async function databaseCase(name, run) {
  const database = await createThrowawayDatabase({ migrate: true });
  const pool = new Pool({ connectionString: database.url });
  let app;
  try {
    const store = new PostgresEventStore(pool);
    const entropy = new ScriptedEntropy();
    let engine = await seededEngine(store, undefined, entropy);
    app = await ravenfordApp(engine);
    let serial = 0,
      namespace = 80;
    const snapshot = () => engine.load('ravenford');
    const post = async (command, token = TOKENS.dm) => {
      const response = await app.inject({
        method: 'POST',
        url: '/campaigns/ravenford/commands',
        headers: { authorization: `Bearer ${token}` },
        payload: { commandId: `r1-${++serial}`, command },
      });
      const body = response.json();
      delete body.requestId;
      return { http: response.statusCode, body };
    };
    const get = async (path, token = TOKENS.player) => {
      const response = await app.inject({
        method: 'GET',
        url: `/campaigns/ravenford/${path}`,
        headers: { authorization: `Bearer ${token}` },
      });
      assert.equal(response.statusCode, 200);
      return response.json();
    };
    const restart = async () => {
      await app.close();
      engine = new WorldEngine({
        store,
        ids: new SequentialIds(++namespace),
        clock: new SteppingClock(),
        combat: createCombatEngine(),
        entropy,
      });
      app = await ravenfordApp(engine);
    };
    const undo = (r) => post({ type: 'UndoCommand', targetCommandId: r.body.commandId });
    const start = async (changes = (c) => c, rolls = [17, 3, 2, 1, 15]) => {
      for (const command of ambush.place) ok(await post(command));
      entropy.queue(20, rolls);
      return ok(await post(changes(structuredClone(ambush.startCombat))));
    };
    const audit = async (expectFailure = false) => {
      const snap = await snapshot();
      assert.deepEqual(replay(snap.history), snap.state);
      assert.deepEqual(checkWorldIntegrity(snap.state), []);
      assert.deepEqual(reactionWindowViolations(snap.state), []);
      const mismatch = redecideEffective(
        await engine.commandLog('ravenford'),
        snap,
        () => 0,
        createCombatEngine(),
      );
      if (expectFailure) assert.notEqual(mismatch, null);
      else assert.equal(mismatch, null, JSON.stringify(mismatch));
      return {
        replayEqual: true,
        structuralViolations: [],
        windowViolations: [],
        redecision: mismatch,
      };
    };
    results[name] = await run({ post, get, snapshot, restart, undo, start, audit, entropy });
  } finally {
    if (app) await app.close();
    await pool.end();
    await database.drop();
  }
}
await databaseCase('H01-original', async (w) => {
  await w.start();
  ok(await w.post({ type: 'EndTurn', combatantId: ELOWEN }, TOKENS.player));
  ok(
    await w.post({
      type: 'CastSpell',
      combatantId: SHAMAN,
      spellId: 'ashen-bolt',
      targetId: ELOWEN,
    }),
  );
  const windowId = (await w.get('encounter?perspective=DM', TOKENS.dm)).encounter.reactionWindow
    .windowId;
  w.entropy.queue(20, [1]);
  const answer = ok(
    await w.post(
      { type: 'UseReaction', combatantId: ELOWEN, windowId, reaction: 'counterspell' },
      TOKENS.player,
    ),
  );
  const edit = ok(await w.post({ type: 'ChangeEntityStatus', entityId: SHAMAN, status: 'dead' }));
  await w.restart();
  const before = await w.snapshot();
  const refusal = await w.undo(answer);
  assert.equal(refusal.http, 422);
  assert.equal(refusal.body.code, 'UNDO_UNSAFE');
  assert.deepEqual(
    refusal.body.details.blockers.map((x) => x.commandId),
    [edit.body.commandId],
  );
  assert.deepEqual(await w.snapshot(), before);
  ok(await w.undo(edit));
  ok(await w.undo(answer));
  await w.restart();
  assert.equal(
    (await w.get('encounter?perspective=PLAYER')).encounter.reactionWindow.windowId,
    windowId,
  );
  ok(await w.post({ type: 'DeclineReaction', combatantId: ELOWEN, windowId }, TOKENS.player));
  return { refusal, recovery: 'accepted', survivesRestart: true, ...(await w.audit()) };
});
await databaseCase('H02-original', async (w) => {
  const sheet = (await w.snapshot()).state.characterSheets.get(ELOWEN);
  ok(
    await w.post({
      type: 'CreateEntity',
      entityId: 'r1-seren',
      kind: 'character',
      name: 'Seren',
      existsSince: null,
      placement: { locationId: 'old-trade-road', since: null },
    }),
  );
  ok(await w.post({ type: 'SetCharacterSheet', entityId: 'r1-seren', sheet }));
  await w.start(
    (c) => ({
      ...c,
      combatants: [
        ...c.combatants,
        { entityId: 'r1-seren', side: 'neutral', position: { x: 2, y: 8 } },
      ],
    }),
    [17, 3, 2, 1, 15, 5],
  );
  const edit = ok(
    await w.post({
      type: 'SetCharacterSheet',
      entityId: 'r1-seren',
      sheet: { ...sheet, armorClass: 30 },
    }),
  );
  w.entropy.queue(20, [10]);
  const attack = ok(
    await w.post(
      { type: 'Attack', combatantId: ELOWEN, attackId: 'longbow', targetId: 'r1-seren' },
      TOKENS.player,
    ),
  );
  assert.equal(attack.body.outcome.hit, false);
  await w.restart();
  const before = await w.snapshot();
  const refusal = await w.undo(edit);
  assert.equal(refusal.http, 422);
  assert.deepEqual(
    refusal.body.details.blockers.map((x) => x.commandId),
    [attack.body.commandId],
  );
  assert.deepEqual(await w.snapshot(), before);
  ok(await w.undo(attack));
  ok(await w.undo(edit));
  await w.restart();
  return { refusal, recovery: 'accepted', survivesRestart: true, ...(await w.audit()) };
});
for (const suspended of [false, true])
  await databaseCase(`H03-${suspended ? 'suspended' : 'immediate'}`, async (w) => {
    const sheet = (await w.snapshot()).state.characterSheets.get(ELOWEN);
    if (suspended) {
      ok(
        await w.post({
          type: 'CreateEntity',
          entityId: 'r1-seren',
          kind: 'character',
          name: 'Seren',
          existsSince: null,
          placement: { locationId: 'old-trade-road', since: null },
        }),
      );
      ok(await w.post({ type: 'SetCharacterSheet', entityId: 'r1-seren', sheet }));
    }
    await w.start(
      (c) => ({
        ...c,
        combatants: [
          ...c.combatants.map((x) =>
            x.entityId === 'goblin-raider-1' ? { ...x, position: { x: 8, y: 1 } } : x,
          ),
          ...(suspended
            ? [{ entityId: 'r1-seren', side: 'neutral', position: { x: 2, y: 8 } }]
            : []),
        ],
      }),
      suspended ? [17, 3, 2, 1, 15, 5] : undefined,
    );
    ok(
      await w.post({
        type: 'CreateEntity',
        entityId: 'r1-gridless',
        kind: 'item',
        name: 'Charm',
        existsSince: null,
        placement: { locationId: 'old-trade-road', since: null },
      }),
    );
    for (const [entityId, statement] of [
      ['goblin-raider-1', 'R1_NEAR'],
      [SHAMAN, 'R1_FAR'],
      ['r1-gridless', 'R1_GRIDLESS'],
    ])
      ok(await w.post({ type: 'AddClue', entityId, method: 'magic', statement, subjects: [] }));
    ok(
      await w.post(
        { type: 'CastSpell', combatantId: ELOWEN, spellId: 'detect-magic' },
        TOKENS.player,
      ),
    );
    if (suspended) {
      const windowId = (await w.get('encounter?perspective=DM', TOKENS.dm)).encounter.reactionWindow
        .windowId;
      ok(await w.post({ type: 'CloseReactionWindow', windowId }));
    }
    await w.restart();
    const reads = {
      player: await w.get('knowledge?perspective=PLAYER'),
      party: await w.get('knowledge?perspective=PARTY'),
      memory: await w.get('memories?perspective=PLAYER'),
    };
    for (const value of Object.values(reads)) {
      const text = JSON.stringify(value);
      assert.ok(text.includes('R1_NEAR'));
      assert.ok(!text.includes('R1_FAR'));
      assert.ok(!text.includes('R1_GRIDLESS'));
    }
    return {
      nearVisible: true,
      farVisible: false,
      gridlessVisible: false,
      survivesRestart: true,
      ...(await w.audit()),
    };
  });
// H04 repros: assertions below deliberately confirm the remaining defect.
for (const variant of ['existence', 'status', 'placement'])
  await databaseCase(`H04-${variant}`, async (w) => {
    await w.start((c) => ({ ...c, combatants: c.combatants.filter((x) => x.entityId !== ELOWEN) }));
    const created = ok(
      await w.post({
        type: 'CreateEntity',
        entityId: 'r1-bystander',
        kind: 'npc',
        name: 'Bystander',
        existsSince: null,
        ...(variant === 'placement'
          ? {}
          : { placement: { locationId: 'old-trade-road', since: null } }),
      }),
    );
    let premise = created;
    if (variant === 'status') {
      ok(await w.post({ type: 'ChangeEntityStatus', entityId: 'r1-bystander', status: 'dead' }));
      premise = ok(
        await w.post({ type: 'ChangeEntityStatus', entityId: 'r1-bystander', status: 'active' }),
      );
    }
    if (variant === 'placement')
      premise = ok(
        await w.post({
          type: 'PlaceEntity',
          entityId: 'r1-bystander',
          locationId: 'old-trade-road',
        }),
      );
    const beforeCast = await w.get('encounter?perspective=PLAYER');
    assert.equal(beforeCast.encounter, null);
    const marked = ok(
      await w.post(
        {
          type: 'CastSpell',
          combatantId: ELOWEN,
          spellId: 'hunters-mark',
          targetId: 'r1-bystander',
        },
        TOKENS.player,
      ),
    );
    assert.deepEqual(marked.body.events, []);
    await w.restart();
    const acceptedUndo = ok(await w.undo(premise));
    await w.restart();
    const state = (await w.snapshot()).state;
    assert.equal(state.characterSheets.get(ELOWEN).concentration.targetId, 'r1-bystander');
    if (variant === 'existence') assert.equal(state.entities.has('r1-bystander'), false);
    if (variant === 'status') assert.equal(state.entities.get('r1-bystander').status, 'dead');
    if (variant === 'placement') assert.equal(state.entities.get('r1-bystander').placement, null);
    return {
      premise: premise.body.commandId,
      cast: marked,
      undo: acceptedUndo,
      targetExists: state.entities.has('r1-bystander'),
      targetStatus: state.entities.get('r1-bystander')?.status ?? null,
      targetPlacement: state.entities.get('r1-bystander')?.placement ?? null,
      concentration: state.characterSheets.get(ELOWEN).concentration,
      survivesRestart: true,
      ...(await w.audit(true)),
    };
  });
await mkdir('reviews/evidence/gate-03/retest-1', { recursive: true });
await writeFile(
  'reviews/evidence/gate-03/retest-1/http-postgres-results.json',
  JSON.stringify(results, null, 2) + '\n',
);
console.log(
  JSON.stringify(
    Object.fromEntries(
      Object.entries(results).map(([k, v]) => [
        k,
        {
          code: v.refusal?.body.code ?? v.undo?.body.status ?? 'range enforced',
          redecision: v.redecision,
          survivesRestart: v.survivesRestart,
        },
      ]),
    ),
    null,
    2,
  ),
);
```
