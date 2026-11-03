import {
  SECONDS_PER_DAY,
  SECONDS_PER_HOUR,
  type CharacterSheet,
  type CommandResult,
} from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { ELOWEN, codeOf, recorded, roadWorld, type RoadWorld } from './testing/road.ts';
import { verifyHistory } from './testing/verify.ts';

/**
 * A journey (docs/adr/0057-encounters-maps-loot.md §10; SRD 5.2.1 Travel Pace, Travel Terrain,
 * Extended Travel): the party sets out from where Elowen stands along a route the DM set. The miles
 * take their hours at the pace; the clock moves on and they arrive. No pace faster than the
 * terrain allows (one step more on a good road), Slow when a traveller's Speed is halved; each hour
 * past 8 in a day, a Constitution save at DC 10 + the hours past 8, or a level of Exhaustion.
 */
async function setOut(world: RoadWorld) {
  const state = await world.state();
  const here = state.entities.get(ELOWEN)?.placement?.locationId ?? '';
  const there = here === 'north-gate' ? 'market-square' : 'north-gate';
  const party = [...state.entities.values()]
    .filter(
      (entity) =>
        entity.kind === 'character' &&
        entity.status === 'active' &&
        entity.placement?.locationId === here,
    )
    .map((entity) => entity.entityId);
  const route = (miles: number, terrain: string, road: boolean) =>
    world.dm({ type: 'SetRoute', fromId: here, toId: there, route: { miles, terrain, road } });
  const travel = (pace: string, extra: Record<string, unknown> = {}) =>
    world.dm({ type: 'Travel', toId: there, pace, travellerIds: party, ...extra });
  return { here, there, party, route, travel, clock: state.clock };
}

/** A refusal's reason, as the rules give it (`TOO_FAST`), or the result's code. */
const reasonOf = (result: CommandResult) =>
  result.status === 'rejected' && result.code === 'ILLEGAL_ACTION'
    ? result.message
    : codeOf(result);

const sheetOf = async (world: RoadWorld, id: string): Promise<CharacterSheet | undefined> =>
  (await world.state()).characterSheets.get(id);

describe('a journey', () => {
  it('takes its hours at the pace, moves the clock on and brings the party there', async () => {
    const world = await roadWorld();
    const trip = await setOut(world);
    expect(codeOf(await trip.route(30, 'grassland', true))).toBe('accepted');
    // Thirty miles at a Fast pace: 8 hours, a day's travel, no saves.
    const went = await trip.travel('fast');
    expect(codeOf(went)).toBe('accepted');
    const events = await recorded(world, went);
    expect(events.find((event) => event.type === 'PartyTravelled')?.payload).toMatchObject({
      pace: 'fast',
      miles: 30,
      hours: 8,
      days: 1,
    });
    expect(events.some((event) => event.type === 'SavingThrowRolled')).toBe(false);
    const state = await world.state();
    expect(state.clock).toBe(trip.clock + 8 * SECONDS_PER_HOUR);
    for (const id of trip.party)
      expect(state.entities.get(id)?.placement?.locationId).toBe(trip.there);
    await verifyHistory(world);
  });

  it('keeps to the pace the terrain allows, a step more on a good road', async () => {
    const world = await roadWorld();
    const trip = await setOut(world);
    await trip.route(12, 'mountain', false);
    expect(reasonOf(await trip.travel('normal'))).toBe('TOO_FAST');
    // A good road through the mountains allows Normal.
    await trip.route(12, 'mountain', true);
    expect(reasonOf(await trip.travel('fast'))).toBe('TOO_FAST');
    expect(codeOf(await trip.travel('normal'))).toBe('accepted');
  });

  it('goes Slow when a traveller’s Speed is down to half', async () => {
    const world = await roadWorld();
    const trip = await setOut(world);
    await trip.route(6, 'grassland', true);
    const sheet = await sheetOf(world, ELOWEN);
    if (!sheet) throw new Error('no sheet');
    // Exhaustion 3: her Speed of 30 ft is 15 ft.
    await world.dm({
      type: 'SetCharacterSheet',
      entityId: ELOWEN,
      sheet: { ...sheet, exhaustion: 3 },
    });
    expect(reasonOf(await trip.travel('normal'))).toBe('TOO_FAST');
    expect(codeOf(await trip.travel('slow'))).toBe('accepted');
  });

  it('asks the saves of extended travel, and is undone', async () => {
    const world = await roadWorld();
    const trip = await setOut(world);
    await trip.route(30, 'grassland', false);
    const before = await sheetOf(world, ELOWEN);
    // Thirty miles at Normal: 10 hours in one day, two hours past 8 — DC 11, then DC 12.
    world.roll(20, ...trip.party.flatMap(() => [1, 1]));
    const went = await trip.travel('normal', { hoursPerDay: 10 });
    expect(codeOf(went)).toBe('accepted');
    const saves = (await recorded(world, went)).flatMap((event) =>
      event.type === 'SavingThrowRolled' && event.payload.creatureId === ELOWEN
        ? [event.payload]
        : [],
    );
    expect(saves.map((save) => [save.dc, save.purpose, save.success])).toEqual([
      [11, 'travel', false],
      [12, 'travel', false],
    ]);
    expect((await sheetOf(world, ELOWEN))?.exhaustion).toBe((before?.exhaustion ?? 0) + 2);
    expect((await world.state()).clock).toBe(trip.clock + 10 * SECONDS_PER_HOUR);
    expect(codeOf(await world.dm({ type: 'UndoCommand', targetCommandId: went.commandId }))).toBe(
      'accepted',
    );
    const state = await world.state();
    expect(state.clock).toBe(trip.clock);
    expect(state.entities.get(ELOWEN)?.placement?.locationId).toBe(trip.here);
    expect(state.characterSheets.get(ELOWEN)?.exhaustion).toBe(before?.exhaustion);
    await verifyHistory(world);
  });

  it('spreads a long road over days, and refuses without a route or the party together', async () => {
    const world = await roadWorld();
    const trip = await setOut(world);
    expect(codeOf(await trip.travel('normal'))).toBe('NOT_PRESENT');
    await trip.route(60, 'grassland', true);
    // Sixty miles at Normal, 8 hours a day: 20 hours, three days, the last of 4 hours.
    const went = await trip.travel('normal');
    const travelled = (await recorded(world, went)).find(
      (event) => event.type === 'PartyTravelled',
    );
    expect(travelled?.payload).toMatchObject({ hours: 20, days: 3 });
    expect((await world.state()).clock).toBe(
      trip.clock + 2 * SECONDS_PER_DAY + 4 * SECONDS_PER_HOUR,
    );
    // Someone elsewhere cannot set out with them.
    const back = await world.dm({
      type: 'Travel',
      toId: trip.here,
      pace: 'normal',
      travellerIds: [ELOWEN, 'mira-vale'],
    });
    expect(codeOf(back)).toBe('NOT_PRESENT');
  });
});
