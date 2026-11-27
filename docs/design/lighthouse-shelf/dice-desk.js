(() => {
  const E = window.Lighthouse;
  let sides = 20,
    result = null,
    current;
  function markup(origin) {
    const choices = (origin === 'check' ? [20] : [20, 6])
      .map(
        (n) =>
          `<button type="button" data-die="${n}" aria-pressed="${n === sides}" aria-label="d${n}"><img src="${E.ornament('d' + n)}" alt=""><span>d${n}</span></button>`,
      )
      .join('');
    return `<div class="drawer-scroll dice-panel">${window.LighthouseDiceAssets.surface(sides)}
      <div class="dice-controls"><div class="dice-choices" role="group" aria-label="Выберите кубик">${choices}</div>
      <div class="dice-readout"><p class="dice-result" role="status" aria-live="polite" aria-atomic="true">${result === null ? 'Кубик готов к броску' : 'Выпало ' + result + ' на d' + sides}</p><p class="dice-hint">Можно бросить жестом по столу</p></div>
      ${E.button('roll', 'Бросить d' + sides, 'dice', 'primary')}</div><div class="dice-sharing">${origin ? E.button('dice-back', origin === 'turn' ? 'К участнику' : 'К проверке', 'back', 'text-button') : ''}${E.button('roll-public', 'Бросить на телевизор', 'monitor', 'outline-button')}</div></div>`;
  }
  function leave() {
    if (!current) return;
    current.events.abort();
    current.stage?.dispose();
    current = null;
  }
  function enter(dialog) {
    leave();
    const surface = dialog.querySelector('.dice-stage');
    const run = {
      surface,
      dialog,
      sides,
      events: new AbortController(),
      stage: null,
      pending: null,
      busy: false,
    };
    current = run;
    run.pending = window.LighthouseDiceAssets.load()
      .then((engine) => {
        if (current === run) return engine.createStage(surface, sides, result ?? sides);
        return null;
      })
      .then((stage) => {
        if (current !== run) {
          stage?.dispose();
          return null;
        }
        run.stage = stage;
        return stage;
      })
      .catch(() => {
        if (current === run) {
          surface.dataset.state = 'static';
          surface.querySelector('.stage-sample').textContent = result ?? 'd' + sides;
        }
        return null;
      });
    window.LighthouseDiceAssets.onSwipe(surface, run.events.signal, () => !run.busy, throwDie);
  }
  async function throwDie(gesture, publish = false) {
    const run = current;
    if (!run || run.busy) return;
    if (publish && !E.projection.prepareRoll()) return;
    run.busy = true;
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    const value = window.LighthouseDiceAssets.rollValue(run.sides);
    const control = run.dialog.querySelector('[data-do="roll"]'),
      out = run.dialog.querySelector('.dice-result');
    control.setAttribute('aria-disabled', 'true');
    const publicButton = run.dialog.querySelector('[data-do="roll-public"]');
    publicButton.disabled = true;
    out.textContent = 'Кубик катится…';
    const stage = await run.pending;
    if (current !== run) return;
    if (publish) E.projection.roll(run.sides, value, seed, gesture);
    function settle(visible) {
      if (current !== run) return;
      result = visible;
      run.busy = false;
      out.textContent = 'Выпало ' + result + ' на d' + run.sides;
      control.removeAttribute('aria-disabled');
      publicButton.disabled = false;
      E.drawers.onRolled(visible);
    }
    if (stage) {
      try {
        stage.roll(
          value,
          gesture,
          matchMedia('(prefers-reduced-motion: reduce)').matches,
          settle,
          window.LighthouseDiceAssets.randomSource(seed),
        );
        return;
      } catch {
        stage.dispose();
        run.stage = null;
        run.pending = Promise.resolve(null);
      }
    }
    run.surface.dataset.state = 'static';
    run.surface.querySelector('.stage-sample').textContent = value;
    settle(value);
  }
  function handle(el) {
    if (el.dataset.die) {
      const next = Number(el.dataset.die);
      if (sides !== next) {
        sides = next;
        result = null;
        E.drawers.show('dice', false);
        current.dialog.querySelector('[data-die="' + sides + '"]').focus();
      }
      return true;
    }
    if (['roll', 'roll-public'].includes(el.dataset.do) && current) {
      void throwDie(null, el.dataset.do === 'roll-public');
      return true;
    }
    return false;
  }
  E.diceDesk = {
    markup,
    enter,
    leave,
    handle,
    checkDie() {
      sides = 20;
      result = null;
    },
  };
})();
