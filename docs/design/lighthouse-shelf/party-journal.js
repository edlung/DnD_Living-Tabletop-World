(() => {
  const E = window.Lighthouse,
    S = E.session,
    { esc, icon, button } = E;
  const party = ['finn', 'tess', 'asya', 'mika'];
  let recapId = null,
    editing = false,
    markHero = 'finn',
    markAt = 'forge',
    cardKey = null;
  const dialog = () => document.getElementById('drawer');
  const head = (label, kicker) => E.drawers.heading(label, kicker);
  const currentPlace = () =>
    E.chapters[(E.state.view === 'shelf' ? E.state.place : E.state.reading).chapter].place;
  const date = (when) =>
    new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long', year: 'numeric' }).format(when);
  const rowText = (rows) =>
    '<dl class="recap-lines">' +
    S.recapRows
      .map(
        ([, label], i) => '<div><dt>' + label + '</dt><dd>' + esc(rows[i] || '—') + '</dd></div>',
      )
      .join('') +
    '</dl>';
  function slip() {
    const last = S.recaps()[0];
    return (
      '<section class="memory-slip" data-memory-slip>' +
      (last ? '<h3>С прошлой встречи</h3>' + rowText(last.lines) : '') +
      button(
        'memory',
        last ? 'Открыть записи' : 'Записать итоги встречи',
        'quill',
        'text-button memory-link',
      ) +
      '</section>'
    );
  }
  function refresh() {
    document.querySelectorAll('[data-memory-slip]').forEach((el) => {
      el.outerHTML = slip();
    });
  }
  function openMemory(el) {
    recapId = S.recaps()[0]?.id ?? null;
    editing = !recapId;
    E.drawers.show('memory', true, el);
  }
  function memory() {
    const all = S.recaps(),
      record = all.find((r) => r.id === recapId);
    const title = editing ? (record ? 'Исправить запись' : 'Итоги встречи') : 'Память партии';
    let body = '';
    if (editing) {
      body =
        '<form class="session-form" data-form="recap">' +
        S.recapRows
          .map(
            ([key, label], i) =>
              '<label>' +
              label +
              '<textarea name="' +
              key +
              '" maxlength="320" rows="2">' +
              esc(record?.lines[i] ?? '') +
              '</textarea></label>',
          )
          .join('') +
        '<button class="primary" type="submit">Сохранить итоги</button></form>';
    } else if (record) {
      body =
        (all.length > 1
          ? '<label class="select-label">Встреча<select id="recap-which">' +
            all
              .map(
                (r, i) =>
                  '<option value="' +
                  esc(r.id) +
                  '" ' +
                  (r.id === record.id ? 'selected' : '') +
                  '>Встреча ' +
                  (all.length - i) +
                  ' · ' +
                  date(r.when) +
                  '</option>',
              )
              .join('') +
            '</select></label>'
          : '<p class="entry-date">' + date(record.when) + '</p>') +
        rowText(record.lines) +
        '<div class="journal-actions">' +
        button('recap-new', 'Новая встреча', 'plus', 'primary') +
        button('recap-edit', 'Исправить запись', 'quill', 'outline-button') +
        '</div>';
    }
    return (
      head(title, 'Закладка партии') +
      '<div class="drawer-scroll journal-body">' +
      body +
      '<p class="save-status" role="status"></p></div>'
    );
  }
  function openMark(hero, el, at = currentPlace()) {
    markHero = party.includes(hero) ? hero : 'finn';
    markAt = Object.hasOwn(E.places, at) ? at : currentPlace();
    E.drawers.show('mark', true, el);
  }
  function mark() {
    const hero = E.people[markHero];
    const labels = {
      finn: 'Название моста или места',
      tess: 'Название пути или места',
      asya: 'Название сада или места',
      mika: 'Название открытия или места',
    };
    const record = S.read('mark/' + markHero + '/' + markAt);
    return (
      head('Оставить имя на карте', hero.name) +
      '<div class="drawer-scroll journal-body"><form data-form="mark" class="session-form">' +
      '<label>Чья подпись<select name="hero">' +
      party
        .map(
          (id) =>
            '<option value="' +
            id +
            '" ' +
            (id === markHero ? 'selected' : '') +
            '>' +
            esc(E.people[id].name) +
            '</option>',
        )
        .join('') +
      '</select></label>' +
      '<label>Где на карте<select name="at">' +
      Object.entries(E.places)
        .map(
          ([id, p]) =>
            '<option value="' +
            id +
            '" ' +
            (id === markAt ? 'selected' : '') +
            '>' +
            esc(p.name) +
            '</option>',
        )
        .join('') +
      '</select></label>' +
      '<label>' +
      labels[markHero] +
      '<input name="name" required maxlength="64" autocomplete="off" value="' +
      esc(record?.name ?? '') +
      '"></label>' +
      '<button type="submit" class="primary">Подписать на карте</button></form></div>'
    );
  }
  function atlas() {
    const marks = S.marks(),
      published = S.list('issued')
        .filter((c) => Object.hasOwn(E.handouts, c.key))
        .sort((a, b) => a.when - b.when);
    const rows = marks
      .map(
        (m) =>
          '<li><button class="atlas-mark-row" data-edit-hero="' +
          m.hero +
          '" data-at="' +
          m.at +
          '"><img src="' +
          E.art(m.hero) +
          '" alt=""><span><strong>' +
          esc(m.name) +
          '</strong><small>' +
          esc(E.people[m.hero].name) +
          ' · ' +
          esc(E.places[m.at].name) +
          '</small></span>' +
          icon('quill') +
          '</button></li>',
      )
      .join('');
    return (
      head('Карта партии', 'Острова Между Ветрами') +
      '<div class="drawer-scroll atlas-body"><div class="atlas-preview">' +
      window.LighthouseShow.markup(S.atlas(), true) +
      '</div>' +
      '<div class="journal-actions">' +
      button('cast-atlas', 'Показать карту на телевизоре', 'monitor', 'primary') +
      button('mark', 'Подписать место', 'quill', 'outline-button') +
      '</div>' +
      (rows ? '<ul class="atlas-ledger">' + rows + '</ul>' : '') +
      (published.length
        ? '<section class="archive"><h3>Раздатки партии</h3>' +
          published
            .map(
              (c) =>
                '<button class="archive-card" data-issued="' +
                esc(c.key) +
                '">' +
                icon('book') +
                esc(E.handouts[c.key].title) +
                icon('chevron') +
                '</button>',
            )
            .join('') +
          '</section>'
        : '') +
      '</div>'
    );
  }
  function card() {
    return (
      head(E.handouts[cardKey].title, 'Из раздаток партии') +
      '<div class="drawer-scroll journal-body"><div class="archive-preview">' +
      window.LighthouseShow.markup(E.director.card(cardKey), true) +
      '</div><div class="journal-actions">' +
      button('give-again', 'Показать на телевизоре', 'monitor', 'primary') +
      button('atlas', 'К карте', 'back', 'outline-button') +
      '</div></div>'
    );
  }
  function handle(el) {
    if (el.dataset.editHero) {
      openMark(el.dataset.editHero, el, el.dataset.at);
      return true;
    }
    if (el.dataset.markHero) {
      openMark(el.dataset.markHero, el);
      return true;
    }
    if (el.dataset.issued && Object.hasOwn(E.handouts, el.dataset.issued)) {
      cardKey = el.dataset.issued;
      E.drawers.show('card', true, el);
      return true;
    }
    switch (el.dataset.do) {
      case 'memory':
        openMemory(el);
        return true;
      case 'recap-new':
        recapId = null;
        editing = true;
        E.drawers.show('memory');
        return true;
      case 'recap-edit':
        editing = true;
        E.drawers.show('memory');
        return true;
      case 'atlas':
        E.drawers.show('atlas', true, el);
        return true;
      case 'mark':
        openMark('finn', el);
        return true;
      case 'cast-atlas':
        E.projection.story(S.atlas());
        return true;
      case 'give-again':
        E.projection.story(E.director.card(cardKey));
        return true;
      default:
        return false;
    }
  }
  document.addEventListener('submit', (event) => {
    const form = event.target;
    if (form.dataset.form === 'recap') {
      event.preventDefault();
      const fields = S.recapRows.map(([key]) => form.elements.namedItem(key)),
        lines = fields.map((f) => f.value.trim());
      if (!lines.some(Boolean)) {
        fields[0].setCustomValidity('Запишите хотя бы одну строку о встрече.');
        fields[0].reportValidity();
        return;
      }
      const old = recapId ? S.read('recap/' + recapId) : null;
      const id = recapId ?? crypto.randomUUID();
      const saved = S.write('recap/' + id, { id, when: old?.when ?? Date.now(), lines });
      recapId = id;
      editing = false;
      refresh();
      E.drawers.show('memory');
      dialog().querySelector('.save-status').textContent = saved
        ? 'Итоги сохранены рядом с закладкой.'
        : 'Итоги доступны до закрытия вкладки.';
    } else if (form.dataset.form === 'mark') {
      event.preventDefault();
      const field = form.elements.namedItem('name'),
        name = field.value.trim();
      if (!name) {
        field.setCustomValidity('Введите имя, которое выбрала партия.');
        field.reportValidity();
        return;
      }
      const saved = S.write('mark/' + markHero + '/' + markAt, {
        hero: markHero,
        at: markAt,
        name,
      });
      E.drawers.show('atlas');
      E.notify(
        saved ? 'Подпись появилась на карте партии.' : 'Подпись доступна до закрытия вкладки.',
      );
    }
  });
  document.addEventListener('input', (event) => {
    if (event.target.closest('[data-form="recap"]'))
      event.target.form.elements.namedItem('discovery').setCustomValidity('');
    if (event.target.name === 'name' && event.target.closest('[data-form="mark"]'))
      event.target.setCustomValidity('');
  });
  document.addEventListener('change', (event) => {
    if (event.target.id === 'recap-which') {
      recapId = event.target.value;
      E.drawers.show('memory', false);
      dialog().querySelector('select').focus();
    }
    const form = event.target.closest('[data-form="mark"]');
    if (form && event.target.tagName === 'SELECT') {
      const typed = form.elements.namedItem('name'),
        previous = S.read('mark/' + markHero + '/' + markAt)?.name ?? '';
      const draft = typed.value !== previous ? typed.value : null;
      markHero = form.elements.namedItem('hero').value;
      markAt = form.elements.namedItem('at').value;
      E.drawers.show('mark', false);
      if (draft !== null) dialog().querySelector('[name="name"]').value = draft;
      dialog()
        .querySelector('[name="' + event.target.name + '"]')
        .focus();
    }
  });
  window.addEventListener('storage', refresh);
  E.journal = { memory, atlas, mark, card, slip, handle };
})();
