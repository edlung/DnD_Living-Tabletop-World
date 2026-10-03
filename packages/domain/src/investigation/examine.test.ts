import type { CommandResult } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import {
  DM,
  ELOWEN,
  codeOf,
  investigationWorld,
  type InvestigationWorld,
} from './testing/world.ts';

/** ExamineEntity (ADR 0013 §2): inspect, one-attempt checks, secrecy of clues. */
const examine = (entityId: string, method: string) => ({
  type: 'ExamineEntity',
  characterId: ELOWEN,
  entityId,
  method,
});

async function atSite(): Promise<InvestigationWorld> {
  const world = await investigationWorld();
  for (const locationId of ['old-trade-road', 'abandoned-caravan-site']) {
    const result = await world.submit({ type: 'EnterLocation', characterId: ELOWEN, locationId });
    if (result.status === 'rejected') throw new Error(result.code);
  }
  return world;
}

const outcomeOf = (result: CommandResult) => (result.status === 'rejected' ? null : result.outcome);

async function statements(world: InvestigationWorld, ids: readonly string[]) {
  const state = await world.state();
  return ids.map((id) => state.knowledge.get(id)?.statement);
}

describe('inspect', () => {
  it('reveals the obvious clue as PARTY EVIDENCE and records a DISCOVERY memory', async () => {
    const world = await atSite();
    const result = await world.submit(examine('goblin-weapon', 'inspect'));
    const outcome = outcomeOf(result);
    expect(outcome).toMatchObject({ kind: 'ExamineEntity', roll: null });
    const ids = outcome?.kind === 'ExamineEntity' ? outcome.discovered : [];
    expect(await statements(world, ids)).toEqual(['A crude goblin blade lies in the grass.']);
    const state = await world.state();
    const record = state.knowledge.get(ids[0] ?? '');
    expect(record).toMatchObject({
      scope: { kind: 'PARTY' },
      knowledgeType: 'EVIDENCE',
      subjects: ['goblin-weapon'],
      attributedTo: null,
    });
    const memory = [...state.memories.values()].find((m) =>
      m.relatedKnowledge.includes(ids[0] ?? ''),
    );
    expect(memory).toMatchObject({
      scope: { kind: 'PARTY' },
      memoryKind: 'DISCOVERY',
      locationId: 'abandoned-caravan-site',
      participants: [ELOWEN, 'goblin-weapon'],
      witnesses: [ELOWEN],
    });
  });

  it('may be repeated; nothing is revealed twice', async () => {
    const world = await atSite();
    await world.submit(examine('goblin-weapon', 'inspect'));
    const again = await world.submit(examine('goblin-weapon', 'inspect'));
    expect(outcomeOf(again)).toEqual({ kind: 'ExamineEntity', roll: null, discovered: [] });
  });

  it('makes the site known by name once inspected', async () => {
    const world = await atSite();
    const outcome = outcomeOf(await world.submit(examine('abandoned-caravan-site', 'inspect')));
    const ids = outcome?.kind === 'ExamineEntity' ? outcome.discovered : [];
    const record = (await world.state()).knowledge.get(ids[0] ?? '');
    expect(record?.subjects).toEqual(['abandoned-caravan-site', 'guild-caravan', 'old-trade-road']);
  });
});

describe('skill checks', () => {
  it('adds the rules modifier to the engine-drawn d20 and reveals clues with DC ≤ total', async () => {
    const world = await atSite();
    world.roll(7); // 7 + 8 = 15 meets DC 15
    const outcome = outcomeOf(await world.submit(examine('goblin-weapon', 'investigation')));
    expect(outcome).toMatchObject({
      kind: 'ExamineEntity',
      roll: { d20: 7, modifier: 8, total: 15 },
    });
    const ids = outcome?.kind === 'ExamineEntity' ? outcome.discovered : [];
    expect(await statements(world, ids)).toEqual([
      'The blade has never been used: no nicks, no blood.',
    ]);
  });

  it('records a failed roll exactly like a search with nothing to find', async () => {
    const world = await atSite();
    world.roll(6, 6); // 14 misses DC 15; the wheel's DC 13 is met only by the second
    const failed = await world.submit(examine('goblin-weapon', 'investigation'));
    expect(outcomeOf(failed)).toEqual({
      kind: 'ExamineEntity',
      roll: { d20: 6, modifier: 8, total: 14 },
      discovered: [],
    });
    const created = await world.submit(
      {
        type: 'CreateEntity',
        entityId: 'plain-rock',
        kind: 'item',
        name: 'Plain Rock',
        existsSince: null,
        placement: { locationId: 'abandoned-caravan-site', since: null },
      },
      DM,
    );
    expect(codeOf(created)).toBe('accepted');
    const nothing = await world.submit(examine('plain-rock', 'investigation'));
    expect(outcomeOf(nothing)).toEqual({
      ...outcomeOf(failed),
      roll: { d20: 6, modifier: 8, total: 14 },
    });
    const types = (result: CommandResult) =>
      result.status === 'rejected' ? [] : result.events.map((event) => event.type);
    expect(types(nothing)).toEqual(types(failed));
  });

  it('allows one attempt per character, entity, and method', async () => {
    const world = await atSite();
    world.roll(1, 19); // the engine draws before deciding, even for a rejected repeat
    await world.submit(examine('goblin-weapon', 'investigation'));
    expect(codeOf(await world.submit(examine('goblin-weapon', 'investigation')))).toBe(
      'ALREADY_ATTEMPTED',
    );
    world.roll(20);
    expect(codeOf(await world.submit(examine('goblin-weapon', 'perception')))).toBe('accepted');
  });

  it('applies only to objects and needs a sheet and a capable character', async () => {
    const world = await atSite();
    world.roll(10, 10);
    expect(codeOf(await world.submit(examine('abandoned-caravan-site', 'investigation')))).toBe(
      'NO_EFFECT',
    );
    const state = await world.state();
    const sheet = state.characterSheets.get(ELOWEN);
    await world.submit(
      {
        type: 'SetCharacterSheet',
        entityId: ELOWEN,
        sheet: { ...sheet, conditions: ['incapacitated'] },
      },
      DM,
    );
    expect(codeOf(await world.submit(examine('goblin-weapon', 'investigation')))).toBe(
      'ACTOR_INCAPACITATED',
    );
    expect(codeOf(await world.submit(examine('goblin-weapon', 'inspect')))).toBe('accepted');
  });
});

describe('secrecy of the investigation path', () => {
  it('answers unknown, unperceived and nonexistent targets identically', async () => {
    const world = await investigationWorld(); // in Market Square
    const results = await Promise.all(
      ['goblin-weapon', 'strange-symbol', 'no-such-entity'].map((entityId) =>
        world.submit(examine(entityId, 'inspect')),
      ),
    );
    const shapes = results.map((r) =>
      r.status === 'rejected' ? { code: r.code, message: r.message, details: r.details } : r.status,
    );
    expect(shapes).toEqual(
      Array(3).fill({ code: 'ENTITY_NOT_FOUND', message: 'Not found', details: undefined }),
    );
  });

  it('reports a known but absent target as NOT_PRESENT, never its status', async () => {
    const world = await investigationWorld();
    await world.submit(
      { type: 'ChangeEntityStatus', entityId: 'orin-stonebeard', status: 'dead' },
      DM,
    );
    expect(codeOf(await world.submit(examine('orin-stonebeard', 'inspect')))).toBe('NOT_PRESENT');
  });

  it('never reveals a clue to the party twice, even across characters of the party', async () => {
    const world = await atSite();
    await world.submit(examine('strange-symbol', 'inspect'));
    const state = await world.state();
    expect([...state.investigation.revealed]).toEqual(['PARTY|clue-symbol-seen']);
  });
});
