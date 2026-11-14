import assert from 'node:assert/strict';
import { LAYOUT_KEYS, isKit, srdEntry } from '../campaign-shared/combat-kit.ts';
import type { Source } from './source.ts';

/** Reject missing authored content/references before adapting it to native contracts. */
export function verifySource(s: Source): void {
  const { world: w, cast, sessions } = s;
  assert(w.minPlayers === 3 && w.maxPlayers === 7 && w.defaultPlayers === 4);
  if (w.startsAt !== undefined)
    assert(Number.isInteger(w.startsAt) && w.startsAt >= 0 && w.startsAt < 86400);
  assert.equal(w.sessionCount, sessions.length);
  assert(['14+', '18+'].includes(w.audience));
  assert(/дарк|тёмн|темн/i.test(w.genre), 'genre must explicitly identify dark fantasy');
  assert.equal(cast.heroes.length, 7);
  assert(cast.npcs.length >= 8 && w.locations.length >= 9);
  assert(
    s.clues.length >= (w.engine ? 6 : 12) &&
      s.handouts.length >= (w.engine ? 3 : 6) &&
      s.encounters.length >= (w.engine ? 1 : 3),
  );
  assert(
    w.truth.length >= 4 && w.endings.length >= (w.engine ? 1 : 3) && w.tableGuidance.length >= 4,
  );
  const entities = [
    ...w.locations,
    ...cast.heroes,
    ...cast.npcs,
    ...s.clues.map((c) => ({ key: `e-${c.key}` })),
    ...s.items,
  ];
  const keys = new Set(entities.map((e) => e.key));
  assert.equal(keys.size, entities.length, 'duplicate entity key');
  for (const e of entities) assert.match(e.key, /^[a-z][a-z0-9-]{0,47}$/);
  const locations = new Set(w.locations.map((l) => l.key));
  const npcs = new Set(cast.npcs.map((n) => n.key));
  const clues = new Set(s.clues.map((c) => c.key));
  const handouts = new Set(s.handouts.map((h) => h.key));
  assert.equal(clues.size, s.clues.length);
  assert.equal(handouts.size, s.handouts.length);
  assert.equal(new Set(sessions.map((x) => x.key)).size, sessions.length);
  assert.equal(new Set(s.encounters.map((x) => x.key)).size, s.encounters.length);
  assert(locations.has(w.startLocation));
  assert.equal(w.locations.filter((l) => l.parent === null).length, 1);
  assert.equal(w.locations.find((l) => l.parent === null)?.type, 'region');
  for (const l of w.locations) assert(l.parent === null || locations.has(l.parent));
  for (const n of cast.npcs) {
    assert(locations.has(n.location));
    assert(n.knows.length > 0 && n.secret.length > 30 && n.reveal.length > 30);
  }
  if (w.audience === '18+')
    for (const person of [...cast.heroes, ...cast.npcs])
      assert(person.age >= 18, `${person.key} must be 18+`);
  for (const archetype of ['fighter', 'rogue', 'cleric', 'wizard'])
    assert(cast.heroes.some((h) => h.archetype === archetype));
  const optional = new Set(cast.heroes.slice(w.minPlayers).map((h) => h.key));
  for (const c of s.clues) {
    assert.match(c.key, /^[a-z][a-z0-9-]{0,40}$/);
    assert(locations.has(c.location));
    assert(c.discovery.length > 30 && c.fallback.length > 30);
    for (const subject of c.subjects) assert(keys.has(subject) && !optional.has(subject));
  }
  for (const h of s.handouts) {
    assert.match(h.key, /^[a-z][a-z0-9-]{0,40}$/);
    assert(h.text.length > 30 && h.unlock.length > 20, `${h.key}: incomplete handout`);
  }
  assert.deepEqual(
    sessions.map((x) => x.number),
    sessions.map((_, index) => index + 1),
  );
  for (const x of sessions) {
    assert(locations.has(x.location), x.key);
    assert(
      x.scenes.length >= (w.engine ? 2 : 3) &&
        x.consequences.length >= 2 &&
        x.spotlight.length >= 3,
    );
    for (const ref of x.participants) assert(npcs.has(ref), `${x.key}: NPC ${ref}`);
    for (const ref of x.clues) assert(clues.has(ref), `${x.key}: clue ${ref}`);
    for (const ref of x.handouts) assert(handouts.has(ref), `${x.key}: handout ${ref}`);
    for (const scene of x.scenes) {
      assert(
        scene.play.length >= (w.engine ? 220 : 400),
        `${x.key}: underdeveloped scene ${scene.title}`,
      );
      assert(scene.choices.length >= 2 && scene.check.length > 30 && scene.failForward.length > 40);
      assert(scene.minutes > 0 && scene.minutes <= 120);
    }
  }
  for (const c of clues)
    assert(
      sessions.some((session) => session.clues.includes(c)),
      `${c}: unused clue`,
    );
  for (const h of handouts)
    assert(
      sessions.some((session) => session.handouts.includes(h)),
      `${h}: unused handout`,
    );
  for (let size = w.minPlayers; size <= 7; size++)
    assert.equal(w.scaling.filter((entry) => entry.players === size).length, 1);
  const core = new Set(cast.heroes.slice(0, w.minPlayers).map((h) => h.key));
  for (const item of s.items) {
    assert(
      (item.location === null) !== (item.holder === null),
      `${item.key}: exactly one of location or holder`,
    );
    if (item.location !== null) assert(locations.has(item.location), `${item.key}: location`);
    if (item.holder !== null)
      assert(core.has(item.holder), `${item.key}: holder must be a core hero`);
    assert(item.appears >= 1 && item.appears <= sessions.length, `${item.key}: appears`);
    assert(item.description.length > 30 && item.use.length > 20, `${item.key}: thin item`);
  }
  for (const e of s.encounters) {
    if (isKit(e)) {
      assert(LAYOUT_KEYS.includes(e.layout ?? ''), `${e.key}: unknown layout ${e.layout ?? ''}`);
      assert(e.foes?.length || e.boss, `${e.key}: no foes`);
      for (const foe of [...(e.foes ?? []), ...(e.boss ? [e.boss] : [])]) srdEntry(foe.srd);
    }
    assert(locations.has(e.location));
    if (!isKit(e)) assert.equal(e.foeCount, 3);
    assert(
      (e.mandatory === true || e.peaceful.length > 30) &&
        e.objective.length > 30 &&
        e.scaling.length > 30,
    );
  }
}
