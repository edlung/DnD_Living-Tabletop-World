import { cast, handouts, items, world } from './data.ts';
import { esc, img, link, list, p, page, save } from './render-common.ts';
import { renderGuide } from './render-guide.ts';

const section = (title: string, body: string) =>
  `<section class="section"><h2>${esc(title)}</h2>${body}</section>`;
const card = (title: string, body: string, art?: string) =>
  `<article class="card">${art ? img(art, title) : ''}<div class="card-body"><h3>${esc(title)}</h3>${body}</div></article>`;

export async function renderPages() {
  await save(
    'index.html',
    page(
      'Приглашение под море',
      `
    <section class="hero">${img('cover', 'Перламутровый город под прозрачными морскими сводами')}
      <div class="hero-copy"><span class="eyebrow">Приключение для вашей семьи</span><h1>${esc(world.title)}</h1>
      ${p('Город под морем готовится услышать свою первую песню. Но знаменитое сокровище молчит — и трое друзей замечают то, чего не увидели хранители.')}
      <div class="tags"><span class="tag">3 игрока + ведущий</span><span class="tag">12 вечеров</span><span class="tag">Уровни 3–5</span></div>
      <div class="actions">${link('players.html', 'Выбрать героев', 'button')}${link('guide.html', 'Открыть книгу ведущего', 'button secondary')}</div></div></section>
    ${section('За стеклом — целое море', `<div class="grid">${card('Город, который хочется исследовать', p('Коралловый сад, рынок под парусами, театр осьминога и огромная раковина Наутилуса. Внутри сводов сухо, светло и полно жизни.'), 'market')}${card('Три разных способа быть важным', p('Заметить, придумать, договориться, помочь руками. В общей сцене найдётся отдельное решение для каждого.'), 'boat')}${card('Тайна с вашим решением', p('Проверяйте свидетельства, меняйте маршрут и придумывайте план. Найденный ответ останется вашим успехом.'), 'museum')}</div>`)}
    ${section('Перед первым вечером', `<div class="reading stack">${p('Ведущему достаточно начать с подготовки в книге и первого вечера. Игрокам покажите страницу героев. Поздние карточки, карта и нативный пакет содержат сюжетные тайны.')}${p('Один взрослый ведёт, остальные трое играют. Четвёртый герой — вариант замены. Долгую встречу можно разделить; пауза сохраняет открытия и решения.')}</div>`)}
  `,
    ),
  );
  const heroes = cast.heroes
    .map(
      (hero) =>
        `<article class="card">${img(hero.art, hero.name, '', 'portrait')}<div class="card-body"><span class="eyebrow">${esc(hero.species)}</span><h2>${esc(hero.name)}</h2>${p(hero.role)}<p><strong>Мечта.</strong> ${esc(hero.want)}</p><p><strong>Друзья.</strong> ${esc(hero.bond)}</p><details><summary>Что я могу попробовать</summary>${list(hero.simple)}${p(hero.question)}</details><p class="meta">${esc(hero.keepsake)}</p></div></article>`,
    )
    .join('');
  await save(
    'players.html',
    page(
      'Герои и памятка игрокам',
      `
    <header class="chapter-head"><span class="eyebrow">Здесь нет разгадки истории</span><h1>Три места в лодке</h1>${p('Выберите по одному герою. Имена, внешность и манеру речи можно менять вместе с ведущим. Никто не обязан выбирать по возрасту или полу. Эмиль заменяет любого из троих; четыре игрока предполагают отдельного пятого участника-ведущего.')}</header>
    <div class="grid heroes">${heroes}</div>
    ${section('Когда очередь доходит до тебя', `<div class="grid">${card('1. Скажи, чего хочешь', p('«Хочу понять, почему эта вещь молчит». Можно сказать одним словом или показать на картинку.'))}${card('2. Предложи свою идею', p('Осмотреть, поговорить, помочь, попробовать предмет, отойти. Ведущий скажет, нужен ли бросок.'))}${card('3. Посмотри, что изменилось', p('Неудача меняет обстоятельства, но история продолжается. Можно выбрать другой способ или попросить помощь.'))}</div>`)}
    ${section('Перед дорогой', `<div class="reading stack">${p('В приложении откройте инвентарь и наденьте дорожную куртку; Торен берёт щит в свободную руку. Стартовые вещи сначала лежат в сумке. Эмиль носит обычную одежду; его магия и способности указаны в листе. У каждого есть лесной бальзам из действующего каталога.')}${p('В сухих галереях Перламутра обычный воздух. Не нужно считать дыхание или обязательно плавать. Идеи можно показывать рисунком; петь, выступать или произносить длинную речь необязательно.')}${p('Помощь начинается с «хочешь идею?». Каждый выбирает за своего героя. Можно попросить паузу, короткое объяснение, другую сцену или отдых без объяснения причин.')}${p('Способности, заклинания и числовые эффекты берите из листа и карточек приложения. Памятные вещи добавляют историю; собственные идеи обсуждайте с ведущим.')}</div>`)}
  `,
      { player: true },
    ),
  );
  await renderGuide();
  const handoutCards = handouts
    .map(
      (entry) =>
        `<article class="card"><div class="card-body"><span class="eyebrow">Вечер ${entry.reveal}</span><h2>${esc(entry.title)}</h2>${p(entry.task)}${link(`handouts/${entry.key}.html`, 'Открыть отдельную карточку', 'button secondary')}</div></article>`,
    )
    .join('');
  await save(
    'handouts.html',
    page(
      'Каталог карточек ведущего',
      `<header class="chapter-head"><span class="eyebrow">Только ведущему · выдавайте по ходу игры</span><h1>Вещи, бумаги и маленькие открытия</h1>${p('Показывайте отдельную карточку в момент находки. Указанный вечер — ориентир, не запрет на раннее открытие. Полный каталог раскрывает тайны. Карточки можно распечатать из браузера.')}</header><div class="grid">${handoutCards}</div>${section('Пять памятных вещей и общий архив', `<div class="grid">${items.map((item) => card(item.name, `<p class="meta">Ориентир: вечер ${item.reveal}</p>${p(item.acquire)}${link(`handouts/item-${item.key}.html`, 'Открыть предмет', 'button secondary')}`, item.art)).join('')}</div>`)}`,
    ),
  );
  for (const entry of handouts)
    await save(
      `handouts/${entry.key}.html`,
      page(
        entry.title,
        `<article class="handout reading"><span class="eyebrow">Истории Перламутра</span><h1>${esc(entry.title)}</h1>${p(entry.text)}${entry.panels ? `<div class="grid">${entry.panels.map((panel) => `<section class="card">${panel.art ? img(panel.art, panel.title, '../') : ''}<div class="card-body"><h2>${esc(panel.title)}</h2>${p(panel.text)}</div></section>`).join('')}</div>` : ''}<hr>${p(entry.task)}</article>`,
        { prefix: '../', player: true },
      ),
    );
  for (const item of items)
    await save(
      `handouts/item-${item.key}.html`,
      page(
        item.name,
        `<article class="reading stack">${img(item.art, item.name, '../', 'item-art')}<div class="handout"><span class="eyebrow">Вещь с историей</span><h1>${esc(item.name)}</h1>${p(item.description)}${p(item.use)}<p class="meta">${esc(item.limit)}</p></div></article>`,
        { prefix: '../', player: true },
      ),
    );
}
