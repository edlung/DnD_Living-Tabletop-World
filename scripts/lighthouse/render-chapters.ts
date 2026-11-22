import { tableGuide } from '../campaign-shared/table-guide.ts';
import { chapters, handouts, items } from './data.ts';
import { packRoot, artFile, esc, img, link, list, p, page, save } from './render-common.ts';

export async function renderChapters() {
  for (const chapter of chapters) {
    const previous =
      chapter.number > 1
        ? link(
            `${String(chapter.number - 1).padStart(2, '0')}.html`,
            'Предыдущий вечер',
            'button secondary',
          )
        : '';
    const next =
      chapter.number < 12
        ? link(
            `${String(chapter.number + 1).padStart(2, '0')}.html`,
            'Следующий вечер',
            'button secondary',
          )
        : '';
    const props = chapter.props
      .map((key) => {
        const title =
          handouts.find((h) => h.key === key)?.title ??
          items.find((item) => `item-${item.key}` === key)?.name ??
          key;
        return link(`../handouts/${key}.html`, title, 'button secondary');
      })
      .join('');
    await save(
      `sessions/${String(chapter.number).padStart(2, '0')}.html`,
      page(
        `${chapter.number}. ${chapter.title}`,
        `
      <header class="chapter-head"><span class="eyebrow">Вечер ${chapter.number} · только ведущему</span><h1>${esc(chapter.title)}</h1><p class="meta">${esc(chapter.duration)} · ориентир: уровень ${chapter.level}</p>${p(chapter.goal)}<div class="actions">${link(`../assets/${artFile(chapter.art)}`, 'Показать декорацию', 'button')}${link('../guide.html', 'К оглавлению', 'button secondary')}</div></header>
      ${img(chapter.art, chapter.title, '../', 'banner')}
      ${tableGuide(packRoot, chapter.number)}<article class="reading section"><h2>Прочитать вслух</h2><blockquote class="quote">${esc(chapter.readAloud)}</blockquote>
        ${chapter.scenes.map((scene, index) => `<section class="scene"><span class="eyebrow">Эпизод ${index + 1} · около ${scene.minutes} минут</span><h2>${esc(scene.title)}</h2>${p(scene.play)}<h3>Возможные действия</h3>${list(scene.choices)}<div class="note"><strong>Проверки</strong>${p(scene.check)}</div><div class="note"><strong>Если не получилось</strong>${p(scene.failForward)}</div></section>`).join('')}
        <section class="scene"><h2>Загадка и помощь</h2>${p(chapter.puzzle.prompt)}<details><summary>Ответ для ведущего</summary>${p(chapter.puzzle.solution)}</details><details><summary>Три подсказки — по одной</summary><ol>${chapter.puzzle.hints.map((hint) => `<li>${esc(hint)}</li>`).join('')}</ol></details></section>
        <section class="scene"><h2>Место для каждого</h2>${list(chapter.spotlight)}<h3>Карточки на стол</h3><div class="actions">${props}</div><h3>Что можно получить</h3>${list(chapter.reward)}</section>
        <section class="scene"><h2>Последствия решений</h2>${chapter.consequences.map((c) => `<div class="note"><strong>${esc(c.if)}</strong>${p(c.then)}</div>`).join('')}<h3>Кадр для окончания</h3><blockquote class="quote">${esc(chapter.end)}</blockquote><h3>Отдых и остановка</h3>${p(chapter.rest)}<div class="note"><strong>Памятка ведущему</strong>${p(chapter.dmNote)}</div></section>
        <div class="actions">${previous}${next}</div>
      </article>`,
        { prefix: '../' },
      ),
    );
  }
}
