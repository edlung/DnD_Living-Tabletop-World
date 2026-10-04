import type { AuthoringPreview, ResolutionOption } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { MODIFIERS } from '../investigation/testing/world.ts';
import type { ResolvedProposable } from '../kernel/decision.ts';
import { redecideEffective } from '../kernel/verification/redecide.ts';
import { worldTimeAt } from '../kernel/world-time.ts';
import {
  CAMPAIGN,
  DEPARTURE,
  DM,
  TOMAS,
  authoringWorld,
  codeOf,
  confirm,
  testimony,
  tomas,
  tomasProposal,
} from './testing/world.ts';

/**
 * Explanations and options (docs/adr/0019-continuity-engine.md §1). Options
 * are concrete revisions the DM may apply; they never apply themselves, and
 * applying one resolves what it was offered for. Blocking issues cannot be
 * acknowledged away. A death check records its premise (§2).
 */
const optionsOf = (preview: AuthoringPreview, key: string): ResolutionOption[] => [
  ...(preview.issues.find((issue) => issue.key === key)?.options ?? []),
  ...(preview.warnings.find((warning) => warning.key === key)?.options ?? []),
];
const keysOf = (preview: AuthoringPreview) => [
  ...preview.issues.map((issue) => issue.key),
  ...preview.warnings.map((warning) => warning.key),
];
const commandsOf = (option: ResolutionOption | undefined) =>
  (option?.commands ?? []) as ResolvedProposable[];

describe('options', () => {
  it('are unique, concrete, and leave the proposal untouched', async () => {
    const world = await authoringWorld();
    const proposal = [
      tomas({
        name: 'Captain Thorne',
        placement: { locationId: 'north-gate', since: worldTimeAt(0, 8) },
      }),
      testimony({ knownSince: DEPARTURE }),
    ];
    const snapshot = JSON.stringify(proposal);
    const preview = await world.preview(proposal);
    const options = [...preview.issues, ...preview.warnings].flatMap(
      (finding) => finding.options ?? [],
    );

    expect(keysOf(preview)).toEqual(['NAME_IN_USE@0', `WITNESS_ELSEWHERE@1:${TOMAS}`]);
    expect(new Set(options.map((option) => option.optionId)).size).toBe(options.length);
    for (const option of options) {
      expect(option.optionId.startsWith(option.optionId.split('/')[0] ?? '?')).toBe(true);
      expect(option.kind === 'acknowledge').toBe(option.commands === null);
    }
    expect(JSON.stringify(proposal)).toBe(snapshot);
  });

  it.each([
    ['place the witness where it happened', `WITNESS_ELSEWHERE@1:${TOMAS}`, 0],
    ['make it a rumor', `WITNESS_ELSEWHERE@1:${TOMAS}`, 1],
  ])('resolve what they were offered for: %s', async (_label, key, position) => {
    const world = await authoringWorld();
    const preview = await world.preview([
      tomas({ placement: { locationId: 'north-gate', since: worldTimeAt(0, 8) } }),
      testimony({ knownSince: DEPARTURE }),
    ]);
    const option = optionsOf(preview, key)[position];
    const after = await world.preview(commandsOf(option));

    expect(option?.kind).toBe('edit');
    expect(keysOf(after)).not.toContain(key);
    expect(after.committable).toBe(true);
  });

  it('repair what the rules refused: a used ID and a time out of bounds', async () => {
    const world = await authoringWorld();
    const first = await world.commit(tomasProposal(), { confirmation: confirm('L2') });
    await world.submit({ type: 'UndoCommand', targetCommandId: first.commandId ?? '' }, DM);
    const { clock } = await world.state();

    const reused = await world.preview(tomasProposal());
    const renamed = commandsOf(optionsOf(reused, 'ID_ALREADY_USED@0')[0]);
    expect(renamed[0]).toMatchObject({ type: 'CreateEntity', entityId: `${TOMAS}-2` });
    expect(renamed[1]).toMatchObject({
      scope: { npcId: `${TOMAS}-2` },
      attributedTo: `${TOMAS}-2`,
    });
    // Undo tombstoned the record ID too; the next preview offers its own fresh ID.
    const second = await world.preview(renamed);
    // Its disclosure fails with it; one option repairs both.
    expect(second.issues.map((issue) => issue.key)).toEqual([
      'ID_ALREADY_USED@1',
      'KNOWLEDGE_NOT_FOUND@2',
    ]);
    const refiled = commandsOf(optionsOf(second, 'ID_ALREADY_USED@1')[0]);
    expect(refiled[1]).toMatchObject({ knowledgeId: 'tomas-saw-caravan-2' });
    expect(refiled[2]).toMatchObject({ type: 'SetDisclosure', knowledgeId: 'tomas-saw-caravan-2' });
    expect(await world.preview(refiled)).toMatchObject({ committable: true });

    const future = await world.preview([tomas({ entityId: 'ada-brook', existsSince: clock + 60 })]);
    const fixed = commandsOf(optionsOf(future, 'TEMPORAL_CONFLICT@0')[0]);
    expect(fixed[0]).toMatchObject({ existsSince: null });
    expect(await world.preview(fixed)).toMatchObject({ committable: true });
  });

  it('move a record after the subject it names began to exist', async () => {
    const world = await authoringWorld();
    const preview = await world.preview([
      tomas(),
      {
        type: 'CreateEntity',
        entityId: 'ada-brook',
        kind: 'npc',
        name: 'Ada Brook',
        existsSince: worldTimeAt(1, 8),
      },
      testimony({ subjects: ['ada-brook'], knownSince: DEPARTURE }),
    ]);
    const [learnLater, remove] = optionsOf(preview, 'KNOWLEDGE_BEFORE_SUBJECT@2:ada-brook');

    expect(commandsOf(learnLater)[2]).toMatchObject({ knownSince: worldTimeAt(1, 8) });
    expect(await world.preview(commandsOf(learnLater))).toMatchObject({ committable: true });
    expect(commandsOf(remove).map((command) => command.type)).toEqual([
      'CreateEntity',
      'CreateEntity',
    ]);
  });

  it('remove an operation together with what depends on it', async () => {
    const world = await authoringWorld();
    const preview = await world.preview([
      tomas({ placement: { locationId: 'nowhere', since: null } }),
      testimony(),
      { type: 'SetDisclosure', knowledgeId: 'tomas-saw-caravan', disclosure: 'WILLING' },
      { type: 'SetRelationship', npcId: 'mira-vale', attitude: 'FRIENDLY' },
    ]);
    const remove = optionsOf(preview, 'ENTITY_NOT_FOUND@0').find(
      (option) => option.kind === 'remove',
    );

    expect(commandsOf(remove)).toEqual([
      { type: 'SetRelationship', npcId: 'mira-vale', attitude: 'FRIENDLY' },
    ]);
  });

  it('never let a blocking issue be acknowledged away', async () => {
    const world = await authoringWorld();
    await world.submit({ type: 'ChangeEntityStatus', entityId: 'mira-vale', status: 'dead' }, DM);
    const { clock } = await world.state();
    const proposal = [
      testimony({
        knowledgeId: 'mira-new',
        scope: { kind: 'NPC', npcId: 'mira-vale' },
        attributedTo: 'mira-vale',
        subjects: ['guild-caravan'],
        knownSince: clock,
      }),
    ];
    const preview = await world.preview(proposal);
    const before = await world.version();
    const result = await world.commit(proposal, {
      confirmation: confirm(
        'L3',
        preview.issues.map((issue) => issue.key),
      ),
    });

    expect(preview.issues.map((issue) => issue.key)).toEqual(['KNOWN_AFTER_DEATH@0:mira-vale']);
    expect(codeOf(result)).toBe('AUTHORING_INVALID');
    expect(await world.version()).toBe(before);
  });
});

describe('the premise of a death check (§2)', () => {
  it('blocks undoing the resurrection a standing commit rested on', async () => {
    const world = await authoringWorld();
    await world.submit({ type: 'ChangeEntityStatus', entityId: 'mira-vale', status: 'dead' }, DM);
    await world.submit({ type: 'AdvanceWorldTime', by: 3_600 }, DM);
    const revived = await world.submit(
      { type: 'ChangeEntityStatus', entityId: 'mira-vale', status: 'active' },
      DM,
    );
    const { clock } = await world.state();
    const result = await world.commit(
      [
        testimony({
          knowledgeId: 'mira-after',
          scope: { kind: 'NPC', npcId: 'mira-vale' },
          attributedTo: 'mira-vale',
          subjects: ['guild-caravan'],
          knownSince: clock,
        }),
      ],
      { confirmation: confirm('L2') },
    );
    expect(codeOf(result)).toBe('accepted');
    const recorded = (await world.engine.load(CAMPAIGN))?.history.filter(
      (event) => event.causation.commandId === result.commandId,
    );
    expect(recorded?.map((event) => event.type)).toEqual([
      'AuthoringPremisesRecorded',
      'KnowledgeAssigned',
    ]);

    const undone = await world.submit(
      { type: 'UndoCommand', targetCommandId: revived.commandId ?? '' },
      DM,
    );
    expect(codeOf(undone)).toBe('UNDO_UNSAFE');
    const snapshot = await world.engine.load(CAMPAIGN);
    if (!snapshot) throw new Error('missing campaign');
    const log = await world.engine.commandLog(CAMPAIGN);
    expect(redecideEffective(log, snapshot, (_sheet, skill) => MODIFIERS[skill] ?? 0)).toBeNull();
  });

  it('is not needed for an NPC the proposal creates', async () => {
    const preview = await (await authoringWorld()).preview(tomasProposal());

    expect(preview.changes.map((change) => change.type)).not.toContain('AuthoringPremisesRecorded');
  });
});
