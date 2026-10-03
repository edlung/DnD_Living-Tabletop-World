import type { CommandResult } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import {
  SEREN,
  SEREN_PLAYER,
  addSeren,
  closeWindow,
  counterspell,
  ignore,
  shamanCastsAtElowen,
  withSeren,
} from '../testing/reactions.ts';
import {
  CAMPAIGN,
  ELOWEN,
  PLAYER,
  RAIDER_1,
  SHAMAN,
  codeOf,
  recorded,
  roadWorld,
  startAmbush,
  type RoadWorld,
} from '../testing/road.ts';

/**
 * Reaction integrity (docs/adr/0016-reaction-engine.md §1–2): each candidate
 * answers once, closed windows accept nothing, and nothing else moves while
 * a window is open. Initiative: Elowen, Shaman, Seren (when present), Raiders.
 */
async function twoCandidates(): Promise<{ world: RoadWorld; windowId: string }> {
  const world = await roadWorld();
  await addSeren(world);
  await startAmbush(world, [17, 3, 2, 1, 15, 5], withSeren());
  const { windowId } = await shamanCastsAtElowen(world);
  return { world, windowId };
}
const reason = (result: CommandResult) =>
  result.status === 'rejected' ? `${result.code}:${result.message}` : result.status;

describe('one answer per candidate', () => {
  it('refuses a second answer, so a Reaction or slot is never spent twice', async () => {
    const { world, windowId } = await twoCandidates();
    expect(codeOf(await world.submit(ignore(ELOWEN, windowId)))).toBe('accepted');
    expect(codeOf(await world.submit(ignore(ELOWEN, windowId)))).toBe('ALREADY_RESPONDED');
    expect(codeOf(await world.submit(counterspell(ELOWEN, windowId)))).toBe('ALREADY_RESPONDED');
    world.roll(20, 5);
    expect(codeOf(await world.submit(counterspell(SEREN, windowId), SEREN_PLAYER))).toBe(
      'accepted',
    );
    expect(codeOf(await world.submit(counterspell(SEREN, windowId), SEREN_PLAYER))).toBe(
      'REACTION_WINDOW_CLOSED',
    );
    const state = await world.state();
    expect(state.characterSheets.get(SEREN)?.spellSlots.expended[2]).toBe(1);
    expect(state.characterSheets.get(ELOWEN)?.spellSlots.expended[2]).toBe(0);
  });

  it('returns the original outcome when the same command is retried, and acts once', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    const { windowId } = await shamanCastsAtElowen(world);
    world.roll(20, 5);
    const submission = {
      commandId: 'counter-once',
      campaignId: CAMPAIGN,
      actor: PLAYER,
      command: counterspell(ELOWEN, windowId),
    };
    const first = await world.engine.execute(submission);
    const version = (await world.state()).version;
    const retry = await world.engine.execute(submission);
    expect(retry).toEqual({ ...first, status: 'duplicate' });
    expect((await world.state()).version).toBe(version);
    expect((await world.state()).characterSheets.get(ELOWEN)?.spellSlots.expended[2]).toBe(1);
  });

  it('accepts answers only from pending candidates of an open window', async () => {
    const world = await roadWorld();
    await addSeren(world);
    await startAmbush(world, [17, 3, 2, 1, 15, 5], withSeren());
    const { windowId } = await shamanCastsAtElowen(world);
    expect(codeOf(await world.submit(ignore(ELOWEN, 'no-such-window')))).toBe(
      'REACTION_WINDOW_CLOSED',
    );
    expect(codeOf(await world.dm(ignore(RAIDER_1, windowId)))).toBe('NOT_A_CANDIDATE');
    // A player answers only for their own character.
    expect(codeOf(await world.submit(ignore(SEREN, windowId)))).toBe('FORBIDDEN');
    // The DM may answer for anyone.
    expect(codeOf(await world.dm(ignore(SEREN, windowId)))).toBe('accepted');
  });
});

describe('the pause', () => {
  it('refuses every other combat command and any change to what the window read', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    await shamanCastsAtElowen(world);
    const sheet = (await world.state()).characterSheets.get(ELOWEN);
    const encounterId = (await world.encounter()).encounterId;
    const refused = [
      { type: 'EndTurn', combatantId: SHAMAN },
      { type: 'Attack', combatantId: RAIDER_1, attackId: 'scimitar', targetId: ELOWEN },
      { type: 'MoveCombatant', combatantId: SHAMAN, path: [{ x: 13, y: 6 }] },
      { type: 'CastSpell', combatantId: SHAMAN, spellId: 'binding-hex', targetId: ELOWEN },
      { type: 'EndCombat', encounterId },
      { type: 'SetCharacterSheet', entityId: ELOWEN, sheet },
      { type: 'ChangeEntityStatus', entityId: RAIDER_1, status: 'dead' },
      { type: 'AdvanceWorldTime', by: 60 },
    ];
    for (const command of refused) {
      expect(codeOf(await world.dm(command)), command.type).toBe('REACTION_PENDING');
    }
    expect(
      codeOf(
        await world.submit({ type: 'MoveCombatant', combatantId: ELOWEN, path: [{ x: 2, y: 7 }] }),
      ),
    ).toBe('REACTION_PENDING');
    // A combatant cannot leave the battlefield at all while the encounter runs (ADR 0016 §5).
    expect(
      codeOf(await world.dm({ type: 'PlaceEntity', entityId: RAIDER_1, locationId: 'north-gate' })),
    ).toBe('COMBAT_ALREADY_ACTIVE');
    expect(
      codeOf(
        await world.submit({
          type: 'EnterLocation',
          characterId: ELOWEN,
          locationId: 'north-gate',
        }),
      ),
    ).toBe('COMBAT_ALREADY_ACTIVE');
    // What the window does not depend on still works.
    const allowed = [
      { type: 'UpdateEntityProfile', entityId: RAIDER_1, name: 'Scarred Raider' },
      {
        type: 'AddKnowledge',
        scope: { kind: 'DM' },
        knowledgeType: 'SECRET',
        statement: 'The Shaman serves the Ashen Circle.',
        subjects: [SHAMAN],
        knownSince: null,
      },
    ];
    for (const command of allowed) {
      expect(codeOf(await world.dm(command)), command.type).toBe('accepted');
    }
  });
});

describe('expiry', () => {
  it('lets the DM close the window: unanswered candidates expire and the spell proceeds', async () => {
    const { world, windowId } = await twoCandidates();
    expect(codeOf(await world.submit(ignore(ELOWEN, windowId)))).toBe('accepted');
    expect(codeOf(await world.submit(closeWindow(windowId)))).toBe('FORBIDDEN');
    world.roll(20, 15);
    world.roll(8, 4, 4);
    const closed = await world.dm(closeWindow(windowId));
    expect((await recorded(world, closed)).map((e) => e.type).slice(0, 2)).toEqual([
      'ReactionWindowExpired',
      'ReactionWindowResolved',
    ]);
    const state = await world.state();
    expect(state.reactionWindows.get(windowId)).toMatchObject({
      status: 'proceeded',
      candidates: [
        { entityId: ELOWEN, response: 'declined' },
        { entityId: SEREN, response: 'expired' },
      ],
      closedBy: closed.commandId,
    });
    expect(state.characterSheets.get(ELOWEN)?.hitPoints.current).toBe(70);
    // A late answer, or a second close, finds no open window.
    expect(reason(await world.submit(counterspell(SEREN, windowId), SEREN_PLAYER))).toBe(
      'REACTION_WINDOW_CLOSED:This reaction window is not open',
    );
    expect(codeOf(await world.dm(closeWindow(windowId)))).toBe('REACTION_WINDOW_CLOSED');
    expect(codeOf(await world.dm({ type: 'EndTurn', combatantId: SHAMAN }))).toBe('accepted');
  });
});

describe('several candidates', () => {
  it('keeps the window open after a failed Counterspell, then the next one counters', async () => {
    const { world, windowId } = await twoCandidates();
    world.roll(20, 15);
    const failed = await world.submit(counterspell(ELOWEN, windowId));
    expect(failed.status === 'accepted' && failed.outcome).toMatchObject({ countered: false });
    let state = await world.state();
    expect(state.reactionWindows.get(windowId)?.status).toBe('open');
    expect(state.characterSheets.get(ELOWEN)?.hitPoints.current).toBe(78);
    world.roll(20, 2);
    const countered = await world.submit(counterspell(SEREN, windowId), SEREN_PLAYER);
    expect(countered.status === 'accepted' && countered.outcome).toMatchObject({ countered: true });
    state = await world.state();
    expect(state.reactionWindows.get(windowId)?.status).toBe('countered');
    expect(state.characterSheets.get(ELOWEN)?.hitPoints.current).toBe(78);
  });

  it('closes on the first success; the others expire unanswered', async () => {
    const { world, windowId } = await twoCandidates();
    world.roll(20, 2);
    await world.submit(counterspell(ELOWEN, windowId));
    expect((await world.state()).reactionWindows.get(windowId)?.candidates).toEqual([
      { entityId: ELOWEN, response: 'used' },
      { entityId: SEREN, response: 'expired' },
    ]);
    expect(codeOf(await world.submit(ignore(SEREN, windowId), SEREN_PLAYER))).toBe(
      'REACTION_WINDOW_CLOSED',
    );
  });

  it('lets the spell through only after the last candidate answers', async () => {
    const { world, windowId } = await twoCandidates();
    const first = await world.submit(ignore(ELOWEN, windowId));
    expect((await recorded(world, first)).map((e) => e.type)).toEqual([
      'PremisesRecorded',
      'ReactionDeclined',
    ]);
    world.roll(20, 15);
    world.roll(8, 4, 4);
    await world.submit(ignore(SEREN, windowId), SEREN_PLAYER);
    expect((await world.state()).characterSheets.get(ELOWEN)?.hitPoints.current).toBe(70);
  });
});

describe('someone outside the fight', () => {
  it('cannot tell an encounter with an open window from no encounter at all', async () => {
    const probe = async (fight: boolean, windowId: string) => {
      const world = await roadWorld();
      await addSeren(world);
      await world.dm({ type: 'PlaceEntity', entityId: SEREN, locationId: 'north-gate' });
      if (fight) {
        await startAmbush(world);
        await shamanCastsAtElowen(world);
      }
      const commands = [
        { type: 'EndTurn', combatantId: SEREN },
        { type: 'MoveCombatant', combatantId: SEREN, path: [{ x: 1, y: 1 }] },
        { type: 'Attack', combatantId: SEREN, attackId: 'longbow', targetId: SHAMAN },
        { type: 'CastSpell', combatantId: SEREN, spellId: 'fireball', point: { x: 1, y: 1 } },
        counterspell(SEREN, windowId),
        ignore(SEREN, windowId),
      ];
      const answers: string[] = [];
      for (const command of commands)
        answers.push(reason(await world.submit(command, SEREN_PLAYER)));
      return answers;
    };
    const world = await roadWorld();
    await startAmbush(world);
    const { windowId } = await shamanCastsAtElowen(world);
    const during = await probe(true, windowId);
    expect(during).toEqual(await probe(false, windowId));
    expect(during).not.toContain('REACTION_PENDING:A reaction is pending');
  });
});
