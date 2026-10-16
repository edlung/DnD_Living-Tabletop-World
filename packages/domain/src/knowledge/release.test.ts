import type { CommandResult } from '@ltw/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { schemaVersionOf } from '../kernel/event-versions.ts';
import { parseRecordedEvent, type RecordedEvent } from '../kernel/events.ts';
import { CorruptHistoryError, replay } from '../kernel/evolve.ts';
import { footprintOf } from '../kernel/facts.ts';
import { checkWorldIntegrity } from '../kernel/projections/integrity.ts';
import {
  CAMPAIGN,
  DM,
  PLAYER,
  SYSTEM,
  createHarness,
  expectAccepted,
  expectRejected,
  seedBasicWorld,
  type Harness,
} from '../kernel/testing/kernel-harness.ts';
import { mulberry32 } from '../kernel/testing/random-commands.ts';
import { redecideEffective } from '../kernel/verification/redecide.ts';
import { MODIFIERS, OUTSIDER, codeOf, investigationWorld } from '../investigation/testing/world.ts';

/**
 * `ReleaseCharacter` (docs/adr/0036-production-sign-in.md §4; docs/STAGE_340_DESIGN.md
 * "Revocation"): the DM alone frees a character from its player from now on. The event names
 * the player, so the roster entry comes back exactly on undo; earlier commands stay history.
 */
let harness: Harness;

beforeEach(async () => {
  harness = createHarness();
  await seedBasicWorld(harness);
  for (const entityId of ['hero', 'hero2']) {
    expectAccepted(
      await harness.submit({
        type: 'CreateEntity',
        entityId,
        kind: 'character',
        name: entityId,
        existsSince: null,
      }),
    );
  }
  expectAccepted(
    await harness.submit(
      { type: 'AssignCharacter', characterId: 'hero', playerActorId: 'p1' },
      { commandId: 'assign-hero' },
    ),
  );
  expectAccepted(
    await harness.submit(
      { type: 'AssignCharacter', characterId: 'hero2', playerActorId: 'p2' },
      { commandId: 'assign-hero2' },
    ),
  );
});

const release = (characterId: string) => ({ type: 'ReleaseCharacter', characterId });
const undo = (targetCommandId: string) => ({ type: 'UndoCommand', targetCommandId });

async function consistent() {
  const { state, history } = await harness.snapshot();
  expect(replay(history)).toEqual(state);
  expect(replay(history.map((event) => parseRecordedEvent(structuredClone(event))))).toEqual(state);
  expect(checkWorldIntegrity(state)).toEqual([]);
  const log = await harness.engine.commandLog(CAMPAIGN);
  expect(redecideEffective(log, { state, history }, () => 3)).toBeNull();
}

describe('deciding a release', () => {
  it('frees the character from its player and lets it be assigned again', async () => {
    const result = expectAccepted(await harness.submit(release('hero'), { commandId: 'free' }));
    expect(result.events.map((event) => event.type)).toEqual(['CharacterReleased']);
    const { state, history } = await harness.snapshot();
    expect([...state.roster]).toEqual([['hero2', 'p2']]);
    const released = history.at(-1);
    expect(released).toMatchObject({
      type: 'CharacterReleased',
      payload: { characterId: 'hero', playerActorId: 'p1' },
      schemaVersion: schemaVersionOf('CharacterReleased'),
      causation: { commandId: 'free', commandType: 'ReleaseCharacter', actor: DM },
    });
    // The seat is free: the same player or another may take it.
    expectAccepted(
      await harness.submit({ type: 'AssignCharacter', characterId: 'hero', playerActorId: 'p3' }),
    );
    expect([...(await harness.state()).roster]).toEqual([
      ['hero2', 'p2'],
      ['hero', 'p3'],
    ]);
    await consistent();
  });

  it('is the DM’s alone: not the player’s, not a system process’s', async () => {
    for (const actor of [{ actorId: 'p1', kind: 'user' } as const, PLAYER, SYSTEM]) {
      const before = await harness.state();
      expectRejected(await harness.submit(release('hero'), { actor }), 'FORBIDDEN');
      expect(await harness.state()).toEqual(before);
    }
  });

  it('refuses what is not a character with a player', async () => {
    expectRejected(await harness.submit(release('nobody')), 'ENTITY_NOT_FOUND');
    expectRejected(await harness.submit(release('npc')), 'INVALID_ASSIGNMENT');
    expectAccepted(await harness.submit(release('hero')));
    expectRejected(await harness.submit(release('hero')), 'NO_EFFECT');
    expectRejected(
      await harness.submit({ type: 'ReleaseCharacter', characterId: 'hero', playerActorId: 'p1' }),
      'INVALID_COMMAND',
    );
  });

  it('reads and writes who controls the character', () => {
    const event = {
      type: 'CharacterReleased',
      payload: { characterId: 'hero', playerActorId: 'p1' },
    };
    expect(footprintOf(event as RecordedEvent)).toEqual({
      reads: ['world#clock', 'entity:hero', 'roster:character:hero'],
      writes: ['roster:character:hero', 'roster:player:p1'],
    });
  });
});

describe('replaying a release', () => {
  it('folds the same state from stored rows and refuses a release of the wrong player', async () => {
    expectAccepted(await harness.submit(release('hero')));
    await consistent();
    const history = structuredClone(await harness.history()) as RecordedEvent[];
    const last = history.at(-1) as RecordedEvent & { payload: { playerActorId: string } };
    last.payload.playerActorId = 'p2';
    expect(() => replay(history)).toThrow(CorruptHistoryError);
    // First written at the dependency contract: no earlier version exists.
    const raw = {
      ...(structuredClone(await harness.history()).at(-1) as object),
      schemaVersion: 1,
    };
    expect(() => parseRecordedEvent(raw)).toThrow(/never written/);
  });
});

describe('undoing a release', () => {
  it('restores the player and the roster exactly as before, assignment order included', async () => {
    const before = await harness.state();
    expectAccepted(await harness.submit(release('hero'), { commandId: 'free' }));
    expectAccepted(await harness.submit(undo('free')));
    const after = await harness.state();
    expect([...after.roster]).toEqual([...before.roster]);
    expect([...after.rosterAssignedAt]).toEqual([...before.rosterAssignedAt]);
    expect(after.commands.get('free')?.undoneBy).not.toBeNull();
    await consistent();
  });

  it('comes off only from the end of history, then puts each seat back in assignment order', async () => {
    expectAccepted(await harness.submit(release('hero'), { commandId: 'free-hero' }));
    expectAccepted(await harness.submit(release('hero2'), { commandId: 'free-hero2' }));
    // A later command may rest on the empty seat (a party memory's witnesses, the DM acting
    // for the character): every later still-effective command blocks the undo.
    expectAccepted(
      await harness.submit({ type: 'AdvanceWorldTime', by: 60 }, { commandId: 'later' }),
    );
    const blocked = expectRejected(await harness.submit(undo('free-hero')), 'UNDO_UNSAFE');
    expect(blocked.details?.['blockers']).toEqual([
      expect.objectContaining({ commandId: 'free-hero2' }),
      expect.objectContaining({ commandId: 'later' }),
    ]);
    for (const target of ['later', 'free-hero2', 'free-hero']) {
      expectAccepted(await harness.submit(undo(target)));
    }
    expect([...(await harness.state()).roster.keys()]).toEqual(['hero', 'hero2']);
    await consistent();
  });

  it('is refused while the seat was given again, and the release protects the assignment', async () => {
    expectAccepted(await harness.submit(release('hero'), { commandId: 'free' }));
    const blockedAssignment = expectRejected(
      await harness.submit(undo('assign-hero')),
      'UNDO_UNSAFE',
    );
    expect(blockedAssignment.details?.['blockers']).toEqual([
      expect.objectContaining({ commandId: 'free', commandType: 'ReleaseCharacter' }),
    ]);
    expectAccepted(
      await harness.submit(
        { type: 'AssignCharacter', characterId: 'hero', playerActorId: 'p3' },
        { commandId: 'reassign' },
      ),
    );
    const blocked = expectRejected(await harness.submit(undo('free')), 'UNDO_UNSAFE');
    expect(blocked.details?.['blockers']).toEqual([
      expect.objectContaining({ commandId: 'reassign' }),
    ]);
    // Newest first: the new seat, then the release, then the first assignment.
    for (const target of ['reassign', 'free', 'assign-hero']) {
      expectAccepted(await harness.submit(undo(target)));
    }
    expect([...(await harness.state()).roster]).toEqual([['hero2', 'p2']]);
    await consistent();
  });
});

describe('seats taken, given up, restored and remembered (randomized)', () => {
  // Party memories list their witnesses in roster order, so an undone release that put a seat
  // back in the wrong place would make the re-decision oracle disagree with the stored events.
  it.each([3, 11, 340, 2026])('seed %i', async (seed) => {
    const rng = mulberry32(seed);
    const pick = <T>(items: readonly T[]): T => items[Math.floor(rng() * items.length)] as T;
    const seats = ['s1', 's2', 's3', 's4'];
    for (const entityId of seats) {
      expectAccepted(
        await harness.submit({
          type: 'CreateEntity',
          entityId,
          kind: 'character',
          name: entityId,
          existsSince: null,
          placement: { locationId: 'square', since: null },
        }),
      );
    }
    const accepted: string[] = [];
    const counts = { released: 0, restored: 0, remembered: 0 };
    for (let step = 0; step < 160; step += 1) {
      const roll = rng();
      const commandId = `seat-${String(seed)}-${String(step)}`;
      const command =
        roll < 0.3
          ? {
              type: 'AssignCharacter',
              characterId: pick(seats),
              playerActorId: pick(['a', 'b', 'c']),
            }
          : roll < 0.5
            ? release(pick([...seats, 'hero', 'hero2']))
            : roll < 0.75
              ? // Often the newest command: a release comes off only from the end.
                undo(rng() < 0.6 ? (accepted.at(-1) ?? 'none') : pick([...accepted, 'none']))
              : {
                  type: 'RecordMemory',
                  scope: { kind: 'PARTY' },
                  memoryKind: 'OBSERVATION',
                  summary: `Seen at step ${String(step)}`,
                  occurredAt: (await harness.state()).clock,
                  locationId: 'square',
                };
      const result = await harness.submit(command, { commandId });
      if (result.status === 'rejected') continue;
      accepted.push(commandId);
      if (command.type === 'ReleaseCharacter') counts.released += 1;
      if (command.type === 'RecordMemory') counts.remembered += 1;
      if ('targetCommandId' in command) {
        const target = (await harness.state()).commands.get(command.targetCommandId);
        if (target?.commandType === 'ReleaseCharacter') counts.restored += 1;
      }
    }
    expect(counts.released).toBeGreaterThan(3);
    expect(counts.restored).toBeGreaterThan(0);
    expect(counts.remembered).toBeGreaterThan(3);
    await consistent();
  });
});

describe('a released player’s history (Ravenford)', () => {
  const accepted = (result: CommandResult): string => {
    if (result.status === 'rejected') throw new Error(`${result.code}: ${result.message}`);
    return result.commandId;
  };

  it('stays valid history: the player’s earlier command can still be undone and replays', async () => {
    const world = await investigationWorld();
    const guest = 'guest-character';
    accepted(
      await world.submit(
        {
          type: 'CreateEntity',
          entityId: guest,
          kind: 'character',
          name: 'Guest',
          existsSince: null,
          placement: { locationId: 'north-gate', since: null },
        },
        DM_RAVENFORD,
      ),
    );
    accepted(
      await world.submit(
        { type: 'AssignCharacter', characterId: guest, playerActorId: OUTSIDER.actorId },
        DM_RAVENFORD,
      ),
    );
    const walk = accepted(
      await world.submit(
        { type: 'EnterLocation', characterId: guest, locationId: 'market-square' },
        OUTSIDER,
      ),
    );
    const freed = accepted(
      await world.submit({ type: 'ReleaseCharacter', characterId: guest }, DM_RAVENFORD),
    );
    // The former player can no longer act for the character.
    expect(
      codeOf(
        await world.submit(
          { type: 'EnterLocation', characterId: guest, locationId: 'north-gate' },
          OUTSIDER,
        ),
      ),
    ).toBe('FORBIDDEN');
    // Their earlier command stands and stays undoable; the release does not depend on it.
    accepted(await world.submit(undo(walk), DM_RAVENFORD));
    const snapshot = await world.engine.load('ravenford');
    if (!snapshot) throw new Error('missing campaign');
    expect(replay(snapshot.history)).toEqual(snapshot.state);
    expect(checkWorldIntegrity(snapshot.state)).toEqual([]);
    const log = await world.engine.commandLog('ravenford');
    expect(redecideEffective(log, snapshot, (_sheet, skill) => MODIFIERS[skill] ?? 0)).toBeNull();
    // Undoing the release gives the seat back.
    accepted(await world.submit(undo(freed), DM_RAVENFORD));
    accepted(
      await world.submit(
        { type: 'EnterLocation', characterId: guest, locationId: 'market-square' },
        OUTSIDER,
      ),
    );
  });
});

const DM_RAVENFORD = { actorId: 'dm-ravenford', kind: 'user' } as const;
