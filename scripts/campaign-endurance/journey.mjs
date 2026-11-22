import assert from 'node:assert/strict';
import { join } from 'node:path';
import { kitEncounter } from '../campaign-shared/combat-kit.ts';
import { battle } from '../campaign-balance/battle.mjs';
import { seeded } from '../campaign-balance/arena.mjs';
import { scenes, read, shelfPath } from '../campaign-balance/scenes.mjs';
import { passBy, histories, finalKey } from './choices.mjs';
import {
  snapshot,
  stageNext,
  endFight,
  collectLoot,
  medicine,
  takeRest,
  ready,
  travel,
  kerraTrade,
  useDecision,
} from './resources.mjs';
import { expeditionDice, abilityRoll } from './visibility.mjs';
import { fieldObjective } from '../campaign-balance/field-objectives.mjs';
import { supplies } from './supplies.mjs';

function tableBook(slug) {
  const shelf = shelfPath(slug);
  return read(
    shelf
      ? join(shelf, 'source', 'table-routes.json')
      : join('scripts/campaign-rehearsal/builtins', slug + '.json'),
  );
}
function levels(slug) {
  if (!['moon-pearl', 'lighthouse', 'acorn-express'].includes(slug)) return new Map();
  return new Map(
    [1, 2, 3, 4]
      .flatMap((i) => read(join(shelfPath(slug), 'source', 'act-' + i + '.json')))
      .map((ch) => [ch.number, ch.level]),
  );
}
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
function compact({ party, stock }) {
  return {
    level: party.map((h) => h.level),
    hp: party.map((h) => h.hp),
    max: party.map((h) => h.max),
    slots: party.map((h) => h.slots),
    hd: party.map((h) => h.hd),
    sw: party.map((h) => h.sw),
    surge: party.map((h) => h.surge),
    dead: party.filter((h) => !h.alive).map((h) => h.seat),
    stock: Object.fromEntries(
      Object.entries(stock).map(([id, v]) => [id, [v.qty, v.charges ?? null, v.seat]]),
    ),
  };
}
export function play(slug, group, profile, seed, levelByChapter, route, book, observe = {}) {
  const first = group[0],
    schedule = [...group].sort((a, b) => route.chapters[a.key] - route.chapters[b.key]);
  assert.deepEqual(schedule.map((s) => s.key).sort(), Object.keys(route.chapters).sort(), slug);
  if (finalKey[slug]) assert.equal(schedule.at(-1).key, finalKey[slug]);
  let archivedRules = observe.restoreArchive === true;
  const story = supplies(slug, profile, first.party.length, archivedRules),
    steps = [];
  const last = book.chapters.at(-1).number,
    lastFight = Math.max(...Object.values(route.chapters)),
    who = [...first.party],
    taken = new Set();
  assert.ok(lastFight <= last);
  let state = first.state,
    lastNight = -Infinity,
    terminal = 'reached',
    special = null,
    previousOutcome = null;
  const chapters = [];
  const done = () => ready(state, who);
  const traceChoice = (n) => {
    const step = book.chapters[n - 1];
    assert.equal(step.number, n);
    chapters.push(n);
    if (!done() || histories[slug]) return;
    const seating = who.filter((id) => ready(state, [id]));
    const eventsHere = steps.filter((x) => x.ch === n && x.outcome);
    const failed = eventsHere.find(
      (x) =>
        x.key === book.defeat?.encounter && ['missed', 'defeat', 'withdrawn'].includes(x.outcome),
    );
    let decision = failed ? book.defeat.cost : step.choice;
    if (!archivedRules && slug === 'hollowmere' && n === last) {
      decision =
        {
          'prisoners-out': 'Вывели пленников через ризницу. Колокол продолжает звонить.',
          win: 'Утонувший колокол умолк. Судьбу оставшихся в склепе выясним отдельно.',
        }[previousOutcome] ?? 'В полночь деревенский колокол снова зазвонил.';
    }
    if (!archivedRules && slug === 'salt-widows' && previousOutcome === 'east-exit')
      decision = 'Оставили Вдовью черту Белорезу. Считаем тех, кто добрался до перевала.';
    const after = useDecision(
      state,
      {
        type: 'RecordMemory',
        memoryId: 'endurance-choice-' + n,
        scope: { kind: 'PARTY' },
        memoryKind: 'DECISION',
        summary: decision,
        occurredAt: state.clock,
        participants: seating,
      },
      null,
    );
    assert.ok(after, slug + '/chapter-' + n);
    state = after;
  };
  function pause(window, ch) {
    if (slug === 'marrow-crown' && !story.stores['запас глубины'])
      window = { ...window, kind: 'short' };
    const at = window.kind === 'long' ? Math.max(state.clock, lastNight + 86400) : state.clock;
    const events = [],
      entry = compact(snapshot(state, first));
    const dice = seeded([slug, first.variant, 'rest', window.key ?? ch, seed].join('/'));
    state = takeRest(state, who, window, at, dice, events);
    if (story.unpaid.size) {
      const sheets = new Map(state.characterSheets);
      for (const id of story.unpaid) {
        const sheet = sheets.get(id),
          hp = Math.min(sheet.hitPoints.current, Math.floor(sheet.hitPoints.max / 2));
        sheets.set(id, { ...sheet, hitPoints: { ...sheet.hitPoints, current: hp } });
        events.push({ kind: 'unpaid-dressing', hero: id, hp });
      }
      state = { ...state, characterSheets: sheets };
      story.unpaid.clear();
    }
    if (window.kind === 'long') lastNight = at;
    steps.push({
      ch,
      rest: window.kind,
      entry,
      exit: compact(snapshot(state, first)),
      events,
      dice: sum(Object.values(dice.counts)),
    });
  }
  for (let ch = 1; ch <= last; ch++) {
    story.chapter(ch, false);
    for (const template of schedule.filter((s) => route.chapters[s.key] === ch)) {
      const { key } = template;
      const skip = passBy(slug, profile, key);
      if (skip) {
        steps.push({ key, ch, skip });
        story.afterFight(key, 'bypass');
        continue;
      }
      const s = stageNext(
        template,
        state,
        (slug === 'hollowmere' && key === 'marsh-lights' ? 3 : template.level) ||
          levelByChapter.get(ch),
        taken,
      );
      state = s.state;
      if (!ready(state, who)) {
        steps.push({ key, ch, stop: 'no-conscious-hero', entry: compact(snapshot(state, first)) });
        terminal = 'stopped';
        break;
      }
      story.beforeFight(key);
      s.stores = story.stores;
      s.commandDice = expeditionDice;
      s.abilityRoll = abilityRoll;
      s.fieldObjective = route.fieldCards?.includes(key) ? fieldObjective : null;
      const entry = snapshot(state, first);
      if (key === finalKey[slug]) {
        special = {
          edition: first.variant,
          profile,
          seed,
          key,
          entry,
          stores: { ...story.stores },
          ...(taken.size
            ? { taken: first.party.flatMap((id, i) => (taken.has(id) ? [first.heroKeys[i]] : [])) }
            : {}),
          previous: steps
            .filter((x) => x.outcome || x.skip)
            .map((x) => [x.key, x.outcome ?? 'bypass']),
        };
        steps.push({ key, ch, special: true, entry: compact(entry) });
        break;
      }
      const options = observe.encounter?.(s, entry, steps);
      if (options?.resumeCurrentRules && archivedRules) {
        archivedRules = false;
        story.resume(key);
      }
      s.trackCryptExit = !archivedRules;
      s.recordEnding = !archivedRules;
      const events = [],
        roll = battle(s, [slug, first.variant, key, seed].join('/'), {
          beforePartyTurn: (a, id) => medicine(a, id, events),
          ...options,
        });
      assert.notEqual(roll.outcome, 'limit', slug + '/' + key);
      observe.afterBattle?.(s, roll);
      state = endFight(
        roll.arena,
        events,
        ready(roll.arena.state, who),
        archivedRules ? null : roll.outcome,
      );
      for (const id of roll.arena.objectiveDetails?.taken ?? []) {
        taken.add(id);
        const seat = who.indexOf(id);
        if (seat >= 0) who.splice(seat, 1);
      }
      observe.afterCare?.(s, roll.arena);
      if (roll.outcome === 'prisoners-out' || roll.outcome === 'east-exit') {
        const details = roll.arena.objectiveDetails;
        const bell = roll.outcome === 'prisoners-out';
        const ids = bell ? [details.escort, ...details.escorted] : details.eastExit;
        const locationId = bell ? 'hollowmere' : s.ids['dry-return'];
        for (const entityId of ids) {
          const next = useDecision(state, { type: 'PlaceEntity', entityId, locationId }, null);
          assert.ok(next, 'The survivor must be able to reach the recorded exit');
          state = next;
          events.push({ kind: 'arrived', entityId, locationId });
        }
      }
      if (roll.outcome === 'parley') state = kerraTrade(state, s, roll.arena.dice, events);
      state = collectLoot(
        state,
        taken.size ? { ...s, party: s.party.filter((id) => !taken.has(id)) } : s,
        roll.arena.dice,
        events,
      );
      state = { ...state, clock: state.clock + roll.round * 6 };
      story.afterFight(key, roll.outcome, {
        ...roll.arena.objectiveDetails,
        hurt: [...roll.arena.down],
      });
      const exit = compact(snapshot(state, first));
      assert.ok(
        exit.hp.every((n, i) => n >= 0 && n <= exit.max[i]) &&
          exit.slots.flat().every((x) => x >= 0),
      );
      steps.push({
        key,
        ch,
        outcome: roll.outcome,
        round: roll.round,
        entry: compact(entry),
        exit,
        down: roll.down,
        stores: { ...story.stores },
        details: roll.arena.objectiveDetails,
        dice: sum(Object.values(roll.dice)),
        events,
      });
      previousOutcome = roll.outcome;
      if (slug === 'hollowmere' && key === 'willow-ford-ambush' && ready(state, who)) {
        const events = [],
          entry = compact(snapshot(state, first)),
          dice = seeded([slug, first.variant, 'wagon', seed].join('/'));
        state = travel(state, who, 5, dice, events);
        steps.push({
          ch,
          travel: 5,
          entry,
          exit: compact(snapshot(state, first)),
          events,
          dice: sum(Object.values(dice.counts)),
        });
      }
      for (const window of route.rests.filter((w) => w.key === key)) pause(window, ch);
    }
    if (terminal === 'stopped') break;
    traceChoice(ch);
    if (special) {
      assert.equal(ch, lastFight);
      break;
    }
    if (ch >= lastFight && !done()) break;
    story.chapter(ch, true);
    if (ch >= lastFight) continue;
    for (const window of route.rests.filter(
      (r) => !r.key && r.after === ch && (!r.history || r.history === profile),
    ))
      pause(window, ch);
  }
  const ending = special
    ? 'special'
    : terminal === 'stopped'
      ? 'no-party-before-final'
      : !done()
        ? 'party-down-at-last-fight'
        : previousOutcome === 'prisoners-out' || previousOutcome === 'east-exit'
          ? previousOutcome
          : slug === 'hollowmere' && previousOutcome === 'win'
            ? 'bell-silenced'
            : previousOutcome === 'pursuit'
              ? 'pursuit-six-minutes'
              : 'table-decision';
  observe.finish?.(state, first, story);
  return {
    edition: first.variant,
    profile,
    seed,
    steps,
    chapters,
    ending,
    terminal,
    previousOutcome,
    story: story.events,
    special,
  };
}
export async function loadJourney(slug, route, edition) {
  const variants = new Map(),
    levelByChapter = levels(slug),
    book = tableBook(slug);
  for await (const s of scenes(slug)) {
    if (edition && s.variant !== edition) continue;
    const reverse = new Map(Object.entries(s.ids ?? {}).map(([k, v]) => [v, k]));
    s.heroKeys = s.party.map((id) => reverse.get(id) ?? id);
    if (route.priorFormation === s.key) {
      const old = kitEncounter({ ...s.source, formation: undefined }, s.heroKeys);
      const foes = old.combatants.filter((c) => c.side === 'hostile');
      let index = 0;
      s.start = {
        ...s.start,
        combatants: s.start.combatants.map((c) =>
          c.side !== 'hostile' ? c : { ...c, position: foes[index++].position },
        ),
      };
    }
    if (!variants.has(s.variant)) variants.set(s.variant, []);
    variants.get(s.variant).push(s);
  }
  assert.ok(variants.size, slug);
  return { variants, levelByChapter, book };
}
