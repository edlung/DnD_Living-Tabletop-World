# History Writers

How each file in this directory was produced. Each was written once, by the named revision's own code, and is never regenerated (`AGENTS.md`).

## `88d8137-gate03-retest1.json`

Written on 2026-10-04 by revision `88d8137401451dd6a6d6703217bf53e273a2ede4` (Gate 03 retest 1) through its own HTTP app and `PostgresEventStore`, into a throwaway database it migrated, seeded, and dropped. Dice roll the middle face.

Steps:

1. Check out that revision on its own (`git worktree add --detach <dir> 88d8137`) and run `pnpm install --frozen-lockfile --offline` there.
2. Save the script below in that checkout's root as `legacy-writer.mts`, with PostgreSQL running (`pnpm db:up` in this repository).
3. Run `LTW_HISTORY_OUT=<output.json> node --conditions=@ltw/source legacy-writer.mts` from that root. It prints `{"version":178,"events":178,"commands":125}`.
4. The JSON it writes was laid out one row per line, with a `$comment` naming the writer; the rows themselves are unchanged.

```ts
// Runs inside a checkout of revision 88d8137 (the Gate 03 retest 1 writer): drives
// that revision's own HTTP app and PostgreSQL store, then dumps the stored rows.
import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

import ambush from './fixtures/ravenford/road-ambush.json' with { type: 'json' };
import { post } from './apps/server/src/testing/gate02-scenarios.ts';
import { encounter } from './apps/server/src/testing/gate03-scenarios.ts';
import { TOKENS, ravenfordApp, seededEngine } from './apps/server/src/testing/ravenford-app.ts';
import { createThrowawayDatabase } from './apps/server/src/testing/throwaway-database.ts';
import { PostgresEventStore } from './apps/server/src/world-engine/postgres-event-store.ts';

const require = createRequire(new URL('./apps/server/package.json', `file://${process.cwd()}/`));
const { Pool } = require('pg');
const ELOWEN = 'elowen-starwhisper';
const SHAMAN = 'goblin-shaman';
const OUT = process.env.LTW_HISTORY_OUT;
if (!OUT) throw new Error('LTW_HISTORY_OUT is required');

const database = await createThrowawayDatabase({ migrate: true });
const pool = new Pool({ connectionString: database.url });
let app;
const labels = {};
try {
  app = await ravenfordApp(await seededEngine(new PostgresEventStore(pool)));
  const accept = async (token, label, command) => {
    const { status, body } = await post(app, token, `legacy-${label}`, command);
    if (status !== 200 || body.status !== 'accepted') {
      throw new Error(`${label}: ${String(status)} ${JSON.stringify(body)}`);
    }
    labels[label] = body.commandId;
    return body.commandId;
  };
  const dm = (label, command) => accept(TOKENS.dm, label, command);
  const player = (label, command) => accept(TOKENS.player, label, command);
  const endTurnsUntil = async (who, prefix) => {
    for (let turn = 0; turn < 12; turn += 1) {
      const current = (await encounter(app))?.currentCombatantId;
      if (current === who) return;
      await dm(`${prefix}-end-${String(turn)}`, { type: 'EndTurn', combatantId: current });
    }
    throw new Error(`never reached ${who}`);
  };

  // 1. Detect Magic outside combat passes over a far charm: premise `placement`.
  await dm('far-charm', {
    type: 'CreateEntity',
    entityId: 'legacy-far-charm',
    kind: 'item',
    name: 'Far Charm',
    existsSince: null,
    placement: { locationId: 'north-gate', since: null },
  });
  await dm('far-magic', {
    type: 'AddClue',
    entityId: 'legacy-far-charm',
    clueId: 'legacy-far-magic',
    method: 'magic',
    statement: 'A charm hums far away.',
    subjects: [],
  });
  await player('detect', { type: 'CastSpell', combatantId: ELOWEN, spellId: 'detect-magic' });
  // 2. A compensated cast: cast again, then the DM undoes it.
  const again = await player('detect-again', {
    type: 'CastSpell',
    combatantId: ELOWEN,
    spellId: 'detect-magic',
  });
  await dm('undo-detect-again', { type: 'UndoCommand', targetCommandId: again });

  // 3. A fight without Elowen: her spells outside it (the G03-H04 and G03-H06 era).
  for (const place of ambush.place) await dm(`place-${place.entityId}`, place);
  await dm('start-without-elowen', {
    ...ambush.startCombat,
    combatants: ambush.startCombat.combatants.filter((c) => c.entityId !== ELOWEN),
  });
  await dm('bystander', {
    type: 'CreateEntity',
    entityId: 'legacy-bystander',
    kind: 'npc',
    name: 'Bystander',
    existsSince: null,
    placement: { locationId: 'old-trade-road', since: null },
  });
  await player('mark-bystander', {
    type: 'CastSpell',
    combatantId: ELOWEN,
    spellId: 'hunters-mark',
    targetId: 'legacy-bystander',
  });
  await player('heal-shaman-from-outside', {
    type: 'CastSpell',
    combatantId: ELOWEN,
    spellId: 'healing-word',
    targetId: SHAMAN,
  });
  const firstFight = (await encounter(app))?.encounterId;
  await dm('end-first-fight', { type: 'EndCombat', encounterId: firstFight });

  // 4. A fight with Elowen: Detect Magic in combat (the Shaman 50 ft away), a
  //    countered Ashen Bolt, and a Binding Hex the DM lets expire.
  await dm('shaman-magic', {
    type: 'AddClue',
    entityId: SHAMAN,
    clueId: 'legacy-shaman-magic',
    method: 'magic',
    statement: 'The Shaman carries a charm.',
    subjects: [],
  });
  await dm('start', ambush.startCombat);
  await endTurnsUntil(ELOWEN, 'to-elowen');
  await player('detect-in-combat', {
    type: 'CastSpell',
    combatantId: ELOWEN,
    spellId: 'detect-magic',
  });
  await endTurnsUntil(SHAMAN, 'to-shaman');
  await dm('bolt', {
    type: 'CastSpell',
    combatantId: SHAMAN,
    spellId: 'ashen-bolt',
    targetId: ELOWEN,
  });
  const bolt = (await encounter(app))?.reactionWindow?.windowId;
  await player('counter', {
    type: 'UseReaction',
    combatantId: ELOWEN,
    windowId: bolt,
    reaction: 'counterspell',
  });
  await dm('shaman-ends', { type: 'EndTurn', combatantId: SHAMAN });
  await endTurnsUntil(SHAMAN, 'to-shaman-2');
  await dm('hex', {
    type: 'CastSpell',
    combatantId: SHAMAN,
    spellId: 'binding-hex',
    targetId: ELOWEN,
  });
  const hex = (await encounter(app))?.reactionWindow?.windowId;
  await dm('close', { type: 'CloseReactionWindow', windowId: hex });
  const secondFight = (await encounter(app))?.encounterId;
  const ended = await dm('end-fight', { type: 'EndCombat', encounterId: secondFight });
  // 5. Another compensation the old writer recorded: undo the end of the fight, end it again.
  await dm('undo-end-fight', { type: 'UndoCommand', targetCommandId: ended });
  await dm('end-fight-again', { type: 'EndCombat', encounterId: secondFight });

  const rows = async (sql) => (await pool.query(sql, ['ravenford'])).rows.map((row) => row.row);
  const dump = {
    writer: {
      revision: '88d8137401451dd6a6d6703217bf53e273a2ede4',
      how: 'that revision’s own HTTP app (ravenfordApp, seededEngine: middle dice) and PostgresEventStore',
    },
    campaignId: 'ravenford',
    labels,
    stream: (
      await rows('SELECT row_to_json(s) AS row FROM ltw_event_streams s WHERE stream_id = $1')
    )[0],
    commands: await rows(
      'SELECT row_to_json(c) AS row FROM ltw_commands c WHERE stream_id = $1 ORDER BY first_sequence',
    ),
    events: await rows(
      'SELECT row_to_json(e) AS row FROM ltw_events e WHERE stream_id = $1 ORDER BY sequence',
    ),
  };
  await writeFile(OUT, `${JSON.stringify(dump, null, 1)}\n`);
  console.log(
    JSON.stringify({
      version: dump.stream.version,
      events: dump.events.length,
      commands: dump.commands.length,
    }),
  );
} finally {
  if (app) await app.close();
  await pool.end();
  await database.drop();
}
```
