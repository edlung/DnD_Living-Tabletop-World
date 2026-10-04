import { describe, expect, it } from 'vitest';

import {
  CAMPAIGN,
  DM,
  MODIFIERS,
  PLAYER,
  codeOf,
  investigationWorld,
  type InvestigationWorld,
} from '../investigation/testing/world.ts';
import { parseRecordedEvent } from '../kernel/events.ts';
import { checkWorldIntegrity } from '../kernel/projections/integrity.ts';
import { redecideEffective } from '../kernel/verification/redecide.ts';
import { holderPerspective } from '../knowledge/perspective.ts';
import { listKnowledge } from '../knowledge/queries.ts';
import { attitudeOf } from './records.ts';

/**
 * Relationships (docs/adr/0019-continuity-engine.md §3, owner decision): an
 * NPC's attitude toward the party, changed only explicitly, undoable, and
 * never creating memories or knowledge (ADVERSARIAL B4). DM data.
 */
const set = (npcId: string, attitude: string) => ({ type: 'SetRelationship', npcId, attitude });

async function verified(world: InvestigationWorld) {
  const snapshot = await world.engine.load(CAMPAIGN);
  if (!snapshot) throw new Error('missing campaign');
  expect(checkWorldIntegrity(snapshot.state)).toEqual([]);
  const log = await world.engine.commandLog(CAMPAIGN);
  expect(redecideEffective(log, snapshot, (_sheet, skill) => MODIFIERS[skill] ?? 0)).toBeNull();
  return snapshot;
}

describe('SetRelationship', () => {
  it('changes an NPC attitude from neutral, and only that', async () => {
    const world = await investigationWorld();
    const before = await world.state();
    expect(attitudeOf(before, 'orin-stonebeard')).toBe('NEUTRAL');

    const result = await world.submit(set('orin-stonebeard', 'WARY'), DM);
    expect(codeOf(result)).toBe('accepted');
    expect(result.status === 'accepted' ? result.events.map((event) => event.type) : []).toEqual([
      'RelationshipChanged',
    ]);
    const after = await world.state();
    expect(attitudeOf(after, 'orin-stonebeard')).toBe('WARY');
    // ADVERSARIAL B4: no memories, knowledge, or disclosure follow from it.
    expect(after.memories.size).toBe(before.memories.size);
    expect(after.knowledge.size).toBe(before.knowledge.size);
    expect(after.investigation.disclosures).toEqual(before.investigation.disclosures);
    await verified(world);
  });

  it.each([
    ['a location', 'north-gate', 'INVALID_RELATIONSHIP'],
    ['the player character', 'elowen-starwhisper', 'INVALID_RELATIONSHIP'],
    ['nobody', 'no-one', 'ENTITY_NOT_FOUND'],
  ])('refuses %s', async (_label, npcId, code) => {
    const world = await investigationWorld();
    expect(codeOf(await world.submit(set(npcId, 'WARY'), DM))).toBe(code);
  });

  it('refuses the same attitude, a dead NPC, and players', async () => {
    const world = await investigationWorld();
    expect(codeOf(await world.submit(set('mira-vale', 'NEUTRAL'), DM))).toBe('NO_EFFECT');
    expect(codeOf(await world.submit(set('mira-vale', 'FRIENDLY'), PLAYER))).toBe('FORBIDDEN');
    await world.submit({ type: 'ChangeEntityStatus', entityId: 'mira-vale', status: 'dead' }, DM);
    expect(codeOf(await world.submit(set('mira-vale', 'FRIENDLY'), DM))).toBe('TARGET_DEAD');
  });

  it('undoes to the earlier attitude, newest first', async () => {
    const world = await investigationWorld();
    const first = await world.submit(set('captain-thorne', 'FRIENDLY'), DM);
    const second = await world.submit(set('captain-thorne', 'TRUSTED'), DM);
    const undo = (target: string | null) =>
      world.submit({ type: 'UndoCommand', targetCommandId: target ?? '' }, DM);

    expect(codeOf(await undo(first.commandId))).toBe('UNDO_UNSAFE');
    expect(codeOf(await undo(second.commandId))).toBe('accepted');
    expect(attitudeOf(await world.state(), 'captain-thorne')).toBe('FRIENDLY');
    expect(codeOf(await undo(first.commandId))).toBe('accepted');
    const snapshot = await verified(world);
    expect(snapshot.state.relationships.has('captain-thorne')).toBe(false);
  });

  it('keeps the NPC it depends on from being undone beneath it', async () => {
    const world = await investigationWorld();
    const created = await world.submit(
      { type: 'CreateEntity', entityId: 'ada-brook', kind: 'npc', name: 'Ada', existsSince: null },
      DM,
    );
    await world.submit(set('ada-brook', 'HOSTILE'), DM);

    const undone = await world.submit(
      { type: 'UndoCommand', targetCommandId: created.commandId ?? '' },
      DM,
    );
    expect(codeOf(undone)).toBe('UNDO_UNSAFE');
  });

  it('never reaches a player view', async () => {
    const world = await investigationWorld();
    await world.submit(set('orin-stonebeard', 'HOSTILE'), DM);
    const state = await world.state();
    const listed = listKnowledge(state, holderPerspective(state, { kind: 'PARTY' }));

    expect(JSON.stringify(listed)).not.toMatch(/HOSTILE|relationship/i);
  });

  it('is never read with a schema version earlier than its first', async () => {
    const world = await investigationWorld();
    await world.submit(set('orin-stonebeard', 'WARY'), DM);
    const event = (await world.engine.load(CAMPAIGN))?.history.at(-1);
    if (!event) throw new Error('missing event');

    expect(parseRecordedEvent(JSON.parse(JSON.stringify(event)))).toEqual(event);
    expect(() => parseRecordedEvent({ ...event, schemaVersion: 1 })).toThrow(/never written/);
  });
});
