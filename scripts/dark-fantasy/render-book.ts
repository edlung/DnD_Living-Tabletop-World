import { epilogueHtml, linesHtml, twistsSection } from '../campaign-shared/story.ts';
import { castCards } from '../campaign-shared/cast-cards.ts';
import { pocketSection } from '../campaign-shared/pocket.ts';
import { openingPicture, tableGuide } from '../campaign-shared/table-guide.ts';
import { artOf, figure } from '../campaign-shared/campaign-art.ts';
import { COLLECTION_ROOT, type Source } from './source.ts';
import { box, esc, heroCard, list, nav, p, page } from './render-common.ts';

export function renderBook(s: Source): string {
  const w = s.world;
  const art = artOf(new URL(`${w.slug}/`, COLLECTION_ROOT));
  const portrait = castCards(new URL(`${w.slug}/`, COLLECTION_ROOT));
  const sessions = s.sessions
    .map(
      (session) =>
        `<article class="panel"><div class="eyebrow">Вечер ${session.number}</div><h2>${esc(session.title)}</h2>${p(session.goal)}<a class="card-link" href="session-${session.number}.html">Открыть сценарий →</a></article>`,
    )
    .join('');
  const sizes = w.scaling
    .map(
      (x) =>
        `<li><a href="variants/${x.players}-players.json" download>Пакет на ${x.players} игроков</a>. ${esc(x.guidance)}</li>`,
    )
    .join('');
  const npcs = s.cast.npcs
    .map(
      (n) =>
        `<details><summary>${esc(n.name)} · ${n.age} лет</summary><div>${figure(art, n.key) || portrait(n.key)}${p(n.look)}${p(n.public)}<h3>Чего хочет</h3>${p(n.want)}<h3>Знает только это</h3>${list(n.knows)}${linesHtml(n.lines)}<h3>Личное скрытое знание</h3>${p(n.secret)}<h3>Граница и раскрытие</h3>${p(n.boundary)}${p(n.reveal)}</div></details>`,
    )
    .join('');
  const locations = w.locations
    .map(
      (l) =>
        `<details><summary>${esc(l.name)}</summary><div>${figure(art, l.key)}${p(l.description)}</div></details>`,
    )
    .join('');
  const items = s.items
    .map(
      (i) =>
        `<article class="panel">${figure(art, i.key)}<div class="eyebrow">Вечер ${i.appears}${i.evidence ? ' · улика' : ''}</div><h2>${esc(i.name)}</h2>${p(i.description)}${p(i.use)}</article>`,
    )
    .join('');
  const tokens = [...art.values()]
    .filter((a) => a.kind === 'token')
    .map((a) => figure(art, a.id))
    .join('');
  const endings = w.endings
    .map((e) =>
      box(
        e.title,
        p(`Условия: ${e.requires}`) +
          p(e.outcome) +
          p(`Цена: ${e.cost}`) +
          epilogueHtml(e.epilogue),
      ),
    )
    .join('');
  return page(
    w.title,
    `${w.genre} · ${w.audience} · ${w.minPlayers}–${w.maxPlayers} игроков + ведущий`,
    `${figure(art, 'cover', '', 'art cover')}<div class="lead">${p(w.pitch)}</div><div class="ribbon">Только ведущему: ниже находятся тайны и возможные финалы. Страницу «Игрокам» можно передавать отдельно.</div>` +
      openingPicture(new URL(`${s.world.slug}/`, COLLECTION_ROOT)) +
      tableGuide(new URL(`${s.world.slug}/`, COLLECTION_ROOT)) +
      pocketSection(new URL(`${s.world.slug}/`, COLLECTION_ROOT)) +
      box(
        'Начать игру',
        p(
          `${s.sessions.length} сессий по ${w.sessionDuration.replace(/[.\s]+$/, '')}. Подготовленные герои — уровень 3. Прочитайте первую сессию, выберите состав и передайте игрокам отдельную страницу героев.`,
        ) +
          p(
            'В мастерской создайте или откройте свой черновик, выберите импорт пакета и укажите package.json либо нужный файл из variants. Проверьте сценарий и состав в предпросмотре; активацию подтверждает ведущий. Сюжетные развилки, часы давления и жанровые действия разрешаются ведущим — они не становятся автоматически сыгранными событиями.',
          ) +
          p(
            'Пакеты разных размеров используют первые N героев в порядке карточек. Дополнительные герои дают новые роли, но не обязательные ключи к истории. Выбор произвольного состава требует правки черновика и повторной проверки.',
          ) +
          `<ul>${sizes}</ul>`,
      ) +
      box('Тон и договорённости', p(w.tone) + list(w.themes) + list(w.boundaries)) +
      box('Общий стол: 3–7 игроков', list(w.tableGuidance)) +
      `<div class="grid">${sessions}</div>` +
      box('Истина мира', list(w.truth)) +
      twistsSection(w.twists) +
      box('Действующие лица', npcs) +
      box('Места', locations) +
      (items ? `<h2 class="section-title">Предметы</h2><div class="grid">${items}</div>` : '') +
      (tokens ? box('Фигуры противников', `<div class="tokens">${tokens}</div>`) : '') +
      `<div class="grid">${endings}</div>` +
      box(
        'Честный статус',
        p(
          `Авторская подготовка и техническая проверка не заменяют живую игру. Длительность, сложность и эмоциональное восприятие пока не проверены группой. ${art.size ? `Иллюстрации (${art.size}) созданы генерацией изображений OpenAI в одном стиле; тактические схемы построены из данных встреч.` : 'Картину первой встречи можно открыть отдельно. Тактические схемы построены из данных встреч.'} Полный каталог содержит материалы ведущего — публиковать его целиком для игроков нельзя.`,
        ),
      ),
    nav(s),
  );
}
export function renderPlayers(s: Source): string {
  const w = s.world;
  const art = artOf(new URL(`${w.slug}/`, COLLECTION_ROOT));
  const portrait = castCards(new URL(`${w.slug}/`, COLLECTION_ROOT));
  return page(
    `${w.title} — игрокам`,
    `${w.genre} · ${w.audience} · ${w.minPlayers}–${w.maxPlayers} игроков`,
    `${figure(art, 'cover', '', 'art cover')}<div class="lead">${p(w.pitch)}</div>` +
      box('Мир и начало', p(w.setting) + p(w.opening)) +
      box(
        'Перед первой сессией',
        p(
          'Выберите героев в рамках состава, согласованного с ведущим. Подготовленные листы используют классы воина, плута, жреца и волшебника 3-го уровня. Жанровые профессии и названия меняют описание, но не дают дополнительных автоматических умений.',
        ) +
          p(
            'Решения принадлежат вам. Можно спорить, искать иной путь, отступать и договариваться. Сообщите ведущему о нежелательных темах; пауза и смена описания доступны без объяснений.',
          ) +
          list(w.themes) +
          list(w.boundaries),
      ) +
      `<div class="grid">${s.cast.heroes.map((h) => heroCard(h, figure(art, h.key) || portrait(h.key, true))).join('')}</div>`,
  );
}
export function renderCatalog(sources: Source[]): string {
  return page(
    'Десять историй по ту сторону света',
    'Living Tabletop World · Коллекция кампаний',
    `<div class="lead">${p('Дарк-фэнтези о долге, памяти и надежде перед лицом тьмы. Десять самостоятельных историй, восемь вечеров в каждой, три–семь игроков и один ведущий.')}</div>` +
      box(
        'Выберите историю',
        p(
          'Первые четыре кампании 14+ рассчитаны на совместную игру подростков и взрослых. Ещё шесть имеют пометку 18+ и более тяжёлые темы. Все кампании на русском языке, с готовыми героями, сценами, раздатками и пакетами импорта.',
        ),
      ) +
      `<div class="grid">${sources.map((s, i) => `<article class="panel"><div class="eyebrow">Мир ${String(i + 1).padStart(2, '0')} · <span class="${s.world.audience === '18+' ? 'adult' : ''}">${esc(s.world.audience)}</span></div><h2>${esc(s.world.title)}</h2><p class="meta">${esc(s.world.genre)} · ${s.world.minPlayers}–${s.world.maxPlayers} игроков · 8 сессий</p>${p(s.world.pitch)}<div class="actions"><a href="${s.world.slug}/index.html">Книга ведущего →</a><a href="${s.world.slug}/players.html">Игрокам</a></div></article>`).join('')}</div>` +
      box(
        'Что подготовлено',
        p(
          '80 сессий, 70 героев, отдельные страницы игроков, выдаваемые по ходу игры материалы, тактические схемы и варианты пакетов для каждого заявленного размера группы. Пакеты загружаются через мастерскую проекта; активация остаётся за ведущим. Живое прохождение и баланс ещё требуют проверки вашей группой.',
        ),
      ),
    '',
    'book.css',
  );
}
