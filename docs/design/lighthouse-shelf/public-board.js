// The TV and the DM draw the same public scene. No book, character sheets or notes are read here.
(() => {
  const painted = 'art/';
  const mapArt = (id) => painted + 'map-' + id + '.webp';
  const portraitArt = (id) => painted + 'portrait-' + id + '.webp';
  const figureArt = (id) => {
    const name = id.replace(/^(heroes|npcs)-/, '');
    return painted + 'mini-' + name + '.webp';
  };
  const esc = (value) =>
    String(value).replace(
      /[&<>"']/g,
      (char) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[char],
    );
  const stem = (value) => typeof value === 'string' && /^[a-z][a-z0-9-]{0,45}$/.test(value);
  const label = (value) => typeof value === 'string' && value.length > 0 && value.length <= 96;
  const within = (n, max) => Number.isInteger(n) && n >= 0 && n < max;
  const validPiece = (p) =>
    p &&
    stem(p.id) &&
    label(p.name) &&
    label(p.short) &&
    stem(p.portrait) &&
    (p.figure === null || stem(p.figure)) &&
    ['party', 'hostile'].includes(p.side) &&
    within(p.x, 10) &&
    within(p.y, 8);
  const valid = (f) =>
    f &&
    stem(f.map) &&
    label(f.place) &&
    Number.isSafeInteger(f.round) &&
    f.round > 0 &&
    ['figures', 'tokens'].includes(f.mode) &&
    typeof f.grid === 'boolean' &&
    Array.isArray(f.pieces) &&
    f.pieces.length > 0 &&
    f.pieces.length <= 10 &&
    f.pieces.every(validPiece) &&
    f.pieces.some((p) => p.id === f.active);

  function initiative(f, interactive) {
    const tag = interactive ? 'button' : 'span';
    return f.pieces
      .map((p, i) => {
        const current = p.id === f.active;
        const attrs = interactive ? ' type="button" data-piece="' + p.id + '"' : '';
        const turn = current ? 'Сейчас ходит' : 'Ход ' + (i + 1);
        return `<li><${tag}${attrs} class="turn-entry" ${current ? 'aria-current="step"' : ''} aria-label="${esc(p.name)}, ${turn}">
        <img src="${portraitArt(p.portrait)}" alt=""><span><small>${turn}</small><strong>${esc(p.short)}</strong></span>
        </${tag}></li>`;
      })
      .join('');
  }

  // Ten columns of square tiles. The TV also fits the outer occupied cells.
  function camera(w, h, f, publicView) {
    const xs = f.pieces.map((p) => p.x),
      ys = f.pieces.map((p) => p.y);
    const firstX = Math.min(...xs),
      lastX = Math.max(...xs);
    const firstY = Math.min(...ys),
      lastY = Math.max(...ys);
    const active = f.pieces.find((p) => p.id === f.active);
    const width = publicView
      ? Math.min(
          Math.max(w, h * 1.25),
          (w * 10) / (lastX - firstX + 1.45),
          (h * 10) / (lastY - firstY + 1.45),
        )
      : Math.max(w, Math.min(h * 1.25, w * 2));
    return {
      width,
      x: publicView ? (firstX + lastX + 1) / 20 : (active.x + 0.5) / 10,
      y: (firstY + lastY + 1) / 16,
    };
  }

  function board(frame, interactive) {
    if (!valid(frame)) return '';
    const pieces = frame.pieces
      .map((p) => {
        const figure = frame.mode === 'figures' && p.figure;
        const src = figure && p.figure ? figureArt(p.figure) : portraitArt(p.portrait);
        const current = p.id === frame.active;
        const tag = interactive ? 'button' : 'span';
        const action = interactive ? ' type="button" data-piece="' + p.id + '"' : '';
        return `<${tag}${action} data-actor="${p.id}" ${figure ? 'data-figure="' + p.figure.replace(/^(heroes|npcs)-/, '') + '"' : ''} class="piece ${p.side} ${figure ? 'sculpt' : 'medallion'} ${current ? 'acting' : ''}${p.x >= 7 ? ' label-left' : ''}"
        style="--x:${p.x};--y:${p.y}" aria-label="${esc(p.name)}${current ? ', сейчас ходит' : ''}">
        <span class="piece-body"><span class="piece-base"></span><img src="${src}" alt="" draggable="false"></span>
        ${current ? '<span class="piece-label">' + esc(p.short) + '</span>' : ''}
      </${tag}>`;
      })
      .join('');
    return `<div class="battle-map${frame.grid ? ' gridded' : ''}" style="--map:url('${mapArt(frame.map)}')">
      <div class="map-grid"></div>${pieces}</div>`;
  }

  function animateChange(root, before, after) {
    if (
      !before ||
      before.map !== after.map ||
      matchMedia('(prefers-reduced-motion: reduce)').matches
    )
      return;
    const options = { duration: 390, easing: 'cubic-bezier(.22,.7,.21,1)' };
    for (const p of after.pieces) {
      const old = before.pieces.find((piece) => piece.id === p.id);
      if (!old) continue;
      const el = root.querySelector('[data-actor="' + p.id + '"]');
      const dx = old.x - p.x,
        dy = old.y - p.y;
      if (dx || dy) {
        el.animate(
          [{ transform: 'translate(' + dx * 100 + '%,' + dy * 100 + '%)' }, { transform: 'none' }],
          options,
        );
        el.querySelector('img').animate(
          [{ translate: '0 0' }, { translate: '0 -5%', offset: 0.36 }, { translate: '0 0' }],
          options,
        );
      }
      if (before.mode !== after.mode)
        el.querySelector('.piece-body').animate(
          [
            { transform: 'perspective(400px) rotateY(-65deg)', opacity: 0.25 },
            { transform: 'none', opacity: 1 },
          ],
          options,
        );
      if (p.id === after.active && before.active !== p.id)
        el.querySelector('.piece-base').animate(
          [
            { filter: 'brightness(1)' },
            { filter: 'brightness(1.8)', offset: 0.4 },
            { filter: 'brightness(1)' },
          ],
          { duration: 560 },
        );
    }
  }

  async function fullscreen(target, report) {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (target.requestFullscreen) await target.requestFullscreen();
      else report('Для полного экрана используйте команду браузера.');
    } catch {
      report('Браузер оставил окно в текущем размере.');
    }
  }

  // Local files have opaque origins in some browsers and a file origin in others.
  const sameOrigin = (origin) =>
    location.protocol === 'file:'
      ? origin === 'null' || origin === 'file://'
      : origin === location.origin;
  window.LighthouseBoard = {
    board,
    animateChange,
    initiative,
    camera,
    valid,
    fullscreen,
    esc,
    sameOrigin,
    mapArt,
    portraitArt,
    figureArt,
  };
})();
