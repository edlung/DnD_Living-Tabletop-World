(() => {
  let stage,
    timer,
    serial = 0;
  const host = document.getElementById('tv-roll');
  function clear() {
    serial++;
    clearTimeout(timer);
    stage?.dispose();
    stage = null;
    host.replaceChildren();
    host.hidden = true;
  }
  const point = (p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
  function valid(p) {
    return (
      [6, 20].includes(p.sides) &&
      Number.isInteger(p.value) &&
      p.value >= 1 &&
      p.value <= p.sides &&
      Number.isInteger(p.seed) &&
      Number.isSafeInteger(p.id) &&
      (p.gesture === null || (p.gesture && point(p.gesture.from) && point(p.gesture.to)))
    );
  }
  async function show(p, done) {
    if (!valid(p)) return;
    clear();
    const run = serial,
      A = window.LighthouseDiceAssets;
    host.hidden = false;
    host.innerHTML =
      '<div class="tv-throw">' +
      A.surface(p.sides) +
      '<p role="status">Бросок d' +
      p.sides +
      '</p></div>';
    const surface = host.querySelector('.dice-stage');
    function settle(value) {
      if (run !== serial) return;
      host.querySelector('p').textContent = 'Выпало ' + value + ' на d' + p.sides;
      timer = setTimeout(() => {
        if (run === serial) {
          clear();
          done(p.id);
        }
      }, 2500);
    }
    try {
      const engine = await A.load();
      if (run !== serial) return;
      const made = await engine.createStage(surface, p.sides, p.sides);
      if (run !== serial) {
        made?.dispose();
        return;
      }
      stage = made;
      stage.roll(
        p.value,
        p.gesture,
        matchMedia('(prefers-reduced-motion: reduce)').matches,
        settle,
        A.randomSource(p.seed),
      );
    } catch {
      if (run === serial) {
        surface.dataset.state = 'static';
        surface.querySelector('.stage-sample').textContent = p.value;
        settle(p.value);
      }
    }
  }
  window.LighthouseTVRoll = { show, clear };
})();
