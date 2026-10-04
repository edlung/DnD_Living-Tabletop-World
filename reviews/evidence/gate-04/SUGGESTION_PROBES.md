# Monster suggestions across a reaction pause

One PostgreSQL world exercises no encounter, the character turn, a valid monster cast, the resulting open reaction window, restart, explicit close, movement and end-turn controls, and DM/player/outsider permissions. Asserts the open-window suggestion is refused as REACTION_PENDING without mutation: this deliberately reproduces G04-M01, so recipe success supports FAIL. Requires PostgreSQL and removes its owned database.

Run from the repository root with Node 24+ and installed workspace dependencies:

````sh
sed -n '/^```javascript$/,/^```$/p' reviews/evidence/gate-04/SUGGESTION_PROBES.md | sed '1d;$d' | node --conditions=@ltw/source --input-type=module
````

```javascript
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createThrowawayDatabase } from './apps/server/src/testing/throwaway-database.ts';
import { PostgresEventStore } from './apps/server/src/world-engine/postgres-event-store.ts';
import {
  ravenfordApp,
  seededEngine,
  TOKENS,
  post,
  get,
} from './apps/server/src/testing/ravenford-app.ts';
import { ScriptedEntropy, AMBUSH, ELOWEN, SHAMAN } from './packages/combat/src/testing/road.ts';
import {
  WorldEngine,
  SequentialIds,
  SteppingClock,
  openReactionWindow,
  replay,
  checkWorldIntegrity,
} from './packages/domain/src/index.ts';
import { createCombatEngine } from './packages/combat/src/engine.ts';
const require = createRequire(new URL('./apps/server/package.json', `file://${process.cwd()}/`));
const { Pool } = require('pg');
const results = {};
const db = await createThrowawayDatabase({ migrate: true });
const pool = new Pool({ connectionString: db.url });
let app;
try {
  const entropy = new ScriptedEntropy();
  let engine = await seededEngine(new PostgresEventStore(pool), undefined, entropy);
  app = await ravenfordApp(engine);
  let serial = 0;
  const command = async (c) => {
    const r = await post(
      app,
      '/campaigns/ravenford/commands',
      { commandId: `g04-suggest-${++serial}`, command: c },
      TOKENS.dm,
    );
    return { http: r.statusCode, ...r.json() };
  };
  const getSuggestion = async () => {
    const r = await get(app, '/campaigns/ravenford/encounter/suggestion', TOKENS.dm);
    assert.equal(r.statusCode, 200);
    return r.json().suggestion;
  };
  assert.equal(await getSuggestion(), null);
  for (const c of AMBUSH.place) assert.equal((await command(c)).status, 'accepted');
  entropy.queue(20, [20, 3, 2, 1, 15]);
  assert.equal((await command(AMBUSH.startCombat)).status, 'accepted');
  assert.equal(await getSuggestion(), null);
  assert.equal((await command({ type: 'EndTurn', combatantId: ELOWEN })).status, 'accepted');
  const cast = await getSuggestion();
  assert.equal(cast.tactic, 'spell');
  assert.equal((await command(cast.command)).status, 'accepted');
  const before = await engine.load('ravenford');
  const window = openReactionWindow(before.state);
  assert.ok(window);
  const pending = await getSuggestion();
  assert.ok(pending);
  const rejected = await command(pending.command);
  assert.equal(rejected.code, 'REACTION_PENDING');
  assert.deepEqual(await engine.load('ravenford'), before);
  results.openWindow = {
    windowId: window.windowId,
    suggestion: pending,
    result: rejected,
    atomic: true,
  };
  await app.close();
  engine = new WorldEngine({
    store: new PostgresEventStore(pool),
    ids: new SequentialIds(89),
    clock: new SteppingClock(),
    combat: createCombatEngine(),
    entropy,
  });
  app = await ravenfordApp(engine);
  assert.deepEqual(await getSuggestion(), pending);
  results.openWindow.survivesRestart = true;
  assert.equal(
    (await command({ type: 'CloseReactionWindow', windowId: window.windowId })).status,
    'accepted',
  );
  const afterClose = await getSuggestion();
  assert.ok(afterClose);
  const accepted = await command(afterClose.command);
  assert.equal(accepted.status, 'accepted');
  results.closedControl = { suggestion: afterClose, result: accepted };
  const ending = await getSuggestion();
  assert.equal(ending.tactic, 'end-turn');
  assert.equal((await command(ending.command)).status, 'accepted');
  results.endTurnControl = { suggestion: ending, accepted: true };
  const snap = await engine.load('ravenford');
  assert.deepEqual(replay(snap.history), snap.state);
  assert.deepEqual(checkWorldIntegrity(snap.state), []);
  for (const [token, status] of [
    [TOKENS.player, 403],
    [TOKENS.outsider, 404],
  ])
    assert.equal(
      (await get(app, '/campaigns/ravenford/encounter/suggestion', token)).statusCode,
      status,
    );
  results.permissions = { player: 403, outsider: 404 };
} finally {
  if (app) await app.close();
  await pool.end();
  await db.drop();
}
await mkdir('reviews/evidence/gate-04', { recursive: true });
await writeFile(
  'reviews/evidence/gate-04/suggestion-results.json',
  JSON.stringify(results, null, 2) + '\n',
);
console.log(
  JSON.stringify({ groups: Object.keys(results).length, illegalSuggestionReproduced: true }),
);
```
