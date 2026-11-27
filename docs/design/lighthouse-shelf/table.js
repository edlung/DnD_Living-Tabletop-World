(() => {
  const { board, initiative, camera, valid, fullscreen, esc } = window.LighthouseBoard;
  const icon = window.shelfIcon;
  const surface = document.getElementById('table');
  const full = document.getElementById('tv-full');
  const controller = window.opener;
  let port, shown;
  const soundButton = document.getElementById('tv-sound');
  const forge = window.LighthouseForge;
  let scene,
    muted = false;
  function clearScene() {
    forge.clear();
    scene = null;
    soundButton.hidden = true;
  }
  function soundLabel() {
    const playing = !muted && forge.sounding();
    soundButton.innerHTML =
      icon('volume') + '<span>' + (playing ? 'Выключить звук' : 'Включить звук') + '</span>';
    soundButton.setAttribute('aria-pressed', String(playing));
  }
  soundButton.addEventListener('click', async () => {
    if (!scene) return;
    const current = scene;
    if (soundButton.getAttribute('aria-pressed') === 'true') {
      muted = true;
      forge.clear();
    } else {
      muted = false;
      const ready = await forge.enable();
      if (scene === current) forge.play(surface, ready);
    }
    soundLabel();
  });
  function story(f) {
    clearScene();
    shown = null;
    scene = f;
    surface.innerHTML = '<div class="tv-story">' + window.LighthouseShow.markup(f) + '</div>';
    if (f.type === 'place' && f.art === 'forge-strike') {
      soundButton.hidden = false;
      soundLabel();
      forge.play(surface, !muted && forge.sounding());
      if (!muted && !forge.sounding())
        void forge.enable().then((ok) => {
          if (ok && scene === f && !muted) {
            forge.play(surface, true);
            soundLabel();
          }
        });
    }
  }
  function idle() {
    clearScene();
    shown = null;
    surface.innerHTML =
      '<div class="tv-idle">' +
      icon('monitor') +
      '<h1>Экран стола готов</h1><p>Ожидание показа от мастера</p></div>';
  }
  function paint(f) {
    clearScene();
    const before = shown;
    shown = f;
    surface.innerHTML = `<div class="tv-layout"><header class="tv-turn"><div class="tv-place"><h1>${esc(f.place)}</h1><span class="tv-round">Раунд ${f.round}</span></div>
      <ol class="initiative" aria-label="Порядок ходов">${initiative(f, false)}</ol></header>
      <div class="tv-stage"><div class="tv-map-box">${board(f, false)}</div></div></div>`;
    fit();
    window.LighthouseBoard.animateChange(surface, before, f);
    surface
      .querySelector('.turn-entry[aria-current]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  function fit() {
    if (!shown) return;
    const stage = surface.querySelector('.tv-stage'),
      paper = stage.firstElementChild;
    const w = stage.clientWidth,
      h = stage.clientHeight;
    const view = camera(w, h, shown, true);
    const offset = (size, viewport, center) =>
      size <= viewport
        ? (viewport - size) / 2
        : -Math.min(size - viewport, Math.max(0, size * center - viewport / 2));
    paper.style.width = view.width + 'px';
    paper.style.left = offset(view.width, w, view.x) + 'px';
    paper.style.top = offset(view.width * 0.8, h, view.y) + 'px';
  }
  window.addEventListener('resize', fit);
  window.addEventListener('message', (event) => {
    if (
      !controller ||
      event.source !== controller ||
      !window.LighthouseBoard.sameOrigin(event.origin) ||
      event.data?.kind !== 'lighthouse-board-port' ||
      !event.ports[0]
    )
      return;
    port?.close();
    port = event.ports[0];
    port.onmessage = (message) => {
      const p = message.data;
      if (p?.kind === 'roll') {
        window.LighthouseTVRoll.show(p, (id) => port?.postMessage({ kind: 'roll-finished', id }));
        return;
      }
      if (p?.kind !== 'board' || p.replace) window.LighthouseTVRoll.clear();
      if (p?.kind === 'board' && valid(p.frame)) paint(p.frame);
      else if (p?.kind === 'story' && window.LighthouseShow.valid(p.frame)) {
        story(p.frame);
        port.postMessage({ kind: 'story-shown', id: p.id });
      } else idle();
    };
    window.opener = null;
  });
  window.addEventListener('pagehide', () => {
    clearScene();
    window.LighthouseTVRoll.clear();
    port?.postMessage({ kind: 'left' });
    port?.close();
  });
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) idle();
  });
  full.innerHTML = icon('expand');
  full.addEventListener('click', () =>
    fullscreen(document.documentElement, (text) => {
      document.getElementById('tv-status').textContent = text;
    }),
  );
  document.addEventListener('fullscreenchange', () => {
    const label = document.fullscreenElement ? 'Выйти из полного экрана' : 'На весь экран';
    full.setAttribute('aria-label', label);
    full.title = label;
  });
  idle();
  controller?.postMessage(
    { kind: 'lighthouse-table-ready' },
    location.protocol === 'file:' ? '*' : location.origin,
  );
})();
