import type { AuthoringProposalResponse, CommandResult, DmHistoryEntry } from '@ltw/contracts';
import {
  InMemoryEventStore,
  SequentialIds,
  SteppingClock,
  WorldEngine,
  type Actor,
} from '@ltw/domain';
import { createCombatEngine } from '@ltw/combat';
import { scriptedDice, skillCheckPort } from '@ltw/rules';
import { afterEach, describe, expect, it } from 'vitest';

import { CAMPAIGN, ELOWEN, dmTable, type DmTable } from '../testing/dm-table.ts';
import {
  MIDDLE_ENTROPY,
  TOKENS,
  get,
  post,
  seededEngine,
  withoutRequestId,
} from '../testing/ravenford-app.ts';

/**
 * The DM history (docs/adr/0033-live-session.md §7; docs/STAGE_310_DESIGN.md §C): authoring
 * commits and the DM's substitutions, newest first, 20 per page, with canonical status and the
 * kernel's own answer to "could I undo this now". The DM's alone, only in the DM perspective;
 * derived from durable stores, so a fresh application over them lists the same.
 */
const tables: DmTable[] = [];
afterEach(async () => {
  await Promise.all(tables.splice(0).map((table) => table.app.close()));
});

async function table(options: Parameters<typeof dmTable>[0] = {}): Promise<DmTable> {
  const created = await dmTable(options);
  tables.push(created);
  return created;
}

const PROPOSALS = `${CAMPAIGN}/authoring/proposals`;
const TOMAS = {
  type: 'CreateEntity',
  entityId: 'tomas-reed',
  kind: 'npc',
  name: 'Tomas Reed',
  description: 'A young guard.',
  existsSince: null,
  placement: { locationId: 'north-gate', since: null },
};
const TESTIMONY = {
  type: 'AddKnowledge',
  knowledgeId: 'tomas-saw',
  scope: { kind: 'NPC', npcId: 'tomas-reed' },
  knowledgeType: 'TESTIMONY',
  statement: 'I saw the caravan leave.',
  subjects: ['guild-caravan', 'north-gate'],
  attributedTo: 'tomas-reed',
  knownSince: null,
};
const WILLING = { type: 'SetDisclosure', knowledgeId: 'tomas-saw', disclosure: 'WILLING' };

/** Drafts and commits Tomas through the authoring routes; returns the proposal ID. */
async function commitTomas({ app }: DmTable): Promise<string> {
  const drafted = await post(
    app,
    PROPOSALS,
    { summary: 'Tomas Reed guards North Gate.', commands: [TOMAS, TESTIMONY, WILLING] },
    TOKENS.dm,
  );
  expect(drafted.statusCode).toBe(201);
  const { proposal, preview } = drafted.json<AuthoringProposalResponse>();
  const committed = await post(
    app,
    `${PROPOSALS}/${proposal.proposalId}/commit`,
    { revision: proposal.revision, confirmation: preview?.confirmation },
    TOKENS.dm,
  );
  expect(committed.json<CommandResult>().status).toBe('accepted');
  return proposal.proposalId;
}

describe('check order', () => {
  it('answers 401, 400, 404 for a non-DM, and 403 for a lower perspective', async () => {
    const { history } = await table();
    expect((await history(undefined)).statusCode).toBe(401);
    for (const query of [
      '',
      'perspective=',
      'perspective=SECRET',
      'perspective=DM&before=0',
      'perspective=DM&before=-3',
      'perspective=DM&before=1.5',
      'perspective=DM&before=soon',
      'perspective=DM&before=1&before=2',
      'perspective=DM&perspective=DM',
      'perspective=DM&limit=50',
    ]) {
      expect((await history(TOKENS.dm, query)).statusCode, query).toBe(400);
    }
    // A non-DM gets the 404 of a campaign that does not exist, whatever it asks for.
    const missing = withoutRequestId(await history(TOKENS.outsider));
    expect(missing).toEqual({ status: 404, error: { code: 'NOT_FOUND', message: 'Not found' } });
    for (const query of [
      'perspective=DM',
      'perspective=PLAYER',
      `perspective=CHARACTER:${ELOWEN}`,
    ]) {
      expect(withoutRequestId(await history(TOKENS.player, query)), query).toEqual(missing);
    }
    // The DM, holding any lower perspective, is refused without looking at what it names.
    for (const perspective of [
      'PARTY',
      'PUBLIC',
      `CHARACTER:${ELOWEN}`,
      'CHARACTER:nobody',
      'NPC:mira-vale',
    ]) {
      expect((await history(TOKENS.dm, `perspective=${perspective}`)).statusCode, perspective).toBe(
        403,
      );
    }
  });

  it('is a 404 across campaigns, in both directions', async () => {
    const created = await table();
    const outsider: Actor = { actorId: 'outsider', kind: 'user' };
    const elsewhere = await created.engine.execute({
      commandId: 'elsewhere',
      campaignId: 'elsewhere',
      actor: outsider,
      command: { type: 'CreateCampaign', name: 'Elsewhere', worldName: 'Away', startsAt: 0 },
    });
    expect(elsewhere.status).toBe('accepted');
    await commitTomas(created);
    const url = '/campaigns/elsewhere/dm/history?perspective=DM';
    expect((await get(created.app, url, TOKENS.dm)).statusCode).toBe(404);
    const own = await get(created.app, url, TOKENS.outsider);
    expect(own.statusCode).toBe(200);
    expect(own.json()).toEqual({ perspective: 'DM', entries: [], nextBefore: null });
    expect((await created.history(TOKENS.outsider)).statusCode).toBe(404);
  });
});

describe('the entries', () => {
  it('lists authoring commits and the DM’s substitutions, newest first, and nothing else', async () => {
    const created = await table();
    const { command, standIn, page } = created;
    expect(await page()).toEqual({ perspective: 'DM', entries: [], nextBefore: null });
    const proposalId = await commitTomas(created);
    // The player's own command is not the DM's.
    const own = { type: 'EnterLocation', characterId: ELOWEN, locationId: 'north-gate' };
    expect((await command(own, TOKENS.player, 'own-walk')).status).toBe(200);
    const walk = { type: 'EnterLocation', characterId: ELOWEN, locationId: 'market-square' };
    const note = 'Back in five';
    expect((await standIn('walk', walk, { reason: 'asked', note })).status).toBe(200);
    // Without a recorded reason, the DM's command for her is still listed, reason unknown.
    const back = { type: 'EnterLocation', characterId: ELOWEN, locationId: 'north-gate' };
    expect((await command(back, TOKENS.dm, 'quiet')).status).toBe(200);

    const { entries, nextBefore } = await page();
    expect(nextBefore).toBeNull();
    expect(entries.map((entry) => [entry.kind, entry.commandId])).toEqual([
      ['substitution', 'http:dm-ravenford:quiet'],
      ['substitution', 'http:dm-ravenford:walk'],
      ['authoring', `authoring.${proposalId}`],
    ]);
    const [quiet, walked, authored] = entries as [DmHistoryEntry, DmHistoryEntry, DmHistoryEntry];
    expect(walked).toMatchObject({
      kind: 'substitution',
      character: { entityId: ELOWEN, kind: 'character', name: 'Elowen Starwhisper' },
      command: walk,
      reason: { reason: 'asked', note },
      status: 'COMMITTED',
    });
    expect(JSON.stringify(entries)).not.toContain('resolution');
    expect(quiet).toMatchObject({ command: back, reason: null, status: 'COMMITTED' });
    expect(quiet.undo).toEqual({ possible: true });
    // The DM's walk stands beneath the later walk, which moved her again.
    expect(walked.undo).toEqual({
      possible: false,
      code: 'UNDO_UNSAFE',
      blockers: [
        {
          commandId: 'http:dm-ravenford:quiet',
          commandType: 'EnterLocation',
          sequence: expect.any(Number) as number,
        },
      ],
    });
    expect(authored).toMatchObject({
      kind: 'authoring',
      proposalId,
      summary: 'Tomas Reed guards North Gate.',
      status: 'COMMITTED',
    });
    expect(authored.sequence).toBeLessThan(walked.sequence);
    expect(walked.sequence).toBeLessThan(quiet.sequence);
  });

  it('lists the DM acting in combat for her, never the DM’s creatures', async () => {
    const { command, standIn, startAmbush, page } = await table();
    await startAmbush();
    const attack = {
      type: 'Attack',
      combatantId: ELOWEN,
      attackId: 'longbow',
      targetId: 'creature-10fb59d4',
    };
    expect((await standIn('shot', attack, { reason: 'other' })).status).toBe(200);
    // The party set on the road beforehand is the DM's change by hand (ADR 0058 §1), listed apart.
    const listed = (await page()).entries;
    const edits = listed.flatMap((entry) => (entry.kind === 'edit' ? [entry.command.type] : []));
    expect(edits.length).toBeGreaterThan(0);
    expect(new Set(edits)).toEqual(new Set(['PlaceEntity']));
    expect(listed.filter((entry) => entry.kind !== 'edit')).toEqual([
      expect.objectContaining({
        commandId: 'http:dm-ravenford:shot',
        command: attack,
        reason: { reason: 'other', note: null },
        undo: { possible: true },
      }),
    ]);
    // Her player ends her turn; the DM runs the next goblin's turn.
    expect((await command({ type: 'EndTurn', combatantId: ELOWEN }, TOKENS.player)).status).toBe(
      200,
    );
    const goblin = { type: 'EndTurn', combatantId: 'creature-10fb59d4' };
    expect((await command(goblin, TOKENS.dm)).status).toBe(200);
    const [shot, ...rest] = (await page()).entries.filter((entry) => entry.kind !== 'edit');
    expect(rest).toEqual([]);
    expect(shot?.undo).toMatchObject({ possible: false, code: 'UNDO_UNSAFE' });
  });

  it('shows the status after undo and the kernel’s own blockers, which the undo route confirms', async () => {
    const created = await table();
    const { command, page, app } = created;
    const proposalId = await commitTomas(created);
    for (const [id, body] of [
      ['to-gate', { type: 'EnterLocation', characterId: ELOWEN, locationId: 'north-gate' }],
      [
        'ask-tomas',
        { type: 'AskAbout', characterId: ELOWEN, npcId: 'tomas-reed', topicId: 'guild-caravan' },
      ],
    ] as const) {
      expect((await command(body, TOKENS.player, id)).status).toBe(200);
    }
    const [blocked] = (await page()).entries;
    expect(blocked?.undo).toMatchObject({ possible: false, code: 'UNDO_UNSAFE' });
    const refused = await post(app, `${PROPOSALS}/${proposalId}/undo`, {}, TOKENS.dm);
    const result = refused.json<CommandResult>();
    expect(result.status).toBe('rejected');
    // The kernel's blockers, each a player's own action here, which the page also names.
    const listed = blocked?.undo && !blocked.undo.possible ? blocked.undo.blockers : [];
    expect(
      listed.map(({ commandId, commandType, sequence }) => ({ commandId, commandType, sequence })),
    ).toEqual(result.status === 'rejected' ? result.details?.['blockers'] : null);
    expect(listed.map((blocker) => blocker.player?.command.type)).toEqual(['AskAbout']);
    // The page computed it without committing anything: the refusal above is all there is.
    expect((await page()).entries[0]?.undo).toEqual(blocked?.undo);

    expect(
      (
        await command(
          { type: 'UndoCommand', targetCommandId: 'http:player-elowen:ask-tomas' },
          TOKENS.dm,
        )
      ).result.status,
    ).toBe('accepted');
    expect((await page()).entries[0]?.undo).toEqual({ possible: true });
    expect((await post(app, `${PROPOSALS}/${proposalId}/undo`, {}, TOKENS.dm)).statusCode).toBe(
      200,
    );
    expect((await page()).entries[0]).toMatchObject({ status: 'UNDONE', undo: null });
  });

  it('pages 20 at a time by sequence, newest first, without gaps or repeats', async () => {
    const { standIn, page } = await table();
    for (let index = 0; index < 25; index += 1) {
      const locationId = index % 2 === 0 ? 'north-gate' : 'market-square';
      const sent = await standIn(`walk-${String(index)}`, {
        type: 'EnterLocation',
        characterId: ELOWEN,
        locationId,
      });
      expect(sent.status, sent.result.status).toBe(200);
    }
    const first = await page();
    expect(first.entries).toHaveLength(20);
    expect(first.nextBefore).toBe(first.entries.at(-1)?.sequence);
    const second = await page(`perspective=DM&before=${String(first.nextBefore)}`);
    expect(second.entries).toHaveLength(5);
    expect(second.nextBefore).toBeNull();
    const all = [...first.entries, ...second.entries];
    expect(all.map((entry) => entry.commandId)).toEqual(
      Array.from({ length: 25 }, (_, index) => `http:dm-ravenford:walk-${String(24 - index)}`),
    );
    const sequences = all.map((entry) => entry.sequence);
    expect(sequences).toEqual([...sequences].sort((a, b) => b - a));
    expect(await page('perspective=DM&before=1')).toEqual({
      perspective: 'DM',
      entries: [],
      nextBefore: null,
    });
  });

  it('survives a fresh application over the same stores', async () => {
    const store = new InMemoryEventStore();
    const first = await table({ engine: await seededEngine(store) });
    await commitTomas(first);
    await first.startAmbush();
    await first.standIn('stand', { type: 'EndTurn', combatantId: ELOWEN }, { reason: 'other' });
    const before = await first.page();
    // Beside the party's places set by hand (ADR 0058 §1): the authoring and the stand-in.
    expect(before.entries.filter((entry) => entry.kind !== 'edit')).toHaveLength(2);

    const restarted = new WorldEngine({
      store,
      ids: new SequentialIds(0x5e),
      clock: new SteppingClock(),
      checks: skillCheckPort(scriptedDice([])),
      combat: createCombatEngine(),
      entropy: MIDDLE_ENTROPY,
    });
    const second = await table({
      engine: restarted,
      dm: first.dm,
      authoring: first.authoring,
    });
    expect(await second.page()).toEqual(before);
  });
});
