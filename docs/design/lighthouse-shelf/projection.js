// The public window has a dedicated port. Browsing the book never replaces the current picture.
(() => {
  const E = window.Lighthouse;
  const receipts = new Map();
  const origin = location.protocol === 'file:' ? '*' : location.origin;
  let viewer = null,
    port = null,
    base = null,
    overlay = null,
    watcher = null,
    serial = 0;
  function status() {
    const name = base?.kind === 'board' ? 'Поле боя' : base?.frame?.title;
    document.querySelectorAll('[data-do="project"] span').forEach((label) => {
      label.textContent = base?.key === E.combat.key() ? 'Остановить показ' : 'На телевизор';
    });
    const stop = document.querySelector('[data-do="stopcast"]');
    if (stop) stop.hidden = !base && !overlay;
    const cardTV = document.querySelector('[data-do="card-tv"]');
    if (cardTV) cardTV.hidden = !E.playerHost.invited() || (viewer && !viewer.closed);
    const out = document.querySelector('[data-tv-status]');
    if (out)
      out.textContent = name
        ? (base.kind === 'story' && !base.shown ? 'Отправка · ' : 'На телевизоре · ') + name
        : 'Предпросмотр мастера';
    const strike = document.querySelector('[data-strike-cast] span');
    if (strike)
      strike.textContent =
        base?.frame?.art === 'forge-strike' && base.shown
          ? 'Повторить удар молота'
          : 'Показать место на телевизоре';
  }
  function basePacket() {
    if (!base) return { kind: 'idle' };
    if (base.kind === 'board') return { kind: 'board', frame: E.combat.frame(base.key) };
    return { kind: 'story', id: base.id, frame: base.frame };
  }
  function sendBase() {
    if (!port) return;
    if (base?.onShown) {
      receipts.set(base.id, base.onShown);
      base.onShown = null;
    }
    port.postMessage(basePacket());
  }
  function stop() {
    overlay = null;
    if (base) E.playerHost.publish(null, null);
    base = null;
    port?.postMessage({ kind: 'idle' });
    status();
  }
  function detached() {
    if (base) E.playerHost.publish(null, null);
    receipts.clear();
    port?.close();
    port = null;
    viewer = null;
    base = null;
    overlay = null;
    clearInterval(watcher);
    watcher = null;
    status();
  }
  function connect() {
    if (viewer && !viewer.closed) return true;
    detached();
    viewer = window.open('table.html', '_blank');
    if (!viewer) {
      E.notify('Разрешите всплывающее окно для экрана стола.');
      return false;
    }
    watcher = setInterval(() => {
      if (viewer?.closed) detached();
    }, 800);
    return true;
  }
  function sync(key) {
    if (port && base?.key === key) {
      port.postMessage(basePacket());
      E.playerHost.publish('board', E.combat.frame(key), key);
    }
  }
  function project(key) {
    if (base?.key === key && viewer && !viewer.closed) {
      stop();
      return;
    }
    if (!connect()) return;
    base = { kind: 'board', key };
    overlay = null;
    port?.postMessage({ ...basePacket(), replace: true });
    if (port) E.playerHost.publish('board', E.combat.frame(key), key);
    status();
  }
  function story(frame, onShown) {
    if (!window.LighthouseShow.valid(frame) || !connect()) return false;
    base = { kind: 'story', frame, id: ++serial, shown: false, onShown };
    overlay = null;
    sendBase();
    status();
    return true;
  }
  // Open the TV in the same click as the throw. Only this explicit action publishes a die.
  function prepareRoll() {
    if (!connect()) return false;
    if (!base && E.state.view === 'battle') {
      base = { kind: 'board', key: E.combat.key() };
      port?.postMessage(basePacket());
      if (port) E.playerHost.publish('board', E.combat.frame(base.key), base.key);
    }
    status();
    return true;
  }
  function roll(sides, value, seed, gesture) {
    if (!viewer || viewer.closed) return;
    overlay = { kind: 'roll', id: ++serial, sides, value, seed, gesture };
    port?.postMessage(overlay);
    status();
  }
  window.addEventListener('message', (event) => {
    if (
      !viewer ||
      event.source !== viewer ||
      !window.LighthouseBoard.sameOrigin(event.origin) ||
      event.data?.kind !== 'lighthouse-table-ready'
    )
      return;
    port?.close();
    const ch = new MessageChannel();
    port = ch.port1;
    port.onmessage = ({ data }) => {
      if (data?.kind === 'left') detached();
      if (data?.kind === 'story-shown') {
        if (base?.id === data.id) {
          base.shown = true;
          E.playerHost.publish('story', base.frame);
        }
        const seen = receipts.get(data.id);
        receipts.delete(data.id);
        seen?.();
        status();
      }
      if (data?.kind === 'roll-finished' && overlay?.id === data.id) {
        overlay = null;
        status();
      }
    };
    viewer.postMessage({ kind: 'lighthouse-board-port' }, origin, [ch.port2]);
    sendBase();
    if (base?.kind === 'board') E.playerHost.publish('board', E.combat.frame(base.key), base.key);
    if (overlay) port.postMessage(overlay);
  });
  window.addEventListener('pagehide', () => {
    stop();
    detached();
  });
  E.projection = {
    project,
    story,
    prepareRoll,
    roll,
    stop,
    sync,
    status,
    showing: () => base?.key,
    active: () => !!(base || overlay),
    connected: () => !!viewer && !viewer.closed,
  };
})();
