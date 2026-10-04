import { describe, expect, it } from 'vitest';

import { validateProposal } from './validation.ts';

const DIRECTORY = new Set(['north-gate', 'market-square', 'captain-thorne', 'guild-caravan']);

const proposal = (...commands: unknown[]) => ({ summary: 'A proposal.', commands });

const issuesOf = (output: unknown) => {
  const check = validateProposal(output, DIRECTORY);
  return check.ok ? [] : check.issues;
};

describe('validateProposal (ADR 0017 §4)', () => {
  it('accepts proposable commands that name only directory entities', () => {
    const check = validateProposal(
      proposal(
        { type: 'PlaceEntity', entityId: 'captain-thorne', locationId: 'market-square' },
        { type: 'AdvanceWorldTime', by: 600 },
      ),
      DIRECTORY,
    );

    expect(check.ok).toBe(true);
  });

  it('accepts references to entities created earlier in the same proposal', () => {
    expect(
      issuesOf(
        proposal(
          {
            type: 'CreateEntity',
            entityId: 'tomas-reed',
            kind: 'npc',
            name: 'Tomas Reed',
            existsSince: null,
            placement: { locationId: 'north-gate', since: null },
          },
          {
            type: 'AddKnowledge',
            scope: { kind: 'NPC', npcId: 'tomas-reed' },
            knowledgeType: 'TESTIMONY',
            statement: 'Tomas saw the caravan.',
            subjects: ['guild-caravan'],
            attributedTo: 'tomas-reed',
            knownSince: null,
          },
        ),
      ),
    ).toEqual([]);
  });

  it('rejects a reference before its creation, an unknown entity, and a duplicate ID', () => {
    expect(
      issuesOf(
        proposal(
          { type: 'PlaceEntity', entityId: 'tomas-reed', locationId: 'north-gate' },
          {
            type: 'CreateEntity',
            entityId: 'tomas-reed',
            kind: 'npc',
            name: 'Tomas Reed',
            existsSince: null,
          },
          { type: 'ChangeEntityStatus', entityId: 'ghost', status: 'dead' },
          {
            type: 'CreateEntity',
            entityId: 'captain-thorne',
            kind: 'npc',
            name: 'Another Thorne',
            existsSince: null,
          },
        ),
      ),
    ).toEqual([
      'commands.0.entityId: unknown entity "tomas-reed"',
      'commands.2.entityId: unknown entity "ghost"',
      'commands.3.entityId: "captain-thorne" already exists',
    ]);
  });

  it('rejects knowledge about or held by an entity outside the directory', () => {
    expect(
      issuesOf(
        proposal({
          type: 'AddKnowledge',
          scope: { kind: 'NPC', npcId: 'secret-npc' },
          knowledgeType: 'RUMOR',
          statement: 'A secret.',
          subjects: ['3f9c2b7e-5a1d-4e8f-9b06-7c4d2e1a8f53'],
          attributedTo: 'secret-npc',
          knownSince: null,
        }),
      ),
    ).toEqual([
      'commands.0.scope.npcId: unknown entity "secret-npc"',
      'commands.0.subjects.0: unknown entity "3f9c2b7e-5a1d-4e8f-9b06-7c4d2e1a8f53"',
      'commands.0.attributedTo: unknown entity "secret-npc"',
    ]);
  });

  it.each([
    ['no commands', proposal()],
    ['a non-proposable command', proposal({ type: 'UndoCommand', commandId: 'c1' })],
    ['a memory command', proposal({ type: 'StartSession', sessionId: 's', title: 'S' })],
    ['an extra key', { ...proposal({ type: 'AdvanceWorldTime', by: 60 }), commit: true }],
    ['no summary', { commands: [{ type: 'AdvanceWorldTime', by: 60 }] }],
    ['plain text', 'Create Tomas near the gate.'],
    ['null', null],
  ])('rejects %s by schema', (_label, output) => {
    expect(issuesOf(output).length).toBeGreaterThan(0);
  });

  it('caps issues at 20', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      type: 'PlaceEntity',
      entityId: `a${String(i)}`,
      locationId: `b${String(i)}`,
    }));
    expect(issuesOf(proposal(...many))).toHaveLength(20);
  });
});
