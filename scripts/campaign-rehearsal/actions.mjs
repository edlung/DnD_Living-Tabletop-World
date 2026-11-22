import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { hitPoints, vitalsOf } from '../../packages/combat/src/index.ts';

export async function openEvening(f, title, n = 1) {
  const id = (await f.state()).activeSessionId;
  if (id) return id;
  const sessionId = 'evening-' + n;
  await f.cmd({ type: 'StartSession', sessionId, title });
  return sessionId;
}
export async function remember(f, kind, summary, participants, locationId) {
  const s = await f.state();
  await f.cmd({
    type: 'RecordMemory',
    scope: { kind: 'PARTY' },
    memoryKind: kind,
    summary,
    occurredAt: s.clock,
    sessionId: s.activeSessionId,
    participants,
    ...(locationId ? { locationId } : {}),
  });
}
export async function say(f, seat, title, body) {
  await f.request('/notes?perspective=PLAYER', { noteId: randomUUID(), title, body }, seat.token);
  const { notes } = await f.request('/notes?perspective=PLAYER', undefined, seat.token);
  assert.ok(notes.some((n) => n.body === body));
}
export async function move(f, seat, target) {
  const s = await f.state();
  let here = s.entities.get(seat.id).placement.locationId;
  if (here === target) return;
  const ancestors = (id) => {
    const out = [];
    while (id && !out.includes(id)) {
      out.push(id);
      id = s.entities.get(id)?.location?.parentId;
    }
    return out;
  };
  const route = ancestors(target);
  const common = ancestors(here).find((id) => route.includes(id));
  // A player can travel to adjacent areas on the known map. Scene cuts are explicit DM commands.
  if (common) {
    const steps = [
      ...ancestors(here).slice(1, ancestors(here).indexOf(common) + 1),
      ...route.slice(0, route.indexOf(common)).reverse(),
    ];
    for (const locationId of steps) {
      const r = await f.request(
        '/commands',
        {
          commandId: randomUUID(),
          command: { type: 'EnterLocation', characterId: seat.id, locationId },
        },
        seat.token,
      );
      if (r.status === 'rejected') break;
      here = locationId;
    }
  }
  if (here !== target) await f.cmd({ type: 'PlaceEntity', entityId: seat.id, locationId: target });
}
export async function investigate(f, keys, lead) {
  const start = await f.state(),
    out = [];
  const records = async (seat) =>
    (await f.request('/knowledge?perspective=PLAYER', undefined, seat.token)).knowledge;
  for (const key of keys) {
    const entry = f.content?.clues.find((c) => c.key === key);
    const clue = entry
      ? [...start.investigation.clues.values()].find(
          (c) => c.entityId === f.ids[entry.entity] && c.statement === entry.statement,
        )
      : start.investigation.clues.get(key);
    assert.ok(clue, key);
    const feature = start.entities.get(clue.entityId),
      place = feature.placement?.locationId ?? clue.entityId;
    const before = await records(lead);
    assert.ok(
      !before.some((k) => k.statement === clue.statement),
      'evidence already at start: ' + key,
    );
    let witness;
    for (const seat of [lead, ...f.seats.filter((s) => s !== lead)]) {
      await move(f, seat, place);
      await f.cmd(
        {
          type: 'ExamineEntity',
          characterId: seat.id,
          entityId: clue.entityId,
          method: clue.method,
        },
        seat,
      );
      if ((await records(seat)).some((k) => k.statement === clue.statement)) {
        witness = seat;
        break;
      }
    }
    assert.ok(witness, 'clue not earned: ' + key);
    out.push({
      key,
      place: start.entities.get(place).name,
      feature: feature.name,
      witness: witness.name,
      statement: clue.statement,
    });
  }
  return out;
}
export async function lostEncounter(f, preferred, injury) {
  const battles = (await f.request('/encounters/prepared')).encounters;
  const fight = preferred
    ? battles.find((b) => b.encounterId === preferred || b.title === preferred)
    : battles[0];
  assert.ok(fight, preferred);
  for (const seat of f.seats) await move(f, seat, fight.location.entityId);
  await f.request('/encounters/prepared/' + fight.encounterId + '/start', {
    requestId: randomUUID(),
  });
  const s = await f.state(),
    hero = f.seats[0];
  const hp = (state, id) => hitPoints(vitalsOf(state, id)).current;
  const hpBefore = hp(s, hero.id),
    enemies = s.encounter.combatants
      .map((x) => x.entityId)
      .filter((id) => !f.seats.some((p) => p.id === id));
  assert.ok(enemies.length && hpBefore > 0);
  if (injury !== 'objective') {
    const hpNow = hitPoints(vitalsOf(s, hero.id));
    const damage =
      injury === 'down' ? hpBefore + (hpNow.temporary ?? 0) : Math.max(1, Math.floor(hpBefore / 2));
    await f.cmd({
      type: 'AdjustHitPoints',
      targetId: hero.id,
      change: 'damage',
      amount: damage,
      damageType: 'bludgeoning',
      reason: 'Контрольная сцена поражения: состояние героя до решения уступить поле.',
    });
  }
  const injured = hp(await f.state(), hero.id);
  if (injury === 'down') assert.equal(injured, 0);
  else if (injury === 'wound') assert.ok(injured < hpBefore);
  else assert.equal(injured, hpBefore);
  await f.cmd({ type: 'EndCombat', encounterId: s.encounter.encounterId });
  const after = await f.state();
  const remaining = enemies.filter((id) => hp(after, id) > 0).length;
  assert.equal(remaining, enemies.length);
  assert.equal(hp(after, hero.id), injured);
  return {
    injury,
    battle: fight.title,
    location: fight.location.name,
    wounded: hero.name,
    hpBefore,
    hpAfter: injured,
    enemiesRemaining: remaining,
  };
}
export async function closeEvening(f) {
  await f.cmd({ type: 'EndSession', sessionId: (await f.state()).activeSessionId });
}
export async function finish(f, line) {
  await closeEvening(f);
  await f.request('/ending?perspective=DM', { finished: true, line });
  for (const seat of f.seats)
    assert.equal(
      (await f.request('/ending?perspective=PLAYER', undefined, seat.token)).ending.line,
      line,
    );
  return line;
}
