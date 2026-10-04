# Gate 03 — HTTP and PostgreSQL probes

Requires PostgreSQL from the configured `DATABASE_URL` (the repository development default also works). Creates and drops only its own throwaway database. Exercises actual Fastify routes through `inject()`, with persona authentication and serialization, then reloads new engines from PostgreSQL. This is not a separate listening server. Writes `http-postgres-results.json`.

Run from the repository root with installed dependencies and Node supporting TypeScript stripping:

````sh
sed -n '/^```javascript$/,/^```$/p' reviews/evidence/gate-03/HTTP_POSTGRES_PROBES.md | sed '1d;$d' | node --conditions=@ltw/source --input-type=module
````

These assertions establish the **actual vulnerable behavior** of revision `429e2a2`; success reproduces the findings, not a passing gate. After remediation, replace the vulnerable expectations with the report's required safe outcomes. No application source or tests are modified. Scripted timestamps are fixture data, not the review date.

```javascript
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { ravenfordApp, seededEngine, TOKENS } from './apps/server/src/testing/ravenford-app.ts';
import { createThrowawayDatabase } from './apps/server/src/testing/throwaway-database.ts';
import { PostgresEventStore } from './apps/server/src/world-engine/postgres-event-store.ts';
import {
  SequentialIds,
  SteppingClock,
  WorldEngine,
  redecideEffective,
} from './packages/domain/src/index.ts';
import { createCombatEngine } from './packages/combat/src/engine.ts';
import { ScriptedEntropy, ELOWEN, SHAMAN } from './packages/combat/src/testing/road.ts';
import ambush from './fixtures/ravenford/road-ambush.json' with { type: 'json' };

const require = createRequire(new URL('./apps/server/package.json', `file://${process.cwd()}/`));
const { Pool } = require('pg');
const database = await createThrowawayDatabase({ migrate: true });
const pool = new Pool({ connectionString: database.url });
let app;
const results = {};
try {
  const store = new PostgresEventStore(pool);
  const entropy = new ScriptedEntropy();
  let engine = await seededEngine(store, undefined, entropy);
  app = await ravenfordApp(engine);
  let serial = 0;
  async function post(command, token = TOKENS.dm, clientId) {
    const response = await app.inject({
      method: 'POST',
      url: '/campaigns/ravenford/commands',
      headers: { authorization: `Bearer ${token}` },
      payload: { commandId: clientId ?? `g03-${++serial}`, command },
    });
    const body = response.json();
    delete body.requestId;
    return { http: response.statusCode, body };
  }
  function ok(result) {
    assert.equal(result.http, 200, JSON.stringify(result));
    return result;
  }
  async function get(path, token = TOKENS.player) {
    const response = await app.inject({
      method: 'GET',
      url: `/campaigns/ravenford/${path}`,
      headers: { authorization: `Bearer ${token}` },
    });
    return { http: response.statusCode, body: response.json() };
  }
  async function restart() {
    await app.close();
    engine = new WorldEngine({
      store,
      ids: new SequentialIds(20 + serial),
      clock: new SteppingClock(),
      combat: createCombatEngine(),
      entropy,
    });
    app = await ravenfordApp(engine);
  }
  const snapshot = () => engine.load('ravenford');
  const audit = async () =>
    redecideEffective(
      await engine.commandLog('ravenford'),
      await snapshot(),
      () => 0,
      createCombatEngine(),
    );

  for (const command of ambush.place) ok(await post(command));
  entropy.queue(20, [17, 3, 2, 1, 15]);
  ok(await post(ambush.startCombat));
  ok(await post({ type: 'EndTurn', combatantId: ELOWEN }, TOKENS.player));
  ok(
    await post({ type: 'CastSpell', combatantId: SHAMAN, spellId: 'ashen-bolt', targetId: ELOWEN }),
  );
  const dmView = await get('encounter?perspective=DM', TOKENS.dm);
  const windowId = dmView.body.encounter.reactionWindow.windowId;
  const playerView = await get('encounter?perspective=PLAYER');
  assert.equal(playerView.body.encounter.reactionWindow.trigger.spellId, undefined);
  assert.equal(playerView.body.encounter.reactionWindow.trigger.targetId, undefined);
  assert.equal((await post({ type: 'CloseReactionWindow', windowId }, TOKENS.player)).http, 403);
  const counter = { type: 'UseReaction', combatantId: ELOWEN, windowId, reaction: 'counterspell' };
  entropy.queue(20, [1]);
  const answered = ok(await post(counter, TOKENS.player, 'counter'));
  assert.equal(answered.body.outcome.countered, true);
  assert.deepEqual(answered.body.events, []);
  const duplicate = ok(await post(counter, TOKENS.player, 'counter'));
  assert.equal(duplicate.body.status, 'duplicate');
  const edit = ok(await post({ type: 'ChangeEntityStatus', entityId: SHAMAN, status: 'dead' }));
  await restart();
  const undo = ok(await post({ type: 'UndoCommand', targetCommandId: answered.body.commandId }));
  await restart();
  const version = (await snapshot()).state.version;
  const ignored = await post(
    { type: 'DeclineReaction', combatantId: ELOWEN, windowId },
    TOKENS.player,
  );
  const closed = await post({ type: 'CloseReactionWindow', windowId });
  const encounterId = (await snapshot()).state.encounter.encounterId;
  const ended = await post({ type: 'EndCombat', encounterId });
  assert.equal(ignored.http, 500);
  assert.equal(closed.http, 500);
  assert.equal(ended.body.code, 'REACTION_PENDING');
  assert.equal((await snapshot()).state.version, version);
  results.undoWindow = {
    answered,
    duplicate,
    edit,
    undo,
    ignored,
    closed,
    ended,
    survivesRestart: true,
    atomicFailures: true,
    redecision: await audit(),
  };
  // Recovery is possible by explicitly undoing the intervening status edit.
  ok(await post({ type: 'UndoCommand', targetCommandId: edit.body.commandId }));
  ok(await post({ type: 'CloseReactionWindow', windowId }));
  assert.equal(await audit(), null);
  ok(await post({ type: 'EndCombat', encounterId }));

  // Target-defense undo, persisted and reloaded.
  const seren = 'g03-seren';
  const sheet = (await snapshot()).state.characterSheets.get(ELOWEN);
  ok(
    await post({
      type: 'CreateEntity',
      entityId: seren,
      kind: 'character',
      name: 'Seren',
      existsSince: null,
      placement: { locationId: 'old-trade-road', since: null },
    }),
  );
  ok(await post({ type: 'SetCharacterSheet', entityId: seren, sheet }));
  const start = {
    ...ambush.startCombat,
    combatants: [
      ...ambush.startCombat.combatants,
      { entityId: seren, side: 'neutral', position: { x: 2, y: 8 } },
    ],
  };
  entropy.queue(20, [17, 3, 2, 1, 15, 5]);
  ok(await post(start));
  const defense = ok(
    await post({ type: 'SetCharacterSheet', entityId: seren, sheet: { ...sheet, armorClass: 30 } }),
  );
  entropy.queue(20, [10]);
  const attack = ok(
    await post(
      { type: 'Attack', combatantId: ELOWEN, attackId: 'longbow', targetId: seren },
      TOKENS.player,
    ),
  );
  assert.equal(attack.body.outcome.hit, false);
  await restart();
  const undoDefense = ok(
    await post({ type: 'UndoCommand', targetCommandId: defense.body.commandId }),
  );
  await restart();
  results.undoDefense = {
    defense,
    attack,
    undo: undoDefense,
    survivesRestart: true,
    redecision: await audit(),
  };
  assert.notEqual(results.undoDefense.redecision, null);

  // Detect Magic's range leak is available in PLAYER knowledge over HTTP.
  ok(
    await post({
      type: 'AddClue',
      clueId: 'g03-http-magic',
      entityId: SHAMAN,
      method: 'magic',
      statement: 'G03_HTTP_DISTANT_SECRET',
      subjects: [SHAMAN],
    }),
  );
  const beforeDiscovery = await get('knowledge?perspective=PLAYER');
  assert.ok(!JSON.stringify(beforeDiscovery.body).includes('G03_HTTP_DISTANT_SECRET'));
  // Fresh turn for Elowen after her Attack: complete all remaining turns.
  do {
    const encounter = (await snapshot()).state.encounter;
    const current = encounter.combatants[encounter.currentIndex].entityId;
    ok(await post({ type: 'EndTurn', combatantId: current }));
  } while (
    (await snapshot()).state.encounter.combatants[(await snapshot()).state.encounter.currentIndex]
      .entityId !== ELOWEN
  );
  const detected = ok(
    await post({ type: 'CastSpell', combatantId: ELOWEN, spellId: 'detect-magic' }, TOKENS.player),
  );
  const pending = [...(await snapshot()).state.reactionWindows.values()].find(
    (w) => w.status === 'open',
  );
  ok(await post({ type: 'CloseReactionWindow', windowId: pending.windowId }));
  await restart();
  const knowledge = await get('knowledge?perspective=PLAYER');
  const leaked = knowledge.body.knowledge.find(
    (entry) => entry.statement === 'G03_HTTP_DISTANT_SECRET',
  );
  assert.ok(leaked);
  results.detectMagic = { detected, leaked, survivesRestart: true };
  await writeFile(
    'reviews/evidence/gate-03/http-postgres-results.json',
    JSON.stringify(results, null, 2) + '\n',
  );
  console.log(
    JSON.stringify(
      {
        probes: Object.keys(results),
        undoWindow: {
          ignored: results.undoWindow.ignored.http,
          closed: results.undoWindow.closed.http,
          redecision: results.undoWindow.redecision,
        },
        undoDefense: results.undoDefense.redecision,
        leaked: leaked.statement,
      },
      null,
      2,
    ),
  );
} finally {
  if (app) await app.close();
  await pool.end();
  await database.drop();
}
```
