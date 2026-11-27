// The book owns the ledger and adjudicates each player's intent once. Only allowlisted views leave it.
(() => {
  const E = window.Lighthouse,
    W = window.LighthouseWire,
    S = E.session;
  const credentials = 'player-room-v1',
    group = 'player-check';
  let room = S.read(credentials),
    timer,
    running = false,
    previous = '',
    online = [],
    lan = null,
    relayReady = false,
    attempted = false;
  const localSeats = new Map();
  const timeOrder = (a, b) => b.created - a.created;
  const checks = () => S.list(group).sort(timeOrder);
  const key = (id) => group + '/' + id;
  function start() {
    if (!room) {
      room = { host: W.token(), keys: Object.fromEntries(W.seats.map((h) => [h, W.token()])) };
      S.write(credentials, room);
      E.projection.status();
    }
    if (!timer) {
      timer = setInterval(sync, 900);
      void sync();
    }
  }
  function find(scene, hero, skill, id) {
    const source = id ? [S.read(key(id))] : checks();
    return source.find((c) => c && c.scene === scene && c.hero === hero && c.skill === skill);
  }
  function ask(scene, hero, skill, label, bonus, dc) {
    start();
    const previous = find(scene, hero, skill);
    if (previous?.status === 'pending') return previous;
    const c = {
      id: W.token(),
      scene,
      hero,
      skill,
      label,
      bonus,
      dc,
      created: Date.now(),
      status: 'pending',
    };
    S.write(key(c.id), c);
    void sync();
    return c;
  }
  function cancel(id) {
    const c = S.read(key(id));
    if (c?.status !== 'pending') return;
    S.write(key(id), { ...c, status: 'cancelled' });
    void sync();
  }
  function publicCheck(c) {
    const entry = {
      id: c.id,
      label: c.label,
      bonus: c.bonus,
      created: c.created,
      status: c.status,
    };
    if (c.status === 'answered')
      Object.assign(entry, { face: c.face, total: c.face + c.bonus, seed: c.seed });
    return entry;
  }
  function views() {
    const all = checks();
    const cards = S.list('issued')
      .filter((row) => Object.hasOwn(E.handouts, row.key))
      .sort((a, b) => b.when - a.when)
      .map((row) => E.director.card(row.key));
    const show = S.read('player-public');
    const atlas = S.read('player-atlas');
    return Object.fromEntries(
      W.seats.map((hero) => {
        const own = all.filter((c) => c.hero === hero && c.status !== 'cancelled');
        const visible = [
          ...own.filter((c) => c.status === 'pending'),
          ...own
            .filter((c) => c.status === 'answered')
            .sort((a, b) => (b.answeredAt ?? b.created) - (a.answeredAt ?? a.created))
            .slice(0, 60),
        ];
        const hp = show?.kind === 'board' ? S.read('vitals/' + show.fight + '/' + hero)?.hp : null;
        return [
          hero,
          {
            hero,
            checks: visible.map(publicCheck),
            cards,
            atlas,
            show: show ? { kind: show.kind, frame: show.frame } : null,
            hp: show?.kind === 'board' ? (Number.isInteger(hp) ? hp : E.people[hero].hp) : null,
          },
        ];
      }),
    );
  }
  function publish(kind, frame, fight) {
    S.write('player-public', frame ? { kind, frame, fight } : null);
    if (frame?.type === 'atlas') S.write('player-atlas', frame);
    if (room) void sync();
  }
  function changed(c) {
    document.dispatchEvent(new CustomEvent('lighthouse-player-answer', { detail: c }));
    E.notify(E.people[c.hero].name + ' · ' + c.label + ' · ' + (c.bonus + c.face));
    const current = document.querySelector('[data-index-check="' + c.id + '"] strong');
    if (current) current.textContent = String(c.bonus + c.face);
  }
  async function resolve(hero, id) {
    if (!W.seats.includes(hero) || !/^[a-f0-9]{40}$/.test(id)) return;
    const commit = () => {
      const c = S.read(key(id));
      if (!c || c.hero !== hero || c.status !== 'pending') return;
      const next = {
        ...c,
        status: 'answered',
        answeredAt: Date.now(),
        face: window.LighthouseDiceAssets.rollValue(20),
        seed: crypto.getRandomValues(new Uint32Array(1))[0],
      };
      S.write(key(id), next);
      changed(next);
    };
    if (navigator.locks) await navigator.locks.request('lighthouse-check-' + id, commit);
    else commit();
  }
  function presence() {
    for (const tag of document.querySelectorAll('[data-seat-status]')) {
      const hero = tag.dataset.seatStatus;
      tag.textContent =
        online.includes(hero) || localSeats.get(hero)?.port ? 'За столом' : 'Ждём игрока';
    }
    const hint = document.querySelector('[data-invite-hint]');
    if (hint)
      hint.textContent = lan
        ? 'Телефон и мастер должны быть в одной сети Wi-Fi.'
        : relayReady
          ? 'Здесь можно открыть второе окно. Для телефонов включите подключение по Wi-Fi.'
          : 'Каждый герой может открыть своё окно на этом устройстве.';
    const enable = document.querySelector('[data-do="player-wifi"]');
    if (enable) {
      enable.hidden = !relayReady;
      enable.textContent = lan ? 'Отключить телефоны от стола' : 'Подключить телефоны по Wi-Fi';
    }
    for (const button of document.querySelectorAll('[data-copy-seat]')) button.hidden = !relayReady;
  }
  function direct(fresh) {
    for (const [hero, seat] of localSeats) {
      if (seat.win.closed) {
        seat.port?.close();
        localSeats.delete(hero);
        continue;
      }
      if (seat.port) seat.port.postMessage({ view: fresh[hero], online: true });
    }
  }
  async function sync() {
    if (!room || running) return;
    running = true;
    try {
      const fresh = views();
      direct(fresh);
      if (!W.apiOrigin()) return;
      const json = JSON.stringify(fresh);
      const reply = await W.api('host', room.host, {
        keys: room.keys,
        ...(json !== previous && { views: fresh }),
      });
      previous = reply.needsViews ? '' : json;
      online = reply.online;
      lan = reply.lan;
      relayReady = true;
      for (const intent of reply.intents) await resolve(intent.hero, intent.id);
      if (reply.intents.length || reply.needsViews) setTimeout(sync, 0);
    } catch {
      relayReady = false;
      online = [];
      previous = '';
    } finally {
      if (W.apiOrigin()) attempted = true;
      running = false;
      presence();
    }
  }
  function invite(hero, network = false) {
    start();
    const page = new URL('player.html', location.href);
    if (network && lan) {
      page.protocol = 'http:';
      page.host = new URL(lan).host;
      page.pathname = '/player.html';
    } else if (
      (relayReady || (!attempted && ['4186', '4187'].includes(location.port))) &&
      ['localhost', '127.0.0.1'].includes(location.hostname)
    ) {
      const endpoint = new URL(W.apiOrigin());
      page.protocol = endpoint.protocol;
      page.host = 'localhost:' + endpoint.port;
      page.pathname = '/player.html';
    }
    page.hash = new URLSearchParams({ hero, seat: room.keys[hero] }).toString();
    return page.href;
  }
  function open(hero) {
    const existing = localSeats.get(hero);
    if (existing && !existing.win.closed) {
      existing.win.focus();
      return;
    }
    const win = window.open(invite(hero), '_blank');
    if (win) {
      if (new URL(invite(hero)).origin !== location.origin) win.opener = null;
      localSeats.set(hero, { win, port: null });
    } else E.notify('Разрешите открыть окно игрока в браузере.');
  }
  window.addEventListener('message', (event) => {
    if (
      event.data?.kind !== 'lighthouse-seat-ready' ||
      !window.LighthouseBoard.sameOrigin(event.origin)
    )
      return;
    const { hero, seat } = event.data;
    const target = localSeats.get(hero);
    if (!target || event.source !== target.win || seat !== room?.keys[hero]) return;
    target.port?.close();
    const channel = new MessageChannel();
    target.port = channel.port1;
    target.port.onmessage = async ({ data }) => {
      if (data?.kind === 'roll') {
        await resolve(hero, data.id);
        direct(views());
      }
    };
    target.win.postMessage(
      { kind: 'lighthouse-seat-port' },
      location.protocol === 'file:' ? '*' : location.origin,
      [channel.port2],
    );
    target.port.postMessage({ view: views()[hero], online: true });
    presence();
  });
  function pane() {
    start();
    const rows = W.seats
      .map((hero) => {
        const p = E.people[hero];
        return (
          '<li class="seat-row"><img src="' +
          E.art(hero) +
          '" alt=""><div><strong>' +
          E.esc(p.name) +
          '</strong><small data-seat-status="' +
          hero +
          '">' +
          (online.includes(hero) ? 'За столом' : 'Ждём игрока') +
          '</small></div>' +
          '<div class="seat-links"><button class="outline-button" data-open-seat="' +
          hero +
          '">Открыть экран</button>' +
          '<button class="text-button" data-copy-seat="' +
          hero +
          '">Скопировать ссылку</button></div></li>'
        );
      })
      .join('');
    const recent = checks()
      .filter((c) => c.status !== 'cancelled')
      .slice(0, 8);
    const trail = recent.length
      ? '<h3 class="check-index-title">Проверки игроков</h3><ul class="check-index">' +
        recent
          .map((c) => {
            const [chapter, scene] = c.scene.split('/').map(Number);
            return (
              '<li data-index-check="' +
              c.id +
              '"><a href="#check/' +
              (chapter + 1) +
              '/' +
              (scene + 1) +
              '/' +
              c.hero +
              '/' +
              c.skill +
              '/' +
              c.id +
              '"><span>' +
              E.esc(E.people[c.hero].name) +
              ' · ' +
              E.esc(c.label) +
              '</span><strong>' +
              (c.status === 'pending' ? 'Ждём бросок' : c.face + c.bonus) +
              '</strong></a></li>'
            );
          })
          .join('') +
        '</ul>'
      : '';
    return (
      E.drawers.heading('Экраны игроков', 'Маяк Между Ветрами') +
      '<div class="drawer-scroll journal-body"><p>Передайте каждому ссылку на его героя. Оставьте книгу открытой, пока идёт встреча.</p>' +
      '<ul class="seat-list">' +
      rows +
      '</ul><p data-invite-hint></p>' +
      '<button class="outline-button" data-do="player-wifi" hidden>Подключить телефоны по Wi-Fi</button>' +
      '<div data-seat-copy aria-live="polite"></div>' +
      trail +
      '</div>'
    );
  }
  async function copy(hero) {
    const url = invite(hero, true);
    try {
      await navigator.clipboard.writeText(url);
      E.notify('Ссылка для ' + E.people[hero].name + ' скопирована.');
    } catch {
      const out = document.querySelector('[data-seat-copy]');
      if (out) {
        out.innerHTML = '<label>Ссылка игрока<input readonly class="seat-url"></label>';
        const input = out.querySelector('input');
        input.value = url;
        input.select();
      }
    }
  }
  function handle(el) {
    if (W.seats.includes(el.dataset.openSeat)) {
      open(el.dataset.openSeat);
      return true;
    }
    if (W.seats.includes(el.dataset.copySeat)) {
      void copy(el.dataset.copySeat);
      return true;
    }
    if (el.dataset.do === 'player-wifi') {
      W.api('lan', room.host, { enable: !lan })
        .then((reply) => {
          lan = reply.url;
          presence();
          E.notify(
            lan
              ? 'Ссылки игроков готовы для телефонов в вашей сети.'
              : 'Телефоны отключены от стола.',
          );
        })
        .catch(() =>
          E.notify('Подключитесь к Wi-Fi и повторите. Игра в соседнем окне уже доступна.'),
        );
      return true;
    }
    return false;
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && room) void sync();
  });
  E.playerHost = {
    ask,
    find,
    cancel,
    publish,
    pane,
    handle,
    start,
    presence,
    invited: () => !!room,
    sync,
  };
  if (room) setTimeout(start, 0);
})();
