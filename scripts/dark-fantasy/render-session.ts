import { openingPicture, tableGuide } from '../campaign-shared/table-guide.ts';
import { choicesHtml, twistsForSession } from '../campaign-shared/story.ts';
import { artOf, figure } from '../campaign-shared/campaign-art.ts';
import { COLLECTION_ROOT, type Source, type Session } from './source.ts';
import { box, esc, list, nav, p, page } from './render-common.ts';

export function renderSession(s: Source, session: Session): string {
  const art = artOf(new URL(`${s.world.slug}/`, COLLECTION_ROOT));
  const faces = session.participants
    .map((key) => {
      const npc = s.cast.npcs.find((n) => n.key === key);
      return npc && art.has(key)
        ? `<figure class="face">${figure(art, key, '', 'art thumb')}<figcaption>${esc(npc.name)}</figcaption></figure>`
        : '';
    })
    .join('');
  const scenes = session.scenes
    .map(
      (scene, i) =>
        `<article class="scene"><div class="eyebrow">Сцена ${i + 1} · ${scene.minutes} минут</div><h2>${esc(scene.title)}</h2>${scene.readAloud ? `<div class="read-aloud">${p(scene.readAloud)}</div>` : ''}${p(scene.play)}${choicesHtml('Выборы', scene.choices, scene.forks)}<h3>Проверка и путь без броска</h3>${p(scene.check)}<h3>Если не получилось</h3>${p(scene.failForward)}</article>`,
    )
    .join('');
  const clues = session.clues
    .map((key) => s.clues.find((c) => c.key === key))
    .map((c) =>
      c
        ? `<article class="panel"><h2>${esc(c.name)}</h2>${p(c.appearance)}<h3>Что можно установить</h3>${p(c.statement)}<h3>Получение</h3>${p(c.discovery)}<h3>Запасной путь</h3>${p(c.fallback)}</article>`
        : '',
    )
    .join('');
  const handouts = session.handouts
    .map((key) => s.handouts.find((h) => h.key === key))
    .map((h) =>
      h
        ? `<li><a href="handouts/${esc(h.key)}.html">${esc(h.title)}</a> — ${esc(h.unlock)}</li>`
        : '',
    )
    .join('');
  return page(
    `${session.number}. ${session.title}`,
    `${s.world.title} · Только ведущему`,
    `${figure(art, session.location, '', 'art cover')}<div class="lead">${p(session.goal)}</div>${faces ? `<div class="faces">${faces}</div>` : ''}` +
      (session.number === 1 ? openingPicture(new URL(`${s.world.slug}/`, COLLECTION_ROOT)) : '') +
      tableGuide(new URL(`${s.world.slug}/`, COLLECTION_ROOT), session.number) +
      twistsForSession(s.world.twists, session.number) +
      `<div class="read-aloud">${p(session.readAloud)}</div>` +
      box('Подготовка и роли', p(session.dmNote) + list(session.spotlight)) +
      `<section class="panel">${scenes}</section>` +
      (clues ? `<div class="grid">${clues}</div>` : '') +
      box(
        'Изменения после решений',
        session.consequences.map((c) => p(`Если ${c.if} → ${c.then}`)).join(''),
      ) +
      (handouts ? box('Выдать в нужный момент', `<ul>${handouts}</ul>`) : '') +
      box('Завершение вечера', p(session.ending)) +
      `<nav aria-label="Переход между сессиями">${session.number > 1 ? `<a href="session-${session.number - 1}.html">Предыдущая сессия</a>` : ''}${session.number < s.sessions.length ? `<a href="session-${session.number + 1}.html">Следующая сессия</a>` : ''}</nav>`,
    nav(s),
  );
}
