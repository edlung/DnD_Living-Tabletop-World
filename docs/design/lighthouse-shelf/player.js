(() => {
  const W = window.LighthouseWire,
    B = window.LighthouseBoard,
    Show = window.LighthouseShow;
  const Dice = window.LighthousePlayerRoll,
    esc = B.esc,
    icon = window.shelfIcon;
  const params = new URLSearchParams(location.hash.slice(1));
  const hero = Object.hasOwn(window.LighthouseHeroes, params.get('hero'))
    ? params.get('hero')
    : 'asya';
  const sheet = window.LighthouseHeroes[hero],
    seat = params.get('seat');
  const invited = /^[a-f0-9]{40}$/.test(seat || '');
  const $ = (id) => document.getElementById(id);
  const main = $('player-main');
  const fieldOpen = () =>
    document.fullscreenElement === main || main.classList.contains('expanded-field');
  const sections = { table: 'За столом', hero: 'Мой герой', journal: 'Журнал' };
  const symbols = { table: 'compass', hero: 'token', journal: 'book' };
  const statNames = {
    str: 'Сила',
    dex: 'Ловкость',
    con: 'Телосложение',
    int: 'Интеллект',
    wis: 'Мудрость',
    cha: 'Харизма',
  };
  let tab = invited ? 'table' : 'hero',
    pose = 'portrait';
  let view = { hero, hp: sheet.hp, checks: [], cards: [], atlas: null, show: null };
  let online = false,
    port = null,
    lastDirect = 0,
    polling = false;
  let dismissed = '',
    readCards = 0,
    fieldCheckId = null;
  try {
    dismissed = sessionStorage.getItem('lighthouse-tray-' + seat) || '';
    readCards = Number(sessionStorage.getItem('lighthouse-cards-' + seat)) || 0;
  } catch {
    /* Guest mode. */
  }
  const cache = new WeakMap();
  function paint(node, html) {
    if (cache.get(node) !== html) {
      node.innerHTML = html;
      cache.set(node, html);
    }
  }
  function identity() {
    const rank = sheet.subtitle.split(' · ');
    $('identity').innerHTML =
      '<div class="id-band"><div class="id-medallion"><img src="' +
      B.portraitArt(hero) +
      '" alt=""></div>' +
      '<div class="id-name"><span class="eyeline">Путевой лист</span><h1>' +
      esc(sheet.name) +
      '</h1>' +
      '<p>' +
      esc(sheet.role) +
      ' · ' +
      esc(rank.join(' · ')) +
      '</p></div></div>';
    document.title = sheet.name + ' · Путевой лист «Маяка»';
  }
  function frame() {
    const show = view.show;
    if (show?.kind === 'board' && B.valid(show.frame)) {
      const f = show.frame;
      return (
        '<section class="public-pocket field-pocket"><header><div><span class="eyeline">' +
        icon('swords') +
        'Поле боя</span><h2>' +
        esc(f.place) +
        '</h2></div>' +
        '<button data-field-full class="field-full" aria-label="Развернуть поле боя" title="Развернуть поле боя">' +
        icon('expand') +
        '</button></header>' +
        '<ol class="pocket-order">' +
        B.initiative(f, false) +
        '</ol><div class="pocket-extent"><div class="pocket-board">' +
        B.board(f, false) +
        '</div></div></section>'
      );
    }
    if (show?.kind === 'story' && Show.valid(show.frame))
      return (
        '<section class="public-pocket"><header><span class="eyeline">' +
        icon('monitor') +
        'На общем столе</span></header><div class="pocket-frame">' +
        Show.markup(show.frame, true) +
        '</div></section>'
      );
    return (
      '<div class="quiet-water"><div><span class="eyeline">' +
      icon('compass') +
      'За столом</span><h2>' +
      (invited ? 'В ожидании сцены' : 'Присоединиться к столу') +
      '</h2><p>' +
      (invited
        ? 'Когда мастер откроет место или поле боя, вы увидите его здесь.'
        : 'Откройте личную ссылку от мастера, чтобы получать проверки и раздатки.') +
      '</p></div></div>'
    );
  }
  function sidePanel() {
    const turn = view.show?.kind === 'board' && view.show.frame.active === hero;
    return (
      '<aside class="pocket-stats"><h2>' +
      (turn ? 'В свой ход' : 'Под рукой') +
      '</h2>' +
      vitals() +
      (turn
        ? '<ul class="hero-cues">' +
          sheet.cues.map((c) => '<li>' + esc(c) + '</li>').join('') +
          '</ul>'
        : '') +
      '<button data-tab="hero" class="folio-link">' +
      icon('token') +
      'Открыть лист героя ' +
      icon('chevron') +
      '</button></aside>'
    );
  }
  function vitals() {
    const health =
      view.show?.kind === 'board'
        ? ['Здоровье', view.hp + ' / ' + sheet.hp]
        : ['Макс. хитов', sheet.hp];
    const rows = [health, ['Класс защиты', sheet.ac], ['Скорость', sheet.speed + ' фт']];
    return (
      '<dl class="vital-line">' +
      rows
        .map(([name, value]) => '<div><dt>' + name + '</dt><dd>' + esc(value) + '</dd></div>')
        .join('') +
      '</dl>'
    );
  }
  function dossier() {
    const figure = pose === 'figure';
    return (
      '<div class="hero-folio"><div class="likeness"><div class="hero-image ' +
      (figure ? 'figure' : '') +
      '"><img src="' +
      (figure ? B.figureArt(hero) : B.portraitArt(hero)) +
      '" alt="' +
      esc((figure ? 'Фигурка' : 'Портрет') + ' · ' + sheet.name) +
      '"></div>' +
      '<div class="pose-picker" role="group" aria-label="Изображение героя">' +
      [
        ['portrait', 'Портрет'],
        ['figure', 'Фигурка'],
      ]
        .map(
          ([id, label]) =>
            '<button data-pose="' +
            id +
            '" aria-pressed="' +
            (id === pose) +
            '">' +
            label +
            '</button>',
        )
        .join('') +
      '</div></div>' +
      '<div class="dossier"><h2>' +
      esc(sheet.description) +
      '</h2><p class="hero-wish">' +
      esc(sheet.motive) +
      '</p>' +
      vitals() +
      '<h3>Характеристики</h3><dl class="ability-line">' +
      sheet.abilities
        .map(
          (a) =>
            '<div><dt>' +
            statNames[a.key] +
            '</dt><dd>' +
            a.score +
            ' <small>' +
            Dice.bonus(a.modifier) +
            '</small></dd></div>',
        )
        .join('') +
      '</dl><h3>Что я могу сделать</h3><ul class="hero-cues">' +
      sheet.cues.map((c) => '<li>' + esc(c) + '</li>').join('') +
      '</ul><div class="keepsake">' +
      icon('bookmark') +
      '<div><small>Моя памятная вещь</small><p>' +
      esc(sheet.keepsake) +
      '</p></div></div></div></div>'
    );
  }
  function journal() {
    const rolls = view.checks.filter((c) => c.status === 'answered');
    return (
      '<div class="journal-grid"><section class="journal-leaf"><span class="eyeline">' +
      icon('bookmark') +
      'Материалы партии</span><h2>Выданные раздатки</h2>' +
      (view.cards.length
        ? view.cards
            .filter(Show.valid)
            .map(
              (c) =>
                '<details><summary>' +
                esc(c.title) +
                '</summary><p>' +
                esc(c.text) +
                '</p><p>' +
                esc(c.task) +
                '</p></details>',
            )
            .join('')
        : '<p>Первая раздатка появится здесь, когда мастер передаст её партии.</p>') +
      (view.atlas && Show.valid(view.atlas)
        ? '<h3>Карта партии</h3><div class="journal-map">' + Show.atlas(view.atlas) + '</div>'
        : '') +
      '</section><section class="journal-leaf"><span class="eyeline">' +
      icon('dice') +
      'Личная запись</span><h2>Мои броски</h2>' +
      (rolls.length
        ? '<ol class="roll-log">' +
          rolls
            .map(
              (c) =>
                '<li><div><strong>' +
                esc(c.label) +
                '</strong><span>d20 (' +
                c.face +
                ') ' +
                Dice.bonus(c.bonus) +
                '</span></div><b aria-label="Итого ' +
                c.total +
                '">' +
                c.total +
                '</b></li>',
            )
            .join('') +
          '</ol>'
        : '<p>Здесь сохраняются ваши ответы на проверки мастера.</p>') +
      '</section></div>'
    );
  }
  function refresh() {
    const pending = view.checks.filter((c) => c.status === 'pending'),
      nav = document.querySelector('.traveller-tabs');
    if (tab === 'journal' && view.cards.length > readCards) {
      readCards = view.cards.length;
      try {
        sessionStorage.setItem('lighthouse-cards-' + seat, String(readCards));
      } catch {
        /* Guest mode. */
      }
    }
    const badges = { table: pending.length, journal: Math.max(0, view.cards.length - readCards) };
    paint(
      nav,
      Object.entries(sections)
        .map(
          ([id, label]) =>
            '<button data-tab="' +
            id +
            '" ' +
            (tab === id ? 'aria-current="page"' : '') +
            '>' +
            icon(symbols[id]) +
            label +
            (badges[id]
              ? ' <b aria-label="' +
                (id === 'table' ? 'Ожидают броска' : 'Новые раздатки') +
                '">' +
                badges[id] +
                '</b>'
              : '') +
            '</button>',
        )
        .join(''),
    );
    for (const id of Object.keys(sections)) $(id + '-view').hidden = id !== tab;
    const signal = $('turn-signal'),
      shown = view.show?.kind === 'board' ? view.show.frame : null;
    if (!shown && fieldOpen()) {
      main.classList.remove('expanded-field');
      if (document.fullscreenElement === main) document.exitFullscreen().catch(() => {});
    }
    const expanded = shown && fieldOpen();
    const fieldCheck = expanded && view.checks.find((c) => c.id === fieldCheckId);
    if (!fieldCheck) fieldCheckId = null;
    main.classList.toggle('field-check', !!fieldCheck);
    paint(
      signal,
      shown && B.valid(shown)
        ? '<p>' +
            icon('flag') +
            'Раунд ' +
            shown.round +
            ' · <strong>' +
            (shown.active === hero
              ? 'Ваш ход'
              : 'Ходит ' + esc(shown.pieces.find((p) => p.id === shown.active).short)) +
            '</strong></p>'
        : '',
    );
    paint(
      $('summons'),
      fieldCheck?.status === 'pending'
        ? '<button class="summons-link" data-back-field>' + icon('back') + 'К полю боя</button>'
        : (tab !== 'table' || (expanded && !fieldCheck)) && pending.length
          ? '<button class="summons-link" data-open-check="' +
            esc(pending[0].id) +
            '">' +
            icon('dice') +
            'Мастер просит бросок · ' +
            esc(pending[0].label) +
            icon('arrow') +
            '</button>'
          : '',
    );
    if (tab === 'table') {
      const last = view.checks.find((c) => c.status === 'answered');
      const tray = expanded
        ? fieldCheck
          ? [fieldCheck]
          : []
        : [...pending, ...(last && last.id !== dismissed ? [last] : [])];
      Dice.update(tray, online, send);
      $('table-view').classList.toggle('has-tray', tray.length > 0);
      paint($('shared-view'), frame() + sidePanel());
      fullscreenLabel();
    } else if (tab === 'hero') paint($('hero-view'), dossier());
    else paint($('journal-view'), journal());
  }
  function fullscreenLabel() {
    const button = document.querySelector('[data-field-full]');
    if (!button) return;
    const name = fieldOpen() ? 'Свернуть поле боя' : 'Развернуть поле боя';
    button.setAttribute('aria-label', name);
    button.title = name;
  }
  document.addEventListener('fullscreenchange', refresh);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && main.classList.contains('expanded-field')) {
      main.classList.remove('expanded-field');
      refresh();
      document.querySelector('[data-field-full]')?.focus({ preventScroll: true });
    }
  });
  document.querySelector('.skip').addEventListener('click', (e) => {
    e.preventDefault();
    main.focus();
  });
  window.addEventListener('hashchange', () => location.reload());
  function connection(state, label) {
    const tag = document.querySelector('.seat-connection');
    tag.dataset.state = state;
    const text = tag.querySelector('span');
    if (label !== text.textContent) text.textContent = label;
  }
  function accept(packet) {
    if (
      packet.view?.hero !== hero ||
      !Array.isArray(packet.view.checks) ||
      !Array.isArray(packet.view.cards)
    )
      return;
    view = packet.view;
    online = packet.online;
    connection(online ? 'live' : 'away', online ? 'За столом' : 'Ждём мастера');
    refresh();
  }
  function hello() {
    try {
      window.opener?.postMessage(
        { kind: 'lighthouse-seat-ready', hero, seat },
        location.protocol === 'file:' ? '*' : location.origin,
      );
    } catch {
      /* Detached window. */
    }
  }
  async function poll() {
    if (!invited || polling) return;
    if (port && Date.now() - lastDirect < 4500) return;
    polling = true;
    try {
      if (!W.apiOrigin()) throw new Error('offline');
      accept(await W.api('seat', seat));
    } catch {
      if (Date.now() - lastDirect > 4500) {
        online = false;
        connection('away', 'Ждём связи с мастером');
        refresh();
      }
    } finally {
      polling = false;
    }
    if (!port || Date.now() - lastDirect >= 4500) hello();
  }
  async function send(id) {
    if (!invited || !online) throw new Error('offline');
    if (port && Date.now() - lastDirect < 4500) {
      port.postMessage({ kind: 'roll', id });
      return;
    }
    await W.api('roll', seat, { id });
    await poll();
  }
  window.addEventListener('message', (event) => {
    if (
      !invited ||
      !window.opener ||
      event.source !== window.opener ||
      !B.sameOrigin(event.origin) ||
      event.data?.kind !== 'lighthouse-seat-port' ||
      !event.ports[0]
    )
      return;
    port?.close();
    port = event.ports[0];
    port.onmessage = ({ data }) => {
      lastDirect = Date.now();
      accept(data);
    };
  });
  document.addEventListener('click', (e) => {
    const button = e.target.closest('button');
    if (!button) return;
    if (button.hasAttribute('data-open-check')) {
      tab = 'table';
      fieldCheckId = button.dataset.openCheck;
      refresh();
      document.querySelector('[data-player-roll]')?.focus();
    } else if (button.hasAttribute('data-return-table') || button.hasAttribute('data-back-field')) {
      if (button.hasAttribute('data-return-table')) {
        dismissed = button.dataset.returnTable;
        try {
          sessionStorage.setItem('lighthouse-tray-' + seat, dismissed);
        } catch {
          /* Guest mode. */
        }
      }
      fieldCheckId = null;
      refresh();
      const next = fieldOpen()
        ? '#summons button, [data-field-full]'
        : '.traveller-tabs [aria-current]';
      document.querySelector(next)?.focus({ preventScroll: true });
    } else if (button.hasAttribute('data-field-full')) {
      if (main.classList.contains('expanded-field')) {
        main.classList.remove('expanded-field');
        refresh();
      } else
        B.fullscreen(main, () => {
          main.classList.add('expanded-field');
          refresh();
        });
    } else if (Object.hasOwn(sections, button.dataset.tab)) {
      tab = button.dataset.tab;
      if (tab !== 'table') Dice.leave();
      refresh();
      document.querySelector('.traveller-tabs [aria-current]')?.focus({ preventScroll: true });
    } else if (['portrait', 'figure'].includes(button.dataset.pose)) {
      pose = button.dataset.pose;
      refresh();
      $('hero-view').querySelector('[aria-pressed="true"]')?.focus({ preventScroll: true });
    }
  });
  identity();
  refresh();
  if (invited) {
    connection('away', 'Подключаемся');
    hello();
    void poll();
    setInterval(poll, 850);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) void poll();
    });
  } else connection('sample', 'Просмотр героя');
})();
