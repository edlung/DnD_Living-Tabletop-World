(() => {
  const E = window.Lighthouse;
  const { state, icon, esc, button, iconButton, bookUrl } = E;
  const boardView = window.LighthouseBoard;
  const foes = {
    'dock-keeper-a': ['Смотритель причала', 'Смотритель'],
    'dock-keeper-b': ['Помощник смотрителя', 'Помощник'],
    repairer: ['Латунный ремонтник', 'Ремонтник'],
    'repeat-guardian': ['Страж повторения', 'Страж'],
  };
  const tables = new Map();
  let renderedFrame;
  let key = 'workshop-repairer',
    zoom = 1,
    overview = false,
    move = null,
    queueOpen = true;
  function table(id) {
    if (tables.has(id)) return tables.get(id);
    const f = E.fights[id];
    const pieces = f.actors.map((a) => {
      const p = E.people[a.id];
      return {
        id: a.id,
        x: a.x,
        y: a.y,
        side: p ? 'party' : 'hostile',
        name: p?.name ?? foes[a.id][0],
        short: p?.name.split(' ')[0] ?? foes[a.id][1],
        portrait: p?.portrait ?? 'automaton',
        figure: p?.figure ?? 'repairer',
      };
    });
    const t = {
      round: 1,
      turn: 0,
      pieces,
      mode: matchMedia('(max-width:600px)').matches ? 'tokens' : 'figures',
      grid: true,
    };
    const saved = E.session.read('board/' + id);
    if (
      saved &&
      Number.isSafeInteger(saved.round) &&
      saved.round > 0 &&
      Number.isInteger(saved.turn) &&
      saved.turn >= 0 &&
      saved.turn < pieces.length &&
      Array.isArray(saved.positions) &&
      saved.positions.length === pieces.length &&
      saved.positions.every(
        (p, i) =>
          p?.id === pieces[i].id &&
          Number.isInteger(p.x) &&
          p.x >= 0 &&
          p.x < 10 &&
          Number.isInteger(p.y) &&
          p.y >= 0 &&
          p.y < 8,
      ) &&
      new Set(saved.positions.map((p) => p.x + ',' + p.y)).size === pieces.length
    ) {
      t.round = saved.round;
      t.turn = saved.turn;
      saved.positions.forEach((p, i) => {
        pieces[i].x = p.x;
        pieces[i].y = p.y;
      });
      if (['tokens', 'figures'].includes(saved.mode)) t.mode = saved.mode;
      if (typeof saved.grid === 'boolean') t.grid = saved.grid;
    }
    tables.set(id, t);
    return t;
  }
  function defaultFight() {
    return E.chapters[state.place.chapter].encounter ?? 'workshop-repairer';
  }
  function frame(id) {
    const f = E.fights[id],
      t = table(id);
    return {
      map: f.map,
      place: E.chapters.find((c) => c.encounter === id).location,
      round: t.round,
      active: t.pieces[t.turn].id,
      mode: t.mode,
      grid: t.grid,
      pieces: t.pieces.map((p) => ({ ...p })),
    };
  }
  function enter(id) {
    if (state.view === 'shelf') {
      const chapter = E.chapters.findIndex((c) => c.encounter === id);
      const scene = E.chapters[chapter].scenes.findIndex(
        (_, scene) => E.cue({ chapter, scene }).fight === id,
      );
      if (scene >= 0) state.reading = { chapter, scene };
    }
    if (id !== key || state.view !== 'battle') {
      zoom = 1;
      overview = false;
      move = null;
      queueOpen = true;
    }
    key = id;
  }
  function turnBar(f) {
    const active = f.pieces.find((p) => p.id === f.active);
    return `<section class="combat-order" aria-label="Порядок ходов">
      <button type="button" class="round-control" data-do="queue" aria-label="Очередь" aria-expanded="${queueOpen}" aria-controls="turn-order">
        <span>Очередь</span><strong>Раунд ${f.round}</strong></button>
      <ol id="turn-order" class="initiative" ${queueOpen ? '' : 'hidden'}>${boardView.initiative(f, true)}</ol>
      ${queueOpen ? '' : '<p class="collapsed-turn">Ходит <strong>' + esc(active.short) + '</strong></p>'}
      <button type="button" class="next-turn primary" data-do="next-turn" aria-label="Следующий ход"><span class="next-label">Следующий ход</span><span class="next-short">Дальше</span>${icon('arrow')}</button>
      <span class="sr-only" role="status">Раунд ${f.round}. Ходит ${esc(active.name)}</span></section>`;
  }
  function tool(action, label, symbol, pressed) {
    return `<button type="button" class="map-tool" data-do="${action}" aria-label="${esc(label)}" title="${esc(label)}"${pressed === undefined ? '' : ' aria-pressed="' + pressed + '"'}>${icon(symbol)}<span>${esc(label)}</span></button>`;
  }
  function markup() {
    const f = frame(key);
    renderedFrame = f;
    const displayLabel = document.fullscreenElement ? 'Выйти из полного экрана' : 'На весь экран';
    return `<div class="combat-screen"><header class="combat-head"><a class="battle-back" href="${bookUrl(state.reading)}" aria-label="К книге">${icon('back')}<span>К книге</span></a>
      <div class="combat-title"><h1>${esc(f.place)}</h1><p>${esc(E.fights[key].title)}</p></div><div class="project-controls">${button('project', E.projection.showing() === key ? 'Остановить показ' : 'На телевизор', 'monitor', 'project-button')}
      ${iconButton('fullscreen', displayLabel, 'expand')}</div></header>${turnBar(f)}
      <section class="map-scroll" tabindex="0" aria-label="Поле боя, 10 на 8 клеток"><div class="map-paper">${boardView.board(f, true)}</div></section>
      <div class="map-tools" role="group" aria-label="Инструменты поля">
        <div class="map-scale"><div class="zoom-tools">${iconButton('zoom-out', 'Уменьшить карту', 'minus')}<output class="zoom-value" aria-label="Масштаб"></output>${iconButton('zoom-in', 'Увеличить карту', 'plus')}</div>
        <button type="button" class="map-tool overview-tool" data-do="fit" aria-label="${overview ? 'Развернуть карту' : 'Показать всю карту'}" title="${overview ? 'Развернуть карту' : 'Показать всю карту'}" aria-pressed="${overview}">${icon('map')}<span>Вся карта</span></button></div>
        <div class="map-options">${tool('pieces', 'Жетоны', 'token', f.mode === 'tokens')}${tool('grid', 'Сетка', 'grid', f.grid)}</div>
        <div class="play-tools">${tool('move', move ? 'Отменить перенос' : 'Переставить фигурку', 'pin', !!move)}
        <button type="button" class="map-tool dice-tool" data-do="dice" aria-label="Кубики"><img src="${E.ornament('d20')}" alt=""><span>Кубики</span></button></div>
      </div></div>`;
  }
  function fit() {
    const well = document.querySelector('.map-scroll');
    if (!well) return;
    const paper = well.querySelector('.map-paper');
    const w = well.clientWidth,
      h = well.clientHeight;
    const camera = boardView.camera(w, h, frame(key), false);
    const width = overview ? Math.min(w, h * 1.25) : camera.width * zoom;
    paper.style.width = width + 'px';
    paper.style.height = width * 0.8 + 'px';
    well.classList.toggle('pannable', width > w + 1 || width * 0.8 > h + 1);
    well.scrollTo(width * camera.x - w / 2, width * 0.8 * camera.y - h / 2);
    document.querySelector('.zoom-value').textContent =
      Math.round((width / camera.width) * 100) + '%';
    document.querySelector('[data-do="zoom-in"]').disabled = !overview && zoom >= 2;
    document.querySelector('[data-do="zoom-out"]').disabled = overview || zoom <= 0.5;
  }
  function paint(keepPosition = true) {
    const before = renderedFrame;
    const main = document.getElementById('content'),
      scroller = main.querySelector('.map-scroll');
    const offset = scroller ? [scroller.scrollLeft, scroller.scrollTop] : [0, 0];
    const focus = document.activeElement?.closest('[data-do]');
    const selector = focus && main.contains(focus) ? '[data-do="' + focus.dataset.do + '"]' : null;
    main.innerHTML = markup();
    fit();
    if (keepPosition) main.querySelector('.map-scroll').scrollTo(...offset);
    boardView.animateChange(main, before, renderedFrame);
    if (selector)
      [...main.querySelectorAll(selector)]
        .find((node) => node.offsetWidth)
        ?.focus({ preventScroll: true });
    if (move) {
      const paper = main.querySelector('.battle-map');
      paper.classList.add('placing');
      paper.insertAdjacentHTML(
        'beforeend',
        `<span class="cell-cursor" style="--x:${move.x};--y:${move.y}"></span>`,
      );
    }
  }
  function publishChange() {
    const t = table(key);
    E.session.write('board/' + key, {
      round: t.round,
      turn: t.turn,
      mode: t.mode,
      grid: t.grid,
      positions: t.pieces.map(({ id, x, y }) => ({ id, x, y })),
    });
    paint();
    E.projection.sync(key);
  }
  function put(x, y) {
    const t = table(key),
      p = t.pieces[t.turn];
    if (t.pieces.some((other) => other !== p && other.x === x && other.y === y)) {
      E.notify('Эта клетка занята. Выберите свободную.');
      return;
    }
    p.x = x;
    p.y = y;
    move = null;
    publishChange();
    E.notify('Фигурка переставлена.');
  }
  function handle(target, event) {
    if (state.view !== 'battle') return false;
    const map = target.closest('.battle-map');
    if (move && map && event.detail !== 0) {
      const rect = map.getBoundingClientRect();
      put(
        Math.max(0, Math.min(9, Math.floor(((event.clientX - rect.left) * 10) / rect.width))),
        Math.max(0, Math.min(7, Math.floor(((event.clientY - rect.top) * 8) / rect.height))),
      );
      return true;
    }
    const el = target.closest('button');
    if (!el) return false;
    if (el.dataset.piece) {
      E.encounterDesk.open(el.dataset.piece, el);
      return true;
    }
    const t = table(key);
    switch (el.dataset.do) {
      case 'project':
        E.projection.project(key);
        break;
      case 'fullscreen':
        boardView.fullscreen(document.documentElement, E.notify);
        break;
      case 'next-turn':
        t.turn = (t.turn + 1) % t.pieces.length;
        if (t.turn === 0) t.round++;
        move = null;
        publishChange();
        document
          .querySelector('.piece.acting')
          ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        document
          .querySelector('.turn-entry[aria-current]')
          ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        break;
      case 'grid':
        t.grid = !t.grid;
        publishChange();
        break;
      case 'pieces':
        t.mode = t.mode === 'tokens' ? 'figures' : 'tokens';
        publishChange();
        break;
      case 'zoom-in':
      case 'zoom-out': {
        const well = document.querySelector('.map-scroll');
        const fx = (well.scrollLeft + well.clientWidth / 2) / well.scrollWidth;
        const fy = (well.scrollTop + well.clientHeight / 2) / well.scrollHeight;
        const camera = boardView.camera(well.clientWidth, well.clientHeight, frame(key), false);
        const factor = well.querySelector('.map-paper').offsetWidth / camera.width;
        zoom = Math.max(
          0.5,
          Math.min(
            2,
            (el.dataset.do === 'zoom-in'
              ? Math.floor(factor * 4 + 0.01) + 1
              : Math.ceil(factor * 4 - 0.01) - 1) / 4,
          ),
        );
        overview = false;
        paint(false);
        const next = document.querySelector('.map-scroll');
        next.scrollTo(
          fx * next.scrollWidth - next.clientWidth / 2,
          fy * next.scrollHeight - next.clientHeight / 2,
        );
        break;
      }
      case 'fit':
        overview = !overview;
        zoom = 1;
        paint(false);
        break;
      case 'queue':
        queueOpen = !queueOpen;
        paint();
        break;
      case 'move':
        move = move ? null : { x: t.pieces[t.turn].x, y: t.pieces[t.turn].y };
        paint();
        if (move) {
          document.querySelector('.map-scroll').focus();
          E.notify('Выберите клетку или используйте стрелки и Enter.');
        }
        break;
      default:
        return false;
    }
    return true;
  }
  function keys(event) {
    if (state.view !== 'battle' || !move || document.querySelector('dialog[open]')) return;
    const offsets = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    if (event.key === 'Escape') {
      move = null;
      paint();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      put(move.x, move.y);
    } else if (offsets[event.key]) {
      event.preventDefault();
      const [dx, dy] = offsets[event.key];
      move.x = Math.max(0, Math.min(9, move.x + dx));
      move.y = Math.max(0, Math.min(7, move.y + dy));
      const cursor = document.querySelector('.cell-cursor');
      cursor.style.setProperty('--x', move.x);
      cursor.style.setProperty('--y', move.y);
      cursor.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }
  document.addEventListener('pointerdown', (event) => {
    const well = event.target.closest('.map-scroll.pannable');
    if (
      !well ||
      move ||
      event.pointerType === 'touch' ||
      event.button !== 0 ||
      event.target.closest('.piece')
    )
      return;
    const { pointerId, clientX, clientY } = event;
    const left = well.scrollLeft,
      top = well.scrollTop;
    const drag = new AbortController();
    well.setPointerCapture(pointerId);
    well.classList.add('dragging');
    well.addEventListener(
      'pointermove',
      (next) => {
        if (next.pointerId === pointerId)
          well.scrollTo(left + clientX - next.clientX, top + clientY - next.clientY);
      },
      { signal: drag.signal },
    );
    well.addEventListener(
      'lostpointercapture',
      () => {
        well.classList.remove('dragging');
        drag.abort();
      },
      { once: true },
    );
  });
  window.addEventListener('resize', fit);
  E.defaultFight = defaultFight;
  E.combat = { key: () => key, enter, frame, markup, fit, handle, keys };
})();
