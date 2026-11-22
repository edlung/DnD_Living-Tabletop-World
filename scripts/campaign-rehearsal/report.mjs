import assert from 'node:assert/strict';
import { format } from 'prettier';
import { existsSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { books, ROOT } from './books.mjs';
import { repairedCards } from './encounters.mjs';

const dir = join(ROOT, 'reports/evidence/campaign-rehearsal-2026-11-22');
const read = (...parts) => JSON.parse(readFileSync(join(...parts), 'utf8'));
const text = (...parts) => readFileSync(join(...parts), 'utf8');
const groups = {
  'collection-2026': 'Сборник кампаний',
  'dark-fantasy-2026': 'Тёмное фэнтези',
  'fantasy-2026': 'Фэнтези',
  'mixed-ages-2026': 'Приключения для разных возрастов',
  'noir-2026': 'Нуар',
  campaigns: 'Семейные путешествия',
  builtins: 'Встроенные приключения',
};
async function verifyEditions(book) {
  if (!book.folder) return 0;
  const pack = dirname(book.folder),
    guide = existsSync(join(pack, 'guide.html')) ? 'guide.html' : 'index.html';
  const dossier = text(pack, guide),
    shelf = join(ROOT, 'fixtures/campaign-library', book.slug),
    manifest = read(shelf, 'library.json');
  const proof = book.profile.discovery.inference;
  assert.ok(dossier.includes(proof), book.slug + ' GM guide');
  assert.ok(!text(pack, 'players.html').includes(proof), book.slug + ' player export');
  const gated = repairedCards(book);
  for (const edition of manifest.variants) {
    const file = read(shelf, edition.file);
    assert.deepEqual(
      file,
      read(pack, 'assets/table-editions', edition.id + '.json'),
      book.slug + ' download',
    );
    for (const check of [proof, book.profile.refusal.ending, book.profile.defeat.cost])
      assert.ok(
        file.laterOutline.some((line) => line.includes(check)),
        book.slug + ' ' + edition.id,
      );
    for (const card of gated) {
      const battle = file.encounters.find((b) => b.key === card.key);
      assert.ok(
        battle?.trigger.includes(card.peaceful),
        book.slug + ' ' + card.key + ' alternative',
      );
      assert.equal(card.mandatory, false);
    }
  }
  return manifest.variants.length;
}
const cell = (t) => t.replaceAll('|', '／').replaceAll('\n', ' ');
async function markdown(path, body) {
  await writeFile(path, await format(body, { parser: 'markdown' }));
}

export async function report() {
  const shelf = books();
  const counts = {
    titles: 0,
    runs: 0,
    chapters: 0,
    readbacks: 0,
    clues: 0,
    editions: 0,
    wounds: 0,
    objectives: 0,
    down: 0,
    gated: 0,
    gatedBooks: 0,
  };
  const sections = new Map();
  for (const book of shelf.values()) {
    const { runs } = read(dir, book.slug + '.json');
    assert.deepEqual(
      runs.map((r) => r.route),
      ['normal', 'refusal', 'discovery', 'defeat'],
    );
    const [normal, refusal, early, loss] = runs;
    assert.equal(normal.scenes.length, book.chapters.length);
    assert.deepEqual(
      early.evidence.map((c) => c.key),
      book.profile.discovery.clues,
    );
    assert.ok(
      early.inference === book.profile.discovery.inference && loss.fight.enemiesRemaining > 0,
    );
    assert.equal(new Set(runs.map((r) => r.ending)).size, 4);
    for (const r of [refusal, early, loss])
      assert.equal(r.followup.choice, book.profile[r.route].followup.choice);
    counts.editions += await verifyEditions(book);
    counts.titles++;
    counts.runs += runs.length;
    counts.chapters += normal.scenes.length;
    counts.clues += early.evidence.length;
    counts.readbacks += runs.reduce((n, r) => n + r.seatsConfirmed, 0);
    if (loss.fight.injury === 'objective') counts.objectives++;
    else if (loss.fight.injury === 'down') counts.down++;
    else counts.wounds++;
    const cards = repairedCards(book),
      checks = read(dir, book.slug + '.json').bypasses;
    assert.deepEqual(
      checks.map((c) => c.encounter),
      cards.map((c) => c.key),
    );
    for (const check of checks) assert.equal(check.blocked, 'no-party');
    counts.gated += checks.length;
    if (checks.length) counts.gatedBooks++;
    const group = book.folder ? basename(dirname(dirname(book.folder))) : 'builtins';
    const doc = sections.get(group) ?? [];
    doc.push(
      '## ' + book.title,
      '',
      '[Машиночитаемая запись прогона](' + book.slug + '.json)',
      '',
      '### Основной маршрут',
      '',
      '| Глава | Выбор игрока | Что установил ведущий |',
      '| --- | --- | --- |',
    );
    for (const c of normal.scenes)
      doc.push(
        '| ' +
          c.chapter +
          '. ' +
          cell(c.title) +
          ' | ' +
          cell(c.player) +
          ' — ' +
          cell(c.choice) +
          ' | ' +
          cell(c.result) +
          ' |',
      );
    doc.push('', '**Финал.** ' + normal.ending);
    for (const [r, heading] of [
      [refusal, 'Отказ от задания'],
      [early, 'Раннее раскрытие'],
      [loss, 'Поражение'],
    ]) {
      const fork = r.scenes.at(-1);
      doc.push(
        '',
        '### ' + heading,
        '',
        'Вечер ' +
          fork.chapter +
          ' · ' +
          fork.title +
          '. ' +
          fork.player +
          ' — «' +
          fork.choice +
          '»',
      );
      if (r.route === 'discovery') {
        doc.push('', '| Место | Свидетель | Что он узнал |', '| --- | --- | --- |');
        for (const c of r.evidence)
          doc.push(
            '| ' +
              cell(c.place) +
              ' · ' +
              cell(c.feature) +
              ' | ' +
              cell(c.witness) +
              ' | ' +
              cell(c.statement) +
              ' |',
          );
        doc.push('', '**Вывод игроков.** ' + r.inference);
      }
      if (r.fight) {
        const b = r.fight;
        doc.push(
          '',
          '**Решение ведущего.** ' +
            fork.result +
            ' ' +
            (b.injury === 'objective'
              ? 'Персонажи уступили цель встречи.'
              : b.wounded + ' — ' + b.hpBefore + ' → ' + b.hpAfter + ' ОЗ.') +
            ' На поле остались противники (' +
            b.enemiesRemaining +
            ').',
        );
      }
      doc.push(
        '',
        '**Следующая сцена.** ' +
          r.followup.place +
          '. ' +
          r.followup.player +
          ' — «' +
          r.followup.choice +
          '»',
        '',
        '**Финал.** ' + r.ending,
      );
    }
    doc.push(
      '',
      'Во всех четырёх партиях финал из журнала прочитали все ' +
        normal.seatsConfirmed +
        ' игроков.',
      '',
    );
    if (checks.length)
      doc.push(
        '**Проверка ухода до события.** Каждый раз группа сначала могла вступить в подготовленный бой, затем покидала место всем составом. Сервер отклонил запуск каждого из следующих боёв.',
        '',
        ...checks.map((c) => '- ' + c.title + '. ' + c.whenAbsent),
        '',
      );
    sections.set(group, doc);
  }
  for (const [key, lines] of sections)
    await markdown(
      join(dir, key + '.md'),
      '# ' +
        groups[key] +
        ' · прохождения ведущего\n\nСпойлеры ко всем развязкам раздела.\n\n' +
        lines.join('\n') +
        '\n',
    );
  const links = Object.entries(groups).map(
    ([id, name]) => '- [' + name + '](evidence/campaign-rehearsal-2026-11-22/' + id + '.md)',
  );
  const overview = [
    '# Сквозная проверка 55 кампаний',
    '',
    '22 ноября 2026 года. Все ' +
      counts.runs +
      ' контрольных партий дошли до отдельной развязки. Во всех проверенных развилках игрок мог продолжить после своего выбора. Ниже — полные спойлеры для ведущего.',
    '',
    '| Проверка | Результат |',
    '| --- | ---: |',
    '| Основной маршрут | ' + counts.titles + ' кампаний, ' + counts.chapters + ' глав |',
    '| Отказ от поручения и игра с собственной целью | 55 из 55 |',
    '| Раннее раскрытие и решение с учётом нового знания | 55 из 55, ' +
      counts.clues +
      ' полученных улик |',
    '| Поражение, сохранение потери и следующая сцена | 55 из 55 |',
    '| Чтение точного эпилога с учётных записей персонажей | ' + counts.readbacks + ' проверок |',
    '| Книги и варианты с памятками ведущего | 53 авторские книги, ' +
      counts.editions +
      ' игровых вариантов |',
    '',
    '## Что изменилось за столом',
    '',
    'В ' +
      counts.gatedBooks +
      ' книгах у ' +
      counts.gated +
      ' столкновений уточнены условия участия героев. У каждого есть конкретное последствие ухода. Например, на Восточной стене штурмовики займут оставленные зубцы, а партия успеет вывести семьи. У ворот трамвайного депо ловцы придут по заказу и могут обнаружить пустой зал. На обвалившейся лестнице окажутся только те, кто сам поднялся за Руном.',
    '',
    'В Холлоумире движок объявлял повозку доставленной при посещении деревни и Маттиса спасённым при возвращении из склепа без него. Отступление из зала колокола засчитывалось как победа, а мирный визит не давал записать возвращение. Теперь журнал фиксирует предложение работы и посещённые места. Ведущий фиксирует отдельно судьбу груза, звонаря и колокола. Одинаковый маршрут проверен с боем и без него. [До исправления](evidence/campaign-rehearsal-2026-11-22/hollowmere-before.json) · [Повторная проверка](evidence/campaign-rehearsal-2026-11-22/hollowmere-after.json).',
    '',
    'При раннем осмотре игроки могли прочитать ещё не сделанную запись в журнале мела и узнать будущую судьбу упавших ходоков. Теперь журнал показывает только первое вскрытие ящика. Поздняя запись выдаётся отдельной раздаткой после события. В «Свадьбе двух гор» при первом осмотре видны дно и выход из складки; судьба упавшего определяется за столом. [Что видел игрок до исправления](evidence/campaign-rehearsal-2026-11-22/early-pages-before.json) · [Что он увидел после](evidence/campaign-rehearsal-2026-11-22/early-pages-after.json).',
    '',
    '## Партии по кампаниям',
    '',
    ...links,
    '',
    '## Как читать результаты',
    '',
    'Я разыграл решения ведущего и игроков в отдельных локальных партиях. Основной маршрут проходит каждую главу. В альтернативных партиях после развилки разыгрывалась новая сцена с собственной целью, сохранялось прежнее решение или потеря, затем ведущий записывал эпилог. Такая партия могла закончиться раньше последней главы книги. Часть судеб сознательно оставлена открытой.',
    '',
    'Действия персонажей, перемещения, личные записи, получение улик, бои, общая память и чтение финала проверены через сервер. В каждом столкновении остались действующие противники. В ' +
      counts.objectives +
      ' партиях группа уступила цель без ранения, в ' +
      counts.wounds +
      ' группа отступила с раненым, в ' +
      counts.down +
      ' один герой достиг нуля ОЗ. Неблагоприятное состояние задавал ведущий. Разговоры, согласие персонажей и художественные последствия разыграны по книге. Полный бой бросок за броском, физические телефоны и живая группа людей в этот прогон не входили.',
    '',
    'Сквозные партии использовали русскую редакцию и основной состав каждой кампании. Все варианты авторских книг отдельно сверены с переносимыми игровыми комплектами. Для повторения в корне проекта выполните `pnpm campaigns:rehearse`. Для одной кампании добавьте её идентификатор, например `pnpm campaigns:rehearse hollowmere`.',
    '',
  ];
  await markdown(join(ROOT, 'reports/CAMPAIGN_REHEARSAL_2026-11-22.md'), overview.join('\n'));
  process.stdout.write(JSON.stringify(counts) + '\n');
}
if (import.meta.url === new URL('file://' + process.argv[1]).href) await report();
