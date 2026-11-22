import assert from 'node:assert/strict';
import { rollDeathSave } from '../../packages/rules/src/combat.ts';
import { seeded } from '../campaign-balance/arena.mjs';
import { near, walk, standing } from '../campaign-balance/tactics.mjs';

// Finish only the portion of the sixth round which the archived fight did not play.
export function remainingCryptTurns(original, roster) {
  const a = Object.assign(Object.create(Object.getPrototypeOf(original)), original, {
    state: original.state,
    scene: { ...original.scene, observeCommand: undefined, observeDie: undefined },
    stats: { ...original.stats },
    down: new Set(original.down),
    dice: original.dice.fork(),
    disengagedFoes: true,
  });
  const exits = new Set(),
    turns = [];
  let spent = true;
  while (a.board && a.board.round <= 6) {
    const id = a.current.entityId,
      round = a.board.round,
      slot = a.scene.party.indexOf(id);
    if (!spent && slot >= 0 && standing(a, id) && !exits.has(id)) {
      const p = { x: 0, y: a.record(id).position.y };
      walk(a, id, p);
      if (
        !near(a, id, p, 0) &&
        a.act({ type: 'TakeAction', combatantId: id, action: 'dash' }, false)
      )
        walk(a, id, p);
      if (near(a, id, p, 0)) exits.add(id);
    }
    turns.push([round, id, slot >= 0 ? a.hp(id) : null]);
    spent = false;
    if (!a.board || (a.board.round === 6 && a.board.currentIndex === a.board.combatants.length - 1))
      break;
    a.act({ type: 'EndTurn', combatantId: id });
    assert.ok(turns.length < 180);
  }
  return {
    exits: [...exits],
    taken: a.scene.party.filter(
      (k) => !exits.has(k) && a.state.entities.get(k).status === 'active',
    ),
    dead: a.scene.party.filter((k) => a.state.entities.get(k).status !== 'active'),
    turns,
    dice: a.dice.counts,
    entry: roster(a.state),
  };
}

const rulings = {
  'cellar-rats': [
    'Хобб заколотил погреб. Соль разделили по горсти.',
    'Хобб поднял раненых воротом. Выжившие отдали деревне оставшуюся соль и показали Ильзе дорогу к часовне.',
    'Затонувшая часовня',
  ],
  'drowned-chapel': [
    'Ильзе перегородила гать пустой лодкой.',
    'На малой воде Ильзе сняла выживших у западных мостков. Они срисовали надпись и вернулись предупредить деревню.',
    'Лодка у паперти, затем Туманная топь',
  ],
  'marsh-lights': [
    'Ильзе повязала чёрную ленту на последний шест. Ночью деревня снова услышала звон.',
    'Ильзе привезла выживших длинным протоком. Они решили закрыть переправу до следующего рассвета.',
    'Мельница после возвращения длинным протоком',
  ],
  'sunken-mill': [
    'Лодки ушли с грузом. Деревня так и не получила имён из книги.',
    'Когда лодки ушли, выжившие освободились у люка, прочли книгу и отнесли имена Ильзе.',
    'Служебный спуск или деревня с именами перевозчиков',
  ],
  'flooded-stair': [
    'После полуночного звона Ильзе заперла часовню.',
    'На рассвете упыри ушли под воду. Выжившие вышли через ризницу. Последняя лодка ушла.',
    'Служебная дверь или возвращение к часовне',
  ],
  'sunken-bell': [
    'В полночь колокол зазвонил снова. Ильзе написала на двери часовни имена пропавших.',
    'В полночь колокол зазвонил снова. Ильзе написала на двери часовни имена пропавших. Живые остались в плену.',
    'Сделка с тюремщиками в следующую встречу',
  ],
  'radan-in-brine': [
    'У пустой бочки в Пороге Оксинья пересчитала имена. Вдовья черта осталась зверю.',
    'Отлив оставил выживших на западной полке. Они повернули к Порогу без добычи.',
    'Возвращение в Порог или подход к Черте',
  ],
  'widows-line-hunt': [
    'Охотники стали добычей. В Пороге Оксинья пересчитала имена у пустой бочки.',
    'Охотники стали добычей. Белорез оставил черту за собой. После отлива уцелевшие добрались к Сухому перевалу.',
    'Сухой перевал',
  ],
  'fissure-spinners': [
    'Стась рассказал Даре об оборванной верёвке. На рассвете шов сошёлся.',
    'Стась услышал голоса у щели и передал Даре весть. Выжившие отказались от последнего спуска. На рассвете шов сошёлся.',
    'У щели можно послать весть Даре или идти к шву',
  ],
};
function settle(party, seed) {
  const dice = seeded(seed),
    tosses = [];
  // Interleave one death save per dying hero per round. No new healing,
  // rest or resurrection. A previously stable hero never rolls again.
  const fate = party.map((h) => ({
    seat: h.seat,
    key: h.key,
    name: h.name,
    hp: h.hp,
    status: !h.alive ? 'dead' : h.hp > 0 ? 'up' : h.death?.successes === 3 ? 'stable' : 'dying',
    saves: h.death ?? { successes: 0, failures: 0 },
  }));
  for (let round = 1; fate.some((h) => h.status === 'dying'); round++) {
    assert.ok(round <= 5);
    for (const h of fate.filter((h) => h.status === 'dying')) {
      const r = rollDeathSave(dice, h.saves);
      tosses.push([round, h.seat, r.roll, r.outcome]);
      h.saves = r.saves;
      if (['dead', 'stable', 'revived'].includes(r.outcome)) h.status = r.outcome;
      if (r.outcome === 'revived') h.hp = 1;
    }
  }
  for (const h of fate)
    if (h.status === 'stable') {
      h.hours = dice.roll(4);
      h.hp = 1;
    }
  return { fate, tosses };
}

export function resolveAftermath(row, j, first) {
  const last = j.run.steps.filter((s) => s.outcome).at(-1),
    key = last.key;
  const { ending } = j.run;
  if (j.special) return { kind: 'stairs', line: 'Лестница Счёта', key };
  const stopped = ['no-party-before-final', 'party-down-at-last-fight'].includes(ending);
  if (stopped && key === 'niche-guards') {
    const detail = j.clock ?? last.details;
    assert.ok(detail && j.run.steps.some((s) => s.key === 'garden-glass' && s.stop));
    const g = (ids) => ids.map((id) => first.party.indexOf(id) + 1);
    return {
      kind: 'guests',
      key,
      taken: g(detail.taken),
      exited: g(detail.exits ?? detail.escaped),
      dead: detail.dead ? g(detail.dead) : j.final.party.filter((h) => !h.alive).map((h) => h.seat),
      line: 'В 03:30 живые, оставшиеся за порогом, попали в Хор. Гости у люка решают, идти ли к лестнице.',
    };
  }
  if (!stopped && !['east-exit', 'prisoners-out'].includes(ending)) {
    const line =
      ending === 'bell-silenced'
        ? 'Колокол умолк.'
        : row.slug === 'marrow-crown'
          ? last.details?.bowlBroken
            ? 'Чаша разбита.'
            : last.details?.nestFell
              ? 'Венец в живой кости.'
              : 'Шов сошёлся.'
          : row.slug === 'salt-widows'
            ? last.outcome === 'win'
              ? 'Шов лопнул.'
              : last.outcome === 'partial'
                ? 'Гарпуны в шве.'
                : 'Охотники стали добычей.'
            : ending;
    return { kind: 'ending', key, line };
  }
  const { fate, tosses } = settle(
    j.final.party,
    [row.slug, row.edition, row.profile, row.seed, key, 'aftermath'].join('/'),
  );
  const live = fate.filter((h) => h.status !== 'dead');
  if (ending === 'prisoners-out') {
    const escort = first.party.indexOf(last.details.escort) + 1;
    return {
      kind: 'ending',
      key,
      line: 'Пленники вышли через ризницу. В деревне слышен колокол.',
      escort,
      held: live.filter((h) => h.seat !== escort).map((h) => h.seat),
      fate,
      tosses,
    };
  }
  const rule = rulings[key];
  assert.ok(rule, 'missing defeat continuation: ' + key);
  const line =
    key === 'cellar-rats' && last.outcome === 'win' && live.length
      ? 'Бочка закрыла лаз. Хобб поднял раненых воротом. Выжившие вместе с Ильзе отправились к часовне.'
      : rule[live.length ? 1 : 0];
  return {
    kind:
      stopped &&
      row.run.ending === 'no-party-before-final' &&
      live.length &&
      !['widows-line-hunt', 'sunken-bell'].includes(key)
        ? 'scene'
        : 'ending',
    key,
    line,
    next: live.length ? rule[2] : null,
    fate,
    tosses,
    ...(ending === 'east-exit'
      ? { crossed: last.details.eastExit.map((id) => first.party.indexOf(id) + 1) }
      : {}),
  };
}
