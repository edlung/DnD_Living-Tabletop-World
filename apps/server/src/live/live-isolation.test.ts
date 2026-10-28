import type { WorldEngine } from '@ltw/domain';
import { beforeAll, describe, expect, it } from 'vitest';

import ambush from '../../../../fixtures/ravenford/road-ambush.json' with { type: 'json' };
import hiddenCharacter from '../../../../tests/e2e/fixtures/hidden-character.json' with { type: 'json' };
import { delivered, liveRavenford, readyLive, type LiveStream } from '../testing/live.ts';
import { ASHEN_CIRCLE_ID, TOKENS } from '../testing/ravenford-app.ts';

/**
 * The change signal leaks nothing (docs/adr/0033-live-session.md §2; Gate 06 row 310): for
 * every non-DM perspective of Ravenford, and the hidden-character sentinel's, DM commits that
 * only the DM may read leave the fingerprint unchanged, so no `changed` is sent, while the
 * DM's own subscription is signalled. A change a perspective may read is signalled once.
 */
const DM = { actorId: 'dm-ravenford', kind: 'user' } as const;
let commands = 0;

async function dmCommand(engine: WorldEngine, command: Record<string, unknown>): Promise<void> {
  commands += 1;
  const result = await engine.execute({
    commandId: `live-isolation.${String(commands)}`,
    campaignId: 'ravenford',
    actor: DM,
    command,
  });
  expect(result.status, JSON.stringify(result)).toBe('accepted');
}

/** Hidden from every perspective but the DM's (the Gate 01 forbidden markers). */
const SECRET_ONLY: readonly Record<string, unknown>[] = [
  {
    type: 'AddKnowledge',
    knowledgeId: 'live-dm-note',
    scope: { kind: 'DM' },
    knowledgeType: 'SECRET',
    statement: 'Let the cult move before the party reaches the ford.',
    subjects: [ASHEN_CIRCLE_ID],
    knownSince: null,
  },
  {
    type: 'AddKnowledge',
    knowledgeId: 'live-world-truth',
    scope: { kind: 'WORLD_TRUTH' },
    knowledgeType: 'FACT',
    statement: 'The reagents were sold in the capital.',
    subjects: ['guild-caravan'],
    knownSince: null,
  },
  {
    type: 'UpdateEntityProfile',
    entityId: ASHEN_CIRCLE_ID,
    name: 'Circle of Ash',
  },
  {
    type: 'CreateEntity',
    entityId: 'live-hidden-watcher',
    kind: 'npc',
    name: 'Hidden Watcher',
    existsSince: null,
    description: 'Watches the gate unseen.',
  },
  {
    type: 'CreateEntity',
    entityId: 'live-hidden-heir',
    kind: 'character',
    name: 'Hidden Heir',
    existsSince: null,
  },
];

const HIDDEN = `CHARACTER:${hiddenCharacter.entityId}`;
const query = (perspective: string, extra = '') =>
  `/campaigns/ravenford/live?perspective=${encodeURIComponent(perspective)}${extra}`;

/** Every non-DM perspective each member can hold, with and without focus and place. */
const OBSERVERS: readonly { readonly token: string; readonly url: string }[] = [
  ...['PLAYER', 'CHARACTER:elowen-starwhisper', 'PARTY', 'PUBLIC'].map((perspective) => ({
    token: TOKENS.player,
    url: query(perspective),
  })),
  { token: TOKENS.player, url: query('PLAYER', '&focus=mira-vale&place=market-square') },
  { token: TOKENS.player, url: query('PARTY', '&focus=orin-stonebeard&place=north-gate') },
  ...[
    'PUBLIC',
    'PARTY',
    'CHARACTER:elowen-starwhisper',
    'NPC:mira-vale',
    'NPC:orin-stonebeard',
    'NPC:captain-thorne',
    HIDDEN,
  ].map((perspective) => ({ token: TOKENS.dm, url: query(perspective) })),
  { token: TOKENS.dm, url: query('NPC:mira-vale', '&focus=mira-vale&place=market-square') },
  { token: TOKENS.dm, url: query(HIDDEN, `&focus=${hiddenCharacter.entityId}`) },
  // A focus on something the perspective cannot see is fingerprinted as not visible.
  { token: TOKENS.player, url: query('PLAYER', `&focus=${hiddenCharacter.entityId}`) },
];

const changes = (stream: LiveStream) =>
  stream.messages().filter((message) => message.type === 'changed');
const perspectiveOf = (url: string) => new URL(url, 'http://test').searchParams.get('perspective');

describe('the live signal for a perspective', () => {
  let live: Awaited<ReturnType<typeof liveRavenford>>;
  let observers: LiveStream[];
  let dm: LiveStream;

  beforeAll(async () => {
    live = await liveRavenford({ limits: { perActor: 20 } });
    await dmCommand(live.engine, hiddenCharacter);
    observers = [];
    for (const observer of OBSERVERS) {
      observers.push(await readyLive(live.app, observer.url, observer.token));
    }
    dm = await readyLive(live.app, query('DM'), TOKENS.dm);
    // The DM connecting is itself visible (presence): let every subscription take it in.
    await live.hub.cycle();
    await delivered();
  });

  it('stays silent while nothing changes', async () => {
    const before = [...observers, dm].map((stream) => changes(stream).length);
    for (let cycle = 0; cycle < 3; cycle += 1) await live.hub.cycle();
    await delivered();
    expect([...observers, dm].map((stream) => changes(stream).length)).toEqual(before);
  });

  it.each(SECRET_ONLY.map((command) => [command['type'], command] as const))(
    'never signals a secret-only %s to a non-DM perspective, while the DM is signalled',
    async (_type, command) => {
      const before = changes(dm).length;
      const seen = observers.map((stream) => changes(stream).length);
      await dmCommand(live.engine, command);
      await live.hub.cycle();
      await delivered();
      for (const [index, stream] of observers.entries()) {
        expect(changes(stream).length, OBSERVERS[index]?.url).toBe(seen[index]);
      }
      expect(changes(dm)).toHaveLength(before + 1);
      // The counter is the subscription's own: it never reveals other changes.
      expect(changes(dm).at(-1)).toEqual({ type: 'changed', seq: before + 1 });
    },
  );

  it('signals a change the perspective may read exactly once, and only to those who read it', async () => {
    const partyBefore = observers.map((stream) => changes(stream).length);
    await dmCommand(live.engine, {
      type: 'AddKnowledge',
      knowledgeId: 'live-party-rumour',
      scope: { kind: 'PARTY' },
      knowledgeType: 'RUMOR',
      statement: 'Someone saw lanterns on the Old Trade Road.',
      subjects: ['old-trade-road'],
      knownSince: null,
    });
    await live.hub.cycle();
    await live.hub.cycle();
    await delivered();
    const signalled = OBSERVERS.filter(
      (_observer, index) =>
        changes(observers[index] as LiveStream).length > (partyBefore[index] ?? 0),
    ).map((observer) => observer.url);
    // The party's record reaches the party and the character's views, never PUBLIC or an NPC.
    expect(signalled).toEqual(
      expect.arrayContaining([
        query('PLAYER'),
        query('CHARACTER:elowen-starwhisper'),
        query('PARTY'),
      ]),
    );
    for (const url of signalled) {
      expect(perspectiveOf(url)).not.toMatch(/^(PUBLIC|NPC:|CHARACTER:b27fefda)/);
    }
    for (const [index, stream] of observers.entries()) {
      expect(changes(stream).length - (partyBefore[index] ?? 0)).toBeLessThanOrEqual(1);
    }
  });

  it('writes only the fixed frames: no world content, credential, position or version', () => {
    const grammar =
      /^(event: ready\ndata: \{\}\n\n|event: changed\ndata: \{"seq":\d+\}\n\n|: heartbeat\n\n)$/;
    for (const stream of [...observers, dm]) {
      for (const frame of stream.frames()) expect(frame).toMatch(grammar);
    }
  });
});

/**
 * The DM's undo and the player's notice of an undone action (ADR 0033, amendment of 2026-10-28):
 * Elowen's player's `undone-actions` view changes only when one of that player's own commands is
 * undone. Any other undo leaves it empty, and signals the player no more than the undone command
 * itself did; the undo of the player's own command signals exactly once.
 */
describe('the live signal for an undo', () => {
  const PLAYER = { actorId: 'player-elowen', kind: 'user' } as const;
  const SEREN = { actorId: 'player-seren', kind: 'user' } as const;
  let live: Awaited<ReturnType<typeof liveRavenford>>;
  let elowen: LiveStream;
  let issued = 0;

  async function run(actor: typeof DM | typeof PLAYER | typeof SEREN, command: object) {
    issued += 1;
    const commandId = `live-undo.${String(issued)}`;
    const result = await live.engine.execute({
      commandId,
      campaignId: 'ravenford',
      actor,
      command,
    });
    expect(result.status, JSON.stringify(result)).toBe('accepted');
    return commandId;
  }
  async function settle(): Promise<number> {
    const before = changes(elowen).length;
    await live.hub.cycle();
    await live.hub.cycle();
    await delivered();
    return changes(elowen).length - before;
  }
  async function undoneFor(): Promise<unknown> {
    const response = await live.app.inject({
      method: 'GET',
      url: '/campaigns/ravenford/undone-actions?perspective=PLAYER',
      headers: { authorization: `Bearer ${TOKENS.player}` },
    });
    return response.json<{ actions: unknown[] }>().actions;
  }
  /** The command, then its undo by the DM: the undo is told to no one and signals no more. */
  async function undoneQuietly(actor: typeof DM | typeof PLAYER | typeof SEREN, command: object) {
    const id = await run(actor, command);
    const done = await settle();
    await run(DM, { type: 'UndoCommand', targetCommandId: id });
    expect(await settle()).toBeLessThanOrEqual(done);
    expect(await undoneFor()).toEqual([]);
  }

  beforeAll(async () => {
    live = await liveRavenford({ limits: { perActor: 20 } });
    // Seren, a second player's character, at North Gate.
    await run(DM, {
      type: 'CreateEntity',
      entityId: 'seren-ashgrove',
      kind: 'character',
      name: 'Seren Ashgrove',
      existsSince: null,
      placement: { locationId: 'north-gate', since: null },
    });
    await run(DM, {
      type: 'AssignCharacter',
      characterId: 'seren-ashgrove',
      playerActorId: 'player-seren',
    });
    elowen = await readyLive(live.app, query('PLAYER'), TOKENS.player);
    await settle();
  });

  it('stays silent when the DM undoes the DM’s own authoring', async () => {
    const id = await run(DM, {
      type: 'AddKnowledge',
      knowledgeId: 'live-undo-dm-note',
      scope: { kind: 'DM' },
      knowledgeType: 'SECRET',
      statement: 'The ford is watched.',
      subjects: ['old-trade-road'],
      knownSince: null,
    });
    expect(await settle()).toBe(0);
    await run(DM, { type: 'UndoCommand', targetCommandId: id });
    expect(await settle()).toBe(0);
    expect(await undoneFor()).toEqual([]);
  });

  it('tells Elowen’s player nothing when the DM undoes another player’s action', async () => {
    await undoneQuietly(SEREN, {
      type: 'EnterLocation',
      characterId: 'seren-ashgrove',
      locationId: 'market-square',
    });
  });

  it('tells nothing of an undone time advance', async () => {
    await undoneQuietly(DM, { type: 'AdvanceWorldTime', by: 3600 });
  });

  it('tells nothing of an undone creature attack', async () => {
    for (const step of [...ambush.place, ambush.startCombat]) await run(DM, step);
    await run(PLAYER, { type: 'EndTurn', combatantId: 'elowen-starwhisper' });
    await settle();
    await undoneQuietly(DM, {
      type: 'Attack',
      combatantId: 'creature-10fb59d4',
      attackId: 'shortbow',
      targetId: 'elowen-starwhisper',
    });
  });

  it('signals exactly once, and lists it, when the DM undoes Elowen’s player’s own action', async () => {
    const id = await run(PLAYER, {
      type: 'ExamineEntity',
      characterId: 'elowen-starwhisper',
      entityId: 'location-f3b82c8b',
      method: 'inspect',
    });
    await settle();
    await run(DM, { type: 'UndoCommand', targetCommandId: id });
    expect(await settle()).toBe(1);
    expect(await undoneFor()).toEqual([
      {
        commandId: id,
        command: {
          type: 'ExamineEntity',
          characterId: 'elowen-starwhisper',
          entityId: 'location-f3b82c8b',
          method: 'inspect',
        },
      },
    ]);
  });
});
