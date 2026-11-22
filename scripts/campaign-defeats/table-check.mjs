// Isolated publication checks; every branch opens its own empty playable table.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { shelfPath } from '../campaign-balance/scenes.mjs';
import { table } from '../campaign-rehearsal/table.mjs';
import {
  openEvening,
  closeEvening,
  remember,
  say,
  finish,
} from '../campaign-rehearsal/actions.mjs';

const directory = process.argv[2];
const rows = gunzipSync(readFileSync(join(directory, 'replays.jsonl.gz')))
  .toString()
  .trim()
  .split('\n')
  .map((s) => JSON.parse(s));
const policies = ['original', 'control', 'pressure', 'alternative'];
const shelfNotes = {
  'niche-guards': [4, 'hour-of-the-crypt-scene-2-aftermath', 'живых в склепе'],
  'radan-in-brine': [7, 'the-trail-behind-scene-2-aftermath', 'на западной полке'],
  'widows-line-hunt': [8, 'ending-3-outcome', 'Оксинья пересчитывает имена у пустой бочки'],
  'fissure-spinners': [7, 'noon-in-the-crack-scene-2-aftermath', 'Стась ждёт у щели'],
};
const native = {
  'sunken-bell': 'имена пропавших',
  'cellar-rats': 'воротом у люка',
  'sunken-mill': 'у люка и уводит лодки',
  'drowned-chapel': 'перегораживает гать',
  'marsh-lights': 'чёрную ленту',
  'flooded-stair': 'упыри уходят под воду',
};
const choices = {
  'cellar-rats': 'Иду с Ильзе к часовне.',
  'drowned-chapel': 'Срисую надпись. Сначала предупредим деревню.',
  'sunken-mill': 'Отвезу книгу Ильзе.',
  'marsh-lights': 'Закроем переправу до рассвета.',
  'flooded-stair': 'Выйду через ризницу.',
  'radan-in-brine': 'Поворачиваем к Порогу.',
  'fissure-spinners': 'Кричу Стасю, чтобы передал Даре весть. Мы остаёмся у щели.',
};
function safeLine(j) {
  // The village hears the bell. The prisoners' private fate stays with the GM.
  return j.after.line.replace(' Живые остались в плену.', '');
}
async function check(r, policy) {
  const j = r[policy],
    f = await table(r.slug, r.edition);
  try {
    const seats = f.seats.filter((s) => j.entry.party.some((h) => s.name === h.name));
    assert.equal(seats.length, j.entry.party.length);
    const guide = (await f.request('/knowledge?perspective=DM')).knowledge;
    const texts = [];
    for (const key of new Set([r.pivot, j.after.key])) {
      if (native[key]) {
        const note = guide.find((v) => v.statement.includes(native[key]));
        assert.ok(note, key + ' missing from DM knowledge');
        texts.push(note.statement);
      } else if (shelfNotes[key]) {
        const [session, identity, words] = shelfNotes[key];
        const note = f.content.knowledge.find((v) => v.key === identity);
        assert.ok(note?.scope.kind === 'DM' && note.statement.includes(words));
        assert.ok(guide.some((v) => v.statement === note.statement));
        const dir = shelfPath(r.slug);
        const offline = key === 'widows-line-hunt' ? 'index.html' : 'session-' + session + '.html';
        assert.ok(
          readFileSync(join(dir, offline), 'utf8').includes(words),
          key + ' missing from offline book',
        );
        texts.push(note.statement);
        if (key === 'widows-line-hunt') {
          const retreat = f.content.knowledge.find(
            (n) => n.key === 'on-the-widows-line-scene-2-aftermath',
          );
          assert.ok(
            retreat?.scope.kind === 'DM' && retreat.statement.includes('покажите восточный край'),
          );
          assert.ok(guide.some((n) => n.statement === retreat.statement));
          assert.ok(
            readFileSync(join(dir, 'session-8.html'), 'utf8').includes('покажите восточный край'),
          );
          texts.push(retreat.statement);
        }
      }
    }
    assert.ok(texts.length);
    const opening = (await f.request('/knowledge?perspective=PLAYER', undefined, seats[0].token))
      .knowledge;
    assert.ok(texts.every((note) => !opening.some((x) => x.statement === note)));
    const line = safeLine(j);
    await openEvening(f, 'После решающей сцены');
    const speakers = [];
    if (j.after.kind === 'scene') {
      const awake = j.after.fate.find((h) => h.status !== 'dead');
      const seat = seats.find((s) => s.name === awake.name);
      assert.ok(seat && choices[j.after.key]);
      await closeEvening(f);
      await openEvening(f, j.after.next, 2);
      await say(f, seat, 'Наше решение', choices[j.after.key]);
      await remember(f, 'DECISION', choices[j.after.key], [seat.id]);
      speakers.push(seat.id);
    }
    await remember(f, 'CONSEQUENCE', line, speakers);
    const recall = await f.request(
      '/memories?perspective=PARTY&limit=50',
      undefined,
      seats[0].token,
    );
    assert.ok(recall.memories.some((v) => v.memory.summary === line));
    await finish(f, line);
    return {
      policy,
      ending: line,
      playerSeats: seats.length,
      privateNotes: texts.length,
      ...(speakers.length ? { nextSession: j.after.next, decision: choices[j.after.key] } : {}),
    };
  } finally {
    await f.close();
  }
}
const checked = [];
for (const r of rows) {
  const views = [];
  for (const policy of r.followup ? [...policies, 'followup'] : policies)
    views.push(await check(r, policy));
  checked.push({ slug: r.slug, edition: r.edition, profile: r.profile, seed: r.seed, views });
}
writeFileSync(join(directory, 'tables.json'), JSON.stringify(checked) + '\n');
const count = checked.reduce((n, r) => n + r.views.length, 0);
process.stdout.write(`${count} isolated endings read back by the players\n`);
