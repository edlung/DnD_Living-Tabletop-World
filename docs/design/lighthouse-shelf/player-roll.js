// Gesture and keyboard use the same intent. The received face drives both the mesh and the receipt.
(() => {
  const A = window.LighthouseDiceAssets,
    esc = window.LighthouseBoard.esc,
    icon = window.shelfIcon;
  const host = document.getElementById('player-tray');
  let run, pendingGesture, timer, sender;
  const bonus = (n) => (n >= 0 ? '+ ' : '− ') + Math.abs(n);
  function leave() {
    clearTimeout(timer);
    if (run) {
      run.events.abort();
      run.stage?.dispose();
    }
    run = null;
    pendingGesture = null;
    host.replaceChildren();
  }
  function controls() {
    if (!run) return;
    const { c, busy, error, online } = run;
    const btn = host.querySelector('[data-player-roll]'),
      receipt = host.querySelector('.roll-receipt');
    const status = host.querySelector('.roll-state');
    btn.hidden = c.status === 'answered';
    btn.disabled = busy || !online;
    btn.textContent = busy ? 'Бросаем…' : 'Бросить d20';
    const known = c.status === 'answered' && !busy;
    receipt.hidden = !known;
    const back = host.querySelector('[data-return-table]');
    back.hidden = !known;
    back.dataset.returnTable = c.id;
    if (known) {
      receipt.querySelector('strong').textContent = String(c.total);
      receipt.querySelector('span').textContent = 'd20 (' + c.face + ') ' + bonus(c.bonus);
    }
    status.textContent =
      error ||
      (busy
        ? c.status === 'answered'
          ? 'Кубик катится…'
          : 'Передаём бросок…'
        : known
          ? 'Мастер получил результат.'
          : online
            ? 'Бросьте кнопкой или проведите по столу.'
            : 'Ждём связи с мастером.');
  }
  async function throwNow(gesture) {
    if (!run || run.busy || !run.online || run.c.status !== 'pending') return;
    const active = run;
    active.busy = true;
    active.error = '';
    pendingGesture = { id: active.c.id, gesture };
    controls();
    const retry = () => {
      if (run !== active || active.c.status !== 'pending') return;
      active.busy = false;
      active.error = 'Ответ задерживается. Тот же бросок можно отправить ещё раз.';
      controls();
    };
    clearTimeout(timer);
    timer = setTimeout(retry, 7000);
    try {
      await sender(active.c.id);
    } catch {
      retry();
    }
  }
  function setup(c) {
    leave();
    host.innerHTML =
      '<article class="roll-desk"><header class="desk-title"><span class="eyeline">' +
      icon('dice') +
      'Проверка мастера</span><div><h2>' +
      esc(c.label) +
      '</h2><span class="formula">d20 ' +
      bonus(c.bonus) +
      '</span></div></header>' +
      A.surface(20) +
      '<footer class="throw-footer"><button type="button" class="throw-button" data-player-roll>Бросить d20</button>' +
      '<div class="roll-receipt" hidden><strong></strong><span></span></div><p class="roll-state" role="status"></p>' +
      '<button class="tray-done" data-return-table hidden>К общему столу</button></footer></article>';
    const surface = host.querySelector('.dice-stage');
    const current = {
      c,
      busy: false,
      online: false,
      error: '',
      stage: null,
      surface,
      events: new AbortController(),
    };
    run = current;
    current.loading = A.load()
      .then(async (engine) => {
        if (run !== current) return null;
        const stage = await engine.createStage(surface, 20, c.status === 'answered' ? c.face : 20);
        if (run !== current) {
          stage?.dispose();
          return null;
        }
        current.stage = stage;
        return stage;
      })
      .catch(() => {
        if (run === current) {
          surface.dataset.state = 'static';
          surface.querySelector('.stage-sample').textContent =
            c.status === 'answered' ? c.face : 'd20';
        }
        return null;
      });
    A.onSwipe(
      surface,
      current.events.signal,
      () => !current.busy && current.online && current.c.status === 'pending',
      throwNow,
    );
    host
      .querySelector('[data-player-roll]')
      .addEventListener('click', () => throwNow(null), { signal: current.events.signal });
  }
  async function animate(active, c, gesture) {
    clearTimeout(timer);
    active.error = '';
    active.busy = true;
    controls();
    const stage = await active.loading;
    if (run !== active) return;
    const done = () => {
      if (run !== active) return;
      active.busy = false;
      active.hold = true;
      controls();
    };
    if (stage) {
      try {
        stage.roll(
          c.face,
          gesture,
          matchMedia('(prefers-reduced-motion: reduce)').matches,
          done,
          A.randomSource(c.seed),
        );
        return;
      } catch {
        stage.dispose();
        active.stage = null;
      }
    }
    active.surface.dataset.state = 'static';
    active.surface.querySelector('.stage-sample').textContent = c.face;
    done();
  }
  function update(checks, online, send) {
    sender = send;
    const own = checks.find((c) => c.id === run?.c.id);
    const pending = checks.find((c) => c.status === 'pending');
    const keep =
      own && (own.status === 'pending' || run.c.status === 'pending' || run.busy || run.hold);
    const selected = keep ? own : (pending ?? own ?? checks[0]);
    if (!selected) {
      if (run) leave();
      return;
    }
    if (run?.c.id !== selected.id) setup(selected);
    const before = run.c.status;
    run.online = online;
    run.c = selected;
    if (before === 'pending' && selected.status === 'answered') {
      void animate(
        run,
        selected,
        pendingGesture?.id === selected.id ? pendingGesture.gesture : null,
      );
      pendingGesture = null;
    } else controls();
  }
  window.LighthousePlayerRoll = { update, leave, bonus };
})();
