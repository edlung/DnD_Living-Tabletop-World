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

## `88d8137-outside-casts.json`, `b38cbbc-outside-casts.json`, `429e2a2-gaps.json`, `017ab0b-investigation.json`

Written on 2026-10-04 by the named revisions (full hashes in each file's `writer`) with the script below. It uses only helpers every one of those revisions has: `ravenfordApp`, `seededEngine`, `TOKENS`, and `post`. Each run used its own throwaway database, which the script migrated, seeded, and dropped. Dice roll the middle face.

Steps, for each revision and scenario (`outside-casts` for 88d8137 and b38cbbc, `gaps` for 429e2a2, `investigation` for 017ab0b):

1. Check out the revision on its own (`git worktree add --detach <dir> <revision>`) and run `pnpm install --frozen-lockfile --offline` there.
2. Save the script below in that checkout's root as `history-writer.mts`, with PostgreSQL running.
3. Run `LTW_SCENARIO=<scenario> LTW_HISTORY_OUT=<output.json> node --conditions=@ltw/source history-writer.mts` from that root.
4. The JSON it writes was laid out one row per line, with a `$comment` and the revision added to `writer`; the rows themselves are unchanged.

```ts
// Runs inside a checkout of an earlier revision: drives that revision's own HTTP
// app and PostgreSQL store through one scenario, then dumps the stored rows.
// LTW_SCENARIO: outside-casts | gaps | investigation. LTW_HISTORY_OUT: output path.
import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

import { post } from './apps/server/src/testing/gate02-scenarios.ts';
import { TOKENS, ravenfordApp, seededEngine } from './apps/server/src/testing/ravenford-app.ts';
import { createThrowawayDatabase } from './apps/server/src/testing/throwaway-database.ts';
import { PostgresEventStore } from './apps/server/src/world-engine/postgres-event-store.ts';

const require = createRequire(new URL('./apps/server/package.json', `file://${process.cwd()}/`));
const { Pool } = require('pg');
const ELOWEN = 'elowen-starwhisper';
const SEREN = 'seren-ashgrove';
const OUT = process.env.LTW_HISTORY_OUT;
const SCENARIO = process.env.LTW_SCENARIO;
if (!OUT || !SCENARIO) throw new Error('LTW_HISTORY_OUT and LTW_SCENARIO are required');
const json = async (path: string) =>
  ((await import(path, { with: { type: 'json' } })) as { default: Record<string, unknown> })
    .default;

const database = await createThrowawayDatabase({ migrate: true });
const pool = new Pool({ connectionString: database.url });
let app: Awaited<ReturnType<typeof ravenfordApp>> | undefined;
const labels: Record<string, string> = {};
try {
  app = await ravenfordApp(await seededEngine(new PostgresEventStore(pool)));
  const live = app;
  const send = async (token: string, label: string, command: Record<string, unknown>) => {
    const { status, body } = await post(live, token, `legacy-${label}`, command);
    if (status !== 200 || body.status !== 'accepted') {
      throw new Error(`${label}: ${String(status)} ${JSON.stringify(body)}`);
    }
    labels[label] = body.commandId;
    return body;
  };
  const dm = (label: string, command: Record<string, unknown>) => send(TOKENS.dm, label, command);
  const player = (label: string, command: Record<string, unknown>) =>
    send(TOKENS.player, label, command);
  const current = async (): Promise<string | undefined> => {
    const response = await live.inject({
      method: 'GET',
      url: '/campaigns/ravenford/encounter?perspective=DM',
      headers: { authorization: `Bearer ${TOKENS.dm}` },
    });
    return (response.json() as { encounter: { currentCombatantId?: string } | null }).encounter
      ?.currentCombatantId;
  };
  const endTurnsUntil = async (who: string, prefix: string) => {
    for (let turn = 0; turn < 12; turn += 1) {
      const now = await current();
      if (now === who) return;
      await dm(`${prefix}-end-${String(turn)}`, { type: 'EndTurn', combatantId: now });
    }
    throw new Error(`never reached ${who}`);
  };
  const npc = (label: string, entityId: string, locationId: string | null) =>
    dm(label, {
      type: 'CreateEntity',
      entityId,
      kind: 'npc',
      name: entityId,
      existsSince: null,
      ...(locationId ? { placement: { locationId, since: null } } : {}),
    });
  const status = (label: string, entityId: string, value: 'dead' | 'active') =>
    dm(label, { type: 'ChangeEntityStatus', entityId, status: value });
  const cast = (label: string, spellId: string, targetId?: string) =>
    player(label, {
      type: 'CastSpell',
      combatantId: ELOWEN,
      spellId,
      ...(targetId ? { targetId } : {}),
    });
  const enter = (label: string, locationId: string) =>
    player(label, { type: 'EnterLocation', characterId: ELOWEN, locationId });
  const inspect = (label: string, entityId: string) =>
    player(label, { type: 'ExamineEntity', characterId: ELOWEN, entityId, method: 'inspect' });

  if (SCENARIO === 'outside-casts') {
    // Elowen stays outside a fight between the goblins and nobody else (G03-H07).
    const ambush = (await json('./fixtures/ravenford/road-ambush.json')) as {
      place: Record<string, unknown>[];
      startCombat: { combatants: { entityId: string }[] };
    };
    for (const place of ambush.place) await dm(`place-${String(place['entityId'])}`, place);
    await dm('start-without-elowen', {
      ...ambush.startCombat,
      combatants: ambush.startCombat.combatants.filter((c) => c.entityId !== ELOWEN),
    });
    await npc('revived', 'h07-revived', 'old-trade-road');
    await status('revived-dies', 'h07-revived', 'dead');
    await status('revival', 'h07-revived', 'active');
    await cast('mark-revived', 'hunters-mark', 'h07-revived');
    await npc('placed', 'h07-placed', null);
    await dm('target-placement', {
      type: 'PlaceEntity',
      entityId: 'h07-placed',
      locationId: 'old-trade-road',
    });
    await cast('mark-placed', 'hunters-mark', 'h07-placed');
    await npc('patient', 'h07-patient', 'old-trade-road');
    await status('patient-dies', 'h07-patient', 'dead');
    await status('patient-revival', 'h07-patient', 'active');
    await cast('heal-patient', 'healing-word', 'h07-patient');
    await npc('innkeeper', 'h07-innkeeper', 'golden-stag-inn');
    await enter('caster-placement', 'golden-stag-inn');
    await cast('mark-innkeeper', 'hunters-mark', 'h07-innkeeper');
  } else if (SCENARIO === 'gaps') {
    // What the Gate 03 initial writer recorded incompletely (G03-H02, the adjacent
    // negative premises, and outside casts).
    await enter('to-road', 'old-trade-road');
    await enter('to-site', 'abandoned-caravan-site');
    await inspect('find', 'goblin-weapon');
    await inspect('pass-over', 'goblin-weapon');
    await dm('charm', {
      type: 'CreateEntity',
      entityId: 'gap-charm',
      kind: 'item',
      name: 'Charm',
      existsSince: null,
      placement: { locationId: 'abandoned-caravan-site', since: null },
    });
    await dm('charm-magic', {
      type: 'AddClue',
      entityId: 'gap-charm',
      clueId: 'gap-charm-magic',
      method: 'magic',
      statement: 'A charm hums.',
      subjects: [],
    });
    await dm('charm-moved', {
      type: 'PlaceEntity',
      entityId: 'gap-charm',
      locationId: 'north-gate',
    });
    await cast('detect-after-move', 'detect-magic');
    await npc('revived', 'gap-revived', 'abandoned-caravan-site');
    await status('revived-dies', 'gap-revived', 'dead');
    await status('revival', 'gap-revived', 'active');
    await cast('mark-revived', 'hunters-mark', 'gap-revived');
    const ambush = (await json('./fixtures/ravenford/road-ambush.json')) as {
      place: Record<string, unknown>[];
      startCombat: { combatants: unknown[] };
    };
    const rules = (await json('./fixtures/ravenford/rules-seed.json')) as {
      commands: { type: string; sheet?: Record<string, unknown> }[];
    };
    const sheet = rules.commands.find((c) => c.type === 'SetCharacterSheet')?.sheet;
    await dm('seren', {
      type: 'CreateEntity',
      entityId: SEREN,
      kind: 'character',
      name: 'Seren Ashgrove',
      existsSince: null,
      placement: { locationId: 'old-trade-road', since: null },
    });
    await dm('seren-sheet', { type: 'SetCharacterSheet', entityId: SEREN, sheet });
    for (const place of ambush.place) await dm(`place-${String(place['entityId'])}`, place);
    await dm('start', {
      ...ambush.startCombat,
      combatants: [
        ...ambush.startCombat.combatants,
        { entityId: SEREN, side: 'party', position: { x: 2, y: 8 } },
      ],
    });
    await dm('seren-ac', {
      type: 'SetCharacterSheet',
      entityId: SEREN,
      sheet: { ...sheet, armorClass: 30 },
    });
    await endTurnsUntil(ELOWEN, 'to-elowen');
    const miss = await player('miss', {
      type: 'Attack',
      combatantId: ELOWEN,
      attackId: 'longbow',
      targetId: SEREN,
    });
    if ((miss as { outcome?: { hit?: boolean } }).outcome?.hit !== false)
      throw new Error('expected a miss');
    await dm('elowen-ends', { type: 'EndTurn', combatantId: ELOWEN });
    // Whoever acts now; the combatant after it dies and its turn is passed over.
    const now = await current();
    const order = ['goblin-raider-1', 'goblin-raider-2', 'goblin-raider-3', 'goblin-shaman'];
    const victim = order.find((id) => id !== now) ?? 'goblin-raider-3';
    await status('combatant-dies', victim, 'dead');
    for (let turn = 0; turn < 6; turn += 1) {
      const acting = await current();
      await dm(`turn-${String(turn)}`, { type: 'EndTurn', combatantId: acting });
    }
  } else if (SCENARIO === 'investigation') {
    // The Gate 02 writer: an inspection passing over a clue its scope had found.
    await enter('to-road', 'old-trade-road');
    await enter('to-site', 'abandoned-caravan-site');
    await inspect('find', 'goblin-weapon');
    await inspect('pass-over', 'goblin-weapon');
    await inspect('wheel', 'broken-wagon-wheel');
  } else {
    throw new Error(`unknown scenario ${SCENARIO}`);
  }

  const rows = async (sql: string) =>
    (await pool.query(sql, ['ravenford'])).rows.map((row: { row: unknown }) => row.row);
  const dump = {
    campaignId: 'ravenford',
    scenario: SCENARIO,
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
  await writeFile(OUT, `${JSON.stringify(dump)}\n`);
  console.log(
    JSON.stringify({
      scenario: SCENARIO,
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
