(() => {
  const E = window.Lighthouse;
  const { state, chapters, icon, esc, art, mini, ornament, romans, button, same, bookUrl } = E;
  const campaignTitle = 'Маяк Между Ветрами';

  function masthead() {
    return `<div class="header-inner"><a class="brand" href="#shelf" aria-label="Living Tabletop World, книжная полка">
      <span class="brand-emblem"><img src="${ornament('seal')}" alt=""></span><span>Living Tabletop World</span></a>
      <span class="header-separator"></span><span class="workspace-name">Кабинет мастера</span>
      <div class="header-tools"><button type="button" class="text-button" data-do="stopcast" hidden>${icon('monitor')}<span>Остановить показ</span></button>
      <button class="text-button header-players" data-do="players">${icon('people')}<span>Игроки</span></button>
      <button class="text-button header-note" data-do="notes"><img src="${ornament('quill')}" alt="">Заметки</button></div></div>`;
  }
  function ticks(chapter) {
    return (
      '<div class="chapter-ticks" aria-hidden="true">' +
      chapters
        .map(
          (_, i) =>
            '<i class="' +
            (i === chapter ? 'present' : state.played.includes(i) ? 'past' : '') +
            '"></i>',
        )
        .join('') +
      '</div>'
    );
  }
  function boundVolume() {
    return `<a class="shelf-stage" href="${bookUrl(state.place)}" aria-label="Открыть том «Маяк Между Ветрами» на закладке"><span class="sr-only">Сапфировый переплёт с золотым маяком и четырьмя латунными кольцами</span></a>`;
  }
  function shortcut(action, title, description, media) {
    return `<button type="button" class="shortcut" data-do="${action}"><span class="shortcut-art">${media}</span>
      <span class="shortcut-copy"><strong>${title}</strong><small>${description}</small></span>${icon('chevron')}</button>`;
  }
  function portraits(ids) {
    return (
      '<span class="portrait-stack">' +
      ids.map((id) => '<img src="' + art(id) + '" alt="">').join('') +
      '</span>'
    );
  }
  function shelf() {
    const p = state.place;
    const c = chapters[p.chapter];
    const tableFight = E.fights[E.defaultFight()];
    return `<div class="library layout">
      <div class="library-heading"><h1>Книжная полка</h1><span class="catalog-count">${icon('shelf')}1 кампания</span></div>
      <article class="featured-volume" aria-label="Маяк Между Ветрами">
        ${boundVolume()}
        <div class="volume-ledger"><div class="volume-state"><span class="state-dot"></span>В процессе</div>
          <h2>Маяк <span>Между Ветрами</span></h2>
          <div class="binding-sign"><span></span><i aria-hidden="true">✦</i><span></span></div>
          <div class="bookmark-caption">${icon('bookmark')}Закладка партии</div>
          <h3>Глава ${romans[p.chapter]} · ${esc(c.title)}</h3>
          <p class="scene-caption">Сцена ${p.scene + 1} из ${c.scenes.length} · ${esc(c.scenes[p.scene].title)}</p>
          ${ticks(p.chapter)}<div class="progress-caption">Пройдено ${state.played.length} из ${chapters.length} глав</div>
          <div class="ledger-buttons"><a class="primary" href="${bookUrl(p)}">Продолжить с закладки ${icon('arrow')}</a>
            ${button('contents', 'Оглавление', 'list')}</div>
          ${E.journal.slip()}
        </div>
      </article>
      <div class="section-heading"><h2>Под рукой</h2><div></div>${button('atlas', 'Карта партии', 'map', 'atlas-shelf-link text-button')}</div>
      <nav class="shortcuts" aria-label="Инструменты кампании">
        ${shortcut('cast', 'Персонажи', 'Герои и жители островов', portraits(['finn', 'tess', 'asya']))}
        ${shortcut('field', 'Поле боя', esc(tableFight.title), '<img class="map-thumb" src="' + window.LighthouseBoard.mapArt(tableFight.map) + '" alt="">')}
        ${shortcut('dice', 'Кубики', 'Набор Маяка · d20 и d6', '<span class="dice-pair"><img src="' + ornament('d20') + '" alt=""><img src="' + ornament('d6') + '" alt=""></span>')}
      </nav><footer class="demo-footer">Демонстрационная партия · закладки и заметки хранятся в этом браузере</footer>
    </div>`;
  }

  function margins(p, delta, label) {
    const index = p.chapter * 3 + p.scene + delta;
    if (index < 0 || index >= chapters.length * 3) return '<span></span>';
    const dest = { chapter: Math.floor(index / 3), scene: index % 3 };
    return `<a class="page-link" href="${bookUrl(dest)}">${delta < 0 ? icon('back') : ''}${label}${delta > 0 ? icon('arrow') : ''}</a>`;
  }
  function characterButton(id) {
    const p = E.people[id];
    if (!p) return '';
    const src = p.portrait ? art(p.portrait) : mini(p.figure);
    return `<button class="person-chip" data-person="${id}"><img src="${src}" alt=""><span>${esc(p.name)}</span>${icon('chevron')}</button>`;
  }
  function sceneText(text, ids) {
    const names = {
      ilyr: 'Ильер',
      runa: 'Руна',
      spool: 'Шпуль',
      pom: 'Пом',
      saffra: 'Сафра',
      vey: 'Вей',
      omb: 'Омб',
      kanto: 'Канто',
      severin: 'Северин',
    };
    let result = esc(text);
    for (const id of ids) {
      const name = names[id];
      if (name)
        result = result.replace(
          new RegExp(name + '(?![а-яё])', 'u'),
          '<button class="inline-person" data-person="' + id + '">' + name + '</button>',
        );
    }
    return result;
  }
  function book() {
    const p = state.reading;
    const c = chapters[p.chapter],
      s = c.scenes[p.scene];
    const marked = same(p, state.place);
    const cue = E.cue(p),
      fight = cue.fight;
    return `<div class="reader layout">
      <nav class="book-bar" aria-label="Инструменты книги"><div class="book-nav-head"><a href="#shelf" class="back-link">${icon('back')}<span>На полку</span></a>${button('jump-preview', 'Показ игрокам', 'monitor', 'text-button jump-preview')}</div>
        <div class="book-tools">${button('contents', 'Оглавление', 'list')}${button('atlas', 'Карта партии', 'map')}${button('cast', 'Персонажи', 'people')}${button('dice', 'Кубики', 'dice')}</div></nav>
      <article class="spread" aria-label="Разворот книги мастера">
        <div class="leaf story-leaf"><div class="running-head"><span>Маяк Между Ветрами</span><span class="leaf-diamond" aria-hidden="true">✦</span></div>
          <div class="page-chapter">Глава ${romans[p.chapter]} <span>／</span> Сцена ${p.scene + 1} из ${c.scenes.length}</div>
          <h1>${esc(s.title)}</h1><p class="chapter-subtitle">${esc(c.title)}</p>
          <div class="illuminated-rule" aria-hidden="true"><i></i>✦<i></i></div>
          <h2 class="eyeline">${icon('volume')}Прочитать вслух</h2>
          <blockquote>${esc(cue.line)}</blockquote>
          <aside class="dm-cue"><h3>${icon('quill')} На заметку мастеру</h3><p>${esc(cue.prompt)}</p></aside>
          <details class="reading-details"><summary>Текст сцены ${icon('down')}</summary><p>${sceneText(s.text, c.people)}</p></details>
          <div class="paper-foot"><span>${esc(c.location)}</span><b>${String(p.chapter * 6 + p.scene * 2 + 1).padStart(2, '0')}</b></div>
        </div>
        <div class="leaf guide-leaf"><div class="running-head"><span>На столе мастера</span><span class="live-page">${icon(marked ? 'bookmark' : 'book')}${marked ? 'Закладка партии' : 'Просмотр'}</span></div>
          ${E.director.preview(p)}
          <div class="scene-guide"><div class="scene-people">${c.people.map(characterButton).join('')}</div>
          <details class="reading-details"><summary>Варианты действий ${icon('down')}</summary><ul>${s.choices.map((choice) => '<li>' + esc(choice) + '</li>').join('')}</ul></details>
          <details class="reading-details"><summary>Проверка и исход ${icon('down')}</summary><p>${esc(s.check)}</p><p>${esc(s.consequence)}</p></details>
          <div class="scene-actions">${s.rolls.length ? button('ask-check', 'Запросить проверку', 'dice', 'outline-button') : ''}
          ${cue.mark ? '<button type="button" class="outline-button" data-mark-hero="' + cue.mark + '">' + icon('quill') + (cue.mark === 'finn' ? 'Дать имя мосту' : 'Подписать место на карте') + '</button>' : ''}
          ${fight ? '<button class="primary battle-link" data-fight="' + fight + '">' + icon('swords') + 'Открыть поле боя' + icon('arrow') + '</button>' : ''}
          ${fight ? E.encounterDesk.peaceAction(fight) : ''}</div>
          </div><div class="paper-foot"><span>${esc(s.minutes)} мин · по плану сцены</span><b>${String(p.chapter * 6 + p.scene * 2 + 2).padStart(2, '0')}</b></div>
        </div>
      </article>
      <nav class="turn-pages" aria-label="Перелистывание">${margins(p, -1, 'Назад')}
        <div class="ribbon-actions">${button('memory', 'Итоги встречи', 'quill')} ${
          marked
            ? '<span class="ribbon-status">' + icon('bookmark') + 'Здесь остановилась партия</span>'
            : button('ribbon', 'Положить закладку сюда', 'bookmark') +
              '<a class="text-button" href="' +
              bookUrl(state.place) +
              '">К закладке</a>'
        }</div>
        ${margins(p, 1, 'Дальше')}</nav>
    </div>`;
  }
  E.reading = { masthead, shelf, book, characterButton, campaignTitle };
})();
