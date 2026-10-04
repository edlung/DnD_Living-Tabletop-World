# Monster suggestions across a reaction pause

Four PostgreSQL worlds exercise no encounter, the character turn, a valid monster cast, the resulting open reaction window, restart, DM close, decline, successful and failed Counterspell, movement and end-turn controls, and DM/player/outsider permissions. Asserts that the open-window suggestion is null without mutation, including after restart, and that post-close suggestions are accepted. This retests G04-M01. Requires PostgreSQL and removes its four owned databases.

Run from the repository root with Node 24+ and installed workspace dependencies:

````sh
sed -n '/^```javascript$/,/^```$/p' reviews/evidence/gate-05/retest-1/regressions/SUGGESTION_PROBES.md | sed '1d;$d' | node --conditions=@ltw/source --input-type=module
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
const allResults = {};
for (const resolution of ['dm-close', 'decline', 'counterspell-stops', 'counterspell-fails']) {
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
    assert.equal(pending, null);
    const refused = await command({ type: 'EndTurn', combatantId: SHAMAN });
    assert.equal(refused.code, 'REACTION_PENDING');
    assert.deepEqual(await engine.load('ravenford'), before);
    results.openWindow = {
      windowId: window.windowId,
      suggestion: pending,
      turnStillPaused: refused.code,
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
    const close =
      resolution === 'dm-close'
        ? { type: 'CloseReactionWindow', windowId: window.windowId }
        : resolution === 'decline'
          ? { type: 'DeclineReaction', combatantId: ELOWEN, windowId: window.windowId }
          : {
              type: 'UseReaction',
              combatantId: ELOWEN,
              windowId: window.windowId,
              reaction: 'counterspell',
            };
    if (resolution.startsWith('counterspell'))
      entropy.queue(20, [resolution === 'counterspell-stops' ? 1 : 20]);
    const resolved = await command(close);
    assert.equal(resolved.status, 'accepted');
    if (resolution.startsWith('counterspell'))
      assert.equal(resolved.outcome.countered, resolution === 'counterspell-stops');
    assert.equal(openReactionWindow((await engine.load('ravenford')).state), null);
    results.resolution = { method: resolution, result: resolved };
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
  allResults[resolution] = results;
}
await mkdir('reviews/evidence/gate-04/retest-1', { recursive: true });
await writeFile(
  'reviews/evidence/gate-05/retest-1/regressions/suggestion-results.json',
  JSON.stringify(allResults, null, 2) + '\n',
);
console.log(JSON.stringify({ worlds: Object.keys(allResults).length, allAssertionsPassed: true }));
```
