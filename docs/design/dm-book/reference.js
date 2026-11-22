(() => {
  const { el, icon, button, photo, illustration, baseArt } = window.dmElements;
  const { places, people, kinds, art } = window.dmLibrary;
  const story = window.dmStory;

  function heading(kicker, title) {
    return el(
      'header',
      'reference-heading',
      el('span', 'section-kicker', kicker),
      el('h2', '', title),
    );
  }
  function link(label, action, symbol = 'arrowRight') {
    return button('paper-action', action, label, icon(symbol));
  }
  function checkOutcomes(cue) {
    const controls = el('div', 'outcome-controls');
    controls.setAttribute('role', 'group');
    controls.setAttribute('aria-label', 'Исход проверки');
    const result = el('p', '', cue.outcomes[0]);
    result.setAttribute('aria-live', 'polite');
    ['Успех', 'Неудача'].forEach((label, index) => {
      const choice = button(
        '',
        (node) => {
          for (const item of controls.children)
            item.setAttribute('aria-pressed', String(item === node));
          result.textContent = cue.outcomes[index];
        },
        label,
      );
      choice.setAttribute('aria-pressed', String(index === 0));
      controls.append(choice);
    });
    return [controls, result];
  }
  function scenePage(view, action) {
    const { scene, index, cueKey } = view;
    const cue = scene.cues[cueKey];
    const base = baseArt(scene);
    const selected = cue?.art || base;
    const [kind, symbol] = kinds[cue?.kind || 'scene'];
    const kindLabel = cue ? kind : 'Ведение сцены';
    const title = cue?.title || scene.guide[0];
    const note = el(
      'section',
      cue ? 'note moment' : 'note',
      el('div', 'note-kind', icon(symbol), kindLabel),
      el('h2', '', title),
    );
    if (cue?.test) {
      note.append(el('div', 'test-line', el('span', 'dc', 'СЛ ' + cue.dc), cue.test));
    }
    note.append(el('p', '', cue?.brief || scene.guide[1]));
    for (const [label, text] of cue?.details || []) {
      note.append(el('div', 'note-detail', el('h3', '', label), el('p', '', text)));
    }
    if (cue?.outcomes) note.append(...checkOutcomes(cue));
    const actions = el('div', 'note-links');
    if (cue?.route) actions.append(link(cue.route[1], () => action.go(cue.route[0])));
    if (cue) {
      actions.append(
        button('paper-action secondary', action.toText, icon('arrowLeft'), 'К строке'),
      );
    } else {
      const [firstKey, firstCue] = Object.entries(scene.cues)[0];
      actions.append(link(firstCue.title, () => action.cue(firstKey, true)));
    }
    note.append(actions);
    return {
      image: selected,
      content: [illustration(base, selected, index, action.enlarge), note],
    };
  }
  function personPage(view, action) {
    const key = view.person;
    const [name, role, text, , entryId] = people[key];
    const portrait = button('portrait-button', (node) => action.enlarge(key, node), photo(key));
    portrait.setAttribute('aria-label', 'Увеличить портрет — ' + name);
    const card = el(
      'div',
      'directory-detail',
      portrait,
      el(
        'div',
        '',
        el('h3', '', name),
        el('p', 'role', role),
        el('p', '', text),
        link('К сцене персонажа', () => action.go(entryId)),
      ),
    );
    const list = el('ul', 'directory-list');
    for (const [personKey, [fullName]] of Object.entries(people)) {
      const chosen = key === personKey;
      const item = button(
        '',
        () => action.person(personKey),
        fullName,
        el('span', 'trailing', icon(chosen ? 'check' : 'arrowRight')),
      );
      item.setAttribute('aria-pressed', String(chosen));
      list.append(el('li', '', item));
    }
    return {
      image: baseArt(view.scene),
      content: [heading('Справочник', 'Действующие лица'), card, list],
    };
  }
  function atlasPage(view, action) {
    const [name, , , description] = places[view.place];
    const scene = story.find((item) => item.place === view.place);
    const select = el('select');
    select.id = 'atlas-place';
    for (const [key, [label, area]] of Object.entries(places)) {
      const option = el('option', '', label + ' · ' + area);
      option.value = key;
      option.selected = view.place === key;
      select.append(option);
    }
    select.addEventListener('change', () => action.place(select.value));
    const label = el('label', 'field-label', 'Место на маршруте');
    label.htmlFor = select.id;
    const details = el(
      'div',
      'atlas-detail',
      el('h3', '', name),
      el('p', '', description),
      link('Открыть разворот · ' + scene.title, () => action.go(scene.id)),
    );
    const selector = el('div', 'select-wrap', select, icon('down'));
    return {
      image: 'fens',
      content: [
        heading('Атлас', 'Северные топи'),
        illustration('fens', 'fens', view.index, action.enlarge),
        label,
        selector,
        details,
      ],
    };
  }
  function noteIndex(view, action) {
    const list = el('ul', 'note-index');
    for (const [index, scene] of story.entries()) {
      const marked = view.marks.includes(scene.id);
      if (!marked && !view.notes[scene.id]?.trim()) continue;
      const item = button(
        '',
        () => action.go(scene.id),
        icon(marked ? 'bookmark' : 'quill'),
        scene.title,
        el('span', 'trailing', 'с. ' + (index * 2 + 1)),
      );
      list.append(el('li', '', item));
    }
    return list.childElementCount
      ? list
      : el('p', 'empty-index', 'Здесь появятся развороты с вашими закладками и заметками.');
  }
  function notesPage(view, action) {
    const input = el('textarea', 'notes-input');
    input.id = 'scene-notes';
    input.placeholder = 'Решение игроков, имя свидетеля, последняя реплика…';
    input.value = view.notes[view.scene.id] || '';
    const label = el('label', 'field-label', 'Заметка к развороту «' + view.scene.title + '»');
    label.htmlFor = input.id;
    const status = el(
      'p',
      'storage-status',
      view.saved
        ? 'Заметка хранится в этом браузере.'
        : 'Хранилище браузера недоступно. Заметка доступна до закрытия страницы.',
    );
    const index = el('div', '', noteIndex(view, action));
    input.addEventListener('input', () => {
      const saved = action.saveNote(input.value);
      status.textContent = saved
        ? 'Сохранено в этом браузере.'
        : 'Хранилище браузера недоступно. Заметка доступна до закрытия страницы.';
      index.replaceChildren(noteIndex(view, action));
    });
    const marked = view.marks.includes(view.scene.id);
    const marker = button(
      'paper-action',
      (node) => {
        const active = action.mark();
        node.setAttribute('aria-pressed', String(active));
        node.replaceChildren(
          icon('bookmark'),
          active ? 'Убрать закладку' : 'Заложить этот разворот',
        );
        index.replaceChildren(noteIndex(view, action));
      },
      icon('bookmark'),
      marked ? 'Убрать закладку' : 'Заложить этот разворот',
    );
    marker.setAttribute('aria-pressed', String(marked));
    return {
      image: baseArt(view.scene),
      content: [
        heading('Записи Мастера', 'Заметки на полях'),
        label,
        input,
        status,
        marker,
        el('h3', 'small-heading', 'Отмеченные развороты'),
        index,
      ],
    };
  }
  const pages = { scene: scenePage, people: personPage, atlas: atlasPage, notes: notesPage };
  window.dmReference = (view, actions) => {
    const page = pages[view.tab](view, actions);
    const panel = document.querySelector('#reference-panel');
    panel.replaceChildren(...page.content);
    panel.setAttribute(
      'aria-label',
      { scene: 'Материалы сцены', people: 'Персонажи', atlas: 'Атлас', notes: 'Заметки' }[view.tab],
    );
    document.body.dataset.ink = art[page.image][2] || art[baseArt(view.scene)][2];
    panel.scrollTop = 0;
  };
})();
