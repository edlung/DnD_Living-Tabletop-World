import {
  MAX_EXHAUSTION,
  PACE_MILES_PER_HOUR,
  SECONDS_PER_DAY,
  SECONDS_PER_HOUR,
  TRAVEL_DAY_HOURS,
  TRAVEL_PACES,
  maxTravelPace,
  routeKey,
  type KernelCommandOf,
} from '@ltw/contracts';
import {
  accept,
  reject,
  type Decision,
  type DecisionContext,
  type Dice,
  type DraftEvent,
} from '@ltw/domain';

import { exhausted } from './hazards.ts';
import { spellSave } from './saves.ts';
import { baseSpeedOf, exhaustionOf, speedOf, vitalsEvent, vitalsOf } from './vitals.ts';

/**
 * A journey along a route (docs/adr/0057-encounters-maps-loot.md §10; SRD 5.2.1 "Travel Pace",
 * Gameplay Toolbox "Travel Pace"). The travellers stand together at one end of a route outside a
 * fight; the pace may be no faster than the route's terrain allows, one step more on a good road,
 * and Slow when a traveller's Speed is down to half or less. The miles take their hours at the
 * pace, the given hours a day; each hour of a day past 8 asks each traveller a Constitution save,
 * DC 10 plus the hours past 8, or a level of Exhaustion. The clock moves on by the days and the
 * last day's hours, and the travellers arrive.
 */
export function decideTravel(
  context: DecisionContext,
  command: KernelCommandOf<'Travel'>,
  dice: Dice,
): Decision {
  const { state } = context;
  if (state.encounter !== null) return reject('INVALID_COMMAND', 'Not while a fight runs');
  const travellers = command.travellerIds.map((id) => state.entities.get(id));
  const fromId = travellers[0]?.placement?.locationId;
  if (
    fromId === undefined ||
    travellers.some(
      (one) =>
        !one ||
        one.status !== 'active' ||
        one.kind === 'location' ||
        one.kind === 'item' ||
        one.placement?.locationId !== fromId,
    )
  )
    return reject('NOT_PRESENT', 'The travellers set out together from one place');
  if (fromId === command.toId) return reject('NO_EFFECT', 'They are there already');
  const route = state.routes.get(routeKey(fromId, command.toId));
  if (!route) return reject('NOT_PRESENT', 'No route joins the two places');
  const slowed = command.travellerIds.some((id) => {
    const vitals = vitalsOf(state, id);
    return vitals !== null && baseSpeedOf(vitals) > 0 && speedOf(vitals) * 2 <= baseSpeedOf(vitals);
  });
  const fastest = maxTravelPace(route.terrain, route.road, slowed);
  if (TRAVEL_PACES.indexOf(command.pace) > TRAVEL_PACES.indexOf(fastest))
    return reject('ILLEGAL_ACTION', 'TOO_FAST', { reason: 'TOO_FAST', fastest });
  const hours = Math.ceil(route.miles / PACE_MILES_PER_HOUR[command.pace]);
  const days = Math.ceil(hours / command.hoursPerDay);
  const lastDay = hours - (days - 1) * command.hoursPerDay;
  const events: DraftEvent[] = [
    {
      type: 'PartyTravelled',
      payload: {
        fromId,
        toId: command.toId,
        pace: command.pace,
        miles: route.miles,
        hours,
        days,
        travellerIds: [...command.travellerIds],
      },
    },
  ];
  // Extended travel: each day's hours past 8, each traveller a save an hour.
  const pushed = Array.from({ length: days }, (_, day) =>
    Math.max(0, (day === days - 1 ? lastDay : command.hoursPerDay) - TRAVEL_DAY_HOURS),
  );
  for (const id of command.travellerIds) {
    let vitals = vitalsOf(state, id);
    if (!vitals) continue;
    const before = exhaustionOf(vitals);
    let level = before;
    for (const extra of pushed) {
      for (let hour = 1; hour <= extra && level < MAX_EXHAUSTION; hour += 1) {
        const save = spellSave(dice, vitals, 'con', 10 + hour, 'none', 'travel');
        events.push(save.event);
        if (save.success) continue;
        const worse = exhausted(state, vitals, level + 1);
        level += 1;
        vitals = worse.vitals;
        if (worse.dead) events.push(vitalsEvent(vitals), ...worse.events);
      }
    }
    if (level !== before && level < MAX_EXHAUSTION) events.push(vitalsEvent(vitals));
  }
  // The clock moves on, and they arrive at its new time.
  const to = state.clock + (days - 1) * SECONDS_PER_DAY + lastDay * SECONDS_PER_HOUR;
  events.push({ type: 'WorldTimeAdvanced', payload: { from: state.clock, to } });
  for (const id of command.travellerIds) {
    events.push({
      type: 'EntityPlaced',
      payload: { entityId: id, locationId: command.toId, since: to, previousLocationId: fromId },
    });
  }
  return accept(...events);
}
