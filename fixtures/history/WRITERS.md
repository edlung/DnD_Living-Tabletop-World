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

## `b7a1a92-npc-memories.json`

Written on 2026-10-04 by revision `b7a1a92fa5886c271d623d3a7a87fdeec9c7f8bf` (Stage 120) through its own HTTP app and `PostgresEventStore`, into a throwaway database it migrated, seeded, and dropped. Dice roll the middle face. Recorded before Stage 130 gave `MemoryRecorded` and `ContradictionDetected` version 3 (ADR 0020; `packages/domain/src/kernel/event-versions.ts`).

Steps:

1. Check out the revision on its own (`git worktree add --detach <dir> b7a1a92`) and run `pnpm install --frozen-lockfile --offline` there.
2. Save the script below in that checkout's root as `history-writer.mts`, with PostgreSQL running.
3. Run `LTW_HISTORY_OUT=<output.json> node --conditions=@ltw/source history-writer.mts` from that root. It prints `{"version":135,"events":135,"commands":103}`.
4. The JSON it writes was laid out one row per line, with a `$comment` and the revision added to `writer`; the rows themselves are unchanged.

```ts
// Runs inside a checkout of revision b7a1a92 (the Stage 120 writer): drives that
// revision's own HTTP app and PostgreSQL store through the npc-memories scenario,
// then dumps the stored rows. LTW_HISTORY_OUT: output path.
import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

import { post } from './apps/server/src/testing/gate02-scenarios.ts';
import { TOKENS, ravenfordApp, seededEngine } from './apps/server/src/testing/ravenford-app.ts';
import { createThrowawayDatabase } from './apps/server/src/testing/throwaway-database.ts';
import { PostgresEventStore } from './apps/server/src/world-engine/postgres-event-store.ts';

const require = createRequire(new URL('./apps/server/package.json', `file://${process.cwd()}/`));
const { Pool } = require('pg');
const ELOWEN = 'elowen-starwhisper';
const OUT = process.env.LTW_HISTORY_OUT;
if (!OUT) throw new Error('LTW_HISTORY_OUT is required');

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
  const enter = (label: string, locationId: string) =>
    player(label, { type: 'EnterLocation', characterId: ELOWEN, locationId });
  const ask = (label: string, npcId: string, topicId: string) =>
    player(label, { type: 'AskAbout', characterId: ELOWEN, npcId, topicId });

  // Generated text quoting names, and answers passing over what was told before (ADR 0020).
  await dm('rename-caravan', {
    type: 'UpdateEntityProfile',
    entityId: 'guild-caravan',
    name: 'The Lost Caravan',
  });
  await dm('mira-wagons', {
    type: 'AddKnowledge',
    knowledgeId: 'legacy-mira-wagons',
    scope: { kind: 'NPC', npcId: 'mira-vale' },
    knowledgeType: 'FACT',
    statement: 'The wagons were freshly painted.',
    subjects: ['guild-caravan'],
    knownSince: null,
  });
  await dm('mira-wagons-willing', {
    type: 'SetDisclosure',
    knowledgeId: 'legacy-mira-wagons',
    disclosure: 'WILLING',
  });
  // Mira tells the cargo and the prior incident, then, asked about the caravan,
  // only the wagons: the cargo was told before, the departure is guarded.
  await ask('ask-road', 'mira-vale', 'old-trade-road');
  await ask('ask-caravan', 'mira-vale', 'guild-caravan');
  await dm('rename-weapon', {
    type: 'UpdateEntityProfile',
    entityId: 'goblin-weapon',
    name: 'Notched Blade',
  });
  await enter('to-road', 'old-trade-road');
  await enter('to-site', 'abandoned-caravan-site');
  await player('inspect-weapon', {
    type: 'ExamineEntity',
    characterId: ELOWEN,
    entityId: 'goblin-weapon',
    method: 'inspect',
  });
  await enter('back-to-road', 'old-trade-road');
  await enter('to-gate', 'north-gate');
  // Thorne's account contradicts Mira's, as the party copied it.
  await ask('ask-thorne', 'captain-thorne', 'guild-caravan');

  const rows = async (sql: string) =>
    (await pool.query(sql, ['ravenford'])).rows.map((row: { row: unknown }) => row.row);
  const dump = {
    campaignId: 'ravenford',
    scenario: 'npc-memories',
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
      version: (dump.stream as { version: number }).version,
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

## `e9c05ad-chronicle-names.json`

Written on 2026-10-04 by revision `e9c05ad46c15863b124b20fc4dd217f654f29777` (Stages 170–180) through its own HTTP app and `PostgresEventStore`, into a throwaway database it migrated, seeded, and dropped. Dice roll the middle face; chapter prose came from the local narrative provider. Recorded before the Gate 05 remediation gave `ChronicleGenerated` version 3 (G05-H01; `packages/domain/src/kernel/event-versions.ts`).

Steps:

1. Check out the revision on its own (`git worktree add --detach <dir> e9c05ad`) and run `pnpm install --frozen-lockfile --offline` there.
2. Save the script below in that checkout's root as `history-writer.mts`, with PostgreSQL running.
3. Run `LTW_HISTORY_OUT=<output.json> NODE_ENV=test node --conditions=@ltw/source history-writer.mts` from that root. It prints `{"version":105,"events":105,"commands":96}`.
4. The JSON it writes was laid out one row per line, with a `$comment` and the revision added to `writer`; the rows themselves are unchanged.

```ts
// Runs inside a checkout of revision e9c05ad (the Stage 170–180 Chronicle writer):
// drives that revision's own HTTP app and PostgreSQL store through renames and two
// chapters whose entries and prose use those names, then dumps the stored rows.
// LTW_HISTORY_OUT: output path.
import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

import { post as command } from './apps/server/src/testing/gate02-scenarios.ts';
import {
  TOKENS,
  post,
  ravenfordApp,
  seededEngine,
} from './apps/server/src/testing/ravenford-app.ts';
import { createThrowawayDatabase } from './apps/server/src/testing/throwaway-database.ts';
import { PostgresEventStore } from './apps/server/src/world-engine/postgres-event-store.ts';

const require = createRequire(new URL('./apps/server/package.json', `file://${process.cwd()}/`));
const { Pool } = require('pg');
const OUT = process.env.LTW_HISTORY_OUT;
if (!OUT) throw new Error('LTW_HISTORY_OUT is required');

const database = await createThrowawayDatabase({ migrate: true });
const pool = new Pool({ connectionString: database.url });
let app: Awaited<ReturnType<typeof ravenfordApp>> | undefined;
const labels: Record<string, string> = {};
try {
  app = await ravenfordApp(await seededEngine(new PostgresEventStore(pool)));
  const live = app;
  const dm = async (label: string, body: Record<string, unknown>) => {
    const { status, body: result } = await command(live, TOKENS.dm, `legacy-${label}`, body);
    if (status !== 200 || result.status !== 'accepted') {
      throw new Error(`${label}: ${String(status)} ${JSON.stringify(result)}`);
    }
    labels[label] = result.commandId;
  };
  const chapter = async (label: string, perspective: string) => {
    const response = await post(
      live,
      '/campaigns/ravenford/chronicle',
      { title: `Legacy chapter (${perspective})`, perspective, from: 0 },
      TOKENS.dm,
    );
    const body = response.json<{ chronicleId: string | null; result: { status: string } }>();
    if (response.statusCode !== 200 || body.chronicleId === null) {
      throw new Error(`${label}: ${String(response.statusCode)} ${response.body}`);
    }
    labels[label] = body.chronicleId;
  };

  // Names the chapters will use: the DM chapter tells Elowen going to the square;
  // the party chapter's prose is rendered from Mira, Elowen, and the square.
  await dm('rename-elowen', {
    type: 'UpdateEntityProfile',
    entityId: 'elowen-starwhisper',
    name: 'Elowen of the Trade Road',
  });
  await dm('rename-square', {
    type: 'UpdateEntityProfile',
    entityId: 'market-square',
    name: 'The Old Market',
  });
  await dm('rename-mira', {
    type: 'UpdateEntityProfile',
    entityId: 'mira-vale',
    name: 'Mira of the Stalls',
  });
  await chapter('dm-chapter', 'DM');
  await chapter('party-chapter', 'PARTY');

  const rows = async (sql: string) =>
    (await pool.query(sql, ['ravenford'])).rows.map((row: { row: unknown }) => row.row);
  const dump = {
    campaignId: 'ravenford',
    scenario: 'chronicle-names',
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
      version: (dump.stream as { version: number }).version,
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

## `a488de4-cited-examinations.json`, `a488de4-cited-examination-undone.json`

Written on 2026-10-04 by revision `a488de462ff5e4fa6f1513a831f38e63291e3c2a` (Gate 05 retest 1) through its own HTTP app and `PostgresEventStore`, into a throwaway database it migrated, seeded, and dropped. One run wrote both files: the first before the undo, the second after it. Inspections roll nothing; chapter prose came from the local narrative provider. Recorded before the Gate 05 retest 1 remediation gave `ChronicleGenerated` version 4 (G05-H02; `packages/domain/src/kernel/event-versions.ts`).

Steps:

1. Check out the revision on its own (`git worktree add --detach <dir> a488de4`) and run `pnpm install --frozen-lockfile --offline` there.
2. Save the script below in that checkout's root as `history-writer.mts`, with PostgreSQL running.
3. Run `LTW_HISTORY_OUT=<first.json> LTW_HISTORY_OUT_UNDONE=<second.json> NODE_ENV=test node --conditions=@ltw/source history-writer.mts` from that root. It prints both inspections' outcomes (`"roll":null,"discovered":[]`), then `{"scenario":"cited-examinations","version":117,"events":117,"commands":99}` and `{"scenario":"cited-examination-undone","version":118,"events":118,"commands":100}`.
4. Each JSON it writes was laid out one row per line, with a `$comment` and the revision added to `writer`; the rows themselves are unchanged.

```ts
// Runs inside a checkout of revision a488de4 (the Gate 05 retest 1 Chronicle writer):
// drives that revision's own HTTP app and PostgreSQL store through examinations that
// change no fact (a repeated inspection, and a first inspection of an item with no
// clue), a DM chapter that tells them, and one more inspection after it, then dumps
// the stored rows. It then undoes the repeated inspection beneath the chapter, which
// that revision accepts (Gate 05 retest 1, G05-H02), and dumps the rows again.
// LTW_HISTORY_OUT: output path; LTW_HISTORY_OUT_UNDONE: output path after the undo.
import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

import { post as command } from './apps/server/src/testing/gate02-scenarios.ts';
import {
  TOKENS,
  post,
  ravenfordApp,
  seededEngine,
} from './apps/server/src/testing/ravenford-app.ts';
import { createThrowawayDatabase } from './apps/server/src/testing/throwaway-database.ts';
import { PostgresEventStore } from './apps/server/src/world-engine/postgres-event-store.ts';

const require = createRequire(new URL('./apps/server/package.json', `file://${process.cwd()}/`));
const { Pool } = require('pg');
const OUT = process.env.LTW_HISTORY_OUT;
const OUT_UNDONE = process.env.LTW_HISTORY_OUT_UNDONE;
if (!OUT || !OUT_UNDONE) throw new Error('LTW_HISTORY_OUT and LTW_HISTORY_OUT_UNDONE are required');

const database = await createThrowawayDatabase({ migrate: true });
const pool = new Pool({ connectionString: database.url });
let app: Awaited<ReturnType<typeof ravenfordApp>> | undefined;
const labels: Record<string, string> = {};
try {
  app = await ravenfordApp(await seededEngine(new PostgresEventStore(pool)));
  const live = app;
  const submit = async (token: string, label: string, body: Record<string, unknown>) => {
    const { status, body: result } = await command(live, token, `legacy-${label}`, body);
    if (status !== 200 || result.status !== 'accepted') {
      throw new Error(`${label}: ${String(status)} ${JSON.stringify(result)}`);
    }
    labels[label] = result.commandId;
    return result;
  };
  const elowen = (label: string, body: Record<string, unknown>) =>
    submit(TOKENS.player, label, { characterId: 'elowen-starwhisper', ...body });
  const inspect = async (label: string, entityId: string) => {
    const result = await elowen(label, { type: 'ExamineEntity', entityId, method: 'inspect' });
    return result.status === 'accepted' ? result.outcome : null;
  };
  const chapter = async (label: string, perspective: string) => {
    const response = await post(
      live,
      '/campaigns/ravenford/chronicle',
      { title: `Legacy chapter (${perspective})`, perspective, from: 0 },
      TOKENS.dm,
    );
    const body = response.json<{ chronicleId: string | null; result: { status: string } }>();
    if (response.statusCode !== 200 || body.chronicleId === null) {
      throw new Error(`${label}: ${String(response.statusCode)} ${response.body}`);
    }
    labels[label] = body.chronicleId;
  };

  await elowen('enter-road', { type: 'EnterLocation', locationId: 'old-trade-road' });
  await elowen('enter-site', { type: 'EnterLocation', locationId: 'abandoned-caravan-site' });
  // The first inspection finds the symbol's clue; the second finds nothing new and rolls nothing.
  await inspect('first-inspection', 'strange-symbol');
  const repeated = await inspect('repeat-inspection', 'strange-symbol');
  await submit(TOKENS.dm, 'create-token', {
    type: 'CreateEntity',
    entityId: 'ordinary-token',
    kind: 'item',
    name: 'Ordinary Token',
    existsSince: null,
    placement: { locationId: 'abandoned-caravan-site', since: null },
  });
  // An item with no clue: its first inspection finds nothing and rolls nothing.
  const plain = await inspect('token-inspection', 'ordinary-token');
  await chapter('dm-chapter', 'DM');
  // After the chapter, so no chapter tells it.
  await inspect('later-inspection', 'ordinary-token');

  const rows = async (sql: string) =>
    (await pool.query(sql, ['ravenford'])).rows.map((row: { row: unknown }) => row.row);
  const dump = async (out: string, scenario: string) => {
    const dumped = {
      campaignId: 'ravenford',
      scenario,
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
    await writeFile(out, `${JSON.stringify(dumped)}\n`);
    console.log(
      JSON.stringify({
        scenario,
        version: (dumped.stream as { version: number }).version,
        events: dumped.events.length,
        commands: dumped.commands.length,
      }),
    );
  };
  console.log(JSON.stringify({ repeated, plain }));
  await dump(OUT, 'cited-examinations');
  await submit(TOKENS.dm, 'undo-repeat-inspection', {
    type: 'UndoCommand',
    targetCommandId: labels['repeat-inspection'],
  });
  await dump(OUT_UNDONE, 'cited-examination-undone');
} finally {
  if (app) await app.close();
  await pool.end();
  await database.drop();
}
```

## `5da1b05-asset-lineage.json`

Written on 2026-10-16 by revision `5da1b05687d17462deb3d2727afd1605ebd3e14b` (the Stage 330 design commit, before asset purposes) through its own HTTP app, asset worker (local placeholder generator, in-memory contents) and `PostgresEventStore`, into a throwaway database it migrated, seeded, and dropped. Tomas Reed came from the deterministic offline interpreter. Recorded before Stage 330 part A gave asset requests a purpose (`docs/adr/0035-images.md` §4).

Steps:

1. In a checkout of that revision (the Stage 330 worktree before its first change), save the script below in the root as `history-writer.mts`, with PostgreSQL running.
2. Run `LTW_HISTORY_OUT=<output.json> NODE_ENV=test node --conditions=@ltw/source history-writer.mts` from that root. It prints `{"scenario":"asset-lineage","version":137,"events":137,"commands":125}`.
3. The JSON it writes was laid out one row per line, with a `$comment` and the revision added to `writer`; the rows themselves are unchanged.

```ts
// Runs inside a checkout of revision 5da1b05 (the Stage 330 design commit, before asset purposes):
// drives that revision's own HTTP app, asset worker (local placeholder generator) and PostgreSQL
// store through every asset event type — an authoring commit's reference request, DM requests,
// worker starts, completions and a refused generation, approvals of a reference, a replacement
// and two variants, a retraction, cancellations while queued and while running (a discarded
// image), and an undone approval — then dumps the stored rows. LTW_HISTORY_OUT: output path.
import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

import {
  ImageGenerationError,
  createPlaceholderImageGenerator,
  type ImageGenerator,
} from './packages/ai/src/index.ts';

import { InMemoryAssetContentStore } from './apps/server/src/assets/content-store.ts';
import { AssetWorker } from './apps/server/src/assets/worker.ts';
import { createLogger } from './apps/server/src/platform/logging/logger.ts';
import { post as command } from './apps/server/src/testing/gate02-scenarios.ts';
import {
  TOKENS,
  post,
  ravenfordApp,
  seededEngine,
} from './apps/server/src/testing/ravenford-app.ts';
import { createThrowawayDatabase } from './apps/server/src/testing/throwaway-database.ts';
import { PostgresEventStore } from './apps/server/src/world-engine/postgres-event-store.ts';

const require = createRequire(new URL('./apps/server/package.json', `file://${process.cwd()}/`));
const { Pool } = require('pg');
const OUT = process.env.LTW_HISTORY_OUT;
if (!OUT) throw new Error('LTW_HISTORY_OUT is required');

const database = await createThrowawayDatabase({ migrate: true });
const pool = new Pool({ connectionString: database.url });
let app: Awaited<ReturnType<typeof ravenfordApp>> | undefined;
const labels: Record<string, string> = {};
try {
  const engine = await seededEngine(new PostgresEventStore(pool));
  app = await ravenfordApp(engine);
  const live = app;
  const contents = new InMemoryAssetContentStore();
  const logger = createLogger({ service: 'history-writer', level: 'silent' });
  const run = (generator: ImageGenerator) =>
    new AssetWorker({ engine, contents, generator, timeoutMs: 5_000, logger }).runOnce('ravenford');
  const dm = async (label: string, body: Record<string, unknown>) => {
    const { status, body: result } = await command(live, TOKENS.dm, `legacy-${label}`, body);
    if (status !== 200 || result.status !== 'accepted') {
      throw new Error(`${label}: ${String(status)} ${JSON.stringify(result)}`);
    }
    labels[label] = result.commandId;
    return result.commandId;
  };
  const request = async (label: string, body: Record<string, unknown>) =>
    `${await dm(label, { type: 'RequestAsset', ...body })}#0`;
  const asset = (requestId: string) => `${requestId}~asset`;
  const placeholder = createPlaceholderImageGenerator();

  // An authoring commit creates Tomas Reed and requests his reference (source: authoring).
  const intent = (
    await post(
      live,
      '/campaigns/ravenford/ai/intents',
      { text: 'Add a young guard near North Gate who saw the caravan leave.' },
      TOKENS.dm,
    )
  ).json<{ status: string; traceId: string }>();
  if (intent.status !== 'PROPOSED') throw new Error(`intent: ${intent.status}`);
  const created = (
    await post(
      live,
      '/campaigns/ravenford/authoring/proposals',
      { traceId: intent.traceId },
      TOKENS.dm,
    )
  ).json<{ proposal: { proposalId: string }; preview: { confirmation: unknown } }>();
  const committed = await post(
    live,
    `/campaigns/ravenford/authoring/proposals/${created.proposal.proposalId}/commit`,
    { revision: 1, confirmation: created.preview.confirmation },
    TOKENS.dm,
  );
  if (committed.statusCode !== 200) throw new Error(`commit: ${committed.body}`);
  labels['author-tomas'] = committed.json<{ commandId: string }>().commandId;
  const tomas = `${labels['author-tomas']}#0`;

  const mira = await request('request-mira', { entityId: 'mira-vale', variant: 'reference' });
  const thorne = await request('request-thorne', {
    entityId: 'captain-thorne',
    variant: 'reference',
  });
  await dm('cancel-thorne-queued', { type: 'CancelAssetRequest', requestId: thorne });
  await run(placeholder);
  await dm('approve-mira', { type: 'ApproveAsset', assetId: asset(mira) });
  await dm('approve-tomas', { type: 'ApproveAsset', assetId: asset(tomas) });

  const night = await request('request-mira-night', {
    entityId: 'mira-vale',
    variant: 'derived',
    label: 'night',
  });
  await run(placeholder);
  await dm('approve-mira-night', { type: 'ApproveAsset', assetId: asset(night) });

  const smiling = await request('request-mira-smiling', {
    entityId: 'mira-vale',
    variant: 'derived',
    label: 'smiling',
    audience: 'dm',
    note: 'A warm smile at the market stall.',
  });
  await run(placeholder);
  await dm('approve-mira-smiling', { type: 'ApproveAsset', assetId: asset(smiling) });
  await dm('undo-approve-mira-smiling', {
    type: 'UndoCommand',
    targetCommandId: labels['approve-mira-smiling'],
  });

  await request('request-orin', { entityId: 'orin-stonebeard', variant: 'reference' });
  await run({
    id: 'refusing',
    generate: () => Promise.reject(new ImageGenerationError('REFUSED', 'refused')),
  });

  const road = await request('request-road', { entityId: 'old-trade-road', variant: 'reference' });
  await run(placeholder);
  await dm('retract-road', { type: 'RetractAsset', assetId: asset(road) });

  const square = await request('request-square', {
    entityId: 'market-square',
    variant: 'reference',
  });
  await run({
    id: 'local',
    generate: async (brief) => {
      await dm('cancel-square-running', { type: 'CancelAssetRequest', requestId: square });
      return placeholder.generate(brief);
    },
  });

  const replacement = await request('request-mira-again', {
    entityId: 'mira-vale',
    variant: 'reference',
  });
  await run(placeholder);
  await dm('approve-mira-again', { type: 'ApproveAsset', assetId: asset(replacement) });

  const rows = async (sql: string) =>
    (await pool.query(sql, ['ravenford'])).rows.map((row: { row: unknown }) => row.row);
  const dumped = {
    campaignId: 'ravenford',
    scenario: 'asset-lineage',
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
  await writeFile(OUT, `${JSON.stringify(dumped)}\n`);
  console.log(
    JSON.stringify({
      scenario: dumped.scenario,
      version: (dumped.stream as { version: number }).version,
      events: dumped.events.length,
      commands: dumped.commands.length,
    }),
  );
} finally {
  if (app) await app.close();
  await pool.end();
  await database.drop();
}
```
