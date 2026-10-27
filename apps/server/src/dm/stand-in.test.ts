import type { EncounterResponse } from '@ltw/contracts';
import { entropyFor, type EntropySource } from '@ltw/domain';
import { scriptedDice } from '@ltw/rules';
import { afterEach, describe, expect, it } from 'vitest';

import ambush from '../../../../fixtures/ravenford/road-ambush.json' with { type: 'json' };
import { CAMPAIGN, ELOWEN, dmTable, type DmTable } from '../testing/dm-table.ts';
import { TOKENS, get, seededEngine } from '../testing/ravenford-app.ts';

/**
 * The DM acting for an absent player adds no authority (docs/adr/0033-live-session.md §6): the
 * kernel still refuses a player acting for another character, the DM's End turn for a player's
 * character cannot get past an open reaction window, and what the DM does is the DM's own
 * stored command, listed with its reason and undone like any other.
 */
const SEREN = 'seren-ashgrove';
const DM = { actorId: 'dm-ravenford', kind: 'user' } as const;

/** Initiative d20s in combatant order (Elowen, three Raiders, the Shaman, Seren), then 11s. */
class Initiative implements EntropySource {
  readonly #queue = [17, 3, 2, 1, 15, 5].map((face) => entropyFor(face, 20));
  next(): number {
    return this.#queue.shift() ?? 2 ** 31;
  }
}

const tables: DmTable[] = [];
afterEach(async () => {
  await Promise.all(tables.splice(0).map((table) => table.app.close()));
});

/** Elowen and Seren (who also knows Counterspell, with her own player) against the ambush. */
async function twoPlayers(): Promise<DmTable> {
  const engine = await seededEngine(undefined, scriptedDice([]), new Initiative());
  const table = await dmTable({ engine });
  tables.push(table);
  const sheet = (await engine.load('ravenford'))?.state.characterSheets.get(ELOWEN);
  const setup = [
    {
      type: 'CreateEntity',
      entityId: SEREN,
      kind: 'character',
      name: 'Seren Ashgrove',
      existsSince: null,
      placement: { locationId: 'old-trade-road', since: null },
    },
    { type: 'SetCharacterSheet', entityId: SEREN, sheet },
    { type: 'AssignCharacter', characterId: SEREN, playerActorId: 'player-seren' },
    ...ambush.place,
    {
      ...ambush.startCombat,
      combatants: [
        ...ambush.startCombat.combatants,
        { entityId: SEREN, side: 'party', position: { x: 2, y: 8 } },
      ],
    },
  ];
  for (const [index, command] of setup.entries()) {
    const result = await engine.execute({
      commandId: `two-players.${String(index)}`,
      campaignId: 'ravenford',
      actor: DM,
      command,
    });
    expect(result.status, command.type).toBe('accepted');
  }
  return table;
}

const encounter = async ({ app }: DmTable) =>
  (await get(app, `${CAMPAIGN}/encounter?perspective=DM`, TOKENS.dm)).json<EncounterResponse>()
    .encounter;

describe('acting for a player adds no authority', () => {
  it('keeps every refusal of the kernel while a reaction window waits on Elowen’s turn', async () => {
    const table = await twoPlayers();
    const { command, substitute, page } = table;
    expect((await encounter(table))?.currentCombatantId).toBe(ELOWEN);
    // Elowen's own spell gives Seren a chance to counter it: the encounter waits for her.
    const cast = await command(
      {
        type: 'CastSpell',
        combatantId: ELOWEN,
        spellId: 'hunters-mark',
        targetId: 'creature-10fb59d4',
      },
      TOKENS.player,
    );
    expect(cast.result).toMatchObject({ status: 'accepted', outcome: { awaitingReaction: true } });
    const window = (await encounter(table))?.reactionWindow;
    expect(window?.candidates.map((candidate) => candidate.entityId)).toEqual([SEREN]);
    const windowId = window?.windowId ?? '';

    // The DM skips Elowen's turn for her: the reason is recorded, the turn is not skipped.
    const reason = { clientCommandId: 'skip-early', characterId: ELOWEN, reason: 'absent' };
    expect((await substitute(reason, TOKENS.dm)).statusCode).toBe(201);
    const skipped = await command(
      { type: 'EndTurn', combatantId: ELOWEN },
      TOKENS.dm,
      'skip-early',
    );
    expect(skipped.status).toBe(422);
    expect(skipped.result).toMatchObject({ status: 'rejected', code: 'REACTION_PENDING' });
    expect((await encounter(table))?.currentCombatantId).toBe(ELOWEN);
    // A reason without its command describes nothing.
    expect((await page()).entries).toEqual([]);

    // Elowen's player can answer for nobody but Elowen, and run no creature.
    for (const body of [
      { type: 'DeclineReaction', combatantId: SEREN, windowId },
      { type: 'EndTurn', combatantId: 'creature-ae08be99' },
      { type: 'EndTurn', combatantId: SEREN },
    ]) {
      expect((await command(body, TOKENS.player)).status, body.type).toBe(403);
    }
    // Nor record a reason, even for herself.
    const own = { clientCommandId: 'mine', characterId: ELOWEN, reason: 'asked' };
    expect((await substitute(own, TOKENS.player)).statusCode).toBe(404);

    // The DM answers for absent Seren, then ends Elowen's turn: both are the DM's commands.
    const forSeren = { clientCommandId: 'for-seren', characterId: SEREN, reason: 'absent' };
    expect((await substitute(forSeren, TOKENS.dm)).statusCode).toBe(201);
    const declined = await command(
      { type: 'DeclineReaction', combatantId: SEREN, windowId },
      TOKENS.dm,
      'for-seren',
    );
    expect(declined.result.status).toBe('accepted');
    expect((await encounter(table))?.reactionWindow).toBeNull();
    // A reason recorded for someone else describes nothing about this command.
    const skip = await table.standIn(
      'skip-now',
      { type: 'EndTurn', combatantId: ELOWEN },
      { characterId: SEREN, reason: 'other' },
    );
    expect(skip.result.status).toBe('accepted');
    expect((await encounter(table))?.currentCombatantId).not.toBe(ELOWEN);

    const entries = (await page()).entries;
    expect(
      entries.map((entry) => entry.kind === 'substitution' && entry.character.entityId),
    ).toEqual([ELOWEN, SEREN]);
    expect(entries.map((entry) => entry.kind === 'substitution' && entry.reason)).toEqual([
      null,
      { reason: 'absent', note: null },
    ]);
    const log = await table.engine.commandLog('ravenford');
    for (const id of ['http:dm-ravenford:skip-now', 'http:dm-ravenford:for-seren']) {
      expect(log.find((stored) => stored.commandId === id)?.actor).toEqual(DM);
    }
    // Issued on the DM's authority: no player's assignment is among its premises.
    const history = (await table.engine.load('ravenford'))?.history ?? [];
    const premises = history.filter(
      (event) =>
        event.causation.commandId === 'http:dm-ravenford:skip-now' &&
        event.type === 'PremisesRecorded',
    );
    expect(premises).toHaveLength(1);
    expect(JSON.stringify(premises)).not.toContain('controller');
  });

  it('undoes the DM’s End turn for her like any other command', async () => {
    const table = await dmTable();
    tables.push(table);
    await table.startAmbush();
    expect(
      (await table.standIn('skip', { type: 'EndTurn', combatantId: ELOWEN })).result.status,
    ).toBe('accepted');
    expect((await encounter(table))?.currentCombatantId).toBe('creature-10fb59d4');
    expect((await table.page()).entries[0]).toMatchObject({ undo: { possible: true } });
    const undone = await table.command(
      { type: 'UndoCommand', targetCommandId: 'http:dm-ravenford:skip' },
      TOKENS.dm,
    );
    expect(undone.result.status).toBe('accepted');
    expect((await encounter(table))?.currentCombatantId).toBe(ELOWEN);
    expect((await table.page()).entries[0]).toMatchObject({
      commandId: 'http:dm-ravenford:skip',
      status: 'UNDONE',
      undo: null,
      reason: { reason: 'absent', note: null },
    });
  });
});
