import { describe, expect, it } from 'vitest';

import { kernelCommandSchema } from './commands.ts';
import { campaignIdSchema, commandIdSchema, entityIdSchema } from './identifiers.ts';
import { MAX_ABS_WORLD_TIME, worldTimeSchema } from './world-time.ts';

describe('identifiers', () => {
  it.each(['ravenford', 'mira-vale', 'e_1', '0f8fad5b-d9cb-469f-a165-70867728950e'])(
    'accepts %s',
    (id) => {
      expect(entityIdSchema.safeParse(id).success).toBe(true);
      expect(campaignIdSchema.safeParse(id).success).toBe(true);
    },
  );

  it.each(['', 'Mira', '-x', '_x', 'a b', 'a/b', '__proto__', 'x'.repeat(65), 'ä'])(
    'rejects %j',
    (id) => {
      expect(entityIdSchema.safeParse(id).success).toBe(false);
    },
  );

  it('accepts command IDs with separators and rejects unsafe ones', () => {
    expect(commandIdSchema.safeParse('ravenford.seed.0001').success).toBe(true);
    expect(commandIdSchema.safeParse('a:b-c_d').success).toBe(true);
    expect(commandIdSchema.safeParse(' x').success).toBe(false);
    expect(commandIdSchema.safeParse('x'.repeat(301)).success).toBe(false);
  });
});

describe('worldTimeSchema', () => {
  it('accepts signed integer seconds within range', () => {
    expect(worldTimeSchema.safeParse(-MAX_ABS_WORLD_TIME).success).toBe(true);
    expect(worldTimeSchema.safeParse(0).success).toBe(true);
    expect(worldTimeSchema.safeParse(1.5).success).toBe(false);
    expect(worldTimeSchema.safeParse(MAX_ABS_WORLD_TIME + 1).success).toBe(false);
    expect(worldTimeSchema.safeParse('32400').success).toBe(false);
  });
});

describe('kernelCommandSchema', () => {
  it('parses every command type', () => {
    for (const command of [
      { type: 'CreateCampaign', name: 'C', worldName: 'W', startsAt: 0 },
      { type: 'CreateEntity', kind: 'npc', name: 'N', existsSince: null },
      { type: 'PlaceEntity', entityId: 'a', locationId: 'b' },
      { type: 'UpdateEntityProfile', entityId: 'a', name: 'N' },
      { type: 'ChangeEntityStatus', entityId: 'a', status: 'dead' },
      { type: 'StartScene', title: 'T', locationId: 'b' },
      { type: 'EndScene', sceneId: 's' },
      { type: 'AdvanceWorldTime', by: 60 },
      { type: 'UndoCommand', targetCommandId: 'c1' },
    ]) {
      expect(kernelCommandSchema.safeParse(command).success, command.type).toBe(true);
    }
  });

  it('trims names and requires them to be non-empty', () => {
    const parsed = kernelCommandSchema.parse({
      type: 'CreateEntity',
      kind: 'npc',
      name: '  Mira  ',
      existsSince: null,
    });
    expect(parsed.type === 'CreateEntity' && parsed.name).toBe('Mira');
    expect(
      kernelCommandSchema.safeParse({
        type: 'CreateEntity',
        kind: 'npc',
        name: '   ',
        existsSince: null,
      }).success,
    ).toBe(false);
  });

  it.each([
    ['unknown fields', { type: 'EndScene', sceneId: 's', worldTruth: 'x' }],
    [
      'unknown nested fields',
      {
        type: 'CreateEntity',
        kind: 'npc',
        name: 'N',
        existsSince: null,
        placement: { locationId: 'a', since: 0, secret: 1 },
      },
    ],
    ['missing existsSince', { type: 'CreateEntity', kind: 'npc', name: 'N' }],
    ['unknown kind', { type: 'CreateEntity', kind: 'god', name: 'N', existsSince: null }],
    ['unknown status', { type: 'ChangeEntityStatus', entityId: 'a', status: 'missing' }],
    ['profile update without changes', { type: 'UpdateEntityProfile', entityId: 'a' }],
    ['advance with neither by nor to', { type: 'AdvanceWorldTime' }],
    ['advance with both by and to', { type: 'AdvanceWorldTime', by: 1, to: 5 }],
    ['zero-length advance', { type: 'AdvanceWorldTime', by: 0 }],
    ['unknown type', { type: 'DeclareOrinDead' }],
  ])('rejects %s', (_label, command) => {
    expect(kernelCommandSchema.safeParse(command).success).toBe(false);
  });
});
