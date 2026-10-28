import { holderPerspective, submissionsFromScript, type WorldState } from '@ltw/domain';
import { beforeAll, describe, expect, it } from 'vitest';

import { buildContext } from './context-builder.ts';
import { interpretLocally } from './local-provider.ts';
import { CAMPAIGN, DM, seedRavenford, type SeededWorld } from './testing/ravenford.ts';
import { validateProposal } from './validation.ts';

/** The deterministic local provider over Ravenford's public directory. */
let world: SeededWorld;
let state: WorldState;
beforeAll(async () => {
  world = await seedRavenford();
  ({ state } = world);
});

const directoryOf = (s: WorldState) =>
  buildContext(s, holderPerspective(s, { kind: 'PUBLIC' }), ['entities']).entities;

const interpret = (text: string) => {
  const directory = directoryOf(state);
  const output = interpretLocally(text, directory);
  return { output, check: validateProposal(output, new Set(directory.map((e) => e.entityId))) };
};

const TOMAS = 'Add a fisherman near the North Gate who saw the guild caravan leave before dawn.';

describe('interpretLocally', () => {
  it('turns a new witness into an NPC and their testimony', () => {
    const { output, check } = interpret(TOMAS);

    expect(check.ok).toBe(true);
    expect(output).toMatchObject({
      commands: [
        {
          type: 'CreateEntity',
          entityId: 'tomas-reed',
          kind: 'npc',
          name: 'Tomas Reed',
          description: 'A fisherman.',
          existsSince: null,
          placement: { locationId: 'north-gate', since: null },
        },
        {
          type: 'AddKnowledge',
          knowledgeId: 'tomas-reed-account',
          scope: { kind: 'NPC', npcId: 'tomas-reed' },
          knowledgeType: 'TESTIMONY',
          statement: 'Tomas Reed saw the guild caravan leave before dawn.',
          subjects: ['guild-caravan', 'north-gate'],
          attributedTo: 'tomas-reed',
          knownSince: null,
        },
        // Never silently guarded (owner decisions 11, round 2): he tells it when asked.
        { type: 'SetDisclosure', knowledgeId: 'tomas-reed-account', disclosure: 'WILLING' },
      ],
    });
  });

  it('proposes commands the World Engine would accept from the DM', async () => {
    const { output } = interpret(TOMAS);
    const { commands } = output as { commands: Record<string, unknown>[] };
    const submissions = submissionsFromScript({
      campaignId: CAMPAIGN,
      actor: DM,
      commands,
      commandIdPrefix: 'probe',
    });
    expect(submissions).toHaveLength(3);
    for (const submission of submissions) {
      expect((await world.engine.execute(submission)).status).toBe('accepted');
    }
  });

  it('answers the same request the same way', () => {
    expect(interpret(TOMAS).output).toEqual(interpret(TOMAS).output);
  });

  it('skips names already taken in the directory', () => {
    const directory = [
      ...directoryOf(state),
      { entityId: 'tomas-reed', kind: 'npc' as const, name: 'Tomas Reed' },
    ];
    const output = interpretLocally(TOMAS, directory) as { commands: { entityId?: string }[] };

    expect(output.commands[0]?.entityId).toBe('ada-brook');
  });

  it('reads the DM acceptance request of RAVENFORD_SPEC.md', () => {
    const { output, check } = interpret(
      'Add a young guard near North Gate who saw the caravan leave.',
    );

    expect(check.ok).toBe(true);
    expect(output).toMatchObject({
      commands: [
        { type: 'CreateEntity', entityId: 'tomas-reed', description: 'A young guard.' },
        {
          type: 'AddKnowledge',
          statement: 'Tomas Reed saw the caravan leave.',
          subjects: ['guild-caravan', 'north-gate'],
        },
        { type: 'SetDisclosure', disclosure: 'WILLING' },
      ],
    });
  });

  it.each([
    'Add a guard near North Gate who saw the caravan leave but hides it.',
    'Add a guard near North Gate who saw the caravan leave and is reluctant to talk.',
    'Add a guard near North Gate who secretly saw the caravan leave.',
    "Add a guard near North Gate who saw the caravan leave and won't tell anyone.",
  ])('guards the account only when the DM says so: %s', (request) => {
    const { output, check } = interpret(request);
    expect(check.ok).toBe(true);
    expect((output as { commands: unknown[] }).commands.at(-1)).toEqual({
      type: 'SetDisclosure',
      knowledgeId: 'tomas-reed-account',
      disclosure: 'GUARDED',
    });
  });

  it('names people and things by a distinctive last word, never places or factions', () => {
    const thorne = interpret('Thorne is dead.');
    const guard = interpret('Move the guard to the Golden Stag Inn.');

    expect(thorne.output).toMatchObject({
      commands: [{ type: 'ChangeEntityStatus', entityId: 'captain-thorne' }],
    });
    expect(guard.check.ok).toBe(false);
  });

  it.each([
    [
      'Captain Thorne is dead.',
      [{ type: 'ChangeEntityStatus', entityId: 'captain-thorne', status: 'dead' }],
    ],
    [
      'Move Mira Vale to the Golden Stag Inn.',
      [{ type: 'PlaceEntity', entityId: 'mira-vale', locationId: 'golden-stag-inn' }],
    ],
    ['Advance time by 3 hours.', [{ type: 'AdvanceWorldTime', by: 10_800 }]],
  ])('interprets "%s"', (text, commands) => {
    const { output, check } = interpret(text);

    expect(check.ok).toBe(true);
    expect(output).toMatchObject({ commands });
  });

  it.each([
    'Reveal the Ashen Circle to everyone.',
    'Add a guard near the Abandoned Caravan Site.',
    'Make it rain.',
  ])('cannot propose "%s" from the public directory', (text) => {
    expect(interpret(text).check.ok).toBe(false);
  });
});
