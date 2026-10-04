import { describe, expect, it } from 'vitest';

import { DM, PLAYER, codeOf, investigationWorld } from '../investigation/testing/world.ts';

/** SetClaim (ADR 0014 §1): DM-only structure on held, asserting records and on clues. */
const claimOn = (target: Record<string, unknown>, subjectId = 'guild-caravan') => ({
  type: 'SetClaim',
  target,
  claim: { subjectId, aspect: 'cargo', value: 'cloth' },
});
const onRecord = (knowledgeId: string, subjectId?: string) =>
  claimOn({ kind: 'knowledge', knowledgeId }, subjectId);

describe('SetClaim', () => {
  it.each([
    ['truth-cargo', 'accepted'], // lore for continuity only, never compared (ADR 0019 §4)
    ['dm-reveal-pacing', 'INVALID_CLAIM'], // DM notes neither
    ['party-who-attacked', 'INVALID_CLAIM'], // UNKNOWN asserts nothing
    ['no-such-record', 'KNOWLEDGE_NOT_FOUND'],
    ['mira-departure', 'INVALID_CLAIM'], // already claimed by the fixture
    ['mira-cargo-logistics', 'accepted'],
    ['party-goblin-hypothesis', 'accepted'],
  ])('on %s → %s', async (knowledgeId, code) => {
    const world = await investigationWorld();
    expect(codeOf(await world.submit(onRecord(knowledgeId), DM))).toBe(code);
  });

  it('must be about one of the record’s own subjects', async () => {
    const world = await investigationWorld();
    const ashen = '3f9c2b7e-5a1d-4e8f-9b06-7c4d2e1a8f53';
    expect(codeOf(await world.submit(onRecord('party-goblin-hypothesis', ashen), DM))).toBe(
      'INVALID_CLAIM',
    );
    expect(codeOf(await world.submit(onRecord('party-goblin-hypothesis', 'mira-vale'), DM))).toBe(
      'INVALID_CLAIM',
    );
  });

  it('on a clue must be about its entity or subjects, once', async () => {
    const world = await investigationWorld();
    const onClue = (subjectId: string) =>
      claimOn({ kind: 'clue', clueId: 'clue-tracks-boots' }, subjectId);
    expect(codeOf(await world.submit(onClue('guild-caravan'), DM))).toBe('INVALID_CLAIM');
    expect(codeOf(await world.submit(onClue('wagon-tracks'), DM))).toBe('accepted');
    expect(codeOf(await world.submit(onClue('wagon-tracks'), DM))).toBe('INVALID_CLAIM');
    expect(
      codeOf(await world.submit(claimOn({ kind: 'clue', clueId: 'no-such-clue' }, 'x'), DM)),
    ).toBe('INVALID_CLAIM');
  });

  it('is DM-only', async () => {
    const world = await investigationWorld();
    expect(codeOf(await world.submit(onRecord('party-goblin-hypothesis'), PLAYER))).toBe(
      'FORBIDDEN',
    );
  });

  it('rejects malformed slugs at the schema', async () => {
    const world = await investigationWorld();
    const result = await world.submit(
      {
        type: 'SetClaim',
        target: { kind: 'knowledge', knowledgeId: 'party-goblin-hypothesis' },
        claim: { subjectId: 'guild-caravan', aspect: 'Who Did It', value: 'goblins' },
      },
      DM,
    );
    expect(codeOf(result)).toBe('INVALID_COMMAND');
  });
});
