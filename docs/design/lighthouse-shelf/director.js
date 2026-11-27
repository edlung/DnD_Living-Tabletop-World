(() => {
  const E = window.Lighthouse,
    { esc, icon, button, state } = E;
  const labels = {
    perception: 'Внимательность',
    investigation: 'Анализ',
    survival: 'Выживание',
    nature: 'Природа',
    dex: 'Ловкость',
    str: 'Сила',
    persuasion: 'Убеждение',
    arcana: 'Магия',
    insight: 'Проницательность',
    performance: 'Выступление',
  };
  const names = ['finn', 'tess', 'asya'];
  let sceneKey = '',
    selected = 'place',
    request;
  function card(id) {
    const c = E.handouts[id];
    return {
      type: 'handout',
      title: c.title,
      text: c.text,
      task: c.task,
      style: id === 'four-rings' ? 'slate' : 'paper',
    };
  }
  function locationFrame(p) {
    const c = E.chapters[p.chapter];
    const art =
      p.chapter === 5 && p.scene === 0
        ? 'forge-strike'
        : p.chapter === 5 && p.scene === 2
          ? 'moment'
          : c.place;
    return { type: 'place', title: c.location, art };
  }
  function preview(p) {
    const key = E.placeKey(p),
      cue = E.cue(p);
    if (key !== sceneKey) {
      sceneKey = key;
      selected = 'place';
      request = null;
    }
    const frame = selected === 'place' ? locationFrame(p) : card(selected);
    const options = [
      ['place', 'Место'],
      ...cue.cards.map((id, i) => [
        id,
        cue.cards.length === 1 ? 'Раздатка' : 'Раздатка ' + (i + 1),
      ]),
    ];
    const tabs =
      options.length > 1
        ? '<div class="preview-options" role="group" aria-label="Материал для показа">' +
          options
            .map(
              ([id, label]) =>
                '<button type="button" data-preview="' +
                id +
                '" aria-pressed="' +
                (selected === id) +
                '" title="' +
                esc(id === 'place' ? E.chapters[p.chapter].location : E.handouts[id].title) +
                '">' +
                label +
                '</button>',
            )
            .join('') +
          '</div>'
        : '';
    return (
      '<section id="story-preview" tabindex="-1" class="story-preview" aria-label="Предпросмотр для игроков"><div class="preview-head">' +
      tabs +
      '<span data-tv-status>Предпросмотр мастера</span></div><div id="public-preview-art" class="preview-window">' +
      window.LighthouseShow.markup(frame, true) +
      '</div>' +
      (frame.type === 'handout'
        ? '<button type="button" class="read-handout" data-do="read-handout" aria-controls="public-preview-art" aria-expanded="false">Развернуть текст</button>'
        : '') +
      '<button type="button" class="project-button story-cast" data-do="send-story" ' +
      (frame.art === 'forge-strike' ? 'data-strike-cast' : '') +
      '>' +
      icon('monitor') +
      '<span>' +
      (selected === 'place' ? 'Показать место на телевизоре' : 'Выдать раздатку игрокам') +
      '</span></button>' +
      (frame.type === 'handout'
        ? '<button class="text-button handout-tv" data-do="card-tv" hidden>' +
          icon('monitor') +
          'Показать раздатку на телевизоре</button>'
        : '') +
      '</section>'
    );
  }
  function checkState() {
    const s = E.chapters[state.reading.chapter].scenes[state.reading.scene];
    if (!request) request = { hero: 'finn', key: s.rolls[0].key, face: null, asked: false };
    const ticket = E.playerHost.find(
      E.placeKey(state.reading),
      request.hero,
      request.key,
      request.ticketId,
    );
    if (ticket?.status === 'answered') request.face = ticket.face;
    return {
      s,
      actor: E.people[request.hero],
      roll: s.rolls.find((o) => o.key === request.key),
      ticket,
    };
  }
  function openCheck(hero, skill, source, ticketId) {
    const s = E.chapters[state.reading.chapter].scenes[state.reading.scene];
    if (!s.rolls.length) return;
    if (names.includes(hero)) {
      request = {
        hero,
        key: s.rolls.some((r) => r.key === skill) ? skill : s.rolls[0].key,
        ticketId,
        face: null,
        asked: false,
      };
    }
    E.drawers.show('check', true, source);
  }
  function check() {
    const { s, actor, roll, ticket } = checkState(),
      add = actor.modifiers[roll.key];
    const waiting = ticket?.status === 'pending',
      answered = ticket?.status === 'answered';
    const note = waiting
      ? 'Ожидаем бросок игрока'
      : answered
        ? 'Игрок бросил d20'
        : ticket?.status === 'cancelled'
          ? 'Запрос отозван'
          : '';
    const personal =
      '<div class="personal-check"><div class="personal-check-actions">' +
      (waiting
        ? button('cancel-player-check', 'Отозвать запрос', 'back', 'outline-button')
        : button(
            'ask-player',
            answered ? 'Попросить новый бросок' : 'Попросить игрока бросить',
            'dice',
            'primary',
          )) +
      '<button type="button" class="text-button" data-open-seat="' +
      request.hero +
      '">Открыть экран игрока</button></div>' +
      (note
        ? '<p class="seat-request-status" role="status">' +
          icon(waiting ? 'clock' : answered ? 'check' : 'back') +
          note +
          ' · ' +
          esc(actor.name) +
          '</p>'
        : '') +
      '</div>';
    let result = '';
    if (request.face !== null) {
      const total = request.face + add;
      result =
        '<div class="check-result" role="status"><strong>' +
        total +
        (total >= roll.dc ? ' · Проверка пройдена' : ' · Осложнение') +
        '</strong><span>d20 (' +
        request.face +
        ') ' +
        (add >= 0 ? '+ ' : '− ') +
        Math.abs(add) +
        ' · Сложность ' +
        roll.dc +
        '</span></div>' +
        (total < roll.dc ? '<p class="dm-after">' + esc(s.consequence) + '</p>' : '') +
        button('check-publish', 'Показать итог игрокам', 'monitor', 'outline-button');
    }
    return (
      E.drawers.heading('Проверка за столом', s.title) +
      '<div class="drawer-scroll journal-body"><div class="session-form"><label>Кто бросает<select id="check-hero">' +
      names
        .map(
          (id) =>
            '<option value="' +
            id +
            '" ' +
            (id === request.hero ? 'selected' : '') +
            '>' +
            esc(E.people[id].name) +
            '</option>',
        )
        .join('') +
      '</select></label>' +
      '<label>Проверка<select id="check-skill">' +
      s.rolls
        .map(
          (o) =>
            '<option value="' +
            o.key +
            '" ' +
            (o.key === request.key ? 'selected' : '') +
            '>' +
            labels[o.key] +
            ' · Сл ' +
            o.dc +
            '</option>',
        )
        .join('') +
      '</select></label>' +
      '<p class="check-rule">' +
      esc(s.check) +
      '</p>' +
      personal +
      button('ask-table', 'Попросить бросок на телевизоре', 'monitor', 'outline-button') +
      '<p class="ask-status" role="status">' +
      (request.asked ? 'Запрос показан игрокам.' : '') +
      '</p></div>' +
      (waiting || answered
        ? ''
        : '<div class="check-answers">' +
          button('check-dice', 'Бросить d20 за столом', 'dice', 'outline-button') +
          '<form class="session-form physical-check" data-form="physical"><label>Если бросили свой кубик<input name="face" type="number" inputmode="numeric" min="1" max="20" required placeholder="1–20"></label><button class="outline-button" type="submit">Записать бросок</button></form></div>') +
      result +
      '</div>'
    );
  }
  function checkFrame(withResult) {
    const { actor, roll } = checkState();
    const f = {
      type: 'check',
      title: 'Проверка',
      hero: request.hero,
      who: actor.name,
      skill: labels[roll.key],
    };
    if (withResult) {
      f.total = request.face + actor.modifiers[roll.key];
      f.passed = f.total >= roll.dc;
    }
    return f;
  }
  function handle(el) {
    if (el.dataset.preview) {
      const id = el.dataset.preview;
      if (id !== 'place' && !E.cue(state.reading).cards.includes(id)) return false;
      selected = id;
      document.getElementById('story-preview').outerHTML = preview(state.reading);
      E.projection.status();
      document.querySelector('[data-preview="' + id + '"]').focus({ preventScroll: true });
      return true;
    }
    switch (el.dataset.do) {
      case 'read-handout': {
        const expanded = document.getElementById('public-preview-art').classList.toggle('unfolded');
        el.setAttribute('aria-expanded', String(expanded));
        el.textContent = expanded ? 'Свернуть текст' : 'Развернуть текст';
        return true;
      }
      case 'jump-preview': {
        const panel = document.getElementById('story-preview');
        panel.focus({ preventScroll: true });
        panel.scrollIntoView({ block: 'start' });
        return true;
      }
      case 'card-tv':
      case 'send-story': {
        const id = selected;
        if (id === 'place') E.projection.story(locationFrame(state.reading));
        else {
          const issue = () => {
            E.session.write('issued/' + id, { key: id, when: Date.now() });
            if (E.playerHost.invited()) void E.playerHost.sync();
            E.notify('Раздатка выдана партии.');
          };
          if (el.dataset.do === 'send-story' && E.playerHost.invited() && !E.projection.connected())
            issue();
          else E.projection.story(card(id), issue);
        }
        return true;
      }
      case 'ask-check':
        openCheck(null, null, el);
        return true;
      case 'ask-player': {
        const { actor, roll } = checkState();
        request.ticketId = E.playerHost.ask(
          E.placeKey(state.reading),
          request.hero,
          roll.key,
          labels[roll.key],
          actor.modifiers[roll.key],
          roll.dc,
        ).id;
        request.face = null;
        E.drawers.show('check', false);
        document.querySelector('[data-do="cancel-player-check"]')?.focus({ preventScroll: true });
        return true;
      }
      case 'cancel-player-check': {
        const { ticket } = checkState();
        if (ticket) E.playerHost.cancel(ticket.id);
        E.drawers.show('check', false);
        document.querySelector('[data-do="ask-player"]')?.focus({ preventScroll: true });
        return true;
      }
      case 'ask-table': {
        const current = request,
          { hero, key } = current;
        E.projection.story(checkFrame(false), () => {
          if (request !== current || request.hero !== hero || request.key !== key) return;
          request.asked = true;
          const out = document.querySelector('.ask-status');
          if (out) out.textContent = 'Запрос показан игрокам.';
        });
        return true;
      }
      case 'check-dice': {
        const r = request;
        E.drawers.diceFrom('check', el, E.people[r.hero].name + ' · ' + labels[r.key], (value) => {
          if (request === r) r.face = value;
        });
        return true;
      }
      case 'check-publish':
        if (Number.isInteger(request?.face)) E.projection.story(checkFrame(true));
        return true;
      default:
        return false;
    }
  }
  document.addEventListener('change', (e) => {
    if (!['check-hero', 'check-skill'].includes(e.target.id)) return;
    const id = e.target.id;
    request[id === 'check-hero' ? 'hero' : 'key'] = e.target.value;
    request.face = null;
    request.asked = false;
    request.ticketId = null;
    E.drawers.show('check', false);
    document.getElementById(id).focus();
  });
  document.addEventListener('submit', (e) => {
    if (e.target.dataset.form !== 'physical') return;
    e.preventDefault();
    const value = e.target.elements.namedItem('face').valueAsNumber;
    if (Number.isInteger(value) && value >= 1 && value <= 20) {
      request.face = value;
      E.drawers.show('check');
    }
  });
  document.addEventListener('lighthouse-player-answer', ({ detail: c }) => {
    if (
      !document.querySelector('dialog[open][data-pane="check"]') ||
      E.placeKey(state.reading) !== c.scene ||
      request?.hero !== c.hero ||
      request?.key !== c.skill ||
      (request.ticketId && request.ticketId !== c.id)
    )
      return;
    const focusId = document.activeElement?.id;
    E.drawers.show('check', false);
    (document.getElementById(focusId) || document.querySelector('.check-result'))?.focus({
      preventScroll: true,
    });
  });
  E.director = { preview, check, openCheck, card, handle };
})();
