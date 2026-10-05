import type { EntityRef, ProposableCommand } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { describeCommand } from './command-text.ts';

const directory: EntityRef[] = [{ entityId: 'north-gate', kind: 'location', name: 'North Gate' }];

describe('describeCommand', () => {
  it('names the entity, kind, place, and description of a new NPC', () => {
    const command = {
      type: 'CreateEntity',
      entityId: 'tomas-reed',
      kind: 'npc',
      name: 'Tomas Reed',
      description: 'A young guard.',
      existsSince: null,
      placement: { locationId: 'north-gate', since: null },
    } satisfies ProposableCommand;
    expect(describeCommand(command, directory)).toBe(
      'Create npc Tomas Reed at North Gate — A young guard.',
    );
  });

  it('describes an NPC’s testimony by the NPC’s proposed name', () => {
    const command = {
      type: 'AddKnowledge',
      scope: { kind: 'NPC', npcId: 'tomas-reed' },
      knowledgeType: 'TESTIMONY',
      statement: 'Tomas Reed saw the caravan leave.',
      subjects: ['guild-caravan'],
      attributedTo: 'tomas-reed',
      knownSince: null,
    } satisfies ProposableCommand;
    const names = new Map([['tomas-reed', 'Tomas Reed']]);
    expect(describeCommand(command, directory, names)).toBe(
      'Tomas Reed holds testimony: “Tomas Reed saw the caravan leave.”',
    );
  });
});
