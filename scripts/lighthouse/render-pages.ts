import { tableGuide } from '../campaign-shared/table-guide.ts';
import { cast, chapters, handouts, items, world } from './data.ts';
import { packRoot, esc, img, link, list, p, page, save } from './render-common.ts';

const section = (title: string, body: string) =>
  `<section class="section"><h2>${esc(title)}</h2>${body}</section>`;
const card = (title: string, body: string, art?: string) =>
  `<article class="card">${art ? img(art, title) : ''}<div class="card-body"><h3>${esc(title)}</h3>${body}</div></article>`;

export async function renderPages() {
  await save(
    'index.html',
    page(
      'Приглашение в путешествие',
      `
    <section class="hero">${img('cover', 'Дом-корабль летит к Маяку среди островов над облаками')}
      <div class="hero-copy"><span class="eyebrow">Приключение для вашей семьи</span><h1>Маяк Между Ветрами</h1>
      ${p('Завтра немного сломалось. Возьмите друзей, тёплый плед и корабль с чайником. Впереди — острова, которых ещё нет на старых картах.')}
      <div class="tags"><span class="tag">3 игрока + ведущий</span><span class="tag">12 вечеров</span><span class="tag">Уровни 3–5</span></div>
      <div class="actions">${link('players.html', 'Выбрать героев', 'button')}${link('guide.html', 'Открыть книгу ведущего', 'button secondary')}</div></div>
    </section>
    ${section('Большое путешествие. Свой дом.', `<div class="grid">${card('Чудо за горизонтом', p('Яблоневый сад на черепахе, книги в бумажных лодочках и обсерватория на спине кита. У каждого места — свой характер.'), 'orchard')}${card('Место для каждого', p('Ловкость, любопытство и разговор одинаково важны. У каждой задачи несколько путей, а у каждого героя — своя мечта.'), 'ship')}${card('Ваша история', p('Вы выбираете, кому доверять, как помогать и что оставить после себя. Мир запомнит ваши решения.'), 'harbor')}</div>`)}
    ${section('Ведущему перед первым вечером', `<div class="reading stack">${p('Сначала прочитайте начало книги ведущего и первый вечер. Игрокам покажите только страницу героев. В книге, карточках поздних вечеров и файле кампании есть сюжетные тайны.')}${p('Игра рассчитана на троих игроков, включая ребёнка 8 лет и подростка 14 лет. Встречу можно делить на короткие части; перерыв не отнимает победу. Четвёртый герой — запасной выбор, а не обязательный спутник.')}</div>`)}
  `,
    ),
  );

  const heroes = cast.heroes
    .map(
      (hero) =>
        `<article class="card">${img(hero.art, hero.name, '', 'portrait')}<div class="card-body"><span class="eyebrow">${esc(hero.species)}</span><h2>${esc(hero.name)}</h2><p>${esc(hero.role)}</p><p><strong>Мечта.</strong> ${esc(hero.want)}</p><p><strong>Друзья.</strong> ${esc(hero.bond)}</p><details><summary>Что я могу попробовать</summary>${list(hero.simple)}${p(hero.question)}</details><p class="meta">${esc(hero.keepsake)}</p></div></article>`,
    )
    .join('');
  await save(
    'players.html',
    page(
      'Герои и памятка игрокам',
      `
    <header class="chapter-head"><span class="eyebrow">Здесь нет разгадки истории</span><h1>Три места за общим столом</h1>${p('Выберите по одному герою. Имена, внешность и манеру речи можно менять вместе с ведущим. Никто не обязан выбирать роль по возрасту или полу. Мика заменяет любого из троих; если появится четвёртый игрок, место найдётся и ему.')}</header>
    <div class="grid heroes">${heroes}</div>
    ${section('Когда очередь доходит до тебя', `<div class="grid">${card('1. Скажи, чего хочешь', p('«Я хочу понять, почему часы повторяются». Можно говорить своими словами или показать на картинку.'))}${card('2. Опиши свою идею', p('Осмотреть, поговорить, помочь, попробовать предмет, отойти. Ведущий скажет, нужен ли бросок.'))}${card('3. Посмотри, что изменилось', p('Плохой бросок меняет обстоятельства, но история продолжается. Можно выбрать другую идею или попросить помощь.'))}</div>`)}
    ${section('Перед выходом из гавани', `<div class="reading stack">${p('В приложении откройте инвентарь и наденьте дорожную куртку; Финн также берёт щит в свободную руку. Стартовые вещи сначала лежат в сумке. У каждого есть лесной бальзам. Предметы работают по карточкам приложения.')}${p('Один взрослый ведёт мир, остальные вместе выбирают действия своих героев. Помощь — это вопрос «хочешь идею?», а не решение за другого. Можно попросить паузу, пропустить неприятную сцену или выйти на отдых без объяснения.')}${p('Заклинания и способности используйте из листа персонажа. Собственные идеи приветствуются: ведущий поможет понять, как их разыграть.')}</div>`)}
  `,
      { player: true },
    ),
  );

  const chapterCards = chapters
    .map((chapter) =>
      card(
        `${chapter.number}. ${chapter.title}`,
        `<p class="meta">${esc(chapter.duration)}</p>${p(chapter.goal)}${link(`sessions/${String(chapter.number).padStart(2, '0')}.html`, 'Открыть вечер', 'button secondary')}`,
        chapter.art,
      ),
    )
    .join('');
  const npcCards = cast.npcs
    .map(
      (npc) =>
        `<details><summary>${esc(npc.name)}</summary><div class="pair">${img(npc.key === 'omb' ? 'observatory' : npc.key, npc.name, '', npc.key === 'omb' ? 'landscape' : 'portrait')}<div class="stack">${p(npc.public)}${p(`Хочет: ${npc.want}`)}${p(`Голос: ${npc.voice}`)}${p(`Граница: ${npc.boundary}`)}${p(`Скрытое: ${npc.secret}`)}${p(`Когда раскрывать: ${npc.reveal}`)}${p(`Предлагает: ${npc.offer}`)}${p(`Изменение: ${npc.change}`)}</div></div><h3>Что действительно знает</h3>${list(npc.knows)}</details>`,
    )
    .join('');
  await save(
    'guide.html',
    page(
      'Книга ведущего',
      `
    <header class="chapter-head"><span class="eyebrow">Только ведущему · сюжетные тайны</span><h1>Книга завтрашних дорог</h1>${p(world.pitch)}<div class="actions">${link('sessions/01.html', 'Начать первый вечер', 'button')}${link('handouts.html', 'Подготовить карточки', 'button secondary')}${link('maps.html', 'Карты и встречи', 'button secondary')}</div></header>
    <div class="reading stack"><div class="note"><strong>Подготовка за 20 минут</strong>${list(['Выберите трёх героев. Четвёртый — замена, не лишний подконтрольный ведущему участник.', 'Договоритесь о паузах и уровне опасности. Прочитайте открытие первого вечера, карточки Руны и Шпуля.', 'Откройте декорацию гавани, приготовьте приглашение и билет. Кубики, бумага и три маркера достаточны.', 'Перед необязательным боем помогите игрокам надеть стартовые куртки и щит через инвентарь.', 'Показывайте игрокам только выбранную декорацию или отдельную карточку. Эта книга, весь каталог и пакет кампании содержат тайны.'])}</div>${p(world.duration)}${p(world.safety)}${p(world.progression)}</div>
    ${section('Что произошло на самом деле', `<div class="reading stack">${list(world.truth)}<h3>До появления героев</h3>${list(world.history)}</div>`)}
    ${section('Как вести свободную кампанию', `<div class="reading stack">${p(world.order)}${p('Не прогоняйте будущие главы как уже случившиеся события. NPC рассказывает только то, что знает. Заметка героя остаётся гипотезой, пока её не проверили. Итоги и перемещения в игре подтверждает ведущий обычными инструментами мира.')}${p('У каждого узлового вывода есть запасные источники. Задержку показывают праздник, сад и колокола; временный характер защиты — протокол, Руна и журнал Северина; новый путь — опыт корабля, сад, Омб; безопасный запуск — Ильер, схема дворца и пульт Маяка. Один пропущенный остров не блокирует финал.')}${p('Если интерес падает, завершите ближайший маленький успех и вернитесь на корабль. По очереди предлагайте физическое действие, проверку идеи и разговор; не закрепляйте эти роли за детьми или взрослыми. Обычная сцена занимает 30–55 минут, затем пауза.')}${p('Провал: назовите конкретное изменение, сохраните доступ к основной улике и предложите новый подход. Поражение в необязательном бою — безопасное отступление. Оно не создаёт автоматического исцеления: отдых и лечение применяются штатно.')}</div>`)}
    ${tableGuide(packRoot)}
    ${section('Двенадцать вечеров', `<div class="grid">${chapterCards}</div>`)}
    ${section('Люди, которых хочется встретить снова', `<div class="stack">${npcCards}</div>`)}
    ${section('Жизнь между главами', `<div class="reading stack">${list(world.recurring)}${p('Записывайте после вечера: какие факты узнали; кому что обещали; что изменили; кого пригласили; что осталось открытым. Эпилог строится по этим записям. Не выдавайте предполагаемый успех за случившийся.')}</div>`)}
    ${section('Маршрут ведущего', `${link('maps/archipelago.svg', 'Открыть схему островов')}${p('Схема показывает связи для подготовки. Свежие адреса и названия вводятся в рассказ тогда, когда герои их узнают. Переходы между островами можно переставлять.')}`)}
  `,
    ),
  );

  const handoutCards = handouts
    .map(
      (card) =>
        `<article class="card"><div class="card-body"><span class="eyebrow">Вечер ${card.reveal}</span><h2>${esc(card.title)}</h2>${p(card.task)}${link(`handouts/${card.key}.html`, 'Открыть отдельную карточку', 'button secondary')}</div></article>`,
    )
    .join('');
  await save(
    'handouts.html',
    page(
      'Каталог карточек ведущего',
      `<header class="chapter-head"><span class="eyebrow">Только ведущему · выдавайте по ходу игры</span><h1>То, что можно передать из рук в руки</h1>${p('Открывайте отдельную карточку и показывайте её игрокам в нужный момент. Полный каталог заранее раскрывает события. Каждую карточку можно распечатать из браузера.')}</header><div class="grid">${handoutCards}</div>${section('Предметы путешествия', `<div class="grid">${items.map((item) => card(item.name, `<p class="meta">С вечера ${item.reveal}</p>${link(`handouts/item-${item.key}.html`, 'Открыть предмет', 'button secondary')}`, item.art)).join('')}</div>`)}`,
    ),
  );
  for (const card of handouts)
    await save(
      `handouts/${card.key}.html`,
      page(
        card.title,
        `<article class="handout reading"><span class="eyebrow">Письмо из мира Между Ветрами</span><h1>${esc(card.title)}</h1>${p(card.text)}<hr>${p(card.task)}</article>`,
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
