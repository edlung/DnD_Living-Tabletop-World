import { showMira } from './early-pages.mjs';
import assert from 'node:assert/strict';
import { table } from './table.mjs';
import {
  openEvening,
  say,
  remember,
  move,
  investigate,
  lostEncounter,
  closeEvening,
  finish,
} from './actions.mjs';

async function chapter(f, book, index, log) {
  const c = book.chapters[index],
    step = book.profile.chapters[index],
    speaker = f.seats[index % f.seats.length];
  await openEvening(f, c.title, c.number);
  const site = f.ids[c.location];
  assert.ok(site, book.slug + ' ' + c.location);
  await move(f, speaker, site);
  if (index > 0) {
    const previous = book.profile.chapters[index - 1];
    const recalled = await f.request(
      '/memories?perspective=PLAYER&limit=50',
      undefined,
      speaker.token,
    );
    assert.ok(
      recalled.memories.some((m) => m.memory.summary === previous.choice + ' ' + previous.result),
      'previous chapter inaccessible',
    );
  }
  await say(f, speaker, c.title, step.choice);
  if (book.slug === 'ravenford')
    log.evidence = await investigate(f, book.profile.discovery.clues, speaker);
  if (book.slug === 'ravenford') await showMira(f, log.evidence);
  if (book.slug === 'hollowmere') {
    if (index === 0)
      await f.cmd({ type: 'PlaceEntity', entityId: 'brisk-cargo', locationId: site });
    if (index === 2) log.evidence = await investigate(f, ['clue-ledger'], speaker);
    if (index === 3) {
      const home = (await f.state()).entities.get('sister-ilse').placement.locationId;
      await move(f, speaker, home);
      await f.cmd({ type: 'PlaceEntity', entityId: 'old-matthis', locationId: home });
    }
  }
  await remember(f, 'CONSEQUENCE', step.choice + ' ' + step.result, [speaker.id]);
  log.scenes.push({
    chapter: c.number,
    title: c.title,
    player: speaker.name,
    choice: step.choice,
    result: step.result,
  });
}
async function doRoute(f, book, route) {
  const p = book.profile,
    [lead, second] = f.seats,
    log = { route, scenes: [] };
  const initial = await f.state();
  let closing;
  if (f.content)
    assert.ok(
      f.content.laterOutline.some((line) => line.includes(p.discovery.inference)),
      'incomplete edition: rebuild library',
    );
  const opening = await f.request('/knowledge?perspective=PLAYER', undefined, lead.token);
  assert.ok(
    !opening.knowledge.some((k) => k.statement === p.discovery.inference),
    'spoiler in opening',
  );
  if (route === 'normal') {
    for (let i = 0; i < book.chapters.length; i++) {
      await chapter(f, book, i, log);
      if (i < book.chapters.length - 1) await closeEvening(f);
    }
    closing = p.chapters.at(-1).result + ' ' + p.decision;
  } else if (route === 'defeat') {
    const { chapter: at = 1, encounter, cost, ending } = p.defeat;
    for (let i = 0; i < at - 1; i++) {
      await chapter(f, book, i, log);
      await closeEvening(f);
    }
    await openEvening(f, book.chapters[at - 1].title, at);
    const battle = f.content?.encounters.find((e) => e.key === encounter);
    await say(
      f,
      lead,
      'Столкновение',
      'Принимаем встречу. Если проиграем, оставим противнику цель на поле.',
    );
    const injury = !f.content ? 'down' : book.profile.defeat.stakes;
    assert.ok(['down', 'wound', 'objective'].includes(injury));
    log.fight = await lostEncounter(f, battle?.title, injury);
    await remember(f, 'CONSEQUENCE', cost, [lead.id]);
    if (book.slug === 'hollowmere')
      await f.cmd({ type: 'PlaceEntity', entityId: 'brisk-cargo', locationId: 'willow-ford' });
    log.scenes.push({
      chapter: at,
      title: log.fight.battle,
      player: second.name,
      choice:
        injury === 'objective'
          ? 'Уступаем площадку, признаём потерю цели встречи.'
          : 'Уступаем поле и выводим раненых.',
      result: cost,
    });
    closing = ending;
  } else {
    const at = route === 'discovery' ? p.discovery.chapter : 1;
    for (let i = 0; i < at - 1; i++) {
      await chapter(f, book, i, log);
      await closeEvening(f);
    }
    await openEvening(f, book.chapters[at - 1].title, at);
    const plot = p[route],
      s = route === 'refusal' ? second : lead;
    await say(f, s, book.chapters[0].title, plot.choice);
    await remember(f, 'DECISION', plot.choice, [s.id]);
    if (route === 'discovery') {
      log.evidence = await investigate(f, plot.clues, s);
      // Decision belongs to another actual player, after the witnesses have spoken at the table.
      const meeting = (await f.state()).entities.get(s.id).placement.locationId;
      const speakers = f.seats.filter(
        (seat) =>
          seat === s || seat === second || log.evidence.some((c) => c.witness === seat.name),
      );
      for (const seat of speakers) await move(f, seat, meeting);
      await remember(
        f,
        'CONVERSATION',
        log.evidence.map((c) => c.witness + ' сообщает: ' + c.statement).join(' '),
        speakers.map((seat) => seat.id),
        meeting,
      );
      await f.cmd(
        {
          type: 'FormHypothesis',
          characterId: second.id,
          scope: 'PARTY',
          statement: plot.inference,
        },
        second,
      );
    } else {
      assert.equal((await f.state()).encounter, initial.encounter);
    }
    if (route === 'discovery') log.inference = plot.inference;
    log.scenes.push({
      chapter: at,
      title: book.chapters[at - 1].title,
      player: s.name,
      choice: plot.choice,
      result:
        route === 'discovery'
          ? plot.inference
          : 'Группа отказалась от поручения и назвала собственную цель.',
    });
    closing = plot.ending;
  }
  if (route !== 'normal') {
    const follow = p[route].followup,
      target = f.ids[follow.location];
    assert.ok(target, book.slug + ' ' + follow.location);
    const leadIn = (await f.state()).activeSessionId;
    await closeEvening(f);
    const session = await openEvening(f, 'Что произошло дальше', book.chapters.length + 1);
    assert.notEqual(leadIn, session);
    const seat = f.seats[2] ?? second;
    await move(f, seat, target);
    const prior = route === 'defeat' ? p.defeat.cost : p[route].choice;
    const recalled = await f.request(
      '/memories?perspective=PLAYER&limit=50',
      undefined,
      seat.token,
    );
    assert.ok(
      recalled.memories.some((m) => m.memory.summary === prior),
      'earlier decision missing at the new table',
    );
    const s = await f.state();
    assert.equal(s.entities.get(seat.id).placement.locationId, target);
    const view = await f.request('/surroundings?perspective=PLAYER', undefined, seat.token);
    assert.ok(JSON.stringify(view).includes(target), 'follow-up location hidden from player');
    if (book.slug === 'ravenford' && route === 'discovery') await showMira(f, log.evidence);
    await say(f, seat, 'Наш следующий ход', follow.choice);
    await remember(f, 'DECISION', follow.choice, [seat.id]);
    if (route === 'defeat') {
      const hero = s.characterSheets.get(lead.id);
      assert.equal(hero.hitPoints.current, log.fight.hpAfter);
      if (book.slug === 'hollowmere')
        assert.equal(s.entities.get('brisk-cargo').placement.locationId, 'willow-ford');
    }
    log.followup = {
      place: s.entities.get(target).name,
      player: seat.name,
      choice: follow.choice,
      result: closing,
    };
  }
  await remember(f, 'CONSEQUENCE', closing, [lead.id, second.id]);
  const state = await f.state();
  assert.ok(
    [...state.memories.values()].some((m) => m.summary === closing),
    'missing party memory',
  );
  log.ending = await finish(f, closing);
  log.seatsConfirmed = f.seats.length;
  log.worldEvents = (await f.state()).version - initial.version;
  return log;
}
export async function rehearse(book, route) {
  const f = await table(book.slug);
  try {
    return await doRoute(f, book, route);
  } finally {
    await f.close();
  }
}
