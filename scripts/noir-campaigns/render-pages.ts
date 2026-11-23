import { castCards } from '../campaign-shared/cast-cards.ts';
import { pocketSection } from '../campaign-shared/pocket.ts';
import { openingPicture, tableGuide } from '../campaign-shared/table-guide.ts';
import { heroSheet } from './sheets.ts';
import { artOf, figure } from '../campaign-shared/campaign-art.ts';
import { COLLECTION_ROOT, type Source } from './source.ts';
import { box, esc, heroCard, list, nav, p, page } from './render-common.ts';
import { renderCase } from './detective.ts';

const sizes = (s: Source) =>
  [3, 4, 5, 6, 7, 8]
    .map(
      (n) =>
        `<a href="variants/${n}-players.json" download>${n} игроков${n === s.world.defaultPlayers ? ' · основной' : ''}</a>`,
    )
    .join('');

const artFor = (s: Source) => artOf(new URL(`${s.world.slug}/`, COLLECTION_ROOT));

export function renderDm(s: Source): string {
  const { world: w, cast } = s;
  const art = artFor(s);
  const portrait = castCards(new URL(`${w.slug}/`, COLLECTION_ROOT));
  const sessions = s.sessions
    .map(
      (session) =>
        `<li><a href="session-${session.number}.html">${session.number}. ${esc(session.title)}</a> — ${esc(session.goal)}</li>`,
    )
    .join('');
  const npcs = cast.npcs
    .map((n) =>
      box(
        n.name,
        (figure(art, n.key) || portrait(n.key)) +
          p(`${n.age} лет. ${n.look} ${n.public}`) +
          p(`Место: ${w.locations.find((l) => l.key === n.location)?.name ?? n.location}`) +
          '<h3>Намерение</h3>' +
          p(n.want) +
          '<h3>Собственные знания</h3>' +
          list(n.knows) +
          '<h3>Секрет или личное убеждение</h3>' +
          p(n.secret) +
          '<h3>Граница и раскрытие</h3>' +
          p(n.boundary) +
          p(n.reveal),
      ),
    )
    .join('');
  return page(
    w.title,
    `Книга ведущего · ${w.genre} · ${w.audience} · 3–8 игроков + ведущий`,
    `${figure(art, 'cover', '', 'art cover')}<div class="lead">${p(w.pitch)}</div>` +
      openingPicture(new URL(`${s.world.slug}/`, COLLECTION_ROOT)) +
      tableGuide(new URL(`${s.world.slug}/`, COLLECTION_ROOT)) +
      pocketSection(new URL(`${s.world.slug}/`, COLLECTION_ROOT)) +
      box(
        'За десять минут до первой игры',
        list([
          'Откройте первый вечер, прочитайте правду мира и участников. Остальные вечера — планы, их исход решают игроки.',
          'Выберите пакет под фактическое число игроков. Первые три героя — готовое ядро; остальные добавляются по порядку. Возраст игрока не определяет героя.',
          'Согласуйте темы, длительность и сигнал паузы. Передайте игрокам только players.html; раздатки выдавайте по отдельности после указанного открытия.',
          'Откройте Мастерскую проекта, создайте личный черновик и импортируйте выбранный JSON через загрузку пакета. Проверьте состав и начало в предпросмотре. Запуск кампании подтверждает ведущий штатным действием.',
          art.size
            ? `Иллюстрации кампании (${art.size}) лежат в assets/ и показываются в книге; в уже запущенную кампанию их переносит scripts/campaign-shared/import-art.ts.`
            : 'Откройте иллюстрацию завязки отдельно. Портреты героев входят в файл для игроков, портреты встречных — в книгу ведущего. Тактические схемы доступны в разделе карт.',
        ]) + `<div class="actions">${sizes(s)}</div>`,
      ) +
      box(
        'Формат и темы',
        p(`${s.sessions.length} вечеров; ${w.sessionDuration}`) +
          p(w.setting) +
          p(w.tone) +
          list(w.themes) +
          '<h3>Границы</h3>' +
          list(w.boundaries),
      ) +
      box('Люди за столом', list(w.tableGuidance)) +
      box(
        'Масштабирование группы',
        w.scaling.map((x) => `<h3>${x.players} игроков</h3>${p(x.guidance)}`).join(''),
      ) +
      box('Первое чтение вслух', `<div class="read-aloud">${p(w.opening)}</div>`) +
      box('Правда мира · только ведущему', list(w.truth)) +
      renderCase(s) +
      box('Восемь вечеров', `<ol>${sessions}</ol>`) +
      box(
        'Места',
        w.locations
          .map((l) => `<h3>${esc(l.name)}</h3>${figure(art, l.key)}${p(l.description)}`)
          .join(''),
      ) +
      (s.items.length
        ? `<h2 class="section-title">Предметы</h2><div class="grid">${s.items.map((i) => `<article class="panel">${figure(art, i.key)}<div class="eyebrow">Вечер ${i.appears}${i.evidence ? ' · улика' : ''}</div><h2>${esc(i.name)}</h2>${p(i.description)}${p(i.use)}</article>`).join('')}</div>`
        : '') +
      (art.size
        ? box(
            'Фигуры противников',
            `<div class="tokens">${[...art.values()]
              .filter((a) => a.kind === 'token')
              .map((a) => figure(art, a.id))
              .join('')}</div>`,
          )
        : '') +
      `<div class="grid">${npcs}</div>` +
      box(
        'Возможные финалы',
        w.endings
          .map(
            (e) =>
              `<h3>${esc(e.title)}</h3>${p(`Условия: ${e.requires}`)}${p(e.outcome)}${p(`Цена: ${e.cost}`)}`,
          )
          .join(''),
      ) +
      box(
        'Раздатки · выдавать постепенно',
        `<ul>${s.handouts.map((h) => `<li><a href="handouts/${esc(h.key)}.html">${esc(h.title)}</a> — ${esc(h.unlock)}</li>`).join('')}</ul>`,
      ) +
      box(
        'Как читать игровые проверки',
        p(
          'Проверки характеристик и навыков, переговоры, часы и последствия из книги разрешает ведущий. Они не являются дополнительными автоматическими правилами приложения. Улики доступны без обязательного успешного броска. Подготовленные встречи начинаются только по решению ведущего; исходы и эпилоги заранее не записаны.',
        ),
      ) +
      box(
        'Когда свидетель готов говорить',
        p(
          'Знание NPC не означает готовность раскрыть его при первом вопросе. В пакете свидетельства закрыты; ведущий использует условия раскрытия в карточке NPC и штатные действия для согласованных открытий. Независимые предметные улики доступны через осмотр, поэтому отказ свидетеля не блокирует расследование.',
        ),
      ) +
      box(
        'Статус подготовки',
        p(
          art.size
            ? `Кампания переработана: скелет и редактура — Claude Opus 5.5, текст — Claude Sonnet 5.5 через API проекта, иллюстрации (${art.size}) — генерация изображений OpenAI в одном стиле; подробности в README. Живой плейтест с людьми ещё не проведён. Локальная папка с исходниками и книгой предназначена ведущему.`
            : 'Авторская кампания подготовлена отдельным агентом, запрошенным как GPT-6 Astra / max. Проверки пакетов и игровых границ описаны в verification.json и общем отчёте. Живой плейтест с людьми ещё не проведён. Локальная папка с исходниками и книгой предназначена ведущему.',
        ),
      ),
    nav(s),
  );
}

export function renderPlayers(s: Source, css: string): string {
  const { world: w } = s;
  const art = artFor(s);
  const portrait = castCards(new URL(`${w.slug}/`, COLLECTION_ROOT));
  const sheets = s.cast.heroes
    .map((h, i) => {
      const sheet = heroSheet(h.archetype);
      const abilities = sheet.abilities;
      const numbers = `Сила ${abilities.str} · Ловкость ${abilities.dex} · Телосложение ${abilities.con} · Интеллект ${abilities.int} · Мудрость ${abilities.wis} · Харизма ${abilities.cha}`;
      const spells = 'Нет; сверхъестественные способности отключены';
      const weapons = 'Посох — условный профиль ближнего боя';
      return `<div class="hero-entry">${heroCard(h, figure(art, h.key) || portrait(h.key, true))}<section class="panel sheet"><h3>${i < 3 ? 'Основное трио' : `Место ${i + 1}`}</h3>${p(`Хиты ${sheet.hitPoints.max}; КД ${sheet.armorClass}; скорость 30 футов; одна атака за действие.`)}${p(numbers)}${p(`Оружие: ${weapons}. Заклинания: ${spells}.`)}${p(sheet.spellcasting.length ? 'Ячейки: четыре первого круга и две второго. Расход и восстановление — по правилам приложения.' : 'Приёмы и проверки — по правилам приложения.')}${p('Образ героя свободно меняется вместе с ведущим. Числа соответствуют готовому листу уровня 3. Художественное устройство или талант не даёт дополнительных автоматических способностей.')}</section></div>`;
    })
    .join('');
  return standalone(
    page(
      `${w.title} — игрокам`,
      `${w.genre} · ${w.audience} · 3–8 игроков + ведущий`,
      `${figure(art, 'cover', '', 'art cover')}<div class="lead">${p(w.pitch)}</div>` +
        box('Мир и начало', p(w.setting) + p(w.opening)) +
        box('Как мы играем вместе', list(w.tableGuidance)) +
        box('Темы и границы', list(w.themes) + list(w.boundaries)) +
        box(
          'Выбор героев',
          p(
            'Первые три образуют готовую команду для трёх игроков. Следующие места добавляются по порядку в пакетах на 4–8 игроков. Для другого сочетания согласуйте изменение состава в Мастерской. Любой образ доступен любому игроку независимо от возраста.',
          ),
        ) +
        `<div class="grid">${sheets}</div>`,
      '',
      '',
    ),
    css,
  );
}

export function standalone(html: string, css: string): string {
  return html.replace('<link rel="stylesheet" href="">', `<style>${css}</style>`);
}

export function renderCatalog(sources: Source[]): string {
  const cards = sources
    .map(
      (s) =>
        `<article class="panel"><div class="eyebrow">${esc(s.world.genre)} · ${esc(s.world.audience)}</div><h2>${esc(s.world.title)}</h2>${p(s.world.pitch)}${p(`3–8 игроков + ведущий · ${s.sessions.length} вечеров · ${s.world.sessionDuration}`)}<div class="actions"><a href="${s.world.slug}/index.html">Открыть книгу ведущего</a><a href="${s.world.slug}/players.html">Материал для игроков</a></div></article>`,
    )
    .join('');
  return page(
    'Десять дел после полуночи',
    'Коллекция для 3–8 игроков · 2026',
    `<div class="lead">${p('Дождливые улицы, спорные алиби и клиенты, которым выгодна не вся правда. Десять самостоятельных noir-расследований: от страховой подмены до городской избирательной машины.')}</div>` +
      box(
        'Выберите вечер для своей компании',
        p(
          'Все десять кампаний рассчитаны на взрослую аудиторию; рекомендации 18+ и 21+ указаны отдельно. Возрастная маркировка — рекомендация по темам; ведущий учитывает чувствительность конкретной группы. Во всех кампаниях 3–8 игроков, ведущий считается отдельно.',
        ),
      ) +
      `<div class="grid">${cards}</div>` +
      box(
        'Материалы готовы к подготовке игры',
        p(
          'У каждой кампании: восемь вечеров, восемь героев, отдельный файл для игроков, раздатки, встречи с картами и условиями начала и шесть пакетов для импорта. Игрокам передавайте players.html и только уже открытые раздатки. Книги ведущего, пакеты и исходники содержат секреты.',
        ),
      ),
    '',
    'book.css',
  );
}
