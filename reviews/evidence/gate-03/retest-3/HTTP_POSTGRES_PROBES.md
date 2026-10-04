# Authenticated HTTP and PostgreSQL retest

31 cases, each with a migrated throwaway database and fresh-engine reloads. Rechecks H01–H04, negative clue undo and H06 with authenticated context comparison. The new TARGET_IN_COMBAT contract is asserted in both fight phases. Requires the configured PostgreSQL server; no development data is reset.

Run from the repository root with Node 24+ and installed workspace dependencies:

````sh
sed -n '/^```javascript$/,/^```$/p' reviews/evidence/gate-03/retest-3/HTTP_POSTGRES_PROBES.md | sed '1d;$d' | node --conditions=@ltw/source --input-type=module
````

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
        payload: { commandId: `r3-${++serial}`, command },
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
      entityId: 'r3-seren',
      kind: 'character',
      name: 'Seren',
      existsSince: null,
      placement: { locationId: 'old-trade-road', since: null },
    }),
  );
  ok(await w.post({ type: 'SetCharacterSheet', entityId: 'r3-seren', sheet }));
  await w.start(
    (c) => ({
      ...c,
      combatants: [
        ...c.combatants,
        { entityId: 'r3-seren', side: 'neutral', position: { x: 2, y: 8 } },
      ],
    }),
    [17, 3, 2, 1, 15, 5],
  );
  const edit = ok(
    await w.post({
      type: 'SetCharacterSheet',
      entityId: 'r3-seren',
      sheet: { ...sheet, armorClass: 30 },
    }),
  );
  w.entropy.queue(20, [10]);
  const attack = ok(
    await w.post(
      { type: 'Attack', combatantId: ELOWEN, attackId: 'longbow', targetId: 'r3-seren' },
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
          entityId: 'r3-seren',
          kind: 'character',
          name: 'Seren',
          existsSince: null,
          placement: { locationId: 'old-trade-road', since: null },
        }),
      );
      ok(await w.post({ type: 'SetCharacterSheet', entityId: 'r3-seren', sheet }));
    }
    await w.start(
      (c) => ({
        ...c,
        combatants: [
          ...c.combatants.map((x) =>
            x.entityId === 'goblin-raider-1' ? { ...x, position: { x: 8, y: 1 } } : x,
          ),
          ...(suspended
            ? [{ entityId: 'r3-seren', side: 'neutral', position: { x: 2, y: 8 } }]
            : []),
        ],
      }),
      suspended ? [17, 3, 2, 1, 15, 5] : undefined,
    );
    ok(
      await w.post({
        type: 'CreateEntity',
        entityId: 'r3-gridless',
        kind: 'item',
        name: 'Charm',
        existsSince: null,
        placement: { locationId: 'old-trade-road', since: null },
      }),
    );
    for (const [entityId, statement] of [
      ['goblin-raider-1', 'R3_NEAR'],
      [SHAMAN, 'R3_FAR'],
      ['r3-gridless', 'R3_GRIDLESS'],
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
      assert.ok(text.includes('R3_NEAR'));
      assert.ok(!text.includes('R3_FAR'));
      assert.ok(!text.includes('R3_GRIDLESS'));
    }
    return {
      nearVisible: true,
      farVisible: false,
      gridlessVisible: false,
      survivesRestart: true,
      ...(await w.audit()),
    };
  });
// G03-H04: reject unsafe target/caster undos, then recover explicitly.
for (const fight of [false, true])
  for (const spell of ['hunters-mark', 'healing-word'])
    for (const variant of ['existence', 'status', 'placement', 'caster-placement'])
      await databaseCase(
        `H04-${fight ? 'unrelated-fight' : 'no-fight'}-${spell}-${variant}`,
        async (w) => {
          if (fight)
            await w.start(
              (c) => ({ ...c, combatants: c.combatants.filter((x) => x.entityId !== ELOWEN) }),
              [3, 2, 1, 15],
            );
          const here = (await w.snapshot()).state.entities.get(ELOWEN).placement.locationId;
          const there = variant === 'caster-placement' ? 'golden-stag-inn' : here;
          const created = ok(
            await w.post({
              type: 'CreateEntity',
              entityId: 'r3-bystander',
              kind: 'npc',
              name: 'Bystander',
              existsSince: null,
              ...(variant === 'placement' ? {} : { placement: { locationId: there, since: null } }),
            }),
          );
          let premise = created;
          if (variant === 'status') {
            ok(
              await w.post({
                type: 'ChangeEntityStatus',
                entityId: 'r3-bystander',
                status: 'dead',
              }),
            );
            premise = ok(
              await w.post({
                type: 'ChangeEntityStatus',
                entityId: 'r3-bystander',
                status: 'active',
              }),
            );
          }
          if (variant === 'placement')
            premise = ok(
              await w.post({ type: 'PlaceEntity', entityId: 'r3-bystander', locationId: there }),
            );
          if (variant === 'caster-placement')
            premise = ok(
              await w.post(
                { type: 'EnterLocation', characterId: ELOWEN, locationId: there },
                TOKENS.player,
              ),
            );
          assert.equal((await w.get('encounter?perspective=PLAYER')).encounter, null);
          const spellCast = ok(
            await w.post(
              { type: 'CastSpell', combatantId: ELOWEN, spellId: spell, targetId: 'r3-bystander' },
              TOKENS.player,
            ),
          );
          assert.deepEqual(spellCast.body.events, []);
          await w.restart();
          const before = await w.snapshot();
          const refusal = await w.undo(premise);
          assert.equal(refusal.http, 422);
          assert.equal(refusal.body.code, 'UNDO_UNSAFE');
          assert.deepEqual(
            refusal.body.details.blockers.map((x) => x.commandId),
            [spellCast.body.commandId],
          );
          assert.deepEqual(await w.snapshot(), before);
          await w.restart();
          assert.deepEqual(await w.snapshot(), before);
          await w.audit();
          ok(await w.undo(spellCast));
          ok(await w.undo(premise));
          await w.restart();
          return {
            premise: premise.body.commandId,
            cast: spellCast.body.commandId,
            refusal,
            atomic: true,
            recovery: 'accepted',
            survivesRestart: true,
            ...(await w.audit()),
          };
        },
      );
await databaseCase('AdjacentUnreached-clue', async (w) => {
  ok(
    await w.post({
      type: 'CreateEntity',
      entityId: 'r3-far-charm',
      kind: 'item',
      name: 'Far charm',
      existsSince: null,
      placement: { locationId: 'north-gate', since: null },
    }),
  );
  const clue = ok(
    await w.post({
      type: 'AddClue',
      entityId: 'r3-far-charm',
      clueId: 'r3-far-magic',
      method: 'magic',
      statement: 'R3_FAR_MAGIC',
      subjects: [],
    }),
  );
  const detected = ok(
    await w.post(
      { type: 'CastSpell', combatantId: ELOWEN, spellId: 'detect-magic' },
      TOKENS.player,
    ),
  );
  assert.deepEqual(detected.body.outcome.discovered, []);
  await w.restart();
  const before = await w.snapshot();
  const refusal = await w.undo(clue);
  assert.equal(refusal.http, 422);
  assert.equal(refusal.body.code, 'UNDO_UNSAFE');
  assert.deepEqual(
    refusal.body.details.blockers.map((x) => x.commandId),
    [detected.body.commandId],
  );
  assert.deepEqual(await w.snapshot(), before);
  ok(await w.undo(detected));
  ok(await w.undo(clue));
  await w.restart();
  return {
    refusal,
    atomic: true,
    recovery: 'accepted',
    survivesRestart: true,
    ...(await w.audit()),
  };
});
// G03-H06: owner-approved TARGET_IN_COMBAT for both phases of a fight.
// The open window must not change what a non-participant sees.
// Hunter's Mark, Detect Magic, and healing a non-participant are controls.
for (const mode of ['no-fight', 'fight-no-window', 'fight-open-window'])
  for (const spell of ['healing-word', 'hunters-mark', 'detect-magic'])
    await databaseCase(`H06-${mode}-${spell}`, async (w) => {
      const sheet = (await w.snapshot()).state.characterSheets.get(ELOWEN);
      ok(
        await w.post({
          type: 'CreateEntity',
          entityId: 'r3-seren',
          kind: 'character',
          name: 'Seren',
          existsSince: null,
          placement: { locationId: 'old-trade-road', since: null },
        }),
      );
      ok(await w.post({ type: 'SetCharacterSheet', entityId: 'r3-seren', sheet }));
      if (mode === 'no-fight') for (const command of ambush.place) ok(await w.post(command));
      else
        await w.start(
          (c) => ({
            ...c,
            combatants: [
              ...c.combatants.filter((x) => x.entityId !== ELOWEN),
              { entityId: 'r3-seren', side: 'neutral', position: { x: 2, y: 8 } },
            ],
          }),
          [3, 2, 1, 15, 5],
        );
      if (mode === 'fight-open-window')
        ok(
          await w.post({
            type: 'CastSpell',
            combatantId: SHAMAN,
            spellId: 'ashen-bolt',
            targetId: 'r3-seren',
          }),
        );
      await w.restart();
      const encounter = (await w.get('encounter?perspective=PLAYER')).encounter;
      assert.equal(encounter, null);
      const context = await w.get(`entities/${SHAMAN}/context?perspective=PLAYER`);
      const before = await w.snapshot();
      const targetHp = before.state.statBlocks.get(SHAMAN).hitPoints;
      const response = await w.post(
        {
          type: 'CastSpell',
          combatantId: ELOWEN,
          spellId: spell,
          ...(spell === 'detect-magic' ? {} : { targetId: SHAMAN }),
        },
        TOKENS.player,
      );
      const targetsFighter = mode !== 'no-fight' && spell !== 'detect-magic';
      const leaks = false;
      if (targetsFighter) {
        assert.equal(response.http, 422);
        assert.equal(response.body.code, 'ILLEGAL_ACTION');
        assert.equal(response.body.message, 'TARGET_IN_COMBAT');
        assert.deepEqual(await w.snapshot(), before);
      } else ok(response);
      await w.restart();
      assert.equal((await w.get('encounter?perspective=PLAYER')).encounter, null);
      return {
        encounter,
        targetHp,
        context,
        response,
        expectedByVisibilityContract:
          spell === 'detect-magic'
            ? 'accepted in all phases'
            : 'TARGET_IN_COMBAT in both fight phases; accepted without fight',
        leaksWindow: leaks,
        atomicRejection: targetsFighter ? true : null,
        survivesRestart: true,
        ...(await w.audit()),
      };
    });
await databaseCase('H06-open-window-healing-outsider-control', async (w) => {
  const sheet = (await w.snapshot()).state.characterSheets.get(ELOWEN);
  ok(
    await w.post({
      type: 'CreateEntity',
      entityId: 'r3-seren',
      kind: 'character',
      name: 'Seren',
      existsSince: null,
      placement: { locationId: 'old-trade-road', since: null },
    }),
  );
  ok(await w.post({ type: 'SetCharacterSheet', entityId: 'r3-seren', sheet }));
  await w.start(
    (c) => ({
      ...c,
      combatants: [
        ...c.combatants.filter((x) => x.entityId !== ELOWEN),
        { entityId: 'r3-seren', side: 'neutral', position: { x: 2, y: 8 } },
      ],
    }),
    [3, 2, 1, 15, 5],
  );
  ok(
    await w.post({
      type: 'CastSpell',
      combatantId: SHAMAN,
      spellId: 'ashen-bolt',
      targetId: 'r3-seren',
    }),
  );
  await w.restart();
  assert.equal((await w.get('encounter?perspective=PLAYER')).encounter, null);
  const response = ok(
    await w.post(
      { type: 'CastSpell', combatantId: ELOWEN, spellId: 'healing-word', targetId: ELOWEN },
      TOKENS.player,
    ),
  );
  await w.restart();
  return { response, survivesRestart: true, ...(await w.audit()) };
});
// The entire authenticated context and normalized spell results must hide the window.
for (const spell of ['healing-word', 'hunters-mark', 'detect-magic']) {
  const closed = results[`H06-fight-no-window-${spell}`];
  const open = results[`H06-fight-open-window-${spell}`];
  assert.deepEqual(open.context, closed.context);
  const normalize = (r) => {
    const b = structuredClone(r.body);
    delete b.commandId;
    return { http: r.http, body: b };
  };
  assert.deepEqual(normalize(open.response), normalize(closed.response));
}
for (const value of Object.values(results))
  if (value.context) {
    value.contextSummary = {
      equalAcrossWindow: true,
      spellActions:
        value.context.context?.actions?.filter((a) =>
          ['healing_word', 'hunters_mark'].includes(a.id),
        ) ?? [],
    };
    delete value.context;
  }
await mkdir('reviews/evidence/gate-03/retest-3', { recursive: true });
await writeFile(
  'reviews/evidence/gate-03/retest-3/http-postgres-results.json',
  JSON.stringify(results, null, 2) + '\n',
);
console.log(
  JSON.stringify({
    cases: Object.keys(results).length,
    newFailures: Object.keys(results).filter((k) => results[k].leaksWindow),
  }),
);
```
