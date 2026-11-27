(() => {
  const E = window.Lighthouse;
  const { state, chapters, icon, esc, art, mini, romans, bookUrl, button, iconButton } = E;
  const dialog = document.getElementById('drawer');
  let opener, diceOrigin;
  let selected = '',
    face = 'portrait';
  let notePage;
  const contextPage = () => (state.view === 'shelf' ? state.place : state.reading);
  const heading = (
    label,
    subtitle = '',
  ) => `<div class="drawer-heading"><div>${subtitle ? '<p class="drawer-kicker">' + esc(subtitle) + '</p>' : ''}
    <h2 id="drawer-title" tabindex="-1">${esc(label)}</h2></div>${iconButton('dismiss', 'Закрыть', 'close')}</div>`;

  function contents() {
    return (
      heading('Оглавление', 'Маяк Между Ветрами') +
      '<div class="drawer-scroll"><ol class="contents-list">' +
      chapters
        .map((c, i) => {
          const marked = state.place.chapter === i;
          const played = state.played.includes(i);
          const status = marked ? 'Закладка партии' : played ? 'Пройдено' : 'Не сыграно';
          const dest = marked ? state.place : { chapter: i, scene: 0 };
          return `<li><a class="contents-row${marked ? ' marked' : ''}" href="${bookUrl(dest)}"><span class="chapter-number">${romans[i]}</span>
        <span><strong>${esc(c.title)}</strong><small>${status}</small></span>${icon(marked ? 'bookmark' : played ? 'check' : 'chevron')}</a></li>`;
        })
        .join('') +
      '</ol></div>'
    );
  }
  function cast() {
    const c = chapters[contextPage().chapter];
    const group = (title, ids) =>
      `<section class="cast-group"><h3>${title}</h3><div>${ids
        .map((id) => {
          const p = E.people[id];
          return `<button class="cast-entry" data-person="${id}"><img src="${p.portrait ? art(p.portrait) : mini(p.figure)}" alt="">
        <span><strong>${esc(p.name)}</strong><small>${esc(p.role)}</small></span>${icon('chevron')}</button>`;
        })
        .join('')}</div></section>`;
    const others = Object.keys(E.people).filter(
      (k) => E.people[k].kind === 'npc' && !c.people.includes(k),
    );
    return (
      heading('Персонажи', 'Маяк Между Ветрами') +
      '<div class="drawer-scroll">' +
      group('Герои партии', ['finn', 'tess', 'asya']) +
      group('В этой главе', c.people) +
      '<details class="reading-details"><summary>Остальные жители островов ' +
      icon('down') +
      '</summary>' +
      group('Жители островов', others) +
      '</details>' +
      group('Запасной герой', ['mika']) +
      '</div>'
    );
  }
  function person() {
    const p = E.people[selected];
    const portrait = face === 'portrait' && p.portrait;
    const stats =
      p.kind === 'hero'
        ? `<dl class="stat-line">
      <div><dt>Здоровье</dt><dd>${p.hp}</dd></div><div><dt>Класс защиты</dt><dd>${p.ac}</dd></div><div><dt>Скорость</dt><dd>${p.speed} фт.</dd></div></dl>`
        : '';
    const details =
      p.kind === 'hero'
        ? `<h3>Что умеет</h3><ul>${p.cues.map((x) => '<li>' + esc(x) + '</li>').join('')}</ul>
      <h3>Памятная вещь</h3><p>${esc(p.keepsake)}</p>`
        : `<h3>Как отыграть</h3><p>${esc(p.voice)}</p><details class="private-detail">
      <summary>${icon('lock')} Только мастеру ${icon('down')}</summary><p>${esc(p.secret)}</p><p>${esc(p.reveal)}</p></details>`;
    return (
      heading(p.name, p.role) +
      `<div class="drawer-scroll character-spread"><div class="art-column">
      <figure class="character-plate ${portrait ? 'portrait' : 'figure'}"><img src="${portrait ? art(p.portrait) : mini(p.figure)}" alt="${portrait ? 'Портрет' : 'Фигурка'} · ${esc(p.name)}"></figure>
      ${
        p.portrait
          ? `<div class="segmented" aria-label="Изображение персонажа">
        <button data-face="portrait" aria-pressed="${!!portrait}">Портрет</button><button data-face="figure" aria-pressed="${!portrait}">Фигурка</button></div>`
          : ''
      }</div>
      <div class="character-body"><div class="character-intro"><p class="character-subtitle">${esc(p.subtitle)}</p><p>${esc(p.description)}</p></div>
      ${stats}${p.kind === 'hero' ? '<button class="outline-button" data-mark-hero="' + selected + '">' + icon('map') + 'Подписать место на карте</button>' : ''}<div class="character-text"><h3>Чего хочет</h3><p>${esc(p.motive)}</p>${details}</div>
      ${button('cast', 'Все персонажи', 'back')}</div></div>`
    );
  }
  function notes() {
    const c = chapters[notePage.chapter];
    return (
      heading('Заметки мастера', 'Только на экране мастера') +
      `<div class="drawer-scroll notes-panel">
      <label for="scene-note"><span>Глава ${romans[notePage.chapter]} · Сцена ${notePage.scene + 1}</span><strong>${esc(c.scenes[notePage.scene].title)}</strong></label>
      <textarea id="scene-note" rows="8" placeholder="Что стоит вспомнить на следующей встрече?"></textarea>
      <div class="note-status" id="note-status" role="status">${icon('lock')}Личная заметка к этой сцене</div></div>`
    );
  }
  function dice() {
    let context = 'За столом мастера';
    if (state.view === 'battle') {
      const f = E.combat.frame(E.combat.key());
      context = f.place + ' · Ходит ' + f.pieces.find((p) => p.id === f.active).short;
    }
    return (
      heading('Кубики Маяка', diceOrigin?.title ?? context) + E.diceDesk.markup(diceOrigin?.kind)
    );
  }
  const screens = {
    contents,
    cast,
    person,
    notes,
    dice,
    memory: E.journal.memory,
    atlas: E.journal.atlas,
    mark: E.journal.mark,
    card: E.journal.card,
    turn: E.encounterDesk.turn,
    check: E.director.check,
    players: E.playerHost.pane,
  };
  function diceFrom(kind, source, title, settle) {
    diceOrigin = { kind, title, settle, back: source.dataset.do };
    if (kind === 'check') E.diceDesk.checkDie();
    show('dice', true, source);
  }
  function returnFromDice() {
    const from = diceOrigin;
    if (!from || dialog.dataset.pane !== 'dice') return false;
    diceOrigin = null;
    show(from.kind, false);
    dialog.querySelector('[data-do="' + from.back + '"]')?.focus({ preventScroll: true });
    return true;
  }
  dialog.addEventListener('cancel', (event) => {
    if (returnFromDice()) event.preventDefault();
  });
  function show(kind, focus = true, source) {
    if (!dialog.open) opener = source ?? document.activeElement;
    E.diceDesk.leave();
    if (kind === 'notes') notePage = { ...contextPage() };
    dialog.innerHTML = screens[kind]();
    dialog.dataset.pane = kind;
    if (kind === 'notes')
      dialog.querySelector('textarea').value = state.notes[E.placeKey(notePage)] ?? '';
    if (!dialog.open) dialog.showModal();
    if (kind === 'dice') E.diceDesk.enter(dialog);
    if (kind === 'players') E.playerHost.presence();
    if (focus) dialog.querySelector('#drawer-title').focus();
  }
  function showPerson(id, source) {
    if (!E.people[id]) return;
    selected = id;
    face = E.people[id].portrait ? 'portrait' : 'figure';
    show('person', true, source);
  }
  function dismiss() {
    diceOrigin = null;
    E.diceDesk.leave();
    if (dialog.open) dialog.close();
  }
  dialog.addEventListener('close', () => {
    if (dialog.open) return;
    diceOrigin = null;
    E.diceDesk.leave();
    if (
      location.hash.startsWith('#person/') ||
      location.hash.startsWith('#check/') ||
      location.hash === '#players' ||
      location.hash === '#dice'
    )
      history.replaceState(null, '', E.bookUrl(state.reading));
    if (opener?.isConnected) opener.focus({ preventScroll: true });
    opener = null;
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) {
      const r = dialog.getBoundingClientRect();
      if (
        event.clientX < r.left ||
        event.clientX > r.right ||
        event.clientY < r.top ||
        event.clientY > r.bottom
      )
        dismiss();
    }
    if (event.target.closest('a[href^="#book"]')) dismiss();
  });
  dialog.addEventListener('input', (event) => {
    if (event.target.id !== 'scene-note') return;
    state.notes[E.placeKey(notePage)] = event.target.value;
    dialog.querySelector('#note-status').textContent = E.save()
      ? 'Сохранено в этом браузере'
      : 'Сохранено до закрытия вкладки';
  });
  function handle(el) {
    if (el.dataset.person) {
      showPerson(el.dataset.person, el);
      return true;
    }
    if (el.dataset.face) {
      face = el.dataset.face;
      show('person', false);
      dialog.querySelector('[data-face="' + face + '"]').focus();
      return true;
    }
    if (el.dataset.do === 'dice-back' && returnFromDice()) return true;
    if (
      E.diceDesk.handle(el) ||
      E.playerHost.handle(el) ||
      E.journal.handle(el) ||
      E.director.handle(el) ||
      E.encounterDesk.handle(el)
    )
      return true;
    const action = el.dataset.do;
    if (Object.hasOwn(screens, action) && action !== 'person') {
      show(action, true, el);
      return true;
    }
    if (action === 'dismiss') {
      if (!returnFromDice()) dismiss();
      return true;
    }
    return false;
  }
  E.drawers = {
    show,
    showPerson,
    dismiss,
    handle,
    heading,
    diceFrom,
    onRolled: (value) => diceOrigin?.settle?.(value),
  };
})();
