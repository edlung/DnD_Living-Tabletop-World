import type { CommandResult, EncounterResponse } from '@ltw/contracts';
import type { FastifyInstance } from 'fastify';

import ambush from '../../../../fixtures/ravenford/road-ambush.json' with { type: 'json' };
import rulesSeed from '../../../../fixtures/ravenford/rules-seed.json' with { type: 'json' };
import { BASE, ELOWEN, post } from './gate02-scenarios.ts';
import { TOKENS, get } from './ravenford-app.ts';

/**
 * Test support (excluded from builds): the Astra Gate 03 reproductions
 * (reviews/ASTRA_GATE_03_REPORT.md) over the HTTP app, shared by the
 * in-memory and PostgreSQL regression suites. Combat dice roll the middle
 * face, so the order is Elowen, (Seren), the Raiders, the Shaman, and a
 * Counterspell counters (the Shaman's save: 11 + 1 against DC 16).
 */
export { ELOWEN };
export const SHAMAN = 'creature-ae08be99';
export const RAIDER_1 = 'creature-10fb59d4';
/** A second party character, from the DM only: there is no persona token for her player. */
export const SEREN = 'seren-ashgrove';

type Sent = { status: number; body: CommandResult };

export async function expectAccepted(sent: Promise<Sent>): Promise<string> {
  const { status, body } = await sent;
  if (status !== 200 || body.status !== 'accepted') {
    throw new Error(`expected accepted, got ${String(status)} ${JSON.stringify(body)}`);
  }
  return body.commandId;
}

/** Elowen's approved sheet from the seed, for DM edits in these scenarios. */
export const SEED_SHEET = rulesSeed.commands.find(
  (command) => command.type === 'SetCharacterSheet',
)?.sheet;

/**
 * Places everyone on the Old Trade Road and starts the ambush: with Seren as a
 * second party combatant, or without Elowen in it (she stays on the road,
 * outside the fight; G03-H04).
 */
export async function startAmbush(
  app: FastifyInstance,
  prefix: string,
  withSeren = false,
  withoutElowen = false,
) {
  const dm = (id: string, command: Record<string, unknown>) =>
    expectAccepted(post(app, TOKENS.dm, `${prefix}-${id}`, command));
  if (withSeren) {
    await dm('seren', {
      type: 'CreateEntity',
      entityId: SEREN,
      kind: 'character',
      name: 'Seren Ashgrove',
      existsSince: null,
      placement: { locationId: 'old-trade-road', since: null },
    });
    await dm('seren-sheet', { type: 'SetCharacterSheet', entityId: SEREN, sheet: SEED_SHEET });
    await dm('seren-player', {
      type: 'AssignCharacter',
      characterId: SEREN,
      playerActorId: 'player-seren',
    });
  }
  for (const place of ambush.place) await dm(`place-${place.entityId}`, place);
  const start = {
    ...ambush.startCombat,
    combatants: [
      ...ambush.startCombat.combatants.filter((c) => !withoutElowen || c.entityId !== ELOWEN),
      ...(withSeren ? [{ entityId: SEREN, side: 'party', position: { x: 2, y: 8 } }] : []),
    ],
  };
  await dm('start', start);
}

export async function encounter(app: FastifyInstance, perspective = 'DM', token = TOKENS.dm) {
  const response = await get(app, `${BASE}/encounter?perspective=${perspective}`, token);
  return response.json<EncounterResponse>().encounter;
}

/** Ends turns until the Shaman's, then it casts Ashen Bolt at Elowen; returns the window ID. */
export async function shamanCastsAtElowen(app: FastifyInstance, prefix: string): Promise<string> {
  for (let turn = 0; turn < 8; turn += 1) {
    const current = (await encounter(app))?.currentCombatantId;
    if (current === SHAMAN) break;
    await expectAccepted(
      post(app, TOKENS.dm, `${prefix}-end-${String(turn)}`, {
        type: 'EndTurn',
        combatantId: current,
      }),
    );
  }
  await expectAccepted(
    post(app, TOKENS.dm, `${prefix}-bolt`, {
      type: 'CastSpell',
      combatantId: SHAMAN,
      spellId: 'ashen-bolt',
      targetId: ELOWEN,
    }),
  );
  const windowId = (await encounter(app))?.reactionWindow?.windowId;
  if (windowId === undefined) throw new Error('no reaction window opened');
  return windowId;
}

/** Everything Elowen's player can read about knowledge and memories, as raw JSON. */
export async function playerReads(app: FastifyInstance): Promise<string> {
  const reads = await Promise.all(
    [
      `${BASE}/knowledge?perspective=PLAYER`,
      `${BASE}/knowledge?perspective=PARTY`,
      `${BASE}/memories?perspective=PLAYER`,
    ].map(async (url) => (await get(app, url, TOKENS.player)).body),
  );
  return reads.join('\n');
}
